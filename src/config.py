from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "models" / "best.pt"
SAMPLES_DIR = ROOT / "data" / "samples"

CLASS_NAMES = ["Platelets", "RBC", "WBC"]
CLASS_COLORS = {
    0: (88, 164, 224),    # Platelets #E0A458 -> BGR
    1: (107, 115, 201),   # RBC       #C9736B -> BGR
    2: (149, 91, 107),    # WBC       #6B5B95 -> BGR
}

CONF_THRESHOLD = 0.25
IOU_THRESHOLD = 0.45
MAX_DET = 300
IMG_SIZE = 640
