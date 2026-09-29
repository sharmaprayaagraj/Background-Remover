# Batch Background Remover

A production-ready **Streamlit** web app that removes backgrounds from multiple
images in batch using [rembg](https://github.com/danielgatis/rembg) (U2-Net)
and [Pillow](https://python-pillow.org/). All processing runs locally — no
image is ever sent to an external API.

This repository is a small suite of related tools:

- `app.py` — the Streamlit batch web app (this document)
- `desktop_app.py` — a standalone desktop GUI (see below)
- `web_app/` — a browser-only React app, no Python required (see below)

## Features

- 🖱️ **Drag & drop uploads** for multiple images (`.png`, `.jpg`, `.jpeg`, `.webp`)
- ⏳ **Live status** — per-image spinners plus an overall progress bar
- 👀 **Side-by-side previews** of the original vs. the transparent result
  (rendered over a checkerboard so transparency is visible)
- ⬇️ **Individual PNG download button** for every processed image
- 📦 **One-click batch download** — a primary sidebar button bundles all
  transparent PNGs into a single `.zip` archive
- ⚙️ **Settings** — segmentation model choice, optional alpha matting, and a
  max-dimension cap for faster processing of huge images
- 🧠 **Session caching** — results survive Streamlit reruns; uploads are
  processed exactly once per session

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate        # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
streamlit run app.py
```

Then open the URL Streamlit prints (usually <http://localhost:8501>).

> The **first run downloads the selected model** (~170 MB for `u2net`) and
> caches it in `~/.u2net`. Subsequent runs start instantly.

## Usage

1. Drag images into the uploader (or click to browse).
2. Each image is processed in turn — watch the spinners and progress bar.
3. Compare original vs. transparent results side by side.
4. Grab individual PNGs with each **Download PNG** button, or use the primary
   **⬇️ Download all (.zip)** button in the sidebar for the whole batch.
5. Changed a setting? Click **♻️ Re-run removal** to reprocess the current
   uploads. **🗑️ Clear results** empties the workspace and resets the uploader.

## Desktop GUI version

`desktop_app.py` is a standalone desktop alternative built with CustomTkinter:

```bash
pip install customtkinter          # rembg + pillow are already in requirements.txt
python desktop_app.py
```

- 🌓 Modern **dark-mode** interface (CustomTkinter)
- 📁 Pick an **input folder** (optionally including subfolders) and an **output folder**
- ▶️ **Start Batch Processing** runs on a background thread — the UI never freezes
- 📊 Live **progress bar** with a completed-vs-total counter and a run log
- ⏹️ **Stop** button and a safe shutdown while a batch is running
- 🧠 Results are written as `<name>_no_bg.png`, never overwriting existing files

## Browser app — no Python, nothing uploaded

`web_app/` is a React port that runs background removal **entirely in the
browser** using ONNX Runtime (WASM/WebGPU). Images never leave the device and
no Python install is needed:

```bash
cd web_app
npm install
npm run dev        # then open http://localhost:5173
```

- 🔒 100% client-side — the model is fetched once and cached by the browser
- 🖌️ Manual refinement — erase/restore brushes, undo/redo, crop, edge smoothing
- 🎨 Background replacement — solid colors, custom images, drop shadows
- 📋 Paste images directly from the clipboard (Ctrl+V)
- 💾 Export PNG / JPEG / WebP with quality control

Run `npm run build` in `web_app/` to produce a static build in `dist/` that can
be hosted anywhere. See `web_app/README.md` for details.

## Settings

| Setting | Description |
| --- | --- |
| Segmentation model | `u2net` (default), `isnet-general-use`, `u2netp` (fast), `u2net_human_seg`, `u2net_cloth_seg` |
| Alpha matting | Finer semi-transparent edges (hair, fur). Requires `pymatting` — uncomment it in `requirements.txt`. |
| Max image dimension | Downscale inputs (aspect preserved) before inference; output matches this size. |

## Notes & limits

- Results are held in memory for the browser session; for very large batches,
  download and **Clear results** periodically.
- Animated inputs use their first frame.
- Each upload is capped at 25 MB (configurable via `MAX_FILE_BYTES` in `app.py`).
- Pillow's decompression-bomb guard applies to extremely large images.
