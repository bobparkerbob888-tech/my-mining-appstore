# CoiniumServ Mining Pool for Umbrel

Mine BTC, LTC & DOGE from one dashboard with merge mining.

---

## Setup (all in your browser, no terminal needed)

### Step 1: Fork this repo

Click the **"Fork"** button at the top-right of this page.  
This creates your own copy under your GitHub account.

### Step 2: Edit one line

In YOUR forked copy, open the file:  
**`mining-coiniumserv/docker-compose.yml`**

Click the ✏️ pencil icon to edit it.

Find this line (around line 85):
```
    image: ghcr.io/GITHUB_USERNAME/coiniumserv-mining-pool:latest
```

Replace `GITHUB_USERNAME` with **your actual GitHub username** (lowercase).  
For example, if your username is `johndoe`:
```
    image: ghcr.io/johndoe/coiniumserv-mining-pool:latest
```

Click **"Commit changes"**.

### Step 3: Wait for the image to build

After you commit, GitHub automatically builds the Docker image for you.  
Click the **"Actions"** tab at the top of your repo to watch progress.  
It takes about 5-10 minutes. Wait until you see a green ✅ checkmark.

> **If it fails:** Go to your repo → Settings → Actions → General → 
> under "Workflow permissions" select **"Read and write permissions"** → Save.
> Then go back to Actions, click the failed run, and click "Re-run all jobs".

### Step 4: Make the image public

1. Go to your GitHub profile page
2. Click the **"Packages"** tab
3. Click on **coiniumserv-mining-pool**
4. Click **"Package settings"** (right side)
5. Scroll to "Danger Zone" → click **"Change visibility"** → choose **Public** → confirm

### Step 5: Add to Umbrel

1. Open your Umbrel: `http://umbrel.local`
2. Go to **App Store**
3. Click **⋯** (three dots, top-right)
4. Click **"Community App Stores"**
5. Paste your fork URL:
   ```
   https://github.com/YOUR_USERNAME/my-mining-appstore
   ```
6. Click **Add**

### Step 6: Install & go

1. Click **"Mining Pool Apps"** in the App Store sidebar
2. Click **CoiniumServ Mining Pool** → **Install**
3. Open the app
4. Paste your wallet addresses, toggle your pools, click **Save & Start**
5. Copy the stratum URLs and paste into your miner config

---

## Miner Setup

| Miner Type | Connect To | Earns |
|---|---|---|
| SHA256 ASIC (S19, etc.) | `stratum+tcp://umbrel.local:3333` | BTC |
| Scrypt ASIC (L7, etc.)  | `stratum+tcp://umbrel.local:3334` | LTC + DOGE |

Username: your wallet address | Password: `x`

---

## Troubleshooting

**Install stuck at 1%?**  
The Docker image wasn't built yet. Go to your repo → Actions tab → make sure the build finished with ✅. Also make sure you did Step 4 (make image public).

**Image build fails?**  
Go to Settings → Actions → General → set "Workflow permissions" to "Read and write" → re-run the build.

**Blockchain sync takes forever?**  
That's normal on first run. BTC takes days, LTC/DOGE take hours. The dashboard shows progress.

**Can I skip Bitcoin and just run LTC + DOGE?**  
Yes — toggle off Bitcoin in the setup wizard. You can also remove the `bitcoind` service from docker-compose.yml.
