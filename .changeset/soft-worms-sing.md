---
"@quartz-community/remark-obsidian": patch
---

Pair `%%` comment markers lexically, so a region whose opener a container
swallowed is rebuilt.

Obsidian pairs `%%` over the raw source: the first opens, the next closes, and
block structure has no say. Ours is a micromark construct, so a container can
take an opener as ordinary content — a definition's indented `    %%` becomes
part of the definition — and the _closer_ is then read as the next opener, which
shifts every marker after it by one. No transform over the resulting tree can
repair that, because the tree no longer records where the regions were.
Recomputing them from source does.

Three rules, each one measured after a wrong guess cost cases that already
matched:

- Pairing resumes on the **next line** after a closer, not straight after it. A
  comment ending mid-line leaves the rest of that line as prose, and a `%%`
  inside it is literal.
- An **unclosed** region does not run to the end of the note. `> %%` alone
  leaves a definition further down alive.
- A region does not swallow a line that **opens a block of its own**.
  `[^9]: orphan` / `    %%` / `[^1]: one` / `%%` is two definitions and no
  comment, where the same shape over plain prose is one definition holding the
  whole region.

The rewrite only fires on the mis-pairing signature — a comment node touching
the region at its start or closer without covering it — so a `%%` shielded by a
code span or fence, where no comment node exists, is left alone.

Three corpus cases.
