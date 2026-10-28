---
"@quartz-community/remark-obsidian": patch
---

Read four character rules as Obsidian does, found by sweeping one character at a time against
the app.

- A wikilink's or embed's resolved target is NFC-normalized, so `[[café]]` written with a
  combining accent links to the composed `café`, as in Obsidian. What the link displays keeps the
  author's spelling. Both presets.
- U+2028 and U+2029 end a wikilink, as a line ending does: a link whose target holds one is no link. U+0085
  stays inside one. Both presets.
- A task box holds one UTF-16 unit that is not a line terminator: a box holding U+2029 is no task
  under `strict` either (it already was not under `legacy`).
- Under `strict`, footnote labels match and are named lowercased, not case-folded:
  `[^ßb]` no longer reaches a `[^SSB]` definition, and `[^aᾭb]` is named `aᾥb`.
