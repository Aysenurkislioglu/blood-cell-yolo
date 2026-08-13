"""Command line interface for blood cell detection."""

import argparse
from pathlib import Path

import cv2

from src.config import CONF_THRESHOLD, IOU_THRESHOLD
from src.predict import annotate, predict_file
from src.utils.viz import format_counts


def main():
    parser = argparse.ArgumentParser(
        description="Detect blood cells in a stained smear image."
    )
    parser.add_argument("image", type=Path, help="Path to the input image")
    parser.add_argument("-o", "--output", type=Path,
                        help="Where to save the annotated image")
    parser.add_argument("--conf", type=float, default=CONF_THRESHOLD)
    parser.add_argument("--iou", type=float, default=IOU_THRESHOLD)
    args = parser.parse_args()

    out = predict_file(args.image, conf=args.conf, iou=args.iou)

    print(f"\n{args.image.name}")
    print("-" * 24)
    print(format_counts(out["counts"]))
    print("-" * 24)
    print(f"{'Mean conf':<12} {out['mean_confidence']:>6.3f}")
    if out["rbc_wbc_ratio"]:
        print(f"{'RBC/WBC':<12} {out['rbc_wbc_ratio']:>6.1f}")

    if out["total"] == 0:
        print("\n[!] No cells detected. Check that this is a stained blood smear.")
    elif out["mean_confidence"] < 0.5:
        print("\n[!] Low mean confidence. This image may differ from the training domain.")

    if args.output:
        image = cv2.imread(str(args.image))
        args.output.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(args.output), annotate(image, out))
        print(f"\nSaved: {args.output}")


if __name__ == "__main__":
    main()
