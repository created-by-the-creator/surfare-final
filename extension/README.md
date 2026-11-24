# Surfare Chrome extension

This desktop Chrome companion adds right-click checks for selected text, links,
images and the current page address. Results and Ask Surfy appear in a side
panel. Right-click checks run locally first. Online help is a separate choice.

## Build and install locally

1. From the repository root, run `npm run extension:build`.
2. Open `chrome://extensions` in desktop Chrome and enable **Developer mode**.
3. Choose **Load unpacked** and select this repository's `extension/dist` folder.
4. Pin Surfare, or right-click content on a webpage and choose its Surfare option.

Chrome 116 or later is required. Reload the extension from `chrome://extensions`
after rebuilding. A ZIP is for transferring or submitting the package; Chrome's
**Load unpacked** option uses the extracted folder.

## Online checks

The default server is `https://surfare.vercel.app`. Deploy the repository's new
`/api/extension` endpoint to that site before testing online detection, Sightengine
or Surfy chat. Existing server-side API credentials apply. Never add API secrets
to this extension or to a `VITE_` setting.

For local API development, set `VITE_EXTENSION_API_ORIGIN` to
`http://127.0.0.1:8790` when building, and run the backend. The build accepts only
the production origin and the two explicitly permitted localhost origins.

The generated unpacked extension ID is `komohncoblpkdbbmkihoeodbncidcjel`.
`identity.js` contains a public Chrome identity key, not a private signing key or
API credential. The gateway accepts this origin. If a future Web Store item has
a different ID, add it to the server's comma-separated `EXTENSION_ALLOWED_IDS`
setting and redeploy.

## Access and limitations

- There are no website content scripts or automatic scans of browsing history.
- Selected content waits in window-specific Chrome session storage until the
  panel receives it. Receipts expire after ten minutes; no submission history is
  saved. Pending data is removed on receipt or when its window closes.
- Image downloads may request access to the image's specific website. Downloads
  omit cookies, reject redirects and enforce an 8 MiB limit. Images requiring a
  login, blob URLs and unsupported formats can be saved and uploaded manually.
- Downloaded image bytes and creation metadata are preserved for the local check.
  Only an explicitly chosen online image check sends a resized copy to Surfare.
- OCR language files and QR workers are packaged for local checks.
- This is a desktop extension. Android uses the installed PWA's Share target;
  iPhone retains the website's paste and upload flow.

## Verification

Run `npm run extension:test`, `npm test`, and `npm run backend:test`.
After building, run `node extension/scripts/smoke.mjs` for browser integration
checks. That script loads the actual unpacked extension in Playwright Chromium
with authored images and mocked online responses. Install its test browser with
`npx playwright install chromium` if needed.

Verify the native right-click menu and side-panel opening manually in desktop
Chrome as well. The extension is not published to the Chrome Web Store by these
commands.
