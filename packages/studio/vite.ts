// Vite plugin for the studio's saved looks, in development only. Serves
// /__studio/looks: GET returns the looks file; POST saves a look, sets the
// active one, or removes one, writing the file. `apply: "serve"` keeps it out
// of builds entirely, so visitors can never reach it.
import fs from "node:fs"
import type { Plugin } from "vite"

const NAME = /^[a-z0-9][a-z0-9-]*$/

type Looks = { active: string | null; looks: Record<string, unknown> }

/** `file` is the looks.json to read and write. */
export function studioLooks(file: string): Plugin {
  let wroteAt = 0
  const read = (): Looks => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { active: null, looks: {} })
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
              if (looks.active === name) return reply(400, { error: "The site's default look can't be deleted" })
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
    // Whoever saved already shows the look; don't reload that page under it.
    // (Other dev servers watching the file still pick the change up.)
    handleHotUpdate(ctx) {
      if (ctx.file === file && Date.now() - wroteAt < 2000) return []
    },
  }
}
