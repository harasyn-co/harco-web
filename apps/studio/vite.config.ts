import path from "node:path"
import { defineConfig } from "vite"
import { studioLooks } from "../../packages/panel/vite"
import { studioVersion } from "../site/site.config"

// The site version whose looks the studio edits.
const looksPath = `apps/site/src/versions/${studioVersion}/looks.json`

export default defineConfig({
  // In dev, looks save straight into the site's file through the dev server.
  plugins: [studioLooks(path.resolve(__dirname, "../..", looksPath))],
  // Hosted, they're read from and committed to GitHub.
  define: {
    __SITE_LOOKS__: JSON.stringify({ repo: "harasyn-co/harco-web", path: looksPath, branch: "main", url: "harasyn.co" }),
  },
})
