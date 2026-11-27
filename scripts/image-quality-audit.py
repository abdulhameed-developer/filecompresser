"""Independently decode recorded image pairs and retain reproducible quality evidence.

Usage: python scripts/image-quality-audit.py pairs.json output-directory
The pair manifest contains comparisons with id, original, output, provider and
optional expectedInputSha256/expectedOutputSha256. Paths are relative to its
directory. No network calls or user telemetry are made.

Requires Pillow, numpy, scipy and scikit-image in a separate QA environment.
SSIM follows scikit-image's documented Wang-compatible Gaussian parameters:
sigma=1.5, population covariance, K1=.01/K2=.03, explicit data_range=255.
We report native-resolution sRGB-encoded RGB and BT.709-weighted luma results,
on black and white alpha composites. These are single-scale SSIM and PSNR,
not MS-SSIM, Butteraugli or a human perceptual-equivalence certification.
Reference: https://scikit-image.org/docs/stable/api/skimage.metrics.html
"""
import hashlib
import io
import json
import math
import os
import platform
import sys
from pathlib import Path

import numpy as np
import PIL
import scipy
import skimage
from PIL import Image, ImageCms, ImageDraw, ImageOps
from skimage.metrics import structural_similarity


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def decoded(path):
    with Image.open(path) as source:
        source.load()
        image = ImageOps.exif_transpose(source)
        rgba = image.convert("RGBA")
        profile = source.info.get("icc_profile")
        if profile:
            # Compare displayed colors, not unrelated raw values from profiles.
            profile_input = image if image.mode in ("CMYK", "LAB", "L") else image.convert("RGB")
            rgb = ImageCms.profileToProfile(profile_input, ImageCms.ImageCmsProfile(io.BytesIO(profile)), ImageCms.createProfile("sRGB"), outputMode="RGB")
            rgb.putalpha(rgba.getchannel("A"))
            rgba = rgb
        metadata = {
            "format": source.format,
            "mode": source.mode,
            "storedDimensions": list(source.size),
            "displayDimensions": list(image.size),
            "bytes": path.stat().st_size,
            "sha256": digest(path),
            "iccProfileSha256": hashlib.sha256(profile).hexdigest() if profile else None,
            "exifOrientation": source.getexif().get(274, 1),
            "rawSampleSha256": hashlib.sha256(image.tobytes()).hexdigest(),
        }
        # Retain the decoded 8-bit samples compactly. Compositing below promotes
        # to float64 before arithmetic, so no unsigned subtraction can wrap.
        return np.asarray(rgba, dtype=np.uint8), metadata


def composite(rgba, background):
    alpha = rgba[:, :, 3:4] / 255.0
    return rgba[:, :, :3] * alpha + background * (1.0 - alpha)


def metrics(first, second):
    error = first - second
    mse = float(np.mean(error * error))
    result = {
        "rgbMse": mse,
        "rgbPsnrDb": None if mse == 0 else 10 * math.log10(255 ** 2 / mse),
        "infinitePsnr": mse == 0,
        "rgbMeanAbsoluteError": float(np.mean(np.abs(error))),
        "rgbMaximumAbsoluteError": float(np.max(np.abs(error))),
    }
    del error
    if mse == 0 and min(first.shape[:2]) >= 11:
        # The identical-array identity is exact for this metric; avoid a large
        # redundant Gaussian-filter allocation for verified lossless outputs.
        result.update({"rgbGaussianSsim": 1.0, "lumaGaussianSsim": 1.0})
        return result
    if min(first.shape[:2]) >= 11:
        options = dict(data_range=255, gaussian_weights=True, sigma=1.5, use_sample_covariance=False, K1=0.01, K2=0.03)
        coefficients = np.array([0.2126, 0.7152, 0.0722])
        rgb_sum, luma_sum, valid_rows = 0.0, 0.0, 0
        # The documented Gaussian kernel has radius five. Retaining exactly
        # that halo around each stripe computes the same native-resolution
        # valid-window mean as the full image, with bounded filter allocations.
        for start in range(5, first.shape[0] - 5, 256):
            end = min(start + 256, first.shape[0] - 5)
            original = first[start - 5:end + 5]
            output = second[start - 5:end + 5]
            rows = end - start
            rgb_sum += rows * float(structural_similarity(original, output, channel_axis=2, **options))
            luma_sum += rows * float(structural_similarity(original @ coefficients, output @ coefficients, **options))
            valid_rows += rows
        result["rgbGaussianSsim"] = rgb_sum / valid_rows
        result["lumaGaussianSsim"] = luma_sum / valid_rows
    else:
        result["ssimNotApplicable"] = "An image dimension is smaller than the 11-pixel Gaussian window."
    return result


def render_sheet(identifier, first, second, destination):
    # Native central crops complement overviews; scaled overviews alone can hide
    # codec artifacts. No input/output file is resized or overwritten.
    height, width = first.shape[:2]
    tiles = []
    for background, label in [(255, "white"), (0, "black")]:
        original = composite(first, background)
        output = composite(second, background)
        difference = np.minimum(np.abs(original - output) * 8, 255)
        for name, array in [("Original", original), ("Output", output), ("Absolute difference x8", difference)]:
            tiles.append((f"{name} / {label}", Image.fromarray(np.rint(array).astype(np.uint8))))
    left, top = max(0, (width - 360) // 2), max(0, (height - 260) // 2)
    crop_box = (left, top, min(width, left + 360), min(height, top + 260))
    sheet = Image.new("RGB", (1080, 1176), "#e8ece9")
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 8), f"{identifier}: overview and native central crop; difference amplified x8", fill="black")
    for index, (label, image) in enumerate(tiles):
        row, column = divmod(index, 3)
        x, y = column * 360, 30 + row * 570
        draw.text((x + 8, y), label, fill="black")
        overview = image.copy()
        overview.thumbnail((344, 260), Image.Resampling.LANCZOS)
        sheet.paste(overview, (x + (360 - overview.width) // 2, y + 24))
        draw.text((x + 8, y + 292), "Native pixels / central crop", fill="black")
        sheet.paste(image.crop(crop_box), (x, y + 312))
    filename = f"{identifier}-comparison.png"
    sheet.save(destination / filename, compress_level=1)
    return {"file": filename, "sha256": digest(destination / filename), "nativeCropBox": list(crop_box), "differenceScale": 8}


def verified_visual_sheet(identifier, first, second, destination, input_info, output_info, allow_reuse=False):
    # Sidecars belong to new QA output only. Historical sheets without proven
    # provenance are regenerated, never assumed to match solely by identifier.
    key = {
        "version": 1,
        "identifier": identifier,
        "inputSha256": input_info["sha256"],
        "outputSha256": output_info["sha256"],
        "inputRgbaSha256": hashlib.sha256(first.tobytes()).hexdigest(),
        "outputRgbaSha256": hashlib.sha256(second.tobytes()).hexdigest(),
        "shape": list(first.shape),
        # This also binds every crop, difference, compositing and render setting.
        "rendererSourceSha256": digest(Path(__file__)),
        "libraries": {"Pillow": PIL.__version__, "numpy": np.__version__},
    }
    filename = f"{identifier}-comparison.png"
    sheet = destination / filename
    sidecar = destination / f"{identifier}-comparison.cache.json"
    if allow_reuse and sheet.is_file() and sidecar.is_file():
        try:
            cached = json.loads(sidecar.read_text())
            visual = cached["visualSheet"]
            if cached["key"] == key and visual["file"] == filename and visual["sha256"] == digest(sheet):
                return {**visual, "reusedFromSamePairPartialAttempt": True}
        except (OSError, ValueError, KeyError, TypeError):
            pass
    visual = render_sheet(identifier, first, second, destination)
    sidecar.write_text(json.dumps({"key": key, "visualSheet": visual}, indent=2) + "\n")
    return visual


def main():
    manifest_path = Path(sys.argv[1]).resolve()
    destination = Path(sys.argv[2]).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(manifest_path.read_text())
    identifiers = [row["id"] for row in manifest["comparisons"]]
    if len(identifiers) != len(set(identifiers)):
        raise ValueError("Comparison identifiers must be unique; refuse ambiguous output files")
    results = []
    for pair in manifest["comparisons"]:
        identifier = pair["id"]
        if not identifier or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for character in identifier):
            raise ValueError("Comparison identifiers must be safe filenames")
        original = (manifest_path.parent / pair["original"]).resolve()
        output = (manifest_path.parent / pair["output"]).resolve()
        first, input_info = decoded(original)
        second, output_info = decoded(output)
        for expected, actual in [(pair.get("expectedInputSha256"), input_info["sha256"]), (pair.get("expectedOutputSha256"), output_info["sha256"])]:
            if expected and expected != actual:
                raise ValueError(f"{identifier}: bytes differ from the recorded benchmark hash")
        same_shape = first.shape == second.shape
        result = {"id": identifier, "provider": pair["provider"], "options": pair.get("options"), "input": input_info, "output": output_info,
                  "independentlyDecodable": True, "dimensionsPreserved": same_shape, "sameOutputFormat": input_info["format"] == output_info["format"],
                  "reductionPercent": 100 * (1 - output_info["bytes"] / input_info["bytes"])}
        if input_info["mode"] in ("I;16", "I;16B", "I", "F") or output_info["mode"] in ("I;16", "I;16B", "I", "F"):
            result["qualityLimit"] = "RGBA8 display metrics do not evaluate full-depth samples. Raw oriented sample equality is recorded separately; no 16-bit perceptual-fidelity claim is based on SSIM."
        if same_shape:
            alpha_error = np.abs(first[:, :, 3].astype(np.int16) - second[:, :, 3].astype(np.int16))
            black_metrics = metrics(composite(first, 0), composite(second, 0))
            both_opaque = bool(np.all(first[:, :, 3] == 255) and np.all(second[:, :, 3] == 255))
            # Black and white composites are identical when both images are
            # opaque. Reuse the exact result rather than filtering twice.
            white_metrics = dict(black_metrics) if both_opaque else metrics(composite(first, 255), composite(second, 255))
            result.update({"alphaExact": bool(np.array_equal(first[:, :, 3], second[:, :, 3])), "alphaMaximumAbsoluteError": float(alpha_error.max()),
                           "alphaMeanAbsoluteError": float(alpha_error.mean()), "rawOrientedSamplesExact": input_info["mode"] == output_info["mode"] and input_info["rawSampleSha256"] == output_info["rawSampleSha256"],
                           "displayRgbaExact": bool(np.array_equal(first, second)), "black": black_metrics, "white": white_metrics})
            result["visualSheet"] = verified_visual_sheet(identifier, first, second, destination, input_info, output_info,
                                                         allow_reuse=os.environ.get("QUALITY_REUSE_SHEETS") == "1")
        else:
            result["qualityNotComparable"] = "Decoded display dimensions differ; no quality metric or resize is substituted."
        results.append(result)
        (destination / "quality-progress.json").write_text(json.dumps({"complete": False, "pairManifestSha256": digest(manifest_path), "results": results}, indent=2, allow_nan=False) + "\n")
        print(identifier, result["reductionPercent"], result.get("white", {}).get("rgbGaussianSsim"), result.get("alphaExact"), flush=True)
    report = {"methodVersion": 1, "python": platform.python_version(), "libraries": {"Pillow": PIL.__version__, "numpy": np.__version__, "scipy": scipy.__version__, "scikit-image": skimage.__version__},
              "method": __doc__, "pairManifestSha256": digest(manifest_path), "results": results}
    (destination / "quality.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")


if __name__ == "__main__":
    main()
