---
"@quartz-community/remark-obsidian": patch
---

Fixed a crash on a kept `%%` comment inside a list item.

`- <!--` over an indented body puts a `comment` node — a leaf — where `trailingEmptyItem`
assumed a `listItem`, so it threw on `item.children.length`. Seventeen documents in the
referee corpus crashed on this, all one bug.
