// Builds the whole site into docs/index.html, the folder GitHub Pages serves.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const repo = String(pkg.repository?.url || pkg.repository || "")
  .replace(/^git\+/, "")
  .replace(/\.git$/, "");
const author =
  typeof pkg.author === "string" ? pkg.author.replace(/\s*<.*>\s*/, "") : pkg.author?.name || "";
const b64 = (p) => readFileSync(p).toString("base64");
const fonts = `@font-face{font-family:"DM Sans";font-style:normal;font-display:swap;font-weight:100 1000;src:url(data:font/woff2;base64,${b64("node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-opsz-normal.woff2")}) format("woff2-variations");}
@font-face{font-family:"JetBrains Mono";font-style:normal;font-display:swap;font-weight:400;src:url(data:font/woff2;base64,${b64("node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2")}) format("woff2");}
@font-face{font-family:"JetBrains Mono";font-style:normal;font-display:swap;font-weight:500;src:url(data:font/woff2;base64,${b64("node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2")}) format("woff2");}`;
const res = await build({
  entryPoints: ["src/app.js"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  write: false,
  outdir: "out",
  platform: "browser",
  legalComments: "eof",
  logLevel: "warning",
  loader: { ".gz": "base64", ".bin": "binary", ".txt": "text" },
  define: {
    __VERSION__: JSON.stringify(pkg.version),
    __SOURCE_URL__: JSON.stringify(repo),
    __AUTHOR__: JSON.stringify(author),
  },
});
const js = res.outputFiles
  .find((f) => f.path.endsWith(".js"))
  .text.replace(/<\/script/gi, "<\\/script");
const css = res.outputFiles.find((f) => f.path.endsWith(".css")).text;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#7d93ff" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="3.5"/><rect x="6.5" y="6.5" width="11" height="9" rx="2"/></svg>`;
const desc =
  "Change the lighting, keymap and macros of keyboards from almost any brand in your browser, and test every key. Free, open source, nothing to install.";
const html = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>allkeebs, keyboard lighting, keymaps and macros in your browser</title>
<meta name="description" content="${desc}">
<meta name="theme-color" content="#141415">
<meta property="og:title" content="allkeebs">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="website">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}">
<style>${fonts}${css}</style>
</head>
<body>
<noscript>allkeebs needs JavaScript.</noscript>
<!--
  allkeebs ${pkg.version}. Free software under the GNU AGPL v3 or later.${repo ? `\n  Source: ${repo}` : ""}
  Built with @openmouse/keyboard-protocol (AGPL-3.0-or-later), keyboard data from the-via/keyboards (GPL-3.0),
  vial-kb/vial-qmk and qmk/qmk_firmware (GPL-2.0-or-later), Lucide (ISC), DM Sans and JetBrains Mono (OFL-1.1),
  xz-decompress (MIT). See THIRD_PARTY_NOTICES.md in the source.
-->
<script>${js}</script>
</body>
</html>`;
mkdirSync("docs", { recursive: true });
writeFileSync("docs/index.html", html);
writeFileSync("docs/.nojekyll", "");
console.log(
  `wrote docs/index.html ${(html.length / 1024).toFixed(0)} KB${repo ? "" : " (no repository url set in package.json yet)"}`,
);
