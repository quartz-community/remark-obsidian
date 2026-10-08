import type {
  Code,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";
import { codes } from "micromark-util-symbol";

const HASH = 35;
const SLASH = 47;
const DASH = 45;
const UNDERSCORE = 95;
const ASTERISK = 42;

const tagCharRegex = /[\p{L}\p{M}\p{Emoji}]/u;

/** The `[` and `![` tokens, which open a label rather than close a construct. */
const LABEL_OPENERS = new Set(["labelLink", "labelImage"]);

function isWhitespace(code: Code): boolean {
  return (
    code === codes.space ||
    code === codes.horizontalTab ||
    // micromark expands a tab to `horizontalTab` plus `virtualSpace` fillers up
    // to the next tab stop, so the code immediately before the `#` is the filler
    // and not the tab. Without this, `rd⇥#tag` yields no tag while `rd #tag`
    // does -- six recorded cases turned on this one code.
    code === codes.virtualSpace ||
    code === codes.lineFeed ||
    code === codes.carriageReturn ||
    code === codes.carriageReturnLineFeed
  );
}

function isTagChar(code: Code): boolean {
  if (code === null || code < 0) return false;
  if (code >= 48 && code <= 57) return true;
  if (code === DASH || code === UNDERSCORE) return true;
  // `#` and `*` are emoji keycap bases, so `\p{Emoji}` matches them. Without this
  // `#tag#tag` reads as the single tag `tag#tag`; Obsidian yields two.
  if (code === HASH || code === ASTERISK) return false;
  // micromark yields UTF-16 code units, so an emoji arrives as two surrogates and
  // neither half matches a unicode property escape. Test them by range instead.
  if (code >= 0xd800 && code <= 0xdfff) return true;
  return tagCharRegex.test(String.fromCodePoint(code));
}

function isNonDigit(code: Code): boolean {
  if (code === null) return false;
  return !(code >= 48 && code <= 57);
}

export function tagSyntax(): Extension {
  return {
    text: {
      [HASH]: { name: "tag", tokenize },
    },
  };
}

function tokenize(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  let hasNonDigit = false;
  const context = this;

  return start;

  function start(code: Code): State | undefined {
    const previous = context.previous;
    // Obsidian also starts a tag straight after an inline construct, so
    // `a**b**#next` and `a[[t]]#next` tag `next` while `foo#next` does not. The
    // boundary is the end of a construct, not the character before it.
    const last = context.events[context.events.length - 1];
    // A label *opener* is not the end of anything. micromark emits an `exit` for the
    // `[` token itself, so an unclosed `![[` or `[[` reads as a finished construct and
    // let a tag start inside it: ` ![[#t` tagged `t` where Obsidian reports no tag at
    // all, because the `#` is simply inside literal text there. A closed one still
    // counts -- `a[[t]]#next` exits `wikilink` and does tag `next`.
    const afterConstruct =
      !!last &&
      last[0] === "exit" &&
      last[1].type !== "data" &&
      !LABEL_OPENERS.has(last[1].type);
    const allowedStart =
      previous === null ||
      isWhitespace(previous) ||
      previous === HASH ||
      afterConstruct;
    if (!allowedStart) return nok(code);
    if (code !== HASH) return nok(code);
    effects.enter("tag");
    effects.enter("tagMarker");
    effects.consume(code);
    effects.exit("tagMarker");
    return tagStart;
  }

  function tagStart(code: Code): State | undefined {
    if (!isTagChar(code)) return nok(code);
    effects.enter("tagContent");
    if (isNonDigit(code)) hasNonDigit = true;
    effects.consume(code);
    return tagContent;
  }

  function tagContent(code: Code): State | undefined {
    // A slash is ordinary content, and it counts as the non-digit a tag needs.
    // Recorded: `#123` is not a tag to Obsidian while `#123/456` is, and a slash
    // needs nothing after it -- `#a/` and `#a//b` are both tags. Requiring a tag
    // character after one rejected all three.
    if (code === SLASH) {
      hasNonDigit = true;
      effects.consume(code);
      return tagContent;
    }

    if (isTagChar(code)) {
      if (isNonDigit(code)) hasNonDigit = true;
      effects.consume(code);
      return tagContent;
    }

    return end(code);
  }

  function end(code: Code): State | undefined {
    if (!hasNonDigit) return nok(code);
    effects.exit("tagContent");
    effects.exit("tag");
    return ok(code);
  }
}
