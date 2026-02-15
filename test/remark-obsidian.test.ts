import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import remarkObsidian, { type RemarkObsidianOptions } from "../src/index.js";

function parse(md: string, opts?: RemarkObsidianOptions) {
  return unified().use(remarkParse).use(remarkObsidian, opts).parse(md);
}

function processWithGfm(md: string, opts?: RemarkObsidianOptions) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, opts);
  return processor.runSync(processor.parse(md));
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
    const single = processWithGfm("%%comment%%");
    expect(findNodes(single, "comment").length).toBe(0);

    const multi = processWithGfm("%%multi\nline%%");
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
});
