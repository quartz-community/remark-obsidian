---
"@quartz-community/remark-obsidian": minor
---

Match Obsidian on display math, task bodies, tag boundaries and comment nesting.

**`$$…$$` is display math wherever it appears.** Obsidian renders `$$E=mc^2$$`,
`- $$x^2$$` and `# $$x^2$$` as display math inside the surrounding block, while
`micromark-extension-math` classifies by position and reports them as inline. An
`inlineMath` node whose source begins with two or more `$` now carries
`data.display = true` and renders with `math-display` rather than `math-inline`.
The node stays inline on purpose: Obsidian's own output is an inline element with
display styling, not a block.

**A task body is reparsed as block markdown.** `- [ ] 1.` nests an empty ordered
list inside the task item and `- [ ] > quote` nests a blockquote, matching
Obsidian; a body that stays a paragraph is left untouched. Controlled by the new
`taskReparse` option, on by default.

**Tag boundaries follow Obsidian.** `#tag#tag` is two tags rather than one, and a
tag may start directly after an inline construct, so `a**b**#next` and
`a[[t]]#next` tag `next` while `foo#next`, `(foo)#next` and `foo.#next` still do
not. Two causes: `#` and `*` are emoji keycap bases and so matched `\p{Emoji}`,
and the boundary is the end of a construct rather than the character before it.

**A comment that could close on its own line is inline.** Obsidian prefers an
inline comment whenever one would close on the opening line, so `%%text%%` alone
on a line is a paragraph containing a hidden comment rather than a block comment.
A block comment now only wins when the comment spans lines. This changes the block
structure such input produces, though the rendered text is unaffected.

Two notes on scope. The inline-math flanking gate added previously is bypassed
when a consumer also registers stock `remark-math` for `$`, because micromark
falls through to the ungated construct; resolving that needs the duplicate
registration removed upstream. And `micromark-extension-math` asserts its own
`previous` guard internally, so the remaining mismatched-delimiter cases such as
`$x^2$$` cannot be fixed by gating it from outside.
