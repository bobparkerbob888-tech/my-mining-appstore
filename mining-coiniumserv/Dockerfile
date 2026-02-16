# =============================================================================
# CoiniumServ + Web Dashboard
# Stage 1: Build CoiniumServ from source
# Stage 2: Node.js dashboard + Mono runtime
# =============================================================================

# --- Build CoiniumServ ---
FROM mono:6.12 AS builder
RUN apt-get update && apt-get install -y --no-install-recommends git nuget ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN git clone --depth 1 --branch develop https://github.com/bonesoul/CoiniumServ.git .
RUN nuget restore CoiniumServ.sln && \
    (msbuild /p:Configuration=Release /p:Platform="Any CPU" CoiniumServ.sln || \
     xbuild /p:Configuration=Release CoiniumServ.sln || true)
RUN if [ ! -f src/CoiniumServ/bin/Release/CoiniumServ.exe ]; then \
      cd src/CoiniumServ && (msbuild /p:Configuration=Release CoiniumServ.csproj || xbuild /p:Configuration=Release CoiniumServ.csproj || true); \
    fi
RUN cp -r src/CoiniumServ/web src/CoiniumServ/bin/Release/web 2>/dev/null || true

# --- Runtime: Node 20 + Mono ---
FROM node:20-bookworm-slim

# Install Mono runtime (for CoiniumServ) and curl (for health checks)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gnupg ca-certificates curl && \
    apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 3FA7E0328081BFF6A14DA29AA6A19B38D3D831EF && \
    echo "deb https://download.mono-project.com/repo/debian stable-bookworm main" > /etc/apt/sources.list.d/mono.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends mono-runtime libmono-system-net-http4.0-cil && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy CoiniumServ binary
COPY --from=builder /build/src/CoiniumServ/bin/Release/ /app/coiniumserv/

# Copy web dashboard
COPY web-ui/ /app/web-ui/

# Create data directory
RUN mkdir -p /app/data /app/coiniumserv/config

ENV DATA_DIR=/app/data
ENV NODE_ENV=production

EXPOSE 8080 3333 3334

CMD ["node", "/app/web-ui/server.js"]
