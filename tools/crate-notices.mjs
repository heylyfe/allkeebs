// Writes the licence texts of every Rust crate compiled into the desktop app, for the installer
// (bundled as THIRD_PARTY_CRATES.txt; see src-tauri/tauri.conf.json).
//
// usage: node tools/crate-notices.mjs [target-triple] [out-file]
//   defaults: the host target (from rustc), src-tauri/THIRD_PARTY_CRATES.txt
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// The crates of the platform being built, not every platform's, by default.
const host = () => /^host: (.+)$/m.exec(execFileSync("rustc", ["-vV"], { encoding: "utf8" }))?.[1];
const target = process.argv[2] || host() || "";
const out = process.argv[3] || "src-tauri/THIRD_PARTY_CRATES.txt";
const args = ["metadata", "--format-version", "1", "--manifest-path", "src-tauri/Cargo.toml"];
if (target) args.push("--filter-platform", target);
const meta = JSON.parse(execFileSync("cargo", args, { encoding: "utf8", maxBuffer: 1 << 28 }));

const packages = new Map(meta.packages.map((p) => [p.id, p]));
const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
// Only what ships: normal dependencies reachable from the app, not build or dev tools.
const shipped = new Set();
(function walk(id) {
  if (shipped.has(id)) return;
  shipped.add(id);
  for (const d of nodes.get(id).deps) if (d.dep_kinds.some((k) => k.kind === null)) walk(d.pkg);
})(meta.resolve.root);

const LICENCE_FILE = /^(licen[cs]e|copying|notice|unlicense)/i;
// Crates that compile bundled C code with its own licence. The hidapi C library offers BSD,
// GPLv3 or its original licence; allkeebs uses it under the BSD licence.
const BUNDLED = { hidapi: ["etc/hidapi/LICENSE.txt", "etc/hidapi/LICENSE-bsd.txt"] };
const sections = [];
for (const id of shipped) {
  const p = packages.get(id);
  if (id === meta.resolve.root) continue;
  const dir = dirname(p.manifest_path);
  const files = [
    ...readdirSync(dir)
      .filter((f) => LICENCE_FILE.test(f))
      .sort(),
    ...(BUNDLED[p.name] || []).filter((f) => existsSync(join(dir, f))),
  ];
  const texts = files.map((f) => `--- ${f}\n\n${readFileSync(join(dir, f), "utf8").trim()}`);
  sections.push(
    [
      `== ${p.name} ${p.version}`,
      `Licence: ${p.license || p.license_file || "see its repository"}`,
      p.repository ? `Source: ${p.repository}` : "",
      "",
      texts.length ? texts.join("\n\n") : `(No licence file in the crate. Licence: ${p.license}.)`,
    ]
      .filter((l, i) => l || i > 2)
      .join("\n"),
  );
}
sections.sort();
writeFileSync(
  out,
  `Rust crates compiled into the allkeebs desktop app (${sections.length}).\n` +
    `allkeebs itself is AGPL-3.0-or-later: https://github.com/heylyfe/allkeebs\n\n` +
    sections.join("\n\n\n") +
    "\n",
);
console.log(`wrote ${out}: ${sections.length} crates`);
