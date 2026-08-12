# 简历评估专家团 - Electron 桌面版

粘贴简历 + JD，三个 AI Agent（能力透视 / 岗位匹配 / 可视化报告）并行评估，生成可视化 HTML 报告，可导出。

## 安装与启动

### 方式一：安装版（推荐）
1. 从 [GitHub Releases](https://github.com/gjj-star/resume-map-agents/releases) 下载最新的 `resume-expert-team-<版本>-setup.exe`
2. 运行安装包完成安装（安装目录可自定义，桌面会生成「简历评估专家团」快捷方式）
3. 双击快捷方式启动

### 方式二：开发模式
```bash
cd 项目目录
npm install
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
main.js          → Electron 主进程（窗口 + Express 服务 + 自动更新）
preload.js       → 安全桥接（渲染进程 ↔ 主进程）
server/
  index.js       → Express API 服务
  agents.js      → DeepSeek API 调用 + 三 Agent 编排（taskId + 轮询）
  prompts.js     → 三个 Agent 的 System Prompt
renderer/
  index.html     → 前端页面
  app.js         → 前端逻辑（轮询、渲染、导出）
  styles.css     → 深色主题样式
assets/
  expert-architecture.architecture.json → 系统架构图源文件（archify 规范）
```

> 专家介绍页内置一张交互式系统架构图（由 [Archify](https://github.com/tt-a1i/archify) 从 `assets/expert-architecture.architecture.json` 渲染），支持缩放 / 搜索 / 聚焦 / 链路追踪 / 明暗主题切换。

## 自动更新

- 打包版启动后约 5 秒检查 [GitHub Releases](https://github.com/gjj-star/resume-map-agents/releases) 最新版本
- 发现新版本后自动后台下载，标题栏出现下载进度；下载完成后点「立即重启更新」完成安装
- 更新走自建通道（api.github.com 查询 + objects.githubusercontent.com 下载），避免 github.com 主域超时
- **手动更新**：从 Releases 下载最新 `setup.exe` 直接运行覆盖安装即可
- **故障排查**：如果从未出现过更新提示，常见原因之一是本机网络代理拦截了 GitHub 的 TLS 证书校验（更新检查失败会静默处理，详见 AGENTS.md「环境坑」）

## 技术栈

- Electron 31 + Express
- DeepSeek API（deepseek-chat）
- 纯 Vanilla JS 前端（无构建步骤）
- 异步任务模式（taskId + 轮询）

## 配置

DeepSeek API Key 从环境变量 `DEEPSEEK_API_KEY` 读取，或放在项目根目录 `.env` 文件（已 gitignore，勿提交）。
