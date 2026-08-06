# 简历评估专家团 - Electron 桌面版

## 快速启动

### 方式一：免安装绿色版（推荐）
1. 打开 `dist\win-unpacked\` 目录
2. 双击 `简历评估专家团.exe`
3. 应用窗口打开，开始使用

### 方式二：开发模式
```bash
cd 简历评估专家团-electron
npm start
```

### 方式三：双击启动脚本
双击 `start.bat`

## 使用方法

1. **输入简历**：在左侧文本框粘贴候选人简历全文
2. **输入 JD**（选填）：在右侧文本框粘贴岗位 JD
3. **点击「开始分析」**：三个 Agent 并行工作
   - 🔍 能力透视专家：评估能力结构、生成雷达数据
   - 🎯 岗位匹配专家：JD × 简历匹配分析（需提供 JD）
   - 🎨 可视化报告专家：生成单文件 HTML 报告
4. **查看报告**：分析完成后在下方预览区查看可视化报告
5. **导出 HTML**：点击「导出 HTML」保存到本地

## 架构

```
main.js          → Electron 主进程（窗口 + Express 服务管理）
preload.js       → 安全桥接（渲染进程 ↔ 主进程）
server/
  index.js       → Express API 服务
  agents.js      → DeepSeek API 调用 + 三 Agent 编排
  prompts.js     → 三个 Agent 的 System Prompt
renderer/
  index.html     → 前端页面
  app.js         → 前端逻辑（轮询、渲染、导出）
  styles.css     → 深色主题样式
```

## 技术栈

- Electron 31 + Express
- DeepSeek API（deepseek-chat）
- 纯 Vanilla JS 前端（无构建步骤）
- 异步任务模式（taskId + 轮询）

## 配置

DeepSeek API Key 已内置在 `.env` 和 `server/agents.js` 中。
如需更换，修改 `server/agents.js` 第 7 行或设置环境变量 `DEEPSEEK_API_KEY`。
