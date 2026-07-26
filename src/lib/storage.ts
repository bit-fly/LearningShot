// Thin wrappers around chrome.storage.local for settings and history.

import { DEFAULT_SETTINGS, HISTORY_LIMIT, HistoryEntry, Settings } from "./types";

const SETTINGS_KEY = "settings";
const HISTORY_KEY = "history";

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const stored = await chrome.storage.local.get(HISTORY_KEY);
  return (stored[HISTORY_KEY] as HistoryEntry[] | undefined) ?? [];
}

export async function addHistoryEntry(entry: HistoryEntry): Promise<void> {
  const history = await getHistory();
  history.unshift(entry);
  if (history.length > HISTORY_LIMIT) {
    history.length = HISTORY_LIMIT;
  }
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const history = await getHistory();
  await chrome.storage.local.set({ [HISTORY_KEY]: history.filter((h) => h.id !== id) });
}
