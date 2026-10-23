/**
 * Documents that produce a STRUCTURALLY IMPOSSIBLE position, vendored so CI can see them.
 *
 * `invariants.test.ts` already asserts this class is EMPTY -- `expect(offenders).toEqual([])`
 * over `end PAST source` and `start AFTER end` -- but it iterates `golden.cases`, which is
 * 3,448 of the 6,818 documents the referee holds. Running the SAME checks over the referee
 * corpus for the first time found 33 violations on these 8 documents, so the project asserts a
 * property it could not back.
 *
 * The referee corpus is not vendored -- it belongs to a sibling project on its own release
 * cycle -- so the sources are copied here instead. That costs 2,387 characters and makes the
 * defect visible without Obsidian, without a recording, and without the sibling checkout.
 *
 * WHY THIS IS NOT PARITY DEBT. A node whose start is after its end, or whose span runs past the
 * source, is wrong whatever Obsidian reports. `legacy` promises exact positions because
 * consumers index by them: `obsidian-linter` splices by offset, so such a node corrupts an edit
 * rather than merely misreporting one. This list should reach zero, unlike a parity ceiling.
 *
 * SEVEN OF THE ORIGINAL EIGHT ARE FIXED, and the ratchet is what reported it: clamping a
 * descendant's end only when its START is at or before the new reach -- see
 * `definition-end-before-label.ts` -- removed every `start AFTER end` violation, 31 of the 33.
 * What remains is `end PAST source`, a different class with a different cause.
 *
 * Recorded as an exact two-way ratchet. Fixing a document fails the test and asks for its entry
 * to be deleted; a new defect fails it too.
 */
export const POSITION_DEFECTS: ReadonlyArray<
  readonly [id: string, markdown: string, kinds: readonly string[]]
> = [
  [
    "fuzz:20261003-600",
    "Opening [^a] and [^1]\n\nSome words\n\n---\n\n> [!tip]\n>\n\n>\t>\t[^3]: body text\n    ```\n>\t>\n\tProse hereend.[^3]\n\n[^Note]: More %% [^2] %% [^3]",
    ["end PAST source: blockquote", "end PAST source: code"],
  ],
];
