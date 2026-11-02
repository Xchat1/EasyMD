export type DocMode = 'md' | 'h5' | 'txt';

export type ViewLayout = 'split' | 'editor' | 'preview';

export type DevicePreview = 'responsive' | 'iphone' | 'ipad' | 'mac';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface FolderItem {
  id: string;
  name: string;
  parentId?: string | null;
  isExpanded?: boolean;
  createdAt: number;
}

export interface DocumentItem {
  id: string;
  title: string;
  content: string;
  mode: DocMode;
  updatedAt: number;
  isModified?: boolean;
  folderId?: string | null;
  fileHandle?: FileSystemFileHandle | null;
  isICloudFile?: boolean;
  path?: string;
  lastSyncedContent?: string;
  storageBackend?: 'desktop';
  storageRoot?: string;
}

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export interface EditorSettings {
  fontSize: number;
  lineNumbers: boolean;
  wordWrap: boolean;
  syncScroll: boolean;
  tabSize: number;
  fontFamily: string;
}

export interface DocStats {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  lines: number;
  readTimeMinutes: number;
}

export interface ICloudDirState {
  handle: FileSystemDirectoryHandle | null;
  name: string;
  isSyncing: boolean;
  lastSyncedAt: number | null;
  filesCount: number;
}

export type SortOption = 'name' | 'date' | 'type';
