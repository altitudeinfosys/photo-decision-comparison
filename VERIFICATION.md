# Release verification

Checked 2026-10-10 on macOS with Node.js 26.8.1, Python 3.12.4, FFmpeg/ffprobe 9.0.1 and Pillow 12.3.0. No software installation, model API calls or paid inference were used.

## Automated checks

- **10 JavaScript tests passed** using `node --test tests/*.test.mjs`: synthetic fixture shape/null metrics, string IDs/labels, strict fields/local asset paths, all case attributes and gallery aria-label escaping, synthetic illustration/model copy, numeric zero versus unavailable cost, escaped dataset provenance, metric validation, adapter preservation and delegated event safety.
- **10 Python tests passed** using `python3 -m unittest discover -s video/tests -v`: timestamped even sampling and pixels, scene boundary/fallback, duplicates versus distinct colors, static footage, rotation/resizing, dry-run, input limits, overwrite prevention, corrupt/audio-only input, variable cadence/nonzero starts. Original fixture hashes are checked. Fixtures are temporary and synthetic.
- JavaScript syntax checks passed. No external Node packages are required.

## Browser review

Reviewed the original illustration pixels and the local viewer in Chromium at desktop 1440×1000 and mobile 390×844. All included images loaded. There was no horizontal page overflow. Tabs, search, model/difference filters, reset, case navigation, Focus view, Escape and About opening/closing passed interaction checks. Mobile About and Focus controls are accessible rather than hidden. A non-element keyboard event exposed an event-target assumption; it was corrected and covered by a regression test, then browser interaction/console checks passed without errors. Network inspection showed only local static resources and no provider requests.

The three schematic SVGs contain original geometric illustrations and explicit fictional labels. They are interface examples, not visual ground truth for their fictional decisions. Mobile inspection uses a browser viewport, not a physical device or a full accessibility audit. Safari/Firefox and unusual codecs/HDR recordings were not tested; calibrated HDR tone mapping is not implemented. Costs/billing and provider accuracy are not evaluated.

## Content and history boundary

Release staging uses an explicit source/documentation/test/three-SVG allowlist. No generated footage/frames, original photos, manifests/payloads, private data/result rows, Site files or deployment artifacts are included. The history is initialized fresh, with no parent lab or Site history imported. Author metadata uses a generic toolkit name and reserved example address instead of a personal email. All allowlisted bytes, embedded URLs and reachable commits are reviewed before publication. Included external URLs are technical FFmpeg references, the SVG namespace, local setup instructions and a reserved negative-test URL.

No CI workflow or Pages deployment is added. The commands above are reproducible local checks. Remote content and the exact commit SHA are verified separately after publication; this document does not imply deployment, an open-source license, a model benchmark or approval to publish future replacement datasets.
