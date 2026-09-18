## 1.1.0

### Minor Changes

- cfe8d89: Add helpers for finding wikilinks and embeds in a tree.

  `collectWikilinks(tree, { embedded })` returns wikilink nodes in document order,
  optionally filtered to embeds or plain links. `collectEmbedPaths(tree)` returns
  the target of every embed, covering both `![[target]]` wikilinks and mdast's own
  `image` nodes, deduplicated and in document order. `isWikilink` and `isEmbed`
  are exported as type guards.

  Consumers previously had to hand-roll a visit and know that `embedded === true`
  is what separates an embed from a link, so that rule was duplicated in every
  dependent. It now lives in the package that defines the node.

  Because these walk the tree rather than the source text, content inside fenced
  and inline code is excluded structurally: it parses to `code` nodes and is never
  visited.

## 1.0.0

### Major Changes

- Stable 1.0 release. All `@quartz-community/*` dependencies now use `^1.0.0` ranges.

  Pre-1.0 caret ranges pinned the minor version (`^0.2.1` means `>=0.2.1 <0.3.0`), so
  published fixes to shared packages could never be resolved by dependents. Moving the
  ecosystem to 1.0 makes caret ranges behave conventionally.
