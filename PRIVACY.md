# Public content review

This release contains only reusable source, documentation, tests and three fictional examples with original SVG illustrations. The video fixture generator/tests create colored or test-pattern footage locally; generated media is not tracked. The viewer is saved-result replay and the video extractor is local preprocessing. Neither performs live inference.

Before publishing a replacement dataset or recording a demo:

- Confirm permission for every image, result row and quoted description.
- Inspect pixels for faces, names, addresses, tenant details and identifying surroundings. Generic filenames and stripped metadata do not anonymize pixels.
- Remove private paths/URLs, credentials, account identifiers, raw requests, original filenames, billing records and prior experiment results. Do not copy Site exports, deployment files or old repository history.
- Review all tracked files **and every reachable commit**, including deletions and earlier versions. Use an explicit file allowlist rather than adding a whole working directory.
- Keep private inputs, generated frames, manifests, payloads and results untracked. Review ignored files too when sharing a ZIP or screen.
- Keep unknown usage, costs and timing null. Distinguish fictional examples, saved results, estimates, actual charges and live inference.
- Treat agreement/disagreement as comparison, not correctness. Review original video when motion, sound or intermittent faults matter.

The adapter rejects unknown fields and remote asset paths but does not provide anonymization or a complete privacy audit. The release scanner is an additional check, not a guarantee against every possible secret or identifier.

No provider API integration, credentials, automatic dispatch, telemetry or deployment is included. No open-source license is selected; licensing requires a separate owner decision.
