export {};

declare global {
  interface Window {
    readonly easymdDesktop?: Readonly<{
      preparePreview: () => boolean;
    }>;
  }
}
