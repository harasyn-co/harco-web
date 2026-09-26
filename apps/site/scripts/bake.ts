// Bakes the articles into images for the particles to draw: each page is
// laid out with real fonts and CSS in headless Chrome, at a few column
// widths, and cut into tiles (white ink on black). The site loads the tiles
// as raster layers, one particle per inked pixel, so no text ships to the
// browser. A manifest lists every page's tiles, their ink (particle) counts,
// and where its links are.
//
//   npm run bake -w @harasyn/site      (after changing an article)
//
// Run with Node's type stripping (see package.json); needs Chrome (set
// CHROME to its path if it isn't in the usual place).
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArticle, type Article } from "../src/content/parse.ts"
import { openBrowser } from "../../../tools/browser.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const site = path.resolve(here, "..")
const root = path.resolve(site, "../..")
const FINAL = path.join(site, "baked")
// Written beside it and swapped in at the end, so a running dev server never
// sees a half-baked folder.
const OUT = path.join(site, "baked.tmp")
const CONTENT = path.join(site, "content/articles")

/** Column widths baked, CSS px; the site uses the widest that fits. */
export const WIDTHS = [640, 350, 310]
/** Pixel densities baked: 2x for high-density screens, one particle per device pixel. */
const SCALES = [1, 2]
const TILE = 400

const font = (rel: string) => "file://" + path.join(root, "node_modules", rel)
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;")
const formatDate = (iso: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : ""

// The reading styles, in greys: brightness becomes each particle's coverage.
function css(width: number) {
  const wide = width >= 600
  return `
@font-face { font-family: "Geist"; src: url(${font("@fontsource-variable/geist/files/geist-latin-wght-normal.woff2")}) format("woff2"); font-weight: 100 900; }
@font-face { font-family: "Plex Mono"; src: url(${font("@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2")}) format("woff2"); font-weight: 400; }
html, body { margin: 0; background: #000; color: #fff; -webkit-font-smoothing: antialiased; }
#page { width: ${width}px; font-family: "Geist", sans-serif; text-align: left; }
#page.snippet { width: auto; display: inline-block; }
a { color: inherit; text-decoration: none; }
h1, h2 { margin: 0; font-weight: 400; letter-spacing: -0.01em; }
.heading { font-size: ${wide ? 64 : 40}px; line-height: 1.1; }
.title { font-size: ${wide ? 48 : 32}px; line-height: 1.15; }
.mono { font: 400 12px/1.4 "Plex Mono", monospace; letter-spacing: 0.08em; text-transform: uppercase; color: rgb(255 255 255 / 0.5); }
.back { margin: 0 0 28px; }
.meta { margin: 20px 0 0; }
.rule { height: 1px; margin: 28px 0 36px; background: rgb(255 255 255 / 0.3); }
.list { list-style: none; margin: ${wide ? 64 : 44}px 0 0; padding: 0; display: grid; gap: 44px; }
.list h2 { font-size: ${wide ? 30 : 24}px; line-height: 1.25; }
.list .mono { margin: 12px 0 0; }
.summary { margin: 8px 0 0; color: rgb(255 255 255 / 0.72); font-size: 16px; line-height: 1.55; max-width: 34rem; }
.prose { font-size: ${wide ? 18 : 17}px; line-height: 1.7; text-align: left; padding-bottom: 8px; }
.prose > * { margin: 0 0 1.2em; }
.prose h2 { margin: 2.2em 0 0.6em; font-size: 22px; line-height: 1.35; font-weight: 500; }
.prose ul, .prose ol { padding-left: 1.3em; }
.prose li { margin: 0.3em 0; }
.prose li::marker { color: rgb(255 255 255 / 0.45); }
.prose blockquote { margin-left: 0; padding-left: 1.2em; border-left: 1px solid rgb(255 255 255 / 0.45); color: rgb(255 255 255 / 0.72); font-style: italic; }
.prose code, .prose pre { font-family: "Plex Mono", monospace; font-size: 14px; }
/* Outlined, not filled: every lit pixel is a particle, so fills are costly. */
.prose pre { padding: 16px 18px; border-radius: 10px; border: 1px solid rgb(255 255 255 / 0.22); white-space: pre-wrap; line-height: 1.6; }
.prose table { width: 100%; border-collapse: collapse; font-size: 15px; }
.prose th, .prose td { text-align: left; padding: 8px 12px 8px 0; border-bottom: 1px solid rgb(255 255 255 / 0.18); }
.prose th { font: 400 12px/1.4 "Plex Mono", monospace; letter-spacing: 0.08em; text-transform: uppercase; color: rgb(255 255 255 / 0.5); }
.prose a { text-decoration: underline; text-underline-offset: 3px; text-decoration-color: rgb(255 255 255 / 0.45); }
`
}

// Links are marked with data-href; their boxes become hit areas on the site.
const listHtml = (articles: Article[]) => `
<h1 class="heading">Experiments</h1>
<ol class="list">${articles.map((a) => `
  <li data-href="/experiments/${a.slug}">
    <h2>${esc(a.title)}</h2>
    <p class="mono">${formatDate(a.date)} · ${a.minutes} min read</p>
    <p class="summary">${esc(a.summary)}</p>
  </li>`).join("")}
</ol>`

const articleHtml = (a: Article) => `
<p class="mono back"><a data-href="/experiments">← Experiments</a></p>
<h1 class="title">${esc(a.title)}</h1>
<p class="mono meta">${formatDate(a.date)} · ${a.minutes} min read</p>
<div class="rule"></div>
<div class="prose">${a.html.replace(/<a href="([^"]*)"/g, '<a data-href="$1"')}</div>`

const navHtml = `<span class="mono" style="display:inline-block;padding:4px 0;font-size:12px;letter-spacing:0.12em;color:rgb(255 255 255 / 0.7)" data-href="/experiments">Experiments</span>`

interface Tile { src: string; top: number; height: number; ink: number }
interface Baked { width: number; height: number; scale: number; tiles: Tile[]; links: { href: string; x: number; y: number; w: number; h: number }[] }

const articles = fs.readdirSync(CONTENT).filter((f) => f.endsWith(".md"))
  .map((f) => parseArticle(f.replace(/\.md$/, ""), fs.readFileSync(path.join(CONTENT, f), "utf8")))
  .sort((a, b) => b.date.localeCompare(a.date))

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "harco-bake-"))
const browser = await openBrowser({ width: 800, height: 800, port: 9361 })

async function bake(key: string, html: string, width: number | "auto", scale: number): Promise<Baked> {
  const file = path.join(tmp, "page.html")
  const w = width === "auto" ? 640 : width
  fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${css(w)}</style></head>
<body><div id="page"${width === "auto" ? ' class="snippet"' : ""}>${html}</div></body></html>`)
  await browser.send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: scale, mobile: false })
  await browser.open("file://" + file, 300)
  await browser.eval("document.fonts.ready.then(() => true)")
  const box = await browser.eval(`(() => {
    const page = document.getElementById("page").getBoundingClientRect()
    const links = [...document.querySelectorAll("[data-href]")].map((el) => {
      const r = el.getBoundingClientRect()
      return { href: el.dataset.href, x: Math.round(r.left - page.left), y: Math.round(r.top - page.top), w: Math.round(r.width), h: Math.round(r.height) }
    })
    return { width: Math.ceil(page.width), height: Math.ceil(page.height), links }
  })()`) as { width: number; height: number; links: Baked["links"] }
  await browser.send("Emulation.setDeviceMetricsOverride", { width: w, height: Math.max(1, box.height), deviceScaleFactor: scale, mobile: false })
  const tiles: Tile[] = []
  for (let top = 0; top < box.height; top += TILE) {
    const height = Math.min(TILE, box.height - top)
    const shot = await browser.send("Page.captureScreenshot", {
      format: "png", captureBeyondViewport: true, clip: { x: 0, y: top, width: box.width, height, scale: 1 },
    }) as { data: string }
    // Ink: pixels the site will turn into particles (above the engine's
    // default threshold, 0.03 of full white).
    const ink = await browser.eval(`(async () => {
      const img = new Image(); img.src = "data:image/png;base64,${shot.data}"; await img.decode()
      const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext("2d"); g.drawImage(img, 0, 0)
      const d = g.getImageData(0, 0, img.width, img.height).data; let n = 0
      for (let i = 0; i < d.length; i += 4) if (d[i] > 8) n++
      return n
    })()`) as number
    if (!ink) continue
    const png = Buffer.from(shot.data, "base64")
    const hash = crypto.createHash("sha1").update(png).digest("hex").slice(0, 10)
    const name = `${key.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-${box.width}@${scale}x-${tiles.length}-${hash}.png`
    fs.writeFileSync(path.join(OUT, name), png)
    tiles.push({ src: `/baked/${name}`, top, height, ink })
  }
  return { width: box.width, height: box.height, scale, tiles, links: box.links }
}

const manifest: {
  pages: Record<string, { title: string; widths: Baked[] }>
  ui: Record<string, Baked[]>
} = { pages: {}, ui: {} }

try {
  manifest.pages["/experiments"] = { title: "Experiments", widths: [] }
  for (const s of SCALES) for (const w of WIDTHS) manifest.pages["/experiments"].widths.push(await bake("experiments", listHtml(articles), w, s))
  for (const a of articles) {
    const key = `/experiments/${a.slug}`
    manifest.pages[key] = { title: a.title, widths: [] }
    for (const s of SCALES) for (const w of WIDTHS) manifest.pages[key].widths.push(await bake(key, articleHtml(a), w, s))
  }
  manifest.ui["nav-experiments"] = []
  for (const s of SCALES) manifest.ui["nav-experiments"].push(await bake("nav-experiments", navHtml, "auto", s))
} finally {
  await browser.close()
  fs.rmSync(tmp, { recursive: true, force: true })
}

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n")
fs.rmSync(FINAL, { recursive: true, force: true })
fs.renameSync(OUT, FINAL)
const files = fs.readdirSync(FINAL).length - 1
const ink = Object.values(manifest.pages).flatMap((p) => p.widths.flatMap((b) => b.tiles)).reduce((a, t) => Math.max(a, t.ink), 0)
console.log(`Baked ${Object.keys(manifest.pages).length} pages and ${Object.keys(manifest.ui).length} UI piece into ${files} tiles (most ink in one tile: ${ink} px).`)
