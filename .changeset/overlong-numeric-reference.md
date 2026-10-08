---
"@quartz-community/remark-obsidian": patch
---

A numeric character reference with too many digits decodes to U+FFFD.

`&#87654321;` renders as the replacement character in Obsidian. micromark caps a numeric
reference at seven digits for decimal and six for hexadecimal and refuses anything longer,
leaving it literal; the cap is on digits, not on the value, so `&#0;` and `&#x110000;`
already decoded correctly.
