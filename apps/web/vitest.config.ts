import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    hookTimeout: 30000,
    testTimeout: 30000,
    globals: true,
  },
});
