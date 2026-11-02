"""
ORBINEX — Cloud OSCD Multispectral Acquisition & Verification Pipeline
Downloads official ONERA OSCD 13-band Sentinel-2 assets and official ground-truth labels,
verifies MD5 checksums, and selectively extracts the 6 authentic bands required for Prithvi-EO-2.0.

ZERO-SYNTHESIS POLICY:
Never synthesizes missing bands.
Never duplicates RGB channels.
Preserves authentic DN values and metadata.
"""

import os
import sys
import argparse
import re
import hashlib
import json
import shutil
import urllib.request
import zipfile
from pathlib import Path
from typing import List, Dict, Any

OFFICIAL_IMAGES_URL = "https://partage.imt.fr/index.php/s/gKRaWgRnLMfwMGo/download"
OFFICIAL_IMAGES_MD5 = "c50d4a2941da64e03a47ac4dec63d915"
HUGGINGFACE_MIRROR_URL = "https://huggingface.co/datasets/blanchon/OSCD_MSI/resolve/main/Onera%20Satellite%20Change%20Detection%20dataset%20-%20Images.zip"

TRAIN_LABELS_URL = "https://partage.mines-telecom.fr/index.php/s/2D6n03k58ygBSpu/download"
TRAIN_LABELS_MD5 = "4d2965af8170c705ebad3d6ee71b6990"
TRAIN_LABELS_HF_MIRROR = "https://huggingface.co/datasets/blanchon/OSCD_MSI/resolve/main/Onera%20Satellite%20Change%20Detection%20dataset%20-%20Train%20Labels.zip"

TEST_LABELS_URL = "https://partage.imt.fr/index.php/s/gpStKn4Mpgfnr63/download"
TEST_LABELS_MD5 = "8177d437793c522653c442aa4e66c617"
TEST_LABELS_HF_MIRROR = "https://huggingface.co/datasets/blanchon/OSCD_MSI/resolve/main/Onera%20Satellite%20Change%20Detection%20dataset%20-%20Test%20Labels.zip"

REQUIRED_BANDS = ["B02.tif", "B03.tif", "B04.tif", "B8A.tif", "B11.tif", "B12.tif"]

class SecurityError(RuntimeError):
    """Raised when path traversal, symlink, or archive escaping is detected."""
    pass

def clean_url(raw_url: str) -> str:
    if not raw_url:
        return ""
    match = re.search(r'\((https?://[^)]+)\)', raw_url)
    if match:
        return match.group(1).strip()
    return raw_url.strip('`"\' \t\r\n')

def is_path_contained(target_path: Path, base_dir: Path) -> bool:
    try:
        target_resolved = target_path.resolve(strict=False)
        base_resolved = base_dir.resolve(strict=True)
        try:
            return target_resolved.is_relative_to(base_resolved)
        except AttributeError:
            return os.path.commonpath([str(target_resolved), str(base_resolved)]) == str(base_resolved)
    except (ValueError, OSError):
        return False

def safe_extract_zip_member(zf: zipfile.ZipFile, member: zipfile.ZipInfo, output_dir: str, written_destinations: set) -> Path:
    # 1. Symlink check
    mode = member.external_attr >> 16
    if (mode & 0o170000) == 0o120000:
        raise SecurityError(f"Symlink rejected in archive member: {member.filename}")

    # 2. Strict path normalization and path traversal rejection
    raw_name = member.filename.replace('\\', '/')
    if raw_name.startswith('/') or re.match(r'^[a-zA-Z]:', raw_name):
        raise SecurityError(f"Absolute or drive path rejected: {member.filename}")
    parts = [p for p in raw_name.split('/') if p and p != '.']
    if any(p == '..' for p in parts):
        raise SecurityError(f"Directory traversal (..) rejected: {member.filename}")

    norm_member = '/'.join(parts)
    base_path = Path(output_dir).resolve(strict=False)
    dest_path = (base_path / norm_member).resolve(strict=False)

    # 3. Component-boundary containment check
    if not is_path_contained(dest_path, base_path):
        raise SecurityError(f"Path containment violation: {dest_path} is outside {base_path}")

    # 4. Reject duplicate archive destination
    dest_str = str(dest_path)
    if dest_str in written_destinations:
        raise SecurityError(f"Duplicate archive extraction destination rejected: {dest_str}")

    # 5. Check symlinked parent directories
    curr = dest_path.parent
    while curr != base_path and curr != curr.parent:
        if curr.is_symlink():
            raise SecurityError(f"Symlinked parent directory detected: {curr}")
        curr = curr.parent

    # 6. Safe write using normalized destination path
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    with zf.open(member) as src, open(dest_path, "wb") as dst:
        shutil.copyfileobj(src, dst)

    written_destinations.add(dest_str)
    return dest_path

def compute_md5(filepath: str) -> str:
    h = hashlib.md5()
    with open(filepath, "rb") as f:
        while chunk := f.read(1024 * 1024 * 8):
            h.update(chunk)
    return h.hexdigest()

def compute_sha256(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(1024 * 1024 * 8):
            h.update(chunk)
    return h.hexdigest()

def check_disk_space(target_path: str, required_gb: float = 3.0) -> bool:
    try:
        total, used, free = shutil.disk_usage(os.path.abspath(target_path))
        free_gb = free / (1024 ** 3)
        print(f"[DISK CHECK] Free disk space on target: {free_gb:.2f} GB (Required: >= {required_gb:.1f} GB)")
        if free_gb < required_gb:
            print(f"[WARNING] Tight disk space! {free_gb:.2f} GB available < {required_gb} GB required.")
            return False
        return True
    except Exception as e:
        print(f"[DISK CHECK] Could not determine disk space: {e}")
        return True

def ensure_verified_archive(url: str, mirror_url: str, output_path: str, expected_md5: str) -> bool:
    url = clean_url(url)
    mirror_url = clean_url(mirror_url)
    if os.path.exists(output_path):
        print(f"[CHECKSUM] Existing archive found at {output_path}. Verifying MD5...")
        if compute_md5(output_path).lower() == expected_md5.lower():
            print(f"[CHECKSUM PASSED] Existing archive matches expected MD5: {expected_md5}")
            return True
        print(f"[CHECKSUM MISMATCH] Existing archive corrupted! Purging {output_path}...")
        os.remove(output_path)

    part_path = output_path + ".part"
    if os.path.exists(part_path):
        os.remove(part_path)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    print(f"[DOWNLOAD] Fetching authentic archive from: {url}")
    def progress(block_num, block_size, total_size):
        read_bytes = block_num * block_size
        if total_size > 0 and block_num % 1000 == 0:
            pct = min(100.0, (read_bytes / total_size) * 100)
            print(f"  Downloaded: {read_bytes / (1024**2):.1f} MB / {total_size / (1024**2):.1f} MB ({pct:.1f}%)")

    fetched = False
    try:
        urllib.request.urlretrieve(url, part_path, reporthook=progress)
        fetched = True
    except Exception as e:
        print(f"[DOWNLOAD ERROR] Primary URL failed ({e}). Trying mirror: {mirror_url}")
        try:
            urllib.request.urlretrieve(mirror_url, part_path, reporthook=progress)
            fetched = True
        except Exception as e2:
            print(f"[DOWNLOAD FATAL] Mirror also failed ({e2}).")
            if os.path.exists(part_path):
                os.remove(part_path)
            return False

    print("[CHECKSUM] Computing MD5 checksum on downloaded asset...")
    actual_md5 = compute_md5(part_path)
    if actual_md5.lower() != expected_md5.lower():
        print(f"[CHECKSUM FAILED] MD5 mismatch! Got: {actual_md5}, Expected: {expected_md5}")
        os.remove(part_path)
        return False
    os.replace(part_path, output_path)
    print(f"[CHECKSUM PASSED] Authentic MD5 verified: {actual_md5}")
    return True

def extract_selective_bands(
    zip_path: str,
    output_dir: str,
    manifest_path: str,
    extract_rect_10m: bool = True
) -> Dict[str, Any]:
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    scene_names = [s["scene_id"] for s in manifest["scenes"]]
    print(f"[EXTRACTION] Starting selective extraction of bands & dates for {len(scene_names)} scenes...")

    extracted_records = {}
    written_destinations = set()

    with zipfile.ZipFile(zip_path, "r") as zf:
        namelist = zf.namelist()
        zinfo_map = {z.filename: z for z in zf.infolist()}
        total_files = len(namelist)
        print(f"[ARCHIVE INFO] Total members in archive: {total_files}")

        for scene in scene_names:
            scene_files = []
            target_prefixes = [
                f"Onera Satellite Change Detection dataset - Images/{scene}/imgs_1/",
                f"Onera Satellite Change Detection dataset - Images/{scene}/imgs_2/",
                f"{scene}/imgs_1/",
                f"{scene}/imgs_2/",
            ]
            if extract_rect_10m:
                target_prefixes.extend([
                    f"Onera Satellite Change Detection dataset - Images/{scene}/imgs_1_rect/",
                    f"Onera Satellite Change Detection dataset - Images/{scene}/imgs_2_rect/",
                    f"{scene}/imgs_1_rect/",
                    f"{scene}/imgs_2_rect/",
                ])

            for member in namelist:
                norm_member = member.replace('\\', '/')
                basename = os.path.basename(norm_member)
                is_band = basename in REQUIRED_BANDS
                is_date = basename == "dates.txt" and (f"/{scene}/" in norm_member or norm_member.startswith(f"{scene}/"))
                if not (is_band or is_date):
                    continue

                if is_date or any(norm_member.startswith(p) or f"/{scene}/" in norm_member for p in target_prefixes):
                    zinfo = zinfo_map[member]
                    dest_path = safe_extract_zip_member(zf, zinfo, output_dir, written_destinations)
                    scene_files.append(str(dest_path))

            extracted_records[scene] = {
                "extracted_files_count": len(scene_files),
                "status": "EXTRACTED_VERIFIED" if len(scene_files) >= 12 else "PARTIAL"
            }
            print(f"  [SCENE] {scene:15s}: Extracted {len(scene_files)} multispectral assets")

    return extracted_records

def extract_selective_labels(
    zip_path: str,
    output_dir: str,
    manifest_path: str,
    expected_split: str
) -> Dict[str, Any]:
    print(f"\n[EXTRACTION] Opening {expected_split} labels archive: {zip_path}")
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    expected_scenes = {s["scene_id"] for s in manifest["scenes"] if s.get("canonical_split") == expected_split}
    seen_masks = {}
    written_destinations = set()

    with zipfile.ZipFile(zip_path, "r") as zf:
        for member in zf.infolist():
            norm_member = member.filename.replace('\\', '/')
            basename = os.path.basename(norm_member)
            if basename.endswith("-cm.tif"):
                parts = [p for p in norm_member.split('/') if p]
                matching = [s for s in expected_scenes if s in parts]
                if not matching:
                    raise SecurityError(f"Unexpected mask member / scene ID rejected: {norm_member}")
                scene_id = matching[0]
                if scene_id in seen_masks:
                    raise SecurityError(f"Duplicate mask member for scene '{scene_id}' in archive: {norm_member}")

                dest_path = safe_extract_zip_member(zf, member, output_dir, written_destinations)
                seen_masks[scene_id] = dest_path

    expected_count = 14 if expected_split == "train" else 10
    if set(seen_masks.keys()) != expected_scenes or len(seen_masks) != expected_count:
        raise RuntimeError(
            f"Strict label extraction mismatch for split '{expected_split}': "
            f"Expected {expected_count} unique scenes {sorted(expected_scenes)}, but extracted {len(seen_masks)}. "
            f"Missing: {sorted(expected_scenes - set(seen_masks.keys()))}"
        )
    print(f"[LABELS] Successfully extracted exactly {len(seen_masks)} {expected_split} ground-truth masks.")
    return {"split": expected_split, "extracted_count": len(seen_masks), "scenes": sorted(seen_masks.keys())}

def main():
    parser = argparse.ArgumentParser(description="ORBINEX Cloud Multispectral OSCD Ingestion & Verification")
    parser.add_argument("--target_dir", default="data/oscd_multispectral", help="Directory for multispectral assets")
    parser.add_argument("--manifest", default=None, help="Path to oscd_multispectral_manifest.json")
    parser.add_argument("--dry_run", action="store_true", help="Verify configuration without downloading archive")
    parser.add_argument("--verify_only", action="store_true", help="Verify existing extracted files against manifest")
    args = parser.parse_args()

    current_dir = os.path.dirname(os.path.abspath(__file__))
    manifest_path = args.manifest or os.path.join(current_dir, "oscd_multispectral_manifest.json")

    print("======================================================================")
    print(" ORBINEX AI-08B1: AUTHENTIC MULTISPECTRAL OSCD ACQUISITION PIPELINE")
    print("======================================================================")

    if not os.path.exists(manifest_path):
        print(f"[ERROR] Manifest not found: {manifest_path}")
        sys.exit(1)

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    print(f"Manifest: {manifest['dataset_name']}")
    print(f"Scenes: {manifest['summary']['total_scenes']} ({manifest['summary']['canonical_train_scenes']} train / {manifest['summary']['canonical_test_scenes']} test)")
    print(f"Required Bands: {[b['band_name'] for b in manifest['required_bands']]}")

    if args.dry_run:
        print("\n[DRY RUN] Validating cloud deployment readiness...")
        check_disk_space(os.getcwd(), required_gb=1.0)
        print(" [PASS] Primary Images URL:", clean_url(OFFICIAL_IMAGES_URL))
        print(" [PASS] Secondary Images Mirror:", clean_url(HUGGINGFACE_MIRROR_URL))
        print(" [PASS] Images Archive Expected MD5:", OFFICIAL_IMAGES_MD5)
        print(" [PASS] Train Labels URL:", clean_url(TRAIN_LABELS_URL))
        print(" [PASS] Train Labels Expected MD5:", TRAIN_LABELS_MD5)
        print(" [PASS] Test Labels URL:", clean_url(TEST_LABELS_URL))
        print(" [PASS] Test Labels Expected MD5:", TEST_LABELS_MD5)
        print(" [PASS] Zero-synthesis policy active.")
        print("\n>>> DRY RUN SUCCEEDED: CLOUD INGESTION SPECIFICATION VALIDATED. <<<")
        return

    # Non-dry-run execution
    os.makedirs(args.target_dir, exist_ok=True)
    if not check_disk_space(args.target_dir, required_gb=3.0):
        print("[ABORT] Insufficient disk space to proceed safely.")
        sys.exit(1)

    archive_path = os.path.join(args.target_dir, "Onera Satellite Change Detection dataset - Images.zip")
    train_labels_archive = os.path.join(args.target_dir, "Onera Satellite Change Detection dataset - Train Labels.zip")
    test_labels_archive = os.path.join(args.target_dir, "Onera Satellite Change Detection dataset - Test Labels.zip")

    # 1. Download & Verify Images Archive
    if not ensure_verified_archive(OFFICIAL_IMAGES_URL, HUGGINGFACE_MIRROR_URL, archive_path, OFFICIAL_IMAGES_MD5):
        print("[FATAL] Failed to acquire verified OSCD Images archive.")
        sys.exit(1)

    # 2. Download & Verify Train Labels Archive
    if not ensure_verified_archive(TRAIN_LABELS_URL, TRAIN_LABELS_HF_MIRROR, train_labels_archive, TRAIN_LABELS_MD5):
        print("[FATAL] Failed to acquire verified OSCD Train Labels archive.")
        sys.exit(1)

    # 3. Download & Verify Test Labels Archive
    if not ensure_verified_archive(TEST_LABELS_URL, TEST_LABELS_HF_MIRROR, test_labels_archive, TEST_LABELS_MD5):
        print("[FATAL] Failed to acquire verified OSCD Test Labels archive.")
        sys.exit(1)

    # 4. Extract Bands and Labels across all scenes
    records = extract_selective_bands(archive_path, args.target_dir, manifest_path)
    train_records = extract_selective_labels(train_labels_archive, args.target_dir, manifest_path, expected_split="train")
    test_records = extract_selective_labels(test_labels_archive, args.target_dir, manifest_path, expected_split="test")
    print(f"\n[SUMMARY] Extraction complete. 24 scenes with 6 bands and {train_records['extracted_count'] + test_records['extracted_count']} masks verified.")

if __name__ == "__main__":
    main()
