// @ts-nocheck -- vendored from remark-parse 8.0.3 (MIT, Titus Wormer), converted to ESM by
// scripts/vendor-rp8.py; code otherwise as published. See src/rp8/vendor/README.md.
export default whitespace

var tab = 9 // '\t'
var lineFeed = 10 // '\n'
var lineTabulation = 11 // '\v'
var formFeed = 12 // '\f'
var carriageReturn = 13 // '\r'
var space = 32 // ' '

function whitespace(char) {
  /* istanbul ignore next - `number` handling for future */
  var code = typeof char === 'number' ? char : char.charCodeAt(0)

  switch (code) {
    case tab:
    case lineFeed:
    case lineTabulation:
    case formFeed:
    case carriageReturn:
    case space:
      return true
    default:
      return false
  }
}
