import fs from "fs"
import path from "path"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { liveVersion } from "./site.config"

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

// Studio looks, in development only: the studio saves named scenes into the
// running version's looks.json, and picks which one the site uses. Never part
// of a build, so visitors can't reach it.
function studioLooks(): Plugin {
  const version = process.env.SITE_VERSION || liveVersion
  const file = path.resolve(__dirname, "src/versions", version, "looks.json")
  const NAME = /^[a-z0-9][a-z0-9-]*$/
  let wroteAt = 0

  type Looks = { active: string | null; looks: Record<string, unknown> }
  const read = (): Looks =>
    fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { active: null, looks: {} }
  const write = (looks: Looks) => {
    const sorted = Object.fromEntries(Object.entries(looks.looks).sort(([a], [b]) => a.localeCompare(b)))
    wroteAt = Date.now()
    fs.writeFileSync(file, JSON.stringify({ active: looks.active, looks: sorted }, null, 2) + "\n")
  }

  return {
    name: "studio-looks",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__studio/looks", (req, res) => {
        const reply = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify(body))
        }
        if (req.method === "GET") return reply(200, read())
        if (req.method !== "POST") return reply(405, { error: "GET or POST" })
        let body = ""
        req.on("data", (chunk) => (body += chunk))
        req.on("end", () => {
          try {
            const { action, name, scene, makeActive } = JSON.parse(body)
            if (typeof name !== "string" || !NAME.test(name)) return reply(400, { error: "Look names use lowercase letters, numbers and dashes" })
            const looks = read()
            if (action === "save") {
              if (!scene || typeof scene !== "object") return reply(400, { error: "save needs a scene" })
              looks.looks[name] = scene
              if (makeActive) looks.active = name
            } else if (action === "activate") {
              if (!looks.looks[name]) return reply(404, { error: `No look named ${name}` })
              looks.active = name
            } else if (action === "remove") {
              if (looks.active === name) return reply(400, { error: "The site's live look can't be deleted" })
              delete looks.looks[name]
            } else {
              return reply(400, { error: "action must be save, activate or remove" })
            }
            write(looks)
            reply(200, looks)
          } catch (err) {
            reply(400, { error: (err as Error).message })
          }
        })
      })
    },
    // The studio already shows what it saved; don't reload the page under it.
    handleHotUpdate(ctx) {
      if (ctx.file === file && Date.now() - wroteAt < 2000) return []
    },
  }
}

export default defineConfig({
  plugins: [siteVersion(), studioLooks(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
