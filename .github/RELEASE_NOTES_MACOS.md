EasyMD macOS 安装预览版，分别提供 Apple Silicon（`arm64`）与 Intel（`x64`）的 DMG 和 ZIP。无需另装 Node.js 或 pnpm。

本预览版采用临时签名（ad-hoc），**没有 Developer ID 开发者签名，也没有经过 Apple 公证**，不提供自动更新。首次打开从互联网下载的应用时，macOS 可能阻止运行。请先核对来源和校验值；确认信任后，可在尝试打开应用后，通过“系统设置 → 隐私与安全性 → 仍要打开”授权这个应用。无需全局关闭 Gatekeeper。相关说明见 [Apple 官方指引](https://support.apple.com/en-us/102445)。

安装：选择适合芯片的 DMG，打开后把 EasyMD 拖入“应用程序”；或解压对应 ZIP，将 EasyMD.app 移入“应用程序”。退出旧版本后再替换应用。两种安装包均要求 **macOS 13 或更新版本**，具体构建信息见 `build-info-*.json`，该值取自实际 Electron 45 运行时。

文稿默认保存在“文稿 / EasyMD”，替换应用不会清空该目录。重要文稿仍请自行备份。文稿预览默认阻止外部资源和 HTML 脚本，按文稿确认后才临时允许联网。

下载后可在产物所在目录运行 `shasum -a 256 -c SHA256SUMS` 核对 SHA-256。发布包包含 EasyMD MIT 许可、项目第三方声明，以及 Electron/Chromium 自身许可。

本次验证：100 项本机回归、35 项浏览器回归通过；两种安装包均通过架构、临时签名、许可和安全开关校验。Apple 芯片版在本机启动测试，Intel 版经 Rosetta 启动测试，覆盖自动保存、文件导出、独立预览和渲染进程隔离；不代表已在 Intel 实机上测试。依赖审计为 0 条已知漏洞。
