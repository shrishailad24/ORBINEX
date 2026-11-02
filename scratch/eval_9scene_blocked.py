import json

with open(r'C:\Users\shash\Downloads\osiris-master\osiris-master\.cache\oscd\oscd_final_integrity_audit_results.json') as f:
    d = json.load(f)

per_scene = d['unbiased_per_scene_test']

agg_9 = {'tp': 0, 'fp': 0, 'fn': 0, 'tn': 0}
for scene, m in per_scene.items():
    if scene == 'saclay_w':
        continue
    agg_9['tp'] += m['tp']
    agg_9['fp'] += m['fp']
    agg_9['fn'] += m['fn']
    agg_9['tn'] += m['tn']

tot = sum(agg_9.values())
prec = agg_9['tp'] / (agg_9['tp'] + agg_9['fp'])
rec = agg_9['tp'] / (agg_9['tp'] + agg_9['fn'])
iou = agg_9['tp'] / (agg_9['tp'] + agg_9['fp'] + agg_9['fn'])
f1 = (2 * prec * rec) / (prec + rec)
far = agg_9['fp'] / (agg_9['fp'] + agg_9['tn'])
oa = (agg_9['tp'] + agg_9['tn']) / tot

print('=== 9-SCENE SPATIALLY INDEPENDENT TEST METRICS (WITHOUT SACLAY_W) ===')
print(f'Total Pixels: {tot:,}')
print(f'F1 Score    : {f1*100:.2f}%')
print(f'IoU         : {iou*100:.2f}%')
print(f'Precision   : {prec*100:.2f}%')
print(f'Recall      : {rec*100:.2f}%')
print(f'FAR         : {far*100:.2f}%')
print(f'OA          : {oa*100:.2f}%')
print(f'Confusion   : TP={agg_9["tp"]:,}, FP={agg_9["fp"]:,}, FN={agg_9["fn"]:,}, TN={agg_9["tn"]:,}')
