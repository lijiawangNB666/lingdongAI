const { BrowserWindow, screen, ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');
// 阿里云 NLS 配置（请替换为你自己的阿里云智能语音交互凭证）
// 获取方式：https://nls-portal.console.aliyun.com/
    const NLS_CONFIG = {
  AK_ID: process.env.NLS_AK_ID || '',
  AK_SECRET: process.env.NLS_AK_SECRET || '',
  APPKEY: process.env.NLS_APPKEY || '',
  GATEWAY: 'wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1',
  TOKEN_URL: 'https://nls-meta.cn-shanghai.aliyuncs.com/'
};
// 本地数据目录
    const DATA_DIR = path.join(app.getPath('userData'), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const PET_CONFIG_PATH = path.join(DATA_DIR, 'pet-position.json');
const PET_SETTINGS_PATH = path.join(DATA_DIR, 'pet-settings.json');
const PET_TODO_PATH = path.join(DATA_DIR, 'pet-todo.json');
const TODO_DATA_PATH = path.join(DATA_DIR, 'todo-data.json');
class PetManager {
  constructor() {
    this.petWindow = null;
    this.settingsWindow = null;
    this.isDragging = false;
    this.reminderTimers = [];
    this._todoPanelTimers = [];
    this._todoPanelReminded = new Set();
    this._ipcRegistered = false;
    this._todoPanelWindow = null;
    this._todoIpcRegistered = false;
    // NLS 语音识别状态
    // NLS 语音识别状态
    this._nlsToken = null;
    this._nlsTokenExpire = 0;
    this._nlsWs = null;
    this._nlsTaskId = null;
    this._nlsReady = false;
    this.todoData = this.loadTodoData();
    this.settings = this.loadSettings();
    this.reminders = new Map();
    this.todoReminders = new Map();
    // 后端配置（默默认 standalone，用户可在设置里切换到OpenClaw/自定义 API）    this.currentBackend = this.settings.backend?.type || 'standalone';
    this.openClawUrl = this.settings.backend?.openclaw?.url || '';
    this.openClawApiKey = this.settings.backend?.openclaw?.apiKey || '';
    this.hermesUrl = this.settings.backend?.hermes?.url || '';
    this.customApiConfig = this.settings.backend?.custom || {};
    this.backendConnected = false;
    // 启动时异步检查后端（不阻塞，不崩溃）
    if (this.currentBackend !== 'standalone') {
      this.checkBackendConnection().catch(() => {});
    }
    // 启动时清理旧的乱码待办数据
    this._cleanupTodoData();
    // 启动待办到期检查
    this.startTodoChecker();
  }
  _cleanupTodoData() {
    try {
      // 确保 pet-todo.json 存在
      if (!fs.existsSync(PET_TODO_PATH)) {
        fs.writeFileSync(PET_TODO_PATH, '[]', 'utf-8');
      }
      // 确保 todo-data.json 存在且格式正确（保留兼容）
      if (!fs.existsSync(TODO_DATA_PATH)) {
        fs.writeFileSync(TODO_DATA_PATH, JSON.stringify({ todos: [], next_id: 1 }, null, 2), 'utf-8');
      }
      // 数据迁移：将 todo-data.json 中的待办合并到 pet-todo.json（统一数据源）
      this._migrateTodoData();
    } catch (e) {
      console.log('_cleanupTodoData error:', e.message);
    }
  }

  // 迁移 todo-data.json → pet-todo.json（统一数据源）
  _migrateTodoData() {
    try {
      // 1. 首次安装：从安装包 resources/data/ 复制到 userData/data/
      this._initDataFromResources();

      let petTodos = [];
      if (fs.existsSync(PET_TODO_PATH)) {
        petTodos = JSON.parse(fs.readFileSync(PET_TODO_PATH, 'utf-8'));
        if (!Array.isArray(petTodos)) petTodos = [];
      }
      // 如果 pet-todo.json 已有数据，跳过迁移
      if (petTodos.length > 0) return;

      // 2. 读取旧版 todo-data.json 进行迁移
      if (!fs.existsSync(TODO_DATA_PATH)) return;
      const todoData = JSON.parse(fs.readFileSync(TODO_DATA_PATH, 'utf-8'));
      const sourceTodos = todoData.todos || [];
      if (sourceTodos.length === 0) return;

      // 转换格式并写入 pet-todo.json（createdAt 统一为毫秒）
      const migrated = sourceTodos.map((t, i) => ({
        text: t.text || '',
        done: !!t.done,
        createdAt: (t.created_at || 0) > 1e12 ? t.created_at : (t.created_at || Math.floor(Date.now() / 1000)) * 1000,
        reminderTime: null,
        priority: t.priority || 'green',
        due_date: t.due_date || null,
        due_time: t.due_time || null,
        category: t.category || '',
        note: t.note || '',
        archived: !!t.archived,
        order: t.order !== undefined ? t.order : i
      }));

      fs.writeFileSync(PET_TODO_PATH, JSON.stringify(migrated, null, 2), 'utf-8');
      console.log('Migrated ' + migrated.length + ' todos from todo-data.json to pet-todo.json');
    } catch (e) {
      console.log('_migrateTodoData error:', e.message);
    }
  }

  // 首次安装时从 resources/data/ 初始化数据文件到 userData/data/
  _initDataFromResources() {
    try {
      // process.resourcesPath 指向安装目录的 resources 文件夹
      const resDataDir = path.join(process.resourcesPath || '', 'data');
      if (!fs.existsSync(resDataDir)) return;

      // 如果 userData 下 pet-todo.json 不存在或为空，从 resources 复制
      if (!fs.existsSync(PET_TODO_PATH) || fs.statSync(PET_TODO_PATH).size <= 2) {
        const srcPet = path.join(resDataDir, 'pet-todo.json');
        if (fs.existsSync(srcPet)) {
          fs.copyFileSync(srcPet, PET_TODO_PATH);
          console.log('Initialized pet-todo.json from resources');
        }
      }

      // 如果 userData 下 todo-data.json 不存在或为空，从 resources 复制
      if (!fs.existsSync(TODO_DATA_PATH) || fs.statSync(TODO_DATA_PATH).size <= 2) {
        const srcTodo = path.join(resDataDir, 'todo-data.json');
        if (fs.existsSync(srcTodo)) {
          fs.copyFileSync(srcTodo, TODO_DATA_PATH);
          console.log('Initialized todo-data.json from resources');
        }
      }
    } catch (e) {
      console.log('_initDataFromResources error:', e.message);
    }
  }
  // ===== 默认设置 =====
  get defaultSettings() {
    return {
      pet: {
        themeColor: '#4CAF50',
        voiceEnabled: false
      },
      backend: {
        type: 'standalone',
        openclaw: {
          url: '',
          apiKey: '',
          model: 'deepseek-v3'
        },
        hermes: {
          url: ''
        },
        custom: {
          baseUrl: '',
          apiKey: '',
          model: ''
        }
      }
    };
  }
  // ===== 位置管理 =====
  getSavedPosition() {
    try {
      if (fs.existsSync(PET_CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(PET_CONFIG_PATH, 'utf-8'));
      }
    } catch (e) {}
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    // 放在屏幕中央，确保可见
    return { x: Math.round((width - 360) / 2), y: Math.round((height - 520) / 2) };
  }
  savePosition(x, y) {
    try { fs.writeFileSync(PET_CONFIG_PATH, JSON.stringify({ x, y })); } catch (e) {}
  }
  // ===== 设置管理 =====
  loadSettings() {
    try {
      if (fs.existsSync(PET_SETTINGS_PATH)) {
        return { ...this.defaultSettings, ...JSON.parse(fs.readFileSync(PET_SETTINGS_PATH, 'utf-8')) };
      }
    } catch (e) {}
    return { ...this.defaultSettings };
  }
  saveSettings(settings) {
    try {
      fs.writeFileSync(PET_SETTINGS_PATH, JSON.stringify(settings, null, 2));
      return true;
    } catch (e) { return false; }
  }
  // ===== 待办管理 =====
  loadTodos() {
    try {
      if (fs.existsSync(PET_TODO_PATH)) {
        return JSON.parse(fs.readFileSync(PET_TODO_PATH, 'utf-8'));
      }
    } catch (e) {}
    return [];
  }
  saveTodos(todos) {
    try {
      fs.writeFileSync(PET_TODO_PATH, JSON.stringify(todos, null, 2));
      console.log('[saveTodos] Written ' + todos.length + ' todos to ' + PET_TODO_PATH);
    } catch (e) {
      console.error('[saveTodos] Error: ' + e.message);
    }
  }

  // ===== 待办面板数据读写（统一 pet-todo.json） =====
  _toMs(v) {
    if (!v) return Date.now();
    return v > 1e12 ? v : v * 1000;
  }
  _toSec(v) {
    if (!v) return Math.floor(Date.now() / 1000);
    return v > 1e12 ? Math.floor(v / 1000) : v;
  }
  loadPanelTodos() {
    try {
      if (fs.existsSync(PET_TODO_PATH)) {
        const todos = JSON.parse(fs.readFileSync(PET_TODO_PATH, 'utf-8'));
        if (Array.isArray(todos)) {
          return todos.map((t, i) => ({
            id: i + 1,
            text: t.text || t.title || '',
            done: !!t.done,
            priority: t.priority || 'green',
            category: t.category || '',
            created_at: this._toSec(t.createdAt || Date.now()),
            due_date: t.due_date || null,
            due_time: t.due_time || null,
            repeat: t.repeat || null,
            note: t.note || '',
            archived: !!t.archived,
            order: t.order !== undefined ? t.order : i
          }));
        }
      }
    } catch(e) { console.log('[loadPanelTodos] error:', e.message); }
    return [];
  }
  savePanelTodos(panelTodos) {
    try {
      const petTodos = panelTodos.map((t, i) => ({
        text: t.text,
        done: !!t.done,
        createdAt: this._toMs(t.created_at),
        reminderTime: t.reminderTime || null,
        priority: t.priority || 'green',
        due_date: t.due_date || null,
        due_time: t.due_time || null,
        category: t.category || '',
        note: t.note || '',
        archived: !!t.archived,
        order: t.order !== undefined ? t.order : i
      }));
      fs.writeFileSync(PET_TODO_PATH, JSON.stringify(petTodos, null, 2), 'utf-8');
      console.log('[savePanelTodos] Written ' + petTodos.length + ' todos');
    } catch(e) { console.log('[savePanelTodos] error:', e.message); }
  }
  // 通知所有面板刷新
  notifyAllPanels() {
    const petWinAlive = this.petWindow && !this.petWindow.isDestroyed();
    const todoWinAlive = this._todoPanelWindow && !this._todoPanelWindow.isDestroyed();
    console.log('[notifyAllPanels] petWindow=' + !!petWinAlive + ' todoPanel=' + !!todoWinAlive);
    if (petWinAlive) {
      this.petWindow.webContents.send('pet-todos-updated');
      this.petWindow.webContents.send('todo-changed');
    }
    if (todoWinAlive) {
      this._todoPanelWindow.webContents.send('todo-changed');
    }
  }
  loadTodoData() {
    try {
      if (fs.existsSync(TODO_DATA_PATH)) {
        return JSON.parse(fs.readFileSync(TODO_DATA_PATH, 'utf-8'));
      }
    } catch (e) {}
    return { todos: [], completedTodos: [] };
  }
  saveTodoData(data) {
    try { fs.writeFileSync(TODO_DATA_PATH, JSON.stringify(data, null, 2)); } catch (e) {}
  }
  // ===== AI后端相关方法 =====
  async checkBackendConnection() {
    if (this.currentBackend === 'standalone') {
      this.backendConnected = false;
      return;
    }
    let url = '';
    try {
      if (this.currentBackend === 'openclaw') {
        url = this.openClawUrl;
      } else if (this.currentBackend === 'hermes') {
        url = this.hermesUrl;
      } else if (this.currentBackend === 'custom') {
        this.backendConnected = !!(this.customApiConfig.baseUrl && this.customApiConfig.apiKey);
        return;
      }
      if (!url) {
        this.backendConnected = false;
        return;
      }
      const response = await fetch(`${url}/health`, { 
        signal: AbortSignal.timeout(3000) 
      });
      this.backendConnected = response.ok;
    } catch (e) {
      this.backendConnected = false;
    }
  }
  // ===== 灵动AI会议纪要搜索 =====
  searchMeetingNotes(query) {
    const notesDir = path.join(app.getPath('userData'), '..', 'lobster-desktop', 'meeting-notes');
    if (!fs.existsSync(notesDir)) return [];
    
    const results = [];
    const queryLower = (query || '').toLowerCase();
    const supportedExts = ['.md', '.txt'];
    
    function searchDir(dir) {
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            searchDir(fullPath);
            continue;
          }
          const ext = path.extname(item).toLowerCase();
          if (!supportedExts.includes(ext)) continue;
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (!content) continue;
            // 匹配文件名或内容
            const nameMatch = item.toLowerCase().includes(queryLower);
            const contentMatch = content.toLowerCase().includes(queryLower);
            if (nameMatch || contentMatch) {
              results.push({
                file: path.relative(notesDir, fullPath),
                title: item.replace(ext, ''),
                content: content.substring(0, 800), // 截取前800字符
                date: stat.mtime.toISOString().slice(0, 10),
                size: stat.size
              });
            }
          } catch (e) { /* skip unreadable files */ }
        }
      } catch (e) { /* skip inaccessible dirs */ }
    }
    
    searchDir(notesDir);
    // 按日期倒序，最多返回5个
    results.sort((a, b) => b.date.localeCompare(a.date));
    return results.slice(0, 5);
  }

  // AI后端相关方法
  async chatWithAI(message, contextMessages, agentModelConfig) {
    if (this.currentBackend === 'standalone') {
      return "请先在设置中配置 AI 后端";
    }
    const petName = this.settings.pet?.name || '小宠';
    let baseUrl = '';
    let apiKey = '';
    let model = 'default';
    // 根据后端类型路由
    if (this.currentBackend === 'lingdong') {
      // 灵动AI → 读取本地灵动AI配置文件的API凭据
      const lingdongConfig = this._getLingdongModelConfig();
      if (lingdongConfig) {
        baseUrl = lingdongConfig.baseUrl || '';
        apiKey = lingdongConfig.apiKey || '';
        model = lingdongConfig.model || 'gpt-4o';
        // Agent 专属模型覆盖
        if (agentModelConfig) {
          if (agentModelConfig.model) model = agentModelConfig.model;
          if (agentModelConfig.baseUrl) baseUrl = agentModelConfig.baseUrl;
          if (agentModelConfig.apiKey) apiKey = agentModelConfig.apiKey;
        }
        console.log('[chatWithAI] lingdong model=' + model + ' baseUrl=' + baseUrl + ' agentTools=' + (agentModelConfig?.tools?.length || 0));
      } else {
        return "未检测到灵动AI配置，请先安装并运行灵动AI";
      }
    } else if (this.currentBackend === 'openclaw') {
      baseUrl = this.openClawUrl;
      apiKey = 'gateway-proxy';
      model = 'openclaw';
    } else if (this.currentBackend === 'hermes') {
      baseUrl = this.hermesUrl;
      apiKey = 'gateway-proxy';
      model = 'default';
    } else if (this.currentBackend === 'custom') {
      baseUrl = this.customApiConfig.baseUrl || '';
      apiKey = this.customApiConfig.apiKey || '';
      model = this.customApiConfig.model || 'gpt-4o-mini';
    }
    if (!baseUrl) {
      return "后端地址未配置，请在设置中填写";
    }
    baseUrl = baseUrl.replace(/\/+$/, '');
    // 构建 messages：如果有前端传的 contextMessages 就用，否则构建默认
    let messages;
    if (contextMessages && contextMessages.length > 0) {
      messages = [...contextMessages];
      // 灵动AI会议纪要助手：自动搜索会议纪要并注入上下文
      const systemMsg = messages.find(m => m.role === 'system');
      if (systemMsg && this.currentBackend === 'lingdong' && 
          (systemMsg.content.includes('会议纪要') || systemMsg.content.includes('search_meeting_notes'))) {
        const searchResults = this.searchMeetingNotes(message);
        if (searchResults.length > 0) {
          const notesContext = searchResults.map(r => 
            `【${r.title}】(${r.date})\n${r.content}`
          ).join('\n\n---\n\n');
          systemMsg.content += `\n\n以下是搜索到的相关会议纪要：\n\n${notesContext}\n\n请基于以上会议纪要回答用户的问题。如果没有相关内容，请告知用户。`;
        } else {
          systemMsg.content += `\n\n未找到与"${message}"相关的会议纪要。已搜索的目录：${path.join(app.getPath('userData'), '..', 'lobster-desktop', 'meeting-notes')}`;
        }
      }
    } else {
      // 系统提示词：用宠物名称作为角色
      const systemPrompt = `你叫"${petName}"，是一个可爱的桌面宠物AI助手。回答要简洁有趣（150字以内），语气活泼可爱，像朋友聊天一样。`;
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ];
    }
    try {
      // Build tools for API request (Agent tools from frontend)
      let apiTools = null;
      if (agentModelConfig && agentModelConfig.tools && agentModelConfig.tools.length > 0) {
        apiTools = agentModelConfig.tools.map(t => {
          // Already in OpenAI format
          if (t.type === 'function' && t.function) return t;
          // Convert from custom format
          if (t.name) {
            return {
              type: 'function',
              function: {
                name: t.name,
                description: t.description || '',
                parameters: t.parameters || t.input_schema || { type: 'object', properties: {} }
              }
            };
          }
          return t;
        });
        console.log('[chatWithAI] Passing ' + apiTools.length + ' tools to API');
      }

      let requestBody = {
        model: model,
        messages: messages,
        stream: false,
        temperature: 0.7
      };
      if (apiTools) {
        requestBody.tools = apiTools;
        requestBody.tool_choice = 'auto';
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return `请求失败(${response.status}): ${text.slice(0, 200) || response.statusText}`;
      }
      const data = await response.json();
      if (data.choices && data.choices.length > 0) {
        let choice = data.choices[0];
        let resultContent = choice.message.content || '';

        // ===== Tool Call 循环处理 =====
        let toolCallRounds = 0;
        while (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
          toolCallRounds++;
          if (toolCallRounds > 10) {
            resultContent += '\n[工具调用次数过多，已停止]';
            break;
          }

          // 1. 将 assistant 的 tool_calls 消息加入历史
          messages.push({
            role: 'assistant',
            content: choice.message.content || null,
            tool_calls: choice.message.tool_calls
          });

          // 2. 执行每个 tool call，将结果加入消息
          const toolResults = [];
          for (const toolCall of choice.message.tool_calls) {
            const fnName = toolCall.function.name;
            let fnArgs = {};
            try { fnArgs = JSON.parse(toolCall.function.arguments || '{}'); } catch(e) {}
            console.log('[chatWithAI] Executing tool: ' + fnName + ' args=' + JSON.stringify(fnArgs));
            const toolResult = await this._executeToolCall(fnName, fnArgs);
            console.log('[chatWithAI] Tool result: ' + (toolResult || '').slice(0, 200));
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: toolResult || '工具执行完成'
            });
            toolResults.push(`🔧 ${fnName}: ${toolResult || '完成'}`);
          }

          // 3. 再次请求 API（带上工具执行结果）
          const followUpBody = {
            model: model,
            messages: messages,
            stream: false,
            temperature: 0.7
          };
          if (apiTools) {
            followUpBody.tools = apiTools;
            followUpBody.tool_choice = 'auto';
          }

          const followUpResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(followUpBody)
          });

          if (!followUpResponse.ok) {
            resultContent += '\n' + toolResults.join('\n');
            break;
          }

          const followUpData = await followUpResponse.json();
          if (followUpData.choices && followUpData.choices.length > 0) {
            choice = followUpData.choices[0];
            if (choice.message.content) {
              resultContent += (resultContent ? '\n' : '') + choice.message.content;
            }
            // 如果没有 tool_calls，循环结束；如果有，继续循环
          } else {
            resultContent += '\n' + toolResults.join('\n');
            break;
          }
        }

        return resultContent || '后端返回了空响应';
      }
      return "后端返回了空响应";
    } catch (error) {
      return `请求异常: ${error.message}`;
    }
  }

  // ===== 工具调用执行 =====
  async _executeToolCall(name, args) {
    const homeDir = app.getPath('home');
    const resolvePath = (p) => p ? (path.isAbsolute(p) ? p : path.join(homeDir, p)) : '';

    try {
      switch (name) {
        // ===== 命令执行 =====
        case 'execute_command': {
          const cmd = args.command || args.cmd || '';
          if (!cmd) return '未提供命令';
          const dangerous = ['format', 'del /f', 'rmdir', 'rd /s', 'shutdown', 'restart'];
          if (dangerous.some(d => cmd.toLowerCase().includes(d))) return '⚠️ 安全限制：该命令被禁止执行';
          try {
            const result = execSync(cmd, { encoding: 'utf-8', timeout: 30000, cwd: homeDir, shell: 'powershell.exe' });
            return result || '命令执行完成（无输出）';
          } catch(e) {
            return '执行出错: ' + (e.stderr || e.message);
          }
        }

        // ===== 文件操作 =====
        case 'file_read': case 'read_file': {
          const filePath = resolvePath(args.path || args.filePath || args.file_path || '');
          if (!filePath) return '未提供文件路径';
          if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf-8');
          return '文件不存在: ' + filePath;
        }
        case 'file_write': case 'write_file': {
          const filePath = resolvePath(args.path || args.filePath || args.file_path || '');
          const content = args.content || '';
          if (!filePath) return '未提供文件路径';
          const dir = path.dirname(filePath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(filePath, content, 'utf-8');
          return '文件已写入: ' + filePath;
        }
        case 'file_list': {
          const dirPath = resolvePath(args.path || args.dirPath || homeDir);
          if (!fs.existsSync(dirPath)) return '目录不存在: ' + dirPath;
          const items = fs.readdirSync(dirPath);
          const details = items.map(item => {
            try {
              const stat = fs.statSync(path.join(dirPath, item));
              return (stat.isDirectory() ? '📁 ' : '📄 ') + item + ' (' + (stat.size / 1024).toFixed(1) + 'KB)';
            } catch(e) { return '❓ ' + item; }
          });
          return details.join('\n') || '目录为空';
        }
        case 'file_delete': {
          const filePath = resolvePath(args.path || args.filePath || '');
          if (!filePath) return '未提供文件路径';
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return '文件已删除: ' + filePath;
          }
          return '文件不存在: ' + filePath;
        }
        case 'file_search': {
          const query = (args.query || '').toLowerCase();
          const searchRoot = resolvePath(args.path || homeDir);
          if (!query) return '未提供搜索关键词';
          const found = [];
          const searchDir = (dir, depth) => {
            if (depth > 3 || found.length >= 20) return;
            try {
              fs.readdirSync(dir).forEach(item => {
                if (found.length >= 20) return;
                const full = path.join(dir, item);
                if (item.toLowerCase().includes(query)) found.push(full);
                try { if (fs.statSync(full).isDirectory()) searchDir(full, depth + 1); } catch(e) {}
              });
            } catch(e) {}
          };
          searchDir(searchRoot, 0);
          return found.length > 0 ? '找到 ' + found.length + ' 个匹配文件:\n' + found.join('\n') : '未找到匹配文件: ' + query;
        }
        case 'file_move': {
          const from = resolvePath(args.from || args.src || '');
          const to = resolvePath(args.to || args.dest || '');
          if (!from || !to) return '需要提供 from 和 to 路径';
          if (!fs.existsSync(from)) return '源文件不存在: ' + from;
          const toDir = path.dirname(to);
          if (!fs.existsSync(toDir)) fs.mkdirSync(toDir, { recursive: true });
          fs.renameSync(from, to);
          return '已移动: ' + from + ' → ' + to;
        }
        case 'file_copy': {
          const from = resolvePath(args.from || args.src || '');
          const to = resolvePath(args.to || args.dest || '');
          if (!from || !to) return '需要提供 from 和 to 路径';
          if (!fs.existsSync(from)) return '源文件不存在: ' + from;
          const toDir = path.dirname(to);
          if (!fs.existsSync(toDir)) fs.mkdirSync(toDir, { recursive: true });
          fs.copyFileSync(from, to);
          return '已复制: ' + from + ' → ' + to;
        }
        case 'create_folder': {
          const dirPath = resolvePath(args.path || args.dirPath || '');
          if (!dirPath) return '未提供目录路径';
          fs.mkdirSync(dirPath, { recursive: true });
          return '目录已创建: ' + dirPath;
        }
        case 'open_software': {
          const filePath = resolvePath(args.path || '');
          if (!filePath) return '未提供路径';
          require('electron').shell.openPath(filePath);
          return '已打开: ' + filePath;
        }

        // ===== 系统与网络 =====
        case 'get_current_time': {
          return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        }
        case 'open_url': {
          const url = args.url || args.link || '';
          if (!url) return '未提供 URL';
          require('electron').shell.openExternal(url);
          return '已在浏览器中打开: ' + url;
        }
        case 'take_screenshot': {
          try {
            const { desktopCapturer } = require('electron');
            const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
            if (sources.length > 0) {
              const img = sources[0].thumbnail;
              const screenshotDir = path.join(app.getPath('userData'), 'screenshots');
              if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
              const filePath = path.join(screenshotDir, 'screenshot_' + Date.now() + '.png');
              fs.writeFileSync(filePath, img.toPNG());
              return '截图已保存: ' + filePath;
            }
            return '截图失败：无法获取屏幕';
          } catch(e) {
            return '截图失败: ' + e.message;
          }
        }

        // ===== 会议纪要 =====
        case 'search_meeting_notes': {
          const query = args.query || args.question || '';
          if (!query) return '未提供搜索关键词';
          const results = this.searchMeetingNotes(query);
          if (results.length === 0) return '未找到包含"' + query + '"的会议纪要。会议纪要目录: ' + path.join(app.getPath('userData'), '..', 'lobster-desktop', 'meeting-notes');
          return '找到 ' + results.length + ' 条相关会议纪要:\n\n' + results.map(r => '【' + r.title + '】(' + r.date + ')\n' + r.content.slice(0, 500)).join('\n---\n');
        }
        case 'list_meeting_notes': {
          const notesDir = this._getMeetingNotesDir();
          if (!fs.existsSync(notesDir)) return '会议纪要目录不存在: ' + notesDir;
          const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
          if (files.length === 0) return '暂无会议纪要';
          return '共 ' + files.length + ' 条会议纪要:\n' + files.map(f => {
            try {
              const content = fs.readFileSync(path.join(notesDir, f), 'utf-8');
              const firstLine = content.split('\n').find(l => l.trim()) || f;
              return '📄 ' + f + ' - ' + firstLine.slice(0, 60);
            } catch(e) { return '📄 ' + f; }
          }).join('\n');
        }
        case 'save_meeting_note': {
          const title = args.title || '会议纪要_' + new Date().toISOString().slice(0, 10);
          const content = args.content || '';
          const date = args.date || new Date().toISOString().slice(0, 10);
          const notesDir = this._getMeetingNotesDir();
          if (!fs.existsSync(notesDir)) fs.mkdirSync(notesDir, { recursive: true });
          const fileName = date + '_' + title.replace(/[\\/:*?"<>|]/g, '_') + '.md';
          const filePath = path.join(notesDir, fileName);
          fs.writeFileSync(filePath, '# ' + title + '\n\n日期: ' + date + '\n\n' + content, 'utf-8');
          return '会议纪要已保存: ' + filePath;
        }

        // ===== 知识库 =====
        case 'search_knowledge_base': {
          const query = (args.query || args.question || '').toLowerCase();
          if (!query) return '未提供搜索关键词';
          // 搜索 agent 的 knowledgeBasePath 或 dataDir 下的文档
          const kbPaths = [];
          try {
            const agents = this._discoverLingdongAgentsRaw();
            agents.forEach(a => {
              if (a.knowledgeBasePath && fs.existsSync(a.knowledgeBasePath)) kbPaths.push(a.knowledgeBasePath);
              if (a.dataDir && fs.existsSync(a.dataDir)) kbPaths.push(a.dataDir);
            });
          } catch(e) {}
          // 默认知识库路径
          const defaultKb = path.join(app.getPath('userData'), '..', 'lobster-desktop', 'knowledge');
          if (fs.existsSync(defaultKb)) kbPaths.push(defaultKb);

          const found = [];
          kbPaths.forEach(kbDir => {
            try {
              fs.readdirSync(kbDir).forEach(f => {
                if (!f.endsWith('.md') && !f.endsWith('.txt')) return;
                try {
                  const content = fs.readFileSync(path.join(kbDir, f), 'utf-8');
                  if (content.toLowerCase().includes(query)) {
                    found.push({ file: f, path: path.join(kbDir, f), snippet: content.slice(0, 300) });
                  }
                } catch(e) {}
              });
            } catch(e) {}
          });
          if (found.length === 0) return '知识库中未找到与"' + query + '"相关的文档';
          return '找到 ' + found.length + ' 个相关文档:\n' + found.map(f => '📄 ' + f.file + '\n' + f.snippet).join('\n---\n');
        }

        // ===== 待办管理 =====
        case 'list_todos': {
          const todos = this.loadTodos();
          if (todos.length === 0) return '当前没有待办事项';
          return '待办列表（共' + todos.length + '条）:\n' + todos.map((t, i) => {
            const status = t.done ? '✅' : '⬜';
            const priority = t.priority === 'red' ? '🔴' : t.priority === 'orange' ? '🟠' : t.priority === 'blue' ? '🔵' : '🟢';
            const date = t.due_date ? ' 📅' + t.due_date : '';
            const time = t.due_time ? ' ' + t.due_time : '';
            return 'ID:' + (i + 1) + ' ' + status + priority + ' ' + (t.text || t.title || '') + date + time;
          }).join('\n');
        }
        case 'create_todo': {
          const text = args.text || args.title || '';
          if (!text) return '未提供待办内容';
          const todos = this.loadTodos();
          const newTodo = {
            text: text, done: false, createdAt: Date.now(),
            reminderTime: null, priority: args.priority || 'green',
            due_date: args.due_date || null, due_time: args.due_time || null,
            category: args.category || '', note: args.note || ''
          };
          todos.push(newTodo);
          this.saveTodos(todos);
          this.notifyAllPanels();
          return '✅ 待办已创建: ' + text;
        }
        case 'update_todo': {
          const id = args.id;
          if (id === undefined) return '未提供待办ID，请先用 list_todos 查看';
          const todos = this.loadTodos();
          const idx = id - 1;
          if (idx < 0 || idx >= todos.length) return '待办ID不存在: ' + id;
          if (args.text !== undefined) todos[idx].text = args.text;
          if (args.done !== undefined) todos[idx].done = args.done;
          if (args.priority !== undefined) todos[idx].priority = args.priority;
          if (args.due_date !== undefined) todos[idx].due_date = args.due_date;
          if (args.due_time !== undefined) todos[idx].due_time = args.due_time;
          if (args.category !== undefined) todos[idx].category = args.category;
          this.saveTodos(todos);
          this.notifyAllPanels();
          return '✅ 待办已更新(ID:' + id + '): ' + (todos[idx].text || '');
        }
        case 'delete_todo': {
          const id = args.id;
          if (id === undefined) return '未提供待办ID';
          const todos = this.loadTodos();
          const idx = id - 1;
          if (idx < 0 || idx >= todos.length) return '待办ID不存在: ' + id;
          const removed = todos.splice(idx, 1)[0];
          this.saveTodos(todos);
          this.notifyAllPanels();
          return '✅ 待办已删除(ID:' + id + '): ' + (removed.text || removed.title || '');
        }

        // ===== 智能体管理 =====
        case 'list_agents': {
          const agents = this._discoverLingdongAgents();
          if (agents.length === 0) return '当前没有可用的智能体';
          return '可用智能体（共' + agents.length + '个）:\n' + agents.map(a => {
            const toolCount = (a.tools || []).length;
            return '🤖 ' + a.name + ' (ID:' + a.id + ') - ' + (a.description || '').slice(0, 50) + ' | 工具:' + toolCount;
          }).join('\n');
        }
        case 'create_agent': {
          return '⚠️ 创建智能体需要在灵动AI主程序中操作，桌面宠物暂不支持';
        }

        default:
          console.log('[chatWithAI] Unknown tool: ' + name);
          return '工具 ' + name + ' 暂不支持';
      }
    } catch (e) {
      console.error('[chatWithAI] Tool execution error: ' + e.message);
      return '工具执行出错: ' + e.message;
    }
  }

  // 读取灵动AI原始 agents.json（含 knowledgeBasePath 等完整字段）
  _discoverLingdongAgentsRaw() {
    try {
      const configDir = path.join(app.getPath('userData'), '..', 'lobster-desktop');
      const agentsPath = path.join(configDir, 'agents.json');
      if (fs.existsSync(agentsPath)) {
        return JSON.parse(fs.readFileSync(agentsPath, 'utf-8'));
      }
    } catch(e) {}
    return [];
  }
  // ===== 待办提醒系统 =====
  _scheduleReminder(idx, todo) {
    // 简化版提醒：检查到期时间，到时弹通知
  }
  
  // 定时检查待办到期（每5分钟）
  startTodoChecker() {
    this._todoCheckInterval = setInterval(() => {
      this._checkDueTodos();
    }, 5 * 60 * 1000);
    // 启动后立即检查一次
    this._checkDueTodos();
  }
  
  _checkDueTodos() {
    try {
      const todos = this.loadTodos();
      const now = new Date();
      const nowStr = now.toISOString().slice(0, 10);
      const nowTime = now.getHours() * 100 + now.getMinutes();
      
      todos.forEach((t, idx) => {
        if (t.done || !t.due_date) return;
        
        const isToday = t.due_date === nowStr;
        const isOverdue = t.due_date < nowStr;
        
        if (isToday && t.due_time) {
          const [h, m] = t.due_time.split(':').map(Number);
          const todoTime = h * 100 + m;
          const diff = todoTime - nowTime;
          // 5分钟内到期 或 刚过期（5分钟内）
          if (diff >= -5 && diff <= 5) {
            this._showTodoReminder(t, diff <= 0 ? '已到期' : '即将到期');
          }
          // 30分钟内到期
          if (diff > 5 && diff <= 30 && !t._warned30) {
            this._showTodoReminder(t, '30分钟内到期');
            t._warned30 = true;
            this.saveTodos(todos);
          }
        }
        
        // 已过期提醒（只提醒一次）
        if (isOverdue && !t._overdueWarned) {
          this._showTodoReminder(t, '已过期');
          t._overdueWarned = true;
          this.saveTodos(todos);
        }
      });
      
      // 通知前端刷新（让颜色/倒计时更新）
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        this.petWindow.webContents.send('pet-todos-updated');
      }
    } catch (e) {
      console.log('_checkDueTodos error:', e.message);
    }
  }
  
  _showTodoReminder(todo, status) {
    const text = todo.text || '待办事项';
    const timeStr = todo.due_date + (todo.due_time ? ' ' + todo.due_time : '');
    
    // 桌面通知
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      this.petWindow.webContents.send('pet-todo-reminder', {
        text: text,
        status: status,
        time: timeStr,
        priority: todo.priority || 'green'
      });
    }
    
    // 气泡通知
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      this.petWindow.webContents.send('pet-show-bubble', 
        `⏰ ${status}：${text}\n📅 ${timeStr}`
      );
    }
    
    console.log(`Todo reminder [${status}]: ${text} (${timeStr})`);
  }

  // ===== 阿里云 NLS 语音识别 =====
  async getNLSToken() {
    const now = Math.floor(Date.now() / 1000);
    if (this._nlsToken && now < this._nlsTokenExpire - 60) {
      return this._nlsToken;
    }
    const params = {
      Action: 'CreateToken',
      Version: '2019-02-28',
      Format: 'JSON',
      AccessKeyId: NLS_CONFIG.AK_ID,
      SignatureMethod: 'HMAC-SHA1',
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      SignatureVersion: '1.0',
      SignatureNonce: crypto.randomUUID()
    };
    // 构造签名
    const sortedKeys = Object.keys(params).sort();
    const canonicalized = sortedKeys.map(k => 
      `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`
    ).join('&');
    const stringToSign = `GET&%2F&${encodeURIComponent(canonicalized)}`;
    const signature = crypto.createHmac('sha1', NLS_CONFIG.AK_SECRET + '&')
      .update(stringToSign).digest('base64');
    params.Signature = signature;
    const url = `${NLS_CONFIG.TOKEN_URL}?${new URLSearchParams(params)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await resp.json();
    if (data.Token && data.Token.Id) {
      this._nlsToken = data.Token.Id;
      this._nlsTokenExpire = data.Token.ExpireTime;
      return this._nlsToken;
    }
    throw new Error(`NLS Token 获取失败: ${JSON.stringify(data)}`);
  }
  // 启动 NLS 实时语音识别
    async startNLS() {
    // 如果已在运行，先关闭
    if (this._nlsWs) {
      this.stopNLS();
    }
    const token = await this.getNLSToken();
    const WebSocket = require('ws');
    const taskId = crypto.randomUUID().replace(/-/g, '');
    this._nlsTaskId = taskId;
    this._nlsReady = false;
    const wsUrl = `${NLS_CONFIG.GATEWAY}?token=${token}`;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      this._nlsWs = ws;
      const startTime = Date.now();
      ws.on('open', () => {
        // 发送 StartRecognition 指令
        ws.send(JSON.stringify({
          header: {
            message_id: crypto.randomUUID().replace(/-/g, ''), 
            task_id: taskId,
            namespace: 'SpeechTranscriber',
            name: 'StartTranscription',
            appkey: NLS_CONFIG.APPKEY
          },
          payload: {
            format: 'pcm',
            sample_rate: 16000,
            enable_intermediate_result: true,
            enable_punctuation_prediction: true,
            enable_inverse_text_normalization: true
          }
        }));
      });
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          const name = msg.header?.name;
          if (name === 'TranscriptionStarted') {
            this._nlsReady = true;
            resolve({ success: true });
          } else if (name === 'TranscriptionResultChanged') {
            // 中间结果
    if (this.petWindow && !this.petWindow.isDestroyed()) {
              this.petWindow.webContents.send('pet-voice-partial', msg.payload?.result || '');
            }
          } else if (name === 'SentenceEnd') {
            // 一句话结束
            const sentenceText = msg.payload?.result || '';
            if (this.petWindow && !this.petWindow.isDestroyed()) {
              this.petWindow.webContents.send('pet-voice-sentence', sentenceText);
              // 会议模式下，同时发送会议转写内容
              if (this._meetingActive && sentenceText) {
                this._meetingTranscript.push(sentenceText);
                this.petWindow.webContents.send('pet-meeting-transcript', sentenceText);
              }
            }
          } else if (name === 'TranscriptionCompleted') {
            // 整体识别完成
    if (this.petWindow && !this.petWindow.isDestroyed()) {
              this.petWindow.webContents.send('pet-voice-done', '');
            }
          } else if (name === 'TaskFailed') {
            const errMsg = msg.header?.status_text || '识别失败';
            if (this.petWindow && !this.petWindow.isDestroyed()) {
              this.petWindow.webContents.send('pet-voice-error', errMsg);
            }
            reject(new Error(errMsg));
          }
        } catch (e) {
          console.error('NLS message parse error:', e);
        }
      });
      ws.on('error', (err) => {
        console.error('NLS WebSocket error:', err.message);
        if (this.petWindow && !this.petWindow.isDestroyed()) {
          this.petWindow.webContents.send('pet-voice-error', err.message);
        }
        reject(err);
      });
      ws.on('close', () => {
        this._nlsWs = null;
        this._nlsReady = false;
      });
      // 超时保护
      setTimeout(() => {
        if (!this._nlsReady && ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          reject(new Error('NLS 连接超时'));
        }
      }, 8000);
    });
  }
  // 发送音频数据到 NLS
  sendAudioToNLS(pcmBuffer) {
    if (this._nlsWs && this._nlsReady && pcmBuffer && pcmBuffer.length > 0) {
      try {
        this._nlsWs.send(pcmBuffer);
      } catch (e) {
        console.error('NLS send audio error:', e.message);
      }
    }
  }
  // 停止 NLS 识别
  stopNLS() {
    if (this._nlsWs && this._nlsReady) {
      try {
        this._nlsWs.send(JSON.stringify({
          header: {
            message_id: crypto.randomUUID().replace(/-/g, ''), 
            task_id: this._nlsTaskId,
            namespace: 'SpeechTranscriber',
            name: 'StopTranscription',
            appkey: NLS_CONFIG.APPKEY
          }
        }));
        // 等待 TranscriptionCompleted 后自动关闭
        setTimeout(() => {
          if (this._nlsWs) {
            try { this._nlsWs.close(); } catch (e) {}
            this._nlsWs = null;
            this._nlsReady = false;
          }
        }, 2000);
      } catch (e) {
        try { this._nlsWs.close(); } catch (e2) {}
        this._nlsWs = null;
        this._nlsReady = false;
      }
    }
    this._nlsTaskId = null;
  }
  // ===== 后端方法（standalone 模式全部为空实现） =====
  async getAvailableSkills() { return []; }
  async getAvailableAgents() {
    // 根据后端类型获取 Agent 列表
    if (this.currentBackend === 'lingdong') {
      // 灵动AI：从本地配置文件自动发现
      return this._discoverLingdongAgents();
    }
    if (this.currentBackend === 'openclaw' || this.currentBackend === 'hermes') {
      // OpenClaw/Hermes：通过网关 API 获取
      const baseUrl = (this.currentBackend === 'openclaw' ? this.openClawUrl : this.hermesUrl || '').replace(/\/+$/, '');
      if (!baseUrl) return [];
      try {
        const resp = await fetch(`${baseUrl}/v1/agents`, {
          method: 'GET',
          headers: { 'Authorization': 'Bearer gateway-proxy' },
          signal: AbortSignal.timeout(5000)
        });
        if (resp.ok) {
          const data = await resp.json();
          return (data.data || data.agents || data || []).map(a => ({
            id: a.id || a.agent_id || a.name,
            name: a.name || a.display_name || a.id,
            description: a.description || ''
          }));
        }
      } catch (e) {
        console.log('getAvailableAgents error:', e.message);
      }
      return [];
    }
    return [];
  }
  // 自动发现灵动AI：读取本地配置文件
  _discoverLingdongAgents() {
    try {
      const configDir = path.join(app.getPath('userData'), '..', 'lobster-desktop');
      const agentsPath = path.join(configDir, 'agents.json');
      if (fs.existsSync(agentsPath)) {
        const agents = JSON.parse(fs.readFileSync(agentsPath, 'utf-8'));
        if (Array.isArray(agents)) {
          console.log('[discoverLingdong] Found ' + agents.length + ' agents');
          return agents.map(a => {
            const toolNames = a.tools || [];
            // 将字符串工具名转换为 OpenAI function calling 格式
            const tools = toolNames.map(toolName => this._toolNameToFunctionDef(toolName));
            return {
              id: a.id || a.name,
              name: a.name || a.id,
              description: a.description || '',
              systemPrompt: a.systemPrompt || '',
              model: a.model || '',
              apiKey: a.apiKey || '',
              baseUrl: a.baseUrl || '',
              tools: tools,
              dataDir: a.dataDir || '',
              notesDir: a.notesDir || '',
              knowledgeBasePath: a.knowledgeBasePath || ''
            };
          });
        }
      }
    } catch (e) {
      console.log('_discoverLingdongAgents error:', e.message);
    }
    return [];
  }

  // 工具名 → OpenAI function calling 定义
  _toolNameToFunctionDef(name) {
    const defs = {
      'file_read': { name: 'file_read', description: '读取指定文件的内容', parameters: { type: 'object', properties: { path: { type: 'string', description: '文件路径' } }, required: ['path'] } },
      'file_write': { name: 'file_write', description: '写入内容到指定文件', parameters: { type: 'object', properties: { path: { type: 'string', description: '文件路径' }, content: { type: 'string', description: '要写入的内容' } }, required: ['path', 'content'] } },
      'file_list': { name: 'file_list', description: '列出指定目录下的文件和子目录', parameters: { type: 'object', properties: { path: { type: 'string', description: '目录路径' } }, required: ['path'] } },
      'file_delete': { name: 'file_delete', description: '删除指定文件', parameters: { type: 'object', properties: { path: { type: 'string', description: '文件路径' } }, required: ['path'] } },
      'file_search': { name: 'file_search', description: '按文件名搜索文件', parameters: { type: 'object', properties: { query: { type: 'string', description: '搜索关键词' }, path: { type: 'string', description: '搜索起始目录' } }, required: ['query'] } },
      'file_move': { name: 'file_move', description: '移动文件到新位置', parameters: { type: 'object', properties: { from: { type: 'string', description: '源路径' }, to: { type: 'string', description: '目标路径' } }, required: ['from', 'to'] } },
      'file_copy': { name: 'file_copy', description: '复制文件', parameters: { type: 'object', properties: { from: { type: 'string', description: '源路径' }, to: { type: 'string', description: '目标路径' } }, required: ['from', 'to'] } },
      'create_folder': { name: 'create_folder', description: '创建新目录', parameters: { type: 'object', properties: { path: { type: 'string', description: '目录路径' } }, required: ['path'] } },
      'execute_command': { name: 'execute_command', description: '执行系统命令（PowerShell）', parameters: { type: 'object', properties: { command: { type: 'string', description: '要执行的命令' } }, required: ['command'] } },
      'open_software': { name: 'open_software', description: '打开指定的软件或文件', parameters: { type: 'object', properties: { path: { type: 'string', description: '软件或文件路径' } }, required: ['path'] } },
      'take_screenshot': { name: 'take_screenshot', description: '截取当前屏幕', parameters: { type: 'object', properties: {} } },
      'open_url': { name: 'open_url', description: '在浏览器中打开URL', parameters: { type: 'object', properties: { url: { type: 'string', description: '要打开的URL' } }, required: ['url'] } },
      'get_current_time': { name: 'get_current_time', description: '获取当前日期和时间', parameters: { type: 'object', properties: {} } },
      'search_meeting_notes': { name: 'search_meeting_notes', description: '搜索会议纪要内容，按关键词匹配', parameters: { type: 'object', properties: { query: { type: 'string', description: '搜索关键词' } }, required: ['query'] } },
      'save_meeting_note': { name: 'save_meeting_note', description: '保存一条会议纪要', parameters: { type: 'object', properties: { title: { type: 'string', description: '会议标题' }, content: { type: 'string', description: '会议纪要内容' }, date: { type: 'string', description: '会议日期 YYYY-MM-DD' } }, required: ['title', 'content'] } },
      'list_meeting_notes': { name: 'list_meeting_notes', description: '列出所有会议纪要文件', parameters: { type: 'object', properties: {} } },
      'search_knowledge_base': { name: 'search_knowledge_base', description: '搜索知识库中的文档', parameters: { type: 'object', properties: { query: { type: 'string', description: '搜索关键词' } }, required: ['query'] } },
      'list_todos': { name: 'list_todos', description: '获取所有待办事项列表', parameters: { type: 'object', properties: {} } },
      'create_todo': { name: 'create_todo', description: '创建新的待办事项', parameters: { type: 'object', properties: { text: { type: 'string', description: '待办内容' }, priority: { type: 'string', description: '优先级: red/orange/blue/green', enum: ['red', 'orange', 'blue', 'green'] }, due_date: { type: 'string', description: '截止日期 YYYY-MM-DD' }, due_time: { type: 'string', description: '截止时间 HH:MM' }, category: { type: 'string', description: '分类' } }, required: ['text'] } },
      'update_todo': { name: 'update_todo', description: '更新指定待办事项（通过ID查找后更新，严禁创建新的）', parameters: { type: 'object', properties: { id: { type: 'integer', description: '待办ID（从list_todos获取）' }, text: { type: 'string', description: '新的待办内容' }, done: { type: 'boolean', description: '是否完成' }, priority: { type: 'string', description: '优先级' }, due_date: { type: 'string', description: '截止日期' }, due_time: { type: 'string', description: '截止时间' } }, required: ['id'] } },
      'delete_todo': { name: 'delete_todo', description: '删除指定待办事项', parameters: { type: 'object', properties: { id: { type: 'integer', description: '待办ID' } }, required: ['id'] } },
      'create_agent': { name: 'create_agent', description: '创建新的子智能体', parameters: { type: 'object', properties: { name: { type: 'string', description: '智能体名称' }, description: { type: 'string', description: '描述' }, systemPrompt: { type: 'string', description: '系统提示词' } }, required: ['name', 'systemPrompt'] } },
      'list_agents': { name: 'list_agents', description: '列出所有可用的智能体', parameters: { type: 'object', properties: {} } },
    };
    const def = defs[name];
    if (def) {
      return { type: 'function', function: { name: def.name, description: def.description, parameters: def.parameters } };
    }
    // 未知工具：返回基本定义
    return { type: 'function', function: { name: name, description: name, parameters: { type: 'object', properties: {} } } };
  }
  // 获取灵动AI模型配置
  // 获取灵动AI会议纪要助手配置
  _getMeetingAgentConfig() {
    try {
      const configDir = path.join(app.getPath('userData'), '..', 'lobster-desktop');
      const agentsPath = path.join(configDir, 'agents.json');
      if (fs.existsSync(agentsPath)) {
        const agents = JSON.parse(fs.readFileSync(agentsPath, 'utf-8'));
        if (Array.isArray(agents)) {
          const meetingAgent = agents.find(a => a.name && (a.name.includes('会议纪要') || a.name.includes('会议助手')));
          if (meetingAgent) {
            return {
              systemPrompt: meetingAgent.systemPrompt || '',
              model: meetingAgent.model || '',
              apiKey: meetingAgent.apiKey || '',
              baseUrl: meetingAgent.baseUrl || ''
            };
          }
        }
      }
    } catch (e) {
      console.log('_getMeetingAgentConfig error:', e.message);
    }
    return null;
  }

  // 获取灵动AI会议纪要存储路径
  _getMeetingNotesDir() {
    try {
      const notesDir = path.join(app.getPath('userData'), '..', 'lobster-desktop', 'meeting-notes');
      if (!fs.existsSync(notesDir)) {
        fs.mkdirSync(notesDir, { recursive: true });
      }
      return notesDir;
    } catch (e) {
      console.log('_getMeetingNotesDir error:', e.message);
      return null;
    }
  }

  _getLingdongModelConfig() {
    try {
      const configDir = path.join(app.getPath('userData'), '..', 'lobster-desktop');
      const configPath = path.join(configDir, 'config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return config.model || null;
      }
    } catch (e) {
      console.log('_getLingdongModelConfig error:', e.message);
    }
    return null;
  }
  async executeSkill() { return { success: false, error: 'standalone' }; }
  async executeAgent() { return { success: false, error: 'standalone' }; }
  updateBackendConfig(newBackendConfig) {
    this.settings.backend = newBackendConfig;
    this.currentBackend = newBackendConfig.type || 'standalone';
    this.openClawUrl = newBackendConfig.openclaw?.url || '';
    this.openClawApiKey = newBackendConfig.openclaw?.apiKey || '';
    this.openClawModel = newBackendConfig.openclaw?.model || 'deepseek-v3';
    this.hermesUrl = newBackendConfig.hermes?.url || '';
    this.customApiConfig = newBackendConfig.custom || {};
    this.saveSettings(this.settings);
    // 不自动检查后端连接
    // 不自动检查后端连接
  }
  getBackendStatus() {
    return {
      currentBackend: this.currentBackend,
      openclaw: {
        connected: this.openClawConnected,
        url: this.openClawUrl
      },
      hermes: {
        connected: this.hermesConnected,
        url: this.hermesUrl
      },
      custom: {
        connected: this.customConnected,
        configured: !!(this.customApiConfig.baseUrl && this.customApiConfig.apiKey)
      },
      lingdong: {
        connected: this.lingdongConnected
      }
    };
  }
  // ===== 待办面板（独立窗口）=====
  _openTodoPanel() {
    // Toggle：如果已打开则关闭
    if (this._todoPanelWindow && !this._todoPanelWindow.isDestroyed()) {
      this._todoPanelWindow.close();
      this._todoPanelWindow = null;
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        this.petWindow.webContents.send('pet-todo-panel-closed');
      }
      return { success: true, action: 'closed' };
    }
    const todoPanelPath = path.join(__dirname, 'todo-panel.html');
    if (!fs.existsSync(todoPanelPath)) {
      return { success: false, error: '待办面板文件不存在' };
    }
    const petBounds = this.petWindow ? this.petWindow.getBounds() : { x: 100, y: 100, width: 360, height: 520 };
    const display = screen.getDisplayNearestPoint({ x: petBounds.x, y: petBounds.y });
    const workArea = display.workArea;
    let winX = petBounds.x + petBounds.width + 10;
    let winY = Math.max(workArea.y, petBounds.y - 100);
    const winW = 860, winH = 580;
    if (winX + winW > workArea.x + workArea.width) winX = petBounds.x - winW - 10;
    if (winY + winH > workArea.y + workArea.height) winY = workArea.y + workArea.height - winH - 10;
    if (winX < workArea.x) winX = workArea.x + 10;
    if (winY < workArea.y) winY = workArea.y + 10;
    this._todoPanelWindow = new BrowserWindow({
      width: winW, height: winH, x: winX, y: winY,
      frame: false, resizable: true, minimizable: true,
      alwaysOnTop: true, skipTaskbar: false,
      backgroundColor: '#F5F5F8',
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    this._todoPanelWindow.loadFile(todoPanelPath);
    this._todoPanelWindow.on('closed', () => {
      this._todoPanelWindow = null;
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        this.petWindow.webContents.send('pet-todo-panel-closed');
      }
    });
    this._registerTodoIPCs();
    return { success: true, opened: true };
  }
  _registerTodoIPCs() {
    if (this._todoIpcRegistered) return;
    this._todoIpcRegistered = true;

    // 使用类方法 this.loadPanelTodos() / this.savePanelTodos() / this.notifyAllPanels()
    const getNextId = () => {
      const todos = this.loadPanelTodos();
      return todos.length > 0 ? Math.max(...todos.map(t => t.id)) + 1 : 1;
    };

    ipcMain.handle('todo-add', (event, todo) => {
      var todos = this.loadPanelTodos();
      var newTodo = {
        id: getNextId(), text: todo.text, done: false,
        priority: todo.priority || 'green', category: todo.category || '',
        created_at: Math.floor(Date.now() / 1000),
        due_date: todo.due_date || null, due_time: todo.due_time || null,
        repeat: todo.repeat || null, note: todo.note || '',
        archived: false, order: todos.length
      };
      todos.push(newTodo); this.savePanelTodos(todos);
      this.notifyAllPanels();
      return newTodo;
    });
    ipcMain.handle('todo-toggle', (event, id) => {
      var todos = this.loadPanelTodos();
      todos.forEach(t => { if (t.id === id) { t.done = !t.done; t.completed_at = t.done ? Date.now()/1000 : null; } });
      this.savePanelTodos(todos);
      this.notifyAllPanels();
      return true;
    });
    ipcMain.handle('todo-delete', (event, id) => {
      var todos = this.loadPanelTodos();
      todos = todos.filter(t => t.id !== id);
      this.savePanelTodos(todos);
      this.notifyAllPanels();
      return true;
    });
    ipcMain.handle('todo-archive', (event, id) => {
      var todos = this.loadPanelTodos();
      todos.forEach(t => { if (t.id === id) t.archived = !t.archived; });
      this.savePanelTodos(todos);
      this.notifyAllPanels();
      return true;
    });
    ipcMain.handle('todo-clear-done', () => {
      var todos = this.loadPanelTodos();
      todos = todos.filter(t => !t.done);
      this.savePanelTodos(todos);
      this.notifyAllPanels();
      return true;
    });
    ipcMain.handle('todo-update', (event, update) => {
      var todos = this.loadPanelTodos();
      todos.forEach(t => {
        if (t.id === update.id) {
          if (update.text !== undefined) t.text = update.text;
          if (update.priority !== undefined) t.priority = update.priority;
          if (update.category !== undefined) t.category = update.category;
          if (update.due_date !== undefined) t.due_date = update.due_date;
          if (update.due_time !== undefined) t.due_time = update.due_time;
          if (update.repeat !== undefined) t.repeat = update.repeat;
          if (update.note !== undefined) t.note = update.note;
        }
      });
      this.savePanelTodos(todos);
      this.notifyAllPanels();
      return true;
    });
    ipcMain.handle('todo-weather', async () => {
      try {
        const resp = await fetch('https://wttr.in/?format=j1&lang=zh', {
          headers: { 'User-Agent': 'curl/7.68.0' }, signal: AbortSignal.timeout(10000)
        });
        const wdata = await resp.json();
        const current = wdata.current_condition?.[0] || {};
        const forecasts = wdata.weather || [];
        const iconMap = {'113':'🌤️','116':'🌤️','119':'🌤️','122':'🌤️','176':'🌤️','200':'🌤️','296':'🌤️','302':'🌤️','308':'🌤️','353':'🌤️','389':'🌤️'};
        return {
          current: { temp: parseInt(current.temp_C||0), feels_like: parseInt(current.FeelsLikeC||0), desc: current.lang_zh?.[0]?.value||'', icon: iconMap[current.weatherCode]||'🌤️', humidity: current.humidity||'', wind_speed: current.windspeedKmph||'' },
          forecast: forecasts.slice(0,7).map(day => {
            const hourly = day.hourly||[]; const mid = hourly[Math.floor(hourly.length/2)]||{};
            const d = new Date(day.date); const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
            return { date: day.date, weekday: weekdays[d.getDay()], max_temp: parseInt(day.maxtempC||0), min_temp: parseInt(day.mintempC||0), desc: mid.lang_zh?.[0]?.value||'', icon: iconMap[mid.weatherCode]||'🌤️' };
          }),
          alerts: []
        };
      } catch(e) { return null; }
    });
    ipcMain.handle('todo-lunar', (event, { year, month, day }) => {
      const holidays = {'1-1':'元旦','2-14':'情人节','3-8':'妇女节','5-1':'劳动节','6-1':'儿童节','10-1':'国庆节','12-25':'圣诞节'};
      const key = month + '-' + day;
      return { lunar: '', holiday: holidays[key]||'', festival: '' };
    });
    ipcMain.handle('todo-month-info', (event, { year, month }) => {
      const firstDay = new Date(year, month - 1, 1).getDay();
      const daysInMonth = new Date(year, month, 0).getDate();
      return { firstDay, daysInMonth };
    });
    ipcMain.handle('todo-toggle-pin', () => {
      if (this._todoPanelWindow && !this._todoPanelWindow.isDestroyed()) {
        const pinned = !this._todoPanelWindow.isAlwaysOnTop();
        this._todoPanelWindow.setAlwaysOnTop(pinned);
        return pinned;
      }
      return false;
    });
    ipcMain.handle('todo-minimize', () => {
      if (this._todoPanelWindow && !this._todoPanelWindow.isDestroyed()) this._todoPanelWindow.minimize();
      return true;
    });
  }
  // ===== 宠物窗口 =====
  createPetWindow() {
    const pos = this.getSavedPosition();
    // 自动授权麦克风权限（NLS 语音识别需要）
    const { session } = require('electron');
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(true); // 授权所有权限请求
    });
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
      return true;
    });
    this.petWindow = new BrowserWindow({
      x: pos.x,
      y: pos.y,
      width: 360,
      height: 520,
      frame: false,
      transparent: true,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: false,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    this.petWindow.loadFile('pet-window.html');
    // 窗口就绪后显示（避免白屏闪烁）
    this.petWindow.once('ready-to-show', () => {
      this.petWindow.show();
    });
    this.petWindow.on('closed', () => { this.petWindow = null; });
    this.petWindow.on('moved', () => {
      if (!this.isDragging) {
        const [x, y] = this.petWindow.getPosition();
        this.savePosition(x, y);
      }
    });
    if (!this._ipcRegistered) this._registerIPC();
    return this.petWindow;
  }
  // ===== 设置窗口 =====
  openSettings() {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.focus();
      return;
    }
    this.settingsWindow = new BrowserWindow({
      width: 700,
      height: 800,
      frame: false,
      transparent: true,
      resizable: true,
      alwaysOnTop: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    this.settingsWindow.loadFile('pet-settings.html');
    this.settingsWindow.setBackgroundColor('#00000000'); // 完全透明
    this.settingsWindow.on('closed', () => { this.settingsWindow = null; });
    return this.settingsWindow;
  }
  // ===== 托盘图标 =====
  showTrayIcon() {
    if (!this.tray) {
      const { Tray, Menu } = require('electron');
      try {
        // 检查图标文件是否存在，优先使用tray-icon.png
        let iconPath = path.join(__dirname, 'tray-icon.png');
        if (!fs.existsSync(iconPath)) {
          iconPath = path.join(__dirname, 'icon.png');
        }
        if (fs.existsSync(iconPath)) {
          this.tray = new Tray(iconPath);
        } else {
          console.warn('图标文件不存在，跳过托盘图标创建');
          return;
        }
      } catch (error) {
        console.warn('托盘图标加载失败:', error.message);
        return;
      }
      const contextMenu = Menu.buildFromTemplate([
        { 
          label: '显示宠物',
          click: () => {
            if (this.petWindow) {
              this.petWindow.show();
            }
          } 
        },
        { 
          label: '设置',
          click: () => {
            if (this.settingsWindow) {
              this.settingsWindow.show();
            } else {
              this.openSettings();
            }
          } 
        },
        { type: 'separator' },
        { 
          label: '退出',
          click: () => {
            app.quit();
          } 
        }
      ]);
      this.tray.setContextMenu(contextMenu);
      this.tray.setIgnoreDoubleClickEvents(true);
      this.tray.on('click', () => {
        if (this.petWindow) {
          this.petWindow.show();
        }
      });
    }
  }
  // ===== IPC 注册 =====
  _registerIPC() {
    if (this._ipcRegistered) return;
    this._ipcRegistered = true;
    // 窗口拖拽
    ipcMain.on('pet-drag', (e, { x, y, ox, oy }) => {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        this.isDragging = true;
        this.petWindow.setPosition(x - ox, y - oy);
        setTimeout(() => { this.isDragging = false; }, 100);
      }
    });
    // 窗口就绪
    ipcMain.on('pet-window-ready', () => {
      // 发送当前心情（如果有）
    });
    // 同步待办到待办面板（统一使用 PET_TODO_PATH，无需额外同步）
    const syncTodosToPanel = () => {
      try {
        // 数据已统一存储在 PET_TODO_PATH，直接通知面板刷新
        if (this._todoPanelWindow && !this._todoPanelWindow.isDestroyed()) {
          this._todoPanelWindow.webContents.send('todo-changed');
        }
      } catch(e) { console.error('Sync todos error:', e.message); }
    };
    // 待办列表
    ipcMain.handle('pet-todo-list', () => {
      const todos = this.loadTodos();
      console.log('[pet-todo-list] Returning ' + todos.length + ' todos');
      return todos;
    });
    // 添加待办
    ipcMain.handle('pet-todo-add', (e, todo) => {
      const todos = this.loadTodos();
      todos.push(todo);
      this.saveTodos(todos);
      console.log('[pet-todo-add] Saved, total=' + todos.length);
      if (todo.reminderTime) this._scheduleReminder(todos.length - 1, todo);
      this.notifyAllPanels();
      return todos;
    });
    // 创建待办（另一入口）—— 对话创建待办走这里
    ipcMain.handle('pet-create-todo', (e, todo) => {
      console.log('[pet-create-todo] Called with: ' + JSON.stringify(todo));
      const todos = this.loadTodos();
      const newTodo = {
        text: todo.text || todo.title || '',
        done: false,
        createdAt: Date.now(),
        reminderTime: todo.reminderTime || null,
        priority: todo.priority || 'green',
        due_date: todo.due_date || null,
        due_time: todo.due_time || null,
        category: todo.category || '',
        note: todo.note || ''
      };
      todos.push(newTodo);
      this.saveTodos(todos);
      console.log('[pet-create-todo] Saved successfully, total=' + todos.length + ' file=' + PET_TODO_PATH);
      if (newTodo.reminderTime) this._scheduleReminder(todos.length - 1, newTodo);
      this.notifyAllPanels();
      return { success: true, todo: newTodo };
    });
    // 切换待办状态
    ipcMain.handle('pet-todo-toggle', (e, idx) => {
      const todos = this.loadTodos();
      if (todos[idx]) { todos[idx].done = !todos[idx].done; this.saveTodos(todos); }
      this.notifyAllPanels();
      return todos;
    });
    // 删除待办
    ipcMain.handle('pet-todo-delete', (e, idx) => {
      const todos = this.loadTodos();
      todos.splice(idx, 1);
      this.saveTodos(todos);
      this.notifyAllPanels();
      return todos;
    });
    // 获取单条待办
    ipcMain.handle('pet-todo-get', (e, id) => {
      const todos = this.loadTodos();
      return todos[id] || null;
    });
    // 打开设置
    ipcMain.handle('pet-open-settings', () => { this.openSettings(); return true; });
    // 打开待办面板（独立窗口）
    ipcMain.handle('pet-open-todo-panel', () => {
      return this._openTodoPanel();
    });
    // ===== 会议录制 IPC =====
    // 会议状态
    this._meetingActive = false;
    this._meetingTranscript = [];
    ipcMain.handle('pet-meeting-start', async () => {
      if (this._meetingActive) return { success: true };
      try {
        await this.startNLS();
        this._meetingActive = true;
        this._meetingTranscript = [];
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });
    ipcMain.handle('pet-meeting-stop', () => {
      this._meetingActive = false;
      this.stopNLS();
      return { success: true, transcript: this._meetingTranscript.join('\n') };
    });
    ipcMain.handle('pet-meeting-pause', () => {
      if (this._meetingActive) {
        this.stopNLS();
        this._meetingActive = false;
      }
      return { success: true };
    });
    ipcMain.handle('pet-meeting-resume', async () => {
      if (!this._meetingActive) {
        try {
          await this.startNLS();
          this._meetingActive = true;
        } catch (e) {
          return { success: false, error: e.message };
        }
      }
      return { success: true };
    });
    // 生成会议纪要
    ipcMain.handle('pet-meeting-generate', async (e, { transcript, duration }) => {
      const transcriptText = Array.isArray(transcript)
        ? transcript.map(t => typeof t === 'string' ? t : t.text || '').join('\n')
        : String(transcript || '');
      if (!transcriptText.trim()) {
        return { success: false, error: '没有转写内容' };
      }
      const minutes = Math.floor((duration || 0) / 60);
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
      
      // 获取灵动AI会议纪要助手配置
      const meetingAgent = this._getMeetingAgentConfig();
      const lingdongConfig = this._getLingdongModelConfig();
      
      // 构建系统提示词：优先用灵动AI会议纪要助手的，否则用默认的
      let systemPrompt = '你是一个专业的会议纪要助手，请根据会议转写内容生成结构化的会议纪要。';
      let agentModelConfig = null;
      if (meetingAgent && meetingAgent.systemPrompt) {
        systemPrompt = meetingAgent.systemPrompt;
      }
      // 使用会议纪要助手的模型配置
      if (meetingAgent && (meetingAgent.model || meetingAgent.apiKey || meetingAgent.baseUrl)) {
        agentModelConfig = {
          model: meetingAgent.model || lingdongConfig?.model || '',
          apiKey: meetingAgent.apiKey || lingdongConfig?.apiKey || '',
          baseUrl: meetingAgent.baseUrl || lingdongConfig?.baseUrl || ''
        };
      }
      
      const prompt = `请根据以下会议转写内容，生成一份简洁的会议纪要。包含：1)会议主题 2)主要讨论点 3)结论与待办事项。\n\n会议日期：${dateStr}\n会议时长：${minutes}分钟\n\n转写内容：\n${transcriptText}`;
      
      try {
        const reply = await this.chatWithAI(prompt, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ], agentModelConfig);
        
        // 保存会议纪要到灵动AI的meeting-notes目录
        let filePath = null;
        const notesDir = this._getMeetingNotesDir();
        if (notesDir && reply) {
          const fileName = `${dateStr}_${timeStr}.md`;
          filePath = path.join(notesDir, fileName);
          const mdContent = `# 会议纪要\n\n**日期**: ${dateStr}\n**时长**: ${minutes}分钟\n\n---\n\n${reply}\n`;
          fs.writeFileSync(filePath, mdContent, 'utf-8');
          console.log('Meeting notes saved to:', filePath);
        }
        
        return { success: true, text: reply, path: filePath };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });
    // 加载待办数据（面板用）— 统一从 pet-todo.json 读取
    ipcMain.handle('todo-load', () => { 
      return this.loadPanelTodos();
    });
    // ===== AI后端相关IPC =====
    ipcMain.handle('pet-chat', async (e, { text, contextMessages, agentModelConfig }) => {
      try {
        const response = await this.chatWithAI(text, contextMessages, agentModelConfig);
        return { success: true, data: { choices: [{ message: { content: response } }] } };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
    // 获取可用Agent
    ipcMain.handle('pet-get-agents', async () => {
      try {
        return await this.getAvailableAgents();
      } catch (error) {
        console.error('获取Agent列表失败:', error);
        return [];
      }
    });
    // 获取可用技能
    ipcMain.handle('pet-get-skills', async () => {
      try {
        return await this.getAvailableSkills();
      } catch (error) {
        console.error('获取技能列表失败', error);
        return [];
      }
    });
    // 获取后端类型
    ipcMain.handle('pet-get-backend', () => {
      return this.currentBackend;
    });
    // 获取后端状态
    // 获取后端状态
    ipcMain.handle('pet-backend-status', () => {
      return this.getBackendStatus();
    });
    // ===== 语音识别 IPC (阿里云 NLS 实时语音) =====
    ipcMain.handle('pet-voice-start', async () => {
      try {
        await this.startNLS();
        return { success: true };
      } catch (error) {
        console.error('NLS start error:', error.message);
        return { success: false, error: error.message };
      }
    });
    // 接收前端发来的 PCM 音频块（Buffer）
    ipcMain.on('pet-voice-chunk', (e, arrayBuffer) => {
      if (arrayBuffer && arrayBuffer.byteLength > 0) {
        this.sendAudioToNLS(Buffer.from(arrayBuffer));
      }
    });
    // 停止语音识别
    ipcMain.handle('pet-voice-stop', () => {
      this.stopNLS();
      return { success: true };
    });
    // 旧的兼容接口（已废弃）
    // 旧的兼容接口（已废弃）
    ipcMain.handle('pet-voice-recognize', async () => {
      return { text: '' }; // 不再支持旧的同步模式
    });
    ipcMain.handle('pet-tts-speak', async (e, text) => {
      // TTS语音播报实现
    try {
        // 使用PowerShell的语音合成
        const { exec } = require('child_process');
        return new Promise((resolve) => {
          // 在Windows上使用PowerShell进行TTS
    const psScript = `
          Add-Type -AssemblyName System.Speech
          $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer
          $speak.Rate = 0  # 正常语速          $speak.Volume = 100  # 音量
          $speak.Speak("${text.replace(/"/g, '`"')}")
          `;
          exec(`powershell -Command "${psScript}"`, (error, stdout, stderr) => {
            if (error) {
              console.error('TTS错误:', error);
              resolve({ success: false, error: error.message });
            } else {
              resolve({ success: true });
            }
          });
        });
      } catch (error) {
        console.error('TTS错误:', error);
        return { success: false, error: error.message };
      }
    });
    // 设置相关
    ipcMain.handle('pet-settings-save', (e, config) => {
      this.updateBackendConfig(config.backend);
      // 保存其他设置
    this.settings.backend = config.backend;
      this.settings.model = config.model;
      this.settings.pet = config.pet;
      this.saveSettings(this.settings);
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        this.petWindow.webContents.send('pet-config-changed');
        this.petWindow.webContents.send('pet-backend-changed', this.currentBackend);
      }
      return { success: true };
    });
    ipcMain.handle('pet-settings-load', () => {
      return this.settings;
    });
    ipcMain.handle('pet-settings-test', async (e, config) => {
      return { success: false, message: '独立版不支持连接测试' };
    });
    // 测试后端连接 & 扫描 Agent
    ipcMain.handle('pet-settings-test-backend', async (e, { backendType, url }) => {
      // 灵动AI：从本地配置文件自动发现
      if (backendType === 'lingdong') {
        const lingdongConfig = this._getLingdongModelConfig();
        if (!lingdongConfig || !lingdongConfig.baseUrl) {
          return { success: false, error: '未检测到灵动AI配置，请先安装并运行灵动AI' };
        }
        const agents = this._discoverLingdongAgents();
        // 测试 API 连通性
        try {
          const testResp = await fetch(`${lingdongConfig.baseUrl}/v1/models`, {
            headers: { 'Authorization': `Bearer ${lingdongConfig.apiKey}` },
            signal: AbortSignal.timeout(5000)
          });
          if (!testResp.ok) {
            return { success: false, error: `API 连通失败 (HTTP ${testResp.status})`, agents: agents };
          }
        } catch (e) {
          return { success: false, error: `API 连接异常: ${e.message}`, agents: agents };
        }
        return { success: true, agents: agents, model: lingdongConfig.model };
      }
      // OpenClaw / Hermes
      if (!url) return { success: false, error: '未填写 URL' };
      const baseUrl = url.replace(/\/+$/, '');
      try {
        const modelsResp = await fetch(`${baseUrl}/v1/models`, {
          headers: { 'Authorization': 'Bearer gateway-proxy' },
          signal: AbortSignal.timeout(5000)
        });
        if (!modelsResp.ok) {
          return { success: false, error: `连接失败 (HTTP ${modelsResp.status})` };
        }
        const result = { success: true, agents: [] };
        try {
          const agentsResp = await fetch(`${baseUrl}/v1/agents`, {
            headers: { 'Authorization': 'Bearer gateway-proxy' },
            signal: AbortSignal.timeout(5000)
          });
          if (agentsResp.ok) {
            const agentsData = await agentsResp.json();
            const agentList = agentsData.data || agentsData.agents || agentsData || [];
            if (Array.isArray(agentList)) {
              result.agents = agentList.map(a => ({
                id: a.id || a.agent_id || a.name,
                name: a.name || a.display_name || a.id,
                description: a.description || ''
              }));
            }
          }
        } catch (e2) {
          // Agent 接口不可用，忽略
        }
        return result;
      } catch (error) {
        return { success: false, error: error.message || '连接异常' };
      }
    });
    // 检查灵动AI安装状态
    ipcMain.handle('pet-settings-check-lingdong', () => {
      const config = this._getLingdongModelConfig();
      const agents = this._discoverLingdongAgents();
      return {
        installed: !!config,
        model: config?.model || '',
        baseUrl: config?.baseUrl || '',
        agentCount: agents.length,
        agents: agents.map(a => ({ id: a.id, name: a.name }))
      };
    });
      // 自定义 → 用户配置的 API
    ipcMain.handle('pet-settings-fetch-models', async (e, config) => {
      const baseUrl = (config?.baseUrl || '').replace(/\/+$/, '');
      const apiKey = config?.apiKey || '';
      if (!baseUrl) {
        return { success: false, error: '未填填写 Base URL' };
      }
      try {
        const response = await fetch(`${baseUrl}/v1/models`, {
          method: 'GET',
          headers: {
            'Authorization': apiKey ? `Bearer ${apiKey}` : '',
            'Content-Type': 'application/json'
          }
        });
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 200) || response.statusText}` };
        }
        const data = await response.json();
        const models = data.data || data.models || [];
        // 兼容不同 API 格式
    const list = models.map(m => ({ id: m.id || m.name || m.model_id || 'unknown' }));
        list.sort((a, b) => a.id.localeCompare(b.id));
        return { success: true, models: list };
      } catch (error) {
        return { success: false, error: error.message || '请求异常' };
      }
    });
    ipcMain.handle('pet-reset-position', () => {
      const { width, height } = screen.getPrimaryDisplay().workAreaSize;        
      const x = width - 120, y = height - 150;
      this.savePosition(x, y);
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        this.petWindow.setPosition(x, y);
      }
      return { success: true };
    });
    ipcMain.handle('pet-settings-close', () => {
      if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
        this.settingsWindow.close();
      }
      return { success: true };
    });
  }
}
module.exports = PetManager;
