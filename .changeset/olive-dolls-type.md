---
"@quartz-community/remark-obsidian": patch
---

Give a callout's title and body the spans they actually occupy.

Promoting a blockquote into a callout consumed `[!note] ` off the front of the
first text node and moved the title into `calloutTitle`, but left every
position where it was. The body paragraph went on claiming
`[!note] Title\n> Body` while holding only `Body`, and `calloutTitle` carried
no position at all, so a consumer splicing by position would overwrite the
title with the body.

Both now match their content, including a callout nested in a list item, where
the continuation prefix is ` >` and the body's start has to be read from the
source rather than counted in the text value.

No change to parsing or to any projection: Obsidian parity holds at 1135/1141.
