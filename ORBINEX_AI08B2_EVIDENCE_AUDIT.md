# ORBINEX AI-08B2 — Evidence Audit Before AI-08C Training

**Document ID:** `ORBINEX-AI08B2-EVIDENCE-AUDIT-20261103`  
**Evaluation Target:** NASA-IBM `Prithvi-EO-2.0-300M` Downstream Change Detection  
**Phase:** AI-08B2 (Evidence Verification Audit Prior to Training Authorization)  
**Git Branch:** `feat/satellite-foundation`  

---

## Final Executive Verdict

# Status: `BLOCKED — REAL DATA NOT ACQUIRED`

> [!CAUTION]
> **GATE HALT: DO NOT START AI-08C TRAINING.**  
> An independent physical audit of the host environment confirms that neither the **1.33 GB IBM-NASA model checkpoint** nor the **authentic 6-band Sentinel-2 OSCD imagery** has been physically downloaded to the local host machine. The prior smoke test was executed on a **synthetically constructed memory tensor** (`torch.randn`) with a **randomly initialized architecture**.  
> In accordance with scientific integrity standards, remote URL availability, metadata manifests, and architectural shape tests **must never be described as a real-data pretrained forward pass**. Training remains strictly blocked until authentic weights and rasters are physically acquired and executed in the cloud container.

---

## 1. Physical Checkpoint Verification

### 1.1 Physical Presence on Disk
- **Expected Checkpoint File:** `Prithvi_EO_V2_300M.pt`
- **Official Repository:** [`ibm-nasa-geospatial/Prithvi-EO-2.0-300M`](https://huggingface.co/ibm-nasa-geospatial/Prithvi-EO-2.0-300M)
- **Official LFS Download URL:** `https://huggingface.co/ibm-nasa-geospatial/Prithvi-EO-2.0-300M/resolve/main/Prithvi_EO_V2_300M.pt`
- **Official Expected SHA-256:** `faab2c8b776f0723f93431747603a7ec586a54fc45473613b4322c29752486e7`
- **Expected Size:** `1,326,275,549` bytes (~1.26 GiB / ~1.33 GB)
- **Local Host Physical Presence:** **NOT DOWNLOADED ON LOCAL HOST**

### 1.2 Verification Findings:
1. **Local Search Result:** A recursive scan of `C:\Users\shash\Downloads\osiris-master\` confirmed that **no `.pt` binary exists on disk**.
2. **Execution Reality:** In the prior smoke-test script ([`orbinex_prithvi_smoke_test.py`](file:///C:/Users/shash/Downloads/osiris-master/osiris-master/src/lib/satellite/prithvi_cloud/orbinex_prithvi_smoke_test.py)), `PrithviChangeDetectionModel()` was instantiated without passing a local checkpoint path (`checkpoint_path=None`). The model executed using **PyTorch default random initialization**.
3. **Key Audit:**
   - **Total Model Parameters:** `311,103,233` (311.1M)
   - **Backbone Parameters:** `304,896,000` (304.9M)
   - **Decoder Parameters:** `6,207,233` (6.2M)
   - **Pretrained Parameters Loaded Locally:** **0** (Weights were randomly initialized; zero pretrained parameters were loaded from a local binary).
   - **Claim Correction:** Describing the previous forward pass as "using pretrained weights" was factually incorrect. The architecture is verified to match the Prithvi ViT-B schema, but authentic weights have not yet entered memory.

---

## 2. Actual OSCD Imagery Files Physical Verification

### 2.1 Physical Presence on Disk
- **Official Source Archive:** `Onera Satellite Change Detection dataset - Images.zip`
- **Official Archive URL:** `https://partage.imt.fr/index.php/s/gKRaWgRnLMfwMGo/download`
- **Official Expected MD5:** `c50d4a2941da64e03a47ac4dec63d915`
- **Expected Archive Size:** ~403.5 MB compressed / ~1.52 GB uncompressed
- **Local Host Physical Presence:** **NOT DOWNLOADED LOCALLY**

### 2.2 What Physically Exists on the Local Host:
A complete inventory of `.cache/oscd/` reveals:
1. `test_rgb.parquet` (12,121,086 bytes / 12.1 MB) — Contains 8-bit visual RGB byte streams (`image1`, `image2`) and single-channel mask arrays.
2. `train_rgb.parquet` (25,899,561 bytes / 25.8 MB) — Contains 8-bit visual RGB byte streams and single-channel mask arrays.
3. `train_labels/` & `test_labels/` — Contains ground-truth change masks (`.tif` and `.png`).
4. **Authentic Multispectral GeoTIFFs (`B02.tif`, `B03.tif`, `B04.tif`, `B8A.tif`, `B11.tif`, `B12.tif`):** **ZERO physical files exist on the local drive.**

### 2.3 Explicit Finding:
The 1.5 GB ONERA multispectral image archive was **never downloaded to host drive `C:\`** due to the **13.99 GB free disk margin**. The ingestion script (`download_and_verify_oscd_multispectral.py`) was only tested in `--dry_run` mode. While the remote archive and checksums are verified via documentation and official repositories, **no physical multispectral Sentinel-2 rasters have been acquired locally**.

---

## 3. Provenance of the Smoke-Test Input Tensor

Tracing the exact tensor passed into `model(x)` in `orbinex_prithvi_smoke_test.py`:

```python
# Lines 86-90 in orbinex_prithvi_smoke_test.py:
sample_input = torch.randn(1, 6, 2, 256, 256, dtype=torch.float32)
```

### Truthful Telemetry:
- **Source of Input Tensor:** `torch.randn` (Pseudo-random Gaussian noise generated in RAM).
- **Scene Name:** None (Synthetic fixture).
- **Acquisition Dates:** None.
- **Physical Reflectance Values:** None (Random floating point numbers in $\mathcal{N}(0, 1)$).
- **Per-Band Radiometry:** Artificial; not sourced from Copernicus Sentinel-2.
- **Conclusion:** The test proved that the **PyTorch tensor execution graph functions without dimension mismatch**, but it did **NOT** prove that real Sentinel-2 imagery can be ingested, calibrated, or inferred.

---

## 4. Ground-Truth Provenance & Format Reconciliation

### 4.1 Resolution of the TIFF vs PNG Question
The earlier audit noted confusion regarding whether ground truth was stored as TIFFs or PNGs. Physical inspection of the directories `.cache/oscd/train_labels/` and `.cache/oscd/test_labels/` clarifies the exact structure. For every scene directory (e.g. `abudhabi/cm/`), **both formats exist side by side with distinct purposes**:

1. **Official Label Raster (`<scene>-cm.tif`):**
   - Format: Single-channel TIFF (Mode `L` / `uint8`).
   - Ground-Truth Values: `1` = **No Change**, `2` = **Change**.
   - Official Counting Rule: `np.count_nonzero(arr == 2)`.
2. **Visualization Quicklook (`cm.png`):**
   - Format: 4-channel `RGBA` PNG ($785 \times 799 \times 4$).
   - Channel 0 (Red): `255` where change occurred, `0` where no change.
   - Channel 3 (Alpha): `255` for valid observed area.
   - *Audit Warning:* Naively running `np.count_nonzero(np.array(Image.open('cm.png')) > 0)` flattens all 4 channels, creating an artificial $4\times$ inflation by counting alpha and red channels together.
3. **Parquet Masks (`test_rgb.parquet` & `train_rgb.parquet`):**
   - Format: Single-channel Mode `I` (int32) arrays.
   - Values: `0` = No Change, `1` = Change.
   - Counting Rule: `np.count_nonzero(arr > 0)`.

### 4.2 Exact Physical Label Audit Across All 24 Scenes:

The table below reports physical dimensions, physical file sizes, SHA-256 hashes, and positive change pixel counts computed directly from the on-disk TIFF rasters (`arr == 2`):

#### A. Canonical Training Set (14 Scenes):
| Scene ID | Dimensions $(W \times H)$ | Total Pixels | Physical GeoTIFF File Size | GeoTIFF SHA-256 Checksum | Positive Change Pixels (`val == 2`) | Prevalence |
|---|---|---|---|---|---|---|
| **abudhabi** | $785 \times 799$ | 627,215 | 628,113 B | `2fff7e92b93b09c4909e3a89289e826f7bf6a15a60c55f82c4d2b181ec660eea` | **23,592** | 3.76% |
| **aguasclaras** | $525 \times 471$ | 247,275 | 247,789 B | `0e124b04a1592887b7f2c5c09ffcc1ddaf53eca3964bafb142604a20c05754eb` | **4,056** | 1.64% |
| **beihai** | $772 \times 902$ | 696,344 | 697,330 B | `bd3cb342c3aa658033e1dbd1a9de6f395200dfa61976f9ee3b94760a194ba16a` | **17,318** | 2.49% |
| **beirut** | $1070 \times 1180$ | 1,262,600 | 1,264,210 B | `0197852420a8958968cede548403d84fcd16b4a47aecd3d4f422def14e2f5452` | **33,918** | 2.69% |
| **bercy** | $360 \times 395$ | 142,200 | 142,602 B | `f542af5369d07f6f3d3f5cdc5f61de549a97ed225f237ac8a73d26cfac1587b1` | **1,046** | 0.74% |
| **bordeaux** | $461 \times 517$ | 238,337 | 238,843 B | `655c2280b1aba327bb0830c230b6ff9896ff72bc679b851cf51a05b1d3617125` | **2,380** | 1.00% |
| **cupertino** | $788 \times 1015$ | 799,820 | 800,894 B | `4b5d2ef20874a514726048dea9fb75fd2bb172b4f1b169ad17f26a680383f1da` | **18,942** | 2.37% |
| **hongkong** | $540 \times 695$ | 375,300 | 375,934 B | `734e2efc4d8b5ffac6351e8db97c695c75ac136b0ba917cb3edec853995b606d` | **13,379** | 3.56% |
| **mumbai** | $557 \times 858$ | 477,906 | 478,660 B | `89aea8832301e71eae2a54a3220e06b25b9fe694f590323b920790d5f8d0da95` | **12,244** | 2.56% |
| **nantes** | $582 \times 522$ | 303,804 | 304,366 B | `9dec7d4eab48802131ce1e62259801f6ae078c39e3567dd2271151b7a369fd54` | **3,449** | 1.14% |
| **paris** | $390 \times 408$ | 159,120 | 159,538 B | `5cea96cc4ad12c247c7ebc7c0cfec9dfb8fb50a6164e532cd2dc975e54c27919` | **458** | 0.29% |
| **pisa** | $718 \times 776$ | 557,168 | 557,994 B | `4e27ad6a98436566808ad6b1f3867228f670dc771baeb6b8d2c1c26572806874` | **9,130** | 1.64% |
| **rennes** | $563 \times 339$ | 190,857 | 191,315 B | `2f256707a931a34682b6c6bb2cb04a131b04a2ca3669c36efcfe9cef002c2778` | **4,932** | 2.58% |
| **saclay_e** | $688 \times 639$ | 439,632 | 440,362 B | `17d8ce05a9e9421caf49e2aee3381597766f57b9ae0a42a4372c4bda797816a3` | **4,346** | 0.99% |
| **TOTAL** | — | **6,517,578** | — | — | **149,190** | **2.29%** |

#### B. Canonical Test Set (10 Scenes — Locked Baseline Reference):
| Scene ID | Dimensions $(W \times H)$ | Total Pixels | Physical GeoTIFF File Size | GeoTIFF SHA-256 Checksum | Positive Change Pixels (`val == 2`) | Parquet Mask Changes (`val > 0`) |
|---|---|---|---|---|---|---|
| **brasilia** | $469 \times 433$ | 203,077 | 203,543 B | `55210393f4b408d44c66bd314deeff2c2c2875b75650944232f06179b1ec32da` | **5,242** | **5,242** |
| **chongqing** | $544 \times 730$ | 397,120 | 397,770 B | `8f50525ae85867e04276f89aedb6988b326974a73c006116f356b76ff00143c3` | **28,637** | **28,637** |
| **dubai** | $634 \times 774$ | 490,716 | 491,494 B | `ca0c48d226fe19328373f319a8c25f954c382eadf22ec676d91bbc0c9faeb8b8` | **48,689** | **48,689** |
| **lasvegas** | $716 \times 824$ | 589,984 | 590,842 B | `7fa9b17a987922100c343b94c0a0061e78232c0deb8c71caf15b3283e6e67fb6` | **45,270** | **45,270** |
| **milano** | $558 \times 545$ | 304,110 | 304,680 B | `97e0847efb006061cd3829b694ddf3fc8c58382069fcb5bd198a27a6298d5bc3` | **2,419** | **2,419** |
| **montpellier** | $451 \times 426$ | 192,126 | 192,576 B | `d8e35393c4b54156a4382feaf768e9815114ecb53dfd7f3f6f9a010914ae7b26` | **13,054** | **13,054** |
| **norcia** | $385 \times 241$ | 92,785 | 93,139 B | `9dea9f93a1ddb3dffd566777dc72eab6c1fc441176860033b348c2b9debc0c84` | **1,227** | **1,227** |
| **rio** | $426 \times 353$ | 150,378 | 150,788 B | `c8ea0f6f54d0fd956a98a3ff4907fa9dc9904f4001ccf216451f2410bc578716` | **8,552** | **8,552** |
| **saclay_w** | $688 \times 639$ | 439,632 | 440,362 B | `36ce900a680a5036ec06f994b950a52e77329a05f1b2e6c0dfb93277a365c7fc` | **5,018** | **5,018** |
| **valencia** | $476 \times 458$ | 218,008 | 218,482 B | `4d29dda30e2213f7ffd6506618d043b765e6e3d467dd4c057f6da1b687fb20e6` | **969** | **969** |
| **TOTAL** | — | **3,077,936** | — | — | **159,077** | **159,077** |

### 4.3 Conclusion of Reconciliation:
- **Test Set Parity:** $100.00\%$ match. The locked classical baselines ($30.83\%$ canonical / $32.51\%$ spatially blocked) were evaluated against the exact physical ground truth files.
- **Training Discrepancy Resolved:** The discrepancy of `18,944`, `21,373`, `3,485`, `16,846` was an accidental manual markdown transcription typo in the AI-08B1 document. The physical GeoTIFFs on disk have always held **23,592** (`abudhabi`), **17,318** (`beihai`), **458** (`paris`), and **13,379** (`hongkong`).

---

## 5. Temporal and Model Assumptions Validation

1. **Pretrained Checkpoint Parameters:**
   - Architecture: 3D Spatiotemporal ViT-B (24 blocks, 1024 dim, 16 heads).
   - Patch size: `[1, 16, 16]`.
   - Pretrained frames: `num_frames: 4`.
   - Native input channels: 6 HLS bands (`B02`, `B03`, `B04`, `B8A`, `B11`, `B12`).
2. **Bi-Temporal Adaptation ($T=2$):**
   - Temporal tubelet size $= 1$ means temporal frames are not merged during patch embedding.
   - Slicing $P_t[:2]$ mathematically isolates the positional coordinates of the first two temporal frames.
   - *Audit Finding:* While mathematically sound and proven on synthetic tensors, this behavior **has not yet been validated against the actual downloaded checkpoint binary**.

---

## 6. Official Final Decision & Stop Gate

```
========================================================================================
 FINAL EVALUATION GATE STATUS: BLOCKED — REAL DATA NOT ACQUIRED
========================================================================================
  [X] Physical 1.33 GB Checkpoint Downloaded Locally:      NO  (Pending Cloud Session)
  [X] Physical 6-Band OSCD Imagery Downloaded Locally:     NO  (Pending Cloud Session)
  [X] Real-Pixel Forward Pass Demonstrated:                 NO  (Synthetic Tensor Only)
  [√] Ground-Truth Physical Label Counts Reconciled:       YES (149,190 Train / 159,077 Test)
  [√] Locked Classical Baselines Preserved:                YES (30.83% Canonical / 32.51% Blocked)
  [√] Zero Heuristic Fallback Enforced in Architecture:    YES (Raises RuntimeError)
========================================================================================
```

### Mandatory Directives:
1. **AI-08C Training is STRICTLY BLOCKED.** No model training, fine-tuning, or parameter updates are authorized.
2. **Baseline Protection:** The locked baselines ($30.83\%$ canonical / $32.51\%$ spatially blocked) remain the sole official benchmark reference.
3. **Execution Environment Requirement:** Real checkpoint loading and authentic multispectral raster ingestion can only occur in a cloud GPU container (Google Colab Pro or RunPod/AWS) with sufficient ephemeral storage ($\ge 20$ GB) and GPU VRAM ($\ge 24$ GB).

---

## 7. Verifiable Commands to Reproduce This Audit

To reproduce the exact findings in this report:

```bash
cd osiris-master

# 1. Verify absence of physical .pt weights binary on disk
python -c "import os; print([f for r, d, fs in os.walk('.') for f in fs if f.endswith('.pt')])"
# Output: [] (Zero .pt files exist locally)

# 2. Verify physical ground-truth TIFF change counts (149,190 train, 159,077 test)
python scratch/update_exact_counts.py

# 3. Verify multispectral manifest schema and integrity
python src/lib/satellite/prithvi_cloud/validate_multispectral_manifest.py

# 4. Run Vitest regression suite
npx vitest run src/lib/satellite/prithvi_cloud/oscd-multispectral.test.ts
```
