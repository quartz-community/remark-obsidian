---
"@quartz-community/remark-obsidian": patch
---

Decide link reference definitions the way `remark-parse@8` does.

Obsidian's definition rules are the inverse of CommonMark's in both directions,
so no partial guess reproduces them:

- a label may contain a nested `[`, because the scan breaks only on `]`, so
  `[a[b]: /url` **is** a definition where CommonMark says it is not;
- a destination may not contain `[` or `]` at all, enclosed or otherwise, so
  `[foo]: [^9]` and `[foo]: <[^9]>` are **not** definitions where CommonMark
  says they are;
- a title has no backslash escaping and must end its line, so `[foo]: /url`
  over `"a \" b"` closes at the inner quote, finds `b` still to come, and
  rejects the whole thing.

`src/lib/legacy-definition.ts` ports `lib/tokenize/definition.js` verbatim,
reduced to the non-commonmark path, and answers only whether a span is a
definition. A `definition` node it rejects is rebuilt as the prose Obsidian
shows: line by line, because re-parsing the span whole would just produce the
same definition again, and a line that still parses as one contributes its raw
text — which the bare-reference pass then reduces, so `[^1]: x` reads `1: x`.

Four corpus cases, closing the `lrd-destination-reference` and
`lrd-title-escapes` families.
