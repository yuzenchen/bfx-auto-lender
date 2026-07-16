import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  // 相對 base：讓帳戶儀表板在控制台代理路徑（/acc/0/）下也能載入資源
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        console: resolve(import.meta.dirname, "console.html"),
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
});
