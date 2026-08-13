# Blood cell detection with YOLO26

Object detection of red blood cells, white blood cells and platelets in
peripheral blood smear images, with a web interface for counting and
threshold exploration.

**Research and educational use only. Not a diagnostic device.**

![Detection result](reports/figures/ui_detection.png)

## What it does

The model detects three cell types in a stained blood smear and reports
per-class counts, the RBC/WBC ratio and confidence statistics. The interface
has four tabs: single image analysis, batch processing with CSV export,
an out-of-scope demonstration, and a model card.

| Class | Meaning | Appearance |
|---|---|---|
| RBC | Erythrocyte | Ring-shaped, dominant by count |
| WBC | Leukocyte | Large, dark purple nucleus |
| Platelets | Thrombocyte | Small, dark specks |

## Results

Final model: YOLO26s, 9.5M parameters, 640px input, trained for 135 epochs
with early stopping at epoch 95.

**Test set (36 images, 471 boxes)**

| Class | Precision | Recall | mAP50 | mAP50-95 |
|---|---|---|---|---|
| Platelets | 0.687 | 0.861 | 0.755 | 0.392 |
| RBC | 0.657 | 0.879 | 0.866 | 0.636 |
| WBC | 0.957 | 0.919 | 0.968 | 0.787 |
| **Overall** | **0.767** | **0.886** | **0.863** | **0.605** |

Validation set reaches mAP50 0.928 and mAP50-95 0.650. The test set is small
(36 images, only 36 platelet instances), so per-class test numbers carry
noticeable variance.

## Experiments

Three hypotheses were tested. Two failed, which turned out to be the more
informative outcome.

| Run | Model | imgsz | Augmentation | Test mAP50 | Test mAP50-95 |
|---|---|---|---|---|---|
| Baseline | YOLO26n | 640 | default | 0.878 | 0.589 |
| Higher resolution | YOLO26n | 1024 | default | 0.867 | 0.594 |
| Final | YOLO26s | 640 | colour + scale + rotation | 0.863 | 0.605 |

**Resolution did not help small objects.** Platelets are the smallest class
and localise poorly (mAP50-95 0.392 against mAP50 0.755 — the model finds them
but does not fit tight boxes). Raising the input from 640 to 1024 was expected
to fix this. It did not: platelet mAP50-95 went from 0.409 to 0.403. The source
images are 416x416, so upscaling adds no new pixel information. Interestingly
WBC — the largest class — did improve, from 0.748 to 0.791.

**Augmentation improved both accuracy and robustness.** Aggressive HSV shifts
(`hsv_s=0.9`, `hsv_v=0.6`), scale jitter (`scale=0.8`), rotation
(`degrees=20`) and `copy_paste=0.3` raised recall across every class:
platelets 0.694 to 0.861, RBC 0.734 to 0.879. Precision fell in exchange.
For a counting task this trade is preferable — a missed cell cannot be
recovered by tuning, a false positive can.

**Test-time augmentation is unavailable.** YOLO26's NMS-free end-to-end head
does not support multi-scale inference; `augment=True` silently falls back to
single-scale. This rules out a technique that typically adds 1–2 points on
YOLOv8/v11.

**Generalisation check.** On the baseline run, mAP50 was 0.947 on train,
0.900 on validation and 0.878 on test. A 0.069 train-to-test gap on a
765-image dataset indicates the model generalises rather than memorises.

### Confidence threshold

![Threshold curve](reports/figures/ui_threshold_curve.png)

| conf | Precision | Recall | mAP50 |
|---|---|---|---|
| **0.25** | 0.769 | **0.886** | **0.814** |
| 0.35 | 0.775 | 0.876 | 0.802 |
| 0.45 | 0.784 | 0.827 | 0.768 |
| 0.55 | 0.817 | 0.788 | 0.740 |

Raising the threshold buys 0.05 precision at the cost of 0.10 recall.
The default stays at 0.25.

## Scope and limitations

**Staining protocol.** Training images are Romanowsky-type (Wright/Giemsa)
stained peripheral smears. Colour is a strong cue for the model, so
Diff-Quik, unstained or phase-contrast images are outside its range.

**Closed-set architecture.** The model recognises exactly three classes and
must assign every detection to one of them. It cannot output "unknown".
Pathological cells, foreign objects and entirely unrelated images all receive
boxes. The scope tab in the interface demonstrates this directly.

![Out-of-scope behaviour](reports/figures/ui_overview.png)

**Label completeness.** BCCD contains unlabelled red blood cells. Some
detections counted as false positives are in fact correct, which depresses
the measured RBC precision (0.657).

**No external validation.** Performance on images from other laboratories,
microscopes or magnifications has not been measured, because no labelled
external data was available. Informal checks on outside images gave
plausible counts at mean confidence 0.76, but this is an observation, not
a metric.

## Setup

```bash
git clone https://github.com/Aysenurkislioglu/blood-cell-yolo.git
cd blood-cell-yolo
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

**Command line**

```bash
python -m src.cli data/samples/<image>.jpg -o annotated.jpg
python -m src.cli <image>.jpg --conf 0.4 --iou 0.5
```

**Web interface**

```bash
python -m uvicorn app.main:app --port 8000
```

Then open `http://localhost:8000`. Interactive API docs are at `/docs`.

**API**

| Endpoint | Purpose |
|---|---|
| `POST /predict` | Single image; returns counts, detections and an annotated image |
| `POST /predict/batch` | Up to 30 images; returns per-image rows and a summary |
| `GET /info` | Model card: architecture, dataset, metrics, limitations |
| `GET /health` | Liveness check |

## Project structure├── app/
│ ├── main.py FastAPI service
│ └── static/ Web interface
├── src/
│ ├── config.py Paths, class names, thresholds
│ ├── predict.py Inference wrapper
│ ├── cli.py Command line entry point
│ └── utils/viz.py Box drawing and counting
├── models/best.pt Trained weights (19 MB)
├── data/samples/ Example images from the test split
├── reports/ Metrics, training curves, screenshots
└── Dockerfile## Dataset

BCCD (Blood Cell Count and Detection), obtained through Roboflow Universe
(`joseph-nelson/bccd`, version 4, YOLO export). 874 images split
765 / 73 / 36 across train, validation and test.

Class distribution is heavily imbalanced: 4,155 RBC boxes against 372 WBC
and 361 platelets. This is why per-class metrics are reported rather than a
single aggregate — a model strong only on RBC would still post a high
overall score.

Licensed under MIT. Originally released by cosmicad and akshaylamba.

## License

MIT
