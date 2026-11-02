import { DocMode } from '../types';

export const TEMPLATES: Record<DocMode, { title: string; content: string }> = {
  md: {
    title: 'EasyMD 快速指南.md',
    content: `# EasyMD 快速指南

> **EasyMD** 是一款轻量、现代、优雅的在线多模式文档编辑与实时预览工具，全面适配 macOS 设计语言，专为日常办公打造。

---

## 💡 核心特性概览

- 🍎 **macOS 极简体验**：原生毛玻璃质感、交通灯快捷状态、SF 字体与深浅色主题切换。
- 📑 **三合一多模式支持**：
  - **Markdown (MD)**：支持 GFM 语法、LaTeX 数学公式、Mermaid 图表、代码高亮与大纲导航。
  - **H5 网页 (H5)**：编写 HTML/CSS/JS，支持 iPhone / iPad / Mac 等多端设备沙箱预览。
  - **纯文本 (TXT)**：极简打字机模式，字数与行号统计，专注文字处理。
- 💾 **无感自动保存 & Mac 本地文件**：
  - 支持快捷键 \`⌘ + S\` 快速保存、\`⌘ + O\` 读取本地文件。
  - 支持一键导出为 \`.md\`、\`.html\`、\`.txt\` 以及 PDF 打印。
  - 支持**一键复制富文本**（可直接粘贴至飞书、微信公众号、钉钉、邮件）。

---

## 📊 流程图与时序图 (Mermaid 原生支持)

\`\`\`mermaid
flowchart LR
    A[📝 编写文档] --> B{选择模式}
    B -->|Markdown| C[实时排版 & 图表]
    B -->|H5 网页| D[多端真机视口预览]
    B -->|TXT 纯文本| E[专注纯文本统计]
    C --> F[一键复制富文本 / 导出 PDF]
    D --> F
    E --> F
\`\`\`

\`\`\`mermaid
sequenceDiagram
    autonumber
    actor User as 办公用户
    participant EasyMD as EasyMD 工作台
    participant Finder as 本地 Finder / 剪贴板
    User->>EasyMD: 输入或粘贴内容 (⌘+V)
    EasyMD->>EasyMD: 实时编译高亮 & 自动保存
    User->>EasyMD: 快捷键 ⌘+S 导出 / 保存
    EasyMD-->>Finder: 输出干净的 HTML / MD / 纯文本
\`\`\`

---

## 📐 数学公式 (KaTeX)

支持行内公式，例如质能方程：$E = mc^2$，以及欧拉公式：$e^{i\\pi} + 1 = 0$。

同时支持块级独立数学公式排版：

$$
f(x) = \\int_{-\\infty}^{\\infty} \\hat{f}(\\xi)\\,e^{2 \\pi i \\xi x}\\,d\\xi
$$

$$
\\mathbf{X} = \\begin{pmatrix} x_{11} & x_{12} & \\cdots & x_{1n} \\\\ x_{21} & x_{22} & \\cdots & x_{2n} \\\\ \\vdots & \\vdots & \\ddots & \\vdots \\\\ x_{m1} & x_{m2} & \\cdots & x_{mn} \\end{pmatrix}
$$

---

## 💻 代码高亮与快捷复制

\`\`\`typescript
interface DocumentOptions {
  title: string;
  mode: 'md' | 'h5' | 'txt';
  isAutoSaveEnabled: boolean;
}

export function initializeEasyMD(doc: DocumentOptions) {
  console.log(\`✨ EasyMD 启动成功: [\${doc.mode.toUpperCase()}] \${doc.title}\`);
  return { status: 'ready', timestamp: Date.now() };
}
\`\`\`

---

## 📋 办公任务清单 (Task Lists)

- [x] 配置 macOS 原生风格毛玻璃与色彩体系
- [x] 实现 Markdown / H5 / TXT 三合一无缝切换
- [x] 集成 Mermaid 图表与 KaTeX 公式实时渲染
- [x] 提供一键复制排版样式至微信公众号与邮件
- [ ] 开启今日的高效办公之旅！

---

## ⌨️ 常用 Mac 快捷键指南

| 快捷键 | 功能描述 |
| :--- | :--- |
| **⌘ + S** | 保存 / 导出当前文档 |
| **⌘ + O** | 从 Mac 本地打开文件 |
| **⌘ + N** | 新建空白文档 |
| **⌘ + B** | 加粗选中文字 |
| **⌘ + I** | 斜体选中文字 |
| **⌘ + K** | 插入超链接 |
| **⌘ + \\** | 展开 / 折叠侧边栏目录 |
| **⌘ + P** | 导出 / 打印为 PDF |

---
*EasyMD - 让每一次记录都轻盈流畅。*
`,
  },

  h5: {
    title: '移动端原型.html',
    content: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EasyMD H5 实时预览</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
      background: #f0f2f5;
      color: #1d1d1f;
      display: flex;
      justify-content: center;
      padding: 24px 16px;
      min-height: 100vh;
    }
    .card {
      width: 100%;
      max-width: 480px;
      background: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
      border: 1px solid rgba(0, 0, 0, 0.05);
    }
    .header-banner {
      background: linear-gradient(135deg, #0071e3 0%, #42a5f5 100%);
      color: #ffffff;
      padding: 32px 24px;
      position: relative;
    }
    .tag {
      display: inline-block;
      background: rgba(255, 255, 255, 0.25);
      backdrop-filter: blur(8px);
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }
    .title {
      font-size: 22px;
      font-weight: 700;
      line-height: 1.3;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 14px;
      opacity: 0.9;
    }
    .content {
      padding: 24px;
    }
    .feature-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 18px;
      padding-bottom: 18px;
      border-bottom: 1px dashed #e5e5ea;
    }
    .feature-item:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }
    .icon {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: #f2f7ff;
      color: #0071e3;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      margin-right: 14px;
      flex-shrink: 0;
    }
    .feature-text h4 {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .feature-text p {
      font-size: 13px;
      color: #6e6e73;
      line-height: 1.4;
    }
    .cta-button {
      display: block;
      width: 100%;
      background: #0071e3;
      color: #ffffff;
      text-align: center;
      padding: 14px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      text-decoration: none;
      margin-top: 24px;
      transition: opacity 0.2s;
    }
    .cta-button:hover {
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header-banner">
      <span class="tag">办公公告</span>
      <h2 class="title">EasyMD 办公应用更新提示</h2>
      <p class="subtitle">已适配多端设备即时自适应渲染</p>
    </div>
    <div class="content">
      <div class="feature-item">
        <div class="icon">⚡️</div>
        <div class="feature-text">
          <h4>实时极速渲染</h4>
          <p>无需刷新，左侧编辑 HTML / CSS / JS，右侧立即所见即所得。</p>
        </div>
      </div>
      <div class="feature-item">
        <div class="icon">📱</div>
        <div class="feature-text">
          <h4>移动端真实尺寸仿真</h4>
          <p>支持切换 iPhone、iPad 与电脑视口，轻松调整移动端营销与通知卡片。</p>
        </div>
      </div>
      <div class="feature-item">
        <div class="icon">📦</div>
        <div class="feature-text">
          <h4>一键保存与打包</h4>
          <p>随时导出标准的单文件 HTML，直接通过邮件或内网群发送。</p>
        </div>
      </div>

      <a href="javascript:void(0);" onclick="this.innerText='✓ 已确认阅读';" class="cta-button">确认阅读并保存</a>
    </div>
  </div>
</body>
</html>
`,
  },

  txt: {
    title: '工作备忘.txt',
    content: `【EasyMD 纯文本工作记事簿】
创建日期: 2026-10-31
环境: macOS Workstation

--------------------------------------------------------------------------------
【今日核心待办事项 (TODOLIST)】
--------------------------------------------------------------------------------
[x] 1. 梳理下周重点项目里程碑，准备周会同步材料。
[x] 2. 审查线上产品运行状态，确认无异常报警。
[ ] 3. 整理客户沟通需求列表，提炼关键功能要点。
[ ] 4. 下午 15:30 参加跨部门技术方案评审会议。
[ ] 5. 撰写本周工作周报，重点总结改进建议。

--------------------------------------------------------------------------------
【随手速记 / 关键灵感 (SCRATCHPAD)】
--------------------------------------------------------------------------------
* 备忘 1:
  - 调研轻量化编辑器在本地存储与隐私保护方面的优势。
  - 文稿默认保存在本地浏览器；外链资源仍可能联网，请定期导出备份。

* 备忘 2:
  - 常用快捷键记牢：⌘+S 快速落盘，⌘+B 文本标记。
  - 纯文本模式自动计算总字符数、英文字词数与预估阅读时间。

--------------------------------------------------------------------------------
【会议纪要摘要 (MEETING NOTES)】
--------------------------------------------------------------------------------
- 议题：Q4 产品迭代与效率提升
- 参会人：Product Lead, Tech Lead, Operations
- 决定要点：
  1. 优先推进轻量工具链，减少日常复杂审批与配置流程。
  2. 推广统一文档排版模板，规范对外公文与内网邮件格式。
  3. 各模块负责人下周二前提交详细进度评估。

================================================================================
提示：TXT 纯文本模式支持 UTF-8 文本编辑，字符与行数实时精准统计。
================================================================================
`,
  },
};
