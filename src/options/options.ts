import { getSettings, saveSettings } from "../lib/storage";
import { testConnection } from "../lib/llmClient";
import { ensureHostAccess } from "../lib/permissions";
import { applyStaticI18n, t } from "../lib/i18n";
import { applyTheme, langToggleLabel, themeToggleIcon, toggleTheme, toggleUILanguage } from "../lib/uiPrefs";
import { UILanguage } from "../lib/types";

const baseUrlInput = document.getElementById("baseUrl") as HTMLInputElement;
const apiKeyInput = document.getElementById("apiKey") as HTMLInputElement;
const modelInput = document.getElementById("model") as HTMLInputElement;
const outputLanguageInput = document.getElementById("outputLanguage") as HTMLInputElement;
const showQuizAssistantInput = document.getElementById("showQuizAssistant") as HTMLInputElement;
const saveBtn = document.getElementById("save") as HTMLButtonElement;
const savedHint = document.getElementById("savedHint") as HTMLElement;
const testBtn = document.getElementById("testConnection") as HTMLButtonElement;
const testResultEl = document.getElementById("testResult") as HTMLElement;
const langToggleBtn = document.getElementById("langToggle") as HTMLButtonElement;
const themeToggleBtn = document.getElementById("themeToggle") as HTMLButtonElement;
const backToPanelBtn = document.getElementById("backToPanel") as HTMLButtonElement;
const versionValueEl = document.getElementById("versionValue")!;

let uiLang: UILanguage = "zh";

backToPanelBtn.addEventListener("click", () => {
  void chrome.sidePanel
    .open({ windowId: chrome.windows.WINDOW_ID_CURRENT })
    .then(() => window.close())
    .catch((err: unknown) => {
      console.error("无法返回侧边栏", err);
      window.history.back();
    });
});

async function load() {
  const settings = await getSettings();
  versionValueEl.textContent = chrome.runtime.getManifest().version;
  baseUrlInput.value = settings.baseUrl;
  apiKeyInput.value = settings.apiKey;
  modelInput.value = settings.model;
  outputLanguageInput.value = settings.outputLanguage;
  showQuizAssistantInput.checked = settings.showQuizAssistant;

  uiLang = settings.uiLanguage;
  applyStaticI18n(uiLang);
  langToggleBtn.textContent = langToggleLabel(uiLang);
  applyTheme(settings.theme);
  themeToggleBtn.textContent = themeToggleIcon(settings.theme);
}

langToggleBtn.addEventListener("click", async () => {
  uiLang = await toggleUILanguage();
  applyStaticI18n(uiLang);
  langToggleBtn.textContent = langToggleLabel(uiLang);
});

themeToggleBtn.addEventListener("click", async () => {
  const theme = await toggleTheme();
  applyTheme(theme);
  themeToggleBtn.textContent = themeToggleIcon(theme);
});

saveBtn.addEventListener("click", async () => {
  const current = await getSettings();
  await saveSettings({
    ...current,
    baseUrl: baseUrlInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim(),
    outputLanguage: outputLanguageInput.value.trim() || "中文",
    showQuizAssistant: showQuizAssistantInput.checked,
  });
  savedHint.hidden = false;
  setTimeout(() => (savedHint.hidden = true), 1500);
});

testBtn.addEventListener("click", async () => {
  const current = await getSettings();
  const candidate = {
    ...current,
    baseUrl: baseUrlInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim(),
  };

  if (!candidate.baseUrl || !candidate.apiKey || !candidate.model) {
    testResultEl.hidden = false;
    testResultEl.className = "test-result fail";
    testResultEl.textContent = t("testMissingFields", uiLang);
    return;
  }

  testBtn.disabled = true;
  testResultEl.hidden = false;
  testResultEl.className = "test-result";
  testResultEl.textContent = t("testing", uiLang);

  try {
    // Without a granted host permission for the target origin, the browser
    // treats this fetch like a normal webpage request: it's subject to CORS
    // and (since we send a JSON body + Authorization header) triggers an
    // OPTIONS preflight first. Most simple internal gateways/proxies (e.g.
    // cherry_proxy.py) don't implement OPTIONS, so the preflight gets a 405
    // and the browser reports the whole fetch as a generic "Failed to
    // fetch" — even though the real endpoint works fine. Requesting host
    // permission here (same optional_host_permissions used for page
    // capture) makes Chrome bypass CORS entirely for this extension's
    // requests to that origin, avoiding the preflight altogether.
    await ensureHostAccess();
  } catch (err) {
    testBtn.disabled = false;
    testResultEl.className = "test-result fail";
    testResultEl.textContent = `${t("testFailPrefix", uiLang)}${err instanceof Error ? err.message : String(err)}`;
    return;
  }

  const result = await testConnection(candidate);
  testBtn.disabled = false;
  if (result.ok) {
    testResultEl.className = "test-result ok";
    testResultEl.textContent = `${t("testSuccess", uiLang)} (${result.message})`;
  } else {
    testResultEl.className = "test-result fail";
    testResultEl.textContent = `${t("testFailPrefix", uiLang)}${result.message}`;
  }
});

void load();
