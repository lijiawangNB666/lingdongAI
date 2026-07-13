# 灵动AI桌面助手 — P0 BUG 根因诊断与修复方案

> 架构师：高见远（Gao）  
> 日期：2025-07-12  
> 版本：v1.0

---

## A. P0 BUG 根因诊断

### P0-01：AI工具调用链路断裂（createSimplePlan 生成空工具→Phase2跳过→Phase3仅文本回复）

**根因**：`planner.js` 第236-287行，`createSimplePlan()` 函数存在**变量计算但不使用**的缺陷。

函数在 L238-L265 中根据关键词匹配计算了 `stepTool`、`stepArgs`、`stepDesc` 三个变量，但在 L267-286 的返回值中**完全忽略**了这些变量，硬编码返回 `tool: ''` 的空工具步骤。这意味着：
- Phase 2（执行阶段）检测到 `hasToolSteps = false`，直接跳过工具执行
- Phase 3 的内联工具迭代路径（main.js L3184-3251）理论上可以补救，但 `createSimplePlan` 返回的 `_fallback: true` 标记使得最终结果不包含 plan 信息

**现象**：用户发出需要工具操作的请求（如"帮我创建一个文件"），AI 仅回复文字，不调用任何工具。

**影响范围**：所有走 Planner 模式的工具调用请求（shouldUsePlanner 返回 true 的场景）

---

### P0-02：文件增/删/改/读功能全部失效

**根因**：**IPC 命名不匹配**。

- preload.js 中暴露的 IPC 名称使用**连字符**格式：`read-file`、`write-file`、`delete-file`、`create-folder`
- main.js 中的 IPC handler 注册也使用**连字符**格式：`ipcMain.handle('read-file', ...)`

但 renderer.js 中调用的是：`window.electronAPI.readFile(filePath)` → preload.js `ipcRenderer.invoke('read-file', filePath)`

**实际调用链是通的**。真正的问题是：`executeTool()` 函数中的工具名与 IPC 通道名不同。

在 main.js `executeTool()` 函数中（L2127-2791），工具名为 `file_read`、`file_write`、`file_delete` 等（下划线），这是 Function Calling 调用时 AI 返回的工具名。这些走的是 `executeTool()` 内部逻辑，不经过 IPC。

**验证发现**：`executeTool()` 中的 `file_read`、`file_write`、`file_delete` 逻辑是**完整的**，理论上应能工作。但存在以下问题：
1. `file_write`（L2184-2201）使用 `path.dirname(args.path)`，如果 `args.path` 为 undefined 则报错
2. `file_delete`（L2212-2243）需要用户确认（`confirmDangerousInline`），但 `confirmDangerousInline` 可能因 P0-11 的 IPC 注册问题而不工作

**根因更新**：文件操作本身逻辑正确，但被上游 P0-01（工具调用链路断裂）和 P0-11（IPC注册中断）所阻塞。AI 根本无法到达 `executeTool()` 调用。

---

### P0-03：系统命令执行失效

**根因**：与 P0-02 相同——上游链路断裂导致 AI 无法调用 `execute_command` 工具。

`executeTool()` 中 `execute_command` 分支（L2248-2287）逻辑完整，包括安全审计、确认对话框、UTF-8 编码包装等。但 P0-01 导致 AI 的工具调用请求在 createSimplePlan 阶段就被丢弃了。

---

### P0-04：截图功能失效

**根因**：与 P0-02/P0-03 相同——上游链路断裂。

`take_screenshot` 在 `executeTool()`（L2292-2299）和 IPC handler `take-screenshot`（L1475-1484）中实现完整。但 AI 无法调用到。

**注意**：IPC handler 版本（`take-screenshot`）有独立的 PowerShell 截图命令，如果前端直接调用 `window.electronAPI.takeScreenshot()` 应该可以工作，但 Function Calling 路径受 P0-01 阻塞。

---

### P0-05：打开软件功能失效

**根因**：与 P0-02/P0-03/P0-04 相同——上游链路断裂。

`open_software` 在 `executeTool()`（L2288-2291）中使用 `exec('start "" "' + args.path + '"', { shell: 'cmd.exe' })`，逻辑正确。

---

### P0-06：历史会话重复（_currentSessionId vs currentSessionId 变量不一致）

**根因**：renderer.js 中存在**两套会话管理变量**，虽已做部分同步，但存在遗漏。

- `currentSessionId`（L3193）：在 SESSION MANAGEMENT 区块定义，被 `saveCurrentSession()`（L3296）和 `createNewSession()`（L3243）使用
- `_currentSessionId`（L3357）：在"会话历史管理"区块定义，被 `loadSession()`（L3472）和 `autoSaveCurrentSession()`（L3521）使用

问题出在：
1. `loadSession()` 有两个版本：
   - L3259 的 `window.loadSession`（使用 `currentSessionId`）
   - L3463 的 `window.loadSession`（使用 `_currentSessionId`，**覆盖了前者**）
2. 后者覆盖了前者，但 `saveCurrentSession()` 读取的是 `currentSessionId`
3. 如果通过 L3463 版本加载会话，`_currentSessionId` 被更新但 `currentSessionId` 的同步可能在异步操作中丢失

**现象**：用户加载历史会话后，新消息可能保存到错误的会话中，或创建重复的新会话。

---

### P0-07：待办事项创建重复（竞态条件）

**根因**：pet-manager.js 中存在**三条独立的待办创建路径**，去重窗口不够长：

1. **pet-todo-add IPC**（L1677-1685）：直接添加，无去重
2. **pet-create-todo IPC**（L1687-1725）：10秒窗口去重
3. **create_todo 工具**（L845-866）：10秒窗口去重

竞态场景：
- 用户说"帮我创建一个待办：XX"
- AI 通过 Function Calling 调用 `create_todo`（路径3）
- 同时 pet-window.html 前端也通过 `pet-create-todo` IPC 创建（路径2）
- 两者几乎同时执行，10秒窗口内的去重检查可能还没看到对方创建的记录

**现象**：同一待办被创建两次。

---

### P0-08：桌面宠物Agent不持久化

**根因**：pet-window.html 中 Agent 选择确实保存到了 settings（L1408-1411）：
```javascript
settings.pet.currentAgentId = agentId;
ipcRenderer.invoke('pet-settings-save', settings)
```

恢复逻辑（L909-925）也用 `_tryRestoreAgent()` 带重试机制。

但问题出在 `pet-manager.js` 的 `saveSettings()` 方法。查看 pet-manager.js L192-200 的 `loadSettings()`：
```javascript
loadSettings() {
  try {
    if (fs.existsSync(getPetSettingsPath())) {
      var loaded = { ...this.defaultSettings, ...JSON.parse(fs.readFileSync(getPetSettingsPath(), 'utf-8')) };
```

`defaultSettings`（L153-176）中 `pet` 对象只有 `themeColor` 和 `voiceEnabled`，**没有 `currentAgentId`**。当使用 `{ ...this.defaultSettings, ...loaded }` 合并时，如果保存的 settings 中 `pet` 对象只有部分字段，浅拷贝会导致 `pet` 对象被 `defaultSettings.pet` 覆盖，丢失 `currentAgentId`。

**关键**：前端保存时 `settings.pet.currentAgentId = agentId`，如果 `settings.pet` 原本没有这个字段，它会被添加。但重新加载时，`{ ...this.defaultSettings, ...loaded }` 是浅合并，`loaded.pet` 会完整覆盖 `defaultSettings.pet`，所以理论上 `currentAgentId` 应该保留。

**真正问题**：pet-window.html L1408 中 `ipcRenderer.invoke('pet-settings-load')` 返回的是 `this.settings` 对象引用，但 `pet-settings-save` handler（L1942-1960）中：
```javascript
this.settings.backend = config.backend;
this.settings.model = config.model;
this.settings.pet = config.pet;
```
**这只更新了 backend、model、pet 三个字段**。如果前端传的 settings 对象中 `pet` 缺少 `currentAgentId`（比如加载时 pet 对象没有该字段），就会丢失。

**实际流程**：`pet-settings-load` 返回 settings → 前端给 `settings.pet.currentAgentId = agentId` 赋值 → 调用 `pet-settings-save` → handler 中 `this.settings.pet = config.pet` → 但 `this.saveSettings(this.settings)` 最终写入磁盘。**如果 pet-settings-save 传入的 config.pet 包含 currentAgentId，应该是正确的**。

需要进一步验证：pet-window.html L1410 中 `settings.pet.currentAgentId = agentId` 直接修改了 `settings` 对象，然后 `pet-settings-save` 的 handler 用 `this.settings.pet = config.pet`。这里 `config.pet` 就是传入的 settings 对象的 pet 属性，应该包含 currentAgentId。

**实际可能的BUG**：如果 `pet-settings-load` 返回的 settings 中 pet 对象被 defaultSettings 覆盖过，currentAgentId 就不在了。pet-manager.js 的 `loadSettings` 用 `{ ...this.defaultSettings, ...loaded }` 做**浅合并**，如果 loaded 中的 `pet` 字段存在且是完整对象，则正确。但如果文件不存在或为空，返回的是 `this.defaultSettings`，其 `pet` 不包含 `currentAgentId`。

**结论**：**首次保存 currentAgentId 是成功的**。但后续如果 settings.json 文件因某种原因被重写（如保存其他设置时），且 `pet-settings-save` handler 中 `config.pet` 未包含 currentAgentId，则会丢失。

---

### P0-09：AI输出伪代码而非调用工具

**根因**：系统提示词中的"铁律"在**某些模型**上不生效。

renderer.js L1091-1101 会为所有 Agent 追加核心规则：
```javascript
var coreRules = '\n\n## 🔴 工具使用铁律（必须遵守）\n' + ...
```

但问题出在：
1. 应用了**emoji字符**（🔴）和**中文特殊符号**（❌、✅），某些模型（尤其是开源模型）对这些字符的注意力权重较低
2. 铁律追加在 systemPrompt 末尾，位置靠后，某些模型对长 system prompt 的尾部注意力较低
3. `shouldUsePlanner()` 的判断逻辑（L3553-3575）会让很多请求走 Planner 模式，而 Planner 模式中的 createSimplePlan（P0-01）生成的空工具步骤导致 Phase 3 的内联工具迭代也走不通，最终 AI 只能输出文本

**与 P0-01 的关联**：P0-01 是 P0-09 的直接原因。如果工具调用链路正常，AI 就不需要输出伪代码。

---

### P0-10：应用启动失败（pet-manager.js 顶层调用 app.getPath()）

**根因**：pet-manager.js 的模块顶层代码。

查看 pet-manager.js L1-27，模块顶层定义了：
```javascript
let _dataDir = null;
function getDataDir() {
  if (!_dataDir) {
    _dataDir = path.join(app.getPath('userData'), 'data');
```

`getDataDir()` 是惰性初始化的，不会在模块加载时调用。但 L24-27 定义了：
```javascript
function getPetConfigPath() { return path.join(getDataDir(), 'pet-position.json'); }
function getPetSettingsPath() { return path.join(getDataDir(), 'pet-settings.json'); }
function getPetTodoPath() { return path.join(getDataDir(), 'pet-todo.json'); }
function getTodoDataPath() { return path.join(getDataDir(), 'todo-data.json'); }
```

这些也是惰性的，只在调用时执行。

**但是**，PetManager 的构造函数（L29-63）中：
```javascript
constructor() {
  ...
  this.todoData = this.loadTodoData();  // L45
  this.settings = this.loadSettings();  // L46
```

`loadSettings()`（L192-200）调用了 `getPetSettingsPath()`，后者调用 `getDataDir()`，后者调用 `app.getPath('userData')`。

**关键**：main.js L845 中 `petManager = new PetManager()` 在 `app.whenReady()` 的 `.then()` 回调中执行，此时 app 应该已经 ready。

**所以 P0-10 可能不是当前版本的问题**，除非有其他代码在 app ready 之前就 require('./pet-manager') 或创建 PetManager 实例。

**验证**：main.js L518 `const PetManager = require('./pet-manager')` 在模块顶层执行，但只是 require（加载模块定义），不创建实例。实例创建在 L845 的 `app.whenReady().then()` 中。所以理论上不应报错。

**可能的场景**：如果 pet-manager.js 被其他代码（如测试脚本、外部工具）在 app ready 之前就实例化，则会报错。

**结论**：当前代码中此问题**可能已修复**（惰性初始化 + app.whenReady 后创建），但作为防御性修复仍应添加保护。

---

### P0-11：IPC handler 注册中断

**根因**：main.js 中的 IPC handler 注册没有错误隔离。

main.js 中的 IPC handler 注册（L903-3447）是**顺序执行**的。如果任何一个 `ipcMain.handle()` 调用内部抛出异常，后续的 handler 都不会被注册。

**具体场景**：如果一个 handler 的回调函数中有语法错误或运行时错误（如 P0-10 导致 `app.getPath()` 返回 undefined），Electron 不会自动跳过该 handler，而是会中断整个注册流程。

**当前代码的脆弱点**：
1. L1377 `write-file` handler 接收 `(event, filePath, content)` 两个参数，但如果 renderer 传参格式不对（如传了三个参数但顺序不对），不会报错但行为不对
2. L1475 `take-screenshot` 的 `execSync` 如果 PowerShell 命令出错会抛异常，但已在 try/catch 中
3. 没有全局的 IPC 注册错误处理

**实际上**，Electron 的 `ipcMain.handle()` 本身不会因为回调内的异步错误而中断注册——它只是注册一个 handler。但如果注册代码本身有同步错误（如 `app.getPath()` 在 app ready 前调用返回 undefined，后续 `path.join(undefined, ...)` 可能抛错），则后续注册会被跳过。

**结论**：P0-11 的问题可能不严重，因为当前注册代码中没有明显的同步错误。但作为防御性编程，应给每个 handler 添加 try/catch。

---

### P0-12：文件编码损坏（renderer.js 1541-1552行中文乱码）

**根因**：查看 renderer.js L1520-1555，该区域是 `@` 下拉菜单的键盘导航代码，使用纯 ASCII 字符和变量名，**不存在中文乱码**。

PRD 中提到的"1541-1552行中文乱码"可能指的是**另一个版本**的 renderer.js，或者乱码已被修复。当前代码中该区域是正常的英文/符号代码。

**可能的原因**：之前版本的 renderer.js 在该区域有中文字符串（如提示文本），被保存为 GBK 编码而非 UTF-8，导致在其他编辑器/系统中显示为乱码。

**结论**：当前代码中未发现编码问题。但如果文件曾被以 GBK 编码保存后又以 UTF-8 读取，可能导致问题。应确保 renderer.js 以 UTF-8 无 BOM 格式保存。

---

### P0-13：会话保存失效（sessions.json 从未创建）

**根因**：main.js 中的 `ensureConfig()` 函数（L721-735）只创建了 `config.json`、`agents.json`、`skills.json`、`history.json`，**没有创建 sessions.json**。

```javascript
function ensureConfig() {
  if (!fs.existsSync(getConfigPath())) {
    fs.writeFileSync(getConfigPath(), ...);
  }
  if (!fs.existsSync(getAgentsPath())) {
    fs.writeFileSync(getAgentsPath(), ...);
  }
  if (!fs.existsSync(getSkillsPath())) {
    fs.writeFileSync(getSkillsPath(), ...);
  }
  if (!fs.existsSync(getHistoryPath())) {
    fs.writeFileSync(getHistoryPath(), ...);
  }
  // ❌ 缺少 sessions.json 的初始化
}
```

但 `save-session` handler（L1100-1117）中的 `saveSessions()` 函数会通过 `fs.writeFileSync` 自动创建文件。所以如果 `saveCurrentSession()` 被调用，文件会被创建。

**真正问题**：renderer.js 中 `saveCurrentSession()`（L3296-3335）在每次 AI 回复后被调用，但如果：
1. AI 调用失败（`result.success === false`），不会调用 `saveCurrentSession()`
2. 第一次对话时 `conversationHistory` 为空（用户消息已添加但 AI 还没回复），`saveCurrentSession()` 因 `if (!conversationHistory.length) return;` 而跳过
3. 页面加载时 `loadSessions()` 读取不存在的文件，返回空数组，但不会创建文件

**结合 P0-06**：`_currentSessionId` 和 `currentSessionId` 不一致时，`saveCurrentSession()` 可能用错误的 ID 保存，导致用户看到会话重复或丢失。

---

## B. 修复方案

### P0-01：修复 createSimplePlan 空工具问题

**策略**：修补（将已计算但未使用的变量填入返回值）

**修改位置**：`planner.js` L267-287 `createSimplePlan()` 返回值

**修改内容**：将硬编码的 `tool: ''` 替换为已计算的 `stepTool`，并将 `stepArgs` 和 `stepDesc` 填入步骤：

```javascript
return {
  analysis: '用户请求：' + userRequest,
  strategy: 'serial',
  steps: [
    {
      id: 'step-1',
      description: stepDesc || '直接处理用户请求',
      tool: stepTool || '',  // 使用已计算的工具名，而非硬编码空字符串
      args: stepTool ? stepArgs : {},
      dependsOn: [],
      validation: [],
      timeout: 30000,
      retries: 0,
      status: 'pending'
    }
  ],
  ...
};
```

**预计修改量**：小（约5行）

---

### P0-02/03/04/05：修复基础操控功能

**策略**：修补（上游链路修复后这些功能应自动恢复）

**修改位置**：无需直接修改 executeTool() 中的工具逻辑

**额外加固**：
- `file_write` 中添加 `args.path` 和 `args.content` 的空值检查
- `file_delete` 中 `confirmDangerousInline` 的超时时间调长

**预计修改量**：小

---

### P0-06：修复历史会话重复

**策略**：修补（统一变量，消除重复定义）

**修改位置**：`renderer.js`

**修改内容**：
1. 删除 `_currentSessionId`（L3357）的独立定义，全部使用 `currentSessionId`
2. 删除 L3463 版本的 `window.loadSession`，保留 L3259 版本并增强
3. 在 `autoSaveCurrentSession()`（L3517-3531）中统一使用 `currentSessionId`
4. 在 `saveCurrentSession()` 开头添加 `if (!currentSessionId)` 的初始化逻辑（已有，L3306-3308，但确认与 L3244 同步）

**预计修改量**：中（约30行修改）

---

### P0-07：修复待办事项创建重复

**策略**：修补（加强去重逻辑）

**修改位置**：`pet-manager.js`

**修改内容**：
1. `pet-todo-add` IPC（L1677-1685）添加10秒去重检查
2. `create_todo` 工具（L845-866）与 `pet-create-todo` IPC（L1687-1725）共享同一个去重函数
3. 添加一个 `_recentlyCreatedTodos` Map 做内存级去重（key = todoText, value = timestamp），所有创建路径共享

**预计修改量**：中（约40行新增）

---

### P0-08：修复桌面宠物Agent不持久化

**策略**：修补（确保 currentAgentId 在 settings.pet 中持久化）

**修改位置**：`pet-manager.js`

**修改内容**：
1. `defaultSettings`（L153-176）的 `pet` 对象添加 `currentAgentId: ''` 默认值
2. `loadSettings()` 中确保 `pet.currentAgentId` 不被浅合并覆盖
3. `pet-settings-save` handler 中，如果 `config.pet` 缺少 `currentAgentId`，从 `this.settings.pet.currentAgentId` 保留

**预计修改量**：小（约10行）

---

### P0-09：修复AI输出伪代码而非调用工具

**策略**：修补（P0-01 修复后此问题大部分解决）+ 增强

**修改位置**：
1. `renderer.js` L1091-1101：增强核心规则文本
2. `main.js` `getDefaultAgents()` 中默认 Agent 的 systemPrompt：铁律前移到开头

**修改内容**：
1. 将"工具使用铁律"从 systemPrompt 末尾前移到开头（模型对首部token注意力更高）
2. 铁律文本去除 emoji，用纯文本标记（如 `[CRITICAL]` 替代 🔴）
3. 添加一条工具调用的 few-shot 示例

**预计修改量**：中（约20行）

---

### P0-10：修复应用启动失败

**策略**：修补（防御性编程）

**修改位置**：`pet-manager.js`

**修改内容**：
1. `getDataDir()` 中添加 `app.isReady()` 检查，如果 app 未就绪则延迟初始化
2. PetManager 构造函数中的 `this.todoData = this.loadTodoData()` 和 `this.settings = this.loadSettings()` 用 try/catch 包裹

**预计修改量**：小（约10行）

---

### P0-11：修复IPC handler注册中断

**策略**：修补（添加错误隔离）

**修改位置**：`main.js`

**修改内容**：
1. 创建一个 `safeIpcHandle(channel, handler)` 包装函数，自动添加 try/catch
2. 将所有 `ipcMain.handle()` 调用替换为 `safeIpcHandle()`
3. 或者更简单：给每个 handler 的回调函数外层添加 try/catch（不修改函数签名）

**预计修改量**：中（约60个 handler 需要包装，但可用批量替换）

---

### P0-12：修复文件编码损坏

**策略**：验证 + 防御

**修改位置**：`renderer.js` 文件编码

**修改内容**：
1. 确认 renderer.js 以 UTF-8 无 BOM 格式保存
2. 在 main.js `createWindow()` 中添加 `webPreferences.charset = 'utf-8'`（如果支持）
3. 在 preload.js 的文件读取 API 中，确保传入 `'utf-8'` 编码参数

**预计修改量**：小

---

### P0-13：修复会话保存失效

**策略**：修补

**修改位置**：`main.js`、`renderer.js`

**修改内容**：
1. `main.js` 的 `ensureConfig()` 函数中添加 `sessions.json` 的初始化：
```javascript
if (!fs.existsSync(getSessionsPath())) {
  fs.writeFileSync(getSessionsPath(), JSON.stringify([], null, 2));
}
```
2. `renderer.js` 的 `saveCurrentSession()` 中，即使 `conversationHistory` 为空也保存（至少保存一个空会话标记）
3. 页面加载时（DOMContentLoaded）不仅加载会话列表，还初始化 `currentSessionId`

**预计修改量**：小（约10行）

---

## C. 任务分解

### T01：核心启动链修复（P0-10 + P0-11 + P0-12 + P0-13）
- **涉及文件**：main.js、pet-manager.js、renderer.js
- **依赖**：无
- **优先级**：P0
- **预计修改量**：中
- **内容**：
  1. P0-10：pet-manager.js 添加 app.isReady() 防御
  2. P0-11：main.js 添加 safeIpcHandle 包装函数
  3. P0-12：确认 renderer.js 编码格式
  4. P0-13：main.js ensureConfig() 添加 sessions.json 初始化；renderer.js saveCurrentSession() 加固

### T02：AI调用链修复（P0-01 + P0-09）
- **涉及文件**：planner.js、renderer.js、main.js
- **依赖**：T01
- **优先级**：P0
- **预计修改量**：中
- **内容**：
  1. P0-01：planner.js createSimplePlan() 返回值修复
  2. P0-09：renderer.js 铁律文本增强 + 位置前移

### T03：基础操控验证与加固（P0-02/03/04/05）
- **涉及文件**：main.js
- **依赖**：T02（上游链路修复后验证）
- **优先级**：P0
- **预计修改量**：小
- **内容**：
  1. 验证 file_read/file_write/file_delete/execute_command/take_screenshot/open_software 工具可用
  2. file_write 添加空值检查
  3. file_delete 确认对话框超时调长

### T04：数据一致性修复（P0-06 + P0-07 + P0-08）
- **涉及文件**：renderer.js、pet-manager.js
- **依赖**：T01
- **优先级**：P0
- **预计修改量**：中
- **内容**：
  1. P0-06：renderer.js 统一 currentSessionId，删除 _currentSessionId
  2. P0-07：pet-manager.js 添加内存级去重 Map
  3. P0-08：pet-manager.js defaultSettings 添加 currentAgentId，loadSettings 加固

### T05：验收测试（P0-14）
- **涉及文件**：无（纯测试）
- **依赖**：T01-T04
- **优先级**：P0
- **预计修改量**：0（测试报告）
- **内容**：
  1. 启动应用验证无崩溃
  2. 测试文件读写、命令执行、截图、打开软件
  3. 测试会话保存与加载
  4. 测试待办创建不重复
  5. 测试宠物 Agent 持久化
  6. 输出测试报告

---

## D. 依赖包列表

无需新增第三方包。所有修复均在现有代码基础上完成。

---

## E. 共享知识

1. **所有 IPC 通道使用连字符格式**（如 `read-file`、`save-session`），Function Calling 工具名使用下划线格式（如 `file_read`、`execute_command`）
2. **`executeTool()` 是 Function Calling 工具的核心路由**，所有 AI 发起的工具调用都经过此函数
3. **`executeToolSmart()` 是包装器**，对 `execute_command` 和 `file_read` 使用增强版（带错误恢复），其他工具直接走 `executeTool()`
4. **`_plannerAutoApprove` 全局标志**用于 Planner 模式下跳过 `confirmDangerousInline` 的 UI 确认
5. **`confirmDangerousInline()` 返回 Promise**，在确认/超时前会阻塞工具执行
6. **所有文件操作应使用 UTF-8 编码**，避免 GBK 乱码
7. **sessions.json 最大 50 个会话，每个会话最多 10 条消息**
8. **宠物设置存储在 `userData/data/pet-settings.json`**，主应用设置在 `userData/config.json`

---

## F. 待明确事项

1. **P0-10 的具体触发场景**：当前代码中 `new PetManager()` 在 `app.whenReady()` 后执行，理论上 `app.getPath()` 不会返回 undefined。需要确认是否有其他代码路径提前创建 PetManager。
2. **P0-12 的乱码位置**：当前 renderer.js L1541-1552 无乱码，可能是之前版本已修复。需要确认是否还有其他文件存在编码问题。
3. **shouldUsePlanner 的优化边界**：当前 `shouldUsePlanner()` 对"翻译"、"解释"等关键词走快速路径（不使用 Planner），但对"帮我写"等可能有歧义的关键词是否应该走快速路径，需要产品确认。
4. **pet-create-todo 与 create_todo 的交互**：宠物对话中的待办创建走 `create_todo` 工具（pet-manager.js L845），前端 IPC 走 `pet-create-todo`（L1687）。两条路径的去重逻辑需要共享状态。
5. **safeIpcHandle 的批量替换风险**：如果直接替换所有 `ipcMain.handle`，可能影响 pet-manager.js 中已注册的 handler。建议只在 main.js 中使用包装函数。
