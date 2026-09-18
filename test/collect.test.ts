import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkObsidian, {
  collectEmbedPaths,
  collectWikilinks,
  isEmbed,
  isWikilink,
} from "../src/index.js";

function parse(md: string) {
  return unified().use(remarkParse).use(remarkObsidian).parse(md);
}

describe("collect", () => {
  describe("isWikilink", () => {
    it("accepts a wikilink node and rejects anything else", () => {
      const tree = parse("[[target]]");
      const [wikilink] = collectWikilinks(tree);

      expect(isWikilink(wikilink)).toBe(true);
      expect(isWikilink({ type: "image", url: "a.png" })).toBe(false);
      expect(isWikilink(null)).toBe(false);
      expect(isWikilink(undefined)).toBe(false);
      expect(isWikilink("wikilink")).toBe(false);
    });
  });

  describe("isEmbed", () => {
    it("distinguishes an embed from a plain link", () => {
      const [link] = collectWikilinks(parse("[[target]]"));
      const [embed] = collectWikilinks(parse("![[target]]"));

      expect(isEmbed(link)).toBe(false);
      expect(isEmbed(embed)).toBe(true);
    });
  });

  describe("collectWikilinks", () => {
    it("returns links and embeds in document order", () => {
      const tree = parse("[[one]] then ![[two]] then [[three]]");

      expect(collectWikilinks(tree).map((node) => node.path)).toEqual([
        "one",
        "two",
        "three",
      ]);
    });

    it("filters by embedded when asked", () => {
      const tree = parse("[[one]] ![[two]] [[three]] ![[four]]");

      expect(
        collectWikilinks(tree, { embedded: true }).map((node) => node.path),
      ).toEqual(["two", "four"]);

      expect(
        collectWikilinks(tree, { embedded: false }).map((node) => node.path),
      ).toEqual(["one", "three"]);
    });

    it("preserves heading and alias on the returned nodes", () => {
      const [node] = collectWikilinks(parse("![[note#Section|Label]]"));

      expect(node).toMatchObject({
        path: "note",
        heading: "Section",
        alias: "Label",
        embedded: true,
      });
    });

    it("returns an empty array when there are none", () => {
      expect(collectWikilinks(parse("plain text"))).toEqual([]);
    });
  });

  describe("collectEmbedPaths", () => {
    it("collects both wikilink embeds and markdown images", () => {
      const tree = parse("![[a.png]] and ![alt](b.png)");

      expect(collectEmbedPaths(tree)).toEqual(["a.png", "b.png"]);
    });

    it("ignores plain wikilinks and plain links", () => {
      const tree = parse("[[not-embedded]] and [text](page.md)");

      expect(collectEmbedPaths(tree)).toEqual([]);
    });

    it("does not collect embeds inside fenced code", () => {
      const tree = parse(
        ["```md", "![[fenced.png]]", "![alt](also-fenced.png)", "```"].join(
          "\n",
        ),
      );

      expect(collectEmbedPaths(tree)).toEqual([]);
    });

    it("does not collect embeds inside inline code", () => {
      const tree = parse("`![[inline.png]]`");

      expect(collectEmbedPaths(tree)).toEqual([]);
    });

    it("deduplicates repeated targets but keeps first-seen order", () => {
      const tree = parse("![[b.png]] ![[a.png]] ![[b.png]] ![alt](a.png)");

      expect(collectEmbedPaths(tree)).toEqual(["b.png", "a.png"]);
    });

    it("keeps heading and block references on the target", () => {
      const tree = parse("![[note#Section]]");

      expect(collectEmbedPaths(tree)).toEqual(["note"]);
    });

    it("returns an empty array for a document with no embeds", () => {
      expect(collectEmbedPaths(parse("# Heading\n\nSome text."))).toEqual([]);
    });
  });
});
