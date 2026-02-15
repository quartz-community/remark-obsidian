import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkObsidian, { type RemarkObsidianOptions } from "../src/index.js";

function parse(md: string, opts?: RemarkObsidianOptions) {
  return unified().use(remarkParse).use(remarkObsidian, opts).parse(md);
}

function process(md: string, opts?: RemarkObsidianOptions) {
  const processor = unified().use(remarkParse).use(remarkObsidian, opts);
  return processor.runSync(processor.parse(md));
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

  it("strips comments", () => {
    const single = process("%%comment%%");
    expect(findNodes(single, "comment").length).toBe(0);

    const multi = process("%%multi\nline%%");
    expect(findNodes(multi, "comment").length).toBe(0);
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

  it("parses arrows", () => {
    const arrows = parse("-> --> => ==> <- <-- <= <==");
    const arrowNodes = findNodes(arrows, "arrow");
    expect(arrowNodes.map((node) => node.value)).toEqual([
      "&rarr;",
      "&rArr;",
      "&rArr;",
      "&rArr;",
      "&larr;",
      "&lArr;",
      "&lArr;",
      "&lArr;",
    ]);
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

    const noArrows = parse("->", { arrows: false });
    expect(findNodes(noArrows, "arrow").length).toBe(0);
  });
});
