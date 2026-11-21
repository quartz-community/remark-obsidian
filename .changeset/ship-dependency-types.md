---
"@quartz-community/remark-obsidian": patch
---

Types: `math` and `inlineMath` nodes are typed without an extra import. Both presets build them, but the declarations never mentioned `mdast-util-math`, so `node.type === "inlineMath"` did not narrow unless the consumer also imported `mdast-util-math`. The package now exports `Math` and `InlineMath`, which brings that package's `mdast` augmentation along with the plugin, as `remark-math` does. The packages the declarations import (`@types/mdast`, `@types/unist`, `micromark-util-types`, `mdast-util-from-markdown`, `mdast-util-math`) are now `dependencies`, so they resolve under a strict package manager (pnpm with `hoist=false`, Yarn PnP), where they used to fail and leave the types as `any`. The runtime code is unchanged: `dist/*.js` is byte-identical.
