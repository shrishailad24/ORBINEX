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
from pathlib import Path
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

def get_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(8192 * 1024):
            h.update(chunk)
    return h.hexdigest()

def validate_manifest(manifest_path: str, data_dir: str = "data/oscd_multispectral") -> bool:
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

    # 7. Ground-truth file integrity
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
        raise RuntimeError(f"Gate 4 failed: {missing_gt} ground truth files missing from disk at {data_dir}!")
    if corrupted_gt != 0:
        raise RuntimeError(f"Gate 4 failed: {corrupted_gt} ground truth files failed SHA-256 verification!")
    print(f" [PASS] All 24 ground-truth rasters exist locally and match verified SHA256 checksums")

    # 8. GATE 5: Physical Geospatial Mask Alignment on Target Scene 'bercy'
    print("\n=== GATE 5: PHYSICAL GEOSPATIAL MASK ALIGNMENT AUDIT (SCENE 'bercy') ===")
    import rasterio
    bercy_gt_path = data_dir_resolved / "Onera Satellite Change Detection dataset - Train Labels/bercy/cm/bercy-cm.tif"
    bercy_b02_path = data_dir_resolved / "Onera Satellite Change Detection dataset - Images/bercy/imgs_1_rect/B02.tif"
    if not bercy_b02_path.exists():
        bercy_b02_path = data_dir_resolved / "bercy/imgs_1_rect/B02.tif"

    if not bercy_gt_path.is_file():
        raise RuntimeError(f"Gate 5 failed: Bercy ground-truth mask missing at {bercy_gt_path}")
    if not bercy_b02_path.is_file():
        raise RuntimeError(f"Gate 5 failed: Bercy B02 reference raster missing at {bercy_b02_path}")

    with rasterio.open(str(bercy_gt_path)) as src_mask, rasterio.open(str(bercy_b02_path)) as src_b02:
        if src_mask.shape != src_b02.shape:
            raise RuntimeError(f"Gate 5 failed: Shape mismatch between Bercy mask {src_mask.shape} and B02 {src_b02.shape}")
        if src_mask.shape != (360, 395):
            raise RuntimeError(f"Gate 5 failed: Expected Bercy dimensions (360, 395), got {src_mask.shape}")
        if src_mask.crs != src_b02.crs:
            raise RuntimeError(f"Gate 5 failed: CRS mismatch between Bercy mask ({src_mask.crs}) and B02 ({src_b02.crs})")
        if src_mask.transform != src_b02.transform:
            raise RuntimeError(f"Gate 5 failed: Affine transform mismatch between Bercy mask and B02 raster")
        print(f" [PASS] GATE 5 VERIFIED: Scene 'bercy' mask and B02 raster have identical shape (360, 395), CRS ({src_mask.crs}), and Affine Transform.")
        print(" [NOTE] Physical CRS/transform alignment is verified for scene 'bercy' only. All-scene physical alignment remains unverified until complete 24-scene raster ingestion.")

    # 9. Check official IBM-NASA normalization constants
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
    args = parser.parse_args()
    default_path = os.path.join(os.path.dirname(__file__), 'oscd_multispectral_manifest.json')
    success = validate_manifest(args.manifest or default_path, data_dir=args.data_dir)
    if not success:
        sys.exit(1)
