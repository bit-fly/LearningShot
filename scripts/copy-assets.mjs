import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");

async function copy(src, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true });
}

await copy(path.join(root, "manifest.json"), path.join(dist, "manifest.json"));
await copy(path.join(root, "src", "sidepanel", "index.html"), path.join(dist, "sidepanel.html"));
await copy(path.join(root, "src", "sidepanel", "sidepanel.css"), path.join(dist, "sidepanel.css"));
await copy(path.join(root, "src", "options", "index.html"), path.join(dist, "options.html"));
await copy(path.join(root, "src", "options", "options.css"), path.join(dist, "options.css"));
await copy(path.join(root, "public", "icons"), path.join(dist, "icons"));
await copy(
  path.join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"),
  path.join(dist, "pdf.worker.min.mjs")
);

console.log("Assets copied to dist/");
