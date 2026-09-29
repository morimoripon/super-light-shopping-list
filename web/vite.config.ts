import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // 古いタブレットのブラウザ向け。対象端末が決まったら見直す（CLAUDE.md 参照）
    target: "es2017",
    cssTarget: "chrome61",
  },
  server: {
    host: true, // 同じ LAN のタブレットから確認できるように
    proxy: {
      // `npm run dev:api`（wrangler dev, :8787）へ転送
      "/api": "http://localhost:8787",
    },
  },
});
