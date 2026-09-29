"""Batch Background Remover — strip backgrounds from many images at once.

A production-ready Streamlit app built on `rembg` (U2-Net) and Pillow:

* Drag & drop multiple images (.png, .jpg, .jpeg, .webp)
* Per-image spinners plus an overall progress bar while converting
* Side-by-side original vs. transparent-result previews
* Individual PNG download button for every processed image
* One-click ZIP bundle of all results in the sidebar

Run locally:

    pip install -r requirements.txt
    streamlit run app.py
"""

from __future__ import annotations

import io
import logging
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Final

import numpy as np
import streamlit as st
from PIL import Image, ImageOps

if TYPE_CHECKING:
    from streamlit.runtime.uploaded_file_manager import UploadedFile

st.set_page_config(
    page_title="Batch Background Remover",
    page_icon="🖼️",
    layout="wide",
)

try:
    from rembg import new_session, remove
except ImportError:
    st.error(
        "The `rembg` package is missing. Install the dependencies first:\n\n"
        "```bash\npip install -r requirements.txt\n```"
    )
    st.stop()

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

UPLOADER_TYPES: Final[list[str]] = ["png", "jpg", "jpeg", "webp"]
ALLOWED_EXTENSIONS: Final[frozenset[str]] = frozenset(UPLOADER_TYPES)
MAX_FILE_BYTES: Final[int] = 25 * 1024 * 1024  # 25 MB per upload
PREVIEW_MAX_PX: Final[int] = 720  # longest edge of on-screen previews

MODELS: Final[dict[str, str]] = {
    "General — u2net (default)": "u2net",
    "General — isnet-general-use": "isnet-general-use",
    "Fast — u2netp (lightweight)": "u2netp",
    "People — u2net_human_seg": "u2net_human_seg",
    "Clothing — u2net_cloth_seg": "u2net_cloth_seg",
}

MAX_DIMENSIONS: Final[dict[str, int | None]] = {
    "Original size": None,
    "4096 px": 4096,
    "2048 px": 2048,
    "1024 px (fastest)": 1024,
}

# Session-state keys.
RESULTS: Final[str] = "results"
ERRORS: Final[str] = "errors"
ZIP_CACHE: Final[str] = "zip_cache"
UPLOADER_VERSION: Final[str] = "uploader_version"


# --------------------------------------------------------------------------- #
# Data model
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class ProcessedImage:
    """Everything needed to preview and download one converted image."""

    key: str
    name: str
    out_name: str
    result_bytes: bytes
    original_preview: Image.Image
    result_preview: Image.Image
    width: int
    height: int
    has_foreground: bool


# --------------------------------------------------------------------------- #
# Image helpers
# --------------------------------------------------------------------------- #


def make_key(file: UploadedFile) -> str:
    """Build a stable identifier for an upload, consistent across reruns."""
    file_id = getattr(file, "id", None)
    if file_id:
        return str(file_id)
    return f"{file.name}|{file.size}|{file.type}"


def validate_upload(file: UploadedFile) -> str | None:
    """Return an error message for invalid uploads, or None if acceptable."""
    suffix = Path(file.name).suffix.lower().lstrip(".")
    if suffix not in ALLOWED_EXTENSIONS:
        return f"Unsupported file type: .{suffix or 'unknown'}"
    if file.size and file.size > MAX_FILE_BYTES:
        return f"File exceeds the {MAX_FILE_BYTES // (1024 * 1024)} MB limit"
    return None


def _prepare_input(data: bytes, max_dim: int | None) -> bytes:
    """Normalize an image before inference (EXIF rotation, downscale, mode).

    Returns the original bytes untouched when no normalization is needed.
    """
    with Image.open(io.BytesIO(data)) as img:
        orientation = img.getexif().get(274, 1) or 1  # 274 = EXIF Orientation
        needs_work = (
            orientation != 1
            or img.mode not in ("RGB", "RGBA")
            or (max_dim is not None and max(img.size) > max_dim)
        )
        if not needs_work:
            return data

        img = ImageOps.exif_transpose(img)
        if max_dim is not None and max(img.size) > max_dim:
            img.thumbnail((max_dim, max_dim), Image.LANCZOS)
        if img.mode != "RGBA":
            img = img.convert("RGBA")

        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        return buffer.getvalue()


def _make_original_preview(data: bytes) -> Image.Image:
    """Thumbnail of the source image (EXIF-rotated) for the left column."""
    with Image.open(io.BytesIO(data)) as img:
        thumb = ImageOps.exif_transpose(img).copy()
    thumb.thumbnail((PREVIEW_MAX_PX, PREVIEW_MAX_PX), Image.LANCZOS)
    return thumb


def _checkerboard(size: tuple[int, int], square: int = 12) -> Image.Image:
    """Checkerboard RGBA background so transparency is visible in previews."""
    width, height = size
    rows, cols = np.mgrid[0:height, 0:width]
    shade = np.where(((rows // square) + (cols // square)) % 2 == 0, 255, 205)
    tile = np.dstack([shade, shade, shade]).astype("uint8")
    return Image.fromarray(tile, mode="RGB").convert("RGBA")


def _make_result_preview(result_img: Image.Image) -> Image.Image:
    """Thumbnail of the transparent result, composited over a checkerboard."""
    thumb = result_img.copy()
    thumb.thumbnail((PREVIEW_MAX_PX, PREVIEW_MAX_PX), Image.LANCZOS)
    return Image.alpha_composite(_checkerboard(thumb.size), thumb)


@st.cache_resource(show_spinner="Loading segmentation model…")
def get_rembg_session(model_name: str):
    """Load (and cache) one rembg session per model across all reruns."""
    logger.info("Loading rembg model: %s", model_name)
    return new_session(model_name)


def process_upload(
    file: UploadedFile,
    model: str,
    alpha_matting: bool,
    max_dim: int | None,
) -> ProcessedImage:
    """Run background removal on one upload and package the result."""
    data = file.getvalue()
    prepared = _prepare_input(data, max_dim)
    session = get_rembg_session(model)

    kwargs: dict[str, object] = {}
    if alpha_matting:
        try:
            import pymatting  # noqa: F401
        except ImportError:
            # Surface a clear, actionable message instead of a raw per-image
            # rembg exception when the optional dependency is missing (fix #34).
            raise RuntimeError(
                "Alpha matting requires the optional `pymatting` package. "
                "Install it with `pip install pymatting` or turn the toggle off."
            ) from None
        kwargs = {
            "alpha_matting": True,
            "alpha_matting_foreground_threshold": 240,
            "alpha_matting_background_threshold": 15,
            "alpha_matting_erode_size": 10,
        }

    raw = remove(prepared, session=session, **kwargs)  # type: ignore[arg-type]
    result_img = Image.open(io.BytesIO(raw)).convert("RGBA")

    buffer = io.BytesIO()
    result_img.save(buffer, format="PNG", optimize=True)

    alpha_min, alpha_max = result_img.getchannel("A").getextrema()
    return ProcessedImage(
        key=make_key(file),
        name=file.name,
        out_name=f"{Path(file.name).stem}_no_bg.png",
        result_bytes=buffer.getvalue(),
        original_preview=_make_original_preview(data),
        result_preview=_make_result_preview(result_img),
        width=result_img.width,
        height=result_img.height,
        has_foreground=alpha_max > 0,
    )


def build_zip(entries: list[ProcessedImage]) -> bytes:
    """Bundle every processed PNG into an in-memory ZIP archive."""
    buffer = io.BytesIO()
    used_names: set[str] = set()
    # PNGs are already deflate-compressed, so ZIP_STORED is fast and lossless.
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_STORED) as archive:
        for index, entry in enumerate(entries, start=1):
            name = entry.out_name
            if name.lower() in used_names:
                name = f"{Path(entry.name).stem}_{index}_no_bg.png"
            used_names.add(name.lower())
            archive.writestr(name, entry.result_bytes)
    return buffer.getvalue()


def get_zip_download(entries: list[ProcessedImage]) -> bytes:
    """Return cached ZIP bytes, rebuilding only when the results change."""
    signature = tuple(entry.key for entry in entries)
    cached = st.session_state[ZIP_CACHE]
    if cached is not None and cached[0] == signature:
        return cached[1]
    data = build_zip(entries)
    st.session_state[ZIP_CACHE] = (signature, data)
    return data


# --------------------------------------------------------------------------- #
# Session-state helpers
# --------------------------------------------------------------------------- #


def init_session_state() -> None:
    st.session_state.setdefault(RESULTS, {})
    st.session_state.setdefault(ERRORS, {})
    st.session_state.setdefault(ZIP_CACHE, None)
    st.session_state.setdefault(UPLOADER_VERSION, 0)


def clear_results() -> None:
    """Drop every processed result, error, and the cached ZIP."""
    st.session_state[RESULTS] = {}
    st.session_state[ERRORS] = {}
    st.session_state[ZIP_CACHE] = None


def prune_stale_results(uploaded_files: list[UploadedFile]) -> None:
    """Remove cached results whose uploads no longer exist.

    Keys come from `make_key`: Streamlit's per-upload file id when available,
    falling back to name+size+type. With the id present, re-uploading the
    same file name produces a new key so a stale error entry is pruned here.
    Known limitation: if `file.id` is unavailable (older Streamlit versions),
    the fallback key is identical for a replaced file of the same name and
    size, and its cached error survives until "Clear results".
    """
    current_keys = {make_key(file) for file in uploaded_files}
    results = st.session_state[RESULTS]
    errors = st.session_state[ERRORS]
    stale = [key for key in results if key not in current_keys]
    stale += [key for key in errors if key not in current_keys]
    if stale:
        for key in stale:
            results.pop(key, None)
            errors.pop(key, None)
        st.session_state[ZIP_CACHE] = None


# --------------------------------------------------------------------------- #
# UI
# --------------------------------------------------------------------------- #


def render_sidebar() -> tuple[str, bool, int | None]:
    """Draw the settings / download sidebar and return the current settings."""
    with st.sidebar:
        st.header("⚙️ Settings")
        model_label = st.selectbox(
            "Segmentation model",
            list(MODELS),
            index=0,
            help="Model weights download automatically on first use and are cached locally.",
        )
        alpha_matting = st.toggle(
            "Alpha matting (finer edges)",
            value=False,
            help="Refines semi-transparent edges such as hair and fur. "
            "Requires the optional `pymatting` package.",
        )
        max_dim_label = st.selectbox(
            "Max image dimension",
            list(MAX_DIMENSIONS),
            index=1,
            help="Larger images are downscaled (aspect preserved) before processing "
            "to save memory and time. Results match this size.",
        )

        st.divider()
        st.header("📥 Download")
        results: dict[str, ProcessedImage] = st.session_state[RESULTS]
        if results:
            entries = list(results.values())
            st.download_button(
                "⬇️ Download all (.zip)",
                data=get_zip_download(entries),
                file_name=f"no-bg_{len(entries)}_images.zip",
                mime="application/zip",
                type="primary",
                use_container_width=True,
                key="download_zip",
            )
            if st.button("🗑️ Clear results", use_container_width=True):
                clear_results()
                st.session_state[UPLOADER_VERSION] += 1
                st.rerun()
        else:
            st.caption("Process some images to enable the batch ZIP download.")

        st.divider()
        st.caption(
            "ℹ️ The first run downloads the selected model (~170 MB for u2net). "
            "Use *Re-run removal* after changing settings to reprocess."
        )

    return MODELS[model_label], alpha_matting, MAX_DIMENSIONS[max_dim_label]


def process_uploads(
    uploaded_files: list[UploadedFile],
    model: str,
    alpha_matting: bool,
    max_dim: int | None,
) -> None:
    """Convert every upload that is not already cached in session state."""
    results: dict[str, ProcessedImage] = st.session_state[RESULTS]
    errors: dict[str, str] = st.session_state[ERRORS]

    pending: list[UploadedFile] = []
    for file in uploaded_files:
        key = make_key(file)
        if key in results or key in errors:
            continue
        problem = validate_upload(file)
        if problem:
            errors[key] = problem
            continue
        pending.append(file)

    if not pending:
        return

    total = len(pending)
    progress_bar = st.progress(0.0, text="Removing backgrounds…")
    for index, file in enumerate(pending, start=1):
        with st.spinner(f"Removing background — {file.name} ({index}/{total})"):
            try:
                entry = process_upload(file, model, alpha_matting, max_dim)
                results[entry.key] = entry
                st.session_state[ZIP_CACHE] = None  # invalidate cached ZIP
            except Exception as exc:  # noqa: BLE001 — surface any failure per image
                logger.exception("Background removal failed for %s", file.name)
                errors[make_key(file)] = f"{type(exc).__name__}: {exc}"
        progress_bar.progress(index / total, text=f"Processed {index} of {total} image(s)")

    progress_bar.progress(1.0, text=f"Processed {total} of {total} image(s)")

    # Rerun once so the sidebar ZIP button and results render in a clean pass.
    st.rerun()


def render_results(uploaded_files: list[UploadedFile]) -> None:
    """Show every processed image (and any errors) in upload order."""
    results: dict[str, ProcessedImage] = st.session_state[RESULTS]
    errors: dict[str, str] = st.session_state[ERRORS]

    seen: set[str] = set()
    ordered: list[ProcessedImage] = []
    errored: list[tuple[str, str]] = []
    for file in uploaded_files:
        key = make_key(file)
        if key in seen:
            continue
        seen.add(key)
        if key in results:
            ordered.append(results[key])
        elif key in errors:
            errored.append((file.name, errors[key]))

    header_left, header_right = st.columns([3, 1])
    with header_left:
        summary = f"✅ Results — {len(ordered)} processed"
        if errored:
            summary += f", {len(errored)} failed"
        st.subheader(summary)
    with header_right:
        if st.button(
            "♻️ Re-run removal",
            help="Discard cached results and process the current uploads again "
            "with the settings currently selected in the sidebar.",
        ):
            clear_results()
            st.rerun()

    for name, message in errored:
        st.error(f"**{name}** — {message}")

    for entry in ordered:
        left, right = st.columns(2, gap="small")
        with left:
            st.image(
                entry.original_preview,
                caption=f"Original — {entry.name}",
                use_container_width=True,
            )
        with right:
            st.image(
                entry.result_preview,
                caption=f"Transparent — {entry.width} × {entry.height} px",
                use_container_width=True,
            )
            if not entry.has_foreground:
                st.warning("No distinct foreground was detected in this image.")

        download_col, _meta = st.columns([1, 3])
        with download_col:
            st.download_button(
                "⬇️ Download PNG",
                data=entry.result_bytes,
                file_name=entry.out_name,
                mime="image/png",
                key=f"dl_{entry.key}",
                use_container_width=True,
            )
        st.divider()


def main() -> None:
    init_session_state()
    model, alpha_matting, max_dim = render_sidebar()

    st.title("🖼️ Batch Background Remover")
    st.caption("Strip backgrounds from a batch of images with U2-Net — everything runs locally.")

    uploaded_files = st.file_uploader(
        "Drag & drop images here, or click to browse",
        type=UPLOADER_TYPES,
        accept_multiple_files=True,
        key=f"uploads_{st.session_state[UPLOADER_VERSION]}",
    )

    if not uploaded_files:
        st.info("Upload some images to get started. Supported formats: PNG, JPG, JPEG, WebP.")
        return

    prune_stale_results(uploaded_files)
    process_uploads(uploaded_files, model, alpha_matting, max_dim)
    render_results(uploaded_files)
    st.caption("🔒 All processing happens on this machine via rembg — no image leaves the server.")


if __name__ == "__main__":
    main()
