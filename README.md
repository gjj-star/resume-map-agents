<div align="center">

[English](README.en.md) | 简体中文

<img src="assets/icon.png" width="84" alt="简历评估专家团 Logo" />

# 简历评估专家团

**粘贴简历 + JD，三个 AI Agent 并行评估，生成可视化 HTML 报告，可导出。**

[![Release](https://img.shields.io/github/v/release/gjj-star/resume-map-agents?label=Release&color=6366f1)](https://github.com/gjj-star/resume-map-agents/releases)
[![Downloads](https://img.shields.io/github/downloads/gjj-star/resume-map-agents/total?color=8b5cf6)](https://github.com/gjj-star/resume-map-agents/releases)
[![Platform](https://img.shields.io/badge/Platform-Windows%20x64-22d3ee)](#)
[![License](https://img.shields.io/github/license/gjj-star/resume-map-agents?color=34d399)](LICENSE)

</div>

## ✨ 特性

- **三 Agent 并行评估**：能力透视（纯能力评估）+ 岗位匹配（JD × 简历，需提供 JD）+ 可视化报告，异步任务 + 进度轮询，单个 Agent 失败不影响整体出报告
- **证据分级打分**：按「直接 / 间接 / 名词 / 零证据」四档定分，拒绝"写了工具名就给分"
- **面试风险点与补强路线**：识别强词与证据不匹配、数字缺口径等风险，生成 P0/P1/P2 可执行补强项与面试待核实问题
- **单文件 HTML 报告**：内联 SVG 雷达图、深色主题、响应式、打印友好，可导出（自动处理 UTF-8 / BOM，杜绝乱码）
- **BYOK 开箱配置**：首次启动 1 分钟引导申请 Key；支持 DeepSeek 官方与任意 OpenAI 兼容服务（SiliconFlow / OpenRouter / 中转站等）
- **数据本地化**：API Key 与设置只保存在本机，不经过任何第三方服务器
- **自动更新**：GitHub Releases 自建更新通道（查询 + 下载 + sha512 校验）

<!-- 界面截图（待补充：建议截图后放入 docs/ 目录并在下方引用）
## 🖼 界面
![主界面](docs/screenshot-main.png)
-->

## 🚀 快速开始

### 方式一：安装版（推荐）

1. 从 [GitHub Releases](https://github.com/gjj-star/resume-map-agents/releases) 下载最新的 `resume-expert-team-<版本>-setup.exe`
2. 运行安装包（安装目录可自定义，桌面会生成「简历评估专家团」快捷方式）
3. 双击快捷方式启动

### 方式二：开发模式

```bash
git clone https://github.com/gjj-star/resume-map-agents.git
cd resume-map-agents
npm install          # 网络受限时加 --registry=https://registry.npmmirror.com
npm start
```

### 方式三：双击启动脚本

直接双击 `start.bat`。

### 首次配置 API Key（约 1 分钟）

首次启动会弹出引导，三步完成：

1. 打开 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys) 并登录（新账户建议先充值少量余额）
2. 创建 API Key，复制 `sk-` 开头的密钥
3. 粘贴到引导框，点击「保存并开始使用」——应用会做一次真实连通性验证并显示账户余额

之后可随时在 **「专家介绍 → API 设置」** 修改 Key、Base URL 与模型。

## 📖 使用方法

1. **输入简历**：左侧文本框粘贴候选人简历全文
2. **输入 JD**（选填）：右侧文本框粘贴岗位 JD，提供后启用岗位匹配
3. **点击「开始分析」**：三个 Agent 并行工作，实时查看进度
4. **查看报告**：分析完成后在预览区查看可视化报告
5. **导出 HTML**：保存到本地，单文件、可离线打开

## 🔑 API 配置说明

| 项 | 说明 |
|---|---|
| 模式 | BYOK（自带 Key），费用从你自己的服务商账户扣除，应用不含任何内置 Key |
| 默认服务商 | DeepSeek 官方（`https://api.deepseek.com`，模型 `deepseek-chat`） |
| 兼容服务商 | 任意 OpenAI 兼容接口：SiliconFlow、OpenRouter、各类中转站（改 Base URL 与模型名即可） |
| Key 存储 | 仅保存在本机 `settings.json`（打包版位于系统 userData 目录），**不进 git、不进安装包** |
| 成本参考 | 单次完整分析约几毛钱以内（DeepSeek 计费），与模型和内容长度相关 |

> 本机 Express 服务带每次启动随机生成的鉴权 token，浏览器中的其他网页无法调用本地接口。

## 🏗 架构

```
main.js           Electron 主进程：窗口 + Express 服务 + 自动更新
preload.js        contextBridge 安全桥接（端口 / 鉴权 token / 更新状态 / 打开外链）
server/
  index.js        Express API（分析任务 / 状态轮询 / 设置读写与验证）
  config.js       用户 API 设置存取（settings.json，环境变量兜底）
  agents.js       LLM 调用（重试退避）+ 三 Agent 编排（taskId + 轮询）
  prompts.js      三个 Agent 的 system prompt（输出 JSON / HTML 契约）
renderer/
  index.html      评估页 + 专家介绍页（API 设置）UI 结构
  app.js          前端逻辑（动效、轮询、导出、设置、首次引导）
  styles.css      深色主题样式
scripts/
  release.js      发版一条龙（bump → 打包 → latest.yml → Release → push）
```

## 🛠 技术栈

- **桌面壳**：Electron 31（Windows x64）
- **后端**：Node.js ≥ 18 + Express（本地服务）
- **前端**：Vanilla JS + CSS（无构建步骤）
- **模型**：DeepSeek API 及任意 OpenAI 兼容服务
- **报告**：LLM 生成单文件 HTML（内联 SVG 雷达图）

## 🔄 自动更新

- 打包版启动约 5 秒后检查 GitHub Releases 最新版本
- 新版本后台静默下载（含 sha512 完整性校验），下载完成后点击「立即重启更新」完成安装
- 更新通道走 `api.github.com` / `objects.githubusercontent.com`，避免主域超时
- 排查：若从未出现更新提示，常见原因是本机代理拦截了 GitHub 的 TLS 证书校验（详见 `AGENTS.md`）

## ❓ 常见问题

**Q：为什么需要自己的 API Key？**
A：应用不内置任何 Key（内置 Key 可被提取，等于公开捐钱）。BYOK 模式下费用由你自己账户承担，单次分析成本极低。

**Q：Key 安全吗？**
A：Key 只保存在本机，不经过任何第三方服务器，也不随安装包分发。本地服务有随机会话 token 鉴权。

**Q：支持哪些模型？**
A：默认 DeepSeek 官方 `deepseek-chat`；任何 OpenAI 兼容服务改 Base URL 即可接入。

**Q：导出的报告会乱码吗？**
A：报告强制注入 UTF-8 声明，导出时附带 BOM，兼容记事本等按系统编码打开的工具。

**Q：自动更新检查失败？**
A：检查是否被代理拦截 GitHub TLS；失败会静默降级，可手动从 Releases 下载安装包覆盖安装。

## 🧪 测试

```bash
# 后端模块可加载
cd server && node -e "require('./agents.js')"

# 服务健康检查
curl http://127.0.0.1:3456/api/health   # {"ok":true}

# 鉴权：APP_AUTH_TOKEN=xx node server/index.js 启动后，无 token 请求应 401
```

## 📦 开发与发版

```bash
npm start                              # 开发模式运行（--dev 打开 DevTools）
node scripts/release.js patch|minor|major   # 唯一正规发版入口
```

发版脚本自动完成：bump 版本 → 提交 → 打包 NSIS → 生成 ASCII 安装包 → 重算 sha512 写 `latest.yml` → 创建 GitHub Release → 推送 git。

## 📄 License

[MIT](LICENSE) © Resume Expert Team

## 致谢

- 专家介绍页架构图由 [Archify](https://github.com/tt-a1i/archify) 渲染
- UI 动效灵感来自 react-bits（SpotlightCard / FadeContent）
