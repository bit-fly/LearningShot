# Copilot instructions for LearningShot

Internal-only Manifest V3 Chrome/Edge extension. Captures the current webpage
(full page or a user selection) during online training and sends it to a
company-internal OpenAI-compatible LLM gateway for a structured explanation,
or a "self-practice quiz answer" mode. Not published to any store.

## Build / typecheck

No test suite exists in this repo. Commands (run from repo root, i.e. this
directory, not a subfolder):

```powershell
npm install
npm run typecheck   # tsc --noEmit
npm run build       # esbuild bundle -> dist/, then copies static assets into dist/
npm run watch        # esbuild --watch, for iterative dev
```

`npm run build` runs `esbuild.config.mjs` (bundles the 4 entry points below
into `dist/*.js`) and then `scripts/copy-assets.mjs` (copies `manifest.json`,
`sidepanel/options` HTML+CSS, and `public/icons/` into `dist/`). **Both steps
are required** — `dist/` is what gets loaded as the unpacked extension, and it
is not checked in (see `.gitignore`); after any change you must rebuild before
reloading the extension in the browser.

To load/test manually: `chrome://extensions` (or `edge://extensions`) →
Developer mode → "Load unpacked" → select the **`dist/`** folder specifically,
not the repo root (the repo root has no compiled `.js` files and will fail to
load with a background-script error).

## Architecture

Four independent esbuild entry points (`esbuild.config.mjs`), each bundled to
its own IIFE in `dist/`, communicating only via `chrome.runtime` messages —
there is no shared bundle/runtime between them:

- `src/background/index.ts` — service worker. Only job: set
  `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` on
  install. Keep this minimal; it is not where capture/LLM logic lives.
- `src/content/index.ts` — **not** a persistent content script. It's injected
  on demand via `chrome.scripting.executeScript` from the side panel right
  before each capture action (see `ensureContentScript()` in
  `sidepanel/index.ts`). Guards against double-injection with a
  `window.__learningAssistantContentScriptLoaded__` flag. Handles three jobs
  via `RuntimeMessage`: full-page extraction (`@mozilla/readability`), reading
  the current text selection, and drawing a drag-to-select rectangle overlay
  for screenshot mode (reports the rect back, does not do the actual capture).
- `src/sidepanel/` — the main UI and the orchestrator of every capture flow.
  All business logic (permission requests, content-script messaging,
  `chrome.tabs.captureVisibleTab`, calling the LLM, rendering, history) lives
  in `sidepanel/index.ts`, not in the background worker.
- `src/options/` — settings page (gateway URL / API key / model / output
  language / UI language / theme / test-connection button).

Shared code lives in `src/lib/` and is imported by any of the four entry
points as needed: `types.ts` (shared `Settings`/message types — the
`RuntimeMessage` union is the single source of truth for messages passed
between content script ↔ side panel), `storage.ts` (chrome.storage.local
wrappers for settings/history), `llmClient.ts` (streaming SSE chat-completion
client + `testConnection`), `prompts.ts` (system/user prompt builders),
`imageCrop.ts` (canvas crop of a full screenshot down to the selected rect),
`permissions.ts` (`ensureHostAccess()`), `i18n.ts` + `uiPrefs.ts` (UI
language/theme).

### Capture flow (screenshot / region selection)

This is the most non-obvious flow — it spans 3 files:
1. User clicks "框选解读" in `sidepanel/index.ts` → sends `START_SELECTION`
   (mode `selection-image`) to the content script.
2. `content/index.ts` draws a full-viewport overlay, tracks the drag, and on
   mouseup sends `SELECTION_RECT_RESULT` (or `SELECTION_CANCELLED`) back via
   `chrome.runtime.sendMessage` — a genuinely async, arbitrary-duration gap.
3. `sidepanel/index.ts`'s `chrome.runtime.onMessage` listener picks up the
   rect and calls `handleRectResult()`, which calls
   `chrome.tabs.captureVisibleTab()` and crops it with `imageCrop.ts` using
   `devicePixelRatio` reported by the content script.

## Key conventions

- **Permissions are intentionally minimal and runtime-requested.** The
  manifest declares `optional_host_permissions: ["<all_urls>"]` (not a static
  `host_permissions`). Every capture entry point calls
  `ensureHostAccess()` (`lib/permissions.ts`) as the **first** await in its
  click handler, before any other async work, so the permission prompt still
  counts as a direct response to the user gesture.
  - `chrome.tabs.captureVisibleTab()` has a stricter internal check than
    `scripting.executeScript`/`tabs.query`: it requires either the `activeTab`
    grant or a permission pattern whose `match_all_urls()` is true. Individual
    patterns like `"http://*/*"` + `"https://*/*"` do **not** satisfy this —
    only the literal `"<all_urls>"` pattern does. Do not "simplify" this back
    to per-scheme patterns.
  - Extension-page `fetch()` calls to an origin without a granted host
    permission are subject to normal CORS (preflight `OPTIONS`, etc.); with
    the permission granted, Chrome bypasses CORS entirely for that origin.
    This is why `options.ts`'s test-connection button also calls
    `ensureHostAccess()` before calling `testConnection()`.
- **Capture buttons disable themselves synchronously**, as the very first
  statement in their click handler (`setBusy(true, ...)`), before any
  `await` — this is deliberate so the other capture button can't be clicked
  mid-flow while a permission prompt/injection is in progress.
- **No hardcoded `temperature`** in LLM requests (`llmClient.ts`). Some
  gateway-hosted models 400 on any non-default `temperature`; both
  `streamChatCompletion` and `testConnection` omit the field entirely.
- **UI i18n is separate from `Settings.outputLanguage`.** `uiLanguage`/`theme`
  in `Settings` control the extension's own chrome (via `data-i18n` /
  `data-i18n-placeholder` / `data-i18n-title` attributes in HTML, applied by
  `applyStaticI18n()`); `outputLanguage` only controls what language the LLM
  is instructed to answer in. Don't conflate the two when adding strings —
  new user-facing UI text needs a key in both the `zh` and `en` dicts in
  `lib/i18n.ts` plus a `data-i18n*` attribute, not a hardcoded string.
- **Theming uses CSS custom properties** (`--primary`, `--bg`, `--card`,
  `--border`, `--text`, `--muted`, etc.) redefined under
  `:root[data-theme="dark"]` in both `sidepanel.css` and `options.css`.
  `applyTheme()` just sets `document.documentElement.dataset.theme`. Any new
  component styling should use the existing variables rather than literal
  colors so dark mode keeps working.
- **`[hidden]` gotcha**: any CSS rule that sets an explicit `display` value on
  an element (e.g. `.saved-hint { display: inline-block; }`) silently
  overrides the browser's default `[hidden] { display: none }`. When adding a
  toggle-visibility element with its own `display` style, also add an
  explicit `.your-class[hidden] { display: none; }` rule (see the comment
  next to `.saved-hint[hidden]` / `.test-result[hidden]` in `options.css`).
- History entries (`HistoryEntry` in `types.ts`) are capped at `HISTORY_LIMIT`
  (200) in `storage.ts`, newest first. Export helpers live in
  `lib/exportHistory.ts` (single-entry vs. batch-to-one-file), both producing
  Markdown via `downloadMarkdown()` (Blob + anchor `download`, no
  `chrome.downloads` permission needed).
- `cherry_proxy.py` at the repo root is the user's **local, external** FastAPI
  proxy to the real internal LLM gateway — it is not part of the shipped
  extension and must not be modified as part of extension changes.
