import { defineConfig } from "vite";
export default defineConfig({
  clearScreen: false,
  resolve: { dedupe: ["react", "react-dom", "zod"] },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    fs: { allow: [".."] },
  },
  build: { target: "es2022" },
});
