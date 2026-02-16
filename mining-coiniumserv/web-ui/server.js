const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const crypto = require('crypto');

// =============================================================================
// Config
// =============================================================================
const PORT = 8080;
const DATA_DIR = process.env.DATA_DIR || '/app/data';
const CONFIG_FILE = path.join(DATA_DIR, 'pool-config.json');
const COINIUMSERV_DIR = '/app/coiniumserv';

// Daemon defaults (Docker internal IPs)
const DEFAULTS = {
  btc: { host: process.env.BTC_DAEMON_HOST || 'bitcoind', rpcPort: process.env.BTC_DAEMON_PORT || '8332', user: process.env.BTC_DAEMON_USER || 'umbrel', pass: process.env.BTC_DAEMON_PASS || process.env.APP_PASSWORD || 'umbrel' },
  ltc: { host: process.env.LTC_DAEMON_HOST || 'litecoind', rpcPort: process.env.LTC_DAEMON_PORT || '9332', user: process.env.LTC_DAEMON_USER || 'umbrel', pass: process.env.LTC_DAEMON_PASS || process.env.APP_PASSWORD || 'umbrel' },
  doge: { host: process.env.DOGE_DAEMON_HOST || 'dogecoind', rpcPort: process.env.DOGE_DAEMON_PORT || '22555', user: process.env.DOGE_DAEMON_USER || 'umbrel', pass: process.env.DOGE_DAEMON_PASS || process.env.APP_PASSWORD || 'umbrel' },
  redis: { host: process.env.REDIS_HOST || 'redis', port: process.env.REDIS_PORT || '6379' }
};

// =============================================================================
// Helpers
// =============================================================================
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

async function rpcCall(host, port, user, pass, method, params = []) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ jsonrpc: '1.0', id: 'probe', method, params });
    const opts = {
      hostname: host, port: parseInt(port), path: '/', method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'Authorization': 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64') },
      timeout: 5000
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ ok: true, result: JSON.parse(data).result }); }
        catch { resolve({ ok: false, error: 'parse error' }); }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.end(body);
  });
}

async function getDaemonStatus(coin) {
  const d = DEFAULTS[coin];
  const res = await rpcCall(d.host, d.rpcPort, d.user, d.pass, 'getblockchaininfo');
  if (!res.ok) return { online: false, error: res.error };
  const info = res.result;
  return {
    online: true,
    chain: info.chain,
    blocks: info.blocks,
    headers: info.headers,
    progress: info.verificationprogress ? (info.verificationprogress * 100).toFixed(1) : '100.0',
    synced: info.blocks >= (info.headers - 2)
  };
}

async function getRedisStatus() {
  return new Promise((resolve) => {
    const net = require('net');
    const client = new net.Socket();
    client.setTimeout(3000);
    client.connect(parseInt(DEFAULTS.redis.port), DEFAULTS.redis.host, () => {
      client.write('PING\r\n');
    });
    client.on('data', (data) => {
      client.destroy();
      resolve({ online: data.toString().includes('PONG') });
    });
    client.on('error', () => { client.destroy(); resolve({ online: false }); });
    client.on('timeout', () => { client.destroy(); resolve({ online: false }); });
  });
}

let coiniumProcess = null;

function generateCoiniumConfigs(cfg) {
  const confDir = path.join(COINIUMSERV_DIR, 'config');
  fs.mkdirSync(path.join(confDir, 'coins'), { recursive: true });
  fs.mkdirSync(path.join(confDir, 'pools'), { recursive: true });

  // Coin defs
  fs.writeFileSync(path.join(confDir, 'coins', 'bitcoin.json'), JSON.stringify({
    name: 'Bitcoin', symbol: 'BTC', algorithm: 'sha256d', site: 'https://bitcoin.org',
    blockExplorer: { block: 'https://mempool.space/block/{0}', tx: 'https://mempool.space/tx/{0}', address: 'https://mempool.space/address/{0}' }
  }, null, 2));

  fs.writeFileSync(path.join(confDir, 'coins', 'litecoin.json'), JSON.stringify({
    name: 'Litecoin', symbol: 'LTC', algorithm: 'scrypt', site: 'https://litecoin.org',
    blockExplorer: { block: 'https://blockchair.com/litecoin/block/{0}', tx: 'https://blockchair.com/litecoin/transaction/{0}', address: 'https://blockchair.com/litecoin/address/{0}' }
  }, null, 2));

  fs.writeFileSync(path.join(confDir, 'coins', 'dogecoin.json'), JSON.stringify({
    name: 'Dogecoin', symbol: 'DOGE', algorithm: 'scrypt', site: 'https://dogecoin.com',
    blockExplorer: { block: 'https://blockchair.com/dogecoin/block/{0}', tx: 'https://blockchair.com/dogecoin/transaction/{0}', address: 'https://blockchair.com/dogecoin/address/{0}' }
  }, null, 2));

  // BTC Pool
  if (cfg.enableBtc) {
    fs.writeFileSync(path.join(confDir, 'pools', 'bitcoin-pool.json'), JSON.stringify({
      enabled: true, coin: 'bitcoin.json',
      daemon: { host: DEFAULTS.btc.host, port: parseInt(DEFAULTS.btc.rpcPort), username: DEFAULTS.btc.user, password: DEFAULTS.btc.pass },
      meta: { title: 'Bitcoin Pool', frontEnd: 'embedded', txMessage: 'umbrelOS/CoiniumServ' },
      wallet: { address: cfg.btcAddress },
      rewards: [], payment: { enabled: true, interval: 240, minimum: 0.001 },
      miner: { validateUsername: true },
      job: { blockRefreshInterval: 500, rebroadcastTimeout: 55 },
      stratum: { enabled: true, bind: '0.0.0.0', port: 3333, diff: 65536,
        vardiff: { enabled: true, minDiff: 16384, maxDiff: 2147483648, targetTime: 15, retargetTime: 90, variancePercent: 30 }
      },
      banning: { enabled: true, duration: 600, invalidPercent: 50, checkThreshold: 100, purgeInterval: 300 },
      storage: { hybrid: { enabled: true, redis: { host: DEFAULTS.redis.host, port: parseInt(DEFAULTS.redis.port), password: '', databaseId: 0 } } }
    }, null, 2));
  }

  // LTC + DOGE merge mining pool
  if (cfg.enableLtcDoge) {
    const pool = {
      enabled: true, coin: 'litecoin.json',
      daemon: { host: DEFAULTS.ltc.host, port: parseInt(DEFAULTS.ltc.rpcPort), username: DEFAULTS.ltc.user, password: DEFAULTS.ltc.pass },
      meta: { title: 'Litecoin + Dogecoin Pool', frontEnd: 'embedded', txMessage: 'umbrelOS/CoiniumServ merge-mined' },
      wallet: { address: cfg.ltcAddress },
      rewards: [], payment: { enabled: true, interval: 120, minimum: 0.01 },
      miner: { validateUsername: true },
      job: { blockRefreshInterval: 500, rebroadcastTimeout: 55 },
      stratum: { enabled: true, bind: '0.0.0.0', port: 3334, diff: 32,
        vardiff: { enabled: true, minDiff: 8, maxDiff: 524288, targetTime: 15, retargetTime: 90, variancePercent: 30 }
      },
      banning: { enabled: true, duration: 600, invalidPercent: 50, checkThreshold: 100, purgeInterval: 300 },
      storage: { hybrid: { enabled: true, redis: { host: DEFAULTS.redis.host, port: parseInt(DEFAULTS.redis.port), password: '', databaseId: 1 } } }
    };

    if (cfg.enableMergeMining && cfg.dogeAddress) {
      pool.mergedMining = {
        enabled: true,
        auxiliaries: [{
          enabled: true, coin: 'dogecoin.json',
          daemon: { host: DEFAULTS.doge.host, port: parseInt(DEFAULTS.doge.rpcPort), username: DEFAULTS.doge.user, password: DEFAULTS.doge.pass },
          wallet: { address: cfg.dogeAddress },
          payment: { enabled: true, interval: 120, minimum: 10 }
        }]
      };
    }

    fs.writeFileSync(path.join(confDir, 'pools', 'litecoin-pool.json'), JSON.stringify(pool, null, 2));
  }

  // Stack config
  fs.writeFileSync(path.join(confDir, 'stack.json'), JSON.stringify({
    logManager: { enabled: true, logLevel: 'info' },
    website: { enabled: true, bind: '0.0.0.0', port: 9999 },
    metrics: { enabled: true },
    statistics: { updateInterval: 60, hashrateWindow: 600 }
  }, null, 2));
}

function startCoiniumServ() {
  if (coiniumProcess) {
    try { coiniumProcess.kill(); } catch {}
    coiniumProcess = null;
  }
  try {
    coiniumProcess = spawn('mono', [path.join(COINIUMSERV_DIR, 'CoiniumServ.exe')], {
      cwd: COINIUMSERV_DIR,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    coiniumProcess.stdout.on('data', d => process.stdout.write(`[pool] ${d}`));
    coiniumProcess.stderr.on('data', d => process.stderr.write(`[pool] ${d}`));
    coiniumProcess.on('exit', (code) => {
      console.log(`[pool] CoiniumServ exited with code ${code}`);
      coiniumProcess = null;
    });
    return true;
  } catch (e) {
    console.error('[pool] Failed to start:', e.message);
    return false;
  }
}

// =============================================================================
// HTTP Server
// =============================================================================
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // --- API: Status ---
  if (url.pathname === '/api/status') {
    const cfg = loadConfig();
    const [btc, ltc, doge, redis] = await Promise.all([
      getDaemonStatus('btc'), getDaemonStatus('ltc'), getDaemonStatus('doge'), getRedisStatus()
    ]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      configured: !!cfg,
      poolRunning: coiniumProcess !== null && !coiniumProcess.killed,
      config: cfg ? { enableBtc: cfg.enableBtc, enableLtcDoge: cfg.enableLtcDoge, enableMergeMining: cfg.enableMergeMining,
        btcAddress: cfg.btcAddress ? cfg.btcAddress.slice(0,8) + '...' : '', ltcAddress: cfg.ltcAddress ? cfg.ltcAddress.slice(0,8) + '...' : '',
        dogeAddress: cfg.dogeAddress ? cfg.dogeAddress.slice(0,8) + '...' : '' } : null,
      daemons: { btc, ltc, doge }, redis
    }));
  }

  // --- API: Save config & (re)start ---
  if (url.pathname === '/api/setup' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const cfg = JSON.parse(body);
        // Validate
        const errors = [];
        if (cfg.enableBtc && !cfg.btcAddress) errors.push('Bitcoin wallet address is required');
        if (cfg.enableLtcDoge && !cfg.ltcAddress) errors.push('Litecoin wallet address is required');
        if (cfg.enableMergeMining && !cfg.dogeAddress) errors.push('Dogecoin wallet address is required for merge mining');
        if (!cfg.enableBtc && !cfg.enableLtcDoge) errors.push('Enable at least one pool');

        if (errors.length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, errors }));
        }

        saveConfig(cfg);
        generateCoiniumConfigs(cfg);
        const started = startCoiniumServ();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, poolStarted: started }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, errors: [e.message] }));
      }
    });
    return;
  }

  // --- API: restart pool ---
  if (url.pathname === '/api/restart' && req.method === 'POST') {
    const cfg = loadConfig();
    if (!cfg) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, errors: ['Not configured yet'] }));
    }
    generateCoiniumConfigs(cfg);
    const started = startCoiniumServ();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, poolStarted: started }));
  }

  // --- API: stop pool ---
  if (url.pathname === '/api/stop' && req.method === 'POST') {
    if (coiniumProcess) { try { coiniumProcess.kill(); } catch {} coiniumProcess = null; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  // --- Serve the SPA ---
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(getHTML());
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[web] Dashboard running on http://0.0.0.0:${PORT}`);

  // Auto-start pool if already configured
  const cfg = loadConfig();
  if (cfg) {
    console.log('[auto] Found existing config, generating and starting pool...');
    generateCoiniumConfigs(cfg);
    startCoiniumServ();
  } else {
    console.log('[auto] No config found. Open the dashboard to run the setup wizard.');
  }
});

// =============================================================================
// Inline HTML/CSS/JS — Single-page dashboard + setup wizard
// =============================================================================
function getHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CoiniumServ — Mining Pool</title>
<style>
  :root { --bg: #0f1117; --card: #1a1d27; --border: #2a2d3a; --accent: #6366f1; --accent2: #f59e0b;
    --green: #22c55e; --red: #ef4444; --text: #e2e8f0; --muted: #94a3b8; --orange: #f97316; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
  .container { max-width: 820px; margin: 0 auto; padding: 24px 16px; }
  h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 4px; }
  h2 { font-size: 1.15rem; font-weight: 600; margin-bottom: 12px; color: var(--text); }
  .subtitle { color: var(--muted); font-size: 0.9rem; margin-bottom: 28px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  .card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .card-header .icon { font-size: 1.4rem; }
  .badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
  .badge-green { background: #22c55e22; color: var(--green); }
  .badge-red { background: #ef444422; color: var(--red); }
  .badge-yellow { background: #f59e0b22; color: var(--accent2); }
  .badge-blue { background: #6366f122; color: var(--accent); }
  .grid3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .stat { text-align: center; padding: 12px; }
  .stat .label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .stat .value { font-size: 1.5rem; font-weight: 700; margin-top: 4px; }
  .progress-bar { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; margin-top: 6px; }
  .progress-bar .fill { height: 100%; border-radius: 3px; transition: width 0.5s; }
  input[type=text] { width: 100%; padding: 10px 14px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
    color: var(--text); font-size: 0.9rem; outline: none; transition: border 0.2s; font-family: monospace; }
  input[type=text]:focus { border-color: var(--accent); }
  input[type=text]::placeholder { color: #4a5568; }
  label { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: 6px; color: var(--muted); }
  .field { margin-bottom: 16px; }
  .toggle { display: flex; align-items: center; gap: 10px; cursor: pointer; margin-bottom: 12px; }
  .toggle input { display: none; }
  .toggle .track { width: 44px; height: 24px; background: var(--border); border-radius: 12px; position: relative; transition: background 0.2s; flex-shrink: 0; }
  .toggle input:checked + .track { background: var(--accent); }
  .toggle .track::after { content: ''; width: 18px; height: 18px; background: white; border-radius: 50%; position: absolute;
    top: 3px; left: 3px; transition: transform 0.2s; }
  .toggle input:checked + .track::after { transform: translateX(20px); }
  .toggle .text { font-size: 0.9rem; }
  .toggle .text small { color: var(--muted); font-weight: 400; }
  .btn { padding: 10px 24px; border: none; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
  .btn-primary { background: var(--accent); color: white; }
  .btn-primary:hover { background: #5558e6; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-outline { background: transparent; color: var(--text); border: 1px solid var(--border); }
  .btn-outline:hover { border-color: var(--muted); }
  .btn-danger { background: var(--red); color: white; }
  .btn-row { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
  .stratum-box { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; margin-top: 8px; font-family: monospace; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center; }
  .stratum-box .copy-btn { background: var(--border); border: none; color: var(--text); padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; }
  .stratum-box .copy-btn:hover { background: var(--muted); }
  .errors { background: #ef444418; border: 1px solid #ef444444; border-radius: 8px; padding: 12px; margin-bottom: 16px; }
  .errors li { color: var(--red); font-size: 0.85rem; margin-left: 16px; }
  .hidden { display: none; }
  .fade-in { animation: fadeIn 0.3s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .divider { border: none; border-top: 1px solid var(--border); margin: 20px 0; }
  .miner-instructions { margin-top: 12px; }
  .miner-instructions p { font-size: 0.85rem; color: var(--muted); margin-bottom: 6px; }
</style>
</head>
<body>
<div class="container">
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;">
    <h1>⛏️ CoiniumServ</h1>
    <span id="poolBadge"></span>
  </div>
  <p class="subtitle">Multi-coin mining pool with Litecoin + Dogecoin merge mining</p>

  <!-- ================================================================== -->
  <!-- STATUS CARDS                                                       -->
  <!-- ================================================================== -->
  <div id="statusSection">
    <div class="grid3" id="daemonCards"></div>
  </div>

  <!-- ================================================================== -->
  <!-- SETUP / CONFIG                                                     -->
  <!-- ================================================================== -->
  <div class="card fade-in" id="setupCard">
    <div class="card-header">
      <span class="icon">⚙️</span>
      <h2 id="setupTitle">Pool Setup</h2>
    </div>

    <div id="setupErrors" class="errors hidden"><ul id="errorList"></ul></div>

    <label class="toggle">
      <input type="checkbox" id="enableBtc" checked onchange="toggleSection()">
      <span class="track"></span>
      <span class="text"><strong>Bitcoin Pool</strong> (SHA256d) <small>— Stratum port 3333</small></span>
    </label>
    <div id="btcFields" class="field" style="margin-left: 54px;">
      <label>BTC Wallet Address</label>
      <input type="text" id="btcAddress" placeholder="bc1q... or 1... or 3...">
    </div>

    <hr class="divider">

    <label class="toggle">
      <input type="checkbox" id="enableLtcDoge" checked onchange="toggleSection()">
      <span class="track"></span>
      <span class="text"><strong>Litecoin Pool</strong> (Scrypt) <small>— Stratum port 3334</small></span>
    </label>
    <div id="ltcFields" style="margin-left: 54px;">
      <div class="field">
        <label>LTC Wallet Address</label>
        <input type="text" id="ltcAddress" placeholder="ltc1q... or L... or M...">
      </div>
      <label class="toggle" style="margin-top:4px;">
        <input type="checkbox" id="enableMergeMining" checked onchange="toggleSection()">
        <span class="track"></span>
        <span class="text"><strong>Merge mine Dogecoin</strong> <small>— earn DOGE from the same Scrypt work (AuxPoW)</small></span>
      </label>
      <div id="dogeFields" class="field" style="margin-left: 54px;">
        <label>DOGE Wallet Address</label>
        <input type="text" id="dogeAddress" placeholder="D...">
      </div>
    </div>

    <div class="btn-row">
      <button class="btn btn-primary" id="saveBtn" onclick="saveSetup()">💾 Save &amp; Start Pool</button>
      <button class="btn btn-outline" id="restartBtn" onclick="restartPool()">🔄 Restart</button>
      <button class="btn btn-outline btn-danger" id="stopBtn" onclick="stopPool()" style="margin-left:auto;">⏹ Stop</button>
    </div>
  </div>

  <!-- ================================================================== -->
  <!-- MINER CONNECTION INFO                                              -->
  <!-- ================================================================== -->
  <div class="card fade-in" id="minerCard" class="hidden">
    <div class="card-header">
      <span class="icon">🔌</span>
      <h2>Connect Your Miners</h2>
    </div>

    <div id="btcMinerInfo" class="miner-instructions">
      <p><strong>Bitcoin (SHA256d ASICs)</strong></p>
      <div class="stratum-box">
        <span id="btcStratumUrl">stratum+tcp://<span class="host-placeholder">your-umbrel-ip</span>:3333</span>
        <button class="copy-btn" onclick="copyText('btcStratumUrl')">Copy</button>
      </div>
      <p style="margin-top:6px;">Username: <code>your-btc-address</code> &nbsp; Password: <code>x</code></p>
    </div>

    <hr class="divider">

    <div id="ltcMinerInfo" class="miner-instructions">
      <p><strong>Litecoin + Dogecoin (Scrypt ASICs)</strong> — merge-mined, earns both!</p>
      <div class="stratum-box">
        <span id="ltcStratumUrl">stratum+tcp://<span class="host-placeholder">your-umbrel-ip</span>:3334</span>
        <button class="copy-btn" onclick="copyText('ltcStratumUrl')">Copy</button>
      </div>
      <p style="margin-top:6px;">Username: <code>your-ltc-address</code> &nbsp; Password: <code>x</code></p>
    </div>
  </div>

</div>

<script>
// Fill in actual hostname for stratum URLs
document.querySelectorAll('.host-placeholder').forEach(el => { el.textContent = location.hostname; });

function toggleSection() {
  const btc = document.getElementById('enableBtc').checked;
  const ltcDoge = document.getElementById('enableLtcDoge').checked;
  const merge = document.getElementById('enableMergeMining').checked;
  document.getElementById('btcFields').style.display = btc ? '' : 'none';
  document.getElementById('ltcFields').style.display = ltcDoge ? '' : 'none';
  document.getElementById('dogeFields').style.display = (ltcDoge && merge) ? '' : 'none';
  document.getElementById('btcMinerInfo').style.display = btc ? '' : 'none';
  document.getElementById('ltcMinerInfo').style.display = ltcDoge ? '' : 'none';
}
toggleSection();

function copyText(id) {
  const text = document.getElementById(id).textContent;
  navigator.clipboard.writeText(text);
}

function showErrors(errs) {
  const el = document.getElementById('setupErrors');
  const list = document.getElementById('errorList');
  if (!errs || !errs.length) { el.classList.add('hidden'); return; }
  list.innerHTML = errs.map(e => '<li>' + e + '</li>').join('');
  el.classList.remove('hidden');
}

async function saveSetup() {
  showErrors([]);
  const btn = document.getElementById('saveBtn');
  btn.disabled = true; btn.textContent = '⏳ Saving...';
  try {
    const body = {
      enableBtc: document.getElementById('enableBtc').checked,
      enableLtcDoge: document.getElementById('enableLtcDoge').checked,
      enableMergeMining: document.getElementById('enableMergeMining').checked,
      btcAddress: document.getElementById('btcAddress').value.trim(),
      ltcAddress: document.getElementById('ltcAddress').value.trim(),
      dogeAddress: document.getElementById('dogeAddress').value.trim()
    };
    const res = await fetch('/api/setup', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const data = await res.json();
    if (!data.ok) { showErrors(data.errors); }
    else { refreshStatus(); }
  } catch(e) { showErrors([e.message]); }
  btn.disabled = false; btn.textContent = '💾 Save & Start Pool';
}

async function restartPool() {
  const btn = document.getElementById('restartBtn');
  btn.disabled = true;
  await fetch('/api/restart', { method: 'POST' });
  btn.disabled = false;
  refreshStatus();
}

async function stopPool() {
  await fetch('/api/stop', { method: 'POST' });
  refreshStatus();
}

function daemonCard(name, symbol, icon, status) {
  const synced = status.online && status.synced;
  const pct = status.online ? parseFloat(status.progress) : 0;
  const badgeClass = !status.online ? 'badge-red' : synced ? 'badge-green' : 'badge-yellow';
  const badgeText = !status.online ? 'Offline' : synced ? 'Synced' : 'Syncing ' + pct + '%';
  const barColor = !status.online ? 'var(--red)' : synced ? 'var(--green)' : 'var(--accent2)';
  return '<div class="card" style="padding:14px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
      '<span style="font-weight:600;">' + icon + ' ' + name + ' <small style="color:var(--muted);">(' + symbol + ')</small></span>' +
      '<span class="badge ' + badgeClass + '">● ' + badgeText + '</span>' +
    '</div>' +
    (status.online ? '<div class="progress-bar"><div class="fill" style="width:' + pct + '%;background:' + barColor + ';"></div></div>' +
      '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:0.75rem;color:var(--muted);"><span>Block ' + (status.blocks||0).toLocaleString() + '</span><span>' + (status.headers||0).toLocaleString() + ' headers</span></div>' : '') +
  '</div>';
}

async function refreshStatus() {
  try {
    const res = await fetch('/api/status');
    const s = await res.json();

    // Pool badge
    const pb = document.getElementById('poolBadge');
    pb.innerHTML = s.poolRunning
      ? '<span class="badge badge-green">● Pool Running</span>'
      : s.configured
        ? '<span class="badge badge-yellow">● Pool Stopped</span>'
        : '<span class="badge badge-blue">● Setup Required</span>';

    // Daemon cards
    document.getElementById('daemonCards').innerHTML =
      daemonCard('Bitcoin', 'BTC', '₿', s.daemons.btc) +
      daemonCard('Litecoin', 'LTC', 'Ł', s.daemons.ltc) +
      daemonCard('Dogecoin', 'DOGE', 'Ð', s.daemons.doge) +
      '<div class="card" style="padding:14px;"><div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-weight:600;">🗄 Redis</span>' +
        '<span class="badge ' + (s.redis.online ? 'badge-green' : 'badge-red') + '">● ' + (s.redis.online ? 'Connected' : 'Offline') + '</span>' +
      '</div></div>';

    // Pre-fill form from saved config
    if (s.config) {
      document.getElementById('setupTitle').textContent = 'Pool Configuration';
    }

  } catch(e) { console.error(e); }
}

refreshStatus();
setInterval(refreshStatus, 10000);
</script>
</body>
</html>`;
}
