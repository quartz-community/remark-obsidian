---
"@quartz-community/remark-obsidian": patch
---

The definition-trim pass derives its columns from offsets.

Both of its column reads are branches, so a stale column from an earlier offset-only move
could not be repaired downstream. Currently behaviour-neutral; the defect was latent.
