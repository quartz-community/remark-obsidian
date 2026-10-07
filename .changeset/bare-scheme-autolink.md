---
"@quartz-community/remark-obsidian": patch
---

Stop autolinking a bare URI scheme, matching Obsidian.

Obsidian's tokenizer requires `@` or `://` before it will call a `<…>` an autolink, so
`<a+b+c:d>` and `<localhost:5001/foo>` are ordinary text there. Stock micromark needs only
a `:`, and linked both.

`<mailto:a@e.test>` is unaffected: it holds an `@` and goes through the email branch
instead, which is why every recorded case with a `//`-less scheme already matched.
