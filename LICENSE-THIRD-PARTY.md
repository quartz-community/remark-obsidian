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

None of this is published to npm; `package.json` ships `dist` only.

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
