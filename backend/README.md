# Surfare Backend

This backend provides the local detection API and can also be deployed as a Cloudflare Worker.

## Local API

Requires Node.js 22.13 or newer.

```sh
npm install
npm run dev
```

The API is available at `http://127.0.0.1:8790`.

- `GET /api/health`
- `POST /api/detect`
- `GET/POST /api/assess`
- `GET/POST /api/verify`
- `GET/POST /api/image-assess`
- `POST /api/feedback`

Optional online verification for `POST /api/detect` is enabled by setting
`GOOGLE_SAFE_BROWSING_API_KEY` and sending `"online": true`. A completed check
with no reported threat can suppress only weak name-lookalike warnings; exact
list matches and all other warnings remain. A no-match result is not proof that
a site is legitimate, and unavailable checks leave the original warnings in
place.

## Cloudflare Worker

```sh
npm run worker:dev
npm run worker:deploy
```
