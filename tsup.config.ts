import { readFile } from "node:fs/promises";

import { defineConfig, type Options } from "tsup";

/**
 * `format` (through `fault`, through `micromark-extension-frontmatter`) falls back to
 * `(1,eval)('this')` when it has no `module`. esbuild's CommonJS wrapper always passes one, so
 * the line cannot run in `dist`, but a scanner or a plugin review still reads it as `eval`.
 */
const removeFormatEval: NonNullable<Options["esbuildPlugins"]>[number] = {
  name: "remove-format-eval",
  setup(build) {
    build.onLoad(
      { filter: /[\\/]node_modules[\\/]format[\\/]format\.js$/ },
      async (args) => ({
        contents: (await readFile(args.path, "utf8")).replace(
          "return this || (1,eval)('this')",
          "return this",
        ),
        loader: "js",
      }),
    );
  },
};

/** `eval(` or `(1, eval)(`. A property named `eval`, as `fault` has, is no call. */
const EVAL_CALL = /\beval\s*\)?\s*\(/;

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  splitting: false,
  outDir: "dist",
  platform: "node",
  esbuildPlugins: [removeFormatEval],
  async onSuccess() {
    const call = EVAL_CALL.exec(await readFile("dist/index.js", "utf8"));
    if (call)
      throw new Error(
        `dist/index.js calls eval: ${call.input.slice(Math.max(0, call.index - 40), call.index + 20)}`,
      );
  },
});
