import path from "node:path"
import { defineConfig } from "vite"
import { studioLooks } from "../../packages/studio/vite"
import { studioVersion } from "../site/site.config"

// The playground's studio saves looks straight into the site: a look saved
// here, or set as the default, is what that site version shows.
export default defineConfig({
  plugins: [studioLooks(path.resolve(__dirname, "../site/src/versions", studioVersion, "looks.json"))],
})
