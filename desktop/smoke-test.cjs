'use strict';

// Explicit --smoke-test uses a temporary workspace/profile, never user files.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { app, BrowserWindow, dialog } = require('electron');

async function until(operation, description, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await operation()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${description}`);
}

exports.runSmokeTest = async ({ window, workspace, appDirectory }) => {
  const contents = window.webContents;
  const coldOpen = process.argv.includes('--smoke-expect-open');
  const initialFile = coldOpen ? 'Finder冷启动.md' : 'Smoke.md';
  await until(() => contents.executeJavaScript(`document.title.includes(${JSON.stringify(initialFile)}) && !!document.querySelector('.cm-content') && document.body.innerText.includes('已自动保存')`), 'initial local document or queued Finder request', 90000);
  const runtime = await contents.executeJavaScript(`({ node:typeof require, process:typeof process, bridge:Object.keys(window.easymdDesktop||{}), body:document.body.innerText })`);
  assert.equal(runtime.node, 'undefined');
  assert.equal(runtime.process, 'undefined');
  assert.deepEqual(runtime.bridge, ['preparePreview', 'openFile', 'onOpenFile']);
  assert(!runtime.body.includes('安装到 Mac'));
  assert(runtime.body.includes('外部资源已阻止'));
  assert.equal(await contents.executeJavaScript(`navigator.permissions.query({name:'clipboard-write'}).then(permission=>permission.state)`), 'granted');
  await contents.executeJavaScript(`document.querySelector('.cm-content').focus()`);
  await contents.insertText('Native app save smoke marker.\n');
  await until(async () => (await fs.readFile(path.join(workspace.root, initialFile), 'utf8')).includes('Native app save smoke marker.'), 'automatic document save');

  const externalDirectory = path.join(path.dirname(workspace.root), 'External test files');
  await fs.mkdir(externalDirectory, { recursive: true });
  const finderFile = path.join(externalDirectory, '访达已存在的文稿.md');
  const original = '# Existing Markdown\n\n中文路径和已有文件。\n';
  await fs.writeFile(finderFile, original);
  app.emit('open-file', { preventDefault() {} }, finderFile);
  await until(() => contents.executeJavaScript(`document.title.includes('访达已存在的文稿.md') && document.querySelector('.cm-content')?.innerText.includes('中文路径和已有文件')`), 'Finder opens an existing Markdown file');
  await contents.executeJavaScript(`document.querySelector('.cm-content').focus()`);
  await contents.insertText('Edited imported copy.\n');
  await until(async () => (await fs.readFile(path.join(workspace.root, '访达已存在的文稿.md'), 'utf8')).includes('Edited imported copy.'), 'imported copy autosave');
  assert.equal(await fs.readFile(finderFile, 'utf8'), original, 'Opening an external file must preserve its source');
  const pickerFile = path.join(externalDirectory, '选择器已有文稿.md');
  await fs.writeFile(pickerFile, '# Native picker selection\n');
  const originalPicker = dialog.showOpenDialog;
  try {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    assert.equal(await contents.executeJavaScript('window.easymdDesktop.openFile()', true), null);
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [pickerFile] });
    const selected = await contents.executeJavaScript(`window.easymdDesktop.openFile('/arbitrary/unselected.md')`, true);
    assert.equal(selected.fileName, '选择器已有文稿.md');
    assert.equal(selected.content, '# Native picker selection\n');
    assert.equal(Object.hasOwn(selected, 'path'), false);
    await contents.executeJavaScript(`document.querySelector('button[title*="⌘+O"]').click()`, true);
    await until(() => contents.executeJavaScript(`document.title.includes('选择器已有文稿.md')`), 'application open button imports native selection');
  } finally { dialog.showOpenDialog = originalPicker; }
  const countBeforeReopen = (await fs.readdir(workspace.root)).length;
  app.emit('open-file', { preventDefault() {} }, path.join(workspace.root, '访达已存在的文稿.md'));
  await until(() => contents.executeJavaScript(`document.title.includes('访达已存在的文稿.md') && document.querySelector('.cm-content')?.innerText.includes('Edited imported copy.')`), 'workspace file reopen');
  assert.equal((await fs.readdir(workspace.root)).length, countBeforeReopen, 'A managed document must not be imported a second time');
  const batchNames = ['顺序打开一.md', '顺序打开二.md'];
  for (const name of batchNames) {
    await fs.writeFile(path.join(externalDirectory, name), `# ${name}\n`);
    app.emit('open-file', { preventDefault() {} }, path.join(externalDirectory, name));
  }
  await until(() => contents.executeJavaScript(`document.title.includes('顺序打开二.md')`), 'multiple Finder requests are imported in order');
  for (const name of batchNames) {
    assert.equal(await fs.readFile(path.join(workspace.root, name), 'utf8'), `# ${name}\n`);
    assert.equal(await fs.readFile(path.join(externalDirectory, name), 'utf8'), `# ${name}\n`);
  }
  await contents.executeJavaScript(`(() => {
    if (!window.easymdDesktop.preparePreview()) throw new Error('Preview was not armed');
    const child = window.open('', '_blank');
    if (!child) throw new Error('Preview was blocked');
    child.document.body.textContent = 'Isolated native preview'; child.opener = null;
  })()`, true);
  await until(() => BrowserWindow.getAllWindows().length === 2, 'independent preview');
  const child = BrowserWindow.getAllWindows().find(candidate => candidate !== window);
  const preferences = child.webContents.getLastWebPreferences();
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.sandbox, true);
  assert.equal(await child.webContents.executeJavaScript('typeof window.easymdDesktop'), 'undefined');
  child.destroy();
  const exportFile = path.join(workspace.root, 'native-export.txt');
  const download = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Blob export timed out')), 15000);
    contents.session.once('will-download', (_event, item) => {
      item.setSavePath(exportFile);
      item.once('done', (_done, state) => { clearTimeout(timeout); state === 'completed' ? resolve() : reject(new Error(`Export ${state}`)); });
    });
  });
  await contents.executeJavaScript(`(() => { const url=URL.createObjectURL(new Blob(['Native export smoke marker.'],{type:'text/plain'})); const a=document.createElement('a');a.href=url;a.download='native-export.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); })()`, true);
  await download;
  assert.equal(await fs.readFile(exportFile, 'utf8'), 'Native export smoke marker.');
  assert.equal(await fs.readFile(path.join(appDirectory, 'LICENSE'), 'utf8'), await fs.readFile(path.join(appDirectory, 'dist/LICENSE.txt'), 'utf8'));
  await until(() => contents.executeJavaScript(`document.body.innerText.includes('已自动保存')`), 'completed save');
};
