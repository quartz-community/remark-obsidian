// @ts-nocheck -- remark-parse 8.0.3's lib/util/remove-indentation.js (MIT, Titus Wormer),
// vendored in ./vendor, with the line marked "Obsidian:" changed.
import { trim as trim } from "./vendor/helpers.js";
import { repeat as repeat } from "./vendor/helpers.js";
import getIndent from "./vendor/remark-parse/util/get-indentation.js";
export default indentation

var lineFeed = '\n'
var space = ' '
var exclamationMark = '!'

// Remove the minimum indent from every line in `value`.  Supports both tab,
// spaced, and mixed indentation (as well as possible).
function indentation(value, maximum) {
  var values = value.split(lineFeed)
  var position = values.length + 1
  var minIndent = Infinity
  var matrix = []
  var index
  var indentation
  var stops

  values.unshift(repeat(space, maximum) + exclamationMark)

  while (position--) {
    indentation = getIndent(values[position])

    matrix[position] = indentation.stops

    if (trim(values[position]).length === 0) {
      continue
    }

    if (indentation.indent) {
      if (indentation.indent > 0 && indentation.indent < minIndent) {
        minIndent = indentation.indent
      }
    } else {
      // Obsidian (rule B3): a line with no indentation -- a lazy line -- is left out of the
      // minimum. Stock set minIndent to Infinity and stopped, cancelling every line's strip.
      continue
    }
  }

  if (minIndent !== Infinity) {
    position = values.length

    while (position--) {
      stops = matrix[position]
      index = minIndent

      while (index && !(index in stops)) {
        index--
      }

      values[position] = values[position].slice(stops[index] + 1)
    }
  }

  values.shift()

  return values.join(lineFeed)
}
