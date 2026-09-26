/**
 * Which version of the site is live.
 *
 * Each version lives in src/versions/<name>/ and exports its page as the
 * default export of App.tsx. Only the version named here is bundled into the
 * production build, so other versions never reach visitors.
 *
 * To switch the live site: change this value and push to main.
 * To preview another version locally without changing this file:
 *   SITE_VERSION=v1 npm run dev
 */
export const liveVersion = "v2"

/**
 * The version whose looks the engine playground's studio saves to, so a look
 * styled in the playground can become this version's default. Running the
 * site itself in dev edits whichever version is running.
 */
export const studioVersion = "v2"

/**
 * Whether articles (/experiments) are in the production build. They always run
 * in development. To preview a build with them: SITE_ARTICLES=1 npm run build
 */
export const articlesLive = true
