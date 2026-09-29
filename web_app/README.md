# Background Remover — Browser App (React)

The browser version of the Background Remover suite. AI-powered background
removal that runs **entirely in your browser** — free, open-source, and
privacy-focused. Images never leave your device.

Part of this repo's tool suite:

| Tool | File | Runtime |
| --- | --- | --- |
| Streamlit batch web app | `../app.py` | Python |
| Desktop GUI | `../desktop_app.py` | Python |
| **Browser app (this folder)** | `web_app/` | Node (build) + any modern browser |

No Python, server, or signup required at runtime — after `npm run dev` you just
open the page and drop in an image.

## Features

- **100% client-side processing** — images never leave your device
- **AI-powered** — ONNX Runtime (WASM, WebGPU on capable devices) for accurate cutouts
- **Advanced editing** — erase/restore brushes, undo/redo, cropping, edge smoothing
- **Background replacement** — solid colors, custom images, drop shadows
- **Clipboard paste** — Ctrl+V an image straight into the app
- **Multiple export formats** — PNG, JPEG, WebP with quality control
- **Keyboard shortcuts** — press `?` in the app to see them

## Development

Requires Node.js 18+.

```bash
cd web_app
npm install
npm run dev        # dev server, usually http://localhost:5173
npm run build      # typecheck + production build to dist/
npm run lint       # ESLint
```

## Testing

```bash
npm run test:run   # unit tests (Vitest + Testing Library)

npm run test:e2e   # Playwright E2E (starts the dev server automatically)
npx playwright install chromium   # first time only, before E2E
```

## How it works

- The AI model and WASM files are fetched once on first use and cached by the
  browser; preloading starts as soon as the app mounts.
- Mobile and low-memory devices automatically fall back from WebGPU to CPU
  (WASM) inference for stability.
- The app is a single-page Vite build (`dist/`) — serve it from any static host.

## Tech stack

React 19, TypeScript, Vite, Tailwind CSS, Zustand,
[@imgly/background-removal](https://www.npmjs.com/package/@imgly/background-removal).

## License

Apache-2.0
