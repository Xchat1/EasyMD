export interface DesktopOpenedFile {
  fileName: string;
  content: string;
  workspacePath?: string;
}

declare global {
  interface Window {
    readonly easymdDesktop?: Readonly<{
      preparePreview: () => boolean;
      openFile: () => Promise<DesktopOpenedFile | null>;
      onOpenFile: (callback: (file: DesktopOpenedFile) => void) => () => void;
    }>;
  }
}
