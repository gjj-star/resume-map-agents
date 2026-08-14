const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const net = require('net');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');

let mainWindow = null;
let serverPort = 3456;
// 每次启动随机生成的本机服务鉴权 token，渲染进程经 IPC 获取
let authToken = null;

// ===== 自动更新（自建通道）=====
// 为什么不用 electron-updater 库：它的 GitHub provider 下载走 github.com 主域，
// 本机网络主域稳定超时（api.github.com 与 objects.githubusercontent.com 正常）。
// 自实现：查询 latest release + 下载 asset 全部走 api.github.com（asset API 会 302 到可用 CDN）。
const UPDATE_OWNER = 'gjj-star';
const UPDATE_REPO = 'resume-map-agents';
let downloadedInstaller = null;

// TLS 策略：默认严格校验（更新通道真实性由系统 CA 体系保证，sha512 负责下载完整性）。
// 仅本机开发/测试网络被中间代理拦截 TLS 时（见 AGENTS.md 环境坑 3），
// 可临时设 RESUME_UPDATER_INSECURE_TLS=1 关闭校验——此开关默认关闭，绝不随应用默认打开。
const UPDATER_INSECURE_TLS = process.env.RESUME_UPDATER_INSECURE_TLS === '1';

function httpsGet(u, accept = 'application/vnd.github+json', redirects = 0) {
  return new Promise((resolve, reject) => {
    const url = new URL(u);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      rejectUnauthorized: !UPDATER_INSECURE_TLS,
      headers: { 'User-Agent': 'resume-expert-team-updater', Accept: accept },
      timeout: 30000,
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
        res.resume();
        resolve(httpsGet(res.headers.location, accept, redirects + 1));
      } else {
        resolve(res);
      }
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.end();
  });
}

function readBody(res) {
  return new Promise((resolve, reject) => {
    let d = '';
    res.on('data', (c) => (d += c));
    res.on('end', () => resolve(d));
    res.on('error', reject);
  });
}

function isNewer(latest, current) {
  const a = String(latest).replace(/^v/, '').split('.').map(Number);
  const b = String(current).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

function downloadAsset(assetId, destPath, onProgress) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await httpsGet(
        `https://api.github.com/repos/${UPDATE_OWNER}/${UPDATE_REPO}/releases/assets/${assetId}`,
        'application/octet-stream'
      );
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('下载失败: HTTP ' + res.statusCode));
        return;
      }
      const total = Number(res.headers['content-length'] || 0);
      let done = 0;
      const file = fs.createWriteStream(destPath);
      res.on('data', (c) => {
        done += c.length;
        if (total > 0 && onProgress) onProgress(done, total);
      });
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
      res.on('error', reject);
    } catch (e) {
      reject(e);
    }
  });
}

async function checkAndDownloadUpdate() {
  const send = (data) => mainWindow?.webContents.send('update-status', data);

  const res = await httpsGet(`https://api.github.com/repos/${UPDATE_OWNER}/${UPDATE_REPO}/releases/latest`);
  if (res.statusCode !== 200) {
    res.resume();
    throw new Error('查询更新失败: HTTP ' + res.statusCode);
  }
  const release = JSON.parse(await readBody(res));
  const latestVer = String(release.tag_name || '').replace(/^v/, '');
  if (!latestVer || !isNewer(latestVer, app.getVersion())) {
    send({ status: 'latest' });
    return;
  }

  send({ status: 'downloading', version: latestVer, percent: 0 });

  const assets = release.assets || [];
  const exeAsset = assets.find((a) => /setup\.exe$/i.test(a.name));
  const ymlAsset = assets.find((a) => a.name === 'latest.yml');
  if (!exeAsset) throw new Error('release 中未找到安装包');

  // 从 latest.yml 取 sha512 用于完整性校验
  let expectedSha512 = null;
  if (ymlAsset) {
    const yr = await httpsGet(
      `https://api.github.com/repos/${UPDATE_OWNER}/${UPDATE_REPO}/releases/assets/${ymlAsset.id}`,
      'application/octet-stream'
    );
    const yml = await readBody(yr);
    const m = yml.match(/^sha512:\s*(.+)$/m);
    if (m) expectedSha512 = m[1].trim();
  }

  const dest = path.join(app.getPath('temp'), `resume-expert-team-${latestVer}-setup.exe`);
  await downloadAsset(exeAsset.id, dest, (done, total) => {
    send({ status: 'downloading', version: latestVer, percent: Math.round((done / total) * 100) });
  });

  if (expectedSha512) {
    const actual = crypto.createHash('sha512').update(fs.readFileSync(dest)).digest('base64');
    if (actual !== expectedSha512) {
      try { fs.unlinkSync(dest); } catch (_) {}
      throw new Error('安装包完整性校验失败（sha512 不匹配）');
    }
  }

  downloadedInstaller = dest;
  send({ status: 'downloaded', version: latestVer });
}

function setupAutoUpdater() {
  // 仅在打包版（非 --dev / 非开发模式）启用自动更新
  if (process.argv.includes('--dev') || !app.isPackaged) return;

  // 延迟几秒检查，避免影响启动速度
  setTimeout(() => {
    checkAndDownloadUpdate().catch((e) => {
      console.error('[updater] 检查更新失败:', e.message);
      mainWindow?.webContents.send('update-status', { status: 'error', message: e.message });
    });
  }, 5000);
}

// 渲染进程请求安装更新
ipcMain.handle('install-update', async () => {
  if (!downloadedInstaller || !fs.existsSync(downloadedInstaller)) return false;
  const choice = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: '简历评估专家团',
    message: '新版本已下载完成，是否立即重启安装？',
    detail: '应用将退出并启动安装向导，按提示完成安装即可。',
    buttons: ['立即安装', '稍后'],
    defaultId: 0,
    cancelId: 1,
  });
  if (choice.response === 0) {
    const child = spawn(downloadedInstaller, [], { detached: true, stdio: 'ignore' });
    child.unref();
    setTimeout(() => app.quit(), 1500);
    return true;
  }
  return false;
});

// 查找可用端口
function findFreePort(start = 3456) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(start, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      findFreePort(start + 1).then(resolve);
    });
  });
}

// 启动 Express 服务（直接在主进程中 require，避免 spawn + asar 路径问题）。
// 返回 Promise：等 server 真正进入 listening 状态才放行，取代"sleep 600ms"式的时间猜测。
function startServer(port) {
  return new Promise((resolve) => {
    try {
      process.env.PORT = String(port);
      const { server } = require(path.join(__dirname, 'server', 'index.js'));
      if (server.listening) return resolve();
      server.once('listening', () => {
        console.log(`[server] Express 服务已启动: http://127.0.0.1:${port}`);
        resolve();
      });
      server.once('error', (e) => {
        console.error('[server] 启动失败:', e.message);
        resolve();
      });
    } catch (e) {
      console.error('[server] 启动失败:', e.message);
      resolve();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#0a0e1a',
    title: '简历评估专家团',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 通过 query param 把端口传给渲染进程
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'), {
    query: { port: String(serverPort) },
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    // 随机会话 token：只允许本应用渲染进程调用本地 API，浏览器里的任意网页无法白嫖
    authToken = crypto.randomBytes(24).toString('hex');
    process.env.APP_AUTH_TOKEN = authToken;
    // 用户 API 设置（settings.json）落盘位置：打包版 = userData，开发直跑 = 项目根
    process.env.RESUME_USER_DATA = app.getPath('userData');
    serverPort = await findFreePort(3456);
    await startServer(serverPort);
  } catch (e) {
    console.error('启动服务失败:', e);
  }
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC: 获取服务端口
ipcMain.handle('get-server-port', () => serverPort);

// IPC: 获取本机服务鉴权 token
ipcMain.handle('get-auth-token', () => authToken);

// IPC: 打开外部链接（仅允许 https，用于引导申请 API Key / 查看文档）
ipcMain.handle('open-external', async (_event, url) => {
  if (typeof url !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  try {
    await shell.openExternal(url);
    return true;
  } catch (_) {
    return false;
  }
});
