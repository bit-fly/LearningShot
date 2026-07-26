import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const entryPoints = {
  background: "src/background/index.ts",
  content: "src/content/index.ts",
  sidepanel: "src/sidepanel/index.ts",
  options: "src/options/options.ts",
};

const buildOptions = {
  entryPoints,
  bundle: true,
  outdir: "dist",
  format: "iife",
  target: "es2020",
  sourcemap: true,
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildOptions);
}
