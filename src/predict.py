"""Inference wrapper around the trained YOLO model."""

from functools import lru_cache
from pathlib import Path

import cv2
from ultralytics import YOLO

from src.config import (
    CLASS_NAMES, CONF_THRESHOLD, IOU_THRESHOLD,
    IMG_SIZE, MAX_DET, MODEL_PATH,
)
from src.utils.viz import count_cells, draw_boxes


@lru_cache(maxsize=1)
def load_model(weights: str = None):
    """Load the model once and reuse it across calls."""
    path = Path(weights) if weights else MODEL_PATH
    if not path.exists():
        raise FileNotFoundError(f"Model weights not found: {path}")
    return YOLO(str(path))


def predict(image, conf=CONF_THRESHOLD, iou=IOU_THRESHOLD):
    """Run detection on a BGR image array."""
    model = load_model()
    result = model.predict(
        image, conf=conf, iou=iou,
        imgsz=IMG_SIZE, max_det=MAX_DET, verbose=False,
    )[0]

    detections = [
        {
            "class_id": int(b.cls[0]),
            "class_name": CLASS_NAMES[int(b.cls[0])],
            "confidence": round(float(b.conf[0]), 4),
            "box": [round(float(v), 1) for v in b.xyxy[0]],
        }
        for b in result.boxes
    ]

    counts = count_cells(result)
    confs = [d["confidence"] for d in detections]

    return {
        "detections": detections,
        "counts": counts,
        "total": len(detections),
        "mean_confidence": round(sum(confs) / len(confs), 4) if confs else 0.0,
        "min_confidence": round(min(confs), 4) if confs else 0.0,
        "rbc_wbc_ratio": (
            round(counts["RBC"] / counts["WBC"], 1) if counts["WBC"] else None
        ),
        "_result": result,
    }


def predict_file(path, conf=CONF_THRESHOLD, iou=IOU_THRESHOLD):
    """Run detection on an image file path."""
    image = cv2.imread(str(path))
    if image is None:
        raise ValueError(f"Could not read image: {path}")
    return predict(image, conf=conf, iou=iou)


def annotate(image, output):
    """Draw boxes for a prediction output onto the image."""
    return draw_boxes(image, output["_result"])
