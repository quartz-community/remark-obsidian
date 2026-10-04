---
"@quartz-community/remark-obsidian": major
---

Stop crashing on a task list in the real pipeline.

Three transforms re-parsed a fragment with `self.runSync(self.parse(md), md)`,
where `self` is the whole processor. `runSync` refuses as soon as that
processor holds an asynchronous plugin — `rehype-obsidian` is one in the
Quartz chain — so **any task list, or any `%%` comment with a tail, threw
`runSync finished async`** rather than rendering.

Every mdast-level test passed throughout, because the parity harness builds a
markdown-only processor where nothing is async. Only driving the full chain
end to end exposed it.

A fragment is now re-parsed through this plugin's own passes, recursing into
its transform rather than running the entire processor. That stays
synchronous, and fragments only ever shrink, so it terminates for the same
reason the previous call did. Obsidian parity is unchanged at 2070 of 2211
with no regressions, which also shows the fragment never needed the rest of
the chain's transforms.
