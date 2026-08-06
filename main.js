const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const net = require('net');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let serverInstance = null;
let serverPort = 3456;
let updatePrompted = false;

// ===== 自动更新 =====
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater() {
  // 仅在打包版（非 --dev / 非开发模式）启用自动更新
  if (process.argv.includes('--dev') || !app.isPackaged) return;

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] 发现新版本:', info.version);
    mainWindow?.webContents.send('update-status', { status: 'downloading', version: info.version });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] 新版本下载完成:', info.version);
    mainWindow?.webContents.send('update-status', { status: 'downloaded', version: info.version });
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] 检查更新失败:', err.message);
    mainWindow?.webContents.send('update-status', { status: 'error', message: err.message });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] 已是最新版本');
    mainWindow?.webContents.send('update-status', { status: 'latest' });
  });

  // 延迟几秒检查，避免影响启动速度
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => console.error('[updater] check failed:', e.message));
  }, 5000);
}

// 渲染进程请求安装更新
ipcMain.handle('install-update', async () => {
  const choice = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: '简历评估专家团',
    message: '新版本已下载完成，是否立即重启安装？',
    detail: '重启后应用将自动更新到最新版本。',
    buttons: ['立即重启', '稍后'],
    defaultId: 0,
    cancelId: 1,
  });
  if (choice.response === 0) {
    setImmediate(() => autoUpdater.quitAndInstall());
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

// 启动 Express 服务（直接在主进程中 require，避免 spawn + asar 路径问题）
function startServer(port) {
  try {
    process.env.PORT = String(port);
    const serverModule = require(path.join(__dirname, 'server', 'index.js'));
    serverInstance = serverModule;
    console.log(`[server] Express 服务已启动: http://127.0.0.1:${port}`);
  } catch (e) {
    console.error('[server] 启动失败:', e.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
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
    serverPort = await findFreePort(3456);
    startServer(serverPort);
    // 给服务一点启动时间
    await new Promise((r) => setTimeout(r, 600));
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
