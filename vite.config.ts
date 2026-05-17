import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths(), tailwindcss()],
  server: {
    proxy: {
      // Wrangler dev listens on 8787 by default.
      "/api": "http://localhost:8787",
      // US scrape preview during the multi-market spike — see
      // investigations/multi-market/form4-mapping.md.
      "/__us-": "http://localhost:8787",
      // EU spike (Sweden FI today) — dry-run preview at /eu-preview.
      "/__eu-": "http://localhost:8787",
    },
  },
});
