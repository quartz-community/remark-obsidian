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
import { legacyHighlightQueue } from "../src/lib/syntax/highlight.js";

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

/**
 * Like `findNodes`, but blind to what a `%%` comment contains.
 *
 * A comment's body is parsed into children on purpose, so it *is* in the tree
 * and a plain walk finds it. What "hidden" means is that none of it reaches the
 * reader, so an assertion about hiding has to ask the question the renderer
 * asks: everything outside a comment.
 */
function findRendered(tree: any, type: string): any[] {
  const results: any[] = [];
  function walk(node: any) {
    if (node.type === "comment") return;
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
      findRendered(single, "text")
        .map((n: any) => n.value)
        .join(" "),
    ).not.toContain("comment");

    const multi = processWithGfm("%%multi\nline%%");
    expect(findNodes(multi, "comment").length).toBeGreaterThan(0);
  });

  it("records how many characters each line's containers consume", () => {
    const table = (md: string, opts?: RemarkObsidianOptions) =>
      (processWithGfm(md, opts) as any).data?.lineOffsets;

    // A continuation line re-states the prefix without starting any node, so
    // no node position carries its width -- which is the reason this exists.
    expect(table("> - a\n>   b\n")).toEqual({ 1: 4, 2: 4 });

    // Nested list indentation, including the line that is only indent.
    expect(table("- x\n  - y\n    z\n")).toEqual({ 1: 2, 2: 4, 3: 4 });

    // Nested quotes contribute one prefix each on the same line.
    expect(table(">> deep\n")).toEqual({ 1: 3 });

    // An ordered marker is as wide as it is written.
    expect(table("1. one\n   cont\n")).toEqual({ 1: 3, 2: 3 });

    // Indenting a paragraph at the top level is content, not a container, so
    // the line is absent rather than zero.
    expect(table("plain\n\n   indented para\n")).toEqual({});

    expect(table("> - a\n", { lineOffsets: false })).toBeUndefined();
  });

  it("splits each line at its recorded offset", () => {
    // The table's contract: slicing a line at its offset separates the
    // containers from the content.
    const source = "> - a\n>   b\n\n- x\n  - y\n    z\n";
    const offsets = (processWithGfm(source) as any).data.lineOffsets;
    const lines = source.split("\n");
    const content = Object.entries(offsets).map(([line, width]) =>
      (lines[Number(line) - 1] ?? "").slice(Number(width)),
    );
    expect(content).toEqual(["a", "b", "x", "y", "z"]);
  });

  it("parses a comment's body into placed children", () => {
    const source = "a %%note [^1] **b**%% c\n\n[^1]: d\n";
    const [inline] = findNodes(processWithGfm(source), "comment");
    // Inline, so the body is phrasing and sits where the comment sits rather
    // than being wrapped in a block it does not occupy.
    expect(inline.children.map((c: any) => c.type)).toEqual([
      "text",
      "footnoteReference",
      "text",
      "strong",
    ]);
    expect(inline.value).toBe("note [^1] **b**");

    const [reference] = findNodes(inline, "footnoteReference");
    const { start, end } = reference.position;
    // The position has to be the document's, not the fragment's: a consumer
    // placing an edit reads the source back through it.
    expect(source.slice(start.offset, end.offset)).toBe("[^1]");

    const quoted = "> %%\n> quoted [^1]\n> %%\n\n[^1]: d\n";
    const [inQuote] = findNodes(processWithGfm(quoted), "comment");
    // Every line after the first carries a `> ` that is not part of the body,
    // so a constant shift would misplace this by a growing amount.
    const nested = findNodes(inQuote, "footnoteReference")[0].position;
    expect(quoted.slice(nested.start.offset, nested.end.offset)).toBe("[^1]");

    const off = processWithGfm(source, { parseComments: false });
    const [plain] = findNodes(off, "comment");
    expect(plain.children).toBeUndefined();
    expect(plain.value).toBe("note [^1] **b**");
  });

  it("does not let a definition inside a comment define", async () => {
    // Obsidian indexes a *reference* written in a comment but a definition
    // inside one binds nothing, so the reference stays undefined and renders
    // as its bare label.
    const tree = processWithGfm("%%\n[^1]: buried\n%%\ntext[^1] ref\n");
    expect(findNodes(tree, "footnoteDefinition")).toHaveLength(0);
    // A comment's body is read as inline text, so the label is a REFERENCE, placed where
    // `metadataCache` reports one -- the referee corpus's asymmetry (a label inside `%%` is
    // indexed as a reference), and what lets a consumer find it.
    const [comment] = findNodes(tree, "comment");
    expect(findNodes(comment, "footnoteReference")).toHaveLength(1);
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
    const paragraphs = findRendered(block, "paragraph");
    const texts = paragraphs.flatMap((p: any) =>
      findRendered(p, "text").map((n: any) => n.value),
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
    const texts = findRendered(tree, "text").map((n: any) => n.value);
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

  it("keeps a reference nothing defines, rather than baring it in the tree", () => {
    const tree = processWithGfm("see [^gone]\n");
    const refs = findNodes(tree, "footnoteReference");
    expect(refs.length).toBe(1);
    expect(refs[0].identifier).toBe("gone");
    expect(findNodes(tree, "text")[0].value).toBe("see ");
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

  it("lowercases the identifier of a reference nothing defines, keeping the label", () => {
    const tree = processWithGfm("x [^Cell] y\n");
    const ref = findNodes(tree, "footnoteReference")[0];
    expect(ref.identifier).toBe("cell");
    expect(ref.label).toBe("Cell");
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
    // The heading keeps the raw line. The reference stays a node, so the
    // heading reads `1: x` only once a renderer bares it.
    expect(heading[0].children[0].type).toBe("footnoteReference");
    expect(heading[0].children[0].identifier).toBe("1");
    expect(heading[0].children[1].value).toBe(": x");
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

  it("folds a definition whose body spans several blocks", () => {
    // The fence inside the definition makes its body two blocks, which has no
    // inline form to splice; Obsidian just reads the whole thing as prose.
    const tree = processWithGfm(
      "prose\n[^1]: lazy label\n    ```\nlive[^9] text\n",
    );
    expect(rootTypes(tree)).toEqual(["paragraph"]);
    expect(findNodes(tree, "footnoteDefinition").length).toBe(0);
  });

  it("lets a tab continue a definition inside a quote", () => {
    const tree = processWithGfm(
      "para.\n\n> [^9]: stray\n>\n>\tbody cites[^b]\n\n[^b]: bee\n",
    );
    const quoted = findNodes(tree, "footnoteDefinition")[0];
    expect(quoted.children.length).toBe(2);
    // Inside the definition it renders in the footnote list, not the body.
    expect(findNodes(tree, "paragraph").length).toBe(4);
  });

  describe("residue left by an earlier pass", () => {
    it("follows a recovered definition with its references", () => {
      // The frontmatter mis-parse labelled the definition `^1`, so `[^1]`
      // elsewhere resolved against it as a link reference rendering as `^1`.
      const tree = processWithGfm(
        "---\nfootnote-prefix: 2.\n...\nbody[^1]\n\n[^1]: d\n",
      );
      expect(findNodes(tree, "linkReference").length).toBe(0);
      expect(findNodes(tree, "footnoteReference").length).toBe(1);
    });

    it("merges two quotes with nothing between them", () => {
      const tree = processWithGfm(
        "> closing words[^1]\n[^9]: orphan\n> ---\n\n[^1]: used\n",
      );
      expect(rootTypes(tree)).toEqual(["blockquote", "footnoteDefinition"]);
    });

    it("keeps quotes separated by a blank line apart", () => {
      expect(rootTypes(processWithGfm("> a\n\n> b\n"))).toEqual([
        "blockquote",
        "blockquote",
      ]);
    });
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

    it("absorbs a math block opened on a lazy line", () => {
      expect(rootTypes(processWithGfm("- item\nx $$\n$$ tail\n"))).toEqual([
        "list",
      ]);
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

    it("keeps a one-line heading over a definition", () => {
      expect(rootTypes(processWithGfm("H\n===\n[^1]: real\n"))).toEqual([
        "heading",
        "footnoteDefinition",
      ]);
    });

    it("merges a multi-line one into the paragraph", () => {
      expect(rootTypes(processWithGfm("para\nmore\n===\n[^2]: b\n"))).toEqual([
        "paragraph",
      ]);
    });

    it("measures content from the children, not the reported start", () => {
      // micromark reports a setext heading starting at the block before it, so
      // this one claims to begin inside the definition it never contained.
      expect(
        rootTypes(processWithGfm("[ref]: /url\npara\n===\n[^1]: x\n")),
      ).toEqual(["definition", "heading", "footnoteDefinition"]);
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

  describe("a `$$` ending a line inside a container", () => {
    it("opens a block in a quote but not at the document level", () => {
      // Display math whose tex keeps its line endings, as Obsidian records it
      // (`math/midline-quote`: display, tex "\nx\n").
      const [quoted] = findNodes(
        processWithGfm("> tail $$\n> x\n> $$\n"),
        "inlineMath",
      );
      expect(quoted.value).toBe("\nx\n");
      expect(quoted.data.display).toBe(true);
      // At root the same three lines stay prose plus an empty formula.
      expect(
        findNodes(processWithGfm("tail $$\nx\n$$\n"), "math")[0].value,
      ).toBe("");
    });

    it("reaches an opener inside a definition nested in a quote", () => {
      const tree = processWithGfm("> [^1]: def\n> tail $$\n> x\n> $$\n");
      const definition = findNodes(tree, "footnoteDefinition")[0];
      // Inside the definition, so an unreferenced one hides it as Obsidian does.
      expect(findNodes(definition, "inlineMath").length).toBe(1);
    });
  });

  describe("display math delimiter width", () => {
    it("opens an empty span for an over-long `$$` run", () => {
      // Obsidian pairs `$$` with the very next `$$`, so this is empty math
      // followed by literal text rather than a formula.
      const tree = processWithGfm("$$$$x^2$$\n");
      expect(
        findNodes(tree, "text")
          .map((n) => n.value)
          .join(""),
      ).toContain("x^2");
    });

    it("still parses an ordinary display span", () => {
      const tree = processWithGfm("$$x^2$$\n");
      expect(
        findNodes(tree, "text")
          .map((n) => n.value)
          .join(""),
      ).not.toContain("x^2");
    });
  });

  describe("table delimiter width", () => {
    it("builds a table and keeps every header cell", () => {
      const tree = processWithGfm("| a | b |\n| --- |\n[^1]: x\n");
      expect(rootTypes(tree)).toEqual(["table", "footnoteDefinition"]);
      // A short delimiter supplies alignment, it does not drop a column: a
      // real Reading View renders both cells. The detached renderer the
      // recorder uses shows one, which is a rendering difference.
      expect(findNodes(tree, "tableCell").length).toBe(2);
    });

    it("leaves a matching header and delimiter to the parser", () => {
      const tree = processWithGfm("| a | b |\n| --- | --- |\n");
      expect(findNodes(tree, "tableCell").length).toBe(2);
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
      // The quoted comment ends with its quote (F2), so the root label defines...
      expect(rootTypes(tree)).toEqual([
        "paragraph",
        "blockquote",
        "footnoteDefinition",
      ]);
      // ...and the buried one is read as a reference, as `metadataCache` indexes it.
      const [comment] = findNodes(tree, "comment");
      expect(findNodes(comment, "footnoteReference").length).toBe(1);
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

    it("keeps scanning past a closer that would end in whitespace", () => {
      // Stopping at the first `==` leaves `=\n[^2]: b\n`, which ends in a
      // newline; carrying on takes the next `=` into the content and lands on
      // a closer that does not. Leading whitespace has no such remedy.
      expect(legacyHighlightQueue("===\n[^2]: b\n===")).toBe("=\n[^2]: b\n=");
      expect(legacyHighlightQueue("== text==")).toBe(null);
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
    const quote = findNodes(tree, "blockquote")[0];
    expect(findNodes(quote, "footnoteReference")[0].identifier).toBe("q");
    expect(
      findNodes(quote, "text")
        .map((n) => n.value)
        .join(""),
    ).toContain(": quoted under prose");
  });

  it("re-tokenizes a delimiter a fold pulled into a paragraph", () => {
    // The `===` lines arrive after inline tokenizing has run, so the `==`
    // highlight across them is only found by re-tokenizing the fold.
    const tree = processWithGfm("para\n[^1]: a\n===\n[^2]: b\n===\n[^3]: c\n");
    expect(findNodes(tree, "highlight").length).toBe(1);
  });

  it("leaves a paragraph the tokenizer already judged alone", () => {
    const tree = processWithGfm("a == b\nc == d\n");
    expect(findNodes(tree, "highlight").length).toBe(0);
  });

  it("absorbs an indented continuation into a definition split off a closer", () => {
    const tree = processWithGfm("%%\nx\n%% [^1]: body\n\n    more\n");
    expect(findNodes(tree, "code").length).toBe(0);
    const [definition] = findNodes(tree, "footnoteDefinition");
    expect(findNodes(definition, "text").map((n: any) => n.value)).toContain(
      "more",
    );
  });

  it("leaves an unclosed fence after a definition where it is", () => {
    const tree = processWithGfm("[^1]: def\n\n```\nfake\n");
    expect(findNodes(tree, "code").length).toBe(1);
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

  it("spans the title and the body where they really are", () => {
    const source = "> [!note] Title\n> Body";
    const [callout] = findNodes(processWithGfm(source), "callout");
    const slice = (n: any) =>
      source.slice(n.position.start.offset, n.position.end.offset);
    const [titleNode] = findNodes(callout, "calloutTitle");
    const body = callout.children.find((c: any) => c.type === "paragraph");
    expect(slice(titleNode)).toBe("Title");
    expect(slice(body)).toBe("Body");
  });

  it("spans the body correctly when the callout is nested in a list", () => {
    const source = "- item\n  > [!note]\n  > body";
    const [callout] = findNodes(processWithGfm(source), "callout");
    const body = callout.children.find((c: any) => c.type === "paragraph");
    expect(
      source.slice(body.position.start.offset, body.position.end.offset),
    ).toBe("body");
  });

  it.each([
    [">[!note] T\n> b\n", true, "one space is the most a marker may follow"],
    [">  [!note] T\n> b\n", false, "two spaces put it past the marker column"],
    [
      "> [!note]x\n> y\n",
      false,
      "the marker must end the line or be followed by space",
    ],
    ["> [!note]-x\n> a\n", false, "a fold marker needs the same boundary"],
    ["> [! note]\n> a\n", true, "the type may hold inner whitespace"],
    ["> [!]\n> x\n", false, "the type may not be empty"],
    ["> [!note]\n> b\n", true, "a titleless marker ends the line"],
  ])("%s is a callout: %s", (markdown, expected) => {
    expect(findNodes(processWithGfm(markdown), "callout").length > 0).toBe(
      expected,
    );
  });

  it.each([
    ["%% 50%\nstill text\n", false, "a stray percent disqualifies the opener"],
    ["%%%\ntext\n", false, "so does a third percent"],
    ["%%\nhidden\n%%\n", true, "a clean opener still opens"],
    ["> %%\n> hidden\n> %%\n", true, "container prefixes come first"],
  ])("%s opens a block comment: %s", (markdown, expected) => {
    expect(findNodes(processWithGfm(markdown), "comment").length > 0).toBe(
      expected,
    );
  });

  it.each([
    [" | a |\n| --- |\n", false, "a leading space means no pipe"],
    ["| a |\n | --- |\n", false, "the delimiter must match the header"],
    ["| a |\n| --- |\n", true, "agreeing rows build a table"],
    [
      "> [!note]\n> | a |\n> | --- |\n",
      true,
      "a container prefix is not content",
    ],
  ])("%s builds a table: %s", (markdown, expected) => {
    expect(findNodes(processWithGfm(markdown), "table").length > 0).toBe(
      expected,
    );
  });

  it.each([
    ["> [!note] [^1]: x\n", "the remainder is a definition, so no title"],
    ["- > [!note] [^1]: x\n", "a list marker is container prefix too"],
    ["> > [!note] [^1]: x\n", "and so is a second quote level"],
  ])("%s makes the title line a block", (markdown) => {
    const tree = processWithGfm(markdown);
    expect(findNodes(tree, "callout").length).toBe(1);
    expect(findNodes(tree, "footnoteDefinition").length).toBe(1);
  });

  it("still reads a prose remainder as the title", () => {
    const [callout] = findNodes(
      processWithGfm("> [!note] Title\n> B\n"),
      "callout",
    );
    expect(callout.title).toBe("Title");
    expect(findNodes(callout, "footnoteDefinition").length).toBe(0);
  });

  it("makes a footnote reference inside an inline note inert", () => {
    const tree = processWithGfm("^[see [^1]]\n\n[^1]: x\n");
    const [note] = findNodes(tree, "footnote");
    expect(findNodes(note, "footnoteReference").length).toBe(0);
    expect(
      findNodes(note, "text")
        .map((n: any) => n.value)
        .join(""),
    ).toContain("[^1]");
  });

  it("leaves a reference outside an inline note alone", () => {
    const tree = processWithGfm("see [^1]\n\n[^1]: x\n");
    expect(findNodes(tree, "footnoteReference").length).toBe(1);
  });

  it("closes frontmatter on a fence that carries a tail", () => {
    const tree = processWithGfm("---\na: b\n---[^2]: x\n");
    expect(rootTypes(tree)).toEqual(["yaml", "footnoteDefinition"]);
    expect(findNodes(tree, "thematicBreak").length).toBe(0);
  });

  it("parses the tail as markdown", () => {
    expect(rootTypes(processWithGfm("---\na: b\n--- trailing\n"))).toEqual([
      "yaml",
      "paragraph",
    ]);
  });

  it("leaves a bare closing fence to the extension", () => {
    expect(rootTypes(processWithGfm("---\na: b\n---\n\nBody\n"))).toEqual([
      "yaml",
      "paragraph",
    ]);
  });

  it("does not let a %% end a footnote definition", () => {
    const tree = processWithGfm("[^1]: a\n%%\nb\n");
    expect(rootTypes(tree)).toEqual(["footnoteDefinition"]);
    // The `%%` opens a comment INSIDE the definition (D5, F2), which is how Obsidian reads
    // `fuzz:20261003-711`: the label under such a `%%` is indexed as a reference.
    const [definition] = findNodes(tree, "footnoteDefinition");
    expect(findNodes(definition, "comment").length).toBe(1);
  });

  it("still opens a comment after a blank line", () => {
    const tree = processWithGfm("[^1]: a\n\n%%\nb\n%%\n");
    expect(findNodes(tree, "comment").length).toBe(1);
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

  it("keeps a reference whose definition was folded away", () => {
    // GFM binds references while parsing, so the node survives the fold that
    // turns the definition into lazy continuation. Obsidian never saw a
    // definition there and renders the bare name -- but that is the renderer's
    // job. Baring it here would rewrite `[^1]` to `1` in the tree, and a
    // formatter serialising that writes the loss back into the file.
    const tree = processWithGfm("para\n[^1]: a\n\nx[^1]");
    expect(findNodes(tree, "footnoteDefinition").length).toBe(0);
    expect(
      findNodes(tree, "footnoteReference").map((n: any) => n.identifier),
    ).toEqual(["1", "1"]);
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

  it("keeps both lines of a highlight, its line ending a positioned break", () => {
    // `parse` alone already returns the finished legacy tree: remark-parse 8 reads the break.
    const [node] = findNodes(parse("==a\nb=="), "highlight");
    expect(node.children.map((c: any) => c.type)).toEqual([
      "text",
      "break",
      "text",
    ]);
    expect(node.children[1].position.start.offset).toBe(3);
  });

  it("does not treat a currency amount as inline math", () => {
    expect(findNodes(parse("$5 and $10"), "inlineMath").length).toBe(0);
    expect(findNodes(parse("costs $20,000 today"), "inlineMath").length).toBe(
      0,
    );
    expect(findNodes(parse("text $x^2$ text"), "inlineMath").length).toBe(1);
  });

  it("does not pair a mid-line %% with one on a later line", () => {
    // F1: `x %%` is no opener, and an inline pair closes on its own line. Obsidian renders
    // `callout/title-comment-crosses-body`'s `T %%` / `hidden` as text for the same reason.
    const block = processWithGfm("before a%%\nhidden\nmore hidden%% after");
    expect(findNodes(block, "comment").length).toBe(0);
    const texts = findRendered(block, "text").map((n: any) => n.value);
    expect(texts.join(" ")).toContain("before a%%");
    expect(texts.join(" ")).toContain("hidden");
  });

  it("keeps text following a mid-line %% intact", () => {
    const tree = processWithGfm("start %%c1\nc2\nc3%% [[link]] end");
    expect(findNodes(tree, "comment").length).toBe(0);
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
      expect(shapes("***a***", { preset: "strict" })).toEqual([
        "em:a",
        "strong:a",
      ]);
    });

    it("follows CommonMark attention under the strict preset", () => {
      expect(shapes("***a**", { preset: "strict" })).toEqual(["strong:a"]);
      expect(shapes("*text**", { preset: "strict" })).toEqual(["em:text"]);
    });
  });
});

describe("reparse recursion", () => {
  /**
   * A pass that locates a body by matching a marker hands back the text it was
   * given when the match fails, and the chain then re-enters itself on identical
   * input. `taskReparseTransform` does that for a nested item whose paragraph
   * already starts past its own marker.
   *
   * Found by sweeping the fuzz generator: 55 of 4000 documents overflowed the
   * stack, 37 frames deep. The depth bound in `reparse` is what stops it, and a
   * crash is worse than any divergence, so this guards the invariant directly
   * rather than through the parity corpus.
   */
  it("does not overflow the stack on a self-reproducing fragment", () => {
    const markdown =
      "- [ ] [[target]]\n" +
      "- [ ] [[a#^blk\na#^blk]] [[a#h\\]]](<https://e.test>\t\\$$y^2$$\n" +
      "- [ ] [\\![[d.pdf#page=3]]](u)\n" +
      "===\n";
    expect(() => processWithGfm(markdown)).not.toThrow();
  });

  it("still nests the blocks a task body reparses into", () => {
    const tree = processWithGfm("- [ ] 1.\n");
    const kinds: string[] = [];
    visit(tree, (node) => {
      kinds.push(node.type);
    });
    expect(kinds).toContain("list");
  });
});

describe("legacy autolinks", () => {
  const links = (md: string) => {
    const found: { url: string; text: string }[] = [];
    visit(processWithGfm(md), "link", (node: any) => {
      found.push({
        url: node.url,
        text: (node.children ?? []).map((c: any) => c.value).join(""),
      });
    });
    return found;
  };

  it("keeps a backslash inside an email autolink", () => {
    expect(links("<foo\\+@bar.example.com>")).toEqual([
      {
        url: "mailto:foo\\+@bar.example.com",
        text: "foo\\+@bar.example.com",
      },
    ]);
  });

  /**
   * The reason this is on by default. CommonMark escapes the `b`, leaves `<a\` as
   * text, and GFM then autolinks the remaining `b@c.test` -- a working link to an
   * address that is not in the document. Runs with gfm registered because that
   * bare-email extension is what makes the wrong link reachable.
   */
  it("does not leave a bare email behind after an escape", () => {
    expect(links("<a\\b@c.test>")).toEqual([
      { url: "mailto:a\\b@c.test", text: "a\\b@c.test" },
    ]);
  });

  it("does not let a backslash escape the closing bracket", () => {
    // `<a\>b>` ends its first run at the `>`, which is neither `@` nor `://`,
    // so legacy forms no autolink either and the line stays literal.
    expect(links("<a\\>b>")).toEqual([]);
  });

  it("leaves every autolink without a backslash to micromark", () => {
    expect(links("<a@b.test>")).toEqual([
      { url: "mailto:a@b.test", text: "a@b.test" },
    ]);
    expect(links("<https://e.test/a\\+b>")).toEqual([
      { url: "https://e.test/a\\+b", text: "https://e.test/a\\+b" },
    ]);
    expect(links("<not a url>")).toEqual([]);
    expect(links("<>")).toEqual([]);
  });

  // `legacy` parses with remark-parse 8; the CommonMark reading is `strict`'s.
  it("follows CommonMark under the strict preset", () => {
    const off = (md: string) => {
      const found: string[] = [];
      visit(processWithGfm(md, { preset: "strict" }), "link", (n: any) => {
        found.push(n.url);
      });
      return found;
    };
    // Not "no link": CommonMark escapes the plus, the brackets stay literal, and
    // GFM then autolinks the bare email inside them. The backslash is what is lost.
    const urls = off("<foo\\+@bar.example.com>");
    expect(urls).toContain("mailto:foo+@bar.example.com");
    expect(urls.every((url) => !url.includes("\\"))).toBe(true);
  });
});

describe("legacy code spans", () => {
  const code = async (md: string, opts?: RemarkObsidianOptions) =>
    (await toHtml(md, { wikilinks: false, highlights: false, ...opts }))
      .trim()
      .replace(/\n/g, "");

  it("retries a wider opener against a shorter closer", async () => {
    // One backtick is shed, and it renders as itself.
    expect(await code("``code`")).toBe("<p>`<code>code</code></p>");
    // The opener drops straight to the closer's width rather than by one.
    expect(await code("```code`")).toBe("<p>``<code>code</code></p>");
  });

  /**
   * The asymmetry that makes this a rule: an opener shrinks, never grows. Without
   * it the retry would happily "fix" input Obsidian leaves alone.
   */
  it("never grows a short opener", async () => {
    expect(await code("`code``")).toBe("<p>`code``</p>");
    expect(await code("`code```")).toBe("<p>`code```</p>");
  });

  /**
   * The first control to check, because an exact-width closer must outrank the
   * retry even when a shorter run appears earlier. Here the width-2 closer sits
   * after a width-1 run, so a retry that fired on the first candidate it saw
   * would produce a code span holding `a` and lose the rest.
   */
  it("prefers an exact-width closer over a retry", async () => {
    expect(await code("``a` and ``b`")).toBe("<p><code>a` and </code>b`</p>");
    expect(await code("`a``b`")).toBe("<p><code>a``b</code></p>");
    expect(await code("``a`b``")).toBe("<p><code>a`b</code></p>");
  });

  /**
   * The property that decides this belongs in the tokenizer. A repair pass over
   * the tree would meet an `emphasis` node that must not exist, because the span
   * shields its own body.
   */
  it("shields the retried span's body from other constructs", async () => {
    expect(await code("``a *b* c`")).toBe("<p>`<code>a *b* c</code></p>");
    expect(await code("``a&amp;b`")).toBe("<p>`<code>a&#x26;amp;b</code></p>");
    expect(await code("``a\\b`")).toBe("<p>`<code>a\\b</code></p>");
  });

  /**
   * The line ending is consumed inside the span, so it becomes a space rather
   * than reaching `breakPositionsTransform` and turning into a `break`.
   */
  it("keeps a line ending inside a retried span", async () => {
    expect(await code("``a\nb`")).toBe("<p>`<code>a b</code></p>");
    expect(await code("``a\r\nb`")).toBe("<p>`<code>a b</code></p>");
    expect(await code("> ``a\n> b`")).toBe(
      "<blockquote><p>`<code>a b</code></p></blockquote>",
    );
  });

  it("leaves stock padding and normalisation alone", async () => {
    expect(await code("`` a ``")).toBe("<p><code>a</code></p>");
    expect(await code("`` ` ``")).toBe("<p><code>`</code></p>");
    expect(await code("` `` `")).toBe("<p><code>``</code></p>");
    expect(await code("` foo `` bar `")).toBe("<p><code>foo `` bar</code></p>");
    expect(await code("`a\nb`")).toBe("<p><code>a b</code></p>");
  });

  it("leaves a run with no usable closer literal", async () => {
    expect(await code("`code")).toBe("<p>`code</p>");
    expect(await code("`")).toBe("<p>`</p>");
    expect(await code("``")).toBe("<p>``</p>");
  });

  it("retries in every context, since the rule is context-free", async () => {
    expect(await code("*``code`*")).toBe("<p><em>`<code>code</code></em></p>");
    expect(await code("**``code`**")).toBe(
      "<p><strong>`<code>code</code></strong></p>",
    );
    expect(await code("# ``code`")).toBe("<h1>`<code>code</code></h1>");
    expect(await code("- ``code`")).toBe(
      "<ul><li>`<code>code</code></li></ul>",
    );
  });

  // `legacy` parses with remark-parse 8; the CommonMark reading is `strict`'s.
  it("follows CommonMark under the strict preset", async () => {
    expect(await code("``code`", { preset: "strict" })).toBe("<p>``code`</p>");
  });
});

describe("footnote definition lazy continuation", () => {
  const blocks = (md: string) =>
    (processWithGfm(md) as any).children.map((c: any) => c.type);

  /**
   * Lazy continuation needs an open paragraph to continue, and a definition whose
   * first line is empty or a bare container opener has none -- so micromark ends
   * the definition and leaves the next line behind as a sibling.
   */
  it("takes the next line into a definition that opened nothing", () => {
    expect(blocks("[^1]: \nb\n")).toEqual(["footnoteDefinition"]);
    expect(blocks("[^1]: >\nb\n")).toEqual(["footnoteDefinition"]);
    expect(blocks("[^1]: -\nb\n")).toEqual(["footnoteDefinition"]);
    expect(blocks("[^1]: > >\nb\n")).toEqual(["footnoteDefinition"]);
  });

  it("leaves alone what already continues", () => {
    expect(blocks("[^1]: one\nb\n")).toEqual(["footnoteDefinition"]);
    expect(blocks("[^1]: > x\nb\n")).toEqual(["footnoteDefinition"]);
    expect(blocks("[^1]: - x\nb\n")).toEqual(["footnoteDefinition"]);
  });

  it("stops at a blank line", () => {
    expect(blocks("[^1]: one\n\nb\n")).toEqual([
      "footnoteDefinition",
      "paragraph",
    ]);
    expect(blocks("[^1]: >\n\nb\n")).toEqual([
      "footnoteDefinition",
      "paragraph",
    ]);
  });

  /**
   * Only a paragraph. Widening this to any block gains nothing and breaks 16 parity
   * cases, because an interrupting block genuinely ends a definition.
   */
  it("does not absorb an interrupting block", () => {
    expect(blocks("[^1]: >\n# h\n")).toEqual(["footnoteDefinition", "heading"]);
    expect(blocks("[^1]: >\n[^2]: x\n")).toEqual([
      "footnoteDefinition",
      "footnoteDefinition",
    ]);
  });
});

describe("empty list item continuation", () => {
  const shape = (md: string) => {
    const f = (n: any): string => {
      const kids = (n.children ?? []).map(f).join(" ");
      return n.type + (kids ? `(${kids})` : "");
    };
    return (processWithGfm(md) as any).children.map(f).join(" + ");
  };

  /**
   * CommonMark says an empty list item takes no further content -- cmark's example
   * 280 reads this as a list *and* a paragraph. Obsidian reads one list.
   */
  it("absorbs an indented block after a blank line", () => {
    expect(shape("-\n\n  foo\n")).toBe("list(listItem(paragraph(text)))");
    expect(shape("- \n\n  foo\n")).toBe("list(listItem(paragraph(text)))");
    expect(shape("-\n\n\n  foo\n")).toBe("list(listItem(paragraph(text)))");
    expect(shape("1.\n\n   foo\n")).toBe("list(listItem(paragraph(text)))");
  });

  /**
   * Dedented by the item's content column, so what was an indented code block at
   * root becomes the paragraph it is inside the item.
   */
  it("reparses the block at the item's content column", () => {
    expect(shape("-\n\n    deep\n")).toBe("list(listItem(paragraph(text)))");
  });

  it("needs the indent to reach the content column", () => {
    expect(shape("-\n\nfoo\n")).toBe("list(listItem) + paragraph(text)");
  });

  /** A list rule, not a container rule: both quote forms are left alone. */
  it("does not touch a blockquote", () => {
    expect(shape(">\n\nfoo\n")).toBe("blockquote + paragraph(text)");
  });

  it("leaves alone an item that already has content", () => {
    expect(shape("- a\n\n  foo\n")).toBe(
      "list(listItem(paragraph(text) paragraph(text)))",
    );
    expect(shape("-\n\n- b\n")).toBe(
      "list(listItem listItem(paragraph(text)))",
    );
  });
});

describe("short indent with a tab", () => {
  const spans = (md: string) =>
    (processWithGfm(md) as any).children.map(
      (c: any) =>
        `${c.type}@${c.position?.start?.offset}..${c.position?.end?.offset}`,
    );

  /**
   * `remark-parse@8` does not count a tab that follows a space, so one to three
   * spaces plus a tab is content rather than indented code. The block is re-parsed
   * without that whitespace, and it has to be placed back *past* it.
   *
   * A footnote DEFINITION is the exception, and it is the arbiter losing to an oracle.
   * ` \t[^1]: def` was asserted at offset 2 on the arbiter's reading; real Obsidian
   * reports a definition at its containing block's content column, which is 0 at root,
   * and the referee corpus carries 106 tab-prefixed rows saying so -- `  \t[^ä]:
   * Definition` is column 0 there. Honouring it moved 25 of those documents into
   * agreement with no parity regressions. The legacy stack is an arbiter, not an oracle;
   * where the two disagree the recorded Obsidian answers win.
   *
   * The paragraph rows above are untouched, so the placement rule itself still holds --
   * only this node type overrides it.
   */
  it("starts the paragraph at its line, as Obsidian places it", () => {
    // Obsidian reports an indented paragraph from its line's start (`compute` gives ` ^blk`
    // `paragraph@0:0`), which is where remark-parse 8 starts the node.
    expect(spans("  \tfoo\n")).toEqual(["paragraph@0..6"]);
    expect(spans("   \tfoo\n")).toEqual(["paragraph@0..7"]);
    expect(spans("  \tfoo\tbaz\t\tbim\n")).toEqual(["paragraph@0..15"]);
    expect(spans(" \t[^1]: def\n")).toEqual(["footnoteDefinition@0..11"]);
  });

  it("leaves real indented code alone", () => {
    expect(spans("\tfoo\n")).toEqual(["code@0..4"]);
    expect(spans("    foo\n")).toEqual(["code@0..7"]);
  });
});

describe("footnote reference labels", () => {
  const refs = (md: string) => {
    const found: string[] = [];
    // A block body on purpose: `found.push` returns a number, and
    // `unist-util-visit` reads a numeric return as the index to continue from, so
    // an expression body makes it revisit and report every node twice.
    visit(processWithGfm(md), "footnoteReference", (n: any) => {
      found.push(
        `${n.identifier}@${n.position?.start?.offset}..${n.position?.end?.offset}`,
      );
    });
    return found;
  };

  /**
   * Obsidian parses nothing inside a reference's label, so the label is whatever the
   * source holds. We let it tokenise, and whatever formed there took the closing
   * bracket out of reach -- leaving no reference at all rather than a wrong one.
   */
  it("rejoins a reference a construct split apart", () => {
    expect(refs("[^%%note%%]\n")).toEqual(["%%note%%@0..11"]);
    expect(refs("[^==mark==]\n")).toEqual(["==mark==@0..11"]);
    expect(refs("[^<br>]\n")).toEqual(["<br>@0..7"]);
    expect(refs("[^$x$]\n")).toEqual(["$x$@0..6"]);
    expect(refs("([^_under_]\n")).toEqual(["_under_@1..11"]);
  });

  it("leaves an ordinary reference alone", () => {
    expect(refs("[^1]\n")).toEqual(["1@0..4"]);
    expect(refs("a[^1]b\n\n[^1]: d\n")).toEqual(["1@1..5"]);
  });

  /**
   * A label *may* hold a bracket, and it runs to the first `]` rather than being
   * balance-scanned -- so this is a reference to `![[img.png` with `]]` left as
   * text. `bracketLabelReferences` owns that reading; the pass above only rejoins a
   * run some construct split.
   */
  it("claims a label containing brackets, up to the first bracket", () => {
    expect(refs("[^![[img.png]]]\n")).toEqual(["![[img.png@0..13"]);
  });
});

describe("wikilink whitespace", () => {
  const parts = (md: string) => {
    const found: string[] = [];
    visit(processWithGfm(md), "wikilink", (n: any) => {
      found.push(`${n.path}|${n.heading}|${n.alias}`);
    });
    return found;
  };

  /**
   * Obsidian trims the inner text once, as a whole, and splits afterwards -- so the
   * first part present loses only its leading whitespace and the last only its
   * trailing. Trimming each part separately ate two spaces Obsidian keeps.
   */
  it("trims the inner text as a whole", () => {
    expect(parts("[[  Note  #^id  ]]\n")).toEqual(["Note  |^id|"]);
    expect(parts("[[a#  h  ]]\n")).toEqual(["a|  h|"]);
    expect(parts("[[  a  |  b  ]]\n")).toEqual(["a  ||  b"]);
  });

  /** A lone path is both first and last, so it is trimmed at both ends. */
  it("still trims a lone path at both ends", () => {
    expect(parts("[[ page ]]\n")).toEqual(["page||"]);
    expect(parts("[[ ]]\n")).toEqual(["||"]);
  });

  it("keeps the trailing-backslash rule", () => {
    expect(parts("[[target\\]]\n")).toEqual(["target||"]);
    expect(parts("[[a#^blk\\]]\n")).toEqual(["a|^blk|"]);
  });
});

describe("demoted setext heading content", () => {
  const shape = (md: string) => {
    const f = (n: any): string => {
      const kids = (n.children ?? []).map(f).join(" ");
      return n.type + (kids ? `(${kids})` : "");
    };
    return (processWithGfm(md) as any).children.map(f).join(" + ");
  };

  /**
   * Only one content line makes a setext heading in Obsidian, so a multi-line one
   * is demoted to a paragraph. Rebuilding it line by line gave each `*` no partner
   * to pair with, losing emphasis CommonMark's own examples 81 and 82 carry.
   */
  it("keeps an inline construct spanning the demoted lines", () => {
    expect(shape("Foo *bar\nbaz*\n====\n")).toBe(
      "paragraph(text emphasis(text break text) break text)",
    );
    expect(shape("Foo *bar\nbaz*\n----\n")).toBe(
      "paragraph(text emphasis(text break text)) + thematicBreak",
    );
  });

  it("leaves the underline's own handling alone", () => {
    // Reparsed on its own, so the indent is still dropped from the text.
    expect(shape("H\n  ===\n")).toBe("paragraph(text break text)");
    expect(shape("H\n===\t\n")).toBe("paragraph(text break text)");
    expect(shape("a\nb\n---\n")).toBe(
      "paragraph(text break text) + thematicBreak",
    );
  });

  it("does not make one inside a container either", () => {
    // One content line makes a setext heading; two do not, in a quote as at the root
    // (`commonmark/setext-headings/82` is a paragraph to Obsidian).
    expect(shape("> a\n> b\n> ===\n")).toBe(
      "blockquote(paragraph(text break text break text))",
    );
  });
});

describe("callout title boundary", () => {
  const shape = (md: string) => {
    const f = (n: any): string => {
      const kids = (n.children ?? []).map(f).join(" ");
      return n.type + (kids ? `(${kids})` : "");
    };
    return (processWithGfm(md) as any).children.map(f).join(" + ");
  };

  /**
   * A construct spanning the title's line ending swallows the `break` the split
   * looks for, so no top-level break exists and the whole construct was taken as
   * the title. Obsidian forms no such construct: the title ends at the line ending
   * and the two markers land in different blocks.
   */
  it("does not carry a construct across the boundary", () => {
    expect(shape("> [!note] *em\nem*\n")).toBe(
      "callout(calloutTitle(text) paragraph(text))",
    );
    expect(shape("> [!note] _under\nunder_\n")).toBe(
      "callout(calloutTitle(text) paragraph(text))",
    );
  });

  it("keeps a construct that fits on the title line", () => {
    expect(shape("> [!note] *em*\nbody\n")).toBe(
      "callout(calloutTitle(emphasis(text)) paragraph(text))",
    );
  });

  /** A quoted body is its own block, so a construct inside it is untouched. */
  it("leaves a quoted body alone", () => {
    expect(shape("> [!note] t\n> *em\n> em*\n")).toBe(
      "callout(calloutTitle(text) paragraph(emphasis(text break text)))",
    );
  });

  it("leaves the ordinary forms alone", () => {
    expect(shape("> [!note] title\n")).toBe("callout(calloutTitle(text))");
    expect(shape("> [!note] a\nb\n")).toBe(
      "callout(calloutTitle(text) paragraph(text))",
    );
    expect(shape("> [!note] # h\n")).toBe(
      "callout(calloutTitle heading(text))",
    );
  });
});

describe("thematic break with a tab", () => {
  const shape = (md: string) => {
    const f = (n: any): string => {
      const kids = (n.children ?? []).map(f).join(" ");
      return n.type + (kids ? `(${kids})` : "");
    };
    return (processWithGfm(md) as any).children.map(f).join(" + ");
  };
  const spans = (md: string) => {
    const found: string[] = [];
    visit(processWithGfm(md), "listItem", (n: any) => {
      found.push(`${n.position?.start?.offset}..${n.position?.end?.offset}`);
    });
    return found;
  };

  /**
   * `remark-parse@8` accepts only spaces between the markers, so a tab drops the
   * line to the list tokenizer. CommonMark counts a tab as whitespace and reports a
   * break.
   */
  it("becomes nested list items", () => {
    expect(shape("*\t*\t*\t\n")).toBe(
      "list(listItem(list(listItem(list(listItem)))))",
    );
    expect(shape("-\t-\t-\t\n")).toBe(
      "list(listItem(list(listItem(list(listItem)))))",
    );
  });

  /** Each item starts at its marker and runs to the end of the line. */
  it("places every item as the metadata cache reports it", () => {
    expect(spans("*\t*\t*\t\n")).toEqual(["0..6", "2..6", "4..6"]);
  });

  it("is cancelled by a trailing tab alone", () => {
    expect(shape("* * *\t\n")).toBe(
      "list(listItem(list(listItem(list(listItem)))))",
    );
  });

  /** `_` opens no list, so the line is simply prose. */
  it("leaves an underscore run as a paragraph", () => {
    expect(shape("_\t_\t_\t\n")).toBe("paragraph(text)");
  });

  it("leaves a space-separated break alone", () => {
    expect(shape("* * *\n")).toBe("thematicBreak");
    expect(shape("***\n")).toBe("thematicBreak");
    expect(shape("*  *  *\n")).toBe("thematicBreak");
  });

  it("does not disturb a setext heading or an ordinary list", () => {
    expect(shape("para\n---\n")).toBe("heading(text)");
    expect(shape("- a\n- b\n")).toBe(
      "list(listItem(paragraph(text)) listItem(paragraph(text)))",
    );
  });
});

describe("doubled bracket in a wikilink alias", () => {
  const links = (md: string) => {
    const found: string[] = [];
    visit(processWithGfm(md), "wikilink", (n: any) => {
      found.push(`${n.path}|${n.alias}|${n.embedded}`);
    });
    return found;
  };

  /**
   * A `[[` is no more legal in an alias than in a target. Accepting it made
   * `![[a|[[b]]]]` an embed of `a` aliased `[[b`, indexing a target Obsidian does
   * not report and losing the one it does: the inner link to `b`.
   */
  it("lets the inner link win", () => {
    expect(links("![[a|[[b]]]]\n")).toEqual(["b||false"]);
    expect(links("![[a|![[b]]]]\n")).toEqual(["b||true"]);
  });

  it("leaves an ordinary alias alone", () => {
    expect(links("![[a|b]]\n")).toEqual(["a|b|true"]);
    expect(links("[[a|b]]\n")).toEqual(["a|b|false"]);
    expect(links("[[a|b|c]]\n")).toEqual(["a|b|c|false"]);
  });

  /** The target side already rejected it, and still does. */
  it("keeps the target rule", () => {
    expect(links("![[![[a]]]]\n")).toEqual(["a||true"]);
    expect(links("[[[[x]]\n")).toEqual(["[x||false"]);
  });
});

describe("callout with a block title", () => {
  const shape = (md: string) => {
    const f = (n: any): string => {
      const kids = (n.children ?? []).map(f).join(" ");
      return n.type + (kids ? `(${kids})` : "");
    };
    return (processWithGfm(md) as any).children.map(f).join(" + ");
  };

  /**
   * `titleLineIsBlock` reparses the title line only, and whatever followed it in the
   * same paragraph used to go with the paragraph it replaced -- losing the body
   * outright on input anyone might write.
   */
  it("keeps the body under a block title", () => {
    expect(shape("> [!note] # h\n> body\n")).toBe(
      "callout(calloutTitle heading(text) paragraph(text))",
    );
    expect(shape("> [!note] # h\nbody\n")).toBe(
      "callout(calloutTitle heading(text) paragraph(text))",
    );
    expect(shape("> [!note] - item\n> body\n")).toBe(
      "callout(calloutTitle list(listItem(paragraph(text))) paragraph(text))",
    );
  });

  /** A body in a separate paragraph was dropped by a second, narrower bug. */
  it("keeps a body separated by a blank quote line", () => {
    expect(shape("> [!note] # h\n>\n> body\n")).toBe(
      "callout(calloutTitle heading(text) paragraph(text))",
    );
  });

  it("still handles a block title with no body", () => {
    expect(shape("> [!note] # h\n")).toBe(
      "callout(calloutTitle heading(text))",
    );
  });

  it("places the empty title it creates", () => {
    const [callout] = (processWithGfm("> [!note] # h\n") as any).children;
    const [title] = callout.children;
    expect(title.type).toBe("calloutTitle");
    expect(title.position?.start?.offset).toBe(title.position?.end?.offset);
    expect(title.position?.start?.offset).toBeTypeOf("number");
  });
});

describe("highlight across a line ending", () => {
  const marks = (md: string) => {
    const found: string[] = [];
    visit(processWithGfm(md), "highlight", (n: any) => {
      const parts: string[] = [];
      visit(n, "text", (t: any) => {
        parts.push(t.value);
      });
      found.push(parts.join("\n"));
    });
    return found;
  };

  /**
   * A paragraph's continuation line loses its indent everywhere else in micromark,
   * so a construct consuming raw characters has to drop it too.
   */
  it("drops the continuation line's indent", () => {
    expect(marks("> ==a\n>     b==\n")).toEqual(["a\nb"]);
    expect(marks("==a\n    b==\n")).toEqual(["a\nb"]);
    expect(marks("==a\nb==\n")).toEqual(["a\nb"]);
  });
});

describe("label precedence", () => {
  const read = (md: string, opts?: RemarkObsidianOptions) => {
    const tree = processWithGfm(md, opts) as any;
    const txt: string[] = [];
    const urls: string[] = [];
    visit(tree, (n: any) => {
      if (n.type === "text") txt.push(n.value);
      if (n.type === "link") urls.push(n.url);
    });
    return { text: txt.join(""), urls };
  };

  /**
   * Obsidian finds a label by raw balanced-bracket scanning, so the outermost pair
   * wins. CommonMark forbids a link inside a link and resolves it the other way
   * round, by letting the inner one win.
   */
  it("gives the outermost pair the link", () => {
    expect(read("[a [b](u) c](v)\n")).toEqual({
      text: "a [b](u) c",
      urls: ["v"],
    });
    expect(read("[foo [bar](u)](v)\n")).toEqual({
      text: "foo [bar](u)",
      urls: ["v"],
    });
    expect(read("[[a](u)](v)\n")).toEqual({ text: "[a](u)", urls: ["v"] });
  });

  it("takes the outermost of three", () => {
    expect(read("[a [b [c](u) d](v) e](w)\n")).toEqual({
      text: "a [b [c](u) d](v) e",
      urls: ["w"],
    });
  });

  /**
   * Only a link written in bracket form is demoted. An autolink and a GFM literal
   * URL are `link` nodes too, and demoting one left text `remark-stringify` escapes
   * as `\<` -- so formatting twice kept adding a backslash.
   */
  it("reads an autolink inside the label as text", () => {
    // remark-parse 8 reads no link inside a link, so the autolink is the label's text -- and
    // formatting settles after one pass (`\\<` is written once and then read back as `<`).
    const { urls, text } = read("[a <https://e.test/x> b](u)\n");
    expect(urls).toEqual(["u"]);
    expect(text).toBe("a <https://e.test/x> b");
  });

  it("leaves an ordinary link alone", () => {
    expect(read("[a](u)\n")).toEqual({ text: "a", urls: ["u"] });
    expect(read("[a [b] c](u)\n")).toEqual({ text: "a [b] c", urls: ["u"] });
    expect(read("[a](u) [b](v)\n")).toEqual({ text: "a b", urls: ["u", "v"] });
  });

  // `legacy` parses with remark-parse 8; the CommonMark reading is `strict`'s.
  it("follows CommonMark under the strict preset", () => {
    // CommonMark's own reading: the inner link wins and the outer brackets stay as
    // text, which is what the `[` and `](v)` either side of it become.
    expect(read("[a [b](u) c](v)\n", { preset: "strict" })).toEqual({
      text: "[a b c](v)",
      urls: ["u"],
    });
  });
});

describe("label retraction", () => {
  const read = (md: string) => {
    const tree = processWithGfm(md) as any;
    const txt: string[] = [];
    const urls: string[] = [];
    visit(tree, (n: any) => {
      if (n.type === "text") txt.push(n.value);
      if (n.type === "link") urls.push(n.url);
    });
    return { text: txt.join(""), urls };
  };

  /**
   * CommonMark lets a code span own a `]` and carries the label past it. Obsidian's
   * scan looks inside nothing, so that `]` closes the label -- and a backtick then
   * follows it, which opens no link.
   */
  it("forms no link when the label closes inside a construct", () => {
    expect(read("[a`]`b](u)\n").urls).toEqual([]);
    expect(read("[a$x]y$b](u)\n").urls).toEqual([]);
    expect(read('[a<i x="]">b](u)\n').urls).toEqual([]);
  });

  /**
   * Our tree has no link here at all -- the code span swallows `](u)` -- so this is
   * built by the label-driven pass rather than retracted by this one. It needed the
   * full destination parser before it could be: the trigger that reaches a label the
   * tree found no link for is the same one that claims images and wikilinks.
   */
  it("builds a link the code span swallowed", () => {
    expect(read("[foo`](u)\n").urls).toEqual(["u"]);
  });

  /**
   * An angle destination may hold unbalanced parens, so the label close cannot be
   * found by counting delimiters back from the tail -- doing that put it inside the
   * destination and demoted CommonMark's own example 499.
   */
  it("keeps a link whose angle destination holds unbalanced parens", () => {
    expect(read("[link](<foo(and(bar)>)\n").urls).toEqual(["foo(and(bar)"]);
  });
});

describe("setext underline under a definition", () => {
  const shape = (md: string) => {
    const f = (n: any): string => {
      const kids = (n.children ?? []).map(f).join(" ");
      return n.type + (kids ? `(${kids})` : "");
    };
    return (processWithGfm(md) as any).children.map(f).join(" + ");
  };

  /**
   * The gap check used `trim()`, which a blank line passes -- so a definition
   * absorbed a thematic break two lines down and reported one heading spanning both.
   * Highest-frequency cluster across two independent fuzz ranges.
   */
  it("stops at a blank line", () => {
    expect(shape("[^1]:\n\n---\n")).toBe("footnoteDefinition + thematicBreak");
    expect(shape("[^1]: x\n\n---\n")).toBe(
      "footnoteDefinition(paragraph(text)) + thematicBreak",
    );
  });

  it("still takes an adjacent underline", () => {
    expect(shape("[^1]: x\n---\n")).toBe("heading(footnoteReference text)");
    expect(shape("[^1]: x\n===\n")).toBe("heading(footnoteReference text)");
  });
});

describe("callout marker extent", () => {
  const shape = (md: string) => {
    const f = (n: any): string => {
      const kids = (n.children ?? []).map(f).join(" ");
      return n.type + (kids ? `(${kids})` : "");
    };
    return (processWithGfm(md) as any).children.map(f).join(" + ");
  };

  /**
   * The type pattern was `[^\]]+`, which matches a newline -- so an unclosed `[!`
   * found its `]` on the next line and produced a callout whose type spanned both.
   * Obsidian reads an unclosed marker as ordinary prose.
   */
  it("does not let the type span a line ending", () => {
    expect(shape("> [!n\nnote]\n")).toBe(
      "blockquote(paragraph(text break text))",
    );
    expect(shape("> [!\nnote]\n")).toBe(
      "blockquote(paragraph(text break text))",
    );
  });

  it("still reads the ordinary markers", () => {
    expect(shape("> [!note]\n")).toBe("callout");
    expect(shape("> [!note]-\n")).toBe("callout");
    expect(shape("> [!note] t\n")).toBe("callout(calloutTitle(text))");
  });
});

describe("setext underline indent inside a container", () => {
  const shape = (md: string) => {
    const f = (n: any): string => {
      const kids = (n.children ?? []).map(f).join(" ");
      return n.type + (kids ? `(${kids})` : "");
    };
    return (processWithGfm(md) as any).children.map(f).join(" + ");
  };

  /**
   * `remark-parse@8` allows no indent before a setext underline, which is why this
   * pass demotes one. But the indent a list item puts in front of its own underline
   * belongs to the list, and CommonMark and Obsidian both read a heading there.
   */
  it("keeps a heading whose underline sits at the content column", () => {
    expect(shape("- item\n  ===\n")).toBe("list(listItem(heading(text)))");
    expect(shape("1. item\n   ===\n")).toBe("list(listItem(heading(text)))");
  });

  /**
   * At root an indented paragraph also starts past column one, so the indent cannot
   * be read off the heading alone -- doing that made a heading of CommonMark's
   * example 84, which is a paragraph.
   */
  it("still demotes a sloppy underline at root", () => {
    expect(shape("H\n  ===\n")).toBe("paragraph(text break text)");
    expect(shape("  Foo\n  ===\n")).toBe("paragraph(text break text)");
    expect(shape("H\n===\t\n")).toBe("paragraph(text break text)");
  });

  it("leaves the plain forms alone", () => {
    expect(shape("H\n===\n")).toBe("heading(text)");
    expect(shape("> q\n> ===\n")).toBe("blockquote(heading(text))");
    expect(shape("- item\n===\n")).toBe("list(listItem(heading(text)))");
  });
});

describe("container setext heading", () => {
  const shape = (md: string) => {
    const f = (n: any): string => {
      const kids = (n.children ?? []).map(f).join(" ");
      return n.type + (kids ? `(${kids})` : "");
    };
    return (processWithGfm(md) as any).children.map(f).join(" + ");
  };
  const span = (md: string, type: string) => {
    let found = "";
    visit(processWithGfm(md), type, (n: any) => {
      if (!found) {
        found = `${n.position?.start?.offset}..${n.position?.end?.offset}`;
      }
    });
    return found;
  };

  /**
   * The reparsed children used to keep the fragment's own offsets, and
   * `contentStart` in `setext-underline.ts` trusts a heading's children over its
   * span -- so an unshifted child reported offset 0, that pass read the whole
   * document as the heading's content, counted three lines and demoted the heading
   * it had just been handed.
   */
  it("places the heading's children on the document", () => {
    expect(span("- item\n===\n", "text")).toBe("2..6");
    expect(shape("- a\n- b\n===\n")).toBe(
      "list(listItem(paragraph(text)) listItem(heading(text)))",
    );
  });

  /**
   * The underline must be the second line, but content after it is fine. Capping
   * the whole paragraph at two lines conflated that with a run on the fourth line,
   * which Obsidian does not treat as an underline at all.
   */
  it("keeps what follows the underline", () => {
    expect(shape("- item\n===\nmore\n")).toBe(
      "list(listItem(heading(text) paragraph(text)))",
    );
  });

  it("leaves the plain forms alone", () => {
    expect(shape("- item\n===\n")).toBe("list(listItem(heading(text)))");
    expect(shape("> q\n===\n")).toBe("blockquote(heading(text))");
  });
});

describe("html setext inside a container", () => {
  const shape = (md: string) => {
    const f = (n: any): string => {
      const kids = (n.children ?? []).map(f).join(" ");
      return n.type + (kids ? `(${kids})` : "");
    };
    return (processWithGfm(md) as any).children.map(f).join(" + ");
  };

  /**
   * At root the html block swallows the underline, so both lines are inside one
   * node. Inside a container they are not: the html node is just the tag and the
   * run arrives as the next sibling paragraph.
   */
  it("takes the underline from the next sibling", () => {
    expect(shape("- <br>\n===\n")).toBe("list(listItem(heading(html)))");
    expect(shape("1. <br>\n===\n")).toBe("list(listItem(heading(html)))");
    expect(shape("> <br>\n===\n")).toBe("blockquote(heading(html))");
  });

  /** A blank line ends the container's block, so the run is prose of its own. */
  it("requires the underline on the very next line", () => {
    expect(shape("- <br>\n\n===\n")).toBe(
      "list(listItem(html)) + paragraph(text)",
    );
    // The html SWALLOWS the plain line, which is the point of the control: no heading forms
    // either way, and the line below an html block inside a container is that block's content
    // rather than a paragraph of its own.
    //
    // This read `list(listItem(html paragraph(text)))` and was asserting our own behaviour
    // rather than the app's. Asked of live 1.14.4, Obsidian indexes NOTHING on that line for
    // `<br>`, `<div>` or `<span>` alike -- their B4, "HTML blocks inside items and quotes run
    // on through column-0 lines" -- so `itemHtmlExtentTransform` was widened to match and this
    // expectation moved with it.
    expect(shape("- <br>\nplain\n")).toBe("list(listItem(html))");
  });

  it("still handles the root form", () => {
    expect(shape("<br>\n===\n")).toBe("heading(html)");
    expect(shape("<pre>\n---\n</pre>\n")).toBe("heading(html) + html");
  });
});

describe("label precedence destination parsing", () => {
  const urls = (md: string) => {
    const found: string[] = [];
    visit(processWithGfm(md), "link", (n: any) => {
      found.push(n.url);
    });
    return found;
  };

  /**
   * The naive reader returned whatever sat between the parens, so a title landed in
   * the url -- which is why widening this pass once cost 35 regressions.
   */
  it("keeps a title out of the url", () => {
    expect(urls('[a [b](u) c](v "t")\n')).toEqual(["v"]);
    expect(urls("[a [b](u) c](v 't')\n")).toEqual(["v"]);
    expect(urls("[a [b](u) c](v (t))\n")).toEqual(["v"]);
  });

  it("reads an angle destination and refuses an unterminated title", () => {
    expect(urls("[a [b](u) c](<v w>)\n")).toEqual(["v w"]);
    expect(urls('[a [b](u) c](v "unterminated\n')).toEqual(["u"]);
  });

  /**
   * An image, a wikilink and a footnote reference all begin with a bracket and are
   * indistinguishable from a link's at this level, so the guard asks the tree.
   */
  it("leaves another construct's bracket alone", () => {
    // The image owns both brackets, so there is no `link` node here at all.
    expect(urls("![a [b](u) c](v)\n")).toEqual([]);
    expect(urls("[a [[w]] b](u)\n")).toEqual(["u"]);
  });

  /** Whichever construct opened first wins. */
  it("does not claim a bracket an earlier construct encloses", () => {
    expect(urls("*[foo*](/uri)\n")).toEqual([]);
    expect(urls("[foo *bar](u)*\n")).toEqual(["u"]);
  });
});

describe("label precedence with a reference destination", () => {
  const refs = (md: string) => {
    const found: string[] = [];
    visit(processWithGfm(md), "linkReference", (n: any) => {
      found.push(n.identifier);
    });
    return found;
  };
  const text = (md: string) => {
    const parts: string[] = [];
    visit(processWithGfm(md), "text", (n: any) => {
      parts.push(n.value);
    });
    return parts.join("");
  };

  /** The same outermost-pair rule, with `[r]` where `(u)` would be. */
  it("takes a full reference after the outermost label", () => {
    expect(refs("[a [b](u)][r]\n\n[r]: /r\n")).toEqual(["r"]);
    expect(text("[a [b](u)][r]\n\n[r]: /r\n")).toBe("a [b](u)");
  });

  /**
   * A reference destination is itself a bracket pair, so the scan offers it as the
   * next label -- `[bar]` here is already spent as `[foo]`'s destination and was
   * being relabelled and pointed at `[baz]`.
   */
  it("does not relabel a pair already spent as a destination", () => {
    expect(text("[foo][bar][baz]\n\n[baz]: /url1\n[bar]: /url2\n")).toBe(
      "foobaz",
    );
  });
});

describe("footnote label holding a bracket", () => {
  const refs = (md: string) => {
    const found: string[] = [];
    visit(processWithGfm(md), "footnoteReference", (n: any) => {
      found.push(n.label ?? n.identifier);
    });
    return found;
  };
  const other = (md: string) => {
    const found: string[] = [];
    visit(processWithGfm(md), (n: any) => {
      if (n.type === "wikilink") found.push(`wikilink:${n.path}`);
      if (n.type === "link") found.push(`link:${n.url}`);
    });
    return found;
  };

  /**
   * A footnote label runs to the **first** `]`, not balance-scanned the way a link
   * label is, and nothing parses inside it. `[^a[b]c]` renders `a[bc]` -- the label
   * `a[b` with `c]` left as text -- which nothing else explains.
   */
  it("runs to the first bracket", () => {
    expect(refs("[^a[b]c]\n")).toEqual(["a[b"]);
    expect(refs("[^[[a]]]\n")).toEqual(["[[a"]);
    expect(refs("[^![[img.png]]]\n")).toEqual(["![[img.png"]);
  });

  /** Nothing inside it parses, so the wikilink that used to form does not. */
  it("suppresses a construct inside the label", () => {
    expect(other("[^[[a]]]\n")).toEqual([]);
  });

  /** An outer link outranks the reading: `[^[note]](url)` is a link. */
  it("declines when an outer link forms", () => {
    expect(refs("[^[note]](https://example.com)\n")).toEqual([]);
    expect(other("[^[note]](https://example.com)\n")).toEqual([
      "link:https://example.com",
    ]);
  });

  it("leaves a label with no bracket to the passes above", () => {
    expect(refs("[^1]\n")).toEqual(["1"]);
    expect(refs("a[^1]b\n\n[^1]: d\n")).toEqual(["1"]);
  });
});

describe("a kept comment inside a list item", () => {
  // Seventeen documents in the referee corpus crashed on these, all one bug:
  // `trailingEmptyItem` read `item.children.length` on a `list` child that was a
  // kept `%%` comment, which is a leaf. The types say that cannot happen.
  const CRASHERS = [
    "- <!--\n  hidden\nplain[^1]\n-->\n\n[^1]: one",
    "- [^1]: def\n  %%\n  x[^2]\n  %%\n\nuse[^1] use[^2] use[^3]\n",
    "- [^1]: def\n    %%\n    x[^2]\n    %%\n\nuse[^1] use[^2] use[^3]\n",
    "- [^9]: orphan\n  %%\n  [^1]: one\n  %%\n\nuse[^1] use[^2] use[^3]\n",
  ];

  for (const markdown of CRASHERS) {
    it(`parses ${JSON.stringify(markdown).slice(0, 44)} without throwing`, () => {
      expect(() => parse(markdown)).not.toThrow();
    });
  }
});

describe("strict with every option the transform was once gated on off", () => {
  // The transform used to be skipped outright when these were all off, which silently dropped
  // passes that depend on none of them.
  const off = {
    preset: "strict",
    comments: false,
    customTaskChars: false,
    math: false,
    callouts: false,
  } as const;

  it("still converts a soft line ending when positionedBreaks is on", () => {
    const md = "a\nb\n";
    expect(
      findNodes(
        processWithGfm(md, { ...off, positionedBreaks: true }),
        "break",
      ),
    ).toHaveLength(1);
    expect(findNodes(processWithGfm(md, off), "break")).toHaveLength(0);
  });

  it("still declines a `--- ` opener as frontmatter", () => {
    const tree = processWithGfm("--- \ntitle: x\n---\n", off);
    expect(findNodes(tree, "yaml")).toHaveLength(0);
  });
});

/** A node's text, without depending on `mdast-util-to-string`, which is not a direct dependency. */
const plain = (node: any): string =>
  typeof node.value === "string"
    ? node.value
    : (node.children ?? []).map(plain).join("");

describe("strict: a highlight crossing emphasis", () => {
  // Obsidian's Reading view lets whichever construct opens first take its span (1.14.5
  // recorded, 1.15.0 asked). Live Preview styles both, which no tree can hold.
  const shape = (markdown: string) => {
    const tree = processWithGfm(markdown, { preset: "strict" });
    const out: string[] = [];
    visit(tree, (node: any) => {
      if (
        node.type === "strong" ||
        node.type === "emphasis" ||
        node.type === "highlight"
      ) {
        out.push(`${node.type}:${plain(node)}`);
      }
    });
    return out;
  };

  it("lets emphasis that opened first win", () => {
    expect(shape("**a==b**c==\n")).toEqual(["strong:a==b"]);
    expect(shape("*a==b*c==\n")).toEqual(["emphasis:a==b"]);
  });

  it("lets a highlight that opened first win", () => {
    expect(shape("==a**b==c**\n")).toEqual(["highlight:a**b"]);
  });

  it("still nests either way round", () => {
    expect(shape("**a ==b== c**\n")).toEqual(["strong:a b c", "highlight:b"]);
    expect(shape("==*b*==\n")).toEqual(["highlight:b", "emphasis:b"]);
  });
});

describe("strict: a reference opener before an inline footnote", () => {
  const types = (markdown: string, options = {}) => {
    const tree = processWithGfm(markdown, { preset: "strict", ...options });
    return (
      findNodes(tree, "footnoteReference").length +
      ":" +
      findNodes(tree, "footnote").length
    );
  };

  it("is a reference when its label is defined", () => {
    expect(types("x[^[^1] y\n\n[^[^1]: d\n")).toBe("1:0");
  });

  it("is literal text when nothing defines it, as GFM keeps an undefined reference", () => {
    expect(types("x[^[^1] y\n")).toBe("0:0");
    expect(plain(processWithGfm("x[^[^1] y\n", { preset: "strict" }))).toBe(
      "x[^[^1] y",
    );
  });

  it("is a reference anyway when bare references are on", () => {
    expect(types("x[^[^1] y\n", { bareFootnoteRefs: true })).toBe("1:0");
  });
});
