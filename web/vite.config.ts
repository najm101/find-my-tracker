import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import babel from "vite-plugin-babel"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    reactRouter(),
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
