---
"@quartz-community/remark-obsidian": patch
---

Test the seam with `rehype-obsidian`, and pin the crash it found.

Every other test projects from mdast, which measures the parser well but
never exercises the hand-off: this package emits a node, `remark-rehype`
converts it, `rehype-raw` re-parses that through HTML, and only then does
`rehype-obsidian` see it. `renderOurs` has run that full chain since the
first commit and nothing ever called it.

Calling it found a live bug. Three transforms re-parse a fragment with
`self.runSync(self.parse(md), md)`, where `self` is the whole processor — and
`runSync` refuses as soon as that processor holds an async plugin, which
`rehype-obsidian` is. A task list item or a `%%` comment with a tail
therefore throws in the real Quartz chain. It was invisible because the
harness builds a markdown-only processor, where no async plugin exists.

Pinned as a failing-by-design test rather than patched: re-parsing through
something narrower than `self` changes which transforms a fragment sees,
`remark-breaks` among them, so it needs measuring against the corpus.

Assertions covering unreleased sibling behaviour run against a locally built
`../rehype-obsidian` when present and skip otherwise, and CI now builds it.
