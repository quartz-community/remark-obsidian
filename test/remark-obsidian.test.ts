import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import remarkObsidian, { type RemarkObsidianOptions } from "../src/index.js";
import { visit } from "unist-util-visit";
import {
  commentRegions,
  htmlCommentRegions,
} from "../src/lib/comment-region.js";
import { isLegacyDefinition } from "../src/lib/legacy-definition.js";

function parse(md: string, opts?: RemarkObsidianOptions) {
  return unified().use(remarkParse).use(remarkObsidian, opts).parse(md);
}

function processWithGfm(md: string, opts?: RemarkObsidianOptions) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, opts);
  return processor.runSync(processor.parse(md), md);
}

async function toMd(md: string, opts?: RemarkObsidianOptions) {
  const result = await unified()
    .use(remarkParse)
    .use(remarkObsidian, { ...opts, comments: false })
    .use(remarkStringify)
    .process(md);
  return String(result);
}

async function toHtml(md: string, opts?: RemarkObsidianOptions) {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, opts)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(md);
  return String(result);
}

function rootTypes(tree: unknown): string[] {
  return (tree as { children: { type: string }[] }).children.map((n) => n.type);
}

function findNodes(tree: any, type: string): any[] {
  const results: any[] = [];
  function walk(node: any) {
    if (node.type === type) results.push(node);
    if (node.children) node.children.forEach(walk);
  }
  walk(tree);
  return results;
}

describe("remark-obsidian", () => {
  it("parses wikilinks", () => {
    const basic = parse("[[page]]");
    const [basicNode] = findNodes(basic, "wikilink");
    expect(basicNode.path).toBe("page");
    expect(basicNode.alias).toBe("");
    expect(basicNode.heading).toBe("");
    expect(basicNode.embedded).toBe(false);

    const alias = parse("[[page|alias]]");
    const [aliasNode] = findNodes(alias, "wikilink");
    expect(aliasNode.path).toBe("page");
    expect(aliasNode.alias).toBe("alias");

    const heading = parse("[[page#heading]]");
    const [headingNode] = findNodes(heading, "wikilink");
    expect(headingNode.path).toBe("page");
    expect(headingNode.heading).toBe("heading");

    const headingAlias = parse("[[page#heading|alias]]");
    const [headingAliasNode] = findNodes(headingAlias, "wikilink");
    expect(headingAliasNode.heading).toBe("heading");
    expect(headingAliasNode.alias).toBe("alias");

    const embed = parse("![[embed]]");
    const [embedNode] = findNodes(embed, "wikilink");
    expect(embedNode.embedded).toBe(true);
    expect(embedNode.path).toBe("embed");

    const image = parse("![[image.png|alt 100x200]]");
    const [imageNode] = findNodes(image, "wikilink");
    expect(imageNode.embedded).toBe(true);
    expect(imageNode.path).toBe("image.png");
    expect(imageNode.alias).toBe("alt 100x200");

    const escapedEmbedAlias = parse("![[image\\|800]]");
    const [escapedEmbedAliasNode] = findNodes(escapedEmbedAlias, "wikilink");
    expect(escapedEmbedAliasNode.embedded).toBe(true);
    expect(escapedEmbedAliasNode.path).toBe("image");
    expect(escapedEmbedAliasNode.alias).toBe("800");

    const escapedAlias = parse("[[page\\|alias]]");
    const [escapedAliasNode] = findNodes(escapedAlias, "wikilink");
    expect(escapedAliasNode.path).toBe("page");
    expect(escapedAliasNode.alias).toBe("alias");

    const escapedHeadingAlias = parse("![[image#heading\\|800]]");
    const [escapedHeadingAliasNode] = findNodes(
      escapedHeadingAlias,
      "wikilink",
    );
    expect(escapedHeadingAliasNode.embedded).toBe(true);
    expect(escapedHeadingAliasNode.path).toBe("image");
    expect(escapedHeadingAliasNode.heading).toBe("heading");
    expect(escapedHeadingAliasNode.alias).toBe("800");

    const blockref = parse("[[page#^blockref]]");
    const [blockrefNode] = findNodes(blockref, "wikilink");
    expect(blockrefNode.heading).toBe("^blockref");

    const emptyHeading = parse("[[page#]]");
    const [emptyHeadingNode] = findNodes(emptyHeading, "wikilink");
    expect(emptyHeadingNode.path).toBe("page");
    expect(emptyHeadingNode.heading).toBe("");

    const emptyHeadingAlias = parse("[[page#|alias]]");
    const [emptyHeadingAliasNode] = findNodes(emptyHeadingAlias, "wikilink");
    expect(emptyHeadingAliasNode.path).toBe("page");
    expect(emptyHeadingAliasNode.heading).toBe("");
    expect(emptyHeadingAliasNode.alias).toBe("alias");

    const headingOnly = parse("[[#heading]]");
    const [headingOnlyNode] = findNodes(headingOnly, "wikilink");
    expect(headingOnlyNode.path).toBe("");
    expect(headingOnlyNode.heading).toBe("heading");

    const subheading = parse("[[page#h1#h2]]");
    const [subheadingNode] = findNodes(subheading, "wikilink");
    expect(subheadingNode.heading).toBe("h1#h2");

    const incomplete = parse("[[incomplete");
    expect(findNodes(incomplete, "wikilink").length).toBe(0);
  });

  it("parses highlights", () => {
    const single = parse("==hello==");
    const [node] = findNodes(single, "highlight");
    expect(node.children[0].value).toBe("hello");

    const multi = parse("==multi word==");
    const [multiNode] = findNodes(multi, "highlight");
    expect(multiNode.children[0].value).toBe("multi word");

    const unclosed = parse("==unclosed");
    expect(findNodes(unclosed, "highlight").length).toBe(0);

    const edge = parse("===");
    expect(findNodes(edge, "highlight").length).toBe(0);
  });

  it("hides comments while keeping the node for consumers", () => {
    const single = processWithGfm("%%comment%%");
    expect(findNodes(single, "comment").length).toBeGreaterThan(0);
    expect(
      findNodes(single, "text")
        .map((n: any) => n.value)
        .join(" "),
    ).not.toContain("comment");

    const multi = processWithGfm("%%multi\nline%%");
    expect(findNodes(multi, "comment").length).toBeGreaterThan(0);
  });

  it("hides block comments spanning multiple lines", () => {
    const block = processWithGfm("before\n%%\nblock\ncomment\n%%\nafter");
    expect(findNodes(block, "comment").length).toBeGreaterThan(0);
    const paragraphs = findNodes(block, "paragraph");
    const texts = paragraphs.flatMap((p: any) =>
      findNodes(p, "text").map((n: any) => n.value),
    );
    expect(texts).toContain("before");
    expect(texts).toContain("after");
  });

  it("hides block comments containing empty lines", () => {
    const block = processWithGfm(
      "before\n%%\nfirst line\n\nsecond line\n%%\nafter",
    );
    expect(findNodes(block, "comment").length).toBeGreaterThan(0);
    const paragraphs = findNodes(block, "paragraph");
    const texts = paragraphs.flatMap((p: any) =>
      findNodes(p, "text").map((n: any) => n.value),
    );
    expect(texts).toContain("before");
    expect(texts).toContain("after");
    expect(texts.join(" ")).not.toContain("first line");
  });

  it("hides block comments with only empty lines", () => {
    const block = processWithGfm("before\n%%\n\n%%\nafter");
    expect(findNodes(block, "comment").length).toBeGreaterThan(0);
    const paragraphs = findNodes(block, "paragraph");
    const texts = paragraphs.flatMap((p: any) =>
      findNodes(p, "text").map((n: any) => n.value),
    );
    expect(texts).toContain("before");
    expect(texts).toContain("after");
  });

  it("hides block comments with multiple consecutive empty lines", () => {
    const block = processWithGfm("before\n%%\nline\n\n\n\nline\n%%\nafter");
    expect(findNodes(block, "comment").length).toBeGreaterThan(0);
    const paragraphs = findNodes(block, "paragraph");
    const texts = paragraphs.flatMap((p: any) =>
      findNodes(p, "text").map((n: any) => n.value),
    );
    expect(texts).toContain("before");
    expect(texts).toContain("after");
  });

  it("keeps the rest of the note when a block comment's closer has a trailing tail", () => {
    // The closer starting its own line used to reject after consuming earlier
    // lines, which re-fired this construct on the closer line and opened a second
    // comment that ran to end of file, silently dropping every later block.
    const visibleText = (markdown: string): string[] =>
      findNodes(processWithGfm(markdown), "text").map((n: any) => n.value);

    expect(visibleText("%%\nhidden\n%% [^a]: def\n\ntail")).toContain("tail");
    expect(visibleText("%%\nhidden\n%% trailing\n\ntail")).toContain("tail");
    expect(visibleText("use me\n\n%%\nhidden\n%% [^d]: after")).toContain(
      "use me",
    );
  });

  it("still splits a mid-line closer the way Obsidian does", () => {
    // `%%\nline %%` closes, then ` nested %% line` stays visible and the next
    // `%%` opens a fresh comment. Rejecting mid-line is what reproduces this, so
    // the line-start fix above must not apply here.
    const tree = processWithGfm("%%\nline %% nested %% line\n%%\nafter");
    const texts = findNodes(tree, "text").map((n: any) => n.value);
    expect(texts.join("")).toContain("nested %% line");
    expect(texts.join("")).not.toContain("after");
  });

  it("keeps comment nodes but never renders their body", async () => {
    // `mdast-util-to-hast` turns an unknown node carrying a `value` into a text
    // node, which would publish the comment. `data.hChildren: []` makes it an
    // empty element instead; rehype-obsidian removes the element itself.
    const tree = processWithGfm("before %%secret%% after");
    expect(findNodes(tree, "comment").length).toBe(1);

    const html = await toHtml("before %%secret%% after");
    expect(html).not.toContain("secret");
    expect(html).toContain("obsidian-comment");
  });

  it("deletes comment nodes when keepComments is off", async () => {
    const tree = processWithGfm("before %%secret%% after", {
      keepComments: false,
    });
    expect(findNodes(tree, "comment").length).toBe(0);
    const html = await toHtml("before %%secret%% after", {
      keepComments: false,
    });
    expect(html).not.toContain("secret");
    expect(html).not.toContain("obsidian-comment");
  });

  it("parses inline footnotes", async () => {
    const tree = processWithGfm("text^[inline body]");
    const notes = findNodes(tree, "footnote");
    expect(notes.length).toBe(1);
    expect(findNodes(notes[0], "text").map((n: any) => n.value)).toEqual([
      "inline body",
    ]);
  });

  it("closes an inline footnote on its balanced bracket", () => {
    const tree = processWithGfm("text^[body with [a link](u)]");
    expect(findNodes(tree, "footnote").length).toBe(1);
    expect(findNodes(tree, "link").length).toBe(1);
  });

  it("refuses an inline footnote that never closes on its line", () => {
    const tree = processWithGfm("text^[never closes");
    expect(findNodes(tree, "footnote").length).toBe(0);
  });

  it("accepts an empty inline footnote, as Obsidian does", () => {
    // Measured: `^[]` renders a marker. An earlier guess here said otherwise.
    expect(findNodes(processWithGfm("a^[]b"), "footnote").length).toBe(1);
  });

  it("lets an inline footnote body span lines, as Obsidian does", () => {
    const tree = processWithGfm("a^[note\nnote]b");
    expect(findNodes(tree, "footnote").length).toBe(1);
  });

  it("lets an inline footnote body swallow a reference-shaped string", () => {
    // Obsidian reads `^[^literal]` as inline-footnote text, not a reference.
    const tree = processWithGfm("text^[^literal]");
    expect(findNodes(tree, "footnote").length).toBe(1);
    expect(findNodes(tree, "footnoteReference").length).toBe(0);
  });

  it("treats an escaped caret as a literal, leaving a real reference", () => {
    // Stock remark-footnotes gets this wrong and builds an inline footnote.
    const tree = processWithGfm("text\\^[^x]\n\n[^x]: y");
    expect(findNodes(tree, "footnote").length).toBe(0);
    expect(findNodes(tree, "footnoteReference").length).toBe(1);
  });

  it("does not parse an inline footnote inside a code span", () => {
    expect(findNodes(processWithGfm("`a^[code]`"), "footnote").length).toBe(0);
  });

  it("revives a reference whose definition was hidden in a comment", () => {
    // GFM binds references before the comment transforms put the definition
    // back, so the reference is still a text node when the definition arrives.
    const tree = processWithGfm("x[^1]\n\n%%\nhidden\n%% [^1]: freed label\n");
    expect(findNodes(tree, "footnoteDefinition").length).toBe(1);
    expect(findNodes(tree, "footnoteReference").length).toBe(1);
  });

  it("still strips a reference nothing defines", () => {
    const tree = processWithGfm("see [^gone]\n");
    expect(findNodes(tree, "footnoteReference").length).toBe(0);
    expect(findNodes(tree, "text")[0].value).toBe("see gone");
  });

  it("keeps a footnote definition one after a leading ---", () => {
    const tree = processWithGfm("---\n\nalpha\n\n[^Note]: alpha\n");
    expect(findNodes(tree, "definition").length).toBe(0);
    expect(findNodes(tree, "footnoteDefinition").length).toBe(1);
  });

  it("leaves a real link reference definition alone", () => {
    const tree = processWithGfm("---\n\n[foo]: /url\n\n[foo]\n");
    expect(findNodes(tree, "definition").length).toBe(1);
    expect(findNodes(tree, "footnoteDefinition").length).toBe(0);
  });

  it("ends a footnote label at the first bracket", () => {
    // GFM reads this as a definition named `a]b`; Obsidian stops at the first
    // `]`, finds `b` rather than `:`, and leaves the line as prose.
    const tree = processWithGfm("Alpha.\n\n[^a\\]b]: body\n");
    expect(findNodes(tree, "footnoteDefinition").length).toBe(0);
    expect(rootTypes(tree)).toEqual(["paragraph", "paragraph"]);
  });

  it("still accepts a label with no bracket in it", () => {
    const tree = processWithGfm("[^ab]: body\n");
    expect(findNodes(tree, "footnoteDefinition").length).toBe(1);
  });

  it("leaves an escaped marker written as the author escaped it", () => {
    const tree = processWithGfm("literal \\[^9] real[^7]\n\n[^7]: real\n");
    expect(
      findNodes(tree, "text")
        .map((n) => n.value)
        .join(""),
    ).toContain("[^9]");
    expect(findNodes(tree, "footnoteReference").length).toBe(1);
  });

  it("reduces a stripped reference to its lowercased identifier", () => {
    const tree = processWithGfm("x [^Cell] y\n");
    expect(
      findNodes(tree, "text")
        .map((n) => n.value)
        .join(""),
    ).toBe("x cell y");
  });

  it("matches a definition case-insensitively when reviving", () => {
    const tree = processWithGfm("x[^Cell]\n\n%%\nhidden\n%% [^cell]: freed\n");
    expect(findNodes(tree, "footnoteReference").length).toBe(1);
  });

  it("lets an unclosed fence in a list item swallow the lazy line", () => {
    const tree = processWithGfm("- ```\n  code\nplain[^1]\n");
    const code = findNodes(tree, "code");
    expect(code.length).toBe(1);
    expect(code[0].value).toBe("code\nplain[^1]");
    expect(findNodes(tree, "paragraph").length).toBe(0);
  });

  it("leaves a closed fence in a list item alone", () => {
    const tree = processWithGfm("- ```\n  code\n  ```\nplain[^1]\n");
    expect(findNodes(tree, "code")[0].value).toBe("code");
    expect(findNodes(tree, "paragraph").length).toBe(1);
  });

  it("does not let a table interrupt a paragraph", () => {
    const tree = processWithGfm("text\n| a | b |\n| --- | --- |\n");
    expect(findNodes(tree, "table").length).toBe(0);
    expect(findNodes(tree, "paragraph").length).toBe(1);
  });

  it("keeps inline content inside a folded-back table row", () => {
    const tree = processWithGfm("text\n| *a* | b |\n| --- | --- |\n");
    expect(findNodes(tree, "table").length).toBe(0);
    expect(findNodes(tree, "emphasis").length).toBe(1);
  });

  it("still builds a table after a blank line", () => {
    const tree = processWithGfm("text\n\n| a | b |\n| --- | --- |\n");
    expect(findNodes(tree, "table").length).toBe(1);
  });

  it("heads a one-line definition sitting under a setext underline", () => {
    const tree = processWithGfm("[^1]: x\n===\n\nuse[^1]\n");
    expect(findNodes(tree, "footnoteDefinition").length).toBe(0);
    const heading = findNodes(tree, "heading");
    expect(heading.length).toBe(1);
    expect(heading[0].depth).toBe(1);
    // The heading keeps the raw line; the bare-reference pass then reduces the
    // label, which is how Obsidian shows it.
    expect(heading[0].children[0].value).toBe("1: x");
  });

  it("heads one sitting above a thematic break instead", () => {
    const tree = processWithGfm("[^1]: x\n---\n\nuse[^1]\n");
    expect(findNodes(tree, "thematicBreak").length).toBe(0);
    expect(findNodes(tree, "heading")[0].depth).toBe(2);
  });

  it("shows the short-form html comments literally", () => {
    for (const short of ["<!-->", "<!--->"]) {
      const tree = processWithGfm(`x ${short}\nreal\n`);
      expect(findNodes(tree, "html").length).toBe(0);
      expect(
        findNodes(tree, "text")
          .map((n) => n.value)
          .join(""),
      ).toContain(short);
    }
  });

  describe("a list absorbing the line below it", () => {
    it("absorbs a definition under an empty item", () => {
      expect(rootTypes(processWithGfm("-\n[^3]: real definition\n"))).toEqual([
        "list",
      ]);
    });

    it("absorbs a definition and the table under it", () => {
      const tree = processWithGfm(
        "-      item\n[^1]: body\n| a | b |\n| --- | --- |\n",
      );
      expect(rootTypes(tree)).toEqual(["list"]);
    });

    it("still stops at a blank line", () => {
      expect(rootTypes(processWithGfm("- item\n\n[^3]: real\n"))).toEqual([
        "list",
        "footnoteDefinition",
      ]);
    });
  });

  describe("an unclosed block in a container", () => {
    it("lets a `$$` block in a quote swallow the lazy line", () => {
      const tree = processWithGfm("> $$\nlazy[^1]\n");
      expect(findNodes(tree, "math").length).toBe(1);
      // Swallowed, so the `[^1]` is formula text and never a reference.
      expect(findNodes(tree, "footnoteReference").length).toBe(0);
      expect(findNodes(tree, "paragraph").length).toBe(0);
    });

    it("leaves a closed `$$` block alone", () => {
      const tree = processWithGfm("> $$\n> x\n> $$\n\nafter\n");
      expect(findNodes(tree, "math").length).toBe(1);
      expect(findNodes(tree, "paragraph").length).toBe(1);
    });
  });

  describe("splitting a definition inside a quote", () => {
    it("splits at a pipeless table", () => {
      const tree = processWithGfm(
        "> [^1]: body\n> a | b\n> --- | ---\n\ntext[^1]\n",
      );
      const quote = findNodes(tree, "blockquote")[0];
      expect(findNodes(quote, "table").length).toBe(1);
      expect(findNodes(quote, "footnoteDefinition").length).toBe(1);
    });

    it("splits at a link reference definition", () => {
      const tree = processWithGfm("[^1]: body\n[foo]: /url\nmore\n\nuse[^1]\n");
      expect(rootTypes(tree).slice(0, 3)).toEqual([
        "footnoteDefinition",
        "definition",
        "paragraph",
      ]);
    });

    it("splits at a setext underline", () => {
      const tree = processWithGfm("> [^2]: body\n> cont\n> ===\n");
      expect(findNodes(tree, "heading").length).toBe(1);
      expect(findNodes(tree, "footnoteDefinition").length).toBe(1);
    });

    it("keeps the split halves on their real source lines", () => {
      const tree = processWithGfm("> [^2]: body\n> cont\n> ===\n");
      const heading = findNodes(tree, "heading")[0];
      expect(heading.position.start.line).toBe(2);
    });
  });

  describe("setext underlines", () => {
    it("needs the underline to stand alone", () => {
      expect(rootTypes(processWithGfm("H\n===\n"))).toEqual(["heading"]);
      expect(rootTypes(processWithGfm("H\n---\n"))).toEqual(["heading"]);
      // CommonMark allows indent and trailing space here; remark-parse@8 does
      // not, and Obsidian agrees with it on every variant measured.
      for (const md of ["H\n  ===\n", "H\n=== \n", "H\n===\t\n"]) {
        expect(rootTypes(processWithGfm(md))).toEqual(["paragraph"]);
      }
    });

    it("lets a definition fold into the demoted paragraph", () => {
      expect(rootTypes(processWithGfm("H\n  ===\n[^1]: real\n"))).toEqual([
        "paragraph",
      ]);
    });

    it("still ends a heading at a definition when the underline is clean", () => {
      expect(rootTypes(processWithGfm("H\n===\n[^1]: real\n"))).toEqual([
        "heading",
        "footnoteDefinition",
      ]);
    });
  });

  describe("table row pipe style", () => {
    it("ends a table at a body row that drops the outer pipes", () => {
      const tree = processWithGfm("| a | b |\n| --- | --- |\nc | d\n");
      expect(rootTypes(tree)).toEqual(["table", "paragraph"]);
      expect(findNodes(tree, "tableRow").length).toBe(1);
    });

    it("keeps a pipeless body row under a pipeless header", () => {
      const tree = processWithGfm("a | b\n--- | ---\nc | d\n");
      expect(findNodes(tree, "tableRow").length).toBe(2);
    });
  });

  describe("a list under a footnote definition", () => {
    it("keeps an ordered list that cannot interrupt inside the definition", () => {
      const tree = processWithGfm(
        "text[^1] here\n\n[^1]: body\n2. item text\n",
      );
      expect(rootTypes(tree)).toEqual(["paragraph", "footnoteDefinition"]);
    });

    it("still ends the definition at a list that can interrupt", () => {
      const tree = processWithGfm(
        "text[^1] here\n\n[^1]: body\n1. item text\n",
      );
      expect(rootTypes(tree)).toEqual([
        "paragraph",
        "footnoteDefinition",
        "list",
      ]);
    });
  });

  describe("legacy link reference definitions", () => {
    // remark-parse@8's rules are the inverse of CommonMark's in both
    // directions, so every row here contradicts the spec on purpose.
    it.each([
      ["[foo]: /url\n", true],
      ["[a[b]: /url\n", true],
      ['[foo]: /url "title"\n', true],
      ["[foo]: [^9]\n", false],
      ["[foo]: <[^9]>\n", false],
      ['[foo]: /url\n"a \\" b"\n[^1]: x\n', false],
      ["[foo]: /url\n(a(b))\n[^1]: x\n", false],
    ])("decides %j the way legacy does", (md, expected) => {
      expect(isLegacyDefinition(md as string)).toBe(expected);
    });

    it("turns a definition legacy would reject into prose", () => {
      const tree = processWithGfm("[foo]: [^9]\n\nuse[^9]\n\n[^9]: nine\n");
      expect(findNodes(tree, "definition").length).toBe(0);
      expect(rootTypes(tree)).toEqual([
        "paragraph",
        "paragraph",
        "footnoteDefinition",
      ]);
    });

    it("promotes prose legacy would read as a definition", () => {
      const tree = processWithGfm("[a[b]: /url\n[^1]: x\n");
      expect(rootTypes(tree)).toEqual(["definition", "footnoteDefinition"]);
      expect(findNodes(tree, "definition")[0].label).toBe("a[b");
    });

    it("leaves a definition legacy accepts alone", () => {
      const tree = processWithGfm("[foo]: /url\n\n[foo]\n");
      expect(findNodes(tree, "definition").length).toBe(1);
    });
  });

  describe("lexically paired comment regions", () => {
    it("gives a definition the whole region its indented opener started", () => {
      const tree = processWithGfm(
        "x[^1] y[^2]\n\n[^1]: one\n    %%\nhidden[^2] text\n%%\n\ntail\n",
      );
      expect(rootTypes(tree)).toEqual([
        "paragraph",
        "footnoteDefinition",
        "paragraph",
      ]);
    });

    it("does not let an unclosed region swallow a later definition", () => {
      const tree = processWithGfm(
        "x[^1]\n\n> %%\n> [^1]: dead\n\n[^1]: live\n",
      );
      expect(findNodes(tree, "footnoteReference").length).toBe(1);
    });

    it("does not let a region swallow a line that opens a block", () => {
      const tree = processWithGfm(
        "a[^1]\n\n[^9]: orphan\n    %%\n[^1]: one\n%%\n",
      );
      expect(findNodes(tree, "footnoteDefinition").length).toBe(2);
    });

    it("gives a definition the whole html comment its opener started", () => {
      const tree = processWithGfm(
        "x[^1] y[^2]\n\n[^1]: one\n    <!--\nhidden[^2] text\n-->\n\ntail\n",
      );
      expect(rootTypes(tree)).toEqual([
        "paragraph",
        "footnoteDefinition",
        "paragraph",
      ]);
    });

    it("does not pair an html comment across a blank line", () => {
      expect(htmlCommentRegions("x <!--\n\nhidden\n\n--> after\n")).toEqual([]);
    });

    it("does not pair an html comment opened inside a label", () => {
      expect(htmlCommentRegions("see[^a<!--x-->b].\n")).toEqual([]);
      expect(
        htmlCommentRegions("body [^c<!--d] ![i](u) tail\n--> end\n"),
      ).toEqual([]);
    });

    it("resumes pairing on the next line after a mid-line closer", () => {
      // The `%%` inside ` nested %% line` is prose, not an opener: scanning
      // restarts on the line below the closer, so the next region is the `%%`
      // on its own line.
      expect(commentRegions("%%\nline %% nested %% line\n%%\nafter\n")).toEqual(
        [
          { start: 0, end: 10, closed: true },
          { start: 26, end: 35, closed: false },
        ],
      );
    });
  });

  describe("legacy highlight scanning", () => {
    const content = (md: string): string =>
      findNodes(findNodes(processWithGfm(md), "highlight")[0], "text")
        .map((n) => n.value)
        .join("");

    it("leaves the first marker of an over-long opening run literal", () => {
      expect(content("====text==\n")).toBe("=text");
      expect(content("====text====\n")).toBe("=text");
    });

    it("leaves a surplus closing run literal", () => {
      expect(
        findNodes(processWithGfm("====text====\n"), "text")
          .map((n) => n.value)
          .join(""),
      ).toBe("==text==");
    });

    it("does not highlight content padded with whitespace", () => {
      for (const md of [
        "before == text== after\n",
        "before ==text == after\n",
      ]) {
        expect(findNodes(processWithGfm(md), "highlight").length).toBe(0);
      }
    });

    it("still nests inline syntax and spans lines", () => {
      const nested = processWithGfm("==a **b** c==\n");
      expect(findNodes(nested, "highlight").length).toBe(1);
      expect(findNodes(nested, "strong").length).toBe(1);
      expect(findNodes(processWithGfm("==a\nb==\n"), "highlight").length).toBe(
        1,
      );
    });
  });

  describe("escaped closing delimiters", () => {
    it("does not let a backslash escape a closing highlight delimiter", () => {
      const tree = processWithGfm("==text\\==\n");
      expect(findNodes(tree, "highlight").length).toBe(1);
      expect(
        findNodes(findNodes(tree, "highlight")[0], "text")
          .map((n) => n.value)
          .join(""),
      ).toBe("text\\");
    });

    it("still escapes an opening highlight delimiter", () => {
      const tree = processWithGfm("\\==text==\n");
      expect(findNodes(tree, "highlight").length).toBe(0);
    });

    it("escapes both delimiters when nothing is open", () => {
      const tree = processWithGfm("\\==text\\==\n");
      expect(findNodes(tree, "highlight").length).toBe(0);
      expect(
        findNodes(tree, "text")
          .map((n) => n.value)
          .join(""),
      ).toBe("==text==");
    });

    it("closes a wikilink on an escaped bracket", () => {
      const link = findNodes(processWithGfm("[[target\\]]\n"), "wikilink")[0];
      expect(link.path).toBe("target");
      expect(link.value).toBe("target\\");
    });

    it("closes an embed on an escaped bracket", () => {
      const link = findNodes(processWithGfm("![[target\\]]\n"), "wikilink")[0];
      expect(link.embedded).toBe(true);
      expect(link.path).toBe("target");
    });
  });

  it("opens a code block for an indented line below a quote", () => {
    const tree = processWithGfm("> quote\n> more\n    code[^1]\n\nafter\n");
    expect(rootTypes(tree)).toEqual(["blockquote", "code", "paragraph"]);
    expect(findNodes(tree, "code")[0].value).toBe("code[^1]");
  });

  it("keeps an unindented lazy line inside the quote", () => {
    const tree = processWithGfm("> quote\nlazy line\n");
    expect(rootTypes(tree)).toEqual(["blockquote"]);
  });

  it("folds a definition under prose inside a quote", () => {
    const tree = processWithGfm("> para\n> [^q]: quoted under prose\n");
    expect(findNodes(tree, "footnoteDefinition").length).toBe(0);
    expect(
      findNodes(findNodes(tree, "blockquote")[0], "text")
        .map((n) => n.value)
        .join(""),
    ).toContain("q: quoted under prose");
  });

  it("still starts a definition after a blank line inside a quote", () => {
    const tree = processWithGfm("> para\n>\n> [^q]: real\n");
    expect(findNodes(tree, "footnoteDefinition").length).toBe(1);
  });

  it("carries a definition into a blockquote's lazy continuation", () => {
    const tree = processWithGfm(
      "> [^1]: quoted def\nplain column-0 line\n[^2]: second\n\ntail\n",
    );
    expect(rootTypes(tree)).toEqual(["blockquote", "paragraph"]);
  });

  it("still folds a definition under a list item into its paragraph", () => {
    const tree = processWithGfm("- item\n[^3]: under the item\n");
    expect(rootTypes(tree)).toEqual(["list"]);
    expect(findNodes(tree, "footnoteDefinition").length).toBe(0);
  });

  it("lets a definition freed from a comment read the line below it", () => {
    const tree = processWithGfm("%%\nhidden\n%%[^1]: def\ntext ref\n");
    const definitions = findNodes(tree, "footnoteDefinition");
    expect(definitions.length).toBe(1);
    const inside = findNodes(definitions[0], "text")
      .map((n) => n.value)
      .join("");
    expect(inside).toContain("def");
    expect(inside).toContain("text ref");
  });

  it("still treats a real html comment as html", () => {
    const tree = processWithGfm("x <!-- hidden -->\nreal\n");
    expect(findNodes(tree, "html").length).toBe(1);
  });

  it("leaves a definition with a continuation line alone", () => {
    const tree = processWithGfm("[^1]: x\n    y\n--\n\nuse[^1]\n");
    expect(findNodes(tree, "heading").length).toBe(0);
    expect(findNodes(tree, "footnoteDefinition").length).toBe(1);
  });

  it("round-trips an inline footnote back to markdown", async () => {
    expect(await toMd("text^[inline body]")).toContain("^[inline body]");
  });

  it("promotes a callout blockquote into a callout node", () => {
    const [callout] = findNodes(
      processWithGfm("> [!note] Title\n> Body"),
      "callout",
    );
    expect(callout.calloutType).toBe("note");
    expect(callout.title).toBe("Title");
    expect(callout.collapsed).toBe(null);
    // The title keeps its own nodes under `calloutTitle`, so the callout holds
    // both the title and the body rather than the body alone.
    const [titleNode] = findNodes(callout, "calloutTitle");
    expect(findNodes(titleNode, "text").map((n: any) => n.value)).toEqual([
      "Title",
    ]);
    const body = callout.children.filter((c: any) => c.type !== "calloutTitle");
    expect(
      body.flatMap((b: any) => findNodes(b, "text").map((n: any) => n.value)),
    ).toEqual(["Body"]);
  });

  it("records the fold marker", () => {
    const [folded] = findNodes(processWithGfm("> [!note]- C\n> H"), "callout");
    const [open] = findNodes(processWithGfm("> [!note]+ E\n> S"), "callout");
    expect(folded.collapsed).toBe(true);
    expect(open.collapsed).toBe(false);
  });

  it("leaves the title empty when absent, rather than inventing one", () => {
    // Obsidian *displays* the capitalised type; the node keeps what was written.
    const [callout] = findNodes(
      processWithGfm("> [!warning]\n> Body"),
      "callout",
    );
    expect(callout.title).toBe("");
    expect(callout.calloutType).toBe("warning");
  });

  it("reads a title that carries markup, keeping the markup node", () => {
    const [callout] = findNodes(processWithGfm("> [!note] **a**"), "callout");
    expect(callout.title).toBe("a");
    expect(findNodes(callout, "strong").length).toBe(1);
  });

  it("accepts an unknown callout type, as Obsidian does", () => {
    const [callout] = findNodes(
      processWithGfm("> [!custom] C\n> B"),
      "callout",
    );
    expect(callout.calloutType).toBe("custom");
  });

  it("handles a callout nested in a list item", () => {
    // Inside a list item the newline stays in the text value instead of becoming
    // a break node, which previously made the body get read as the title.
    const [callout] = findNodes(
      processWithGfm("- item\n  > [!note]\n  > body"),
      "callout",
    );
    expect(callout.title).toBe("");
    expect(findNodes(callout, "text").map((n: any) => n.value)).toEqual([
      "body",
    ]);
  });

  it("nests callouts", () => {
    const callouts = findNodes(
      processWithGfm("> [!question] Outer\n> > [!todo] Inner\n> > Body"),
      "callout",
    );
    expect(callouts.length).toBe(2);
    expect(callouts.map((c: any) => c.calloutType)).toEqual([
      "question",
      "todo",
    ]);
  });

  it("leaves an ordinary blockquote alone", () => {
    const tree = processWithGfm("> just a quote");
    expect(findNodes(tree, "callout").length).toBe(0);
    expect(findNodes(tree, "blockquote").length).toBe(1);
  });

  it("hoists a multi-line comment out of the paragraph that swallowed it", () => {
    // Obsidian reports a block comment as its own section even when its closing
    // `%%` sits mid-line, with the rest of that line continuing as a paragraph.
    const tree = processWithGfm("%%\nline %% nested %% line\n%%\nafter");
    expect(findNodes(tree, "root")[0].children.map((n: any) => n.type)).toEqual(
      ["comment", "paragraph", "comment"],
    );
  });

  it("leaves a single-line comment inline", () => {
    const tree = processWithGfm("%%note%% tail");
    expect(findNodes(tree, "root")[0].children.map((n: any) => n.type)).toEqual(
      ["paragraph"],
    );
  });

  it("does not let a footnote definition interrupt a paragraph", () => {
    // Obsidian reads the label as lazy continuation, the way CommonMark treats a
    // link reference definition in the same position; micromark's gfm-footnote
    // lets it interrupt.
    const tree = processWithGfm("a[^1]\nmore text\n[^1]: mid");
    expect(findNodes(tree, "root")[0].children.map((n: any) => n.type)).toEqual(
      ["paragraph"],
    );
    expect(findNodes(tree, "footnoteDefinition").length).toBe(0);
  });

  it("still takes a definition after a blank line", () => {
    const tree = processWithGfm("a[^1]\n\n[^1]: real");
    expect(findNodes(tree, "footnoteDefinition").length).toBe(1);
  });

  it("leaves a multi-block definition body alone", () => {
    // No unambiguous inline form, so folding it would be a guess.
    const tree = processWithGfm("a[^1]\n[^1]: one\n\n    fenced\n");
    expect(findNodes(tree, "root")[0].children.length).toBeGreaterThan(0);
  });

  it("re-parses what follows a block comment's closing %% on the same line", () => {
    // Obsidian ends the comment at its closer and reads the rest of the line as
    // a new block. The tokenizer absorbs that tail on purpose (rejecting there
    // used to drop every later line), so the split is restored here.
    const tree = processWithGfm("%%\nhidden\n%% [^1]: def");
    expect(findNodes(tree, "root")[0].children.map((n: any) => n.type)).toEqual(
      ["comment", "footnoteDefinition"],
    );
  });

  it("keeps later blocks when a comment tail is re-parsed", () => {
    const tree = processWithGfm("%%\nhidden\n%% [^a]: def\n\ntail");
    expect(findNodes(tree, "root")[0].children.map((n: any) => n.type)).toEqual(
      ["comment", "footnoteDefinition", "paragraph"],
    );
  });

  it("leaves a comment with nothing after its closer alone", () => {
    const tree = processWithGfm("%%\nhidden\n%%\n\ntail");
    expect(findNodes(tree, "root")[0].children.map((n: any) => n.type)).toEqual(
      ["comment", "paragraph"],
    );
  });

  it("extends a container over the unindented line that follows it", () => {
    // CommonMark ends the blockquote there; Obsidian keeps the line inside.
    const tree = processWithGfm("> ```\n> fake\n> ```\nreal");
    expect(findNodes(tree, "root")[0].children.map((n: any) => n.type)).toEqual(
      ["blockquote"],
    );
  });

  it("stops at a blank line, which still ends the container", () => {
    // An unclosed fence pulls the list's span over the following newline, so
    // this has to be judged from the source rather than from line numbers.
    const tree = processWithGfm("- ```\n  code\n\nplain");
    expect(findNodes(tree, "root")[0].children.map((n: any) => n.type)).toEqual(
      ["list", "paragraph"],
    );
  });

  it("absorbs into the last item of a list", () => {
    const tree = processWithGfm("- ```\n  code\n  ```\nreal");
    expect(findNodes(tree, "root")[0].children.map((n: any) => n.type)).toEqual(
      ["list"],
    );
  });

  it("ends a footnote definition where a table begins", () => {
    const tree = processWithGfm("[^1]: body\n| a | b |\n| --- | --- |");
    expect(findNodes(tree, "root")[0].children.map((n: any) => n.type)).toEqual(
      ["footnoteDefinition", "table"],
    );
  });

  it("splits on a pipeless table too", () => {
    const tree = processWithGfm("[^1]: body\na | b\n--- | ---\nc | d");
    expect(findNodes(tree, "table").length).toBe(1);
  });

  it("needs the header and delimiter rows to agree about outer pipes", () => {
    // Obsidian reads a pipeless header under a piped delimiter as plain
    // continuation, not a table.
    const tree = processWithGfm("[^1]: body\na | b\n| --- | --- |\nc | d");
    expect(findNodes(tree, "table").length).toBe(0);
  });

  it("does not split a definition that is really lazy continuation", () => {
    // The label belongs to the paragraph above, and a table cannot interrupt a
    // paragraph either, so the whole run stays one block.
    const tree = processWithGfm("prose\n[^1]: lazy\n| a | b |\n| --- | --- |");
    expect(findNodes(tree, "root")[0].children.map((n: any) => n.type)).toEqual(
      ["paragraph"],
    );
  });

  it("bares a reference whose definition was folded away", () => {
    // GFM binds references while parsing, so the node survives the fold that
    // turns the definition into lazy continuation. Obsidian never saw a
    // definition there and renders the bare name.
    const tree = processWithGfm("para\n[^1]: a\n\nx[^1]");
    expect(findNodes(tree, "footnoteDefinition").length).toBe(0);
    expect(findNodes(tree, "footnoteReference").length).toBe(0);
    expect(
      findNodes(tree, "text")
        .map((n: any) => n.value)
        .join(""),
    ).toContain("x1");
  });

  it("keeps a reference bound when its definition survives", () => {
    const tree = processWithGfm("x[^1]\n\n[^1]: real");
    expect(findNodes(tree, "footnoteDefinition").length).toBe(1);
    expect(findNodes(tree, "footnoteReference").length).toBe(1);
  });

  it("folds a definition under a list item into that item", () => {
    const tree = processWithGfm("- item\n[^3]: under the item");
    expect(findNodes(tree, "root")[0].children.map((n: any) => n.type)).toEqual(
      ["list"],
    );
    expect(findNodes(tree, "footnoteDefinition").length).toBe(0);
  });

  it("folds a run of definitions, not just the first", () => {
    // Folding one extends the paragraph, which is what lets the next fold in
    // turn. Iterating backwards left the second behind.
    const tree = processWithGfm("a[^1] b[^2]\n[^2]: first\n[^1]: mid");
    expect(findNodes(tree, "root")[0].children.map((n: any) => n.type)).toEqual(
      ["paragraph"],
    );
    expect(findNodes(tree, "footnoteDefinition").length).toBe(0);
  });

  it("ends a footnote definition at a setext underline", () => {
    // The underline makes the line above it a heading, which ends the
    // definition just as a table header does.
    const tree = processWithGfm("[^1]: body\npara\n===\n    code");
    expect(findNodes(tree, "root")[0].children.map((n: any) => n.type)).toEqual(
      ["footnoteDefinition", "heading", "code"],
    );
  });

  it("leaves no empty title node on a titleless callout", () => {
    // An empty `calloutTitle` still reads as "has a title" downstream, which
    // suppressed the type name Obsidian shows in its place.
    const [callout] = findNodes(processWithGfm("> [!note]\n> body"), "callout");
    expect(findNodes(callout, "calloutTitle").length).toBe(0);
    expect(callout.title).toBe("");
  });

  it("does not crash on flow comment with lazy continuation", () => {
    expect(() => parse("> %%\nlazy line\n%%")).not.toThrow();
  });

  it("does not crash on unterminated flow comment at EOF", () => {
    expect(() => parse("%%\nunclosed comment")).not.toThrow();
    expect(() => parse("%%")).not.toThrow();
    expect(() => parse("before\n%%\nfirst\n\nsecond")).not.toThrow();
  });

  it("does not crash on flow comment with CRLF line endings", () => {
    expect(() => parse("%%\r\ncomment\r\n%%")).not.toThrow();
    expect(() => parse("%%\r\nunclosed")).not.toThrow();
    expect(() => parse("before\r\n%%\r\nblock\r\n%%\r\nafter")).not.toThrow();
  });

  // Regression: a text construct that consumes line endings without emitting
  // `lineEnding` tokens desynchronizes micromark's chunked token chain, so
  // `subtokenize` scans past its splice buffer and throws a RangeError.
  it("does not crash on inline comment spanning multiple line endings", () => {
    expect(() => parse("a%%\nb%%")).not.toThrow();
    expect(() => parse("a%%\nb\nc%%")).not.toThrow();
    expect(() => parse("a%%\nb\nc\nd%%")).not.toThrow();
    expect(() =>
      parse("Note text %%TODO\nfix this\nlater%% end."),
    ).not.toThrow();
  });

  it("does not crash on inline comment spanning lines inside containers", () => {
    expect(() => parse("> a%%\n> b\n> c%%")).not.toThrow();
    expect(() => parse("- a%%\n  b\n  c%%")).not.toThrow();
    expect(() => parse("| a%%\nb\nc%% |")).not.toThrow();
  });

  it("does not crash on inline comment with CRLF line endings", () => {
    expect(() => parse("a%%\r\nb\r\nc%%")).not.toThrow();
    expect(() => parse("a%%\r\nb\r\nc\r\nd%%")).not.toThrow();
  });

  it("does not crash on unterminated inline comment", () => {
    expect(() => parse("a%%\nb\nc")).not.toThrow();
    expect(() => parse("a%%b")).not.toThrow();
    expect(() => parse("a%%")).not.toThrow();
  });

  it("does not crash on inline comment with lazy continuation", () => {
    expect(() => parse("> a%%\nlazy line\nmore%%")).not.toThrow();
    expect(() => parse("- a%%\nlazy line\nmore%%")).not.toThrow();
  });

  it("does not crash on highlights spanning CRLF line endings", () => {
    expect(() => parse("a==b\r\nc\r\nd==")).not.toThrow();
    expect(() => parse("a==b\r\nc\r\nd\r\ne==")).not.toThrow();
    expect(() => parse("a==b\nc\nd==")).not.toThrow();
  });

  // Regression: the legacy ports decide a whole match up front and then consume
  // it, which swallowed line endings inside the span's text token. That
  // desynchronizes micromark's chunked token chain and surfaces as
  // `expected no next token` from `subtokenize`, nowhere near the construct.
  it("does not crash on emphasis spanning line endings", () => {
    for (const eol of ["\n", "\r\n"]) {
      expect(() => parse(`a*b${eol}c${eol}d*`)).not.toThrow();
      expect(() => parse(`a**b${eol}c${eol}d**`)).not.toThrow();
      expect(() => parse(`a*b${eol}c${eol}d${eol}e*`)).not.toThrow();
    }
  });

  it("does not crash on wikilinks spanning CRLF line endings", () => {
    expect(() => parse("a[[b\r\nc\r\nd]]")).not.toThrow();
    expect(() => parse("a[[b\r\nc\r\nd\r\ne]]")).not.toThrow();
    expect(() => parse("a[[b\nc\nd]]")).not.toThrow();
  });

  it("does not treat line-broken wikilinks as markup", () => {
    expect(findNodes(parse("a[[b\r\nc]]"), "wikilink").length).toBe(0);
  });

  // Obsidian highlights span line endings: `==a\nb==` yields a single highlight
  // containing "a\nb". Verified against Obsidian 1.13.7 by the parity harness
  // (`highlight/across-newline`, `token/highlight/newline-body`).
  it("treats line-broken highlights as markup, like Obsidian", () => {
    const highlights = findNodes(parse("a==b\r\nc=="), "highlight");
    expect(highlights.length).toBe(1);
    const text = findNodes(highlights[0], "text")
      .map((n: any) => n.value)
      .join("");
    expect(text).toContain("b");
    expect(text).toContain("c");
  });

  it("parses nested emphasis inside a highlight", () => {
    const [node] = findNodes(parse("==a **b** c=="), "highlight");
    expect(node).toBeDefined();
    expect(findNodes(node, "strong").length).toBe(1);
  });

  it("requires highlight delimiters to flank their content, like Obsidian", () => {
    expect(findNodes(parse("before ==text == after"), "highlight").length).toBe(
      0,
    );
    expect(findNodes(parse("before == text== after"), "highlight").length).toBe(
      0,
    );
    expect(findNodes(parse("== =="), "highlight").length).toBe(0);
    expect(findNodes(parse("==text=="), "highlight").length).toBe(1);
  });

  it("classifies $$..$$ as display math wherever it appears, like Obsidian", () => {
    const inline = processWithGfm("$$E=mc^2$$");
    const [node] = findNodes(inline, "inlineMath");
    expect(node.data?.display).toBe(true);
    expect(node.data?.hProperties?.className).toContain("math-display");

    const [single] = findNodes(processWithGfm("text $x^2$ text"), "inlineMath");
    expect(single.data?.display).toBeUndefined();
  });

  it("reparses a task body as block markdown, like Obsidian", () => {
    const ordered = processWithGfm("- [ ] 1.");
    const [item] = findNodes(ordered, "listItem");
    expect(item.children[0].type).toBe("list");

    const quote = processWithGfm("- [ ] > quote");
    const [quoteItem] = findNodes(quote, "listItem");
    expect(quoteItem.children[0].type).toBe("blockquote");

    // A body that stays a paragraph is where both agree; leave it alone.
    const plain = processWithGfm("- [ ] just text");
    const [plainItem] = findNodes(plain, "listItem");
    expect(plainItem.children[0].type).toBe("paragraph");
  });

  it("ends a tag at the next hash and starts one after an inline construct", () => {
    expect(
      findNodes(parse("#tag#tag"), "tag").map((n: any) => n.value),
    ).toEqual(["tag", "tag"]);
    expect(
      findNodes(parse("a**b**#next"), "tag").map((n: any) => n.value),
    ).toEqual(["next"]);
    expect(findNodes(parse("foo#next"), "tag").length).toBe(0);
    expect(findNodes(parse("(foo)#next"), "tag").length).toBe(0);
  });

  it("rejects `[[` inside a wikilink target, like Obsidian", () => {
    expect(
      findNodes(parse("[[[[target]]"), "wikilink").map((n: any) => n.path),
    ).toEqual(["[target"]);
    expect(
      findNodes(parse("![[![[target]]]]"), "wikilink").map((n: any) => ({
        path: n.path,
        embedded: n.embedded,
      })),
    ).toEqual([{ path: "target", embedded: true }]);
    // A single `[` is still a legal target character.
    expect(
      findNodes(parse("[[a[b]]"), "wikilink").map((n: any) => n.path),
    ).toEqual(["a[b"]);
  });

  it("keeps line endings inside a highlight", () => {
    const [node] = findNodes(parse("==a\nb=="), "highlight");
    expect(node.children.map((c: any) => c.value)).toEqual(["a\nb"]);
  });

  it("does not treat a currency amount as inline math", () => {
    expect(findNodes(parse("$5 and $10"), "inlineMath").length).toBe(0);
    expect(findNodes(parse("costs $20,000 today"), "inlineMath").length).toBe(
      0,
    );
    expect(findNodes(parse("text $x^2$ text"), "inlineMath").length).toBe(1);
  });

  it("hides inline comments spanning multiple line endings", () => {
    const block = processWithGfm("before a%%\nhidden\nmore hidden%% after");
    expect(findNodes(block, "comment").length).toBeGreaterThan(0);
    const texts = findNodes(block, "text").map((n: any) => n.value);
    expect(texts.join(" ")).toContain("before a");
    expect(texts.join(" ")).toContain("after");
    expect(texts.join(" ")).not.toContain("hidden");
  });

  it("keeps text following a multiline inline comment intact", () => {
    const tree = processWithGfm("start %%c1\nc2\nc3%% [[link]] end");
    expect(findNodes(tree, "comment").length).toBeGreaterThan(0);
    const [link] = findNodes(tree, "wikilink");
    expect(link.path).toBe("link");
    expect(
      findNodes(tree, "text")
        .map((n: any) => n.value)
        .join(" "),
    ).toContain("end");
  });

  it("does not parse highlights inside code", () => {
    const fenced = parse("```\n==not a highlight==\n```");
    expect(findNodes(fenced, "highlight").length).toBe(0);

    const inline = parse("`==not a highlight==`");
    expect(findNodes(inline, "highlight").length).toBe(0);
  });

  it("does not parse comments inside math blocks", () => {
    const processor = unified()
      .use(remarkParse)
      .use(remarkMath)
      .use(remarkObsidian);

    const mathBlock = processor.parse("$$\n%%not a comment%%\n$$");
    expect(findNodes(mathBlock, "comment").length).toBe(0);

    const inlineMath = processor.parse("$%%not a comment%%$");
    expect(findNodes(inlineMath, "comment").length).toBe(0);
  });

  it("parses tags", () => {
    const tags = parse("#tag #nested/tag #tag-with-dashes #tag_underscores");
    const tagNodes = findNodes(tags, "tag");
    expect(tagNodes.map((node) => node.value)).toEqual([
      "tag",
      "nested/tag",
      "tag-with-dashes",
      "tag_underscores",
    ]);

    const numeric = parse("#123");
    expect(findNodes(numeric, "tag").length).toBe(0);

    const afterSpace = parse("hello #tag");
    const [afterSpaceNode] = findNodes(afterSpace, "tag");
    expect(afterSpaceNode.value).toBe("tag");
  });

  it("parses tags immediately followed by wikilink on next line", () => {
    // Regression: tag followed by wikilink without blank line caused
    // "Invalid code point -4" because isTagChar didn't guard against
    // negative micromark codes (lineFeed = -4).
    const tagThenEmbed = parse("#tag\n![[image.jpg]]");
    const tagNodes = findNodes(tagThenEmbed, "tag");
    expect(tagNodes.length).toBe(1);
    expect(tagNodes[0].value).toBe("tag");
    const wikiNodes = findNodes(tagThenEmbed, "wikilink");
    expect(wikiNodes.length).toBe(1);
    expect(wikiNodes[0].path).toBe("image.jpg");

    const multiTags = parse("#foo #bar\n![[img.png]]");
    const multiTagNodes = findNodes(multiTags, "tag");
    expect(multiTagNodes.map((n: any) => n.value)).toEqual(["foo", "bar"]);
    expect(findNodes(multiTags, "wikilink").length).toBe(1);

    const withBlank = parse("#tag\n\n![[image.jpg]]");
    expect(findNodes(withBlank, "tag").length).toBe(1);
    expect(findNodes(withBlank, "wikilink").length).toBe(1);
  });

  it("parses mixed inline syntax", () => {
    const mixed = parse("Mix [[page]] ==hi== #tag");
    expect(findNodes(mixed, "wikilink").length).toBe(1);
    expect(findNodes(mixed, "highlight").length).toBe(1);
    expect(findNodes(mixed, "tag").length).toBe(1);
  });

  it("respects options", () => {
    const noWiki = parse("[[page]]", { wikilinks: false });
    expect(findNodes(noWiki, "wikilink").length).toBe(0);

    const noHighlight = parse("==hello==", { highlights: false });
    expect(findNodes(noHighlight, "highlight").length).toBe(0);

    const noTags = parse("#tag", { tags: false });
    expect(findNodes(noTags, "tag").length).toBe(0);
  });

  it("parses custom task characters", () => {
    const md = [
      "- [?] question",
      "- [!] important",
      "- [>] forwarded",
      "- [/] partial",
      "- [s] special",
      "- [-] cancelled",
      "- [x] done",
      "- [ ] todo",
    ].join("\n");

    const tree = processWithGfm(md);
    const items = findNodes(tree, "listItem");
    expect(items).toHaveLength(8);

    expect(items[0].checked).toBe(true);
    expect(items[0].data.taskChar).toBe("?");
    expect(items[1].checked).toBe(true);
    expect(items[1].data.taskChar).toBe("!");
    expect(items[2].checked).toBe(true);
    expect(items[2].data.taskChar).toBe(">");
    expect(items[3].checked).toBe(true);
    expect(items[3].data.taskChar).toBe("/");
    expect(items[4].checked).toBe(true);
    expect(items[4].data.taskChar).toBe("s");
    expect(items[5].checked).toBe(true);
    expect(items[5].data.taskChar).toBe("-");

    expect(items[6].checked).toBe(true);
    expect(items[6].data.taskChar).toBe("x");
    expect(items[7].checked).toBe(false);
    expect(items[7].data.taskChar).toBe(" ");

    const getText = (item: any) =>
      findNodes(item, "text")
        .map((n: any) => n.value)
        .join("");
    expect(getText(items[0])).toBe("question");
    expect(getText(items[6])).toBe("done");
    expect(getText(items[7])).toBe("todo");
  });

  it("preserves uppercase X in task checkboxes", () => {
    const md = ["- [X] done uppercase", "- [x] done lowercase"].join("\n");

    const tree = processWithGfm(md);
    const items = findNodes(tree, "listItem");
    expect(items).toHaveLength(2);

    expect(items[0].checked).toBe(true);
    expect(items[0].data.taskChar).toBe("X");
    expect(items[1].checked).toBe(true);
    expect(items[1].data.taskChar).toBe("x");
  });

  it("respects customTaskChars option", () => {
    const md = "- [?] question";
    const disabled = processWithGfm(md, { customTaskChars: false });
    const items = findNodes(disabled, "listItem");
    expect(items[0].checked).toBeNull();
    expect(items[0].data).toBeUndefined();
  });

  it("renders custom task characters as checkboxes in HTML output", async () => {
    const md = [
      "- [?] question",
      "- [!] important",
      "- [x] done",
      "- [ ] todo",
    ].join("\n");

    const html = await toHtml(md);

    expect(html).toContain('class="task-list-item"');
    expect(html).toContain('class="contains-task-list"');

    expect(html).toContain('data-task-char="?"');
    expect(html).toContain('data-task-char="!"');
    expect(html).toContain('data-task-char="x"');
    expect(html).toContain('data-task-char=" "');

    const checkboxCount = (html.match(/type="checkbox"/g) || []).length;
    expect(checkboxCount).toBe(4);

    expect(html).toContain("checked");
  });

  describe("math support", () => {
    it("parses inline math into inlineMath nodes", () => {
      const tree = parse("$x_i$");
      const nodes = findNodes(tree, "inlineMath");
      expect(nodes.length).toBe(1);
      expect(nodes[0].value).toBe("x_i");
    });

    it("parses display math into math nodes", () => {
      const tree = parse("$$\nx_{ij} = y\n$$");
      const nodes = findNodes(tree, "math");
      expect(nodes.length).toBe(1);
      expect(nodes[0].value).toBe("x_{ij} = y");
    });

    it("round-trips inline math without escaping underscores", async () => {
      expect(await toMd("$x_i$")).toBe("$x_i$\n");
    });

    it("round-trips inline math with multiple subscripts", async () => {
      expect(await toMd("$a_{ij} + b_{kl}$")).toBe("$a_{ij} + b_{kl}$\n");
    });

    it("round-trips display math without escaping", async () => {
      const input = "$$\nx_{ij} = y\n$$";
      const result = await toMd(input);
      expect(result).toContain("x_{ij} = y");
      expect(result).not.toContain("\\_");
    });

    it("round-trips inline math with equals sign", async () => {
      expect(await toMd("$a = b$")).toBe("$a = b$\n");
    });

    it("does not parse math when math option is false", () => {
      const tree = parse("$x_i$", { math: false });
      expect(findNodes(tree, "inlineMath").length).toBe(0);
    });
  });

  describe("toMarkdown serialization", () => {
    it("round-trips basic wikilinks", async () => {
      expect(await toMd("[[page]]")).toBe("[[page]]\n");
    });

    it("round-trips wikilinks with alias", async () => {
      expect(await toMd("[[page|display name]]")).toBe(
        "[[page|display name]]\n",
      );
    });

    it("round-trips wikilinks with heading", async () => {
      expect(await toMd("[[page#heading]]")).toBe("[[page#heading]]\n");
    });

    it("round-trips wikilinks with heading and alias", async () => {
      expect(await toMd("[[page#heading|alias]]")).toBe(
        "[[page#heading|alias]]\n",
      );
    });

    it("round-trips embedded wikilinks", async () => {
      expect(await toMd("![[embed]]")).toBe("![[embed]]\n");
    });

    it("round-trips embedded wikilinks with alias", async () => {
      expect(await toMd("![[image.png|alt 100x200]]")).toBe(
        "![[image.png|alt 100x200]]\n",
      );
    });

    it("round-trips block references", async () => {
      expect(await toMd("[[page#^blockref]]")).toBe("[[page#^blockref]]\n");
    });

    it("round-trips heading-only links", async () => {
      expect(await toMd("[[#heading]]")).toBe("[[#heading]]\n");
    });

    it("round-trips highlights", async () => {
      expect(await toMd("==hello==")).toBe("==hello==\n");
    });

    it("round-trips tags", async () => {
      const result = await toMd("hello #tag");
      expect(result).toBe("hello #tag\n");
    });

    it("round-trips mixed inline syntax", async () => {
      const result = await toMd("Mix [[page]] ==hi== #tag");
      expect(result).toBe("Mix [[page]] ==hi== #tag\n");
    });

    it("round-trips unchecked task list items", async () => {
      expect(await toMd("- [ ] unchecked")).toBe("* [ ] unchecked\n");
    });

    it("round-trips checked task list items", async () => {
      expect(await toMd("- [x] checked")).toBe("* [x] checked\n");
    });

    it("round-trips uppercase X task list items", async () => {
      expect(await toMd("- [X] done")).toBe("* [X] done\n");
    });

    it("round-trips custom task characters", async () => {
      const input = "- [/] in progress\n- [-] cancelled\n- [>] forwarded\n";
      const result = await toMd(input);
      expect(result).toContain("[/] in progress");
      expect(result).toContain("[-] cancelled");
      expect(result).toContain("[>] forwarded");
    });

    it("round-trips mixed task and non-task items", async () => {
      const input = "- [ ] task\n- regular\n- [x] done\n";
      const result = await toMd(input);
      expect(result).toContain("[ ] task");
      expect(result).toContain("regular");
      expect(result).toContain("[x] done");
    });

    it("round-trips nested task lists", async () => {
      const input = "- [ ] parent\n    - [x] child\n";
      const result = await toMd(input);
      expect(result).toContain("[ ] parent");
      expect(result).toContain("[x] child");
    });

    it("serializes comments when not stripped", async () => {
      // Use lower-level API: parse with comment syntax but don't run
      // the plugin's tree transform that strips comments
      const processor = unified()
        .use(remarkParse)
        .use(remarkObsidian, { comments: false, customTaskChars: false })
        .use(remarkStringify);

      const data = processor.data();
      const { commentSyntax, commentFromMarkdown, commentToMarkdown } =
        await import("../src/index.js");
      data.micromarkExtensions ??= [];
      data.fromMarkdownExtensions ??= [];
      data.toMarkdownExtensions ??= [];
      data.micromarkExtensions.push(commentSyntax());
      data.fromMarkdownExtensions.push(commentFromMarkdown());
      data.toMarkdownExtensions.push(commentToMarkdown());

      const result = await processor.process("%%hidden%%");
      expect(String(result)).toBe("%%hidden%%\n");
    });

    it("preserves line endings in multiline comment values", async () => {
      const processor = unified()
        .use(remarkParse)
        .use(remarkObsidian, { comments: false, customTaskChars: false })
        .use(remarkStringify);

      const data = processor.data();
      const { commentSyntax, commentFromMarkdown, commentToMarkdown } =
        await import("../src/index.js");
      data.micromarkExtensions ??= [];
      data.fromMarkdownExtensions ??= [];
      data.toMarkdownExtensions ??= [];
      data.micromarkExtensions.push(commentSyntax());
      data.fromMarkdownExtensions.push(commentFromMarkdown());
      data.toMarkdownExtensions.push(commentToMarkdown());

      expect(String(await processor.process("a%%b\nc%%"))).toBe("a%%b\nc%%\n");
      expect(String(await processor.process("a%%b\nc\nd%%"))).toBe(
        "a%%b\nc\nd%%\n",
      );
      expect(String(await processor.process("%%\nblock\ncomment\n%%"))).toBe(
        "%%\nblock\ncomment\n%%\n",
      );
    });
  });

  describe("legacy emphasis", () => {
    function shapes(md: string, opts?: RemarkObsidianOptions): string[] {
      const out: string[] = [];
      visit(parse(md, opts), (node) => {
        if (node.type !== "strong" && node.type !== "emphasis") return;
        let text = "";
        visit(node, (inner) => {
          if (inner.type === "text") text += (inner as { value: string }).value;
        });
        out.push(`${node.type === "strong" ? "strong" : "em"}:${text.trim()}`);
      });
      return out;
    }

    function plainText(md: string, opts?: RemarkObsidianOptions): string {
      let text = "";
      visit(parse(md, opts), (node) => {
        if (node.type === "text") text += (node as { value: string }).value;
      });
      return text;
    }

    // Every expectation below was recorded from Obsidian 1.13.7 via the parity
    // harness; they are the cases where remark-parse@8 and CommonMark disagree.
    it.each([
      ["*a*", ["em:a"]],
      ["**a**", ["strong:a"]],
      ["***a**", ["strong:*a"]],
      ["**a***", ["strong:a*"]],
      ["***a*", ["em:**a"]],
      ["*a***", []],
      ["***a***", ["strong:a", "em:a"]],
      ["a * b * c", ["em:b"]],
      ["a_b_c", []],
      ["a *b* c", ["em:b"]],
      ["_a_", ["em:a"]],
      ["*text**", []],
      ["_text__", []],
      ["**a **b** c**", ["strong:a", "strong:c"]],
      ["*a **b* c**", ["em:a **b"]],
      ["**a\\**", []],
    ])("parses %j the way Obsidian does", (md, expected) => {
      expect(shapes(md as string)).toEqual(expected);
    });

    it("leaves a marker that opens nothing as literal text", () => {
      expect(plainText("a * b")).toBe("a * b");
      expect(plainText("x_y_z")).toBe("x_y_z");
      expect(plainText("a*b")).toBe("a*b");
    });

    it("keeps whitespace at the end of a span", () => {
      expect(plainText("a* b *c")).toBe("a b c");
      expect(plainText("**a **b** c**")).toBe("a b c");
    });

    it("nests strong outside emphasis, inverting CommonMark", () => {
      expect(shapes("***a***")).toEqual(["strong:a", "em:a"]);
      expect(shapes("***a***", { legacyEmphasis: false })).toEqual([
        "em:a",
        "strong:a",
      ]);
    });

    it("restores CommonMark attention when turned off", () => {
      expect(shapes("***a**", { legacyEmphasis: false })).toEqual(["strong:a"]);
      expect(shapes("*text**", { legacyEmphasis: false })).toEqual(["em:text"]);
    });
  });
});
