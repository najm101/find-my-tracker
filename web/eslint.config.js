import { readdirSync } from "node:fs"

import js from "@eslint/js"
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript"
import importX from "eslint-plugin-import-x"
import reactHooks from "eslint-plugin-react-hooks"
import globals from "globals"
import tseslint from "typescript-eslint"

// Feature-first: a feature may import shared code, never another feature or a route.
// Routes compose features. See docs/PLAN.md §4.
const features = (() => {
  try {
    return readdirSync("./app/features", { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }
})()

const featureZones = features.map((name) => ({
  target: `./app/features/${name}`,
  from: "./app/features",
  except: [`./${name}`],
  message: "Features must not import from other features. Compose them in a route instead.",
}))

export default tseslint.config(
  { ignores: ["build/", ".react-router/", "app/components/ui/", "app/lib/api/schema.d.ts"] },
  // The service worker runs in its own global scope, not the window.
  {
    files: ["public/sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "import-x": importX, "react-hooks": reactHooks },
    settings: { "import-x/resolver-next": [createTypeScriptImportResolver()] },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "import-x/no-restricted-paths": [
        "error",
        {
          zones: [
            ...featureZones,
            // Shared code must not depend on features or routes.
            {
              target: ["./app/components", "./app/lib", "./app/hooks", "./app/config"],
              from: ["./app/features", "./app/routes"],
            },
            { target: "./app/features", from: "./app/routes" },
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
)
