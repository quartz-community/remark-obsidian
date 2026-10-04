---
"@quartz-community/remark-obsidian": patch
---

Keep scanning a highlight past a closer that would end in whitespace.

The scanner rejected the whole attempt when the content was bounded by
whitespace. That is right for leading whitespace — no later closer can repair
it — but wrong for trailing: Obsidian carries on and may close further along.
`===` / `[^2]: b` / `===` closes on the _last_ two markers, because stopping at
the first leaves content ending in a newline, while taking the next `=` into
it lands on a closer that does not.

No corpus case moves today. The shape that exposed it needs the folded
paragraph's inline content re-tokenized before the run is ever visible to a
tokenizer, which is a larger change than one case warrants. The scanner is
nonetheless wrong as written, and is tested directly.
