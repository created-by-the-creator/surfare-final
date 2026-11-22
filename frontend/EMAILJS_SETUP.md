# EmailJS feedback setup

The Feedback form opens automatically when you click **New Check** after a completed check. It sends feedback directly from the browser through EmailJS. No checked message, link, image, QR code, or file content is sent.

## 1. Create the local key file

Copy the example file:

```sh
# Windows
copy .env.example .env.local

# macOS / Linux
cp .env.example .env.local
```

Open `.env.local` and fill in only these values:

```env
VITE_EMAILJS_PUBLIC_KEY=your_public_key_here
VITE_EMAILJS_SERVICE_ID=your_service_id_here
VITE_EMAILJS_TEMPLATE_ID=your_template_id_here
```

Use the **public key** from EmailJS. Do not use the private key in the frontend. `.env.local` is ignored by Git, so it will not be committed.

## 2. Restart the dev server

Vite reads environment variables when it starts. After saving `.env.local`, stop and restart:

```sh
npm run dev
```

## 3. Configure the EmailJS email template

In your EmailJS template, add these variables where you want them in the email:

| Variable | What it contains |
| --- | --- |
| `{{rating}}` | Rating number, 1 to 5 |
| `{{rating_label}}` | Plain-language rating label |
| `{{stars}}` | Star display, for example `★★★☆☆` |
| `{{topic}}` | Selected topic |
| `{{message}}` | Your written feedback |
| `{{name}}` | Optional name, or `Anonymous` |
| `{{email}}` | Optional email, or `Not provided` |
| `{{page}}` | Page address where feedback was sent |
| `{{sent_at}}` | Time the feedback was sent |

## 4. Test it

1. Open `http://localhost:5173/`.
2. Run any check.
3. Click **New Check**.
4. Fill in the form and click **Send feedback**.
5. You should see **Thanks for the feedback**.

## Troubleshooting

- **“Feedback sending is not configured yet.”** — `.env.local` is missing, a value is still a placeholder, or the dev server was not restarted.
- **“Couldn’t send your feedback.”** — check the EmailJS service ID, template ID, public key, and your internet connection.
- **No feedback form after New Check** — the form appears only after a check has produced a result. On a fresh page, New Check just resets the form.
