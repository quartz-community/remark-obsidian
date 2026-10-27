// @ts-nocheck -- vendored from remark-parse 8.0.3 (MIT, Titus Wormer), converted to ESM by
// scripts/vendor-rp8.py; code otherwise as published. See src/rp8/vendor/README.md.
export default locate

var values = ['www.', 'http://', 'https://']

function locate(value, fromIndex) {
  var min = -1
  var index
  var length
  var position

  if (!this.options.gfm) {
    return min
  }

  length = values.length
  index = -1

  while (++index < length) {
    position = value.indexOf(values[index], fromIndex)

    if (position !== -1 && (min === -1 || position < min)) {
      min = position
    }
  }

  return min
}
