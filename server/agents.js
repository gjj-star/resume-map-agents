// server/agents.js
// DeepSeek API 调用 + 三个 agent 编排
const https = require('https');
const crypto = require('crypto');
const { ABILITY_SCAN_SYSTEM, JD_MATCH_SYSTEM, REPORT_RENDER_SYSTEM } = require('./prompts');

const API_KEY = process.env.DEEPSEEK_API_KEY || '';
const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

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

function callDeepSeek(systemPrompt, userPrompt, maxTokens = 8000) {
  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: maxTokens,
    stream: false,
  });

  return new Promise((resolve, reject) => {
    const url = new URL('/v1/chat/completions', BASE_URL);
    const options = {
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname,
      port: url.port || 443,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 120000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`DeepSeek API ${res.statusCode}: ${data.slice(0, 500)}`));
          return;
        }
        try {
          const json = JSON.parse(data);
          const content = json?.choices?.[0]?.message?.content || '';
          resolve(content);
        } catch (e) {
          reject(new Error(`解析 DeepSeek 响应失败: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('DeepSeek API 请求超时'));
    });
    req.write(body);
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
  return t.trim();
}

function createTask() {
  const id = crypto.randomUUID().slice(0, 8);
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
  const abilityPromise = callDeepSeek(ABILITY_SCAN_SYSTEM, abilityUser, 8000)
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
    matchPromise = callDeepSeek(JD_MATCH_SYSTEM, matchUser, 8000)
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
  const reportUser = `请根据以下上游评估 JSON 生成单文件可视化 HTML 报告。

能力透视 JSON (ability_report)：
\`\`\`json
${JSON.stringify(task.abilityResult || { type: 'ability_report', error: '能力透视未产出' }, null, 2)}
\`\`\`

${hasJd ? `岗位匹配 JSON (match_report)：
\`\`\`json
${JSON.stringify(task.matchResult || { type: 'match_report', error: '岗位匹配未产出' }, null, 2)}
\`\`\`` : '岗位匹配 JSON：未提供 JD，未进行岗位匹配评估。'}

请直接输出完整 HTML（从 <!DOCTYPE html> 开始），不要包裹 markdown 代码块。`;

  const reportResp = await callDeepSeek(REPORT_RENDER_SYSTEM, reportUser, 16000);
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
  extractJson,
  extractHtml,
};
