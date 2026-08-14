[简体中文](README.md) | [English](README.en.md)

# 简历评估专家团

> 粘贴简历 + JD，三个 AI Agent 并行评估，生成可视化 HTML 报告。

![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20x64-green)
![Electron](https://img.shields.io/badge/Electron-31-orange)
![Release](https://img.shields.io/github/v/release/gjj-star/resume-map-agents?label=Release&color=6366f1)

---

## 项目简介

简历评估专家团是一款 Windows 桌面应用：粘贴候选人简历（可选岗位 JD），三个 AI Agent——能力透视、岗位匹配、可视化报告——并行评估，生成单文件可视化 HTML 报告，可导出、可离线打开。数据全程本地处理，API Key 由用户自带（BYOK），不经过任何第三方服务器。

## 核心功能

| 功能模块 | 说明 |
|---------|------|
| **三 Agent 并行评估** | 能力透视（纯能力评估）+ 岗位匹配（JD × 简历）+ 可视化报告，异步任务与进度轮询，单个 Agent 失败不影响整体出报告 |
| **证据分级打分** | 按直接 / 间接 / 名词 / 零证据四档定分，拒绝"写了工具名就给分" |
| **面试风险与补强路线** | 识别强词与证据不匹配、数字缺口径等风险，生成 P0/P1/P2 可执行补强项与面试待核实问题 |
| **单文件 HTML 报告** | 内联 SVG 雷达图、深色主题、响应式、打印友好，自动处理 UTF-8 / BOM，杜绝乱码 |
| **BYOK 开箱配置** | 首次启动 1 分钟引导申请 Key；支持 DeepSeek 官方与任意 OpenAI 兼容服务 |
| **数据本地化** | API Key 与设置只保存在本机，不经过任何第三方服务器 |
| **自动更新** | GitHub Releases 自建更新通道（查询 + 下载 + sha512 完整性校验） |

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 31（Windows x64） |
| 后端 | Node.js 18+ + Express（本地服务） |
| 前端 | Vanilla JS + CSS（无构建步骤） |
| 模型 | DeepSeek API 及任意 OpenAI 兼容服务（SiliconFlow / OpenRouter / 中转站等） |
| 报告 | LLM 生成单文件 HTML（内联 SVG 雷达图） |

## 项目结构

```
resume-map-agents/
├── main.js                        # Electron 主进程：窗口 + Express 服务 + 自动更新
├── preload.js                     # contextBridge 安全桥接（端口 / 鉴权 token / 更新状态 / 打开外链）
├── server/
│   ├── index.js                   # Express API（分析任务 / 状态轮询 / 设置读写与验证）
│   ├── config.js                  # 用户 API 设置存取（settings.json，环境变量兜底）
│   ├── agents.js                  # LLM 调用（重试退避）+ 三 Agent 编排（taskId + 轮询）
│   └── prompts.js                 # 三个 Agent 的 system prompt（JSON / HTML 输出契约）
├── renderer/
│   ├── index.html                 # 评估页 + 专家介绍页（API 设置）UI 结构
│   ├── app.js                     # 前端逻辑（动效、轮询、导出、设置、首次引导）
│   └── styles.css                 # 深色主题样式
├── scripts/
│   └── release.js                 # 发版一条龙脚本（唯一正规发版入口）
└── assets/                        # 应用图标与架构图源文件
```

> 专家介绍页内置一张交互式系统架构图，由 [Archify](https://github.com/tt-a1i/archify) 从 `assets/expert-architecture.architecture.json` 渲染，支持缩放 / 搜索 / 聚焦 / 链路追踪 / 明暗主题切换。

## 快速开始

### 环境要求

- **Node.js** 18+（仅开发模式需要）

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

之后可随时在「专家介绍 → API 设置」修改 Key、Base URL 与模型。

## 使用方法

1. **输入简历**：左侧文本框粘贴候选人简历全文
2. **输入 JD**（选填）：右侧文本框粘贴岗位 JD，提供后启用岗位匹配
3. **点击「开始分析」**：三个 Agent 并行工作，实时查看进度
4. **查看报告**：分析完成后在预览区查看可视化报告
5. **导出 HTML**：保存到本地，单文件、可离线打开

## AI 配置

在「专家介绍 → API 设置」中配置 AI 服务：

- **API Key**：你的大模型 API 密钥（仅保存在本机 `settings.json`，打包版位于系统 userData 目录）
- **Base URL**：API 端点地址（兼容 OpenAI 格式，如 `https://api.deepseek.com`）
- **Model**：模型名称（默认 `deepseek-chat`）

应用不内置任何 Key：费用从你自己的服务商账户扣除，单次完整分析成本通常低于 1 元（与模型和内容长度相关）。

## 安全说明

- API Key 只保存在本机，不进 git、不进安装包
- 本地 Express 服务带每会话随机鉴权 token，浏览器中的其他网页无法调用
- 报告渲染启用严格 CSP（禁止一切外部请求）+ 沙箱 iframe（无 allow-same-origin），恶意简历无法借报告外传数据
- 自动更新默认严格校验 TLS，下载的安装包做 sha512 完整性校验

## 自动更新

- 打包版启动约 5 秒后检查 GitHub Releases 最新版本，后台静默下载
- 下载完成后点击「立即重启更新」完成安装；更新失败静默降级，可手动从 Releases 下载覆盖安装
- 排查：若从未出现更新提示，常见原因是本机代理拦截了 GitHub 的 TLS 证书（详见 `AGENTS.md`）

## 许可证

MIT License
