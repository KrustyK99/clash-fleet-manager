#!/usr/bin/env python3
"""
Combine every JPEG in a directory into one PDF.

Default behavior:
- Uses each image at its full pixel resolution.
- Creates one PDF page per image.
- Sorts filenames naturally: image2.jpg comes before image10.jpg.
- Corrects camera/phone EXIF rotation.
- Uses JPEG quality 95.

Install dependency:
    python -m pip install Pillow

Examples:
    python jpeg_directory_to_pdf.py "C:\Photos"

    python jpeg_directory_to_pdf.py "C:\Photos" -o "C:\Photos\photos.pdf"

    # Reduce width and height to 75%:
    python jpeg_directory_to_pdf.py "C:\Photos" --scale 0.75

    # Try to keep the PDF at or below 20 MB:
    python jpeg_directory_to_pdf.py "C:\Photos" --target-mb 20

    # Include JPEGs in subdirectories:
    python jpeg_directory_to_pdf.py "C:\Photos" --recursive
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Iterable

try:
    from PIL import Image, ImageOps
except ImportError:
    print(
        "This script requires Pillow.\n"
        "Install it with:\n\n"
        "    python -m pip install Pillow\n",
        file=sys.stderr,
    )
    raise SystemExit(1)


JPEG_EXTENSIONS = {".jpg", ".jpeg"}


def natural_sort_key(path: Path) -> list[object]:
    """Sort image2.jpg before image10.jpg."""
    return [
        int(part) if part.isdigit() else part.casefold()
        for part in re.split(r"(\d+)", str(path.relative_to(path.parent)))
    ]


def find_jpegs(directory: Path, recursive: bool) -> list[Path]:
    iterator: Iterable[Path]
    iterator = directory.rglob("*") if recursive else directory.iterdir()

    images = [
        path
        for path in iterator
        if path.is_file() and path.suffix.casefold() in JPEG_EXTENSIONS
    ]

    # Sort by relative path and then natural filename order.
    return sorted(
        images,
        key=lambda p: [
            int(part) if part.isdigit() else part.casefold()
            for part in re.split(r"(\d+)", str(p.relative_to(directory)))
        ],
    )


def validate_args(args: argparse.Namespace) -> None:
    if not 0 < args.scale <= 1:
        raise ValueError("--scale must be greater than 0 and no greater than 1.")

    if not 1 <= args.quality <= 100:
        raise ValueError("--quality must be between 1 and 100.")

    if not 1 <= args.min_quality <= args.quality:
        raise ValueError(
            "--min-quality must be between 1 and the selected --quality."
        )

    if not 0 < args.min_scale <= args.scale:
        raise ValueError(
            "--min-scale must be greater than 0 and no greater than --scale."
        )

    if args.target_mb is not None and args.target_mb <= 0:
        raise ValueError("--target-mb must be greater than 0.")

    if args.max_dimension is not None and args.max_dimension < 1:
        raise ValueError("--max-dimension must be at least 1 pixel.")

    if args.dpi < 1:
        raise ValueError("--dpi must be at least 1.")


def prepare_image(
    path: Path,
    scale: float,
    max_dimension: int | None,
) -> Image.Image:
    """
    Load, rotate, resize, and convert one image to RGB.

    The returned image is detached from the source file, so the file handle
    can be closed immediately.
    """
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source)

        resize_factor = scale

        if max_dimension is not None:
            longest_side = max(image.size)
            if longest_side * resize_factor > max_dimension:
                resize_factor = min(
                    resize_factor,
                    max_dimension / longest_side,
                )

        if resize_factor < 1:
            new_width = max(1, round(image.width * resize_factor))
            new_height = max(1, round(image.height * resize_factor))
            image = image.resize(
                (new_width, new_height),
                Image.Resampling.LANCZOS,
            )

        # PDF output is most predictable when every page image is RGB.
        if image.mode != "RGB":
            image = image.convert("RGB")
        else:
            image = image.copy()

        return image


def create_pdf(
    image_paths: list[Path],
    output_path: Path,
    scale: float,
    quality: int,
    max_dimension: int | None,
    dpi: int,
) -> int:
    """Create the PDF and return its size in bytes."""
    pages: list[Image.Image] = []

    try:
        for index, image_path in enumerate(image_paths, start=1):
            print(
                f"\rPreparing image {index}/{len(image_paths)}: "
                f"{image_path.name[:50]:<50}",
                end="",
                flush=True,
            )
            pages.append(
                prepare_image(
                    image_path,
                    scale=scale,
                    max_dimension=max_dimension,
                )
            )

        print("\rWriting PDF..." + " " * 80, flush=True)

        output_path.parent.mkdir(parents=True, exist_ok=True)

        first_page, *remaining_pages = pages
        first_page.save(
            output_path,
            format="PDF",
            save_all=True,
            append_images=remaining_pages,
            resolution=dpi,
            quality=quality,
            optimize=True,
        )
    finally:
        for page in pages:
            page.close()

    return output_path.stat().st_size


def human_size(byte_count: int) -> str:
    value = float(byte_count)
    for unit in ("bytes", "KB", "MB", "GB"):
        if value < 1024 or unit == "GB":
            return f"{value:.2f} {unit}"
        value /= 1024
    return f"{byte_count} bytes"


def candidate_scales(start_scale: float, min_scale: float) -> list[float]:
    """Generate descending scale values, always including min_scale."""
    values = [start_scale]
    current = start_scale

    while current * 0.85 > min_scale:
        current *= 0.85
        values.append(round(current, 4))

    if values[-1] != min_scale:
        values.append(min_scale)

    # Remove any duplicates caused by rounding.
    return list(dict.fromkeys(values))


def create_pdf_to_target(
    image_paths: list[Path],
    output_path: Path,
    start_scale: float,
    start_quality: int,
    min_scale: float,
    min_quality: int,
    max_dimension: int | None,
    dpi: int,
    target_mb: float,
) -> tuple[int, float, int, bool]:
    """
    Try to fit the PDF beneath target_mb.

    Resolution is prioritized over JPEG quality:
    - Try the largest scale first.
    - At each scale, find the highest quality that fits.
    - Reduce the scale only when even min_quality is too large.
    """
    target_bytes = round(target_mb * 1024 * 1024)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    smallest_result: tuple[int, float, int] | None = None

    with tempfile.TemporaryDirectory(
        prefix="jpeg_pdf_",
        dir=output_path.parent,
    ) as temp_dir:
        temp_pdf = Path(temp_dir) / "candidate.pdf"

        for scale in candidate_scales(start_scale, min_scale):
            print(f"\nTrying scale {scale:.0%}...")

            # First try the requested/highest quality.
            size = create_pdf(
                image_paths,
                temp_pdf,
                scale,
                start_quality,
                max_dimension,
                dpi,
            )
            print(
                f"Scale {scale:.0%}, quality {start_quality}: "
                f"{human_size(size)}"
            )

            if smallest_result is None or size < smallest_result[0]:
                smallest_result = (size, scale, start_quality)

            if size <= target_bytes:
                os.replace(temp_pdf, output_path)
                return size, scale, start_quality, True

            # See whether this scale can fit at the minimum quality.
            min_size = create_pdf(
                image_paths,
                temp_pdf,
                scale,
                min_quality,
                max_dimension,
                dpi,
            )
            print(
                f"Scale {scale:.0%}, quality {min_quality}: "
                f"{human_size(min_size)}"
            )

            if smallest_result is None or min_size < smallest_result[0]:
                smallest_result = (min_size, scale, min_quality)

            if min_size > target_bytes:
                continue

            # Binary-search for the highest quality that fits.
            low = min_quality
            high = start_quality
            best_quality = min_quality
            best_size = min_size

            while low <= high:
                quality = (low + high) // 2

                test_size = create_pdf(
                    image_paths,
                    temp_pdf,
                    scale,
                    quality,
                    max_dimension,
                    dpi,
                )
                print(
                    f"Scale {scale:.0%}, quality {quality}: "
                    f"{human_size(test_size)}"
                )

                if test_size <= target_bytes:
                    best_quality = quality
                    best_size = test_size
                    low = quality + 1
                else:
                    high = quality - 1

            # Recreate the selected candidate because later test runs may
            # have overwritten the temporary file.
            best_size = create_pdf(
                image_paths,
                temp_pdf,
                scale,
                best_quality,
                max_dimension,
                dpi,
            )
            os.replace(temp_pdf, output_path)
            return best_size, scale, best_quality, True

        # Nothing fit. Produce the smallest permitted version so the user
        # still gets a usable result, then clearly report that it is oversized.
        assert smallest_result is not None
        _, smallest_scale, smallest_quality = smallest_result

        final_size = create_pdf(
            image_paths,
            temp_pdf,
            smallest_scale,
            smallest_quality,
            max_dimension,
            dpi,
        )
        os.replace(temp_pdf, output_path)

        return final_size, smallest_scale, smallest_quality, False


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Combine all JPEG images in a directory into one PDF.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )

    parser.add_argument(
        "directory",
        nargs="?",
        default=".",
        help="Directory containing the JPEG images.",
    )
    parser.add_argument(
        "-o",
        "--output",
        help=(
            "Output PDF path. By default, creates combined-images.pdf "
            "inside the image directory."
        ),
    )
    parser.add_argument(
        "--scale",
        type=float,
        default=1.0,
        help=(
            "Resize factor for width and height. "
            "Use 1.0 for full resolution or 0.5 for half dimensions."
        ),
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=95,
        help="Starting JPEG quality used inside the PDF.",
    )
    parser.add_argument(
        "--target-mb",
        type=float,
        help=(
            "Try to keep the finished PDF at or below this size in MB. "
            "The script automatically lowers quality and then resolution."
        ),
    )
    parser.add_argument(
        "--min-quality",
        type=int,
        default=40,
        help="Lowest quality allowed while trying to meet --target-mb.",
    )
    parser.add_argument(
        "--min-scale",
        type=float,
        default=0.25,
        help="Lowest scale allowed while trying to meet --target-mb.",
    )
    parser.add_argument(
        "--max-dimension",
        type=int,
        help=(
            "Optional maximum width or height in pixels for each image. "
            "The aspect ratio is preserved."
        ),
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=300,
        help=(
            "PDF page resolution metadata. This affects printed page size, "
            "not the retained pixel dimensions."
        ),
    )
    parser.add_argument(
        "--recursive",
        action="store_true",
        help="Also include JPEGs from subdirectories.",
    )

    return parser.parse_args()


def main() -> int:
    args = parse_arguments()

    try:
        validate_args(args)
    except ValueError as exc:
        print(f"Argument error: {exc}", file=sys.stderr)
        return 2

    directory = Path(args.directory).expanduser().resolve()

    if not directory.is_dir():
        print(f"Directory not found: {directory}", file=sys.stderr)
        return 1

    output_path = (
        Path(args.output).expanduser().resolve()
        if args.output
        else directory / "combined-images.pdf"
    )

    image_paths = find_jpegs(directory, args.recursive)

    if not image_paths:
        print(
            f"No .jpg or .jpeg files were found in: {directory}",
            file=sys.stderr,
        )
        return 1

    print(f"Found {len(image_paths)} JPEG image(s).")
    print(f"Output: {output_path}")

    try:
        if args.target_mb is None:
            size = create_pdf(
                image_paths=image_paths,
                output_path=output_path,
                scale=args.scale,
                quality=args.quality,
                max_dimension=args.max_dimension,
                dpi=args.dpi,
            )
            print(
                f"\nCreated {output_path}\n"
                f"Size: {human_size(size)}\n"
                f"Scale: {args.scale:.0%}\n"
                f"Quality: {args.quality}"
            )
        else:
            size, scale, quality, met_target = create_pdf_to_target(
                image_paths=image_paths,
                output_path=output_path,
                start_scale=args.scale,
                start_quality=args.quality,
                min_scale=args.min_scale,
                min_quality=args.min_quality,
                max_dimension=args.max_dimension,
                dpi=args.dpi,
                target_mb=args.target_mb,
            )

            print(
                f"\nCreated {output_path}\n"
                f"Size: {human_size(size)}\n"
                f"Scale: {scale:.0%}\n"
                f"Quality: {quality}"
            )

            if not met_target:
                print(
                    "\nWARNING: The PDF is still larger than the requested "
                    f"{args.target_mb:.2f} MB target.\n"
                    "Try a lower --min-scale, lower --min-quality, or split "
                    "the images into more than one PDF.",
                    file=sys.stderr,
                )
                return 3

    except (OSError, ValueError) as exc:
        print(f"\nFailed to create PDF: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
