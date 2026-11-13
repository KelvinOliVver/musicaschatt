# Render Cobalt for Music Chat

This is a minimal authenticated Cobalt API deployment for public Instagram
Reels requested by viewers of the Music Chat stream. It uses the official
`ghcr.io/imputnet/cobalt:11` image, not a third-party hosted API.

## Render service setup

- Source repo: `https://github.com/KelvinOliVver/musicaschatt`
- Branch: `infra/cobalt-render-20261113`
- Runtime: `docker`
- Dockerfile: `infra/cobalt/Dockerfile`, context `.`
- Plan: Free for testing only (hibernates, slow cold starts, egress limits)
- Region: Virginia (closest Render option to Brazil; actual network ping may vary)
- Port: `10000` (Render injects `PORT`)
- Environment: `COBALT_API_KEY=<private UUIDv4>` (required)
- `API_URL` is derived from Render's public `RENDER_EXTERNAL_URL`
- `API_AUTH_REQUIRED=1`, endpoint automatically restricted to Instagram,
  with conservative per-key rate limits.

Cobalt **must not** become a public unauthenticated download proxy.
The API key is never committed or sent to a browser-side Vite variable.

## Music Chat configuration

The existing server function `src/lib/instagram-video-fit.functions.ts`
checks:

- `COBALT_API_URL=https://<service>.onrender.com`
- `COBALT_API_KEY=<same UUIDv4 used above>`

Both must be injected into the **TanStack Start server** running Music Chat.
Supabase Edge Function secrets and Render environment variables are NOT
automatically passed to Lovable's application SSR runtime. Until the
correct runtime receives both variables, the fallback Instagram embed remains.

Never expose the key as `VITE_COBALT_API_KEY` or a public JSON endpoint.

## Test

1. Check that the Render service is **Live**.
2. `GET /` is a public health/status endpoint.
3. Without a key, `POST /` must reject requests.
4. With the key, `POST /` for a publicly accessible Reel may return a
   media URL (status `tunnel` or `redirect`). The link is temporary.
5. Configure backend env and publish Music Chat. Test with one accessible
   Reel and one blocked Reel. A failed resolver always falls back safely,
   preserving playback controls for the streamer.

## Real-world limits

- Cobalt may fail if Meta requires login/cookies or restricts content.
- Free Render services hibernate after inactivity and can take roughly a
  minute to restart, causing a timeout in the current Music Chat resolver.
  For reliable live playback a paid always-on service may be necessary,
  but **do not upgrade without approval**.
- Obey content owners' rights and each platform's terms.
