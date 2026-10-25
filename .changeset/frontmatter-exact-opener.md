---
"@quartz-community/remark-obsidian": patch
---

Frontmatter opens only on an exact `---` first line.

`micromark-extension-frontmatter` accepts trailing whitespace on the opening fence, so `--- `
opened a YAML block and the body stopped being read as Markdown. Obsidian requires the line to
be exactly `---` (rule D2), and CommonMark agrees by a different route: `--- ` is an ordinary
thematic break there, since frontmatter is not a CommonMark construct at all. Both readings
agree, so this takes no option — it is the third defect of the same extension corrected in the
same block.

The test is spaces only. A carriage return still opens frontmatter, and tabs are left alone:
Obsidian does not make `---\t` a thematic break either, which is a separate divergence wanting a
different repair.

    referee 6238 -> 6239
    positioned-oracle ceilings   frontmatterPosition 2 -> 1, headings 1 -> 0, sections 3 -> 2
