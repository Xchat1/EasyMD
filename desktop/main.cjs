'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { SECURE_WEB_PREFERENCES, createDesktopSecurityPolicy } = require('./security.cjs');

const smokeTest = process.argv.includes('--smoke-test');
const smokeDirectory = smokeTest ? fs.mkdtempSync(path.join(os.tmpdir(), 'easymd-app-test-')) : null;
app.setName('EasyMD');
const profile = smokeDirectory ? path.join(smokeDirectory, 'profile') : path.join(app.getPath('appData'), 'EasyMD', 'Desktop');
fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
app.setPath('userData', profile);
app.enableSandbox();

let mainWindow, workspace, policy, desktopSession;
let quitting = false, closing = false, previewDeadline = 0;
const previews = new Set();
const appDirectory = app.getAppPath();

function trustedSender(event) {
  return !!mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents
    && event.senderFrame === event.sender.mainFrame
    && policy.isAppNavigation({ url: event.senderFrame.url, isMainFrame: true });
}

function protectWindow(window, main = false) {
  const contents = window.webContents;
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.on('will-navigate', (event, url) => {
    if (!main || !policy.isAppNavigation({ url, isMainFrame: true })) event.preventDefault();
  });
  contents.on('will-redirect', (event, url, _inPlace, isMainFrame) => {
    if (isMainFrame && (!main || !policy.isAppNavigation({ url, isMainFrame: true }))) event.preventDefault();
  });
  contents.setWindowOpenHandler(details => {
    const armed = main && Date.now() < previewDeadline;
    previewDeadline = 0;
    const decision = policy.windowOpenDecision({
      url: details.url, frameName: details.frameName,
      sourceUrl: contents.getURL(), isMainFrame: armed, userGesture: armed,
    });
    // External links only go through the trusted preload's real click handler.
    if (decision.action !== 'allow') return { action: 'deny' };
    return { action: 'allow', overrideBrowserWindowOptions: {
      width: 1100, height: 800, show: !smokeTest, autoHideMenuBar: true,
      webPreferences: { ...SECURE_WEB_PREFERENCES, session: desktopSession,
        preload: path.join(appDirectory, 'desktop/preview-preload.cjs') },
    } };
  });
  contents.on('did-create-window', child => {
    previews.add(child);
    protectWindow(child);
    child.on('closed', () => previews.delete(child));
  });
  contents.on('will-prevent-unload', event => {
    const response = dialog.showMessageBoxSync(window, {
      type: 'warning', title: '文稿还有未保存的修改',
      message: '请先保留草稿或导出备份，再关闭 EasyMD。',
      buttons: ['返回文稿', '仍然关闭'], defaultId: 0, cancelId: 0,
    });
    if (response === 1) event.preventDefault();
  });
}

async function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); return mainWindow; }
  const window = new BrowserWindow({
    title: 'EasyMD', width: 1440, height: 960, minWidth: 900, minHeight: 600,
    show: false, backgroundColor: '#f6f6f7',
    webPreferences: { ...SECURE_WEB_PREFERENCES, session: desktopSession,
      backgroundThrottling: !smokeTest,
      preload: path.join(appDirectory, 'desktop/preload.cjs') },
  });
  mainWindow = window;
  window.webContents.setUserAgent(`${window.webContents.getUserAgent()} EasyMDDesktop/${app.getVersion()}`);
  protectWindow(window, true);
  window.on('closed', () => {
    for (const child of previews) if (!child.isDestroyed()) child.destroy();
    previews.clear(); mainWindow = null;
  });
  await window.loadURL(workspace.origin);
  if (!smokeTest) window.show();
  return window;
}

function configureSession() {
  desktopSession.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => {
    // Electron may serialize this origin with a trailing slash.
    return contents === mainWindow?.webContents
      && policy.isAppNavigation({ url: requestingOrigin, isMainFrame: true })
      && policy.allowPermission({ permission, requestingUrl: details.requestingUrl || requestingOrigin,
        isMainFrame: details.isMainFrame });
  });
  desktopSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(contents === mainWindow?.webContents && policy.allowPermission({ permission,
      requestingUrl: details.requestingUrl, isMainFrame: details.isMainFrame }));
  });
  desktopSession.setDevicePermissionHandler(() => false);
  desktopSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    let cancel = url.origin === workspace.origin && url.pathname === '/sw.js';
    // Renderer scripts and data requests for the application itself stay local;
    // authored H5 is in an opaque child frame and has its own consent/CSP.
    if (details.frame && mainWindow && !mainWindow.isDestroyed()
      && details.frame === mainWindow.webContents.mainFrame
      && ['script', 'xhr'].includes(details.resourceType) && url.origin !== workspace.origin) cancel = true;
    callback({ cancel });
  });
  desktopSession.on('will-download', (event, item, contents) => {
    const url = new URL(item.getURL());
    if (contents !== mainWindow?.webContents || url.protocol !== 'blob:' || url.origin !== workspace.origin) {
      event.preventDefault(); return;
    }
    item.setSaveDialogOptions({ title: '导出文稿', defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) });
  });
}

function installMenu() {
  const command = key => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    void mainWindow.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},metaKey:true,bubbles:true}));`, true);
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'EasyMD', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: '文件', submenu: [
      { label: '新建文稿', accelerator: 'CmdOrCtrl+N', click: () => command('n') },
      { label: '打开文件…', accelerator: 'CmdOrCtrl+O', click: () => command('o') },
      { label: '导出与分享…', accelerator: 'CmdOrCtrl+S', click: () => command('s') },
      { label: '打印…', accelerator: 'CmdOrCtrl+P', click: () => command('p') },
      { type: 'separator' }, { label: '在访达中显示文稿目录', click: () => shell.showItemInFolder(workspace.root) }, { role: 'close' },
    ] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '视图', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] },
  ]));
}

async function start() {
  const { createDesktopServer } = await import(pathToFileURL(path.join(appDirectory, 'scripts/desktop-server.mjs')).href);
  let root = path.join(app.getPath('documents'), 'EasyMD');
  if (smokeDirectory) {
    root = path.join(smokeDirectory, 'Documents');
    await fsp.mkdir(root, { mode: 0o700 });
    await fsp.writeFile(path.join(root, 'Smoke.md'), '# EasyMD desktop smoke test\n\nTemporary sample only.\n');
  }
  // A stable, separate origin retains browser drafts and preferences across
  // launches. EADDRINUSE fails closed: never load another process's webpage.
  workspace = await createDesktopServer({ root, dist: path.join(appDirectory, 'dist'), port: smokeTest ? 0 : 17583 });
  policy = createDesktopSecurityPolicy(workspace.origin);
  desktopSession = session.fromPartition(smokeTest ? 'easymd-smoke' : 'persist:easymd-desktop');
  await desktopSession.clearCache();
  await desktopSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
  configureSession();
  ipcMain.on('easymd:prepare-preview', event => {
    const allowed = trustedSender(event);
    if (allowed) previewDeadline = Date.now() + 1000;
    event.returnValue = allowed;
  });
  ipcMain.on('easymd:open-external', (event, url) => {
    if (!trustedSender(event)) return;
    const destination = policy.externalUrlToOpen({ url, sourceUrl: event.senderFrame.url, isMainFrame: true, userGesture: true });
    if (destination) void shell.openExternal(destination).catch(() => {});
  });
  installMenu();
  const window = await createWindow();
  if (smokeTest) {
    const { runSmokeTest } = require('./smoke-test.cjs');
    await runSmokeTest({ window, workspace, appDirectory, createWindow });
    console.log('EASYMD_SMOKE_TEST_PASSED');
    app.quit();
  }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
  app.on('activate', () => { if (workspace && !quitting) void createWindow(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', event => {
    if (closing) return;
    event.preventDefault(); closing = true;
    void Promise.resolve(workspace?.close()).catch(() => {}).then(async () => {
      if (smokeDirectory) await fsp.rm(smokeDirectory, { recursive: true, force: true }).catch(() => {});
      app.exit(0);
    });
  });
  app.whenReady().then(start).catch(async error => {
    if (smokeTest) { console.error(error); await workspace?.close().catch(() => {}); app.exit(1); return; }
    const message = error.code === 'EADDRINUSE' ? 'EasyMD 的本机端口 17583 已被占用。请关闭重复运行的 EasyMD，或占用此端口的程序后重试。'
      : '无法打开本机文稿目录。请检查“系统设置 → 隐私与安全性 → 文件与文件夹”中的文稿访问权限，以及磁盘空间。';
    dialog.showErrorBox('EasyMD 无法启动', message);
    app.quit();
  });
}
