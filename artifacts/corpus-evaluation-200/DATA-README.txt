SURFARE DATASET-SOURCE EVALUATION - 200 LOCAL + SAME 200 AI-MODE INPUTS
The two-page Results PDF is intended for quick presentation. The Samples PDF contains every source input and result.
cases.json is the frozen 200-case selection; SHA-256 is in manifest.json. There are 200 distinct normalized template/domain groups and distinct input texts.
No detector predictions were used for selection. Hash-order quotas and exclusions are documented by corpus200-prepare.mjs.
samples-and-results.csv contains all source paths/record numbers, original labels, original text hashes, redactions, input texts, extraction outputs, and local/backend/AI results.
Positive = source-labeled scam/phishing. Negative = source-labeled legitimate/ham. Generic spam is excluded.
All source snapshots matched the repository manifest hashes. The records overlap model training/reference data, so this is not an independent or blind real-world test.
Hinglish samples are English UCI-matched ham; this avoids passing hand-written Hinglish examples off as collected messages.
sourceRecord indexes parsed CSV records including the header, or one-based JSON rows. Source file hashes identify the snapshots.
AI-mode outcome is the combined backend output. onlineStatus=completed means a provider review completed; unavailable reviews and policy skips are not counted as completed AI successes.
backend-local.json provides the same backend with AI disabled and network forbidden, so backend reference differences are not wrongly attributed entirely to AI.
Unknown/no warning on a positive counts as a missed warning. Uncertain negatives are counted as no warning, not verified safe. Extraction failures receive no correctness credit.
samples/ contains the exact 50 QR and 50 screenshot PNGs. These are controlled renderings of corpus content, not collected photographs.
Original dataset URLs were never visited. Phone/email/long identifiers/titled names were masked where recognized; these transformations can affect detection.
Provider IDs, models, timings, local extraction confidence and statuses are saved in the raw JSON.
Runtime fingerprints are in runtime-hashes.json. No model/rule/threshold changes were made during the run.
Licensed-source and overlap caveats are stated in the Samples PDF and source notices. This is an internal project evidence packet; individual message labels were not independently human-adjudicated.
Run the archived scripts from artifacts/ in the Surfare repository. The prepare step refuses to overwrite frozen cases. Online script resumes already recorded rows. Use a new run directory for a new full test.
Python dependencies: matplotlib, Pillow, OpenCV. Node dependencies: existing project workspace packages and Chrome via Playwright. Online credentials are intentionally excluded from this archive.
