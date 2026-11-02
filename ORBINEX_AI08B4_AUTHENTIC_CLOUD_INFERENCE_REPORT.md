# ORBINEX AI-08B4 — Authentic Cloud Inference Execution Report

**Document ID:** `ORBINEX-AI08B4-CLOUD-INFERENCE-REPORT-20261103`  
**Evaluation Target:** NASA-IBM `Prithvi-EO-2.0-300M` Downstream Pretrained Inference  
**Phase:** AI-08B4 (Execution of Authentic Pretrained Inference Pipeline)  
**Git Branch:** `feat/satellite-foundation`  
**Base Commit:** `173a9ff`  

---

## Final Executive Verdict

# Status: `BLOCKED — CHECKPOINT ACQUISITION FAILED`

> [!CAUTION]
> **GATE HALT: REAL-DATA CLOUD EXECUTION PENDING.**  
> In strict compliance with ORBINEX scientific integrity directives:
> *"Do not report PASS based only on dry-run tests, synthetic tensors, metadata, remote URLs or successful code compilation."*  
> 
> A physical audit of the host environment confirms that neither the **1.33 GB IBM-NASA checkpoint binary** (`Prithvi_EO_V2_300M.pt`) nor the **authentic 6-band Sentinel-2 OSCD GeoTIFFs** have been acquired on disk. The local environment is constrained by:
> 1. **CPU-only PyTorch** (`2.15.0+cpu`), preventing GPU-accelerated inference.
> 2. **Disk headroom margin** of only 14.08 GB free on host drive `C:\`.
> 3. **Standard Sandbox isolation** with no external network connectivity.
> 
> Therefore, this report formally issues the **`BLOCKED — CHECKPOINT ACQUISITION FAILED`** verdict until the user executes the verified pipeline in the designated **Google Colab Free Tier (NVIDIA T4)** cloud environment and returns the real GPU telemetry.

---

## 1. Hardware & Environment Audit

An inspection of the local environment versus the target cloud execution environment:

| Resource | Local Host Machine | Google Colab Free Tier (Target) | Evaluation |
|---|---|---|---|
| **GPU Model** | NVIDIA GeForce RTX 3050 Laptop | **NVIDIA T4 Tensor Core GPU** | Colab provides dedicated server-grade tensor cores |
| **GPU VRAM** | 4,096 MiB (4 GB) | **15,360 MiB (15.36 GB)** | Colab provides $3.75\times$ more VRAM, easily holding 300M model |
| **CUDA Driver** | Driver 592.00 / CUDA 13.1 | CUDA 12.1 / cuDNN 8.9 | Local driver is modern, but PyTorch is unlinked |
| **PyTorch Version** | `2.15.0+cpu` (`torch.cuda.is_available() == False`) | `2.1.0+cu121` (`torch.cuda.is_available() == True`) | **Local PyTorch cannot run CUDA operations** |
| **System RAM** | 15.66 GB total (~2.7 GB free) | ~12.7 GB dedicated | Ample for tensor manipulation |
| **Available Disk** | 14.08 GB on drive `C:\` | ~78 – 100 GB ephemeral disk | Downloading 3 GB locally risks disk exhaustion; Colab is safe |
| **Financial Cost** | $0.00 | **$0.00 (Free Tier confirmed)** | **Zero billing risk; no paid resources authorized** |
| **Network Egress** | Blocked in standard sandbox (`Errno 11001`) | Unrestricted high-speed fiber | Colab downloads 1.33 GB checkpoint in seconds |

---

## 2. Authentic Asset Verification Specifications

### 2.1 IBM-NASA Checkpoint Specification
- **Official Repository:** [`ibm-nasa-geospatial/Prithvi-EO-2.0-300M`](https://huggingface.co/ibm-nasa-geospatial/Prithvi-EO-2.0-300M)
- **Weights Binary:** `Prithvi_EO_V2_300M.pt`
- **Expected SHA-256:** `faab2c8b776f0723f93431747603a7ec586a54fc45473613b4322c29752486e7`
- **Official File Size:** `1,326,275,549` bytes (~1.33 GB)
- **License:** Apache 2.0
- **Total Model Parameters:** `311,103,233` (304.9M ViT backbone + 6.2M Change-UperNet decoder)
- **Local Disk Presence:** **NOT PRESENT** (`os.path.exists` returned `False`)

### 2.2 ONERA OSCD Multispectral Archive Specification
- **Official Archive:** `Onera Satellite Change Detection dataset - Images.zip`
- **Primary Source:** `https://partage.imt.fr/index.php/s/gKRaWgRnLMfwMGo/download`
- **Secondary Mirror:** `https://huggingface.co/datasets/blanchon/OSCD_MSI/resolve/main/Onera%20Satellite%20Change%20Detection%20dataset%20-%20Images.zip`
- **Expected Archive MD5:** `c50d4a2941da64e03a47ac4dec63d915`
- **Archive Size:** ~403.5 MB compressed / ~1.52 GB uncompressed
- **Target Scene:** `bercy` ($360 \times 395$ pixels)
- **Required Bands:** `B02.tif`, `B03.tif`, `B04.tif`, `B8A.tif`, `B11.tif`, `B12.tif` across both $T_1$ and $T_2$
- **Local Disk Presence:** **NOT PRESENT** (Zero multispectral GeoTIFFs exist locally)

---

## 3. Real-Pixel Tensor Provenance & Radiometry Contract

The acquisition script ([`run_cloud_real_inference.py`](src/lib/satellite/prithvi_cloud/run_cloud_real_inference.py)) strictly enforces the following radiometric pipeline:

1. **Native Ingestion:** Reads authentic 16-bit GeoTIFF rasters (dtype: `uint16` / `float32`).
2. **Band Radiometry Logging:** Computes per-band minimum, maximum, mean, and standard deviation on authentic Sentinel-2 Digital Numbers (DN).
3. **Surface Reflectance Scaling:** Converts DN to Surface Reflectance:
   $$\rho_{\lambda} = \frac{\text{DN}_{\lambda}}{10000.0}$$
4. **Official HLS Standardization:** Standardizes each spectral channel using NASA-IBM pretraining constants:
   $$z_{\lambda} = \frac{\rho_{\lambda} - \mu_{\lambda}}{\sigma_{\lambda}}$$
   Where:
   - $\boldsymbol{\mu} = [0.1087, 0.1342, 0.1433, 0.2734, 0.1958, 0.1363]$
   - $\boldsymbol{\sigma} = [0.2248, 0.2179, 0.2178, 0.1850, 0.1242, 0.1049]$
5. **Bi-Temporal Stacking:** Assembles tensor of shape $[1, 6, 2, 256, 256]$ ($B=1$, $C=6$, $T=2$, $H=256$, $W=256$).
6. **Input Fingerprint:** Hashes raw input tensor bytes to SHA-256 for cryptographic verification.

---

## 4. Pretrained Model Loading & Temporal Adaptation

1. **Backbone Loading:**
   Loads state dict from `Prithvi_EO_V2_300M.pt` into `Prithvi300MBackbone`.
   - Backbone parameters: `304,896,000` ($100\%$ loaded from IBM-NASA checkpoint).
   - Decoder parameters: `6,207,233` (fresh downstream Change-UperNet initialization).
2. **Temporal Tubelet Adaptation ($T=2$):**
   Prithvi-EO-2.0 has temporal tubelet size $= 1$ (kernel `[1, 16, 16]`).
   Temporal positional encodings are sliced to $P_t[:2]$, mathematically preserving the exact pretraining positional encodings for the first two epochs without interpolation artifacts.
3. **Multi-Scale Tap Validation:**
   Extracts intermediate representations from ViT blocks $[5, 11, 17, 23]$:
   - Tap 0 (Layer 5): $[1, 1024, 16, 16]$
   - Tap 1 (Layer 11): $[1, 1024, 16, 16]$
   - Tap 2 (Layer 17): $[1, 1024, 16, 16]$
   - Tap 3 (Layer 23): $[1, 1024, 16, 16]$
4. **Decoder Forward Pass:**
   Feeds the 4 multi-scale taps into `ChangeUperNetDecoder`, generating $[1, 1, 256, 256]$ logits.

---

## 5. Strict Scientific Constraints & Baseline Protection

> [!IMPORTANT]
> **NO TRAINING AUTHORIZATION:**
> - Zero backpropagation (`loss.backward()` is strictly prohibited).
> - Zero optimizer step (`optimizer.step()` is strictly prohibited).
> - Zero parameter updates.
> - **Zero Metric Claims:** Because the Change-UperNet decoder is untrained, computing or advertising downstream metrics (F1, IoU, Accuracy) is scientifically invalid. The forward pass serves solely as an end-to-end structural and radiometric sanity check.
> - **Locked Baselines Certified:**
>   - Canonical OSCD Classical Baseline: **30.83% F1** ($T^*=0.44$)
>   - Spatially Blocked OSCD Classical Baseline: **32.51% F1** ($T^*=0.44$)

---

## 6. Colab Execution Protocol to Clear this Block

To transition this milestone from `BLOCKED — CHECKPOINT ACQUISITION FAILED` to `PASS — AUTHENTIC PRETRAINED INFERENCE VERIFIED`:

### Step 1: Open Google Colab
Open [`ORBINEX_Prithvi_Cloud_Training_Colab.ipynb`](src/lib/satellite/prithvi_cloud/ORBINEX_Prithvi_Cloud_Training_Colab.ipynb) on [Google Colab](https://colab.research.google.com) and select the **T4 GPU** runtime.

### Step 2: Execute Gate 8 (Cell 5B)
Run the automated acquisition and inference command:
```bash
!python src/lib/satellite/prithvi_cloud/run_cloud_real_inference.py \
    --checkpoint_path .cache/models/prithvi-eo-2.0-300m/Prithvi_EO_V2_300M.pt \
    --data_dir ./data/oscd_multispectral \
    --scene bercy \
    --device cuda \
    --download_if_missing \
    --output_json real_inference_telemetry.json
```

### Step 3: Record Telemetry
The script will output `real_inference_telemetry.json` containing:
- GPU device name and peak VRAM.
- Verified checkpoint SHA-256.
- Raw raster statistics and input tensor SHA-256.
- Intermediate layer tap shapes.
- Min/max logits, mean change probability, and zero NaN/Inf confirmation.

Once this JSON is generated and reviewed, the block will be lifted and AI-08B4 certified.
