/**
 * The small packages remark-parse 8 and parse-entities 2 required, as one module.
 *
 * Each is the published v1 behaviour, read from its source; versions are those remark-parse
 * 8.0.3 resolved. All MIT. One deliberate change: `trim` 0.0.1 used `/^\s*|\s*$/g`, which is
 * quadratic on a long run of interior whitespace (GHSA-w5p7-h5w8-2hfq). `String.prototype.trim`
 * strips exactly the same characters -- `\s` and the trim set are both WhiteSpace plus
 * LineTerminator -- in linear time.
 */

/** trim 0.0.1 */
export function trim(value: string): string {
  return value.trim();
}

/** repeat-string 1.6.1, for the non-negative counts remark-parse passes. */
export function repeat(value: string, count: number): string {
  if (typeof value !== "string") throw new TypeError("expected a string");
  return value.repeat(count);
}

/** xtend 4.0.2: own enumerable properties of every argument, later winning. */
export function xtend(...sources: object[]): Record<string, unknown> {
  const target: Record<string, unknown> = {};
  for (const source of sources) {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        target[key] = (source as Record<string, unknown>)[key];
      }
    }
  }
  return target;
}

const codeOf = (character: string | number): number =>
  typeof character === "string" ? character.charCodeAt(0) : character;
const charOf = (character: string | number): string =>
  typeof character === "number"
    ? String.fromCharCode(character)
    : character.charAt(0);

/** is-whitespace-character 1.0.4 */
export function isWhitespaceCharacter(character: string | number): boolean {
  return /\s/.test(charOf(character));
}

/** is-word-character 1.0.4 */
export function isWordCharacter(character: string | number): boolean {
  return /\w/.test(charOf(character));
}

/** is-decimal 1.0.4 */
export function isDecimal(character: string | number): boolean {
  const code = codeOf(character);
  return code >= 48 && code <= 57;
}

/** is-alphabetical 1.0.4 */
export function isAlphabetical(character: string | number): boolean {
  const code = codeOf(character);
  return (code >= 97 && code <= 122) || (code >= 65 && code <= 90);
}

/** is-hexadecimal 1.0.4 */
export function isHexadecimal(character: string | number): boolean {
  const code = codeOf(character);
  return (
    (code >= 97 && code <= 102) ||
    (code >= 65 && code <= 70) ||
    (code >= 48 && code <= 57)
  );
}

/** is-alphanumerical 1.0.4 */
export function isAlphanumerical(character: string | number): boolean {
  return isAlphabetical(character) || isDecimal(character);
}

/**
 * trim-trailing-lines 1.1.4, without its `/\n+$/`: quadratic on a long run of line endings
 * that does not end the value (the ReDoS lint's finding). Same result, linear.
 */
export function trimTrailingLines(value: unknown): string {
  const text = String(value);
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 10) end--;
  return text.slice(0, end);
}

/** collapse-white-space 1.0.6 */
export function collapseWhiteSpace(value: unknown): string {
  return String(value).replace(/\s+/g, " ");
}

/** ccount 1.1.0 */
export function ccount(source: unknown, character: string): number {
  const value = String(source);
  if (typeof character !== "string") throw new Error("Expected character");
  let count = 0;
  let index = value.indexOf(character);
  while (index !== -1) {
    count++;
    index = value.indexOf(character, index + character.length);
  }
  return count;
}

/** state-toggle 1.0.3 */
export function stateToggle(
  key: string,
  state: boolean,
  ctx?: Record<string, unknown>,
): (this: Record<string, unknown>) => () => void {
  return function enter(this: Record<string, unknown>) {
    const context = ctx ?? this;
    const current = context[key];
    context[key] = !state;
    return function exit() {
      context[key] = current;
    };
  };
}

const escapesDefault = [
  "\\",
  "`",
  "*",
  "{",
  "}",
  "[",
  "]",
  "(",
  ")",
  "#",
  "+",
  "-",
  ".",
  "!",
  "_",
  ">",
];
const escapesGfm = escapesDefault.concat(["~", "|"]);
const escapesCommonmark = escapesGfm.concat([
  "\n",
  '"',
  "$",
  "%",
  "&",
  "'",
  ",",
  "/",
  ":",
  ";",
  "<",
  "=",
  "?",
  "@",
  "^",
]);

/** markdown-escapes 1.0.4 */
export function markdownEscapes(options?: {
  commonmark?: boolean;
  gfm?: boolean;
}): string[] {
  const settings = options ?? {};
  if (settings.commonmark) return escapesCommonmark;
  return settings.gfm ? escapesGfm : escapesDefault;
}
markdownEscapes.default = escapesDefault;
markdownEscapes.gfm = escapesGfm;
markdownEscapes.commonmark = escapesCommonmark;

interface Point {
  line: number;
  column: number;
  offset: number;
}

/** vfile-location 3.2.0 */
export function vfileLocation(file: unknown): {
  toPoint: (offset: number) => Point | Record<string, never>;
  toPosition: (offset: number) => Point | Record<string, never>;
  toOffset: (point: Partial<Point> | undefined) => number;
} {
  const value = String(file);
  const indices: number[] = [];
  const search = /\r?\n|\r/g;
  while (search.exec(value)) indices.push(search.lastIndex);
  indices.push(value.length + 1);

  function offsetToPoint(offset: number): Point | Record<string, never> {
    let index = -1;
    if (offset > -1 && offset < indices[indices.length - 1]!) {
      while (++index < indices.length) {
        if (indices[index]! > offset) {
          return {
            line: index + 1,
            column: offset - (indices[index - 1] ?? 0) + 1,
            offset,
          };
        }
      }
    }
    return {};
  }

  function pointToOffset(point: Partial<Point> | undefined): number {
    const line = point?.line;
    const column = point?.column;
    let offset: number | undefined;
    if (
      line !== undefined &&
      column !== undefined &&
      !Number.isNaN(line) &&
      !Number.isNaN(column) &&
      line - 1 in indices
    ) {
      offset = (indices[line - 2] ?? 0) + column - 1 || 0;
    }
    return offset !== undefined &&
      offset > -1 &&
      offset < indices[indices.length - 1]!
      ? offset
      : -1;
  }

  return {
    toPoint: offsetToPoint,
    toPosition: offsetToPoint,
    toOffset: pointToOffset,
  };
}

interface Positioned {
  position?: unknown;
  children?: Positioned[];
}

/** unist-util-remove-position 2.0.1 */
export function removePosition<T extends Positioned>(
  node: T,
  force?: boolean,
): T {
  const visit = (current: Positioned): void => {
    if (force) delete current.position;
    else current.position = undefined;
    for (const child of current.children ?? []) visit(child);
  };
  visit(node);
  return node;
}
