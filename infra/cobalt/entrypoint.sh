#!/bin/sh
set -eu

# Only secrets supplied as Render runtime env vars are allowed. Do not put keys
# in source control or publish unauthenticated media tunnels.
: "${COBALT_API_KEY:?Set a UUIDv4 COBALT_API_KEY in Render service Environment.}"

if ! printf '%s' "${COBALT_API_KEY}" | grep -Eq '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'; then
  echo "Invalid COBALT_API_KEY: use an UUID v4. Refusing insecure startup." >&2
  exit 1
fi

: "${RENDER_EXTERNAL_URL:?Render must set RENDER_EXTERNAL_URL.}"
export API_URL="${RENDER_EXTERNAL_URL%/}/"
export API_PORT="10001"
export API_LISTEN_ADDRESS="127.0.0.1"
export API_AUTH_REQUIRED=1
export API_KEY_URL="file:///tmp/music-chat-keys.json"
export RATELIMIT_MAX="10"
export RATELIMIT_WINDOW="60"
export TUNNEL_RATELIMIT_MAX="30"
export TUNNEL_RATELIMIT_WINDOW="60"
export CORS_WILDCARD=0
export CORS_URL="https://musicaschatt.lovable.app"

# Allowed services are restricted to Instagram, with conservative rate
# limits. Cobalt expects a JSON mapping from a UUIDv4 key to its policy.
umask 077
printf '{"%s":{"name":"music-chat","limit":10,"allowedServices":["instagram"]}}\n' "${COBALT_API_KEY}" > /tmp/music-chat-keys.json

echo "Starting authenticated Cobalt API for the Music Chat player."
exec node /app/music-chat-gateway.mjs
