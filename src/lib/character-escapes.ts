/** The ASCII punctuation a backslash may escape, per CommonMark. */
const PUNCTUATION = new Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~");

/**
 * A source slice as a text node's value, with character escapes resolved.
 *
 * A raw slice is the right source for a node's `position` and the wrong one for its
 * `value`: the value is what the tokenizer resolved, and the two differ by exactly the
 * work a re-parse would redo. Left raw, `\*` stays spelled with its backslash where
 * every reader -- Obsidian, the arbiter and `remark-stringify` -- treats it as a `*`.
 *
 * The set is backslash plus ASCII punctuation, confirmed against the arbiter rather
 * than assumed: `\*`, `\"`, `\~`, `\|`, `\$`, `\=`, `\%`, `\!` and `\.` all resolve
 * while `\b` stays, so `remark-parse@8`'s set is CommonMark's here and the shorter
 * `markdown-escapes` list it ships is not what governs.
 *
 * Only the backslash is dropped, never a character, so the value stays aligned with the
 * span for everything after it.
 */
export function resolveEscapes(line: string): string {
  if (!line.includes("\\")) return line;

  let out = "";
  let at = 0;
  while (at < line.length) {
    const next = line[at + 1];
    if (line[at] === "\\" && next !== undefined && PUNCTUATION.has(next)) {
      out += next;
      at += 2;
      continue;
    }
    out += line[at];
    at += 1;
  }
  return out;
}
