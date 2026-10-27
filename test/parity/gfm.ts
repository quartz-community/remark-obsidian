/**
 * The GFM spec's EXTENSION examples, every one of them.
 *
 * `commonmark.ts` carries the 652 CommonMark examples and structurally cannot adjudicate a GFM
 * extension: GFM is "a strict superset of CommonMark" (spec §1.1), so tables, task list items,
 * strikethrough, extended autolinks and disallowed raw HTML appear in NO CommonMark example.
 * Passes implementing them were unreachable by that differential -- "owns no spec example" meant
 * "the spec has no coverage there", which is not the same claim as "this agrees".
 *
 * Only the 24 tagged examples are taken. The rest of the GFM spec IS CommonMark 0.29, and
 * `commonmark.ts` already carries 0.31.2, which is newer.
 *
 * `cmark-gfm` marks these by tagging the example fence with the extension name -- `example table`
 * rather than bare `example` -- which is how `spec_tests.py` filters them, and it is a more exact
 * selector than matching section headings. Anchoring the fence pattern as `example$` silently
 * excludes all 24 and reports a clean zero.
 *
 * Expected HTML is discarded, as in `commonmark.ts`: the oracle is stock `remark-parse` +
 * `remark-gfm`, and what the spec supplies is coverage of the input space.
 *
 * Generated from https://raw.githubusercontent.com/github/cmark-gfm/master/test/spec.txt
 * (version 0.29-gfm), with its `\u2192` tab convention expanded as `spec_tests.py` does.
 */
export const GFM_SPEC_EXTENSIONS: ReadonlyArray<readonly [string, string]> = [
  ["gfm/table/198", "| foo | bar |\n| --- | --- |\n| baz | bim |\n"],
  ["gfm/table/199", "| abc | defghi |\n:-: | -----------:\nbar | baz\n"],
  [
    "gfm/table/200",
    "| f\\|oo  |\n| ------ |\n| b `\\|` az |\n| b **\\|** im |\n",
  ],
  ["gfm/table/201", "| abc | def |\n| --- | --- |\n| bar | baz |\n> bar\n"],
  [
    "gfm/table/202",
    "| abc | def |\n| --- | --- |\n| bar | baz |\nbar\n\nbar\n",
  ],
  ["gfm/table/203", "| abc | def |\n| --- |\n| bar |\n"],
  [
    "gfm/table/204",
    "| abc | def |\n| --- | --- |\n| bar |\n| bar | baz | boo |\n",
  ],
  ["gfm/table/205", "| abc | def |\n| --- | --- |\n"],
  ["gfm/disabled/279", "- [ ] foo\n- [x] bar\n"],
  ["gfm/disabled/280", "- [x] foo\n  - [ ] bar\n  - [x] baz\n- [ ] bim\n"],
  ["gfm/strikethrough/491", "~~Hi~~ Hello, world!\n"],
  ["gfm/strikethrough/492", "This ~~has a\n\nnew paragraph~~.\n"],
  ["gfm/autolink/621", "www.commonmark.org\n"],
  ["gfm/autolink/622", "Visit www.commonmark.org/help for more information.\n"],
  [
    "gfm/autolink/623",
    "Visit www.commonmark.org.\n\nVisit www.commonmark.org/a.b.\n",
  ],
  [
    "gfm/autolink/624",
    "www.google.com/search?q=Markup+(business)\n\nwww.google.com/search?q=Markup+(business)))\n\n(www.google.com/search?q=Markup+(business))\n\n(www.google.com/search?q=Markup+(business)\n",
  ],
  ["gfm/autolink/625", "www.google.com/search?q=(business))+ok\n"],
  [
    "gfm/autolink/626",
    "www.google.com/search?q=commonmark&hl=en\n\nwww.google.com/search?q=commonmark&hl;\n",
  ],
  ["gfm/autolink/627", "www.commonmark.org/he<lp\n"],
  [
    "gfm/autolink/628",
    "http://commonmark.org\n\n(Visit https://encrypted.google.com/search?q=Markup+(business))\n\nAnonymous FTP is available at ftp://foo.bar.baz.\n",
  ],
  ["gfm/autolink/629", "foo@bar.baz\n"],
  [
    "gfm/autolink/630",
    "hello@mail+xyz.example isn't valid, but hello+xyz@mail.example is.\n",
  ],
  [
    "gfm/autolink/631",
    "a.b-c_d@a.b\n\na.b-c_d@a.b.\n\na.b-c_d@a.b-\n\na.b-c_d@a.b_\n",
  ],
  [
    "gfm/tagfilter/652",
    "<strong> <title> <style> <em>\n\n<blockquote>\n  <xmp> is disallowed.  <XMP> is also disallowed.\n</blockquote>\n",
  ],
];
