---
"@quartz-community/remark-obsidian": patch
---

A quote whose `[!type]` has a glued title is no longer treated as a callout.

`quotedTabCodeTransform` suppresses a reference on a tab-indented line under a callout, which is
correct and measured. Its own callout test stopped at the closing bracket:

    /^[ \t]*>[ \t]*\[![^\]]+\]/

so it matched `> [!note]Title`. A1 requires EOL, a space or a tab after `[!type]` and its
optional `+`/`-`, which `callout.ts:21` already enforces -- the glued spelling is a plain quote,
and Obsidian indexes the reference on its tab line at column 6. The pattern now carries the
same boundary.

    > [!note]Title / >⇥code[^2]    2@1:6   was none
    > [!note]      / >⇥code[^2]    none    unchanged
    > [!note] T    / >⇥code[^2]    none    unchanged
    > [!note]+     / >⇥code[^2]    none    unchanged
    > plain        / >⇥code[^2]    2@1:6   unchanged

    referee 6233 -> 6234 / 6818   +1 GAINED, 0 LOST
