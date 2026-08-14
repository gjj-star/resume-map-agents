// renderer/app.js
// 前端逻辑：与本地 Express 服务通信，驱动三个 agent 的进度与报告预览。

// ===== SpotlightCard 效果 (react-bits inspired) =====
function initSpotlightCards() {
  document.querySelectorAll('.spotlight-card').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', x + 'px');
      card.style.setProperty('--mouse-y', y + 'px');
    });
  });
}

// ===== FadeContent 淡入效果 (react-bits inspired) =====
function initFadeIn() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );
  document.querySelectorAll('.agent-card, .expert-card, .card').forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = `opacity 0.6s ease ${i * 0.08}s, transform 0.6s ease ${i * 0.08}s`;
    observer.observe(el);
  });
}

let serverPort = null;
let currentTaskId = null;
let pollTimer = null;
let reportHtml = null;

const STATUS_LABEL = {
  waiting: '等待中',
  running: '执行中',
  done: '已完成',
  error: '出错',
  skipped: '已跳过',
};

const STATUS_COLOR = {
  done: 'var(--success)',
  error: 'var(--danger)',
  running: 'var(--primary-1)',
  waiting: 'var(--text-dim)',
  skipped: 'var(--text-dim)',
};

function $(id) {
  return document.getElementById(id);
}

function toast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'show ' + type;
  setTimeout(() => {
    el.className = '';
  }, 2600);
}

async function getPort() {
  if (serverPort) return serverPort;
  // 优先从 Electron preload 获取
  if (window.electronAPI && window.electronAPI.getServerPort) {
    try {
      serverPort = await window.electronAPI.getServerPort();
    } catch (_) {}
  }
  // 降级：从 URL query 获取
  if (!serverPort) {
    const params = new URLSearchParams(location.search);
    serverPort = parseInt(params.get('port') || '3456', 10);
  }
  // 降级：默认 3456
  if (!serverPort) serverPort = 3456;
  return serverPort;
}

function apiBase() {
  return `http://127.0.0.1:${serverPort}`;
}

// ===== 本机服务鉴权：每次启动的随机会话 token，防止浏览器里任意网页调用本地 API =====
let authToken = null;

async function getToken() {
  if (authToken) return authToken;
  if (window.electronAPI && window.electronAPI.getAuthToken) {
    try {
      authToken = await window.electronAPI.getAuthToken();
    } catch (_) {}
  }
  return authToken;
}

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = await getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (options.body && headers['Content-Type'] === undefined) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(`${apiBase()}${path}`, { ...options, headers });
}

// ===== 页面切换 =====
$('navBtn').addEventListener('click', () => {
  const evalPage = $('page-eval');
  const expertPage = $('page-experts');
  const btn = $('navBtn');
  if (evalPage.classList.contains('active')) {
    evalPage.classList.remove('active');
    expertPage.classList.add('active');
    btn.textContent = '返回评估';
  } else {
    expertPage.classList.remove('active');
    evalPage.classList.add('active');
    btn.textContent = '专家介绍';
  }
});

// ===== 清空 =====
$('clearBtn').addEventListener('click', () => {
  $('resumeInput').value = '';
  $('jdInput').value = '';
  resetAgents();
  resetReport();
  $('hint').textContent = '';
});

function resetAgents() {
  for (const key of ['ability-scan', 'jd-match', 'report-render']) {
    const card = document.querySelector(`.agent-card[data-agent="${key}"]`);
    if (!card) continue;
    card.className = 'agent-card';
    const dot = card.querySelector('.status-dot');
    dot.className = 'status-dot';
    card.querySelector('.status-text').textContent = '等待中';
    card.querySelector('.agent-progress-bar').style.width = '0%';
    const err = card.querySelector('.agent-error');
    if (err) err.remove();
  }
  $('globalProgress').classList.remove('show');
  $('globalProgressBar').style.width = '0%';
}

function resetReport() {
  reportHtml = null;
  $('exportBtn').disabled = true;
  $('reportWrap').innerHTML =
    '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="width:40px;height:40px;opacity:0.3;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg><div>分析完成后，报告将在此处预览</div></div>';
}

// ===== 开始分析 =====
$('analyzeBtn').addEventListener('click', async () => {
  const resume = $('resumeInput').value.trim();
  const jd = $('jdInput').value.trim();
  if (!resume) {
    toast('请粘贴简历全文', 'error');
    return;
  }
  if (resume.length < 50) {
    toast('简历内容过短，请提供更完整的简历', 'error');
    return;
  }

  await getPort();

  const btn = $('analyzeBtn');
  btn.disabled = true;
  btn.textContent = '分析中...';
  $('hint').textContent = '';
  resetAgents();
  resetReport();
  $('globalProgress').classList.add('show');

  try {
    const resp = await apiFetch('/api/evaluation/analyze', {
      method: 'POST',
      body: JSON.stringify({ resume, jd }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `请求失败 (${resp.status})`);
    }
    const data = await resp.json();
    currentTaskId = data.taskId;
    if (!currentTaskId) throw new Error('未返回 taskId');
    startPolling();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '开始分析';
    $('globalProgress').classList.remove('show');
    toast(`提交失败：${e.message}`, 'error');
  }
});

// ===== 轮询任务状态 =====
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollStatus, 1200);
  pollStatus();
}

async function pollStatus() {
  if (!currentTaskId) return;
  try {
    const resp = await apiFetch(`/api/evaluation/status/${currentTaskId}`);
    if (!resp.ok) {
      if (resp.status === 404) {
        stopPolling();
        toast('任务已过期', 'error');
        $('analyzeBtn').disabled = false;
        $('analyzeBtn').textContent = '开始分析';
      }
      return;
    }
    const data = await resp.json();
    renderStatus(data);
    if (data.status === 'done' || data.status === 'error') {
      stopPolling();
      $('analyzeBtn').disabled = false;
      $('analyzeBtn').textContent = '开始分析';
      if (data.status === 'done' && data.reportHtml) {
        renderReport(data.reportHtml);
        toast('报告生成完成', 'success');
      } else if (data.status === 'error') {
        toast(`分析失败：${data.error || '未知错误'}`, 'error');
        $('hint').textContent = data.error || '';
      }
    }
  } catch (e) {
    // 网络抖动，继续重试
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function renderStatus(data) {
  // 全局进度
  $('globalProgressBar').style.width = `${data.progress || 0}%`;

  // 每个 agent
  for (const key of Object.keys(data.agents || {})) {
    const agent = data.agents[key];
    const card = document.querySelector(`.agent-card[data-agent="${key}"]`);
    if (!card) continue;
    card.className = `agent-card ${agent.status}`;
    const dot = card.querySelector('.status-dot');
    dot.className = `status-dot ${agent.status}`;
    card.querySelector('.status-text').textContent = STATUS_LABEL[agent.status] || agent.status;
    card.querySelector('.status-text').style.color = STATUS_COLOR[agent.status] || '';

    // 进度条
    let barWidth = 0;
    if (agent.status === 'done') barWidth = 100;
    else if (agent.status === 'running') barWidth = 50;
    else if (agent.status === 'skipped') barWidth = 100;
    card.querySelector('.agent-progress-bar').style.width = `${barWidth}%`;

    // 错误信息
    const oldErr = card.querySelector('.agent-error');
    if (oldErr) oldErr.remove();
    if (agent.error) {
      const div = document.createElement('div');
      div.className = 'agent-error';
      div.textContent = agent.error;
      card.appendChild(div);
    }
  }
}

// 确保 HTML 有 UTF-8 charset 声明（双保险：server 已注入，这里兜底）
function ensureUtf8(html) {
  if (/charset\s*=/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => m + '<meta charset="UTF-8">');
  }
  return '<meta charset="UTF-8">' + html;
}

// 向同域 iframe 注入样式：隐藏原生滚动条（保留滚轮滚动能力），深色主题下原生滚动条太突兀
function hideIframeScrollbars(iframe) {
  iframe.addEventListener('load', () => {
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const style = doc.createElement('style');
      style.textContent =
        '::-webkit-scrollbar{width:0!important;height:0!important}' +
        'html,body{scrollbar-width:none!important}';
      doc.head.appendChild(style);
    } catch (_) { /* 跨域时放弃，不影响功能 */ }
  });
}

function renderReport(html) {
  reportHtml = ensureUtf8(html);
  $('exportBtn').disabled = false;
  const wrap = $('reportWrap');
  wrap.innerHTML = '';
  const iframe = document.createElement('iframe');
  // 只留 allow-scripts（雷达图内联脚本必需）。去掉 allow-same-origin：
  // 报告内容是未受信输入（LLM 生成 + 简历原文），不能让它以同源身份触碰父窗口
  // （父窗口有 API key 输入框与 electronAPI 鉴权 token）。
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.setAttribute('srcdoc', reportHtml);
  // 注意：无 allow-same-origin 时 iframe 为不透明源，父窗口拿不到 contentDocument，
  // hideIframeScrollbars 会静默 no-op（原生滚动条保留）——这是刻意的安全取舍。
  hideIframeScrollbars(iframe);
  wrap.appendChild(iframe);
}

// 专家介绍页工作流图 iframe：同样隐藏滚动条
(function () {
  const wf = document.getElementById('workflowFrame');
  if (wf) hideIframeScrollbars(wf);
})();

// ===== 导出 HTML =====
$('exportBtn').addEventListener('click', () => {
  if (!reportHtml) return;
  // 加 UTF-8 BOM：防止记事本等工具按系统 ANSI(GBK) 打开导致中文乱码
  const blob = new Blob(['\ufeff' + reportHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date();
  const stamp =
    ts.getFullYear() +
    String(ts.getMonth() + 1).padStart(2, '0') +
    String(ts.getDate()).padStart(2, '0') +
    '_' +
    String(ts.getHours()).padStart(2, '0') +
    String(ts.getMinutes()).padStart(2, '0');
  a.href = url;
  a.download = `简历分析报告_${stamp}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('报告已导出', 'success');
});

// ===== 初始化 =====
(async function init() {
  initSpotlightCards();
  initFadeIn();
  await getPort();
  // 健康检查
  try {
    const resp = await apiFetch('/api/health');
    if (resp.ok) {
      $('hint').textContent = '服务就绪';
      setTimeout(() => ($('hint').textContent = ''), 2000);
    }
  } catch (_) {
    $('hint').textContent = '服务启动中，如无法分析请稍后重试';
  }
  // 加载 API 设置；未配置 Key 时展示首次引导
  loadApiSettings();
})();

// ===== 自动更新状态 =====
function initAutoUpdate() {
  const bar = $('updateBar');
  const text = $('updateText');
  const installBtn = $('updateInstallBtn');
  if (!window.electronAPI || !window.electronAPI.onUpdateStatus) return;

  window.electronAPI.onUpdateStatus((data) => {
    if (data.status === 'downloading') {
      bar.style.display = 'flex';
      const pct = typeof data.percent === 'number' ? ` ${data.percent}%` : '';
      text.textContent = `发现新版本 v${data.version}，正在后台下载${pct}...`;
      installBtn.style.display = 'none';
    } else if (data.status === 'downloaded') {
      bar.style.display = 'flex';
      text.textContent = `新版本 v${data.version} 已下载完成`;
      installBtn.style.display = 'inline-flex';
    } else if (data.status === 'error') {
      // 静默处理检查失败，不打扰用户
      console.warn('自动更新检查失败:', data.message);
    }
  });

  installBtn.addEventListener('click', async () => {
    const installed = await window.electronAPI.installUpdate();
    if (installed) {
      text.textContent = '正在重启安装更新...';
      installBtn.style.display = 'none';
    }
  });
}

initAutoUpdate();

// ===== API 设置（BYOK：key 只保存在本机） =====
function setApiStatus(msg, cls) {
  const el = $('apiStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = 'api-status' + (cls ? ' ' + cls : '');
}

function setOnboardStatus(msg, cls) {
  const el = $('onboardStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = 'onboard-status' + (cls ? ' ' + cls : '');
}

function bindKeyToggle(inputId, btnId) {
  const input = $(inputId);
  const btn = $(btnId);
  if (!input || !btn) return;
  btn.addEventListener('click', () => {
    const revealing = input.type === 'password';
    input.type = revealing ? 'text' : 'password';
    btn.textContent = revealing ? '隐藏' : '显示';
  });
}
bindKeyToggle('apiKeyInput', 'apiKeyToggle');
bindKeyToggle('onboardKeyInput', 'onboardKeyToggle');

function balanceText(balance) {
  if (!balance || !Array.isArray(balance.balance_infos) || !balance.balance_infos.length) return '';
  const b = balance.balance_infos[0];
  return `余额 ${b.total_balance} ${b.currency}`;
}

async function loadApiSettings() {
  try {
    const resp = await apiFetch('/api/settings');
    if (!resp.ok) return;
    const cfg = await resp.json();
    if ($('apiKeyInput')) $('apiKeyInput').value = cfg.apiKey || '';
    if ($('baseUrlInput')) $('baseUrlInput').value = cfg.baseUrl || 'https://api.deepseek.com';
    if ($('modelInput')) $('modelInput').value = cfg.model || 'deepseek-chat';
    if (!cfg.apiKey) showOnboarding();
  } catch (_) {
    // 服务未就绪时静默，用户可在专家页手动配置
  }
}

// 保存并验证：PUT 落盘 → POST 真实连通性验证 + 余额查询
async function saveAndValidate(apiKey, baseUrl, model, onStatus) {
  const status = onStatus || setApiStatus;
  try {
    const resp = await apiFetch('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ apiKey, baseUrl, model }),
    });
    if (!resp.ok) throw new Error('保存失败 (HTTP ' + resp.status + ')');
    const v = await apiFetch('/api/settings/validate', { method: 'POST' });
    const result = await v.json().catch(() => ({}));
    if (v.ok && result.ok) {
      const bal = balanceText(result.balance);
      status(bal ? '验证通过 · ' + bal : '验证通过', 'ok');
      return true;
    }
    status('验证失败：' + (result.error || '未知错误'), 'error');
    return false;
  } catch (e) {
    status('请求失败：' + e.message, 'error');
    return false;
  }
}

const DEEPSEEK_KEYS_URL = 'https://platform.deepseek.com/api_keys';

$('saveApiBtn').addEventListener('click', async () => {
  const apiKey = $('apiKeyInput').value.trim();
  if (!apiKey) {
    setApiStatus('请先粘贴 API Key', 'error');
    return;
  }
  setApiStatus('正在验证...', '');
  const ok = await saveAndValidate(
    apiKey,
    $('baseUrlInput').value.trim(),
    $('modelInput').value.trim()
  );
  if (ok) toast('API 设置已保存', 'success');
});

$('applyGuideBtn').addEventListener('click', async () => {
  if (window.electronAPI && window.electronAPI.openExternal) {
    await window.electronAPI.openExternal(DEEPSEEK_KEYS_URL);
  } else {
    setApiStatus('请在浏览器打开：' + DEEPSEEK_KEYS_URL, '');
  }
});

// ===== 首次启动引导 =====
function showOnboarding() {
  const overlay = $('onboardOverlay');
  if (overlay) overlay.style.display = 'flex';
}

function hideOnboarding() {
  const overlay = $('onboardOverlay');
  if (overlay) overlay.style.display = 'none';
}

$('openPlatformBtn').addEventListener('click', async () => {
  if (window.electronAPI && window.electronAPI.openExternal) {
    await window.electronAPI.openExternal(DEEPSEEK_KEYS_URL);
  } else {
    setOnboardStatus('请在浏览器打开：' + DEEPSEEK_KEYS_URL, '');
  }
});

$('onboardSaveBtn').addEventListener('click', async () => {
  const apiKey = $('onboardKeyInput').value.trim();
  if (!apiKey) {
    setOnboardStatus('请先粘贴 API Key', 'error');
    return;
  }
  setOnboardStatus('正在验证...', '');
  const ok = await saveAndValidate(apiKey, undefined, undefined, setOnboardStatus);
  if (ok) {
    hideOnboarding();
    toast('API Key 已保存，可以开始分析了', 'success');
    loadApiSettings();
  }
});
