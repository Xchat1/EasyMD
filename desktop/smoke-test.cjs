'use strict';

// Explicit --smoke-test uses a temporary workspace/profile, never user files.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { BrowserWindow } = require('electron');

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
  await until(() => contents.executeJavaScript(`document.title.includes('Smoke.md') && !!document.querySelector('.cm-content') && document.body.innerText.includes('已自动保存')`), 'initial local document', 90000);
  const runtime = await contents.executeJavaScript(`({ node:typeof require, process:typeof process, bridge:Object.keys(window.easymdDesktop||{}), body:document.body.innerText })`);
  assert.equal(runtime.node, 'undefined');
  assert.equal(runtime.process, 'undefined');
  assert.deepEqual(runtime.bridge, ['preparePreview']);
  assert(!runtime.body.includes('安装到 Mac'));
  assert(runtime.body.includes('外部资源已阻止'));
  assert.equal(await contents.executeJavaScript(`navigator.permissions.query({name:'clipboard-write'}).then(permission=>permission.state)`), 'granted');
  await contents.executeJavaScript(`document.querySelector('.cm-content').focus()`);
  await contents.insertText('Native app save smoke marker.\n');
  await until(async () => (await fs.readFile(path.join(workspace.root, 'Smoke.md'), 'utf8')).includes('Native app save smoke marker.'), 'automatic document save');
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
