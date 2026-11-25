# Surfare

Surfare is an offline-first web app for checking suspicious messages, links, images, and QR codes. Detection runs locally. Links use local patterns and bundled reference lists. URL lookup services are not used. Full message text is shared only with the AI help choice. Online image checks have a separate choice to share a resized JPEG with Sightengine; Surfy shares text and recent chat with the configured AI providers and fallbacks. The privacy notice lists these recipients. The compact AI help control identifies the feature as online and opens a short explanation with a link to that notice; it stays off until the user enables it. Offline checks include browser-safe copies of the reviewed platform, phishing-index, gambling-reference and lender-name lists in `src/engine/generated/url-reference-data.js`; regenerate that file with `npm run build:browser-references` after backend reference data changes. Reference matches are review clues and never certify a destination.

The 19.3 MB OCR pack is an optional download, not a first-visit background task. The Content Credentials WASM runtime is loaded when needed and excluded from initial precaching. See the root README for offline preparation and the saved local-message evaluation set.

## Run locally

```sh
npm install
npm run dev
npm test
npm run build
```

Copy `.env.example` to `.env.local` and fill in the EmailJS values only when feedback delivery is configured. The app works without those values; it displays a setup error rather than saving feedback.

## EmailJS feedback template

Set `VITE_EMAILJS_PUBLIC_KEY`, `VITE_EMAILJS_SERVICE_ID`, and `VITE_EMAILJS_TEMPLATE_ID`. The template should use `rating`, `rating_label`, `stars`, `topic`, `message`, `name`, `email`, `page`, and `sent_at`. Checked content is never included in the feedback payload.

## UI screenshots

Start the Vite server, then run `npm run shots` to capture development-only demo states and mobile/wide layouts under `artifacts/screenshots/`. Demo query values have no effect in production builds.

## References and images

App images are mapped in `src/assets.js` and stored under `public/assets/`. Four of the five supplied wireframe crops were available for the UI pass; the feedback-pop-up crop was not attached, so that layout follows the written specification.
