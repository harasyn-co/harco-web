// Encrypts the built studio behind an access key, for static hosting.
// Reads dist/, inlines the page's scripts and styles into one HTML document,
// encrypts it with AES-GCM under a key derived from STUDIO_ACCESS_KEY
// (PBKDF2, SHA-256), and replaces dist/ with a single index.html that asks
// for the key and decrypts in the browser. Nothing else is published, so
// without the key there is no studio to see.
//
// usage: STUDIO_ACCESS_KEY=... node scripts/gate.mjs
import fs from "node:fs"
import path from "node:path"
import { webcrypto as crypto } from "node:crypto"

const ITERATIONS = 310000
const dist = path.resolve(import.meta.dirname, "../dist")
const passphrase = process.env.STUDIO_ACCESS_KEY
if (!passphrase) {
  console.error("STUDIO_ACCESS_KEY is not set; refusing to publish the studio unprotected.")
  process.exit(1)
}

// Inline assets, so the whole studio is one document.
let html = fs.readFileSync(path.join(dist, "index.html"), "utf8")
const read = (href) => fs.readFileSync(path.join(dist, href.replace(/^\//, "")), "utf8")
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) =>
  `<script type="module">${read(src).replace(/<\/script/gi, "<\\/script")}</script>`)
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => `<style>${read(href)}</style>`)
if (/src="\/assets|href="\/assets/.test(html)) {
  console.error("Some assets weren't inlined; refusing to publish them unencrypted.")
  process.exit(1)
}

const salt = crypto.getRandomValues(new Uint8Array(16))
const iv = crypto.getRandomValues(new Uint8Array(12))
const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"])
const key = await crypto.subtle.deriveKey(
  { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"])
const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(html)))
const b64 = (bytes) => Buffer.from(bytes).toString("base64")

const gate = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex, nofollow" />
<title>Particle Studio</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; background: #0b0b0c; color: #d9d6ce; font: 13px/1.5 ui-monospace, "IBM Plex Mono", Menlo, monospace; }
  main { min-height: 100%; display: grid; place-items: center; padding: 16px; box-sizing: border-box; }
  form { width: min(320px, 100%); display: grid; gap: 10px; }
  h1 { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
  input { font: inherit; color: inherit; background: #0e0e10; border: 1px solid #2a2a2c; padding: 8px 10px; }
  input:focus { outline: none; border-color: #8a877f; }
  button { font: inherit; color: #0b0b0c; background: #d9d6ce; border: 0; padding: 8px 10px; cursor: pointer; }
  label { color: #8a877f; display: flex; gap: 8px; align-items: center; }
  p { margin: 0; min-height: 1.5em; color: #e08a7a; }
</style>
</head>
<body>
<main>
  <form id="gate" autocomplete="off">
    <h1>Particle Studio</h1>
    <input id="key" type="password" placeholder="Access key" aria-label="Access key" autofocus />
    <label><input id="remember" type="checkbox" checked /> Remember on this device</label>
    <button type="submit">Open</button>
    <p id="msg" role="alert"></p>
  </form>
</main>
<script>
(() => {
  const SALT = "${b64(salt)}", IV = "${b64(iv)}", DATA = "${b64(sealed)}", ITERATIONS = ${ITERATIONS};
  const STORE = "harasyn-studio:access";
  const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function open(raw) {
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(IV) }, key, bytes(DATA));
    const html = new TextDecoder().decode(plain);
    document.open();
    document.write(html);
    document.close();
  }
  async function derive(pass) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: bytes(SALT), iterations: ITERATIONS, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
    return new Uint8Array(await crypto.subtle.exportKey("raw", key));
  }
  // A remembered key opens straight away; a stale one (after the key changes) is dropped.
  try {
    const saved = window.crypto && crypto.subtle && localStorage.getItem(STORE);
    if (saved) open(bytes(saved)).catch(() => localStorage.removeItem(STORE));
  } catch {}
  // Browsers only allow the decryption on secure (https) pages.
  if (!window.crypto || !crypto.subtle) {
    document.getElementById("msg").textContent = "Open the studio over https to unlock it.";
  }
  document.getElementById("gate").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("msg");
    if (!window.crypto || !crypto.subtle) { msg.textContent = "Open the studio over https to unlock it."; return; }
    msg.textContent = "";
    const remember = document.getElementById("remember").checked;
    try {
      const raw = await derive(document.getElementById("key").value);
      await open(raw);
      if (remember) {
        try { localStorage.setItem(STORE, btoa(String.fromCharCode(...raw))); } catch {}
      }
    } catch {
      msg.textContent = "That key doesn't open the studio.";
    }
  });
})();
</script>
</body>
</html>
`

// Replace dist with the gate page alone.
fs.rmSync(dist, { recursive: true, force: true })
fs.mkdirSync(dist)
fs.writeFileSync(path.join(dist, "index.html"), gate)
console.log(`Studio sealed: ${Math.round(sealed.length / 1024)} KB encrypted into dist/index.html`)
