/**
 * The named grids, each one a measurement that produced or refused a rule.
 *
 * Transcribed from the throwaway scripts that measured them, so the tables in this package's
 * docstrings have a re-runnable source. A grid kept here is a grid a later change cannot
 * silently break.
 */
import type { Grid } from "./grid.js";

const QUOTE_HOSTS: ReadonlyArray<readonly [string, string]> = [
  ["quote d1", "> "],
  ["quote d2", "> > "],
  ["item -", "- "],
  ["item +", "+ "],
];

export const GRIDS: readonly Grid[] = [
  {
    name: "quoted-opener-swallow",
    what: "which openers inside a container swallow the unquoted label below them",
    rows: QUOTE_HOSTS,
    cols: [
      ["```", "```"],
      ["~~~", "~~~"],
      ["$$", "$$"],
      ["<div>", "<div>"],
      ["<!--", "<!--"],
      ["%%", "%%"],
      ["# h", "# h"],
      ["plain", "text"],
    ],
    document: (host, opener) => `${host}${opener}\n[^1]: def\n\nuse[^1]\n`,
    field: "def.exists",
  },
  {
    name: "lazy-release",
    what: "which followers a container RELEASES to root indented code",
    rows: [
      ["quote", "> Text"],
      ["item", "*    Text"],
    ],
    cols: [
      ["```", "```"],
      ["plain", "plain"],
      ["# h", "# h"],
      ["%%", "%%"],
      ["> q", "> q"],
      ["---", "---"],
      ["- i", "- i"],
      ["[^1]:", "[^1]: d"],
    ],
    document: (head, tail) => `${head}\n    ${tail}\n`,
    field: "code.second-line",
  },
  {
    name: "marker-sep-column",
    what: "a definition's column under a marker whose separator holds a tab",
    rows: [
      ["-\\tp", "-\tp"],
      ["- \\tp", "- \tp"],
      ["-  p", "-  p"],
      ["1.\\tp", "1.\tp"],
      ["1000.\\tp", "1000.\tp"],
    ],
    cols: [
      ["2sp", "  "],
      ["3sp", "   "],
      ["4sp", "    "],
      ["5sp", "     "],
      ["6sp", "      "],
      ["tab", "\t"],
      ["3sp+tab", "   \t"],
    ],
    document: (head, indent) => `${head}\n\n${indent}[^1]: def\n\nuse[^1]\n`,
    field: "def.col",
  },
  {
    name: "bare-marker-tab",
    what: "a definition's column under a BARE marker, by marker width and label indent",
    rows: [
      ["-", "-"],
      ["*", "*"],
      ["+", "+"],
      ["1)", "1)"],
      ["10.", "10."],
      ["1000.", "1000."],
    ],
    cols: [
      ["tab", "\t"],
      ["tab1", "\t "],
      ["tab2", "\t  "],
      ["tab3", "\t   "],
      ["tab4", "\t    "],
      ["tab5", "\t     "],
      ["4sp", "    "],
      ["6sp", "      "],
    ],
    document: (marker, indent) =>
      `${marker}\n\n${indent}[^1]: def\n\nuse[^1]\n`,
    field: "def.col",
  },
  {
    name: "ordered-interrupt",
    what: "a definition's end over a follower that may or may not interrupt it",
    rows: [
      ["root", "[^1]: magna"],
      ["quote", "> [^1]: magna"],
      ["item", "- [^1]: magna"],
    ],
    cols: [
      ["1. item", "1. item"],
      ["2. item", "2. item"],
      ["10. item", "10. item"],
      ["1) item", "1) item"],
      ["2) item", "2) item"],
      ["- item", "- item"],
      ["* item", "* item"],
      ["plain", "plain"],
    ],
    document: (head, tail) => {
      const prefix = head.startsWith(">")
        ? "> "
        : head.startsWith("-")
          ? "  "
          : "";
      return `${head}\n${prefix}${tail}\n`;
    },
    field: "def.end",
  },
  {
    name: "def-end-opener",
    what: "a definition's end over a block opener at three indents",
    rows: [
      ["atx", "# h"],
      ["fence", "```"],
      ["tilde", "~~~"],
      ["math", "$$"],
      ["comment", "%%"],
      ["marker", "- i"],
      ["quote", "> q"],
      ["thematic", "---"],
      ["html", "<div>"],
      ["plain", "plain"],
      ["label", "[^2]: d"],
    ],
    cols: [
      ["0sp", ""],
      ["2sp", "  "],
      ["tab", "\t"],
    ],
    document: (opener, indent) => `[^1]: def\n${indent}${opener}\n\nuse[^1]\n`,
    field: "def.end",
  },
];

export const gridNamed = (name: string): Grid | undefined =>
  GRIDS.find((grid) => grid.name === name);
