"""
ORBINEX — Prithvi-EO-2.0 Downstream Change Detection Training Pipeline
Workstream: AI-08A (Pipeline Preparation & Architecture Design)

Design Specifications:
- Sensor: Copernicus Sentinel-2 MSI Multi-Spectral Instrument (10m / 20m resampled)
- Pretrained Backbone: NASA-IBM Prithvi-EO-2.0-300M (Spatiotemporal ViT)
- Channel Order: [B02 (Blue), B03 (Green), B04 (Red), B8A (Narrow NIR), B11 (SWIR1), B12 (SWIR2)]
- Temporal Epochs: T=2 (Before, After)
- Downstream Head: Spatiotemporal Difference + Multi-Scale Feature Pyramid Decoder (UperNet/FPN)
- Loss: Combined Focal Loss + Dice Loss for severe class imbalance (~2.3% change prevalence)
- Geographic Safeguard: Spatial scene blocking (saclay_e in train; saclay_w excluded from independent validation)
"""

import os
import json
import math
import numpy as np
from typing import Dict, List, Tuple, Optional

# HLS Normalization Constants (NASA-IBM Pretraining Statistics)
HLS_BAND_MEANS = np.array([0.0987, 0.1287, 0.1471, 0.2893, 0.2681, 0.1874], dtype=np.float32)
HLS_BAND_STDS  = np.array([0.0765, 0.0812, 0.0945, 0.1421, 0.1278, 0.1082], dtype=np.float32)

class PrithviTrainingConfig:
    """Hyperparameters and runtime configuration for AI-08 downstream training."""
    def __init__(
        self,
        model_name: str = "ibm-nasa-geospatial/Prithvi-EO-2.0-300M",
        patch_size: int = 16,
        chip_size: int = 256,
        stride: int = 128,
        batch_size: int = 4,
        gradient_accumulation_steps: int = 4,
        learning_rate_backbone: float = 1e-5,
        learning_rate_head: float = 1e-4,
        weight_decay: float = 0.05,
        epochs: int = 30,
        focal_gamma: float = 2.0,
        dice_weight: float = 0.5,
        focal_weight: float = 0.5,
        freeze_backbone_epochs: int = 5,
        use_lora: bool = True,
        lora_rank: int = 16,
        seed: int = 42
    ):
        self.model_name = model_name
        self.patch_size = patch_size
        self.chip_size = chip_size
        self.stride = stride
        self.batch_size = batch_size
        self.gradient_accumulation_steps = gradient_accumulation_steps
        self.learning_rate_backbone = learning_rate_backbone
        self.learning_rate_head = learning_rate_head
        self.weight_decay = weight_decay
        self.epochs = epochs
        self.focal_gamma = focal_gamma
        self.dice_weight = dice_weight
        self.focal_weight = focal_weight
        self.freeze_backbone_epochs = freeze_backbone_epochs
        self.use_lora = use_lora
        self.lora_rank = lora_rank
        self.seed = seed

    def to_dict(self) -> Dict:
        return self.__dict__.copy()

class OSCDPatchExtractor:
    """
    Extracts non-overlapping or sliding window chips from large scenes,
    applying HLS normalization and spatial data augmentation.
    """
    def __init__(self, chip_size: int = 256, stride: int = 128, min_valid_ratio: float = 0.75):
        self.chip_size = chip_size
        self.stride = stride
        self.min_valid_ratio = min_valid_ratio

    def extract_chips(
        self,
        t1_cube: np.ndarray, # Shape: [6, H, W], normalized surface reflectance [0.0 - 1.0]
        t2_cube: np.ndarray, # Shape: [6, H, W]
        mask: np.ndarray,    # Shape: [H, W], uint8 binary {0, 1}
        is_training: bool = True
    ) -> List[Dict[str, np.ndarray]]:
        c, h, w = t1_cube.shape
        stride = self.stride if is_training else self.chip_size
        chips = []

        for y in range(0, h - self.chip_size + 1, stride):
            for x in range(0, w - self.chip_size + 1, stride):
                chip_t1 = t1_cube[:, y:y+self.chip_size, x:x+self.chip_size]
                chip_t2 = t2_cube[:, y:y+self.chip_size, x:x+self.chip_size]
                chip_m  = mask[y:y+self.chip_size, x:x+self.chip_size]

                # Discard chips dominated by nodata (e.g. black boundary edges)
                valid_pixels = np.count_nonzero(~np.isnan(chip_t1[0]))
                if valid_pixels / (self.chip_size * self.chip_size) < self.min_valid_ratio:
                    continue

                # Standardize to NASA HLS distributions
                norm_t1 = (chip_t1 - HLS_BAND_MEANS[:, None, None]) / HLS_BAND_STDS[:, None, None]
                norm_t2 = (chip_t2 - HLS_BAND_MEANS[:, None, None]) / HLS_BAND_STDS[:, None, None]

                # Replace remaining NaNs with 0
                norm_t1 = np.nan_to_num(norm_t1, nan=0.0)
                norm_t2 = np.nan_to_num(norm_t2, nan=0.0)

                chips.append({
                    't1': norm_t1, # [6, 256, 256]
                    't2': norm_t2, # [6, 256, 256]
                    'mask': chip_m, # [256, 256]
                    'coords': (x, y)
                })

        return chips

def compute_change_metrics_numpy(pred_binary: np.ndarray, gt_binary: np.ndarray) -> Dict[str, float]:
    """Computes exact pixel confusion matrix metrics."""
    tp = int(np.count_nonzero((pred_binary == 1) & (gt_binary == 1)))
    fp = int(np.count_nonzero((pred_binary == 1) & (gt_binary == 0)))
    fn = int(np.count_nonzero((pred_binary == 0) & (gt_binary == 1)))
    tn = int(np.count_nonzero((pred_binary == 0) & (gt_binary == 0)))
    total = tp + fp + fn + tn

    prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    rec  = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    iou  = tp / (tp + fp + fn) if (tp + fp + fn) > 0 else 0.0
    f1   = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0
    far  = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    oa   = (tp + tn) / total if total > 0 else 0.0

    return {
        'tp': tp, 'fp': fp, 'fn': fn, 'tn': tn, 'total_pixels': total,
        'precision': prec, 'recall': rec, 'iou': iou, 'f1': f1, 'far': far, 'oa': oa
    }
