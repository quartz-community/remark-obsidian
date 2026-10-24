---
"@quartz-community/remark-obsidian": patch
---

An indented-code block inside a list item is no longer mistaken for an unterminated fence.

`fenceOutlivesTransform` trimmed a code node's source before testing it for a fence opener, so
every indented-code block looked like one. A `code` node's slice is relative to its container, so
inside `- p` an opener written at six columns arrives as `    ~~~` — four spaces, which is
indented code and no fence at all. The pass then swallowed the lines after it:

    - p / blank / ⟨6sp⟩~~~ / lazy / [^1]: def / ⟨6sp⟩~~~

Obsidian reads `lazy` and the label as one paragraph and indexes `[^1]` as a bare reference at
column 0. We produced a single code node covering both and indexed nothing — text inside code is
literal, so the reference was invisible to the bare-reference scan.

The opener test is now bounded at three spaces, which is CommonMark's own rule. A leading tab is
four columns and correctly fails it too.

    referee 6208 -> 6229 / 6818   +23 GAINED, 2 LOST, by --ids identity
    probe:h3 family               8 of 48 failing -> 1
    main parity gate green, 457 tests, 0 probes drifted, 4 gates green
