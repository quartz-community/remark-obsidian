import type { Root } from "mdast";
import type { Node } from "unist";
import { SKIP, visit } from "unist-util-visit";

/**
 * Block attributes no projection reads.
 *
 * `text` compares what a block *says*, never what it *is*: a table's column
 * alignment, a fence's language and an ordered list's starting number all
 * live in mdast fields that nothing looked at. That is not academic — the
 * delimiter row's column count was changed in this package with no projection
 * able to catch an error in it.
 *
 * Obsidian's side comes from the HTML already stored in every golden, so this
 * costs no re-recording. Three narrow, machine-generated patterns are matched
 * by regex rather than by pulling in an HTML parser for them.
 */
export interface Structure {
  /** Per table, its header cells' alignment joined with commas. */
  readonly tableAlign: readonly string[];
  /** Per fenced or indented block, its language, empty when none. */
  readonly codeLang: readonly string[];
  /** Per list, `ol:<start>` or `ul`. */
  readonly listShape: readonly string[];
}

export const STRUCTURE_KEYS = [
  "tableAlign",
  "codeLang",
  "listShape",
] as const satisfies ReadonlyArray<keyof Structure>;

/**
 * The renderer appends every footnote definition as its own `<ol>` inside a
 * `section.footnotes`, and that list exists nowhere in the tree -- the same
 * relocation `mdastText` already compensates for by skipping definitions. Any
 * table or fence inside a definition arrives there too, so the whole section
 * goes before anything is counted.
 */
const FOOTNOTE_SECTION =
  /<(section|div)\b[^>]*\bclass="[^"]*\bfootnotes\b[^"]*"[\s\S]*?<\/\1>/gi;

const TABLE = /<table\b[\s\S]*?<\/table>/gi;
const HEADER_CELL = /<th\b([^>]*)>/gi;
const ALIGN = /\balign="([^"]*)"/i;
const PRE = /<pre\b([^>]*)>/gi;
const LANGUAGE = /\blanguage-([A-Za-z0-9_+-]+)/;
const LIST = /<(ol|ul)\b([^>]*)>/gi;
const START = /\bstart="(\d+)"/i;

export function structureFromHtml(raw: string): Structure {
  const html = raw.replace(FOOTNOTE_SECTION, "");
  const tableAlign: string[] = [];
  for (const table of html.match(TABLE) ?? []) {
    const cells: string[] = [];
    for (const cell of table.matchAll(HEADER_CELL)) {
      cells.push(ALIGN.exec(cell[1] ?? "")?.[1] ?? "null");
    }
    if (cells.length > 0) tableAlign.push(cells.join(","));
  }

  const codeLang: string[] = [];
  for (const pre of html.matchAll(PRE)) {
    const language = LANGUAGE.exec(pre[1] ?? "")?.[1] ?? "";
    codeLang.push(language === "none" ? "" : language);
  }

  const listShape: string[] = [];
  for (const list of html.matchAll(LIST)) {
    listShape.push(
      list[1]?.toLowerCase() === "ol"
        ? `ol:${START.exec(list[2] ?? "")?.[1] ?? "1"}`
        : "ul",
    );
  }

  return { tableAlign, codeLang, listShape };
}

interface TableNode extends Node {
  align?: ReadonlyArray<string | null>;
}
interface CodeNode extends Node {
  lang?: string | null;
}
interface ListNode extends Node {
  ordered?: boolean | null;
  start?: number | null;
}

export function structureFromMdast(tree: Root): Structure {
  const tableAlign: string[] = [];
  const codeLang: string[] = [];
  const listShape: string[] = [];

  visit(tree, (node: Node) => {
    // Counterpart to dropping the rendered footnotes container: a referenced
    // definition's blocks move there, so they are not part of the document
    // this compares.
    if (node.type === "footnoteDefinition") return SKIP;
    if (node.type === "table") {
      const align = (node as TableNode).align ?? [];
      tableAlign.push(align.map((a) => a ?? "null").join(","));
      return;
    }
    if (node.type === "code") {
      codeLang.push((node as CodeNode).lang ?? "");
      return;
    }
    // The detached renderer paints frontmatter as a `language-yaml` fence,
    // where the tree has a `yaml` node. Both describe the same block.
    if (node.type === "yaml") {
      codeLang.push("yaml");
      return;
    }
    if (node.type === "list") {
      const list = node as ListNode;
      listShape.push(list.ordered ? `ol:${list.start ?? 1}` : "ul");
    }
  });

  return { tableAlign, codeLang, listShape };
}
