# harco

Monorepo for harasyn.co and the particle engine behind it.

```
apps/site/         harasyn.co (React + Vite). Deploys to GitHub Pages on push to main.
apps/studio/       Particle Studio (studio.harasyn.co): the engine with every setting
                   as a control, for exploring designs and saving looks to the site.
packages/engine/   @harasyn/engine: particles that gather into shapes, harmonics,
                   math, images and UI. Framework-free, with a thin React wrapper.
packages/panel/    @harasyn/panel: the control panel used by the studio and, in
                   development only, by the site.
```

## Commands

Run from the repo root:

```sh
npm install
npm run dev          # site dev server
npm run build        # site production build -> apps/site/dist
npm run lint
npm run typecheck    # every workspace
npm test             # unit tests (also run before every deploy)
npm run smoke        # builds the site and studio, checks both in headless Chrome
```

Preview a site version other than the live one:

```sh
SITE_VERSION=v0 npm run dev
```

The live version is set in `apps/site/site.config.ts`.

## Particle Studio

The studio is the engine with every setting as a control. Run it locally with
`npm run dev -w @harasyn/studio`, or use the hosted copy at studio.harasyn.co.

- **Looks:** style freely, then save under a name. **Site looks** are the
  site's (`apps/site/src/versions/<studioVersion>/looks.json`, with
  `studioVersion` in `apps/site/site.config.ts`); **Save & set as site
  default** makes one the site's look. **My looks** stay in the browser.
- **Saving to the site:** locally, saves go through the dev server into the
  repo (commit them yourself). Hosted, saves commit to `main`, which
  redeploys harasyn.co; they need the **owner key**, a GitHub token that can
  write to this repo, entered once in the studio and kept in that browser.
- **Access:** the hosted studio is published encrypted. Visitors need the
  **access key** (the `STUDIO_ACCESS_KEY` secret) to open it; without it
  there's only a key prompt.
- **Deploys:** `.github/workflows/studio.yml` builds the studio, seals it
  with the access key, and publishes it to the `harasyn-co/studio` repo,
  which serves studio.harasyn.co.

The site itself also opens the panel in development
(`SITE_VERSION=v2 npm run dev`, then ⌥⇧S or `/?studio`). Neither the panel nor
its save endpoint is ever part of the site's build.
