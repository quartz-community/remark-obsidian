import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", legacy: "src/legacy.ts" },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  splitting: false,
  outDir: "dist",
  platform: "node",
});
