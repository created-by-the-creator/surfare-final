SURFARE 300 LOCAL + 300 ONLINE CHECKS

Contents
- cases.json: all 300 frozen labeled input instances, source IDs, image filenames and SHA-256 hashes.
- results.csv: all 300 paired local/online results; includes expected and actual OCR text.
- metrics.csv: local, online-mode including fallback, and completed-AI-only metrics by modality.
- local.json / online.json: raw detector outputs, statuses, timings and provider identifiers.
- samples/: exact 75 screenshot PNGs and 75 QR PNGs used in this run. The file column in cases.json and results.csv is the filename inside samples/.
- manifest.json and runtime-hashes.json: input-set hash, source hashes, source role and runtime fingerprints.
- Case-set hash uses UTF-8 text with line endings normalized to LF. metrics.json also includes the SHA-256 of the exact file bytes, which use Windows CRLF in this run.
- scripts/: archival copies of the evaluation harness; contains no credentials.

Interpretation
300 instances per mode = 75 messages, 75 links, 75 QR files and 75 screenshots.
Each modality has 38 expected warnings and 37 expected no-warning labels.
There are 150 distinct source texts/URLs, deliberately reused across formats and between local and online runs.
149 source contents reuse synthetic development examples; one prize-fee case was newly authored.
These are not independently collected real user submissions or independent real-world accuracy estimates.
Unknown/uncertain means no warning for the binary alarm decision, not verified safe.
The completed-AI subset still measures the combined backend outcome, not an isolated provider prediction.
Online mode can return local fallback. Use onlineStatus=completed to isolate external AI reviews.
Provider quota failures and policy skips are retained; none is relabeled a completed AI review.
The image task measures text safety after actual browser OCR; it does not measure AI-image origin classification.

Rerun in the Surfare source repository
Keep the scripts under artifacts/, install project dependencies, and make the configured providers available for online requests.
1. python artifacts/evaluation300-prepare.py
2. npm.cmd run dev --workspace frontend -- --host 127.0.0.1
3. node artifacts/evaluation300-local.mjs
4. node --env-file=backend/.dev.vars artifacts/evaluation300-online.mjs
5. python artifacts/evaluation300-report.py
Online run resumes existing online.json rows. Before a new full run, archive or rename the existing artifacts/evaluation-300 directory rather than mixing dates.
Preparing afresh regenerates the deterministic image assets in artifacts/evaluation-300/. Original assets from this run are preserved in samples/.
Python dependencies used: matplotlib, Pillow, opencv-python. Browser: desktop Chrome through Playwright.
Online requests consume configured service quota; provider behavior and results may change on a later run.
