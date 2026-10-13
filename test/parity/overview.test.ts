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

  it("accounts for every axis, swept or not", () => {
    // This asserted `AXES.some(axis => !axis.swept)` -- "there must be at least one unswept
    // axis" -- to stop a tidy-up from deleting the backlog. It fired the moment the last
    // unswept axis was closed, which is the gate being wrong rather than the register: it
    // conflated "do not lose the backlog" with "a backlog must exist".
    //
    // What it meant is that no axis may be silent. A swept one must say how to re-run it,
    // since these counts have no committed expectation and are only trustworthy if a reader
    // can reproduce them; an unswept one must say why. Either way the row carries its own
    // status, which is the property that actually stops an axis going quiet.
    const silent = AXES.filter((axis) =>
      axis.swept
        ? (axis.how ?? "").trim() === ""
        : (axis.note ?? "").trim() === "",
    ).map((axis) => axis.name);
    expect(silent).toEqual([]);
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
});
