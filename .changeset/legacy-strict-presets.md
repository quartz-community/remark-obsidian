---
"@quartz-community/remark-obsidian": minor
---

Added a `preset` option with two values, `legacy` and `strict`.

`legacy` is the default and is every option at the value the parity corpus is measured
against, so nothing changes for an existing consumer. `strict` keeps Obsidian's syntax --
wikilinks, embeds, callouts, tags, `%%` comments, `==highlights==`, `$math$`, frontmatter --
while parsing everything CommonMark and GFM already define the way they define it, which is
what a consumer outside Obsidian usually wants.
