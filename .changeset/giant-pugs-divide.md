---
"@quartz-community/remark-obsidian": patch
---

Tokenize `==highlight==` the way Obsidian does, and fix a crash on any span that
crosses a line ending.

Highlight was a CommonMark attention construct. Obsidian scans forward instead,
using `remark-parse@8`'s `strong.js` without its `charAt(index + 2) !== marker`
guard: close at the first `==`, and fail the whole attempt when the content
would be empty. That failure is what makes an over-long run behave — in
`====text==` the attempt at the first `=` dies on empty content, so the retry one
character along leaves a literal `=` and highlights `=text`.

Two rules the attention model had been providing for free now have to be stated,
and both were measured rather than assumed: content may not begin or end with
whitespace (`== text==` and `==text ==` highlight nothing), and the surplus of a
doubled closing run stays literal.

Scanning raw codes also removes the dedicated backslash construct added
alongside the escaped-closer work. `==text\==` closes on the escaped run and
keeps `text\`, because the scan never consults CommonMark's escape rules;
`\==text==` never opens, because micromark's own escape consumes that `=` before
this construct is tried. The opener/closer asymmetry now falls out rather than
being special-cased.

**This also fixes a crash shipped with the emphasis port.** Both legacy ports
decide a whole match up front and then consume it, which swallowed line endings
inside the span's text token. That desynchronizes micromark's chunked token
chain and throws `expected no next token` from `subtokenize`, far from the
construct responsible — so _any_ multi-line `*a\nb*`, `**a\nb**` or `==a\nb==`
crashed. The shared `planBody` helper now splits a match into `lineEnding`,
`text` and trailing-`data` segments, and both constructs walk it. No corpus case
covered a multi-line span, which is why the gate stayed green; there are
regression tests for it now.

Two corpus cases.
