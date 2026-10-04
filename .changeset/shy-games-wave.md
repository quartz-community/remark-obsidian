---
"@quartz-community/remark-obsidian": patch
---

Absorb an indented continuation into the footnote definition above it.

`micromark-extension-gfm-footnote` takes a definition's indented continuation
while parsing, so `[^1]: a` / blank / `    more` is one definition holding two
blocks. A definition produced by a transform was never seen by that parser —
splitting `%% [^1]: body` off a comment closer is the case — so its
continuation stayed a sibling and surfaced as a root-level code block, whose
text Obsidian never shows.

The four-space indent is stripped before re-parsing, so the result matches
what the parser would have built: four spaces is a paragraph, eight is still
code. Only a block separated by exactly one blank line is taken, and only an
indented one — an unclosed fence is also a `code` node with no language, and
swallowing it would hide content Obsidian renders.
