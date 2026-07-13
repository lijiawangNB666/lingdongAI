// ===========================
// 灵动AI - by Li（独立开发）
// renderer.js
// ===========================



// ===== Agent Avatar Functions =====
var currentAgentAvatar = null;

// ===== 苹果风格全局样式注入 =====
(function injectAppleStyle() {
  var style = document.createElement('style');
  style.textContent = `
    :root {
      --apple-blue: #007AFF;
      --apple-green: #34C759;
      --apple-red: #FF3B30;
      --apple-orange: #FF9500;
      --apple-purple: #AF52DE;
      --apple-gray: #8E8E93;
      --apple-bg: #F5F5F7;
      --apple-card: rgba(255,255,255,0.72);
      --apple-card-border: rgba(255,255,255,0.4);
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.08);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.04);
      --shadow-lg: 0 12px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04);
      --radius-sm: 10px;
      --radius-md: 14px;
      --radius-lg: 20px;
      --radius-xl: 28px;
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif; }
    /* 毛玻璃卡片 */
    .glass-card {
      background: var(--apple-card);
      backdrop-filter: blur(20px) saturate(1.8);
      -webkit-backdrop-filter: blur(20px) saturate(1.8);
      border: 1px solid var(--apple-card-border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-md);
    }
    /* 消息气泡苹果化 */
    .message { animation: msgSlideIn 0.35s cubic-bezier(0.22, 1, 0.36, 1); }
    @keyframes msgSlideIn {
      from { opacity: 0; transform: translateY(12px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .message-bubble {
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm);
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .message-bubble:hover { transform: translateY(-1px); box-shadow: var(--shadow-md); }
    .message.user .message-bubble {
      background: linear-gradient(135deg, #007AFF 0%, #5856D6 100%);
      color: #fff;
      border-bottom-right-radius: 4px;
    }
    .message.assistant .message-bubble {
      background: rgba(255,255,255,0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(0,0,0,0.06);
      border-bottom-left-radius: 4px;
    }
    /* 按钮苹果化 */
    button, .btn {
      border-radius: var(--radius-sm);
      font-weight: 500;
      letter-spacing: -0.01em;
      transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
    }
    button:active, .btn:active { transform: scale(0.96); }
    /* 输入框苹果化 */
    input, textarea, select {
      border-radius: var(--radius-sm);
      border: 1px solid rgba(0,0,0,0.08);
      background: rgba(255,255,255,0.6);
      backdrop-filter: blur(8px);
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: var(--apple-blue);
      box-shadow: 0 0 0 3px rgba(0,122,255,0.15);
    }
    /* 侧边栏 */
    .sidebar, aside {
      background: rgba(250,250,252,0.9) !important;
      backdrop-filter: blur(24px) saturate(1.6);
      -webkit-backdrop-filter: blur(24px) saturate(1.6);
      border-right: 1px solid rgba(0,0,0,0.05);
    }
    /* 思考动画 */
    .thinking-dot {
      display: inline-block;
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--apple-blue);
      animation: thinkingBounce 1.4s ease-in-out infinite both;
      margin: 0 1px;
    }
    .thinking-dot:nth-child(1) { animation-delay: -0.32s; }
    .thinking-dot:nth-child(2) { animation-delay: -0.16s; }
    @keyframes thinkingBounce {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }
    /* SVG/Chart 容器 */
    .inline-svg, .inline-chart {
      border-radius: var(--radius-md);
      overflow: hidden;
      box-shadow: var(--shadow-sm);
      margin: 8px 0;
    }
    /* 滚动条美化 */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.25); }
    /* Toast */
    .toast-apple {
      background: rgba(30,30,30,0.88) !important;
      backdrop-filter: blur(16px) !important;
      -webkit-backdrop-filter: blur(16px) !important;
      border-radius: var(--radius-xl) !important;
      box-shadow: var(--shadow-lg) !important;
      padding: 12px 24px !important;
    }
  `;
  document.head.appendChild(style);
})();


window.selectAvatarFile = function() {
  document.getElementById('avatarFileInput').click();
};

window.handleAvatarSelect = async function(event) {
  var file = event.target.files[0];
  if (!file) return;
  
  // 检查文件类型
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件', 'error');
    return;
  }
  
  // 检查文件大小 (限制 2MB)
  if (file.size > 2 * 1024 * 1024) {
    showToast('图片大小不能超过 2MB', 'error');
    return;
  }
  
  try {
    // 读取文件为 base64
    var reader = new FileReader();
    reader.onload = function(e) {
      var base64 = e.target.result;
      currentAgentAvatar = base64;
      updateAvatarPreview(base64);
      showToast('头像已选择，保存后生效', 'success');
    };
    reader.readAsDataURL(file);
  } catch(e) {
    showToast('读取图片失败: ' + e.message, 'error');
  }
  
  // 清空 input 以便重复选择同一文件
  event.target.value = '';
};

window.removeAvatar = function() {
  currentAgentAvatar = null;
  var preview = document.getElementById('avatarPreview');
  if (preview) {
    preview.innerHTML = '🤖';
  }
  showToast('头像已移除，保存后生效', 'info');
};

function updateAvatarPreview(src) {
  var preview = document.getElementById('avatarPreview');
  if (preview && src) {
    preview.innerHTML = '<img src="' + src + '" alt="avatar">';
  } else if (preview) {
    preview.innerHTML = '🤖';
  }
}

var AGENT_SVG_ICONS = {
  'default': '<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="10" r="5" fill="white" opacity="0.9"/><path d="M6 26c0-5.5 4.5-10 10-10s10 4.5 10 10" fill="white" opacity="0.7"/><circle cx="11" cy="9" r="1.2" fill="rgba(0,0,0,0.15)"/><circle cx="21" cy="9" r="1.2" fill="rgba(0,0,0,0.15)"/></svg>',
  'meeting-assistant': '<svg viewBox="0 0 32 32" fill="none"><rect x="6" y="4" width="20" height="24" rx="2" fill="white" opacity="0.9"/><line x1="10" y1="10" x2="22" y2="10" stroke="rgba(0,0,0,0.15)" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="14" x2="22" y2="14" stroke="rgba(0,0,0,0.15)" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="18" x2="18" y2="18" stroke="rgba(0,0,0,0.15)" stroke-width="1.5" stroke-linecap="round"/><circle cx="24" cy="22" r="5" fill="white" opacity="0.9"/><polygon points="23,20 23,24 26,22" fill="rgba(0,0,0,0.2)"/></svg>',
  'form-filler': '<svg viewBox="0 0 32 32" fill="none"><rect x="5" y="3" width="22" height="26" rx="2" fill="white" opacity="0.9"/><rect x="9" y="8" width="14" height="3" rx="1" fill="rgba(0,0,0,0.1)"/><rect x="9" y="13" width="14" height="3" rx="1" fill="rgba(0,0,0,0.1)"/><rect x="9" y="18" width="10" height="3" rx="1" fill="rgba(0,0,0,0.1)"/><circle cx="24" cy="24" r="4" fill="white" opacity="0.9"/><path d="M22 24l1.5 1.5 3-3" stroke="rgba(0,0,0,0.2)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'generic': '<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="10" r="5" fill="white" opacity="0.9"/><path d="M6 26c0-5.5 4.5-10 10-10s10 4.5 10 10" fill="white" opacity="0.7"/><rect x="10" y="22" width="12" height="2" rx="1" fill="rgba(0,0,0,0.1)"/></svg>'
};

var AGENT_COLORS = [
  ['#6366f1','#8b5cf6'], ['#06b6d4','#3b82f6'], ['#10b981','#06b6d4'],
  ['#f59e0b','#ef4444'], ['#ec4899','#8b5cf6'], ['#6366f1','#a855f7'],
  ['#14b8a6','#0d9488'], ['#f97316','#ef4444']
];

function getAgentAvatarHtml(agent, size) {
  var s = size || 48;
  if (agent.avatar) {
    return '<div class="agent-card-avatar" style="width:'+s+'px;height:'+s+'px;"><img src="' + agent.avatar + '" alt="avatar"></div>';
  }
  var svg = AGENT_SVG_ICONS[agent.id] || AGENT_SVG_ICONS['generic'];
  var ci = Math.abs((agent.id||'').split('').reduce(function(a,c){return a+c.charCodeAt(0);},0)) % AGENT_COLORS.length;
  var c = AGENT_COLORS[ci];
  var inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return '<div class="agent-card-avatar" style="background:linear-gradient(135deg,'+c[0]+','+c[1]+');border-radius:50%;width:'+s+'px;height:'+s+'px;display:flex;align-items:center;justify-content:center;">' +
    '<svg viewBox="0 0 32 32" fill="none" style="width:'+(s*0.7)+'px;height:'+(s*0.7)+'px;">' + inner + '</svg></div>';
}


// ===== 导航 =====
var menuItems = document.querySelectorAll('.menu-item');
var pages = document.querySelectorAll('.page');
var pageTitle = document.getElementById('pageTitle');
var headerIcon = document.getElementById('headerIcon');
var pageIcons = { chat: '💬', agent: '🤖', skills: '🛠', settings: '⚙️', stats: '📊' };

function navigateTo(page) {
  // Delegate UI state to Vue when available
  if (typeof window._vueNavigateTo === 'function') {
    window._vueNavigateTo(page);
  }
  // Still handle core functionality loading
  if (page === 'settings') loadConfig();
  else if (page === 'agent') loadAgents();
  else if (page === 'skills') loadSkills();
  else if (page === 'stats') loadStats();
  else if (page === 'sessions') {
    // Vue 切换页面后 DOM 才就绪，延迟渲染；用 window.renderSessionsList（直接读文件渲染）
    setTimeout(function(){ if (window.renderSessionsList) window.renderSessionsList(); }, 80);
    setTimeout(function(){ if (window.renderSessionsList) window.renderSessionsList(); }, 250);
  }
}

// ===== 主题 =====
window.toggleTheme = function() {
  // Delegate to Vue when available
  if (typeof window._vueToggleTheme === 'function') {
    window._vueToggleTheme();
    return;
  }
  var body = document.body;
  var btn = document.getElementById('themeBtn');
  if (body.getAttribute('data-theme') === 'light') {
    body.removeAttribute('data-theme');
    if (btn) btn.textContent = '🌙';
    localStorage && localStorage.setItem('theme','dark');
  } else {
    body.setAttribute('data-theme','light');
    if (btn) btn.textContent = '☀️';
    localStorage && localStorage.setItem('theme','light');
  }
};
(function() {
  try { if (localStorage && localStorage.getItem('theme') === 'light') { document.body.setAttribute('data-theme','light'); var btn = document.getElementById('themeBtn'); if(btn) btn.textContent='☀️'; } } catch(e){}
})();

// ===== Toast =====
function showToast(msg, type) {
  if (!type) type = 'success';
  var toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:' + (type==='error'?'#ef4444':'#10b981') + ';color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:400px;word-break:break-all;';
  document.body.appendChild(toast);
  setTimeout(function() { if(toast.parentNode) toast.remove(); }, type==='error' ? 5000 : 3000);
}

// ===== 配置 =====
async function loadConfig() {
  try {
    var config = await window.electronAPI.getConfig();
    var m = (config && config.model) || {};
    var el = function(id) { return document.getElementById(id); };
    if (el('provider')) el('provider').value = m.provider || 'custom';
    if (el('apiKey')) el('apiKey').value = m.apiKey || '';
    if (el('model')) el('model').value = m.model || '';
    if (el('baseUrl')) el('baseUrl').value = m.baseUrl || '';
    if (el('contextLimit')) el('contextLimit').value = (config && config.contextLimit) || 20;
    if (el('groupContextLimit')) el('groupContextLimit').value = (config && config.groupContextLimit) || 30;
  } catch(e) { console.error('loadConfig error:', e); }
}

var testBtn = document.getElementById('testBtn');
window.testConnection = async function() {
  var apiKey = (document.getElementById('apiKey') || {}).value || '';
  var model = (document.getElementById('model') || {}).value || '';
  var baseUrl = ((document.getElementById('baseUrl') || {}).value || '').replace(/\/$/, '');
  if (!baseUrl) { showToast('❌ 请先填写 Base URL', 'error'); return; }
  if (testBtn) { testBtn.disabled = true; testBtn.textContent = '测试中...'; }
  try {
    var result = await window.electronAPI.testConnection({ apiKey: apiKey, model: model, baseUrl: baseUrl });
    var statusEl = document.getElementById('testStatus');
    if (statusEl) {
      statusEl.classList.remove('hidden');
      statusEl.className = 'status-text ' + (result.success ? 'status-success' : 'status-error');
      statusEl.textContent = result.success ? '✅ 连接成功！' : '❌ 连接失败：' + (result.error || '未知错误');
      setTimeout(function() { statusEl.classList.add('hidden'); }, 4000);
    }
  } catch(e) {
    showToast('❌ 测试出错：' + e.message, 'error');
  }
  if (testBtn) { testBtn.disabled = false; testBtn.textContent = '🔗 测试连接'; }
};
if (testBtn) {
  testBtn.addEventListener('click', window.testConnection);
}

var saveBtn = document.getElementById('saveBtn');
window.saveSettings = async function() {
  try {
    var config = await window.electronAPI.getConfig();
    if (!config) config = {};
    if (!config.model) config.model = {};
    config.model.provider = (document.getElementById('provider') || {}).value || 'custom';
    config.model.apiKey = (document.getElementById('apiKey') || {}).value || '';
    config.model.model = (document.getElementById('model') || {}).value || '';
    config.model.baseUrl = ((document.getElementById('baseUrl') || {}).value || '').replace(/\/$/, '');
    var _cl = parseInt((document.getElementById('contextLimit') || {}).value, 10);
    if (isNaN(_cl) || _cl < 2) _cl = 20;
    if (_cl > 200) _cl = 200;
    config.contextLimit = _cl;
    var _gcl = parseInt((document.getElementById('groupContextLimit') || {}).value, 10);
    if (isNaN(_gcl) || _gcl < 2) _gcl = 30;
    if (_gcl > 200) _gcl = 200;
    config.groupContextLimit = _gcl;
    var result = await window.electronAPI.saveConfig(config);
    var statusEl = document.getElementById('saveStatus');
    if (statusEl) {
      statusEl.classList.remove('hidden');
      statusEl.className = 'status-text ' + (result.success ? 'status-success' : 'status-error');
      statusEl.textContent = result.success ? '✅ 配置已保存！' : '❌ 保存失败：' + (result.error || '');
      setTimeout(function() { statusEl.classList.add('hidden'); }, 3000);
    }
    if (result.success) showToast('✅ 配置已保存！');
  } catch(e) {
    showToast('❌ 保存出错：' + e.message, 'error');
  }
};
if (saveBtn) {
  saveBtn.addEventListener('click', window.saveSettings);
}

// 获取模型列表（全局函数，供 onclick 调用）
window.fetchAvailableModels = async function() {
  var apiKey = (document.getElementById('apiKey') || {}).value || '';
  var baseUrl = ((document.getElementById('baseUrl') || {}).value || '').replace(/\/$/, '');
  if (!baseUrl) { showToast('❌ 请先填写 Base URL', 'error'); return; }
  var statusEl = document.getElementById('modelsStatus');
  if (statusEl) { statusEl.textContent = '⏳ 获取中...'; statusEl.className = 'status-text'; statusEl.classList.remove('hidden'); }
  try {
    var result = await window.electronAPI.listModels({ apiKey: apiKey, baseUrl: baseUrl });
    var selectEl = document.getElementById('modelSelect');
    if (result.success && result.models && result.models.length > 0) {
      if (selectEl) {
        selectEl.innerHTML = '<option value="">-- 选择模型 --</option>' + result.models.map(function(m) { return '<option value="' + m + '">' + m + '</option>'; }).join('');
        selectEl.style.display = '';
        selectEl.onchange = function() {
          var modelInput = document.getElementById('model');
          if (modelInput && selectEl.value) modelInput.value = selectEl.value;
        };
      }
      if (statusEl) { statusEl.className = 'status-text status-success'; statusEl.textContent = '✅ 获取到 ' + result.models.length + ' 个模型'; }
    } else {
      if (statusEl) { statusEl.className = 'status-text status-error'; statusEl.textContent = '❌ ' + (result.error || '获取失败'); }
    }
  } catch(e) {
    if (statusEl) { statusEl.className = 'status-text status-error'; statusEl.textContent = '❌ 出错：' + e.message; }
  }
};
var fetchModelsBtn = document.getElementById('fetchModelsBtn');
if (fetchModelsBtn) fetchModelsBtn.addEventListener('click', window.fetchAvailableModels);

// ===== 核心对话变量 =====
var messagesDiv = null;
var input = null;
var sendBtn2 = null;
var agentIndicator = null;
var currentAgentName = null;

function initDomElements() {
  messagesDiv = document.getElementById('messages') || messagesDiv;
  input = document.getElementById('input') || input;
  sendBtn2 = document.getElementById('sendBtn') || sendBtn2;
  agentIndicator = document.getElementById('agentIndicator') || agentIndicator;
  currentAgentName = document.getElementById('currentAgentName') || currentAgentName;
}

function getInput() {
  initDomElements();
  return input;
}

// ===== 【对话界面】独立状态（与群聊完全隔离）=====
var conversationHistory = [];   // 仅属于"对话"页面
var currentAgent = null;
var agentLocked = false;
var availableAgents = [];
var isMeetingMode = false;
var attachedFiles = []; // 已附加的文件列表
var isSending = false;
var _abortController = null; // 停止生成控制器
var _streamingBubble = null; // 当前流式输出气泡
var _streamingContent = ''; // 流式累积内容
var _savedChatMessages = null; // 🔧 [v1.3.4] 切换Agent前保存的消息（用于恢复）
var _savedChatHistory = null; // 🔧 [v1.3.4] 切换Agent前保存的conversationHistory
var _streamCompleted = false; // 🔧 [v1.3.5] 标记流式输出是否已完成（防止二次输出）
var _lastStreamedReply = ''; // 🔧 [v1.3.5] 最后一次流式输出的完整内容（用于保存到历史）

// ===== 【群聊】完全独立的状态（绝不污染对话变量）=====
// 每个群聊对象: {id, name, agents, messages, conversationHistory, createdAt}
var groupChats = [];
var currentGroupChat = null;   // 当前活跃的群聊（与 currentAgent 完全无关）
var groupChatCounter = 0;

// ===== 群聊持久化：除非用户删除，否则一直保存 =====
window.persistGroupChats = function() {
  try {
    if (window.electronAPI && window.electronAPI.saveGroupChats) {
      window.electronAPI.saveGroupChats(JSON.parse(JSON.stringify(groupChats)));
    }
  } catch(e) { console.error('persistGroupChats error:', e); }
};
window.loadGroupChatsFromDisk = async function() {
  try {
    if (!window.electronAPI || !window.electronAPI.getGroupChats) return;
    var r = await window.electronAPI.getGroupChats();
    if (r && r.success && Array.isArray(r.groupChats)) {
      groupChats = r.groupChats;
      if (typeof renderGroupChatSidebar === 'function') renderGroupChatSidebar();
    }
  } catch(e) { console.error('loadGroupChatsFromDisk error:', e); }
};

// ===== 群聊独立的 sending 状态（不影响对话输入框）=====
var gcIsSending = false;

// ===== 趣味加载文案 =====
var funnyLoadingTexts = [
  "老板正在盯着我改 bug，要加油呀",
  "今日任务：和 bug 决一死战",
  "代码一时爽，改 bug 火葬场",
  "需求一改，原地白干",
  "我不是在写代码，是在编织 BUG",
  "程序没报错，全靠运气撑着",
  "下班可以晚点，bug 必须今天完",
  "脑袋空空，代码冲冲",
  "产品一句话，开发熬通宵",
  "表面敲代码，内心在发疯",
  "bug 千千万，改完还有万万千",
  "逻辑全靠猜，运行全靠蒙",
  "又是为爱发电写代码的一天",
  "注释懒得写，日后随缘懂",
  "本地跑通，线上崩盘",
  "不求功能完美，只求别出故障",
  "加班标配：咖啡 + 改 bug",
  "需求无止境，头发有尽头",
  "别催了，bug 比我还倔强",
  "代码写完了，心态快崩了",
  "一生要强的后端，绝不认输",
  "前端调样式，调到想辞职",
  "测试一出手，bug 遍地走",
  "看似坐着上班，实则脑力搬砖",
  "版本一更新，问题全刷新",
  "我不生产 bug，只是 bug 的搬运工",
  "熬最晚的夜，改最离谱的 bug",
  "老板在身后，代码不敢划水",
  "架构很完美，实现全拉胯",
  "变量随便取，报错不心虚",
  "上线五分钟，排查一整天",
  "打工写代码，只求不翻车",
  "思路已断线，编码已摆烂",
  "隔壁在聊天，我在改连环 bug",
  "愿世间没有逻辑漏洞",
  "键盘敲得响，摸鱼没人讲",
  "新 bug 已上线，旧 bug 还没修",
  "认真改 bug，假装很努力",
  "代码可以糙，不能崩服务",
  "沉浸改 bug，与世隔绝中",
  "以为写完了，实则刚起步",
  "只要不报错，怎么写都对",
  "研发的日常：踩坑、填坑、再踩坑",
  "盯着屏幕发呆，思考 bug 何来",
  "今天不内卷，只专心修 bug",
  "需求反复横跳，开发原地暴躁",
  "小小 bug，拿捏住了",
  "头发日渐稀少，代码日渐复杂",
  "稳住别慌，bug 总能修好",
  "专心搬砖写代码，远离世间烦心事"
];
var loadingTextTimer = null;
var loadingTextIndex = 0;

// ===== 消息渲染 =====
function renderMarkdown(text) {
  if (!text) return '';

  // ===== 1. 折叠 <think>...</think> 思考过程 =====
  var thinkRe = new RegExp('<think>([\\s\\S]*?)<\\/think>', 'gi');
  text = text.replace(thinkRe, function(_, thinkContent) {
    var trimmed = thinkContent.trim();
    if (!trimmed) return '';
    return '<details class="ai-think-block" style="margin:6px 0;padding:6px 10px;background:#F9FAFB;border-left:3px solid #9CA3AF;border-radius:4px;font-size:12px;color:#6B7280;">' +
           '<summary style="cursor:pointer;user-select:none;font-weight:500;">💭 思考过程</summary>' +
           '<div style="margin-top:6px;white-space:pre-wrap;line-height:1.5;">' + escapeHtml(trimmed) + '</div>' +
           '</details>';
  });

  // ===== 2. 剥除 tool_call 伪标签 =====
  text = text.replace(new RegExp('<tool_call>[\\s\\S]*?<\\/tool_call>', 'gi'), '');
  text = text.replace(new RegExp('<tool_call\\s*\\([\\s\\S]*?\\)\\s*$', 'gim'), '');
  text = text.replace(new RegExp('<tool_call[^>]*>[\\s\\S]*?(?=<|$)', 'gi'), '');
  text = text.replace(new RegExp('<tool\\s+call\\s*=\\s*"[^"]*"[^>]*>[\\s\\S]*?(?=<|$)', 'gi'), '');

  // ===== 3. 使用 marked 渲染 Markdown =====
  if (typeof marked !== 'undefined') {
    try {
      // 配置 marked
      if (!renderMarkdown._configured) {
        marked.setOptions({
          breaks: true,
          gfm: true
        });
        if (typeof hljs !== 'undefined') {
          marked.setOptions({
            highlight: function(code, lang) {
              if (lang && hljs.getLanguage(lang)) {
                try {
                  return hljs.highlight(code, { language: lang }).value;
                } catch (e) {}
              }
              try {
                return hljs.highlightAuto(code).value;
              } catch (e) {}
              return code;
            }
          });
        }
        renderMarkdown._configured = true;
      }
      // 用 marked.parse 处理，使用异步版本的回退
      var mdResult = marked.parse(text);
      if (mdResult && typeof mdResult === 'string') {
        // 包装表格
        mdResult = mdResult.replace(/<table>/g, '<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:13px;">');
        mdResult = mdResult.replace(/<th>/g, '<th style="border:1px solid #E5E7EB;padding:6px 10px;background:#F3F4F6;text-align:left;">');
        mdResult = mdResult.replace(/<td>/g, '<td style="border:1px solid #E5E7EB;padding:6px 10px;">');
        return mdResult;
      }
    } catch (e) {
      console.warn('[Markdown] marked 渲染失败，回退到纯文本:', e.message);
    }
  }

  // ===== 4. 回退：简单 Markdown 渲染 =====
  text = text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,'<em>$1</em>')
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/^### (.*)/gm,'<h3>$1</h3>')
    .replace(/^## (.*)/gm,'<h2>$1</h2>')
    .replace(/^# (.*)/gm,'<h1>$1</h1>')
    .replace(/^[-*] (.*)/gm,'<li>$1</li>')
    .replace(/\n/g,'<br>');
  return text;
}
renderMarkdown._configured = false;


// ===== 附件上传功能 =====
window.triggerAttach = function() {
  var inp = document.getElementById('attachFileInput');
  if (inp) { inp.value = ''; inp.click(); }
};

window.handleAttachSelect = function(event) {
  var files = Array.from(event.target.files || []);
  if (!files.length) return;
  files.forEach(function(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      attachedFiles.push({ name: file.name, type: file.type, size: file.size, data: e.target.result });
      renderAttachPreview();
    };
    reader.readAsDataURL(file);
  });
  event.target.value = '';
};

function renderAttachPreview() {
  var container = document.getElementById('attachPreview');
  if (!container) return;
  if (!attachedFiles.length) { container.className = 'attach-preview empty'; container.innerHTML = ''; return; }
  container.className = 'attach-preview';
  container.innerHTML = attachedFiles.map(function(f, i) {
    var icon = f.type.startsWith('image/') ? '🖼' : f.type.includes('pdf') ? '📄' : f.type.includes('text') ? '📝' : '📎';
    return '<div class="attach-item">' + icon + ' <span class="attach-name" title="' + f.name + '">' + f.name + '</span>' +
      '<span class="attach-remove" onclick="removeAttach(' + i + ')">✕</span></div>';
  }).join('');
}

window.removeAttach = function(idx) {
  attachedFiles.splice(idx, 1);
  renderAttachPreview();
};

function getAttachContext() {
  if (!attachedFiles.length) return '';
  return attachedFiles.map(function(f) {
    if (f.type.startsWith('image/')) {
      return '[图片附件: ' + f.name + ']';
    }
    // 对于文本类文件，尝试提取内容
    return '[附件: ' + f.name + ']';
  }).join('\n');
}



// ===== 任务进度条 =====
var progressTimer = null;
var progressVal = 0;

function getRandomLoadingText() {
  var idx = Math.floor(Math.random() * funnyLoadingTexts.length);
  return funnyLoadingTexts[idx];
}

function startLoadingText() {
  stopLoadingText();
  var indicator = document.getElementById('typingIndicator');
  if (!indicator) return;
  var textSpan = indicator.querySelector('#tp-text');
  if (textSpan) textSpan.textContent = '💭 ' + getRandomLoadingText();
  loadingTextTimer = setInterval(function() {
    var indicator2 = document.getElementById('typingIndicator');
    if (!indicator2) { stopLoadingText(); return; }
    var textSpan2 = indicator2.querySelector('#tp-text');
    if (textSpan2) {
      textSpan2.textContent = '💭 ' + getRandomLoadingText();
    }
  }, 3000);
}

function stopLoadingText() {
  if (loadingTextTimer) { clearInterval(loadingTextTimer); loadingTextTimer = null; }
}

function startProgress() {
  var bar = document.getElementById('taskProgressBar');
  var fill = document.getElementById('taskProgressFill');
  if (!bar || !fill) return;
  progressVal = 0;
  fill.style.width = '0%';
  fill.style.transition = 'none';
  bar.classList.add('visible');
  clearInterval(progressTimer);
  // 模拟进度：前8秒涨到80%，之后缓慢涨
  var start = Date.now();
  progressTimer = setInterval(function() {
    var elapsed = (Date.now() - start) / 1000;
    if (elapsed < 8) {
      progressVal = Math.min(80, elapsed / 8 * 80);
    } else {
      progressVal = Math.min(95, 80 + (elapsed - 8) / 20 * 15);
    }
    fill.style.transition = 'width 0.4s ease';
    fill.style.width = progressVal.toFixed(1) + '%';
  }, 500);
}

function stopProgress() {
  clearInterval(progressTimer);
  stopLoadingText();
  var bar = document.getElementById('taskProgressBar');
  var fill = document.getElementById('taskProgressFill');
  if (!fill) return;
  fill.style.transition = 'width 0.3s ease';
  fill.style.width = '100%';
  setTimeout(function() {
    if (bar) bar.classList.remove('visible');
    fill.style.width = '0%';
  }, 400);
}

var _avatarUid = 0;

function addMessage(role, content) {
  initDomElements();
  var msg = document.createElement('div');
  msg.className = 'message ' + role;
  // Apple风格：消息出现动画
  msg.style.opacity = '0';
  msg.style.transform = 'translateY(8px)';
  msg.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
  
  var avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  if (role === 'user') {
    // 用户头像：简洁的蓝色渐变圆形
    var uid = 'u' + (++_avatarUid);
    avatar.innerHTML = '<svg viewBox="0 0 32 32" fill="none" style="width:100%;height:100%;"><defs><linearGradient id="'+uid+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#007AFF"/><stop offset="100%" stop-color="#5856D6"/></linearGradient></defs><circle cx="16" cy="16" r="15" fill="url(#'+uid+')"/><text x="16" y="21" text-anchor="middle" fill="white" font-size="14" font-weight="600" font-family="-apple-system,sans-serif">我</text></svg>';
  } else {
    // 助手头像：简洁的绿色渐变圆形 + 图标
    var agentAv = window._currentAgentAvatarUrl;
    if (agentAv) {
      avatar.innerHTML = '<img src="' + agentAv + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">';
    } else {
      var aid = 'a' + (++_avatarUid);
      avatar.innerHTML = '<svg viewBox="0 0 32 32" fill="none" style="width:100%;height:100%;"><defs><linearGradient id="'+aid+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#30D158"/><stop offset="100%" stop-color="#34C759"/></linearGradient></defs><circle cx="16" cy="16" r="15" fill="url(#'+aid+')"/><text x="16" y="21" text-anchor="middle" fill="white" font-size="14" font-weight="600" font-family="-apple-system,sans-serif">AI</text></svg>';
    }
  }
  var bubbleWrap = document.createElement('div');
  bubbleWrap.style.cssText = 'flex:1;min-width:0;max-width:480px;overflow:hidden;';
  var bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  // [v1.2.1] 用户消息不需要 Markdown 渲染，只有 AI 输出才需要
  bubble.innerHTML = role === 'user' ? escapeHtml(content) : renderMarkdown(content);
  bubbleWrap.appendChild(bubble);
  if (role === 'user') { msg.appendChild(avatar); msg.appendChild(bubbleWrap); }
  else { msg.appendChild(avatar); msg.appendChild(bubbleWrap); }
  var container = document.getElementById('messages') || messagesDiv;
  if (container) { container.appendChild(msg); container.scrollTop = container.scrollHeight; messagesDiv = container; }
  
  // 触发动画
  requestAnimationFrame(function() {
    msg.style.opacity = '1';
    msg.style.transform = 'translateY(0)';
  });
  
  return bubble;
}

// ===== 打字机流式输出 =====
// 全局打字机状态
var _typewriterTimer = null;
var _typewriterBubble = null;
var _typewriterMsgEl = null;

/**
 * 流式添加消息（带打字机效果）
 * @param {string} role - 'user' | 'assistant'
 * @param {string} content - 完整文本内容
 * @param {Object} options - { speed: number, onComplete: function }
 * @returns {HTMLElement} 消息气泡元素
 */

/**
 * 将文本流式写入目标元素（用于规划进度气泡的最终回复区）
 */
function _streamToElement(targetEl, content, speed, onComplete) {
  if (!targetEl || !content) return;
  speed = speed || 12;
  targetEl.textContent = '';
  var i = 0;
  var chars = content;
  var timer = setInterval(function() {
    if (i >= chars.length) {
      clearInterval(timer);
      targetEl.innerHTML = renderMarkdown(content);
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    // 每次输出1-3个字符（模拟打字机效果）
    var chunk = 1;
    if (chars.charCodeAt(i) > 127) chunk = 1; // 中文字符一次一个
    else chunk = Math.min(3, chars.length - i);
    targetEl.textContent += chars.slice(i, i + chunk);
    i += chunk;
    // 滚动父容器
    var msgBox = document.getElementById('messages');
    if (msgBox) msgBox.scrollTop = msgBox.scrollHeight;
  }, speed);
  // 存引用以便停止
  window._typewriterTimer = timer;
}

function addStreamingMessage(role, content, options) {
  options = options || {};
  var speed = options.speed || 15; // 每个字符的毫秒数（中文约2-3字/帧，英文约5-8字/帧）
  var onComplete = options.onComplete || null;
  
  // 先移除之前的打字机
  stopTypewriter();

  // 创建消息元素（复用 addMessage 的头像逻辑）
  initDomElements();
  var msg = document.createElement('div');
  msg.className = 'message ' + role;
  msg.style.opacity = '0';
  msg.style.transform = 'translateY(8px)';
  msg.style.transition = 'opacity 0.25s ease, transform 0.25s ease';

  // 头像
  var avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  if (role === 'user') {
    var uid = 'u' + (++_avatarUid);
    avatar.innerHTML = '<svg viewBox="0 0 32 32" fill="none" style="width:100%;height:100%;"><defs><linearGradient id="'+uid+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#007AFF"/><stop offset="100%" stop-color="#5856D6"/></linearGradient></defs><circle cx="16" cy="16" r="15" fill="url(#'+uid+')"/><text x="16" y="21" text-anchor="middle" fill="white" font-size="14" font-weight="600" font-family="-apple-system,sans-serif">我</text></svg>';
  } else {
    var aid = 'a' + (++_avatarUid);
    var agentAv = window._currentAgentAvatarUrl;
    if (agentAv) {
      avatar.innerHTML = '<img src="' + agentAv + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">';
    } else {
      avatar.innerHTML = '<svg viewBox="0 0 32 32" fill="none" style="width:100%;height:100%;"><defs><linearGradient id="'+aid+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#30D158"/><stop offset="100%" stop-color="#34C759"/></linearGradient></defs><circle cx="16" cy="16" r="15" fill="url(#'+aid+')"/><text x="16" y="21" text-anchor="middle" fill="white" font-size="14" font-weight="600" font-family="-apple-system,sans-serif">AI</text></svg>';
    }
  }

  // 气泡
  var bubbleWrap = document.createElement('div');
  bubbleWrap.style.cssText = 'flex:1;min-width:0;max-width:480px;overflow:hidden;';
  var bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  
  // 初始为空，打字机会逐步填充
  bubble.innerHTML = '';
  bubbleWrap.appendChild(bubble);

  msg.appendChild(avatar);
  msg.appendChild(bubbleWrap);

  // 插入到消息列表
  var container = document.getElementById('messages') || messagesDiv;
  if (container) {
    container.appendChild(msg);
    messagesDiv = container;
  }

  // 触发出现动画
  requestAnimationFrame(function() {
    msg.style.opacity = '1';
    msg.style.transform = 'translateY(0)';
    container.scrollTop = container.scrollHeight;
  });

  // 保存引用
  _typewriterBubble = bubble;
  _typewriterMsgEl = msg;

  // 开始打字机效果
  var rawText = content;
  var pos = 0;
  var isChinese = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/;
  
  // 使用文本节点逐字输出（比 innerHTML 更高效）
  var textNode = document.createTextNode('');
  bubble.appendChild(textNode);

  _typewriterTimer = setInterval(function() {
    if (pos >= rawText.length) {
      stopTypewriter();
      // 打字完成后渲染 Markdown
      bubble.innerHTML = renderMarkdown(content);
      if (onComplete) onComplete(bubble);
      return;
    }

    // 动态调整速度：标点符号后稍慢，普通字符正常
    var char = rawText[pos];
    var step = 1;
    
    // 中文字符：每次输出1个
    if (isChinese.test(char)) {
      step = 1;
    }
    // 英文按单词输出（遇到空格前的字母一起输出）
    else if (/[a-zA-Z0-9]/.test(char)) {
      // 收集连续的英文和数字
      while (pos + step < rawText.length && /[a-zA-Z0-9]/.test(rawText[pos + step])) {
        step++;
        if (step > 6) break; // 长单词分批输出
      }
      step++; // 包含空格或标点
    }
    // 标点符号单独处理（稍快）
    else {
      step = 1;
    }

    var chunk = rawText.substr(pos, step);
    textNode.textContent += chunk;
    pos += step;

    // 平滑滚动
    container.scrollTop = container.scrollHeight;
  }, speed);

  return bubble;
}

/**
 * 停止打字机效果并立即显示全部内容
 */
function stopTypewriter() {
  if (_typewriterTimer) {
    clearInterval(_typewriterTimer);
    _typewriterTimer = null;
  }
}

/**
 * 立即完成打字机（显示剩余所有文字）
 */
function finishTypewriter(content) {
  stopTypewriter();
  if (_typewriterBubble && content !== undefined) {
    _typewriterBubble.innerHTML = renderMarkdown(content);
  }
  _typewriterBubble = null;
  _typewriterMsgEl = null;
}

function addTypingIndicator() {
  removeTypingIndicator();
  _progressLog = []; // 每轮对话重置进度日志
  var indicator = document.createElement('div');
  indicator.className = 'message assistant';
  indicator.id = 'typingIndicator';
  indicator.innerHTML =
    '<div class="message-avatar"><svg viewBox="0 0 32 32" fill="none" style="width:100%;height:100%;"><circle cx="16" cy="16" r="16" fill="#06b6d4"/><circle cx="16" cy="10" r="5" fill="white" opacity="0.9"/><path d="M6 26c0-5.5 4.5-10 10-10s10 4.5 10 10" fill="white" opacity="0.7"/></svg></div>' +
    '<div style="flex:1;">' +
      '<div class="message-bubble">' +
        '<span id="tp-text" style="color:var(--accent);font-size:13px;">💭 ' + getRandomLoadingText() + '</span>' +
        '<div id="tp-progress" style="margin-top:6px;border-top:1px solid rgba(99,102,241,.15);padding-top:5px;display:none;"></div>' +
      '</div>' +
    '</div>';
  var container = document.getElementById('messages') || messagesDiv;
  if (container) { messagesDiv = container; container.appendChild(indicator); container.scrollTop = container.scrollHeight; }
  startLoadingText();
}

function removeTypingIndicator() {
  stopLoadingText();
  var ind = document.getElementById('typingIndicator');
  if (ind) ind.remove();
}

// ===== 工具图标映射 =====
var TOOL_ICONS = {
  file_read:'📄 读取文件', file_write:'💾 写入文件', file_list:'📁 列出目录',
  file_delete:'🗑 删除文件', create_folder:'📂 创建文件夹', execute_command:'⚡ 执行命令',
  open_software:'🖥 打开软件', take_screenshot:'📸 截图', open_url:'🌐 打开网页',
  create_agent:'🤖 创建Agent', list_agents:'📋 列出Agent', get_agent:'🔍 获取Agent',
  update_agent:'✏️ 更新Agent', delete_agent:'🗑 删除Agent',
  search_meeting_notes:'🔍 搜索纪要', save_meeting_note:'📝 保存纪要',
  get_current_time:'🕐 获取时间', list_meeting_notes:'📋 列出纪要',
  read_source_file:'📄 读取源码', write_source_file:'💾 写入源码',
  patch_source_file:'🔧 修改源码', restart_app:'🔄 重启应用',
  call_agent:'🤝 调用Agent', list_available_tools:'🛠 查看工具列表',
  win_find_window:'🪟 查找窗口', win_activate_window:'🪟 激活窗口',
  win_send_keys:'⌨️ 发送按键', win_click:'🖱️ 鼠标点击',
  search_web:'🔎 网页搜索', fetch_url:'📥 抓取网页',
  run_ahk_script:'🤖 AHK脚本', ahk_find_window:'🪟 AHK查找窗口',
  ahk_send_input:'⌨️ AHK发送输入', ahk_click_control:'🖱️ AHK点击控件',
  organize_files:'📂 整理文件', mcp_call:'🔌 MCP调用'
};

// ===== 进度日志（每轮对话重置）=====
var _progressLog = [];

// 阶段图标映射
var PHASE_ICONS = {
  preparing: '⏳',
  executing: '⚡',
  verifying: '🔍',
  done: '✅',
  failed: '❌'
};

// 阶段文字映射
var PHASE_LABELS = {
  preparing: '准备中',
  executing: '执行中',
  verifying: '验证中',
  done: '完成',
  failed: '失败'
};

// 把工具进度追加显示在 typingIndicator 气泡文案后面
function updateProgressInTyping(phase, toolName, args, result) {
  var label = TOOL_ICONS[toolName] || ('🔧 ' + toolName);
  var progressArea = document.getElementById('tp-progress');
  if (!progressArea) return;

  // 查找或创建该工具的进度行
  var toolRowId = 'tp-row-' + toolName.replace(/[^a-zA-Z0-9]/g, '-');
  var toolRow = document.getElementById(toolRowId);

  if (phase === 'preparing') {
    progressArea.style.display = 'block';
    if (!toolRow) {
      toolRow = document.createElement('div');
      toolRow.id = toolRowId;
      toolRow.className = 'tp-tool-row';
      toolRow.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:2px;font-size:12px;';
      progressArea.appendChild(toolRow);
    }
    // 构建参数提示
    var argHint = '';
    if (args) {
      var k = Object.keys(args)[0];
      if (k) {
        var v = String(args[k]).slice(0, 30);
        argHint = '<span style="color:#6366f1;font-family:monospace;font-size:10px;margin-left:3px;">' + v + (String(args[k]).length > 30 ? '…' : '') + '</span>';
      }
    }
    toolRow.innerHTML = '<span id="' + toolRowId + '-spin">' + PHASE_ICONS.preparing + '</span>'
      + '<span id="' + toolRowId + '-lbl" style="color:#a5b4fc;font-weight:600;">' + label + '</span>'
      + '<span id="' + toolRowId + '-phase" style="color:#94a3b8;font-size:10px;margin-left:4px;">' + PHASE_LABELS.preparing + '</span>'
      + argHint;
    var container = document.getElementById('messages') || messagesDiv;
    if (container) container.scrollTop = container.scrollHeight;

  } else if (phase === 'executing') {
    if (toolRow) {
      var spin = toolRow.querySelector('#' + toolRowId + '-spin');
      var phaseLabel = toolRow.querySelector('#' + toolRowId + '-phase');
      if (spin) spin.textContent = PHASE_ICONS.executing;
      if (phaseLabel) phaseLabel.textContent = PHASE_LABELS.executing;
    }

  } else if (phase === 'verifying') {
    if (toolRow) {
      var spin3 = toolRow.querySelector('#' + toolRowId + '-spin');
      var phaseLabel3 = toolRow.querySelector('#' + toolRowId + '-phase');
      if (spin3) spin3.textContent = PHASE_ICONS.verifying;
      if (phaseLabel3) phaseLabel3.textContent = PHASE_LABELS.verifying;
    }

  } else if (phase === 'done') {
    var ok = !result || result.success !== false;
    if (toolRow) {
      var spin2 = toolRow.querySelector('#' + toolRowId + '-spin');
      var lbl = toolRow.querySelector('#' + toolRowId + '-lbl');
      var phaseLabel2 = toolRow.querySelector('#' + toolRowId + '-phase');
      if (spin2) spin2.textContent = ok ? PHASE_ICONS.done : PHASE_ICONS.failed;
      if (lbl) lbl.style.color = ok ? '#6ee7b7' : '#fca5a5';
      if (phaseLabel2) phaseLabel2.textContent = ok ? PHASE_LABELS.done : PHASE_LABELS.failed;
    }
    _progressLog.push({ label: label, ok: ok });
  }
}

function addToolCallBubble(toolName) {
  // 已被实时进度替代，兼容空实现
}

// ===== 注册实时工具进度监听 =====
(function setupToolProgress() {
  if (!window.electronAPI || !window.electronAPI.onToolProgress) return;
  window.electronAPI.onToolProgress(function(data) {
    updateProgressInTyping(data.phase, data.tool, data.args, data.result);
  });
})();

// ===== 修复问题4：输入框恢复 =====
function enableInput() {
  isSending = false;
  stopProgress();
  var inp = document.getElementById('input');
  if (inp) {
    inp.disabled = false;
    inp.style.pointerEvents = '';
    inp.style.opacity = '';
    inp.focus();
  }
  var sb = document.getElementById('sendBtn');
  if (sb) { sb.disabled = false; sb.style.display = ''; sb.style.visibility = ''; sb.style.opacity = ''; }
  var stopBtn2 = document.getElementById('stopBtn');
  if (stopBtn2) { stopBtn2.style.display = 'none'; }
  _abortController = null;
  // 同步缓存变量
  sendBtn2 = sb;
  input = inp;
}

function disableInput() {
  isSending = true;
  var inp = document.getElementById('input');
  if (inp) { inp.disabled = false; } // 保持可见，只禁用发送按钮
  var sb = document.getElementById('sendBtn');
  if (sb) { sb.disabled = true; sb.style.display = 'none'; }
  var stopBtn = document.getElementById('stopBtn');
  if (stopBtn) { stopBtn.style.display = 'flex'; }
  // 同步缓存变量
  sendBtn2 = sb;
  input = inp;
}

// ===== 流式 token 渲染（替代打字机效果）=====
/**
 * 追加一个 token 到流式气泡
 * 首 token 时自动创建气泡，后续 token 直接追加到文本节点
 */
function _appendStreamingToken(token) {
  if (!token) return;

  // 🔧 [v1.3.3] 优先输出到计划进度气泡的最终结果区
  if (_planLogMsg && _planLogMsg.parentNode) {
    var finalArea = _planLogMsg.querySelector('.plan-final-result');
    if (finalArea) {
      if (!_streamingContent) _streamingContent = '';
      _streamingContent += token;
      // 实时渲染（用textContent避免频繁innerHTML解析卡顿）
      finalArea.textContent = _streamingContent;
      // 滚动
      var container = document.getElementById('messages') || messagesDiv;
      if (container) container.scrollTop = container.scrollHeight;
      return;
    }
  }

  // 首次调用：创建流式气泡
  if (!_streamingBubble) {
    removeTypingIndicator();
    var msg = document.createElement('div');
    msg.className = 'message assistant';
    var avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = '<svg viewBox="0 0 32 32" fill="none" style="width:100%;height:100%;"><circle cx="16" cy="16" r="15" fill="url(#ai-grad)"/><text x="16" y="21" text-anchor="middle" fill="white" font-size="14" font-weight="600">AI</text></svg>';
    var bubbleWrap = document.createElement('div');
    bubbleWrap.style.cssText = 'flex:1;min-width:0;max-width:480px;overflow:hidden;';
    _streamingBubble = document.createElement('div');
    _streamingBubble.className = 'message-bubble';
    bubbleWrap.appendChild(_streamingBubble);
    msg.appendChild(avatar);
    msg.appendChild(bubbleWrap);
    var container = document.getElementById('messages') || messagesDiv;
    if (container) container.appendChild(msg);
    _streamingContent = '';
  }

  // 追加 token 到文本节点
  _streamingContent += token;
  _streamingBubble.textContent = _streamingContent;

  // 滚动（每 100ms 最多一次）
  if (!_scrollPending) {
    _scrollPending = true;
    requestAnimationFrame(function() {
      var container = document.getElementById('messages') || messagesDiv;
      if (container) container.scrollTop = container.scrollHeight;
      _scrollPending = false;
    });
  }
}
var _scrollPending = false;

/**
 * 流式结束：将累积的纯文本渲染为 Markdown
 */
function _finalizeStreamingBubble() {
  // 🔧 [v1.3.5] 在 finalize 前保存完整内容（因为 finalize 会清空 _streamingContent）
  if (_streamingContent) _lastStreamedReply = _streamingContent;

  // 🔧 [v1.3.3] 如果内容在计划进度气泡的最终结果区
  if (_planLogMsg && _planLogMsg.parentNode && _streamingContent) {
    var finalArea = _planLogMsg.querySelector('.plan-final-result');
    if (finalArea) {
      finalArea.innerHTML = renderMarkdown(_streamingContent);
      _streamingContent = '';
      _streamingBubble = null;
      _streamCompleted = true;
      return;
    }
  }

  if (!_streamingBubble || !_streamingContent) return;
  _streamingBubble.innerHTML = renderMarkdown(_streamingContent);
  _streamingBubble = null;
  _streamingContent = '';
  _streamCompleted = true;
}

/**
 * 清空流式状态（停止时调用）
 */
function _clearStreamingState() {
  _streamingBubble = null;
  _streamingContent = '';
  _scrollPending = false;
  _streamCompleted = false;
}

// ===== 停止生成 =====
function stopGeneration() {
  console.log('[Stop] 用户点击停止按钮');

  // ===== 第一步：通知主进程中断所有执行（AI请求、工具调用、子进程）=====
  if (window.electronAPI && window.electronAPI.abortGeneration) {
    window.electronAPI.abortGeneration()
      .then(function(res) { console.log('[Stop] 主进程全部中断完成', res); })
      .catch(function(e) { console.warn('[Stop] 主进程中断失败:', e); });
  }

  // ===== 第二步：中断渲染进程的 AbortController（用于前端 fetch）=====
  if (_abortController) {
    _abortController.abort();
    _abortController = null;
  }

  // ===== 第三步：强制终止任何进行中的打字机效果 =====
  if (_typewriterTimer) {
    clearInterval(_typewriterTimer);
    _typewriterTimer = null;
  }
  _typewriterBubble = null;
  _typewriterMsgEl = null;

  // ===== 第四步：清除流式状态 =====
  _clearStreamingState();
  resetPlanProgress(); // 🔧 [v1.3.1] 同时清除规划进度，防止残留气泡错位

  // ===== 第五步：立即恢复 UI 状态 =====
  removeTypingIndicator();
  stopProgress();
  enableInput();
  isSending = false;

  // ===== 第五步：在对话框显示停止提示 =====
  addMessage('assistant', '⛔ 已停止 — 所有任务和进程已终止。');
}

async function sendMessage() {
  try {
  var inp = document.getElementById('input');
  if (!inp) { 
    showToast('输入框未找到，请刷新页面', 'error'); 
    return; 
  }
  var text = inp.value.trim();
  if (!text) {
    return;
  }
  if (isSending) {
    showToast('正在处理上一条消息，请稍候', 'info');
    return;
  }
  if (!window.electronAPI) {
    showToast('electronAPI 未加载，请重启应用', 'error');
    return;
  }

  var activePage = document.querySelector('.page:not(.is-hidden)');
  if (activePage && activePage.id === 'page-groupchat') {
    return;
  }

  // 会议意图检测 - 包含「开始开会」「我要开会」「开始会议」等关键词即触发
  if (!isMeetingMode && /开始开会|我要开会|开始会议|开会了|开个会/.test(text.trim())) {
    addMessage('user', text);
    inp.value = '';
    showMeetingConfirm(text);
    return;
  }

  var attachCtx = getAttachContext();
  var fullText = attachCtx ? text + '\n\n' + attachCtx : text;
  addMessage('user', fullText);
  // 清空附件
  if (attachedFiles.length) { attachedFiles = []; renderAttachPreview(); }
  inp.value = '';
  inp.style.height = 'auto';
  disableInput();
  startProgress();
  _abortController = new AbortController();

  // === 普通对话模式（不含任何群聊逻辑）===
  conversationHistory.push({ role: 'user', content: text });
  addTypingIndicator();

  // 重置上一轮的规划进度（防止复用旧气泡）
  if (typeof resetPlanProgress === 'function') resetPlanProgress();
  // 🔧 [v1.3.1] 同时清除上一轮的流式状态
  _clearStreamingState();

  try {
    var config = await window.electronAPI.getConfig();
    if (!config) config = {};
    if (!config.model) config.model = {};

    // 加载所有 Agent
    var agentsResult = await window.electronAPI.getAgents();
    availableAgents = Array.isArray(agentsResult) ? agentsResult : ((agentsResult && agentsResult.agents) || []);

    // ===== Agent路由：只允许明确 @提及 才切换，避免误识别 =====
    var selectedAgent = null;

    // 仅通过 @提及 来选择 Agent（用户必须明确写 @AgentName）
    var atMatch = text.match(/@([^\s@，,。！？]+)/);
    if (atMatch) {
      var atName = atMatch[1].toLowerCase();
      for (var i = 0; i < availableAgents.length; i++) {
        if (availableAgents[i].name.toLowerCase().indexOf(atName) >= 0) {
          selectedAgent = availableAgents[i]; break;
        }
      }
    }

    // 如果用户已手动切换过 Agent（通过 useAgent 按钮），则沿用当前 Agent
    // 但不做关键词自动匹配，避免误识别
    // [v1.1.5] 从最新的 availableAgents 中刷新 currentAgent，确保模型配置等立即生效
    if (!selectedAgent && currentAgent && currentAgent.id !== 'default') {
      for (var ci = 0; ci < availableAgents.length; ci++) {
        if (availableAgents[ci].id === currentAgent.id) {
          currentAgent = availableAgents[ci];
          break;
        }
      }
      selectedAgent = currentAgent;
    }

    // 组建系统提示
    var systemPrompt = (config.agent && config.agent.systemPrompt) || '你是灵动AI，一个强大的桌面AI助手。';
    var agentName = '灵动AI';
    var agentId = null;
    var agentModelConfig = null;

    // [v1.1.6] 核心工具使用铁律 — 对所有模式（包括默认）都生效
    // 不需要判断 selectedAgent，因为灵动AI 本身就是一个能执行工具的助手
    var coreRules = '\n\n## 工具使用铁律\n' +
      '- 你具备完整的电脑操作权限，包括文件删除、命令执行等\n' +
      '- **必须通过 Function Calling 机制调用工具**，这是唯一正确的工具调用方式\n' +
      '- **绝对禁止以下行为**（会导致严重问题）：\n' +
      '  ❌ 不要输出 ```json {"tool": "..."} ``` 这样的代码块来"模拟"工具调用\n' +
      '  ❌ 不要输出 <tool_call_end> 或任何类似的伪工具调用标记\n' +
      '  ❌ 不要输出 "让我帮你调用xxx工具" 然后显示代码块\n' +
      '  ❌ 不要用文字描述工具调用的过程（如"正在调用file_delete..."）\n' +
      '- 用户要求删除 → 调 file_delete；用户要求创建Agent → 调 create_agent；直接执行不要描述\n' +
      '- 本机是 Windows，命令走 PowerShell（Invoke-WebRequest 等），不用 Linux 命令\n' +
      '- 遇到错误换方法，不要连续3次以上用同一个失败工具\n' +
      '\n## 失败恢复铁律（v1.1.6）\n' +
      '- **即使用户手动终止了之前的任务，或者之前的工具执行出现错误，新一轮对话你仍然必须调用工具**\n' +
      '- **错误和中断是过去的事情。用户发的新消息是一个全新的任务回合，你应该立即行动**\n' +
      '- **绝对不能因为"刚才没成功"就用文字描述你要做的事情来代替实际执行**\n' +
      '- **如果用户指出了你的错误并给出了新方法，你必须立即用新方法重新调用工具**\n' +
      '- 用户的真实意图永远是"帮我做"，不是"告诉我你会怎么做"。文字描述 = 失败';
    if (systemPrompt.indexOf('工具使用铁律') < 0) {
      systemPrompt += coreRules;
    }

    if (selectedAgent) {
      // 使用 Agent 自身的系统提示词作为基础
      systemPrompt = selectedAgent.systemPrompt || systemPrompt;
      agentName = selectedAgent.name;
      agentId = selectedAgent.id;

      // ===== 关键修复：所有 Agent 都必须追加核心规则 =====
      // [v1.1.2] 不再教导"JSON 代码块"作为备用方案——会让模型形成习惯性"伪工具调用"
      // 严格只允许 Function Calling 一种方式
      var coreRules = '\n\n## 工具使用铁律\n' +
        '- 你具备完整的电脑操作权限，包括文件删除、命令执行等\n' +
        '- **必须通过 Function Calling 机制调用工具**，这是唯一正确的工具调用方式\n' +
        '- **绝对禁止以下行为**（会导致严重问题）：\n' +
        '  ❌ 不要输出 ```json {"tool": "..."} ``` 这样的代码块来"模拟"工具调用\n' +
        '  ❌ 不要输出 <tool_call_end> 或任何类似的伪工具调用标记\n' +
        '  ❌ 不要输出 "让我帮你调用xxx工具" 然后显示代码块\n' +
        '  ❌ 不要用文字描述工具调用的过程（如"正在调用file_delete..."）\n' +
        '- 用户要求删除 → 调 file_delete；用户要求创建Agent → 调 create_agent；直接执行不要描述\n' +
        '- 本机是 Windows，命令走 PowerShell（Invoke-WebRequest 等），不用 Linux 命令\n' +
        '- 遇到错误换方法，不要连续3次以上用同一个失败工具\n' +
        // [v1.1.6] 失败恢复铁律
        '\n## 失败恢复铁律（v1.1.6）\n' +
        '- **即使用户手动终止了之前的任务，或者之前的工具执行出现错误，新一轮对话你仍然必须调用工具**\n' +
        '- **错误和中断是过去的事情。用户发的新消息是一个全新的任务回合，你应该立即行动**\n' +
        '- **绝对不能因为"刚才没成功"就用文字描述你要做的事情来代替实际执行**\n' +
        '- **如果用户指出了你的错误并给出了新方法，你必须立即用新方法重新调用工具**\n' +
        '- 用户的真实意图永远是"帮我做"，不是"告诉我你会怎么做"。文字描述 = 失败';
      // 检查是否已包含核心规则（避免重复追加）
      if (systemPrompt.indexOf('工具使用铁律') < 0) {
        systemPrompt += coreRules;
      }

      // 切换 Agent 提示
      if (!currentAgent || selectedAgent.id !== currentAgent.id) {
        currentAgent = selectedAgent;
        if (agentIndicator) agentIndicator.classList.add('visible');
        if (currentAgentName) currentAgentName.textContent = agentName;
        window._currentAgentIcon = selectedAgent ? (selectedAgent.icon || '🤖') : '🤖';
        window._currentAgentAvatar = selectedAgent ? (selectedAgent.avatar || null) : null;
        removeTypingIndicator();
        addMessage('assistant', '🔄 已切换到 Agent：**' + agentName + '**');
        addTypingIndicator();
      } else {
        currentAgent = selectedAgent;
        if (agentIndicator) agentIndicator.classList.add('visible');
        if (currentAgentName) currentAgentName.textContent = agentName;
      }

      // Agent 独立模型配置 - 优先使用 Agent 自身配置，即使只有 model 也使用 Agent 的
      if (selectedAgent.baseUrl && selectedAgent.apiKey) {
        // Agent 有完整的独立模型配置
        agentModelConfig = {
          apiKey: selectedAgent.apiKey,
          baseUrl: selectedAgent.baseUrl,
          model: selectedAgent.model || config.model.model || 'gpt-4o',
          temperature: selectedAgent.temperature || 0.7
        };
      } else if (selectedAgent.model) {
        // Agent 只指定了模型名称，使用全局的 apiKey/baseUrl
        agentModelConfig = {
          apiKey: config.model.apiKey || '',
          baseUrl: config.model.baseUrl || '',
          model: selectedAgent.model,
          temperature: selectedAgent.temperature || 0.7
        };
      }

      // === 知识库注入：严格按照 Agent 配置的 knowledgeBasePath 检索 ===
      if (selectedAgent.knowledgeBasePath) {
        systemPrompt += '\n\n【知识库配置】\n你有一个知识库数据源，路径为: ' + selectedAgent.knowledgeBasePath +
          '\n当用户询问任何问题时，你必须首先使用 file_list 工具列出该路径下的文件，' +
          '然后根据用户的问题选择相关文件，使用 file_read 工具读取文件内容，' +
          '最后基于文件内容回答用户的问题。' +
          '\n严格要求：所有数据检索必须从这个知识库路径获取，不要使用其他路径的数据。' +
          '\n如果知识库中包含Excel文件(.xlsx/.xls)，请使用 execute_command 工具调用 PowerShell 读取内容。';
      }
    }

    // 注入工具说明和 Agent 列表
    var agentListStr = availableAgents.map(function(a) {
      return '- ' + a.name + '（id: ' + a.id + '）: ' + (a.description || '').slice(0, 50);
    }).join('\n');

    systemPrompt += '\n\n## 可用工具（必须通过 Function Calling 调用，禁止输出 JSON 代码块伪调用）\n' +
      '【文件操作】file_read/file_write/file_list/file_delete/create_folder：读写、列出、删除文件/文件夹和创建文件夹。删除操作直接调用file_delete即可\n' +
      '【系统命令】execute_command：执行Windows PowerShell命令，完成任意系统操作\n' +
      '【软件控制】open_software：打开本地任意软件或文件\n' +
      '【截图能力】take_screenshot：截取当前屏幕\n' +
      '【网页操作】open_url：在浏览器中打开指定网页\n' +
      '【Agent管理】create_agent/list_agents/get_agent/update_agent/delete_agent：创建、查看、修改、删除Agent（可配置独立模型）\n' +
      '【Agent开发】read_agent_file/write_agent_file：直接读写Agent配置文件，实现底层开发\n' +
      '【源码开发】read_source_file/write_source_file/patch_source_file：读取和修改本软件自身源码\n' +
      '【项目管理】list_project_files/check_syntax/run_node_check：查看项目结构、语法检查\n' +
      '【应用控制】restart_app：重启应用使源码修改生效\n' +
      '【Agent协作】call_agent：调用其他专业Agent完成任务。⚠️ 当用户提到"调用XX助手/XX Agent/邮件/项目管理/数据分析"等需要其他Agent能力的任务时，**必须先调 list_agents 查看可用Agent，再调 call_agent 委派任务**，不要用 search_knowledge_base 或其他工具绕路\n' +
      '【会议纪要】search_meeting_notes/save_meeting_note/list_meeting_notes：搜索、保存、列出会议纪要\n' +
      '【知识检索】search_knowledge_base：在指定文件夹中智能检索文档内容，支持多关键词和相关性排序\n' +
      '【网页搜索】search_web：搜索互联网实时信息\n' +
      '【网页抓取】fetch_url：抓取指定网页内容\n' +
      '【Windows UI】win_find_window/win_activate_window/win_send_keys/win_click：窗口查找、激活、发送按键、鼠标点击\n' +
      '【AHK自动化】run_ahk_script/ahk_find_window/ahk_send_input/ahk_click_control：AutoHotkey v1 精准 UI 自动化\n' +
      '   ⚠️ AHK 版本约束：本机 AHK 是 v1 版本，生成的脚本必须使用 v1 语法。禁止使用以下 v2 独有特性：\n' +
      '     - 禁止 #Requires AutoHotkey v2.0 或 #Include <WinGetList>\n' +
      '     - 禁止 v2 函数语法（如 WinGetList()），改用 v1 命令（如 WinGet, id, list, , ahk_exe xxx）\n' +
      '     - 必须使用 #NoEnv + #SingleInstance Force 作为脚本头\n' +
      '     - 使用 Sleep, 200（带逗号）而非 Sleep 200；使用 SendInput, xxx（带逗号）而非 SendInput("xxx")\n' +
      '     - 循环用 Loop, %count% { }，获取窗口ID用 id%A_Index%，不是数组语法\n' +
      '     - 字符串拼接用 . 点号，函数用 EscapeJson(str) { } 定义\n' +
      '【文件整理】organize_files：按类型/日期/名称智能整理文件夹\n' +
      '【待办管理】list_todos/create_todo/update_todo/delete_todo：创建、查看、修改、删除待办事项（⚠️ 创建待办请用create_todo，不要用file_write写txt文件！待办会显示在桌面宠物的待办面板中）\n' +
      '【MCP扩展】mcp_call：调用外部 MCP 服务器扩展能力（如数据库、GitHub、邮件等）\n' +
      '【时间工具】get_current_time：获取当前系统时间\n' +
      '【工具查询】list_available_tools：查看所有可用工具\n\n' +
      '重要：用户要求删除时直接调file_delete，用户要求创建Agent时直接调create_agent，用户要求整理文件时直接调organize_files，用户要求创建待办/提醒/任务时直接调create_todo（不要用file_write写txt！）。不要只描述不行动。\n' +
      '⚠️ Agent调用铁律：当用户的请求涉及"调用XX助手/XX Agent/让XX帮我/邮件自动化/项目管理"等**需要其他专业Agent能力**的任务时，必须按以下顺序操作：\n' +
      '  ① 先调 list_agents 获取可用Agent列表 → ② 再调 call_agent(agentId="目标Agent的ID或名称", task="具体任务") 委派\n' +
      '  ❌ 禁止：用户说"调用邮件助手发邮件"，你却去 search_knowledge_base 搜索——这是绕路！\n' +
      '  ❌ 禁止：用户说"让项目管理Agent汇总周报"，你却用 file_read 去读文件——这是错误的工具选择！\n\n' +
      '## 🛑 反糊弄铁律（最高优先级）\n' +
      '如果你**无法调用任何工具**（例如工具列表为空、API配置问题、或经过多次重试仍失败），你必须**据实告知用户无法执行操作**，例如说"抱歉，当前无法执行此操作，因为..."。\n' +
      '**绝对禁止**以下误导性表述（这些表述暗示你会执行操作，但实际上你没有/tool_call）：\n' +
      '  ❌ "首先打开XXX软件"、"让我来执行XXX"、"我来帮你XXX"、"正在为你XXX"\n' +
      '  ❌ "我会操作XXX"、"我将执行XXX"、"接下来我会XXX"\n' +
      '  ❌ 任何以动作描述开头的回复，如果没有配合实际的 tool_call\n' +
      '  ✅ 正确做法：要么直接调用工具（带tool_call），要么明确说"我无法执行此操作，因为..."\n' +
      '规则：如果你要操作 → 就调用工具。如果你不调用工具 → 就不要说你会操作。';
    if (agentListStr) systemPrompt += '\n\n【当前已有Agent】\n' + agentListStr;

    // 上下文记忆条数限制（设置页可调，默认 20）
    var _ctxLimit = parseInt(config.contextLimit, 10);
    if (isNaN(_ctxLimit) || _ctxLimit < 2) _ctxLimit = 20;
    var _trimmedHistory = conversationHistory.length > _ctxLimit ? conversationHistory.slice(-_ctxLimit) : conversationHistory;
    var messages = [{ role: 'system', content: systemPrompt }].concat(_trimmedHistory);

    var callConfig = agentModelConfig || {
      apiKey: config.model.apiKey || '',
      baseUrl: config.model.baseUrl || '',
      model: config.model.model || 'gpt-4o',
      temperature: 0.7
    };

    // 🔧 [v1.3.1] 全局注册流式监听（之前只在 Planner 中注册，导致普通对话的流式 token 全部丢失）
    if (!window._aiStreamRegistered) {
      window._aiStreamRegistered = true;
      window.electronAPI.onAIStream(function(data) {
        handleAIStream(data);
      });
    }

    // 调用 AI：根据消息内容选择合适的路径
    // 1. 复杂多步任务 → Planner（分阶段规划+执行+总结）
    // 2. 简单工具操作 → callAIWithTools（直接带工具调用）
    // 3. 纯对话/知识问答 → callAI（不带工具，最快最省）
    var usePlanner = shouldUsePlanner(text);
    var needsTools = textNeedsTools(text);
    // 🔧 [v1.3.9-diag] 诊断日志——定位默认对话不回复的根因
    console.log('[sendMessage] 路由决策:', {
      text: text.substring(0, 50),
      usePlanner: usePlanner,
      needsTools: needsTools,
      currentAgent: currentAgent ? currentAgent.id : 'null',
      callConfig_model: callConfig.model,
      callConfig_baseUrl: callConfig.baseUrl,
      // 🔧 [v1.3.9-diag-v2] 深层诊断
      agentModelConfig: agentModelConfig,
      config_model_keys: config.model ? Object.keys(config.model) : ['config.model is undefined!'],
      config_model_model: config.model ? config.model.model : '[no config.model]',
      config_model_baseUrl: config.model ? config.model.baseUrl : '[no config.model]',
      callConfig_full: JSON.stringify(callConfig)
    });
    var result;
    if (usePlanner) {
      result = await window.callAIWithPlanner(messages, callConfig, agentId);
    } else if (needsTools) {
      result = await window.electronAPI.callAIWithTools(messages, callConfig, agentId);
    } else {
      result = await window.electronAPI.callAI(messages, callConfig);
    }

    // 🔧 [v1.3.9-diag] 诊断日志——IPC返回结果
    console.log('[sendMessage] IPC返回:', {
      success: result && result.success,
      error: result && result.error ? result.error.substring(0, 100) : 'none',
      hasData: result && result.data ? true : false,
      replyPreview: '',
      _streamCompleted: _streamCompleted,
      _streamingBubble: _streamingBubble ? 'exists' : 'null',
      _streamingContent_len: (_streamingContent || '').length,
      _lastStreamedReply_len: (_lastStreamedReply || '').length
    });
    try {
      var _diagReply = result.data.choices[0].message.content || '';
      console.log('[sendMessage] reply长度:', _diagReply.length, '前50字:', _diagReply.substring(0, 50));
    } catch(e) { console.log('[sendMessage] reply解析失败:', e.message); }

    if (result && result.success) {
      // Agent 操作后刷新列表
      if (result.toolCallLog && result.toolCallLog.length > 0) {
        var hasAgentOp = result.toolCallLog.some(function(l) {
          return ['create_agent','delete_agent','update_agent'].indexOf(l.tool) >= 0;
        });
        if (hasAgentOp) setTimeout(function() { loadAgents(); }, 500);
      }

      var reply = '';
      try { reply = result.data.choices[0].message.content || ''; } catch(e) {}
      removeTypingIndicator();

      // 🔧 [v1.3.5] 流式输出已完成 → 不再二次输出，只保存到 conversationHistory
      // 🔧 [v1.3.9-diag] 诊断日志——追踪渲染分支选择
      console.log('[sendMessage] 渲染分支判断:', {
        _streamCompleted: _streamCompleted,
        _streamingBubble: _streamingBubble ? 'exists' : 'null',
        _streamingContent_len: (_streamingContent || '').length,
        _lastStreamedReply_len: (_lastStreamedReply || '').length,
        reply_len: reply.length,
        reply_preview: reply.substring(0, 50)
      });
      if (_streamCompleted) {
        // 流式已经把完整内容渲染到了气泡里，只需保存到历史
        var streamedReply = _lastStreamedReply || reply;
        if (streamedReply) {
          conversationHistory.push({ role: 'assistant', content: streamedReply });
          if (typeof saveCurrentSession === 'function') saveCurrentSession();
        }
        _streamCompleted = false; // 重置
        _lastStreamedReply = '';
      } else if (_streamingBubble && _streamingContent) {
        // 流式还在进行中但已返回结果 → finalize
        var streamedContent = _streamingContent;
        _finalizeStreamingBubble();
        conversationHistory.push({ role: 'assistant', content: streamedContent });
        if (typeof saveCurrentSession === 'function') saveCurrentSession();
      } else if (reply) {
        // 完全没有流式输出（旧模式 / API 不支持流式），用打字机效果
        if (_planLogMsg && _planLogMsg.parentNode) {
          var finalArea = _planLogMsg.querySelector('.plan-final-result');
          if (finalArea) {
            finalArea.innerHTML = renderMarkdown(reply);
            conversationHistory.push({ role: 'assistant', content: reply });
            if (typeof saveCurrentSession === 'function') saveCurrentSession();
          } else {
            addMessage('assistant', reply);
            conversationHistory.push({ role: 'assistant', content: reply });
            if (typeof saveCurrentSession === 'function') saveCurrentSession();
          }
        } else {
          addMessage('assistant', reply);
          conversationHistory.push({ role: 'assistant', content: reply });
          if (typeof saveCurrentSession === 'function') saveCurrentSession();
        }
      } else {
        // 🔧 [v1.3.8] 兜底：流式没有输出内容且 IPC 返回的 reply 也为空
        //   可能是模型只输出了 tool_calls 但最终迭代没有文本
        //   或者是 API 返回了空 content
        //   至少保存到历史（防止对话中断）
        if (_lastStreamedReply) {
          conversationHistory.push({ role: 'assistant', content: _lastStreamedReply });
          if (typeof saveCurrentSession === 'function') saveCurrentSession();
        } else if (reply) {
          conversationHistory.push({ role: 'assistant', content: reply });
          if (typeof saveCurrentSession === 'function') saveCurrentSession();
        }
        // 如果连 _lastStreamedReply 和 reply 都为空，检查是否有中间迭代的流式内容
        // 这些已经在 stream-reset 时被 finalize 到了 DOM 里的独立气泡
        // 不需要再渲染任何东西
      }
      // 保存 token 使用统计
      var tokenUsage = null;
      try { tokenUsage = result.data.usage || null; } catch(e) {}
      saveStats(tokenUsage);
    } else {
      removeTypingIndicator();
      var errMsg = (result && result.error) || '未知错误';
      var detailMsg = '❌ 错误：' + errMsg;
      if (errMsg && errMsg.includes('未配置')) {
        detailMsg += '\n\n👉 请前往【设置】→【模型配置】填写 API Key 和 Base URL';
      } else if (errMsg && errMsg.includes('Invalid URL')) {
        detailMsg += '\n\n可能原因：\n• API地址格式错误\n• 缺少 http:// 或 https://\n\n请检查设置中的 Base URL';
      } else if (errMsg && (errMsg.includes('401') || errMsg.includes('Unauthorized'))) {
        detailMsg += '\n\n👉 API Key 无效，请检查设置';
      } else if (errMsg && (errMsg.includes('404') || errMsg.includes('Not Found'))) {
        detailMsg += '\n\n👉 模型名称可能不正确，请检查设置';
      }
      addMessage('assistant', detailMsg);
    }
  } catch(e) {
    removeTypingIndicator();
    addMessage('assistant', '❌ 错误：' + e.message);
    console.error('sendMessage error:', e);
  } finally { 
    enableInput(); 
    // 保存会话（每次对话后）
    setTimeout(function() { try { saveCurrentSession(); } catch(e) { console.error('saveCurrentSession failed:', e); } }, 300);
  }
  } catch(fatalErr) {
    enableInput();
    showToast('发送失败: ' + (fatalErr.message || '未知错误'), 'error');
    console.error('sendMessage fatal error:', fatalErr);
  }
}

// 暴露 sendMessage 到 window
window.sendMessage = sendMessage;

// ===== 统一事件委托：所有输入框和按钮事件通过 document 处理 =====
// 主对话输入框 Enter 发送
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    if (e.target && e.target.id === 'input') {
      // 主对话 @ 下拉打开时，Enter 用于选中 agent，不发送
      if (document.getElementById('atDropdown')) return;
      e.preventDefault();
      e.stopPropagation();
      sendMessage();
      return;
    }
    if (e.target && e.target.id === 'gc-input') {
      // 群聊 @ 下拉打开时，Enter 用于选中 agent，不发送
      if (document.getElementById('gc-at-dropdown')) return;
      e.preventDefault();
      e.stopPropagation();
      sendGroupMessageFromUI();
      return;
    }
  }
}, true);

// 主对话输入框自动调整高度 + @agent实时检测 + 群聊输入框自动调整高度和 @提示
document.addEventListener('input', function(e) {
  if (e.target && e.target.id === 'input') {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
    updateAgentIndicatorFromInput(e.target.value);
  }
  if (e.target && e.target.id === 'gc-input') {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
    if (typeof window.gcAtHint === 'function') window.gcAtHint(e.target.value);
  }
});

// 发送按钮点击 - 通过事件委托
document.addEventListener('click', function(e) {
  var target = e.target;
  // 主对话发送按钮
  if (target && (target.id === 'sendBtn' || (target.closest && target.closest('#sendBtn')))) {
    e.preventDefault();
    sendMessage();
    return;
  }
  // 群聊发送按钮
  if (target && (target.id === 'gcSendBtn' || (target.closest && target.closest('#gcSendBtn')))) {
    e.preventDefault();
    sendGroupMessageFromUI();
    return;
  }
});

// ===== MutationObserver：确保动态元素事件始终绑定 =====
var _sendObserver = new MutationObserver(function(mutations) {
  mutations.forEach(function(mutation) {
    if (mutation.type === 'childList') {
      // 检查 sendBtn 是否被重新创建
      var addedNodes = mutation.addedNodes;
      for (var i = 0; i < addedNodes.length; i++) {
        var node = addedNodes[i];
        if (node.nodeType === 1) {
          if (node.id === 'sendBtn' || (node.querySelector && node.querySelector('#sendBtn'))) {
            // sendBtn 被重新创建，事件委托会自动处理，无需额外操作
          }
        }
      }
    }
  });
});

// 观察整个 body 的 DOM 变化
if (document.body) {
  _sendObserver.observe(document.body, { childList: true, subtree: true });
}

// ===== 粘贴附件支持 =====
document.addEventListener('paste', function(e) {
  var items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  var hasFile = false;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (item.kind === 'file') {
      hasFile = true;
      var file = item.getAsFile();
      if (!file) continue;
      var reader = new FileReader();
      (function(f) {
        reader.onload = function(ev) {
          attachedFiles.push({ name: f.name || ('粘贴_' + Date.now() + (f.type.startsWith('image/') ? '.png' : '.bin')), type: f.type, size: f.size, data: ev.target.result });
          renderAttachPreview();
          showToast('已粘贴附件: ' + (f.name || '图片'), 'success');
        };
        reader.readAsDataURL(f);
      })(file);
    }
  }
  if (hasFile) e.preventDefault();
});

// 🔧 [v1.3.4] 清空对话 UI（不保存，用于新建会话或 Agent 隔离）
function clearChatUI() {
  var msgsDiv = document.getElementById('messages');
  if (msgsDiv) msgsDiv.innerHTML = '';
  _streamingBubble = null;
  _streamingContent = '';
  _planLogMsg = null;
  removeTypingIndicator();
}

// 🔧 [v1.3.4] 新建空白会话
window.newChat = function() {
  // 停止正在进行的生成
  if (window.stopGeneration) window.stopGeneration();
  // 清空 UI 和状态
  clearChatUI();
  conversationHistory = [];
  _savedChatMessages = null;
  _savedChatHistory = null;
  // 如果有 Agent 锁定，也清除
  if (!agentLocked) {
    // 非 Agent 模式下完全清空
  }
  // 显示欢迎消息
  addMessage('assistant', '👋 新会话已开始！有什么可以帮你的？');
  var inp = getInput();
  if (inp) { inp.value = ''; inp.focus(); }
};

window.clearCurrentAgent = function() {
  currentAgent = null;
  agentLocked = false;
  if (agentIndicator) agentIndicator.classList.remove('visible');
  var nameEl = document.getElementById('currentAgentName');
  if (nameEl) nameEl.textContent = '';
  if (currentAgentName) currentAgentName.textContent = '';
  // 注意：不要在这里改写输入框的值。该函数会在每次输入时被 updateAgentIndicatorFromInput 调用，
  // 若在此 replace/trim 输入框内容，会吞掉用户正在输入的空格和 @ 符号。
  // 仅当用户主动点击指示器上的 × 关闭时，才清理 @提及（见 clearCurrentAgentManual）。
};

// 用户手动点击 × 关闭当前 agent 锁定（此时才清理输入框里的 @提及）
window.clearCurrentAgentManual = function() {
  // 🔧 [v1.3.4] 恢复之前保存的对话内容
  if (_savedChatMessages) {
    var msgsDiv = document.getElementById('messages');
    if (msgsDiv) msgsDiv.innerHTML = _savedChatMessages;
    if (_savedChatHistory) conversationHistory = _savedChatHistory.slice();
    _savedChatMessages = null;
    _savedChatHistory = null;
  }

  window.clearCurrentAgent();
  var inp = getInput();
  if (inp) {
    inp.value = inp.value.replace(/@\S+/g, '').trim();
    inp.focus();
  }
};

function updateAgentIndicatorFromInput(val) {
  if (agentLocked) return; // 已锁定agent，不随输入变化
  if (!val) { window.clearCurrentAgent(); return; }
  var match = val.match(/@([^\s@，,。！？]+)/);
  if (!match) { window.clearCurrentAgent(); return; }
  var agentName = match[1].toLowerCase();
  var found = null;
  if (availableAgents && availableAgents.length) {
    for (var i = 0; i < availableAgents.length; i++) {
      if (availableAgents[i].name.toLowerCase().indexOf(agentName) >= 0 || availableAgents[i].id === agentName) {
        found = availableAgents[i];
        break;
      }
    }
  }
  if (found) {
    currentAgent = found;
    if (agentIndicator) agentIndicator.classList.add('visible');
    if (currentAgentName) currentAgentName.textContent = found.name;
  } else {
    window.clearCurrentAgent();
  }
}

// ===== @Agent 输入提示（仅用于对话页面的 #input，与群聊无关）=====
var atDropdown = null;
(function() {
  var inp = getInput();
  if (!inp) { setTimeout(arguments.callee, 200); return; }
  inp.addEventListener('input', async function() {
    // 只在对话页面激活时才处理（群聊页面有自己的 @提示）
    var activePage = document.querySelector('.page:not(.is-hidden)');
    if (activePage && activePage.id !== 'page-chat') { hideAtDropdown(); return; }

    var val = inp.value;
    var atIdx = val.lastIndexOf('@');
    // 仅当 @ 位于开头或前面是空白时才弹出 Agent 提示，否则视为普通 @ 字符（如邮箱）
    var prevChar = atIdx > 0 ? val.charAt(atIdx - 1) : '';
    var atIsMention = atIdx >= 0 && (atIdx === 0 || prevChar === ' ' || prevChar === '\n');
    if (atIsMention) {
      var query = val.slice(atIdx + 1).toLowerCase();
      try {
        // 对话页面的 @提示只显示全局 Agent 列表，不显示群聊成员
        var res = await window.electronAPI.getAgents();
        var agents = Array.isArray(res) ? res : ((res && res.agents) || []);
        agents = agents.filter(function(a) { return a.id !== 'default'; });
        var matches = agents.filter(function(a) { return a.name.toLowerCase().indexOf(query) >= 0; });
        if (matches.length > 0) showAtDropdown(matches);
        else hideAtDropdown();
      } catch(e) { hideAtDropdown(); }
    } else { hideAtDropdown(); }
  });
})();

function showAtDropdown(agents) {
  hideAtDropdown();
  atDropdown = document.createElement('div');
  atDropdown.id = 'atDropdown';
  atDropdown._selectedIndex = -1;
  atDropdown._agents = agents.slice(0, 8);
  atDropdown.style.cssText = 'position:absolute;bottom:calc(100% + 8px);left:0;right:0;background:var(--bg-secondary);border:1px solid var(--border-input);border-radius:10px;padding:6px;z-index:200;box-shadow:0 8px 32px rgba(0,0,0,.35);max-height:280px;overflow-y:auto;';
  
  // 标题提示
  var header = document.createElement('div');
  header.style.cssText = 'padding:4px 10px 6px;font-size:11px;color:var(--text-muted);border-bottom:1px solid var(--border-subtle);margin-bottom:4px;';
  header.textContent = '↑↓ 选择  Enter 切换  Esc 关闭';
  atDropdown.appendChild(header);

  atDropdown._agents.forEach(function(agent, idx) {
    var item = document.createElement('div');
    item.setAttribute('data-at-index', idx);
    item.style.cssText = 'padding:8px 10px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:10px;transition:background .1s;';
    var iconHtml = agent.avatar
      ? '<img src="' + agent.avatar + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover;">'
      : '<div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#06b6d4);display:flex;align-items:center;justify-content:center;font-size:14px;">' + (agent.icon || '🤖') + '</div>';
    item.innerHTML = iconHtml + '<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;color:var(--text-primary);">' + agent.name + '</div>' + (agent.description ? '<div style="font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + agent.description.slice(0,45) + '</div>' : '') + '</div>';
    item.addEventListener('mouseenter', function() { atDropdown._selectedIndex = idx; updateAtSelection(atDropdown.querySelectorAll('[data-at-index]')); });
    item.addEventListener('click', function() { selectAtAgent(agent); });
    atDropdown.appendChild(item);
  });

  var inputArea = document.querySelector('.input-area');
  if (inputArea) {
    inputArea.style.position = 'relative';
    inputArea.appendChild(atDropdown);
  } else {
    document.body.appendChild(atDropdown);
  }
}

function selectAtAgent(agent) {
  var inp = getInput();
  if (!inp) return;
  var v = inp.value;
  var atPos = v.lastIndexOf('@');
  // 清掉 @xxx 部分，保留 @ 前的文字
  inp.value = v.slice(0, atPos);
  hideAtDropdown();

  // 锁定切换到该 agent，持续生效直到用户点 × 关闭
  currentAgent = agent;
  agentLocked = true;
  window._currentAgentIcon = agent.icon || '🤖';
  window._currentAgentAvatar = agent.avatar || null;
  window._currentAgentAvatarUrl = agent.avatar || null;
  var indEl = document.getElementById('agentIndicator');
  var nameEl = document.getElementById('currentAgentName');
  if (indEl) indEl.classList.add('visible');
  if (nameEl) nameEl.textContent = agent.name;

  // 在对话框显示切换提示气泡
  addMessage('assistant', '✅ 已切换到 **' + agent.name + '**' + (agent.description ? '（' + agent.description + '）' : '') + '，请继续输入消息发送。');

  inp.focus();
}

function hideAtDropdown() {
  if (atDropdown) { atDropdown.remove(); atDropdown = null; }
}

// 键盘导航：上下箭头选择 + 回车确认（主对话 @ 下拉）
document.addEventListener('keydown', function(e) {
  if (!atDropdown) return;
  var items = atDropdown.querySelectorAll('[data-at-index]');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    atDropdown._selectedIndex = Math.min(atDropdown._selectedIndex + 1, items.length - 1);
    updateAtSelection(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    atDropdown._selectedIndex = Math.max(atDropdown._selectedIndex - 1, 0);
    updateAtSelection(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    var aidx = atDropdown._selectedIndex >= 0 ? atDropdown._selectedIndex : 0;
    var agent = atDropdown._agents[aidx];
    if (agent) selectAtAgent(agent);
  } else if (e.key === 'Escape') {
    hideAtDropdown();
  }
}, true);

function updateAtSelection(items) {
  items.forEach(function(item, i) {
    if (i === atDropdown._selectedIndex) {
      item.style.background = 'rgba(99,102,241,0.18)';
      item.style.borderLeft = '2px solid #6366f1';
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.style.background = '';
      item.style.borderLeft = '';
    }
  });
}

document.addEventListener('click', function(e) {
  if (atDropdown && !atDropdown.contains(e.target) && e.target !== input) hideAtDropdown();
});

// ===== 修复问题2：会议纪要完整功能 =====
// 严格触发词：只有「开始开会」才弹出会议模式
function showMeetingConfirm(originalText) {
  var bubble = document.createElement('div');
  bubble.className = 'message assistant';
  bubble.innerHTML = '<div class="message-avatar">' + getAgentAvatarHtml({id:'default'}, 32) + '</div><div style="flex:1;"><div class="message-bubble">' +
    '<div style="margin-bottom:12px;">🎤 <strong>准备开始会议</strong>，点击下方按钮打开录音窗口。</div>' +
    '<div style="display:flex;gap:10px;">' +
    '<button onclick="confirmMeeting(true)" style="background:linear-gradient(135deg,#6366f1,#06b6d4);color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;">🎙️ 打开录音窗口</button>' +
    '<button onclick="confirmMeeting(false)" style="background:#374151;color:#e5e7eb;border:1px solid #6b7280;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">✕ 取消</button>' +
    '</div></div></div>';
  if (!messagesDiv) messagesDiv = document.getElementById('messages');
  if (messagesDiv) { messagesDiv.appendChild(bubble); messagesDiv.scrollTop = messagesDiv.scrollHeight; }
}

window.confirmMeeting = function(yes) {
  if (yes) {
    isMeetingMode = true;
    var manualTA = document.getElementById('manualTranscript');
    if (manualTA) manualTA.value = '';
    openVoiceRecorder();
    addMessage('assistant', '🎙️ **录音窗口已打开**\n\n在录音窗口中：\n- 点击 **开始录音** 开始语音识别\n- 点击 **暂停** 临时暂停\n- 点击 **停止** 结束录音，文字自动回传到这里\n- 点击 **✨ 生成会议纪要** 直接生成并保存纪要文件');
  } else {
    isMeetingMode = false;
    addMessage('assistant', '好的，已取消。需要开会时说「开始开会」即可。');
    conversationHistory.push({ role: 'assistant', content: '已取消会议模式。' });
  }
};

// ===== 打开独立录音窗口 =====
function openVoiceRecorder() {
  // 通过 Electron 打开独立窗口加载 voice-recorder.html
  window.electronAPI.openVoiceRecorder && window.electronAPI.openVoiceRecorder();
}

// ===== BroadcastChannel：接收录音窗口消息 =====
(function initVoiceChannel() {
  var bc;
  try { bc = new BroadcastChannel('lobster-voice'); } catch(e) { return; }

  bc.onmessage = async function(event) {
    var msg = event.data;
    if (!msg) return;

    // 录音窗口就绪
    if (msg.type === 'voice-ready') {
      addMessage('assistant', '🎙️ 录音窗口已连接，可以开始录音了。');
    }

    // 停止录音 → 文字回传到会议纪要文本框
    if (msg.type === 'voice-stopped') {
      var text = msg.full || '';
      var manualTA = document.getElementById('manualTranscript');
      if (manualTA && text) {
        manualTA.value = text;
        // 显示会议工具栏（让用户可以手动生成）
        var toolbar = document.getElementById('meetingToolbar');
        if (toolbar) toolbar.classList.remove('hidden');
        addMessage('assistant', '✅ 录音已停止，文字已回传（共 ' + text.length + ' 字）。\n可在下方工具栏点击 **📝 生成会议纪要**，或直接在录音窗口点击 **✨ 生成会议纪要**。');
      } else if (!text) {
        addMessage('assistant', '⚠️ 录音已停止，但未识别到文字内容。');
      }
    }

    // 录音窗口请求生成会议纪要 - 使用智能会议纪要助手的完整能力
    if (msg.type === 'voice-generate') {
      var transcriptText = msg.text || '';
      if (!transcriptText.trim()) {
        bc.postMessage({ type: 'generate-error', error: '会议内容为空' });
        return;
      }
      addTypingIndicator();
      try {
        var config = await window.electronAPI.getConfig();
        if (!config) config = {};
        if (!config.model) config.model = {};

        // 查找智能会议纪要助手的完整配置
        var agentsResult = await window.electronAPI.getAgents();
        var agents = Array.isArray(agentsResult) ? agentsResult : ((agentsResult && agentsResult.agents) || []);
        var meetingAgent = null;
        for (var i = 0; i < agents.length; i++) {
          if (agents[i].id === 'meeting-assistant' || agents[i].name.indexOf('会议') >= 0) {
            meetingAgent = agents[i]; break;
          }
        }

        // 使用智能会议纪要助手的完整系统提示词
        var nowStr = new Date().toLocaleString('zh-CN');
        var sysPrompt = (meetingAgent && meetingAgent.systemPrompt) ||
          '你是专业的会议纪要助手，请根据以下会议内容生成结构化中文纪要。';
        
        // 注入当前时间到系统提示词中
        sysPrompt = sysPrompt.replace(/默认按当前时间标注/g, '当前时间为：' + nowStr + '，请按此时间标注');
        
        var userPrompt = '请将以下会议录音转写文本整理为规范的会议纪要：\n\n' + transcriptText;

        // 使用智能会议纪要助手的模型配置（优先使用 Agent 独立配置）
        var callConfig;
        if (meetingAgent && meetingAgent.baseUrl && meetingAgent.apiKey) {
          // Agent 有独立的模型配置
          callConfig = {
            apiKey: meetingAgent.apiKey,
            baseUrl: meetingAgent.baseUrl,
            model: meetingAgent.model || config.model.model || 'gpt-4o',
            temperature: meetingAgent.temperature || 0.7
          };
        } else if (meetingAgent && meetingAgent.model) {
          // Agent 只指定了模型，使用全局 API 配置
          callConfig = {
            apiKey: config.model.apiKey || '',
            baseUrl: config.model.baseUrl || '',
            model: meetingAgent.model,
            temperature: meetingAgent.temperature || 0.7
          };
        } else {
          // 使用全局配置
          callConfig = {
            apiKey: config.model.apiKey || '',
            baseUrl: config.model.baseUrl || '',
            model: config.model.model || 'gpt-4o',
            temperature: 0.7
          };
        }

        if (!callConfig.baseUrl) {
          removeTypingIndicator();
          bc.postMessage({ type: 'generate-error', error: '请先在设置中配置 Base URL 和 API Key' });
          addMessage('assistant', '❌ 请先在设置中配置 Base URL 和 API Key');
          return;
        }

        // 调用 AI 生成会议纪要（使用 meeting-assistant 的完整能力，包括 Function Calling）
        var result = await window.electronAPI.callAIWithTools(
          [{ role: 'system', content: sysPrompt }, { role: 'user', content: userPrompt }],
          callConfig,
          meetingAgent ? meetingAgent.id : null
        );

        removeTypingIndicator();

        if (result && result.success) {
          var noteContent = '';
          try { noteContent = result.data.choices[0].message.content || ''; } catch(e) {}
          if (noteContent) {
            // 在浏览器端聊天界面展示会议纪要
            addMessage('assistant', '📝 **会议纪要已生成**\n\n' + noteContent);
            
            // 填充到会议纪要结果区域
            var meetingResultEl = document.getElementById('meetingResult');
            if (meetingResultEl) {
              meetingResultEl.classList.remove('hidden');
              meetingResultEl.innerHTML = '<h3>📝 AI 生成的会议纪要</h3><pre>' + noteContent.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
              // 滚动到结果区域
              meetingResultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            
            // 自动保存到本地文件
            var filename = '会议纪要-' + new Date().toISOString().slice(0, 10) + '-' + Date.now();
            var saveResult = await window.electronAPI.saveMeetingNote({ filename: filename, content: noteContent });
            var savePath = (saveResult && saveResult.path) || '默认纪要目录';
            addMessage('assistant', '✅ 纪要已自动保存至：' + savePath);
            
            // 通知录音窗口生成完成
            bc.postMessage({ type: 'generate-done', path: savePath });
            isMeetingMode = false;
            var toolbar = document.getElementById('meetingToolbar');
            if (toolbar) toolbar.classList.add('hidden');
          } else {
            bc.postMessage({ type: 'generate-error', error: '生成内容为空' });
          }
        } else {
          var errMsg = (result && result.error) || '未知错误';
          bc.postMessage({ type: 'generate-error', error: errMsg });
          addMessage('assistant', '❌ 生成纪要失败：' + errMsg);
        }
      } catch(e) {
        removeTypingIndicator();
        bc.postMessage({ type: 'generate-error', error: e.message });
        addMessage('assistant', '❌ 生成纪要出错：' + e.message);
      }
    }

    // 录音窗口关闭
    if (msg.type === 'voice-closed') {
      if (isMeetingMode) {
        addMessage('assistant', '录音窗口已关闭。如需生成纪要，可在下方工具栏操作。');
      }
    }
  };
})();

// 关闭会议工具栏
var meetingCloseBtn = document.getElementById('meetingCloseBtn');
if (meetingCloseBtn) {
  meetingCloseBtn.addEventListener('click', function() {
    var toolbar = document.getElementById('meetingToolbar');
    if (toolbar) toolbar.classList.add('hidden');
    isMeetingMode = false;
  });
}

// 开始录音（使用浏览器 Web Speech API）
var recognition = null;
var meetingStartBtn = document.getElementById('meetingStartBtn');
if (meetingStartBtn) {
  meetingStartBtn.addEventListener('click', function() {
    var startBtn = document.getElementById('meetingStartBtn');
    var stopBtn = document.getElementById('meetingStopBtn');
    var genBtn = document.getElementById('meetingGenerateBtn');
    var speechStatus = document.getElementById('speechStatus');
    var manualTA = document.getElementById('manualTranscript');

    // 尝试使用 Web Speech API（浏览器原生语音识别）
    if (window.webkitSpeechRecognition || window.SpeechRecognition) {
      var SR = window.webkitSpeechRecognition || window.SpeechRecognition;
      recognition = new SR();
      recognition.lang = 'zh-CN';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = function() {
        if (speechStatus) speechStatus.textContent = '🔴 录音中（语音识别运行中）...';
        if (startBtn) startBtn.classList.add('hidden');
        if (stopBtn) stopBtn.classList.remove('hidden');
        if (genBtn) genBtn.classList.remove('hidden');
      };

      recognition.onresult = function(event) {
        var finalText = '';
        var interimText = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
          else interimText += event.results[i][0].transcript;
        }
        if (finalText && manualTA) {
          manualTA.value += finalText + '\n';
        }
        if (speechStatus) speechStatus.textContent = '🔴 识别中：' + interimText;
      };

      recognition.onerror = function(e) {
        if (speechStatus) speechStatus.textContent = '⚠️ 语音识别错误：' + e.error + '（可手动输入内容）';
      };

      recognition.onend = function() {
        if (speechStatus) speechStatus.textContent = '✅ 录音已停止';
      };

      try { recognition.start(); } catch(e) {
        if (speechStatus) speechStatus.textContent = '⚠️ 无法启动语音识别：' + e.message + '（请手动输入）';
        if (startBtn) startBtn.classList.add('hidden');
        if (stopBtn) stopBtn.classList.remove('hidden');
        if (genBtn) genBtn.classList.remove('hidden');
      }
    } else {
      // 没有 Speech API，提示手动输入
      if (speechStatus) speechStatus.textContent = '⚠️ 当前环境不支持语音识别，请在文本框中手动输入会议内容';
      if (startBtn) startBtn.classList.add('hidden');
      if (stopBtn) stopBtn.classList.remove('hidden');
      if (genBtn) genBtn.classList.remove('hidden');
    }
  });
}

// 停止录音
var meetingStopBtn = document.getElementById('meetingStopBtn');
if (meetingStopBtn) {
  meetingStopBtn.addEventListener('click', function() {
    if (recognition) { try { recognition.stop(); } catch(e){} recognition = null; }
    var startBtn = document.getElementById('meetingStartBtn');
    var stopBtn = document.getElementById('meetingStopBtn');
    if (startBtn) startBtn.classList.remove('hidden');
    if (stopBtn) stopBtn.classList.add('hidden');
    var speechStatus = document.getElementById('speechStatus');
    if (speechStatus) speechStatus.textContent = '✅ 已停止录音，可继续输入内容';
  });
}

// ===== 修复问题2：生成会议纪要 =====
var meetingGenerateBtn = document.getElementById('meetingGenerateBtn');
if (meetingGenerateBtn) {
  meetingGenerateBtn.addEventListener('click', async function() {
    if (recognition) { try { recognition.stop(); } catch(e){} recognition = null; }
    var manualTA = document.getElementById('manualTranscript');
    var transcriptContent = (manualTA && manualTA.value) || '';
    if (!transcriptContent.trim()) {
      showToast('⚠️ 请先在文本框中输入会议内容', 'error'); return;
    }
    meetingGenerateBtn.disabled = true;
    meetingGenerateBtn.textContent = '⏳ 生成中...';
    addTypingIndicator();

    try {
      var config = await window.electronAPI.getConfig();
      if (!config) config = {};
      if (!config.model) config.model = {};
            var nowStr = new Date().toLocaleString('zh-CN');

      // 动态获取会议纪要 Agent 的系统提示词
      var agentsResult2 = await window.electronAPI.getAgents();
      var agents2 = Array.isArray(agentsResult2) ? agentsResult2 : ((agentsResult2 && agentsResult2.agents) || []);
      var meetingAgent2 = null;
      for (var j = 0; j < agents2.length; j++) {
        if (agents2[j].id === 'meeting-assistant' || agents2[j].name.indexOf('会议') >= 0) {
          meetingAgent2 = agents2[j]; break;
        }
      }
      var systemPrompt = (meetingAgent2 && meetingAgent2.systemPrompt) ||
        '你是专业的会议纪要助手。请根据提供的会议内容，生成结构化的会议纪要，包括：会议主题、与会人员、关键决策、行动项（含负责人和截止日期）。';
      systemPrompt = systemPrompt.replace(/{{当前时间}}/g, '当前时间：' + nowStr);

      var callConfig;
      if (meetingAgent2 && meetingAgent2.baseUrl && meetingAgent2.apiKey) {
        callConfig = { apiKey: meetingAgent2.apiKey, baseUrl: meetingAgent2.baseUrl, model: meetingAgent2.model || config.model.model || 'gpt-4o', temperature: meetingAgent2.temperature || 0.3 };
      } else if (meetingAgent2 && meetingAgent2.model) {
        callConfig = { apiKey: config.model.apiKey || '', baseUrl: config.model.baseUrl || '', model: meetingAgent2.model, temperature: meetingAgent2.temperature || 0.3 };
      } else {
        callConfig = { apiKey: config.model.apiKey || '', baseUrl: config.model.baseUrl || '', model: config.model.model || 'gpt-4o', temperature: 0.3 };
      }

      if (!callConfig.baseUrl) {
        removeTypingIndicator();
        showToast('❌ 请先在设置中配置 Base URL 和 API Key', 'error');
        meetingGenerateBtn.disabled = false; meetingGenerateBtn.textContent = '📝 生成会议纪要';
        return;
      }

      var messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      var result = await window.electronAPI.callAIWithTools(messages, callConfig);
      removeTypingIndicator();

      if (result && result.success) {
        var noteContent = '';
        try { noteContent = result.data.choices[0].message.content || ''; } catch(e) {}
        if (noteContent) {
          addMessage('assistant', noteContent);
          // 自动保存
          var filename = '会议纪要-' + new Date().toISOString().slice(0, 10) + '-' + Date.now();
          var saveResult = await window.electronAPI.saveMeetingNote({ filename: filename, content: noteContent });
          if (saveResult && saveResult.success) {
            addMessage('assistant', '✅ 纪要已自动保存至：' + saveResult.path);
          }
          // 关闭会议模式
          var toolbar = document.getElementById('meetingToolbar');
          if (toolbar) toolbar.classList.add('hidden');
          isMeetingMode = false;
        } else {
          addMessage('assistant', '❌ 生成纪要内容为空，请检查会议内容后重试');
        }
      } else {
        addMessage('assistant', '❌ 生成纪要失败：' + ((result && result.error) || '未知错误'));
      }
    } catch(e) {
      removeTypingIndicator();
      addMessage('assistant', '❌ 生成纪要出错：' + e.message);
    } finally {
      meetingGenerateBtn.disabled = false;
      meetingGenerateBtn.textContent = '📝 生成会议纪要';
    }
  });
}

// ===== Agents 页面 =====
async function loadAgents() {
  try {
    var res = await window.electronAPI.getAgents();
    var agents = Array.isArray(res) ? res : ((res && res.agents) || []);
    availableAgents = agents;
    var listDiv = document.getElementById('agentList');
    var badge = document.getElementById('agentBadge');
    if (badge) badge.textContent = agents.length;
    if (!listDiv) return;
    if (agents.length === 0) {
      listDiv.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">🤖</div><div class="empty-state-text">暂无 Agent</div><div class="empty-state-hint">在对话中说"帮我创建一个XXX助手"来自动创建</div></div>';
      return;
    }
    listDiv.innerHTML = agents.map(function(a) {
      return '<div class="agent-card">' + '<div class="agent-card-header">' + getAgentAvatarHtml(a) + '<div class="agent-card-name">' + a.name + '</div></div>' +
        '<div class="agent-card-desc">' + (a.description || '暂无描述') + '</div>' +
        '<div class="agent-card-meta">创建于 ' + new Date(a.createdAt || Date.now()).toLocaleString('zh-CN') + '</div>' +
        '<div class="agent-card-actions">' +
        '<button class="card-btn card-btn-use" onclick="useAgent(\'' + a.id + '\')">💬 使用</button>' +
        '<button class="card-btn card-btn-edit" onclick="openAgentEditPanel(\'' + a.id + '\')">✏️ 编辑</button>' +
        (a.id !== 'default' ? '<button class="card-btn card-btn-delete" onclick="deleteAgent(\'' + a.id + '\')">🗑 删除</button>' : '') +
        '</div></div>';
    }).join('');
  } catch(e) { console.error('loadAgents error:', e); }
}

window.useAgent = async function(id) {
  try {
    var res = await window.electronAPI.getAgents();
    var agents = Array.isArray(res) ? res : ((res && res.agents) || []);
    var agent = null;
    for (var i = 0; i < agents.length; i++) { if (agents[i].id === id) { agent = agents[i]; break; } }
    if (agent) {
      // 🔧 [v1.3.4] 保存当前对话内容（用于关闭 Agent 时恢复）
      var msgsDiv = document.getElementById('messages');
      if (msgsDiv && !_savedChatMessages) {
        _savedChatMessages = msgsDiv.innerHTML;
        _savedChatHistory = conversationHistory.slice(); // 深拷贝
      }

      currentAgent = agent;
      agentLocked = true;
      // 确保 Agent 的工具列表可用
      window._currentAgentTools = agent.tools || ['file_read', 'file_write', 'file_list', 'file_delete', 'create_folder', 'execute_command', 'open_software', 'take_screenshot', 'create_agent', 'list_agents', 'search_meeting_notes', 'search_knowledge_base', 'get_current_time', 'open_url', 'search_web', 'fetch_url', 'win_find_window', 'win_activate_window', 'win_send_keys', 'win_click', 'run_ahk_script', 'ahk_find_window', 'ahk_send_input', 'ahk_click_control', 'organize_files', 'mcp_call'];
      if (agentIndicator) agentIndicator.classList.add('visible');
      if (currentAgentName) currentAgentName.textContent = agent.name;
      navigateTo('chat');

      // 🔧 [v1.3.4] 清空对话窗口，只显示 Agent 输出
      clearChatUI();
      conversationHistory = []; // 重置历史（Agent 会有自己的上下文）
      addMessage('assistant', '🤖 **' + agent.name + '** 已启动\n\n' + (agent.description || '') + '\n\n💬 可以开始对话了，我会以 **' + agent.name + '** 的身份回复。\n\n_点击下方 ✕ 可退出 Agent 并恢复之前的对话_');

      // ===== 修复问题3：切换 Agent 后确保输入框可用 =====
      enableInput();
      var inp = getInput();
      if (inp) inp.focus();
    }
  } catch(e) { showToast('❌ 切换失败：' + e.message, 'error'); }
};

window.deleteAgent = async function(id) {
  if (!confirm('确定删除这个 Agent 吗？')) return;
  try {
    await window.electronAPI.deleteAgent(id);
    showToast('✅ Agent 已删除');
    loadAgents();
  } catch(e) { showToast('❌ 删除失败：' + e.message, 'error'); }
};

// ===== Agent 编辑面板 =====
var currentEditingAgentId = null;

// 当前编辑的 Agent 数据目录（用于知识库默认路径）
var currentEditingAgentDataDir = null;

window.openAgentEditPanel = async function(id) {
  try {
    var res = await window.electronAPI.getAgents();
    var agents = Array.isArray(res) ? res : ((res && res.agents) || []);
    var agent = null;
    for (var i = 0; i < agents.length; i++) { if (agents[i].id === id) { agent = agents[i]; break; } }
    if (!agent) return;

    var globalConfig = await window.electronAPI.getConfig();
    if (!globalConfig) globalConfig = {};
    if (!globalConfig.model) globalConfig.model = {};
    currentEditingAgentId = id;
    currentEditingAgentDataDir = agent.dataDir || null;
    // 加载头像
    currentAgentAvatar = agent.avatar || null;
    updateAvatarPreview(agent.avatar);


    var el = function(x) { return document.getElementById(x); };
    if (el('editAgentTitle')) el('editAgentTitle').textContent = agent.name;
    if (el('editAgentName')) el('editAgentName').value = agent.name;
    if (el('editAgentDesc')) el('editAgentDesc').value = agent.description || '';
    if (el('editAgentPrompt')) el('editAgentPrompt').value = agent.systemPrompt || '';
    if (el('editAgentModel')) el('editAgentModel').value = agent.model || globalConfig.model.model || '';
    if (el('editAgentApiKey')) el('editAgentApiKey').value = agent.apiKey || '';
    if (el('editAgentBaseUrl')) el('editAgentBaseUrl').value = agent.baseUrl || '';
    if (el('editAgentTemp')) el('editAgentTemp').value = agent.temperature || 0.7;

    var notesSection = el('notesSection');
    if (notesSection) {
      var hasNotes = agent.notesDir || agent.id === 'meeting-assistant';
      notesSection.style.display = hasNotes ? 'block' : 'none';
      if (hasNotes) {
        var dirResult = await window.electronAPI.getNotesDir();
        var notesDirInput = el('notesDirPath');
        if (notesDirInput) notesDirInput.value = agent.notesDir || dirResult || '';
      }
    }

    // 知识库配置区域 - 对所有非默认 Agent 显示
    var kbSection = el('knowledgeBaseSection');
    if (kbSection) {
      var showKB = agent.id !== 'default';
      kbSection.style.display = showKB ? 'block' : 'none';
      if (showKB) {
        var kbPathInput = el('knowledgeBasePath');
        if (kbPathInput) {
          // 优先使用已配置的路径，否则使用 Agent 数据目录下的 knowledge 子目录
          var kbPath = agent.knowledgeBasePath || '';
          if (!kbPath && agent.dataDir) {
            kbPath = agent.dataDir + '\\knowledge';
          }
          kbPathInput.value = kbPath;
        }
        // 确保目录存在后再刷新文件列表
        if (kbPath) {
          try {
            await window.electronAPI.createFolder(kbPath);
          } catch(e) {
            // 目录可能已存在，忽略错误
          }
        }
        refreshKnowledgeBaseFiles();
      }
    }

    var panel = el('editPanel'), overlay = el('editPanelOverlay');
    if (panel) panel.classList.add('visible');
    if (overlay) overlay.classList.add('visible');
  } catch(e) { showToast('❌ 打开编辑面板失败：' + e.message, 'error'); }
};

// ===== 知识库配置管理函数 =====

// 选择知识库路径
window.selectKnowledgeBasePath = async function() {
  try {
    var result = await window.electronAPI.selectFolder();
    if (result && result.success && result.path) {
      var el = document.getElementById('knowledgeBasePath');
      if (el) el.value = result.path;
      refreshKnowledgeBaseFiles();
      showToast('✅ 知识库路径已选择', 'success');
    }
  } catch(e) {
    showToast('❌ 选择路径失败：' + e.message, 'error');
  }
};

// 使用默认知识库路径（Agent 数据目录下的 knowledge 子目录）
window.useDefaultKnowledgeBasePath = async function() {
  if (!currentEditingAgentDataDir) {
    showToast('⚠️ 无法获取 Agent 数据目录', 'error');
    return;
  }
  var defaultPath = currentEditingAgentDataDir + '\\knowledge';
  var el = document.getElementById('knowledgeBasePath');
  if (el) el.value = defaultPath;
  
  // 尝试创建目录
  try {
    await window.electronAPI.createFolder(defaultPath);
    showToast('✅ 已设置默认知识库路径', 'success');
    refreshKnowledgeBaseFiles();
  } catch(e) {
    // 目录可能已存在，忽略错误
    refreshKnowledgeBaseFiles();
  }
};

// 打开知识库文件夹
window.openKnowledgeBaseFolder = async function() {
  var el = document.getElementById('knowledgeBasePath');
  var kbPath = el && el.value;
  if (!kbPath) {
    showToast('⚠️ 请先设置知识库路径', 'error');
    return;
  }
  try {
    // 先尝试创建目录（如果不存在）
    await window.electronAPI.createFolder(kbPath);
    await window.electronAPI.openFolder(kbPath);
  } catch(e) {
    showToast('❌ 打开文件夹失败：' + e.message, 'error');
  }
};

// 刷新知识库文件列表
window.refreshKnowledgeBaseFiles = async function() {
  var filesDiv = document.getElementById('knowledgeBaseFiles');
  var statsDiv = document.getElementById('knowledgeBaseStats');
  var pathInput = document.getElementById('knowledgeBasePath');
  if (!filesDiv || !pathInput) return;
  
  var kbPath = pathInput.value;
  if (!kbPath) {
    filesDiv.innerHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;">请先设置知识库路径</div>';
    if (statsDiv) statsDiv.innerHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;">请先设置知识库路径</div>';
    return;
  }
  
  filesDiv.innerHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;">⏳ 加载中...</div>';
  if (statsDiv) statsDiv.innerHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;">⏳ 加载中...</div>';
  
  try {
    var result = await window.electronAPI.listDirectory(kbPath);
    if (result && result.success && result.items) {
      var supportedExts = ['.txt', '.json', '.csv', '.md', '.xlsx', '.xls', '.docx', '.doc', '.pdf'];
      var files = result.items.filter(function(f) {
        if (f.isDirectory) return false;
        var name = (f.name || '').toLowerCase();
        return supportedExts.some(function(ext) { return name.endsWith(ext); });
      });
      
      var extMap = {};
      var extIcons = {
        '.txt': { icon: '📄', label: '文本文件', color: '#6366f1' },
        '.json': { icon: '🔧', label: 'JSON文件', color: '#f59e0b' },
        '.csv': { icon: '📋', label: 'CSV文件', color: '#10b981' },
        '.md': { icon: '📑', label: 'Markdown文件', color: '#06b6d4' },
        '.xlsx': { icon: '📊', label: 'Excel文件', color: '#10b981' },
        '.xls': { icon: '📊', label: 'Excel文件', color: '#10b981' },
        '.docx': { icon: '📝', label: 'Word文件', color: '#3b82f6' },
        '.doc': { icon: '📝', label: 'Word文件', color: '#3b82f6' },
        '.pdf': { icon: '📕', label: 'PDF文件', color: '#ef4444' }
      };
      
      files.forEach(function(f) {
        var name = (f.name || '').toLowerCase();
        var ext = '.' + name.split('.').pop();
        if (!extMap[ext]) extMap[ext] = 0;
        extMap[ext]++;
      });
      
      if (files.length === 0) {
        filesDiv.innerHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;">📂 文件夹为空或无支持的文件</div>';
        if (statsDiv) statsDiv.innerHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;">📂 暂无文件</div>';
        return;
      }
      
      var statsHtml = '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
      statsHtml += '<div style="flex:1;min-width:60px;text-align:center;padding:8px;background:var(--bg-panel);border-radius:8px;">' +
        '<div style="font-size:20px;font-weight:700;color:var(--accent);">' + files.length + '</div>' +
        '<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">总文件</div></div>';
      
      var extKeys = Object.keys(extMap).sort();
      extKeys.forEach(function(ext) {
        var info = extIcons[ext] || { icon: '📄', label: ext, color: '#6b7280' };
        statsHtml += '<div style="flex:1;min-width:60px;text-align:center;padding:8px;background:var(--bg-panel);border-radius:8px;">' +
          '<div style="font-size:16px;">' + info.icon + '</div>' +
          '<div style="font-size:16px;font-weight:700;color:' + info.color + ';margin-top:2px;">' + extMap[ext] + '</div>' +
          '<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">' + info.label.replace('文件', '') + '</div></div>';
      });
      statsHtml += '</div>';
      
      if (statsDiv) statsDiv.innerHTML = statsHtml;
      
      var html = files.map(function(f) {
        var icon = '📄';
        var name = f.name || '';
        var ext = '.' + name.split('.').pop();
        var color = '#6b7280';
        if (extIcons[ext]) { icon = extIcons[ext].icon; color = extIcons[ext].color; }
        if (name.endsWith('.xlsx') || name.endsWith('.xls')) icon = '📊';
        else if (name.endsWith('.docx') || name.endsWith('.doc')) icon = '📝';
        else if (name.endsWith('.json')) icon = '🔧';
        else if (name.endsWith('.csv')) icon = '📋';
        else if (name.endsWith('.md')) icon = '📑';
        else if (name.endsWith('.pdf')) icon = '📕';
        
        var size = f.size ? (f.size > 1024 ? (f.size / 1024).toFixed(1) + ' KB' : f.size + ' B') : '';
        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg-panel);border-radius:6px;margin-bottom:4px;">' +
          '<span style="font-size:14px;">' + icon + '</span>' +
          '<span style="flex:1;font-size:12px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + name + '">' + name + '</span>' +
          '<span style="font-size:10px;color:var(--text-muted);">' + size + '</span>' +
          '</div>';
      }).join('');
      
      filesDiv.innerHTML = html;
      showToast('✅ 刷新完毕，共 ' + files.length + ' 个文件', 'success');
    } else {
      filesDiv.innerHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;">📂 文件夹为空</div>';
      if (statsDiv) statsDiv.innerHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;">📂 暂无文件</div>';
    }
  } catch(e) {
    filesDiv.innerHTML = '<div style="font-size:12px;color:var(--red);text-align:center;">❌ 加载失败：' + e.message + '</div>';
    if (statsDiv) statsDiv.innerHTML = '<div style="font-size:12px;color:var(--red);text-align:center;">❌ 加载失败</div>';
  }
};

window.closeAgentEditPanel = function() {
  var panel = document.getElementById('editPanel');
  var overlay = document.getElementById('editPanelOverlay');
  if (panel) panel.classList.remove('visible');
  if (overlay) overlay.classList.remove('visible');
  currentEditingAgentId = null;
};

window.changeNotesDir = async function() {
  var result = await window.electronAPI.selectFolder();
  if (result && result.success) {
    var el = document.getElementById('notesDirPath');
    if (el) el.value = result.path;
  }
};

window.openNotesFolder = async function() {
  var el = document.getElementById('notesDirPath');
  var notesDir = el && el.value;
  if (notesDir) await window.electronAPI.openFolder(notesDir);
};

window.saveAgentEdit = async function() {
  var id = currentEditingAgentId;
  if (!id) return;
  var el = function(x) { return document.getElementById(x); };
  var name = (el('editAgentName') && el('editAgentName').value.trim()) || '';
  if (!name) { alert('请输入 Agent 名称'); return; }

  var systemPromptVal = (el('editAgentPrompt') && el('editAgentPrompt').value.trim()) || '';
  var kbPathVal = (el('knowledgeBasePath') && el('knowledgeBasePath').value.trim()) || '';

  // 如果知识库路径为空，从 systemPrompt 自动提取文件路径
  if (!kbPathVal && systemPromptVal) {
    var pathMatch = systemPromptVal.match(/[A-Za-z]:\\[^\s\r\n'"，。、]+/);
    if (pathMatch) {
      var extractedPath = pathMatch[0].replace(/[，。、\\\s]+$/, '');
      // 如果是文件路径则取父目录
      var ext = extractedPath.split('.').pop();
      if (ext && ext.length <= 5 && ext !== extractedPath) {
        kbPathVal = extractedPath.substring(0, extractedPath.lastIndexOf('\\'));
      } else {
        kbPathVal = extractedPath;
      }
      // 同步显示到知识库路径输入框
      if (el('knowledgeBasePath')) el('knowledgeBasePath').value = kbPathVal;
    }
  }

  // 如果知识库路径存在，同步更新 systemPrompt 中的路径引用
  if (kbPathVal && systemPromptVal) {
    // 替换 systemPrompt 中旧的 knowledge 目录路径为新路径
    systemPromptVal = systemPromptVal.replace(/C:\\Users\\[^\s\r\n]+\\knowledge/g, kbPathVal);
  }

  var updates = {
  name: name,
  description: (el('editAgentDesc') && el('editAgentDesc').value.trim()) || '',
  systemPrompt: systemPromptVal,
  model: (el('editAgentModel') && el('editAgentModel').value.trim()) || '',
  apiKey: (el('editAgentApiKey') && el('editAgentApiKey').value.trim()) || '',
  baseUrl: ((el('editAgentBaseUrl') && el('editAgentBaseUrl').value.trim()) || '').replace(/\/$/, ''),
  temperature: parseFloat((el('editAgentTemp') && el('editAgentTemp').value) || '0.7'),
  knowledgeBasePath: kbPathVal
  };

  var notesSection = el('notesSection');
  if (notesSection && notesSection.style.display !== 'none') {
    var notesDir = el('notesDirPath') && el('notesDirPath').value;
    if (notesDir) updates.notesDir = notesDir;
  }

  try {
    var result = await window.electronAPI.updateAgent({ id: id, updates: updates });
    if (result && result.success) {
      showToast('✅ 修改已保存！');
      // [v1.1.5] 保存后立即刷新 currentAgent，确保模型等配置立即生效
      if (currentAgent && currentAgent.id === id) {
        var freshRes = await window.electronAPI.getAgents();
        var freshAgents = Array.isArray(freshRes) ? freshRes : ((freshRes && freshRes.agents) || []);
        for (var fi = 0; fi < freshAgents.length; fi++) {
          if (freshAgents[fi].id === id) { currentAgent = freshAgents[fi]; break; }
        }
        if (agentIndicator && currentAgentName) {
          currentAgentName.textContent = currentAgent ? currentAgent.name : '';
        }
      }
      window.closeAgentEditPanel();
      loadAgents();
    } else {
      alert('保存失败：' + ((result && result.error) || '未知错误'));
    }
  } catch(e) { alert('保存出错：' + e.message); }
};

window.testAgentModel = async function() {
  var el = function(x) { return document.getElementById(x); };
  var model = (el('editAgentModel') && el('editAgentModel').value.trim()) || '';
  var apiKey = (el('editAgentApiKey') && el('editAgentApiKey').value.trim()) || '';
  var baseUrl = ((el('editAgentBaseUrl') && el('editAgentBaseUrl').value.trim()) || '').replace(/\/$/, '');
  var statusEl = el('editAgentTestStatus');
  if (!apiKey || !baseUrl) {
    if (statusEl) { statusEl.className = 'status-text status-error'; statusEl.textContent = '❌ 请先填写 API Key 和 Base URL'; statusEl.classList.remove('hidden'); }
    return;
  }
  if (statusEl) { statusEl.classList.remove('hidden'); statusEl.textContent = '⏳ 测试中...'; statusEl.className = 'status-text'; }
  try {
    var result = await window.electronAPI.testConnection({ model: model, apiKey: apiKey, baseUrl: baseUrl });
    if (statusEl) {
      statusEl.className = 'status-text ' + (result.success ? 'status-success' : 'status-error');
      statusEl.textContent = result.success ? '✅ 连接成功！' : '❌ 失败：' + (result.error || '');
    }
  } catch(e) {
    if (statusEl) { statusEl.className = 'status-text status-error'; statusEl.textContent = '❌ 出错：' + e.message; }
  }
};

// ===== 获取 Agent 编辑面板的模型列表 =====
window.fetchAgentModels = async function() {
  var el = function(x) { return document.getElementById(x); };
  var apiKey = (el('editAgentApiKey') && el('editAgentApiKey').value.trim()) || '';
  var baseUrl = ((el('editAgentBaseUrl') && el('editAgentBaseUrl').value.trim()) || '').replace(/\/$/, '');
  var statusEl = el('editAgentModelsStatus');
  var selectEl = el('editAgentModelSelect');

  // 若 Agent 没填 baseUrl/apiKey，尝试从全局配置读取
  if (!baseUrl || !apiKey) {
    try {
      var cfg = await window.electronAPI.getConfig();
      if (!baseUrl) baseUrl = ((cfg && cfg.model && cfg.model.baseUrl) || '').replace(/\/$/, '');
      if (!apiKey) apiKey = (cfg && cfg.model && cfg.model.apiKey) || '';
    } catch(e) {}
  }

  if (!baseUrl) {
    if (statusEl) { statusEl.className = 'status-text status-error'; statusEl.textContent = '❌ 请先填写 Base URL'; statusEl.classList.remove('hidden'); }
    return;
  }
  if (statusEl) { statusEl.className = 'status-text'; statusEl.textContent = '⏳ 获取模型列表...'; statusEl.classList.remove('hidden'); }
  if (selectEl) selectEl.style.display = 'none';
  try {
    var result = await window.electronAPI.listModels({ apiKey: apiKey, baseUrl: baseUrl });
    if (result.success && result.models && result.models.length > 0) {
      if (selectEl) {
        selectEl.innerHTML = '<option value="">— 选择模型 —</option>' +
          result.models.map(function(m) { return '<option value="' + m + '">' + m + '</option>'; }).join('');
        selectEl.style.display = '';
        selectEl.onchange = function() {
          var inp = el('editAgentModel');
          if (inp && selectEl.value) { inp.value = selectEl.value; }
        };
      }
      if (statusEl) { statusEl.className = 'status-text status-success'; statusEl.textContent = '✅ 获取到 ' + result.models.length + ' 个模型，点击下方选择'; }
    } else {
      if (statusEl) { statusEl.className = 'status-text status-error'; statusEl.textContent = '❌ ' + (result.error || '未获取到模型'); }
    }
  } catch(e) {
    if (statusEl) { statusEl.className = 'status-text status-error'; statusEl.textContent = '❌ 出错：' + e.message; }
  }
};

// ===== 一键填入全局默认模型配置 =====
window.fillDefaultModel = async function() {
  try {
    var cfg = await window.electronAPI.getConfig();
    var m = (cfg && cfg.model) || {};
    var el = function(x) { return document.getElementById(x); };
    if (m.model && el('editAgentModel') && !el('editAgentModel').value) {
      el('editAgentModel').value = m.model;
    } else if (m.model && el('editAgentModel')) {
      el('editAgentModel').value = m.model;
    }
    if (m.apiKey && el('editAgentApiKey')) el('editAgentApiKey').value = m.apiKey;
    if (m.baseUrl && el('editAgentBaseUrl')) el('editAgentBaseUrl').value = m.baseUrl;
    if (m.temperature !== undefined && el('editAgentTemp')) el('editAgentTemp').value = m.temperature;
    showToast('✅ 已填入默认模型配置');
  } catch(e) {
    showToast('❌ 读取全局配置失败：' + e.message, 'error');
  }
};

// ===== 手动创建 Agent =====
window.showCreateAgentModal = function() {
  var el = document.getElementById('createAgentModal');
  if (el) el.classList.add('visible');
};
window.closeCreateAgentModal = function() {
  var el = document.getElementById('createAgentModal');
  if (el) el.classList.remove('visible');
  ['newAgentName','newAgentDesc','newAgentPrompt','newAgentModel','newAgentApiKey','newAgentBaseUrl'].forEach(function(id) {
    var e = document.getElementById(id); if (e) e.value = '';
  });
};

// 新建 Agent 时一键填入全局默认模型
window.fillNewAgentDefaultModel = async function() {
  try {
    var cfg = await window.electronAPI.getConfig();
    var m = (cfg && cfg.model) || {};
    var el = function(x) { return document.getElementById(x); };
    if (m.model && el('newAgentModel')) el('newAgentModel').value = m.model;
    if (m.apiKey && el('newAgentApiKey')) el('newAgentApiKey').value = m.apiKey;
    if (m.baseUrl && el('newAgentBaseUrl')) el('newAgentBaseUrl').value = m.baseUrl;
    showToast('✅ 已填入默认模型配置');
  } catch(e) {
    showToast('❌ 读取全局配置失败：' + e.message, 'error');
  }
};

window.createAgentManual = async function() {
  var name = (document.getElementById('newAgentName') || {}).value || '';
  var description = (document.getElementById('newAgentDesc') || {}).value || '';
  var systemPrompt = (document.getElementById('newAgentPrompt') || {}).value || '';
  var model = ((document.getElementById('newAgentModel') || {}).value || '').trim();
  var apiKey = ((document.getElementById('newAgentApiKey') || {}).value || '').trim();
  var baseUrl = ((document.getElementById('newAgentBaseUrl') || {}).value || '').trim().replace(/\/$/, '');
  name = name.trim();
  description = description.trim();
  systemPrompt = systemPrompt.trim();
  if (!name) { alert('请输入 Agent 名称'); return; }
  if (!description) { alert('请输入 Agent 描述'); return; }
  if (!systemPrompt) { alert('请输入 Agent 系统提示词'); return; }

  // 若未填模型，自动继承全局配置
  if (!model || !apiKey || !baseUrl) {
    try {
      var cfg = await window.electronAPI.getConfig();
      var m = (cfg && cfg.model) || {};
      if (!model) model = m.model || '';
      if (!apiKey) apiKey = m.apiKey || '';
      if (!baseUrl) baseUrl = (m.baseUrl || '').replace(/\/$/, '');
    } catch(e) {}
  }

  try {
    var agentData = { name: name, description: description.trim(), systemPrompt: systemPrompt.trim() };
    if (model) agentData.model = model;
    if (apiKey) agentData.apiKey = apiKey;
    if (baseUrl) agentData.baseUrl = baseUrl;
    var result = await window.electronAPI.createAgent(agentData);
    if (result && result.success) {
      showToast('✅ Agent 创建成功！');
      window.closeCreateAgentModal();
      loadAgents();
    } else {
      alert('创建失败：' + ((result && result.error) || '未知错误'));
    }
  } catch(e) { alert('创建出错：' + e.message); }
};

// ===== Skills 页面 =====
async function loadSkills() {
  try {
    var res = await window.electronAPI.getSkills();
    var skills = Array.isArray(res) ? res : ((res && res.skills) || []);
    var listDiv = document.getElementById('skillList');
    if (!listDiv) return;
    if (skills.length === 0) {
      listDiv.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">🛠</div><div class="empty-state-text">暂无 Skill</div><div class="empty-state-hint">在对话中说"创建一个XXX技能"来创建</div></div>';
      return;
    }
    listDiv.innerHTML = skills.map(function(s) {
      return '<div class="agent-card"><div class="agent-card-header"><div class="agent-card-name">🛠 ' + s.name + '</div></div><div class="agent-card-desc">' + (s.description || '暂无描述') + '</div><div class="agent-card-meta">创建于 ' + new Date(s.createdAt || Date.now()).toLocaleString('zh-CN') + '</div><div class="agent-card-actions"><button class="card-btn card-btn-delete" onclick="deleteSkill(\'' + s.id + '\')">🗑 删除</button></div></div>';
    }).join('');
  } catch(e) { console.error('loadSkills error:', e); }
}

window.deleteSkill = async function(id) {
  if (!confirm('确定删除？')) return;
  try { await window.electronAPI.deleteSkill(id); showToast('✅ 已删除'); loadSkills(); }
  catch(e) { showToast('❌ 删除失败', 'error'); }
};

window.showCreateSkillModal = function() {
  var el = document.getElementById('createSkillModal');
  if (el) el.classList.add('visible');
};
window.closeCreateSkillModal = function() {
  var el = document.getElementById('createSkillModal');
  if (el) el.classList.remove('visible');
};
window.createSkillManual = async function() {
  var name = ((document.getElementById('newSkillName') || {}).value || '').trim();
  var desc = ((document.getElementById('newSkillDesc') || {}).value || '').trim();
  if (!name) { alert('请输入 Skill 名称'); return; }
  try {
    var result = await window.electronAPI.createSkill({ name: name, description: desc });
    if (result && result.success) { showToast('✅ Skill 已创建'); window.closeCreateSkillModal(); loadSkills(); }
    else { alert('创建失败：' + ((result && result.error) || '')); }
  } catch(e) { alert('出错：' + e.message); }
};

// ===== 群聊 Modal =====
window.showGroupChatModal = async function() {
  _selectedGroupAgents = [];
  var modal = document.getElementById('groupChatModal');
  if (modal) modal.classList.add('visible');
  var nameInput = document.getElementById('groupChatName');
  if (nameInput) nameInput.value = '';
  var selDiv = document.getElementById('groupChatSelected');
  if (selDiv) selDiv.textContent = '已选: 无';
  var listDiv = document.getElementById('groupChatList');
  if (!listDiv) return;
  try {
    var res = await window.electronAPI.getAgents();
    var agents = Array.isArray(res) ? res : ((res && res.agents) || []);
    var nonDefault = agents.filter(function(a) { return a.id !== 'default'; });
    listDiv.innerHTML = nonDefault.map(function(a) {
      var safeName = a.name.replace(/'/g, '');
      return '<div class="group-chat-item" id="gc-item-' + a.id + '" onclick="toggleGroupAgent(\'' + a.id + '\',\'' + safeName + '\')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;border:2px solid transparent;margin-bottom:6px;background:var(--bg-input);">' +
        '<div style="width:20px;height:20px;border-radius:4px;border:2px solid var(--accent);display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;" id="gc-check-' + a.id + '"></div>' +
        '<div style="width:28px;height:28px;border-radius:50%;flex-shrink:0;overflow:hidden;">' + getAgentAvatarHtml(a, 28) + '</div>' +
        '<div style="min-width:0;"><div style="font-size:13px;font-weight:600;">' + a.name + '</div><div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (a.description || '').slice(0, 40) + '</div></div>' +
        '</div>';
    }).join('') || '<div style="text-align:center;padding:20px;color:var(--text-muted);">暂无可用 Agent</div>';
  } catch(e) { if (listDiv) listDiv.innerHTML = '<div style="color:red;padding:10px;">加载失败</div>'; }
};
var _selectedGroupAgents = [];
window.toggleGroupAgent = function(id, name) {
  var idx = _selectedGroupAgents.findIndex(function(a) { return a.id === id; });
  var checkEl = document.getElementById('gc-check-' + id);
  var itemEl = document.getElementById('gc-item-' + id);
  if (idx >= 0) {
    _selectedGroupAgents.splice(idx, 1);
    if (checkEl) checkEl.textContent = '';
    if (itemEl) itemEl.style.borderColor = 'transparent';
  } else {
    _selectedGroupAgents.push({ id: id, name: name });
    if (checkEl) checkEl.textContent = '✓';
    if (itemEl) itemEl.style.borderColor = 'var(--accent)';
  }
  var selDiv = document.getElementById('groupChatSelected');
  if (selDiv) selDiv.textContent = _selectedGroupAgents.length ? '已选: ' + _selectedGroupAgents.map(function(a){return a.name;}).join('、') : '已选: 无';
};
window.confirmCreateGroupChat = async function() {
  if (_selectedGroupAgents.length < 2) { showToast('请至少选择2个Agent', 'error'); return; }
  var nameInput = document.getElementById('groupChatName');
  var gcName = (nameInput && nameInput.value.trim()) || (_selectedGroupAgents.map(function(a){return a.name;}).join('+') + ' 群聊');
  window.closeGroupChatModal();
  var res = await window.electronAPI.getAgents();
  var allAgents = Array.isArray(res) ? res : ((res && res.agents) || []);
  var gcAgents = _selectedGroupAgents.map(function(sa) {
    return allAgents.find(function(a){return a.id===sa.id;}) || sa;
  });
  var gc = { id: 'gc-' + Date.now(), name: gcName, agents: gcAgents, messages: [], conversationHistory: [], createdAt: Date.now() };
  groupChats.push(gc);
  window.persistGroupChats();
  renderGroupChatSidebar();
  window.switchToGroupChat(gc.id);
  showToast('✅ 群聊已创建: ' + gcName);
};
window.closeGroupChatModal = function() {
  var el = document.getElementById('groupChatModal');
  if (el) el.classList.remove('visible');
};
// 旧群聊代码已清理

// 渲染侧边栏群聊列表
function renderGroupChatSidebar() {
  var container = document.getElementById('groupChatListContainer');
  if (!container) return;
  if (groupChats.length === 0) {
    container.innerHTML = '<div style="padding:6px 10px;font-size:11px;color:var(--text-muted);opacity:0.6;">还没有群聊</div>';
    return;
  }
  container.innerHTML = groupChats.map(function(gc) {
    var isActive = currentGroupChat && currentGroupChat.id === gc.id;
    var bgStyle = isActive ? 'background:var(--bg-active);' : 'background:transparent;';
    return '<div class="gc-sidebar-item" onclick="switchToGroupChat(\'' + gc.id + '\')" '
      + 'style="' + bgStyle + 'display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;border-radius:var(--radius-md);margin-bottom:2px;transition:all 0.15s;">'
      + '<span style="font-size:14px;flex-shrink:0;opacity:0.7;">&#128101;</span>'
      + '<span style="flex:1;font-size:12px;font-weight:500;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + gc.name + '</span>'
      + '<span onclick="event.stopPropagation();deleteGroupChat(\'' + gc.id + '\')" '
      + 'style="font-size:14px;color:var(--text-muted);opacity:0;cursor:pointer;padding:0 4px;transition:opacity 0.15s;" class="gc-delete-btn" title="删除群聊">\u00d7</span>'
      + '</div>';
  }).join('');
  
  // 添加hover效果
  var items = container.querySelectorAll('.gc-sidebar-item');
  items.forEach(function(item) {
    item.addEventListener('mouseenter', function() {
      var deleteBtn = item.querySelector('.gc-delete-btn');
      if (deleteBtn) deleteBtn.style.opacity = '0.5';
      if (!item.style.background || item.style.background === 'transparent') {
        item.style.background = 'var(--bg-hover)';
      }
    });
    item.addEventListener('mouseleave', function() {
      var deleteBtn = item.querySelector('.gc-delete-btn');
      if (deleteBtn) deleteBtn.style.opacity = '0';
      var isActive = currentGroupChat && item.onclick.toString().indexOf(currentGroupChat.id) >= 0;
      item.style.background = isActive ? 'var(--bg-active)' : 'transparent';
    });
  });
}

// 切换到群聊独立页面
window.switchToGroupChat = function(gcId) {
  var gc = groupChats.find(function(g) { return g.id === gcId; });
  if (!gc) return;
  currentGroupChat = gc;
  // ===== 【关键】切换到群聊时，绝不修改对话界面的 currentAgent 和 conversationHistory =====
  // currentAgent 属于对话页面，群聊不能碰它
  renderGroupChatSidebar();
  renderGcListPanel();
  // 跳转到群聊独立页面
  navigateTo('groupchat');
  renderGcActivePanel(gc);
};

// 渲染群聊列表面板（页面内左侧）
window.renderGcListPanel = function() { renderGroupChatSidebar(); }

// 渲染群聊活动面板（右侧消息区）
window.renderGcActivePanel = function(gc) {
  var emptyState = document.getElementById('gc-empty-state');
  var activePanel = document.getElementById('gc-active-panel');
  if (!emptyState || !activePanel) return;

  emptyState.style.display = 'none';
  activePanel.style.display = 'flex';
  activePanel.style.flexDirection = 'column';
  activePanel.style.flex = '1';
  activePanel.style.overflow = 'hidden';

  // 更新头部
  var nameEl = document.getElementById('gc-header-name');
  var membersEl = document.getElementById('gc-header-members');
  if (nameEl) nameEl.textContent = gc.name;
  if (membersEl) membersEl.textContent = gc.agents.map(function(a) { return a.name; }).join(' · ');

  // 渲染历史消息
  var msgBox = document.getElementById('gc-messages');
  if (!msgBox) return;
  msgBox.innerHTML = '';

  // 欢迎消息（仅在没有历史时显示）
  if (!gc.messages || gc.messages.length === 0) {
    var welcome = document.createElement('div');
    welcome.style.cssText = 'text-align:center;padding:20px;color:var(--text-muted);font-size:13px;';
    welcome.innerHTML = '👥 <strong style="color:var(--text-primary);">' + gc.name + '</strong> 群聊已开启<br><span style="font-size:12px;opacity:0.7;">成员：' +
      gc.agents.map(function(a) { return a.name; }).join('、') +
      '<br>输入 @Agent名 可指定对方回答，不 @ 则所有成员协作</span>';
    msgBox.appendChild(welcome);
  }

  // 渲染历史消息
  if (gc.messages) {
    gc.messages.forEach(function(m) {
      appendGcMessage(m.role, m.content, m.agentName);
    });
  }

  msgBox.scrollTop = msgBox.scrollHeight;
  var gcInput = document.getElementById('gc-input');
  if (gcInput) gcInput.focus();
};

// 添加一条群聊消息到界面
window.appendGcMessage = function(role, content, agentName) {
  var msgBox = document.getElementById('gc-messages');
  if (!msgBox) return;
  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;gap:10px;align-items:flex-start;' + (role === 'user' ? 'flex-direction:row-reverse;' : '');
  var avatar = document.createElement('div');
  avatar.style.cssText = 'width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;font-weight:700;';
  if (role === 'user') {
    avatar.style.background = 'linear-gradient(135deg,#3b82f6,#1d4ed8)';
    avatar.textContent = '我';
  } else {
    avatar.style.background = 'linear-gradient(135deg,#8b5cf6,#6366f1)';
    avatar.textContent = (agentName || 'AI').charAt(0);
  }
  var bubble = document.createElement('div');
  bubble.style.cssText = 'max-width:70%;padding:10px 14px;border-radius:14px;font-size:14px;line-height:1.6;word-break:break-word;' +
    (role === 'user'
      ? 'background:linear-gradient(135deg,rgba(59,130,246,0.25),rgba(29,78,216,0.2));border:1px solid rgba(59,130,246,0.2);color:var(--text-primary);'
      : 'background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);color:var(--text-primary);');
  if (role !== 'user' && agentName) {
    var nameTag = document.createElement('div');
    nameTag.style.cssText = 'font-size:11px;font-weight:700;color:#c4b5fd;margin-bottom:4px;';
    nameTag.textContent = agentName;
    bubble.appendChild(nameTag);
  }
  var text = document.createElement('div');
  text.textContent = content;
  bubble.appendChild(text);
  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  msgBox.appendChild(wrap);
  msgBox.scrollTop = msgBox.scrollHeight;
};

// 退出群聊（回到对话页面，不影响对话状态）
window.exitGroupChat = function() {
  currentGroupChat = null;
  renderGroupChatSidebar();
  // 切换回对话页面，对话的 currentAgent / conversationHistory 保持不变
  navigateTo('chat');
};

// 删除群聊（完全清除该群聊的所有记忆、历史、状态）
window.deleteGroupChat = function(gcId) {
  if (!confirm('确定删除这个群聊吗？删除后聊天记录和记忆将完全清除，不可恢复。')) return;

  // 找到目标群聊
  var gcIdx = groupChats.findIndex(function(g) { return g.id === gcId; });
  if (gcIdx >= 0) {
    var gc = groupChats[gcIdx];
    // 彻底清除该群聊的所有记忆数据
    if (gc.messages) gc.messages = [];
    if (gc.conversationHistory) gc.conversationHistory = [];
    // 从列表中移除
    groupChats.splice(gcIdx, 1);
  }
  window.persistGroupChats();

  // 如果当前正在这个群聊里，切回对话页面
  if (currentGroupChat && currentGroupChat.id === gcId) {
    currentGroupChat = null;
    gcIsSending = false;
    renderGroupChatSidebar();
    // 回到空状态（不跳转到对话页，留在群聊页显示空态）
    var emptyState = document.getElementById('gc-empty-state');
    var activePanel = document.getElementById('gc-active-panel');
    if (emptyState) emptyState.style.display = '';
    if (activePanel) activePanel.style.display = 'none';
  } else {
    renderGroupChatSidebar();
  }
  showToast('群聊已解散，所有记录已清除', 'success');
};

// ===== 群聊独立页面输入处理 =====
window.gcInputKeydown = function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendGroupMessageFromUI();
  }
};
window.gcInputAutoResize = function(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
};
window.gcAtHint = function(val) {
  // 群聊 @ 提示（只显示本群成员）
  var drop = document.getElementById('groupAtDropdown') || document.getElementById('gc-messages');
  // 沿用 atDropdown 逻辑，但过滤只显示本群成员
  if (!currentGroupChat) return;
  var atIdx = val.lastIndexOf('@');
  if (atIdx >= 0) {
    var query = val.slice(atIdx + 1).toLowerCase();
    var matches = currentGroupChat.agents.filter(function(a) { return a.name.toLowerCase().indexOf(query) >= 0; });
    showGcAtDropdown(matches);
  } else {
    hideGcAtDropdown();
  }
};

// 群聊停止生成
var _gcAbortController = null;
window.gcStopGeneration = function() {
  if (_gcAbortController) {
    _gcAbortController.abort();
    _gcAbortController = null;
  }
  var btn = document.getElementById('gcStopBtn');
  if (btn) btn.style.display = 'none';
};
window.showGcAtDropdown = function(agents) {
  hideGcAtDropdown();
  if (!agents || agents.length === 0) return;
  var inputEl = document.getElementById('gc-input');
  if (!inputEl) return;
  var wrap = inputEl.closest('div');
  var drop = document.createElement('div');
  drop.id = 'gc-at-dropdown';
  drop._selectedIndex = -1;
  drop._agents = agents;
  drop.style.cssText = 'position:absolute;bottom:100%;left:0;right:0;background:var(--bg-secondary);border:1px solid rgba(139,92,246,0.3);border-radius:10px;padding:6px;z-index:200;box-shadow:0 -4px 20px rgba(0,0,0,.3);max-height:180px;overflow-y:auto;margin-bottom:6px;';
  agents.forEach(function(agent, idx) {
    var item = document.createElement('div');
    item.setAttribute('data-gc-at-index', idx);
    item.style.cssText = 'padding:8px 10px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:8px;';
    item.innerHTML = '<div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#8b5cf6,#6366f1);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;">' + agent.name.charAt(0) + '</div><div><div style="font-size:13px;font-weight:600;color:var(--text-primary);">@' + agent.name + '</div><div style="font-size:11px;color:var(--text-muted);">' + (agent.description||'').slice(0,30) + '</div></div>';
    item.addEventListener('mouseenter', function() { item.style.background = 'rgba(139,92,246,0.1)'; });
    item.addEventListener('mouseleave', function() { item.style.background = ''; });
    item.addEventListener('click', function() {
      selectGcAtAgent(agent);
    });
    drop.appendChild(item);
  });
  var container = inputEl.parentElement.parentElement;
  container.style.position = 'relative';
  container.appendChild(drop);
};

function selectGcAtAgent(agent) {
  var inp = document.getElementById('gc-input');
  if (!inp) return;
  var v = inp.value;
  var atp = v.lastIndexOf('@');
  inp.value = v.slice(0, atp) + '@' + agent.name + ' ';
  hideGcAtDropdown();
  inp.focus();
  inp.dispatchEvent(new Event('input', { bubbles: true }));
}

window.hideGcAtDropdown = function() {
  var d = document.getElementById('gc-at-dropdown');
  if (d) d.remove();
};

// 键盘导航：上下箭头选择 + 回车确认（群聊 @ 下拉）
document.addEventListener('keydown', function(e) {
  var drop = document.getElementById('gc-at-dropdown');
  if (!drop) return;
  var items = drop.querySelectorAll('[data-gc-at-index]');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    drop._selectedIndex = Math.min(drop._selectedIndex + 1, items.length - 1);
    updateGcAtSelection(drop, items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    drop._selectedIndex = Math.max(drop._selectedIndex - 1, 0);
    updateGcAtSelection(drop, items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    var gidx = drop._selectedIndex >= 0 ? drop._selectedIndex : 0;
    var agent = drop._agents[gidx];
    if (agent) selectGcAtAgent(agent);
  } else if (e.key === 'Escape') {
    hideGcAtDropdown();
  }
}, true);

function updateGcAtSelection(drop, items) {
  items.forEach(function(item, i) {
    if (i === drop._selectedIndex) {
      item.style.background = 'rgba(139,92,246,0.2)';
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.style.background = '';
    }
  });
}
window.sendGroupMessageFromUI = async function() {
  var inp = document.getElementById('gc-input');
  if (!inp || gcIsSending) return;
  var text = inp.value.trim();
  if (!text) return;
  if (!currentGroupChat) return;

  gcIsSending = true;
  inp.value = '';
  inp.style.height = '';
  hideGcAtDropdown();

  // ===== 【关键】群聊消息只写入 gc-messages，绝不碰主对话的 messagesDiv / conversationHistory =====
  appendGcMessage('user', text);
  currentGroupChat.messages = currentGroupChat.messages || [];
  currentGroupChat.conversationHistory = currentGroupChat.conversationHistory || [];
  currentGroupChat.messages.push({ role: 'user', content: text, ts: Date.now() });
  currentGroupChat.conversationHistory.push({ role: 'user', content: text });

  // 禁用群聊发送按钮（不影响对话页的 sendBtn）
  var gcSendBtn = document.querySelector('#gc-active-panel button[onclick="sendGroupMessageFromUI()"]');
  if (gcSendBtn) gcSendBtn.disabled = true;

  try {
    var cfg = {};
    try { cfg = (await window.electronAPI.getConfig()) || {}; } catch(e) {}
    if (!cfg.model) cfg.model = {};

    // Determine target agents from @mentions
    var atMatches = text.match(/@([^\s@\uff0c\u3002\uff01\uff1f,]+)/g) || [];
    var targets = [];
    if (atMatches.length > 0) {
      atMatches.forEach(function(m) {
        var name = m.slice(1).toLowerCase();
        currentGroupChat.agents.forEach(function(a) {
          if (a.name.toLowerCase().indexOf(name) >= 0 && targets.indexOf(a) < 0) targets.push(a);
        });
      });
    }
    // 如果没有@任何人，不自动回复（避免所有agent都响应）
    if (targets.length === 0) {
      // 可选：显示提示
      var msgBox = document.getElementById('gc-messages');
      if (msgBox) {
        var hint = document.createElement('div');
        hint.style.cssText = 'text-align:center;color:var(--text-muted);font-size:12px;padding:8px;';
        hint.textContent = '💡 使用 @AgentName 来指定回复的Agent';
        msgBox.appendChild(hint);
        setTimeout(function() { if (hint.parentNode) hint.remove(); }, 3000);
      }
      gcIsSending = false;
      if (gcSendBtn) gcSendBtn.disabled = false;
      inp.focus();
      return;
    }

    var msgBox = document.getElementById('gc-messages');

    // ===== 队列式处理：agent 回复里 @其他 agent 也会触发对方回复 =====
    var queue = targets.slice();           // 待回复的 agent 队列
    var processedCount = 0;                // 已处理回合数
    var MAX_TURNS = 12;                    // 防止 agent 互相 @ 无限循环
    function findAgentsByMention(textStr, excludeId) {
      var found = [];
      var ms = textStr.match(/@([^\s@\uff0c\u3002\uff01\uff1f,]+)/g) || [];
      ms.forEach(function(m) {
        var nm = m.slice(1).toLowerCase();
        currentGroupChat.agents.forEach(function(a) {
          if (a.id !== excludeId && a.name.toLowerCase().indexOf(nm) >= 0 && found.indexOf(a) < 0) found.push(a);
        });
      });
      return found;
    }

    while (queue.length > 0 && processedCount < MAX_TURNS) {
      var agent = queue.shift();
      processedCount++;

      // Typing indicator（只在 gc-messages 里）
      var tid = 'gc-typing-' + agent.id + '-' + Date.now();
      var tel = document.createElement('div');
      tel.id = tid;
      tel.style.cssText = 'display:flex;gap:10px;align-items:flex-start;margin-bottom:4px;';
      tel.innerHTML = '<div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#8b5cf6,#6366f1);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;">' + (agent.name||'AI').charAt(0) + '</div>'
        + '<div style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);border-radius:14px;padding:10px 14px;">'
        + '<div style="font-size:11px;font-weight:700;color:#c4b5fd;margin-bottom:4px;">' + agent.name + '</div>'
        + '<div style="font-size:18px;color:var(--text-muted);letter-spacing:4px;">&#8226;&#8226;&#8226;</div></div>';
      if (msgBox) { msgBox.appendChild(tel); msgBox.scrollTop = msgBox.scrollHeight; }

      // Build system prompt（群聊专用，不注入对话页的系统提示）
      var sysp = (agent.systemPrompt || '') || ('\u4f60\u662f' + agent.name);
      var otherNames = currentGroupChat.agents.filter(function(x){return x.id!==agent.id;}).map(function(x){return x.name;});
      sysp += '\n\n\u4f60\u5728\u7fa4\u804a\u201c' + currentGroupChat.name + '\u201d\u4e2d\uff0c\u5176\u4ed6\u6210\u5458\uff1a' +
        otherNames.join('\u3001') +
        '\u3002\u8bf7\u4ee5 ' + agent.name + ' \u7684\u8eab\u4efd\u56de\u590d\u3002' +
        '\u5982\u679c\u4f60\u9700\u8981\u8ba9\u67d0\u4e2a\u6210\u5458\u63a5\u7740\u56de\u7b54\u6216\u534f\u4f5c\uff0c\u53ef\u4ee5\u5728\u56de\u590d\u4e2d\u7528 @\u6210\u5458\u540d\uff08\u4f8b\u5982 @' + (otherNames[0] || 'XXX') + '\uff09\u6765\u70b9\u540d\uff0c\u88ab @ \u7684\u6210\u5458\u4f1a\u81ea\u52a8\u63a5\u8bdd\u3002';

      // Agent model config
      var callCfg;
      if (agent.apiKey && agent.baseUrl) {
        callCfg = { apiKey: agent.apiKey, baseUrl: agent.baseUrl, model: agent.model || cfg.model.model || 'gpt-4o', temperature: agent.temperature || 0.7 };
      } else if (agent.model) {
        callCfg = { apiKey: cfg.model.apiKey || '', baseUrl: cfg.model.baseUrl || '', model: agent.model, temperature: agent.temperature || 0.7 };
      } else {
        callCfg = { apiKey: cfg.model.apiKey || '', baseUrl: cfg.model.baseUrl || '', model: cfg.model.model || 'gpt-4o', temperature: 0.7 };
      }

      // 使用该群聊自己的 conversationHistory（与对话页完全隔离）
      var _gcLimit = parseInt(cfg.groupContextLimit, 10);
      if (isNaN(_gcLimit) || _gcLimit < 2) _gcLimit = 30;
      var history = (currentGroupChat.conversationHistory || []).slice(-_gcLimit);
      var msgs = [{ role: 'system', content: sysp }].concat(history);

      var result;
      try { result = await window.electronAPI.callAIWithTools(msgs, callCfg, agent.id + '_gc_' + currentGroupChat.id); }
      catch(err) { result = { success: false, error: err.message }; }

      // Remove typing
      var te = document.getElementById(tid);
      if (te) te.remove();

      if (result && result.success) {
        var reply = '';
        try { reply = result.data.choices[0].message.content || ''; } catch(e2) {}
        if (reply) {
          // ===== 只写入 gc-messages，绝不写入主对话 messagesDiv =====
          appendGcMessage('assistant', reply, agent.name);
          currentGroupChat.messages.push({ role: 'assistant', content: reply, agentName: agent.name, ts: Date.now() });
          currentGroupChat.conversationHistory.push({ role: 'assistant', content: '[' + agent.name + ']: ' + reply });
          // 若该 agent 的回复里 @了其他成员，则把对方加入队列（agent 间 @ 生效）
          var mentioned = findAgentsByMention(reply, agent.id);
          mentioned.forEach(function(a) { if (queue.indexOf(a) < 0) queue.push(a); });
        }
      } else {
        appendGcMessage('assistant', '\u274c ' + ((result && result.error) || '\u672a\u77e5\u9519\u8bef'), agent.name);
      }
    }
  } catch(e) {
    var mb = document.getElementById('gc-messages');
    if (mb) { var ee=document.createElement('div'); ee.style.cssText='text-align:center;color:#ef4444;font-size:12px;padding:8px;'; ee.textContent='\u7fa4\u804a\u9519\u8bef: '+e.message; mb.appendChild(ee); }
  } finally {
    gcIsSending = false;
    if (gcSendBtn) gcSendBtn.disabled = false;
    var mb2 = document.getElementById('gc-messages');
    if (mb2) mb2.scrollTop = mb2.scrollHeight;
    inp.focus();
    window.persistGroupChats();
  }
}
window.deleteCurrentGroupChat = function() {
  if (!currentGroupChat) return;
  // deleteGroupChat 内部已有 confirm，直接调用
  window.deleteGroupChat(currentGroupChat.id);
};
window.triggerGcAttach = function() {
  var inp = document.getElementById('gcAttachInput');
  if (inp) inp.click();
};
window.handleGcAttach = function(input) {
  if (!input.files) return;
  Array.from(input.files).forEach(function(f) {
    var prev = document.getElementById('gc-attach-preview');
    if (!prev) return;
    var tag = document.createElement('div');
    tag.style.cssText = 'background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);border-radius:6px;padding:3px 10px;font-size:12px;color:#c4b5fd;display:flex;align-items:center;gap:4px;';
    tag.innerHTML = '📎 ' + f.name + ' <span style="cursor:pointer;opacity:0.6;font-size:14px;" onclick="this.parentElement.remove()">×</span>';
    prev.appendChild(tag);
  });
};

// ===== 统计页面 =====
function loadStats() {
  try {
    var chatCount = parseInt((typeof localStorage !== 'undefined' && localStorage.getItem('chatCount')) || '0');
    var tokenCount = parseInt((typeof localStorage !== 'undefined' && localStorage.getItem('tokenCount')) || '0');
    var promptTokenCount = parseInt((typeof localStorage !== 'undefined' && localStorage.getItem('promptTokenCount')) || '0');
    var completionTokenCount = parseInt((typeof localStorage !== 'undefined' && localStorage.getItem('completionTokenCount')) || '0');
    var cacheTokenCount = parseInt((typeof localStorage !== 'undefined' && localStorage.getItem('cacheTokenCount')) || '0');
    var el = document.getElementById('chatCount');
    if (el) el.textContent = chatCount;
    var el2 = document.getElementById('tokenCount');
    if (el2) el2.textContent = tokenCount;
    var el3 = document.getElementById('promptTokenCount');
    if (el3) el3.textContent = promptTokenCount;
    var el4 = document.getElementById('completionTokenCount');
    if (el4) el4.textContent = completionTokenCount;
    var el5 = document.getElementById('cacheTokenCount');
    if (el5) el5.textContent = cacheTokenCount;
  } catch(e) {}
  window.electronAPI.getAgents().then(function(res) {
    var agents = Array.isArray(res) ? res : ((res && res.agents) || []);
    var el = document.getElementById('agentCount');
    if (el) el.textContent = agents.length;
  }).catch(function(){});
  window.electronAPI.getSkills().then(function(res) {
    var skills = Array.isArray(res) ? res : ((res && res.skills) || []);
    var el = document.getElementById('skillCount');
    if (el) el.textContent = skills.length;
  }).catch(function(){});
}

function saveStats(tokenUsage) {
  try {
    if (typeof localStorage !== 'undefined') {
      // 增加对话次数
      var cnt = parseInt(localStorage.getItem('chatCount') || '0') + 1;
      localStorage.setItem('chatCount', cnt.toString());
      
      // 增加 token 消耗
      if (tokenUsage && tokenUsage.total_tokens) {
        var tokenCnt = parseInt(localStorage.getItem('tokenCount') || '0') + tokenUsage.total_tokens;
        localStorage.setItem('tokenCount', tokenCnt.toString());
        
        // 保存详细的 token 统计（可选）
        var promptTokens = parseInt(localStorage.getItem('promptTokenCount') || '0') + (tokenUsage.prompt_tokens || 0);
        var completionTokens = parseInt(localStorage.getItem('completionTokenCount') || '0') + (tokenUsage.completion_tokens || 0);
        localStorage.setItem('promptTokenCount', promptTokens.toString());
        localStorage.setItem('completionTokenCount', completionTokens.toString());
        
        // 保存缓存 token 统计（Anthropic prompt caching）
        var cacheCreationTokens = (tokenUsage.cache_creation_input_tokens || 0);
        var cacheReadTokens = (tokenUsage.cache_read_input_tokens || 0);
        var cacheTokens = parseInt(localStorage.getItem('cacheTokenCount') || '0') + cacheCreationTokens + cacheReadTokens;
        localStorage.setItem('cacheTokenCount', cacheTokens.toString());
      }
    }
  } catch(e){ console.error('saveStats error:', e); }
}

// ===== 初始化 =====
(async function init() {
  // 加载 Agents
  try {
    var res = await window.electronAPI.getAgents();
    availableAgents = Array.isArray(res) ? res : ((res && res.agents) || []);
    // 启动时即更新侧边栏 Agent 数量徽章（无需点击进入页面）
    var _agentBadge = document.getElementById('agentBadge');
    if (_agentBadge) _agentBadge.textContent = availableAgents.length;
    var _agentCount = document.getElementById('agentCount');
    if (_agentCount) _agentCount.textContent = availableAgents.length;
  } catch(e) {}

  // 加载已保存的群聊（除非用户删除，否则一直保存）
  try { if (window.loadGroupChatsFromDisk) await window.loadGroupChatsFromDisk(); } catch(e) {}

  // 启动时同步会话数量徽章（以磁盘实际活动会话为准）
  try {
    var _sres = await window.electronAPI.getSessions();
    var _scount = (_sres && _sres.sessions) ? _sres.sessions.length : 0;
    var _sbadge = document.getElementById('sessionsBadge');
    if (_sbadge) {
      if (_scount > 0) { _sbadge.textContent = _scount; _sbadge.style.display = ''; }
      else { _sbadge.style.display = 'none'; }
    }
  } catch(e) {}

  // 欢迎消息 - 确保DOM就绪
  function showWelcome() {
    try {
      initDomElements();
      if (!messagesDiv) { setTimeout(showWelcome, 200); return; }
      addMessage('assistant', '你好！我是**灵动AI**，你的全能桌面AI助手 🚀\n\n**我具备以下核心能力：**\n\n📁 **文件操作** — 读写、创建、删除本地文件和文件夹\n⚡ **系统控制** — 执行PowerShell命令，操控Windows系统\n🖥 **软件管理** — 打开任意本地软件或文件\n📸 **屏幕截图** — 截取当前屏幕画面\n🌐 **网页浏览** — 在浏览器中打开指定网页\n🤖 **Agent管理** — 创建、编辑、删除AI Agent，可配置独立模型\n🔧 **源码开发** — 读取和修改本软件自身源码，实现自我进化\n🔄 **应用控制** — 重启应用使修改生效\n📝 **会议纪要** — 搜索、保存、管理会议记录\n🕐 **时间查询** — 获取当前系统时间\n\n直接输入你的需求，我会自动判断并调用合适的工具完成任务！');
    } catch(e) {
      console.error('[Init] 欢迎消息显示失败:', e);
      setTimeout(showWelcome, 500);
    }
  }
  showWelcome();
})();


// 修改 saveAgentEdit 函数，保存知识库路径
var originalSaveAgentEdit = window.saveAgentEdit;
window.saveAgentEdit = async function() {
  var id = currentEditingAgentId;
  if (!id) return;
  
  var el = function(x) { return document.getElementById(x); };
  var name = (el('editAgentName') && el('editAgentName').value.trim()) || '';
  if (!name) { alert('请输入 Agent 名称'); return; }

  var updates = {
    name: name,
    description: (el('editAgentDesc') && el('editAgentDesc').value.trim()) || '',
    systemPrompt: (el('editAgentPrompt') && el('editAgentPrompt').value.trim()) || '',
    model: (el('editAgentModel') && el('editAgentModel').value.trim()) || '',
    apiKey: (el('editAgentApiKey') && el('editAgentApiKey').value.trim()) || '',
    baseUrl: ((el('editAgentBaseUrl') && el('editAgentBaseUrl').value.trim()) || '').replace(/\/$/, ''),
    temperature: parseFloat((el('editAgentTemp') && el('editAgentTemp').value) || '0.7'),
  };

  // 处理头像
  if (typeof currentAgentAvatar !== 'undefined' && currentAgentAvatar !== null) {
    updates.avatar = currentAgentAvatar;
  }

  // 处理会议纪要目录
  var notesSection = el('notesSection');
  if (notesSection && notesSection.style.display !== 'none') {
    var notesDirInput = el('notesDirPath');
    if (notesDirInput && notesDirInput.value) {
      updates.notesDir = notesDirInput.value.trim();
    }
  }

  // 处理知识库路径
  var kbSection = el('knowledgeBaseSection');
  if (kbSection && kbSection.style.display !== 'none') {
    var kbPathInput = el('knowledgeBasePath');
    if (kbPathInput && kbPathInput.value) {
      updates.knowledgeBasePath = kbPathInput.value.trim();
      // 尝试创建知识库目录（如果不存在）
      try {
        await window.electronAPI.createFolder(updates.knowledgeBasePath);
      } catch(e) {
        // 目录可能已存在，忽略错误
      }
    }
  }

  try {
    var result = await window.electronAPI.updateAgent({ id: id, updates: updates });
    if (result && result.success) {
      showToast('✅ Agent 已更新（含知识库配置）');
      // [v1.1.5] 保存后立即刷新 currentAgent，确保模型等配置立即生效
      if (currentAgent && currentAgent.id === id) {
        var freshRes = await window.electronAPI.getAgents();
        var freshAgents = Array.isArray(freshRes) ? freshRes : ((freshRes && freshRes.agents) || []);
        for (var fri = 0; fri < freshAgents.length; fri++) {
          if (freshAgents[fri].id === id) { currentAgent = freshAgents[fri]; break; }
        }
        if (typeof agentIndicator !== 'undefined' && agentIndicator && typeof currentAgentName !== 'undefined' && currentAgentName) {
          currentAgentName.textContent = currentAgent ? currentAgent.name : '';
        }
      }
      closeAgentEditPanel();
      loadAgents();
    } else {
      showToast('更新失败: ' + (result ? result.error : '未知错误'), 'error');
    }
  } catch (e) {
    showToast('更新出错: ' + e.message, 'error');
  }
};


// ===== SESSION MANAGEMENT =====
var sessions = [];  // [{id, title, messages, createdAt, updatedAt}]
var currentSessionId = null;

// 从本地存储加载会话
async function loadSessions() {
  try {
    var result = await window.electronAPI.getSessions();
    if (result && result.success) {
      sessions = result.sessions || [];
      renderSessionsList();
      updateSessionsBadge();
    }
  } catch(e) { console.error('loadSessions error:', e); }
}

// 渲染会话列表
function renderSessionsList() {
  var container = document.getElementById('sessionsList');
  if (!container) return;
  if (!sessions.length) {
    container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:40px;">暂无会话记录，开始对话后自动保存</div>';
    return;
  }
  container.innerHTML = sessions.map(function(s) {
    var preview = s.messages && s.messages.length ? (s.messages[s.messages.length-1].content || '').slice(0, 80) : '空会话';
    var date = s.updatedAt ? new Date(s.updatedAt).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
    return '<div class="session-card" onclick="window.loadSession(\'' + s.id + '\')">' +
      '<div class="session-card-title">' + (s.title || '未命名会话').replace(/</g,'&lt;') + '</div>' +
      '<div class="session-card-preview">' + preview.replace(/</g,'&lt;') + '</div>' +
      '<div class="session-card-meta">' +
        '<span>' + date + '</span>' +
        '<span class="session-card-meta"><span style="color:var(--text-muted)">' + (s.messages ? s.messages.length : 0) + ' 条消息</span>' +
        ' <span class="session-card-delete" onclick="event.stopPropagation();window.deleteSession(\'' + s.id + '\')" title="删除">✕</span></span>' +
      '</div>' +
    '</div>';
  }).join('');
}

function updateSessionsBadge() {
  var badge = document.getElementById('sessionsBadge');
  if (badge) {
    if (sessions.length > 0) {
      badge.textContent = sessions.length;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }
}

// 新建会话
window.createNewSession = function() {
  currentSessionId = 'session-' + Date.now();
  conversationHistory = [];
  attachedFiles = [];
  // 清空消息区
  var msgs = document.getElementById('messages');
  if (msgs) msgs.innerHTML = '';
  // 导航到对话页
  if (typeof window._vueNavigateTo === 'function') window._vueNavigateTo('chat');
  else navigateTo('chat');
  // 显示新会话提示
  addMessage('assistant', '✨ 新会话已开始！请开始您的对话。');
};

// 删除会话
window.deleteSession = async function(id) {
  if (!confirm('确定删除这个会话吗？')) return;
  try {
    await window.electronAPI.deleteSession(id);
    sessions = sessions.filter(function(s){return s.id!==id;});
    renderSessionsList();
    updateSessionsBadge();
  } catch(e) { showToast('删除失败: ' + e.message, 'error'); }
};

// 保存当前会话（在每次AI回复后调用）
async function saveCurrentSession() {
  console.log('[saveCurrentSession] 开始保存，会话数:', conversationHistory.length, 'currentSessionId:', currentSessionId);
  if (!conversationHistory.length) return;
  try {
    // 生成标题：取第一条用户消息前20字
    var firstUser = conversationHistory.find(function(m){return m.role==='user';});
    var title = firstUser ? firstUser.content.slice(0, 20) + (firstUser.content.length > 20 ? '...' : '') : '新会话';
    // 只保存最近10条
    var messages = conversationHistory.slice(-10);
    
    if (!currentSessionId) {
      currentSessionId = 'session-' + Date.now();
    }
    
    var session = {
      id: currentSessionId,
      title: title,
      messages: messages,
      updatedAt: new Date().toISOString(),
      createdAt: sessions.find(function(s){return s.id===currentSessionId;}) 
        ? sessions.find(function(s){return s.id===currentSessionId;}).createdAt 
        : new Date().toISOString()
    };
    
    await window.electronAPI.saveSession(session);
    console.log('[saveCurrentSession] 保存成功，会话ID:', session.id, '标题:', session.title);
    
    // 更新本地缓存
    var idx = sessions.findIndex(function(s){return s.id===currentSessionId;});
    if (idx >= 0) sessions[idx] = session;
    else sessions.unshift(session);
    
    // 最多保留50个会话
    if (sessions.length > 50) sessions = sessions.slice(0, 50);
    
    updateSessionsBadge();
    renderSessionsList();
  } catch(e) { console.error('saveCurrentSession error:', e); }
}

// 桌宠切换
window.togglePetWindow = async function() {
  try {
    var result = await window.electronAPI.togglePet();
    var btn = document.getElementById('petToggleBtn');
    if (btn) {
      btn.style.color = result && result.visible ? 'var(--accent)' : 'var(--text-muted)';
    }
  } catch(e) { console.error('togglePet error:', e); }
};

// 页面加载时初始化会话
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(loadSessions, 1000);
});

// ===== END SESSION MANAGEMENT =====


// ===== 会话历史管理 =====
var _currentSessionTitle = null;

function _generateSessionTitle(messages) {
  if (!messages || messages.length === 0) return '新会话';
  var first = messages.find(function(m) { return m.role === 'user'; });
  if (!first) return '新会话';
  var content = first.content || '';
  if (typeof content === 'string') {
    return content.substring(0, 20) + (content.length > 20 ? '...' : '');
  }
  return '新会话';
}

window.renderSessionsList = async function() {
  var container = document.getElementById('sessionsList');
  if (!container) return;
  
  var result, archivedResult;
  try {
    result = await window.electronAPI.getSessions();
  } catch(e) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px 0;">加载失败: ' + e.message + '</div>';
    return;
  }
  try { archivedResult = await window.electronAPI.getArchivedSessions(); } catch(e) { archivedResult = null; }
  
  var sessions = (result && result.sessions) ? result.sessions : [];
  var archived = (archivedResult && archivedResult.sessions) ? archivedResult.sessions : [];
  // 徽章以实际活动会话数为准（与列表同一数据源，避免与缓存的全局 sessions 不一致）
  (function syncBadge() {
    var badge = document.getElementById('sessionsBadge');
    if (!badge) return;
    if (sessions.length > 0) { badge.textContent = sessions.length; badge.style.display = ''; }
    else { badge.style.display = 'none'; }
  })();
  if (!sessions.length && !archived.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px 0;font-size:14px;">暂无会话记录</div>';
    return;
  }

  function cardHtml(s, isArchived) {
    var d = new Date(s.updatedAt || s.createdAt || Date.now());
    var timeStr = d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'});
    var msgCount = s.messages ? s.messages.length : 0;
    var badge = isArchived ? '<span style="font-size:10px;color:var(--accent,#2383e2);border:1px solid var(--accent,#2383e2);border-radius:4px;padding:1px 5px;margin-left:6px;">已归档</span>' : '';
    var menu = isArchived
      ? '<div class="session-menu-item" onclick="event.stopPropagation();window._closeSessionMenus();window.deleteArchivedSession(\'' + s.id + '\')">🗑 删除</div>'
      : '<div class="session-menu-item" onclick="event.stopPropagation();window._closeSessionMenus();window.archiveSessionUI(\'' + s.id + '\')">📥 归档</div>' +
        '<div class="session-menu-item session-menu-danger" onclick="event.stopPropagation();window._closeSessionMenus();window.deleteSession(\'' + s.id + '\')">🗑 删除</div>';
    var clickAttr = isArchived ? '' : ' onclick="window.loadSession(\'' + s.id + '\')"';
    return '<div class="session-item" style="position:relative;background:var(--bg-sidebar);border:1px solid var(--border-subtle);border-radius:12px;padding:14px 16px;cursor:' + (isArchived?'default':'pointer') + ';transition:all 0.15s;display:flex;justify-content:space-between;align-items:center;"' + clickAttr + '>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:14px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (s.title || '新会话').replace(/</g,'&lt;') + badge + '</div>' +
        '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">' + timeStr + ' · ' + msgCount + '条消息</div>' +
      '</div>' +
      '<div style="position:relative;flex-shrink:0;">' +
        '<button onclick="event.stopPropagation();window._toggleSessionMenu(this)" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px 8px;border-radius:6px;font-size:18px;line-height:1;" title="更多">⋯</button>' +
        '<div class="session-menu" style="display:none;position:absolute;right:0;top:100%;margin-top:4px;background:var(--bg-panel,#fff);border:1px solid var(--border-subtle,rgba(0,0,0,0.1));border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:50;min-width:110px;overflow:hidden;">' + menu + '</div>' +
      '</div>' +
    '</div>';
  }

  var html = '';
  if (sessions.length) {
    html += sessions.map(function(s){ return cardHtml(s, false); }).join('');
  }
  if (archived.length) {
    html += '<div style="font-size:12px;color:var(--text-muted);margin:16px 0 6px;padding-left:4px;font-weight:600;">📥 已归档（永久保存）</div>';
    html += archived.map(function(s){ return cardHtml(s, true); }).join('');
  }
  container.innerHTML = html;
};

// ===== 会话卡片"更多"菜单交互 =====
window._closeSessionMenus = function() {
  document.querySelectorAll('.session-menu').forEach(function(m){ m.style.display = 'none'; });
};
window._toggleSessionMenu = function(btn) {
  var menu = btn.parentNode.querySelector('.session-menu');
  if (!menu) return;
  var isOpen = menu.style.display === 'block';
  window._closeSessionMenus();
  menu.style.display = isOpen ? 'none' : 'block';
};
document.addEventListener('click', function(e) {
  if (!e.target.closest || !e.target.closest('.session-menu, [onclick*="_toggleSessionMenu"]')) {
    window._closeSessionMenus();
  }
});
window.archiveSessionUI = async function(id) {
  try {
    var r = await window.electronAPI.archiveSession(id);
    if (r && r.success) { showToast('已归档（永久保存）', 'success'); window.renderSessionsList(); }
    else showToast('归档失败: ' + (r && r.error || ''), 'error');
  } catch(e) { showToast('归档出错: ' + e.message, 'error'); }
};
window.deleteArchivedSession = async function(id) {
  if (!confirm('确定删除这条已归档的会话？此操作不可恢复。')) return;
  try {
    await window.electronAPI.deleteArchivedSession(id);
    window.renderSessionsList();
    showToast('已删除归档会话', 'info');
  } catch(e) { showToast('删除失败: ' + e.message, 'error'); }
};

window.loadSession = async function(sessionId) {
  var result;
  try { result = await window.electronAPI.getSessions(); } catch(e) { return; }
  var sessions = (result && result.sessions) ? result.sessions : [];
  var session = sessions.find(function(s) { return s.id === sessionId; });
  if (!session) return;
  
  // 恢复会话
  conversationHistory = session.messages || [];
  currentSessionId = sessionId;
  
  // 切换到聊天页
  if (typeof navigateTo === 'function') navigateTo('chat');
  else {
    document.querySelectorAll('.page').forEach(function(p) { p.style.display='none'; });
    var cp = document.getElementById('chat-page');
    if (cp) cp.style.display = '';
  }
  
  // 渲染消息
  var container = document.getElementById('messages') || messagesDiv;
  if (container) {
    container.innerHTML = '';
    conversationHistory.forEach(function(msg) {
      addMessage(msg.role, msg.content);
    });
  }
  showToast('已恢复会话: ' + (session.title || ''), 'success');
};

window.deleteSession = async function(sessionId) {
  try {
    await window.electronAPI.deleteSession(sessionId);
    window.renderSessionsList();
    showToast('会话已删除', 'info');
  } catch(e) {
    showToast('删除失败: ' + e.message, 'error');
  }
};

window.clearAllSessions = async function() {
  if (!confirm('确定清空所有会话历史？')) return;
  var result;
  try { result = await window.electronAPI.getSessions(); } catch(e) { return; }
  var sessions = (result && result.sessions) ? result.sessions : [];
  for (var i = 0; i < sessions.length; i++) {
    try { await window.electronAPI.deleteSession(sessions[i].id); } catch(e) {}
  }
  window.renderSessionsList();
  showToast('已清空所有会话', 'info');
};

// 自动保存会话（在sendMessage完成后调用）
window.autoSaveCurrentSession = async function() {
  if (!conversationHistory || conversationHistory.length === 0) return;
  var title = _generateSessionTitle(conversationHistory);
  var msgs = conversationHistory.slice(-10); // 只保存最近10条
  var sid = currentSessionId || ('session_' + Date.now());
  currentSessionId = sid;
  try {
    await window.electronAPI.saveSession({
      id: sid,
      title: title,
      messages: msgs,
      agentId: currentAgent ? currentAgent.id : null
    });
  } catch(e) {}
};

// ===================================================================
// 第一阶段升级：Planner 规划引擎 + 流式输出
// ===================================================================

// Planner 模式开关（默认开启）
window.plannerMode = true;

/**
 * 切换 Planner 模式
 */
window.togglePlannerMode = function() {
  window.plannerMode = !window.plannerMode;
  showToast(window.plannerMode ? '已启用智能规划模式' : '已关闭智能规划模式', 'info');
  return window.plannerMode;
};

/**
 * 检查是否应该使用 Planner 模式
 * 优化：更多场景走快速路径，避免简单问题也走完整规划流程
 */
function shouldUsePlanner(text) {
  // 如果用户手动关闭了 planner 模式，则尊重选择
  if (window.plannerMode === false) return false;

  var trimmed = text.trim();

  // 空消息或极短消息不需要规划
  if (!trimmed || trimmed.length < 2) return false;

  // 简单问候/闲聊不需要规划（极短消息或纯寒暄）
  var simplePatterns = /^(你好|嗨|hello|hi|在吗|谢谢|再见|拜拜|ok|好的?|嗯|哦|哈哈|呵呵|😊|👍|🙏|早上好|晚上好|下午好|晚安|你好吗|最近怎么样|你是谁|介绍.*自己)$/i;
  if (simplePatterns.test(trimmed)) return false;

  // 纯信息查询类（不需要工具调用）走快速路径
  // 包括：翻译、解释概念、闲聊、知识问答、计算、写文案等
  var fastPathPatterns = /^(翻译|解释|说明|什么是|怎么|如何|为什么|帮我写|帮我改|帮我润色|总结|概括|对比|分析一下|算一下|列出|给我|推荐|评价|说说|谈谈|讲讲)/i;
  if (fastPathPatterns.test(trimmed) && !/(删除|创建|执行|安装|下载|打开|文件|文件夹|目录|Agent|agent)/.test(trimmed)) {
    return false; // 非操作性的信息查询走快速路径
  }

  // 只有当消息明确涉及复杂多步操作时才走 Planner
  // Planner 用于：多步骤任务、需要分解执行计划的场景
  var plannerPatterns = /(先.*再.*然后|步骤|流程|计划|规划|自动|批量|循环|定时|每天|每周|脚本|workflow|多步|第一步|第二步)/i;
  if (plannerPatterns.test(trimmed)) return true;

  // 默认：不走 Planner，直接走 callAIWithTools 或 callAI
  return false;
}

/**
 * 判断消息是否需要工具调用
 * 纯对话（闲聊、知识问答）不需要工具
 *
 * [v1.1.2 关键修复] 只要当前是任何自定义 Agent（非 default），就**强制**走 callAIWithTools
 * 原因：Agent 的设计目的就是执行任务，必然要用工具。靠关键词判断会漏掉"绘制路线图"这种
 *       业务化但需要工具的请求，导致模型走纯 Chat 模式后只输出文字描述，不真正执行。
 */
function textNeedsTools(text) {
  // 规则 0: [v1.1.6] 默认灵动AI本身也有工具执行能力，也应该永远走工具路径
  // 只要 currentAgent 存在（包括 default），就永远需要工具
  if (currentAgent) {
    return true;
  }

  // 规则 0.5: [v1.1.6] 对话上下文感知 — 检查最近几条消息是否涉及工具失败/用户要求重试
  // 如果 conversationHistory 最后一条是工具失败或用户追问，也强制走工具
  if (conversationHistory && conversationHistory.length > 0) {
    var lastFewMessages = conversationHistory.slice(-6).map(function(m) { return m.content || ''; }).join(' ').toLowerCase();
    var contextPatterns = /(失败|错误|没.*执行|没.*做|怎么.?不|为.?什么.?没|重试|再试|重新|继续|还.?不|到底|又|还是|真的|证明|试试|试|做一下|执行一下|再来|again|retr)/i;
    if (contextPatterns.test(lastFewMessages)) {
      return true;
    }
  }

  var trimmed = text.trim();
  // 规则 1: [v1.1.6 扩展] 大幅扩展关键词，覆盖失败恢复追问场景
  var toolPatterns = /(文件|文件夹|目录|删除|创建|写入|读取|打开|执行|运行|命令|截图|搜索|查询|Agent|agent|安装|下载|整理|MCP|mcp|自动|绘制|生成|导出|操作|启动|关闭|画|搜|获取|查看|检查|显示|列出|分析|帮我|帮我看|帮我查|帮找|算|计算|改|修改|更新|保存|备份|解压|压缩|清理|转换|扫描|识别|提取|监控|提醒|录制|翻译|为什么|重新|再试|继续|证明|试试|做一下|执行一下|能|不能|行|不行|怎么|怎么办|搞|搞定|弄|做|用|方式|方法|换|别|方案)/i;
  return toolPatterns.test(trimmed);
}

/**
 * 使用 Planner 调用 AI
 */
window.callAIWithPlanner = async function(messages, callConfig, agentId) {
  // 注册流式监听（如果还没注册）
  if (!window._aiStreamRegistered) {
    window._aiStreamRegistered = true;
    window.electronAPI.onAIStream(function(data) {
      handleAIStream(data);
    });
  }

  // 清空之前的流式状态
  window._currentPlanSteps = [];
  window._currentPlanId = 'plan_' + Date.now();

  return await window.electronAPI.callAIWithPlan(messages, callConfig, agentId);
};

/**
 * 处理 AI 流式事件
 */
function handleAIStream(data) {
  if (!data || !data.type) return;

  switch (data.type) {
    case 'planning': {
      // 显示"正在分析任务..."
      showPlanProgress('正在分析任务需求...', 'analysis');
      break;
    }
    case 'plan': {
      // 显示计划摘要
      var stepsText = (data.steps || []).map(function(s, i) {
        return (i + 1) + '. ' + s.description + (s.tool ? ' [' + s.tool + ']' : '');
      }).join('\n');
      showPlanProgress(
        '任务分析：' + data.analysis + '\n\n执行计划（' + data.strategy + '）：\n' + stepsText,
        'plan'
      );
      break;
    }
    case 'executing': {
      showPlanProgress(data.message, 'executing');
      break;
    }
    case 'tool-start': {
      showPlanProgress('🔧 正在执行：' + data.tool, 'tool-running');
      break;
    }
    case 'tool-done': {
      var success = data.result && data.result.success !== false;
      showPlanProgress((success ? '✅' : '❌') + ' 已完成：' + data.tool, 'tool-done');
      break;
    }
    case 'tool-thinking': {
      // 🔧 [v1.3.3] 流式过程中模型正在决定调用工具
      showPlanProgress('🤔 正在调用工具：' + data.tool, 'tool-running');
      break;
    }
    case 'step-progress': {
      var statusIcon = data.status === 'completed' ? '✓' : (data.status === 'failed' ? '✗' : '...');
      showPlanProgress('步骤 ' + data.stepId + ': ' + data.description + ' ' + statusIcon, 'step');
      break;
    }
    case 'plan-summary': {
      var summary = data.summary || {};
      showPlanProgress(
        '执行完成：' + summary.completed + '/' + summary.total + ' 成功',
        'summary'
      );
      break;
    }
    case 'generating': {
      showPlanProgress('✍️ ' + (data.message || '正在生成回复...'), 'generating');
      break;
    }
    case 'waiting':
    case 'waiting-confirmation': {
      showPlanProgress(data.message || '⏳ 等待您的操作确认...', 'waiting');
      break;
    }
    case 'done': {
      showPlanProgress('✅ 思考完成，正在输出回复...', 'summary');
      break;
    }
    case 'token': {
      // ===== 流式 token 渲染（替代打字机）=====
      _appendStreamingToken(data.content || '');
      break;
    }
    case 'stream-end': {
      // 流式结束，渲染完整 Markdown
      console.log('[handleAIStream] stream-end → _finalizeStreamingBubble, 当前状态:', {
        _streamCompleted: _streamCompleted,
        _streamingBubble: _streamingBubble ? 'exists' : 'null',
        _streamingContent_len: (_streamingContent || '').length,
        _lastStreamedReply_len: (_lastStreamedReply || '').length
      });
      _finalizeStreamingBubble();
      console.log('[handleAIStream] stream-end 后:', { _streamCompleted: _streamCompleted, _lastStreamedReply_len: (_lastStreamedReply || '').length });
      break;
    }
    case 'stream-reset': {
      console.log('[handleAIStream] stream-reset, 当前状态:', {
        _streamCompleted: _streamCompleted,
        _streamingBubble: _streamingBubble ? 'exists' : 'null',
        _streamingContent_len: (_streamingContent || '').length
      });
      // 🔧 [v1.3.8] 中间迭代结束（有 tool_calls，还未到最终回复）
      //   finalize 当前中间文本（如果有），但**不设置 _streamCompleted**
      //   这样下一轮迭代的流式内容会创建新气泡，IPC 返回时仍可渲染
      if (_streamingBubble && _streamingContent) {
        // 有中间文本 → finalize 为 Markdown 显示（用户能看到思考过程）
        _streamingBubble.innerHTML = renderMarkdown(_streamingContent);
        _streamingBubble = null;
        _streamingContent = '';
        // ⚠️ 不设 _streamCompleted = true！这是中间迭代，不是最终回复
      } else {
        // 没有中间文本（纯 tool_calls）→ 直接重置状态
        _streamingBubble = null;
        _streamingContent = '';
      }
      break;
    }
    case 'tool-progress': {
      // 🔧 [v1.3.2] 真实工具执行进度（从 executor.js 推送）
      // executor phases: preparing | executing | verifying | done
      if (data.phase === 'preparing') {
        showPlanProgress('🔧 准备执行：' + data.tool + '...', 'tool-running');
      } else if (data.phase === 'executing') {
        showPlanProgress('⚡ 正在执行：' + data.tool, 'tool-running');
      } else if (data.phase === 'verifying') {
        showPlanProgress('🔍 验证结果：' + data.tool + '...', 'tool-running');
      } else if (data.phase === 'done') {
        var ok = data.result && data.result.success !== false;
        showPlanProgress('已完成：' + data.tool + (ok ? ' ✓' : ' ✗'), 'tool-done');
      }
      break;
    }
  }
}

/**
 * 显示规划进度（跟随对话滚动，始终在最新位置）
 * 
 * 核心修复：每次调用都重新定位到 typing-indicator 前面，
 * 不会被聊天记录顶到上面去。同时支持追加模式，
 * 保留完整思考过程历史。
 */
/**
 * 显示规划进度 - 重构为气泡内滚动面板
 * 
 * 新设计：进度条目追加到 AI 消息气泡内的可滚动 markdown 区域，
 * 最新内容自动滚动到可见位置。最终结论在滚动区域外显示。
 */
var _planLogContainer = null; // 气泡内的滚动容器
var _planLogMsg = null;       // 包含进度日志的 AI 消息元素
var _planLogs = [];            // 所有日志条目

function showPlanProgress(text, phase) {
  var msgBox = document.getElementById('messages');
  if (!msgBox) return;

  // 阶段配置
  var phaseConfig = {
    'analysis':   { icon: '🧠', label: '分析中',     color: '#6366f1' },
    'plan':       { icon: '📋', label: '制定计划',   color: '#06b6d4' },
    'executing':  { icon: '⚡', label: '执行中',     color: '#f59e0b' },
    'tool-running': { icon: '🔧', label: '调用工具', color: '#8b5cf6' },
    'tool-done':  { icon: '✅', label: '工具完成',   color: '#10b981' },
    'step':       { icon: '📌', label: '步骤更新',   color: '#3b82f6' },
    'summary':    { icon: '📊', label: '摘要',       color: '#ec4899' },
    'generating': { icon: '✍️', label: '生成回复',   color: '#14b8a6' },
    'error':      { icon: '❌', label: '出错',       color: '#ef4444' },
    'waiting':    { icon: '⏳', label: '等待确认',   color: '#f97316' }
  };
  var config = phaseConfig[phase] || { icon: '💭', label: '', color: '#6b6b6b' };

  // 构建日志行（纯文本，markdown 友好）
  var timeStr = new Date().toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  var logLine = '`' + timeStr + '` ' + config.icon + ' **' + config.label + '**  ' + text;
  _planLogs.push(logLine);

  // 首次：创建包含滚动日志区的 AI 消息气泡
  if (!_planLogContainer) {
    _planLogMsg = createEmptyAIMessage();
    _planLogContainer = document.createElement('div');
    _planLogContainer.className = 'plan-log-scroller';
    _planLogContainer.style.cssText = [
      'max-height:260px;',
      'overflow-y:auto;',
      'font-size:12px;',
      'line-height:1.7;',
      'padding:6px 8px;',
      'margin-bottom:6px;',
      'background:rgba(0,0,0,0.03);',
      'border-radius:10px;',
      'border:1px solid rgba(0,0,0,0.06);',
      'color:#555;',
      'scroll-behavior:smooth;'
    ].join('');
    _planLogContainer.innerHTML = '<div class="plan-log-content" style="white-space:pre-wrap;word-break:break-word;"></div>';

    var bubble = _planLogMsg.querySelector('.message-bubble');
    if (bubble) bubble.appendChild(_planLogContainer);
    // 添加一个最终结论区
    var finalArea = document.createElement('div');
    finalArea.className = 'plan-final-result';
    finalArea.style.cssText = 'margin-top:8px;font-size:14px;line-height:1.65;color:var(--text-primary,#1a1a1a);';
    if (bubble) bubble.appendChild(finalArea);
  }

  // 更新滚动日志内容
  var logContent = _planLogContainer.querySelector('.plan-log-content');
  if (logContent) {
    logContent.innerHTML = _planLogs.map(function(line) {
      // 简单 markdown 渲染：粗体、代码、图标
      return '<div style="padding:2px 0;">' + line
        .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#1a1a1a;">$1</strong>')
        .replace(/`(.*?)`/g, '<code style="background:rgba(0,0,0,0.06);border-radius:3px;padding:1px 4px;font-size:11px;">$1</code>')
        + '</div>';
    }).join('');
    // 自动滚动到底部
    _planLogContainer.scrollTop = _planLogContainer.scrollHeight;
  }

  // 重定位到 typing-indicator 前面
  var typing = document.getElementById('typing-indicator');
  if (_planLogMsg && typing && typing.parentNode === msgBox && _planLogMsg.parentNode === msgBox) {
    msgBox.insertBefore(_planLogMsg, typing);
  }

  // 滚动父容器
  msgBox.scrollTop = msgBox.scrollHeight;
}

/**
 * 创建空 AI 消息气泡，用作进度日志容器
 */
function createEmptyAIMessage() {
  var msgBox = document.getElementById('messages');
  if (!msgBox) msgBox = document.querySelector('.chat-messages') || document.body;

  var msg = document.createElement('div');
  msg.className = 'message assistant';
  msg.style.cssText = 'display:flex;flex-direction:row;gap:10px;padding:12px 16px;animation:fadeInUp 0.35s ease;';

  // 头像
  var avatar = document.createElement('div');
  avatar.className = 'message-avatar assistant-avatar';
  avatar.style.cssText = 'width:36px;height:36px;border-radius:50%;flex-shrink:0;overflow:hidden;background:linear-gradient(135deg,#10b981,#047857);display:flex;align-items:center;justify-content:center;';
  avatar.innerHTML = '<svg viewBox="0 0 32 32" fill="none" style="width:24px;height:24px;"><circle cx="16" cy="16" r="14" fill="white" opacity="0.9"/><path d="M10 14h12M12 11l4-4 4 4M10 18l6 6 6-6" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // 气泡
  var bubbleWrap = document.createElement('div');
  bubbleWrap.style.cssText = 'flex:1;min-width:0;max-width:520px;overflow:hidden;';
  var bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.style.cssText = 'background:rgba(255,255,255,0.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(0,0,0,0.06);border-bottom-left-radius:4px;';
  bubbleWrap.appendChild(bubble);

  msg.appendChild(avatar);
  msg.appendChild(bubbleWrap);
  msgBox.appendChild(msg);

  return msg;
}

/**
 * 隐藏规划进度，将最终结果写入日志区下方
 */
function hidePlanProgress() {
  // 保留 _planLogContainer，不再单独隐藏
  // 进度日志区会自动保留在气泡中
}

/**
 * 重置规划进度（新对话开始时调用）
 */
function resetPlanProgress() {
  _planLogContainer = null;
  _planLogMsg = null;
  _planLogs = [];
}

// 缓存上一次的 plan-progress 引用（用于快速查找）
window._planProgressEl = null;

// (hidePlanProgress 已由上方新版本替代，此处清理旧代码)
// 旧版本已被移除，计划进度现由 showPlanProgress 统一管理

/**
 * HTML 转义
 */
function escapeHtml(text) {
  if (!text) return '';
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 注册流式事件监听（页面加载时）
document.addEventListener('DOMContentLoaded', function() {
  if (window.electronAPI && window.electronAPI.onAIStream) {
    window.electronAPI.onAIStream(function(data) {
      handleAIStream(data);
    });
    window._aiStreamRegistered = true;
  }

  // ===== 注册内嵌确认对话框监听 =====
  if (window.electronAPI && window.electronAPI.onConfirmationRequest) {
    window.electronAPI.onConfirmationRequest(function(data) {
      showInlineConfirmation(data);
    });
  }
});

/**
 * 显示内嵌确认对话框（在对话界面中）
 * @param {Object} data - { confirmId, title, reason, command, path, riskLevel, actionLabel }
 */
function showInlineConfirmation(data) {
  if (!data || !data.confirmId) return;

  var msgBox = document.getElementById('messages');
  if (!msgBox) return;

  // 创建确认框容器
  var container = document.createElement('div');
  container.id = 'inline-confirm-' + data.confirmId;
  container.className = 'inline-confirmation';
  container.style.cssText = [
    'margin: 8px 44px;',
    'max-width: 85%;',
    'background: linear-gradient(135deg, #FFF7ED 0%, #FFFBEB 100%);',
    'border-radius: 16px;',
    'border: 1.5px solid #F59E0B;',
    'padding: 14px 18px;',
    'box-shadow: 0 4px 16px rgba(245,158,11,0.12), 0 2px 4px rgba(0,0,0,0.04);',
    'animation: confirmSlideIn 0.3s ease;'
  ].join('');

  // 危险等级图标和颜色
  var riskColors = {
    'critical': { icon: '\uD83D\uDD25', color: '#DC2626', border: '#DC2626', bg: '#FEF2F2' },
    'high':     { icon: '\u26A0\uFE0F', color: '#F59E0B', border: '#F59E0B', bg: '#FFFBEB' },
    'medium':   { icon: '\u2139\uFE0F', color: '#3B82F6', border: '#3B82F6', bg: '#EFF6FF' }
  };
  var risk = riskColors[data.riskLevel] || riskColors['high'];

  // 更新容器样式（根据风险等级）
  container.style.background = `linear-gradient(135deg, ${risk.bg} 0%, ${risk.bg}DD 100%)`;
  container.style.borderColor = risk.border;
  container.style.boxShadow = `0 4px 16px ${risk.border}18, 0 2px 4px rgba(0,0,0,0.04)`;

  // 构建内容HTML
  var html = '';
  html += '<div style="display:flex;align-items:flex-start;gap:10px;">';
  html += '<span style="font-size:22px;line-height:1;">' + risk.icon + '</span>';
  html += '<div style="flex:1;min-width:0;">';

  // 标题
  html += '<div style="font-size:14px;font-weight:700;color:' + risk.color + ';margin-bottom:6px;">' + escapeHtml(data.title || '安全确认') + '</div>';

  // 原因描述
  if (data.reason) {
    html += '<div style="font-size:13px;color:#4B5563;line-height:1.5;margin-bottom:8px;">' + escapeHtml(data.reason) + '</div>';
  }

  // 操作详情（路径或命令）
  if (data.path) {
    var fileName = data.path.split(/[\/\\]/).pop() || data.path;
    html += '<div style="background:rgba(0,0,0,0.04);border-radius:8px;padding:8px 10px;margin-bottom:10px;font-family:monospace;font-size:12px;color:#374151;word-break:break-all;">';
    html += '<span style="color:#6B7280;">\uD83D\uDCC1 \u76EE\u6807\uFF1A</span>' + escapeHtml(fileName);
    if (data.path !== fileName) {
      html += '<br><span style="color:#9CA3AF;font-size:11px;">' + escapeHtml(data.path) + '</span>';
    }
    html += '</div>';
  }
  if (data.command) {
    html += '<div style="background:rgba(0,0,0,0.04);border-radius:8px;padding:8px 10px;margin-bottom:10px;font-family:monospace;font-size:11px;color:#374151;word-break:break-all;overflow-x:auto;">';
    html += '<span style="color:#6B7280;">$ </span>' + escapeHtml(data.command.slice(0, 200)) + (data.command.length > 200 ? '...' : '');
    html += '</div>';
  }

  // 按钮组
  var actionText = data.actionLabel || '\u786E\u8BA4\u6267\u884C';
  html += '<div style="display:flex;gap:8px;margin-top:4px;">';
  
  // 取消按钮
  html += '<button id="' + data.confirmId + '-btn-cancel" style="';
  html += 'flex:1;padding:8px 16px;border-radius:10px;border:1.5px solid #D1D5DB;';
  html += 'background:#F9FAFB;color:#6B7280;font-size:13px;font-weight:600;cursor:pointer;';
  html += 'transition:all 0.15s ease;display:flex;align-items:center;justify-content:center;gap:4px;';
  html += '" onmouseover="this.style.background=\'#F3F4F6\'" onmouseout="this.style.background=\'#F9FAFB\'">';
  html += '\u274C \u53D6\u6D88</button>';

  // 确认按钮
  html += '<button id="' + data.confirmId + '-btn-confirm" style="';
  html += 'flex:1;padding:8px 16px;border-radius:10px;border:1.5px solid ' + risk.border + ';';
  html += 'background:' + risk.color + ';color:#fff;font-size:13px;font-weight:700;cursor:pointer;';
  html += 'transition:all 0.15s ease;display:flex;align-items:center;justify-content:center;gap:4px;box-shadow:0 2px 8px ' + risk.color + '30;';
  html += '" onmouseover="this.style.opacity=\'0.85\';this.style.transform=\'scale(1.02)\'" ';
  html += 'onmouseout="this.style.opacity=\'1\';this.style.transform=\'scale(1)\'">';
  html += '\u2705 ' + actionText + '</button>';

  html += '</div>'; // 按钮组结束
  html += '</div>'; // 内容区结束
  html += '</div>'; // flex容器结束

  container.innerHTML = html;

  // 插入到消息列表（在 plan-progress 后面，typing-indicator 前面）
  var typing = document.getElementById('typing-indicator');
  var planProgress = document.getElementById('plan-progress');
  if (typing && typing.parentNode === msgBox) {
    msgBox.insertBefore(container, typing);
  } else if (planProgress && planProgress.parentNode === msgBox) {
    msgBox.insertBefore(container, planProgress.nextSibling);
  } else {
    msgBox.appendChild(container);
  }

  msgBox.scrollTop = msgBox.scrollHeight;

  // 绑定按钮事件
  var cancelBtn = document.getElementById(data.confirmId + '-btn-cancel');
  var confirmBtn = document.getElementById(data.confirmId + '-btn-confirm');

  if (cancelBtn) {
    cancelBtn.addEventListener('click', function() {
      sendConfirmResult(data.confirmId, false);
      disableConfirmButtons(data.confirmId);
      container.style.opacity = '0.5';
      var btnArea = container.querySelector('button:last-of-type') || confirmBtn;
      if (btnArea) {
        // 在按钮区域显示已取消状态
        var statusDiv = container.querySelectorAll('button');
        for (var i = 0; i < statusDiv.length; i++) {
          statusDiv[i].style.display = 'none';
        }
        var cancelNote = document.createElement('div');
        cancelNote.style.cssText = 'text-align:center;font-size:12px;color:#6B7280;padding:4px 0;font-weight:600;';
        cancelNote.textContent = '\u274C \u5DF2\u53D6\u6D88';
        container.querySelector('[style*="flex:1;min-width:0"]').appendChild(cancelNote);
      }
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', function() {
      sendConfirmResult(data.confirmId, true);
      disableConfirmButtons(data.confirmId);
      container.style.borderColor = '#10B981';
      container.style.background = 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)';
      var btnArea = container.querySelectorAll('button');
      for (var j = 0; j < btnArea.length; j++) {
        btnArea[j].style.display = 'none';
      }
      var okNote = document.createElement('div');
      okNote.style.cssText = 'text-align:center;font-size:12px;color:#059669;padding:4px 0;font-weight:600;';
      okNote.textContent = '\u2705 \u5DF2\u786E\u8BA4\uFF0C\u6B63\u5728\u6267\u884C...';
      container.querySelector('[style*="flex:1;min-width:0"]').appendChild(okNote);
      
      // 同时更新 plan-progress
      showPlanProgress('\u7528\u6237\u5DF2\u786E\u8BA4\uFF0C\u6B63\u5728\u6267\u884C\u5371\u9669\u64CD\u4F5C...', 'executing');
    });
  }
}

function sendConfirmResult(confirmId, result) {
  if (window.electronAPI && window.electronAPI.sendConfirmationResult) {
    window.electronAPI.sendConfirmationResult(confirmId, result);
  }
}

function disableConfirmButtons(confirmId) {
  var cancelBtn = document.getElementById(confirmId + '-btn-cancel');
  var confirmBtn = document.getElementById(confirmId + '-btn-confirm');
  if (cancelBtn) { cancelBtn.disabled = true; cancelBtn.style.pointerEvents = 'none'; }
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.style.pointerEvents = 'none'; }
}

// 添加确认框动画CSS
var confirmStyle = document.createElement('style');
confirmStyle.textContent = [
  '@keyframes confirmSlideIn {',
  '  from { opacity: 0; transform: translateY(-10px) scale(0.97); }',
  '  to   { opacity: 1; transform: translateY(0) scale(1); }',
  '}'
].join('\n');
document.head.appendChild(confirmStyle);
