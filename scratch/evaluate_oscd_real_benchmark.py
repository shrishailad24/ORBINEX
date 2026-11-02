import os, io, json
import pandas as pd
import numpy as np
from PIL import Image

def run_oscd_real_benchmark():
    parquet_path = r'C:\Users\shash\Downloads\osiris-master\osiris-master\.cache\oscd\test_rgb.parquet'
    if not os.path.exists(parquet_path):
        raise FileNotFoundError(f'Parquet not found: {parquet_path}')

    df = pd.read_parquet(parquet_path)
    
    # Map row dimensions to scene names
    scene_dim_map = {
        (426, 353): 'rio',
        (688, 639): 'saclay_w',
        (476, 458): 'valencia',
        (544, 730): 'chongqing',
        (451, 426): 'montpellier',
        (469, 433): 'brasilia',
        (385, 241): 'norcia',
        (634, 774): 'dubai',
        (558, 545): 'milano',
        (716, 824): 'lasvegas'
    }

    test_data = []
    total_benchmark_pixels = 0
    total_ground_truth_changes = 0

    print('=== EXTRACTING REAL OSCD TEST SCENES ===')
    for idx, row in df.iterrows():
        img1 = Image.open(io.BytesIO(row['image1']['bytes'])).convert('RGB')
        img2 = Image.open(io.BytesIO(row['image2']['bytes'])).convert('RGB')
        mask_raw = Image.open(io.BytesIO(row['mask']['bytes']))
        mask_arr = np.array(mask_raw)
        
        # Binary ground truth: in mode 'I' or 'L', change is > 0 (1 or 255)
        gt_binary = (mask_arr > 0).astype(np.uint8)
        
        w, h = img1.size
        scene_name = scene_dim_map.get((w, h), f'scene_{idx}')
        
        arr1 = np.array(img1, dtype=np.float32) / 255.0
        arr2 = np.array(img2, dtype=np.float32) / 255.0
        
        n_pixels = w * h
        n_changes = int(np.count_nonzero(gt_binary))
        total_benchmark_pixels += n_pixels
        total_ground_truth_changes += n_changes
        
        test_data.append({
            'scene_name': scene_name,
            'width': w,
            'height': h,
            'total_pixels': n_pixels,
            'ground_truth_changes': n_changes,
            'change_pct': (n_changes / n_pixels) * 100,
            'arr1': arr1,
            'arr2': arr2,
            'gt': gt_binary
        })
        print(f"Scene: {scene_name:12s} | Size: {w}x{h} ({n_pixels:,} px) | Ground Truth Changes: {n_changes:,} ({n_changes/n_pixels*100:.2f}%)")

    print(f"\nTotal Test Benchmark Pixels: {total_benchmark_pixels:,}")
    print(f"Total Positive Ground Truth Change Pixels: {total_ground_truth_changes:,} ({total_ground_truth_changes/total_benchmark_pixels*100:.2f}%)")

    # -------------------------------------------------------------
    # Evaluate Classical Baselines across Thresholds
    # Baseline 1: Spectral Change Magnitude (L2 Euclidean Distance in RGB)
    # -------------------------------------------------------------
    print('\n=== SWEEPING THRESHOLDS FOR SPECTRAL CHANGE MAGNITUDE BASELINE ===')
    thresholds = [0.10, 0.15, 0.18, 0.20, 0.22, 0.25, 0.28, 0.30, 0.35, 0.40]
    
    best_f1 = 0.0
    best_thresh = 0.0
    sweep_results = []

    for t in thresholds:
        agg_tp = 0
        agg_fp = 0
        agg_fn = 0
        agg_tn = 0

        for item in test_data:
            diff = item['arr2'] - item['arr1']
            # Euclidean magnitude
            mag = np.sqrt(np.sum(diff * diff, axis=2))
            pred = (mag >= t).astype(np.uint8)
            gt = item['gt']

            tp = int(np.count_nonzero((pred == 1) & (gt == 1)))
            fp = int(np.count_nonzero((pred == 1) & (gt == 0)))
            fn = int(np.count_nonzero((pred == 0) & (gt == 1)))
            tn = int(np.count_nonzero((pred == 0) & (gt == 0)))

            agg_tp += tp
            agg_fp += fp
            agg_fn += fn
            agg_tn += tn

        prec = agg_tp / (agg_tp + agg_fp) if (agg_tp + agg_fp) > 0 else 0.0
        rec = agg_tp / (agg_tp + agg_fn) if (agg_tp + agg_fn) > 0 else 0.0
        iou = agg_tp / (agg_tp + agg_fp + agg_fn) if (agg_tp + agg_fp + agg_fn) > 0 else 0.0
        f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0
        far = agg_fp / (agg_fp + agg_tn) if (agg_fp + agg_tn) > 0 else 0.0
        oa = (agg_tp + agg_tn) / total_benchmark_pixels

        sweep_results.append({
            'threshold': t,
            'tp': agg_tp,
            'fp': agg_fp,
            'fn': agg_fn,
            'tn': agg_tn,
            'precision': prec,
            'recall': rec,
            'iou': iou,
            'f1': f1,
            'far': far,
            'oa': oa
        })

        if f1 > best_f1:
            best_f1 = f1
            best_thresh = t

        print(f"Thresh {t:.2f} | IoU: {iou*100:5.2f}% | F1: {f1*100:5.2f}% | Prec: {prec*100:5.2f}% | Rec: {rec*100:5.2f}% | FAR: {far*100:5.2f}% | OA: {oa*100:5.2f}%")

    print(f"\nOptimal Classical Spectral Threshold: {best_thresh:.2f} (Yields F1 = {best_f1*100:.2f}%)")

    # -------------------------------------------------------------
    # Per-Scene Metrics at Optimal Baseline Threshold
    # -------------------------------------------------------------
    print(f"\n=== PER-SCENE METRICS AT OPTIMAL BASELINE (Threshold = {best_thresh:.2f}) ===")
    per_scene_metrics = {}
    print(f"| Scene | Dimensions | GT Changes | TP | FP | FN | Precision | Recall | IoU | F1 Score | FAR | OA |")
    print(f"| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |")

    for item in test_data:
        diff = item['arr2'] - item['arr1']
        mag = np.sqrt(np.sum(diff * diff, axis=2))
        pred = (mag >= best_thresh).astype(np.uint8)
        gt = item['gt']

        tp = int(np.count_nonzero((pred == 1) & (gt == 1)))
        fp = int(np.count_nonzero((pred == 1) & (gt == 0)))
        fn = int(np.count_nonzero((pred == 0) & (gt == 1)))
        tn = int(np.count_nonzero((pred == 0) & (gt == 0)))
        tot = item['total_pixels']

        prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        iou = tp / (tp + fp + fn) if (tp + fp + fn) > 0 else 0.0
        f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0
        far = fp / (fp + tn) if (fp + tn) > 0 else 0.0
        oa = (tp + tn) / tot

        per_scene_metrics[item['scene_name']] = {
            'dimensions': [item['width'], item['height']],
            'total_pixels': tot,
            'ground_truth_changes': item['ground_truth_changes'],
            'tp': tp,
            'fp': fp,
            'fn': fn,
            'tn': tn,
            'precision': round(prec, 4),
            'recall': round(rec, 4),
            'iou': round(iou, 4),
            'f1': round(f1, 4),
            'far': round(far, 4),
            'oa': round(oa, 4)
        }

        print(f"| {item['scene_name']:11s} | {item['width']}x{item['height']} | {item['ground_truth_changes']:,} | {tp:,} | {fp:,} | {fn:,} | {prec*100:5.1f}% | {rec*100:5.1f}% | {iou*100:5.1f}% | {f1*100:5.1f}% | {far*100:4.1f}% | {oa*100:5.1f}% |")

    # -------------------------------------------------------------
    # Comparison against Previously Reported Claims
    # -------------------------------------------------------------
    best_res = [r for r in sweep_results if r['threshold'] == best_thresh][0]
    
    comparison = {
        'timestamp': pd.Timestamp.now().isoformat(),
        'dataset': 'Onera Satellite Change Detection (OSCD) - 10 Real Test Scenes',
        'evaluation_mode': 'AUTHENTIC_GROUND_TRUTH_EVALUATION',
        'reported_claim_vs_reproduced_baseline': {
            'IoU': {
                'previously_reported_in_report': '54.2%',
                'code_synthetic_mock_output': '43.95%',
                'real_ground_truth_classical_baseline': f"{best_res['iou']*100:.2f}%",
                'status': 'DISCREPANCY_IDENTIFIED'
            },
            'F1': {
                'previously_reported_in_report': '70.3%',
                'code_synthetic_mock_output': '61.07%',
                'real_ground_truth_classical_baseline': f"{best_res['f1']*100:.2f}%",
                'status': 'DISCREPANCY_IDENTIFIED'
            },
            'Precision': {
                'previously_reported_in_report': '73.1%',
                'code_synthetic_mock_output': '60.16%',
                'real_ground_truth_classical_baseline': f"{best_res['precision']*100:.2f}%",
                'status': 'DISCREPANCY_IDENTIFIED'
            },
            'Recall': {
                'previously_reported_in_report': '67.7%',
                'code_synthetic_mock_output': '62.00%',
                'real_ground_truth_classical_baseline': f"{best_res['recall']*100:.2f}%",
                'status': 'DISCREPANCY_IDENTIFIED'
            },
            'False_Alarm_Rate': {
                'previously_reported_in_report': '1.8%',
                'code_synthetic_mock_output': '1.80%',
                'real_ground_truth_classical_baseline': f"{best_res['far']*100:.2f}%",
                'status': 'EVALUATED'
            },
            'Overall_Accuracy': {
                'previously_reported_in_report': '94.2%',
                'code_synthetic_mock_output': '96.68%',
                'real_ground_truth_classical_baseline': f"{best_res['oa']*100:.2f}%",
                'status': 'EVALUATED'
            }
        },
        'optimal_threshold': best_thresh,
        'aggregate_confusion_matrix': {
            'tp': best_res['tp'],
            'fp': best_res['fp'],
            'fn': best_res['fn'],
            'tn': best_res['tn'],
            'total_pixels': total_benchmark_pixels
        },
        'per_scene_results': per_scene_metrics,
        'provenance_conclusion': (
            'The previously reported 70.3% F1 and 54.2% IoU did not originate from the codebase '
            'nor from actual OSCD ground-truth evaluation. Code synthetic simulation yielded 61.07% F1, '
            'while real-world pixel evaluation against official OSCD ground truth achieves '
            f"{best_res['f1']*100:.2f}% F1 with an unsupervised spectral baseline."
        )
    }

    out_json = r'C:\Users\shash\Downloads\osiris-master\osiris-master\.cache\oscd\real_oscd_benchmark_results.json'
    with open(out_json, 'w') as f:
        json.dump(comparison, f, indent=2)
    print(f"\nAuthentic benchmark results written to: {out_json}")

if __name__ == '__main__':
    run_oscd_real_benchmark()
