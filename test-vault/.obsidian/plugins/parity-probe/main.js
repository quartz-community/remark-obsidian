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

    /**
     * Live Preview's own formatting tokens, with their document offsets.
     *
     * WHY, given live preview is the WRONG parser. Everything this harness cannot settle is a
     * construct's CLOSING boundary -- where an unclosed `%%` stops inside a container, where a
     * definition's end line falls, where a fence closes in a list item. `metadataCache` is
     * block-granular and the reading-view DOM has no delimiters in it at all, so that boundary
     * is a value NEITHER existing oracle records, which is exactly the category this repo's
     * notes say to expect nothing from the tree for. Live preview records it: 1.15.0 gives
     * every closing token a `cm-formatting-*-end` class, matching the `-link-end` and
     * `-highlight-end` that already existed.
     *
     * It cannot ADJUDICATE a reading-mode rule and is not used for that. It is a candidate
     * boundary to probe against reading mode, and the first thing built on it must be the
     * overlap check -- where `sections` already exposes a boundary, does live preview agree?
     * The `code` field was adopted exactly that way.
     *
     * THIS IS A TERRAIN MAP, not the tool. `__parityReadingView` beside it is dead through
     * `obsidian eval` on a desktop session, because reading mode renders off
     * `requestAnimationFrame` and Chromium starves an unfocused window. CodeMirror may well
     * have the same problem for its DOM -- but unlike reading mode it holds the document and
     * the syntax tree in STATE, which needs no frame. So this reports what is reachable by
     * both routes and lets one call decide which to build on, rather than assuming.
     */
    window.__parityLivePreview = async function parityLivePreview(markdowns) {
      const language = require("@codemirror/language");
      const probePath = "__parity_lp_probe__.md";
      let file = app.vault.getAbstractFileByPath(probePath);
      if (file) await app.vault.modify(file, markdowns[0] ?? "");
      else file = await app.vault.create(probePath, markdowns[0] ?? "");

      const leaf = app.workspace.getLeaf(true);
      const answers = [];
      try {
        // `mode: "source"` with `source: false` is Live Preview; `source: true` would be the
        // raw editor, which has no decorations to read.
        await leaf.openFile(file, {
          state: { mode: "source", source: false },
        });
        let cm = null;
        for (let wait = 0; wait < 120; wait++) {
          cm = leaf.view?.editor?.cm ?? null;
          if (cm && cm.state) break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        if (cm === null) return [{ error: "no CodeMirror view on the leaf" }];

        // ONE leaf for the whole batch, rewriting the file between documents. Opening a leaf
        // per document costs about six seconds; this costs one tick.
        for (const markdown of markdowns) {
          if (cm.state.doc.toString() !== markdown) {
            await app.vault.modify(file, markdown);
            // The editor follows the file asynchronously, so the document itself is the
            // readiness signal. Comparing against the SOURCE rather than waiting a fixed
            // time is what makes a batch safe: a stale tree is indistinguishable from a
            // real answer otherwise.
            let synced = false;
            for (let wait = 0; wait < 200; wait++) {
              if (cm.state.doc.toString() === markdown) {
                synced = true;
                break;
              }
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            if (!synced) {
              answers.push({ error: "editor never caught up with the file" });
              continue;
            }
          }
          const nodes = [];
          language.syntaxTree(cm.state).iterate({
            from: 0,
            to: cm.state.doc.length,
            enter: (node) => {
              nodes.push([node.name, node.from, node.to]);
            },
          });
          answers.push({ docLength: cm.state.doc.length, nodes });
        }
        return answers;
      } finally {
        leaf.detach();
        const stale = app.vault.getAbstractFileByPath(probePath);
        if (stale) await app.vault.delete(stale, true);
      }
    };

    plugin.register(() => {
      delete window.__parityProbe;
      delete window.__parityReadingView;
      delete window.__parityLivePreview;
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
