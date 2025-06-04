# Image Optimizer

Resize images to a maximum width of 1920 px (height scales automatically) and compress them to the desired quality.

---

## Features

* **Resize** images to a maximum width of **1920 px** (height scales automatically).
* **PNG stays PNG**

  * Default: lossless compression
  * Optional: lossy, palette-based quantisation (`--compress-png` or `-P`)
* **Everything else becomes JPEG** using **MozJPEG**, with adjustable quality.
* **Folder hierarchy** from the **input** directory is **mirrored** in **output**.
* **Default paths:** `./input` → `./output` (override on the command line).
* **Optional renaming:** `--rename` → `<top-folder>-<index>.<ext>`.
* **Safety prompt:** if the output folder already exists, you’ll be asked whether to wipe it first.
Use `--force-delete` to skip the prompt and delete automatically.

---

## Usage

```bash
node imageOptimizer.js [inputDir] [outputDir] [options]
```

### Options

```text
-q, --quality <n>       JPEG quality   1–100  (default 75)
--compress-png          Quantise PNGs (palette) instead of lossless
-P, --png-quality <n>   PNG quality    1–100  (default 80, implies --compress-png)
--rename                Rename files to <folder>-<index>.<ext>
--force-delete          Delete existing output dir without asking
-h, --help              Show this help
```

### Examples

````bash
# Just run – uses ./input → ./output; keeps filenames; lossless PNG
node imageOptimizer.js -q 80

# Custom paths + extra flags
node imageOptimizer.js ./photos ./publish -q 85 -P 70 --rename --force-delete

# Lossy PNG quantisation only (quality 60)
node imageOptimizer.js -P 60

# High‑quality JPEGs (q=90) and rename output files
node imageOptimizer.js --rename -q 90

# Raw → Web: lossy PNG + JPEG with custom folders
node imageOptimizer.js ./raw ./web -q 85 --compress-png

# Wipe output folder automatically, then process with defaults
node imageOptimizer.js --force-delete

# Just run – uses ./input → ./output, keeps filenames, lossless PNG
node imageOptimizer.js -q 80

# Custom paths + extra flags
node imageOptimizer.js ./photos ./publish -q 85 -P 70 --rename --force-delete
````

---

## Requirements

* **Node ≥ 18.17 LTS** (or 20+) suggested.

---

## Installation
* `npm install ` or `npm -i`
