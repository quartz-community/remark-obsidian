// @ts-nocheck -- vendored from remark-parse 8.0.3 (MIT, Titus Wormer), converted to ESM by
// scripts/vendor-rp8.py; code otherwise as published. See src/rp8/vendor/README.md.
import { xtend as xtend } from "../helpers.js";
import { stateToggle as toggle } from "../helpers.js";
import { vfileLocation as vfileLocation } from "../helpers.js";
import unescape from "./unescape.js";
import decode from "./decode.js";
import tokenizer from "./tokenizer.js";
import __required1 from "./set-options.js";
import __required2 from "./parse.js";
import __required3 from "./defaults.js";
import __required4 from "./tokenize/blank-line.js";
import __required5 from "./tokenize/code-indented.js";
import __required6 from "./tokenize/code-fenced.js";
import __required7 from "./tokenize/blockquote.js";
import __required8 from "./tokenize/heading-atx.js";
import __required9 from "./tokenize/thematic-break.js";
import __required10 from "./tokenize/list.js";
import __required11 from "./tokenize/heading-setext.js";
import __required12 from "./tokenize/html-block.js";
import __required13 from "./tokenize/definition.js";
import __required14 from "./tokenize/table.js";
import __required15 from "./tokenize/paragraph.js";
import __required16 from "./tokenize/escape.js";
import __required17 from "./tokenize/auto-link.js";
import __required18 from "./tokenize/url.js";
import __required19 from "./tokenize/email.js";
import __required20 from "./tokenize/html-inline.js";
import __required21 from "./tokenize/link.js";
import __required22 from "./tokenize/reference.js";
import __required23 from "./tokenize/strong.js";
import __required24 from "./tokenize/emphasis.js";
import __required25 from "./tokenize/delete.js";
import __required26 from "./tokenize/code-inline.js";
import __required27 from "./tokenize/break.js";
import __required28 from "./tokenize/text.js";
export default Parser

function Parser(doc, file) {
  this.file = file
  this.offset = {}
  this.options = xtend(this.options)
  this.setOptions({})

  this.inList = false
  this.inBlock = false
  this.inLink = false
  this.atStart = true

  this.toOffset = vfileLocation(file).toOffset
  this.unescape = unescape(this, 'escape')
  this.decode = decode(this)
}

var proto = Parser.prototype

// Expose core.
proto.setOptions = __required1
proto.parse = __required2

// Expose `defaults`.
proto.options = __required3

// Enter and exit helpers.
proto.exitStart = toggle('atStart', true)
proto.enterList = toggle('inList', false)
proto.enterLink = toggle('inLink', false)
proto.enterBlock = toggle('inBlock', false)

// Nodes that can interupt a paragraph:
//
// ```markdown
// A paragraph, followed by a thematic break.
// ___
// ```
//
// In the above example, the thematic break “interupts” the paragraph.
proto.interruptParagraph = [
  ['thematicBreak'],
  ['list'],
  ['atxHeading'],
  ['fencedCode'],
  ['blockquote'],
  ['html'],
  ['setextHeading', {commonmark: false}],
  ['definition', {commonmark: false}]
]

// Nodes that can interupt a list:
//
// ```markdown
// - One
// ___
// ```
//
// In the above example, the thematic break “interupts” the list.
proto.interruptList = [
  ['atxHeading', {pedantic: false}],
  ['fencedCode', {pedantic: false}],
  ['thematicBreak', {pedantic: false}],
  ['definition', {commonmark: false}]
]

// Nodes that can interupt a blockquote:
//
// ```markdown
// > A paragraph.
// ___
// ```
//
// In the above example, the thematic break “interupts” the blockquote.
proto.interruptBlockquote = [
  ['indentedCode', {commonmark: true}],
  ['fencedCode', {commonmark: true}],
  ['atxHeading', {commonmark: true}],
  ['setextHeading', {commonmark: true}],
  ['thematicBreak', {commonmark: true}],
  ['html', {commonmark: true}],
  ['list', {commonmark: true}],
  ['definition', {commonmark: false}]
]

// Handlers.
proto.blockTokenizers = {
  blankLine: __required4,
  indentedCode: __required5,
  fencedCode: __required6,
  blockquote: __required7,
  atxHeading: __required8,
  thematicBreak: __required9,
  list: __required10,
  setextHeading: __required11,
  html: __required12,
  definition: __required13,
  table: __required14,
  paragraph: __required15
}

proto.inlineTokenizers = {
  escape: __required16,
  autoLink: __required17,
  url: __required18,
  email: __required19,
  html: __required20,
  link: __required21,
  reference: __required22,
  strong: __required23,
  emphasis: __required24,
  deletion: __required25,
  code: __required26,
  break: __required27,
  text: __required28
}

// Expose precedence.
proto.blockMethods = keys(proto.blockTokenizers)
proto.inlineMethods = keys(proto.inlineTokenizers)

// Tokenizers.
proto.tokenizeBlock = tokenizer('block')
proto.tokenizeInline = tokenizer('inline')
proto.tokenizeFactory = tokenizer

// Get all keys in `value`.
function keys(value) {
  var result = []
  var key

  for (key in value) {
    result.push(key)
  }

  return result
}
