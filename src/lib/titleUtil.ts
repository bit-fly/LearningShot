// Generates a short, human-friendly title for a history entry based on its
// actual content, so the history list / export files show something more
// useful than a raw (often long) page <title> or truncated input snippet.

import { HistoryEntry } from "./types";

const MAX_TITLE_LENGTH = 24;

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

// Picks the first meaningful line out of the structured markdown-ish result
// text (skipping "## heading" lines, which are generic section names like
// "核心概念" rather than content, and skipping bullet markers).
function firstContentLine(resultText: string): string {
  const lines = resultText.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^##\s+/.test(line)) continue;
    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch) return bulletMatch[1];
    return line;
  }
  return "";
}

export function generateHistoryTitle(entry: Pick<HistoryEntry, "resultText" | "sourceTitle" | "inputPreview">): string {
  const fromContent = firstContentLine(entry.resultText || "");
  if (fromContent) return truncate(fromContent, MAX_TITLE_LENGTH);

  if (entry.sourceTitle && entry.sourceTitle.trim()) {
    return truncate(entry.sourceTitle, MAX_TITLE_LENGTH);
  }

  if (entry.inputPreview && entry.inputPreview.trim()) {
    return truncate(entry.inputPreview, MAX_TITLE_LENGTH);
  }

  return "";
}

// Returns entry.title if already set (persisted at save time), otherwise
// computes one on the fly — keeps backward compatibility with entries saved
// before this feature existed, without needing a storage migration.
export function resolveHistoryTitle(entry: HistoryEntry, fallback: string): string {
  if (entry.title && entry.title.trim()) return entry.title;
  return generateHistoryTitle(entry) || fallback;
}
