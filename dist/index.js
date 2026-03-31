// node_modules/unist-util-is/lib/index.js
var convert = (
  // Note: overloads in JSDoc can’t yet use different `@template`s.
  /**
   * @type {(
   *   (<Condition extends string>(test: Condition) => (node: unknown, index?: number | null | undefined, parent?: Parent | null | undefined, context?: unknown) => node is Node & {type: Condition}) &
   *   (<Condition extends Props>(test: Condition) => (node: unknown, index?: number | null | undefined, parent?: Parent | null | undefined, context?: unknown) => node is Node & Condition) &
   *   (<Condition extends TestFunction>(test: Condition) => (node: unknown, index?: number | null | undefined, parent?: Parent | null | undefined, context?: unknown) => node is Node & Predicate<Condition, Node>) &
   *   ((test?: null | undefined) => (node?: unknown, index?: number | null | undefined, parent?: Parent | null | undefined, context?: unknown) => node is Node) &
   *   ((test?: Test) => Check)
   * )}
   */
  /**
   * @param {Test} [test]
   * @returns {Check}
   */
  (function(test) {
    if (test === null || test === void 0) {
      return ok;
    }
    if (typeof test === "function") {
      return castFactory(test);
    }
    if (typeof test === "object") {
      return Array.isArray(test) ? anyFactory(test) : (
        // Cast because `ReadonlyArray` goes into the above but `isArray`
        // narrows to `Array`.
        propertiesFactory(
          /** @type {Props} */
          test
        )
      );
    }
    if (typeof test === "string") {
      return typeFactory(test);
    }
    throw new Error("Expected function, string, or object as test");
  })
);
function anyFactory(tests) {
  const checks = [];
  let index = -1;
  while (++index < tests.length) {
    checks[index] = convert(tests[index]);
  }
  return castFactory(any);
  function any(...parameters) {
    let index2 = -1;
    while (++index2 < checks.length) {
      if (checks[index2].apply(this, parameters)) return true;
    }
    return false;
  }
}
function propertiesFactory(check) {
  const checkAsRecord = (
    /** @type {Record<string, unknown>} */
    check
  );
  return castFactory(all);
  function all(node) {
    const nodeAsRecord = (
      /** @type {Record<string, unknown>} */
      /** @type {unknown} */
      node
    );
    let key;
    for (key in check) {
      if (nodeAsRecord[key] !== checkAsRecord[key]) return false;
    }
    return true;
  }
}
function typeFactory(check) {
  return castFactory(type);
  function type(node) {
    return node && node.type === check;
  }
}
function castFactory(testFunction) {
  return check;
  function check(value, index, parent) {
    return Boolean(
      looksLikeANode(value) && testFunction.call(
        this,
        value,
        typeof index === "number" ? index : void 0,
        parent || void 0
      )
    );
  }
}
function ok() {
  return true;
}
function looksLikeANode(value) {
  return value !== null && typeof value === "object" && "type" in value;
}

// node_modules/unist-util-visit-parents/lib/color.node.js
function color(d) {
  return "\x1B[33m" + d + "\x1B[39m";
}

// node_modules/unist-util-visit-parents/lib/index.js
var empty = [];
var CONTINUE = true;
var EXIT = false;
var SKIP = "skip";
function visitParents(tree, test, visitor, reverse) {
  let check;
  if (typeof test === "function" && typeof visitor !== "function") {
    reverse = visitor;
    visitor = test;
  } else {
    check = test;
  }
  const is2 = convert(check);
  const step = reverse ? -1 : 1;
  factory(tree, void 0, [])();
  function factory(node, index, parents) {
    const value = (
      /** @type {Record<string, unknown>} */
      node && typeof node === "object" ? node : {}
    );
    if (typeof value.type === "string") {
      const name = (
        // `hast`
        typeof value.tagName === "string" ? value.tagName : (
          // `xast`
          typeof value.name === "string" ? value.name : void 0
        )
      );
      Object.defineProperty(visit2, "name", {
        value: "node (" + color(node.type + (name ? "<" + name + ">" : "")) + ")"
      });
    }
    return visit2;
    function visit2() {
      let result = empty;
      let subresult;
      let offset;
      let grandparents;
      if (!test || is2(node, index, parents[parents.length - 1] || void 0)) {
        result = toResult(visitor(node, parents));
        if (result[0] === EXIT) {
          return result;
        }
      }
      if ("children" in node && node.children) {
        const nodeAsParent = (
          /** @type {UnistParent} */
          node
        );
        if (nodeAsParent.children && result[0] !== SKIP) {
          offset = (reverse ? nodeAsParent.children.length : -1) + step;
          grandparents = parents.concat(nodeAsParent);
          while (offset > -1 && offset < nodeAsParent.children.length) {
            const child = nodeAsParent.children[offset];
            subresult = factory(child, offset, grandparents)();
            if (subresult[0] === EXIT) {
              return subresult;
            }
            offset = typeof subresult[1] === "number" ? subresult[1] : offset + step;
          }
        }
      }
      return result;
    }
  }
}
function toResult(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "number") {
    return [CONTINUE, value];
  }
  return value === null || value === void 0 ? empty : [value];
}

// node_modules/unist-util-visit/lib/index.js
function visit(tree, testOrVisitor, visitorOrReverse, maybeReverse) {
  let reverse;
  let test;
  let visitor;
  if (typeof testOrVisitor === "function" && typeof visitorOrReverse !== "function") {
    test = void 0;
    visitor = testOrVisitor;
    reverse = visitorOrReverse;
  } else {
    test = testOrVisitor;
    visitor = visitorOrReverse;
    reverse = maybeReverse;
  }
  visitParents(tree, test, overload, reverse);
  function overload(node, parents) {
    const parent = parents[parents.length - 1];
    const index = parent ? parent.children.indexOf(node) : void 0;
    return visitor(node, index, parent);
  }
}

// node_modules/micromark-util-symbol/lib/codes.js
var codes = (
  /** @type {const} */
  {
    carriageReturn: -5,
    lineFeed: -4,
    carriageReturnLineFeed: -3,
    horizontalTab: -2,
    virtualSpace: -1,
    eof: null,
    nul: 0,
    soh: 1,
    stx: 2,
    etx: 3,
    eot: 4,
    enq: 5,
    ack: 6,
    bel: 7,
    bs: 8,
    ht: 9,
    // `\t`
    lf: 10,
    // `\n`
    vt: 11,
    // `\v`
    ff: 12,
    // `\f`
    cr: 13,
    // `\r`
    so: 14,
    si: 15,
    dle: 16,
    dc1: 17,
    dc2: 18,
    dc3: 19,
    dc4: 20,
    nak: 21,
    syn: 22,
    etb: 23,
    can: 24,
    em: 25,
    sub: 26,
    esc: 27,
    fs: 28,
    gs: 29,
    rs: 30,
    us: 31,
    space: 32,
    exclamationMark: 33,
    // `!`
    quotationMark: 34,
    // `"`
    numberSign: 35,
    // `#`
    dollarSign: 36,
    // `$`
    percentSign: 37,
    // `%`
    ampersand: 38,
    // `&`
    apostrophe: 39,
    // `'`
    leftParenthesis: 40,
    // `(`
    rightParenthesis: 41,
    // `)`
    asterisk: 42,
    // `*`
    plusSign: 43,
    // `+`
    comma: 44,
    // `,`
    dash: 45,
    // `-`
    dot: 46,
    // `.`
    slash: 47,
    // `/`
    digit0: 48,
    // `0`
    digit1: 49,
    // `1`
    digit2: 50,
    // `2`
    digit3: 51,
    // `3`
    digit4: 52,
    // `4`
    digit5: 53,
    // `5`
    digit6: 54,
    // `6`
    digit7: 55,
    // `7`
    digit8: 56,
    // `8`
    digit9: 57,
    // `9`
    colon: 58,
    // `:`
    semicolon: 59,
    // `;`
    lessThan: 60,
    // `<`
    equalsTo: 61,
    // `=`
    greaterThan: 62,
    // `>`
    questionMark: 63,
    // `?`
    atSign: 64,
    // `@`
    uppercaseA: 65,
    // `A`
    uppercaseB: 66,
    // `B`
    uppercaseC: 67,
    // `C`
    uppercaseD: 68,
    // `D`
    uppercaseE: 69,
    // `E`
    uppercaseF: 70,
    // `F`
    uppercaseG: 71,
    // `G`
    uppercaseH: 72,
    // `H`
    uppercaseI: 73,
    // `I`
    uppercaseJ: 74,
    // `J`
    uppercaseK: 75,
    // `K`
    uppercaseL: 76,
    // `L`
    uppercaseM: 77,
    // `M`
    uppercaseN: 78,
    // `N`
    uppercaseO: 79,
    // `O`
    uppercaseP: 80,
    // `P`
    uppercaseQ: 81,
    // `Q`
    uppercaseR: 82,
    // `R`
    uppercaseS: 83,
    // `S`
    uppercaseT: 84,
    // `T`
    uppercaseU: 85,
    // `U`
    uppercaseV: 86,
    // `V`
    uppercaseW: 87,
    // `W`
    uppercaseX: 88,
    // `X`
    uppercaseY: 89,
    // `Y`
    uppercaseZ: 90,
    // `Z`
    leftSquareBracket: 91,
    // `[`
    backslash: 92,
    // `\`
    rightSquareBracket: 93,
    // `]`
    caret: 94,
    // `^`
    underscore: 95,
    // `_`
    graveAccent: 96,
    // `` ` ``
    lowercaseA: 97,
    // `a`
    lowercaseB: 98,
    // `b`
    lowercaseC: 99,
    // `c`
    lowercaseD: 100,
    // `d`
    lowercaseE: 101,
    // `e`
    lowercaseF: 102,
    // `f`
    lowercaseG: 103,
    // `g`
    lowercaseH: 104,
    // `h`
    lowercaseI: 105,
    // `i`
    lowercaseJ: 106,
    // `j`
    lowercaseK: 107,
    // `k`
    lowercaseL: 108,
    // `l`
    lowercaseM: 109,
    // `m`
    lowercaseN: 110,
    // `n`
    lowercaseO: 111,
    // `o`
    lowercaseP: 112,
    // `p`
    lowercaseQ: 113,
    // `q`
    lowercaseR: 114,
    // `r`
    lowercaseS: 115,
    // `s`
    lowercaseT: 116,
    // `t`
    lowercaseU: 117,
    // `u`
    lowercaseV: 118,
    // `v`
    lowercaseW: 119,
    // `w`
    lowercaseX: 120,
    // `x`
    lowercaseY: 121,
    // `y`
    lowercaseZ: 122,
    // `z`
    leftCurlyBrace: 123,
    // `{`
    verticalBar: 124,
    // `|`
    rightCurlyBrace: 125,
    // `}`
    tilde: 126,
    // `~`
    del: 127,
    // Unicode Specials block.
    byteOrderMarker: 65279,
    // Unicode Specials block.
    replacementCharacter: 65533
    // `�`
  }
);

// src/lib/syntax/wikilink.ts
var EXCLAMATION = 33;
var HASH = 35;
var LEFT_BRACKET = 91;
var BACKSLASH = 92;
var RIGHT_BRACKET = 93;
var PIPE = 124;
function isLineEnding(code) {
  return code === codes.lineFeed || code === codes.carriageReturn;
}
function wikilinkSyntax() {
  return {
    text: {
      [LEFT_BRACKET]: { name: "wikilink", tokenize },
      [EXCLAMATION]: { name: "wikilink", tokenize }
    }
  };
}
function tokenize(effects, ok2, nok) {
  let hasPath = false;
  let hasHeading = false;
  let hasAlias = false;
  return start;
  function start(code) {
    if (code === EXCLAMATION) {
      effects.enter("wikilink");
      effects.enter("wikilinkEmbedMarker");
      effects.consume(code);
      effects.exit("wikilinkEmbedMarker");
      return openFirst;
    }
    if (code === LEFT_BRACKET) {
      effects.enter("wikilink");
      return openFirst(code);
    }
    return nok(code);
  }
  function openFirst(code) {
    if (code !== LEFT_BRACKET) return nok(code);
    effects.enter("wikilinkMarker");
    effects.consume(code);
    return openSecond;
  }
  function openSecond(code) {
    if (code !== LEFT_BRACKET) return nok(code);
    effects.consume(code);
    effects.exit("wikilinkMarker");
    return pathStart;
  }
  function pathStart(code) {
    if (code === HASH) return headingMarker(code);
    if (code === PIPE) return nok(code);
    if (code === RIGHT_BRACKET || code === null || isLineEnding(code))
      return nok(code);
    effects.enter("wikilinkPath");
    hasPath = true;
    return path(code);
  }
  function path(code) {
    if (code === BACKSLASH) {
      effects.consume(code);
      return pathEscape;
    }
    if (code === HASH) {
      effects.exit("wikilinkPath");
      return headingMarker(code);
    }
    if (code === PIPE) {
      effects.exit("wikilinkPath");
      return aliasMarker(code);
    }
    if (code === RIGHT_BRACKET) {
      effects.exit("wikilinkPath");
      return closeFirst(code);
    }
    if (code === null || isLineEnding(code)) return nok(code);
    effects.consume(code);
    return path;
  }
  function pathEscape(code) {
    if (code === PIPE) {
      effects.exit("wikilinkPath");
      return aliasMarker(code);
    }
    if (code === null || isLineEnding(code)) return nok(code);
    effects.consume(code);
    return path;
  }
  function headingMarker(code) {
    if (code !== HASH) return nok(code);
    effects.enter("wikilinkHeadingMarker");
    effects.consume(code);
    effects.exit("wikilinkHeadingMarker");
    return headingStart;
  }
  function headingStart(code) {
    if (code === null || isLineEnding(code)) return nok(code);
    if (code === RIGHT_BRACKET) {
      hasHeading = true;
      return closeFirst(code);
    }
    if (code === PIPE) {
      hasHeading = true;
      return aliasMarker(code);
    }
    effects.enter("wikilinkHeading");
    hasHeading = true;
    return heading(code);
  }
  function heading(code) {
    if (code === BACKSLASH) {
      effects.consume(code);
      return headingEscape;
    }
    if (code === PIPE) {
      effects.exit("wikilinkHeading");
      return aliasMarker(code);
    }
    if (code === RIGHT_BRACKET) {
      effects.exit("wikilinkHeading");
      return closeFirst(code);
    }
    if (code === null || isLineEnding(code)) return nok(code);
    effects.consume(code);
    return heading;
  }
  function headingEscape(code) {
    if (code === PIPE) {
      effects.exit("wikilinkHeading");
      return aliasMarker(code);
    }
    if (code === null || isLineEnding(code)) return nok(code);
    effects.consume(code);
    return heading;
  }
  function aliasMarker(code) {
    if (code !== PIPE) return nok(code);
    effects.enter("wikilinkAliasMarker");
    effects.consume(code);
    effects.exit("wikilinkAliasMarker");
    return aliasStart;
  }
  function aliasStart(code) {
    if (code === RIGHT_BRACKET) return closeFirst(code);
    if (code === null || isLineEnding(code)) return nok(code);
    effects.enter("wikilinkAlias");
    hasAlias = true;
    return alias(code);
  }
  function alias(code) {
    if (code === RIGHT_BRACKET) {
      effects.exit("wikilinkAlias");
      return closeFirst(code);
    }
    if (code === null || isLineEnding(code)) return nok(code);
    effects.consume(code);
    return alias;
  }
  function closeFirst(code) {
    if (code !== RIGHT_BRACKET) return nok(code);
    if (!hasPath && !hasHeading && !hasAlias) return nok(code);
    effects.enter("wikilinkMarker");
    effects.consume(code);
    return closeSecond;
  }
  function closeSecond(code) {
    if (code !== RIGHT_BRACKET) return nok(code);
    effects.consume(code);
    effects.exit("wikilinkMarker");
    effects.exit("wikilink");
    return ok2;
  }
}

// src/lib/syntax/highlight.ts
var EQUALS = 61;
function isLineEnding2(code) {
  return code === codes.lineFeed || code === codes.carriageReturn;
}
function highlightSyntax() {
  return {
    text: {
      [EQUALS]: { name: "highlight", tokenize: tokenize2 }
    }
  };
}
function tokenize2(effects, ok2, nok) {
  const close = { tokenize: tokenizeClose, partial: true };
  let hasContent = false;
  return start;
  function start(code) {
    if (code !== EQUALS) return nok(code);
    effects.enter("highlight");
    effects.enter("highlightMarker");
    effects.consume(code);
    return openSecond;
  }
  function openSecond(code) {
    if (code !== EQUALS) return nok(code);
    effects.consume(code);
    effects.exit("highlightMarker");
    effects.enter("highlightContent");
    return content;
  }
  function content(code) {
    if (code === null || isLineEnding2(code)) return nok(code);
    if (!hasContent && (code === EQUALS || code === codes.greaterThan))
      return nok(code);
    if (code === EQUALS)
      return effects.attempt(close, closeAfter, contentConsume)(code);
    effects.consume(code);
    hasContent = true;
    return content;
  }
  function contentConsume(code) {
    if (code === null || isLineEnding2(code)) return nok(code);
    effects.consume(code);
    return content;
  }
  function tokenizeClose(closeEffects, closeOk, closeNok) {
    return closeStart;
    function closeStart(closeCode) {
      if (closeCode !== EQUALS) return closeNok(closeCode);
      closeEffects.exit("highlightContent");
      closeEffects.enter("highlightMarker");
      closeEffects.consume(closeCode);
      return closeSecond;
    }
    function closeSecond(closeCode) {
      if (closeCode !== EQUALS) return closeNok(closeCode);
      closeEffects.consume(closeCode);
      closeEffects.exit("highlightMarker");
      return closeOk;
    }
  }
  function closeAfter(code) {
    effects.exit("highlight");
    return ok2(code);
  }
}

// src/lib/syntax/comment.ts
var PERCENT = 37;
var LINE_FEED = -4;
var CARRIAGE_RETURN = -3;
var CARRIAGE_RETURN_LINE_FEED = -5;
function isLineEnding3(code) {
  return code === LINE_FEED || code === CARRIAGE_RETURN || code === CARRIAGE_RETURN_LINE_FEED;
}
var commentFlow = {
  tokenize: tokenizeFlow,
  concrete: true,
  name: "commentFlow"
};
var nonLazyContinuation = {
  tokenize: tokenizeNonLazyContinuation,
  partial: true
};
function commentSyntax() {
  return {
    text: {
      [PERCENT]: { name: "comment", tokenize: tokenizeText }
    },
    flow: {
      [PERCENT]: commentFlow
    }
  };
}
function tokenizeText(effects, ok2, nok) {
  const close = { tokenize: tokenizeClose, partial: true };
  return start;
  function start(code) {
    if (code !== PERCENT) return nok(code);
    effects.enter("comment");
    effects.enter("commentMarker");
    effects.consume(code);
    return openSecond;
  }
  function openSecond(code) {
    if (code !== PERCENT) return nok(code);
    effects.consume(code);
    effects.exit("commentMarker");
    effects.enter("commentContent");
    return content;
  }
  function content(code) {
    if (code === null) return nok(code);
    if (code === PERCENT)
      return effects.attempt(close, closeAfter, contentConsume)(code);
    effects.consume(code);
    return content;
  }
  function contentConsume(code) {
    if (code === null) return nok(code);
    effects.consume(code);
    return content;
  }
  function tokenizeClose(closeEffects, closeOk, closeNok) {
    return closeStart;
    function closeStart(closeCode) {
      if (closeCode !== PERCENT) return closeNok(closeCode);
      closeEffects.exit("commentContent");
      closeEffects.enter("commentMarker");
      closeEffects.consume(closeCode);
      return closeSecond;
    }
    function closeSecond(closeCode) {
      if (closeCode !== PERCENT) return closeNok(closeCode);
      closeEffects.consume(closeCode);
      closeEffects.exit("commentMarker");
      return closeOk;
    }
  }
  function closeAfter(code) {
    effects.exit("comment");
    return ok2(code);
  }
}
function tokenizeFlow(effects, ok2, nok) {
  const self = this;
  const flowClose = {
    tokenize: tokenizeFlowClose,
    partial: true
  };
  return start;
  function start(code) {
    if (code !== PERCENT) return nok(code);
    effects.enter("comment");
    effects.enter("commentMarker");
    effects.consume(code);
    return openSecond;
  }
  function openSecond(code) {
    if (code !== PERCENT) return nok(code);
    effects.consume(code);
    effects.exit("commentMarker");
    return afterOpen;
  }
  function afterOpen(code) {
    if (code === null) return nok(code);
    if (isLineEnding3(code)) {
      return effects.attempt(
        nonLazyContinuation,
        beforeContentChunk,
        abandon
      )(code);
    }
    effects.enter("commentContent");
    return contentChunk(code);
  }
  function beforeContentChunk(code) {
    if (code === null) {
      return abandon(code);
    }
    if (isLineEnding3(code)) {
      return effects.attempt(
        nonLazyContinuation,
        beforeContentChunk,
        abandon
      )(code);
    }
    if (code === PERCENT) {
      return effects.attempt(flowClose, closeAfter, startContent)(code);
    }
    effects.enter("commentContent");
    return contentChunk(code);
  }
  function startContent(code) {
    effects.enter("commentContent");
    effects.consume(code);
    return contentChunk;
  }
  function contentChunk(code) {
    if (code === null) return abandon(code);
    if (code === PERCENT) {
      return effects.attempt(flowClose, closeAfter, contentConsume)(code);
    }
    if (isLineEnding3(code)) {
      effects.exit("commentContent");
      return effects.attempt(
        nonLazyContinuation,
        beforeContentChunk,
        abandon
      )(code);
    }
    effects.consume(code);
    return contentChunk;
  }
  function contentConsume(code) {
    if (code === null) return abandon(code);
    effects.consume(code);
    return contentChunk;
  }
  function closeAfter(code) {
    effects.exit("comment");
    return ok2(code);
  }
  function abandon(code) {
    effects.exit("comment");
    return nok(code);
  }
  function tokenizeFlowClose(closeEffects, closeOk, closeNok) {
    let inContent = false;
    return closeStart;
    function closeStart(closeCode) {
      if (closeCode !== PERCENT) return closeNok(closeCode);
      const current = self.events[self.events.length - 1];
      if (current && current[0] === "enter" && current[1].type === "commentContent") {
        closeEffects.exit("commentContent");
        inContent = true;
      }
      closeEffects.enter("commentMarker");
      closeEffects.consume(closeCode);
      return closeSecond;
    }
    function closeSecond(closeCode) {
      if (closeCode !== PERCENT) {
        if (inContent) {
          closeEffects.exit("commentMarker");
          closeEffects.enter("commentContent");
        }
        return closeNok(closeCode);
      }
      closeEffects.consume(closeCode);
      closeEffects.exit("commentMarker");
      return closeOk;
    }
  }
}
function tokenizeNonLazyContinuation(effects, ok2, nok) {
  const self = this;
  return start;
  function start(code) {
    if (code === null) {
      return ok2(code);
    }
    if (!isLineEnding3(code)) return nok(code);
    effects.enter("lineEnding");
    effects.consume(code);
    effects.exit("lineEnding");
    return lineStart;
  }
  function lineStart(code) {
    return self.parser.lazy[self.now().line] ? nok(code) : ok2(code);
  }
}

// src/lib/syntax/tag.ts
var HASH2 = 35;
var SLASH = 47;
var DASH = 45;
var UNDERSCORE = 95;
var tagCharRegex = /[\p{L}\p{M}\p{Emoji}]/u;
function isWhitespace(code) {
  return code === codes.space || code === codes.horizontalTab || code === codes.lineFeed || code === codes.carriageReturn || code === codes.carriageReturnLineFeed;
}
function isTagChar(code) {
  if (code === null || code < 0) return false;
  if (code >= 48 && code <= 57) return true;
  if (code === DASH || code === UNDERSCORE) return true;
  return tagCharRegex.test(String.fromCodePoint(code));
}
function isNonDigit(code) {
  if (code === null) return false;
  return !(code >= 48 && code <= 57);
}
function tagSyntax() {
  return {
    text: {
      [HASH2]: { name: "tag", tokenize: tokenize3 }
    }
  };
}
function tokenize3(effects, ok2, nok) {
  let hasNonDigit = false;
  const context = this;
  return start;
  function start(code) {
    const previous = context.previous;
    const allowedStart = previous === null || isWhitespace(previous) || previous === HASH2;
    if (!allowedStart) return nok(code);
    if (code !== HASH2) return nok(code);
    effects.enter("tag");
    effects.enter("tagMarker");
    effects.consume(code);
    effects.exit("tagMarker");
    return tagStart;
  }
  function tagStart(code) {
    if (!isTagChar(code)) return nok(code);
    effects.enter("tagContent");
    if (isNonDigit(code)) hasNonDigit = true;
    effects.consume(code);
    return tagContent;
  }
  function tagContent(code) {
    if (code === SLASH) {
      effects.consume(code);
      return afterSlash;
    }
    if (isTagChar(code)) {
      if (isNonDigit(code)) hasNonDigit = true;
      effects.consume(code);
      return tagContent;
    }
    return end(code);
  }
  function afterSlash(code) {
    if (!isTagChar(code)) return nok(code);
    if (isNonDigit(code)) hasNonDigit = true;
    effects.consume(code);
    return tagContent;
  }
  function end(code) {
    if (!hasNonDigit) return nok(code);
    effects.exit("tagContent");
    effects.exit("tag");
    return ok2(code);
  }
}

// src/lib/mdast/wikilink.ts
function wikilinkFromMarkdown() {
  return {
    enter: {
      wikilink(token) {
        this.enter(
          {
            type: "wikilink",
            value: "",
            embedded: false,
            path: "",
            heading: "",
            alias: ""
          },
          token
        );
      },
      wikilinkEmbedMarker() {
        const node = this.stack[this.stack.length - 1];
        node.embedded = true;
      },
      wikilinkPath(token) {
        const node = this.stack[this.stack.length - 1];
        node.path = this.sliceSerialize(token).replace(/\\([#\[\]])/g, "$1");
      },
      wikilinkHeading(token) {
        const node = this.stack[this.stack.length - 1];
        node.heading = this.sliceSerialize(token).replace(/\\([#\[\]])/g, "$1");
      },
      wikilinkAlias(token) {
        const node = this.stack[this.stack.length - 1];
        node.alias = this.sliceSerialize(token);
      }
    },
    exit: {
      wikilink(token) {
        const node = this.stack[this.stack.length - 1];
        if (node.alias) {
          if (node.path.endsWith("\\")) node.path = node.path.slice(0, -1);
          if (node.heading.endsWith("\\"))
            node.heading = node.heading.slice(0, -1);
        }
        this.exit(token);
      }
    }
  };
}

// src/lib/mdast/highlight.ts
function highlightFromMarkdown() {
  return {
    enter: {
      highlight(token) {
        this.enter({ type: "highlight", children: [] }, token);
      }
    },
    exit: {
      highlightContent(token) {
        const node = this.stack[this.stack.length - 1];
        node.children = [{ type: "text", value: this.sliceSerialize(token) }];
      },
      highlight(token) {
        this.exit(token);
      }
    }
  };
}

// src/lib/mdast/comment.ts
function commentFromMarkdown() {
  return {
    enter: {
      comment(token) {
        this.enter({ type: "comment", value: "" }, token);
      }
    },
    exit: {
      commentContent(token) {
        const node = this.stack[this.stack.length - 1];
        node.value += this.sliceSerialize(token);
      },
      comment(token) {
        this.exit(token);
      }
    }
  };
}

// src/lib/mdast/tag.ts
function tagFromMarkdown() {
  return {
    enter: {
      tag(token) {
        this.enter({ type: "tag", value: "" }, token);
      },
      tagContent(token) {
        const node = this.stack[this.stack.length - 1];
        if (node.type === "tag") node.value = this.sliceSerialize(token);
      }
    },
    exit: {
      tag(token) {
        this.exit(token);
      }
    }
  };
}

// src/lib/mdast/wikilink-to-markdown.ts
function wikilinkToMarkdown() {
  return {
    handlers: {
      wikilink(node) {
        const prefix = node.embedded ? "!" : "";
        const heading = node.heading ? `#${node.heading}` : "";
        const alias = node.alias ? `|${node.alias}` : "";
        return `${prefix}[[${node.path}${heading}${alias}]]`;
      }
    }
  };
}

// src/lib/mdast/highlight-to-markdown.ts
function highlightToMarkdown() {
  return {
    handlers: {
      highlight(node, _parent, state, info) {
        const exit = state.enter("highlight");
        const content = state.containerPhrasing(node, info);
        exit();
        return `==${content}==`;
      }
    }
  };
}

// src/lib/mdast/comment-to-markdown.ts
function commentToMarkdown() {
  return {
    handlers: {
      comment(node) {
        return `%%${node.value}%%`;
      }
    }
  };
}

// src/lib/mdast/tag-to-markdown.ts
function tagToMarkdown() {
  return {
    handlers: {
      tag(node) {
        return `#${node.value}`;
      }
    }
  };
}

// src/lib/task-char.ts
function customTaskCharTransform(tree, source) {
  visit(tree, "listItem", (node) => {
    if (typeof node.checked === "boolean") {
      let char = node.checked ? "x" : " ";
      if (source && node.position?.start?.offset != null) {
        const slice = source.slice(
          node.position.start.offset,
          node.position.start.offset + 20
        );
        const m = slice.match(/\[([^\]])\]/);
        if (m) {
          char = m[1];
        }
      }
      node.data ??= {};
      node.data.taskChar = char;
      node.data.hProperties ??= {};
      node.data.hProperties.dataTaskChar = char;
      return;
    }
    const firstChild = node.children?.[0];
    if (!firstChild || firstChild.type !== "paragraph") return;
    const firstText = firstChild.children?.[0];
    if (!firstText || firstText.type !== "text") return;
    const match = firstText.value.match(/^\[([^\]])\]\s/);
    if (!match) return;
    const taskChar = match[1];
    node.checked = taskChar !== " ";
    node.data ??= {};
    node.data.taskChar = taskChar;
    node.data.hProperties ??= {};
    node.data.hProperties.dataTaskChar = taskChar;
    firstText.value = firstText.value.slice(match[0].length);
    if (firstText.value.length === 0) {
      firstChild.children.shift();
    } else if (firstText.position && typeof firstText.position.start.offset === "number") {
      firstText.position.start.column += match[0].length;
      firstText.position.start.offset += match[0].length;
    }
  });
}

// src/index.ts
var defaultOptions = {
  wikilinks: true,
  highlights: true,
  comments: true,
  tags: true,
  customTaskChars: true
};
function remarkObsidian(userOpts) {
  const opts = { ...defaultOptions, ...userOpts };
  const data = this.data();
  data.micromarkExtensions ??= [];
  data.fromMarkdownExtensions ??= [];
  data.toMarkdownExtensions ??= [];
  if (opts.wikilinks) {
    data.micromarkExtensions.push(wikilinkSyntax());
    data.fromMarkdownExtensions.push(wikilinkFromMarkdown());
    data.toMarkdownExtensions.push(wikilinkToMarkdown());
  }
  if (opts.comments) {
    data.micromarkExtensions.push(commentSyntax());
    data.fromMarkdownExtensions.push(commentFromMarkdown());
    data.toMarkdownExtensions.push(commentToMarkdown());
  }
  if (opts.tags) {
    data.micromarkExtensions.push(tagSyntax());
    data.fromMarkdownExtensions.push(tagFromMarkdown());
    data.toMarkdownExtensions.push(tagToMarkdown());
  }
  if (opts.highlights) {
    data.micromarkExtensions.push(highlightSyntax());
    data.fromMarkdownExtensions.push(highlightFromMarkdown());
    data.toMarkdownExtensions.push(highlightToMarkdown());
  }
  const needsTransform = opts.comments || opts.customTaskChars;
  if (!needsTransform) return void 0;
  return (tree, file) => {
    if (opts.comments) {
      visit(
        tree,
        "comment",
        (_node, index, parent) => {
          if (parent && typeof index === "number") {
            parent.children.splice(index, 1);
            return index;
          }
          return void 0;
        }
      );
    }
    if (opts.customTaskChars) {
      customTaskCharTransform(tree, String(file));
    }
  };
}
export {
  commentFromMarkdown,
  commentSyntax,
  commentToMarkdown,
  customTaskCharTransform,
  remarkObsidian as default,
  highlightFromMarkdown,
  highlightSyntax,
  highlightToMarkdown,
  tagFromMarkdown,
  tagSyntax,
  tagToMarkdown,
  wikilinkFromMarkdown,
  wikilinkSyntax,
  wikilinkToMarkdown
};
//# sourceMappingURL=index.js.map