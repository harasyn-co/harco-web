import fs from "fs"
import path from "path"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { liveVersion } from "./site.config"
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

export default defineConfig({
  plugins: [
    siteVersion(),
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
})
