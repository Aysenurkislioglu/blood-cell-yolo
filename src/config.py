from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "models" / "best.pt"
SAMPLES_DIR = ROOT / "data" / "samples"

CLASS_NAMES = ["Platelets", "RBC", "WBC"]
CLASS_COLORS = {
    0: (95, 122, 224),    # Platelets
    1: (128, 90, 61),     # RBC
    2: (154, 178, 129),   # WBC
}

CONF_THRESHOLD = 0.25
IOU_THRESHOLD = 0.45
MAX_DET = 300
IMG_SIZE = 640
