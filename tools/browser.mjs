// A small driver for headless Chrome over the DevTools protocol: open a page,
// evaluate expressions, press keys, drag, and take screenshots. Uses the
// Chrome installed on this machine, with a throwaway profile.
import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function openBrowser({ width = 1400, height = 900, port = 9333 } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "harco-chrome-"))
  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", `--window-size=${width},${height}`,
    "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "about:blank",
  ], { stdio: "ignore" })
  let targets
  for (let i = 0; i < 50 && !targets; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json() } catch { await sleep(200) }
  }
  if (!targets) throw new Error("Chrome didn't start")
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener("open", r))
  let id = 0
  const pending = new Map()
  const errors = []
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
    if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text)
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "))
  })
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
  await send("Runtime.enable")
  await send("Page.enable")
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false })

  return {
    errors,
    sleep,
    async open(url, wait = 3000) { await send("Page.navigate", { url }); await sleep(wait) },
    async eval(expression) {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "evaluation failed")
      return r.result?.result?.value
    },
    async screenshot(file) {
      const r = await send("Page.captureScreenshot", { format: "png" })
      fs.writeFileSync(file, Buffer.from(r.result.data, "base64"))
    },
    async close() {
      ws.close()
      const exited = new Promise((r) => chrome.once("exit", r))
      chrome.kill()
      await Promise.race([exited, sleep(3000)])
      // Chrome can still be writing its profile as it exits; retry briefly.
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    },
  }
}
