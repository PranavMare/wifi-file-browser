import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/file": "http://localhost:3000",
      "/download": "http://localhost:3000",
      "/thumb": "http://localhost:3000",
    },
  },
  build: {
    outDir: "../dist", // <— build next to server.js
    emptyOutDir: true,
  },
});
