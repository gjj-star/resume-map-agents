// server/index.js
// Express 后端服务
const express = require('express');
const cors = require('cors');
const { startAnalysis, getTaskStatus, callDeepSeek, checkBalance } = require('./agents');
const { getApiConfig, saveSettings } = require('./config');

const app = express();
const PORT = parseInt(process.env.PORT || '3456', 10);
// 主进程每次启动生成随机 token（见 main.js），渲染进程经 IPC 获取。
// 独立 node 直跑（开发/CI）未设置 token 时放行。
const AUTH_TOKEN = process.env.APP_AUTH_TOKEN || '';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 本机服务鉴权：阻止用户浏览器里任意网页跨域白嫖本服务（烧 token / 偷分析结果）。
app.use('/api', (req, res, next) => {
  if (!AUTH_TOKEN) return next();
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

// ===== API 设置（BYOK：key 只保存在用户本机 settings.json） =====
app.get('/api/settings', (req, res) => {
  res.json(getApiConfig());
});

app.put('/api/settings', (req, res) => {
  const body = req.body || {};
  const saved = saveSettings(body);
  res.json(saved);
});

// 用当前保存的配置做一次真实连通性验证，并尽力查询余额（仅 DeepSeek 官方支持余额接口）
app.post('/api/settings/validate', async (req, res) => {
  const cfg = getApiConfig();
  if (!cfg.apiKey) {
    return res.status(400).json({ ok: false, error: '未提供 API Key' });
  }
  try {
    await callDeepSeek('你是连通性测试。', '只回复两个字：正常', {
      maxTokens: 16,
    });
    const balance = await checkBalance(cfg.apiKey, cfg.baseUrl);
    res.json({ ok: true, balance });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// ===== 评估任务 =====
// 提交分析任务 —— 异步执行，立即返回 taskId
app.post('/api/evaluation/analyze', async (req, res) => {
  const { resume, jd } = req.body || {};
  if (!resume || !resume.trim()) {
    return res.status(400).json({ error: 'resume 为必填项' });
  }
  try {
    const task = await startAnalysis(resume.trim(), (jd || '').trim());
    res.json({ taskId: task.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 查询任务状态
app.get('/api/evaluation/status/:taskId', (req, res) => {
  const task = getTaskStatus(req.params.taskId);
  if (!task) {
    return res.status(404).json({ error: '任务不存在或已过期' });
  }
  res.json({
    id: task.id,
    status: task.status,
    progress: task.progress,
    step: task.step,
    agents: task.agents,
    abilityResult: task.abilityResult,
    matchResult: task.matchResult,
    reportHtml: task.reportHtml,
    error: task.error,
  });
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, port: PORT, time: Date.now() });
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] 简历评估专家团服务已启动: http://127.0.0.1:${PORT}`);
});

// 优雅退出（仅独立运行时注册信号处理，Electron 内不注册避免杀主进程）
if (!process.env.ELECTRON_RUN && !process.versions.electron) {
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
  process.on('SIGINT', () => server.close(() => process.exit(0)));
}

module.exports = app;
