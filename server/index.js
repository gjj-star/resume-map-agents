// server/index.js
// Express 后端服务
const express = require('express');
const cors = require('cors');
const { startAnalysis, getTaskStatus } = require('./agents');

const app = express();
const PORT = parseInt(process.env.PORT || '3456', 10);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

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
