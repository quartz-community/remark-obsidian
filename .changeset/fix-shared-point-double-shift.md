---
"@quartz-community/remark-obsidian": patch
---

Never shift a position point twice when a parent and child share one.

`quoteLazyIndentedCodeTransform` re-parses whatever a quote held after an indented run and rebases
the fragment onto the document with `shiftBy`. For a one-line quoted fragment, `reparse` returns a
`blockquote` whose `position` **is the same object** as its `code` child's — verified by reference
equality, not inferred. The plain recursion therefore wrote `+offset` at the quote and again at
the code, turning `[0..3]` into `[160..163]` on a 134-character note: a span past the source,
which `invariants.test.ts` asserts can never happen.

`shiftBy` now tracks visited point objects in a `WeakSet` and shifts each at most once.

<!-- prettier-ignore -->
```
structurally impossible positions   1 document / 2 kinds  ->  0
  combined with the previous fix, all 33 violations on all 8 documents are gone
legacy referee                      6208/6818, BYTE-IDENTICAL
```

The eight sources stay recorded with no expected violations. Emptying the list would delete the
only inputs in CI that exercise either fix, since the referee corpus they came from is not
vendored.
