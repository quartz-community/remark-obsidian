// The declarations admit what the trees hold. Each case pairs a document with a fact its tree
// holds, under both presets: a child type inside a parent, or a `data` key on a node. The facts
// are also written as type-level assertions below, which `npm run typecheck` checks, so a
// fact the runtime holds but the types forbid fails one gate or the other.
import type { Nodes } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import remarkObsidian from "../src/index.js";

type Of<T extends Nodes["type"]> = Extract<Nodes, { type: T }>;
type ChildTypes<T extends Nodes["type"]> =
  Of<T> extends { children: Array<infer C> }
    ? C extends { type: infer U }
      ? U
      : never
    : never;
type DataKeys<T extends Nodes["type"]> = keyof NonNullable<Of<T>["data"]>;

// Each entry fails to compile when the declarations stop admitting the fact.
function child<P extends Nodes["type"]>(
  parent: P,
  type: ChildTypes<P>,
): readonly [Nodes["type"], Nodes["type"]] {
  return [parent, type];
}
function dataKey<T extends Nodes["type"]>(
  type: T,
  key: DataKeys<T> & string,
): readonly [Nodes["type"], string] {
  return [type, key];
}

const children = {
  "listItem > callout": child("listItem", "callout"),
  "blockquote > callout": child("blockquote", "callout"),
  "footnoteDefinition > callout": child("footnoteDefinition", "callout"),
  "listItem > comment": child("listItem", "comment"),
  "blockquote > comment": child("blockquote", "comment"),
  "footnoteDefinition > comment": child("footnoteDefinition", "comment"),
};

const data = {
  "inlineMath.display": dataKey("inlineMath", "display"),
  "wikilink.spelledPath": dataKey("wikilink", "spelledPath"),
  "wikilink.spelledHeading": dataKey("wikilink", "spelledHeading"),
  "wikilink.strippedBackslash": dataKey("wikilink", "strippedBackslash"),
  "linkReference.spelledLabel": dataKey("linkReference", "spelledLabel"),
};

const documents: Record<
  keyof typeof children | keyof typeof data,
  { text: string; presets: ReadonlyArray<"legacy" | "strict"> }
> = {
  "listItem > callout": {
    text: "- > [!note] T\n  > body\n",
    presets: ["legacy", "strict"],
  },
  "blockquote > callout": {
    text: "> > [!note] T\n> > body\n",
    presets: ["legacy", "strict"],
  },
  "footnoteDefinition > callout": {
    text: "a[^1]\n\n[^1]: > [!note] T\n",
    presets: ["legacy", "strict"],
  },
  "listItem > comment": {
    text: "- a\n\n  %%\n  c\n  %%\n",
    presets: ["legacy", "strict"],
  },
  "blockquote > comment": {
    text: "> %%\n> c\n> %%\n",
    presets: ["legacy", "strict"],
  },
  "footnoteDefinition > comment": {
    text: "a[^1]\n\n[^1]: d\n\n    %%\n    c\n    %%\n",
    presets: ["legacy", "strict"],
  },
  "inlineMath.display": { text: "a $$x$$ b\n", presets: ["legacy", "strict"] },
  "wikilink.spelledPath": { text: "[[a \\]]\n", presets: ["legacy", "strict"] },
  "wikilink.spelledHeading": {
    text: "[[a#b \\]]\n",
    presets: ["legacy", "strict"],
  },
  "wikilink.strippedBackslash": {
    text: "[[a\\]]\n",
    presets: ["legacy", "strict"],
  },
  "linkReference.spelledLabel": {
    text: "[x][&amp;]\n\n[&amp;]: /u\n",
    presets: ["legacy"],
  },
};

function walk(
  node: Nodes,
  visit: (node: Nodes, parent: Nodes | undefined) => void,
  parent?: Nodes,
): void {
  visit(node, parent);
  if ("children" in node)
    for (const child of node.children as Nodes[]) walk(child, visit, node);
}

function parse(text: string, preset: "legacy" | "strict"): Nodes {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkObsidian, { preset });
  return processor.runSync(processor.parse(text), text) as Nodes;
}

describe("node types", () => {
  for (const [name, [parentType, childType]] of Object.entries(children)) {
    for (const preset of documents[name as keyof typeof children].presets) {
      it(`${name} occurs (${preset})`, () => {
        let found = false;
        walk(
          parse(documents[name as keyof typeof children].text, preset),
          (node, parent) => {
            if (node.type === childType && parent?.type === parentType)
              found = true;
          },
        );
        expect(found).toBe(true);
      });
    }
  }

  for (const [name, [type, key]] of Object.entries(data)) {
    for (const preset of documents[name as keyof typeof data].presets) {
      it(`${name} occurs (${preset})`, () => {
        let found = false;
        walk(
          parse(documents[name as keyof typeof data].text, preset),
          (node) => {
            if (
              node.type === type &&
              node.data !== undefined &&
              key in node.data
            )
              found = true;
          },
        );
        expect(found).toBe(true);
      });
    }
  }
});
