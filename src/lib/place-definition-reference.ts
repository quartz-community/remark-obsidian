import type { Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface Positioned {
  type: string;
  identifier?: string;
  position?: {
    start: { line: number; column: number; offset?: number };
    end: { line: number; column: number; offset?: number };
  };
  children?: Positioned[];
}

/**
 * Give an unplaced reference inside a footnote definition its source position.
 *
 * `bareFootnoteRefTransform` splices a reference whose offsets `alignToSource`
 * could not establish, and an unplaced node is invisible to the metadata oracle --
 * which is how a reference we found is then reported as missing.
 *
 * THE OFFSET IS DERIVED FROM THE SOURCE, not from the oracle's answer. Scanning for
 * the label's own `[^name]` and discarding occurrences a placed reference already
 * owns leaves a unique candidate for 47 of the 52 unplaced references in the corpus,
 * and where Obsidian indexes a reference at all it is ALWAYS that candidate: 30 of 30
 * matched, with none landing on a position carrying a different name. So the offset
 * question is settled; what remains is whether to place at all.
 *
 * SCOPED TO A `footnoteDefinition` HOST, which is the only subset that is clean.
 * Obsidian indexes the reference at every unplaced position inside a definition and
 * declines some elsewhere, so the host is the decision:
 *
 *     footnoteDefinition    refs 3 / 0     documents 2 gain / 0 break
 *     blockquote            refs 11 / 1    documents 2 gain / 1 break
 *     both                  refs 14 / 1    documents 4 gain / 1 break
 *
 * Adding blockquote buys two more documents and breaks one, which is the trade this
 * package refuses -- and the broader rule is worse still: placing every unplaced
 * reference is roughly +12/-8, the same 60% that the two refusals recorded in
 * `alignToSource`'s docstring died at, where they cost 43 and 14 documents.
 */
export function placeDefinitionReferenceTransform(
  tree: Root,
  source: string,
): void {
  const taken = new Set<string>();
  visit(tree, "footnoteReference", (node: Node) => {
    const at = (node as Positioned).position?.start;
    if (at) taken.add(`${String(at.line)}@${String(at.column)}`);
  });

  const lineStarts = starts(source);
  walk(tree as unknown as Positioned, false, source, lineStarts, taken);
}

function walk(
  node: Positioned,
  inDefinition: boolean,
  source: string,
  lineStarts: number[],
  taken: Set<string>,
): void {
  if (
    inDefinition &&
    node.type === "footnoteReference" &&
    node.position === undefined
  ) {
    const spot = unique(node.identifier ?? "", source, lineStarts, taken);
    if (spot) {
      node.position = spot;
      taken.add(`${String(spot.start.line)}@${String(spot.start.column)}`);
    }
    return;
  }

  const nested = inDefinition || node.type === "footnoteDefinition";
  for (const child of node.children ?? [])
    walk(child, nested, source, lineStarts, taken);
}

function unique(
  identifier: string,
  source: string,
  lineStarts: number[],
  taken: Set<string>,
): NonNullable<Positioned["position"]> | undefined {
  const label = `[^${identifier.toLowerCase()}]`;
  const found: Array<{ line: number; column: number; offset: number }> = [];

  for (const [index, from] of lineStarts.entries()) {
    const to = lineStarts[index + 1] ?? source.length + 1;
    const line = source.slice(from, to - 1).toLowerCase();
    let at = line.indexOf(label);
    while (at !== -1) {
      found.push({ line: index + 1, column: at + 1, offset: from + at });
      at = line.indexOf(label, at + 1);
    }
  }

  const free = found.filter(
    (f) => !taken.has(`${String(f.line)}@${String(f.column)}`),
  );
  const only = free.length === 1 ? free[0] : undefined;
  if (!only) return undefined;

  return {
    start: { ...only },
    end: {
      line: only.line,
      column: only.column + label.length,
      offset: only.offset + label.length,
    },
  };
}

function starts(source: string): number[] {
  const out = [0];
  for (
    let at = source.indexOf("\n");
    at !== -1;
    at = source.indexOf("\n", at + 1)
  )
    out.push(at + 1);
  return out;
}
