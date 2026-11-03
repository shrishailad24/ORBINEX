"""
ORBINEX — OSCD Multispectral Manifest Validator
Validates scientific integrity, split separation, band completeness,
and ground-truth verification of the 24-scene OSCD manifest for Prithvi-EO-2.0.
"""

import os
import re
import json
import hashlib
import argparse
from datetime import datetime
from pathlib import Path
from typing import Tuple, List, Dict, Any
import sys

class SecurityError(RuntimeError):
    """Raised when path traversal or containment violation is detected."""
    pass

def is_path_contained(target_path: Path, base_dir: Path) -> bool:
    try:
        target_resolved = target_path.resolve(strict=False)
        base_resolved = base_dir.resolve(strict=False)
        try:
            return target_resolved.is_relative_to(base_resolved)
        except AttributeError:
            return os.path.commonpath([str(target_resolved), str(base_resolved)]) == str(base_resolved)
    except (ValueError, OSError):
        return False

def parse_date_token(token: str) -> datetime:
    token = token.strip()
    m = re.search(r'(\d{4}[-/]?\d{2}[-/]?\d{2})', token)
    if m:
        cleaned = m.group(1).replace('-', '').replace('/', '')
        return datetime.strptime(cleaned, "%Y%m%d")
    for fmt in ("%Y%m%d", "%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(token.split()[-1], fmt)
        except ValueError:
            pass
    raise ValueError(f"Unable to parse date string: '{token}'")

def validate_dates_content(dates_content: str, scene_id: str) -> Tuple[datetime, datetime]:
    lines = [line.strip() for line in dates_content.splitlines() if line.strip()]
    if len(lines) < 2:
        raise RuntimeError(f"dates.txt for scene '{scene_id}' contains fewer than 2 date entries: {lines}")
    t1 = parse_date_token(lines[0])
    t2 = parse_date_token(lines[1])
    if t1 >= t2:
        raise RuntimeError(
            f"Temporal chronology violation for scene '{scene_id}': "
            f"T1 ({t1.strftime('%Y-%m-%d')}) >= T2 ({t2.strftime('%Y-%m-%d')})"
        )
    return t1, t2

def get_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(8192 * 1024):
            h.update(chunk)
    return h.hexdigest()

def validate_manifest(manifest_path: str, data_dir: str = "data/oscd_multispectral", require_imagery: bool = True) -> bool:
    print(f"=== VALIDATING MANIFEST: {manifest_path} ===")
    if not os.path.exists(manifest_path):
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")

    with open(manifest_path, 'r', encoding="utf-8") as f:
        manifest = json.load(f)

    # 1. Archive checks
    archive_info = manifest.get('image_archive', {})
    expected_md5 = 'c50d4a2941da64e03a47ac4dec63d915'
    actual_archive_md5 = archive_info.get('md5')
    if actual_archive_md5 != expected_md5:
        raise RuntimeError(f"Manifest image archive MD5 mismatch: {actual_archive_md5} != {expected_md5}")
    print(f" [PASS] Official ONERA image archive MD5 verified: {expected_md5}")

    # 2. Bands checks
    required_bands = manifest.get('required_bands', [])
    band_names = [b.get('band_name') for b in required_bands]
    expected_bands = ['B02', 'B03', 'B04', 'B8A', 'B11', 'B12']
    if band_names != expected_bands:
        raise RuntimeError(f"Band specification mismatch: {band_names} != {expected_bands}")
    print(f" [PASS] Required 6 multispectral bands strictly match Prithvi HLS input: {band_names}")

    # 3. Scene and split counts
    scenes = manifest.get('scenes', [])
    if len(scenes) != 24:
        raise RuntimeError(f"Expected exactly 24 scenes in manifest, found {len(scenes)}")
    print(f" [PASS] Total scenes count verified: 24")

    train_scenes = [s for s in scenes if s.get('canonical_split') == 'train']
    test_scenes = [s for s in scenes if s.get('canonical_split') == 'test']
    if len(train_scenes) != 14:
        raise RuntimeError(f"Expected 14 train scenes, found {len(train_scenes)}")
    if len(test_scenes) != 10:
        raise RuntimeError(f"Expected 10 test scenes, found {len(test_scenes)}")
    print(f" [PASS] Canonical scene split verified: 14 Train / 10 Test")

    # 4. Zero Data Leakage
    train_ids = set(s['scene_id'] for s in train_scenes)
    test_ids = set(s['scene_id'] for s in test_scenes)
    overlap = train_ids.intersection(test_ids)
    if len(overlap) != 0:
        raise RuntimeError(f"[SECURITY VIOLATION] Data leakage detected! Overlapping scenes between train and test: {overlap}")
    print(f" [PASS] Zero Data Leakage: Train and Test scene sets are disjoint")

    # 5. Pixel count reconciliation
    total_train_px = sum(s.get('total_pixels', 0) for s in train_scenes)
    total_test_px = sum(s.get('total_pixels', 0) for s in test_scenes)
    if total_train_px != 6517578:
        raise RuntimeError(f"Train pixel count reconciliation mismatch: {total_train_px} != 6517578")
    if total_test_px != 3077936:
        raise RuntimeError(f"Test pixel count reconciliation mismatch: {total_test_px} != 3077936")
    print(f" [PASS] Physical pixel counts verified: 6,517,578 train / 3,077,936 test")

    # 6. Spatially blocked split
    blocked_test = [s for s in scenes if s.get('spatially_blocked_split') == 'test_independent']
    excluded_scenes = [s for s in scenes if s.get('spatially_blocked_split') == 'excluded_due_to_leakage']
    if len(blocked_test) != 9:
        raise RuntimeError(f"Expected 9 spatially blocked test scenes, found {len(blocked_test)}")
    if len(excluded_scenes) != 1 or excluded_scenes[0].get('scene_id') != 'saclay_w':
        raise RuntimeError(f"Saclay West must be the sole excluded scene from spatially blocked test split!")
    total_blocked_px = sum(s.get('total_pixels', 0) for s in blocked_test)
    if total_blocked_px != 2638304:
        raise RuntimeError(f"Blocked test pixel count mismatch: {total_blocked_px} != 2638304")
    print(f" [PASS] Spatially blocked independent protocol verified: 9 scenes, 2,638,304 pixels (saclay_w excluded)")

    # 7. Ground-truth file integrity (Gate 6)
    missing_gt = 0
    corrupted_gt = 0
    data_dir_resolved = Path(data_dir).resolve(strict=False)

    for s in scenes:
        gt_info = s.get('ground_truth', {})
        rel_path = gt_info.get('relative_tif_path')
        if not rel_path or not isinstance(rel_path, str) or not rel_path.strip():
            raise SecurityError(f"[MANIFEST ERROR] Scene '{s['scene_id']}' missing required portable key 'relative_tif_path'.")

        rel_norm = rel_path.replace('\\', '/')
        if rel_norm.startswith('/') or re.match(r'^[a-zA-Z]:', rel_norm):
            raise SecurityError(f"[SECURITY VIOLATION] Absolute path in 'relative_tif_path' for scene '{s['scene_id']}': {rel_path}")
        parts = [p for p in rel_norm.split('/') if p]
        if any(p == '..' for p in parts):
            raise SecurityError(f"[SECURITY VIOLATION] Directory traversal '..' in 'relative_tif_path' for scene '{s['scene_id']}': {rel_path}")

        target_path = (data_dir_resolved / rel_norm).resolve(strict=False)
        if not is_path_contained(target_path, data_dir_resolved):
            raise SecurityError(f"[SECURITY VIOLATION] Ground truth path escaped data_dir: {target_path}")

        expected_sha = gt_info.get('sha256')
        if not target_path.is_file():
            print(f" [FAIL] Missing ground truth for scene: {s['scene_id']} at {target_path}")
            missing_gt += 1
            continue
        actual_sha = get_sha256(str(target_path))
        if actual_sha != expected_sha:
            print(f" [FAIL] Checksum mismatch for {s['scene_id']}: {actual_sha} != {expected_sha}")
            corrupted_gt += 1

    if missing_gt != 0:
        raise RuntimeError(f"Gate 6 failed: {missing_gt} ground truth files missing from disk at {data_dir}!")
    if corrupted_gt != 0:
        raise RuntimeError(f"Gate 6 failed: {corrupted_gt} ground truth files failed SHA-256 verification!")
    print(f" [PASS] All 24 ground-truth rasters exist locally and match verified SHA256 checksums")

    # 8. GATE 7: Physical 24-Scene Raster Ingestion, Temporal Chronology & Geospatial Alignment
    print("\n=== GATE 7: PHYSICAL 24-SCENE RASTER INGESTION & GEOSPATIAL ALIGNMENT AUDIT ===")
    if not require_imagery:
        print(" [NOTE] Physical 24-scene raster alignment check skipped (require_imagery=False).")
        print(" [NOTE] Ground-truth manifest and labels are verified, but physical imagery rasters remain unverified.")
    else:
        try:
            import rasterio
        except ImportError:
            raise RuntimeError(
                "rasterio is required to perform physical geospatial raster verification. "
                "Please ensure rasterio is installed in the active environment."
            )

        verified_scenes = 0
        total_bands_verified = 0

        for s in scenes:
            scene_id = s["scene_id"]
            expected_dims = s.get("dimensions")  # [height, width]
            if not expected_dims or len(expected_dims) != 2:
                raise RuntimeError(f"Manifest missing valid 'dimensions' for scene '{scene_id}': {expected_dims}")
            exp_h, exp_w = expected_dims[0], expected_dims[1]

            # 1. Locate scene imagery directory
            scene_base_candidates = [
                data_dir_resolved / "Onera Satellite Change Detection dataset - Images" / scene_id,
                data_dir_resolved / scene_id,
            ]
            scene_dir = None
            for cand in scene_base_candidates:
                if cand.is_dir():
                    scene_dir = cand
                    break
            if not scene_dir:
                raise RuntimeError(
                    f"Gate 7 failed: Imagery directory for scene '{scene_id}' not found in '{data_dir_resolved}'. "
                    f"Checked: {[str(c) for c in scene_base_candidates]}"
                )

            # 2. Verify dates.txt and temporal order T1 < T2
            dates_file = scene_dir / "dates.txt"
            if not dates_file.is_file():
                raise RuntimeError(f"Gate 7 failed: Missing dates.txt for scene '{scene_id}' at {dates_file}")
            with open(dates_file, "r", encoding="utf-8") as f:
                dates_text = f.read()
            t1, t2 = validate_dates_content(dates_text, scene_id)

            # 3. Locate rectified band directories
            t1_dir = scene_dir / "imgs_1_rect"
            t2_dir = scene_dir / "imgs_2_rect"
            if not t1_dir.is_dir():
                raise RuntimeError(f"Gate 7 failed: Missing 'imgs_1_rect' directory for scene '{scene_id}' at {t1_dir}")
            if not t2_dir.is_dir():
                raise RuntimeError(f"Gate 7 failed: Missing 'imgs_2_rect' directory for scene '{scene_id}' at {t2_dir}")

            # 4. Check all 12 rectified band files exist
            required_band_names = ['B02.tif', 'B03.tif', 'B04.tif', 'B8A.tif', 'B11.tif', 'B12.tif']
            t1_band_paths = [t1_dir / b for b in required_band_names]
            t2_band_paths = [t2_dir / b for b in required_band_names]

            for bp in t1_band_paths:
                if not bp.is_file():
                    raise RuntimeError(f"Gate 7 failed: Scene '{scene_id}' missing epoch 1 band file: {bp}")
            for bp in t2_band_paths:
                if not bp.is_file():
                    raise RuntimeError(f"Gate 7 failed: Scene '{scene_id}' missing epoch 2 band file: {bp}")

            # 5. Geospatial alignment across all 12 bands using T1 B02 as reference
            ref_b02_path = t1_dir / "B02.tif"
            with rasterio.open(str(ref_b02_path)) as src_ref:
                ref_shape = src_ref.shape
                ref_crs = src_ref.crs
                ref_transform = src_ref.transform

                if ref_shape != (exp_h, exp_w):
                    raise RuntimeError(
                        f"Gate 7 failed: Scene '{scene_id}' reference B02 shape {ref_shape} "
                        f"mismatches manifest dimensions {(exp_h, exp_w)}"
                    )
                if not ref_crs:
                    raise RuntimeError(f"Gate 7 failed: Scene '{scene_id}' reference B02 has missing or invalid CRS")

                # Verify remaining 11 bands against reference
                all_other_bands = t1_band_paths[1:] + t2_band_paths
                for bp in all_other_bands:
                    with rasterio.open(str(bp)) as src_band:
                        if src_band.shape != ref_shape:
                            raise RuntimeError(
                                f"Gate 7 failed: Scene '{scene_id}' band {bp.name} shape {src_band.shape} "
                                f"mismatches reference shape {ref_shape}"
                            )
                        if src_band.crs != ref_crs:
                            raise RuntimeError(
                                f"Gate 7 failed: Scene '{scene_id}' band {bp.name} CRS {src_band.crs} "
                                f"mismatches reference CRS {ref_crs}"
                            )
                        if src_band.transform != ref_transform:
                            raise RuntimeError(
                                f"Gate 7 failed: Scene '{scene_id}' band {bp.name} transform {src_band.transform} "
                                f"mismatches reference transform {ref_transform}"
                            )

            # 6. Verify corresponding ground-truth mask alignment
            gt_info = s.get("ground_truth", {})
            mask_rel = gt_info.get("relative_tif_path")
            mask_path = (data_dir_resolved / mask_rel).resolve(strict=False)
            if not mask_path.is_file():
                raise RuntimeError(f"Gate 7 failed: Ground-truth mask missing for scene '{scene_id}' at {mask_path}")

            with rasterio.open(str(mask_path)) as src_mask:
                if src_mask.shape != ref_shape:
                    raise RuntimeError(
                        f"Gate 7 failed: Scene '{scene_id}' mask shape {src_mask.shape} "
                        f"mismatches reference raster shape {ref_shape}"
                    )
                if src_mask.crs != ref_crs:
                    raise RuntimeError(
                        f"Gate 7 failed: Scene '{scene_id}' mask CRS {src_mask.crs} "
                        f"mismatches reference raster CRS {ref_crs}"
                    )
                if src_mask.transform != ref_transform:
                    raise RuntimeError(
                        f"Gate 7 failed: Scene '{scene_id}' mask transform {src_mask.transform} "
                        f"mismatches reference raster transform {ref_transform}"
                    )

            verified_scenes += 1
            total_bands_verified += 12
            print(
                f" [PASS] Scene '{scene_id:15s}': 12 bands verified (dims={exp_h}x{exp_w}, CRS={ref_crs}), "
                f"T1 ({t1.strftime('%Y-%m-%d')}) < T2 ({t2.strftime('%Y-%m-%d')}), mask aligned."
            )

        if verified_scenes != 24 or total_bands_verified != 288:
            raise RuntimeError(
                f"Gate 7 failed: Expected 24 verified scenes and 288 band rasters, "
                f"got {verified_scenes} scenes and {total_bands_verified} bands."
            )
        print(f" [PASS] GATE 7 VERIFIED: All 24 scenes (288 rectified bands, 24 dates.txt, 24 masks) physically aligned.")

    # 9. Check official IBM-NASA normalization constants (Gate 8)
    pre = manifest.get('preprocessing_parameters', {})
    expected_means = [0.1087, 0.1342, 0.1433, 0.2734, 0.1958, 0.1363]
    expected_stds = [0.2248, 0.2179, 0.2178, 0.1850, 0.1242, 0.1049]
    if pre.get('normalization_mean') != expected_means:
        raise RuntimeError(f"Normalization mean constant mismatch: {pre.get('normalization_mean')} != {expected_means}")
    if pre.get('normalization_std') != expected_stds:
        raise RuntimeError(f"Normalization std constant mismatch: {pre.get('normalization_std')} != {expected_stds}")
    print(f" [PASS] Official NASA-IBM Prithvi normalization constants verified")

    print("\n>>> ALL MULTISPECTRAL MANIFEST CHECKS PASSED SUCCESSFULLY. <<<")
    return True

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Validate OSCD Multispectral Manifest")
    parser.add_argument("--manifest", default=None, help="Path to manifest json")
    parser.add_argument("--data_dir", default="data/oscd_multispectral", help="Path to data directory")
    parser.add_argument("--skip_imagery", action="store_true", help="Skip 24-scene raster and alignment verification (labels and metadata only)")
    args = parser.parse_args()
    default_path = os.path.join(os.path.dirname(__file__), 'oscd_multispectral_manifest.json')
    success = validate_manifest(
        args.manifest or default_path,
        data_dir=args.data_dir,
        require_imagery=not args.skip_imagery
    )
    if not success:
        sys.exit(1)
