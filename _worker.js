
/**
 * VLESS 多国家节点订阅生成器（修正版 + 多IP支持）
 * 修复：v2ray 默认格式改用标准 VLESS URI；Clash 改用 vless 类型；sing-box 移除 VMess 残留字段；三端统一 uTLS 指纹
 * 新增：server 参数支持逗号分隔多个 IP，每个国家为每个 IP 生成一个节点
 */

/** Unicode-safe Base64 */
function base64Encode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** UA 自动识别订阅格式 */
function detectFormat(request) {
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  if (ua.includes("nekobox") || ua.includes("sing-box")) return "singbox";
  if (ua.includes("clash") || ua.includes("mihomo")) return "clash";
  if (
    ua.includes("v2ray") ||
    ua.includes("shadowrocket") ||
    ua.includes("quantumult") ||
    ua.includes("kitsunebi")
  )
    return "v2ray";
  return "v2ray"; // 兜底
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
    // server 支持逗号分隔多个 IP，例如 server=1.2.3.4,5.6.7.8
    const servers = (params.get("server") || "visa.com")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const port = parseInt(params.get("port") || "443", 10);
    const servername = params.get("servername") || "vpn-hk.pages.dev";
    const tls = (params.get("tls") || "true") === "true";
    const format = (params.get("format") || detectFormat(request)).toLowerCase();

    /* ================= 节点列表 ================= */
    const apiData = {
      success: true,
      countries: [
        { emoji: "🇺🇸", code: "US", name: "美国" },
        { emoji: "🇳🇱", code: "NL", name: "荷兰" },
        { emoji: "🇩🇪", code: "DE", name: "德国" },
        { emoji: "🇸🇬", code: "SG", name: "新加坡" },
        { emoji: "🇯🇵", code: "JP", name: "日本" },
        { emoji: "🇬🇧", code: "GB", name: "英国" },
        { emoji: "🇫🇷", code: "FR", name: "法国" },
        { emoji: "🇸🇪", code: "SE", name: "瑞典" },
        { emoji: "🇫🇮", code: "FI", name: "芬兰" },
        { emoji: "🇭🇰", code: "HK", name: "香港" },
        { emoji: "🇰🇷", code: "KR", name: "韩国" },
        { emoji: "🇱🇻", code: "LV", name: "拉脱维亚" },
        { emoji: "🇨🇦", code: "CA", name: "加拿大" },
      ],
    };

    /* ================= sing-box / nekobox ================= */
    if (format === "singbox" || format === "nekobox") {
      const outbounds = [];
      const tags = [];

      if (apiData?.success && Array.isArray(apiData.countries)) {
        for (const c of apiData.countries) {
          for (const server of servers) {
            const ipTag = servers.length > 1 ? ` ${server}` : "";
            const tag = `${c.emoji} ${c.code.toUpperCase()} | ${c.name}${ipTag}`;
            tags.push(tag);

            outbounds.push({
              type: "vless",
              tag,
              server,
              server_port: port,
              uuid,
              tls: {
                enabled: tls,
                server_name: servername,
                utls: { enabled: true, fingerprint: "chrome" },
              },
              transport: {
                type: "ws",
                path: `/proxyip=proxyip.${c.code}.cmliussss.net`,
                headers: { Host: servername },
              },
            });
          }
        }
      }

      return new Response(
        JSON.stringify(
          {
            log: { level: "info" },
            dns: {
              servers: [
                {
                  tag: "remote",
                  address: "https://1.1.1.1/dns-query",
                  detour: "🚀 节点选择",
                },
                { tag: "local", address: "223.5.5.5", detour: "direct" },
              ],
              final: "remote",
            },
            inbounds: [],
            outbounds: [
              { type: "selector", tag: "🚀 节点选择", outbounds: tags },
              ...outbounds,
              { type: "direct", tag: "direct" },
              { type: "block", tag: "block" },
            ],
            route: { final: "🚀 节点选择" },
          },
          null,
          2
        ),
        { headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    /* ================= Clash（mihomo / Clash.Meta） ================= */
    if (format === "clash") {
      let yaml = "";
      const names = ["DIRECT"];

      yaml +=
        "mixed-port: 7890\nallow-lan: true\nmode: rule\nlog-level: info\n\nproxies:\n";

      if (apiData?.success && Array.isArray(apiData.countries)) {
        for (const c of apiData.countries) {
          for (const server of servers) {
            const ipTag = servers.length > 1 ? ` ${server}` : "";
            const name = `${c.emoji} ${c.code.toUpperCase()} | ${c.name}${ipTag}`;
            names.push(name);

            yaml +=
              `  - name: '${name}'\n` +
              `    type: vless\n` +
              `    server: '${server}'\n` +
              `    port: ${port}\n` +
              `    uuid: ${uuid}\n` +
              `    network: ws\n` +
              `    tls: ${tls}\n` +
              `    servername: '${servername}'\n` +
              `    client-fingerprint: chrome\n` +
              `    ws-opts:\n` +
              `      path: `/proxyip=proxyip.${c.code}.cmliussss.net`\n` +
              `      headers:\n` +
              `        Host: '${servername}'\n`;
          }
        }
      }

      yaml +=
        "\nproxy-groups:\n  - name: '🚀 节点选择'\n    type: select\n    proxies:\n";
      for (const n of names) yaml += `      - '${n}'\n`;
      yaml += "\nrules:\n  - MATCH, 🚀 节点选择\n";

      return new Response(yaml, {
        headers: { "Content-Type": "text/yaml; charset=utf-8" },
      });
    }

    /* ================= 默认 v2ray（标准 VLESS URI） ================= */
    const list = [];

    if (apiData?.success && Array.isArray(apiData.countries)) {
      for (const c of apiData.countries) {
        for (const server of servers) {
          const ipTag = servers.length > 1 ? ` ${server}` : "";
          const name = `${c.emoji} ${c.code.toUpperCase()} | ${c.name}${ipTag}`;
          const query = new URLSearchParams({
            encryption: "none",
            security: tls ? "tls" : "none",
            type: "ws",
            host: servername,
            path: `/proxyip=proxyip.${c.code}.cmliussss.net`,
            sni: servername,
            alpn: "h2,http/1.1",
            fp: "chrome",
          });
          list.push(
            `vless://${uuid}@${server}:${port}?${query.toString()}#${encodeURIComponent(name)}`
          );
        }
      }
    }

    return new Response(list.join("\n"), {
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
<title>Vless多国家订阅生成器</title>
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
* { box-sizing: border-box; transition: background .25s, color .25s, border .25s, box-shadow .25s; }
body {
  margin: 0; min-height: 100vh; padding: 24px 16px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont;
  background: var(--bg); color: var(--text);
  display: flex; flex-direction: column;
}
.page { width: 100%; max-width: 520px; margin: 0 auto; display: flex; flex-direction: column; flex: 1; }
.card {
  width: 100%; padding: 22px; border-radius: 22px;
  background: var(--card); backdrop-filter: blur(16px);
  box-shadow: var(--shadow-card); border: 1px solid var(--border);
}
.header { display: flex; justify-content: space-between; align-items: center; }
h1 { font-size: 18px; margin: 0; }
.toggle { font-size: 22px; cursor: pointer; }
label { display: block; margin-top: 16px; font-size: 12px; color: var(--sub); }
input, select {
  width: 100%; margin-top: 6px; padding: 13px 14px; font-size: 15px;
  color: var(--text); background: rgba(255,255,255,.04);
  border-radius: 14px; border: 1px solid var(--border); outline: none; appearance: none;
}
select {
  background-image: linear-gradient(45deg, transparent 50%, #94a3b8 50%), linear-gradient(135deg, #94a3b8 50%, transparent 50%);
  background-position: calc(100% - 18px) calc(50% - 3px), calc(100% - 12px) calc(50% - 3px);
  background-size: 6px 6px, 6px 6px; background-repeat: no-repeat; cursor: pointer;
}
input:focus, select:focus { border-color: var(--focus); box-shadow: 0 0 0 3px rgba(99,102,241,.2); }
button {
  width: 100%; margin-top: 20px; padding: 15px; border-radius: 16px;
  border: none; font-size: 15px; font-weight: 600; color: #fff;
  cursor: pointer; background: var(--primary); box-shadow: var(--shadow-btn);
}
button:hover { transform: translateY(-1px); }
.copy { margin-top: 12px; background: transparent; color: var(--text); border: 1px dashed var(--border); box-shadow: none; }
.copy:hover { background: rgba(99,102,241,.08); }
.result {
  margin-top: 16px; padding: 14px; border-radius: 14px;
  border: 1px solid var(--border); background: rgba(99,102,241,.06);
  font-size: 13px; word-break: break-all;
}
footer { margin-top: auto; padding: 16px 0 4px; text-align: center; font-size: 12px; color: var(--sub); }
footer a { color: inherit; text-decoration: none; border-bottom: 1px dashed var(--border); }
footer a:hover { color: var(--text); border-bottom-color: var(--focus); }
.toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(20px);
  padding: 12px 18px; background: rgba(15,23,42,.9); color: #e5e7eb;
  border-radius: 14px; font-size: 14px; opacity: 0; pointer-events: none;
  transition: all .3s ease; box-shadow: 0 10px 30px rgba(0,0,0,.4);
}
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
@media (max-width: 480px) { h1 { font-size: 16px; } }
</style>
</head>
<body>
  <div class="page">
    <div class="card">
      <div class="header">
        <h1>🚀 Vless多国家 订阅生成器</h1>
        <div class="toggle" id="themeToggle">🌙</div>
      </div>
      <label>UUID（ICMP9 API Key）</label>
      <input id="uuid" placeholder="必需" />
      <label>Server（多个 IP 用英文逗号分隔）</label>
      <input id="server" value="visa.com" />
      <label>Port</label>
      <input id="port" value="443" />
      <label>Server Name (SNI)</label>
      <input id="servername" value="vpn-hk.pages.dev" />
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
  $('result').innerHTML = '<a href="' + currentUrl + '" target="_blank">' + currentUrl + '</a>';
  showToast("订阅链接已生成");
}
function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', '');
  ta.style.position = 'fixed'; ta.style.top = '-9999px'; ta.style.left = '-9999px';
  document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, ta.value.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  return ok;
}
async function copy() {
  if (!currentUrl) return showToast("请先生成订阅链接");
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(currentUrl);
      return showToast("订阅链接已复制");
    }
  } catch (e) {}
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
$('year').textContent = new Date().getFullYear();
</script>
</body>
</html>`;
}
