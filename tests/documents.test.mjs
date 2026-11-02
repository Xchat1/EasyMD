import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseDocuments, parseFolders, serializeDocuments, removeFolderTree } from '../src/utils/documents.ts';
import { TEMPLATES } from '../src/utils/templates.ts';
import { DirectoryTree } from '../src/components/DirectoryTree.tsx';
import { DialogProvider } from '../src/context/DialogContext.tsx';

test('deleting a folder preserves every descendant document at the root', () => {
  const folders = [
    { id: 'root' }, { id: 'child', parentId: 'root' },
    { id: 'grandchild', parentId: 'child' }, { id: 'unrelated' },
  ];
  const docs = [
    { id: 'a', folderId: 'root', content: 'A' },
    { id: 'b', folderId: 'child', content: 'B' },
    { id: 'c', folderId: 'grandchild', content: 'C' },
    { id: 'd', folderId: 'unrelated', content: 'D' },
  ];
  const result = removeFolderTree(folders, docs, 'root');
  assert.deepEqual(result.folders.map((folder) => folder.id), ['unrelated']);
  assert.deepEqual(result.documents.map((doc) => doc.folderId), [null, null, null, 'unrelated']);
  assert.deepEqual(result.documents.map((doc) => doc.content), ['A', 'B', 'C', 'D']);
});

test('draft persistence keeps cloud metadata but never trusts JSON file handles', () => {
  const doc = { id: 'a', title: 'notes.md', mode: 'md', content: 'unsaved',
    fileHandle: { getFile() {}, createWritable() {} }, isICloudFile: true,
    lastSyncedContent: 'original', path: 'one/notes.md' };
  const raw = serializeDocuments([doc]);
  assert.equal(raw.includes('fileHandle'), false);
  const [restored] = parseDocuments(raw);
  assert.equal(restored.content, 'unsaved');
  assert.equal(restored.lastSyncedContent, 'original');
  assert.equal(restored.fileHandle, null);
  assert.equal(parseDocuments(JSON.stringify([{ ...doc, fileHandle: {} }]))[0].fileHandle, null);
  assert.deepEqual(parseDocuments('[null, {}, {"id":"broken"}]'), []);
});

const renderTree = (props) => renderToStaticMarkup(React.createElement(DialogProvider, null,
  React.createElement(DirectoryTree, props)));

test('cloud root files expose rename and delete controls with the actual parent', () => {
  const html = renderTree({ treeMode: 'icloud', rootHandle: { kind: 'directory' },
    icloudNodes: [{ kind: 'file', name: 'root.md', path: 'root.md', handle: {}, mode: 'md' }],
    onRenameICloudEntry() {}, onDeleteICloudEntry() {},
  });
  assert.match(html, /重命名/);
  assert.match(html, /删除/);
});

test('deep cloud search keeps matching descendants visible', () => {
  const html = renderTree({ treeMode: 'icloud', searchQuery: 'target',
    icloudNodes: [{ kind: 'directory', name: 'one', path: 'one', handle: {}, children: [
      { kind: 'directory', name: 'two', path: 'one/two', handle: {}, children: [
        { kind: 'file', name: 'target.md', path: 'one/two/target.md', handle: {}, mode: 'md' },
      ] },
    ] }],
  });
  assert.match(html, /target\.md/);
});

test('legacy orphaned documents remain accessible in the root tree', () => {
  const html = renderTree({ treeMode: 'local', folders: [],
    documents: [{ id: 'a', title: 'recovered.md', folderId: 'deleted-folder', mode: 'md' }],
  });
  assert.match(html, /recovered\.md/);
});

test('the default guide and only conservatively identified old welcome drafts get their descriptive title', () => {
  assert.equal(TEMPLATES.md.title, 'EasyMD 快速指南.md');
  const guide = { id: 'doc-md-welcome', title: '未命名文档.txt', mode: 'h5', content: '# EasyMD 快速指南\n\n保留我编辑过的正文' };
  const [migrated] = parseDocuments(JSON.stringify([guide]));
  assert.equal(migrated.title, 'EasyMD 快速指南.md');
  assert.equal(migrated.content, guide.content);
  assert.equal(migrated.mode, 'h5', 'a user-selected editor mode is not silently changed');
  for (const overrides of [
    { id: 'my-doc' }, { title: '我的自定义名称.md' }, { content: '# 我的笔记\n用户正文' },
    { isICloudFile: true }, { fileHandle: {} }, { path: 'guide.md' },
    { storageBackend: 'desktop', storageRoot: 'root', path: 'guide.md' },
  ]) {
    const input = { ...guide, ...overrides };
    const [output] = parseDocuments(JSON.stringify([input]));
    assert.equal(output.title, input.title);
    assert.equal(output.content, input.content);
  }
});

test('corrupt metadata and duplicate IDs do not discard or merge recoverable draft content', () => {
  const raw = [
    { id: 'a', title: 'one.md', content: 'original', mode: 'md', isICloudFile: true, path: 'one.md' },
    { id: 'a', title: 'two.md', content: 'separate draft', mode: 'bad', isICloudFile: true,
      storageBackend: 'desktop', storageRoot: 'root', path: 'two.md', lastSyncedContent: 'old' },
    { id: {}, title: 1, content: 'recover this too', mode: 'txt', updatedAt: {}, folderId: {} },
  ];
  const docs = parseDocuments(JSON.stringify(raw));
  assert.equal(new Set(docs.map((doc) => doc.id)).size, 3);
  assert.deepEqual(docs.map((doc) => doc.content), raw.map((doc) => doc.content));
  assert.equal(docs[1].isICloudFile, false);
  assert.equal(docs[1].storageBackend, undefined);
  assert.equal(docs[1].path, undefined);
  assert.equal(docs[2].updatedAt, 0);
  assert.equal(docs[2].folderId, null);
});

test('desktop metadata is preserved only with a valid relative visible path and workspace identity', () => {
  const doc = { id: 'a', title: 'one.md', content: 'draft', mode: 'md', isICloudFile: true,
    storageBackend: 'desktop', storageRoot: 'workspace', path: 'notes/one.md', lastSyncedContent: 'disk' };
  const [valid] = parseDocuments(JSON.stringify([doc]));
  assert.equal(valid.storageBackend, 'desktop');
  assert.equal(valid.storageRoot, 'workspace');
  assert.equal(valid.lastSyncedContent, 'disk');
  for (const path of ['/absolute.md', '../outside.md', 'notes/../outside.md', '.trash/a.md', 'notes/.hidden.md', 'a\\b.md', 'a//b.md']) {
    const [invalid] = parseDocuments(JSON.stringify([{ ...doc, path }]));
    assert.equal(invalid.isICloudFile, false);
    assert.equal(invalid.storageBackend, undefined);
    assert.equal(invalid.content, 'draft');
  }
});

test('folder cycles, missing parents and duplicate IDs are repaired without discarding folders', () => {
  const folders = parseFolders(JSON.stringify([
    { id: 'a', name: 'A', parentId: 'b' }, { id: 'b', name: 'B', parentId: 'a' },
    { id: 'c', name: 'C', parentId: 'c' }, { id: 'd', name: 'D', parentId: 'missing' },
    { id: 'a', name: 'Duplicate' }, null,
  ]));
  assert.equal(folders.length, 5);
  const ids = new Set(folders.map((folder) => folder.id));
  assert.equal(ids.size, 5);
  for (const folder of folders) {
    const visited = new Set();
    let current = folder;
    while (current) {
      assert.equal(visited.has(current.id), false);
      visited.add(current.id);
      assert.ok(!current.parentId || ids.has(current.parentId));
      current = folders.find((item) => item.id === current.parentId);
    }
  }
});

test('pathological nesting is flattened to safe depth while every folder ID remains available', () => {
  const raw = Array.from({ length: 3000 }, (_, i) => ({ id: String(i), name: String(i), parentId: i ? String(i - 1) : null }));
  const folders = parseFolders(JSON.stringify(raw.reverse()));
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  assert.equal(folders.length, 3000);
  for (const folder of folders) {
    let depth = 0;
    for (let current = folder; current; current = byId.get(current.parentId)) depth++;
    assert.ok(depth <= 64);
  }
});
