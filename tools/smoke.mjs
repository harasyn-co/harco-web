// Smoke test: builds the site and the studio, serves them, and checks in
// headless Chrome that each one runs: the engine draws, the studio's panel
// and tabs are there, the site's build has no studio, and nothing throws.
// usage: npm run smoke
import { execSync, spawn } from "node:child_process"
import { openBrowser } from "./browser.mjs"

const run = (cmd) => execSync(cmd, { stdio: "inherit" })
const serve = (workspace, port) => spawn("npm", ["run", "preview", "-w", workspace, "--", "--port", String(port), "--strictPort"], { stdio: "ignore" })
const failures = []
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failures.push(what) }

run("npm run build")
run("npm run build -w @harasyn/studio")
const servers = [serve("@harasyn/site", 5291), serve("@harasyn/studio", 5292)]
const browser = await openBrowser()
try {
  await browser.sleep(2500)

  await browser.open("http://localhost:5291/", 5000)
  check(await browser.eval("!!document.querySelector('canvas')"), "site: the engine's canvas is on the page")
  check(await browser.eval("document.querySelector('h1 svg[aria-label=HARCO]') !== null"), "site: the wordmark is there")
  await browser.eval("window.dispatchEvent(new KeyboardEvent('keydown', {altKey: true, shiftKey: true, code: 'KeyS'}))")
  await browser.sleep(500)
  check(await browser.eval("!document.querySelector('.hs-studio')"), "site: the studio can't be opened in a build")
  check(browser.errors.length === 0, `site: no errors (${browser.errors.join(" | ")})`)
  browser.errors.length = 0

  await browser.open("http://localhost:5292/", 5000)
  const tabs = await browser.eval("[...document.querySelectorAll('.hs-tabs button')].map((b) => b.textContent).join(',')")
  check(tabs === "Style,Scene,Behavior,Text,Looks", `studio: the panel's tabs are there (${tabs})`)
  const stats = await browser.eval("field.stats()")
  check(stats.particles > 0 && stats.fps > 10, `studio: the field is running (${stats.particles} particles, ${stats.fps} fps)`)
  await browser.eval("[...document.querySelectorAll('.hs-tile')].find((b) => b.textContent.trim() === 'ember').click()")
  await browser.sleep(300)
  check(await browser.eval("document.querySelector('.hs-tag').textContent === 'Unsaved'"), "studio: a change shows as unsaved")
  check(browser.errors.length === 0, `studio: no errors (${browser.errors.join(" | ")})`)
} finally {
  await browser.close()
  for (const s of servers) s.kill()
}
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`)
  process.exit(1)
}
console.log("\nAll smoke checks passed")
