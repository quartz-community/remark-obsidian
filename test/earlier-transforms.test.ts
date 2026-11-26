import { describe, expect, it } from "vitest";
import type { Root, Text } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import remarkObsidian from "../src/index.js";

// Quartz runs GitHub-flavored-markdown's text rewrites (SmartyPants, `replacements`) as
// transformers registered before this plugin. `strict`'s passes re-parse the document and
// fragments of it, which as a transformer discarded those rewrites in any note with a callout.
const arrows = () => (tree: Root) => {
  visit(tree, "text", (node: Text) => {
    node.value = node.value.replaceAll("->", "→");
  });
};

function texts(tree: Root): string[] {
  const out: string[] = [];
  visit(tree, "text", (node: Text) => {
    out.push(node.value);
  });
  return out;
}

async function run(markdown: string, preset: "strict" | "legacy") {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(arrows)
    .use(remarkObsidian, { preset });
  return (await processor.run(processor.parse(markdown), markdown)) as Root;
}

describe("transformers registered before remark-obsidian", () => {
  const markdown =
    "a -> b\n\n> [!note] T -> U\n> body -> text\n\n%% c %% d -> e\n";

  for (const preset of ["strict", "legacy"] as const) {
    it(`keep their changes under ${preset}`, async () => {
      const values = texts(await run(markdown, preset)).join("|");
      expect(values).not.toContain("->");
      expect(values).toContain("a → b");
      expect(values).toContain("body → text");
      expect(values).toContain("d → e");
    });
  }

  it("are finished at parse time under strict", async () => {
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkObsidian, {
        preset: "strict",
      });
    const tree = processor.parse(markdown);
    expect(tree.children.map((n) => n.type as string)).toContain("callout");
    const ran = await processor.run(tree, markdown);
    expect(ran).toBe(tree);
    expect(texts(ran as Root)).toContain("body -> text");
  });

  it("still finish a tree that did not come from this parser", async () => {
    const strict = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkObsidian, {
        preset: "strict",
      });
    const plain = unified().use(remarkParse).use(remarkGfm);
    const ran = (await strict.run(plain.parse(markdown), markdown)) as Root;
    expect(ran.children.map((n) => n.type as string)).toContain("callout");
  });
});
