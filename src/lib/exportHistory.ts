// Helpers for exporting history entries to a single Markdown (.md) file,
// either one entry at a time or the entire history at once.

import { t } from "./i18n";
import { CaptureMode, HistoryEntry, ReadingMode, UILanguage } from "./types";

function captureModeLabel(mode: CaptureMode, lang: UILanguage): string {
  if (mode === "full-page") return t("modeFullPage", lang);
  if (mode === "selection-text") return t("modeSelectionText", lang);
  return t("modeSelectionImage", lang);
}

function readingModeLabel(mode: ReadingMode, lang: UILanguage): string {
  return mode === "quiz" ? t("modeQuiz", lang) : t("modeExplain", lang);
}

function conversationToMarkdown(entry: HistoryEntry, lang: UILanguage): string {
  // conversation = [system, user(original capture), assistant, user(follow-up), assistant, ...]
  // The first assistant reply duplicates entry.resultText (already shown above),
  // so only render turns from the first follow-up question onward.
  const conv = entry.conversation;
  if (!conv || conv.length <= 3) return "";
  const followUps = conv.slice(3);
  if (followUps.length === 0) return "";
  const lines = [`## ${t("chatTitle", lang)}`, ""];
  for (const msg of followUps) {
    const text = typeof msg.content === "string" ? msg.content : extractTextParts(msg.content);
    const speaker = msg.role === "user" ? t("chatYou", lang) : t("chatAssistant", lang);
    lines.push(`**${speaker}:** ${text}`, "");
  }
  return lines.join("\n");
}

function extractTextParts(parts: { type: string; text?: string }[]): string {
  return parts
    .filter((p) => p.type === "text")
    .map((p) => p.text || "")
    .join("\n");
}

function entryToMarkdown(entry: HistoryEntry, lang: UILanguage): string {
  const date = new Date(entry.createdAt).toLocaleString();
  const title = entry.sourceTitle || t("exportDefaultTitle", lang);
  const followUpMd = conversationToMarkdown(entry, lang);
  return [
    `# ${title}`,
    "",
    `- ${t("exportFieldTime", lang)}: ${date}`,
    `- ${t("exportFieldSource", lang)}: ${entry.sourceUrl || "-"}`,
    `- ${t("exportFieldCaptureMode", lang)}: ${captureModeLabel(entry.mode, lang)}`,
    `- ${t("exportFieldReadingMode", lang)}: ${readingModeLabel(entry.readingMode, lang)}`,
    "",
    "---",
    "",
    entry.resultText,
    "",
    ...(followUpMd ? ["", followUpMd] : []),
  ].join("\n");
}

export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function timestampForFilename(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

export function exportSingleEntry(entry: HistoryEntry, lang: UILanguage): void {
  const md = entryToMarkdown(entry, lang);
  const safeTitle = (entry.sourceTitle || t("exportDefaultTitle", lang)).replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);
  downloadMarkdown(`${safeTitle}-${timestampForFilename()}.md`, md);
}

export function exportAllHistory(entries: HistoryEntry[], lang: UILanguage): void {
  const header = `# ${t("exportAllTitle", lang)}\n\n${t("exportAllCount", lang)} ${entries.length} ${t(
    "exportAllCountUnit",
    lang
  )}\n`;
  const body = entries.map((entry) => entryToMarkdown(entry, lang)).join("\n---\n\n");
  downloadMarkdown(`learningshot-history-${timestampForFilename()}.md`, `${header}\n---\n\n${body}`);
}
