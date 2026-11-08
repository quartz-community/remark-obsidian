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
 *
 * A NESTED LABEL AT COLUMN 0 is the second case, and it is E4 rather than E2. A
 * definition's enders are only read within its first 1,024 characters, so where a
 * definition's text runs longer than that, a following `[^9]:` at column 0 cannot
 * end it -- the label is swallowed as text and indexed as a bare reference
 * instead. Our parser nests it as a definition, which is both a surplus
 * definition and a lost reference. One position in 6,818 documents, and nesting
 * is what identifies it: an ordinary column-0 label ends its predecessor and
 * becomes a ROOT definition, so it never reaches this pass.
 *
 * It is measured on the referee's assertion figure rather than its document
 * figure -- 23347 -> 23348, with the document itself still blocked by a root
 * `code` divergence thirty lines away, which is a separate open family. Verified
 * through the referee's own extractor rather than a hand-rolled compare, since
 * the one in this file's history disagreed with the oracle four times.
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

/**
 * The first nested definition that continues the line above, in document order. Searched on an
 * explicit stack, in a recursive search's order, without a frame per level.
 */
function find(
  root: Parent,
  inRootDefinition: boolean,
  lines: string[],
): { parent: Parent; index: number } | undefined {
  if (!Array.isArray(root.children)) return undefined;
  const pending: Array<{ node: Parent; inDefinition: boolean; next: number }> =
    [{ node: root, inDefinition: inRootDefinition, next: 0 }];
  while (pending.length > 0) {
    const top = pending[pending.length - 1]!;
    const { node, inDefinition } = top;
    const index = top.next;
    const child = node.children?.[index];
    if (child === undefined) {
      pending.pop();
      continue;
    }
    top.next = index + 1;
    const isDefinition = child.type === "footnoteDefinition";
    if (isDefinition && inDefinition && continues(child, lines))
      return { parent: node, index };
    if (Array.isArray((child as Partial<Parent>).children)) {
      pending.push({
        node: child as Parent,
        inDefinition: inDefinition || isDefinition,
        next: 0,
      });
    }
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
  if (column === 1) return raw.startsWith("[^");
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

/** The offset of the deepest first descendant that has one, read down a loop, not a recursion. */
function firstContentOffset(node: Positioned): number | undefined {
  const chain: Positioned[] = [];
  for (
    let child = node.children?.[0] as Positioned | undefined;
    child;
    child = child.children?.[0] as Positioned | undefined
  ) {
    chain.push(child);
  }
  for (let at = chain.length - 1; at >= 0; at--) {
    const offset = chain[at]!.position?.start.offset;
    if (offset !== undefined) return offset;
  }
  return undefined;
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
