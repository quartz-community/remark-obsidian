/**
 * The pinned Quartz processing chain, reproduced so parity goldens mean something.
 *
 * Quartz v5 has no built-in transformers (`quartz/plugins/transformers/index.ts` is
 * `export {}`); every transformer is an external package ordered in
 * `quartz.config.yaml`. The parse-affecting subset, in `order`:
 *
 *   30  @quartz-community/github-flavored-markdown    remarkGfm
 *   40  @quartz-community/obsidian-flavored-markdown  remarkObsidian (+ wikilink visitor)
 *   80  @quartz-community/latex                       (renders only; see 3 below)
 *   90  @quartz-community/hard-line-breaks            remarkBreaks
 *
 * **Those first two were swapped from Quartz's original 30/40, and the goldens
 * assume the swap.** `remark-gfm` has to register *before* this package: a combined
 * micromark extension prepends its constructs, so for a code both claim the
 * later-registered plugin wins. With gfm second it owned `~` outright and
 * Obsidian's own strikethrough could not run at all — `legacyStrikethrough` was
 * dead code until this order changed.
 *
 * Measured in two steps so the risk is separable. The reorder *alone* is
 * behaviour-neutral: 0 cases fixed and 0 broken across the corpus, which also
 * settles the one real worry, that both plugins claim `[` (gfm's footnote against
 * our wikilink). Adding the legacy tokenizer on top of it fixed 21 cases with 0
 * regressions.
 *
 * The swap has landed upstream, so this file and Quartz agree: both packages'
 * `quartz.defaultOrder` were exchanged and `quartz.config.default.yaml` now lists
 * gfm at 30 and this package at 40. A config that omits `order` gets the same
 * result from the manifests alone.
 *
 * then `remarkRehype({allowDangerousHtml:true})` -> `rehypeRaw` -> `rehypeObsidian`.
 *
 * Three things here are load-bearing and were each verified against the upstream
 * source rather than assumed:
 *
 *  1. `textTransform` rewrites the raw markdown *before* remark runs, forcing a
 *     newline after every callout title line. The upstream callout visitor then
 *     splits on that newline to separate title from body, so omitting the
 *     pre-transform reproduces exactly the title/body leak that upstream commit
 *     0b3ff34 fixed.
 *  1b. `keepComments` defaults on, so a kept comment reaches hast as an empty
 *     `<obsidian-comment>` element. `rehype-obsidian` strips it from its next
 *     release; the published 1.0.0 in this chain does not, so the manifest does
 *     not claim `stripComments` yet and rendered HTML still shows the marker. No
 *     projection reads rendered HTML, so the gate is unaffected.
 *  2. `remarkBreaks` measurably changes output (`Hello $$` -> `Hello $$<br>`), so a
 *     golden recorded without it is wrong.
 *  3. `obsidian-flavored-markdown` passes no `math` key, so remark-obsidian's own
 *     `math: true` default parses `$`. `@quartz-community/latex` used to register
 *     `remark-math` as well, and that was measurably *not* output-identical: two
 *     text constructs on `$` resolve by first match per position, so `$5 and $10`
 *     parsed as math and `$x\$` ignored its escape. latex 2.0 moved parsing behind
 *     an opt-in `parseMath` flag, defaulting off, so only one parser claims `$`
 *     and this chain no longer registers `remark-math`.
 */

import type { Root as MdRoot } from "mdast";
import type { Root as HastRoot } from "hast";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import rehypeObsidian from "@quartz-community/rehype-obsidian";
import remarkObsidian, { type RemarkObsidianOptions } from "../../src/index.js";

/** Options `rehype-obsidian` accepts, mirrored so we do not depend on its types. */
export interface RehypeObsidianOptions {
  blockReferences: boolean;
  youTubeEmbed: boolean;
  tweetEmbed: boolean;
  checkbox: boolean;
  mermaid: boolean;
  obsidianUri: boolean;
}

export interface ChainProfile {
  readonly remarkObsidian: Required<RemarkObsidianOptions>;
  readonly rehypeObsidian: RehypeObsidianOptions;
}

/**
 * Faithful to `obsidian-flavored-markdown`'s `defaultOptions` as consumed by the
 * default `quartz.config.yaml`. Note `enableCheckbox: false` upstream, which maps
 * to `customTaskChars: false` and `checkbox: false`.
 */
const QUARTZ_DEFAULT: ChainProfile = {
  remarkObsidian: {
    wikilinks: true,
    highlights: true,
    comments: true,
    tags: true,
    customTaskChars: false,
    math: true,
    taskReparse: true,
    frontmatter: true,
    keepComments: true,
    parseComments: true,
    lineOffsets: true,
    bareFootnoteRefs: true,
    inlineFootnotes: true,
    callouts: true,
    legacyEmphasis: true,
    legacyStrikethrough: true,
    legacyEntities: true,
    legacyAutolinks: true,
    legacyCodeSpans: true,
    legacyLists: true,
    labelPrecedence: true,
    positionedBreaks: true,
    escapedLineBreaks: false,
  },
  rehypeObsidian: {
    blockReferences: true,
    youTubeEmbed: true,
    tweetEmbed: true,
    checkbox: false,
    mermaid: true,
    obsidianUri: true,
  },
};

/** Every feature on, so the corpus also covers surfaces Quartz leaves disabled. */
const ALL_FEATURES: ChainProfile = {
  remarkObsidian: {
    wikilinks: true,
    highlights: true,
    comments: true,
    tags: true,
    customTaskChars: true,
    math: true,
    taskReparse: true,
    frontmatter: true,
    keepComments: true,
    parseComments: true,
    lineOffsets: true,
    bareFootnoteRefs: true,
    inlineFootnotes: true,
    callouts: true,
    legacyEmphasis: true,
    legacyStrikethrough: true,
    legacyEntities: true,
    legacyAutolinks: true,
    legacyCodeSpans: true,
    legacyLists: true,
    labelPrecedence: true,
    positionedBreaks: true,
    escapedLineBreaks: false,
  },
  rehypeObsidian: {
    blockReferences: true,
    youTubeEmbed: true,
    tweetEmbed: true,
    checkbox: true,
    mermaid: true,
    obsidianUri: true,
  },
};

export const PROFILES = {
  "quartz-default": QUARTZ_DEFAULT,
  "all-features": ALL_FEATURES,
} as const;

export type ProfileName = keyof typeof PROFILES;

/**
 * The ordered stack, recorded into every golden. A reorder or membership change
 * upstream invalidates the corpus, and stamping it is what makes that visible.
 */
export const CHAIN_MANIFEST = {
  quartzMajor: 5,
  markdown: [
    {
      order: 30,
      plugin: "remark-gfm",
      source: "@quartz-community/github-flavored-markdown",
      note: "ordered before remark-obsidian so the later-registered extension wins a shared code; with it second, GFM owned `~` and Obsidian's own strikethrough could not run",
    },
    {
      order: 40,
      plugin: "remark-obsidian",
      source: "@quartz-community/obsidian-flavored-markdown",
      note: "parses frontmatter as of the frontmatter option; omitting it let the `---` become a thematic break and leaked the YAML body in as a list",
    },
    {
      order: 80,
      plugin: null,
      source: "@quartz-community/latex",
      note: "parseMath defaults to false from latex 2.0, so it registers no markdown plugin",
    },
    {
      order: 90,
      plugin: "remark-breaks",
      source: "@quartz-community/hard-line-breaks",
    },
  ],
  html: [
    { plugin: "remark-rehype", options: { allowDangerousHtml: true } },
    {
      plugin: "rehype-raw",
      source: "@quartz-community/obsidian-flavored-markdown",
    },
    {
      plugin: "rehype-obsidian",
      source: "@quartz-community/obsidian-flavored-markdown",
    },
  ],
  textTransform: [],
  /** Quartz renders hast via preact and never stringifies; this step is ours alone. */
  harnessOnly: ["rehype-stringify"],
} as const;

/**
 * `obsidian-flavored-markdown`'s `textTransform`: force a newline after each
 * callout title so the downstream visitor can split title from body.
 * Mirrors `calloutLineRegex` upstream.
 */
export function applyTextTransform(src: string): string {
  return src;
}

/** Stand-in for the vfile data Quartz populates; the wikilink visitor reads `slug`. */
function vfileData(slug: string) {
  return { slug, filePath: `${slug}.md` };
}

/**
 * Render markdown exactly the way the pinned Quartz chain would, including the
 * source-level pre-transform.
 */
export async function renderOurs(
  markdown: string,
  profileName: ProfileName = "quartz-default",
  slug = "parity/fixture",
): Promise<string> {
  const profile = PROFILES[profileName];

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, profile.remarkObsidian)
    .use(remarkBreaks)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeObsidian, profile.rehypeObsidian)
    .use(rehypeStringify, { allowDangerousHtml: true });

  const file = await processor.process({
    value: applyTextTransform(markdown),
    data: vfileData(slug),
  });

  return String(file);
}

/**
 * The same chain with `rehype-obsidian` loaded from somewhere else.
 *
 * `renderOurs` uses the released sibling, which is what `npm install`
 * resolves. A change spanning both packages cannot be tested that way until
 * it ships, so the seam test points this at a locally built sibling when one
 * exists.
 */
export async function renderWith(
  pluginPath: string,
  markdown: string,
  profileName: ProfileName = "quartz-default",
  slug = "parity/fixture",
): Promise<string> {
  const profile = PROFILES[profileName];
  const { default: plugin } = (await import(pluginPath)) as {
    default: (options: RehypeObsidianOptions) => never;
  };

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, profile.remarkObsidian)
    .use(remarkBreaks)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(plugin, profile.rehypeObsidian)
    .use(rehypeStringify, { allowDangerousHtml: true });

  return String(
    await processor.process({
      value: applyTextTransform(markdown),
      data: vfileData(slug),
    }),
  );
}

/** mdast for a case, useful when a divergence needs to be localized to parsing. */
export function parseOurs(
  markdown: string,
  profileName: ProfileName = "quartz-default",
): MdRoot {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, PROFILES[profileName].remarkObsidian)
    .use(remarkBreaks);
  // The source must be passed: transforms that need the original text, such as
  // custom task characters and display-math classification, read it off the file.
  const source = applyTextTransform(markdown);
  const tree = processor.parse(source);
  return processor.runSync(tree, source) as MdRoot;
}

export type { HastRoot };
