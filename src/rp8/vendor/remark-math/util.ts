// @ts-nocheck -- vendored from remark-math 3.0.1 (MIT, Junyoung Choi), converted to ESM by
// scripts/vendor-rp8.py; code otherwise as published. See src/rp8/vendor/README.md.
export { isRemarkParser }
export { isRemarkCompiler }

function isRemarkParser(parser) {
  return Boolean(parser && parser.prototype && parser.prototype.blockTokenizers)
}

function isRemarkCompiler(compiler) {
  return Boolean(compiler && compiler.prototype && compiler.prototype.visitors)
}
