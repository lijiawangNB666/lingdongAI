const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ===== 配置 =====
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  // ===== AI 调用 =====
  callAI: (messages, agentConfig) => ipcRenderer.invoke('call-ai', { messages, config: agentConfig }),
  callAIWithTools: (messages, agentConfig, agentId) => ipcRenderer.invoke('call-ai-with-tools', { messages, config: agentConfig, agentId }),
  callAIWithPlan: (messages, agentConfig, agentId) => ipcRenderer.invoke('call-ai-with-plan', { messages, config: agentConfig, agentId }),
  testConnection: (config) => ipcRenderer.invoke('test-connection', config),
  listModels: (config) => ipcRenderer.invoke('list-models', config),

  // ===== Agent 管理 =====
  getAgents: () => ipcRenderer.invoke('get-agents'),
  createAgent: (agent) => ipcRenderer.invoke('create-agent', agent),
  updateAgent: (data) => ipcRenderer.invoke('update-agent', data),
  deleteAgent: (id) => ipcRenderer.invoke('delete-agent', id),

  // ===== Skill 管理 =====
  getSkills: () => ipcRenderer.invoke('get-skills'),
  createSkill: (skill) => ipcRenderer.invoke('create-skill', skill),
  deleteSkill: (id) => ipcRenderer.invoke('delete-skill', id),

  // ===== 文件操作 =====
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  listDirectory: (dirPath) => ipcRenderer.invoke('list-directory', dirPath),
  createFolder: (folderPath) => ipcRenderer.invoke('create-folder', folderPath),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),

  // ===== 系统操作 =====
  executeCommand: (command) => ipcRenderer.invoke('execute-command', command),
  openSoftware: (softwarePath) => ipcRenderer.invoke('open-software', softwarePath),
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  // ===== 会议纪要 =====
  saveMeetingNote: (data) => ipcRenderer.invoke('save-meeting-note', data),
  listMeetingNotes: () => ipcRenderer.invoke('list-meeting-notes'),
  readMeetingNote: (filePath) => ipcRenderer.invoke('read-meeting-note', filePath),
  deleteMeetingNote: (filePath) => ipcRenderer.invoke('delete-meeting-note', filePath),
  searchMeetingNotes: (params) => ipcRenderer.invoke('search-meeting-notes', params),
  exportToWord: (data) => ipcRenderer.invoke('export-to-word', data),
  getNotesDir: () => ipcRenderer.invoke('get-notes-dir'),
  setNotesDir: (notesDir) => ipcRenderer.invoke('set-notes-dir', notesDir),

  // ===== 对话历史 =====
  getHistory: () => ipcRenderer.invoke('get-history'),
  saveHistory: (history) => ipcRenderer.invoke('save-history', history),
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  // ===== 语音 =====
  transcribeAudio: (audioData) => ipcRenderer.invoke('transcribe-audio', audioData),

  // ===== 录音窗口 =====
  openVoiceRecorder: () => ipcRenderer.invoke('open-voice-recorder'),
  abortGeneration: () => ipcRenderer.invoke('abort-generation'),

  // ===== 会话记忆 =====
  getSessions: () => ipcRenderer.invoke('get-sessions'),
  saveSession: (session) => ipcRenderer.invoke('save-session', session),
  deleteSession: (id) => ipcRenderer.invoke('delete-session', id),
  archiveSession: (id) => ipcRenderer.invoke('archive-session', id),
  getArchivedSessions: () => ipcRenderer.invoke('get-archived-sessions'),
  deleteArchivedSession: (id) => ipcRenderer.invoke('delete-archived-session', id),
  getGroupChats: () => ipcRenderer.invoke('get-group-chats'),
  saveGroupChats: (groupChats) => ipcRenderer.invoke('save-group-chats', groupChats),
  clearAllSessions: () => ipcRenderer.invoke('clear-all-sessions'),

  // ===== 桌宠 =====
  togglePet: () => ipcRenderer.invoke('toggle-pet'),

  // ===== 兼容旧接口 =====
  fetchUrl: (url) => ipcRenderer.invoke('fetch-url', url),
  saveMeetingNoteAsWord: (data) => ipcRenderer.invoke('export-to-word', data),

  // ===== 实时工具进度推送 =====
  onToolProgress: (callback) => {
    ipcRenderer.on('tool-progress', (event, data) => callback(data));
  },
  offToolProgress: () => {
    ipcRenderer.removeAllListeners('tool-progress');
  },

  // ===== AI 流式输出（Planner + 执行进度）=====
  onAIStream: (callback) => {
    ipcRenderer.on('ai-stream', (event, data) => callback(data));
  },
  offAIStream: () => {
    ipcRenderer.removeAllListeners('ai-stream');
  },

  // ===== 危险操作内嵌确认对话框 =====
  requestConfirmation: (confirmId, details) => ipcRenderer.invoke('request-confirmation', confirmId, details),
  onConfirmationRequest: (callback) => {
    ipcRenderer.on('show-confirmation', (event, data) => callback(data));
  },
  sendConfirmationResult: (confirmId, result) => ipcRenderer.send('confirmation-result', confirmId, result),
});
