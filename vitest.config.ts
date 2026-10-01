import { defineConfig } from "vitest/config"

// Unit tests for the site's content parsing.
export default defineConfig({
  test: {
    include: ["apps/*/test/**/*.test.ts"],
    environment: "node",
  },
})
