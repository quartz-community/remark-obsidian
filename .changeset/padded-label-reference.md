---
"@quartz-community/remark-obsidian": patch
---

A shortcut reference whose label carries padding no longer resolves in `legacy`.

CommonMark normalises a link label before matching it — trim, then collapse internal whitespace
— so `[ a ]` pairs with `[a]: /url` and renders as a link. Obsidian does neither, so the label
`a` never matches the definition `a` and the brackets stay literal. Item 18a of a reviewer's
issue list, and the DOM oracle confirms it: `text` is `"[ a ]"`.

A whitespace-only label is excluded, and that narrowing is load-bearing. Of the three padded
labels in 3,457 corpus cases, two were already `match` and depend on the current behaviour —
`[\n ]` renders nothing in Obsidian, which `blank-label-reference.ts` owns from the other side.

`strict` is unaffected: CommonMark's normalisation is correct off-platform, so the pass is gated
on `legacyLinkDefinitions`.

    probe/external-gap/padded-label-defined   replicate -> match
    round-trip unstable set                   20 -> 19
