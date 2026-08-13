"""FastAPI service for blood cell detection."""

import base64
from pathlib import Path
import io

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.config import CLASS_NAMES, CONF_THRESHOLD, IOU_THRESHOLD, ROOT
from src.predict import annotate, predict

app = FastAPI(
    title="Blood cell detection API",
    description="YOLO26s object detection for peripheral blood smear images.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}

MODEL_INFO = {
    "architecture": "YOLO26s",
    "parameters": 9_466_341,
    "input_size": 640,
    "classes": CLASS_NAMES,
    "dataset": {
        "name": "BCCD",
        "source": "Roboflow Universe (joseph-nelson/bccd v4)",
        "license": "MIT",
        "train_images": 765,
        "val_images": 73,
        "test_images": 36,
    },
    "metrics": {
        "test": {"mAP50": 0.863, "mAP50_95": 0.605},
        "per_class": {
            "Platelets": {"precision": 0.687, "recall": 0.861, "mAP50": 0.755},
            "RBC": {"precision": 0.657, "recall": 0.879, "mAP50": 0.866},
            "WBC": {"precision": 0.957, "recall": 0.919, "mAP50": 0.968},
        },
    },
    "limitations": [
        "Model, Romanowsky tipi (Wright/Giemsa) boyalı periferik kan yayması görüntüleri üzerinde eğitilmiştir.",
        "Farklı boyama protokolleri, büyütme oranları veya mikroskop donanımlarındaki başarımı ölçülmemiştir.",
        "BCCD veri setinde etiketlenmemiş alyuvarlar bulunur; bu durum ölçülen precision değerini düşürür.",
        "Model her girdide tespit döndürür; bir görüntünün kapsam dışı olduğunu bildiremez.",
        "Yalnızca araştırma ve eğitim amaçlıdır. Tanı amaçlı kullanılamaz.",
    ],
}


def _read_image(data: bytes) -> np.ndarray:
    array = np.frombuffer(data, np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(400, "Could not decode the uploaded file as an image.")
    return image


def _domain_warning(output: dict) -> str | None:
    if output["total"] == 0:
        return "Hiç hücre tespit edilmedi. Bu görüntü boyalı bir kan yayması olmayabilir."
    if output["mean_confidence"] < 0.5:
        return "Ortalama güven düşük. Bu görüntü eğitim verisinin kapsamı dışında olabilir."
    return None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/info")
def info():
    """Model card: architecture, dataset, measured metrics and known limits."""
    return MODEL_INFO


@app.post("/predict")
async def predict_endpoint(
    file: UploadFile = File(...),
    conf: float = Query(CONF_THRESHOLD, ge=0.01, le=0.95),
    iou: float = Query(IOU_THRESHOLD, ge=0.1, le=0.95),
    annotated: bool = Query(True, description="Include a base64 annotated image"),
):
    """Detect blood cells in a single image."""
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(415, f"Unsupported type: {file.content_type}")

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File larger than 10 MB.")

    image = _read_image(data)
    output = predict(image, conf=conf, iou=iou)

    payload = {
        "filename": file.filename,
        "counts": output["counts"],
        "total": output["total"],
        "rbc_wbc_ratio": output["rbc_wbc_ratio"],
        "mean_confidence": output["mean_confidence"],
        "min_confidence": output["min_confidence"],
        "detections": output["detections"],
        "thresholds": {"conf": conf, "iou": iou},
        "warning": _domain_warning(output),
    }

    if annotated:
        ok, buf = cv2.imencode(".jpg", annotate(image, output))
        if ok:
            payload["annotated_image"] = (
                "data:image/jpeg;base64," + base64.b64encode(buf).decode()
            )

    return payload


@app.post("/predict/batch")
async def predict_batch(
    files: list[UploadFile] = File(...),
    conf: float = Query(CONF_THRESHOLD, ge=0.01, le=0.95),
    iou: float = Query(IOU_THRESHOLD, ge=0.1, le=0.95),
):
    """Detect cells across several images and return per-image counts."""
    if len(files) > 30:
        raise HTTPException(413, "At most 30 images per batch.")

    rows = []
    for f in files:
        if f.content_type not in ALLOWED_TYPES:
            continue
        output = predict(_read_image(await f.read()), conf=conf, iou=iou)
        rows.append({
            "filename": f.filename,
            **output["counts"],
            "total": output["total"],
            "rbc_wbc_ratio": output["rbc_wbc_ratio"],
            "mean_confidence": output["mean_confidence"],
            "warning": _domain_warning(output),
        })

    if not rows:
        raise HTTPException(400, "No valid images in the request.")

    summary = {
        name: {
            "total": sum(r[name] for r in rows),
            "mean": round(sum(r[name] for r in rows) / len(rows), 1),
        }
        for name in CLASS_NAMES
    }

    return {"images": len(rows), "rows": rows, "summary": summary}


app.mount("/samples", StaticFiles(directory=str(ROOT / "data" / "samples")), name="samples")

STATIC_DIR = Path(__file__).resolve().parent / "static"
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
