"""
ORBINEX — OSCD Multispectral Manifest Validator
Validates the scientific integrity, split separation, band completeness,
and ground-truth verification of the 24-scene OSCD manifest for Prithvi-EO-2.0.
"""

import os
import json
import hashlib
import sys

def get_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(8192 * 1024):
            h.update(chunk)
    return h.hexdigest()

def validate_manifest(manifest_path: str) -> bool:
    print(f"=== VALIDATING MANIFEST: {manifest_path} ===")
    if not os.path.exists(manifest_path):
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")

    with open(manifest_path, 'r') as f:
        manifest = json.load(f)

    # 1. Archive checks
    archive_info = manifest.get('image_archive', {})
    expected_md5 = 'c50d4a2941da64e03a47ac4dec63d915'
    assert archive_info.get('md5') == expected_md5, f"MD5 mismatch: {archive_info.get('md5')} != {expected_md5}"
    print(f" [PASS] Official ONERA image archive MD5 verified: {expected_md5}")

    # 2. Bands checks
    required_bands = manifest.get('required_bands', [])
    band_names = [b['band_name'] for b in required_bands]
    expected_bands = ['B02', 'B03', 'B04', 'B8A', 'B11', 'B12']
    assert band_names == expected_bands, f"Band mismatch: {band_names} != {expected_bands}"
    print(f" [PASS] Required 6 multispectral bands strictly match Prithvi HLS input: {band_names}")

    # 3. Scene and split counts
    scenes = manifest.get('scenes', [])
    assert len(scenes) == 24, f"Expected 24 scenes, got {len(scenes)}"
    print(f" [PASS] Total scenes count verified: 24")

    train_scenes = [s for s in scenes if s['canonical_split'] == 'train']
    test_scenes = [s for s in scenes if s['canonical_split'] == 'test']
    assert len(train_scenes) == 14, f"Expected 14 train scenes, got {len(train_scenes)}"
    assert len(test_scenes) == 10, f"Expected 10 test scenes, got {len(test_scenes)}"
    print(f" [PASS] Canonical scene split verified: 14 Train / 10 Test")

    # 4. Zero Data Leakage
    train_ids = set(s['scene_id'] for s in train_scenes)
    test_ids = set(s['scene_id'] for s in test_scenes)
    overlap = train_ids.intersection(test_ids)
    assert len(overlap) == 0, f"DATA LEAKAGE DETECTED! Overlapping scenes: {overlap}"
    print(f" [PASS] Zero Data Leakage: Train and Test scene sets are disjoint")

    # 5. Pixel count reconciliation
    total_train_px = sum(s['total_pixels'] for s in train_scenes)
    total_test_px = sum(s['total_pixels'] for s in test_scenes)
    assert total_train_px == 6517578, f"Train pixels mismatch: {total_train_px} != 6517578"
    assert total_test_px == 3077936, f"Test pixels mismatch: {total_test_px} != 3077936"
    print(f" [PASS] Physical pixel counts verified: 6,517,578 train / 3,077,936 test")

    # 6. Spatially blocked split
    blocked_test = [s for s in scenes if s['spatially_blocked_split'] == 'test_independent']
    excluded_scenes = [s for s in scenes if s['spatially_blocked_split'] == 'excluded_due_to_leakage']
    assert len(blocked_test) == 9, f"Expected 9 spatially blocked test scenes, got {len(blocked_test)}"
    assert len(excluded_scenes) == 1 and excluded_scenes[0]['scene_id'] == 'saclay_w', "Saclay West not excluded!"
    total_blocked_px = sum(s['total_pixels'] for s in blocked_test)
    assert total_blocked_px == 2638304, f"Blocked test pixels mismatch: {total_blocked_px} != 2638304"
    print(f" [PASS] Spatially blocked independent protocol verified: 9 scenes, 2,638,304 pixels (saclay_w excluded)")

    # 7. Ground-truth file integrity
    missing_gt = 0
    corrupted_gt = 0
    for s in scenes:
        gt_info = s.get('ground_truth', {})
        gt_path = gt_info.get('local_tif_path')
        expected_sha = gt_info.get('sha256')
        if not os.path.exists(gt_path):
            print(f" [FAIL] Missing ground truth for scene: {s['scene_id']} at {gt_path}")
            missing_gt += 1
            continue
        actual_sha = get_sha256(gt_path)
        if actual_sha != expected_sha:
            print(f" [FAIL] Checksum mismatch for {s['scene_id']}: {actual_sha} != {expected_sha}")
            corrupted_gt += 1

    assert missing_gt == 0, f"{missing_gt} ground truth files missing!"
    assert corrupted_gt == 0, f"{corrupted_gt} ground truth files corrupted!"
    print(f" [PASS] All 24 ground-truth rasters exist locally and match verified SHA256 checksums")

    # 8. Check official IBM-NASA normalization constants
    pre = manifest.get('preprocessing_parameters', {})
    expected_means = [0.1087, 0.1342, 0.1433, 0.2734, 0.1958, 0.1363]
    expected_stds = [0.2248, 0.2179, 0.2178, 0.1850, 0.1242, 0.1049]
    assert pre.get('normalization_mean') == expected_means, "Normalization mean mismatch!"
    assert pre.get('normalization_std') == expected_stds, "Normalization std mismatch!"
    print(f" [PASS] Official NASA-IBM Prithvi normalization constants verified")

    print("\n>>> ALL MULTISPECTRAL MANIFEST CHECKS PASSED SUCCESSFULLY. <<<")
    return True

if __name__ == '__main__':
    default_path = os.path.join(os.path.dirname(__file__), 'oscd_multispectral_manifest.json')
    success = validate_manifest(default_path)
    if not success:
        sys.exit(1)
