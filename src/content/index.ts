// Content script — injected on demand via chrome.scripting.executeScript (activeTab).
// Responsibilities:
//   1. Extract full-page readable text (Readability-style) on request.
//   2. Track the current text selection so it can be read on demand.
//   3. Draw a drag-to-select rectangle overlay for the "screenshot" capture mode
//      and report the chosen rect back so the background can crop a captured
//      screenshot of the visible tab.

import { Readability } from "@mozilla/readability";
import { RuntimeMessage } from "../lib/types";

// Avoid double-injection if the user triggers capture twice quickly.
const GLOBAL_FLAG = "__learningAssistantContentScriptLoaded__";
if (!(window as any)[GLOBAL_FLAG]) {
  (window as any)[GLOBAL_FLAG] = true;
  init();
}

function init() {
  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (message.type === "EXTRACT_FULL_PAGE") {
      const result = extractFullPage();
      sendResponse(result);
      return true;
    }
    if (message.type === "START_SELECTION") {
      if (message.mode === "selection-text") {
        const text = window.getSelection()?.toString().trim() ?? "";
        sendResponse({
          text,
          url: location.href,
          title: document.title,
        });
        return true;
      }
      if (message.mode === "selection-image") {
        startRectSelection();
        sendResponse({ started: true });
        return true;
      }
    }
    if (message.type === "CANCEL_SELECTION") {
      teardownRectSelection();
      sendResponse({ cancelled: true });
      return true;
    }
    return false;
  });
}

function extractFullPage() {
  const cloned = document.cloneNode(true) as Document;
  const article = new Readability(cloned).parse();
  return {
    title: article?.title || document.title,
    url: location.href,
    textContent: (article?.textContent || document.body.innerText || "").trim(),
    excerpt: article?.excerpt || undefined,
  };
}

// ---------- Drag-to-select rectangle overlay for screenshot mode ----------

let overlayEl: HTMLDivElement | null = null;
let boxEl: HTMLDivElement | null = null;
let startX = 0;
let startY = 0;
let dragging = false;

function startRectSelection() {
  teardownRectSelection();

  overlayEl = document.createElement("div");
  overlayEl.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483647; cursor: crosshair;
    background: rgba(0,0,0,0.15);
  `;
  boxEl = document.createElement("div");
  boxEl.style.cssText = `
    position: fixed; border: 2px solid #4f7cff; background: rgba(79,124,255,0.15);
    z-index: 2147483647; display: none; pointer-events: none;
  `;
  document.documentElement.appendChild(overlayEl);
  document.documentElement.appendChild(boxEl);

  const hint = document.createElement("div");
  hint.textContent = "拖拽鼠标框选要解读的区域，按 Esc 取消";
  hint.style.cssText = `
    position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
    background: #222; color: #fff; padding: 6px 14px; border-radius: 6px;
    font-size: 13px; z-index: 2147483647; pointer-events: none;
  `;
  hint.setAttribute("data-la-hint", "1");
  document.documentElement.appendChild(hint);

  overlayEl.addEventListener("mousedown", onMouseDown);
  document.addEventListener("keydown", onKeyDown);
}

function onMouseDown(e: MouseEvent) {
  dragging = true;
  startX = e.clientX;
  startY = e.clientY;
  if (boxEl) {
    boxEl.style.display = "block";
    updateBox(startX, startY);
  }
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

function onMouseMove(e: MouseEvent) {
  if (!dragging) return;
  updateBox(e.clientX, e.clientY);
}

function updateBox(curX: number, curY: number) {
  if (!boxEl) return;
  const x = Math.min(startX, curX);
  const y = Math.min(startY, curY);
  const w = Math.abs(curX - startX);
  const h = Math.abs(curY - startY);
  boxEl.style.left = `${x}px`;
  boxEl.style.top = `${y}px`;
  boxEl.style.width = `${w}px`;
  boxEl.style.height = `${h}px`;
}

function onMouseUp(e: MouseEvent) {
  dragging = false;
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);

  const x = Math.min(startX, e.clientX);
  const y = Math.min(startY, e.clientY);
  const width = Math.abs(e.clientX - startX);
  const height = Math.abs(e.clientY - startY);

  teardownRectSelection();

  if (width < 5 || height < 5) {
    chrome.runtime.sendMessage({ type: "SELECTION_CANCELLED" });
    return;
  }

  chrome.runtime.sendMessage({
    type: "SELECTION_RECT_RESULT",
    payload: { rect: { x, y, width, height, devicePixelRatio: window.devicePixelRatio || 1 } },
  });
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    teardownRectSelection();
    chrome.runtime.sendMessage({ type: "SELECTION_CANCELLED" });
  }
}

function teardownRectSelection() {
  dragging = false;
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
  document.removeEventListener("keydown", onKeyDown);
  overlayEl?.removeEventListener("mousedown", onMouseDown);
  overlayEl?.remove();
  boxEl?.remove();
  document.querySelectorAll("[data-la-hint]").forEach((el) => el.remove());
  overlayEl = null;
  boxEl = null;
}
