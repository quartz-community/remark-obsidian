import { describe, expect, it } from "vitest";

import { resolveEscapes } from "../src/lib/character-escapes.js";

// `comment-in-definition` re-reads a definition's lines from source and needs each text value as
// the tokenizer resolved it; nothing else in the suite reaches the escape handling itself.
describe("resolveEscapes", () => {
  it("drops the backslash before ASCII punctuation only", () => {
    expect(resolveEscapes("\\*a\\* \\[b\\] \\%\\%c \\=\\= \\$")).toBe(
      "*a* [b] %%c == $",
    );
    expect(resolveEscapes("\\b \\é \\1")).toBe("\\b \\é \\1");
  });

  it("reads an escaped backslash once, and keeps a trailing one", () => {
    expect(resolveEscapes("a\\\\*b")).toBe("a\\*b");
    expect(resolveEscapes("end\\")).toBe("end\\");
  });

  it("returns a line without backslashes unchanged", () => {
    const line = "plain *text*";
    expect(resolveEscapes(line)).toBe(line);
  });
});
