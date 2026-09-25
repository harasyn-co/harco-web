// Harco Studio: the engine with every setting as a control, for exploring
// designs and saving looks to harasyn.co.
//   Locally (npm run dev), saving goes through the dev server into the repo.
//   Hosted (studio.harasyn.co), the site's looks are read from GitHub, and
//   saving commits them to main, which needs the owner key: a GitHub token
//   that can write to the repo, kept in this browser only. Anyone can also
//   keep looks in their own browser.
import { createField, FORM_NAMES, type Field } from "@harasyn/engine"
import {
  browserLooksStore, checkGitHubToken, devLooksStore, githubLooksStore, mountStudio, sceneFromHash, type LooksLibrary,
} from "@harasyn/panel"

// Where the site keeps its looks (set in vite.config.ts from the site's config).
declare const __SITE_LOOKS__: { repo: string; path: string; branch: string; url: string }
const SITE = __SITE_LOOKS__
const OWNER_KEY = "harasyn-studio:owner-key"

const canvas = document.getElementById("field") as HTMLCanvasElement

let field: Field
try {
  // ?reduced forces reduced motion, to preview it without changing system settings.
  // #scene=... holds a shared scene (see "Copy link").
  const params = new URLSearchParams(location.search)
  field = createField(canvas, sceneFromHash() ?? {
    motion: { autoplay: { forms: FORM_NAMES, hold: 12 } },
  }, { reducedMotion: params.has("reduced") ? true : undefined })
} catch (err) {
  document.body.append(Object.assign(document.createElement("p"), { className: "error", textContent: (err as Error).message }))
  throw err
}
// Handy for driving the field from the console or an agent.
;(window as unknown as { field: Field }).field = field

const readOwnerKey = () => { try { return localStorage.getItem(OWNER_KEY) ?? "" } catch { return "" } }
const ownerKey = readOwnerKey()

const libraries: LooksLibrary[] = import.meta.env.DEV
  ? [{ title: "Site looks", store: devLooksStore(), site: true, canSave: true }]
  : [{
      title: "Site looks",
      store: githubLooksStore({ repo: SITE.repo, path: SITE.path, branch: SITE.branch, token: ownerKey || undefined }),
      site: true,
      canSave: !!ownerKey,
      readOnlyNote: `Enter the owner key above to save to ${SITE.url}.`,
    }]
libraries.push({ title: "My looks (this browser)", store: browserLooksStore(), canSave: true })

// The owner key, hosted only: checked against GitHub, then kept in this browser.
const sections: Node[] = []
if (!import.meta.env.DEV) {
  const box = document.createElement("section")
  const heading = Object.assign(document.createElement("h2"), { textContent: "Owner key" })
  const body = document.createElement("div")
  body.className = "hs-body"
  const note = document.createElement("p")
  const row = document.createElement("div")
  row.className = "hs-row"
  if (ownerKey) {
    note.textContent = `Saving to ${SITE.url} is unlocked in this browser.`
    const forget = Object.assign(document.createElement("button"), { type: "button", textContent: "Forget key" })
    forget.addEventListener("click", () => { localStorage.removeItem(OWNER_KEY); location.reload() })
    row.append(forget)
  } else {
    note.textContent = `A GitHub token that can write to ${SITE.repo} unlocks saving to ${SITE.url}.`
    const input = Object.assign(document.createElement("input"), { type: "password", placeholder: "github_pat_…", autocomplete: "off" })
    const unlock = Object.assign(document.createElement("button"), { type: "button", textContent: "Unlock saving" })
    unlock.addEventListener("click", async () => {
      note.textContent = "Checking…"
      try {
        const login = await checkGitHubToken(SITE.repo, input.value.trim())
        localStorage.setItem(OWNER_KEY, input.value.trim())
        note.textContent = `Unlocked for ${login}.`
        location.reload()
      } catch (err) {
        note.textContent = (err as Error).message
      }
    })
    row.append(input, unlock)
  }
  body.append(note, row)
  heading.addEventListener("click", () => box.classList.toggle("hs-closed"))
  if (ownerKey) box.classList.add("hs-closed")
  box.append(heading, body)
  sections.push(box)
}

mountStudio(field, { title: "Harco Studio", shareLinks: true, libraries, sections })
