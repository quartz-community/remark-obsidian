---
"@quartz-community/remark-obsidian": minor
---

Let an email autolink hold a backslash

`<foo\+@bar.example.com>` links to `mailto:foo\+@bar.example.com` and shows the
backslash, as `remark-parse@8` does. CommonMark reads `\+` as an escaped plus, fails the
email pattern, and leaves the brackets as text.

The failure is worse than a missing link. `<a\b@c.test>` escaped the `b`, dropped `<a\` as
text, and GFM then autolinked the remaining `b@c.test` — a working link to an address that
is not in the document.

Scoped to the email branch, because that is the whole measured divergence: a URI autolink
already keeps its backslash, and so does `mailto:`. New `legacyAutolinks` option, on by
default.
