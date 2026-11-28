"""Independently decode a real downloaded image with Pillow; no browser state."""
import hashlib
import io
import json
import math
import sys
from pathlib import Path
from PIL import Image, ImageOps, ImageCms
import numpy as np

source_path, output_path = map(Path, sys.argv[1:3])
source_bytes, output_bytes = source_path.read_bytes(), output_path.read_bytes()
with Image.open(io.BytesIO(source_bytes)) as source_file, Image.open(io.BytesIO(output_bytes)) as output_file:
    source_file.load()
    output_file.load()
    format_name = output_file.format
    source_mode, output_mode = source_file.mode, output_file.mode
    source, actual = ImageOps.exif_transpose(source_file), ImageOps.exif_transpose(output_file)
    alpha_source, alpha_actual = np.asarray(source.convert('RGBA'))[:, :, 3], np.asarray(actual.convert('RGBA'))[:, :, 3]
    alpha_equal = source.size == actual.size and np.array_equal(alpha_source, alpha_actual)
    precision = not source_mode.startswith(('I', 'F')) or source_mode == output_mode
    source_16_exact = None
    if source_mode.startswith(('I', 'F')):
        source_16_exact = source.size == actual.size and np.array_equal(np.asarray(source), np.asarray(actual))
        precision = precision and source_16_exact
    reference = source.convert('RGB')
    if source.info.get('icc_profile'):
        reference = ImageCms.profileToProfile(reference, ImageCms.ImageCmsProfile(io.BytesIO(source.info['icc_profile'])), ImageCms.createProfile('sRGB'), outputMode='RGB')
    first = np.asarray(reference, dtype=np.float64)
    second = np.asarray(actual.convert('RGB'), dtype=np.float64)
    if first.shape != second.shape:
        raise ValueError('Changed decoded dimensions')
    alpha = alpha_source[:, :, None].astype(np.float64) / 255
    error = (first - second) * alpha
    mse = float(np.mean(error * error))
    result = {
        'decoder': 'Pillow ' + Image.__version__, 'format': format_name,
        'dimensions': list(actual.size), 'sourceDimensions': list(source.size),
        'sourceMode': source_mode, 'outputMode': output_mode,
        'decoded': True, 'alphaExact': bool(alpha_equal),
        'bitDepthPreserved': bool(precision), 'source16SamplesExact': source_16_exact,
        'pixelsExact': bool(np.array_equal(np.asarray(source.convert('RGBA')), np.asarray(actual.convert('RGBA')))),
        'compositeRgbPsnrDb': None if mse == 0 else 10 * math.log10(255 * 255 / mse),
        'mse': mse,
        'qualityNote': 'PSNR compares EXIF-oriented, ICC-managed source RGB with output RGB, premultiplied by source alpha; it is not a guarantee of invisible loss. Original-byte retained outputs remain exact. 16-bit raw samples checked separately.',
        'outputBytes': len(output_bytes), 'outputSha256': hashlib.sha256(output_bytes).hexdigest(),
    }
    print(json.dumps(result))
