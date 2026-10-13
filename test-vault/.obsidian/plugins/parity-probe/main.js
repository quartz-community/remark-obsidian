"use strict";

/**
 * Test-only plugin: a detached `MarkdownRenderer` the parity harness can call in process.
 *
 * WHY THIS EXISTS. Eight inline constructs report NOTHING to `metadataCache` -- measured:
 * `==hi== *em* **st** ~~del~~ $x$ ` + "`c`" + `` yields no cache entry at all. So `ask.mts`,
 * which wraps `computeMetadataAsync` and answers in about a second, is structurally blind to
 * highlight, emphasis, strong, underscore-emphasis, strikethrough, inline math, display math
 * and code spans. Their only oracle was the full recorder: Obsidian under Xvfb, seventy
 * seconds, and answers only for documents already committed to `corpus.ts`.
 *
 * WHY NOT THE INTERNAL API. Checked against `obsidian-typings` rather than guessed. The
 * `MetadataCache` internals stop at `computeMetadataAsync` -- there is no richer cache
 * holding inline tokens. The CodeMirror/Lezer internals do carry them, and they are the WRONG
 * parser: Obsidian has two, and this harness's oracle is reading view, which `metadataCache`
 * reflects and live preview does not. So the reading-view DOM is the only source, which is
 * what the recorder already captures.
 *
 * WHY A PLUGIN. `obsidian eval` has `require` but no `obsidian` module -- it is injected into
 * plugins at load time, so `MarkdownRenderer` is `undefined` there. A plugin can import it and
 * hand it back out. That is the whole job of this file.
 *
 * The projections below mirror `oracle.e2e.ts` CHARACTER FOR CHARACTER where it has one, so
 * the two oracles are comparable: `mark` textContent for highlights, `strong,em` as
 * `tag:text` with whitespace collapsed, `.math` as display plus `data-latex`. `del`, `s` and
 * `code` are added because the recorder has no projection for them -- they only ever showed
 * up inside `text`, which is why strikethrough and code spans had no oracle of their own.
 */
const obsidian = require("obsidian");

module.exports = class ParityProbe extends obsidian.Plugin {
  async onload() {
    const app = this.app;
    const plugin = this;

    /**
     * Render markdown detached and project it.
     *
     * Returns a plain object, so the caller can `JSON.stringify` it onto a global and read it
     * back with a second synchronous eval -- the result window for `obsidian eval` is roughly
     * 5-15 ms, so an awaited value cannot be answered in one call.
     */
    window.__parityProbe = async function parityProbe(markdown) {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const component = new obsidian.Component();
      try {
        await obsidian.MarkdownRenderer.render(
          app,
          markdown,
          host,
          "probe.md",
          component,
        );
        // Math renders asynchronously. The recorder waits on `.math:not(.is-loaded)` for the
        // same reason; without it a formula comes back empty and reads as a parse difference.
        for (let wait = 0; wait < 40; wait++) {
          if (!host.querySelector(".math:not(.is-loaded)")) break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        return project(host);
      } finally {
        component.unload();
        host.remove();
      }
    };

    plugin.register(() => {
      delete window.__parityProbe;
    });
  }
};

function project(root) {
  // The same clone discipline the recorder uses: `text` is read with footnote bodies and
  // frontmatter removed, because the renderer RELOCATES a footnote body to a trailing section
  // and comparing a relocated tail against in-place mdast proves nothing.
  const clone = root.cloneNode(true);
  // Math becomes a SENTINEL before any text is read, exactly as the recorder does it.
  // Without this the probe reads MathJax's rendered glyphs where the golden holds `⟨math⟩`,
  // and validating against the committed goldens reported two "divergences" that were only
  // this substitution: `==$x^2$==` came back `["𝑥2"]` against the golden's `["⟨math⟩"]`.
  // The `display` flags agreed throughout, which is what identified it as a projection
  // difference rather than a parse one. Reading the sentinel also makes the comparison
  // stable across MathJax versions.
  for (const el of Array.from(clone.querySelectorAll(".math"))) {
    el.replaceWith(document.createTextNode("\u27e8math\u27e9"));
  }
  // An unresolved embed renders as view chrome ('"x" is not created yet.'), so the target
  // stands in for it -- the recorder's reasoning, and the same substitution.
  for (const el of Array.from(clone.querySelectorAll(".internal-embed"))) {
    el.replaceWith(document.createTextNode(el.getAttribute("src") ?? ""));
  }
  for (const el of Array.from(clone.querySelectorAll(".footnotes"))) {
    el.remove();
  }
  for (const el of Array.from(clone.querySelectorAll("pre.frontmatter"))) {
    el.remove();
  }
  // A footnote reference becomes its own sentinel, the last substitution the recorder makes
  // before reading text. Validating all 663 candidate goldens caught exactly one case
  // needing it -- `# ==^[inline]==` came back `["[1]"]` against the golden's `["⟨fn⟩"]` --
  // which is why the whole set was checked rather than a sample of sixty.
  for (const el of Array.from(clone.querySelectorAll("sup.footnote-ref"))) {
    el.replaceWith(document.createTextNode("\u27e8fn\u27e9"));
  }
  // A reference inside a link cannot nest its anchor, so Obsidian renders an empty `sup` and
  // puts the `[1]` beside it. Removing the anchor after the loop above is what keeps that
  // stray text out of the capture.
  for (const el of Array.from(clone.querySelectorAll("a.footnote-link"))) {
    el.remove();
  }
  for (const el of Array.from(clone.querySelectorAll("svg"))) el.remove();

  const textOf = (el) => el.textContent ?? "";
  const collapsed = (el) => textOf(el).replace(/\s+/g, " ").trim();

  return {
    highlights: Array.from(clone.querySelectorAll("mark")).map(textOf),
    emphasis: Array.from(clone.querySelectorAll("strong,em")).map(
      (el) => `${el.tagName.toLowerCase()}:${collapsed(el)}`,
    ),
    // Not in `oracle.e2e.ts`: strikethrough and code spans had no projection of their own and
    // showed up only inside `text`, so neither had an oracle that could name them.
    strike: Array.from(clone.querySelectorAll("del,s")).map(textOf),
    code: Array.from(clone.querySelectorAll("code"))
      .filter((el) => el.parentElement?.tagName.toLowerCase() !== "pre")
      .map(textOf),
    math: Array.from(root.querySelectorAll(".math")).map((el) => {
      const tex = el.querySelector("mjx-math")?.getAttribute("data-latex");
      return {
        display: el.classList.contains("math-block"),
        ...(tex === null || tex === undefined ? {} : { tex }),
      };
    }),
    text: textOf(clone).replace(/\s+/g, " ").trim(),
  };
}
