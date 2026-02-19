# YIIMP Mining Pool for Umbrel

Mine **BTC, LTC, DOGE, NMC & PEPE** from one dashboard with merge mining.

- **SHA256 stratum** (port 3333) — Bitcoin + Namecoin merge mining
- **Scrypt stratum** (port 3434) — Litecoin + Dogecoin + Pepecoin merge mining
- BIP310 ASICBoost / version-rolling support
- Segwit (bech32) address support
- Built-in vardiff stratum

---

## Install on Umbrel

### Step 1: Add Community App Store

1. Open your Umbrel dashboard
2. Go to **App Store**
3. Click the **...** menu (top-right)
4. Click **Community App Stores**
5. Paste this URL:
   ```
   https://github.com/bobparkerbob888-tech/my-mining-appstore
   ```
6. Click **Add**

### Step 2: Install

1. Find **Mining Pool Apps** in the App Store sidebar
2. Click **YIIMP Mining Pool** -> **Install**
3. Wait for blockchain sync (BTC takes days, LTC/DOGE/NMC/PEPE take hours)

---

## Miner Setup

| Miner Type | Stratum URL | Earns |
|---|---|---|
| SHA256 ASIC (S19, S21, etc.) | `stratum+tcp://umbrel.local:3333` | BTC + NMC |
| Scrypt ASIC (L7, L9, etc.) | `stratum+tcp://umbrel.local:3434` | LTC + DOGE + PEPE |

- **Username**: your wallet address
- **Password**: `x`

---

## What's Included

| Service | Image | Purpose |
|---|---|---|
| YIIMP Pool | Runs natively on host | Stratum server + web UI |
| Bitcoin Core | lncm/bitcoind:v27.2 | SHA256 parent chain |
| Namecoin Core | sevenrats/namecoin-core | SHA256 aux chain (merge-mined) |
| Litecoin Core | uphold/litecoin-core:0.21 | Scrypt parent chain |
| Dogecoin Core | casperstack/dogecoin | Scrypt aux chain (merge-mined) |
| Pepecoin Core | pepeenthusiast/pepecoin-core | Scrypt aux chain (merge-mined) |
| App Proxy | getumbrel/app-proxy:1.0.0 | Routes Umbrel dashboard to YIIMP web UI |

---

## Architecture

YIIMP runs natively on the host (not in Docker). The Docker compose provides:
- **app_proxy** — connects the Umbrel dashboard to YIIMP's web UI on port 8888
- **5 coin daemons** — BTC, NMC, LTC, DOGE, PEPE running in Docker containers

The YIIMP stratum binary handles mining connections directly on ports 3333 (SHA256) and 3434 (Scrypt).

---

## Troubleshooting

**Blockchain sync takes forever?**
Normal on first run. BTC can take several days. LTC/DOGE take about a day. NMC/PEPE take hours.

**Pool not showing on Umbrel home screen?**
Make sure the app_proxy container is running: `docker ps | grep app_proxy`
