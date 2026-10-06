import type {
  Code,
  Construct,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";
import { types } from "micromark-util-symbol";

import { createChunkScan } from "./legacy-scan.js";

const LESS_THAN = 60;
const MAILTO = "mailto:";

function isWhitespace(character: string): boolean {
  return character !== "" && /\s/u.test(character);
}

/**
 * Port of `remark-parse@8.0.3` `lib/tokenize/auto-link.js`, email branch only.
 *
 * That tokenizer validates nothing. It reads a run, requires the character that
 * ended it to be `@` or `://`, reads a second run, and requires a `>`; both runs
 * stop only at whitespace, `>`, `@` or `:/`. A backslash is none of those, so it
 * is simply content -- which is the whole divergence here.
 *
 * Returns the matched content, or `null` when this construct should stand aside.
 */
export function legacyEmailAutolink(value: string): string | null {
  if (value.charAt(0) !== "<") return null;

  const length = value.length;
  let index = 1;
  let local = "";

  while (index < length) {
    const character = value.charAt(index);
    if (
      isWhitespace(character) ||
      character === ">" ||
      character === "<" ||
      character === "@" ||
      (character === ":" && value.charAt(index + 1) === "/")
    ) {
      break;
    }
    local += character;
    index++;
  }

  // Legacy requires a non-empty first run, and `<a\>b>` is exactly why: it ends
  // at the `>`, which is neither `@` nor `://`, so no autolink forms and the line
  // stays literal. Obsidian agrees, and so do we already.
  if (local === "" || value.charAt(index) !== "@") return null;
  index++;

  let domain = "";
  while (index < length) {
    const character = value.charAt(index);
    if (isWhitespace(character) || character === ">" || character === "<")
      break;
    domain += character;
    index++;
  }
  if (domain === "" || value.charAt(index) !== ">") return null;

  const content = `${local}@${domain}`;

  // Everything without a backslash is already stock micromark's, and it agrees
  // with Obsidian on all of it -- twenty-three of the twenty-four recorded
  // autolink probes. A combined extension that claimed them too would be
  // re-deciding settled cases for nothing.
  if (!content.includes("\\")) return null;

  // `<mailto:a\+@e.test>` is also already right, by a different route: micromark
  // reads it as a *protocol* autolink, where a backslash is permitted, giving url
  // and text `mailto:a\+@e.test`. Legacy would call it an email and strip the
  // prefix from the text, but the recorded `<mailto:a@e.test>` match shows
  // Obsidian keeps it -- the arbiter loses to the goldens here, so leave it be.
  if (content.slice(0, MAILTO.length).toLowerCase() === MAILTO) return null;

  return content;
}

/**
 * A backslash inside an autolink is content, not an escape.
 *
 *     <foo\+@bar.example.com>    links to `mailto:foo\+@bar.example.com` and
 *                                displays the backslash, where CommonMark reads
 *                                `\+` as an escaped plus, fails the email
 *                                pattern, and leaves `<foo+@bar.example.com>`
 *
 * The same rule a wikilink target follows, and it reaches further than it looks:
 * `<a\b@c.test>` had our parser escape the `b`, drop `<a\` as text, then autolink
 * the remaining `b@c.test` as a bare GFM email -- a link to the wrong address.
 *
 * Scoped to the email branch because that is the whole measured divergence. A URI
 * autolink already keeps its backslash (CommonMark forbids only space, `<` and
 * `>` there), and so does `mailto:`. Legacy is more permissive than this in other
 * ways too -- any non-whitespace domain, no TLD -- but no golden exercises those,
 * and widening on the strength of the arbiter alone would be shipping a guess.
 *
 * Emits micromark's own `autolink`/`autolinkEmail` tokens, so
 * `mdast-util-from-markdown` builds the link and prefixes `mailto:` itself.
 */
const legacyAutolink: Construct = {
  name: "legacyAutolink",
  tokenize(
    this: TokenizeContext,
    effects: Effects,
    ok: State,
    nok: State,
  ): State {
    const characters: string[] = [];
    let remaining = 0;

    // Bounded, and that is load-bearing rather than tidy. An unbounded scan on a
    // character as common as `<` is quadratic: `<` x 20000 went from 64ms to 16s,
    // the same shape that still blocks the backtick retry. Nothing past the first
    // whitespace, `>` or `<` can change the answer, so the scan stops there.
    //
    // Stopping at `<` means declining `<a<b@c.test>`, which legacy would link.
    // Stock micromark does not, no golden covers it, and this construct only ever
    // owns backslash cases -- so declining leaves it exactly as it is today.
    const scan = createChunkScan(
      characters,
      // `characters.length > 1` skips the opening `<`, which is itself a stop
      // character and would otherwise end the scan after one byte.
      (character) =>
        characters.length > 1 &&
        (isWhitespace(character) || character === ">" || character === "<"),
    );

    return start;

    function start(code: Code): State | undefined {
      characters.length = 0;
      return effects.check(scan, decide, decide)(code);
    }

    function decide(code: Code): State | undefined {
      const content = legacyEmailAutolink(characters.join(""));
      // Stand aside rather than emit data: stock autolink and html both want
      // this `<`, and for every case but ours they are right.
      if (content === null) return nok(code);
      remaining = content.length;
      effects.enter(types.autolink);
      effects.enter(types.autolinkMarker);
      effects.consume(code);
      effects.exit(types.autolinkMarker);
      effects.enter(types.autolinkEmail);
      return consumeContent;
    }

    function consumeContent(code: Code): State | undefined {
      effects.consume(code);
      if (--remaining > 0) return consumeContent;
      effects.exit(types.autolinkEmail);
      return closeMarker;
    }

    function closeMarker(code: Code): State | undefined {
      effects.enter(types.autolinkMarker);
      effects.consume(code);
      effects.exit(types.autolinkMarker);
      effects.exit(types.autolink);
      return ok;
    }
  },
};

/**
 * Lets an email autolink hold a backslash, as `remark-parse@8` does.
 */
export function legacyAutolinkSyntax(): Extension {
  return { text: { [LESS_THAN]: legacyAutolink } };
}
