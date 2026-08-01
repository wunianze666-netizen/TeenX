# Todo Demo Rubric-to-Source Evidence Matrix

Every positive subcriterion below passed real quote relocation and canonical line extraction.

| Dimension | Subcriterion | Score | Verification | Canonical evidence |
|---|---|---:|---|---|
| 需求符合度 | 新增编辑完成删除 | 80/80 | source_verified (high) | app.js:L107-L107 `function addTask(text) {`<br>app.js:L125-L125 `function beginEdit(row, task) {`<br>app.js:L186-L186 `  else if (event.target.matches(".delete")) removeTasks((item) => item.id === task.id, "Ta` |
| 需求符合度 | 筛选与统计 | 55/55 | source_verified (high) | app.js:L70-L70 `function visibleTasks() {`<br>index.html:L43-L43 `            <button type="button" data-filter="completed" aria-pressed="false">Done <span ` |
| 需求符合度 | 刷新持久化 | 55/65 | static_inference (medium) | app.js:L42-L42 `    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) \|\| "null");`<br>app.js:L54-L54 `    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks: state.tasks, filter: state.f` |
| 规则遵循 | 原生单页实现 | 50/50 | source_verified (high) | index.html:L10-L10 `    <script src="app.js" defer></script>`<br>README.md:L3-L3 `A dependency-free, single-page Todo application built with native HTML, CSS, and JavaScrip` |
| 规则遵循 | 本地存储且无后端 | 50/50 | source_verified (high) | app.js:L3-L3 `const STORAGE_KEY = "remember-todo:v1";`<br>README.md:L7-L7 `Open `index.html` directly in a modern browser. No install, build step, remote API, or ser` |
| 规则遵循 | 空态错误与手机布局 | 45/50 | static_inference (medium) | index.html:L55-L55 `        <section id="empty-state" class="empty-state" aria-live="polite">`<br>app.js:L58-L58 `    showNotice("Tasks are kept for this visit, but browser storage is unavailable.", false`<br>styles.css:L96-L96 `@media (max-width: 640px) {` |
| 代码/实现质量 | 状态与渲染架构 | 36/40 | static_inference (medium) | app.js:L28-L28 `const state = loadState();`<br>app.js:L76-L76 `function render() {` |
| 代码/实现质量 | 验证与故障恢复 | 34/40 | static_inference (medium) | app.js:L30-L30 `function isTodo(value) {`<br>app.js:L200-L200 `if (!state.storageHealthy) showNotice("Stored data could not be read. Starting with a safe` |
| 代码/实现质量 | 可维护性 | 30/35 | source_verified (medium) | app.js:L52-L52 `function persist() {`<br>app.js:L115-L115 `function removeTasks(predicate, message) {` |
| 代码/实现质量 | 测试安全性能资源 | 25/35 | static_inference (low) | app.js:L86-L86 `    row.querySelector(".todo-text").textContent = task.text;`<br>index.html:L10-L10 `    <script src="app.js" defer></script>`<br>styles.css:L108-L108 `@media (prefers-reduced-motion: reduce) {` |
| 创新性 | 可撤销安全操作 | 50/60 | static_inference (medium) | app.js:L118-L118 `  lastRemoval = state.tasks.map((task) => ({ ...task }));`<br>app.js:L122-L122 `  showNotice(message, true, 6000);` |
| 创新性 | 渐进式完成反馈 | 42/50 | static_inference (medium) | app.js:L94-L94 `  const progress = state.tasks.length === 0 ? 0 : Math.round((completedCount / state.tasks`<br>index.html:L22-L22 `            <strong id="progress-value">0%</strong>` |
| 创新性 | 克制且连贯的产品取舍 | 33/40 | source_verified (medium) | DESIGN.md:L11-L11 `Remember Todo is a quiet daily desk: warm paper, crisp ink, and one restrained amber accen`<br>DESIGN.md:L11-L11 `Remember Todo is a quiet daily desk: warm paper, crisp ink, and one restrained amber accen` |
| 趣味性/体验感 | 核心流程与反馈 | 35/40 | static_inference (medium) | app.js:L154-L154 `elements.form.addEventListener("submit", (event) => {`<br>app.js:L184-L184 `    showNotice(task.completed ? "Task completed." : "Task reopened.");` |
| 趣味性/体验感 | 键盘与辅助技术 | 27/30 | static_inference (medium) | index.html:L66-L66 `    <aside id="notice" class="notice" aria-live="polite" aria-atomic="true" hidden>`<br>app.js:L149-L149 `    if (event.key === "Escape") finish(false);` |
| 趣味性/体验感 | 空态错误与恢复体验 | 26/30 | static_inference (medium) | app.js:L103-L103 `  elements.emptyCopy.textContent = state.tasks.length === 0 ? "Add one clear next step abo`<br>app.js:L196-L196 `  showNotice("Deletion undone.");` |
| 视觉/审美 | 层级与设计系统 | 34/40 | static_inference (medium) | styles.css:L3-L3 `  --canvas: #f5f1e8;`<br>styles.css:L43-L43 `h1 { max-width: 600px; margin-bottom: var(--space-3); font: 500 clamp(2.25rem, 7vw, 3.25re` |
| 视觉/审美 | 响应式布局 | 30/35 | static_inference (medium) | styles.css:L100-L100 `  .composer { grid-template-columns: 1fr; }`<br>styles.css:L104-L104 `  .todo-item { grid-template-columns: auto minmax(0, 1fr); }` |
| 视觉/审美 | 动效与细节 | 20/25 | static_inference (medium) | styles.css:L95-L95 `@keyframes enter { from { opacity: 0; transform: translateY(4px); } }`<br>styles.css:L109-L109 `  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !i` |
| 问题解决能力 | 最小可靠状态模型 | 36/40 | static_inference (medium) | app.js:L108-L108 `  state.tasks.unshift({ id: crypto.randomUUID(), text, completed: false, createdAt: Date.n`<br>app.js:L54-L54 `    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks: state.tasks, filter: state.f` |
| 问题解决能力 | 技术取舍合理 | 27/30 | source_verified (medium) | README.md:L7-L7 `Open `index.html` directly in a modern browser. No install, build step, remote API, or ser`<br>DESIGN.md:L7-L7 `- Imagen drafts: skipped because the challenge requires a dependency-free native app and n` |
| 问题解决能力 | 复杂边界处理 | 27/30 | static_inference (medium) | app.js:L44-L44 `    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks.filter(isTodo).map((task) => `<br>app.js:L159-L159 `  elements.inputError.textContent = valid ? "" : "Write a task before adding it.";` |
| 完成度与细节 | 功能与边界收尾 | 18/20 | static_inference (medium) | README.md:L11-L11 `- Add, edit, complete, delete, and filter tasks.`<br>README.md:L15-L15 `- Show empty, validation, storage-error, and save-feedback states.` |
| 完成度与细节 | 文档与验收说明 | 14/15 | source_verified (high) | README.md:L18-L18 `## Error boundary`<br>README.md:L22-L22 `## Manual acceptance path` |
| 完成度与细节 | 零依赖可交付 | 15/15 | source_verified (high) | README.md:L7-L7 `Open `index.html` directly in a modern browser. No install, build step, remote API, or ser`<br>index.html:L9-L9 `    <link rel="stylesheet" href="styles.css">` |

Static-inference-limited dimensions: persistence behavior, implementation reliability, innovation usefulness, lived UX/accessibility, rendered visual quality, responsive behavior, performance, and end-to-end completion.
