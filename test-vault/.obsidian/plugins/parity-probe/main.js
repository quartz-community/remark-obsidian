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

    /**
     * The same projection, from a REAL Reading View rather than a detached render.
     *
     * The goldens are captured through `MarkdownRenderer.render()`, and so is `__parityProbe`
     * above -- two call paths into the same renderer, which is why they agree 663 of 663 and
     * why that agreement says nothing about the actual view. `oracle.e2e.ts` cross-checks the
     * real one for the SEED LAYER only, because the full sweep costs seven minutes against
     * eighty seconds; a new proxy divergence outside that layer is not caught on an ordinary
     * recording. This makes the real view askable per document instead.
     *
     * MEASURED: THIS DOES NOT WORK THROUGH `obsidian eval` ON A DESKTOP SESSION, and the
     * reason is worth keeping because it is not a bug in this function. Instrumented rather
     * than guessed at:
     *
     *     viewType "markdown"   mode "preview"   htmlLen 4369
     *     previewSection true   sectionKids 0    previewViewLen 0
     *     docFocus FALSE        visibility "visible"
     *
     * The view opens in reading mode and its chrome renders; the content never does. Reading
     * mode drives rendering off `requestAnimationFrame`, which Chromium starves for a window
     * that is not FOCUSED -- visible is not enough. The parity README records exactly this
     * for the recorder, which is why that path runs under Xvfb with a window manager that
     * maps and focuses the window.
     *
     * So the code is right and the ENVIRONMENT is the constraint. It will render under the
     * recorder's Xvfb session, which is where a full real-view sweep belongs -- the existing
     * `PARITY_FULL_PROXY_CHECK=1` path. Forcing focus from here would steal it from whatever
     * the user is doing, which is a visible side effect on someone's desktop and not
     * something a probe should do.
     *
     * The second hazard still applies wherever it does run: reading mode renders by VIEWPORT,
     * so a long document is partly unrendered. `sections` is returned for that reason -- a
     * caller can tell a truncated capture from a complete one instead of trusting it, and a
     * zero means nothing rendered at all.
     *
     * The temp file is deleted in a `finally`. It sits in a git-tracked vault, so leaving one
     * behind would show up as a stray working-tree change in an unrelated commit.
     */
    window.__parityReadingView = async function parityReadingView(markdown) {
      const probePath = "__parity_reading_probe__.md";
      let file = app.vault.getAbstractFileByPath(probePath);
      if (file) await app.vault.modify(file, markdown);
      else file = await app.vault.create(probePath, markdown);

      const leaf = app.workspace.getLeaf(true);
      try {
        await leaf.openFile(file, { state: { mode: "preview" } });
        let host = null;
        for (let wait = 0; wait < 120; wait++) {
          host =
            leaf.view?.containerEl?.querySelector(
              ".markdown-preview-section",
            ) ?? null;
          const ready =
            host !== null &&
            host.children.length > 0 &&
            !host.querySelector(".math:not(.is-loaded)");
          if (ready) break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        if (host === null) return { error: "reading view never rendered" };
        return { ...project(host), sections: host.children.length };
      } finally {
        leaf.detach();
        const stale = app.vault.getAbstractFileByPath(probePath);
        if (stale) await app.vault.delete(stale, true);
      }
    };

    plugin.register(() => {
      delete window.__parityProbe;
      delete window.__parityReadingView;
    });
  }
};

function project(root) {
  // The same clone discipline the recorder uses: `text` is read with footnote bodies and
  // frontmatter removed, because the renderer RELOCATES a footnote body to a trailing section
  // and comparing a relocated tail against in-place mdast proves nothing.
  const clone = root.cloneNode(true);
  // A REAL Reading View wraps the note in chrome a detached render has none of: the filename
  // as an inline title, the Properties panel, header and footer spacers. Without this the
  // real-view capture reads
  // `"__parity_reading_probe__PropertiesAdd propertyhi em c ⟨math⟩"` where the detached one
  // reads `"hi em c ⟨math⟩"`, and the two are not comparable.
  //
  // The selector list is `oracle.e2e.ts`'s `stripSelector`, copied deliberately rather than
  // reasoned out: the recorder already solved this for its seed-layer cross-check, and
  // inventing a second list is how two oracles end up almost agreeing. Harmless on the
  // detached path, where none of these elements exist.
  for (const el of Array.from(
    clone.querySelectorAll(
      ".markdown-preview-pusher,.mod-header,.mod-footer,.metadata-container,.inline-title,.frontmatter-container",
    ),
  )) {
    el.remove();
  }
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
    // RENDERED headings, which is a different question from INDEXED headings and the one
    // `metadataCache` cannot answer. Obsidian paints a heading inside a container and does
    // not index it -- `> text` / `> ---` reports `headings: []` while rendering an h2 -- so
    // an index-only oracle is structurally blind to that whole class. With both in hand the
    // divergence is measurable instead of merely registered.
    headings: Array.from(clone.querySelectorAll("h1,h2,h3,h4,h5,h6")).map(
      (el) =>
        `${el.tagName.slice(1)}:${(el.getAttribute("data-heading") ?? textOf(el)).trim()}`,
    ),
    // Target and display SEPARATELY, which the cache's projection cannot express. The
    // harness formats a link as `${original}=>${link}|${displayText}@${span}`, and that
    // string is not round-trippable -- `[[a|b|c]]` records as `a|b|c`, which could be target
    // `a|b` and display `c`. So no rule about a link's TARGET alone has been measurable.
    // The DOM keeps them in different attributes, so here it is.
    links: Array.from(clone.querySelectorAll("a.internal-link")).map((el) => ({
      target: el.getAttribute("data-href") ?? "",
      display: textOf(el),
    })),
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
