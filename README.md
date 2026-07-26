# LearningShot（在线培训学习助手，Edge / Chrome 插件）

浏览器插件：在进行网页在线培训时，一键抓取整页或框选局部内容，让AI助手辅助理解学习内容，自定义集成带vision的API 用于截图的内容识别。

## 功能

- **抓取整页**：用 Readability 算法提取正文（去除导航/广告等噪音），交给大模型归纳为结构化要点（核心概念 / 详细要点 / 示例）。
- **框选解读**：两种模式可切换
  - 文本选中：读取当前页面的文字选区
  - 区域截图：拖拽框选一个区域，截图后用多模态模型解读（适合图表、图片类内容）
- **普通解读 / 题目解答**：手动切换的模式开关。题目解答模式会给出参考答案 + 简要说明，并在结果开头提示"仅供自测练习参考，AI解读"。
- **历史记录**：每次解读结果本地保存（`chrome.storage.local`），侧边栏内可点击回顾。支持单条"导出"为 `.md` 文件，或"导出全部"一次性导出成一个 Markdown 文件。
- **流式输出**：解读结果打字机效果实时显示。
- **界面语言切换**：侧边栏/设置页右上角"中/EN"按钮，切换插件自身界面语言（不影响 AI 输出语言，AI 输出语言在设置页单独配置）。
- **深浅色主题切换**：侧边栏/设置页右上角🌙/☀️按钮，一键切换深色/浅色界面。
- **一键测试连接**：设置页填写网关地址/API Key/模型名后，点击"一键测试"立即发起一次最小请求验证配置是否正确，无需先保存。

## 架构与权限

- Manifest V3，`permissions`: `activeTab` `scripting` `storage` `sidePanel`；`optional_host_permissions`: `<all_urls>`（首次使用抓取/框选功能时按需申请，用户需在弹出的权限提示中点击允许；`chrome.tabs.captureVisibleTab()` 截图 API 要求必须是这个字面量通配符或 activeTab 授权，单独的 `http://*/*` + `https://*/*` 不满足其内部检查）。
- 不注册常驻 content script；`content.js` 由侧边栏在用户点击按钮时通过 `chrome.scripting.executeScript` 按需注入当前标签页。
- 结果展示在 Side Panel（Chrome 114+ / Edge 116+ 均支持）。
- LLM 调用走 OpenAI 兼容的 `/chat/completions` 接口（`stream: true`），支持文本与 `image_url` 多模态消息。
- API Key / 网关地址 / 模型名 / 输出语言均在设置页手动填写，只存本地浏览器，不写入代码仓库。

## 目录结构

```
src/
  background/   service worker（仅负责设置侧边栏行为）
  content/      按需注入的内容脚本：整页提取 / 文本选区 / 框选截图 UI
  sidepanel/    侧边栏主界面（触发抓取、展示流式结果、历史记录、语言/主题切换）
  options/      设置页（网关地址、API Key、模型、输出语言、一键测试、语言/主题切换）
  lib/          共享类型、storage 封装、LLM 客户端（含测试连接）、prompt 构建、截图裁剪、i18n、历史导出
```

## 本地开发

```powershell
npm install
npm run build      # 产出 dist/，可直接作为"已解压的扩展程序"加载
npm run watch       # 增量构建（仍需手动在浏览器里点"重新加载"刷新扩展）
npm run typecheck   # 仅类型检查
```

## 在浏览器中加载

1. `npm run build` 生成 `dist/` 目录。
2. Chrome/Edge 打开 `chrome://extensions` 或 `edge://extensions`，开启"开发者模式"。
3. 点击"加载已解压的扩展程序"，选择本项目的 `dist` 文件夹。
4. 点击工具栏插件图标打开侧边栏；先进入"设置"（齿轮图标）填写：
   - 网关地址（Base URL，例如 `https://llm-gateway.internal.company.com/v1`）
   - API Key
   - 模型名称（需支持 vision 的模型名，用于区域截图解读）
   - 输出语言（AI 回答使用的语言，与界面语言无关）
   - 填写完成后可点击"一键测试"验证网关连通性（首次会弹出一次权限确认，请点击允许）

## 已知限制 / 后续可扩展方向

- 历史记录目前无搜索/分页，条目上限 200 条，超出后自动丢弃最旧记录。
- 若网关返回的不是标准 SSE（`text/event-stream`），客户端会自动降级为一次性 JSON 解析。
- UI 语言目前仅支持中文/英文两种，深浅色主题为二选一（无跟随系统选项）。
