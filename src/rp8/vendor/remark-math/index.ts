// @ts-nocheck -- vendored from remark-math 3.0.1 (MIT, Junyoung Choi), converted to ESM by
// scripts/vendor-rp8.py; code otherwise as published. See src/rp8/vendor/README.md.
import inlinePlugin from "./inline.js";
import blockPlugin from "./block.js";
export default math

function math(options) {
  var settings = options || {}
  blockPlugin.call(this, settings)
  inlinePlugin.call(this, settings)
}
