import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { AXES, ORACLES, SCOPE } from "./overview.js";
import { COMPUTE_KEYS, PROJECTION_KEYS } from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The overview's anti-staleness gate.
 *
 * A consolidated view is only worth having if it cannot drift from what it summarises, and
 * these notes already record the opposite happening: a correction written into a source file
 * does not reach a summary that paraphrases it, and the summary is what gets read when
 * choosing work. The tab-straddle cause was wrong in the README for weeks after
 * `list-tab-straddle.ts` corrected it.
 *
 * So this asserts coverage rather than content. Every test file must be registered as an
 * oracle, and every projection key on both oracles must be claimed by one -- which is the
 * check that would have caught `referenceLinks` sitting recorded-but-uncompared, and the
 * check that makes "is X measured?" answerable by reading one file instead of twelve.
 */
describe("parity overview", () => {
  it("registers every test file as an oracle", () => {
    const onDisk = fs
      .readdirSync(here)
      .filter((name) => name.endsWith(".test.ts"))
      .filter((name) => name !== "overview.test.ts")
      .sort();
    const registered = ORACLES.map((oracle) => oracle.test).filter(
      (name): name is string => name !== undefined,
    );
    expect([...registered].sort()).toEqual(onDisk);
  });

  it("claims every main-gate projection key", () => {
    const claimed = new Set(ORACLES.flatMap((oracle) => oracle.compares));
    expect(PROJECTION_KEYS.filter((key) => !claimed.has(key))).toEqual([]);
  });

  it("claims every compute projection key", () => {
    const claimed = new Set(ORACLES.flatMap((oracle) => oracle.compares));
    expect(COMPUTE_KEYS.filter((key) => !claimed.has(key))).toEqual([]);
  });

  it("points every ceiling at a file that exists", () => {
    const missing = ORACLES.flatMap((oracle) =>
      [oracle.ceilingAt, oracle.test]
        .filter((name): name is string => name !== undefined)
        .filter((name) => !fs.existsSync(path.join(here, name))),
    );
    expect(missing).toEqual([]);
  });

  it("gives every oracle something it cannot see", () => {
    // An oracle with no recorded blind spot is one nobody has asked the question of. Every
    // mistake this file exists to prevent was a coverage question, not a count, so an empty
    // `blind` list is the one field that must never be empty.
    expect(ORACLES.filter((oracle) => oracle.blind.length === 0)).toEqual([]);
  });

  it("keeps the unswept axes visible rather than dropping them", () => {
    // The point of the axis register is the NOT SWEPT rows: an axis nobody has measured is
    // indistinguishable from one that passes unless it is listed. Asserting at least one
    // keeps a future tidy-up from deleting the backlog.
    expect(AXES.some((axis) => !axis.swept)).toBe(true);
  });

  it("argues every scope boundary", () => {
    expect(SCOPE.filter((entry) => entry.why.trim() === "")).toEqual([]);
  });

  it("tells you how to run every swept axis", () => {
    // The composition oracle's `command` spelled the flag list out separately and was stale
    // within a day -- still `[--matrix|--inside|--nested|--isolate]` after two more axes
    // existed. The flags now live on the axis and the printer derives the command, so this
    // asserts the remaining half: a swept axis you cannot run is a number nobody can check,
    // which is how a measured figure becomes folklore.
    const unrunnable = AXES.filter(
      (axis) => axis.swept && (axis.how ?? "").trim() === "",
    ).map((axis) => axis.name);
    expect(unrunnable).toEqual([]);
  });

  it("records no composition count in prose that nothing asserts", () => {
    // The composition axes have NO committed expectation -- they need a running Obsidian, so
    // there is no golden and no gate. Their counts therefore live in `note` as prose, and
    // prose cannot be trusted the way an exact ceiling can.
    //
    // This does not fix that; it refuses to let it be forgotten. Every unswept axis must say
    // so, and every swept one must carry a runnable command, so a reader can always
    // re-measure rather than believe the number. The honest status of these axes is
    // "reproducible on demand", not "asserted".
    const silent = AXES.filter(
      (axis) => !axis.swept && (axis.note ?? "").trim() === "",
    ).map((axis) => axis.name);
    expect(silent).toEqual([]);
  });
});
