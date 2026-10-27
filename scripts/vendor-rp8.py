"""Convert remark-parse 8.0.3, remark-footnotes 2.0.0, remark-math 3.0.1 and parse-entities 2.0.0
from CommonJS to ESM TypeScript (`@ts-nocheck`), code otherwise untouched. Third-party helper
packages are routed to the hand-written `helpers.ts`; the v1 entity tables are emitted as data.

    python3 scripts/vendor-rp8.py src/rp8/vendor

Reads the published packages from the `remarkParse8` / `remarkFootnotes2` / `remarkMath3`
dev-dependency aliases. RE-RUNNING OVERWRITES the files listed under "Changed after conversion"
in src/rp8/vendor/README.md; reapply those, then `test/rp8-vendored.test.ts` must pass."""
import json, os, re, subprocess, sys

NM = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "node_modules")
OUT = sys.argv[1]

SOURCES = [  # (package dir, files relative to it, output subdir, provenance)
    ("remarkParse8/lib", None, "remark-parse", "remark-parse 8.0.3 (MIT, Titus Wormer)"),
    ("remarkFootnotes2", ["index.js"], "remark-footnotes", "remark-footnotes 2.0.0 (MIT, Titus Wormer)"),
    ("remarkMath3", ["index.js", "inline.js", "block.js", "util.js"], "remark-math", "remark-math 3.0.1 (MIT, Junyoung Choi)"),
    ("parse-entities", ["index.js"], "parse-entities", "parse-entities 2.0.0 (MIT, Titus Wormer)"),
]

HELPERS = {
    "trim": "trim", "repeat-string": "repeat", "xtend": "xtend",
    "is-whitespace-character": "isWhitespaceCharacter", "is-decimal": "isDecimal",
    "is-alphabetical": "isAlphabetical", "is-word-character": "isWordCharacter",
    "is-hexadecimal": "isHexadecimal", "is-alphanumerical": "isAlphanumerical",
    "trim-trailing-lines": "trimTrailingLines", "collapse-white-space": "collapseWhiteSpace",
    "ccount": "ccount", "state-toggle": "stateToggle", "markdown-escapes": "markdownEscapes",
    "vfile-location": "vfileLocation", "unist-util-remove-position": "removePosition",
}
TABLES = {"character-entities": "characterEntities",
          "character-entities-legacy": "characterEntitiesLegacy",
          "character-reference-invalid": "characterReferenceInvalid"}


def files_of(pkg, listed):
    base = os.path.join(NM, pkg)
    if listed is not None:
        return [os.path.join(base, f) for f in listed]
    out = []
    for root, _, names in os.walk(base):
        out += [os.path.join(root, n) for n in names if n.endswith(".js")]
    return sorted(out)


def module_kind(path):
    src = open(path).read()
    if re.search(r"^module\.exports\s*=", src, re.M):
        return "default"
    if re.search(r"^exports\.\w+\s*=", src, re.M):
        return "named"
    raise SystemExit(f"no exports in {path}")


def convert(path, pkgdir, outdir, provenance):
    src = open(path).read()
    rel_out = os.path.relpath(path, os.path.join(NM, pkgdir))
    dest = os.path.join(outdir, rel_out[:-3] + ".ts")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    helpers_rel = os.path.relpath(os.path.join(OUT, "helpers.js"), os.path.dirname(dest))
    tables_rel = os.path.relpath(os.path.join(OUT, "entities-v1.js"), os.path.dirname(dest))
    pe_rel = os.path.relpath(os.path.join(OUT, "parse-entities", "index.js"), os.path.dirname(dest))
    if not helpers_rel.startswith("."):
        helpers_rel, tables_rel = "./" + helpers_rel, "./" + tables_rel
    if not pe_rel.startswith("."):
        pe_rel = "./" + pe_rel
    imports, counter = [], [0]

    def target(spec):
        """(module path for import, kind) for a require spec."""
        if spec.startswith("."):
            dep = os.path.normpath(os.path.join(os.path.dirname(path), spec))
            dep = dep if dep.endswith(".js") else dep + ".js"
            if spec == "./decode-entity":  # parse-entities: a lookup in the v1 table
                return None, "decode-entity"
            return spec + ".js", module_kind(dep)
        if spec in HELPERS:
            return helpers_rel, ("helper", HELPERS[spec])
        if spec in TABLES:
            return tables_rel, ("helper", TABLES[spec])
        if spec == "parse-entities":
            return pe_rel, "default"
        raise SystemExit(f"unmapped require {spec!r} in {path}")

    def import_for(name, spec, member=None):
        mod, kind = target(spec)
        if kind == "decode-entity":
            imports.append(f'import {{ decodeEntityV1 as {name} }} from "{tables_rel}";')
        elif isinstance(kind, tuple):
            imports.append(f'import {{ {kind[1]} as {name} }} from "{mod}";')
        elif member is not None:
            imports.append(f'import {{ {member} as {name} }} from "{mod}";')
        elif kind == "default":
            imports.append(f'import {name} from "{mod}";')
        else:
            imports.append(f'import * as {name} from "{mod}";')

    # top-level `var|const NAME = require('SPEC')(.member)?`
    def top(m):
        import_for(m.group(2), m.group(3), m.group(4))
        return ""
    src = re.sub(r"^(var|const) (\w+) = require\('([^']+)'\)(?:\.(\w+))?\n", top, src, flags=re.M)

    # inline require('SPEC') anywhere else
    def inline(m):
        counter[0] += 1
        name = f"__required{counter[0]}"
        import_for(name, m.group(1))
        return name
    src = re.sub(r"require\('([^']+)'\)", inline, src)

    src = re.sub(r"^'use strict'\n", "", src, flags=re.M)
    src = re.sub(r"^module\.exports = ", "export default ", src, flags=re.M)

    def named(m):
        name, expr = m.group(1), m.group(2)
        if expr == name:
            return f"export {{ {name} }}\n"
        return f"export const {name} = {expr}"
    src = re.sub(r"^exports\.(\w+) = (\w+)\n", lambda m: named(m) if m.group(1) == m.group(2) else m.group(0), src, flags=re.M)
    src = re.sub(r"^exports\.(\w+) = ", lambda m: f"export const {m.group(1)} = ", src, flags=re.M)
    assert "require(" not in src and "module.exports" not in src and not re.search(r"^exports\.", src, re.M), path

    header = (f"// @ts-nocheck -- vendored from {provenance}, converted to ESM by\n"
              f"// scripts/vendor-rp8.py; code otherwise as published. See ../README.md.\n")
    open(dest, "w").write(header + "\n".join(dict.fromkeys(imports)) + ("\n" if imports else "") + src.lstrip("\n"))
    return dest


def tables():
    req = lambda p: json.loads(subprocess.check_output(
        ["node", "-p", f"JSON.stringify(require('{p}'))"], cwd=os.path.join(NM, "parse-entities")))
    ents = req("character-entities"); legacy = req("character-entities-legacy"); invalid = req("character-reference-invalid")
    body = ("// Generated by scripts/vendor-rp8.py: the v1 tables parse-entities 2.0.0 was written against.\n"
            "// They are NOT the modern packages' tables -- 97 prefix entries and 4 values differ -- and\n"
            "// the greedy legacy matcher depends on exactly these.\n"
            "/* character-entities 1.2.4, character-entities-legacy 1.1.4, character-reference-invalid\n"
            "   1.1.4 -- all MIT, Titus Wormer. */\n"
            f"export const characterEntities: Record<string, string> = JSON.parse({json.dumps(json.dumps(ents, ensure_ascii=False))});\n"
            f"export const characterEntitiesLegacy: Record<string, string> = JSON.parse({json.dumps(json.dumps(legacy, ensure_ascii=False))});\n"
            f"export const characterReferenceInvalid: Record<string, string> = JSON.parse({json.dumps(json.dumps(invalid, ensure_ascii=False))});\n"
            "const own = {}.hasOwnProperty;\n"
            "/** parse-entities 2.0.0's `decode-entity.js` (the Node build). */\n"
            "export function decodeEntityV1(characters: string): string | false {\n"
            "  return own.call(characterEntities, characters) ? characterEntities[characters]! : false;\n"
            "}\n")
    open(os.path.join(OUT, "entities-v1.ts"), "w").write(body)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    written = []
    for pkg, listed, sub, prov in SOURCES:
        for f in files_of(pkg, listed):
            written.append(convert(f, pkg, os.path.join(OUT, sub), prov))
    tables()
    print(len(written), "files")
