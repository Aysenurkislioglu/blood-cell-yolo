"""Drawing and counting helpers for YOLO detection results."""

from collections import Counter

import cv2

from src.config import CLASS_COLORS, CLASS_NAMES


def draw_boxes(image, result, show_conf=True):
    """Draw detected bounding boxes on a BGR image."""
    canvas = image.copy()
    for box in result.boxes:
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        color = CLASS_COLORS.get(cls_id, (128, 128, 128))
        cv2.rectangle(canvas, (x1, y1), (x2, y2), color, 2)
        label = CLASS_NAMES[cls_id]
        if show_conf:
            label = f"{label} {conf:.2f}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)
        cv2.rectangle(canvas, (x1, y1 - th - 4), (x1 + tw + 2, y1), color, -1)
        cv2.putText(canvas, label, (x1 + 1, y1 - 3),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
    return canvas


def count_cells(result):
    """Count detections per class."""
    counts = Counter(int(box.cls[0]) for box in result.boxes)
    return {name: counts.get(i, 0) for i, name in enumerate(CLASS_NAMES)}


def format_counts(counts):
    """Render a count dict as an aligned text block."""
    lines = [f"{name:<12} {n:>4}" for name, n in counts.items()]
    lines.append(f"{'TOTAL':<12} {sum(counts.values()):>4}")
    return "\n".join(lines)
