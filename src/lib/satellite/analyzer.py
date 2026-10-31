"""
ORBINEX — Automated Satellite Multi-Temporal Change Analyzer
Analyzes two georeferenced satellite scenes (BEFORE and AFTER) over the same AOI:
- Computes visible spectral proxies for Vegetation (NDVI proxy), Water (NDWI proxy), and Built-Up/Soil Disturbance
- Generates a change classification mask and spatial delta heatmap PNG
- Calculates real area change statistics in km² and percentage of AOI
- Distinguishes physical spectral changes from interpretive observations
"""

import sys
import os
import json
import argparse
import urllib.request
import numpy as np
from PIL import Image

def download_or_load(path_or_url, temp_dir):
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        fname = f"asset_{abs(hash(path_or_url))}.tmp"
        dest = os.path.join(temp_dir, fname)
        if not os.path.exists(dest):
            headers = {'User-Agent': 'ORBINEX-Satellite-Analyzer/1.0'}
            req = urllib.request.Request(path_or_url, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as resp, open(dest, 'wb') as f:
                f.write(resp.read())
        return dest
    return path_or_url

def analyze_changes(before_img, after_img, total_area_km2=100.0, before_date=None, after_date=None):
    # Ensure matching dimensions
    w = min(before_img.width, after_img.width)
    h = min(before_img.height, after_img.height)
    if w < 32 or h < 32:
        w = max(32, w)
        h = max(32, h)
        
    b_resized = before_img.resize((w, h), Image.Resampling.LANCZOS)
    a_resized = after_img.resize((w, h), Image.Resampling.LANCZOS)
    
    b_arr = np.array(b_resized, dtype=np.float32)
    a_arr = np.array(a_resized, dtype=np.float32)
    
    # Extract R, G, B channels and Alpha if present
    if b_arr.ndim == 2:
        b_r = b_g = b_b = b_arr
        b_alpha = np.full((h, w), 255.0, dtype=np.float32)
    elif b_arr.shape[2] >= 4:
        b_r, b_g, b_b, b_alpha = b_arr[:, :, 0], b_arr[:, :, 1], b_arr[:, :, 2], b_arr[:, :, 3]
    else:
        b_r, b_g, b_b = b_arr[:, :, 0], b_arr[:, :, 1], b_arr[:, :, 2]
        b_alpha = np.full((h, w), 255.0, dtype=np.float32)
        
    if a_arr.ndim == 2:
        a_r = a_g = a_b = a_arr
        a_alpha = np.full((h, w), 255.0, dtype=np.float32)
    elif a_arr.shape[2] >= 4:
        a_r, a_g, a_b, a_alpha = a_arr[:, :, 0], a_arr[:, :, 1], a_arr[:, :, 2], a_arr[:, :, 3]
    else:
        a_r, a_g, a_b = a_arr[:, :, 0], a_arr[:, :, 1], a_arr[:, :, 2]
        a_alpha = np.full((h, w), 255.0, dtype=np.float32)
        
    # Mask valid (non-black, non-saturated, non-transparent nodata) pixels
    b_valid = (b_alpha > 20) & ((b_r + b_g + b_b) > 15) & ((b_r + b_g + b_b) < 755)
    a_valid = (a_alpha > 20) & ((a_r + a_g + a_b) > 15) & ((a_r + a_g + a_b) < 755)
    valid_mask = b_valid & a_valid

    total_valid_pixels = int(np.sum(valid_mask))
    total_area_pixels = w * h
    valid_overlap_pct = round((float(total_valid_pixels) / float(total_area_pixels)) * 100.0, 2)

    # Check for insufficient valid pixel coverage (e.g. swath boundary or nodata void)
    if valid_overlap_pct < 25.0:
        return {
            "status": "warning",
            "aoi_area_km2": round(total_area_km2, 2),
            "valid_overlap_pct": valid_overlap_pct,
            "total_change_pct": 0.0,
            "changed_area_km2": 0.0,
            "metrics": {
                "vegetation_loss_pct": 0.0,
                "vegetation_loss_km2": 0.0,
                "vegetation_gain_pct": 0.0,
                "vegetation_gain_km2": 0.0,
                "water_shift_pct": 0.0,
                "water_shift_km2": 0.0,
                "builtup_disturbance_pct": 0.0,
                "builtup_disturbance_km2": 0.0
            },
            "summary": f"Insufficient overlapping surface imagery ({valid_overlap_pct}% valid pixels). Observation passes intersect satellite swath boundary or cloud/nodata void.",
            "findings": [
                f"Valid surface pixel overlap is only {valid_overlap_pct}% of the requested AOI.",
                "Acquisitions contain large unobserved swath margins (nodata). Comparison requires overlapping cloud-free coverage."
            ],
            "confidence_pct": 0,
            "limitations": "Analysis aborted due to insufficient valid observation overlap across satellite passes."
        }, Image.fromarray(np.zeros((h, w, 4), dtype=np.uint8), mode='RGBA')

    # 1. Vegetation Index Proxy: (G - R) / (G + R + eps)
    eps = 1e-4
    b_veg = (b_g - b_r) / (b_g + b_r + eps)
    a_veg = (a_g - a_r) / (a_g + a_r + eps)
    d_veg = a_veg - b_veg
    
    # 2. Water / Moisture Index Proxy: (G - B) / (G + B + eps)
    b_wat = (b_g - b_b) / (b_g + b_b + eps)
    a_wat = (a_g - a_b) / (a_g + a_b + eps)
    d_wat = a_wat - b_wat
    
    # 3. Brightness / Built-up ground disturbance: (R + G + B) / 3
    b_bri = (b_r + b_g + b_b) / 3.0
    a_bri = (a_r + a_g + a_b) / 3.0
    d_bri = a_bri - b_bri
    
    # Significant change thresholds
    veg_loss_mask = valid_mask & ((d_veg < -0.06) | ((d_veg < -0.03) & (d_bri > 12)))
    veg_gain_mask = valid_mask & (d_veg > 0.07)
    water_gain_mask = valid_mask & (d_wat > 0.12) & (a_bri < 130)
    water_loss_mask = valid_mask & (d_wat < -0.12) & (b_bri < 130)
    urban_expansion_mask = valid_mask & ((d_bri > 18) | (np.abs(d_bri) > 28)) & ~veg_loss_mask

    # Calculate pixel counts and percentages
    veg_loss_count = int(np.sum(veg_loss_mask))
    veg_gain_count = int(np.sum(veg_gain_mask))
    water_gain_count = int(np.sum(water_gain_mask))
    water_loss_count = int(np.sum(water_loss_mask))
    urban_count = int(np.sum(urban_expansion_mask))

    veg_loss_pct = round((veg_loss_count / total_valid_pixels) * 100, 2)
    veg_gain_pct = round((veg_gain_count / total_valid_pixels) * 100, 2)
    water_change_pct = round(((water_gain_count - water_loss_count) / total_valid_pixels) * 100, 2)
    urban_pct = round((urban_count / total_valid_pixels) * 100, 2)

    total_changed_pixels = np.sum(veg_loss_mask | veg_gain_mask | water_gain_mask | water_loss_mask | urban_expansion_mask)
    total_change_pct = round(min(100.0, (float(total_changed_pixels) / total_valid_pixels) * 100), 2)
    changed_area_km2 = round((total_change_pct / 100.0) * total_area_km2, 2)

    # Check for identical passes or zero inter-temporal variance
    mean_abs_diff = float(np.mean(np.abs(a_arr[valid_mask] - b_arr[valid_mask]))) if total_valid_pixels > 0 else 0.0
    is_identical_pass = mean_abs_diff < 0.8 or total_changed_pixels == 0

    # Temporal context parsing
    temporal_gap_days = None
    seasonal_offset_months = None
    temporal_notes = []
    if before_date and after_date:
        try:
            import datetime
            b_dt = datetime.datetime.fromisoformat(before_date.split('T')[0])
            a_dt = datetime.datetime.fromisoformat(after_date.split('T')[0])
            temporal_gap_days = abs((a_dt - b_dt).days)
            b_m = b_dt.month
            a_m = a_dt.month
            seasonal_offset_months = min(abs(a_m - b_m), 12 - abs(a_m - b_m))
            
            if temporal_gap_days > 1095:
                years = round(temporal_gap_days / 365.25, 1)
                temporal_notes.append(f"Extended multi-year baseline ({years} years / {temporal_gap_days} days). Gradual ecological succession and long-term land use shifts may contribute to variance.")
            if seasonal_offset_months >= 3:
                temporal_notes.append(f"Seasonal phenological divergence ({seasonal_offset_months} months offset: Month {b_m} vs Month {a_m}). Vegetative changes may reflect cyclical monsoon/dry season flushes rather than permanent clearance.")
        except Exception:
            pass

    # Generate Heatmap RGBA Image
    gray_base = np.dot(a_arr[...,:3], [0.2989, 0.5870, 0.1140]).astype(np.uint8)
    heatmap_rgba = np.zeros((h, w, 4), dtype=np.uint8)
    heatmap_rgba[:, :, 0] = gray_base // 2
    heatmap_rgba[:, :, 1] = gray_base // 2
    heatmap_rgba[:, :, 2] = gray_base // 2
    heatmap_rgba[:, :, 3] = np.where(valid_mask, 200, 0).astype(np.uint8)

    # Color highlights:
    heatmap_rgba[veg_loss_mask] = [239, 68, 68, 240]
    heatmap_rgba[veg_gain_mask] = [34, 197, 94, 240]
    heatmap_rgba[water_gain_mask] = [6, 182, 212, 240]
    heatmap_rgba[urban_expansion_mask] = [245, 158, 11, 240]

    heatmap_img = Image.fromarray(heatmap_rgba, mode='RGBA')

    # Generate Findings Summary
    findings = []
    if is_identical_pass:
        findings.append("Both observation passes resolved to identical imagery or zero inter-temporal variance. Select distinct cloud-free target dates to measure surface change.")
        confidence_pct = 0
    else:
        if veg_loss_pct > 1.0:
            findings.append(f"Vegetation reduction/clearing detected across {round(veg_loss_pct * total_area_km2 / 100, 2)} km² ({veg_loss_pct}% of AOI)")
        if veg_gain_pct > 1.0:
            findings.append(f"Vegetative regrowth/greening observed across {round(veg_gain_pct * total_area_km2 / 100, 2)} km² ({veg_gain_pct}% of AOI)")
        if abs(water_change_pct) > 0.8:
            shift_word = "expansion" if water_change_pct > 0 else "retreat"
            findings.append(f"Surface water {shift_word} identified across {abs(round(water_change_pct * total_area_km2 / 100, 2))} km² ({abs(water_change_pct)}% of AOI)")
        if urban_pct > 0.8:
            findings.append(f"Surface disturbance / built-up expansion identified across {round(urban_pct * total_area_km2 / 100, 2)} km² ({urban_pct}% of AOI)")
            
        if not findings:
            findings.append("No major morphological disturbances detected between observation passes (stable surface envelope).")
        
        base_confidence = 92 if total_change_pct < 50 else 78
        if valid_overlap_pct < 80.0:
            base_confidence = int(base_confidence * (valid_overlap_pct / 100.0))
        if seasonal_offset_months and seasonal_offset_months >= 4:
            base_confidence = max(40, base_confidence - 15)
        confidence_pct = base_confidence

    if temporal_notes:
        findings.extend(temporal_notes)

    summary = "; ".join(findings[:2])

    return {
        "status": "warning" if (is_identical_pass or valid_overlap_pct < 70) else "success",
        "aoi_area_km2": round(total_area_km2, 2),
        "valid_overlap_pct": valid_overlap_pct,
        "temporal_gap_days": temporal_gap_days,
        "seasonal_offset_months": seasonal_offset_months,
        "total_change_pct": total_change_pct,
        "changed_area_km2": changed_area_km2,
        "metrics": {
            "vegetation_loss_pct": veg_loss_pct,
            "vegetation_loss_km2": round(veg_loss_pct * total_area_km2 / 100, 2),
            "vegetation_gain_pct": veg_gain_pct,
            "vegetation_gain_km2": round(veg_gain_pct * total_area_km2 / 100, 2),
            "water_shift_pct": water_change_pct,
            "water_shift_km2": round(water_change_pct * total_area_km2 / 100, 2),
            "builtup_disturbance_pct": urban_pct,
            "builtup_disturbance_km2": round(urban_pct * total_area_km2 / 100, 2)
        },
        "summary": summary,
        "findings": findings,
        "confidence_pct": confidence_pct,
        "limitations": "Spectral proxy indices calculated from visible satellite bands. Meteorological illumination, swath boundary nodata, and seasonal phenology may contribute to residual variance."
    }, heatmap_img

def main():
    parser = argparse.ArgumentParser(description="ORBINEX Satellite Multi-Temporal Change Analyzer")
    parser.add_argument("--before", required=True, help="Before observation image path or URL")
    parser.add_argument("--after", required=True, help="After observation image path or URL")
    parser.add_argument("--output-json", required=True, help="Output JSON path for analysis metrics")
    parser.add_argument("--output-heatmap", required=False, help="Output PNG path for change heatmap")
    parser.add_argument("--area-km2", type=float, default=100.0, help="Total AOI area in km²")
    parser.add_argument("--before-date", required=False, help="Before observation acquisition date")
    parser.add_argument("--after-date", required=False, help="After observation acquisition date")
    args = parser.parse_args()

    temp_dir = os.path.join(os.path.dirname(os.path.abspath(args.output_json)), ".tmp_analysis")
    os.makedirs(temp_dir, exist_ok=True)

    try:
        b_path = download_or_load(args.before, temp_dir)
        a_path = download_or_load(args.after, temp_dir)

        with Image.open(b_path) as b_raw, Image.open(a_path) as a_raw:
            # Preserve RGBA if present, otherwise RGB
            b_img = b_raw.convert('RGBA') if b_raw.mode in ('RGBA', 'LA') else b_raw.convert('RGB')
            a_img = a_raw.convert('RGBA') if a_raw.mode in ('RGBA', 'LA') else a_raw.convert('RGB')
            report, heatmap = analyze_changes(b_img, a_img, args.area_km2, args.before_date, args.after_date)

            with open(args.output_json, 'w', encoding='utf-8') as f:
                json.dump(report, f, indent=2)

            if args.output_heatmap:
                os.makedirs(os.path.dirname(os.path.abspath(args.output_heatmap)), exist_ok=True)
                heatmap.save(args.output_heatmap, format='PNG')
                report["heatmap_path"] = args.output_heatmap

        print(json.dumps(report))
    finally:
        pass

if __name__ == "__main__":
    main()
