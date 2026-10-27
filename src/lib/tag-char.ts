/**
 * What ends a tag, as Obsidian reads one: whitespace, ASCII punctuation other than `/`, `_` and
 * `-`, and the General and Supplemental Punctuation blocks (U+2000-U+206F, U+2E00-U+2E7F).
 *
 * Everything else continues it, which is far more than letters and emoji: `#a§b`, `#a€b`,
 * `#a→b`, `#a≠b`, `#a「b」`, `#a，b` and `#a©b` are each one tag. Asked of Obsidian 1.15.0 over
 * 163 characters, including both sides of every block boundary, and this agrees with all 163.
 * Within the General Punctuation block sit the zero-width space and joiner, so a ZWJ emoji
 * sequence ends at its first joiner -- `#👨‍👩‍👧` is the tag `👨`, as Obsidian reports it.
 *
 * The class this replaced (letters, marks, emoji, digits) rejected 66 of those 163, `§` among
 * them: issue #1's closing note.
 */
const TAG_STOP =
  /[\u2000-\u206F\u2E00-\u2E7F'!"#$%&()*+,.:;<=>?@^`{|}~[\]\\\s]/u;

/** Whether one character -- a code point, or a single BMP code unit -- continues a tag. */
export function isTagCharacter(char: string): boolean {
  return char !== "" && !TAG_STOP.test(char);
}
