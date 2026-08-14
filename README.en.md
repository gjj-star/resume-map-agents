<div align="center">

English | [简体中文](README.md)

<img src="assets/icon.png" width="84" alt="Resume Expert Team Logo" />

# Resume Expert Team

**Paste a resume + JD, three AI agents evaluate in parallel, and generate a visual HTML report you can export.**

[![Release](https://img.shields.io/github/v/release/gjj-star/resume-map-agents?label=Release&color=6366f1)](https://github.com/gjj-star/resume-map-agents/releases)
[![Downloads](https://img.shields.io/github/downloads/gjj-star/resume-map-agents/total?color=8b5cf6)](https://github.com/gjj-star/resume-map-agents/releases)
[![Platform](https://img.shields.io/badge/Platform-Windows%20x64-22d3ee)](#)
[![License](https://img.shields.io/github/license/gjj-star/resume-map-agents?color=34d399)](LICENSE)

</div>

## ✨ Features

- **Three parallel agents**: Ability Scan (pure ability evaluation) + JD Match (JD × resume, when a JD is provided) + Report Renderer, with async tasks, progress polling, and graceful degradation if one agent fails
- **Evidence-tiered scoring**: four tiers — direct / indirect / nominal / zero evidence — no credit for merely listing a tool name
- **Interview risks & improvement roadmap**: detects inflated claims vs. evidence, numbers without methodology, etc.; generates P0/P1/P2 actionable improvement items and interview verification questions
- **Single-file HTML report**: inline SVG radar charts, dark theme, responsive, print-friendly, exportable (UTF-8 / BOM handled, no mojibake)
- **BYOK out-of-the-box setup**: 1-minute first-run onboarding; supports the official DeepSeek API and any OpenAI-compatible service (SiliconFlow, OpenRouter, relays, etc.)
- **Local-first data**: API key and settings stay on your machine — no third-party server involved
- **Auto-update**: self-hosted update channel on GitHub Releases (check + download + sha512 verification)

<!-- Screenshots (TODO: drop images into docs/ and reference them below)
## 🖼 Screenshots
![Main UI](docs/screenshot-main.png)
-->

## 🚀 Quick Start

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

### First-run API Key setup (~1 minute)

A first-run overlay guides you through three steps:

1. Open the [DeepSeek platform](https://platform.deepseek.com/api_keys) and sign in (top up a small balance for new accounts)
2. Create an API key and copy the `sk-` secret
3. Paste it into the overlay and click "Save & Start" — the app performs a real connectivity check and shows your account balance

You can change the key, base URL, or model anytime under **"Experts → API Settings"**.

## 📖 Usage

1. **Resume**: paste the candidate's full resume into the left textarea
2. **JD** (optional): paste the job description into the right textarea to enable JD matching
3. **Click "Start Analysis"**: the three agents work in parallel with live progress
4. **Review the report** in the preview area once done
5. **Export HTML**: save locally — a single self-contained file, viewable offline

## 🔑 API Configuration

| Item | Description |
|---|---|
| Mode | BYOK (bring your own key); billing comes from your own provider account — the app ships no embedded key |
| Default provider | Official DeepSeek (`https://api.deepseek.com`, model `deepseek-chat`) |
| Compatible providers | Any OpenAI-compatible endpoint: SiliconFlow, OpenRouter, relays, etc. (just change the base URL and model name) |
| Key storage | Local `settings.json` only (system userData directory in packaged builds) — **never in git, never in the installer** |
| Cost reference | A full analysis typically costs well under ¥1 with DeepSeek, depending on model and content length |

> The local Express service is protected by a per-session random auth token; web pages open in your browser cannot call it.

## 🏗 Architecture

```
main.js           Electron main process: window + Express service + auto-updater
preload.js        contextBridge (port / auth token / update status / open external links)
server/
  index.js        Express API (analysis tasks / status polling / settings read-write & validation)
  config.js       User API settings store (settings.json, env-var fallback)
  agents.js       LLM calls (retry with backoff) + three-agent orchestration (taskId + polling)
  prompts.js      System prompts for the three agents (JSON / HTML output contracts)
renderer/
  index.html      Evaluation page + experts page (API settings) structure
  app.js          Frontend logic (effects, polling, export, settings, first-run onboarding)
  styles.css      Dark theme styles
scripts/
  release.js      One-stop release pipeline (bump → build → latest.yml → Release → push)
```

## 🛠 Tech Stack

- **Shell**: Electron 31 (Windows x64)
- **Backend**: Node.js ≥ 18 + Express (local service)
- **Frontend**: Vanilla JS + CSS (no build step)
- **Model**: DeepSeek API and any OpenAI-compatible service
- **Report**: LLM-generated single-file HTML (inline SVG radar charts)

## 🔄 Auto-Update

- Packaged builds check GitHub Releases ~5 seconds after launch
- New versions download silently in the background (with sha512 verification); click "Restart to Update" when ready
- The update channel uses `api.github.com` / `objects.githubusercontent.com` to avoid main-domain timeouts
- Troubleshooting: if you never see an update prompt, a common cause is a local proxy intercepting GitHub's TLS certificates (see `AGENTS.md`)

## ❓ FAQ

**Q: Why do I need my own API key?**
A: The app ships no embedded key (embedded keys can be extracted and abused). With BYOK, billing comes from your own account and each analysis costs very little.

**Q: Is my key safe?**
A: It is stored only on your machine, never sent to any third-party server, and never bundled into the installer. The local service is protected by a per-session random auth token.

**Q: Which models are supported?**
A: Official DeepSeek `deepseek-chat` by default; any OpenAI-compatible service works by changing the base URL.

**Q: Will exported reports have garbled Chinese text?**
A: Reports force a UTF-8 declaration and exports include a BOM, so they render correctly even in Notepad-style tools that default to the system encoding.

**Q: Auto-update check fails?**
A: Check whether a proxy intercepts GitHub TLS. Failures degrade silently; you can always download the installer manually from Releases.

## 🧪 Tests

```bash
# Backend modules load
cd server && node -e "require('./agents.js')"

# Health check
curl http://127.0.0.1:3456/api/health   # {"ok":true}

# Auth: with APP_AUTH_TOKEN=xx node server/index.js, requests without a token should get 401
```

## 📦 Development & Release

```bash
npm start                                     # run in development (--dev opens DevTools)
node scripts/release.js patch|minor|major     # the only official release entry point
```

The release script automates: version bump → commit → NSIS build → ASCII asset name → sha512 `latest.yml` → GitHub Release → git push.

## 📄 License

[MIT](LICENSE) © Resume Expert Team

## Acknowledgements

- Architecture diagram rendered by [Archify](https://github.com/tt-a1i/archify)
- UI motion inspired by react-bits (SpotlightCard / FadeContent)
