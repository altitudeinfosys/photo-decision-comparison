# Maintenance video frames

A standalone, local-only Python CLI. Converts a short video into a small set of timestamped JPEGs, a labeled contact sheet and a portable manifest. No model API, upload, telemetry, paid calls, tenant messaging or production integration. Source videos and existing outputs are never overwritten.

## Dependencies

Python 3.10+, FFmpeg/ffprobe 7+ on PATH and Pillow (`requirements.txt`). Tested on macOS with Python 3.12.4, FFmpeg/ffprobe 9.0.1 and Pillow 12.3.0. FFmpeg must have the decoder for your input; the synthetic fixture generator/tests also use the libx264 encoder. The CLI does not install software. If Pillow is missing, prepare a virtual environment and install requirements only after the environment owner approves installation. Dry-run needs Python and ffprobe/ffmpeg, but does not import Pillow.

## Usage

```sh
python3 video_frames.py /path/to/maintenance.mov --output outputs/check-01 --dry-run
python3 video_frames.py /path/to/maintenance.mov --output outputs/check-01
python3 video_frames.py /path/to/maintenance.mov --output outputs/check-02 \
  --count 4 --selection scene --deduplicate
python3 video_frames.py --help
```

Dry-run validates the file, options, metadata limits, dependencies and output destination, then prints an even sampling plan to stdout. It writes no files, decodes no frames, and defers scene scanning/duplicate decisions. It cannot guarantee full decoding or output directory writability.

Default: four frames at segment midpoints, e.g. 0.5, 1.5, 2.5 and 3.5 seconds for a four-second clip. `--selection scene` scans visual changes (threshold 0.3 by default), spreads selections across detected boundaries and fills missing slots from the even grid. It does not identify maintenance events. `--deduplicate` compares 32×32 RGB thumbnails against all retained candidates. A mean difference ≤0.01 drops a candidate; color is retained so different solid-color scenes survive. Change `--duplicate-threshold` conservatively: fine leaks or short flickers can disappear. Filtering can return fewer than `--count`; it does not refill dropped frames.

Each subprocess has a timeout (default 120 seconds, configurable up to 300). Default input limits are 120 seconds and 100 MiB, configurable up to 300 seconds and 500 MiB. Inputs must have an ordinary video stream, known positive duration, at most 8192 pixels per side and 32 megapixels. Frame count is 1–24. JPEGs default to a maximum side of 1280 (64–4096 configurable), quality 90, and a hard 4 MiB per-image cap. Excessive settings, unknown duration, missing files/tools, corrupt/unsupported media and existing output directories return exit code 2 with a clear error. Successful runs return 0. A decoder timeout or decoding failure produces no published result directory. Very short/sparse clips may lack a frame at or after a requested midpoint: the CLI reports this explicitly; use a longer recording or fewer frames.

FFmpeg applies rotation/display-matrix metadata during decoding. Frames are converted to square pixels and bounded without enlargement. The manifest records encoded dimensions and rotation; each output records its actual dimensions. Timestamps are **actual presentation timestamps**, measured from the first decoded video frame, alongside requested candidate timestamps. They are not recording wall-clock times. Variable cadence and nonzero stream starts are covered by synthetic tests. Metadata duration is used for planning; unusual containers with inaccurate duration may fail clearly. HDR inputs are flagged: there is no calibrated HDR tone mapping.

## Outputs and image workflow handoff

A new output directory contains:

- `frame_001_000000500ms.jpg` etc.: ordinary metadata-free RGB JPEGs.
- `contact-sheet.jpg`: thumbnails labeled with frame number and actual timestamp.
- `manifest.json`: schema/tool version, settings, sanitized source metadata and SHA-256, frame-relative paths, actual/requested times, selection reason, size, frame hashes and dropped duplicates.

Paths in the manifest are relative to its directory. Original filenames, absolute source paths, tenant identifiers and EXIF/GPS metadata are omitted. Hashes and derived frames are still private evidence, not anonymized public assets. Stdout reports the local output path. The manifest is a **preprocessing handoff**, not a lab case/replay manifest and not a provider request. Use `frames` to select images and keep timestamp context with their descriptions.

The default four frames provide a compact input for downstream image workflows. Keep their actual timestamps as neutral context. This manifest is independent of any provider API contract; downstream adapters must enforce their own image-count and aggregate request-size limits. Feed individual frames rather than the contact sheet.

This local snippet builds an images array in memory without sending it anywhere:

```python
import base64, json
from pathlib import Path
root = Path('outputs/check-01')
manifest = json.loads((root / 'manifest.json').read_text())
images = ['data:image/jpeg;base64,' + base64.b64encode(
    (root / frame['path']).read_bytes()).decode('ascii')
    for frame in manifest['frames']]
# Supply images to your existing offline case preparation, retaining timestamps.
# No API calls are made by this example.
```

## Synthetic verification and demo

```sh
python3 -m unittest discover -s tests -v
python3 make_demo_fixture.py inputs/synthetic.mp4
python3 video_frames.py inputs/synthetic.mp4 --output demo-output/even
python3 video_frames.py inputs/synthetic.mp4 --output demo-output/scenes \
  --selection scene --deduplicate
```

Tests generate fixtures in temporary directories and remove them. They cover even sampling with actual timestamps/color assertions, scene-boundary selection and fallback, color-aware duplicate filtering, static footage, rotation/resizing, dry-run, corrupt/audio-only/missing input, limit validation, overwrite protection, source hash preservation and variable cadence/nonzero starts. Tests use no private media or API calls. See `../VERIFICATION.md` for release verification.

## Public demo boundary

Publish only reviewed source, documentation, and synthetic generators/tests. Generated media, manifests, payloads, local inputs and result folders are ignored. Do not copy lab data, credentials, tenant photos or prior results here. Do not publish private output simply because its filenames are generic. No GitHub repository or remote is created by this project.

Still frames can miss motion, audio and intermittent problems, as well as details lost through resizing. A pump noise, a brief leak or a jam visible only while moving may disappear completely. Review the original video when those signals matter; selected frames do not establish absence of an issue.

Implementation references: [FFmpeg command options and autorotation](https://ffmpeg.org/ffmpeg.html), [select, showinfo, scale and setpts filters](https://ffmpeg.org/ffmpeg-filters.html).
