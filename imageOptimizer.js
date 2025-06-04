#!/usr/bin/env node
/**
 * imageOptimizer.js
 * -------------------------------------------------------------
 * Author: Lukas Vosylius 
 * License: GNU General Public License v3.0
 * Date: 2025.06.04
 * -------------------------------------------------------------
 *
 * Resize images to a maximum width of 1920px (height scaled automatically).
 *
 * • PNG files stay PNG – choose lossless (default) or lossy compression.
 * • All other formats become JPEG with adjustable quality (MozJPEG).
 * • Folder hierarchy inside the input directory is mirrored in the output directory.
 * • Default paths: ./input → ./output. Supply other folders on the command line if needed.
 * • Optional renaming with --rename → <top-folder>-<index>.<ext>.
 * • Safety prompt: if the output folder already contains files, the script asks
 *   whether to delete them first. Use --force-delete to skip the prompt and wipe automatically.
 *
 * Usage
 *   node imageOptimizer.js [options] [inputDir] [outputDir]
 *
 * Examples
 *   # Just run – uses ./input → ./output, keeps filenames, lossless PNG
 *   node imageOptimizer.js -q 80
 *
 *   # Custom paths + extra flags
 *   node imageOptimizer.js ./photos ./publish -q 85 -P 70 --rename --force-delete
 *
 * Requires
 *   npm install sharp commander
 *   Node ≥ 18.17 LTS (or 20+) suggested.
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import readline from 'readline';
import { Command } from 'commander';
import sharp from 'sharp';

// -------------------------------------------------------------
// Supported extensions and default values
// -------------------------------------------------------------
const SUPPORTED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.tiff',
  '.gif',
  '.avif',
  '.bmp',
]);

// -------------------------------------------------------------
// CLI Configuration (commander)
// -------------------------------------------------------------
const program = new Command();

program
  .name('imageOptimizer')
  .description('Resize and compress images, mirroring folder structure.')
  .version('1.2.0')
  .argument('[inputDir]', 'Source directory', 'input')
  .argument('[outputDir]', 'Destination directory', 'output')
  .option('-q, --quality <number>', 'JPEG quality (1–100)', parseIntegerInRange(1, 100), 75)
  .option('--compress-png', 'Quantize PNGs (palette) instead of lossless', false)
  .option('-P, --png-quality <number>', 'PNG quality (1–100, implies --compress-png)', parseIntegerInRange(1, 100), 80)
  .option('--rename', 'Rename files to <folder>-<index>.<ext>', false)
  .option('--force-delete', 'Delete existing output dir without asking', false)
  .parse(process.argv);

const options = program.opts();
const [rawInputDir, rawOutputDir] = program.args;

const srcDir = path.resolve(rawInputDir);
const destDir = path.resolve(rawOutputDir);

let jpegQuality = options.quality;
let compressPNG = options.compressPng || false;
let pngQuality = options.pngQuality;
let renameFiles = options.rename;
let forceDelete = options.forceDelete;

/**
 * Parse an integer and ensure it falls within a closed range.
 * Used as a custom argument parser for commander.
 *
 * @param {number} min
 * @param {number} max
 * @returns {(value: string) => number}
 */
function parseIntegerInRange(min, max) {
  return (value) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw new Error(`Value must be an integer between ${min} and ${max}`);
    }
    return parsed;
  };
}

/**
 * Prompt the user with a yes/no question in the console.
 *
 * @param {string} question
 * @returns {Promise<boolean>}
 */
async function askYesNo(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await new Promise((resolve) => {
    rl.question(question, (ans) => {
      resolve(ans.trim());
    });
  });
  rl.close();
  return /^y(es)?$/i.test(answer);
}

/**
 * Process a single image file: resize, compress, convert as needed,
 * and write to the mirrored destination directory.
 *
 * @param {string} filePath - Absolute path to the source image.
 */
async function optimiseImage(filePath) {
  try {
    const relativeDir = path.relative(srcDir, path.dirname(filePath));
    const pathSegments = relativeDir.split(path.sep).filter(Boolean);
    const topFolder = pathSegments.length ? pathSegments[0] : path.basename(srcDir);
    const originalName = path.basename(filePath, path.extname(filePath));

    const index = renameFiles ? getNextIndex(topFolder) : null;
    const baseName = renameFiles ? `${topFolder}-${index}` : originalName;
    const sourceExt = path.extname(filePath).toLowerCase();
    const targetExt = sourceExt === '.png' ? '.png' : '.jpg';

    const destinationPath = path.join(destDir, relativeDir, baseName + targetExt);
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });

    const image = sharp(filePath);
    const metadata = await image.metadata();

    // Only resize if width > 1920
    const resizeOptions = {};
    if (metadata.width && metadata.width > 1920) {
      resizeOptions.width = 1920;
    }
    let pipeline = image.resize(resizeOptions);

    if (sourceExt === '.png') {
      if (compressPNG) {
        pipeline = pipeline.png({
          quality: pngQuality,
          palette: true,
          compressionLevel: 9,
        });
      } else {
        pipeline = pipeline.png({
          compressionLevel: 9,
          adaptiveFiltering: true,
        });
      }
    } else {
      pipeline = pipeline.jpeg({
        quality: jpegQuality,
        mozjpeg: true,
      });
    }

    await pipeline.toFile(destinationPath);

    const status = sourceExt === '.png'
      ? compressPNG
        ? `PNG q=${pngQuality}`
        : 'PNG (lossless)'
      : `JPEG q=${jpegQuality}`;
    const renameNote = renameFiles ? ', renamed' : '';

    console.log(
      `✅ ${path.relative(srcDir, filePath)} → ${path.relative(destDir, destinationPath)} (${status}${renameNote})`
    );
  } catch (err) {
    console.error(`❌ Failed to process "${filePath}": ${err.message}`);
  }
}

/**
 * Traverse a directory recursively and process all supported image files.
 *
 * @param {string} directory - Absolute path to the directory to process.
 */
async function processDirectory(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const relSubdir = path.relative(srcDir, fullPath);
      await fs.mkdir(path.join(destDir, relSubdir), { recursive: true });
      await processDirectory(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        await optimiseImage(fullPath);
      }
    }
  }
}

// Map to keep track of renaming indices per top-level folder
const renameCounters = new Map();

/**
 * Get the next index number for files in a given folder,
 * used when --rename is enabled.
 *
 * @param {string} folder
 * @returns {number}
 */
function getNextIndex(folder) {
  const current = renameCounters.get(folder) || 1;
  renameCounters.set(folder, current + 1);
  return current;
}

/**
 * Entry point: validate inputs, handle existing output directory,
 * then kick off the directory traversal and optimization.
 */
async function main() {
  // Validate source directory
  if (!existsSync(srcDir)) {
    console.error(`Input directory "${srcDir}" does not exist.`);
    process.exit(1);
  }

  // Handle existing output directory
  if (existsSync(destDir)) {
    const existingFiles = await fs.readdir(destDir);
    if (existingFiles.length > 0) {
      let shouldDelete = forceDelete;
      if (!forceDelete) {
        const question = `Output directory "${path.relative(
          process.cwd(),
          destDir
        )}" already contains ${existingFiles.length} item(s). Delete them first? [y/N] `;
        shouldDelete = await askYesNo(question);
      }
      if (shouldDelete) {
        await fs.rm(destDir, { recursive: true, force: true });
        console.log('Previous optimized images deleted.');
      }
    }
  }

  // Create (or re-create) the output directory
  await fs.mkdir(destDir, { recursive: true });

  // Start processing
  await processDirectory(srcDir);
  console.log('✅ Done! Optimized images are in:', destDir);
}

// Invoke main() and catch any uncaught errors
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
