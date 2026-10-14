/**
 * The tree's structural invariants, shared so more than one corpus can be held to them.
 *
 * Extracted from `invariants.test.ts` because it walked the 3,403 GOLDEN cases and nothing
 * else, and that is a limit rather than a property: the check is sound and its input was
 * narrow. `compose.ts` generates 1,152 further documents that no gate had ever walked, and
 * the first one examined by hand held a `footnoteDefinition` with start offset 16 and END
 * OFFSET 15 -- a span that begins after it finishes, which this file's own first assertion
 * tests for and which therefore passed only because the document was not in the corpus.
 *
 * In a shared module rather than exported from the test, because importing a `*.test.ts`
 * registers its suites a SECOND time -- measured earlier the same day, when the overview's
 * seven checks reported as eleven after it imported `compute.test.ts` for one array.
 */

interface Point {
  readonly line: number;
  readonly column: number;
  readonly offset?: number;
}

interface Spanned {
  readonly type?: string;
  readonly position?: { readonly start: Point; readonly end: Point };
  readonly children?: readonly unknown[];
}

/**
 * Every way a tree can contradict itself, by OFFSET.
 *
 * Offsets rather than lines on purpose: `normalizePointsTransform` runs last and rebuilds
 * line and column from them, so an offset is the field a pass is obliged to keep honest and
 * the one a consumer splices on. A reversed line pair with sane offsets is a repair the last
 * pass performs; a reversed OFFSET pair is a defect no pass can recover from.
 */
export function violationsOf(markdown: string, tree: unknown): string[] {
  const found: string[] = [];
  const walk = (node: unknown, parent: Spanned | null): void => {
    const self = node as Spanned;
    const mine = self.position;
    const theirs = parent?.position;
    if (mine?.start.offset !== undefined && mine.end.offset !== undefined) {
      if (mine.start.offset > mine.end.offset) {
        found.push(`start AFTER end: ${self.type}`);
      }
      if (mine.end.offset > markdown.length) {
        found.push(`end PAST source: ${self.type}`);
      }
      if (
        theirs?.start.offset !== undefined &&
        theirs.end.offset !== undefined
      ) {
        if (mine.start.offset < theirs.start.offset) {
          found.push(
            `child STARTS BEFORE parent: ${parent?.type} > ${self.type}`,
          );
        }
        if (mine.end.offset > theirs.end.offset) {
          found.push(`child ENDS AFTER parent: ${parent?.type} > ${self.type}`);
        }
      }
    }
    const kids = (self.children ?? []) as Spanned[];
    for (const [index, left] of kids.entries()) {
      const right = kids[index + 1];
      if (!right) break;
      const leftEnd = left.position?.end?.offset;
      const rightStart = right.position?.start?.offset;
      if (
        leftEnd !== undefined &&
        rightStart !== undefined &&
        leftEnd > rightStart
      ) {
        found.push(
          `SIBLINGS OVERLAP: ${self.type} > ${left.type}/${right.type}`,
        );
      }
    }
    for (const kid of kids) walk(kid, self);
  };
  walk(tree, null);
  return found;
}
