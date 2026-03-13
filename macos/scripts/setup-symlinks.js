#!/usr/bin/env node
/**
 * Creates symlinks so the web/ directory can reference src/ and shared/
 * from the repo root without copying files.
 */
const fs = require("fs");
const path = require("path");

const webDir = path.join(__dirname, "..", "web");

const links = [
  { target: "../../src", link: path.join(webDir, "src") },
  { target: "../../shared", link: path.join(webDir, "shared") },
];

for (const { target, link } of links) {
  if (fs.existsSync(link)) {
    const stat = fs.lstatSync(link);
    if (stat.isSymbolicLink()) continue; // Already linked
    console.warn(`[symlink] ${link} exists but is not a symlink — skipping`);
    continue;
  }
  fs.symlinkSync(target, link, "dir");
  console.log(`[symlink] ${link} → ${target}`);
}

console.log("[symlink] Done.");
