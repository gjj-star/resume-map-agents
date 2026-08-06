const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const net = require('net');

let mainWindow = null;
let serverInstance = null;
let serverPort = 3456;

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC: 获取服务端口
ipcMain.handle('get-server-port', () => serverPort);
