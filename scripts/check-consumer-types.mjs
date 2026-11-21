// Type-checks a consumer of the packed package under every module setting a consumer might use,
// on the oldest and newest TypeScript we support. Run it after `npm run build`; it needs the
// network, for the TypeScript versions and the package's dependencies.
//
// The consumer is installed with pnpm and `hoist=false`, so a package the declarations import
// resolves only if package.json declares it. Library declarations are checked too
// (`skipLibCheck: false`), so an unresolved import inside ours is an error, not a silent `any`.
//
//   node scripts/check-consumer-types.mjs                # packs the working tree
//   node scripts/check-consumer-types.mjs <tarball|spec> # e.g. the published release, as a control
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PNPM = "pnpm@10.33.4";
// Obsidian's sample plugin pins 4.7; 5.0 brought `bundler`; 5.8 lets `nodenext` CommonJS
// require an ES module; the last two are the newest 5.x and the current release.
const TYPESCRIPT = {
  ts47: "4.7.4",
  ts50: "5.0.4",
  ts58: "5.8.3",
  ts59: "5.9.3",
  ts7: "7.0.2",
};
const at = (alias, major, minor) => {
  const [a, b] = TYPESCRIPT[alias].split(".").map(Number);
  return a > major || (a === major && b >= minor);
};
const SETTINGS = [
  {
    name: "node10 (CommonJS)",
    file: "consumer.ts",
    flags: ["--module", "commonjs", "--moduleResolution", "node"],
    since: [4, 7],
    // TypeScript 7 removed it.
    before: [7, 0],
  },
  {
    name: "node16 (ESM)",
    file: "consumer.mts",
    flags: ["--module", "node16", "--moduleResolution", "node16"],
    since: [4, 7],
  },
  {
    name: "bundler",
    file: "consumer.ts",
    flags: ["--module", "esnext", "--moduleResolution", "bundler"],
    since: [5, 0],
  },
  {
    name: "nodenext (CommonJS)",
    file: "consumer.cts",
    flags: ["--module", "nodenext", "--moduleResolution", "nodenext"],
    since: [5, 8],
  },
];

// Every fact here is one the trees hold. The last line is the control: if the types had become
// `any`, the expected error would not occur and the compile fails.
const CONSUMER = `import remarkObsidian from "@quartz-community/remark-obsidian";
import type { WikilinkData } from "@quartz-community/remark-obsidian";
import { parse } from "@quartz-community/remark-obsidian/legacy";
import type { ListItem, Root } from "mdast";

const tree: Root = parse("- > [!note] T\\n");
const item = tree.children[0] as ListItem;
export const callout = item.children.some((c) => c.type === "callout");
export const math = tree.children.some(
  (c) => (c.type === "math" || c.type === "inlineMath") && c.value.length > 0,
);
export const display = tree.children.some(
  (c) => c.type === "paragraph" && c.children.some((p) => p.type === "inlineMath" && p.data?.display),
);
export const wikilink = tree.children.some(
  (c) => c.type === "paragraph" && c.children.some((p) => p.type === "wikilink" && p.path.length > 0),
);
export const spelled: WikilinkData = { spelledPath: "a " };
export const plugin: typeof remarkObsidian = remarkObsidian;
// @ts-expect-error a node type nobody declares must not narrow
export const control = tree.children.some((c) => c.type === "nope");
`;

const run = (command, args, cwd) =>
  execFileSync(command, args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const work = mkdtempSync(path.join(tmpdir(), "consumer-types-"));
try {
  let target = process.argv[2];
  if (target === undefined) {
    const packed = JSON.parse(
      run("npm", ["pack", "--json", "--pack-destination", work], "."),
    );
    target = path.join(work, packed[0].filename);
  } else if (target.endsWith(".tgz")) {
    target = path.resolve(target);
  }

  const app = path.join(work, "app");
  run("mkdir", [app]);
  writeFileSync(
    path.join(app, "package.json"),
    JSON.stringify({ name: "consumer", private: true }),
  );
  writeFileSync(path.join(app, ".npmrc"), "hoist=false\n");
  for (const file of ["consumer.ts", "consumer.mts", "consumer.cts"])
    writeFileSync(path.join(app, file), CONSUMER);
  run(
    "npx",
    [
      "-y",
      PNPM,
      "add",
      target.endsWith(".tgz") ? `file:${target}` : target,
      "@types/mdast@^4",
      ...Object.entries(TYPESCRIPT).map(
        ([alias, version]) => `${alias}@npm:typescript@${version}`,
      ),
    ],
    app,
  );

  const failures = [];
  let checks = 0;
  for (const alias of Object.keys(TYPESCRIPT)) {
    for (const setting of SETTINGS) {
      if (!at(alias, ...setting.since)) continue;
      if (setting.before && at(alias, ...setting.before)) continue;
      checks++;
      const label = `TypeScript ${TYPESCRIPT[alias]}, ${setting.name}`;
      try {
        run(
          "node",
          [
            path.join("node_modules", alias, "bin", "tsc"),
            "--noEmit",
            "--strict",
            "--skipLibCheck",
            "false",
            // Obsidian's sample plugin targets ES2021; without a target, older modes get ES5's
            // library, which lacks the ES2015 collections every Node consumer has.
            "--target",
            "es2021",
            ...setting.flags,
            setting.file,
          ],
          app,
        );
        console.log(`ok    ${label}`);
      } catch (error) {
        console.log(`FAIL  ${label}`);
        failures.push([label, `${error.stdout ?? ""}${error.stderr ?? ""}`]);
      }
    }
  }

  if (failures.length > 0) {
    console.error(
      `\nERROR: ${failures.length} of ${checks} consumer settings fail to type-check:`,
    );
    for (const [label, output] of failures) {
      console.error(`\n${label}:`);
      console.error(output.trim().split("\n").slice(0, 12).join("\n"));
    }
    process.exitCode = 1;
  } else {
    console.log(`\nconsumer types verified: ${checks} settings.`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
