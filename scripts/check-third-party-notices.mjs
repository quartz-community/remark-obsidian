// Fails when a dist entry bundles an npm package that LICENSE-THIRD-PARTY.md does not list in its
// "npm packages bundled into `dist`" section. Run it after `npm run build`: each entry's source map
// lists every file esbuild put in that bundle, so this reads what shipped, not package.json.
import { readdirSync, readFileSync } from "node:fs";

const maps = readdirSync("dist").filter((file) => file.endsWith(".js.map"));
const bundled = new Set();
for (const map of maps) {
  const { sources } = JSON.parse(readFileSync(`dist/${map}`, "utf-8"));
  for (const source of sources) {
    const at = source.lastIndexOf("node_modules/");
    if (at === -1) continue;
    const [first, second] = source
      .slice(at + "node_modules/".length)
      .split("/");
    bundled.add(first.startsWith("@") ? `${first}/${second}` : first);
  }
}

// Only a list item's names count, the part before its " -- ". The section's prose mentions
// packages too, and a mention is not a notice.
const section = readFileSync("LICENSE-THIRD-PARTY.md", "utf-8")
  .split("\n## ")
  .find((part) => part.startsWith("npm packages bundled into"));
const listed = new Set();
for (const item of section?.split("\n```")[0].split("\n- ").slice(1) ?? []) {
  for (const [, name] of item.split(" -- ")[0].matchAll(/`([^`]+)`/g))
    listed.add(name);
}
const missing = [...bundled].filter((name) => !listed.has(name));

// An empty bundle means this read the maps wrongly, not that there is nothing to notice.
if (bundled.size === 0 || missing.length > 0) {
  console.error(
    `ERROR: ${bundled.size} npm packages in dist, ${missing.length} without a notice in LICENSE-THIRD-PARTY.md:`,
  );
  for (const name of missing.sort()) console.error(`  - ${name}`);
  process.exit(1);
}
console.log(
  `third-party notices verified: all ${bundled.size} bundled packages listed.`,
);
