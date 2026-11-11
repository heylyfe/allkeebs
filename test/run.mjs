// Bundles each test (the database is a gzip file the bundler inlines) and runs it against fake keyboards.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
mkdirSync("test/.out", { recursive: true });
for (const t of ["fakevia", "fake2", "fake-sonix"]) {
  await build({
    entryPoints: [`test/${t}.mjs`],
    bundle: true,
    platform: "node",
    format: "cjs",
    loader: { ".gz": "base64", ".bin": "binary", ".txt": "text" },
    outfile: `test/.out/${t}.cjs`,
    logLevel: "error",
  });
  console.log(`\n== ${t}`);
  console.log(execFileSync("node", [`test/.out/${t}.cjs`], { encoding: "utf8" }));
}
