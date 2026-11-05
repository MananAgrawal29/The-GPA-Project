import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // The browser calls same-origin paths in development, so requests
    // reach the API without CORS and without embedding an origin in the
    // bundle. Production serves both from one host.
    proxy: {
      "/semesters": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
