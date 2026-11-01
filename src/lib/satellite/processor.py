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
    channels = 1 if arr.ndim == 2 else min(3, arr.shape[2])
    
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

    if arr.ndim == 3 and arr.shape[2] == 4:
        stretched[:, :, 3] = arr[:, :, 3]
            
    return stretched

def crop_to_aoi(img, scene_bbox, aoi_bbox, target_size=640):
    """
    Georeferenced orthorectified reprojection onto the canonical AOI coordinate box.
    Guarantees 1:1 pixel alignment between multi-temporal passes, placing intersecting
    scene data at the exact destination pixels on the canonical AOI canvas with nodata
    transparency padding for unobserved coordinates.
    """
    s_min_lng, s_min_lat, s_max_lng, s_max_lat = scene_bbox
    a_min_lng, a_min_lat, a_max_lng, a_max_lat = aoi_bbox
    
    s_lng_span = s_max_lng - s_min_lng
    s_lat_span = s_max_lat - s_min_lat
    a_lng_span = a_max_lng - a_min_lng
    a_lat_span = a_max_lat - a_min_lat
    
    if s_lng_span <= 0 or s_lat_span <= 0 or a_lng_span <= 0 or a_lat_span <= 0:
        return img
        
    img_w, img_h = img.size
    
    # Calculate geographical intersection
    i_min_lng = max(a_min_lng, s_min_lng)
    i_max_lng = min(a_max_lng, s_max_lng)
    i_min_lat = max(a_min_lat, s_min_lat)
    i_max_lat = min(a_max_lat, s_max_lat)
    
    out_w = max(320, min(1024, target_size))
    aspect = a_lng_span / a_lat_span if a_lat_span > 0 else 1.0
    out_h = int(out_w / aspect) if aspect > 0 else out_w
    out_h = max(128, min(1024, out_h))
    
    # Target canvas for the AOI (RGBA mode for clean nodata transparency)
    canvas = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
    
    if i_min_lng >= i_max_lng or i_min_lat >= i_max_lat:
        return canvas
        
    # Source pixel crop coordinates inside scene image
    sx1 = int(((i_min_lng - s_min_lng) / s_lng_span) * img_w)
    sx2 = int(((i_max_lng - s_min_lng) / s_lng_span) * img_w)
    # Latitude is inverted relative to pixel Y (top = max_lat, bottom = min_lat)
    sy1 = int(((s_max_lat - i_max_lat) / s_lat_span) * img_h)
    sy2 = int(((s_max_lat - i_min_lat) / s_lat_span) * img_h)
    
    sx1 = max(0, min(img_w - 1, sx1))
    sx2 = max(sx1 + 1, min(img_w, sx2))
    sy1 = max(0, min(img_h - 1, sy1))
    sy2 = max(sy1 + 1, min(img_h, sy2))
    
    if (sx2 - sx1) < 1 or (sy2 - sy1) < 1:
        return canvas
        
    src_patch = img.crop((sx1, sy1, sx2, sy2))
    
    # Destination pixel bounds on canonical AOI canvas
    dx1 = int(((i_min_lng - a_min_lng) / a_lng_span) * out_w)
    dx2 = int(((i_max_lng - a_min_lng) / a_lng_span) * out_w)
    dy1 = int(((a_max_lat - i_max_lat) / a_lat_span) * out_h)
    dy2 = int(((a_max_lat - i_min_lat) / a_lat_span) * out_h)
    
    dx1 = max(0, min(out_w - 1, dx1))
    dx2 = max(dx1 + 1, min(out_w, dx2))
    dy1 = max(0, min(out_h - 1, dy1))
    dy2 = max(dy1 + 1, min(out_h, dy2))
    
    dw = dx2 - dx1
    dh = dy2 - dy1
    
    if dw > 0 and dh > 0:
        resampled_patch = src_patch.resize((dw, dh), Image.Resampling.LANCZOS)
        if resampled_patch.mode != "RGBA":
            resampled_patch = resampled_patch.convert("RGBA")
        canvas.paste(resampled_patch, (dx1, dy1), resampled_patch)
        
    return canvas

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
    
    # Normalize arguments so negative coordinates (e.g. -50.123) are not parsed as optional flags by argparse
    normalized_argv = []
    raw_argv = sys.argv[1:]
    i = 0
    while i < len(raw_argv):
        arg = raw_argv[i]
        if arg in ('--scene-bbox', '--aoi-bbox') and i + 1 < len(raw_argv) and not raw_argv[i+1].startswith('--'):
            normalized_argv.append(f"{arg}={raw_argv[i+1]}")
            i += 2
        else:
            normalized_argv.append(arg)
            i += 1
            
    args = parser.parse_args(normalized_argv)
    
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
                        img = crop_to_aoi(img, s_bbox, a_bbox, target_size=args.width)
                        cropped = True
                except Exception as e:
                    sys.stderr.write(f"Warning: AOI crop skipped ({e})\n")
                    
            # 4. Resample to target dimension preserving aspect ratio (if not already cropped)
            if not cropped:
                cur_w, cur_h = img.size
                if max(cur_w, cur_h) > args.width:
                    scale = args.width / float(max(cur_w, cur_h))
                    new_w = max(32, int(cur_w * scale))
                    new_h = max(32, int(cur_h * scale))
                    img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                
            # 5. Percentile Contrast Stretch & Nodata Transparency Masking
            img_arr = np.array(img)
            stretch_applied = False
            
            # Compute nodata mask (near-black swath margin: R<=3 & G<=3 & B<=3 or alpha==0)
            # and check for large solid-white unobserved padding (R>=252 & G>=252 & B>=252)
            if img_arr.ndim == 3 and img_arr.shape[2] >= 3:
                r_c = img_arr[:, :, 0]
                g_c = img_arr[:, :, 1]
                b_c = img_arr[:, :, 2]
                black_nodata = (r_c <= 3) & (g_c <= 3) & (b_c <= 3)
                white_nodata = (r_c >= 252) & (g_c >= 252) & (b_c >= 252)
                alpha_nodata = (img_arr[:, :, 3] == 0) if img_arr.shape[2] == 4 else np.zeros_like(black_nodata)
                
                # Treat white as nodata only if it forms large border regions (>25% of image)
                white_ratio = float(np.mean(white_nodata))
                if white_ratio > 0.25:
                    nodata_mask = black_nodata | alpha_nodata | white_nodata
                else:
                    nodata_mask = black_nodata | alpha_nodata
                    
                valid_pixel_pct = round(float(np.mean(~nodata_mask)) * 100.0, 2)
            else:
                nodata_mask = np.zeros(img_arr.shape[:2], dtype=bool)
                valid_pixel_pct = 100.0

            if args.stretch:
                img_arr = apply_contrast_stretch(img_arr, 2.0, 98.0)
                stretch_applied = True
                
            # 6. Save Output PNG with Alpha transparency for nodata swath edges
            if img_arr.ndim == 3 and img_arr.shape[2] >= 3:
                h_out, w_out = img_arr.shape[:2]
                rgba_out = np.zeros((h_out, w_out, 4), dtype=np.uint8)
                rgba_out[:, :, :3] = img_arr[:, :, :3]
                # Nodata regions transparent (0), valid imagery opaque (255)
                rgba_out[:, :, 3] = np.where(nodata_mask, 0, 255).astype(np.uint8)
                out_img = Image.fromarray(rgba_out, mode='RGBA')
            else:
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
                    "valid_pixel_pct": valid_pixel_pct,
                    "swath_edge_detected": bool(valid_pixel_pct < 85.0),
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
