# =============================================================================
# CoiniumServ + Web Dashboard
# Stage 1: Build CoiniumServ on Ubuntu 22.04 with Mono
# Stage 2: Node.js + Mono runtime
# =============================================================================

FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

# Install Mono build tools from official Ubuntu-focal repo
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

# Build - try solution then project level
RUN nuget restore CoiniumServ.sln && \
    msbuild /p:Configuration=Release /p:Platform="Any CPU" CoiniumServ.sln || \
    msbuild /p:Configuration=Release CoiniumServ.sln || \
    (cd src/CoiniumServ && msbuild /p:Configuration=Release CoiniumServ.csproj) || true

# Collect output: find CoiniumServ.exe wherever it ended up and copy to /output
RUN mkdir -p /output && \
    EXE=$(find /build -name "CoiniumServ.exe" -type f | head -1) && \
    if [ -n "$EXE" ]; then \
      EXEDIR=$(dirname "$EXE") && \
      cp -r "$EXEDIR"/* /output/ && \
      echo "Found build output at: $EXEDIR"; \
    else \
      echo "WARNING: CoiniumServ.exe not found, pool binary will be missing" && \
      touch /output/.build-failed; \
    fi

# Copy web frontend
RUN cp -r /build/src/CoiniumServ/web /output/web 2>/dev/null || \
    cp -r /build/web /output/web 2>/dev/null || true

# --- Runtime ---
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

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

# Copy build output from /output (guaranteed to exist)
COPY --from=builder /output/ /app/coiniumserv/
COPY web-ui/ /app/web-ui/

RUN mkdir -p /app/data /app/coiniumserv/config

ENV DATA_DIR=/app/data
ENV NODE_ENV=production

EXPOSE 8080 3333 3334

CMD ["node", "/app/web-ui/server.js"]
