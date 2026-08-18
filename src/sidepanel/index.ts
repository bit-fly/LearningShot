import { addHistoryEntry, deleteHistoryEntry, getHistory, getSettings, clearHistory, updateHistoryEntry } from "../lib/storage";
import { buildSystemPrompt, buildUserPromptForText } from "../lib/prompts";
import { streamChatCompletion } from "../lib/llmClient";
import { cropScreenshot } from "../lib/imageCrop";
import { ensureHostAccess } from "../lib/permissions";
import { applyStaticI18n, t } from "../lib/i18n";
import { applyTheme, langToggleLabel, themeToggleIcon, toggleTheme, toggleUILanguage } from "../lib/uiPrefs";
import { exportAllHistory, exportSingleEntry } from "../lib/exportHistory";
import { generateHistoryTitle, resolveHistoryTitle } from "../lib/titleUtil";
import { CaptureMode, ChatMessage, HistoryEntry, ReadingMode, RuntimeMessage, UILanguage } from "../lib/types";

const readingModeSegmented = document.getElementById("readingModeSegmented")!;
const quizModeBtn = document.getElementById("quizModeButton") as HTMLButtonElement;
const selectionModeSegmented = document.getElementById("selectionModeSegmented")!;
const quizHint = document.getElementById("quizHint")!;
const captureScopeEl = document.getElementById("captureScope")!;
const captureScopeFullPageInput = document.getElementById("captureScopeFullPage") as HTMLInputElement;
const captureScopeSelectionInput = document.getElementById("captureScopeSelection") as HTMLInputElement;
const captureFullPageBtn = document.getElementById("captureFullPage") as HTMLButtonElement;
const captureSelectionBtn = document.getElementById("captureSelection") as HTMLButtonElement;
const captureFullPageLabelEl = document.getElementById("captureFullPageLabel")!;
const captureSelectionLabelEl = document.getElementById("captureSelectionLabel")!;
const resultSectionEl = document.getElementById("resultSection")!;
const resultToolbarEl = document.getElementById("resultToolbar")!;
const emptyStateEl = document.getElementById("emptyState")!;
const loadingStateEl = document.getElementById("loadingState")!;
const processingStateEl = document.getElementById("processingState")!;
const errorStateEl = document.getElementById("errorState")!;
const errorDetailEl = document.getElementById("errorDetail")!;
const retryCaptureBtn = document.getElementById("retryCapture") as HTMLButtonElement;
const statusEl = document.getElementById("status")!;
const statusDotEl = document.getElementById("statusDot")!;
const siteOriginEl = document.getElementById("siteOrigin")!;
const resultEl = document.getElementById("result")!;
const clearResultBtn = document.getElementById("clearResult")!;
const clearHistoryBtn = document.getElementById("clearHistory")!;
const exportAllHistoryBtn = document.getElementById("exportAllHistory")!;
const historyListEl = document.getElementById("historyList")!;
const historySectionEl = document.getElementById("historySection")!;
const openOptionsBtn = document.getElementById("openOptions")!;
const langToggleBtn = document.getElementById("langToggle") as HTMLButtonElement;
const themeToggleBtn = document.getElementById("themeToggle") as HTMLButtonElement;
const chatSectionEl = document.getElementById("chatSection")!;
const chatMessagesEl = document.getElementById("chatMessages")!;
const chatInputEl = document.getElementById("chatInput") as HTMLTextAreaElement;
const chatSendBtn = document.getElementById("chatSend") as HTMLButtonElement;

let readingMode: ReadingMode = "explain";
let selectionMode: "selection-text" | "selection-image" = "selection-text";
let captureScope: "full-page" | "selection" = "full-page";
let busy = false;
let chatBusy = false;
let panelState: "recognized" | "processing" | "loading" | "result" | "empty" | "error" = "empty";
let hasCurrentResult = false;
let awaitingRect: { readingMode: ReadingMode } | null = null;
let uiLang: UILanguage = "zh";
// Full running conversation (system + user + assistant + any follow-up turns)
// for whichever result is currently shown, so the chat box below can send
// follow-up questions with full context. Mirrors HistoryEntry.conversation.
let currentConversation: ChatMessage[] | null = null;
let currentHistoryId: string | null = null;

openOptionsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

async function initUIPrefs() {
  const settings = await getSettings();
  uiLang = settings.uiLanguage;
  applyStaticI18n(uiLang);
  langToggleBtn.textContent = langToggleLabel(uiLang);
  applyTheme(settings.theme);
  themeToggleBtn.textContent = themeToggleIcon(settings.theme);
  setQuizAssistantVisibility(settings.showQuizAssistant);
  updateCaptureControls();
}

function setQuizAssistantVisibility(visible: boolean) {
  quizModeBtn.hidden = !visible;
  quizModeBtn.setAttribute("aria-hidden", String(!visible));
  if (!visible && readingMode === "quiz") {
    readingMode = "explain";
    setSegmented(readingModeSegmented, readingMode);
    quizHint.hidden = true;
  }
}

langToggleBtn.addEventListener("click", async () => {
  uiLang = await toggleUILanguage();
  applyStaticI18n(uiLang);
  langToggleBtn.textContent = langToggleLabel(uiLang);
  updateCaptureControls();
  updateStatusLabel();
  await renderHistory();
});

themeToggleBtn.addEventListener("click", async () => {
  const theme = await toggleTheme();
  applyTheme(theme);
  themeToggleBtn.textContent = themeToggleIcon(theme);
});

void initUIPrefs();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.settings) return;
  void getSettings()
    .then((settings) => setQuizAssistantVisibility(settings.showQuizAssistant))
    .catch((err: unknown) => console.error("无法同步答题助手显示设置", err));
});

function setSegmented(container: HTMLElement, value: string) {
  container.querySelectorAll<HTMLButtonElement>(".segmented-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === value);
  });
}

function updateCaptureControls() {
  const isImageSelection = selectionMode === "selection-image";
  const showFullPage = !isImageSelection && captureScope === "full-page";

  captureScopeEl.hidden = isImageSelection;
  captureFullPageBtn.hidden = !showFullPage;
  captureSelectionBtn.hidden = showFullPage;
  captureScopeFullPageInput.checked = captureScope === "full-page";
  captureScopeSelectionInput.checked = captureScope === "selection";
  captureFullPageLabelEl.textContent = t("captureText", uiLang);
  captureSelectionLabelEl.textContent = isImageSelection
    ? t("captureImage", uiLang)
    : t("captureText", uiLang);
}

function setPanelState(
  state: "recognized" | "processing" | "loading" | "result" | "empty" | "error",
  detail = ""
) {
  panelState = state;
  document.body.dataset.panelState = state;

  resultSectionEl.hidden = state === "recognized";
  resultToolbarEl.hidden = state !== "result";
  resultEl.hidden = state !== "result";
  emptyStateEl.hidden = state !== "empty";
  loadingStateEl.hidden = state !== "loading";
  processingStateEl.hidden = state !== "processing";
  errorStateEl.hidden = state !== "error";

  if (state !== "result") {
    chatSectionEl.hidden = true;
  }
  if (detail) {
    errorDetailEl.textContent = detail;
  }

  statusDotEl.className = `status-dot status-${state}`;
  updateStatusLabel();
}

function updateStatusLabel() {
  if (busy) return;
  const statusKey =
    panelState === "recognized"
      ? "statusRecognized"
      : panelState === "processing"
        ? "statusProcessing"
        : panelState === "loading"
          ? "statusProcessing"
          : panelState === "result"
            ? "statusDone"
            : panelState === "error"
              ? "statusErrorState"
              : "statusReady";
  statusEl.textContent = t(statusKey, uiLang);
}

async function showIdleState() {
  const history = await getHistory();
  setPanelState(history.length > 0 ? "recognized" : "empty");
  await renderHistory();
}

readingModeSegmented.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".segmented-btn");
  if (!btn) return;
  readingMode = btn.dataset.value as ReadingMode;
  setSegmented(readingModeSegmented, readingMode);
  quizHint.hidden = readingMode !== "quiz";
});

selectionModeSegmented.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".segmented-btn");
  if (!btn) return;
  selectionMode = btn.dataset.value as "selection-text" | "selection-image";
  setSegmented(selectionModeSegmented, selectionMode);
  updateCaptureControls();
});

captureScopeEl.addEventListener("change", (e) => {
  const input = (e.target as HTMLInputElement).closest<HTMLInputElement>("input[name='captureScope']");
  if (!input) return;
  captureScope = input.value as "full-page" | "selection";
  updateCaptureControls();
});

clearResultBtn.addEventListener("click", () => {
  resultEl.innerHTML = "";
  resetChat();
  hasCurrentResult = false;
  void showIdleState();
});

function resetChat() {
  currentConversation = null;
  currentHistoryId = null;
  chatMessagesEl.innerHTML = "";
  chatInputEl.value = "";
  chatSectionEl.hidden = true;
}

function showChat() {
  chatSectionEl.hidden = false;
}

clearHistoryBtn.addEventListener("click", async () => {
  await clearHistory();
  await renderHistory();
});

exportAllHistoryBtn.addEventListener("click", async () => {
  const history = await getHistory();
  if (history.length === 0) {
    statusEl.textContent = t("exportEmptyHistory", uiLang);
    return;
  }
  exportAllHistory(history, uiLang);
});

retryCaptureBtn.addEventListener("click", () => {
  if (selectionMode === "selection-image" || captureScope === "selection") {
    void captureSelection();
  } else {
    void captureFullPage();
  }
});

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) throw new Error("找不到当前活动标签页");
  return tab;
}

async function renderActiveSite() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  try {
    siteOriginEl.textContent = new URL(tab.url).hostname;
  } catch {
    siteOriginEl.textContent = "";
  }
}

async function ensureContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

function setBusy(value: boolean, message = "") {
  busy = value;
  captureFullPageBtn.disabled = value;
  captureSelectionBtn.disabled = value;
  if (message) statusEl.textContent = message;
}

// ---------- Full page capture ----------

async function captureFullPage() {
  if (busy) return;
  // Disable both buttons immediately, before any awaits, so the user can't
  // click the other capture button while permission prompts / injection are
  // still in flight (which was confusing during the "区域截图" flow).
  setPanelState("processing");
  setBusy(true, t("statusPreparingFullPage", uiLang));
  resetChat();
  try {
    const tab = await getActiveTab();
    await ensureHostAccess();
    setBusy(true, t("statusExtractingFullPage", uiLang));
    await ensureContentScript(tab.id!);
    const page = await chrome.tabs.sendMessage(tab.id!, { type: "EXTRACT_FULL_PAGE" } as RuntimeMessage);
    if (!page?.textContent) {
      setBusy(false, t("statusNoTextContent", uiLang));
      await showIdleState();
      return;
    }
    await runInterpretation({
      mode: "full-page",
      readingMode,
      sourceTitle: page.title,
      sourceUrl: page.url,
      userMessageContent: buildUserPromptForText(page.title, page.url, page.textContent),
      inputPreview: page.textContent.slice(0, 80),
    });
  } catch (err) {
    setBusy(false, errorMessage(err));
    setPanelState("error", t("errorDescription", uiLang));
  }
}

captureFullPageBtn.addEventListener("click", () => void captureFullPage());

// ---------- Selection capture ----------

async function captureSelection() {
  if (busy) return;
  // Disable both buttons immediately (see comment in captureFullPageBtn above).
  setPanelState("processing");
  setBusy(true, t("statusPreparingSelection", uiLang));
  resetChat();
  try {
    const tab = await getActiveTab();
    await ensureHostAccess();
    await ensureContentScript(tab.id!);

    if (selectionMode === "selection-text") {
      setBusy(true, t("statusReadingSelectedText", uiLang));
      const sel = await chrome.tabs.sendMessage(tab.id!, {
        type: "START_SELECTION",
        mode: "selection-text",
      } as RuntimeMessage);
      if (!sel?.text) {
        setBusy(false, t("statusNoTextSelected", uiLang));
        await showIdleState();
        return;
      }
      await runInterpretation({
        mode: "selection-text",
        readingMode,
        sourceTitle: sel.title,
        sourceUrl: sel.url,
        userMessageContent: buildUserPromptForText(sel.title, sel.url, sel.text),
        inputPreview: sel.text.slice(0, 80),
      });
    } else {
      setBusy(true, t("statusDragToSelect", uiLang));
      awaitingRect = { readingMode };
      await chrome.tabs.sendMessage(tab.id!, { type: "START_SELECTION", mode: "selection-image" } as RuntimeMessage);
      // Resolution continues in the runtime.onMessage listener below.
    }
  } catch (err) {
    setBusy(false, errorMessage(err));
    setPanelState("error", t("errorDescription", uiLang));
  }
}

captureSelectionBtn.addEventListener("click", () => void captureSelection());

chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (message.type === "SELECTION_CANCELLED") {
    if (awaitingRect) {
      awaitingRect = null;
      setBusy(false, t("statusSelectionCancelled", uiLang));
      void showIdleState();
    }
    return;
  }
  if (message.type === "SELECTION_RECT_RESULT" && awaitingRect) {
    const pendingReadingMode = awaitingRect.readingMode;
    awaitingRect = null;
    void handleRectResult(message.payload.rect, pendingReadingMode);
  }
});

async function handleRectResult(
  rect: { x: number; y: number; width: number; height: number; devicePixelRatio: number },
  pendingReadingMode: ReadingMode
) {
  try {
    setPanelState("processing");
    setBusy(true, t("statusCapturingScreenshot", uiLang));
    const tab = await getActiveTab();
    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const croppedDataUrl = await cropScreenshot(screenshotDataUrl, rect);

    await runInterpretation({
      mode: "selection-image",
      readingMode: pendingReadingMode,
      sourceTitle: tab.title || "",
      sourceUrl: tab.url || "",
      userMessageContent: [
        { type: "text", text: `页面标题：${tab.title || ""}\n页面地址：${tab.url || ""}\n\n请解读下面这张截图中的内容：` },
        { type: "image_url", image_url: { url: croppedDataUrl } },
      ],
      inputPreview: "[框选截图]",
    });
  } catch (err) {
    setBusy(false, errorMessage(err));
    setPanelState("error", t("errorDescription", uiLang));
  }
}

// ---------- Shared LLM call + rendering ----------

interface InterpretationRequest {
  mode: CaptureMode;
  readingMode: ReadingMode;
  sourceTitle: string;
  sourceUrl: string;
  userMessageContent: string | { type: "text"; text: string }[] | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];
  inputPreview: string;
}

async function runInterpretation(req: InterpretationRequest) {
  const settings = await getSettings();
  const systemPrompt = buildSystemPrompt(req.readingMode, settings.outputLanguage);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: req.userMessageContent as any },
  ];

  resultEl.innerHTML = "";
  hasCurrentResult = false;
  setPanelState("loading");
  setBusy(true, t("statusGenerating", uiLang));

  let fullText = "";
  await streamChatCompletion(
    settings,
    messages,
    {
      onToken: (delta) => {
        if (panelState !== "result") setPanelState("result");
        fullText += delta;
        resultEl.innerHTML = renderMarkdownLite(fullText);
      },
      onDone: async (finalText) => {
        setBusy(false, t("statusDone", uiLang));
        hasCurrentResult = true;
        setPanelState("result");
        const conversation: ChatMessage[] = [...messages, { role: "assistant", content: finalText }];
        const entry: HistoryEntry = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          mode: req.mode,
          readingMode: req.readingMode,
          sourceTitle: req.sourceTitle,
          sourceUrl: req.sourceUrl,
          inputPreview: req.inputPreview,
          resultText: finalText,
          conversation,
        };
        entry.title = generateHistoryTitle(entry);
        await addHistoryEntry(entry);
        await renderHistory();
        // Enable the follow-up chat box for this freshly generated result.
        currentConversation = conversation;
        currentHistoryId = entry.id;
        chatMessagesEl.innerHTML = "";
        showChat();
      },
      onError: (err) => {
        setBusy(false, `${t("statusError", uiLang)}${err.message}`);
        setPanelState("error", t("errorDescription", uiLang));
      },
    }
  );
}

// Very small markdown-ish renderer: only handles "## heading" and "- bullet" lines,
// which is all the structured prompt asks the model to produce.
function renderMarkdownLite(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lines = text.split("\n");
  let html = "";
  let inList = false;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (/^##\s+/.test(line)) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += `<h2>${escape(line.replace(/^##\s+/, ""))}</h2>`;
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${escape(line.replace(/^[-*]\s+/, ""))}</li>`;
    } else if (line.trim() === "") {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
    } else {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += `<p>${escape(line)}</p>`;
    }
  }
  if (inList) html += "</ul>";
  return html;
}

// ---------- Follow-up chat ----------

function appendChatBubble(role: "user" | "assistant", text: string): HTMLElement {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble chat-${role}`;
  const roleLabel = document.createElement("span");
  roleLabel.className = "chat-role";
  roleLabel.textContent = role === "user" ? t("chatYou", uiLang) : t("chatAssistant", uiLang);
  const body = document.createElement("span");
  body.className = "chat-body";
  body.textContent = text;
  bubble.appendChild(roleLabel);
  bubble.appendChild(body);
  chatMessagesEl.appendChild(bubble);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  return bubble;
}

function setChatBusy(value: boolean) {
  chatBusy = value;
  chatSendBtn.disabled = value;
  chatInputEl.disabled = value;
}

async function sendChatFollowUp() {
  if (chatBusy || !currentConversation) return;
  const question = chatInputEl.value.trim();
  if (!question) {
    statusEl.textContent = t("chatEmptyInput", uiLang);
    return;
  }

  const settings = await getSettings();
  currentConversation.push({ role: "user", content: question });
  chatInputEl.value = "";
  appendChatBubble("user", question);
  const assistantBubble = appendChatBubble("assistant", "");
  const assistantBody = assistantBubble.querySelector(".chat-body") as HTMLElement;
  setChatBusy(true);
  statusEl.textContent = t("chatThinking", uiLang);

  let fullText = "";
  await streamChatCompletion(
    settings,
    currentConversation,
    {
      onToken: (delta) => {
        fullText += delta;
        assistantBody.textContent = fullText;
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
      },
      onDone: async (finalText) => {
        currentConversation!.push({ role: "assistant", content: finalText });
        setChatBusy(false);
        statusEl.textContent = t("statusDone", uiLang);
        if (currentHistoryId) {
          await updateHistoryEntry(currentHistoryId, { conversation: currentConversation! });
        }
      },
      onError: (err) => {
        // Roll back the just-added user turn so retrying doesn't duplicate it.
        currentConversation!.pop();
        setChatBusy(false);
        assistantBody.textContent = `${t("statusError", uiLang)}${err.message}`;
      },
    }
  );
}

chatSendBtn.addEventListener("click", () => void sendChatFollowUp());
chatInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void sendChatFollowUp();
  }
});

function renderConversationThread(conversation: ChatMessage[]) {
  chatMessagesEl.innerHTML = "";
  // Skip index 0 (system prompt) and index 1 (original user capture, already
  // shown as the main result / triggering input) — only show turns from the
  // first assistant reply onward as the visible chat thread.
  for (let i = 1; i < conversation.length; i++) {
    const msg = conversation[i];
    if (i === 1 && msg.role === "user") continue;
    const text = typeof msg.content === "string" ? msg.content : extractTextParts(msg.content);
    appendChatBubble(msg.role === "user" ? "user" : "assistant", text);
  }
}

function extractTextParts(parts: { type: string; text?: string }[]): string {
  return parts
    .filter((p) => p.type === "text")
    .map((p) => p.text || "")
    .join("\n");
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------- History rendering ----------

async function renderHistory() {
  const history = await getHistory();
  historyListEl.innerHTML = "";
  for (const entry of history) {
    const li = document.createElement("li");
    li.className = "history-item";
    const date = new Date(entry.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const displayTitle = resolveHistoryTitle(entry, entry.sourceTitle || entry.inputPreview);
    li.innerHTML = `
      <div class="item-toolbar">
        <button class="export-one-btn" type="button" data-id="${entry.id}">${t("exportOne", uiLang)}</button>
        <button class="delete-one-btn" type="button" data-id="${entry.id}">${t("deleteOne", uiLang)}</button>
      </div>
      <div class="meta">${date} · ${modeLabel(entry.mode)} · ${
      entry.readingMode === "quiz" ? t("modeQuiz", uiLang) : t("modeExplain", uiLang)
    }</div>
      <div class="preview title">${escapeHtml(displayTitle)}</div>
    `;
    li.querySelector(".export-one-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      exportSingleEntry(entry, uiLang);
    });
    li.querySelector(".delete-one-btn")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(t("deleteConfirm", uiLang))) return;
      await deleteHistoryEntry(entry.id);
      if (currentHistoryId === entry.id) {
        resultEl.innerHTML = "";
        resetChat();
        hasCurrentResult = false;
      }
      await renderHistory();
      if (!hasCurrentResult) {
        setPanelState((await getHistory()).length > 0 ? "recognized" : "empty");
      }
    });
    li.addEventListener("click", () => {
      resultEl.innerHTML = renderMarkdownLite(entry.resultText);
      hasCurrentResult = true;
      setPanelState("result");
      // Restore this entry's conversation (if any) so the user can continue
      // discussing a past result. Entries saved before this feature existed
      // won't have `conversation` — just hide the chat box for those.
      if (entry.conversation && entry.conversation.length > 0) {
        currentConversation = entry.conversation;
        currentHistoryId = entry.id;
        renderConversationThread(entry.conversation);
        showChat();
      } else {
        resetChat();
      }
    });
    historyListEl.appendChild(li);
  }

  historySectionEl.hidden = history.length === 0 || (panelState !== "recognized" && panelState !== "result");
  if (!hasCurrentResult && !busy && (panelState === "recognized" || panelState === "empty")) {
    setPanelState(history.length > 0 ? "recognized" : "empty");
    historySectionEl.hidden = history.length === 0;
  }
}

function modeLabel(mode: CaptureMode): string {
  if (mode === "full-page") return t("modeFullPage", uiLang);
  if (mode === "selection-text") return t("modeSelectionText", uiLang);
  return t("modeSelectionImage", uiLang);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

updateCaptureControls();
setPanelState("empty");
void renderActiveSite();
void renderHistory();
