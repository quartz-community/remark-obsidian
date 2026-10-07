/**
 * Records Obsidian's own output for every corpus case.
 *
 * One spec, one Obsidian boot, whole corpus in batches. Sharding per case would
 * spend all of its time starting Electron.
 *
 * Primary capture is a detached `MarkdownRenderer.render()`, which is fast enough
 * to batch hundreds of cases per round trip and sidesteps reading mode's
 * viewport-driven lazy rendering. Because "fast proxy for the real view" is a
 * claim rather than a fact, the seed layer is additionally captured through a real
 * Reading View and the agreement rate is asserted.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { browser } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { CHAIN_MANIFEST, type ProfileName } from "./chain.js";
import { projectOurs } from "./normalize.js";
import { buildCorpus, caseFileName, type Case } from "./corpus.js";
import {
  PINNED_STATES,
  type ComputedMeta,
  type GoldenCase,
  type MetaProjections,
  type Projections,
} from "./types.js";

/**
 * Overridable so a release CI cannot download can be recorded to a separate file.
 * 1.14 is the only build that still exposes the LaTeX source in `data-latex`, so
 * it is the only way to assert math *content*; but it is not yet `latest`, and
 * writing it over the committed gate would make the weekly drift job fire.
 */
const GOLDEN_PATH = path.resolve(
  process.env.PARITY_GOLDEN_PATH ?? "test/parity/goldens/obsidian.json",
);
const FIXTURE_DIR = "__parity__";
const BATCH_SIZE = 20;

interface SectionOffset {
  readonly type: string;
  readonly start: number;
  readonly end: number;
}

interface Captured {
  readonly id: string;
  readonly html: string;
  readonly projections: Omit<Projections, "sections">;
  readonly sectionOffsets: readonly SectionOffset[];
  readonly meta: MetaProjections;
  /** `null` when the build does not expose the undocumented entry point. */
  readonly compute: ComputedMeta | null;
  readonly error?: string;
}

/** Serialised into the renderer, so it may not reference anything out here. */
const CAPTURE = async (
  { app, obsidian }: { app: any; obsidian: any },
  batch: ReadonlyArray<{ id: string; markdown: string; file: string }>,
  dir: string,
): Promise<string> => {
  const stripSelector = [
    ".markdown-preview-pusher",
    ".mod-header",
    ".mod-footer",
    ".metadata-container",
    ".inline-title",
    ".frontmatter-container",
  ].join(",");

  const project = (root: Element) => {
    const math = Array.from(root.querySelectorAll(".math")).map((el) => {
      const tex = el.querySelector("mjx-math")?.getAttribute("data-latex");
      return {
        display: el.classList.contains("math-block"),
        ...(tex === null || tex === undefined ? {} : { tex }),
      };
    });

    // One query, so the list comes back in document order. Collecting links
    // and embeds separately put every link before every embed regardless of
    // where they sat, which made 46 cases differ on ordering alone while both
    // sides had found exactly the same targets.
    //
    // Only source-level embeds count. A transcluded note renders its own
    // embeds inside the outer one, and a self-embed nests several deep, so
    // counting descendants would report three embeds for a single `![[ ]]`.
    const links: Array<{
      path: string;
      heading: string;
      embedded: boolean;
    }> = [];
    for (const el of Array.from(
      root.querySelectorAll("a.internal-link, .internal-embed"),
    )) {
      const embedded = !el.classList.contains("internal-link");
      if (embedded && el.parentElement?.closest(".internal-embed")) continue;
      const target =
        (embedded ? el.getAttribute("src") : el.getAttribute("data-href")) ??
        "";
      const hash = target.indexOf("#");
      links.push({
        path: hash === -1 ? target : target.slice(0, hash),
        heading: hash === -1 ? "" : target.slice(hash + 1),
        embedded,
      });
    }

    const tags = Array.from(root.querySelectorAll("a.tag")).map((el) =>
      (el.textContent ?? "").replace(/^#/, ""),
    );

    // A heading inside an embed belongs to the note the embed expanded, not to
    // this one, and `metadataCache` counts it that way too. The outer heading of
    // `# ![[#tag]]` is kept, since the embed sits inside it rather than around it.
    const headings = Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6"))
      .filter((el) => !el.closest(".internal-embed"))
      .map((el) => {
        const text = el.getAttribute("data-heading") ?? el.textContent ?? "";
        return `${el.tagName.slice(1)}:${text.trim()}`;
      });

    const tasks = Array.from(root.querySelectorAll("li[data-task]")).map(
      (el) => ({
        char: el.getAttribute("data-task") || " ",
        checked: !!el.querySelector("input[type=checkbox]:checked"),
      }),
    );

    const clone = root.cloneNode(true) as Element;
    for (const el of Array.from(clone.querySelectorAll(".math"))) {
      el.replaceWith(document.createTextNode("\u27e8math\u27e9"));
    }
    // An unresolved embed renders as '"x" is not created yet. Click to create.'
    // That is view chrome, not parse output, so substitute the target instead.
    for (const el of Array.from(clone.querySelectorAll(".internal-embed"))) {
      el.replaceWith(document.createTextNode(el.getAttribute("src") ?? ""));
    }
    // The renderer collects every footnote body into a trailing container. A
    // nested inline footnote produces a second one as a `div`, so match on the
    // class rather than the tag or that copy survives and its body lands in the
    // captured text.
    // The renderer collects every footnote body into one `.footnotes` at the
    // end, with a `↩︎` backref appended. That placement is the view's, not the
    // source's, so leaving it in makes `text` compare a relocated tail against our
    // in-place mdast for any document that resolves a reference. `sections` and
    // `meta.footnotes` still carry the footnote structure.
    for (const el of Array.from(clone.querySelectorAll(".footnotes"))) {
      el.remove();
    }
    // Obsidian renders frontmatter into `pre.frontmatter` with `display: none`, so
    // the reader never sees it but `textContent` does. A collapsed callout is also
    // hidden, but its body is real content the reader can reveal, so only the
    // frontmatter block goes.
    for (const el of Array.from(clone.querySelectorAll("pre.frontmatter"))) {
      el.remove();
    }
    for (const el of Array.from(clone.querySelectorAll("sup.footnote-ref"))) {
      el.replaceWith(document.createTextNode("\u27e8fn\u27e9"));
    }
    // A reference inside a link cannot nest its anchor, so Obsidian renders an
    // empty `sup` and puts the `[1]` beside it instead of within. Replacing the
    // `sup` alone leaves that text in the capture, which no tree can produce.
    // Runs after the loop above, which takes the nested anchors with it.
    for (const el of Array.from(clone.querySelectorAll("a.footnote-link"))) {
      el.remove();
    }
    for (const el of Array.from(clone.querySelectorAll("svg"))) el.remove();
    const text = (clone.textContent ?? "").replace(/\s+/g, " ").trim();

    // Read off the substituted clone, not `root`, so math and embeds inside a
    // highlight reduce the same way our mdast side reduces them -- `==$x^2$==` gave
    // the rendered KaTeX `𝑥2` from `root` where our tree says `⟨math⟩`. This used to
    // run before the clone existed, which is the whole bug: `emphasis` below had the
    // argument in a comment and `highlights` did not have it applied.
    const highlights = Array.from(clone.querySelectorAll("mark")).map(
      (el) => el.textContent ?? "",
    );

    // Read off the substituted clone, not `root`, so math and embeds inside an
    // emphasis reduce the same way our mdast side reduces them. `querySelectorAll`
    // yields document order, which matches the pre-order walk on our side.
    const emphasis = Array.from(clone.querySelectorAll("strong,em")).map(
      (el) =>
        `${el.tagName.toLowerCase()}:${(el.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim()}`,
    );

    return { text, math, links, tags, headings, tasks, highlights, emphasis };
  };

  // Primary oracle: a `math` section running past its closing `$$` is direct
  // evidence of what the parser swallowed, and is stable across versions.
  const sectionsOf = (filePath: string) => {
    const file = app.vault.getAbstractFileByPath(filePath);
    const cache = (file && app.metadataCache.getFileCache(file)) || {};
    return (cache.sections ?? []).map((s: any) => ({
      type: String(s.type),
      start: s.position?.start?.offset ?? 0,
      end: s.position?.end?.offset ?? 0,
    }));
  };

  const metaOf = (filePath: string): MetaProjections => {
    const file = app.vault.getAbstractFileByPath(filePath);
    const cache = (file && app.metadataCache.getFileCache(file)) || {};
    return {
      headings: (cache.headings ?? []).map(
        (h: any) => `${h.level}:${h.heading}`,
      ),
      links: (cache.links ?? []).map((l: any) => l.link),
      embeds: (cache.embeds ?? []).map((e: any) => e.link),
      tags: (cache.tags ?? []).map((t: any) => String(t.tag).replace(/^#/, "")),
      footnotes: (cache.footnoteRefs ?? []).map((f: any) => f.id),
    };
  };

  /**
   * Obsidian's own parse of a string, positioned.
   *
   * `getFileCache` above answers for a file that has been written and indexed,
   * and names identifiers without saying where they sit. The undocumented
   * `computeMetadataAsync` runs the same parser -- the one behind both Reading
   * View and the cache -- directly on a buffer, and its answer carries a line
   * and a column for every footnote, heading and section. So it is both sharper
   * for anything position-shaped and far cheaper: no file to write, no index to
   * wait for, no leaf to mount. It does not replace the DOM capture, which is
   * still the only source of rendered text, math and emphasis.
   *
   * Guarded rather than assumed: being undocumented it may vanish, and a build
   * without it has to record a recognisable `null` rather than an empty answer
   * that would read as "Obsidian found none of these".
   */
  const computeOf = async (markdown: string): Promise<ComputedMeta | null> => {
    if (typeof app.metadataCache?.computeMetadataAsync !== "function") {
      return null;
    }
    const at = (point: any) => `${point?.line ?? 0}:${point?.col ?? 0}`;
    const span = (position: any) =>
      `${at(position?.start)}-${at(position?.end)}`;
    const answer = await app.metadataCache.computeMetadataAsync(
      new TextEncoder().encode(markdown).buffer,
    );
    // A reference is `original => resolved | displayText`, because the three
    // disagree exactly where an alias or a fragment is involved and that is
    // what an identifier-only projection cannot see.
    const reference = (l: any) =>
      `${l.original}=>${l.link}|${l.displayText}@${span(l.position)}`;
    return {
      // A definition carries neither `original` nor `displayText` -- both come back
      // undefined -- so this records the destination and the span, which is what
      // the field actually answers: whether Obsidian read a definition here at all.
      referenceLinks: (answer?.referenceLinks ?? []).map(
        (l: any) => `${l.link}@${span(l.position)}`,
      ),
      footnotes: (answer?.footnotes ?? []).map(
        (f: any) => `${f.id}@${span(f.position)}`,
      ),
      footnoteRefs: (answer?.footnoteRefs ?? []).map(
        (f: any) => `${f.id}@${at(f.position?.start)}`,
      ),
      headings: (answer?.headings ?? []).map(
        (h: any) => `${h.level}:${h.heading}@${at(h.position?.start)}`,
      ),
      sections: (answer?.sections ?? []).map(
        (s: any) => `${s.type}@${span(s.position)}`,
      ),
      links: (answer?.links ?? []).map(reference),
      embeds: (answer?.embeds ?? []).map(reference),
      tags: (answer?.tags ?? []).map(
        (t: any) => `${t.tag}@${span(t.position)}`,
      ),
      // `parent` is how the cache spells nesting, and `task` the checkbox
      // character -- neither survives the DOM projection of a task list.
      listItems: (answer?.listItems ?? []).map(
        (i: any) =>
          `${i.task === undefined ? "-" : JSON.stringify(i.task)}|parent:${i.parent}@${span(i.position)}`,
      ),
      // An object keyed by identifier rather than an array.
      blocks: Object.values(answer?.blocks ?? {}).map(
        (b: any) => `${b.id}@${span(b.position)}`,
      ),
      frontmatter:
        answer?.frontmatter === undefined
          ? undefined
          : JSON.stringify(answer.frontmatter),
      frontmatterPosition: answer?.frontmatterPosition
        ? span(answer.frontmatterPosition)
        : undefined,
      frontmatterLinks: (answer?.frontmatterLinks ?? []).map(
        (l: any) => `${l.key}:${l.original}=>${l.link}|${l.displayText}`,
      ),
    };
  };

  const out: Captured[] = [];

  for (const item of batch) {
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-10000px";
    host.style.width = "800px";
    document.body.appendChild(host);

    const component = new obsidian.Component();
    component.load();

    try {
      await obsidian.MarkdownRenderer.render(
        app,
        item.markdown,
        host,
        `${dir}/${item.file}`,
        component,
      );

      const deadline = Date.now() + 2000;
      while (
        Date.now() < deadline &&
        host.querySelector(".math:not(.is-loaded)")
      ) {
        await new Promise((r) => setTimeout(r, 25));
      }

      for (const el of Array.from(host.querySelectorAll(stripSelector)))
        el.remove();

      // Footnote anchors carry a fresh random suffix per render, so the stored HTML
      // would differ on every recording and the drift detector would cry wolf.
      //
      // The index is one or more segments, not one: a reference Obsidian numbers
      // twice is `fnref-1-1-<hex>`, and matching a single `-\d+` left that whole
      // suffix in place. Eleven cases drifted on every recording because of it.
      const html = host.innerHTML.replace(
        /(fn(?:ref)?(?:-\d+)+)-[0-9a-f]{8,}/g,
        "$1",
      );

      out.push({
        id: item.id,
        html,
        projections: project(host),
        sectionOffsets: sectionsOf(`${dir}/${item.file}`),
        meta: metaOf(`${dir}/${item.file}`),
        compute: await computeOf(item.markdown),
      });
    } catch (error) {
      out.push({
        id: item.id,
        html: "",
        projections: {
          text: "",
          math: [],
          links: [],
          tags: [],
          headings: [],
          tasks: [],
          highlights: [],
          emphasis: [],
        },
        sectionOffsets: [],
        meta: { headings: [], links: [], embeds: [], tags: [], footnotes: [] },
        compute: null,
        error: String((error as Error)?.message ?? error),
      });
    } finally {
      component.unload();
      host.remove();
    }
  }

  return JSON.stringify(out);
};

/**
 * Does this Obsidian preserve the LaTeX source? 1.14+ keeps it in `data-latex`;
 * earlier releases discard it, and the goldens must say which so the gate does not
 * silently stop asserting on math content.
 */
const DETECT_MATH_TEX = async ({
  app,
  obsidian,
}: {
  app: any;
  obsidian: any;
}): Promise<string> => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const component = new obsidian.Component();
  component.load();
  try {
    await obsidian.MarkdownRenderer.render(
      app,
      "$x^2$\n",
      host,
      "probe.md",
      component,
    );
    const deadline = Date.now() + 2000;
    while (
      Date.now() < deadline &&
      host.querySelector(".math:not(.is-loaded)")
    ) {
      await new Promise((r) => setTimeout(r, 25));
    }
    // `apiVersion` comes from the running bundle. wdio's own version getters report
    // the *installer*, so an `OBSIDIAN_APP_PATH` override records the wrong app and
    // a 1.14 golden would claim to be 1.13.7 while carrying 1.14-only math content.
    return JSON.stringify({
      mathTex: host.querySelector("mjx-math[data-latex]") !== null,
      apiVersion: obsidian.apiVersion ?? null,
    });
  } finally {
    component.unload();
    host.remove();
  }
};

/** Reading View capture, used only to validate the detached renderer as a proxy. */
/**
 * Close every open note.
 *
 * The cross-check opens one per case and the reading-view capture finds it by
 * scanning `getLeavesOfType("markdown")`. Left open they accumulate, so the
 * scan lengthens with every case while each rendered preview stays live in the
 * DOM — the sweep slows as it goes rather than costing a flat rate per note.
 */
const CLOSE_NOTES = async ({ app }: { app: any }): Promise<void> => {
  app.workspace.detachLeavesOfType("markdown");
};

const CAPTURE_READING_VIEW = async (
  { app }: { app: any },
  filePath: string,
): Promise<string> => {
  const leaf = app.workspace
    .getLeavesOfType("markdown")
    .find((l: any) => l.view?.file?.path === filePath);
  if (!leaf) throw new Error(`no leaf for ${filePath}`);

  await leaf.view.setState({ mode: "preview" }, { history: false });
  const renderer = leaf.view.previewMode.renderer;
  renderer.renderExtraMinPx = 1e6;
  renderer.viewportHeight = 1e6;
  renderer.rerender(true);

  // A table registers its section before the cell content lands, so a drained
  // queue alone raced and made this flaky. Require a quiet DOM too.
  const deadline = Date.now() + 8000;
  let previous = "";
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    const drained =
      !renderer.queued && !renderer.parsing && renderer.sections.length > 0;
    const current = renderer.sizerEl.innerHTML;
    if (current !== previous) {
      previous = current;
      stableSince = Date.now();
      continue;
    }
    if (drained && Date.now() - stableSince >= 250) break;
  }

  const clone = renderer.sizerEl.cloneNode(true) as Element;
  for (const el of Array.from(
    clone.querySelectorAll(
      ".markdown-preview-pusher,.mod-header,.mod-footer,.metadata-container,.inline-title,.frontmatter-container",
    ),
  )) {
    el.remove();
  }
  for (const el of Array.from(clone.querySelectorAll(".math"))) {
    el.replaceWith(document.createTextNode("\u27e8math\u27e9"));
  }
  for (const el of Array.from(clone.querySelectorAll(".internal-embed"))) {
    el.replaceWith(document.createTextNode(el.getAttribute("src") ?? ""));
  }
  // Must mirror `project`'s removals exactly, or the proxy check compares two
  // different reductions and fails for a reason that is not proxy drift.
  for (const el of Array.from(clone.querySelectorAll(".footnotes"))) {
    el.remove();
  }
  for (const el of Array.from(clone.querySelectorAll("pre.frontmatter"))) {
    el.remove();
  }
  for (const el of Array.from(clone.querySelectorAll("sup.footnote-ref"))) {
    el.replaceWith(document.createTextNode("\u27e8fn\u27e9"));
  }
  // A reference inside a link cannot nest its anchor, so Obsidian renders an
  // empty `sup` and puts the `[1]` beside it instead of within. Replacing the
  // `sup` alone leaves that text in the capture, which no tree can produce.
  // Runs after the loop above, which takes the nested anchors with it.
  for (const el of Array.from(clone.querySelectorAll("a.footnote-link"))) {
    el.remove();
  }
  for (const el of Array.from(clone.querySelectorAll("svg"))) el.remove();
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
};

describe("Obsidian parity oracle", () => {
  const corpus = buildCorpus();

  it(`records ${corpus.length} cases from real Obsidian`, async () => {
    const files: Record<string, string> = {};
    for (const c of corpus) {
      files[`${FIXTURE_DIR}/${caseFileName(c.id)}`] = c.markdown;
    }
    await obsidianPage.resetVault(files);
    await sleep(3000);

    const byId = new Map<string, Case>(corpus.map((c) => [c.id, c]));
    const captured: Captured[] = [];

    for (let i = 0; i < corpus.length; i += BATCH_SIZE) {
      const batch = corpus.slice(i, i + BATCH_SIZE).map((c) => ({
        id: c.id,
        markdown: c.markdown,
        file: caseFileName(c.id),
      }));
      const raw = await browser.executeObsidian(
        CAPTURE as never,
        batch,
        FIXTURE_DIR,
      );
      captured.push(...(JSON.parse(raw as string) as Captured[]));
      console.log(
        `  captured ${Math.min(i + BATCH_SIZE, corpus.length)}/${corpus.length}`,
      );
    }

    const failed = captured.filter((c) => c.error);
    if (failed.length > 0) {
      console.log(`  ${failed.length} case(s) errored in the renderer:`);
      for (const f of failed.slice(0, 10))
        console.log(`    ${f.id}: ${f.error}`);
    }

    const previous = await readPreviousGoldens();
    const cases: Record<string, GoldenCase> = {};
    for (const c of captured) {
      const source = byId.get(c.id);
      if (!source) continue;
      cases[c.id] = {
        id: c.id,
        layer: source.layer,
        category: source.category,
        markdown: source.markdown,
        obsidian: {
          html: c.html,
          projections: {
            ...c.projections,
            sections: c.sectionOffsets.map((s) => ({
              type: s.type,
              text: source.markdown.slice(s.start, s.end).replace(/\n+$/, ""),
            })),
          },
          meta: c.meta,
          ...(c.compute ? { compute: c.compute } : {}),
        },
        triage: previous[c.id]?.triage ?? "unreviewed",
        ...(previous[c.id]?.note ? { note: previous[c.id]!.note } : {}),
      };
    }

    // Pin our own output for every deliberate divergence, so the exception ledger
    // protects behaviour rather than only recording intent.
    for (const golden of Object.values(cases)) {
      if (!PINNED_STATES.has(golden.triage)) continue;
      const previousProfile = previous[golden.id]?.ours?.profile;
      const profile: ProfileName =
        previousProfile === "all-features" ? "all-features" : "quartz-default";
      try {
        golden.ours = {
          profile,
          projections: projectOurs(golden.markdown, profile),
        };
      } catch {
        /* a throwing case stays unpinned; the gate reports it as a normal divergence */
      }
    }

    const installerVersion = await browser.getObsidianInstallerVersion();
    const probe = JSON.parse(
      (await browser.executeObsidian(DETECT_MATH_TEX as never)) as string,
    ) as { mathTex: boolean; apiVersion: string | null };
    const { mathTex } = probe;
    const appVersion =
      probe.apiVersion ?? String(await browser.getObsidianVersion());
    console.log(`  app ${appVersion}, math latex available: ${mathTex}`);

    await fs.mkdir(path.dirname(GOLDEN_PATH), { recursive: true });
    await fs.writeFile(
      GOLDEN_PATH,
      `${JSON.stringify(
        {
          obsidian: { app: String(appVersion), installer: installerVersion },
          oracle: { mathTex },
          chain: CHAIN_MANIFEST,
          recordedAt: new Date().toISOString(),
          cases,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    console.log(
      `  wrote ${Object.keys(cases).length} goldens to ${GOLDEN_PATH}`,
    );
    if (Object.keys(cases).length !== corpus.length) {
      throw new Error(
        `captured ${Object.keys(cases).length} of ${corpus.length} corpus cases`,
      );
    }
  });

  /**
   * Seeds where the detached renderer and Reading View legitimately differ in
   * *display* while agreeing on the parse. Anything outside this set means the
   * detached oracle has stopped being a faithful proxy.
   */
  const SURPLUS_TABLE_CELLS =
    "An unescaped pipe splits the row into more cells than the header declares. Reading View renders the surplus cells, the detached container drops them. Both parses agree (metadataCache reports no link and no math respectively), so this is rendering, not parsing.";

  /**
   * Unlike the entries above, these two are not display-only: the renderers
   * disagree about the parse, so the recorded golden is not Obsidian behaviour
   * and the case cannot be gated on it. Listed so the full-corpus audit stays
   * repeatable, and noted in the goldens so nobody chases a rule that is not
   * there.
   */
  const UNFAITHFUL_CAPTURE =
    "The detached renderer and Reading View disagree about the parse itself, not just its display, so the recorded expectation is not Obsidian behaviour. The golden carries a note; re-measure through Reading View before treating it as a divergence.";

  /**
   * Found by the first full-corpus audit that ran to completion, and classified
   * by the positioned oracle rather than by argument: `computeMetadataAsync`
   * reports the two paragraphs as sections of their own, so Obsidian's parser
   * does not fold them into the html block and Reading View is the faithful
   * side. Without that answer this case looks exactly like the pair above,
   * where the renderers really do disagree about the parse.
   */
  const RAW_TEXT_ELEMENT =
    "`<textarea>` is a raw-text element, so in the detached container the blocks after it re-parse as its literal content (`<p><em>foo</em></p>`) while Reading View renders them as paragraphs (`foobar`). The parse sides with Reading View: `computeMetadataAsync` reports `html`, `paragraph`, `paragraph`, `html` as four separate sections. Rendering, not parsing.";

  const KNOWN_PROXY_DIVERGENCES = new Map<string, string>([
    ["wikilink/table-unescaped", SURPLUS_TABLE_CELLS],
    ["math/in-table-pipe", SURPLUS_TABLE_CELLS],
    ["hunt/table-delimiter-cell-count/0", SURPLUS_TABLE_CELLS],
    ["hunt/blockquote-region-outlives-quote/1", UNFAITHFUL_CAPTURE],
    ["commonmark/html-blocks/171", RAW_TEXT_ELEMENT],
  ]);

  /**
   * The seed layer is checked on every recording because it is small enough to
   * stay cheap. That leaves the generated layers unverified, and the gap is not
   * theoretical: `hunt/blockquote-region-outlives-quote/1` expects `""` for an
   * unclosed `<!--` inside a quote, which only the detached renderer produces —
   * a real Reading View renders what follows. The same shape, probed as a seed,
   * is what exposed it.
   *
   * `PARITY_FULL_PROXY_CHECK=1` widens the sweep to the whole corpus so the
   * rest can be audited deliberately. It costs minutes rather than seconds,
   * which is why it is not the default.
   */
  const fullProxyCheck = process.env.PARITY_FULL_PROXY_CHECK === "1";

  it("agrees with a real Reading View on the seed layer", async () => {
    // The known-divergent cases join the sweep whatever layer they are in.
    // They are the ones already shown to need the faithful oracle, so leaving
    // them to a seven-minute audit nobody runs by default is what let two
    // goldens sit in the backlog recording behaviour Obsidian never produced.
    const seeds = fullProxyCheck
      ? buildCorpus()
      : buildCorpus().filter(
          (c) => c.layer === "seed" || KNOWN_PROXY_DIVERGENCES.has(c.id),
        );
    let agreed = 0;
    const mismatches: string[] = [];
    const unexpected: string[] = [];
    const corrections = new Map<string, string>();

    const unopenable: string[] = [];

    /**
     * Fail a stuck mount fast instead of waiting out the helper's own retries.
     *
     * `openFile` waits for the leaf to appear and retries while it does not, so
     * a document Reading View never mounts does not throw promptly -- it spends
     * the sweep's whole budget before it gives up, and the run dies on the
     * suite timeout with the cross-check half done. Racing it against a short
     * timer turns that into one skipped case.
     */
    const bounded = async <T>(work: Promise<T>, ms: number): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          work,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new Error(`timed out after ${ms}ms`)),
              ms,
            );
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    for (const c of seeds) {
      const filePath = `${FIXTURE_DIR}/${caseFileName(c.id)}`;
      // A fuzz-reduced document can be odd enough that Reading View never
      // mounts a leaf for it -- `u)[[$[^]$]]` is one. That is a property of
      // the viewer, not of the parse, and aborting the whole sweep over it
      // throws away the cross-check for every other case.
      let readingText: string;
      try {
        await bounded(obsidianPage.openFile(filePath), 30_000);
        readingText = (await browser.executeObsidian(
          CAPTURE_READING_VIEW as never,
          filePath,
        )) as string;
      } catch {
        unopenable.push(c.id);
        await browser.executeObsidian(CLOSE_NOTES as never);
        continue;
      }

      const raw = await browser.executeObsidian(
        CAPTURE as never,
        [{ id: c.id, markdown: c.markdown, file: caseFileName(c.id) }],
        FIXTURE_DIR,
      );
      const detachedText = (JSON.parse(raw as string) as Captured[])[0]!
        .projections.text;

      await browser.executeObsidian(CLOSE_NOTES as never);

      // Reading view concatenates top-level blocks with no separator while the
      // detached container yields one space, so compare ignoring whitespace.
      const squash = (s: string) => s.replace(/\s+/g, "");
      if (squash(readingText) === squash(detachedText)) {
        agreed += 1;
        continue;
      }
      mismatches.push(
        `${c.id}\n    reading:  ${readingText}\n    detached: ${detachedText}`,
      );
      if (!KNOWN_PROXY_DIVERGENCES.has(c.id)) unexpected.push(c.id);
      else corrections.set(c.id, readingText);
    }

    await applyReadingViewCorrections(corrections);

    console.log(
      `  reading-view agreement: ${agreed}/${seeds.length}` +
        `${fullProxyCheck ? " (full corpus)" : ""}` +
        ` (${KNOWN_PROXY_DIVERGENCES.size} known display-only divergence(s))`,
    );
    for (const m of mismatches.slice(0, 15)) console.log(`  ! ${m}`);

    if (unopenable.length > 0) {
      console.log(
        `  ${unopenable.length} case(s) Reading View would not open: ` +
          unopenable.slice(0, 8).join(", "),
      );
    }

    if (unexpected.length > 0) {
      throw new Error(
        `detached renderer is no longer a faithful proxy for: ${unexpected.join(", ")}`,
      );
    }
  });
});

/**
 * Let the faithful oracle win where the proxy disagrees.
 *
 * The goldens are captured through a detached `MarkdownRenderer.render()`,
 * which is fast enough to batch the whole corpus. Where that proxy and a real
 * Reading View disagree, the proxy is simply wrong about Obsidian, and gating
 * on it asserts behaviour the application does not have — which is how two
 * cases came to sit in the backlog as divergences with no rule behind them.
 *
 * Only `text` is corrected, because Reading View is captured as text; the
 * remaining projections stay as recorded. The note says so, so a reader can
 * tell a corrected case from a plain one.
 */
async function applyReadingViewCorrections(
  corrections: ReadonlyMap<string, string>,
): Promise<void> {
  if (corrections.size === 0) return;

  const raw = await fs.readFile(GOLDEN_PATH, "utf8");
  const file = JSON.parse(raw) as {
    cases: Record<string, GoldenCase>;
  } & Record<string, unknown>;

  let changed = 0;
  for (const [id, text] of corrections) {
    const entry = file.cases[id];
    if (!entry || entry.obsidian.projections.text === text) continue;
    (entry.obsidian.projections as { text: string }).text = text;
    entry.note =
      "`text` re-measured through a real Reading View: the detached renderer " +
      "the recorder batches disagreed with the application, so its capture " +
      "was not Obsidian behaviour. Other projections are as recorded.";
    changed += 1;
  }

  if (changed === 0) return;
  await fs.writeFile(GOLDEN_PATH, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(`  corrected ${changed} golden(s) from Reading View`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readPreviousGoldens(): Promise<Record<string, GoldenCase>> {
  try {
    const raw = await fs.readFile(GOLDEN_PATH, "utf8");
    return (
      (JSON.parse(raw) as { cases: Record<string, GoldenCase> }).cases ?? {}
    );
  } catch {
    return {};
  }
}
