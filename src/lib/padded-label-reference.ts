import type { Root, RootContent, Text } from "mdast";
import { visit } from "unist-util-visit";

/**
 * A SHORTCUT reference whose label carries padding does not resolve.
 *
 * CommonMark normalises a link label before matching it -- trim, then collapse internal
 * whitespace -- so `[ a ]` pairs with `[a]: /url` and renders as a link. Obsidian does
 * neither, so the label ` a ` never matches the definition `a` and the brackets stay
 * literal. Their issue list states it as 18a and the DOM oracle confirms it: `text` is
 * `"[ a ]"`, not `"a"`.
 *
 * WHITESPACE-ONLY IS EXCLUDED, and that narrowing is load-bearing rather than tidy. Of the
 * three padded labels in 3,457 corpus cases, two are `match` and depend on the current
 * behaviour:
 *
 *     `[ a ]`  / `[a]: /url`      obs text `"[ a ]"`           the one case this fixes
 *     `[\n ]`  / `[\n ]: /uri`    obs text `""`                MATCH -- renders nothing
 *     `[^ ]`   / `[^ ]: x`        obs text `"[^ ] [^ ]: x"`    MATCH
 *
 * A label that trims to empty is a different rule and `blank-label-reference.ts` owns it,
 * gating on a definition with that exact identifier existing. Firing here as well would
 * take `commonmark/links/552` from `match` to failing, which is the trade this file refuses
 * elsewhere: one `replicate` case is not worth one `match` case.
 *
 * SHORTCUT FORM ONLY. A full reference spells its label separately (`[text][ a ]`) and the
 * raw slice then holds both brackets, so requiring the slice to be exactly `[` + label + `]`
 * keeps the predicate to the shape measured. No corpus case exercises a padded full
 * reference, so widening it would be unmeasured.
 *
 * RUNS LATE, after every pass that CREATES a reference. `blankLabelReferenceTransform` and
 * `labelPrecedenceTransform` both build `linkReference` nodes, and a demotion placed before
 * them is undone -- the same circular revival that measured `night:ct`'s fix inert, where
 * `calloutTransform` demoted a reference and `bareFootnoteRefTransform` rebuilt it from the
 * literal text.
 */
export function paddedLabelReferenceTransform(
  tree: Root,
  source: string,
): void {
  if (source === "") return;

  visit(tree, "linkReference", (node, index, parent) => {
    if (!parent || typeof index !== "number") return;

    const from = node.position?.start?.offset;
    const to = node.position?.end?.offset;
    if (from === undefined || to === undefined) return;

    const raw = source.slice(from, to);
    if (!raw.startsWith("[") || !raw.endsWith("]")) return;

    const label = raw.slice(1, -1);
    // Padded, and holding something other than whitespace. The second test is what keeps
    // `[\n ]` and `[^ ]`-shaped whitespace-only labels out; see the table above.
    if (label === label.trim() || label.trim() === "") return;

    const literal: Text = {
      type: "text",
      value: raw,
      ...(node.position ? { position: node.position } : {}),
    };
    (parent.children as RootContent[]).splice(index, 1, literal);
    return index;
  });
}
