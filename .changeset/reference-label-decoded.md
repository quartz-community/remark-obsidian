---
"@quartz-community/remark-obsidian": patch
---

A relabelled reference writes a decoded label, so formatting terminates.

`labelPrecedenceTransform` built a `linkReference` whose `label` was the raw bracket scan,
and `label` is the field handed to the escaper -- so `[bar][foo\!]` had its backslash
escaped again on every format pass, doubling without bound. The label is now decoded while
the `identifier` stays raw, which is the asymmetry Obsidian needs: decoding the identifier
resolves the reference against `[foo!]` and turns a dangling reference into a link.

With this, no corpus case grows without bound any more.
