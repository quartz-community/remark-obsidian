// @ts-nocheck -- vendored from remark-parse 8.0.3 (MIT, Titus Wormer), converted to ESM by
// scripts/vendor-rp8.py; code otherwise as published. See src/rp8/vendor/README.md.
import locate from "../locate/break.js";
export default hardBreak
hardBreak.locator = locate

var space = ' '
var lineFeed = '\n'
var minBreakLength = 2

function hardBreak(eat, value, silent) {
  var length = value.length
  var index = -1
  var queue = ''
  var character

  while (++index < length) {
    character = value.charAt(index)

    if (character === lineFeed) {
      if (index < minBreakLength) {
        return
      }

      /* istanbul ignore if - never used (yet) */
      if (silent) {
        return true
      }

      queue += character

      return eat(queue)({type: 'break'})
    }

    if (character !== space) {
      return
    }

    queue += character
  }
}
