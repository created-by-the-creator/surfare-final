# Local detector robustness challenge

Run `npm run test:local-generalization` from the repository root. This also runs as part of `npm test`. `cases.json` contains 50 authored messages and 100 authored URLs. `baseline.json` records behavior before this improvement round; `latest.json` records current behavior with the same case hash. The test forbids networking and checks the actual browser detection path, including grounded evidence spans.

| Synthetic development cases | Before | After |
| --- | ---: | ---: |
| Scam messages flagged | 14 / 19 | 19 / 19 |
| Legitimate message false alarms | 3 / 28 | 0 / 28 |
| Commercial spam controls flagged | 0 / 3 | 0 / 3 |
| Reviewable URL structures flagged | 38 / 50 | 50 / 50 |
| Ordinary URL structure false alarms | 4 / 50 | 0 / 50 |

These are functional development checks, **not independent model accuracy or evidence of universal scam detection**. The new cases were written before this round of edits, then inspected to guide development. Thirty messages came from the project's existing authored challenge; twenty are newly authored. None is a newly collected real conversation. The URL labels mean the structure deserves review, not that the site was verified malicious. For example, numeric hosts and short links can have legitimate uses; ordinary-looking URLs can serve harmful content. No test URL is visited.

The original corpus-labeled 100-message set remains separate, with unchanged labels and a 43/50 scam catch count. Seven ambiguous source-labeled cases remain unflagged; see its label-review file. Do not combine these sets into a single marketing accuracy percentage.

The improvements cover delivery identity-verification wording, paid-work selection, new-number family requests, gift-card prize fees, explicit fee waivers, common Unicode brand lookalikes, encoded executable paths, and nested encoded redirect destinations. The URL expansion is bounded by depth and count and never follows a network redirect. Common Unicode substitutions are a small subset, not a complete implementation of Unicode security mechanisms.

Additional backend tests mutate message case, amounts, domains and greetings; compare the local Punycode decoder with Node's Unicode conversion for multiple writing systems; check malformed encodings and expansion limits; and ensure a waived fee cannot hide a separate active demand. These checks do not retrain the model or change its score thresholds. No exact-message exceptions or new blocklist entries were added to achieve these results.

The next evidence needed is an independently collected, anonymized and human-reviewed test set, grouped by source and message template so the same campaigns cannot appear in both training and evaluation. For stronger language understanding, compare a compact multilingual on-device classifier against this rule baseline on a separate held-out set; keep model downloads optional and choose its threshold using a false-alarm limit on validation data. The current dataset model remains advisory because a stronger runtime role needs that validation.

Technical references: [Unicode UTS #39](https://unicode.org/reports/tr39/), [Punycode RFC 3492](https://www.rfc-editor.org/rfc/rfc3492), [URL hostname behavior](https://developer.mozilla.org/en-US/docs/Web/API/URL/hostname). `backend/scripts/build-generalization-challenge.mjs` records how the synthetic cases were assembled; do not regenerate them or overwrite the baseline to hide a regression.
