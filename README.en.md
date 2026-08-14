English | [简体中文](README.md)

# Resume Expert Team

> Paste a resume + JD, three AI agents evaluate in parallel, and generate a visual HTML report.

![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20x64-green)
![Electron](https://img.shields.io/badge/Electron-31-orange)
![Release](https://img.shields.io/github/v/release/gjj-star/resume-map-agents?label=Release&color=6366f1)

---

## Introduction

Resume Expert Team is a Windows desktop app: paste a candidate's resume (and optionally a job description) and three AI agents — Ability Scan, JD Match, and Report Renderer — evaluate it in parallel, producing a single-file visual HTML report that can be exported and viewed offline. All data is processed locally; users bring their own API key (BYOK) and no third-party server is involved.

## Core Features

| Module | Description |
|--------|-------------|
| **Three parallel agents** | Ability Scan (pure ability evaluation) + JD Match (JD × resume) + Report Renderer, with async tasks, progress polling, and graceful degradation if one agent fails |
| **Evidence-tiered scoring** | Four tiers — direct / indirect / nominal / zero evidence — no credit for merely listing a tool name |
| **Interview risks & improvement roadmap** | Detects inflated claims vs. evidence, numbers without methodology, etc.; generates P0/P1/P2 actionable improvement items and interview verification questions |
| **Single-file HTML report** | Inline SVG radar charts, dark theme, responsive, print-friendly; UTF-8 / BOM handled automatically |
| **BYOK setup** | 1-minute first-run onboarding; supports the official DeepSeek API and any OpenAI-compatible service |
| **Local-first data** | API key and settings stay on your machine — no third-party server involved |
| **Auto-update** | Self-hosted update channel on GitHub Releases (check + download + sha512 verification) |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop shell | Electron 31 (Windows x64) |
| Backend | Node.js 18+ + Express (local service) |
| Frontend | Vanilla JS + CSS (no build step) |
| Model | DeepSeek API and any OpenAI-compatible service (SiliconFlow, OpenRouter, relays, etc.) |
| Report | LLM-generated single-file HTML (inline SVG radar charts) |

## Project Structure

```
resume-map-agents/
├── main.js                        # Electron main process: window + Express service + auto-updater
├── preload.js                     # contextBridge (port / auth token / update status / open external links)
├── server/
│   ├── index.js                   # Express API (analysis tasks / status polling / settings read-write & validation)
│   ├── config.js                  # User API settings store (settings.json, env-var fallback)
│   ├── agents.js                  # LLM calls (retry with backoff) + three-agent orchestration (taskId + polling)
│   └── prompts.js                 # System prompts for the three agents (JSON / HTML output contracts)
├── renderer/
│   ├── index.html                 # Evaluation page + experts page (API settings) structure
│   ├── app.js                     # Frontend logic (effects, polling, export, settings, first-run onboarding)
│   └── styles.css                 # Dark theme styles
├── scripts/
│   └── release.js                 # One-stop release pipeline (the only official release entry point)
└── assets/                        # App icon and architecture diagram source
```

> The experts page embeds an interactive system architecture diagram, rendered by [Archify](https://github.com/tt-a1i/archify) from `assets/expert-architecture.architecture.json`, with zoom / search / focus / route tracing / light-dark theme support.

## Quick Start

### Requirements

- **Node.js** 18+ (development mode only)

### Option 1: Installer (recommended)

1. Download the latest `resume-expert-team-<version>-setup.exe` from [GitHub Releases](https://github.com/gjj-star/resume-map-agents/releases)
2. Run the installer (installation directory is configurable; a desktop shortcut is created)
3. Launch via the shortcut

### Option 2: Development

```bash
git clone https://github.com/gjj-star/resume-map-agents.git
cd resume-map-agents
npm install          # add --registry=https://registry.npmmirror.com if the network is restricted
npm start
```

### Option 3: Launch script

Double-click `start.bat`.

### First-run API key setup (~1 minute)

A first-run overlay guides you through three steps:

1. Open the [DeepSeek platform](https://platform.deepseek.com/api_keys) and sign in (top up a small balance for new accounts)
2. Create an API key and copy the `sk-` secret
3. Paste it into the overlay and click "Save & Start" — the app performs a real connectivity check and shows your account balance

You can change the key, base URL, or model anytime under "Experts → API Settings".

## Usage

1. **Resume**: paste the candidate's full resume into the left textarea
2. **JD** (optional): paste the job description into the right textarea to enable JD matching
3. **Click "Start Analysis"**: the three agents work in parallel with live progress
4. **Review the report** in the preview area once done
5. **Export HTML**: save locally — a single self-contained file, viewable offline

## AI Configuration

Configure the AI service under "Experts → API Settings":

- **API Key**: your LLM API secret (stored only in local `settings.json`, under the system userData directory in packaged builds)
- **Base URL**: the API endpoint (OpenAI-compatible format, e.g. `https://api.deepseek.com`)
- **Model**: the model name (default `deepseek-chat`)

The app ships no embedded key: billing comes from your own provider account, and a full analysis typically costs well under ¥1 depending on model and content length.

## Security Notes

- The API key is stored locally only — never in git, never in the installer
- The local Express service is protected by a per-session random auth token; web pages open in your browser cannot call it
- Reports render under a strict CSP (all external requests blocked) inside a sandboxed iframe (no allow-same-origin), so a malicious resume cannot exfiltrate data through the report
- Auto-update uses strict TLS by default, and downloaded installers are verified against sha512

## Auto-Update

- Packaged builds check GitHub Releases ~5 seconds after launch and download silently in the background
- Click "Restart to Update" when the download finishes; failures degrade silently, and manual download from Releases always works
- Troubleshooting: if you never see an update prompt, a common cause is a local proxy intercepting GitHub's TLS certificates (see `AGENTS.md`)

## License

MIT License
