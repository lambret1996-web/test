/**
 * Unicode-safe Base64（修复 1101）
 */
function base64Encode(str) {
  return btoa(
    String.fromCharCode(...new TextEncoder().encode(str))
  );
}

/**
 * 判断订阅格式（UA 自动识别）
 */
function detectFormat(request) {
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();

  if (ua.includes("nekobox") || ua.includes("sing-box")) return "singbox";
  if (ua.includes("clash")) return "clash";
  if (
    ua.includes("v2ray") ||
    ua.includes("shadowrocket") ||
    ua.includes("quantumult") ||
    ua.includes("kitsunebi")
  ) return "v2ray";

  return "v2ray"; // 兜底
}

/**
 * UA 伪装（给 API 用）
 */
function getFakeUA(request) {
  const ua = request.headers.get("User-Agent") || "";
  if (/clash|v2ray|nekobox|sing-box/i.test(ua)) return ua;
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const params = url.searchParams;

    /* ================= 无 UUID：前端 ================= */
    if (!params.has("uuid")) {
      return new Response(getHTML(url.origin), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const uuid = params.get("uuid");
    const server = params.get("server") || "tunnel-na.8443.buzz";
    const port = parseInt(params.get("port") || "443", 10);
    const servername = params.get("servername") || server;
    const tls = (params.get("tls") || "true") === "true";

    // 👇 UA 自动判断格式（format 参数仍可手动覆盖）
    const format =
      (params.get("format") || detectFormat(request)).toLowerCase();

    /* ================= 获取 API ================= */
    let apiData = null;
    try {
      const resp = await fetch("https://api.icmp9.com/online.php", {
        headers: { "User-Agent": getFakeUA(request) },
        cf: { cacheTtl: 60, cacheEverything: true },
      });
      apiData = await resp.json();
    } catch {
      apiData = null;
    }

    /* ================= sing-box / nekobox ================= */
    if (format === "singbox" || format === "nekobox") {
      const outbounds = [];
      const tags = [];

      if (apiData?.success && Array.isArray(apiData.countries)) {
        for (const c of apiData.countries) {
          const tag = `${c.emoji} ${c.code.toUpperCase()} | ${c.name}`;
          tags.push(tag);

          outbounds.push({
            type: "vmess",
            tag,
            server,
            server_port: port,
            uuid,
            security: "auto",
            alter_id: 0,
            tls: {
              enabled: tls,
              server_name: servername,
            },
            transport: {
              type: "ws",
              path: `/${c.code}`,
              headers: { Host: servername },
            },
          });
        }
      }

      return new Response(
        JSON.stringify({
          log: { level: "info" },
          inbounds: [],
          outbounds: [
            { type: "selector", tag: "🚀 节点选择", outbounds: tags },
            ...outbounds,
            { type: "direct", tag: "direct" },
            { type: "block", tag: "block" },
          ],
          route: { final: "🚀 节点选择" },
        }, null, 2),
        { headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    /* ================= Clash ================= */
    if (format === "clash") {
      let yaml = "";
      const names = ["DIRECT"];

      yaml += "mixed-port: 7890\nallow-lan: true\nmode: rule\nlog-level: info\n\nproxies:\n";

      if (apiData?.success && Array.isArray(apiData.countries)) {
        for (const c of apiData.countries) {
          const name = `${c.emoji} ${c.code.toUpperCase()} | ${c.name}`;
          names.push(name);

          yaml +=
`  - name: '${name}'
    type: vmess
    server: '${server}'
    port: ${port}
    uuid: ${uuid}
    alterId: 0
    cipher: auto
    tls: ${tls}
    servername: '${servername}'
    network: ws
    ws-opts:
      path: '/${c.code}'
      headers:
        Host: '${servername}'
`;
        }
      }

      yaml += "\nproxy-groups:\n  - name: '🚀 节点选择'\n    type: select\n    proxies:\n";
      for (const n of names) yaml += `      - '${n}'\n`;
      yaml += "\nrules:\n  - MATCH, 🚀 节点选择\n";

      return new Response(yaml, {
        headers: { "Content-Type": "text/yaml; charset=utf-8" },
      });
    }

    /* ================= 默认 v2ray ================= */
    const list = [];

    if (apiData?.success && Array.isArray(apiData.countries)) {
      for (const c of apiData.countries) {
        list.push(
          "vmess://" +
            base64Encode(
              JSON.stringify({
                v: "2",
                ps: `${c.emoji} ${c.code.toUpperCase()} | ${c.name}`,
                add: server,
                port: String(port),
                id: uuid,
                aid: "0",
                scy: "auto",
                net: "ws",
                type: "none",
                host: servername,
                path: `/${c.code}`,
                tls: tls ? "tls" : "",
                sni: servername,
                alpn: "",
                fp: "",
              })
            )
        );
      }
    }

    return new Response(base64Encode(list.join("\n")), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};

/* ================= 前端 HTML ================= */

function getHTML(origin) {
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ICMP9 订阅生成器</title>

<style>
:root {
  --bg: radial-gradient(1200px 600px at 10% -10%, #0f172a 0%, #020617 70%);
  --card: rgba(10, 15, 35, 0.88);
  --text: #e5e7eb;
  --sub: #94a3b8;
  --border: rgba(99,102,241,.28);
  --focus: rgba(99,102,241,.45);
  --primary: linear-gradient(135deg, #38bdf8, #6366f1);
  --shadow-card: 0 30px 60px rgba(0,0,0,.55);
  --shadow-btn: 0 14px 40px rgba(99,102,241,.5);
}

[data-theme="light"] {
  --bg: radial-gradient(1200px 600px at 10% -10%, #e0e7ff 0%, #f8fafc 65%);
  --card: rgba(255,255,255,.95);
  --text: #0f172a;
  --sub: #475569;
  --border: rgba(99,102,241,.25);
  --focus: rgba(79,70,229,.35);
  --primary: linear-gradient(135deg, #2563eb, #4f46e5);
  --shadow-card: 0 30px 60px rgba(0,0,0,.18);
  --shadow-btn: 0 14px 40px rgba(79,70,229,.4);
}

* {
  box-sizing: border-box;
  transition: background .25s, color .25s, border .25s, box-shadow .25s;
}

body {
  margin: 0;
  min-height: 100vh;
  padding: 24px 16px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont;
  background: var(--bg);
  color: var(--text);

  display: flex;
  flex-direction: column;
}

.page {
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.card {
  width: 100%;
  padding: 22px;
  border-radius: 22px;
  background: var(--card);
  backdrop-filter: blur(16px);
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

h1 {
  font-size: 18px;
  margin: 0;
}

.toggle {
  font-size: 22px;
  cursor: pointer;
}

/* 表单 */
label {
  display: block;
  margin-top: 16px;
  font-size: 12px;
  color: var(--sub);
}

input, select {
  width: 100%;
  margin-top: 6px;
  padding: 13px 14px;
  font-size: 15px;
  color: var(--text);
  background: rgba(255,255,255,.04);
  border-radius: 14px;
  border: 1px solid var(--border);
  outline: none;
  appearance: none;
}

select {
  background-image:
    linear-gradient(45deg, transparent 50%, #94a3b8 50%),
    linear-gradient(135deg, #94a3b8 50%, transparent 50%);
  background-position:
    calc(100% - 18px) calc(50% - 3px),
    calc(100% - 12px) calc(50% - 3px);
  background-size: 6px 6px, 6px 6px;
  background-repeat: no-repeat;
  cursor: pointer;
}

input:focus, select:focus {
  border-color: var(--focus);
  box-shadow: 0 0 0 3px rgba(99,102,241,.2);
}

/* 按钮 */
button {
  width: 100%;
  margin-top: 20px;
  padding: 15px;
  border-radius: 16px;
  border: none;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  background: var(--primary);
  box-shadow: var(--shadow-btn);
}

button:hover {
  transform: translateY(-1px);
}

.copy {
  margin-top: 12px;
  background: transparent;
  color: var(--text);
  border: 1px dashed var(--border);
  box-shadow: none;
}

.copy:hover {
  background: rgba(99,102,241,.08);
}

/* 结果 */
.result {
  margin-top: 16px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: rgba(99,102,241,.06);
  font-size: 13px;
  word-break: break-all;
}

/* Footer */
footer {
  margin-top: auto;
  padding: 16px 0 4px;
  text-align: center;
  font-size: 12px;
  color: var(--sub);
}

footer a {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px dashed var(--border);
}

footer a:hover {
  color: var(--text);
  border-bottom-color: var(--focus);
}

/* Toast */
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  padding: 12px 18px;
  background: rgba(15,23,42,.9);
  color: #e5e7eb;
  border-radius: 14px;
  font-size: 14px;
  opacity: 0;
  pointer-events: none;
  transition: all .3s ease;
  box-shadow: 0 10px 30px rgba(0,0,0,.4);
}

.toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

@media (max-width: 480px) {
  h1 { font-size: 16px; }
}
</style>
</head>

<body>
  <div class="page">
    <div class="card">
      <div class="header">
        <h1>🚀 ICMP9 订阅生成器</h1>
        <div class="toggle" id="themeToggle">🌙</div>
      </div>

      <label>UUID（ICMP9 API Key）</label>
      <input id="uuid" placeholder="必需" />

      <label>Server</label>
      <input id="server" value="tunnel-na.8443.buzz" />

      <label>Port</label>
      <input id="port" value="443" />

      <label>Server Name (SNI)</label>
      <input id="servername" value="tunnel-na.8443.buzz" />

      <label>订阅格式</label>
      <select id="format">
        <option value="auto">自适应订阅（推荐）</option>
        <option value="v2ray">V2Ray</option>
        <option value="clash">Clash</option>
        <option value="singbox">sing-box</option>
        <option value="nekobox">Nekobox</option>
      </select>

      <label>TLS（已锁定）</label>
      <select disabled><option>true</option></select>

      <button id="genBtn">生成订阅链接</button>
      <button class="copy" id="copyBtn">📋 复制订阅链接</button>

      <div class="result" id="result"></div>
    </div>

    <footer>©<span id="year"></span> • Designed with 💜 by
      <a href="https://github.com/arlettebrook/get-icmp9-node" target="_blank" rel="noopener noreferrer">Arlettebrook</a>
    </footer>
  </div>

  <div class="toast" id="toast">提示</div>

<script>
const $ = id => document.getElementById(id);
const STORAGE = { UUID: "uuid", THEME: "theme", FORMAT: "format" };
let currentUrl = "";

function showToast(text) {
  const toast = $('toast');
  toast.textContent = text;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

function gen() {
  const uuid = $('uuid').value.trim();
  if (!uuid) return showToast("UUID 不能为空");

  localStorage.setItem(STORAGE.UUID, uuid);

  const server = $('server').value;
  const port = $('port').value;
  const servername = $('servername').value;
  const format = $('format').value;

  if (format !== "auto") localStorage.setItem(STORAGE.FORMAT, format);
  else localStorage.removeItem(STORAGE.FORMAT);

  currentUrl =
    location.origin +
    "/?uuid=" + encodeURIComponent(uuid) +
    "&server=" + encodeURIComponent(server) +
    "&port=" + encodeURIComponent(port) +
    "&servername=" + encodeURIComponent(servername) +
    "&tls=true";

  if (format !== "auto") currentUrl += "&format=" + format;

  $('result').innerHTML =
    '<a href="' + currentUrl + '" target="_blank">' + currentUrl + '</a>';

  showToast("订阅链接已生成");
}

/**
 * ✅ 修复点：
 * 1) 某些环境/协议下 navigator.clipboard.writeText 会被拒绝或无回调
 * 2) 失败时需要也给出 toast 提示
 * 3) 提供一个兼容性更好的回退方案（execCommand copy）
 */
function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-9999px';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, ta.value.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (e) {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

async function copy() {
  if (!currentUrl) return showToast("请先生成订阅链接");

  // 现代剪贴板 API（需要安全上下文 https/localhost 且有权限）
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(currentUrl);
      return showToast("订阅链接已复制");
    }
  } catch (e) {
    // 继续走回退方案
  }

  // 回退：execCommand（兼容性更好）
  const ok = fallbackCopyText(currentUrl);
  if (ok) showToast("订阅链接已复制");
  else showToast("复制失败：请手动选择链接复制");
}

function toggleTheme() {
  const html = document.documentElement;
  const next = html.dataset.theme === "dark" ? "light" : "dark";
  html.dataset.theme = next;
  localStorage.setItem(STORAGE.THEME, next);
  $('themeToggle').textContent = next === "dark" ? "🌙" : "☀️";
}

$('genBtn').onclick = gen;
$('copyBtn').onclick = copy;
$('themeToggle').onclick = toggleTheme;

const savedUUID = localStorage.getItem(STORAGE.UUID);
if (savedUUID) $('uuid').value = savedUUID;

const savedFormat = localStorage.getItem(STORAGE.FORMAT);
if (savedFormat) $('format').value = savedFormat;

const theme = localStorage.getItem(STORAGE.THEME) || "dark";
document.documentElement.dataset.theme = theme;
$('themeToggle').textContent = theme === "dark" ? "🌙" : "☀️";

// Footer 自动年份
$('year').textContent = new Date().getFullYear();
</script>
</body>
</html>`;
}
