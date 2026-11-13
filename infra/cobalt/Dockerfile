# Official Cobalt API release. No music-chat application dependencies here.
FROM ghcr.io/imputnet/cobalt:11

# The official image starts with node src/cobalt from /app.
WORKDIR /app

# Independent extractor for publicly available Reels. It runs only if Cobalt
# cannot resolve a URL, with strict time and concurrency limits.
USER root
RUN apk add --no-cache python3 py3-pip \
    && python3 -m venv /opt/yt-dlp \
    && /opt/yt-dlp/bin/pip install --no-cache-dir 'yt-dlp>=2026.7'
USER node

COPY --chown=node:node --chmod=755 infra/cobalt/entrypoint.sh /app/music-chat-entrypoint.sh
COPY --chown=node:node infra/cobalt/gateway.mjs /app/music-chat-gateway.mjs
COPY --chown=node:node infra/cobalt/yt-dlp.mjs /app/music-chat-yt-dlp.mjs

# Render's default public port; API_PORT is assigned in the entrypoint.
EXPOSE 10000
CMD ["/bin/sh", "/app/music-chat-entrypoint.sh"]
