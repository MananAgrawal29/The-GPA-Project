import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * One flat config for the whole workspace.
 *
 * Scope is deliberate: JavaScript and TypeScript rules plus React hooks and
 * Fast Refresh. Type-aware lint rules are intentionally not enabled --
 * `pnpm typecheck` already runs the full TypeScript compiler over every
 * package, and type-aware linting would duplicate that coverage while
 * roughly doubling lint time.
 */
export default tseslint.config(
  {
    // Generated output and dependencies are never linted.
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // A leading underscore marks a parameter that must exist for a
      // signature but is not used -- for example Express only treats a
      // four-argument function as an error handler. TypeScript's own
      // noUnusedParameters honours the same convention, so this keeps
      // lint aligned with the compiler instead of suppressing the rule.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      ...reactRefresh.configs.vite.rules,
    },
  },
  // Must stay last so formatting rules never fight Prettier.
  eslintConfigPrettier,
);
