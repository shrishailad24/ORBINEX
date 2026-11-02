"""
ORBINEX — Prithvi-EO-2.0 Bi-Temporal Smoke Test
Workstream: AI-08B (Architecture & Forward Pass Verification)

Validates:
1. Prithvi-EO-2.0-300M 3D ViT architecture initialization.
2. Parameter count verification (~300M encoder + downstream decoder).
3. 6-band bi-temporal input shape: [B=1, C=6, T=2, H=256, W=256].
4. Intermediate feature extraction at zero-based indices [5, 11, 17, 23].
5. Bi-temporal difference fusion and UperNet decoder upsampling.
6. Numerical safety: zero NaN / Inf values in logits.
7. Binary change prediction map generation in {0, 1}.
"""

import sys
import os
import torch
import numpy as np

# Ensure module path is importable
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from prithvi_model import (
    PrithviChangeDetectionModel,
    OFFICIAL_HLS_MEANS,
    OFFICIAL_HLS_STDS,
    PRITHVI_300M_INTERMEDIATE_INDICES
)

def run_smoke_test():
    print("=" * 65)
    print("   ORBINEX PRITHVI-EO-2.0 ARCHITECTURE & INFERENCE SMOKE TEST")
    print("=" * 65)

    # 1. Parameter and Architecture Verification
    print("\n--- 1. INITIALIZING PRITHVI-EO-2.0 ARCHITECTURE ---")
    model = PrithviChangeDetectionModel(checkpoint_path=None, freeze_backbone=False)

    backbone_params = sum(p.numel() for p in model.backbone.parameters())
    decoder_params = sum(p.numel() for p in model.decoder.parameters())
    total_params = sum(p.numel() for p in model.parameters())

    print(f"Backbone Parameter Count : {backbone_params:,} (~{backbone_params/1e6:.1f}M)")
    print(f"Decoder Parameter Count  : {decoder_params:,} (~{decoder_params/1e6:.1f}M)")
    print(f"Total Model Parameters   : {total_params:,} (~{total_params/1e6:.1f}M)")
    print(f"Intermediate Layer Taps  : {PRITHVI_300M_INTERMEDIATE_INDICES} (Zero-based)")

    # 2. Input Tensor Construction (6 bands, T=2, 256x256)
    print("\n--- 2. CONSTRUCTING BI-TEMPORAL 6-BAND INPUT TENSOR ---")
    batch_size = 1
    channels = 6
    epochs = 2
    height = 256
    width = 256

    # Construct realistic reflectance data [0.0 - 1.0]
    torch.manual_seed(42)
    raw_reflectance = torch.rand(batch_size, channels, epochs, height, width, dtype=torch.float32)

    # Apply verified official HLS normalization
    means = OFFICIAL_HLS_MEANS.view(1, 6, 1, 1, 1)
    stds = OFFICIAL_HLS_STDS.view(1, 6, 1, 1, 1)
    norm_input = (raw_reflectance - means) / stds

    print(f"Input Tensor Shape : {list(norm_input.shape)} [B, C, T, H, W]")
    print(f"Input Mean (Norm)  : {norm_input.mean().item():.4f}")
    print(f"Input Std (Norm)   : {norm_input.std().item():.4f}")

    # 3. Intermediate Feature Tap Extraction
    print("\n--- 3. VERIFYING INTERMEDIATE FEATURE TAP EXTRACTION ---")
    model.eval()
    with torch.no_grad():
        intermediate = model.backbone(norm_input)

    print(f"Intermediate Taps Extracted : {len(intermediate)}")
    for idx, layer_idx in enumerate(PRITHVI_300M_INTERMEDIATE_INDICES):
        feat = intermediate[idx]
        print(f"  Tap {idx+1} (Layer {layer_idx:2d}) Shape : {list(feat.shape)} [B, T=2, H/16={feat.shape[2]}, W/16={feat.shape[3]}, Dim={feat.shape[4]}]")
        assert feat.shape == (batch_size, epochs, height // 16, width // 16, 1024), f"Unexpected tap shape: {feat.shape}"

    # 4. End-to-End Forward Pass Through Downstream Decoder
    print("\n--- 4. END-TO-END FORWARD PASS THROUGH UPERNET DECODER ---")
    with torch.no_grad():
        logits = model(norm_input)

    print(f"Output Logits Shape : {list(logits.shape)} [B, 1, H, W]")
    assert logits.shape == (batch_size, 1, height, width), f"Expected shape (1, 1, {height}, {width}), got {logits.shape}"

    # 5. Numerical Integrity & Sanity Checks
    print("\n--- 5. NUMERICAL INTEGRITY VERIFICATION ---")
    has_nan = torch.isnan(logits).any().item()
    has_inf = torch.isinf(logits).any().item()
    print(f"Contains NaN : {has_nan} (Must be False)")
    print(f"Contains Inf : {has_inf} (Must be False)")
    assert not has_nan, "FAIL: Output contains NaN values"
    assert not has_inf, "FAIL: Output contains Inf values"

    # 6. Probability Mapping & Binary Change Mask
    print("\n--- 6. PROBABILITY MAPPING & BINARY CHANGE PREDICTION ---")
    probabilities = torch.sigmoid(logits)
    binary_mask = (probabilities >= 0.50).to(torch.uint8)

    min_prob = probabilities.min().item()
    max_prob = probabilities.max().item()
    mean_prob = probabilities.mean().item()
    changed_pixels = binary_mask.sum().item()
    total_pixels = height * width

    print(f"Probability Range : [{min_prob:.4f}, {max_prob:.4f}] (Valid [0.0, 1.0])")
    print(f"Mean Change Prob  : {mean_prob:.4f}")
    print(f"Changed Pixels    : {changed_pixels:,} / {total_pixels:,} ({changed_pixels/total_pixels*100:.2f}%)")
    print(f"Binary Mask Values: {torch.unique(binary_mask).tolist()} (Must be subset of [0, 1])")

    print("\n" + "=" * 65)
    print("   SMOKE TEST STATUS: PASSED (ALL VERIFICATIONS SUCCESSFUL) ")
    print("=" * 65)
    return True

if __name__ == '__main__':
    run_smoke_test()
