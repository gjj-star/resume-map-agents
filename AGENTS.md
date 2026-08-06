# AGENTS.md — 项目维护规则

> 本文件是给 **AI 代理（Claude Code / Codex / WorkBuddy / Cursor 等）** 看的维护手册。
> 任何人（或任何 AI）接手本项目前，必须先读完本文件再动手。
> 人类读者请移步 README.md。

## 项目是什么

Electron 桌面应用「简历评估专家团」：粘贴简历 + JD，三个 AI Agent（能力透视 / 岗位匹配 / 可视化报告）并行评估，生成可视化 HTML 报告，可导出。
后端调 DeepSeek API，本地 Express 服务，纯 vanilla JS 前端（无构建步骤）。

相关仓库：https://github.com/gjj-star/resume-map-agents（GitHub Releases 同时作为自动更新源）

## 目录结构与职责

```
main.js           Electron 主进程：窗口 + Express 服务 + 自动更新(autoUpdater)
preload.js        contextBridge 安全桥接（getServerPort / onUpdateStatus / installUpdate）
server/
  index.js        Express API（/api/evaluation/analyze、/status/:taskId、/health）
  agents.js       DeepSeek 调用 + 三 Agent 编排（异步任务 taskId + 轮询模式）
  prompts.js      三个 Agent 的 system prompt（基于简历评估专家团 SKILL.md 契约）
renderer/
  index.html      UI 结构
  app.js          前端逻辑（SpotlightCard/FadeContent 动效、轮询、导出）
  styles.css      深色主题样式
scripts/
  release.js      发版一条龙脚本（唯一正规发版入口）
assets/icon.png   应用图标
.env              API key（已 gitignore，勿提交）
```

## 铁律（违反 = 打回重做）

1. **版本号唯一事实源 = `package.json` 的 `version` 字段**。改版本一律走 `node scripts/release.js patch|minor|major`，禁止手工改版本号或手工维护 latest.yml。
2. **GitHub Release asset 文件名必须纯 ASCII**（无中文、无空格）。GitHub 会把中文/空格改写成别的名字，导致 latest.yml 与实际文件不匹配、自动更新 404。
3. **API key 不进 git**。key 放 `.env`（已 ignore）+ `server/agents.js` 的 fallback。任何 commit 不得包含 `sk-` 开头的字符串（GitHub Push Protection 也会拦）。
4. **UI 禁 emoji**，一律用内联 SVG 线条图标（stroke-width 1.5）。风格基调见下。

## 版本规则（语义化版本 semver）

| 类型 | 命令 | 场景 |
|------|------|------|
| patch | `node scripts/release.js patch` | bug 修复（1.0.0 → 1.0.1） |
| minor | `node scripts/release.js minor` | 新增功能，向后兼容（1.0.0 → 1.1.0） |
| major | `node scripts/release.js major` | 破坏性变更（1.0.0 → 2.0.0） |

release.js 会自动完成：bump 版本 → 打包 NSIS → 生成 ASCII 安装包 → 重算 sha512 写 latest.yml → 创建 GitHub Release + tag（vX.Y.Z）→ 上传 asset → 推送 git。

## UI 风格规范（必须保持一致）

- 背景：`#0a0e1a → #0d1220` 径向渐变（顶部 indigo 微光、右下 cyan 微光）
- 主色：渐变 `#6366f1 → #8b5cf6`；点缀 `#22d3ee`；达标 `#34d399`；警告 `#fbbf24`；风险 `#fb7185`
- 卡片：`rgba(255,255,255,.03)` + 边框 `rgba(255,255,255,.08)`，圆角 14px
- 字体：等宽字体（JetBrains Mono / Cascadia Code / Consolas）做标题/标签/状态 accent，正文 system-ui
- 动效：SpotlightCard（鼠标跟随光斑）+ FadeContent（滚动淡入）
- 图标：内联 SVG，stroke-width 1.5，禁 emoji、禁彩色贴图

## 环境坑（本机已知）

1. **`ELECTRON_RUN_AS_NODE=1` 在 WorkBuddy bash 环境全局存在**：跑 electron.exe 前必须先 `unset ELECTRON_RUN_AS_NODE`，否则 `require('electron')` 返回路径字符串导致 `app` undefined。
2. **safe-delete 钩子**会拦截批量删除/移动（尤其 dist 目录）：打包输出用 `--config.directories.output=build_out`（新目录），不要尝试删旧 dist。
3. **本机 api.github.com TLS 被中间代理拦截**：Node https 请求必须 `rejectUnauthorized: false`，否则 `UNABLE_TO_VERIFY_LEAF_SIGNATURE`。
4. **GitHub 网络时通时断**：API 调用需重试；GitHub PAT 可从 `printf 'protocol=https\nhost=github.com\n\n' | git credential fill` 提取（release.js 已内置）。
5. **winCodeSign 缓存**：已在 `C:/Users/EDY/AppData/Local/electron-builder/Cache/winCodeSign/winCodeSign-2.6.0/` 手动解压好（去掉 darwin），勿删，删了要重新处理符号链接问题。
6. **npm install 在本机可能失败**（safe-delete 拦 node_modules 删除）：需要装包时用 `npm install <pkg> --registry=https://registry.npmmirror.com`，失败就手动下载 tgz 解压到 `node_modules/<pkg>/` 并把依赖放进 `node_modules/<pkg>/node_modules/`。

## 发版 SOP（已自动化，理解流程用）

1. `git status` 确认工作区干净
2. `node scripts/release.js patch|minor|major`
3. 脚本自动：bump version → commit → 打包 → latest.yml → GitHub Release vX.Y.Z → push
4. 人工验证：GitHub Releases 页面两个 asset（latest.yml + setup.exe）都在

## 测试

- 后端单测：`cd server && node -e "require('./agents.js')"`（验证模块可加载）
- API 冒烟：启动应用后 `curl http://127.0.0.1:3456/api/health` 应返回 `{"ok":true}`
- 三 Agent 全链路：POST /api/evaluation/analyze 拿 taskId → 轮询 /status/:taskId 到 done 且 reportHtml 非空
