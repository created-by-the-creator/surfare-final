SURFARE OFFLINE DETECTOR IMPROVEMENTS

The PDF and PNG charts show the unchanged 200-case development benchmark before/after, plus a 400-case confirmation set.
updated-local-results.csv contains all 600 final evaluated cases, with source record numbers, original labels, actual extracted text, outcomes and signal IDs.
development-200/ contains the original cases and before-results. Its labels and input text were not replaced to improve scores.
confirmation-400/ contains 400 different normalized-template/domain groups, disjoint from both the 200-case benchmark and the earlier 400-case development audit.
development-audit-400/ preserves the first integration's 85% audit result. That cohort was then used for development and is not claimed as untouched confirmation data.
All source corpora overlap Surfare training or reference material. Exact URL matches cover the full source-labeled phishing class, not only test addresses. This is not an independent real-world validation or a universal 90% accuracy guarantee.
Unknown results count as no warning for this binary alert task, not as proof of safety. Source labels may be noisy, and privacy redactions can affect detection.
QR and screenshot PNGs are controlled renderings of corpus content, not independently collected camera images. Source and file hashes are retained in the accompanying manifests.
Some samples contain phishing addresses: inspect the text without opening or scanning their destinations.
The original model weights and thresholds, online providers and backend runtime were unchanged. The local classifier has additional context safeguards, an exact offline URL index, and OCR matching normalization with original-character evidence maps.
production-offline-smoke.json records a production service-worker reload with Chrome networking disabled, followed by local message/URL checks with zero API requests.
Source notices and the full preserved Filipino dataset license are under documentation/. Use the data for internal project review and retain source attribution and limitations.
