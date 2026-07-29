// Shared types used across background / content / sidepanel / options.

export type UILanguage = "zh" | "en";
export type UITheme = "light" | "dark";

export interface Settings {
  baseUrl: string; // e.g. https://llm-gateway.internal.company.com/v1
  apiKey: string;
  model: string;
  outputLanguage: string; // e.g. "中文", "English", ... (language of the AI's answers)
  uiLanguage: UILanguage; // language of the extension's own interface
  theme: UITheme; // light / dark UI theme
}

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: "",
  apiKey: "",
  model: "",
  outputLanguage: "中文",
  uiLanguage: "zh",
  theme: "light",
};

export type CaptureMode = "full-page" | "selection-text" | "selection-image";

export type ReadingMode = "explain" | "quiz";

// Chat message shape used both for LLM requests (llmClient.ts) and for
// persisting a full multi-turn conversation on a HistoryEntry so follow-up
// chat ("继续讨论") can resume after reopening the side panel or reloading
// a history item.
export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

export interface PageExtractResult {
  title: string;
  url: string;
  textContent: string;
  excerpt?: string;
}

export interface SelectionTextResult {
  text: string;
  url: string;
  title: string;
}

export interface SelectionImageResult {
  dataUrl: string; // cropped screenshot, PNG data URL
  url: string;
  title: string;
}

export interface HistoryEntry {
  id: string;
  createdAt: number;
  mode: CaptureMode;
  readingMode: ReadingMode;
  sourceTitle: string;
  sourceUrl: string;
  inputPreview: string; // short preview of what was sent (text or "[截图]")
  resultText: string; // final assistant markdown-ish text (first answer only, for quick preview)
  // Full conversation so far (system + user + assistant, including any
  // follow-up chat turns). Optional for backward compatibility with entries
  // saved before the follow-up chat feature existed.
  conversation?: ChatMessage[];
}

export const HISTORY_LIMIT = 200;

// Messages passed between content script <-> background <-> sidepanel
export type RuntimeMessage =
  | { type: "START_SELECTION"; mode: "selection-text" | "selection-image" }
  | { type: "CANCEL_SELECTION" }
  | { type: "SELECTION_TEXT_RESULT"; payload: SelectionTextResult }
  | { type: "SELECTION_RECT_RESULT"; payload: { rect: { x: number; y: number; width: number; height: number; devicePixelRatio: number } } }
  | { type: "SELECTION_CANCELLED" }
  | { type: "EXTRACT_FULL_PAGE" }
  | { type: "FULL_PAGE_RESULT"; payload: PageExtractResult }
  | { type: "CAPTURE_VISIBLE_TAB_REQUEST"; payload: { rect: { x: number; y: number; width: number; height: number; devicePixelRatio: number } } }
  | { type: "CAPTURE_VISIBLE_TAB_RESULT"; payload: SelectionImageResult }
  | { type: "ERROR"; payload: { message: string } };
