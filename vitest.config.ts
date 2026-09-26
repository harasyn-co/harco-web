import { defineConfig } from "vitest/config"

// Unit tests for the engine's scene logic, the panel's pure parts and the
// site's content parsing.
export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    environment: "node",
  },
})
