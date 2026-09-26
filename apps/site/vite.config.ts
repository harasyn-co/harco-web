import fs from "fs"
import path from "path"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { articlesLive, liveVersion } from "./site.config"
import { parseArticle } from "./src/content/parse"
import { studioLooks } from "../../packages/panel/vite"

const VIRTUAL_ID = "virtual:site-version"
const RESOLVED_ID = "\0" + VIRTUAL_ID

// Resolves `virtual:site-version` to the chosen version's App.tsx, so the
// build only includes that one version.
function siteVersion(): Plugin {
  const version = process.env.SITE_VERSION || liveVersion
  const entry = path.resolve(__dirname, "src/versions", version, "App.tsx")

  if (!fs.existsSync(entry)) {
    const available = fs.readdirSync(path.resolve(__dirname, "src/versions"))
    throw new Error(
      `Site version "${version}" not found at ${entry}. Available: ${available.join(", ")}`,
    )
  }

  return {
    name: "site-version",
    configResolved() {
      console.log(`\n  Site version: ${version}\n`)
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id) {
      if (id === RESOLVED_ID) {
        return `export { default } from ${JSON.stringify(entry)}`
      }
    },
    // Optional per-version page metadata in src/versions/<v>/meta.json:
    // { "description", "image" (absolute URL), "imageAlt" }. The description
    // replaces index.html's; the rest become Open Graph and Twitter tags.
    transformIndexHtml(html) {
      const file = path.resolve(__dirname, "src/versions", version, "meta.json")
      if (!fs.existsSync(file)) return html
      const meta = JSON.parse(fs.readFileSync(file, "utf8")) as {
        description?: string
        image?: string
        imageAlt?: string
      }
      const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
      const title = html.match(/<title>(.*?)<\/title>/)?.[1] ?? ""
      if (meta.description) {
        html = html.replace(
          /<meta name="description" content="[^"]*"\s*\/?>/,
          `<meta name="description" content="${esc(meta.description)}" />`,
        )
      }
      const tags = [
        `<meta property="og:type" content="website" />`,
        `<meta property="og:title" content="${esc(title)}" />`,
        meta.description && `<meta property="og:description" content="${esc(meta.description)}" />`,
        meta.image && `<meta property="og:image" content="${esc(meta.image)}" />`,
        meta.imageAlt && `<meta property="og:image:alt" content="${esc(meta.imageAlt)}" />`,
        `<meta name="twitter:card" content="${meta.image ? "summary_large_image" : "summary"}" />`,
      ].filter(Boolean)
      return html.replace("</head>", `    ${tags.join("\n    ")}\n  </head>`)
    },
  }
}

// Articles are drawn from baked tiles (scripts/bake.ts), served from
// /baked/. In builds, the tiles are copied in, with a page per article that
// carries its title and summary for link previews and direct links; the
// text itself only exists as the tiles' pixels.
function bakedArticles(): Plugin {
  const dir = path.resolve(__dirname, "baked")
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
  return {
    name: "baked-articles",
    configureServer(server) {
      server.middlewares.use("/baked", (req, res, next) => {
        // Tiles only: the manifest is imported as a module, which Vite serves.
        const file = path.join(dir, decodeURIComponent((req.url ?? "").split("?")[0]))
        if (!file.startsWith(dir) || !file.endsWith(".png") || !fs.existsSync(file)) return next()
        res.setHeader("Content-Type", "image/png")
        fs.createReadStream(file).pipe(res)
      })
    },
    // After Vite has written index.html into the bundle.
    enforce: "post",
    generateBundle(_options, bundle) {
      if (!fs.existsSync(dir)) this.error("No baked articles: run `npm run bake -w @harasyn/site` first.")
      for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".png"))) {
        this.emitFile({ type: "asset", fileName: `baked/${f}`, source: fs.readFileSync(path.join(dir, f)) })
      }
      const index = bundle["index.html"]
      if (!index || index.type !== "asset") return
      const shell = String(index.source)
      const content = path.resolve(__dirname, "content/articles")
      const page = (title: string, description: string) => shell
        .replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`)
        .replace(/(<meta (?:name="description"|property="og:description") content=")[^"]*/g, `$1${esc(description)}`)
        .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`)
      this.emitFile({ type: "asset", fileName: "experiments/index.html", source: page("Experiments · Harasyn Co.", "Experiments from Harasyn Co.") })
      for (const f of fs.readdirSync(content).filter((f) => f.endsWith(".md"))) {
        const a = parseArticle(f.replace(/\.md$/, ""), fs.readFileSync(path.join(content, f), "utf8"))
        this.emitFile({ type: "asset", fileName: `experiments/${a.slug}/index.html`, source: page(`${a.title} · Harasyn Co.`, a.summary) })
      }
    },
  }
}

const articlesOn = (command: string) => command === "serve" || articlesLive || process.env.SITE_ARTICLES === "1"

export default defineConfig(({ command }) => ({
  // Articles are compiled out of builds until they go live.
  define: { __ARTICLES__: JSON.stringify(articlesOn(command)) },
  plugins: [
    siteVersion(),
    articlesOn(command) && bakedArticles(),
    // In dev, the studio saves looks into the running version's looks.json.
    studioLooks(path.resolve(__dirname, "src/versions", process.env.SITE_VERSION || liveVersion, "looks.json")),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}))
