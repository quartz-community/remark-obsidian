import { assert } from "mdast-util-assert";
import rehypeObsidian from "@quartz-community/rehype-obsidian";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import type { Node } from "unist";
import { SKIP, visit } from "unist-util-visit";

import remarkObsidian, {
  type RemarkObsidianOptions,
} from "../../../src/index.js";
import { PROFILES } from "../chain.js";
import { containmentOf, violationsOf } from "../invariant-checks.js";

/**
 * Properties a tree and its rendering must have whatever Obsidian says -- so they can be checked
 * on any document, generated ones included, with no recording.
 *
 * The differential fuzz (`sweep.ts`) compares against Obsidian, which makes it slow, LEGACY-only
 * (it compares through the Quartz profiles, which set no preset) and blind to the HTML: its
 * projections come from the tree. Both 2.0 defects found after release sat exactly there. A
 * `strict` pass rewrote a formula's `value` and left the `data.hChildren` HTML renders from, so
 * the tree was right and the page empty (86 documents); and the tag character class was wrong in
 * a way no generated document could reach. This checks the first kind on every configuration
 * at thousands of documents a second.
 */

/** The configurations every document is checked under. */
export const CONFIGS: Readonly<Record<string, RemarkObsidianOptions>> = {
  legacy: { preset: "legacy" },
  strict: { preset: "strict" },
  "quartz-legacy": { ...PROFILES["quartz-default"].remarkObsidian },
  "quartz-strict": {
    ...PROFILES["quartz-default"].remarkObsidian,
    preset: "strict",
  },
  "all-off": {
    wikilinks: false,
    highlights: false,
    comments: false,
    tags: false,
    customTaskChars: false,
    math: false,
    frontmatter: false,
    keepComments: false,
    parseComments: false,
    lineOffsets: false,
    bareFootnoteRefs: false,
    inlineFootnotes: false,
    callouts: false,
    positionedBreaks: false,
  },
};

/** Formatting passes a document may take to settle; the round-trip gate allows a second. */
const SETTLE = 4;

const hintText = (nodes: unknown[] | undefined): string | undefined => {
  if (!nodes) return undefined;
  const text = (node: unknown): string => {
    const self = node as {
      type?: string;
      value?: string;
      children?: unknown[];
    };
    return self.type === "text"
      ? (self.value ?? "")
      : (self.children ?? []).map(text).join("");
  };
  return nodes.map(text).join("");
};

/**
 * Every invariant `markdown` breaks under `options`, as short labels; empty when it holds them
 * all. A label names the property, not the document, so violations group across seeds.
 */
export async function invariantViolations(
  markdown: string,
  options: RemarkObsidianOptions,
): Promise<string[]> {
  const found: string[] = [];
  const parser = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, options);

  let tree;
  try {
    tree = parser.runSync(parser.parse(markdown), markdown);
  } catch (error) {
    return [`parse threw: ${String(error).slice(0, 60)}`];
  }

  try {
    assert(tree);
  } catch (error) {
    found.push(`mdast shape: ${String(error).slice(0, 60)}`);
  }
  for (const kind of new Set(containmentOf(tree)))
    found.push(`content model: ${kind}`);
  for (const kind of new Set(violationsOf(markdown, tree)))
    found.push(`span: ${kind}`);

  // A formula renders from `data.hChildren`, never from `value`.
  visit(tree, (node) => {
    if (node.type !== "math" && node.type !== "inlineMath") return;
    const math = node as unknown as {
      value: string;
      data?: { hChildren?: unknown[] };
    };
    const hint = hintText(math.data?.hChildren);
    if (hint !== undefined && hint !== math.value) {
      found.push(`${node.type} renders other than its value`);
    }
  });

  // The rendered page, through Quartz's chain.
  let html = "";
  try {
    html = String(
      await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkObsidian, options)
        .use(remarkBreaks)
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(rehypeRaw)
        .use(rehypeObsidian, {
          ...PROFILES["quartz-default"].rehypeObsidian,
          // No network from a fuzz run.
          youTubeEmbed: false,
          tweetEmbed: false,
        })
        .use(rehypeStringify, { allowDangerousHtml: true })
        .process({
          value: markdown,
          data: { slug: "fuzz", filePath: "fuzz.md" },
        }),
    );
  } catch (error) {
    found.push(`render threw: ${String(error).slice(0, 60)}`);
  }
  // Rendered elements only, not markup an author wrote inside code.
  const live = html.replace(/<(code|pre)[^>]*>[\s\S]*?<\/\1>/g, "");
  if (/<obsidian-comment/u.test(live))
    found.push("render: comment marker left");
  const ids = new Set(
    [...live.matchAll(/\bid="(user-content-fn-[^"]+)"/g)].map((m) => m[1]),
  );
  const refs = [
    ...live.matchAll(
      /href="#(user-content-fn-[^"]+)"[^>]*data-footnote-ref[^>]*>(\d+)</g,
    ),
  ];
  if (refs.some((m) => !ids.has(m[1]!))) {
    found.push("render: footnote link to nothing");
  }
  const ordinal = new Map<string, number>();
  for (const m of refs) {
    if (!ordinal.has(m[1]!)) ordinal.set(m[1]!, ordinal.size + 1);
    if (Number(m[2]) !== ordinal.get(m[1]!)) {
      found.push("render: footnote misnumbered");
      break;
    }
  }

  // Formatting terminates.
  const formatter = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, options)
    .use(remarkStringify);
  try {
    let text = markdown;
    let settled = false;
    for (let pass = 0; pass < SETTLE && !settled; pass++) {
      const next = String(formatter.processSync(text));
      // Formatting keeps the author's words. A pass may re-spell syntax, never merge, split or
      // drop text: an inline footnote losing its line ending wrote `^[a` / `b]` as `^[ab]`, which
      // settled at once and so passed the fixed-point check above.
      if (pass === 0) {
        const after = parser.runSync(parser.parse(next), next);
        if (wordsOf(after).join(" ") !== wordsOf(tree).join(" ")) {
          found.push("format: changes the words");
        } else if (
          JSON.stringify(shapeOf(after)) !== JSON.stringify(shapeOf(tree))
        ) {
          // The words can survive while the structure does not: 2.0.2 wrote an inline footnote
          // inside a definition so it closed at its first `]`, which moved text out of it and
          // kept every word.
          found.push("format: changes the tree");
        }
      }
      settled = next === text;
      text = next;
    }
    if (!settled) found.push(`format: no fixed point in ${SETTLE} passes`);
  } catch (error) {
    found.push(`format threw: ${String(error).slice(0, 60)}`);
  }

  return found;
}

/**
 * The tree as formatting must keep it, with what renders the same set aside: positions and
 * `data`; a list's or an item's looseness; an HTML block's trailing blank lines; a comment's
 * parsed body, and whitespace at its ends (the writer closes an unclosed one); empty cells the
 * writer adds to pad a short row, and a table's alignment; a line break as a node or as a line ending, and any run of
 * whitespace in text, which renders as one space; a line ending inside inline code, which
 * renders as a space, as does whitespace inside a formula; whitespace at a paragraph's or a
 * heading's edges, through any emphasis there; and empty text. Measured on the 6,844 referee documents, these set aside
 * 410 of legacy's 441 differences and 498 of strict's 545; what remained were defects.
 */
export function shapeOf(node: Node): unknown {
  const {
    position: _position,
    data: _data,
    spread: _spread,
    ...rest
  } = node as Node & Record<string, unknown>;
  if (rest.type === "comment") {
    return { type: "comment", value: String(rest.value ?? "").trim() };
  }
  // Both ends: remark-parse 8 keeps a space of a definition's indent before `<br>`, which the
  // writer drops, and whitespace around raw HTML renders as nothing.
  if (rest.type === "html") {
    return { type: "html", value: String(rest.value).trim() };
  }
  if (rest.type === "inlineMath" || rest.type === "math") {
    return { ...rest, value: String(rest.value).replace(/\s+/gu, " ").trim() };
  }
  if (rest.type === "inlineCode") {
    // A line ending is one space, and the spaces around it stay: Obsidian renders `x` / `··y`
    // as `x···y` (asked of 1.15.0), which is what the writer writes. Collapsing the run made the
    // two differ (about 180 seeds).
    return { ...rest, value: String(rest.value).replace(/\r\n|\r|\n/gu, " ") };
  }
  if (rest.type === "break") return { type: "text", value: " " };
  const children = (rest.children as Node[] | undefined)?.slice();
  if (!children) {
    return rest.type === "text"
      ? { type: "text", value: String(rest.value).replace(/\s+/gu, " ") }
      : rest;
  }
  if (rest.type === "table") {
    // No alignment: the upstream table writer widens the header to the longest row, so the
    // array grows with it. The cells themselves are kept either way -- mdast holds a row's
    // excess cells -- but the widened header then RENDERS the cells past the source's header,
    // which GFM and Obsidian hid. A known upstream behaviour, recorded in AGENTS.md.
    delete rest.align;
  }
  if (rest.type === "tableRow") {
    while (
      children.length > 0 &&
      ((children.at(-1) as { children?: Node[] }).children ?? []).length === 0
    ) {
      children.pop();
    }
  }
  const kids: Array<Record<string, unknown>> = [];
  for (const child of children.map(shapeOf) as Array<Record<string, unknown>>) {
    const last = kids.at(-1);
    if (child.type === "text" && last?.type === "text") {
      last.value = String(last.value) + String(child.value);
    } else kids.push({ ...child });
  }
  for (const kid of kids) {
    if (kid.type === "text")
      kid.value = String(kid.value).replace(/\s+/gu, " ");
  }
  // A paragraph's or a heading's leading and trailing whitespace renders nothing.
  // Through an opening or closing emphasis, strong or strikethrough too.
  // A callout title too: `> [!note] &#x20;` and `> [!note] ~~~` both display no title at all
  // (asked of 1.15.0), and the writer spells the second's empty title as the first.
  if (
    rest.type === "paragraph" ||
    rest.type === "heading" ||
    rest.type === "calloutTitle"
  ) {
    const edge = (
      list: Array<Record<string, unknown>>,
      at: "start" | "end",
    ): void => {
      const kid = at === "start" ? list[0] : list.at(-1);
      if (kid?.type === "text") {
        kid.value =
          at === "start"
            ? String(kid.value).trimStart()
            : String(kid.value).trimEnd();
        if (kid.value === "") {
          list.splice(at === "start" ? 0 : list.length - 1, 1);
          edge(list, at);
        }
      } else if (
        kid &&
        (kid.type === "emphasis" ||
          kid.type === "strong" ||
          kid.type === "delete") &&
        Array.isArray(kid.children)
      ) {
        edge(kid.children as Array<Record<string, unknown>>, at);
      }
    };
    edge(kids, "start");
    edge(kids, "end");
  }
  return {
    ...rest,
    children: kids.filter((kid) => kid.type !== "text" || kid.value !== ""),
  };
}

/**
 * The tree's literal text as words: every node `value` in order (a `break` as a line ending),
 * joined with nothing so node boundaries do not count, then split on whitespace -- which still
 * tells `a b` from `ab`.
 */
/** Block nodes, whose contents never run into a neighbour's. */
const BLOCKS = new Set([
  "paragraph",
  "heading",
  "code",
  "math",
  "html",
  "blockquote",
  "callout",
  "calloutTitle",
  "list",
  "listItem",
  "table",
  "tableCell",
  "footnoteDefinition",
  "thematicBreak",
]);

/** Nodes whose children are blocks. */
const FLOW_PARENTS = new Set([
  "root",
  "blockquote",
  "callout",
  "listItem",
  "footnoteDefinition",
]);

export function wordsOf(tree: Node): string[] {
  const parts: string[] = [];
  visit(tree, (node: Node, _index, parent: Node | undefined) => {
    const value = (node as { value?: unknown }).value;
    // Blocks are separate words: a fence's `<htt` then a paragraph's `a/` read as `<htta/` once
    // the whitespace text between them (a leading space formatting drops) was gone. A comment
    // is one when its parent holds blocks: `> > %%note` / `%%note` read `notenote`.
    if (
      BLOCKS.has(node.type) ||
      (node.type === "comment" &&
        parent !== undefined &&
        FLOW_PARENTS.has(parent.type))
    ) {
      parts.push("\n");
    }
    // A comment's words are its value, as written. Its parsed children say the same words twice
    // and are a reading `shapeOf` sets aside: the same body read once as a definition and once
    // as indented code (`- p` / `····%%` / `[^1]: def`) changed no word of the document.
    if (node.type === "comment") {
      parts.push(String(value ?? ""));
      return SKIP;
    }
    if (typeof value === "string" && node.type !== "yaml") parts.push(value);
    // A line break is whitespace: without this `s`, a break and `[l` read as one word, so a
    // break written back as a line ending (`&#xA;` at an emphasis edge) changed "the words".
    else if (node.type === "break") parts.push("\n");
  });
  return parts.join("").split(/\s+/u).filter(Boolean);
}
