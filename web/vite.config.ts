import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { type Plugin, defineConfig } from "vite"
import babel from "vite-plugin-babel"

const require = createRequire(import.meta.url)

/**
 * Swagger UI for the API documentation page the server renders at /api/docs (when it's turned on
 * in Settings). Copied into the build so the page loads nothing from a CDN.
 */
function apiDocsAssets(): Plugin {
  return {
    name: "api-docs-assets",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    generateBundle() {
      for (const file of ["swagger-ui-bundle.js", "swagger-ui.css"])
        this.emitFile({
          type: "asset",
          fileName: `api-docs/${file}`,
          source: readFileSync(require.resolve(`swagger-ui-dist/${file}`)),
        })
    },
  }
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    reactRouter(),
    apiDocsAssets(),
    // React Compiler. The `react-hooks` lint rules already hold the code to its rules
    // (no Date.now() in render, and so on); this is what actually applies the memoization,
    // so components and derived values don't need useMemo/useCallback by hand.
    babel({
      include: [/app\/.*\.[jt]sx?$/],
      babelConfig: {
        babelrc: false,
        configFile: false,
        // Vite hands Babel ids with a query suffix, so it cannot infer TS/JSX from the
        // extension: say so explicitly. Babel only parses JSX here; the transform stays
        // with the React Router pipeline.
        presets: ["@babel/preset-typescript"],
        plugins: [
          "@babel/plugin-syntax-jsx",
          ["babel-plugin-react-compiler", { target: "19" }],
        ],
      },
    }),
  ],
  // MapLibre's worker is an ES module (see app/components/ui/map.tsx).
  worker: { format: "es" },
  server: {
    // In development the API runs separately (uvicorn on :8080).
    proxy: { "/api": "http://127.0.0.1:8080" },
  },
})
