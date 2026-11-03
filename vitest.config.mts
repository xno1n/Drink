import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => ({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    env: loadEnv(mode, process.cwd(), ""), // reads .env.local so tests see the Supabase URL/key
    fileParallelism: false,                // integration tests share one database
    testTimeout: 20000,
    include: ["tests/**/*.test.ts"],
  },
}));
