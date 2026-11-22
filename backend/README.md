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

Optional Visual AI uses free-only image providers. Configure
`OPENROUTER_API_KEY` and/or `GEMINI_API_KEY` as deployment secrets. OpenRouter
is tried first, then Gemini free-tier models `gemini-4-hydrogen` and
`gemini-3.5-flash-lite`. `GEMINI_IMAGE_MODEL` may select one of those two
models; other model names are rejected. No paid model is used.

## Cloudflare Worker

```sh
npm run worker:dev
npm run worker:deploy
```
