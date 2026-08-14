// server/config.js
// 用户 API 配置存取：settings.json 存放在 userData（打包版）或项目根（开发直跑）
//
// 解析优先级：界面设置(settings.json) > 环境变量(DEEPSEEK_*) > 内置默认值。
// 环境变量只作开发便利与 CI 使用，绝不进安装包（见 package.json build.files）。
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
};

function settingsDir() {
  return process.env.RESUME_USER_DATA || path.join(__dirname, '..');
}

function settingsPath() {
  return path.join(settingsDir(), 'settings.json');
}

function sanitize(raw) {
  const out = {};
  out.apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '';
  out.baseUrl =
    typeof raw.baseUrl === 'string' && raw.baseUrl.trim()
      ? raw.baseUrl.trim().replace(/\/+$/, '')
      : DEFAULTS.baseUrl;
  out.model =
    typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : DEFAULTS.model;
  return out;
}

function loadSettings() {
  try {
    return sanitize(JSON.parse(fs.readFileSync(settingsPath(), 'utf8')));
  } catch (_) {
    return { ...DEFAULTS };
  }
}

// 保存时字段级合并：缺省字段保留现值，传空串 apiKey 表示清除
function saveSettings(patch = {}) {
  const current = loadSettings();
  const merged = { ...current };
  if ('apiKey' in patch) merged.apiKey = String(patch.apiKey || '').trim();
  if (patch.baseUrl !== undefined) merged.baseUrl = String(patch.baseUrl || '').trim();
  if (patch.model !== undefined) merged.model = String(patch.model || '').trim();
  const clean = sanitize(merged);
  fs.mkdirSync(settingsDir(), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(clean, null, 2) + '\n', 'utf8');
  return clean;
}

// 生效配置：界面设置优先，环境变量兜底（开发模式）
function getApiConfig() {
  const s = loadSettings();
  return {
    apiKey: s.apiKey || process.env.DEEPSEEK_API_KEY || '',
    baseUrl: s.baseUrl || process.env.DEEPSEEK_BASE_URL || DEFAULTS.baseUrl,
    model: s.model || process.env.DEEPSEEK_MODEL || DEFAULTS.model,
  };
}

module.exports = { DEFAULTS, loadSettings, saveSettings, getApiConfig, settingsPath };
