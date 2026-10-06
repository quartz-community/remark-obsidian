import type { Code, Construct, State } from "micromark-util-types";

/** Materialise a micromark code as the source character legacy would have seen. */
export function codeToCharacter(code: Code): string {
  if (code === -5 || code === -4 || code === -3) return "\n";
  if (code === -2) return "\t";
  if (code === -1) return " ";
  return String.fromCodePoint(code as number);
}

/**
 * A partial that collects the rest of the text chunk into `sink`.
 *
 * Obsidian's tokenizers rescan from a delimiter, which micromark cannot do once
 * it has consumed. Running this under `effects.check` materialises the remaining
 * chunk as a plain string and then rewinds, so a ported tokenizer can decide the
 * whole match before anything is really eaten.
 *
 * The consumes must sit inside an open token. Without one micromark's token
 * stack desynchronises when `check` restores, which surfaces much later as
 * `expected last token to be open`.
 */
export function createChunkScan(
  sink: string[],
  stopAfter?: (character: string) => boolean,
): Construct {
  return {
    partial: true,
    tokenize(effects, ok) {
      return function enter(code: Code): State | undefined {
        effects.enter("legacyChunkScan");
        return step(code);
      };

      function step(code: Code): State | undefined {
        if (code === null) {
          effects.exit("legacyChunkScan");
          return ok(code);
        }
        const character = codeToCharacter(code);
        sink.push(character);
        effects.consume(code);
        if (stopAfter?.(character) === true) {
          effects.exit("legacyChunkScan");
          return ok;
        }
        return step;
      }
    },
  };
}

export interface Segment {
  readonly kind: "text" | "eol" | "data";
  readonly length: number;
}

/**
 * Split a matched body into the tokens micromark needs to see.
 *
 * Two rules, both learned from crashes rather than from the docs:
 *
 * A line ending consumed inside a token desynchronises the chunked token chain,
 * and `subtokenize` then scans past its splice buffer — reported as
 * `expected no next token`, far from the construct that caused it. Every line
 * ending therefore gets its own `lineEnding` token.
 *
 * Whitespace at the very end of a `text` token is read as a line suffix and
 * dropped. CommonMark spans can never end in whitespace so its own constructs
 * never hit it, but Obsidian's can — `a* b *c` holds ` b `. That tail is
 * emitted as `data`, which keeps it.
 */
export function planBody(body: string): Segment[] {
  const segments: Segment[] = [];
  let index = 0;

  while (index < body.length) {
    if (body[index] === "\n") {
      segments.push({ kind: "eol", length: 1 });
      index++;
      continue;
    }
    let end = index;
    while (end < body.length && body[end] !== "\n") end++;

    const run = body.slice(index, end);
    const kept = run.trimEnd();
    const isLast = end >= body.length;
    if (isLast && kept.length < run.length) {
      if (kept.length > 0) segments.push({ kind: "text", length: kept.length });
      segments.push({ kind: "data", length: run.length - kept.length });
    } else {
      segments.push({ kind: "text", length: run.length });
    }
    index = end;
  }

  return segments;
}
