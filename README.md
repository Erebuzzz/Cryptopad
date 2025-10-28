# Cryptopad - End-to-End Encrypted Text Sharing

[![Vercel](https://img.shields.io/badge/Vercel-ready-black?logo=vercel)](https://vercel.com)
[![Zeabur](https://img.shields.io/badge/Zeabur-api%20host-5b8bf7)](https://zeabur.com)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Cryptopad lets you jot down something sensitive, encrypt it entirely in the browser, and share a link that self-destructs after it is opened or when its timer runs out. No databases, no analytics scripts, no passive copies left behind.

## Highlights

- **Client-side AES-256 + HMAC** on every note. The API only ever sees an authenticated cipher blob.
- **Password or link secrets** – derive keys with PBKDF2 or bundle a one-time share key into the URL.
- **Burn-after-read** plus timed expiry (10 min, 1 hr, 24 hrs, 3 days) with optional local fallback for dev work.
- **Team vault mode** keeps a note alive for a limited number of views and lets you torch it manually once everyone is done.
- **Scheduled burns** let you pick an exact expiry timestamp (up to 7 days out) when you need to coordinate reveals.
- **Delivery helpers** generate email/SMS drafts and copy-ready summaries so sharing stays quick but still secure.
- **Contrast toggle** offers a high-contrast sheet for bright rooms without rebuilding the interface from scratch.
- **Zeabur edge worker** keeps encrypted payloads in memory and sweeps expired entries every minute.
- **Glassmorphism UI** built with Next.js App Router + Tailwind, tuned for quick sharing.


## Getting Started

### Frontend (Next.js on Vercel or local)

```bash
# install dependencies
npm install

# copy env template and adjust if you already deployed the API
cp .env.example .env.local

# start the dev server
npm run dev
```

Cryptopad lives at `http://localhost:3000` in development. If you do not have the Zeabur API running yet the app falls back to an in-browser stash so you can still test the flow end-to-end.

### Backend (Express on Zeabur or locally)

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

The API listens on port `8787` by default and only holds encrypted payloads in memory. Point the frontend at it by setting `NEXT_PUBLIC_API_BASE_URL=http://localhost:8787`.

## How It Works

1. The browser sanitises the note, then either generates a random 256-bit key or derives one from a password using PBKDF2.
2. The message is encrypted with `crypto-js` AES-256 and sealed with an HMAC so tampering is detected before decryption.
3. Only the cipher text and metadata (id, expiry, burn-after-read) travel to the backend. Secrets never leave the browser.
4. The Zeabur worker stores the payload in an in-memory map. Entries vanish after a single fetch or once the scheduled expiry window elapses.
5. The viewer fetches the cipher, inspects whether it needs the shared password or URL key, decrypts locally, and fades the note out while filing the burn notice.

### Scheduling expiries

In the composer choose **Schedule** to swap the preset dropdown for a calendar/time picker. Cryptopad enforces a minimum 5 minute window and caps scheduled burns to seven days, with inline guidance if you drift outside that range.

### Team vault mode

Flip the composer to **Team vault** to keep the cipher around for a handful of collaborators. Pick how many views you want to allow (between 2 and 50). Each open consumes a slot, and the viewer exposes a **Burn now** button so the last reader can nuke the note before the timer hits.

### Delivery helpers

After a note is generated the share card offers:

- **Copy summary** – a preformatted snippet noting password status, remaining views, and expiry.
- **Email draft** – launches your default mail client with the summary prefilled.
- **SMS draft** – opens a mobile-friendly draft with the same secure wording.

Use all of them with caution: remember to share passwords via a separate channel.

### Contrast & accessibility

Tap the floating toggle to swap between the default midnight glassmorphism palette and a brighter high-contrast theme. Cryptopad remembers your choice and respects system preferences on first load.

### Encryption modes

- **Link secret**: Cryptopad generates a 256-bit key, stashes it in the `key` query string, and returns the link. Anyone with the full URL can open the note exactly once.
- **Password protected**: The user supplies a passphrase. Cryptopad derives a key with PBKDF2 (310k iterations) and signs the payload with an HMAC. The password never leaves the browser; the link can only be unlocked with the shared passphrase.

If the payload is tampered with or the key is wrong, the HMAC check fails and the viewer shows a friendly error instead of decrypted gibberish.

## Deployment Notes

- **Vercel**: push `main` and connect the repo. No extra build steps are required. Set `NEXT_PUBLIC_API_BASE_URL` in the project environment variables.
- **Zeabur**: create a Node.js service, point it at `/server`, and configure the `.env` variables (`PORT`, `ALLOWED_ORIGINS`, `MAX_MINUTES`, `DEFAULT_VIEWS`). The process is stateless; Zeabur keeps it warm enough for ephemeral storage.
- **Security checklist**:
	- Always share links over HTTPS so the key in the query stays encrypted on the wire.
	- Remind users that anyone who gets the URL (including the key) can open the note once before it burns.
		- The optional local fallback is strictly for development - production should always hit the Zeabur API.

## Project Layout

```
src/
	app/
		page.tsx           # composer landing page
		view/page.tsx      # decrypt-and-view route
		globals.css        # shared styling primitives
	components/
		message-composer.tsx
		share-link-card.tsx
		message-viewer.tsx
	lib/
		message-service.ts # fetch + persistence helpers
	utils/
		encryption.ts      # AES helpers (generate/encrypt/decrypt)
server/
	index.js             # lightweight Express API for Zeabur
```

## Roadmap Ideas

- PWA shell so the viewer works offline once the assets are cached.
- Theming presets and accessibility contrast toggles.
- Slack slash command that spins up a one-view link right inside the chat.

## License

MIT - see [LICENSE](LICENSE) if you want to remix or extend Cryptopad.
