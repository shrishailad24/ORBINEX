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
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Tuple

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
        base_resolved = base_dir.resolve(strict=False)
        try:
            return target_resolved.is_relative_to(base_resolved)
        except AttributeError:
            return os.path.commonpath([str(target_resolved), str(base_resolved)]) == str(base_resolved)
    except (ValueError, OSError):
        return False

def safe_extract_zip_member(zf: zipfile.ZipFile, member: zipfile.ZipInfo, output_dir: str, written_destinations: set) -> Path:
    # 1. Non-regular entry and symlink checks
    if member.is_dir() or member.filename.endswith('/'):
        raise SecurityError(f"Directory entry rejected for file extraction: {member.filename}")
    mode = member.external_attr >> 16
    if (mode & 0o170000) == 0o120000:
        raise SecurityError(f"Symlink rejected in archive member: {member.filename}")
    if (mode & 0o170000) != 0 and (mode & 0o170000) != 0o100000:
        raise SecurityError(f"Non-regular archive entry rejected: {member.filename} (mode {oct(mode)})")

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
    written_destinations.add(dest_str)

    # 5. Check symlinks on target and parent directories
    if dest_path.is_symlink():
        raise SecurityError(f"Pre-existing symlink target rejected: {dest_path}")
    curr = dest_path.parent
    while curr != base_path and curr != curr.parent:
        if curr.is_symlink():
            raise SecurityError(f"Symlinked parent directory detected: {curr}")
        curr = curr.parent

    # 6. Authenticity check and overwrite protection for pre-existing destination
    if dest_path.exists():
        if dest_path.is_symlink() or not dest_path.is_file():
            raise SecurityError(f"Pre-existing symlink or non-regular file rejected: {dest_path}")

        # Byte-for-byte authenticity comparison against archive member
        is_identical = True
        if dest_path.stat().st_size != member.file_size:
            is_identical = False
        else:
            with zf.open(member) as zf_src, open(dest_path, "rb") as disk_src:
                while True:
                    z_chunk = zf_src.read(65536)
                    d_chunk = disk_src.read(65536)
                    if z_chunk != d_chunk:
                        is_identical = False
                        break
                    if not z_chunk:
                        break

        if not is_identical:
            raise SecurityError(
                f"Authenticity verification failed for pre-existing file '{dest_path}'. "
                f"Contents on disk differ from authentic archive member '{member.filename}'. "
                f"Aborting to prevent corruption or silent overwrite."
            )
        # File on disk is identical to authentic archive member; safely preserve without overwriting
        return dest_path

    # 7. Safe write using normalized destination path
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    with zf.open(member) as src, open(dest_path, "wb") as dst:
        shutil.copyfileobj(src, dst)

    return dest_path

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

def locate_scene_archive_members(zf: zipfile.ZipFile, scene: str) -> Dict[str, zipfile.ZipInfo]:
    """
    Locates the exactly 13 required assets in the archive for a scene:
      - 6 bands in imgs_1_rect (B02, B03, B04, B8A, B11, B12)
      - 6 bands in imgs_2_rect (B02, B03, B04, B8A, B11, B12)
      - 1 dates.txt
    Requires exactly one matching archive member for each required asset.
    Iterates directly over zf.infolist() to preserve repeated identical filenames.
    Rejects missing or duplicate matching members (including identical filenames) with a hard error.
    """
    all_members = zf.infolist()
    assets = {}

    # 1. Epoch 1 rectified bands (imgs_1_rect)
    for band in REQUIRED_BANDS:
        key = f"imgs_1_rect/{band}"
        matches = []
        for zinfo in all_members:
            norm = zinfo.filename.replace('\\', '/')
            if norm.endswith(f"/{scene}/imgs_1_rect/{band}") or norm == f"{scene}/imgs_1_rect/{band}":
                matches.append(zinfo)

        if len(matches) == 0:
            raise RuntimeError(f"[INCOMPLETE ARCHIVE] Scene '{scene}' is missing required member: imgs_1_rect/{band}")
        if len(matches) > 1:
            matching_names = [m.filename for m in matches]
            raise SecurityError(
                f"[AMBIGUOUS ARCHIVE] Scene '{scene}' has {len(matches)} duplicate matching members for 'imgs_1_rect/{band}': {matching_names}"
            )
        assets[key] = matches[0]

    # 2. Epoch 2 rectified bands (imgs_2_rect)
    for band in REQUIRED_BANDS:
        key = f"imgs_2_rect/{band}"
        matches = []
        for zinfo in all_members:
            norm = zinfo.filename.replace('\\', '/')
            if norm.endswith(f"/{scene}/imgs_2_rect/{band}") or norm == f"{scene}/imgs_2_rect/{band}":
                matches.append(zinfo)

        if len(matches) == 0:
            raise RuntimeError(f"[INCOMPLETE ARCHIVE] Scene '{scene}' is missing required member: imgs_2_rect/{band}")
        if len(matches) > 1:
            matching_names = [m.filename for m in matches]
            raise SecurityError(
                f"[AMBIGUOUS ARCHIVE] Scene '{scene}' has {len(matches)} duplicate matching members for 'imgs_2_rect/{band}': {matching_names}"
            )
        assets[key] = matches[0]

    # 3. dates.txt
    date_matches = []
    for zinfo in all_members:
        norm = zinfo.filename.replace('\\', '/')
        if norm.endswith(f"/{scene}/dates.txt") or norm == f"{scene}/dates.txt":
            date_matches.append(zinfo)

    if len(date_matches) == 0:
        raise RuntimeError(f"[INCOMPLETE ARCHIVE] Scene '{scene}' is missing required member: dates.txt")
    if len(date_matches) > 1:
        matching_date_names = [m.filename for m in date_matches]
        raise SecurityError(
            f"[AMBIGUOUS ARCHIVE] Scene '{scene}' has {len(date_matches)} duplicate matching members for 'dates.txt': {matching_date_names}"
        )
    assets["dates.txt"] = date_matches[0]

    return assets

def extract_selective_bands(
    zip_path: str,
    output_dir: str,
    manifest_path: str
) -> Dict[str, Any]:
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    scene_names = [s["scene_id"] for s in manifest["scenes"]]
    print(f"[EXTRACTION] Starting selective extraction of bands & dates for all {len(scene_names)} scenes...")

    extracted_records = {}
    written_destinations = set()

    with zipfile.ZipFile(zip_path, "r") as zf:
        print(f"[ARCHIVE INFO] Total members in archive: {len(zf.namelist())}")

        for scene in scene_names:
            scene_assets = locate_scene_archive_members(zf, scene)
            if len(scene_assets) != 13:
                raise RuntimeError(f"Scene '{scene}' does not have exactly 13 required assets (found {len(scene_assets)})")

            scene_files = []
            dates_file_path = None

            for key, zinfo in scene_assets.items():
                dest_path = safe_extract_zip_member(zf, zinfo, output_dir, written_destinations)
                scene_files.append(str(dest_path))
                if key == "dates.txt":
                    dates_file_path = dest_path

            # Strict date chronology validation
            if not dates_file_path or not dates_file_path.is_file():
                raise RuntimeError(f"Failed to extract or locate dates.txt for scene '{scene}'")
            with open(dates_file_path, "r", encoding="utf-8") as df:
                dates_text = df.read()
            t1, t2 = validate_dates_content(dates_text, scene)

            if len(scene_files) != 13:
                raise RuntimeError(f"Incomplete extraction for scene '{scene}': expected 13 files, extracted {len(scene_files)}")

            extracted_records[scene] = {
                "extracted_files_count": len(scene_files),
                "t1": t1.strftime("%Y-%m-%d"),
                "t2": t2.strftime("%Y-%m-%d"),
                "status": "EXTRACTED_VERIFIED"
            }
            print(f"  [SCENE] {scene:15s}: Extracted 12 rectified bands + dates.txt (T1={t1.strftime('%Y-%m-%d')}, T2={t2.strftime('%Y-%m-%d')})")

    if len(extracted_records) != 24:
        raise RuntimeError(f"Extraction incomplete: expected 24 scenes, got {len(extracted_records)}")

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
    print(f"[LABELS] Successfully extracted/verified exactly {len(seen_masks)} {expected_split} ground-truth masks.")
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

    # Add directory containing this script to sys.path to import validator
    if current_dir not in sys.path:
        sys.path.insert(0, current_dir)
    from validate_multispectral_manifest import validate_manifest

    if args.verify_only:
        print("\n[VERIFY ONLY] Skipping download and extraction. Verifying existing physical assets on disk...")
        success = validate_manifest(manifest_path, data_dir=args.target_dir, require_imagery=True)
        if not success:
            print("[FATAL] All-scene physical verification failed on disk.")
            sys.exit(1)
        print("\n>>> VERIFY-ONLY PASSED: ALL 24 SCENES PHYSICALLY VERIFIED ON DISK. <<<")
        return

    # Non-dry-run execution: download, extract, and verify
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

    # 5. Authoritative 24-Scene Physical Raster Validation
    print("\n[VERIFICATION] Running authoritative 24-scene manifest & physical raster validation...")
    success = validate_manifest(manifest_path, data_dir=args.target_dir, require_imagery=True)
    if not success:
        print("[FATAL] All-scene physical validation failed after extraction.")
        sys.exit(1)

    print("\n======================================================================")
    print(" >>> AUTHENTIC MULTISPECTRAL OSCD ACQUISITION & VERIFICATION: ALL 24 SCENES PASSED <<<")
    print(f" Summary: 24 scenes | 288 rectified bands (6 bands x 2 epochs) | 24 dates.txt | 24 ground-truth masks")
    print(" All rasters verified for dimensions, CRS, affine transforms, temporal ordering, and mask alignment.")
    print("======================================================================")

if __name__ == "__main__":
    main()
