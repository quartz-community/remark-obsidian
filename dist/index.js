// src/index.ts
import { visit } from "unist-util-visit";

// src/lib/syntax/wikilink.ts
import { codes } from "micromark-util-symbol";
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
function tokenize(effects, ok, nok) {
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
    if (code === PIPE) return nok(code);
    if (code === RIGHT_BRACKET || code === null || isLineEnding(code))
      return nok(code);
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
    return ok;
  }
}

// src/lib/syntax/highlight.ts
import { codes as codes2 } from "micromark-util-symbol";
var EQUALS = 61;
function isLineEnding2(code) {
  return code === codes2.lineFeed || code === codes2.carriageReturn;
}
function highlightSyntax() {
  return {
    text: {
      [EQUALS]: { name: "highlight", tokenize: tokenize2 }
    }
  };
}
function tokenize2(effects, ok, nok) {
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
    if (!hasContent && (code === EQUALS || code === codes2.greaterThan))
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
    return ok(code);
  }
}

// src/lib/syntax/comment.ts
var PERCENT = 37;
function commentSyntax() {
  return {
    text: {
      [PERCENT]: { name: "comment", tokenize: tokenize3 }
    },
    flow: {
      [PERCENT]: { name: "comment", tokenize: tokenize3 }
    }
  };
}
function tokenize3(effects, ok, nok) {
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
    return ok(code);
  }
}

// src/lib/syntax/tag.ts
import { codes as codes3 } from "micromark-util-symbol";
var HASH2 = 35;
var SLASH = 47;
var DASH = 45;
var UNDERSCORE = 95;
var tagCharRegex = /[\p{L}\p{M}\p{Emoji}]/u;
function isWhitespace(code) {
  return code === codes3.space || code === codes3.horizontalTab || code === codes3.lineFeed || code === codes3.carriageReturn || code === codes3.carriageReturnLineFeed;
}
function isTagChar(code) {
  if (code === null) return false;
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
      [HASH2]: { name: "tag", tokenize: tokenize4 }
    }
  };
}
function tokenize4(effects, ok, nok) {
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
    return ok(code);
  }
}

// src/lib/syntax/arrow.ts
var DASH2 = 45;
var EQUALS2 = 61;
var LEFT_ANGLE = 60;
var RIGHT_ANGLE = 62;
function arrowSyntax() {
  return {
    text: {
      [DASH2]: { name: "arrow", tokenize: tokenizeDash },
      [EQUALS2]: { name: "arrow", tokenize: tokenizeEquals },
      [LEFT_ANGLE]: { name: "arrow", tokenize: tokenizeLeftAngle }
    }
  };
}
function tokenizeDash(effects, ok, nok) {
  return start;
  function start(code) {
    if (code !== DASH2) return nok(code);
    effects.enter("arrow");
    effects.enter("arrowContent");
    effects.consume(code);
    return afterFirst;
  }
  function afterFirst(code) {
    if (code === RIGHT_ANGLE) {
      effects.consume(code);
      effects.exit("arrowContent");
      effects.exit("arrow");
      return ok;
    }
    if (code === DASH2) {
      effects.consume(code);
      return afterSecond;
    }
    return nok(code);
  }
  function afterSecond(code) {
    if (code !== RIGHT_ANGLE) return nok(code);
    effects.consume(code);
    effects.exit("arrowContent");
    effects.exit("arrow");
    return ok;
  }
}
function tokenizeEquals(effects, ok, nok) {
  return start;
  function start(code) {
    if (code !== EQUALS2) return nok(code);
    effects.enter("arrow");
    effects.enter("arrowContent");
    effects.consume(code);
    return afterFirst;
  }
  function afterFirst(code) {
    if (code === RIGHT_ANGLE) {
      effects.consume(code);
      effects.exit("arrowContent");
      effects.exit("arrow");
      return ok;
    }
    if (code === EQUALS2) {
      effects.consume(code);
      return afterSecond;
    }
    return nok(code);
  }
  function afterSecond(code) {
    if (code !== RIGHT_ANGLE) return nok(code);
    effects.consume(code);
    effects.exit("arrowContent");
    effects.exit("arrow");
    return ok;
  }
}
function tokenizeLeftAngle(effects, ok, nok) {
  return start;
  function start(code) {
    if (code !== LEFT_ANGLE) return nok(code);
    effects.enter("arrow");
    effects.enter("arrowContent");
    effects.consume(code);
    return afterLeft;
  }
  function afterLeft(code) {
    if (code === DASH2) {
      effects.consume(code);
      return leftDash;
    }
    if (code === EQUALS2) {
      effects.consume(code);
      return leftEquals;
    }
    return nok(code);
  }
  function leftDash(code) {
    if (code === DASH2) {
      effects.consume(code);
      effects.exit("arrowContent");
      effects.exit("arrow");
      return ok;
    }
    effects.exit("arrowContent");
    effects.exit("arrow");
    return ok(code);
  }
  function leftEquals(code) {
    if (code === EQUALS2) {
      effects.consume(code);
      effects.exit("arrowContent");
      effects.exit("arrow");
      return ok;
    }
    effects.exit("arrowContent");
    effects.exit("arrow");
    return ok(code);
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
        node.value = this.sliceSerialize(token);
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

// src/lib/mdast/arrow.ts
var arrowMap = {
  "->": "&rarr;",
  "-->": "&rArr;",
  "=>": "&rArr;",
  "==>": "&rArr;",
  "<-": "&larr;",
  "<--": "&lArr;",
  "<=": "&lArr;",
  "<==": "&lArr;"
};
function arrowFromMarkdown() {
  return {
    enter: {
      arrow(token) {
        this.enter({ type: "arrow", value: "" }, token);
      }
    },
    exit: {
      arrow(token) {
        const node = this.stack[this.stack.length - 1];
        const raw = this.sliceSerialize(token);
        node.value = arrowMap[raw] ?? raw;
        this.exit(token);
      }
    }
  };
}

// src/index.ts
var defaultOptions = {
  wikilinks: true,
  highlights: true,
  comments: true,
  tags: true,
  arrows: true
};
function remarkObsidian(userOpts) {
  const opts = { ...defaultOptions, ...userOpts };
  const data = this.data();
  data.micromarkExtensions ??= [];
  data.fromMarkdownExtensions ??= [];
  if (opts.wikilinks) {
    data.micromarkExtensions.push(wikilinkSyntax());
    data.fromMarkdownExtensions.push(wikilinkFromMarkdown());
  }
  if (opts.comments) {
    data.micromarkExtensions.push(commentSyntax());
    data.fromMarkdownExtensions.push(commentFromMarkdown());
  }
  if (opts.tags) {
    data.micromarkExtensions.push(tagSyntax());
    data.fromMarkdownExtensions.push(tagFromMarkdown());
  }
  if (opts.arrows) {
    data.micromarkExtensions.push(arrowSyntax());
    data.fromMarkdownExtensions.push(arrowFromMarkdown());
  }
  if (opts.highlights) {
    data.micromarkExtensions.push(highlightSyntax());
    data.fromMarkdownExtensions.push(highlightFromMarkdown());
  }
  if (!opts.comments) return void 0;
  return (tree) => {
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
  };
}
export {
  arrowFromMarkdown,
  arrowSyntax,
  commentFromMarkdown,
  commentSyntax,
  remarkObsidian as default,
  highlightFromMarkdown,
  highlightSyntax,
  tagFromMarkdown,
  tagSyntax,
  wikilinkFromMarkdown,
  wikilinkSyntax
};
//# sourceMappingURL=index.js.map