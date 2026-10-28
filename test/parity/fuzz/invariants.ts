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
import { visit } from "unist-util-visit";

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
 * The tree's literal text as words: every node `value` in order (a `break` as a line ending),
 * joined with nothing so node boundaries do not count, then split on whitespace -- which still
 * tells `a b` from `ab`.
 */
function wordsOf(tree: Node): string[] {
  const parts: string[] = [];
  visit(tree, (node: Node) => {
    const value = (node as { value?: unknown }).value;
    // A comment holding parsed children carries its words twice, in `value` and in them, with
    // no boundary between: `note` + `note` read as one word, `note\n` + `note` as two.
    const parsed = ((node as { children?: unknown[] }).children ?? []).length;
    if (node.type === "comment" && parsed > 0) return;
    if (typeof value === "string" && node.type !== "yaml") parts.push(value);
    // A line break is whitespace: without this `s`, a break and `[l` read as one word, so a
    // break written back as a line ending (`&#xA;` at an emphasis edge) changed "the words".
    else if (node.type === "break") parts.push("\n");
  });
  return parts.join("").split(/\s+/u).filter(Boolean);
}
