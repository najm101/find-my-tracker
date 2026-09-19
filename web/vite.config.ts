import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), reactRouter()],
  // MapLibre's worker is an ES module (see app/components/ui/map.tsx).
  worker: { format: "es" },
  server: {
    // In development the API runs separately (uvicorn on :8080).
    proxy: { "/api": "http://127.0.0.1:8080" },
  },
})
