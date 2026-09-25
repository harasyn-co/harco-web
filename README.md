# harco

Monorepo for harasyn.co and the particle engine behind it.

```
apps/site/         harasyn.co (React + Vite). Deploys to GitHub Pages on push to main.
packages/engine/   @harasyn/engine: particles that gather into shapes, harmonics,
                   math, images and UI. Framework-free, with a thin React wrapper.
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

The live version is set in `apps/site/site.config.ts`. The site as it was
before the monorepo is tagged `archive/site-v1`.
