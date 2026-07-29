// Lightweight i18n for the extension's own UI (side panel + options page).
// This is independent from Settings.outputLanguage, which only controls the
// language the AI is asked to answer in.

import { UILanguage } from "./types";

type Dict = Record<string, string>;

const zh: Dict = {
  sidepanelTitle: "LearningShot",
  appTitle: "LearningShot 在线培训学习助手",
  settingsTitle: "设置",
  settingsPageTitle: "LearningShot - 设置",
  readingModeLabel: "解读模式",
  modeExplain: "普通解读",
  modeQuiz: "题目解答",
  quizHint: "⚠️ 仅供自测/练习参考，请勿用于正式计分考试。",
  selectionModeLabel: "框选方式",
  selectionText: "文本选中",
  selectionImage: "区域截图",
  captureFullPage: "📄 抓取整页",
  captureSelection: "✂️ 框选解读",
  resultTitle: "解读结果",
  clearResult: "清空",
  historyTitle: "历史记录",
  exportAll: "导出全部",
  clearHistoryAll: "全部清空",
  exportOne: "导出",
  themeToggleTitle: "切换深色/浅色主题",
  langToggleTitle: "Switch to English",

  statusPreparingFullPage: "正在准备抓取…",
  statusExtractingFullPage: "正在抓取整页内容…",
  statusNoTextContent: "未能提取到正文内容",
  statusPreparingSelection: "正在准备框选…",
  statusReadingSelectedText: "正在读取所选文本…",
  statusNoTextSelected: "请先在页面上选中一段文字，再点击框选解读",
  statusDragToSelect: "请在页面上拖拽框选要解读的区域…",
  statusSelectionCancelled: "已取消框选",
  statusCapturingScreenshot: "正在截图并裁剪…",
  statusGenerating: "AI 正在生成解读…",
  statusDone: "完成",
  statusError: "出错了：",

  chatTitle: "继续讨论",
  chatPlaceholder: "针对以上解读结果继续提问…",
  chatSend: "发送",
  chatThinking: "AI 正在回复…",
  chatEmptyInput: "请先输入问题",
  chatYou: "我",
  chatAssistant: "AI",

  modeFullPage: "整页",
  modeSelectionText: "文本框选",
  modeSelectionImage: "截图框选",

  exportEmptyHistory: "暂无历史记录可导出",
  exportDefaultTitle: "解读记录",
  exportFieldTime: "时间",
  exportFieldSource: "来源",
  exportFieldCaptureMode: "抓取方式",
  exportFieldReadingMode: "模式",
  exportAllTitle: "LearningShot - 历史记录导出",
  exportAllCount: "共",
  exportAllCountUnit: "条记录",

  baseUrlLabel: "网关地址 (Base URL)",
  apiKeyLabel: "API Key",
  apiKeyPlaceholder: "仅保存在本地浏览器中",
  modelLabel: "模型名称 (model)",
  outputLanguageLabel: "输出语言",
  save: "保存",
  saved: "已保存",
  testConnection: "一键测试",
  testing: "测试中…",
  testSuccess: "✅ 连接成功",
  testFailPrefix: "❌ 连接失败：",
  testMissingFields: "请先填写网关地址 / API Key / 模型名称",
  note: "提示：以上信息仅保存在当前浏览器本地（chrome.storage），不会上传到除你配置的网关地址之外的任何第三方服务。",
};

const en: Dict = {
  sidepanelTitle: "LearningShot",
  appTitle: "LearningShot - Online Training Assistant",
  settingsTitle: "Settings",
  settingsPageTitle: "LearningShot - Settings",
  readingModeLabel: "Reading mode",
  modeExplain: "Explain",
  modeQuiz: "Quiz answers",
  quizHint: "⚠️ For self-practice reference only. Do not use for graded exams.",
  selectionModeLabel: "Selection mode",
  selectionText: "Text selection",
  selectionImage: "Screenshot area",
  captureFullPage: "📄 Capture page",
  captureSelection: "✂️ Capture selection",
  resultTitle: "Result",
  clearResult: "Clear",
  historyTitle: "History",
  exportAll: "Export all",
  clearHistoryAll: "Clear all",
  exportOne: "Export",
  themeToggleTitle: "Toggle dark/light theme",
  langToggleTitle: "切换为中文",

  statusPreparingFullPage: "Preparing to capture…",
  statusExtractingFullPage: "Extracting page content…",
  statusNoTextContent: "Could not extract any content",
  statusPreparingSelection: "Preparing selection…",
  statusReadingSelectedText: "Reading selected text…",
  statusNoTextSelected: "Please select some text on the page first, then click Capture selection",
  statusDragToSelect: "Drag to select an area on the page…",
  statusSelectionCancelled: "Selection cancelled",
  statusCapturingScreenshot: "Capturing and cropping screenshot…",
  statusGenerating: "AI is generating the explanation…",
  statusDone: "Done",
  statusError: "Error: ",

  chatTitle: "Follow-up chat",
  chatPlaceholder: "Ask a follow-up question about the explanation above…",
  chatSend: "Send",
  chatThinking: "AI is replying…",
  chatEmptyInput: "Please enter a question first",
  chatYou: "You",
  chatAssistant: "AI",

  modeFullPage: "Full page",
  modeSelectionText: "Text selection",
  modeSelectionImage: "Screenshot",

  exportEmptyHistory: "No history to export",
  exportDefaultTitle: "Reading record",
  exportFieldTime: "Time",
  exportFieldSource: "Source",
  exportFieldCaptureMode: "Capture mode",
  exportFieldReadingMode: "Mode",
  exportAllTitle: "LearningShot - History Export",
  exportAllCount: "Total",
  exportAllCountUnit: "records",

  baseUrlLabel: "Gateway Base URL",
  apiKeyLabel: "API Key",
  apiKeyPlaceholder: "Stored locally in this browser only",
  modelLabel: "Model name",
  outputLanguageLabel: "Output language",
  save: "Save",
  saved: "Saved",
  testConnection: "Test connection",
  testing: "Testing…",
  testSuccess: "✅ Connection successful",
  testFailPrefix: "❌ Connection failed: ",
  testMissingFields: "Please fill in Base URL / API Key / model name first",
  note: "Note: the above is only saved locally in this browser (chrome.storage) and is never sent anywhere except the gateway URL you configure.",
};

const dicts: Record<UILanguage, Dict> = { zh, en };

export function t(key: keyof typeof zh, lang: UILanguage): string {
  return dicts[lang]?.[key] ?? zh[key] ?? String(key);
}

/** Applies translations to every element carrying data-i18n[-placeholder|-title] attributes. */
export function applyStaticI18n(lang: UILanguage): void {
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n as keyof typeof zh;
    el.textContent = t(key, lang);
  });
  document.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder as keyof typeof zh;
    el.placeholder = t(key, lang);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle as keyof typeof zh;
    el.title = t(key, lang);
  });
}
