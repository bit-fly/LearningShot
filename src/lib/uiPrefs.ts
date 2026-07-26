// Shared helpers for toggling/applying UI language and theme, used by both
// the side panel and the options page so behavior stays consistent.

import { getSettings, saveSettings } from "./storage";
import { UILanguage, UITheme } from "./types";

export function applyTheme(theme: UITheme): void {
  document.documentElement.dataset.theme = theme;
}

export async function toggleUILanguage(): Promise<UILanguage> {
  const settings = await getSettings();
  const next: UILanguage = settings.uiLanguage === "en" ? "zh" : "en";
  await saveSettings({ ...settings, uiLanguage: next });
  return next;
}

export async function toggleTheme(): Promise<UITheme> {
  const settings = await getSettings();
  const next: UITheme = settings.theme === "dark" ? "light" : "dark";
  await saveSettings({ ...settings, theme: next });
  return next;
}

export function themeToggleIcon(theme: UITheme): string {
  return theme === "dark" ? "☀️" : "🌙";
}

export function langToggleLabel(lang: UILanguage): string {
  return lang === "en" ? "中" : "EN";
}
