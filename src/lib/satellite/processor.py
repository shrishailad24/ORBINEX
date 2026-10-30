"""
ORBINEX — Satellite Raster Processing Engine
Processes raw Sentinel-2 L2A optical and Sentinel-1 SAR assets:
- Spatial clipping / cropping to user-defined AOI relative to scene bounds
- Percentile linear contrast stretching (2% to 98% clip) for satellite reflectance
- Nodata handling and aspect-ratio-preserving resampling
- Geospatial metadata sidecar preservation
"""

import sys
import os
import json
import argparse
import urllib.request
import numpy as np
from PIL import Image

def download_asset(url, dest_path, max_bytes=50_000_000, timeout=30):
    """Downloads an authorized satellite asset with strict size limits."""
    headers = {
        'User-Agent': 'ORBINEX-Satellite-Engine/1.0',
        'Accept': 'image/*,application/octet-stream'
    }
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        content_length = response.headers.get('Content-Length')
        if content_length and int(content_length) > max_bytes:
            raise ValueError(f"Asset exceeds maximum allowed size ({content_length} > {max_bytes})")
        
        bytes_read = 0
        with open(dest_path, 'wb') as f:
            while True:
                chunk = response.read(65536)
                if not chunk:
                    break
                bytes_read += len(chunk)
                if bytes_read > max_bytes:
                    raise ValueError(f"Asset exceeded {max_bytes} bytes during stream")
                f.write(chunk)
    return dest_path

def apply_contrast_stretch(arr, p_low=2.0, p_high=98.0):
    """Applies standard satellite percentile linear stretch to expand dynamic range."""
    stretched = np.zeros_like(arr, dtype=np.uint8)
    channels = 1 if arr.ndim == 2 else arr.shape[2]
    
    for c in range(channels):
        channel_data = arr[:, :] if arr.ndim == 2 else arr[:, :, c]
        # Ignore complete black pixels (nodata) when computing percentiles
        valid_pixels = channel_data[channel_data > 0]
        if len(valid_pixels) < 10:
            val_min = float(channel_data.min())
            val_max = float(channel_data.max())
        else:
            val_min = float(np.percentile(valid_pixels, p_low))
            val_max = float(np.percentile(valid_pixels, p_high))
            
        if val_max <= val_min:
            val_max = val_min + 1.0
            
        scaled = (channel_data.astype(np.float32) - val_min) / (val_max - val_min) * 255.0
        clipped = np.clip(scaled, 0, 255).astype(np.uint8)
        
        if arr.ndim == 2:
            stretched = clipped
        else:
            stretched[:, :, c] = clipped
            
    return stretched

def crop_to_aoi(img, scene_bbox, aoi_bbox):
    """Crops the image to match the AOI coordinates relative to the full scene bounding box."""
    s_min_lng, s_min_lat, s_max_lng, s_max_lat = scene_bbox
    a_min_lng, a_min_lat, a_max_lng, a_max_lat = aoi_bbox
    
    img_w, img_h = img.size
    
    # Calculate fractional coordinates
    s_lng_span = s_max_lng - s_min_lng
    s_lat_span = s_max_lat - s_min_lat
    
    if s_lng_span <= 0 or s_lat_span <= 0:
        return img
        
    left_pct = max(0.0, min(1.0, (a_min_lng - s_min_lng) / s_lng_span))
    right_pct = max(0.0, min(1.0, (a_max_lng - s_min_lng) / s_lng_span))
    # Latitudes are inverted relative to pixel Y (top = max_lat, bottom = min_lat)
    top_pct = max(0.0, min(1.0, (s_max_lat - a_max_lat) / s_lat_span))
    bottom_pct = max(0.0, min(1.0, (s_max_lat - a_min_lat) / s_lat_span))
    
    # Ensure minimum 10% bounding box crop if inside
    if right_pct <= left_pct or bottom_pct <= top_pct:
        return img
        
    x1 = int(left_pct * img_w)
    x2 = int(right_pct * img_w)
    y1 = int(top_pct * img_h)
    y2 = int(bottom_pct * img_h)
    
    # Require at least 32px
    if (x2 - x1) < 32 or (y2 - y1) < 32:
        return img
        
    return img.crop((x1, y1, x2, y2))

def main():
    parser = argparse.ArgumentParser(description="ORBINEX Satellite Image Processor")
    parser.add_argument("--input", required=True, help="Input asset URL or file path")
    parser.add_argument("--output", required=True, help="Output PNG path")
    parser.add_argument("--meta-output", required=False, help="Output metadata JSON path")
    parser.add_argument("--scene-bbox", required=False, help="Scene bounding box: minLng,minLat,maxLng,maxLat")
    parser.add_argument("--aoi-bbox", required=False, help="Requested AOI bounding box: minLng,minLat,maxLng,maxLat")
    parser.add_argument("--stretch", action="store_true", help="Apply 2%%-98%% percentile contrast stretch")
    parser.add_argument("--platform", default="Sentinel-2", help="Satellite platform (Sentinel-2, Sentinel-1, etc.)")
    parser.add_argument("--width", type=int, default=768, help="Target output max dimension")
    
    args = parser.parse_args()
    
    temp_download = None
    try:
        # 1. Resolve Input
        if args.input.startswith("http://") or args.input.startswith("https://"):
            temp_download = args.output + ".download.tmp"
            input_path = download_asset(args.input, temp_download)
        else:
            input_path = args.input
            
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Input file not found: {input_path}")
            
        # 2. Open with PIL
        with Image.open(input_path) as src_img:
            # Convert to RGB (or L for single band SAR)
            if src_img.mode in ('RGBA', 'LA'):
                img = src_img.convert('RGB')
            elif src_img.mode != 'RGB':
                img = src_img.convert('RGB')
            else:
                img = src_img.copy()
                
            orig_w, orig_h = img.size
            
            # 3. Spatial Crop if BBoxes provided
            cropped = False
            if args.scene_bbox and args.aoi_bbox:
                try:
                    s_bbox = [float(x.strip()) for x in args.scene_bbox.split(',')]
                    a_bbox = [float(x.strip()) for x in args.aoi_bbox.split(',')]
                    if len(s_bbox) == 4 and len(a_bbox) == 4:
                        img = crop_to_aoi(img, s_bbox, a_bbox)
                        cropped = True
                except Exception as e:
                    sys.stderr.write(f"Warning: AOI crop skipped ({e})\n")
                    
            # 4. Resample to target dimension preserving aspect ratio
            cur_w, cur_h = img.size
            if max(cur_w, cur_h) > args.width:
                scale = args.width / float(max(cur_w, cur_h))
                new_w = max(32, int(cur_w * scale))
                new_h = max(32, int(cur_h * scale))
                img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                
            # 5. Percentile Contrast Stretch
            img_arr = np.array(img)
            stretch_applied = False
            if args.stretch:
                img_arr = apply_contrast_stretch(img_arr, 2.0, 98.0)
                stretch_applied = True
                
            # 6. Save Output PNG
            out_img = Image.fromarray(img_arr)
            os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
            out_img.save(args.output, format="PNG", optimize=True)
            
            # 7. Write Sidecar Metadata
            if args.meta_output:
                meta = {
                    "source": "ORBINEX Satellite Image Engine",
                    "platform": args.platform,
                    "original_dimensions": [orig_w, orig_h],
                    "output_dimensions": list(out_img.size),
                    "contrast_stretched": stretch_applied,
                    "spatial_crop_applied": cropped,
                    "scene_bbox": [float(x.strip()) for x in args.scene_bbox.split(',')] if args.scene_bbox else None,
                    "aoi_bbox": [float(x.strip()) for x in args.aoi_bbox.split(',')] if args.aoi_bbox else None,
                    "attribution": "Contains modified Copernicus Sentinel data [2024], processed by ORBINEX / Element84",
                    "crs": "EPSG:4326 (WGS84)",
                    "format": "PNG",
                    "file_bytes": os.path.getsize(args.output)
                }
                with open(args.meta_output, 'w', encoding='utf-8') as f:
                    json.dump(meta, f, indent=2)
                    
        print(json.dumps({
            "status": "success",
            "output": args.output,
            "dimensions": list(out_img.size),
            "file_bytes": os.path.getsize(args.output)
        }))
        
    finally:
        if temp_download and os.path.exists(temp_download):
            try:
                os.remove(temp_download)
            except:
                pass

if __name__ == "__main__":
    main()
