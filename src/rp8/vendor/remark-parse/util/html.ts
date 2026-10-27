// @ts-nocheck -- vendored from remark-parse 8.0.3 (MIT, Titus Wormer), converted to ESM by
// scripts/vendor-rp8.py; code otherwise as published. See src/rp8/vendor/README.md.
var attributeName = '[a-zA-Z_:][a-zA-Z0-9:._-]*'
var unquoted = '[^"\'=<>`\\u0000-\\u0020]+'
var singleQuoted = "'[^']*'"
var doubleQuoted = '"[^"]*"'
var attributeValue =
  '(?:' + unquoted + '|' + singleQuoted + '|' + doubleQuoted + ')'
var attribute =
  '(?:\\s+' + attributeName + '(?:\\s*=\\s*' + attributeValue + ')?)'
var openTag = '<[A-Za-z][A-Za-z0-9\\-]*' + attribute + '*\\s*\\/?>'
var closeTag = '<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>'
var comment = '<!---->|<!--(?:-?[^>-])(?:-?[^-])*-->'
var processing = '<[?].*?[?]>'
// CHANGED: `\\s+[^>]*` in the published file, quadratic on a long space run (834 ms at
// 40,000). `[^>]` already holds every `\\s`, so one is the same language and the same match.
var declaration = '<![A-Za-z]+\\s[^>]*>'
var cdata = '<!\\[CDATA\\[[\\s\\S]*?\\]\\]>'

// CHANGED from the published file: `openTag` as a regular expression backtracks
// EXPONENTIALLY. `recheck` rates `^(?:openTag|closeTag)` and `tag` exponential, and its own
// 205-character attack string took 134 s in `openCloseTag.test` -- 270 s to parse a note
// holding only that line. A vault note is untrusted input, so both are replaced by
// `matchOpenCloseTag`, a set-of-states simulation of the SAME grammar in linear time.
// `test/rp8-vendored.test.ts` holds it to the published expressions, match for match.
//
// The published expressions, for reference (strings only, never compiled here):
//   openCloseTag = '^(?:' + openTag + '|' + closeTag + ')'
//   tag          = '^(?:' + openTag + '|' + closeTag + '|' + comment + '|' + processing
//                  + '|' + declaration + '|' + cdata + ')'
void openTag
void attribute
void attributeValue
void singleQuoted
void doubleQuoted
void unquoted
void attributeName

const whitespace = /\s/
const isAsciiLetter = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
const isTagNameChar = (c) => isAsciiLetter(c) || (c >= '0' && c <= '9') || c === '-'
const isNameStart = (c) => isAsciiLetter(c) || c === '_' || c === ':'
const isNameChar = (c) => isNameStart(c) || (c >= '0' && c <= '9') || c === '.' || c === '-'
// `[^"'=<>\`\u0000-\u0020]`
const isUnquoted = (c) =>
  c !== '"' && c !== "'" && c !== '=' && c !== '<' && c !== '>' && c !== '`' && c > ' '

// The open tag after `<name`, as a nondeterministic automaton:
//   AFTER  a complete tag name or attribute       QUOTE1/QUOTE2 inside a quoted value
//   SPACE  whitespace after a complete one        EQUALS after `=` (and spaces)
//   NAME   inside an attribute name               VALUE  inside an unquoted value
//   NAMESP whitespace after a name, before `=`    SLASH  after a closing `/`
const AFTER = 1
const SPACE = 2
const NAME = 4
const NAMESP = 8
const EQUALS = 16
const VALUE = 32
const QUOTE1 = 64
const QUOTE2 = 128
const SLASH = 256

/** From each state on character `c`, the set of next states; `-1` accepts at `>`. */
function step(states, c) {
  let next = 0
  const space = whitespace.test(c)
  // A complete name or value (or the tag name) may be followed by space, `/` or `>`.
  const complete = states & (AFTER | NAME | VALUE)
  if (complete || states & SPACE) {
    if (c === '>') return -1
    if (c === '/') next |= SLASH
  }
  if (complete && space) next |= SPACE
  if (states & SPACE) {
    if (space) next |= SPACE
    else if (isNameStart(c)) next |= NAME
  }
  if (states & NAME) {
    if (isNameChar(c)) next |= NAME
    else if (space) next |= NAMESP
    else if (c === '=') next |= EQUALS
  }
  if (states & NAMESP) {
    if (space) next |= NAMESP
    else if (c === '=') next |= EQUALS
  }
  if (states & EQUALS) {
    // Not `else`: U+00A0 and its kind are `\s` AND unquoted-value characters, so after `=`
    // one may be spacing or begin the value (`<a b=\u00a0>` matches).
    if (space) next |= EQUALS
    if (c === "'") next |= QUOTE1
    else if (c === '"') next |= QUOTE2
    else if (isUnquoted(c)) next |= VALUE
  }
  if (states & VALUE && isUnquoted(c)) next |= VALUE
  if (states & QUOTE1) next |= c === "'" ? AFTER : QUOTE1
  if (states & QUOTE2) next |= c === '"' ? AFTER : QUOTE2
  if (states & SLASH && c === '>') return -1
  return next
}

/**
 * The length of the open or close tag `value` starts with, or -1 -- what
 * `^(?:openTag|closeTag)` matches, in linear time. The match is unique: a `>` outside a
 * quoted value can only end the tag, and every live branch is inside the same quotes or
 * none, so the first accepting `>` is the expression's own match.
 */
export function matchOpenCloseTag(value) {
  if (value.charAt(0) !== '<') return -1
  let index = 1
  const closing = value.charAt(1) === '/'
  if (closing) index++
  if (!isAsciiLetter(value.charAt(index))) return -1
  while (isTagNameChar(value.charAt(index))) index++
  if (closing) {
    while (index < value.length && whitespace.test(value.charAt(index))) index++
    return value.charAt(index) === '>' ? index + 1 : -1
  }
  let states = AFTER
  for (; index < value.length; index++) {
    states = step(states, value.charAt(index))
    if (states === -1) return index + 1
    if (states === 0) return -1
  }
  return -1
}

// The other alternatives of `tag`, unchanged; each is linear on its own.
const otherTag = new RegExp(
  '^(?:' + comment + '|' + processing + '|' + declaration + '|' + cdata + ')'
)

/** `^(?:openTag|closeTag)`, as `.test` uses it. */
export const openCloseTag = {
  test: (value) => matchOpenCloseTag(value) !== -1
}

/** `tag`, as `String.prototype.match` uses it: the tag at the start of the value, or null. */
export const tag = {
  [Symbol.match](value) {
    const length = matchOpenCloseTag(value)
    if (length !== -1) return [value.slice(0, length)]
    return value.match(otherTag)
  }
}
