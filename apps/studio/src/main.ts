// Particle Studio: the engine with every setting as a control, for exploring
// designs and saving looks to harasyn.co.
//   Locally (npm run dev), saving goes through the dev server into the repo.
//   Hosted (studio.harasyn.co), the site's looks are read from GitHub, and
//   saving commits them to main, which needs the owner key: a GitHub token
//   that can write to the repo, kept in this browser only. Anyone can also
//   keep looks in their own browser.
import { createField, FORM_NAMES, type Field } from "@harasyn/engine"
import {
  browserLooksStore, checkGitHubToken, cleanToken, devLooksStore, githubLooksStore, mountStudio, sceneFromHash, type LooksLibrary,
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
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}) =>
    Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K]
  const box = h("section", { className: "hs-group" })
  const note = h("p", { className: "hs-hint" })
  const row = h("div", { className: "hs-row" })
  if (ownerKey) {
    note.textContent = `Saving to ${SITE.url} is unlocked in this browser.`
    const forget = h("button", { type: "button", textContent: "Forget key" })
    forget.addEventListener("click", () => { localStorage.removeItem(OWNER_KEY); location.reload() })
    row.append(forget)
  } else {
    note.textContent = `A GitHub token that can write to ${SITE.repo} unlocks saving to ${SITE.url}.`
    const input = h("input", { type: "password", placeholder: "github_pat_…", autocomplete: "off" })
    const unlock = h("button", { type: "button", textContent: "Unlock saving" })
    const tryUnlock = async () => {
      note.textContent = "Checking the key with GitHub…"
      try {
        const token = cleanToken(input.value)
        const login = await checkGitHubToken(SITE.repo, token, SITE.path, SITE.branch)
        localStorage.setItem(OWNER_KEY, token)
        note.textContent = `Unlocked for ${login}.`
        location.reload()
      } catch (err) {
        note.textContent = (err as Error).message
      }
    }
    unlock.addEventListener("click", () => void tryUnlock())
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); void tryUnlock() } })
    row.append(input, unlock)
  }
  box.append(h("h3", { textContent: "Owner key" }), note, row)
  sections.push(box)
}

// The HARCO wordmark, small at the foot of the panel.
const brand = document.createElement("span")
brand.innerHTML = `<svg viewBox="0 0 851 100" role="img" aria-label="HARCO" fill="currentColor" fill-rule="evenodd"> <path d="M0 0H28V44H122V0H150V100H122V68H28V100H0Z" /> <path transform="translate(164 0)" d="M0 100V40A40 40 0 0 1 40 0H120A40 40 0 0 1 160 40V100H132V68H28V100ZM28 44V40A16 16 0 0 1 44 24H116A16 16 0 0 1 132 40V44Z" /> <path transform="translate(338 0)" d="M0 0H110A40 40 0 0 1 150 40V54A14 14 0 0 1 136 68H150V100H122V68H28V100H0ZM28 24H106A16 16 0 0 1 122 40V44H28Z" /> <path transform="translate(502 0)" d="M164.8 36A40 40 0 0 0 125 0H40A40 40 0 0 0 0 40V60A40 40 0 0 0 40 100H125A40 40 0 0 0 164.8 64H136.49A16 16 0 0 1 121 76H44A16 16 0 0 1 28 60V40A16 16 0 0 1 44 24H121A16 16 0 0 1 136.49 36Z" /> <path transform="translate(681 0)" d="M40 0H130A40 40 0 0 1 170 40V60A40 40 0 0 1 130 100H40A40 40 0 0 1 0 60V40A40 40 0 0 1 40 0ZM44 24H126A16 16 0 0 1 142 40V60A16 16 0 0 1 126 76H44A16 16 0 0 1 28 60V40A16 16 0 0 1 44 24Z" /> </svg>`

mountStudio(field, {
  title: "Particle Studio",
  corner: "left",
  shareLinks: true,
  libraries,
  sections,
  brand: brand.firstElementChild!,
})
