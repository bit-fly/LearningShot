import { ReadingMode } from "./types";

const STRUCTURE_INSTRUCTIONS = `请将内容整理为结构化要点，使用如下 Markdown 小标题（如内容不适用某个小标题可省略）：
## 核心概念
## 详细要点
## 示例/应用
每个小标题下用简洁的项目符号列表呈现，避免大段连续文字。`;

const QUIZ_INSTRUCTIONS = `这是一道用于自测/练习的题目（不计入正式成绩）。请：
1. 给出参考答案（明确指出正确选项或答案）；
2. 用简要说明解释为什么该答案正确、其他选项为什么不对（如适用）；
3. 在开头提醒一句："以下内容仅供自测练习参考，请勿用于正式计分考试"。
使用如下 Markdown 小标题：
## 参考答案
## 简要说明`;

export function buildSystemPrompt(readingMode: ReadingMode, outputLanguage: string): string {
  const languageInstruction = `请始终使用${outputLanguage}输出，无论原文是什么语言。`;
  const roleInstruction =
    "你是 LearningShot，一个在线培训学习助手，负责把网页培训内容用更容易理解的方式重新归纳解读，帮助学习者快速掌握重点。";

  if (readingMode === "quiz") {
    return `${roleInstruction}\n${languageInstruction}\n${QUIZ_INSTRUCTIONS}`;
  }
  return `${roleInstruction}\n${languageInstruction}\n${STRUCTURE_INSTRUCTIONS}`;
}

export function buildUserPromptForText(sourceTitle: string, sourceUrl: string, text: string): string {
  return `页面标题：${sourceTitle}\n页面地址：${sourceUrl}\n\n内容：\n${text}`;
}
