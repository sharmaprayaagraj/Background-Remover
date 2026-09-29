"""Batch Background Remover — standalone desktop GUI.

A modern, dark-mode desktop app built with CustomTkinter and rembg:

* Pick an input folder of images (.png, .jpg, .jpeg, .webp) and an output folder
* "Start Batch Processing" runs the removal on a background thread
* Live progress bar and counter (completed vs. total) plus a run log
* Stop button and a safe shutdown while a batch is running

Run:

    pip install customtkinter
    python desktop_app.py
"""

from __future__ import annotations

import io
import logging
import os
import queue
import sys
import threading
from pathlib import Path
from typing import Final

from PIL import Image, ImageOps
from rembg import new_session, remove

# Guard tkinter itself (fix #18): the bare import used to crash with a raw
# traceback on Python builds without tkinter, before the friendly
# CustomTkinter error could be shown.
try:
    from tkinter import filedialog, messagebox
except ImportError as _tk_exc:
    print(
        "Error: this app requires a Python build with tkinter support.\n"
        f"Details: {_tk_exc}\n"
        "On Debian/Ubuntu: sudo apt install python3-tk"
    )
    sys.exit(1)

try:
    import customtkinter as ctk
except ImportError:
    import tkinter as tk

    _root = tk.Tk()
    _root.withdraw()
    messagebox.showerror(
        "Missing dependency",
        "CustomTkinter is required to run this app.\n\nInstall it with:\n    pip install customtkinter",
    )
    sys.exit(1)

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

APP_TITLE: Final[str] = "Batch Background Remover"
WINDOW_SIZE: Final[str] = "860x640"
SUPPORTED_EXTENSIONS: Final[frozenset[str]] = frozenset({".png", ".jpg", ".jpeg", ".webp"})
OUTPUT_SUFFIX: Final[str] = "_no_bg"

MODELS: Final[dict[str, str]] = {
    "General — u2net (default)": "u2net",
    "General — isnet-general-use": "isnet-general-use",
    "Fast — u2netp (lightweight)": "u2netp",
    "People — u2net_human_seg": "u2net_human_seg",
    "Clothing — u2net_cloth_seg": "u2net_cloth_seg",
}


# --------------------------------------------------------------------------- #
# Image processing helpers
# --------------------------------------------------------------------------- #


def prepare_input(data: bytes) -> bytes:
    """EXIF-rotate and normalize an image to RGBA PNG bytes for rembg."""
    with Image.open(io.BytesIO(data)) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode != "RGBA":
            img = img.convert("RGBA")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        return buffer.getvalue()


def remove_background(data: bytes, session) -> Image.Image:
    """Run background removal on raw image bytes and return an RGBA image."""
    raw = remove(prepare_input(data), session=session)
    return Image.open(io.BytesIO(raw)).convert("RGBA")


def scan_images(input_dir: Path, recurse: bool, exclude_dir: Path | None = None) -> list[Path]:
    """List supported images in a folder, optionally skipping the output dir.

    Recursive scans do not follow symlinked directories (fix #35): Path.glob
    used to descend into them, so a symlinked folder could silently walk the
    scan outside the input directory.
    """
    files: list[Path] = []
    if recurse:
        # os.walk with followlinks=False never descends through symlinks.
        excluded_resolved: Path | None = None
        if exclude_dir is not None:
            try:
                excluded_resolved = exclude_dir.resolve()
            except OSError:
                excluded_resolved = None
        for root, _dirs, names in os.walk(input_dir, followlinks=False):
            root_path = Path(root)
            if excluded_resolved is not None:
                # Skip only the exclusion check on resolve() failure — not the
                # whole directory (fix #14).
                try:
                    root_resolved = root_path.resolve()
                    if excluded_resolved == root_resolved or excluded_resolved in root_resolved.parents:
                        continue
                except OSError:
                    pass
            for name in names:
                path = root_path / name
                try:
                    is_file = path.is_file()
                except OSError:
                    is_file = False
                if is_file and path.suffix.lower() in SUPPORTED_EXTENSIONS:
                    files.append(path)
    else:
        files = [
            path
            for path in input_dir.glob("*")
            if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
        ]
    if exclude_dir is not None:
        excluded = exclude_dir.resolve()
        kept: list[Path] = []
        for path in files:
            try:
                if excluded in path.resolve().parents:
                    continue
            except OSError:
                pass  # keep the file — exclusion is best-effort
            kept.append(path)
        files = kept
    return sorted(files)


def destination_for(src: Path, input_dir: Path, output_dir: Path, recurse: bool) -> Path:
    """Compute the output path, mirroring subfolders when recursing."""
    if recurse and src.parent != input_dir:
        out_dir = output_dir / src.parent.relative_to(input_dir)
    else:
        out_dir = output_dir
    return out_dir / f"{src.stem}{OUTPUT_SUFFIX}.png"


# Cache one session per model across runs (fix #18): every batch previously
# constructed a fresh session, re-doing any per-session setup for the model.
_SESSION_CACHE: dict[str, object] = {}
_SESSION_LOCK = threading.Lock()
# Serializes first-time loads; held across the download (see _load_session).
_LOAD_LOCK = threading.Lock()


def _load_session(model: str, stop_event: threading.Event, log) -> object:
    """Return a cached rembg session for `model`, loading it if needed.

    Stop behaviour (fix #5): `new_session()` is a single blocking call inside
    third-party code, so Stop cannot abort the download itself. Instead the
    load runs on a helper thread and this call polls `stop_event`; when Stop
    is pressed the helper is abandoned (daemon thread) and StopRequested is
    raised immediately. The session cache is written by the helper only when
    the load completes, and a module-level lock serializes loaders so two
    concurrent first-runs can't both download.
    """
    if stop_event.is_set():
        raise StopRequested()

    with _SESSION_LOCK:
        cached = _SESSION_CACHE.get(model)
    if cached is not None:
        return cached

    # Only one downloader at a time; losers wait here and re-check the cache.
    with _LOAD_LOCK:
        with _SESSION_LOCK:
            cached = _SESSION_CACHE.get(model)
        if cached is not None:
            return cached

        log("(first use of this model — downloading weights if needed)")
        result: dict[str, object] = {}

        def _load() -> None:
            try:
                result['session'] = new_session(model)
            except Exception as exc:  # surfaced below on join
                result['error'] = exc

        loader = threading.Thread(target=_load, name='model-loader', daemon=True)
        loader.start()
        while loader.is_alive():
            loader.join(timeout=0.2)
            if stop_event.is_set():
                # Abandon the loader (daemon thread); it eventually finishes
                # and its result is simply discarded.
                raise StopRequested()

        if 'error' in result:
            raise result['error']
        session = result['session']
        with _SESSION_LOCK:
            _SESSION_CACHE[model] = session
        return session


def unique_destination(dest: Path) -> Path:
    """Never overwrite: append _1, _2, … when a file already exists."""
    if not dest.exists():
        return dest
    for index in range(1, 1000):
        candidate = dest.with_name(f"{dest.stem}_{index}{dest.suffix}")
        if not candidate.exists():
            return candidate
    return dest  # give up and overwrite after 999 collisions


# --------------------------------------------------------------------------- #
# Worker thread
# --------------------------------------------------------------------------- #


class StopRequested(Exception):
    """Raised inside the worker when the user presses Stop during model load."""


class BatchProcessor(threading.Thread):
    """Processes a folder of images without ever blocking the UI thread.

    All communication with the UI happens through `messages`, a queue of
    tuples consumed by the main thread:

        ("log", text)
        ("progress", done, total)
        ("done", status, summary)
    """

    def __init__(
        self,
        input_dir: Path,
        output_dir: Path,
        model: str,
        recurse: bool,
        messages: queue.Queue,
        stop_event: threading.Event,
    ) -> None:
        super().__init__(name="batch-processor", daemon=True)
        self.input_dir = input_dir
        self.output_dir = output_dir
        self.model = model
        self.recurse = recurse
        self.messages = messages
        self.stop_event = stop_event

    def _log(self, text: str) -> None:
        self.messages.put(("log", text))

    def run(self) -> None:
        try:
            self._process_all()
        except StopRequested:
            self.messages.put(("done", "stopped", "Stopped during model load."))
        except Exception as exc:
            logger.exception("Batch processing crashed")
            self._log(f"Unexpected error: {exc}")
            self.messages.put(("done", "error", f"Unexpected error: {exc}"))

    def _process_all(self) -> None:
        # Exclude the output folder so re-runs never reprocess past results.
        files = scan_images(self.input_dir, self.recurse, exclude_dir=self.output_dir)
        if not files:
            self._log("No supported images found in the input folder.")
            self.messages.put(
                ("done", "idle", "No supported images (.png, .jpg, .jpeg, .webp) were found.")
            )
            return

        total = len(files)
        self.messages.put(("progress", 0, total))
        self._log(f"Found {total} image(s).")

        self._log(f"Loading model '{self.model}' (first run downloads the weights)…")
        # Loading is interruptible (fix #18): Stop used to be ignored for the
        # whole (potentially minutes-long) first-time model download.
        session = _load_session(self.model, self.stop_event, self._log)
        self._log("Model loaded — processing started.")

        succeeded = failed = 0
        for src in files:
            if self.stop_event.is_set():
                self._log("Stopped by user.")
                done = succeeded + failed
                self.messages.put(("done", "stopped", f"Stopped after {done} of {total} images."))
                return
            try:
                dest = unique_destination(destination_for(src, self.input_dir, self.output_dir, self.recurse))
                result = remove_background(src.read_bytes(), session)
                dest.parent.mkdir(parents=True, exist_ok=True)
                # Write via a temp file + atomic rename (fix #35): a kill or
                # crash mid-save previously left a truncated PNG behind that a
                # later run would treat as a valid previous result.
                tmp_dest = dest.with_name(dest.name + ".tmp")
                result.save(tmp_dest, format="PNG", optimize=True)
                tmp_dest.replace(dest)
                succeeded += 1
                self._log(f"OK   {src.name}  ->  {dest}")
            except Exception as exc:
                failed += 1
                logger.exception("Failed to process %s", src)
                self._log(f"FAIL {src.name}: {exc}")
            if not self.stop_event.is_set():
                # Fix #35: don't queue progress updates once the user pressed
                # Stop — they were already consumed by the UI after "done" and
                # repainted the counter past its final value.
                self.messages.put(("progress", succeeded + failed, total))

        summary = f"{succeeded} succeeded, {failed} failed"
        self._log(f"Finished: {summary}. Output: {self.output_dir}")
        self.messages.put(("done", "completed", summary))


# --------------------------------------------------------------------------- #
# Main window
# --------------------------------------------------------------------------- #


class BatchRemoverApp(ctk.CTk):
    """Main application window. All UI work happens on the main thread."""

    POLL_MS: Final[int] = 100

    def __init__(self) -> None:
        super().__init__()
        self.title(APP_TITLE)
        self.geometry(WINDOW_SIZE)
        self.minsize(720, 560)

        self.messages: queue.Queue = queue.Queue()
        self.stop_event = threading.Event()
        self.worker: BatchProcessor | None = None
        self._poll_job: str | None = None

        self.input_var = ctk.StringVar()
        self.output_var = ctk.StringVar()
        self.model_var = ctk.StringVar(value=next(iter(MODELS)))
        self.recurse_var = ctk.BooleanVar(value=False)

        self._build_layout()

        self.protocol("WM_DELETE_WINDOW", self._on_close)
        self._poll_job = self.after(self.POLL_MS, self._poll_messages)

    # ------------------------------------------------------------------ #
    # Layout
    # ------------------------------------------------------------------ #

    def _build_layout(self) -> None:
        ctk.CTkLabel(self, text=APP_TITLE, font=ctk.CTkFont(size=24, weight="bold")).pack(
            pady=(18, 2)
        )
        ctk.CTkLabel(
            self,
            text="Remove backgrounds from every image in a folder — powered by rembg.",
            text_color="gray",
        ).pack()

        # Folder pickers ---------------------------------------------------
        folders = ctk.CTkFrame(self, fg_color="transparent")
        folders.pack(fill="x", padx=20, pady=(16, 6))
        folders.columnconfigure(1, weight=1)

        ctk.CTkLabel(folders, text="Input folder", width=100, anchor="w").grid(
            row=0, column=0, sticky="w", pady=4
        )
        ctk.CTkEntry(
            folders,
            textvariable=self.input_var,
            placeholder_text="Choose the folder that contains your images…",
        ).grid(row=0, column=1, sticky="ew", padx=8)
        ctk.CTkButton(folders, text="Browse…", width=90, command=self._browse_input).grid(
            row=0, column=2
        )

        ctk.CTkLabel(folders, text="Output folder", width=100, anchor="w").grid(
            row=1, column=0, sticky="w", pady=4
        )
        ctk.CTkEntry(
            folders,
            textvariable=self.output_var,
            placeholder_text="Where the transparent PNGs will be saved…",
        ).grid(row=1, column=1, sticky="ew", padx=8)
        ctk.CTkButton(folders, text="Browse…", width=90, command=self._browse_output).grid(
            row=1, column=2
        )

        # Options + action buttons ------------------------------------------
        controls = ctk.CTkFrame(self, fg_color="transparent")
        controls.pack(fill="x", padx=20, pady=6)
        controls.columnconfigure(0, weight=1)

        options = ctk.CTkFrame(controls, fg_color="transparent")
        options.grid(row=0, column=0, sticky="w")
        ctk.CTkLabel(options, text="Model:").pack(side="left")
        ctk.CTkOptionMenu(options, values=list(MODELS), variable=self.model_var, width=260).pack(
            side="left", padx=(8, 16)
        )
        ctk.CTkCheckBox(options, text="Include subfolders", variable=self.recurse_var).pack(
            side="left"
        )

        self.start_button = ctk.CTkButton(
            controls,
            text="Start Batch Processing",
            width=200,
            height=36,
            font=ctk.CTkFont(size=14, weight="bold"),
            command=self._start,
        )
        self.start_button.grid(row=0, column=1, padx=(8, 6))

        self.stop_button = ctk.CTkButton(
            controls,
            text="Stop",
            width=90,
            height=36,
            fg_color="#a33b3b",
            hover_color="#8c2f2f",
            state="disabled",
            command=self._stop,
        )
        self.stop_button.grid(row=0, column=2)

        # Progress -----------------------------------------------------------
        progress_frame = ctk.CTkFrame(self, fg_color="transparent")
        progress_frame.pack(fill="x", padx=20, pady=(10, 4))
        self.progress_label = ctk.CTkLabel(progress_frame, text="Ready — 0 / 0 processed", anchor="w")
        self.progress_label.pack(fill="x")
        self.progress_bar = ctk.CTkProgressBar(progress_frame)
        self.progress_bar.set(0.0)
        self.progress_bar.pack(fill="x", pady=(4, 0))

        # Run log ------------------------------------------------------------
        self.log_box = ctk.CTkTextbox(self, wrap="word", font=ctk.CTkFont(size=13))
        self.log_box.pack(fill="both", expand=True, padx=20, pady=(8, 4))
        self.log_box.configure(state="disabled")

        self.status_label = ctk.CTkLabel(self, text="Idle.", anchor="w", text_color="gray")
        self.status_label.pack(fill="x", padx=20, pady=(0, 12))

        self._append_log("Pick an input folder, then press 'Start Batch Processing'.")
        self._append_log("Note: models download to ~/.u2net on first use.")

    # ------------------------------------------------------------------ #
    # Actions
    # ------------------------------------------------------------------ #

    def _browse_input(self) -> None:
        folder = filedialog.askdirectory(title="Select the input folder")
        if folder:
            self.input_var.set(folder)
            if not self.output_var.get():
                self.output_var.set(str(Path(folder) / "no-bg"))

    def _browse_output(self) -> None:
        folder = filedialog.askdirectory(title="Select the output folder")
        if folder:
            self.output_var.set(folder)

    def _start(self) -> None:
        if self.worker is not None and self.worker.is_alive():
            return

        input_text = self.input_var.get().strip()
        if not input_text:
            messagebox.showwarning(APP_TITLE, "Please choose an input folder first.")
            return
        output_text = self.output_var.get().strip() or str(Path(input_text) / "no-bg")
        self.output_var.set(output_text)

        input_dir = Path(input_text).expanduser().resolve()
        output_dir = Path(output_text).expanduser().resolve()

        if not input_dir.is_dir():
            messagebox.showwarning(APP_TITLE, "Please choose a valid input folder.")
            return
        if output_dir.exists() and not output_dir.is_dir():
            messagebox.showwarning(APP_TITLE, "The output path is a file, not a folder.")
            return

        self.stop_event.clear()
        self.progress_bar.set(0.0)
        self.progress_label.configure(text="Processed 0 / 0")
        self._append_log(f"── New run — input: {input_dir}")
        self.status_label.configure(text="Running…")

        self.start_button.configure(state="disabled")
        self.stop_button.configure(state="normal")

        self.worker = BatchProcessor(
            input_dir=input_dir,
            output_dir=output_dir,
            model=MODELS[self.model_var.get()],
            recurse=self.recurse_var.get(),
            messages=self.messages,
            stop_event=self.stop_event,
        )
        self.worker.start()

    def _stop(self) -> None:
        self.stop_event.set()
        self.stop_button.configure(state="disabled")
        self._append_log("Stopping after the current image…")

    def _on_close(self) -> None:
        if self.worker is not None and self.worker.is_alive():
            if not messagebox.askokcancel(
                APP_TITLE, "Processing is still running.\n\nStop the batch and quit?"
            ):
                return
            self.stop_event.set()
            self.worker.join(timeout=3)
        # Cancel the message pump before destroy: otherwise the pending
        # after() callback fired on a dead window and raised TclError (fix #35).
        try:
            self.after_cancel(self._poll_job)
        except (AttributeError, RuntimeError):
            pass
        self.destroy()

    # ------------------------------------------------------------------ #
    # Message pump (worker -> UI)
    # ------------------------------------------------------------------ #

    def _poll_messages(self) -> None:
        try:
            while True:
                self._handle_message(self.messages.get_nowait())
        except queue.Empty:
            pass
        self._poll_job = self.after(self.POLL_MS, self._poll_messages)

    def _handle_message(self, message: tuple) -> None:
        kind = message[0]
        if kind == "log":
            self._append_log(message[1])
        elif kind == "progress":
            _, done, total = message
            self.progress_bar.set(done / total if total else 0.0)
            self.progress_label.configure(text=f"Processed {done} / {total}")
        elif kind == "done":
            self._finish(message[1], message[2])

    def _finish(self, status: str, summary: str) -> None:
        self.start_button.configure(state="normal")
        self.stop_button.configure(state="disabled")
        if status == "completed":
            self.status_label.configure(text=f"Completed — {summary}.")
            messagebox.showinfo(
                APP_TITLE,
                f"Batch processing finished.\n\n{summary}\n\nResults are in the output folder.",
            )
        elif status == "stopped":
            self.status_label.configure(text=f"Stopped — {summary}.")
        elif status == "idle":
            self.status_label.configure(text="No images found.")
        else:
            self.status_label.configure(text="Failed — see log.")

    def _append_log(self, text: str) -> None:
        self.log_box.configure(state="normal")
        self.log_box.insert("end", text + "\n")
        self.log_box.see("end")
        self.log_box.configure(state="disabled")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )
    ctk.set_appearance_mode("dark")
    ctk.set_default_color_theme("blue")
    BatchRemoverApp().mainloop()


if __name__ == "__main__":
    main()
