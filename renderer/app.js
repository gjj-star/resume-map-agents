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
    const resp = await fetch(`${apiBase()}/api/evaluation/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const resp = await fetch(`${apiBase()}/api/evaluation/status/${currentTaskId}`);
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

function renderReport(html) {
  reportHtml = ensureUtf8(html);
  $('exportBtn').disabled = false;
  const wrap = $('reportWrap');
  wrap.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
  iframe.setAttribute('srcdoc', reportHtml);
  wrap.appendChild(iframe);
}

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
    const resp = await fetch(`${apiBase()}/api/health`);
    if (resp.ok) {
      $('hint').textContent = '服务就绪';
      setTimeout(() => ($('hint').textContent = ''), 2000);
    }
  } catch (_) {
    $('hint').textContent = '服务启动中，如无法分析请稍后重试';
  }
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
      text.textContent = `发现新版本 v${data.version}，正在后台下载...`;
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
