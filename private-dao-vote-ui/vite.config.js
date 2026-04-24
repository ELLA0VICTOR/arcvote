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
});
