import { defineConfig } from "vitest/config";

// Separate vitest config so the test runner does not load vite.config.js
// (which requires @vitejs/plugin-react, a browser-only dep not needed for
// server/utility unit tests).
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
