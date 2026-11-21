// Fails when a shipped declaration file imports a package that package.json does not declare, or
// when the main entry's declarations stop bringing `mdast-util-math`'s node types. Run it after
// `npm run build`. A package that the declarations import but that nobody declares resolves only
// where the package manager happens to hoist it: under pnpm with `hoist=false`, or Yarn PnP, the
// import fails and the consumer's types silently become `any` (with `skipLibCheck`).
import { readdirSync, readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
]);

/** `mdast` is satisfied by `@types/mdast`, `@scope/name` by `@types/scope__name`. */
function typesPackage(name) {
  return `@types/${name.startsWith("@") ? name.slice(1).replace("/", "__") : name}`;
}

const files = readdirSync("dist").filter((file) => file.endsWith(".d.ts"));
const imported = new Map();
for (const file of files) {
  const text = readFileSync(`dist/${file}`, "utf-8");
  for (const [, specifier] of text.matchAll(
    /^\s*(?:import|export)\b[^'"]*?['"]([^'"./][^'"]*)['"]/gm,
  )) {
    const parts = specifier.split("/");
    const name = specifier.startsWith("@")
      ? parts.slice(0, 2).join("/")
      : parts[0];
    if (name.startsWith("node:")) continue;
    if (!imported.has(name)) imported.set(name, new Set());
    imported.get(name).add(file);
  }
}

const undeclared = [...imported.keys()].filter(
  (name) => !declared.has(name) && !declared.has(typesPackage(name)),
);
const mathTypes = imported.get("mdast-util-math")?.has("index.d.ts") ?? false;

// No import at all means this read the files wrongly, not that they import nothing.
if (imported.size === 0 || undeclared.length > 0 || !mathTypes) {
  console.error(
    `ERROR: dist declarations import ${imported.size} packages, ${undeclared.length} not in dependencies or peerDependencies:`,
  );
  for (const name of undeclared.sort())
    console.error(`  - ${name} (${[...imported.get(name)].join(", ")})`);
  if (!mathTypes)
    console.error(
      "  - dist/index.d.ts no longer imports mdast-util-math, so `math` and `inlineMath` lose their types",
    );
  process.exit(1);
}
console.log(
  `dist declarations verified: ${imported.size} imported packages, all declared.`,
);
