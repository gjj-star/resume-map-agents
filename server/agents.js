// server/agents.js
// DeepSeek API 调用 + 三个 agent 编排
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ABILITY_SCAN_SYSTEM, JD_MATCH_SYSTEM, REPORT_RENDER_SYSTEM } = require('./prompts');
const { getApiConfig } = require('./config');

// 极简 .env 加载器（不依赖 dotenv，兼容 asar 打包后路径）
function loadEnv() {
  if (process.env.DEEPSEEK_API_KEY) return;
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch (_) { /* .env 不存在时忽略 */ }
}
loadEnv();

// API 配置（key / baseUrl / model）在每次调用时通过 config.js 读取：
// 界面设置(settings.json) > 环境变量(DEEPSEEK_*) > 默认值。
// 仓库与安装包内均不含明文 key。

// 内存任务存储
const tasks = new Map();

// 定期清理 30 分钟前的任务
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const TASK_TTL = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, task] of tasks) {
    if (now - task.createdAt > TASK_TTL) {
      tasks.delete(id);
    }
  }
}, CLEANUP_INTERVAL).unref?.();

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const RETRY_MAX = 2;
const RETRY_DELAYS = [1000, 2500];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 单次调用（不重试）。opts 可覆盖 { apiKey, baseUrl, model, maxTokens }
function callDeepSeekOnce(systemPrompt, userPrompt, opts = {}) {
  const cfg = getApiConfig();
  const apiKey = opts.apiKey || cfg.apiKey;
  const baseUrl = (opts.baseUrl || cfg.baseUrl).replace(/\/+$/, '');
  const model = opts.model || cfg.model;
  const maxTokens = opts.maxTokens || 8000;

  if (!apiKey) {
    return Promise.reject(new Error('未配置 API Key：请到「专家介绍 → API 设置」粘贴你的 Key'));
  }

  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: maxTokens,
    stream: false,
  });

  return new Promise((resolve, reject) => {
    const url = new URL('/v1/chat/completions', baseUrl + '/');
    const options = {
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname + url.search,
      port: url.port || 443,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 120000,
    };

    const req = https.request(options, (res) => {
      // 收集 Buffer 片段，最后一次性解码——避免多字节 UTF-8 中文被 TCP 分包切断产生 � 乱码
      const chunks = [];
      res.on('data', (chunk) => {
        chunks.push(chunk);
      });
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          const err = new Error(`API ${res.statusCode}: ${data.slice(0, 500)}`);
          err.retryable = RETRYABLE_STATUS.has(res.statusCode);
          reject(err);
          return;
        }
        try {
          const json = JSON.parse(data);
          let content = json?.choices?.[0]?.message?.content || '';
          // 兜底：清理任何环节产生的 U+FFFD 替换字符（乱码棱形问号）
          content = content.replace(/�/g, '');
          resolve(content);
        } catch (e) {
          reject(new Error(`解析 API 响应失败: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => {
      e.retryable = true; // 网络层错误（超时/重置/DNS）值得重试
      reject(e);
    });
    req.on('timeout', () => {
      const e = new Error('API 请求超时');
      e.retryable = true;
      req.destroy(e);
    });
    req.write(body);
    req.end();
  });
}

// 带重试的调用：429/5xx/网络错误最多重试 RETRY_MAX 次，指数退避
async function callDeepSeek(systemPrompt, userPrompt, opts = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    try {
      return await callDeepSeekOnce(systemPrompt, userPrompt, opts);
    } catch (e) {
      lastErr = e;
      if (attempt >= RETRY_MAX || !e.retryable) throw e;
      await sleep(RETRY_DELAYS[attempt]);
    }
  }
  throw lastErr;
}

// 余额查询（仅 DeepSeek 官方有统一接口，其余服务商返回 null；尽力而为，失败不报错）
async function checkBalance(apiKey, baseUrl) {
  try {
    const hostname = new URL(baseUrl).hostname;
    if (hostname !== 'api.deepseek.com') return null;
  } catch (_) {
    return null;
  }
  return new Promise((resolve) => {
    const url = new URL('/user/balance', baseUrl + '/');
    const req = https.request(
      {
        method: 'GET',
        hostname: url.hostname,
        path: url.pathname,
        port: url.port || 443,
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 15000,
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          if (res.statusCode !== 200) return resolve(null);
          try {
            const j = JSON.parse(d);
            resolve(j && j.balance_infos ? j : null);
          } catch (_) {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.end();
  });
}

// 从 LLM 响应中提取 JSON
function extractJson(text) {
  if (!text) return null;
  // 优先匹配 ```json ... ```
  const m = text.match(/```json\s*([\s\S]*?)```/);
  if (m) {
    try {
      return JSON.parse(m[1]);
    } catch (_) {}
  }
  // 降级：找第一个 { 到最后一个 }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (_) {}
  }
  return null;
}

// 从 LLM 响应中提取 HTML
function extractHtml(text) {
  if (!text) return '';
  // 去掉 markdown 包裹
  let t = text.replace(/```html\s*/gi, '').replace(/```\s*$/g, '').trim();
  // 定位 DOCTYPE 或 <html
  const idxDoc = t.toLowerCase().indexOf('<!doctype');
  const idxHtml = t.toLowerCase().indexOf('<html');
  let start = -1;
  if (idxDoc !== -1) start = idxDoc;
  else if (idxHtml !== -1) start = idxHtml;
  if (start > 0) t = t.slice(start);
  // 截到 </html>
  const endIdx = t.toLowerCase().lastIndexOf('</html>');
  if (endIdx !== -1) t = t.slice(0, endIdx + 7);
  t = t.trim();
  // 强制 UTF-8：没有 charset 声明的注入到 <head>，防止导出后按系统编码(GBK)解析乱码
  if (!/charset\s*=/i.test(t)) {
    if (/<head[^>]*>/i.test(t)) {
      t = t.replace(/<head[^>]*>/i, (m) => m + '<meta charset="UTF-8">');
    } else if (/<html[^>]*>/i.test(t)) {
      t = t.replace(/<html[^>]*>/i, (m) => m + '<head><meta charset="UTF-8"></head>');
    } else {
      t = '<meta charset="UTF-8">' + t;
    }
  }
  return t;
}

function createTask() {
  const id = crypto.randomUUID();
  const task = {
    id,
    status: 'pending', // pending | running | done | error
    progress: 0,
    step: 'init',
    agents: {
      'ability-scan': { status: 'waiting', label: '能力透视专家' },
      'jd-match': { status: 'waiting', label: '岗位匹配专家' },
      'report-render': { status: 'waiting', label: '可视化报告专家' },
    },
    abilityResult: null,
    matchResult: null,
    reportHtml: null,
    error: null,
    createdAt: Date.now(),
  };
  tasks.set(id, task);
  return task;
}

// 同步创建任务并启动异步分析（不阻塞，立即返回 task）
function startAnalysis(resumeText, jdText) {
  const task = createTask();
  const hasJd = Boolean(jdText && jdText.trim());

  task.status = 'running';
  task.step = 'parallel-analysis';
  task.agents['ability-scan'].status = 'running';
  if (hasJd) task.agents['jd-match'].status = 'running';
  else task.agents['jd-match'].status = 'skipped';

  // 异步执行，不阻塞调用方
  runAnalysis(task, resumeText, jdText, hasJd).catch((e) => {
    task.status = 'error';
    task.step = 'error';
    task.error = e.message;
    for (const k of Object.keys(task.agents)) {
      if (task.agents[k].status === 'running') task.agents[k].status = 'error';
    }
  });

  return Promise.resolve(task);
}

async function runAnalysis(task, resumeText, jdText, hasJd) {
  // 第一步：并行执行能力透视和岗位匹配
  const abilityUser = `候选人简历全文：\n\n${resumeText}\n\n请按契约输出 JSON。`;
  const abilityPromise = callDeepSeek(ABILITY_SCAN_SYSTEM, abilityUser, { maxTokens: 8000 })
    .then((resp) => {
      const json = extractJson(resp);
      if (!json) throw new Error('能力透视 JSON 解析失败');
      task.abilityResult = json;
      task.agents['ability-scan'].status = 'done';
      task.progress = 35;
    })
    .catch((e) => {
      task.abilityResult = { type: 'ability_report', error: e.message };
      task.agents['ability-scan'].status = 'error';
      task.agents['ability-scan'].error = e.message;
    });

  let matchPromise = Promise.resolve();
  if (hasJd) {
    const matchUser = `岗位 JD：\n\n${jdText}\n\n候选人简历：\n\n${resumeText}\n\n请按契约输出 JSON。`;
    matchPromise = callDeepSeek(JD_MATCH_SYSTEM, matchUser, { maxTokens: 8000 })
      .then((resp) => {
        const json = extractJson(resp);
        if (!json) throw new Error('岗位匹配 JSON 解析失败');
        task.matchResult = json;
        task.agents['jd-match'].status = 'done';
        task.progress = 35;
      })
      .catch((e) => {
        task.matchResult = { type: 'match_report', error: e.message };
        task.agents['jd-match'].status = 'error';
        task.agents['jd-match'].error = e.message;
      });
  }

  await Promise.all([abilityPromise, matchPromise]);
  task.progress = 50;
  task.step = 'report-render';
  task.agents['report-render'].status = 'running';

  // 第二步：调用可视化报告专家
  // 注入真实当前日期（LLM 没有时钟，不注入就会编造日期）
  const nowDate = new Date();
  const currentDateStr = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`;
  const reportUser = `请根据以下上游评估 JSON 生成单文件可视化 HTML 报告。

当前真实日期：${currentDateStr}（报告头部的"生成日期"必须使用这个日期，禁止编造其他日期）

能力透视 JSON (ability_report)：
\`\`\`json
${JSON.stringify(task.abilityResult || { type: 'ability_report', error: '能力透视未产出' }, null, 2)}
\`\`\`

${hasJd ? `岗位匹配 JSON (match_report)：
\`\`\`json
${JSON.stringify(task.matchResult || { type: 'match_report', error: '岗位匹配未产出' }, null, 2)}
\`\`\`` : '岗位匹配 JSON：未提供 JD，未进行岗位匹配评估。'}

请直接输出完整 HTML（从 <!DOCTYPE html> 开始），不要包裹 markdown 代码块。`;

  const reportResp = await callDeepSeek(REPORT_RENDER_SYSTEM, reportUser, { maxTokens: 16000 });
  const html = extractHtml(reportResp);
  if (!html) {
    throw new Error('报告 HTML 解析失败：未检测到有效 HTML');
  }
  task.reportHtml = html;
  task.agents['report-render'].status = 'done';
  task.progress = 100;
  task.status = 'done';
  task.step = 'complete';
}

function getTaskStatus(taskId) {
  return tasks.get(taskId);
}

module.exports = {
  startAnalysis,
  getTaskStatus,
  callDeepSeek,
  checkBalance,
  extractJson,
  extractHtml,
};
