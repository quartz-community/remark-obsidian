import type {
  Definition,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
} from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

const WHITESPACE = /\s/u;

interface Point {
  line: number;
  column: number;
  offset?: number;
}

const isEnclosedURLCharacter = (character: string): boolean =>
  character !== ">" && character !== "[" && character !== "]";

const isUnclosedURLCharacter = (character: string): boolean =>
  character !== "[" && character !== "]" && !WHITESPACE.test(character);

/**
 * Port of `remark-parse@8.0.3`'s `lib/tokenize/definition.js`, reduced to the
 * non-commonmark path Obsidian runs, and answering only whether the text is a
 * link reference definition.
 *
 * Its rules are the inverse of CommonMark's in both directions, which is why
 * guessing at them does not work:
 *
 * - a label may contain a nested `[`, because the scan breaks only on `]`, so
 *   `[a[b]: /url` *is* a definition where CommonMark says it is not;
 * - a destination may not contain `[` or `]` at all, enclosed or otherwise, so
 *   `[foo]: [^9]` and `[foo]: <[^9]>` are *not* definitions where CommonMark
 *   says they are;
 * - a title has no backslash escaping and must be the last thing on its line,
 *   so `[foo]: /url` over `"a \" b"` ends at the inner quote and then finds `b`
 *   still to come, which rejects the whole thing.
 */
export interface LegacyDefinition {
  readonly length: number;
  readonly identifier: string;
  readonly url: string;
  readonly title: string | null;
}

export function isLegacyDefinition(value: string): boolean {
  return matchLegacyDefinition(value) !== null;
}

export function matchLegacyDefinition(value: string): LegacyDefinition | null {
  const length = value.length;
  let index = 0;
  let subvalue = "";
  let character = "";
  let queue = "";
  let title: string | null = null;

  while (index < length) {
    character = value.charAt(index);
    if (character !== " " && character !== "\t") break;
    subvalue += character;
    index++;
  }

  if (value.charAt(index) !== "[") return null;
  index++;
  subvalue += "[";
  queue = "";

  while (index < length) {
    character = value.charAt(index);
    if (character === "]") break;
    if (character === "\\") {
      queue += character;
      index++;
      character = value.charAt(index);
    }
    queue += character;
    index++;
  }

  if (
    !queue ||
    value.charAt(index) !== "]" ||
    value.charAt(index + 1) !== ":"
  ) {
    return null;
  }

  const identifier = queue;
  subvalue += `${queue}]:`;
  index = subvalue.length;
  queue = "";

  while (index < length) {
    character = value.charAt(index);
    if (character !== "\t" && character !== " " && character !== "\n") break;
    subvalue += character;
    index++;
  }

  character = value.charAt(index);
  queue = "";

  if (character === "<") {
    index++;
    while (index < length) {
      character = value.charAt(index);
      if (!isEnclosedURLCharacter(character)) break;
      queue += character;
      index++;
    }

    if (value.charAt(index) === ">") {
      subvalue += `<${queue}>`;
      index++;
    } else {
      index -= queue.length + 1;
      queue = "";
    }
  }

  if (!queue) {
    while (index < length) {
      character = value.charAt(index);
      if (!isUnclosedURLCharacter(character)) break;
      queue += character;
      index++;
    }
    subvalue += queue;
  }

  if (!queue) return null;
  const url = queue;
  queue = "";

  while (index < length) {
    character = value.charAt(index);
    if (character !== "\t" && character !== " " && character !== "\n") break;
    queue += character;
    index++;
  }

  character = value.charAt(index);
  const test =
    character === '"'
      ? '"'
      : character === "'"
        ? "'"
        : character === "("
          ? ")"
          : null;

  if (!test) {
    index = subvalue.length;
  } else if (queue) {
    subvalue += queue + character;
    index = subvalue.length;
    queue = "";

    while (index < length) {
      character = value.charAt(index);
      if (character === test) break;
      if (character === "\n") {
        index++;
        character = value.charAt(index);
        if (character === "\n" || character === test) return null;
        queue += "\n";
      }
      queue += character;
      index++;
    }

    if (value.charAt(index) !== test) return null;
    subvalue += queue + test;
    title = queue;
    index++;
  } else {
    return null;
  }

  while (index < length) {
    character = value.charAt(index);
    if (character !== "\t" && character !== " ") break;
    index++;
  }

  character = value.charAt(index);
  if (character && character !== "\n") return null;
  return { length: subvalue.length, identifier, url, title };
}

function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index++) {
    if (source[index] === "\n") line++;
  }
  return line;
}

function shift(node: unknown, offset: number, line: number): void {
  const candidate = node as {
    position?: { start: Point; end: Point };
    children?: unknown[];
  };
  if (candidate.position) {
    for (const point of [candidate.position.start, candidate.position.end]) {
      point.offset = offset + (point.offset ?? 0);
      point.line = line;
    }
  }
  for (const child of candidate.children ?? []) shift(child, offset, line);
}

/**
 * Turn a `definition` legacy would not have made into the prose Obsidian shows.
 *
 * The lines are rebuilt one at a time. Re-parsing the span whole would just
 * produce the same definition again, and a line that still parses as one on its
 * own contributes its raw text instead — which is what the bare-reference pass
 * then reduces, so `[^1]: x` reads `1: x` exactly as the app renders it.
 */
export function legacyDefinitionTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length; index++) {
      const definition = parent.children[index];
      if (definition?.type !== "definition") continue;

      const start = definition.position?.start?.offset;
      if (start === undefined) continue;
      if (isLegacyDefinition(source.slice(start))) continue;

      const blank = /\n[ \t]*\n/u.exec(source.slice(start));
      const end = blank ? start + blank.index : source.length;

      let last = index;
      while (
        last + 1 < parent.children.length &&
        (parent.children[last + 1]!.position?.start?.offset ?? Infinity) < end
      ) {
        last++;
      }

      const children: PhrasingContent[] = [];
      let offset = start;
      for (const line of source.slice(start, end).split("\n")) {
        if (children.length > 0) {
          children.push({ type: "text", value: "\n" } as PhrasingContent);
        }
        const block = reparse(line).children[0];
        if (block?.type === "paragraph") {
          for (const child of block.children) {
            shift(child, offset, lineAt(source, offset));
          }
          children.push(...block.children);
        } else {
          children.push({ type: "text", value: line } as PhrasingContent);
        }
        offset += line.length + 1;
      }

      const paragraph: Paragraph = {
        type: "paragraph",
        children,
        position: {
          start: { line: lineAt(source, start), column: 1, offset: start },
          end: { line: lineAt(source, end), column: 1, offset: end },
        },
      };

      parent.children.splice(index, last - index + 1, paragraph);
    }
  });
}

/**
 * Make a definition out of prose legacy would have read as one.
 *
 * The mirror of the pass above. A label may contain a nested `[`, because the
 * scan breaks only on `]`, so `[a[b]: /url` is a definition to Obsidian while
 * CommonMark leaves it as text. The two never collide: this fires only where
 * the port accepts and the other only where it rejects.
 */
export function legacyDefinitionPromoteTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length; index++) {
      const paragraph = parent.children[index];
      if (paragraph?.type !== "paragraph") continue;

      const start = paragraph.position?.start?.offset;
      const end = paragraph.position?.end?.offset;
      if (start === undefined || end === undefined) continue;

      const match = matchLegacyDefinition(source.slice(start, end));
      if (!match) continue;

      const split = start + match.length;
      const definition: Definition = {
        type: "definition",
        identifier: match.identifier.toLowerCase(),
        label: match.identifier,
        url: match.url,
        title: match.title,
        position: {
          start: { ...paragraph.position!.start },
          end: {
            line: lineAt(source, split),
            column: 1,
            offset: split,
          },
        },
      };

      const rest = reparse(source.slice(split, end));
      for (const child of rest.children) {
        shift(child, split, lineAt(source, split));
      }

      parent.children.splice(
        index,
        1,
        definition,
        ...(rest.children as RootContent[]),
      );
      index += rest.children.length;
    }
  });
}
