import type { Root, RootContent, Text } from "mdast";

const LABEL = / {4}\[\^/u;

interface Parent {
  type: string;
  children?: RootContent[];
}

interface Positioned {
  position?: {
    start: { line: number; column: number; offset?: number };
    end: { line: number; column: number; offset?: number };
  };
  children?: unknown[];
}

/**
 * A 4-space label line continues the definition above it (rule E2).
 *
 * `[^1]: one` over `    [^2]: two` is ONE definition to Obsidian, whose text runs
 * across both lines. Stock `remark-parse` + `remark-gfm` nests a second
 * `footnoteDefinition` inside the first instead, and no option of this package
 * moves it, so the nesting is upstream and this un-nests it.
 *
 * The INDENT and the BLANK are both part of the rule, and both were measured.
 * Over 27 nested positions in the corpus, un-nesting every one scores 17 gain /
 * 10 break -- 63%, which is not a rule. Split by feature against that base rate:
 *
 *     blankBefore        n=8   gain=0   break=8    0%
 *     col=6              n=5   gain=1   break=4   20%
 *     col=4, no blank    n=9   gain=9   break=0  100%
 *
 * A blank line above makes Obsidian define after all, in all eight cases, and six
 * columns is an ordinary nested definition. Exactly four columns with no blank is
 * the continuation E2 describes, and it is the whole of the N/0 population. The
 * test is four literal spaces: the two tab-indented positions are both breaks,
 * and a tab reaching column 4 is D4's arithmetic rather than this rule.
 *
 * The label is left in the parent's text as the source wrote it, which is what
 * makes `bareFootnoteRefTransform` index it afterwards -- Obsidian reports a
 * REFERENCE at 16 of the 17 positions where it declines the definition, the same
 * failed-label asymmetry that pass already owns. So this must run BEFORE it, the
 * mirror of the padded-label pass, which had to run after.
 */
export function definitionNestedLabelTransform(
  tree: Root,
  source: string,
): void {
  const lines = source.split("\n");
  for (let guard = 0; guard < 32; guard++) {
    const target = find(tree as unknown as Parent, false, lines);
    if (!target) return;
    unnest(target.parent, target.index, source);
  }
}

function find(
  node: Parent,
  inDefinition: boolean,
  lines: string[],
): { parent: Parent; index: number } | undefined {
  const children = node.children;
  if (!Array.isArray(children)) return undefined;

  for (const [index, child] of children.entries()) {
    const isDefinition = child.type === "footnoteDefinition";
    if (isDefinition && inDefinition && continues(child, lines))
      return { parent: node, index };
    const found = find(child, inDefinition || isDefinition, lines);
    if (found) return found;
  }
  return undefined;
}

function continues(definition: RootContent, lines: string[]): boolean {
  const line = definition.position?.start.line;
  if (line === undefined) return false;

  const raw = lines[line - 1];
  const previous = lines[line - 2];
  if (raw === undefined || previous === undefined) return false;
  if (previous.trim() === "") return false;

  const column = definition.position?.start.column ?? 1;
  return column === 5 && LABEL.test(raw.slice(0, 6));
}

function unnest(parent: Parent, index: number, source: string): void {
  const children = parent.children;
  if (!Array.isArray(children)) return;

  const definition = children[index];
  if (definition?.type !== "footnoteDefinition") return;

  const start = definition.position?.start.offset;
  const inner = definition.children[0];
  const label = labelText(definition, source, start);
  if (start === undefined || inner === undefined || label === undefined) {
    children.splice(index, 1);
    return;
  }

  if (inner.type === "paragraph") inner.children.unshift(label);
  if (inner.position && definition.position)
    inner.position.start = { ...definition.position.start };

  children.splice(index, 1, ...definition.children);
}

function labelText(
  definition: Positioned,
  source: string,
  start: number | undefined,
): Text | undefined {
  if (start === undefined) return undefined;

  const end = firstContentOffset(definition);
  if (end === undefined || end <= start) return undefined;

  return {
    type: "text",
    value: source.slice(start, end),
    position: {
      start: { ...definition.position!.start },
      end: offsetPoint(definition, end),
    },
  };
}

function firstContentOffset(node: Positioned): number | undefined {
  const child = node.children?.[0] as Positioned | undefined;
  if (!child) return undefined;
  return firstContentOffset(child) ?? child.position?.start.offset;
}

function offsetPoint(
  definition: Positioned,
  offset: number,
): { line: number; column: number; offset: number } {
  const start = definition.position!.start;
  return {
    line: start.line,
    column: start.column + (offset - (start.offset ?? offset)),
    offset,
  };
}
