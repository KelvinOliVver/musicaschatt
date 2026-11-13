# Official Cobalt API release. No music-chat application dependencies here.
FROM ghcr.io/imputnet/cobalt:11

# The official image starts with node src/cobalt from /app.
WORKDIR /app
COPY --chown=node:node --chmod=755 infra/cobalt/entrypoint.sh /app/music-chat-entrypoint.sh
COPY --chown=node:node infra/cobalt/gateway.mjs /app/music-chat-gateway.mjs

# Render's default public port; API_PORT is assigned in the entrypoint.
EXPOSE 10000
CMD ["/bin/sh", "/app/music-chat-entrypoint.sh"]
