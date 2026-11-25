# Local message regression set

Open **messages.csv** in Excel or Google Sheets to use the saved test set. **messages.json** contains the same 100 messages with source metadata. There are 50 source-labeled scams and 50 source-labeled legitimate messages. The supplementary file contains 20 explicitly synthetic cases for family impersonation, advance loan fees, parcel COD fees, school announcements, and benign controls.

**results.csv** pairs each core message with its latest offline verdict, warning status and signal IDs. Use it to review the missed scams alongside the original source labels.

Run from the repository root:

```sh
npm run test:local-messages
```

The same check also runs automatically in `npm test`. It calls the browser's real offline detection path with networking forbidden. It compares against the historical baseline and `accepted.json`, which records the improved results and supplemental controls. It fails if a previously caught scam is newly missed or a previously unflagged legitimate message gains a warning. Each run writes `latest.json`, including every verdict and signal, so misses remain visible. The frozen case hash prevents silent replacement of the test cases. Supplemental results are reported separately.

## Before and after

The baseline uses the code from commit `e29a187`; the latest report uses the working implementation. Both use the same redacted messages and have the same dataset hash. A flagged message has a Suspicious or High risk verdict. Both Low risk and Not enough info count as misses on a source-labeled scam.

| Core messages | Original baseline | Mentor-feedback changes | Generalization improvements |
| --- | ---: | ---: | ---: |
| Scams flagged | 29 / 50 | 41 / 50 | 43 / 50 |
| Scams missed | 21 / 50 | 9 / 50 | 7 / 50 |
| Legitimate messages flagged (false alarms) | 0 / 50 | 0 / 50 | 0 / 50 |
| Legitimate messages shown as Low risk | 0 / 50 | 50 / 50 | 50 / 50 |
| Legitimate messages shown as uncertain | 50 / 50 | 0 / 50 | 0 / 50 |

These are development regression results, **not independent real-world accuracy measurements**. Seven source-labeled scams still receive Low risk. They lack enough fraud evidence in their saved redacted text; the source labels remain unchanged. `label-review.json` records those disputed cases for human review. A low-risk verdict means no strong warning signs matched; it does not authenticate a message or sender. See the separate [generalization challenge](../generalization/README.md) for URL and message robustness results.

## Provenance and limits

- The core examples come from the repository's A.S.E.A Taglish corpus and Filipino Spam SMS dataset. Exact file paths, record numbers, original labels, source links, licenses and SHA-256 hashes are saved in `messages.json`. Record numbers refer to parsed CSV records including the header, not physical lines; quoted messages may span lines.
- These source corpora already overlap the detector's model training or reference data. This set must not be described as an unseen holdout or independently verified collection of 100 real conversations. Sender authenticity has not been checked. Some A.S.E.A labels are noisy: several recruiting messages lack enough evidence to establish fraud. Keep these visible for mentor review rather than treating the source label as proven fact.
- Names, phone numbers, email addresses and long numeric identifiers are redacted where recognized. Redaction can affect the model, so evaluate the saved redacted text consistently. Reported domains remain as plain fixture strings for detection; the benchmark does not visit them.
- The core set covers parcel messages, bank/wallet phishing, task/job messages, prizes, OTP/security notices, shopping/delivery notices and ordinary messages. The available corpora did not supply enough verified family-new-number, loan-fee, COD-fee or school-announcement examples; those gaps are represented by the separately labeled synthetic file. Obtaining independently verified, anonymized local messages in those categories remains future collection work.
- The A.S.E.A license is unverified in the repository manifest. Keep this material for the project's internal research; confirm source permissions before publicly redistributing the examples. The Filipino corpus is recorded as BSD-3-Clause; preserve its attribution and source terms.

Sources: [A.S.E.A project](https://github.com/ChrisThePCGamer/asea-sms-scam-detection), [Filipino Spam SMS project by Alexander/Yissuh and TUP-M students (2023)](https://github.com/Yissuh/Filipino-Spam-SMS-Detection-Model). Pattern references for synthetic examples are listed in `supplemental.json`; those advisories are not sources of verbatim received messages.

## Maintaining the set

Review disputed labels with the mentor and record the rationale before creating a new version. Keep the old version and its baseline for comparison. Do not tune thresholds to maximize this small set's score. Add independently collected messages in a separate version, remove overlap by message template and source, and have labels reviewed before evaluation.

`backend/scripts/build-local-message-test-set.mjs` documents how the core cases were selected and redacted. Do not regenerate or overwrite the frozen baseline as part of a normal detector change. `baseline.json` is the pre-change reference; `latest.json` is the current result.
