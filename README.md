# Photo Decision Comparison

A local toolkit for exploring saved image decisions and preparing frames from short videos. The public sample contains **three fictional examples and original SVG illustrations**. No real provider results, private photos, credentials or source-service links are included.

## Start the viewer

Requires a current browser and Python 3.10+ (or any static HTTP server). No build, npm installation or model account is required.

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000`. The browser loads only local `dataset.json`, scripts, styles and assets. The four views are images, Clef results, OpenAI results, and comparison. Search, filter differing fields, switch the Clef variant, select cases, and open About for dataset provenance. Arrow keys navigate cases; Focus view and Escape support presentation.

The sample outputs are fictional interface examples. They do not show measured model performance. Costs, input tokens, actual charges and latency are `null` and display as unavailable. This is saved-result replay, **not live inference**. The app has no provider integrations, API credentials, paid calls or work dispatch.

## Bring an authorized dataset

See [DATASET.md](DATASET.md). Node.js 20+ is needed only for the local adapter and viewer tests. No external Node packages are required.

```sh
node adapt-dataset.mjs private/input.json private/validated.json
```

The adapter validates a strict field allowlist and writes a new file without overwriting input or existing output. It does not fetch results, copy images, anonymize text/pixels, establish consent, or call providers. Use a separate local copy of the viewer for private datasets. Keep your private files out of Git; never replace the public synthetic sample without a fresh permission/privacy review.

## Prepare video frames locally

See [video/README.md](video/README.md). Requires Python, FFmpeg/ffprobe 7+ and Pillow (listed in `video/requirements.txt`). Nothing is installed automatically. Check your environment before deciding whether installation is needed.

```sh
python3 video/video_frames.py /path/to/video.mov --output outputs/check-01 --dry-run
python3 video/video_frames.py /path/to/video.mov --output outputs/check-01
python3 video/video_frames.py /path/to/video.mov --output outputs/check-02 \
  --selection scene --deduplicate --count 4
```

The extractor defaults to four timestamped JPEGs, a labeled contact sheet and a relative-path manifest. It handles rotation, enforces input/output limits, preserves original files, refuses existing outputs and stays offline. Its manifest is a preprocessing handoff, not a viewer dataset or provider request; explicitly associate selected frames and separately saved decision rows through your own adapter.

Still frames can miss **motion, audio and intermittent problems**, as well as detail lost in resizing. Scene changes and duplicate filtering are heuristics. Review original footage when those signals matter. Agreement between outputs does not establish accuracy; the fictional sample has no verified answer labels or benchmark claim.

## Tests

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s video/tests -v
```

The Python tests generate temporary synthetic footage only. The JavaScript tests validate data types, local assets, attribute escaping, synthetic copy, provenance, missing/zero cost behavior and adapter preservation. [VERIFICATION.md](VERIFICATION.md) records release checks and limits. No GitHub Pages deployment is configured.

## Privacy and licensing

Read [PRIVACY.md](PRIVACY.md) before sharing source, data or screens. Publishing a repository does not authorize sharing replacement photos/results. Ignore rules help prevent accidents but do not prove privacy.

**No open-source license has been selected or granted by this repository.** Public visibility does not itself grant an open-source license. The owner must choose licensing terms separately; no `LICENSE` file is included.
