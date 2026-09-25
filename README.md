# harco

Monorepo for harasyn.co and the particle engine behind it.

```
apps/site/         harasyn.co (React + Vite). Deploys to GitHub Pages on push to main.
apps/playground/   The engine on its own, with every setting as a control.
packages/engine/   @harasyn/engine: particles that gather into shapes, harmonics,
                   math, images and UI. Framework-free, with a thin React wrapper.
packages/studio/   @harasyn/studio: the control panel used by the playground and,
                   in development only, by the site.
```

## Commands

Run from the repo root:

```sh
npm install
npm run dev          # site dev server
npm run build        # site production build -> apps/site/dist
npm run lint
npm run typecheck    # every workspace
```

Preview a site version other than the live one:

```sh
SITE_VERSION=v0 npm run dev
```

The live version is set in `apps/site/site.config.ts`.

## Styling the site (studio)

v2 reads its look from `apps/site/src/versions/v2/looks.json`: named scenes,
plus which one is the site's default. Change it from either place:

- **Playground** (`npm run dev -w @harasyn/playground`): style freely, then in
  **Looks** type a name and **Save**, or **Save & set as site default**. Looks
  save into the site version named by `studioVersion` in
  `apps/site/site.config.ts`.
- **The site itself** (`SITE_VERSION=v2 npm run dev`, then ⌥⇧S or `/?studio`):
  the same panel over the real page.

Click a saved look to load it; **set default** makes it the site's default.
Saving writes `looks.json` (a running site dev server reloads with it); commit
and push to publish. The studio and its save endpoint exist only in dev
servers, never in a build, so visitors can't reach them.
