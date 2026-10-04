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

    const links = Array.from(root.querySelectorAll("a.internal-link")).map(
      (el) => {
        const href = el.getAttribute("data-href") ?? "";
        const hash = href.indexOf("#");
        return {
          path: hash === -1 ? href : href.slice(0, hash),
          heading: hash === -1 ? "" : href.slice(hash + 1),
          embedded: false,
        };
      },
    );

    // Only source-level embeds count. A transcluded note renders its own embeds
    // inside the outer one, and a self-embed nests several deep, so counting
    // descendants would report three embeds for a single `![[ ]]`.
    for (const el of Array.from(root.querySelectorAll(".internal-embed"))) {
      if (el.parentElement?.closest(".internal-embed")) continue;
      const src = el.getAttribute("src") ?? "";
      const hash = src.indexOf("#");
      links.push({
        path: hash === -1 ? src : src.slice(0, hash),
        heading: hash === -1 ? "" : src.slice(hash + 1),
        embedded: true,
      });
    }

    const tags = Array.from(root.querySelectorAll("a.tag")).map((el) =>
      (el.textContent ?? "").replace(/^#/, ""),
    );

    const headings = Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6")).map(
      (el) => {
        const text = el.getAttribute("data-heading") ?? el.textContent ?? "";
        return `${el.tagName.slice(1)}:${text.trim()}`;
      },
    );

    const tasks = Array.from(root.querySelectorAll("li[data-task]")).map(
      (el) => ({
        char: el.getAttribute("data-task") || " ",
        checked: !!el.querySelector("input[type=checkbox]:checked"),
      }),
    );

    const highlights = Array.from(root.querySelectorAll("mark")).map(
      (el) => el.textContent ?? "",
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
      const html = host.innerHTML.replace(
        /(fn(?:ref)?-\d+)-[0-9a-f]{8,}/g,
        "$1",
      );

      out.push({
        id: item.id,
        html,
        projections: project(host),
        sectionOffsets: sectionsOf(`${dir}/${item.file}`),
        meta: metaOf(`${dir}/${item.file}`),
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

  const KNOWN_PROXY_DIVERGENCES = new Map<string, string>([
    ["wikilink/table-unescaped", SURPLUS_TABLE_CELLS],
    ["math/in-table-pipe", SURPLUS_TABLE_CELLS],
    ["hunt/table-delimiter-cell-count/0", SURPLUS_TABLE_CELLS],
    ["hunt/blockquote-region-outlives-quote/1", UNFAITHFUL_CAPTURE],
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
    const seeds = fullProxyCheck
      ? buildCorpus()
      : buildCorpus().filter((c) => c.layer === "seed");
    let agreed = 0;
    const mismatches: string[] = [];
    const unexpected: string[] = [];

    for (const c of seeds) {
      const filePath = `${FIXTURE_DIR}/${caseFileName(c.id)}`;
      await obsidianPage.openFile(filePath);
      const readingText = (await browser.executeObsidian(
        CAPTURE_READING_VIEW as never,
        filePath,
      )) as string;

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
    }

    console.log(
      `  reading-view agreement: ${agreed}/${seeds.length}` +
        `${fullProxyCheck ? " (full corpus)" : ""}` +
        ` (${KNOWN_PROXY_DIVERGENCES.size} known display-only divergence(s))`,
    );
    for (const m of mismatches.slice(0, 15)) console.log(`  ! ${m}`);

    if (unexpected.length > 0) {
      throw new Error(
        `detached renderer is no longer a faithful proxy for: ${unexpected.join(", ")}`,
      );
    }
  });
});

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
