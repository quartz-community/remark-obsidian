import { parseOurs } from "./chain.js";

export interface Point {
  readonly line: number;
  readonly column: number;
  readonly offset?: number;
}

/** `[name, line, column, lastLine]`, zero-based, as the recorded answers store it. */
export type Def = readonly [string, number, number, number];
/** `[name, line, column]`, zero-based. */
export type Ref = readonly [string, number, number];

export interface Facts {
  readonly defs: Def[];
  readonly refs: Ref[];
  readonly unplaced: number;
}

/**
 * Our footnote facts in the shape the referee's recorded answers use.
 *
 * Shared by `referee.mts` and `referee-shrink.mts`, and extracted the moment that mattered.
 * It began as a deliberate duplication -- `referee.mts` is a script that runs its
 * measurement on import, so there was nothing to import from it, and one copy for one caller
 * is cheaper than a module. Then the commented-definition rule landed in `referee.mts` only,
 * and the shrinker spent a run reducing notes against behaviour three commits old: its
 * output was still dominated by `%%`-above-label forms the rule had already closed.
 *
 * **Duplication is fine for one caller and a defect for two that must agree.** The cost is
 * not the copy, it is that nothing makes the copies diverge loudly.
 *
 * Two rules are encoded here and both are measured:
 *
 * - A definition inside a `%%` comment does not define. `parseComments` puts a comment's
 *   body in its `children` as real nodes, so a plain `visit` counts the buried definition
 *   and reports every such note as one where we invent a definition Obsidian lacks -- 247 of
 *   this corpus's disagreements, none of them real.
 * - ...and its label is still indexed as a REFERENCE. `> %%` over `[^3]: Text` reports no
 *   definition and a reference at 1:0, because the quoted `%%` runs to the end of the note,
 *   the definition fails, and the name is indexed anyway. Measured at +123 documents against
 *   7, where all 7 are notes with a fence inside the comment and our comment extent differs
 *   from Obsidian's.
 */
export function refereeFacts(text: string): Facts {
  const tree = parseOurs(text, "all-features");
  const defs: Def[] = [];
  const refs: Ref[] = [];
  let unplaced = 0;

  const walk = (node: unknown, inComment: boolean): void => {
    const candidate = node as {
      type?: string;
      identifier?: string;
      position?: { start: Point; end: Point };
      children?: unknown[];
    };
    const at = candidate.position;
    const id = () => String(candidate.identifier);

    if (candidate.type === "footnoteDefinition") {
      if (!inComment) {
        if (!at) unplaced += 1;
        else {
          defs.push([
            id(),
            at.start.line - 1,
            at.start.column - 1,
            at.end.line - 1,
          ]);
        }
      } else if (at) {
        refs.push([id(), at.start.line - 1, at.start.column - 1]);
      }
    } else if (candidate.type === "footnoteReference") {
      if (!at) unplaced += 1;
      else refs.push([id(), at.start.line - 1, at.start.column - 1]);
    }

    const buried = inComment || candidate.type === "comment";
    for (const child of candidate.children ?? []) walk(child, buried);
  };

  walk(tree, false);
  return { defs, refs, unplaced };
}
