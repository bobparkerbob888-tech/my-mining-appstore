var http = require('http');
var fs = require('fs');
var path = require('path');
var VPN_DIR = '/vpn';
var PORT = 8080;

try { fs.mkdirSync(VPN_DIR, { recursive: true }); } catch (e) {}

function listConfigs() {
  try {
    return fs.readdirSync(VPN_DIR).filter(function(f) {
      return /\.(ovpn|conf|crt|key|pem|auth|ca|tls)$/i.test(f);
    });
  } catch (e) { return []; }
}

function hasAuth() {
  return fs.existsSync(path.join(VPN_DIR, 'vpn.auth'));
}

function parseMultipart(buf, boundary) {
  var str = buf.toString('binary');
  var parts = str.split('--' + boundary);
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    var m = part.match(/filename="([^"]+)"/);
    if (m) {
      var name = m[1].replace(/[^a-zA-Z0-9._\-]/g, '_');
      var idx = part.indexOf('\r\n\r\n') + 4;
      var end = part.lastIndexOf('\r\n');
      if (idx > 3 && end > idx) {
        return { name: name, data: Buffer.from(part.substring(idx, end), 'binary') };
      }
    }
  }
  return null;
}

var server = http.createServer(function(req, res) {
  if (req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ configs: listConfigs(), hasAuth: hasAuth() }));
  }

  if (req.url === '/api/upload' && req.method === 'POST') {
    var chunks = [];
    req.on('data', function(c) { chunks.push(c); });
    req.on('end', function() {
      try {
        var buf = Buffer.concat(chunks);
        var ct = req.headers['content-type'] || '';
        var boundary = ct.split('boundary=')[1];
        if (!boundary) throw new Error('No boundary');
        var file = parseMultipart(buf, boundary);
        if (!file) throw new Error('No file found');
        fs.writeFileSync(path.join(VPN_DIR, file.name), file.data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, file: file.name }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.url === '/api/delete' && req.method === 'POST') {
    var body = '';
    req.on('data', function(c) { body += c; });
    req.on('end', function() {
      try {
        var d = JSON.parse(body);
        var fp = path.join(VPN_DIR, path.basename(d.file));
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.url === '/api/save-auth' && req.method === 'POST') {
    var body = '';
    req.on('data', function(c) { body += c; });
    req.on('end', function() {
      try {
        var d = JSON.parse(body);
        fs.writeFileSync(path.join(VPN_DIR, 'vpn.auth'), d.username + '\n' + d.password + '\n');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.url === '/api/delete-auth' && req.method === 'POST') {
    var fp = path.join(VPN_DIR, 'vpn.auth');
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(getPage());
});

server.listen(PORT, '0.0.0.0', function() {
  console.log('[web] OpenVPN Client UI on :' + PORT);
});

function getPage() {
  var css = ':root{--bg:#0f1117;--card:#1a1d27;--border:#2a2d3a;--accent:#6366f1;--green:#22c55e;--red:#ef4444;--text:#e2e8f0;--muted:#94a3b8;--orange:#f59e0b}*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}.ctr{max-width:640px;margin:0 auto;padding:24px 16px}h1{font-size:1.5rem;font-weight:700;margin-bottom:4px}.sub{color:var(--muted);font-size:.9rem;margin-bottom:28px}.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px}h2{font-size:1.1rem;font-weight:600;margin-bottom:12px}.bg{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:.75rem;font-weight:600}.bg-g{background:#22c55e22;color:var(--green)}.bg-r{background:#ef444422;color:var(--red)}.bg-y{background:#f59e0b22;color:var(--orange)}.btn{padding:10px 20px;border:none;border-radius:8px;font-size:.9rem;font-weight:600;cursor:pointer}.bp{background:var(--accent);color:#fff}.bo{background:transparent;color:var(--text);border:1px solid var(--border)}.bd{padding:4px 12px;font-size:.75rem;border-radius:6px;border:1px solid var(--red);background:transparent;color:var(--red);cursor:pointer}input[type=text],input[type=password]{width:100%;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:.9rem;outline:none;margin-bottom:10px;font-family:monospace}input::placeholder{color:#4a5568}label{display:block;font-size:.85rem;font-weight:500;margin-bottom:6px;color:var(--muted)}.fi{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg);border-radius:8px;margin-bottom:8px;font-family:monospace;font-size:.85rem}.dz{border:2px dashed var(--border);border-radius:12px;padding:40px 20px;text-align:center;color:var(--muted);cursor:pointer}.dz:hover,.dz.dg{border-color:var(--accent);color:var(--text)}.msg{padding:10px 14px;border-radius:8px;margin-bottom:12px;font-size:.85rem}.mo{background:#22c55e22;color:var(--green)}.me{background:#ef444422;color:var(--red)}.info{font-size:.85rem;color:var(--muted);line-height:1.6}';

  var body = '<div class="ctr">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
    + '<h1>OpenVPN Client</h1><span id="sb"></span></div>'
    + '<p class="sub">Route your Umbrel traffic through a VPN tunnel</p>'
    + '<div id="msg"></div>'
    + '<div class="card"><h2>VPN Config Files</h2><div id="fl"></div>'
    + '<div class="dz" id="dz">'
    + '<p style="font-size:1.5rem;margin-bottom:8px">&#x1F4C2;</p>'
    + '<p>Drop your <strong>.ovpn</strong> file here or click to browse</p>'
    + '<p style="font-size:.75rem;margin-top:6px">Also accepts .conf .crt .key .pem</p>'
    + '<input type="file" id="fi" accept=".ovpn,.conf,.crt,.key,.pem,.ca,.tls" style="display:none" multiple>'
    + '</div></div>'
    + '<div class="card">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
    + '<h2 style="margin-bottom:0">Authentication</h2><span id="ab"></span></div>'
    + '<p class="info" style="margin-bottom:12px">Only needed if your VPN provider requires username/password.</p>'
    + '<label>Username</label><input type="text" id="vu" placeholder="VPN username">'
    + '<label>Password</label><input type="password" id="vp" placeholder="VPN password">'
    + '<div style="display:flex;gap:10px">'
    + '<button class="btn bp" id="saveBtn">Save Credentials</button>'
    + '<button class="btn bo" id="cb" style="display:none">Clear</button>'
    + '</div></div>'
    + '<div class="card"><h2>How It Works</h2><div class="info">'
    + '<strong>1.</strong> Upload your <strong>.ovpn</strong> config from your VPN provider.<br>'
    + '<strong>2.</strong> If required, enter your VPN username and password.<br>'
    + '<strong>3.</strong> Restart the app from Umbrel to connect.<br>'
    + '<strong>4.</strong> The VPN container auto-detects your .ovpn and connects.<br><br>'
    + '<strong>Tip:</strong> Upload any referenced cert/key files too.'
    + '</div></div></div>';

  var js = ''
    + 'var dz=document.getElementById("dz"),fi=document.getElementById("fi");'
    + 'dz.onclick=function(){fi.click()};'
    + 'dz.ondragover=function(e){e.preventDefault();dz.classList.add("dg")};'
    + 'dz.ondragleave=function(){dz.classList.remove("dg")};'
    + 'dz.ondrop=function(e){e.preventDefault();dz.classList.remove("dg");doUp(e.dataTransfer.files)};'
    + 'fi.onchange=function(){doUp(fi.files)};'
    + 'document.getElementById("saveBtn").onclick=doSave;'
    + 'document.getElementById("cb").onclick=doClear;'
    + 'function msg(t,ok){var el=document.getElementById("msg");el.innerHTML="<div class=\\"msg "+(ok?"mo":"me")+"\\">"+t+"</div>";setTimeout(function(){el.innerHTML=""},5000)}'
    + 'function doUp(files){Array.from(files).forEach(function(f){var fd=new FormData();fd.append("file",f);fetch("/api/upload",{method:"POST",body:fd}).then(function(r){return r.json()}).then(function(d){if(d.ok)msg("Uploaded: "+d.file+" - restart to apply",true);else msg(d.error,false);doRef()}).catch(function(){msg("Upload failed",false)})})}'
    + 'function doSave(){var u=document.getElementById("vu").value.trim(),p=document.getElementById("vp").value.trim();if(!u||!p){msg("Enter both fields",false);return}fetch("/api/save-auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u,password:p})}).then(function(r){return r.json()}).then(function(d){if(d.ok){msg("Saved! Restart to apply.",true);doRef()}else msg(d.error,false)}).catch(function(e){msg(e.message,false)})}'
    + 'function doClear(){if(!confirm("Remove credentials?"))return;fetch("/api/delete-auth",{method:"POST"}).then(function(){msg("Cleared",true);doRef()})}'
    + 'function doDel(f){if(!confirm("Delete "+f+"?"))return;fetch("/api/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({file:f})}).then(function(){doRef()})}'
    + 'function doRef(){fetch("/api/status").then(function(r){return r.json()}).then(function(d){var fl=document.getElementById("fl"),sb=document.getElementById("sb"),ab=document.getElementById("ab"),cb=document.getElementById("cb");var has=d.configs.some(function(f){return f.endsWith(".ovpn")||f.endsWith(".conf")});sb.innerHTML=has?"<span class=\\"bg bg-g\\">Config Loaded</span>":"<span class=\\"bg bg-y\\">No Config</span>";ab.innerHTML=d.hasAuth?"<span class=\\"bg bg-g\\">Saved</span>":"<span class=\\"bg bg-r\\">Not Set</span>";cb.style.display=d.hasAuth?"":"none";if(!d.configs.length){fl.innerHTML="<p style=\\"color:#94a3b8;font-size:.85rem;margin-bottom:12px\\">No config files. Upload one below.</p>";return}var h="";for(var i=0;i<d.configs.length;i++){var fn=d.configs[i];h+="<div class=\\"fi\\"><span>"+fn+"</span><button class=\\"bd\\" data-f=\\""+fn+"\\">Delete</button></div>"}fl.innerHTML=h;fl.querySelectorAll(".bd").forEach(function(b){b.onclick=function(){doDel(this.getAttribute("data-f"))}})}).catch(function(e){console.error(e)})}'
    + 'doRef();setInterval(doRef,15000)';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenVPN Client</title><style>' + css + '</style></head><body>' + body + '<script>' + js + '</script></body></html>';
}
