#!/usr/bin/env node
/**
 * imageOptimizer.js
 * -------------------------------------------------------------
 * Author: Lukas Vosylius
 * License: GNU General Public License v3.0
 * Date: 2025.06.04
 * -------------------------------------------------------------- 
 *
 * Resize images to a maximum width of **1920 px** (height scaled automatically).
 *
 * • **PNG** files stay PNG – choose lossless (default) or lossy compression.
 * • All other formats become **JPEG** with adjustable quality (MozJPEG).
 * • Folder hierarchy inside the **input** directory is mirrored in the
 *   **output** directory.
 * • Default paths: `./input`  →  `./output`.
 *   Supply other folders on the command line if you need different paths.
 * • **Optional** renaming with `--rename` → `<top-folder>-<index>.<ext>`.
 * • **Safety prompt**: if the *output* folder already contains files, the script
 *   asks whether to delete them first. Use `--force-delete` to skip the prompt
 *   and wipe automatically.
 *
 * -------------------------------------------------------------
 * Usage
 * -------------------------------------------------------------
 *   node imageOptimizer.js [inputDir] [outputDir] [options]
 *
 * Options
 *   -q, --quality <n>       JPEG quality   1–100  (default 75)
 *   --compress-png          Quantise PNGs (palette) instead of lossless
 *   -P, --png-quality <n>   PNG quality    1–100  (default 80, implies --compress-png)
 *   --rename                Rename files to <folder>-<index>.<ext>
 *   --force-delete          Delete existing output dir without asking
 *   -h, --help              Show this help
 *
 * Examples
 *   # Just run – uses ./input → ./output, keeps filenames, lossless PNG
 *   node imageOptimizer.js -q 80
 *
 *   # Custom paths + extra flags
 *   node imageOptimizer.js ./photos ./publish -q 85 -P 70 --rename --force-delete
 *
 * -------------------------------------------------------------
 * Requires
 * -------------------------------------------------------------
 *   npm install sharp
 *   Node ≥ 18.17 LTS (or 20+) suggested.
 */

import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import readline from "readline";
import sharp from "sharp";

// -------------------------------------------------------------
// Helper: yes/no prompt
// -------------------------------------------------------------
async function askYesNo(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve => rl.question(question, resolve));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

// -------------------------------------------------------------
// CLI parsing
// -------------------------------------------------------------
const argv = process.argv.slice(2);
const posArgs = [];

let jpegQuality = 75;
let compressPNG = false;
let pngQuality  = 80;
let renameFiles = false;
let forceDelete = false;

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg.startsWith("-")) {
    switch (arg) {
      case "-q":
      case "--quality": {
        const val = Number(argv[++i]);
        if (!Number.isFinite(val) || val < 1 || val > 100) {
          console.error("JPEG quality must be 1–100");
          process.exit(1);
        }
        jpegQuality = val;
        break;
      }
      case "-P":
      case "--png-quality": {
        const val = Number(argv[++i]);
        if (!Number.isFinite(val) || val < 1 || val > 100) {
          console.error("PNG quality must be 1–100");
          process.exit(1);
        }
        pngQuality  = val;
        compressPNG = true;
        break;
      }
      case "--compress-png":
        compressPNG = true;
        break;
      case "--rename":
        renameFiles = true;
        break;
      case "--force-delete":
        forceDelete = true;
        break;
      case "-h":
      case "--help":
        showHelp();
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        showHelp();
    }
  } else {
    posArgs.push(arg);
  }
}

function showHelp() {
  console.log(`\nUsage: node imageOptimizer.js [inputDir] [outputDir] [options]\n\n` +
    `Default directories: ./input  →  ./output\n\n` +
    `Options:\n` +
    `  -q, --quality <n>       JPEG quality   1–100 (default 75)\n` +
    `  --compress-png          Quantise PNGs (palette) instead of lossless\n` +
    `  -P, --png-quality <n>   PNG quality    1–100 (default 80, implies --compress-png)\n` +
    `  --rename                Rename files to <folder>-<index>.<ext>\n` +
    `  --force-delete          Delete existing output dir without asking\n` +
    `  -h, --help              Show help\n`);
  process.exit();
}

const srcDir  = path.resolve(posArgs[0] ?? "input");
const destDir = path.resolve(posArgs[1] ?? "output");

if (!existsSync(srcDir)) {
  console.error(`Input directory "${srcDir}" does not exist.`);
  process.exit(1);
}

// -------------------------------------------------------------
// Handle existing output dir
// -------------------------------------------------------------
if (existsSync(destDir)) {
  const files = await fs.readdir(destDir);
  if (files.length) {
    let doDelete = forceDelete;
    if (!forceDelete) {
      doDelete = await askYesNo(`Output directory "${path.relative(process.cwd(), destDir)}" already contains ${files.length} item(s). Delete them first? [y/N] `);
    }
    if (doDelete) {
      await fs.rm(destDir, { recursive: true, force: true });
      console.log("Previous optimised images deleted.");
    }
  }
}
await fs.mkdir(destDir, { recursive: true });

// -------------------------------------------------------------
// Constants & counters
// -------------------------------------------------------------
const SUPPORTED_EXT = new Set([ ".jpg", ".jpeg", ".png", ".webp", ".tiff", ".gif", ".avif", ".bmp" ]);
const counters = new Map();
function nextIndex(folder) {
  const n = counters.get(folder) || 1;
  counters.set(folder, n + 1);
  return n;
}

// -------------------------------------------------------------
// Directory traversal
// -------------------------------------------------------------
async function processDir(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const rel = path.relative(srcDir, fullPath);
      await fs.mkdir(path.join(destDir, rel), { recursive: true });
      await processDir(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXT.has(ext)) {
        await optimiseImage(fullPath, ext);
      }
    }
  }
}

// -------------------------------------------------------------
// Optimise single file
// -------------------------------------------------------------
async function optimiseImage(filePath, ext) {
  try {
    const relDir   = path.relative(srcDir, path.dirname(filePath));
    const parts    = relDir.split(path.sep).filter(Boolean);
    const top      = parts.length ? parts[0] : path.basename(srcDir);
    const baseName = path.basename(filePath, path.extname(filePath));

    const idx      = renameFiles ? nextIndex(top) : null;
    const newBase  = renameFiles ? `${top}-${idx}` : baseName;
    const destExt  = ext === ".png" ? ".png" : ".jpg";
    const destPath = path.join(destDir, relDir, newBase + destExt);

    const image = sharp(filePath);
    const meta  = await image.metadata();

    let pipeline = image.resize({ width: meta.width && meta.width > 1920 ? 1920 : undefined });

    if (ext === ".png") {
      pipeline = compressPNG
        ? pipeline.png({ quality: pngQuality, palette: true, compressionLevel: 9 })
        : pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
    } else {
      pipeline = pipeline.jpeg({ quality: jpegQuality, mozjpeg: true });
    }

    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await pipeline.toFile(destPath);

    const status = ext === ".png" ? (compressPNG ? `PNG q=${pngQuality}` : "PNG lossless") : `JPEG q=${jpegQuality}`;
    const renameNote = renameFiles ? ", renamed" : "";
    console.log(`✅ ${path.relative(srcDir, filePath)} → ${path.relative(destDir, destPath)} (${status}${renameNote})`);
  } catch (err) {
    console.error(`❌ Failed to process ${filePath}:`, err.message);
  }
}

// -------------------------------------------------------------
// Go!
// -------------------------------------------------------------
await processDir(srcDir);
console.log("Done! Optimised images are in:", destDir);
