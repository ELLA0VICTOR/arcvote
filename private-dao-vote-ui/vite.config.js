import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env": {},
    global: "globalThis",
  },
  resolve: {
    alias: {
      crypto: fileURLToPath(new URL("./src/shims/crypto.js", import.meta.url)),
      fs: fileURLToPath(new URL("./src/shims/fs.js", import.meta.url)),
      stream: "stream-browserify",
      buffer: "buffer",
    },
  },
  optimizeDeps: {
    include: ["@solana/web3.js", "@coral-xyz/anchor", "buffer"],
    esbuildOptions: {
      target: "es2022",
    },
  },
  build: {
    target: "es2022",
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
