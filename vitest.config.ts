import { defineConfig } from "vitest/config"

// Unit tests for the engine's scene logic and the panel's pure parts.
export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
  },
})
