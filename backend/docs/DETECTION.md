# Detector provenance and limits

This headless package transfers the current Surfare prototype's rules, provider prompts and compact SMS model without retraining or threshold changes. The original project is https://github.com/alvarKaixer/surfare-prototype . Its research scripts and historical benchmark reports are not required runtime dependencies and are not imported here.

## Offline model

The model in `lib/models/sms-model.json` was trained from:

1. Almeida, T. & Hidalgo, J. (2011), UCI SMS Spam Collection, DOI https://doi.org/10.24432/C5CC84 , CC BY 4.0.
2. Alexander / Yissuh (2023), Filipino-Spam-SMS-Detection-Model, https://github.com/Yissuh/Filipino-Spam-SMS-Detection-Model , BSD-3-Clause.

Attribution and the preserved BSD license are in `public/licenses/`. Preparation normalized Unicode, masked URLs/numbers for template grouping, removed duplicate normalized templates and conflicting labels, then assigned fixed SHA-256 train/validation/test partitions (70/15/15). Training used unigram/bigram features and naive Bayes coefficients. Runtime inference uses `lib/sms-features.js` and `lib/sms-model.js`.

Spam/ham labels do not establish verified fraud, personal danger or sender identity. The standalone classifier's prior 97.44% score on 860 held-out SMS labels is historical evidence, not a current full-app accuracy claim. Its raw frozen corpus is absent from this import. Development-informed rules were also informed by separate message data with noisy scam/spam categories; those data and any upstream models are not redistributed.

## Current policy

- Local patterns detect combined requests and context, threats, coercion, suspicious URLs and learned spam-like wording.
- The browser applies shared contextual rules and bundled text models first. With online AI help enabled, each supported submission also receives a contextual review. Strong local warnings survive a failed review.
- Multiple weak hints remain Suspicious without a stronger signal.
- Ordinary local non-matches abstain rather than certifying benign meaning.
- AI output must use supported categories and grounded source quotations. Stronger explicit danger and known reputation threats are preserved.
- No reputation match does not prove that a destination is safe.

## Repository datasets and review-signal artifacts

`backend/datasets/manifest.json` records all local text/URL datasets with source path, license status, SHA-256, row count and intended role. It is provenance documentation, not a license grant or an accuracy claim.

- Exact/near-exact matching from `A.S.E.A Taglish scam Dataset.csv` and `PhiUSIIL_Phishing_URL_Dataset.csv` remains unchanged and authoritative over model scores.
- `lib/models/taglish-intent-model.json` and `lib/models/url-risk-model.json` are generated offline by `npm run train:datasets`. They are compact lexical review signals only, not calibrated probabilities or fraud verdicts.
- The text model uses A.S.E.A plus the collected Filipino, Hinglish, IMC25 and deduplicated SMS corpora. Several of these overlap the existing SMS model source, so their held-out scores are not independent validation of that model.
- The URL model uses only URL text from PhiUSIIL. It does not inspect page content, DNS, redirects or reputation. `dataset_phishing.csv` stays `reference-only` because it has no raw URL string.
- Exact known-address checks also use a compact PhishDestroy domain index, PAGCOR public-notice and registered-domain host lists, a small locally reviewed gambling host watchlist, and a small SEC cease-and-desist lender-name list. The registered-domain list is consulted only when the message or web address has gambling context; absence from it is Suspicious, not proof of illegality. Watchlist hosts are flagged even without gambling wording, are not attributed to PAGCOR, and remain Suspicious rather than proven illegal. These are point-in-time references; absence from any list is not approval. The generated PhishDestroy index can be rebuilt with `npm run build:url-index`.
- Both model signals are advisory only: they appear as review evidence but do not change the risk level or score in either the API or the frontend. The existing `sms-pattern` cap is unchanged.
- Verified official domains found in the compact PhishDestroy index are treated as upstream false positives and are not reported as exact known-phishing matches. `maya.ph` was the observed case on 2026-11-22; the live site is operated by Maya and the completed Safe Browsing check reported no threat. This correction does not replace online checks and does not approve a destination.
- PhiUSIIL has conflicting upstream license statements, the A.S.E.A license is unverified here, and the Vrbanic CSV has no license. Do not redistribute those raw datasets or derived artifacts until the source terms are resolved.
- Feedback is never ingested by the training script. A future opt-in path must be designed and approved separately.

## Evaluation scope

Automated regression tests use authored cases and mocked provider responses. Real OCR fixtures are synthetic screenshots, not a representative camera-image benchmark. Neither establishes population accuracy. The migration preserves behavior; it does not claim improved accuracy.

OCR uses English and Filipino language data, retries difficult reads with alternate orientations and contrast, and lets the user correct the text before a new check. QR scans can recover multiple payloads. Credential and payment records stay on the device. URL checks inspect explicit cross-site destinations in the submitted address. The checker does not visit destination pages.

Image-origin checks inspect file details first. When the user selects online visual review, the image is resized for pixel inspection. An additional configured provider can review it independently. A disagreement retains the specific observation as a possible clue. Missing provenance and an inconclusive visual review leave the origin undetermined.

Any overall accuracy claim requires a defined task and population, independently labeled untouched examples, complete online/offline pipeline evaluation, provider failures in the denominator, and per-language/task recall, false alarms, abstentions and uncertainty. Preserve source licenses and document overlap/leakage checks before using repository datasets for a new evaluation.
