# Third-party licences

## obsidian-footnotes

Two things come from
[`obsidian-footnotes`](https://github.com/Comprehensive-Jason/obsidian-footnotes),
both contributed for this purpose.

`test/parity/corpus-hunt.ts` holds structural markdown fixtures harvested from that
project's `test/hunt/` regression pins. They cover block-structure edges a generated
corpus does not reach.

`test/parity/referee-answers/` is its `test/obsidian-answers/` directory vendored
verbatim — 6,818 documents with the `metadataCache` answers real Obsidian gave for
each. This IS that project's recorded measurement, not just its inputs, and it is
what `referee.mts` and eight sibling instruments compare against. Kept
byte-identical (see `.prettierignore`) so a diff against upstream shows answers
changing and nothing else. The only local change is that `refsTrustworthy` is
populated where upstream leaves it `null`, written by `recorder.mts`.

None of that is published to npm; `package.json` ships `dist` only.

A third thing IS published. `src/rp8/reader.ts`, the `legacy` preset's parser, ports the
Obsidian readers of that project's `src/parsing/obsidian-markdown.ts` -- `%%` comments, callout
titles, table pipe styles, wikilinks, frontmatter, `$$` inline math -- and `src/rp8/list.ts`
follows its `remark-parse-list.js` in changing remark-parse 8's list reader. Both are bundled
into `dist`, under this licence.

```
MIT License

Copyright (c) 2021-2026 Alexis Rondeau, Micha Brugger, Jason Qin, and contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## micromark-extension-math

`src/lib/syntax/math-text.ts` is adapted from
[`micromark-extension-math`](https://github.com/micromark/micromark-extension-math).
Its tokenizer and resolver were vendored so Obsidian's inline-math rules could be
implemented directly; see the file header for the specific divergences.

```
(The MIT License)

Copyright (c) 2020 Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## remark-parse 8 and its companions

`src/rp8/vendor/` vendors remark-parse 8.0.3, remark-footnotes 2.0.0, remark-math 3.0.1 and
parse-entities 2.0.0 with the v1 entity tables, converted to ESM; `src/rp8/vendor/helpers.ts`
rewrites the small packages they required (trim, repeat-string, xtend, is-whitespace-character,
is-word-character, is-decimal, is-alphabetical, is-hexadecimal, is-alphanumerical,
trim-trailing-lines, collapse-white-space, ccount, state-toggle, markdown-escapes, vfile-location,
unist-util-remove-position). `src/rp8/list.ts` and `src/rp8/remove-indentation.ts` are
remark-parse 8 files with Obsidian's changes. All are bundled into `dist`. Each is MIT:

- remark-parse 8.0.3 -- Copyright (c) 2014-2020 Titus Wormer <tituswormer@gmail.com>;
  Copyright (c) 2011-2014, Christopher Jeffrey (https://github.com/chjj/)
- remark-footnotes 2.0.0 -- Copyright (c) 2020 Titus Wormer <tituswormer@gmail.com>
- remark-math 3.0.1 -- Junyoung Choi <fluke8259@gmail.com> (its `package.json`; the published
  tarball carries no licence file)
- parse-entities 2.0.0 -- Copyright (c) 2015 Titus Wormer <tituswormer@gmail.com>
- character-entities 1.2.4, character-entities-legacy 1.1.4, character-reference-invalid 1.1.4
  -- Copyright (c) 2015 Titus Wormer <tituswormer@gmail.com>
- the helper packages above: vfile-location, state-toggle, ccount, markdown-escapes and the
  is-* predicates follow Titus Wormer's MIT sources closely; trim, repeat-string and xtend are
  replaced by `String.prototype.trim`, `String.prototype.repeat` and a plain property copy, so
  no code of theirs is included

```
(The MIT License)

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
