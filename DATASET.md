# Dataset contract, version 1

`dataset.json` is the viewer input. The browser and local adapter share the validator in `dataset.mjs`. Unknown fields are rejected, so raw requests and arbitrary metadata are not copied into normalized datasets. Validation is not anonymization: reviewed free text and asset pixels can still identify people.

Top-level fields:

| Field | Required value |
| --- | --- |
| `schemaVersion` | `1` |
| `datasetType` | `synthetic` or `recorded` |
| `title`, `recordedDate`, `sourceTitle`, `sourceVersion`, `photosNote` | Nonempty strings, at most 2,000 characters |
| `sourceUrl` | Omitted or `null`; external source links are excluded |
| `provenance` | Optional array of at most 20 nonempty strings; explain categories, policy processing and measurement method here |
| `cases` | Array of at most 1,000 cases |

Each case contains `id`, `label`, `sourceLabel`, `optionSet`, `batch`, `photos` and `models`. IDs are unique strings matching `[A-Za-z0-9][A-Za-z0-9_-]{0,63}`. Labels/source labels/option sets/batches are nonempty strings up to 300 characters. All rendered values are escaped, including HTML attributes.

Photos contain exactly `src`, `alt`, `kind` and `publicApproved`. `src` is a path under `assets/` with `.svg`, `.png`, `.jpg`, `.jpeg` or `.webp`; remote URLs, path traversal and fragments are rejected. Alt and kind are strings; publicApproved is a boolean. Synthetic images require `kind: "synthetic illustration"`. An empty array represents missing images. The included originals use `publicApproved: true`; this flag is a dataset declaration, not evidence of consent. Audit replacement SVGs for scripts, external references and embedded content as well as reviewing raster pixels/metadata.

Model keys are `clef`, `flash`, and `openai`. Each needs `status`, `fields` and numeric metrics. Status is `recorded`, `synthetic example` or `unavailable`; synthetic datasets require fictional status and all metrics null. Recorded datasets cannot mark a row fictional.

`fields` allows only Trade, Urgency, Visible symptom, More information, Clarification reason and Hazard flags. Each value is a string up to 2,000 characters or null. Missing fields normalize to null. The app compares category strings; consistent categories are necessary for meaningful comparisons.

Metrics are `inputTokens`, `estimatedCostUsd`, `actualCostUsd`, and `latencyMs`: finite nonnegative numbers or null. Tokens must be safe integers. Missing metrics normalize to null, never zero. Numeric zero is a real zero and displays as `$0.00` for cost. Estimates and actual charge totals are separate; a missing row prevents a complete model total. No current price, billing verification or accuracy claim is inferred.

Adapter: `node adapt-dataset.mjs private/input.json private/new-output.json`. It validates and normalizes only, preserves original input, refuses existing output, makes no provider requests and does not copy assets. Review data and assets independently before loading or publishing them. Preserve neutral timestamp context if images came from video; a video manifest cannot be substituted directly for this contract.
