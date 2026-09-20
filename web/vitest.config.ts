import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// A config of its own: the React Router plugin owns the app build, and pulling it into the
// test run would drag in routing, typegen and the SPA entry that unit tests don't need.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["app/**/*.test.{ts,tsx}"],
  },
})
