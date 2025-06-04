# Image Optimizer
Resize images to a maximum width of 1920 px (height scales automatically) and compress them to the desired quality.

---

## Features

- **Resize** images to a maximum width of **1920 px** (height scales automatically).
- **PNG stays PNG**  
  - Default: lossless compression  
  - Optional: lossy, palette-based quantisation (`--compress-png` or `-P`)
- **Everything else becomes JPEG** using **MozJPEG**, with adjustable quality.
- **Folder hierarchy** from the **input** directory is **mirrored** in **output**.
- **Default paths:** `./input` → `./output` (override on the command line).
- **Optional renaming:** `--rename` → `<top-folder>-<index>.<ext>`.
- **Safety prompt:** if the output folder already exists, you’ll be asked whether to wipe it first.  
  Use `--force-delete` to skip the prompt and delete automatically.

---

## Usage

```bash
node imageOptimizer.js [inputDir] [outputDir] [options]
