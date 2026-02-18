# YIIMP Mining Pool for Umbrel

Mine **BTC, LTC, DOGE, NMC & PEPE** from one dashboard with merge mining.

- **SHA256 pool** (port 3333) — Bitcoin + Namecoin merge mining
- **Scrypt pool** (port 3434) — Litecoin + Dogecoin + Pepecoin merge mining
- BIP310 ASICBoost / version-rolling support
- Segwit (bech32) address support
- Built-in vardiff stratum

---

## Install on Umbrel

### Step 1: Add Community App Store

1. Open your Umbrel dashboard
2. Go to **App Store**
3. Click the **⋯** menu (top-right)
4. Click **Community App Stores**
5. Paste this URL:
   ```
   https://github.com/bobparkerbob888-tech/my-mining-appstore
   ```
6. Click **Add**

### Step 2: Install

1. Find **Mining Pool Apps** in the App Store sidebar
2. Click **CoiniumServ Mining Pool** → **Install**
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
| Bitcoin Core | lncm/bitcoind:v27.2 | SHA256 parent chain |
| Namecoin Core | sevenrats/namecoin-core | SHA256 aux chain (merge-mined) |
| Litecoin Core | uphold/litecoin-core:0.21 | Scrypt parent chain |
| Dogecoin Core | casperstack/dogecoin | Scrypt aux chain (merge-mined) |
| Pepecoin Core | pepeenthusiast/pepecoin-core | Scrypt aux chain (merge-mined) |
| Redis | redis:6-alpine | Share & stats storage |
| MariaDB | mysql:5.7 | Pool database |
| Web Dashboard | coiniumserv-mining-pool | Pool status & management |

---

## Troubleshooting

**Blockchain sync takes forever?**
Normal on first run. BTC can take several days. LTC/DOGE/NMC/PEPE take hours to a day.

**Image build fails?**
Go to repo Settings → Actions → General → set "Workflow permissions" to "Read and write" → re-run.
