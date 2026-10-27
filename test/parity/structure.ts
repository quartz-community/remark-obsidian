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

/**
 * Remove every `internal-embed` span, with the note it expanded to.
 *
 * An embed renders another note's content inside this one, so its fences, tables and
 * lists are not this document's structure. `metadataCache` excludes them too.
 *
 * Balanced rather than regex-matched, because embeds nest: a pattern stopping at the
 * first `</span>` would leave the outer embed's tail behind.
 */
function stripEmbeds(html: string): string {
  const OPEN = /<span\b[^>]*\bclass="[^"]*\binternal-embed\b[^"]*"[^>]*>/i;
  let out = html;

  for (;;) {
    const found = OPEN.exec(out);
    if (!found) return out;

    const from = found.index;
    let at = from + found[0].length;
    let depth = 1;
    while (depth > 0 && at < out.length) {
      const next = /<\/?span\b[^>]*>/i.exec(out.slice(at));
      if (!next) return out.slice(0, from);
      at += next.index + next[0].length;
      depth += next[0].startsWith("</") ? -1 : 1;
    }
    out = out.slice(0, from) + out.slice(at);
  }
}

const TABLE = /<table\b[\s\S]*?<\/table>/gi;
const HEADER_CELL = /<th\b([^>]*)>/gi;
const ALIGN = /\balign="([^"]*)"/i;
/**
 * Each `<pre>` with the `<code>` that opens it, so the language can be read off
 * whichever of the two actually records it. One entry per `<pre>` either way.
 */
const PRE = /<pre\b([^>]*)>(?:\s*<code\b([^>]*)>)?/gi;
/** A class token, up to whitespace or the attribute's quote. */
const LANGUAGE = /\blanguage-([^\s"']+)/;
const ENTITIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#0*39;/g, "'"],
  [/&amp;/g, "&"],
];

/**
 * The info string Obsidian parsed, which is on the `<code>` element.
 *
 * `<pre>` carries the language Prism will *highlight* with, so an info string it
 * has no grammar for lands there as `language-none` while `<code>` still records
 * it verbatim:
 *
 *     ``` foo\+bar
 *     <pre class="language-none"><code class="language-foo+bar language-none ...">
 *
 * Reading `<pre>` therefore measures Prism's grammar registry rather than the
 * parse, and reported an empty language for nine cases whose info string Obsidian
 * had recorded perfectly well. `<code>` lists the real one first, then its
 * fallbacks, so the first token is the answer.
 *
 * The class is HTML-escaped, since an info string may hold `<` or `&`.
 */
function languageOf(code: string | undefined, pre: string | undefined): string {
  const found = LANGUAGE.exec(code ?? "") ?? LANGUAGE.exec(pre ?? "");
  let language = found?.[1] ?? "";
  for (const [pattern, character] of ENTITIES) {
    language = language.replace(pattern, character);
  }
  return language === "none" ? "" : language;
}
const LIST = /<(ol|ul)\b([^>]*)>/gi;
const START = /\bstart="(\d+)"/i;

export function structureFromHtml(raw: string): Structure {
  const html = stripEmbeds(raw.replace(FOOTNOTE_SECTION, ""));
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
    codeLang.push(languageOf(pre[2], pre[1]));
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
interface HtmlNode extends Node {
  value?: string;
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
    // A comment's body is parsed but never rendered, so the blocks inside one
    // produce no element: `%%` / `- [ ] Hidden task` / `%%` has no list.
    if (node.type === "comment") return SKIP;
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
    // A `<pre>` an author wrote themselves is still a `pre` element. The chain
    // passes raw html through (`allowDangerousHtml` plus `rehypeRaw`), so the DOM
    // the recorder reads has one, while this side saw only an `html` node and
    // reported nothing -- `<pre>` / `---` / `</pre>` is the whole divergence.
    //
    // Extracted with the same pattern and the same `languageOf` the HTML side
    // uses, so the two cannot drift apart.
    if (node.type === "html") {
      for (const pre of String((node as HtmlNode).value ?? "").matchAll(PRE)) {
        codeLang.push(languageOf(pre[2], pre[1]));
      }
      return;
    }
    if (node.type === "list") {
      const list = node as ListNode;
      listShape.push(list.ordered ? `ol:${list.start ?? 1}` : "ul");
    }
  });

  return { tableAlign, codeLang, listShape };
}
