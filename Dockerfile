# ── Build stage ──────────────────────────────────────────────
FROM oven/bun:latest AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build
RUN bun server/bundle-dist.ts
RUN bun build server/main.ts --compile --target=bun-linux-x64 --outfile /release/crossdraw-server

# ── Runtime stage ────────────────────────────────────────────
FROM gcr.io/distroless/base-debian12
COPY --from=builder /release/crossdraw-server /app/server
EXPOSE 3000
VOLUME ["/app/data"]
ENTRYPOINT ["/app/server"]
