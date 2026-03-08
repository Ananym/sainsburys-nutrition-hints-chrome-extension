import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "fs";

const watch = process.argv.includes("--watch");

mkdirSync("dist", { recursive: true });

const entryPoints = [
  { in: "src/content.ts", out: "content" },
  { in: "src/background.ts", out: "background" },
{ in: "src/popup.ts", out: "popup" },
];

const buildOptions = {
  entryPoints,
  bundle: true,
  format: "iife",
  target: "chrome120",
  outdir: "dist",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
};

function copyStatic() {
  // Strip "key" from manifest for Web Store compatibility
  const manifest = JSON.parse(readFileSync("static/manifest.json", "utf-8"));
  delete manifest.key;
  writeFileSync("dist/manifest.json", JSON.stringify(manifest, null, 2));
  cpSync("static/content.css", "dist/content.css");
cpSync("static/popup.html", "dist/popup.html");
  cpSync("static/icon.png", "dist/icon.png");
}

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  copyStatic();
  await ctx.watch();
  console.log("[build] watching for changes...");
} else {
  await esbuild.build(buildOptions);
  copyStatic();
  console.log("[build] done");
}
