# =============================================================================
# CoiniumServ + Web Dashboard
# Stage 1: Build CoiniumServ on Ubuntu 22.04 with Mono from official repo
# Stage 2: Node.js runtime + Mono runtime
# =============================================================================

# --- Build CoiniumServ ---
FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates gnupg git curl && \
    gpg --homedir /tmp --no-default-keyring \
      --keyring gnupg-ring:/usr/share/keyrings/mono-official-archive-keyring.gpg \
      --keyserver hkp://keyserver.ubuntu.com:80 \
      --recv-keys 3FA7E0328081BFF6A14DA29AA6A19B38D3D831EF && \
    chmod +r /usr/share/keyrings/mono-official-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/mono-official-archive-keyring.gpg] https://download.mono-project.com/repo/ubuntu stable-focal main" \
      > /etc/apt/sources.list.d/mono-official-stable.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
      mono-devel nuget msbuild && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone --depth 1 --branch develop https://github.com/bonesoul/CoiniumServ.git .

RUN nuget restore CoiniumServ.sln && \
    (msbuild /p:Configuration=Release /p:Platform="Any CPU" CoiniumServ.sln || \
     msbuild /p:Configuration=Release CoiniumServ.sln || true)

RUN if [ ! -f src/CoiniumServ/bin/Release/CoiniumServ.exe ]; then \
      cd src/CoiniumServ && \
      msbuild /p:Configuration=Release CoiniumServ.csproj || true; \
    fi

RUN cp -r src/CoiniumServ/web src/CoiniumServ/bin/Release/web 2>/dev/null || true

# --- Runtime ---
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js 20 + Mono runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates gnupg curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    gpg --homedir /tmp --no-default-keyring \
      --keyring gnupg-ring:/usr/share/keyrings/mono-official-archive-keyring.gpg \
      --keyserver hkp://keyserver.ubuntu.com:80 \
      --recv-keys 3FA7E0328081BFF6A14DA29AA6A19B38D3D831EF && \
    chmod +r /usr/share/keyrings/mono-official-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/mono-official-archive-keyring.gpg] https://download.mono-project.com/repo/ubuntu stable-focal main" \
      > /etc/apt/sources.list.d/mono-official-stable.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
      nodejs mono-runtime && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /build/src/CoiniumServ/bin/Release/ /app/coiniumserv/
COPY web-ui/ /app/web-ui/

RUN mkdir -p /app/data /app/coiniumserv/config

ENV DATA_DIR=/app/data
ENV NODE_ENV=production

EXPOSE 8080 3333 3334

CMD ["node", "/app/web-ui/server.js"]
