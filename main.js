// ===== Electron 环境修复 =====
// 某些环境（如 Git Bash）可能设置 ELECTRON_RUN_AS_NODE=1，导致 Electron 以 Node.js 模式运行
// 这种情况下 require('electron') 返回路径字符串而非模块对象，需要用 spawn 重新启动
// ===== Electron 环境修复 =====
// 某些环境（如 Git Bash）可能设置 ELECTRON_RUN_AS_NODE=1，导致 Electron 以 Node.js 模式运行
// 这种情况下 require('electron') 返回路径字符串而非模块对象，需要用 spawn 重新启动
let electron = require('electron');
if (typeof electron === 'string' || !electron.app) {
  if (process.env._ELECTRON_RESTARTED) {
    console.error('[FATAL] Electron module unavailable after restart. ELECTRON_RUN_AS_NODE may be forced by parent process.');
    process.exit(1);
  }
  const { spawn } = require('child_process');
  const electronPath = typeof electron === 'string' ? electron : require.resolve('electron');
  const newEnv = { ...process.env };
  delete newEnv.ELECTRON_RUN_AS_NODE;
  newEnv._ELECTRON_RESTARTED = '1';
  const child = spawn(electronPath, process.argv.slice(1), {
    stdio: 'inherit',
    env: newEnv
  });
  child.on('exit', () => process.exit(0));
  return;
}
const { BrowserWindow, ipcMain, dialog, shell } = electron;
const app = electron.app;
const path = require('path');
const fs = require('fs');
const http = require('http');
const { exec, execSync } = require('child_process');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

// ===== 第一阶段升级：引入新模块 =====
const { generatePlan, executePlan, PLANNER_SYSTEM_PROMPT } = require('./planner');
const { searchWeb, fetchUrl } = require('./web-search');
const { auditCommand, auditFileOperation, confirmDangerousOperation, getSecurityContext } = require('./security-auditor');
const { runAhkScript, runAhkCommand, ahkFindWindow, ahkSendInput, ahkClickControl, checkAhkInstalled } = require('./ahk-runner');
// ===== 第二阶段升级：引入增强执行引擎 =====
const { executeToolCallsParallel, generateExecutionSummary, validateToolArgs } = require('./executor');

// ===== 内嵌确认对话框（替代系统弹窗）=====
/**
 * 在对话界面显示内嵌确认按钮，等待用户操作
 * @param {string} operation - 操作描述（如"文件删除"、"命令执行"）
 * @param {Object} details - 详细信息 {command, path, reason}
 * @returns {Promise<boolean>} 用户是否确认
 */
function confirmDangerousInline(operation, details) {
  // ===== Planner 模式下自动跳过确认，保证工具调用连贯 =====
  if (globalThis._plannerAutoApprove) {
    console.log('[Security] Planner auto-approved: ' + operation + (details.path ? ' ' + details.path : '') + (details.command ? ' ' + details.command.slice(0, 60) : ''));
    return Promise.resolve(true); // 自动确认
  }

  var confirmId = 'confirm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  
  // 构建用户友好的确认信息
  var confirmDetails = {
    title: '\u26A0\uFE0F \u5B89\u5168\u786E\u8BA4FF1A' + operation,
    reason: details.reason || '\u6B64\u64CD\u4F5C\u5177\u6709\u6F5C\u5728\u98CE\u9669\uFF0C\u9700\u8981\u60A8\u786E\u8BA4\u3002',
    command: details.command || null,
    path: details.path || null,
    riskLevel: details.riskLevel || 'high',
    actionLabel: getActionLabel(operation, details)
  };
  
  // 通知渲染进程：等待用户确认
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ai-stream', { 
      type: 'waiting-confirmation', 
      message: (details.path ? '\u7B49\u5F85\u786E\u8BA4\uFF1A' + getActionLabel(operation, details) : '\u7B49\u5F85\u7528\u6237\u786E\u8BA4\u5371\u9669\u64CD\u4F5C...') 
    });
  }
  
  return new Promise(function(resolve) {
    // 发送到渲染进程显示内嵌确认UI
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('show-confirmation', { confirmId: confirmId, ...confirmDetails });
    }
    
    _pendingConfirmations.set(confirmId, {
      resolve: resolve,
      timeout: setTimeout(function() {
        _pendingConfirmations.delete(confirmId);
        console.log('[Security] Confirmation timed out, denying');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ai-stream', { type: 'error', message: '\u786E\u8BA4\u8D85\u65F6\uFF0C\u64CD\u4F5C\u5DF2\u53D6\u6D88' });
        }
        resolve(false);
      }, 120000)
    });
  });
}

function getActionLabel(operation, details) {
  if (details.path) {
    var fileName = details.path.split(/[\/\\]/).pop() || details.path;
    if (operation === '\u6587\u4EF6\u5220\u9664') return '\u5220\u9664\u300C' + fileName + '\u300D';
    return operation + '\uFF1A' + fileName;
  }
  if (details.command) {
    var cmd = details.command.slice(0, 60) + (details.command.length > 60 ? '...' : '');
    return '\u6267\u884C\u547D\u4EE4';
  }
  return operation;
}

// ===== 智能解码 PowerShell/命令输出（中文 Windows 默认 GBK，避免乱码）=====
let _iconv = null;
try { _iconv = require('iconv-lite'); } catch (e) { _iconv = null; }
function decodeCmdOutput(buf) {
  if (!buf || !buf.length) return '';
  // 先按 UTF-8 解码，若出现替换字符(U+FFFD)说明不是 UTF-8，回退 GBK
  const asUtf8 = buf.toString('utf-8');
  if (asUtf8.indexOf('\uFFFD') === -1) return asUtf8;
  if (_iconv) {
    try { return _iconv.decode(buf, 'gbk'); } catch (e) { console.error('[decode] GBK 解码失败:', e.message); }
  }
  return asUtf8;
}

// 把常见命令错误翻译成人能看懂的中文提示
function friendlyCmdError(command, rawMsg) {
  const cmd = (command || '').trim();
  const firstToken = (cmd.split(/\s+/)[0] || '').replace(/['"]/g, '');
  const lower = (rawMsg || '').toLowerCase();
  // 命令/程序不存在
  if (lower.indexOf('commandnotfoundexception') >= 0 ||
      lower.indexOf('is not recognized') >= 0 ||
      lower.indexOf('不是内部或外部命令') >= 0 ||
      (lower.indexOf('objectnotfound') >= 0 && lower.indexOf('not recognized') >= 0) ||
      lower.indexOf('无法将') >= 0) {
    return `命令 “${firstToken}” 在本机不存在或未安装。当前系统是 Windows + PowerShell，没有该命令。\n` +
           `建议改用 Windows/PowerShell 自带的等价方式（例如查网站信息用 Invoke-WebRequest/Resolve-DnsName，而不是 openssl/curl/dig 等 Linux 命令）。\n` +
           `原始错误：${(rawMsg || '').trim().slice(0, 300)}`;
  }
  if (lower.indexOf('access is denied') >= 0 || lower.indexOf('拒绝访问') >= 0 || lower.indexOf('unauthorizedaccess') >= 0) {
    return `权限不足，无法执行该命令（可能需要管理员权限）。\n原始错误：${(rawMsg || '').trim().slice(0, 300)}`;
  }
  if (lower.indexOf('cannot find path') >= 0 || lower.indexOf('找不到路径') >= 0 || lower.indexOf('itemnotfound') >= 0) {
    return `找不到指定的文件或路径，请检查路径是否正确。\n原始错误：${(rawMsg || '').trim().slice(0, 300)}`;
  }
  // 默认：直接返回清理后的原始错误
  return (rawMsg || '命令执行失败').trim().slice(0, 600);
}

// ===================================================================
// 智能工具执行增强系统
// ===================================================================

/**
 * 错误类型分类
 */
function classifyToolError(name, error, args) {
  const msg = (error || '').toLowerCase();
  const categories = [];

  if (name === 'execute_command') {
    if (msg.includes('commandnotfound') || msg.includes('is not recognized') || msg.includes('不是内部或外部命令') || msg.includes('无法将')) {
      categories.push('COMMAND_NOT_FOUND');
    }
    if (msg.includes('access is denied') || msg.includes('拒绝访问') || msg.includes('unauthorizedaccess') || msg.includes('requires elevation')) {
      categories.push('PERMISSION_DENIED');
    }
    if (msg.includes('cannot find path') || msg.includes('找不到路径') || msg.includes('itemnotfound') || msg.includes('does not exist')) {
      categories.push('PATH_NOT_FOUND');
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      categories.push('TIMEOUT');
    }
    if (msg.includes('encoding') || msg.includes('utf-8') || msg.includes('gbk')) {
      categories.push('ENCODING_ISSUE');
    }
  }

  if (name === 'file_read') {
    if (msg.includes('enoent') || msg.includes('no such file') || msg.includes('找不到')) {
      categories.push('FILE_NOT_FOUND');
    }
    if (msg.includes('eacces') || msg.includes('permission') || msg.includes('拒绝访问')) {
      categories.push('FILE_PERMISSION');
    }
    if (msg.includes('encoding') || msg.includes('invalid character') || msg.includes('utf-8')) {
      categories.push('FILE_ENCODING');
    }
    if (msg.includes('xlsx') || msg.includes('excel') || msg.includes('workbook')) {
      categories.push('EXCEL_PARSE_ERROR');
    }
    if (msg.includes('pdf') || msg.includes('pdfjs')) {
      categories.push('PDF_PARSE_ERROR');
    }
    if (msg.includes('docx') || msg.includes('mammoth') || msg.includes('word')) {
      categories.push('DOCX_PARSE_ERROR');
    }
  }

  if (categories.length === 0) categories.push('UNKNOWN');
  return categories;
}

/**
 * Linux/Unix 命令 → PowerShell 等价命令转换
 */
function convertLinuxToPowerShell(cmd) {
  const mappings = {
    'cat ': 'Get-Content ',
    'ls ': 'Get-ChildItem ',
    'll ': 'Get-ChildItem -Force ',
    'pwd': 'Get-Location',
    'rm ': 'Remove-Item ',
    'cp ': 'Copy-Item ',
    'mv ': 'Move-Item ',
    'mkdir ': 'New-Item -ItemType Directory ',
    'touch ': 'New-Item ',
    'grep ': 'Select-String ',
    'find ': 'Get-ChildItem -Recurse -Filter ',
    'head ': 'Select-Object -First ',
    'tail ': 'Select-Object -Last ',
    'wc -l': 'Measure-Object -Line',
    'ps aux': 'Get-Process',
    'kill ': 'Stop-Process -Name ',
    'df -h': 'Get-Volume',
    'du -sh': '(Get-ChildItem -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB',
    'curl ': 'Invoke-WebRequest ',
    'wget ': 'Invoke-WebRequest ',
    'tar ': 'Expand-Archive ',
    'zip ': 'Compress-Archive ',
    'unzip ': 'Expand-Archive ',
    'chmod ': '# Windows ACLs use different model; use icacls instead of chmod ',
    'chown ': '# Windows ownership handled differently; use takeown ',
    'top': 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 20',
    'date': 'Get-Date',
    'whoami': '$env:USERNAME',
    'env': 'Get-ChildItem Env:',
    'which ': 'Get-Command ',
    'history': 'Get-History',
    'free -h': 'Get-CimInstance Win32_OperatingSystem | Select-Object @{N="FreeMemoryGB";E={[math]::Round($_.FreePhysicalMemory/1MB,2)}}, @{N="TotalMemoryGB";E={[math]::Round($_.TotalVisibleMemorySize/1MB,2)}}',
    'uptime': 'Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime',
    'netstat -tlnp': 'Get-NetTCPConnection -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess, @{N="ProcessName";E={(Get-Process -Id $_.OwningProcess).ProcessName}}',
    'ifconfig': 'Get-NetIPAddress | Where-Object {$_.AddressFamily -eq "IPv4"} | Select-Object IPAddress, InterfaceAlias',
    'ping ': 'Test-Connection ',
    'nslookup ': 'Resolve-DnsName ',
    'dig ': 'Resolve-DnsName ',
    'traceroute ': 'Test-NetConnection -TraceRoute ',
  };

  const trimmed = cmd.trim();
  for (const [linux, ps] of Object.entries(mappings)) {
    if (trimmed.startsWith(linux)) {
      return ps + trimmed.slice(linux.length);
    }
  }
  return null;
}

/**
 * 检测命令是否为常见 Linux 命令
 */
function isLinuxCommand(cmd) {
  const linuxCmds = ['cat', 'ls', 'll', 'pwd', 'rm', 'cp', 'mv', 'mkdir', 'touch', 'grep', 'find', 'head', 'tail', 'wc', 'ps', 'kill', 'df', 'du', 'curl', 'wget', 'tar', 'zip', 'unzip', 'chmod', 'chown', 'top', 'date', 'whoami', 'env', 'which', 'history', 'free', 'uptime', 'netstat', 'ifconfig', 'ping', 'nslookup', 'dig', 'traceroute', 'awk', 'sed', 'cut', 'sort', 'uniq', 'diff', 'tee', 'xargs', 'jq', 'openssl', 'ssh', 'scp', 'nmap'];
  const first = (cmd.trim().split(/\s+/)[0] || '').replace(/['"]/g, '').toLowerCase();
  return linuxCmds.includes(first);
}

/**
 * 智能命令执行 - 带错误自动恢复
 */
async function executeCommandSmart(args, signal) {
  const originalCommand = args.command || '';

  // 阶段1：尝试原始命令
  const result1 = await runCommand(originalCommand, signal, 30000);
  if (result1.success) return result1;

  const categories = classifyToolError('execute_command', result1.error, args);
  const suggestions = [];

  // 阶段2：如果是Linux命令，尝试转换为PowerShell
  if (categories.includes('COMMAND_NOT_FOUND') && isLinuxCommand(originalCommand)) {
    const converted = convertLinuxToPowerShell(originalCommand);
    if (converted) {
      suggestions.push(`检测到 Linux 命令，已转换为 PowerShell: ${converted}`);
      const result2 = await runCommand(converted, signal, 30000);
      if (result2.success) {
        return { ...result2, _recovery: 'auto_converted_linux_to_ps', _originalError: result1.error };
      }
      suggestions.push(`PowerShell 转换后仍失败: ${result2.error}`);
    } else {
      suggestions.push(`该 Linux 命令暂无自动转换映射，建议手动改写为 PowerShell 等价命令`);
    }
  }

  // 阶段3：权限错误 → 尝试用 Start-Process 提升权限
  if (categories.includes('PERMISSION_DENIED')) {
    const elevatedCmd = `Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-Command','${originalCommand.replace(/'/g, "''")}' -Wait`;
    suggestions.push('检测到权限不足，尝试以管理员身份运行...');
    const result3 = await runCommand(elevatedCmd, signal, 60000);
    if (result3.success) {
      return { ...result3, _recovery: 'admin_elevation', _originalError: result1.error };
    }
    suggestions.push(`管理员权限尝试也失败: ${result3.error}`);
  }

  // 阶段4：路径错误 → 尝试搜索文件
  if (categories.includes('PATH_NOT_FOUND')) {
    const pathMatch = originalCommand.match(/['"]?([A-Za-z]:\\[^'"\s]+|[\\/][^'"\s]+)['"]?/);
    if (pathMatch) {
      const searchPath = pathMatch[1];
      const parentDir = path.dirname(searchPath);
      const baseName = path.basename(searchPath);
      if (fs.existsSync(parentDir)) {
        try {
          const files = fs.readdirSync(parentDir).filter(f => f.toLowerCase().includes(baseName.toLowerCase().replace(/\*/g, '')));
          if (files.length > 0) {
            suggestions.push(`路径不存在，但在同级目录找到相似文件: ${files.join(', ')}`);
          }
        } catch (e) { console.error('[file_read] 查找相似文件失败:', e.message); }
      }
    }
  }

  // 阶段5：超时 → 延长超时重试
  if (categories.includes('TIMEOUT')) {
    suggestions.push('命令超时，尝试延长超时时间到 60 秒...');
    const result5 = await runCommand(originalCommand, signal, 60000);
    if (result5.success) {
      return { ...result5, _recovery: 'extended_timeout', _originalError: result1.error };
    }
    suggestions.push(`延长超时后仍失败: ${result5.error}`);
  }

  // 阶段6：编码问题 → 尝试不同编码
  if (categories.includes('ENCODING_ISSUE')) {
    const utf8Cmd = `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; ${originalCommand}`;
    suggestions.push('尝试强制 UTF-8 编码...');
    const result6 = await runCommand(utf8Cmd, signal, 30000);
    if (result6.success) {
      return { ...result6, _recovery: 'encoding_fix', _originalError: result1.error };
    }
  }

  // 所有恢复尝试都失败了，返回详细分析
  return {
    success: false,
    error: friendlyCmdError(originalCommand, result1.error),
    _recoveryAttempts: suggestions,
    _errorCategories: categories,
    _suggestion: `命令执行失败（已尝试 ${suggestions.length} 种恢复方法）。建议：\n` +
      (categories.includes('COMMAND_NOT_FOUND') ? '1. 该命令在 Windows 上不存在，请使用 PowerShell 等价命令\n' : '') +
      (categories.includes('PERMISSION_DENIED') ? '1. 需要管理员权限，请右键以管理员身份运行灵动AI\n' : '') +
      (categories.includes('PATH_NOT_FOUND') ? '1. 请检查文件路径是否正确，路径中不要包含特殊字符\n' : '') +
      (categories.includes('TIMEOUT') ? '1. 命令执行时间过长，请尝试简化命令或分批执行\n' : '') +
      `原始命令: ${originalCommand}\n` +
      `错误详情: ${result1.error}`
  };
}

/**
 * 底层命令执行（不处理错误恢复）
 */
function runCommand(command, signal, timeoutMs = 30000) {
  return new Promise((resolve) => {
    if (signal && signal.aborted) {
      resolve({ success: false, error: '⛔ 已停止：用户手动终止了任务' });
      return;
    }

    const wrapped = '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; ' + command;
    const child = exec(wrapped, { encoding: 'buffer', shell: 'powershell.exe', timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      _activeChildProcesses.delete(child);
      if (err && err.killed) {
        resolve({ success: false, error: '⛔ 命令已被停止按钮中断（或执行超时）' });
      } else if (err) {
        const msg = decodeCmdOutput(stderr) || err.message || '命令执行失败';
        resolve({ success: false, error: msg });
      } else {
        resolve({ success: true, output: decodeCmdOutput(stdout).slice(0, 3000) });
      }
    });

    // 注册到活跃进程追踪集，停止按钮可杀死
    _activeChildProcesses.add(child);

    if (signal) {
      signal.addEventListener('abort', () => {
        try { child.kill('SIGKILL'); } catch(e) { console.error('[execute_command] 终止子进程失败:', e.message); }
        resolve({ success: false, error: '⛔ 已停止：用户手动终止了任务' });
      }, { once: true });
    }
  });
}

/**
 * 智能文件读取 - 带格式自动降级
 */
async function readFileSmart(args) {
  const filePath = args.path;
  const fileExt = path.extname(filePath).toLowerCase();
  const errors = [];

  // Excel 文件
  if (fileExt === '.xlsx' || fileExt === '.xls') {
    // 方法1：xlsx 库
    try {
      const XLSX = require('xlsx');
      const workbook = XLSX.readFile(filePath);
      let result = '';
      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        result += `=== Sheet: ${sheetName} ===\n${csv}\n\n`;
      });
      return { success: true, content: result.slice(0, 8000), type: 'excel', method: 'xlsx_lib' };
    } catch(e) {
      errors.push(`xlsx库读取失败: ${e.message}`);
    }

    // 方法2：PowerShell COM 对象（Excel 应用程序）
    try {
      const psCmd = `$excel = New-Object -ComObject Excel.Application; $excel.Visible = $false; $wb = $excel.Workbooks.Open('${filePath.replace(/'/g, "''")}'); $sheet = $wb.Sheets.Item(1); $data = $sheet.UsedRange.Value2 | ForEach-Object { $_ -join "\t" }; $wb.Close(); $excel.Quit(); $data -join "\n"`;
      const comResult = await runCommand(psCmd, null, 30000);
      if (comResult.success) {
        return { success: true, content: comResult.output.slice(0, 8000), type: 'excel', method: 'powershell_com' };
      }
      errors.push(`PowerShell COM 读取失败: ${comResult.error}`);
    } catch(e) {
      errors.push(`PowerShell COM 异常: ${e.message}`);
    }

    // 方法3：作为文本读取（最后手段）
    try {
      const raw = fs.readFileSync(filePath);
      // 提取可读字符
      const text = raw.toString('utf-8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').slice(0, 8000);
      return { success: true, content: `[Excel文件文本提取（可能不完整）]\n${text}`, type: 'excel', method: 'raw_text', warning: '无法解析Excel结构，仅提取了可读文本' };
    } catch(e) {
      errors.push(`文本读取失败: ${e.message}`);
    }

    return { success: false, error: `Excel 读取失败（已尝试 ${errors.length} 种方法）:\n${errors.join('\n')}\n\n建议：确保文件未损坏，或尝试用 execute_command 手动读取` };
  }

  // Word 文件
  if (fileExt === '.docx' || fileExt === '.doc') {
    try {
      const mammoth = require('mammoth');
      const buffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      return { success: true, content: result.value.slice(0, 8000), type: 'docx' };
    } catch(e) {
      // 降级：尝试作为文本读取
      try {
        const raw = fs.readFileSync(filePath);
        const text = raw.toString('utf-8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').slice(0, 8000);
        return { success: true, content: `[Word文件文本提取（可能不完整）]\n${text}`, type: 'docx', warning: 'Word解析失败，仅提取了可读文本' };
      } catch(e2) {
        return { success: false, error: `Word文档读取失败: ${e.message}` };
      }
    }
  }

  // PDF 文件
  if (fileExt === '.pdf') {
    try {
      const { parsePdf } = require('./libs/pdf-parse-lib');
      const buffer = fs.readFileSync(filePath);
      const pdfData = await parsePdf(buffer, { maxPages: 10 });
      return { success: true, content: pdfData.text.slice(0, 8000), type: 'pdf' };
    } catch(e) {
      return { success: false, error: `PDF读取失败: ${e.message}\n建议：检查PDF是否加密或损坏` };
    }
  }

  // 默认：文本读取
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content: content.slice(0, 8000) };
  } catch (e) {
    const categories = classifyToolError('file_read', e.message, args);
    if (categories.includes('FILE_NOT_FOUND')) {
      // 尝试搜索相似文件
      const dir = path.dirname(filePath);
      const base = path.basename(filePath);
      if (fs.existsSync(dir)) {
        try {
          const similar = fs.readdirSync(dir).filter(f => f.toLowerCase().includes(path.parse(base).name.toLowerCase()));
          if (similar.length > 0) {
            return { success: false, error: `文件不存在: ${filePath}\n但在同级目录找到相似文件: ${similar.join(', ')}\n建议检查文件名是否正确` };
          }
        } catch(e2) { console.error('[file_read] 查找相似文件(2)失败:', e2.message); }
      }
    }
    return { success: false, error: e.message };
  }
}

/**
 * 智能工具执行包装器 - 统一入口
 */
async function executeToolSmart(name, args, signal) {
  console.log('[Tool Call]', name, JSON.stringify(args || {}).slice(0, 150));

  // 中断检查
  if (signal && signal.aborted) {
    return { success: false, error: '⛔ 已停止：用户手动终止了任务' };
  }

  // 特殊处理：execute_command 使用智能版本
  if (name === 'execute_command') {
    return await executeCommandSmart(args, signal);
  }

  // 特殊处理：file_read 使用智能版本
  if (name === 'file_read') {
    return await readFileSmart(args);
  }

  // 其他工具走原始 executeTool
  return await executeTool(name, args, signal);
}

// ===== PetManager 集成 =====
const PetManager = require('./pet-manager');
let petManager = null;

// ===== 本地 HTTP 服务器（用于浏览器语音识别）=====
let voiceHttpServer = null;
let voiceServerPort = 18765;

process.stdout.on('error', (err) => { if (err.code === 'EPIPE') return; });
process.stderr.on('error', (err) => { if (err.code === 'EPIPE') return; });
process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE') return;
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

// ===== 路径配置（惰性初始化，避免模块加载时 app 未就绪）=====
function getConfigPath() { return path.join(app.getPath('userData'), 'config.json'); }
function getAgentsPath() { return path.join(app.getPath('userData'), 'agents.json'); }
function getSkillsPath() { return path.join(app.getPath('userData'), 'skills.json'); }
function getHistoryPath() { return path.join(app.getPath('userData'), 'history.json'); }
function getSessionsPath() { return path.join(app.getPath('userData'), 'sessions.json'); }
function getArchivedSessionsPath() { return path.join(app.getPath('userData'), 'archived-sessions.json'); }
function getGroupChatsPath() { return path.join(app.getPath('userData'), 'group-chats.json'); }
function getAgentConfigsDir() { return path.join(app.getPath('userData'), 'agent-configs'); }
function getMeetingNotesDir() { return path.join(app.getPath('userData'), 'meeting-notes'); }

// ===== 默认配置 =====
const defaultConfig = {
  model: {
    provider: 'custom',
    apiKey: '',
    model: 'gpt-4o',
    baseUrl: ''
  },
  agent: {
    name: '灵动AI',
    systemPrompt: '你是灵动AI，一个强大的桌面AI助手。'
  },
  notesDir: ''
};

// 内置 Agent 模板（延迟初始化，需要 app ready 后才能用 getPath）
let defaultAgents = null;
function getDefaultAgents() {
  if (defaultAgents) return defaultAgents;
  defaultAgents = [
    {
      id: 'default',
      name: '灵动AI助手',
      description: '默认助手，支持文件操作、系统控制、浏览器自动化等全量本地工具',
      systemPrompt: `你是灵动AI的核心大脑，一个强大的任务调度型AI助手，运行在用户本地Windows电脑上。你的核心能力是：理解用户意图、主动分析问题、拆解任务、调度合适的工具或Agent完成任务。

## ⚠️ 最高优先级规则（必须遵守）
- 你具备完整的电脑操作权限，包括**文件删除、文件夹删除、命令执行、软件控制等所有操作**
- 当用户要求删除文件或文件夹时，**必须直接调用 file_delete 工具执行删除**
- **绝对不要说"我不能删除"、"我没有删除权限"、"我只能创建不能删除"之类的话** —— 你完全具备删除能力
- 如果删除失败，检查路径是否正确（用file_list），而不是告诉用户你做不到

## 工作原则
1. **主动分析**：收到任何请求，先理解用户真实意图，而不是字面意思
2. **能做就做**：能直接完成的任务立即执行，不要说"我无法做到"
3. **拆解复杂任务**：复杂任务先列出执行计划，再逐步执行
4. **调度Agent**：需要专业能力时，用 call_agent 调用已有的专属Agent。先用 list_agents 查看有哪些Agent及其能力，然后选择合适的Agent执行子任务
5. **获取实时信息**：当用户询问新闻、天气、股价、时事等时效性信息时，优先使用 search_web 搜索互联网，而不是凭记忆回答

## 🔗 多Agent协同工作流（极其重要 — 必须实际调用工具，不能只描述）
你作为总调度，可以调用其他专业Agent完成跨领域任务。

### 🚨 铁律：收到跨领域任务时，必须分两步实际执行，不能只说"我需要"然后不动

**错误示范（绝对禁止）**：
❌ "我需要先查看有哪些Agent可用，然后调用项目管理Agent汇总项目，再调用邮件Agent发送..."
    → 这是「只动嘴」！你必须**真的调用** list_agents 和 call_agent 工具！

**正确做法**：
✅ 第一轮：调用 list_agents 工具
✅ 第二轮：调用 call_agent(项目管理Agent) 工具
✅ 第三轮：调用 call_agent(邮件Agent, context=上一步结果) 工具
✅ 第四轮：整理结果展示给用户

### 执行流程
- **第一步：了解能力** — **立即调用 list_agents 工具**（不要描述，直接调）
- **第二步：链式调度** — **依次调用 call_agent 工具**，前一个的输出作为后一个的 context
- **第三步：汇总呈现** — 将所有Agent的结果汇总整理后呈现给用户

**典型场景（必须按此模式真正执行）**：
- 用户："汇总项目进度并发邮件" 
  → 第1轮：调用 list_agents
  → 第2轮：调用 call_agent(agentId="项目Agent的ID", task="汇总本周项目进展")
  → 第3轮：调用 call_agent(agentId="邮件Agent的ID", task="将以下内容整理成周报格式并发送至xxx@xxx.com", context=第2轮结果)
  → 第4轮：用文字汇总两个Agent的执行结果
- 用户："查上周项目进展，按周报格式整理发邮件"
  → 同上，必须真正执行 call_agent 两次
- **关键**：每次 call_agent 都必须等待上一步结果返回后，将其作为 context 传给下一个

## 任务处理示例
- 用户说"帮我整理会议纪要" → 调用 search_knowledge_base 或 search_meeting_notes 搜索，整理后呈现
- 用户说"创建一个XXX的Agent" → **立即调用 create_agent 工具**创建，必须传入完整的 name、description、systemPrompt 和 tools，不要只生成代码描述
- 用户说"帮我写一份报告" → 用 file_write 直接写入文件
- 用户说"执行这个任务" → 拆解步骤，逐一调用工具执行
- 用户问"能帮我做XXX吗" → 直接做，不要问"你确定吗"
- 用户问"今天有什么新闻" → 用 search_web 搜索最新资讯
- 用户说"帮我看看这个网页讲了什么" → 用 fetch_url 抓取网页内容
- **用户说"删除XXX"或"帮我删掉XXX" → 必须调用 file_delete 工具执行删除操作**

## 🔴 工具使用铁律（极其重要，违反将导致功能失效）
- **你必须通过 Function Calling 机制调用工具**，这是唯一正确的工具调用方式
- **绝对禁止以下行为（会导致严重问题）**：
  ❌ 不要输出类似 \`\`\`json {"tool": "file_list", "path": "..."} \`\`\` 这样的代码块来"模拟"工具调用
  ❌ 不要输出 <tool_call_end> 或任何类似的伪工具调用标记
  ❌ 不要输出 "让我帮你调用xxx工具" 然后显示代码块
  ❌ 不要用文字描述工具调用的过程（如"正在调用file_delete..."）
  ✅ **正确做法**：直接通过 Function Call 机制调用工具，系统会自动执行并返回结果
- 文件操作、系统命令、Agent管理：直接通过 Function Call 执行
- 不确定路径时，用 file_list 先探索目录结构
- 遇到错误，自动尝试修复，而不是直接报错给用户
- 查找文件内容时，优先用 search_knowledge_base（可指定路径），再用 search_meeting_notes
- **时效性信息（新闻、天气、股价）**：必须用 search_web，不要凭训练数据回答
- **网页内容分析**：用 fetch_url 抓取后分析，不要猜测
- **创建Agent**：用户要求创建Agent时，必须通过 Function Call 调用 create_agent，传入完整参数。绝对不能输出 YAML 配置或 python 代码来表示

## 删除操作专项说明
- 你完全具备删除文件和文件夹的能力
- 用户要求删除时，调用 file_delete 工具即可
- 系统（而非你）会自动弹出确认对话框给用户确认
- 你不需要预先询问用户是否确定删除，直接调用工具即可
- 如果路径不存在，用 file_list 先确认正确路径再删除

## 安全规则（重要）
- 系统已启用安全审计和用户确认机制：
  - 格式化磁盘、删除系统目录（C:\\Windows 等）会被自动阻止
  - 删除用户数据需要用户在对话框中确认（系统自动处理，不需要你来确认）
- 你只需要调用工具，安全由系统保障

## 错误恢复与替代方法（重要）
- 工具执行失败时，系统会自动尝试多种恢复方法（如命令转换、权限提升、超时延长等）
- 如果自动恢复仍失败，你必须灵活更换方法，不要反复使用同一个失败工具
- **命令失败** → 改用不同的命令或工具达成相同目标
- **文件读取失败** → 检查路径是否正确（用 file_list），或尝试读取其他相关文件
- **权限不足** → 尝试访问其他路径，或提醒用户需要管理员权限
- **网络请求失败** → 检查URL是否正确，或尝试用不同的API/方法
- **不要连续3次以上使用同一个失败工具**，立即换思路

## 执行系统命令规范（重要）
- 本机是 Windows，execute_command 走的是 PowerShell，不是 Linux/Mac。绝不要用 curl、wget、openssl、grep、cat、ls、ifconfig、dig 等 Linux/bash 命令。
- 请用 PowerShell 原生命令：网页请求用 Invoke-WebRequest / Invoke-RestMethod；DNS/网站归属用 Resolve-DnsName；读文件用 Get-Content；列目录用 Get-ChildItem；查找文本用 Select-String。
- 多条命令用分号(;)连接，不要用 &&。
- 如果某条命令报"命令不存在"，立即改用 PowerShell 等价命令重试，不要反复执行同一个错误命令。

## 禁止行为
- ❌ 不要说"我无法访问您的文件系统"（你可以，用 file_read/file_list）
- ❌ 不要说"我没有能力做到"或"我只能协助创建，不能删除"（先尝试，用工具）
- ❌ 不要无限追问确认（理解意图后直接执行）
- ❌ 不要只给建议而不行动
- ❌ 不要输出任何形式的伪工具调用代码`,
      model: '',
      apiKey: '',
      baseUrl: '',
      temperature: 0.7,
      tools: ['file_read', 'file_write', 'file_list', 'file_delete', 'create_folder', 'execute_command', 'open_software', 'take_screenshot', 'create_agent', 'list_agents', 'call_agent', 'search_meeting_notes', 'search_knowledge_base', 'get_current_time', 'open_url', 'search_web', 'fetch_url', 'win_find_window', 'win_activate_window', 'win_send_keys', 'win_click', 'run_ahk_script', 'ahk_find_window', 'ahk_send_input', 'ahk_click_control', 'organize_files', 'list_todos', 'create_todo', 'update_todo', 'delete_todo', 'mcp_call'],
      dataDir: path.join(app.getPath('userData'), 'agents', 'default'),
      createdAt: new Date().toISOString()
    },
    {
      id: 'meeting-assistant',
      name: '智能会议纪要助手',
      description: '录音转文字，自动生成结构化会议纪要，支持自然语言检索',
      systemPrompt: `你是专业的会议纪要助手。
当用户要求查询会议纪要时，使用 search_meeting_notes 工具搜索本地文件。
当用户要求保存纪要时，使用 save_meeting_note 工具按日期归档。
生成纪要时，请输出以下结构：
# 会议纪要
**日期**：[日期]
**参会人员**：[人员]
## 议题
## 讨论要点
## 决策事项
## 待办任务
请用中文输出。`,
      model: '',
      apiKey: '',
      baseUrl: '',
      temperature: 0.7,
      tools: ['search_meeting_notes', 'save_meeting_note', 'list_meeting_notes', 'get_current_time'],
      dataDir: path.join(app.getPath('userData'), 'agents', 'meeting-assistant'),
      notesDir: getMeetingNotesDir(),
      createdAt: new Date().toISOString()
    },
    {
      id: 'weather-assistant',
      name: '天气查询助手',
      description: '查询全国各地实时天气、未来预报、温度湿度风速等信息',
      systemPrompt: `你是专业的天气查询助手。
用户询问天气时，使用 execute_command 工具调用 PowerShell 通过 wttr.in 接口获取天气数据：
\`\`\`
(Invoke-WebRequest -Uri "https://wttr.in/城市名?format=j1" -UseBasicParsing).Content
\`\`\`
将返回的 JSON 数据解析后，以友好的格式告知用户：
- 当前温度（摄氏度）
- 天气状况（晴/阴/雨/雪等）
- 体感温度
- 湿度
- 风速风向
- 未来3天预报

城市名支持中文拼音或英文，例如：Beijing、Shanghai、Shenzhen。
如果用户只说"天气"未指定城市，询问用户所在城市。
请用简洁友好的中文回复，可以加上适当的天气 emoji。`,
      model: '',
      apiKey: '',
      baseUrl: '',
      temperature: 0.7,
      tools: ['execute_command', 'get_current_time'],
      dataDir: path.join(app.getPath('userData'), 'agents', 'weather-assistant'),
      createdAt: new Date().toISOString()
    }
  ];
  return defaultAgents;
}

const defaultSkills = [
  { id: 'default', name: '基础对话', description: '与AI进行自然语言对话', createdAt: new Date().toISOString() }
];

// ===== 初始化目录 =====
function ensureDirectories() {
  [getAgentConfigsDir(), getMeetingNotesDir()].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
  getDefaultAgents().forEach(a => {
    if (a.dataDir && !fs.existsSync(a.dataDir)) fs.mkdirSync(a.dataDir, { recursive: true });
  });
}

function ensureConfig() {
  if (!fs.existsSync(getConfigPath())) {
    const cfg = { ...defaultConfig, notesDir: getMeetingNotesDir() };
    fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2));
  }
  if (!fs.existsSync(getAgentsPath())) {
    fs.writeFileSync(getAgentsPath(), JSON.stringify(getDefaultAgents(), null, 2));
  }
  if (!fs.existsSync(getSkillsPath())) {
    fs.writeFileSync(getSkillsPath(), JSON.stringify(defaultSkills, null, 2));
  }
  if (!fs.existsSync(getHistoryPath())) {
    fs.writeFileSync(getHistoryPath(), JSON.stringify([], null, 2));
  }
  // P0-13: 初始化 sessions.json，避免 loadSessions 找不到文件
  if (!fs.existsSync(getSessionsPath())) {
    fs.writeFileSync(getSessionsPath(), JSON.stringify([], null, 2), 'utf8');
  }
  // P0-13: 初始化 archived-sessions.json 和 group-chats.json
  if (!fs.existsSync(getArchivedSessionsPath())) {
    fs.writeFileSync(getArchivedSessionsPath(), JSON.stringify([], null, 2), 'utf8');
  }
  if (!fs.existsSync(getGroupChatsPath())) {
    fs.writeFileSync(getGroupChatsPath(), JSON.stringify([], null, 2), 'utf8');
  }
}


// ===== 合并多个 AbortSignal，任意一个触发则整体触发 =====
// [v1.2.1] 用于 call_agent 中合并外部中断信号和内部超时信号
function combineSignals(signal1, signal2) {
  if (signal1.aborted || signal2.aborted) return AbortSignal.abort();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal1.addEventListener('abort', onAbort, { once: true });
  signal2.addEventListener('abort', onAbort, { once: true });
  return controller.signal;
}

// ===== 安全读取 agents.json（带备份和校验）=====
function safeLoadAgents() {
  try {
    // 备份现有文件
    if (fs.existsSync(getAgentsPath())) {
      const backupPath = getAgentsPath() + '.backup';
      fs.copyFileSync(getAgentsPath(), backupPath);
    }
    
    const data = fs.readFileSync(getAgentsPath(), 'utf-8');
    const agents = JSON.parse(data);
    
    // 数据校验
    if (!Array.isArray(agents)) {
      throw new Error('agents.json 格式错误：不是数组');
    }
    
    // 校验每个 agent 的必需字段
    for (const agent of agents) {
      if (!agent.id || !agent.name) {
        throw new Error('agents.json 格式错误：缺少必需字段 id 或 name');
      }
    }
    
    return agents;
  } catch (e) {
    console.error('[Agent] 加载失败，使用默认配置:', e.message);
    
    // 尝试从备份恢复
    const backupPath = getAgentsPath() + '.backup';
    if (fs.existsSync(backupPath)) {
      try {
        const backupData = fs.readFileSync(backupPath, 'utf-8');
        const backupAgents = JSON.parse(backupData);
        if (Array.isArray(backupAgents)) {
          console.log('[Agent] 从备份恢复成功');
          fs.writeFileSync(getAgentsPath(), JSON.stringify(backupAgents, null, 2));
          return backupAgents;
        }
      } catch (backupErr) {
        console.error('[Agent] 备份文件也损坏:', backupErr.message);
      }
    }
    
    // 使用默认配置
    const defaultAgents = getDefaultAgents();
    fs.writeFileSync(getAgentsPath(), JSON.stringify(defaultAgents, null, 2));
    return defaultAgents;
  }
}

let mainWindow;
let petWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    title: '✨ 灵动AI - by Li'
  });

  mainWindow.webContents.on('did-finish-load', () => console.log('Page loaded'));
  mainWindow.loadFile('index.html');

  mainWindow.webContents.session.setPermissionRequestHandler((wc, permission, cb) => {
    if (['media', 'microphone'].includes(permission)) cb(true);
    else cb(false);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('voice-recorder.html') || url.startsWith('file://')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 620, height: 520,
          title: '🎤 语音转写',
          resizable: true,
          webPreferences: { nodeIntegration: false, contextIsolation: false, webSecurity: false }
        }
      };
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.close();
      petWindow = null;
    }
  });
}

app.whenReady().then(() => {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
  ensureDirectories();
  ensureConfig();
  createWindow();
  
  // 初始化 PetManager（自动注册所有 pet-* IPC handlers）
  petManager = new PetManager();
  
  // 启动本地 HTTP 服务器（会议纪要功能）
  startVoiceHttpServer();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ===== P0-11: IPC handler 安全注册辅助函数 =====
// 单个 handler 注册失败不影响其他 handler；单个 handler 执行失败返回统一错误格式
const _originalIpcHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = function safeHandle(channel, handler) {
  const wrappedHandler = async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (e) {
      console.error(`[IPC Error] ${channel}:`, e.message);
      // 统一错误返回格式，兼容前端 { success, error } 约定
      return { success: false, error: e.message || '未知错误' };
    }
  };
  try {
    _originalIpcHandle(channel, wrappedHandler);
  } catch (e) {
    console.error(`[IPC Register Error] 注册 ${channel} 失败:`, e.message);
  }
};

// ===== 桌宠窗口管理（直接调用 PetManager 内置桌宠）=====
let _petProcess = null;
ipcMain.handle('toggle-pet', async () => {
  try {
    // 优先使用 PetManager 的内置桌宠窗口
    if (petManager) {
      const petWin = petManager.petWindow;
      if (petWin && !petWin.isDestroyed()) {
        // 已显示，则隐藏/关闭
        petWin.close();
        petManager.petWindow = null;
        console.log('[toggle-pet] 已收回内置桌宠');
        return { success: true, message: '桌面宠物已收回', state: 'closed', visible: false };
      } else {
        // 未显示，则创建/显示
        petManager.createPetWindow();
        console.log('[toggle-pet] 已打开内置桌宠');
        return { success: true, message: '桌面宠物已显示', state: 'open', visible: true };
      }
    }

    // 兜底：如果 petManager 还没初始化，直接创建一个简单的桌宠窗口
    const { BrowserWindow } = require('electron');
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.close();
      petWindow = null;
      return { success: true, visible: false };
    }
    petWindow = new BrowserWindow({
      width: 120, height: 120,
      frame: false, transparent: true, alwaysOnTop: true,
      resizable: false, skipTaskbar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
    });
    petWindow.loadFile('pet-window.html');
    petWindow.on('closed', () => { petWindow = null; });
    return { success: true, visible: true };
  } catch(e) {
    console.error('[toggle-pet] Error:', e);
    return { success: false, error: '操作失败: ' + e.message };
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ===================================================================
// IPC - 配置管理
// ===================================================================

ipcMain.handle('get-config', async () => {
  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'));
    return config;
  } catch (e) {
    return { ...defaultConfig, notesDir: getMeetingNotesDir() };
  }
});

ipcMain.handle('save-config', async (event, config) => {
  try {
    let toSave = config;
    while (toSave && toSave.config && toSave.success !== undefined) {
      toSave = toSave.config;
    }
    if (!toSave || !toSave.model) return { success: false, error: '配置格式错误' };
    fs.writeFileSync(getConfigPath(), JSON.stringify(toSave, null, 2));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ===================================================================
// IPC - Agent 管理
// ===================================================================

ipcMain.handle('get-agents', async () => {
  try {
    const agents = safeLoadAgents();
    return { success: true, agents };
  } catch (e) {
    return { success: true, agents: getDefaultAgents() };
  }
});

ipcMain.handle('create-agent', async (event, agent) => {
  try {
    // 参数校验：防止创建空白 Agent
    if (!agent || !agent.name || agent.name.trim() === '') {
      return { success: false, error: '创建 Agent 失败：name（名称）不能为空' };
    }
    if (!agent.description || agent.description.trim() === '') {
      return { success: false, error: '创建 Agent 失败：description（描述）不能为空' };
    }
    if (!agent.systemPrompt || agent.systemPrompt.trim() === '') {
      return { success: false, error: '创建 Agent 失败：systemPrompt（系统提示词）不能为空' };
    }
    const agents = safeLoadAgents();
    const id = 'agent-' + Date.now();
    const dataDir = path.join(app.getPath('userData'), 'agents', id);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    // systemPrompt からパスを自動抽出（明示的に指定がない場合）
    let kbPath = agent.knowledgeBasePath || '';
    if (!kbPath && agent.systemPrompt) {
      // systemPrompt 内の Windows パスを検出（C:\ や D:\ 始まり）
      const pathMatch = agent.systemPrompt.match(/[A-Za-z]:\\[^s　\n\r'"、，。]+/);
      if (pathMatch) {
        const extractedPath = pathMatch[0].replace(/[\\，。、]+$/, '');
        // ファイルパスの場合は親ディレクトリを使用
        if (path.extname(extractedPath)) {
          kbPath = path.dirname(extractedPath);
        } else {
          kbPath = extractedPath;
        }
      }
    }
    const newAgent = {
      id,
      name: agent.name || '新Agent',
      description: agent.description || '',
      systemPrompt: agent.systemPrompt || '',
      model: agent.model || '',
      apiKey: agent.apiKey || '',
      baseUrl: agent.baseUrl || '',
      temperature: agent.temperature || 0.7,
      tools: agent.tools || ['file_read', 'file_write', 'file_list', 'file_delete', 'create_folder', 'execute_command', 'open_software', 'take_screenshot', 'create_agent', 'list_agents', 'search_meeting_notes', 'search_knowledge_base', 'get_current_time', 'open_url', 'search_web', 'fetch_url', 'win_find_window', 'win_activate_window', 'win_send_keys', 'win_click', 'run_ahk_script', 'ahk_find_window', 'ahk_send_input', 'ahk_click_control'],
      dataDir,
      knowledgeBasePath: kbPath,
      createdAt: new Date().toISOString()
    };
    const agentConfigPath = path.join(getAgentConfigsDir(), id + '.json');
    fs.writeFileSync(agentConfigPath, JSON.stringify(newAgent, null, 2));
    agents.push(newAgent);
    fs.writeFileSync(getAgentsPath(), JSON.stringify(agents, null, 2));
    return { success: true, agent: newAgent };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('update-agent', async (event, data) => {
  try {
    const { id, updates } = data || {};
    const agents = safeLoadAgents();
    const idx = agents.findIndex(a => a.id === id);
    if (idx === -1) return { success: false, error: 'Agent不存在' };
    agents[idx] = { ...agents[idx], ...updates, updatedAt: new Date().toISOString() };
    const agentConfigPath = path.join(getAgentConfigsDir(), id + '.json');
    fs.writeFileSync(agentConfigPath, JSON.stringify(agents[idx], null, 2));
    fs.writeFileSync(getAgentsPath(), JSON.stringify(agents, null, 2));
    return { success: true, agent: agents[idx] };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('delete-agent', async (event, id) => {
  try {
    let agents = safeLoadAgents();
    agents = agents.filter(a => a.id !== id);
    fs.writeFileSync(getAgentsPath(), JSON.stringify(agents, null, 2));
    const agentConfigPath = path.join(getAgentConfigsDir(), id + '.json');
    if (fs.existsSync(agentConfigPath)) fs.unlinkSync(agentConfigPath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ===================================================================
// IPC - 技能管理
// ===================================================================

ipcMain.handle('get-skills', async () => {
  try {
    const skills = JSON.parse(fs.readFileSync(getSkillsPath(), 'utf-8'));
    return { success: true, skills };
  } catch (e) {
    return { success: true, skills: defaultSkills };
  }
});

ipcMain.handle('create-skill', async (event, skill) => {
  try {
    const skills = JSON.parse(fs.readFileSync(getSkillsPath(), 'utf-8'));
    const newSkill = { ...skill, id: 'skill-' + Date.now(), createdAt: new Date().toISOString() };
    skills.push(newSkill);
    fs.writeFileSync(getSkillsPath(), JSON.stringify(skills, null, 2));
    return { success: true, skill: newSkill };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('delete-skill', async (event, id) => {
  try {
    let skills = JSON.parse(fs.readFileSync(getSkillsPath(), 'utf-8'));
    skills = skills.filter(s => s.id !== id);
    fs.writeFileSync(getSkillsPath(), JSON.stringify(skills, null, 2));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ===================================================================
// IPC - 对话历史
// ===================================================================

ipcMain.handle('get-history', async () => {
  try {
    const history = JSON.parse(fs.readFileSync(getHistoryPath(), 'utf-8'));
    return { success: true, history };
  } catch (e) {
    return { success: true, history: [] };
  }
});

ipcMain.handle('save-history', async (event, history) => {
  try {
    fs.writeFileSync(getHistoryPath(), JSON.stringify(history, null, 2));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});



// ===================================================================
// IPC - 会话记忆管理（左侧会话列表，持久化最近10条消息）
// ===================================================================

function loadSessions() {
  try {
    if (!fs.existsSync(getSessionsPath())) return [];
    let raw = fs.readFileSync(getSessionsPath(), 'utf-8');
    // 剥离 UTF-8 BOM，避免 JSON.parse 失败导致会话列表静默变空
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    return JSON.parse(raw);
  } catch (e) {
    console.error('[loadSessions] 解析失败:', e.message, '路径:', getSessionsPath());
    return [];
  }
}

function saveSessions(sessions) {
  fs.writeFileSync(getSessionsPath(), JSON.stringify(sessions, null, 2), 'utf-8');
}

ipcMain.handle('get-sessions', async () => {
  try {
    return { success: true, sessions: loadSessions() };
  } catch (e) { return { success: false, error: e.message, sessions: [] }; }
});

ipcMain.handle('save-session', async (event, session) => {
  try {
    const sessions = loadSessions();
    const idx = sessions.findIndex(s => s.id === session.id);
    // 每个会话最多保留10条消息
    if (session.messages && session.messages.length > 10) {
      session.messages = session.messages.slice(-10);
    }
    if (idx !== -1) {
      sessions[idx] = { ...sessions[idx], ...session, updatedAt: new Date().toISOString() };
    } else {
      sessions.unshift({ ...session, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    // 最多保留50个会话
    saveSessions(sessions.slice(0, 50));
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('delete-session', async (event, id) => {
  try {
    const sessions = loadSessions().filter(s => s.id !== id);
    saveSessions(sessions);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

// ===== 归档会话：永久保存（不受 50 个/10 条上限影响） =====
function loadArchivedSessions() {
  try {
    if (!fs.existsSync(getArchivedSessionsPath())) return [];
    let raw = fs.readFileSync(getArchivedSessionsPath(), 'utf-8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    return JSON.parse(raw);
  } catch (e) {
    console.error('[loadArchivedSessions] 解析失败:', e.message);
    return [];
  }
}

function saveArchivedSessions(list) {
  fs.writeFileSync(getArchivedSessionsPath(), JSON.stringify(list, null, 2), 'utf-8');
}

ipcMain.handle('archive-session', async (event, id) => {
  try {
    const sessions = loadSessions();
    const target = sessions.find(s => s.id === id);
    if (!target) return { success: false, error: '会话不存在' };
    const archived = loadArchivedSessions();
    // 已归档则更新，否则插入；归档完整保留所有消息
    const idx = archived.findIndex(s => s.id === id);
    const entry = { ...target, archivedAt: new Date().toISOString() };
    if (idx !== -1) archived[idx] = entry; else archived.unshift(entry);
    saveArchivedSessions(archived);
    // 从活动会话列表移除（已永久保存到归档）
    saveSessions(sessions.filter(s => s.id !== id));
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('get-archived-sessions', async () => {
  try {
    return { success: true, sessions: loadArchivedSessions() };
  } catch (e) { return { success: false, error: e.message, sessions: [] }; }
});

ipcMain.handle('delete-archived-session', async (event, id) => {
  try {
    saveArchivedSessions(loadArchivedSessions().filter(s => s.id !== id));
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

// ===== 群聊持久化（除非用户删除，否则一直保存） =====
ipcMain.handle('get-group-chats', async () => {
  try {
    if (!fs.existsSync(getGroupChatsPath())) return { success: true, groupChats: [] };
    let raw = fs.readFileSync(getGroupChatsPath(), 'utf-8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    return { success: true, groupChats: JSON.parse(raw) };
  } catch (e) { return { success: false, error: e.message, groupChats: [] }; }
});

ipcMain.handle('save-group-chats', async (event, groupChats) => {
  try {
    fs.writeFileSync(getGroupChatsPath(), JSON.stringify(groupChats || [], null, 2), 'utf-8');
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('clear-all-sessions', async () => {
  try {
    saveSessions([]);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('clear-history', async () => {
  try {
    fs.writeFileSync(getHistoryPath(), JSON.stringify([], null, 2));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ===================================================================
// IPC - 会议纪要
// ===================================================================

function getCurrentNotesDir() {
  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'));
    return config.notesDir || getMeetingNotesDir();
  } catch (e) {
    return getMeetingNotesDir();
  }
}

ipcMain.handle('get-notes-dir', async () => getCurrentNotesDir());

ipcMain.handle('set-notes-dir', async (event, notesDir) => {
  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'));
    config.notesDir = notesDir;
    if (!fs.existsSync(notesDir)) fs.mkdirSync(notesDir, { recursive: true });
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('list-meeting-notes', async () => {
  try {
    const notesDir = getCurrentNotesDir();
    if (!fs.existsSync(notesDir)) {
      fs.mkdirSync(notesDir, { recursive: true });
      return { success: true, notes: [] };
    }
    function walkDir(dir, baseDir) {
      const results = [];
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            results.push(...walkDir(fullPath, baseDir));
          } else if (item.endsWith('.md') || item.endsWith('.docx')) {
            results.push({
              name: item,
              path: fullPath,
              relativePath: path.relative(baseDir, fullPath),
              size: stat.size,
              mtime: stat.mtime.toISOString()
            });
          }
        }
      } catch (e) { console.error('[file_read] word 文档读取失败:', e.message); }
      return results;
    }
    const notes = walkDir(notesDir, notesDir).sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
    return { success: true, notes };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('save-meeting-note', async (event, { filename, content }) => {
  try {
    const notesDir = getCurrentNotesDir();
    const now = new Date();
    const dateDir = path.join(notesDir,
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    );
    if (!fs.existsSync(dateDir)) fs.mkdirSync(dateDir, { recursive: true });
    const mdFileName = (filename || '会议纪要').endsWith('.md') ? (filename || '会议纪要') : (filename || '会议纪要') + '.md';
    const filePath = path.join(dateDir, mdFileName);
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true, path: filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('read-meeting-note', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('delete-meeting-note', async (event, filePath) => {
  try {
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('search-meeting-notes', async (event, { query, limit = 5 }) => {
  try {
    const notesDir = getCurrentNotesDir();
    if (!fs.existsSync(notesDir)) return { success: true, results: [] };
    const results = [];
    function searchDir(dir) {
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          if (fs.statSync(fullPath).isDirectory()) {
            searchDir(fullPath);
          } else if (item.endsWith('.md')) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const q = query.toLowerCase();
            if (content.toLowerCase().includes(q)) {
              const idx = content.toLowerCase().indexOf(q);
              const snippet = content.substring(Math.max(0, idx - 100), Math.min(content.length, idx + 400));
              results.push({ file: item, path: fullPath, snippet, score: (content.match(new RegExp(q, 'gi')) || []).length });
            }
          }
        }
      } catch (e) { console.error('[search_meeting_notes] 搜索文件内容失败:', e.message); }
    }
    searchDir(notesDir);
    results.sort((a, b) => b.score - a.score);
    return { success: true, results: results.slice(0, limit) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('export-to-word', async (event, { content, filename }) => {
  try {
    const notesDir = getCurrentNotesDir();
    if (!fs.existsSync(notesDir)) fs.mkdirSync(notesDir, { recursive: true });
    const docxFileName = filename.replace('.md', '') + '.docx';
    const filePath = path.join(notesDir, docxFileName);
    const lines = content.split('\n');
    const paragraphs = lines.map(line => {
      const t = line.trim();
      if (!t) return new Paragraph({ text: '' });
      if (t.startsWith('# ')) return new Paragraph({ text: t.slice(2), heading: HeadingLevel.HEADING_1 });
      if (t.startsWith('## ')) return new Paragraph({ text: t.slice(3), heading: HeadingLevel.HEADING_2 });
      if (t.startsWith('### ')) return new Paragraph({ text: t.slice(4), heading: HeadingLevel.HEADING_3 });
      if (t.startsWith('- ') || t.startsWith('* ')) return new Paragraph({ text: t.slice(2), bullet: { level: 0 } });
      return new Paragraph({ text: t });
    });
    const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filePath, buffer);
    return { success: true, path: filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ===================================================================
// IPC - 文件系统
// ===================================================================

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('list-directory', async (event, dirPath) => {
  try {
    const items = fs.readdirSync(dirPath).map(name => {
      const fullPath = path.join(dirPath, name);
      const stat = fs.statSync(fullPath);
      return { name, path: fullPath, isDirectory: stat.isDirectory(), size: stat.size, mtime: stat.mtime.toISOString() };
    });
    return { success: true, items };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('create-folder', async (event, parentPath, folderName) => {
  try {
    const fullPath = folderName ? path.join(parentPath, folderName) : parentPath;
    fs.mkdirSync(fullPath, { recursive: true });
    return { success: true, path: fullPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (result.canceled) return { success: false };
  return { success: true, path: result.filePaths[0] };
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (result.canceled) return { success: false };
  return { success: true, path: result.filePaths[0] };
});

ipcMain.handle('open-file', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    shell.openPath(folderPath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-user-data-path', async () => app.getPath('userData'));

// ===================================================================
// IPC - 系统操作
// ===================================================================

ipcMain.handle('execute-command', async (event, command) => {
  return new Promise((resolve) => {
    exec(command, { encoding: 'buffer', shell: 'powershell.exe', timeout: 30000 }, (err, stdout, stderr) => {
      const decode = (buf) => { try { return buf.toString('utf-8'); } catch { return buf.toString('binary'); } };
      if (err) resolve({ success: false, error: decode(stderr) || err.message, stdout: decode(stdout) });
      else resolve({ success: true, output: decode(stdout), stderr: decode(stderr) });
    });
  });
});

ipcMain.handle('open-software', async (event, softwarePath) => {
  try {
    exec('start "" "' + softwarePath + '"', { shell: 'cmd.exe' });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('take-screenshot', async () => {
  try {
    const screenshotPath = path.join(app.getPath('userData'), 'screenshot-' + Date.now() + '.png');
    const psCmd = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height); $g = [System.Drawing.Graphics]::FromImage($bitmap); $g.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size); $bitmap.Save('${screenshotPath}');`;
    execSync('powershell -Command "' + psCmd + '"');
    return { success: true, path: screenshotPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('open-url', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ===== 启动本地 HTTP 服务器（用于浏览器语音识别）=====
function startVoiceHttpServer() {
  if (voiceHttpServer) return;
  
  voiceHttpServer = http.createServer((req, res) => {
    // CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    const url = req.url.split('?')[0];
    
    // 语音识别页面
    if (url === '/' || url === '/voice') {
      const htmlPath = path.join(__dirname, 'voice-browser.html');
      if (fs.existsSync(htmlPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(htmlPath, 'utf-8'));
      } else {
        res.writeHead(404);
        res.end('voice-browser.html not found');
      }
      return;
    }
    
    // 接收识别结果
    if (url === '/voice-result' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          // 通过 IPC 发送给渲染进程
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('voice-result-from-browser', data);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
    
    // 检查连接状态
    if (url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ pong: true, time: Date.now() }));
      return;
    }

    // ===== /ai-proxy - 调用 AI 生成会议纪要（使用 meeting-assistant 的配置）=====
    if (url === '/ai-proxy' && req.method === 'POST') {
      const chunks = [];
      req.on('data', chunk => { chunks.push(chunk); });
      req.on('end', async () => {
        const sendJSON = (obj, status) => {
          const buf = Buffer.from(JSON.stringify(obj), 'utf-8');
          res.writeHead(status || 200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': buf.length
          });
          res.end(buf);
        };
        try {
          const bodyStr = Buffer.concat(chunks).toString('utf-8');
          const data = JSON.parse(bodyStr);
          const { userMessage, maxTokens } = data;
          // 读取 meeting-assistant 配置，fallback 到全局
          const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'));
          const agents = safeLoadAgents();
          const ma = agents.find(a => a.id === 'meeting-assistant');
          const apiKey = (ma && ma.apiKey) || config.model.apiKey || '';
          const baseUrl = ((ma && ma.baseUrl) || config.model.baseUrl || '').replace(/\/$/, '');
          const model = (ma && ma.model) || config.model.model || 'gpt-4o';
          const systemPrompt = (ma && ma.systemPrompt) || '你是专业的会议纪要助手，请生成结构化中文会议纪要。';
          if (!apiKey || !baseUrl) {
            sendJSON({ success: false, error: '未配置 API Key 或 Base URL，请先在灵动AI设置页面配置模型' });
            return;
          }
          const urls = buildChatUrls(baseUrl);
          const payload = {
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage }
            ],
            max_tokens: maxTokens || 3000,
            temperature: 0.7
          };
          let lastError = '';
          for (const apiUrl of urls) {
            try {
              const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json; charset=utf-8',
                  'Authorization': 'Bearer ' + apiKey
                },
                body: JSON.stringify(payload)
              });
              const arrayBuf = await response.arrayBuffer();
              const text = new TextDecoder('utf-8').decode(arrayBuf);
              if (text.trim().startsWith('<')) { lastError = 'HTML响应（端点不存在）'; continue; }
              const json = JSON.parse(text);
              const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
              if (content) {
                sendJSON({ success: true, text: content });
                return;
              }
              lastError = (json.error && (json.error.message || JSON.stringify(json.error))) || 'AI未返回内容';
            } catch (e) { lastError = e.message; continue; }
          }
          sendJSON({ success: false, error: lastError || 'AI请求失败，请检查API配置' });
        } catch (e) {
          sendJSON({ success: false, error: e.message }, 400);
        }
      });
      return;
    }

    // ===== /voice-save - 保存会议纪要到文件 =====
    if (url === '/voice-save' && req.method === 'POST') {
      const chunks2 = [];
      req.on('data', chunk => { chunks2.push(chunk); });
      req.on('end', () => {
        const sendJ = (obj) => {
          const buf = Buffer.from(JSON.stringify(obj), 'utf-8');
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': buf.length });
          res.end(buf);
        };
        try {
          const { filename, content } = JSON.parse(Buffer.concat(chunks2).toString('utf-8'));
          // 保存目录优先级：会议纪要 Agent 的知识库路径 → Agent.notesDir → 全局 config.notesDir → 默认目录
          // 这样导出的 Word 纪要会落在该 Agent 知识库调用的同一目录，刷新文件列表/检索都能找到
          const notesDir2 = (() => {
            try {
              const agents = safeLoadAgents();
              const ma = agents.find(a => a.id === 'meeting-assistant');
              if (ma && ma.knowledgeBasePath && String(ma.knowledgeBasePath).trim()) return ma.knowledgeBasePath;
              if (ma && ma.notesDir && String(ma.notesDir).trim()) return ma.notesDir;
            } catch (e) { console.error('[getNotesDir] 查找会议纪要目录失败:', e.message); }
            try { const cfg = JSON.parse(fs.readFileSync(getConfigPath(),'utf-8')); return cfg.notesDir || getMeetingNotesDir(); } catch(e){ return getMeetingNotesDir(); }
          })();
          if (!fs.existsSync(notesDir2)) fs.mkdirSync(notesDir2, { recursive: true });
          const baseName = (filename || '会议纪要').replace(/\.(md|docx)$/i, '');

          // 文档模式：把 Markdown 转成带格式的 Word 文档（.docx），而非保存原始 Markdown
          const lines = String(content || '').split('\n');
          const paragraphs = lines.map(line => {
            let t = line.trim();
            if (!t) return new Paragraph({ text: '' });
            if (t.startsWith('### ')) return new Paragraph({ text: t.slice(4), heading: HeadingLevel.HEADING_3 });
            if (t.startsWith('## '))  return new Paragraph({ text: t.slice(3), heading: HeadingLevel.HEADING_2 });
            if (t.startsWith('# '))   return new Paragraph({ text: t.slice(2), heading: HeadingLevel.HEADING_1 });
            if (t.startsWith('- ') || t.startsWith('* ')) return new Paragraph({ text: t.slice(2).replace(/\*\*(.+?)\*\*/g,'$1'), bullet: { level: 0 } });
            // 去掉行内 Markdown 粗体标记，输出纯文档文本
            t = t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1');
            return new Paragraph({ text: t });
          });
          const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });

          Packer.toBuffer(doc).then(buffer => {
            const docxPath = path.join(notesDir2, baseName + '.docx');
            fs.writeFileSync(docxPath, buffer);
            sendJ({ success: true, path: docxPath });
          }).catch(err => {
            sendJ({ success: false, error: 'Word生成失败: ' + err.message });
          });
        } catch (e) {
          sendJ({ success: false, error: e.message });
        }
      });
      return;
    }

    
    res.writeHead(404);
    res.end('Not Found');
  });
  
  voiceHttpServer.listen(voiceServerPort, '127.0.0.1', () => {
    console.log('[Voice Server] 语音识别服务器已启动: http://127.0.0.1:' + voiceServerPort);
  });
  
  voiceHttpServer.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error('[Voice Server] ERROR: port 18765 is already in use. Please close the other process.');
      const { dialog } = require('electron');
      dialog.showErrorBox('端口冲火', '端口 18765 已被占用！\n\n请关闭占用该端口的程序（通常是灵动AI安装版），再重新启动。');
    }
  });
}

// 打开浏览器语音识别页面
let voiceWindow = null;
ipcMain.handle('open-voice-recorder', async () => {
  try {
    // 确保 HTTP 服务器已启动
    startVoiceHttpServer();

    // 在系统默认浏览器中打开（需要 Web Speech API + 麦克风权限）
    const voiceUrl = `http://127.0.0.1:${voiceServerPort}/voice`;
    await shell.openExternal(voiceUrl);

    return { success: true, url: voiceUrl };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('transcribe-audio', async (event, audioData) => {
  return { success: false, error: '本地语音转写需要配置 Whisper.cpp，请在设置中配置' };
});

ipcMain.handle('fetch-url', async (event, url) => {
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buf);
    return { success: true, content: text.slice(0, 10000) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ===================================================================
// API 调用核心
// ===================================================================

function parseApiResponse(text) {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) return JSON.parse(t);
  if (t.includes('data: ')) {
    let content = '';
    let lastChunk = null;
    for (const line of t.split('\n')) {
      const l = line.trim();
      if (l === 'data: [DONE]') continue;
      if (l.startsWith('data: ')) {
        try {
          const chunk = JSON.parse(l.slice(6));
          if (chunk.choices?.[0]?.message) return chunk;
          content += chunk.choices?.[0]?.delta?.content || '';
          lastChunk = chunk;
        } catch (e) { console.error('[fetch_url] 解析流式响应失败:', e.message); }
      }
    }
    if (lastChunk) {
      return {
        ...lastChunk,
        choices: [{ ...lastChunk.choices?.[0], message: { role: 'assistant', content }, finish_reason: 'stop' }]
      };
    }
  }
  throw new Error('无法解析响应: ' + t.slice(0, 200));
}

/**
 * 从 AI 文本回复中解析文本模式的工具调用
 * 用于不支持 OpenAI Function Calling 的模型部署
 * @param {string} content - AI 回复文本
 * @returns {{tool:string, args:Object}|null}
 */
function parseTextModeToolCall(content) {
  if (!content || typeof content !== 'string') return null;

  // 策略1: 匹配 ```json 代码块
  const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    try {
      const json = JSON.parse(jsonBlockMatch[1].trim());
      if (json.tool && typeof json.tool === 'string') {
        return { tool: json.tool, args: json.args || {} };
      }
      if (json.action && typeof json.action === 'string') {
        return { tool: json.action, args: json.parameters || json.params || json.arguments || {} };
      }
      if (json.function && typeof json.function === 'string') {
        return { tool: json.function, args: json.arguments || json.args || {} };
      }
      if (json.name && typeof json.name === 'string') {
        return { tool: json.name, args: json.arguments || json.args || json.parameters || {} };
      }
    } catch (e) { console.error('[parseToolCall] 策略1 JSON 解析失败:', e.message); }
  }

  // 策略2: 匹配行内 JSON（整个回复或最后一行是一个 JSON 对象）
  const trimmed = content.trim();
  const lines = trimmed.split('\n');
  // 从最后一行往上找 JSON
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
    const line = lines[i].trim();
    if (line.startsWith('{')) {
      try {
        const json = JSON.parse(line);
        if (json.tool && typeof json.tool === 'string') {
          return { tool: json.tool, args: json.args || {} };
        }
        if (json.action && typeof json.action === 'string') {
          return { tool: json.action, args: json.parameters || json.params || {} };
        }
      } catch (e) { console.error('[parseToolCall] 策略2 JSON 解析失败:', e.message); }
    }
  }

  // 策略3: 匹配代码块尝试匹配内容中任意位置的 JSON 对象（包含 tool/action/function 字段）
  const jsonMatches = content.match(/\{[\s\S]*?(?:"tool"|"action"|"function"|"name")\s*:\s*"([^"]+)"[\s\S]*?\}/g);
  if (jsonMatches) {
    for (const match of jsonMatches.reverse()) {
      try {
        const json = JSON.parse(match);
        if (json.tool && typeof json.tool === 'string') {
          return { tool: json.tool, args: json.args || {} };
        }
        if (json.action && typeof json.action === 'string') {
          return { tool: json.action, args: json.parameters || json.params || {} };
        }
        if (json.function && typeof json.function === 'string') {
          return { tool: json.function, args: json.arguments || json.args || {} };
        }
        if (json.name && typeof json.name === 'string') {
          return { tool: json.name, args: json.arguments || json.args || {} };
        }
      } catch (e) { console.error('[parseToolCall] 策略3 JSON 解析失败:', e.message); }
    }
  }

  // 策略4: [v1.1.2] 解析 <tool_call>xxx(arg: val, ...)</tool_call> XML 风格伪调用
  // 国产模型（GLM/Qwen/DeepSeek）的 chat template 习惯性输出此格式
  // 用 new RegExp 而非字面量，规避某些 Node 版本对包含 "tool_call" 的字面量的解析问题
  const xmlToolCallPattern = new RegExp('<tool_call>\\s*([\\s\\S]*?)\\s*</tool_call>');
  const xmlToolCallMatch = content.match(xmlToolCallPattern);
  if (xmlToolCallMatch) {
    const inner = xmlToolCallMatch[1].trim();
    const cleanInner = inner.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (cleanInner) {
      // 解析 "工具名(arg1: val1, arg2: val2)" 格式
      const funcCallMatch = cleanInner.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([\s\S]*)\)\s*$/);
      if (funcCallMatch) {
        const toolName = funcCallMatch[1];
        const argsStr = funcCallMatch[2];
        const args = {};
        // 用平衡括号+引号处理嵌套值
        let inStr = false, strCh = '', buf = '', depth = 0;
        const tokens = [];
        for (let i = 0; i < argsStr.length; i++) {
          const c = argsStr[i];
          if (inStr) {
            if (c === '\\' && argsStr[i + 1]) { buf += c + argsStr[i + 1]; i++; continue; }
            if (c === strCh) { inStr = false; buf += c; continue; }
            buf += c;
          } else {
            if (c === '"' || c === "'") { inStr = true; strCh = c; buf += c; continue; }
            if (c === '(' || c === '[' || c === '{') depth++;
            if (c === ')' || c === ']' || c === '}') depth--;
            if (c === ',' && depth === 0) { tokens.push(buf.trim()); buf = ''; continue; }
            buf += c;
          }
        }
        if (buf.trim()) tokens.push(buf.trim());
        for (const tok of tokens) {
          const kvMatch = tok.match(/^\s*["']?(\w+)["']?\s*:\s*([\s\S]+?)\s*$/);
          if (kvMatch) {
            let val = kvMatch[2].trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            args[kvMatch[1]] = val;
          }
        }
        if (toolName) {
          console.log(`[parseTextModeToolCall] 解析到 <tool_call>${toolName}</tool_call> 格式`);
          return { tool: toolName, args };
        }
      }
    }
  }

  // 策略5: [v1.1.4] 匹配非标准 <tool_call("name"(args)) 格式（不完整 XML）
  // 国产模型有时输出 <tool_call("execute_command"(command: '...'))
  const tcOpenRe = new RegExp('<tool_call\\s*\\(\\s*"([a-zA-Z_][a-zA-Z0-9_]*)"\\s*\\(([\\s\\S]*?)\\)\\s*\\)', 'i');
  const tcOpenMatch = content.match(tcOpenRe);
  if (tcOpenMatch) {
    const toolName = tcOpenMatch[1];
    const argsStr = tcOpenMatch[2];
    const args = {};
    // 简单 key: value 解析
    const kvRe = /(\w+)\s*:\s*(['"])((?:\\.|(?!\2).)*?)\2/g;
    let m;
    while ((m = kvRe.exec(argsStr)) !== null) {
      args[m[1]] = m[3];
    }
    if (toolName) {
      console.log('[parseTextModeToolCall] 解析到非标准格式:', toolName, args);
      return { tool: toolName, args };
    }
  }

  // 策略6: [v1.1.4] 匹配 <tool call="name" ...> 属性格式
  const tcAttrRe = new RegExp('<tool\\s+call\\s*=\\s*"([^"]+)"', 'i');
  const tcAttrMatch = content.match(tcAttrRe);
  if (tcAttrMatch) {
    const toolName = tcAttrMatch[1];
    // 尝试提取参数（属性格式或后面的 JSON）
    const args = {};
    const attrArgsRe = new RegExp('<tool\\s+call\\s*=\\s*"[^"]*"[^>]*>([\\s\\S]*?)(?=<|$)', 'i');
    const attrContent = content.match(attrArgsRe);
    if (attrContent) {
      // 尝试 JSON 解析
      try {
        const jsonPart = attrContent[1].match(/\{[\s\S]*\}/);
        if (jsonPart) Object.assign(args, JSON.parse(jsonPart[0]));
      } catch(e) { console.error('[parseTextModeToolCall] 属性格式解析失败:', e.message); }
    }
    console.log('[parseTextModeToolCall] 解析到属性格式:', toolName, args);
    return { tool: toolName, args };
  }

  return null;
}

function buildChatUrls(cleanBaseUrl) {
  const baseEndsWithV1 = /\/v1\/?$/.test(cleanBaseUrl);
  return baseEndsWithV1
    ? [cleanBaseUrl + '/chat/completions']
    : [cleanBaseUrl + '/v1/chat/completions', cleanBaseUrl + '/chat/completions'];
}

// ===== 全量工具定义（Function Calling Schema）=====
const ALL_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'file_read',
      description: '读取本地文件内容',
      parameters: { type: 'object', properties: { path: { type: 'string', description: '文件绝对路径' } }, required: ['path'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'file_write',
      description: '写入内容到本地文件（不存在则创建）',
      parameters: { type: 'object', properties: { path: { type: 'string', description: '文件绝对路径' }, content: { type: 'string', description: '要写入的内容' } }, required: ['path', 'content'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'file_list',
      description: '列出指定目录下的文件和文件夹',
      parameters: { type: 'object', properties: { path: { type: 'string', description: '目录绝对路径' } }, required: ['path'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'file_delete',
      description: '删除本地文件或文件夹（支持递归删除整个文件夹）。当用户要求删除任何文件或文件夹时，必须调用此工具。不要说"不能删除"或"没有删除权限"，直接调用此工具执行删除，系统会自动处理安全确认。',
      parameters: { type: 'object', properties: { path: { type: 'string', description: '要删除的文件或文件夹绝对路径' } }, required: ['path'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_folder',
      description: '创建本地文件夹（支持多级）',
      parameters: { type: 'object', properties: { path: { type: 'string', description: '文件夹绝对路径' } }, required: ['path'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_command',
      description: '在 Windows PowerShell 中执行系统命令。⚠️ 当前系统是 Windows，shell 是 PowerShell，不是 Linux/Mac。禁止使用 Linux 命令（如 curl、wget、openssl、dig、nslookup 之外的 *nix 工具、grep、cat、ls、ifconfig 等）。请使用 PowerShell 原生命令：查网页用 Invoke-WebRequest/Invoke-RestMethod；查 DNS/网站归属用 Resolve-DnsName；读文件用 Get-Content；列目录用 Get-ChildItem；查找文本用 Select-String。命令用分号(;)连接，不要用 &&。',
      parameters: { type: 'object', properties: { command: { type: 'string', description: 'PowerShell 命令（必须是 Windows PowerShell 语法，不能是 Linux/bash 命令）' } }, required: ['command'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_software',
      description: '打开本地软件或文件',
      parameters: { type: 'object', properties: { path: { type: 'string', description: '软件或文件路径' } }, required: ['path'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'take_screenshot',
      description: '截取当前屏幕截图，返回截图保存路径',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_url',
      description: '在默认浏览器中打开指定URL',
      parameters: { type: 'object', properties: { url: { type: 'string', description: '要打开的网页URL' } }, required: ['url'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_agent',
      description: '创建新的AI Agent，自动生成独立配置文件和存储目录',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Agent名称' },
          description: { type: 'string', description: 'Agent功能描述' },
          systemPrompt: { type: 'string', description: 'Agent的系统提示词' },
          knowledgeBasePath: { type: 'string', description: '知识库文件夹路径，如桌面某文件夹。设置后Agent会自动检索该路径文件，路径需与systemPrompt中提到的文件路径一致' },
          tools: { type: 'array', items: { type: 'string' }, description: '允许使用的工具列表' }
        },
        required: ['name', 'description', 'systemPrompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_agents',
      description: '获取所有已创建的Agent列表，返回每个Agent的ID、名称、描述、可用工具和系统提示词。在跨Agent协同任务中，必须先调用此工具了解可用的Agent及其能力',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'call_agent',
      description: '【关键】调用指定的专业Agent执行子任务。当用户提到"调用XX助手/XX Agent/邮件/项目管理/数据分析/让XX帮我"等需要其他Agent能力的任务时，**必须使用此工具**（配合 list_agents）。使用步骤：1)先调 list_agents 获取Agent列表 2)再调本工具委派任务。支持链式调度：先用Agent-A处理数据，再将输出作为context传给Agent-B。⚠️ 不要用 search_knowledge_base 或 file_read 绕路——当用户明确要求调用Agent时，直接用 call_agent！',
      parameters: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: '要调用的Agent ID（从 list_agents 返回的 agents 数组中获取，如 "project-manager"、"email-automation"）。必须是已存在的Agent' },
          task: { type: 'string', description: '要委派给该Agent执行的具体任务描述。说明清楚目标、要求和预期输出格式。如果任务涉及前一个Agent的结果，在此明确说明' },
          context: { type: 'string', description: '可选：链式调用时的上下文信息。前一个Agent的输出结果可以放在这里，供当前Agent参考使用。如"上一步汇总的数据：{...}"' }
        },
        required: ['agentId', 'task']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_meeting_notes',
      description: '搜索本地历史会议纪要文件（支持md/txt/docx）',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          limit: { type: 'number', description: '返回结果数量，默认5' },
          agentId: { type: 'string', description: '指定Agent ID，会自动使用该Agent的knowledgeBasePath作为搜索范围' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description: '在指定路径下搜索知识库文件内容，支持md/txt/docx格式，适合Agent调用自己的知识库',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          path: { type: 'string', description: '知识库文件夹绝对路径' },
          fileTypes: { type: 'array', items: { type: 'string' }, description: '要搜索的文件类型，如 [".md", ".txt", ".docx"]，默认全部支持类型' },
          limit: { type: 'number', description: '返回结果数量，默认5' }
        },
        required: ['query', 'path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'save_meeting_note',
      description: '保存会议纪要到本地（按年/月/日自动归档）',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: '文件名（不含扩展名）' },
          content: { type: 'string', description: '会议纪要Markdown内容' }
        },
        required: ['filename', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_meeting_notes',
      description: '列出所有会议纪要文件',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: '获取当前系统时间和日期',
      parameters: { type: 'object', properties: {} }
    }
  }  ,
  {
    type: 'function',
    function: {
      name: 'get_agent',
      description: '获取指定 Agent 的完整配置（含 systemPrompt、tools、model 等）',
      parameters: { type: 'object', properties: { id: { type: 'string', description: 'Agent ID' } }, required: ['id'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_agent',
      description: '修改已有 Agent 的任意字段（systemPrompt、tools、name、description 等），真正的代码级 Agent 开发',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Agent ID' },
          updates: {
            type: 'object',
            description: '要更新的字段，支持：name、description、systemPrompt、tools(数组)、model、apiKey、baseUrl、temperature',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              systemPrompt: { type: 'string' },
              tools: { type: 'array', items: { type: 'string' } },
              model: { type: 'string' },
              apiKey: { type: 'string' },
              baseUrl: { type: 'string' },
              temperature: { type: 'number' }
            }
          }
        },
        required: ['id', 'updates']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_available_tools',
      description: '列出系统所有可用工具名称（用于给 Agent 配置 tools 字段时参考）',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_agent_file',
      description: '读取指定 Agent 的独立配置 JSON 文件原始内容',
      parameters: { type: 'object', properties: { id: { type: 'string', description: 'Agent ID' } }, required: ['id'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_agent_file',
      description: '直接覆盖写入 Agent 的独立配置 JSON 文件，实现最底层的 Agent 开发能力',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Agent ID' },
          config: { type: 'object', description: 'Agent 完整配置对象（JSON）' }
        },
        required: ['id', 'config']
      }
    }
  }
  ,
  {
    type: 'function',
    function: {
      name: 'read_source_file',
      description: '读取灵动AI项目中的任意源码文件（main.js/renderer.js/preload.js/index.html等），用于代码分析和开发',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: '文件名，如 main.js、renderer.js、index.html、preload.js，或相对路径' }
        },
        required: ['filename']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_source_file',
      description: '写入或修改灵动AI项目源码文件（main.js/renderer.js等），实现对应用自身的代码级开发',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: '文件名，如 main.js、renderer.js' },
          content: { type: 'string', description: '要写入的完整文件内容' }
        },
        required: ['filename', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'patch_source_file',
      description: '精确替换源码文件中的特定代码段（比整体写入更安全），用于小范围修改',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: '文件名' },
          oldCode: { type: 'string', description: '要被替换的原始代码（必须在文件中唯一存在）' },
          newCode: { type: 'string', description: '替换后的新代码' }
        },
        required: ['filename', 'oldCode', 'newCode']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_project_files',
      description: '列出灵动AI项目的文件结构，了解有哪些源码文件可以修改',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_syntax',
      description: '对修改后的JS文件进行语法检查，确保代码没有语法错误',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: '要检查的JS文件名' }
        },
        required: ['filename']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_node_check',
      description: '对指定JS文件执行Node.js语法检查，返回语法错误或通过信息',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: '要检查的JS文件绝对路径' }
        },
        required: ['file_path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'restart_app',
      description: '重启灵动AI应用，使源码修改生效（会关闭并重新打开应用）',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: '搜索互联网信息，获取实时新闻、知识、数据。当用户询问最新信息、时事新闻、不确定的事实时应优先使用此工具',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          limit: { type: 'number', description: '返回结果数量，默认5条' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: '抓取指定网页的内容并转为 Markdown 格式。当需要详细阅读某个网页内容时使用',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要抓取的网页 URL' },
          maxLength: { type: 'number', description: '最大字符数，默认8000' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'win_find_window',
      description: '通过窗口标题关键字查找当前打开的窗口，返回窗口列表（含进程名、PID、标题、窗口句柄）',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '窗口标题关键字，支持通配符（如 *记事本*）' }
        },
        required: ['keyword']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'win_activate_window',
      description: '将指定窗口设为前台激活状态。可通过窗口标题或窗口句柄（handle）定位',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '窗口完整或部分标题（与 win_find_window 返回的 title 一致）' },
          handle: { type: 'number', description: '窗口句柄（HWND），从 win_find_window 返回的 handle 字段获取' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'win_send_keys',
      description: '向当前激活的窗口发送键盘输入。支持特殊键：{ENTER}回车 {TAB}制表 {ESC}退出 {BACKSPACE}退格 {DELETE}删除 {HOME} {END} {UP} {DOWN} {LEFT} {RIGHT}。修饰键：^=Ctrl +=Shift %=Alt。例如 ^{a} 表示Ctrl+A，+{HOME} 表示Shift+Home',
      parameters: {
        type: 'object',
        properties: {
          keys: { type: 'string', description: '要发送的按键文本' },
          delay: { type: 'number', description: '每个按键间隔毫秒，默认50' }
        },
        required: ['keys']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'win_click',
      description: '在屏幕指定坐标模拟鼠标左键点击。坐标是相对于整个屏幕的像素位置',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: '屏幕X坐标（像素）' },
          y: { type: 'number', description: '屏幕Y坐标（像素）' }
        },
        required: ['x', 'y']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_ahk_script',
      description: '执行任意 AutoHotkey v2 代码块，实现精准 Windows UI 自动化。可完成自动填表、批量点击、窗口操控、键盘模拟等复杂操作。AutoHotkey 需用户自行安装（https://www.autohotkey.com/）',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: '完整的 AutoHotkey v2 代码块' },
          timeout: { type: 'number', description: '超时毫秒，默认30000' }
        },
        required: ['code']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ahk_find_window',
      description: '通过窗口标题、类名或进程名查找窗口，返回窗口句柄、位置、大小等信息。比 win_find_window 更精准',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '窗口标题（支持部分匹配）' },
          className: { type: 'string', description: '窗口类名（如 Notepad）' },
          exe: { type: 'string', description: '进程名（如 notepad.exe）' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ahk_send_input',
      description: '向指定窗口发送文本输入或按键。支持 ControlSend 精准发送到控件，不受其他窗口干扰。可用于自动填表',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '要输入的文本' },
          keys: { type: 'string', description: '按键序列（如 {Enter}、^a=Ctrl+A）' },
          windowTitle: { type: 'string', description: '目标窗口标题' },
          controlName: { type: 'string', description: '目标控件名（如 Edit1）' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ahk_click_control',
      description: '点击窗口内的指定控件或坐标。支持 ControlClick 精准点击控件，不受窗口位置变化影响',
      parameters: {
        type: 'object',
        properties: {
          windowTitle: { type: 'string', description: '目标窗口标题' },
          controlName: { type: 'string', description: '控件名（如 Button1、OK）' },
          x: { type: 'number', description: '窗口内X坐标（像素）' },
          y: { type: 'number', description: '窗口内Y坐标（像素）' },
          button: { type: 'string', description: '鼠标按钮：Left/Right/Middle，默认Left' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'organize_files',
      description: '智能整理文件夹内的文件。支持按文件类型、修改日期、文件名首字母自动分类到子文件夹',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '要整理的文件夹路径' },
          strategy: { type: 'string', description: '整理策略：type(按类型), date(按日期), name(按首字母)。默认type' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mcp_call',
      description: '调用外部 MCP (Model Context Protocol) 服务器。用于连接第三方工具生态，如数据库、GitHub、邮件等',
      parameters: {
        type: 'object',
        properties: {
          serverUrl: { type: 'string', description: 'MCP 服务器地址，如 http://localhost:3000' },
          toolName: { type: 'string', description: '要调用的 MCP 工具名' },
          toolArgs: { type: 'object', description: '工具参数' },
          apiKey: { type: 'string', description: '可选的 API Key' }
        },
        required: ['serverUrl', 'toolName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_todos',
      description: '获取所有待办事项列表。当用户询问"我的待办"、"还有什么事没做"、"查看任务"时调用此工具。返回已创建的所有待办（含完成和未完成），每条含ID、状态、优先级、日期',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_todo',
      description: '创建新的待办事项。当用户要求"帮我记一下"、"创建待办"、"添加提醒"、"设个任务"时，必须调用此工具而非 file_write。待办会存入桌面宠物的待办面板，不是txt文件',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '待办内容' },
          priority: { type: 'string', description: '优先级：green(低)/orange(中)/red(高)，默认green' },
          due_date: { type: 'string', description: '截止日期，如 2026-06-15' },
          due_time: { type: 'string', description: '截止时间，如 14:30' },
          category: { type: 'string', description: '分类标签，如 工作/生活/学习' },
          note: { type: 'string', description: '备注说明' }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_todo',
      description: '更新指定待办事项。可修改内容、完成状态、优先级等。先调用 list_todos 获取待办ID',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: '待办ID（从 list_todos 获取）' },
          text: { type: 'string', description: '新内容' },
          done: { type: 'boolean', description: '是否完成' },
          priority: { type: 'string', description: '优先级：green/orange/red' },
          due_date: { type: 'string', description: '截止日期' },
          due_time: { type: 'string', description: '截止时间' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_todo',
      description: '删除指定待办事项。先调用 list_todos 获取待办ID',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: '待办ID（从 list_todos 获取）' }
        },
        required: ['id']
      }
    }
  }
];

function getAgentTools(agentToolNames) {
  if (!agentToolNames || agentToolNames.length === 0) return ALL_TOOLS;
  return ALL_TOOLS.filter(t => agentToolNames.includes(t.function.name));
}

// 执行工具调用
async function executeTool(name, args, signal) {
  console.log('[Tool Call]', name, JSON.stringify(args || {}).slice(0, 150));
  switch (name) {
    case 'file_read': {
      try {
        const filePath = args.path;
        const fileExt = require('path').extname(filePath).toLowerCase();
        
        // Excel files: use xlsx library
        if (fileExt === '.xlsx' || fileExt === '.xls') {
          try {
            const XLSX = require('xlsx');
            const workbook = XLSX.readFile(filePath);
            let result = '';
            workbook.SheetNames.forEach(sheetName => {
              const sheet = workbook.Sheets[sheetName];
              const csv = XLSX.utils.sheet_to_csv(sheet);
              result += `=== Sheet: ${sheetName} ===
${csv}

`;
            });
            return { success: true, content: result.slice(0, 8000), type: 'excel' };
          } catch(xlsxErr) {
            return { success: false, error: 'Excel读取失败: ' + xlsxErr.message + '\n提示: 可用execute_command调用PowerShell读取Excel' };
          }
        }
        
        // Word docx files: use mammoth
        if (fileExt === '.docx' || fileExt === '.doc') {
          try {
            const mammoth = require('mammoth');
            const buffer = fs.readFileSync(filePath);
            const result = await mammoth.extractRawText({ arrayBuffer: buffer });
            return { success: true, content: result.value.slice(0, 8000), type: 'docx' };
          } catch(docxErr) {
            return { success: false, error: 'Word文档读取失败: ' + docxErr.message };
          }
        }
        
        // PDF files
        if (fileExt === '.pdf') {
          try {
            const { parsePdf } = require('./libs/pdf-parse-lib');
            const buffer = fs.readFileSync(filePath);
            const pdfData = await parsePdf(buffer, { maxPages: 10 });
            return { success: true, content: pdfData.text.slice(0, 8000), type: 'pdf' };
          } catch(pdfErr) {
            return { success: false, error: 'PDF读取失败: ' + pdfErr.message };
          }
        }
        
        // Default: read as text
        const content = fs.readFileSync(filePath, 'utf-8');
        return { success: true, content: content.slice(0, 8000) };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'file_write': {
      try {
        const dir = path.dirname(args.path);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        // 检查是否为 docx 文件
        const ext = path.extname(args.path).toLowerCase();
        if (ext === '.docx') {
          // 使用 docx-generator 生成真正的 Word 文档
          const { generateDocxFromMarkdown } = require('./docx-generator');
          await generateDocxFromMarkdown(args.content, args.path);
          return { success: true, message: 'Word 文档已生成：' + args.path };
        } else {
          fs.writeFileSync(args.path, args.content, 'utf-8');
          return { success: true, message: '文件已写入：' + args.path };
        }
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'file_list': {
      try {
        const items = fs.readdirSync(args.path).map(name => {
          const fullPath = path.join(args.path, name);
          const stat = fs.statSync(fullPath);
          return { name, isDirectory: stat.isDirectory(), size: stat.size };
        });
        return { success: true, items };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'file_delete': {
      try {
        // 安全审计
        const audit = auditFileOperation('delete', args.path);
        // ===== 所有删除操作都必须用户确认（无论安全级别）=====
        // 删除是不可逆操作，必须让用户明确知晓
        const riskLevel = (audit.level === 'safe') ? 'medium' : audit.level;
        const confirmReason = audit.reason || ('即将删除：' + args.path + (fs.statSync(args.path).isDirectory() ? '（文件夹，将递归删除其中所有内容）' : ''));
        const confirmed = await confirmDangerousInline('文件删除', {
          path: args.path,
          reason: confirmReason,
          riskLevel: riskLevel
        });
        if (!confirmed) {
            return { success: false, error: '\u64CD\u4F55\u5DF2\u53D6\u6D88\uFF1A\u7528\u6237\u62D2\u7EDD\u4E86\u5220\u9664\u8BF7\u6C42', _cancelled: true };
        }
        // 验证路径存在
        if (!fs.existsSync(args.path)) {
          return { success: false, error: '\u6587\u4EF6\u6216\u6587\u4EF6\u5939\u4E0D\u5B58\u5728\uFF1A' + args.path + '\n\n\u8BF7\u5148\u7528 file_list \u786E\u8BA4\u8DEF\u5F84\u3002' };
        }
        const stat = fs.statSync(args.path);
        if (stat.isDirectory()) {
          // 递归删除文件夹
          fs.rmSync(args.path, { recursive: true, force: true });
          return { success: true, message: '\u6587\u4EF6\u5939\u5DF2\u5220\u9664\uFF1A' + args.path };
        } else {
          fs.unlinkSync(args.path);
          return { success: true, message: '\u6587\u4EF6\u5DF2\u5220\u9664\uFF1A' + args.path };
        }
      }
      catch (e) { return { success: false, error: '\u5220\u9664\u5931\u8D25\uFF1A' + e.message }; }
    }
    case 'create_folder': {
      try { fs.mkdirSync(args.path, { recursive: true }); return { success: true, message: '文件夹已创建: ' + args.path }; }
      catch (e) { return { success: false, error: e.message }; }
    }
    case 'execute_command': {
      // 已中断则直接返回
      if (signal && signal.aborted) return { success: false, error: '\u26A0\uFE0F \u5DF2\u505C\u6B62\uFF1A\u7528\u6237\u624B\u52A8\u7EC8\u6B62\u4E86\u4EFB\u52A1' };

      // 安全审计
      const audit = auditCommand(args.command);
      if (audit.action === 'block') {
        return { success: false, error: '\u26A0\uFE0F \u5B89\u5168\u62E6\u622A\uFF1A' + audit.reason + '\n\u547D\u4EE4\uFF1A' + args.command };
      }
      if (audit.action === 'confirm') {
        // 使用内嵌确认对话框（在聊天界面显示按钮）
        const confirmed = await confirmDangerousInline('命令执行', {
          command: args.command,
          reason: audit.reason,
          riskLevel: audit.level
        });
        if (!confirmed) {
          return { success: false, error: '\u64CD\u4F55\u5DF2\u53D6\u6D88\uFF1A\u7528\u6237\u62D2\u7EDD\u4E86\u547D\u4EE4\u6267\u884C', _cancelled: true };
        }
      }

      return new Promise((resolve) => {
        // 强制 PowerShell 以 UTF-8 输出，避免中文乱码
        const wrapped = '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; ' + args.command;
        const child = exec(wrapped, { encoding: 'buffer', shell: 'powershell.exe', timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
          if (err && err.killed) resolve({ success: false, error: '⛔ 命令已被停止按钮中断（或执行超时）' });
          else if (err) {
            const msg = decodeCmdOutput(stderr) || err.message || '命令执行失败';
            resolve({ success: false, error: friendlyCmdError(args.command, msg) });
          }
          else resolve({ success: true, output: decodeCmdOutput(stdout).slice(0, 3000), exitCode: 0 });
        });
        if (signal) {
          signal.addEventListener('abort', () => {
            try { child.kill('SIGKILL'); } catch(e) { console.error('[run_ahk_script] 终止子进程失败:', e.message); }
            resolve({ success: false, error: '⛔ 已停止：用户手动终止了任务' });
          }, { once: true });
        }
      });
    }
    case 'open_software': {
      try { exec('start "" "' + args.path + '"', { shell: 'cmd.exe' }); return { success: true, message: '已打开: ' + args.path }; }
      catch (e) { return { success: false, error: e.message }; }
    }
    case 'take_screenshot': {
      try {
        const screenshotPath = path.join(app.getPath('userData'), 'screenshot-' + Date.now() + '.png');
        const psCmd = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height); $g = [System.Drawing.Graphics]::FromImage($bitmap); $g.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size); $bitmap.Save('${screenshotPath}');`;
        execSync('powershell -Command "' + psCmd + '"');
        return { success: true, path: screenshotPath, message: '截图已保存: ' + screenshotPath };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'open_url': {
      try { await shell.openExternal(args.url); return { success: true, message: '已在浏览器打开: ' + args.url }; }
      catch (e) { return { success: false, error: e.message }; }
    }
    case 'create_agent': {
      try {
        // 参数名称规范化（兼容 LLM 可能传入的 snake_case 和 camelCase）
        const name = args.name || '';
        const description = args.description || args.desc || '';
        const systemPrompt = args.systemPrompt || args.system_prompt || args.systemPrompts || '';
        const tools = args.tools || args.tool_list || ['file_read', 'file_write', 'file_list', 'file_delete', 'create_folder', 'execute_command', 'open_software', 'take_screenshot', 'create_agent', 'list_agents', 'search_meeting_notes', 'search_knowledge_base', 'get_current_time', 'open_url', 'search_web', 'fetch_url', 'win_find_window', 'win_activate_window', 'win_send_keys', 'win_click', 'run_ahk_script', 'ahk_find_window', 'ahk_send_input', 'ahk_click_control'];
        const model = args.model || '';
        const apiKey = args.apiKey || args.api_key || '';
        const baseUrl = args.baseUrl || args.base_url || '';
        const temperature = args.temperature !== undefined ? args.temperature : 0.7;
        const knowledgeBasePath = args.knowledgeBasePath || args.knowledge_base_path || '';

        // 参数校验：防止创建空白 Agent
        if (!name || name.trim() === '') {
          return { success: false, error: '创建 Agent 失败：name（名称）不能为空' };
        }
        if (!description || description.trim() === '') {
          return { success: false, error: '创建 Agent 失败：description（描述）不能为空' };
        }
        if (!systemPrompt || systemPrompt.trim() === '') {
          return { success: false, error: '创建 Agent 失败：systemPrompt（系统提示词）不能为空' };
        }

        const agents = safeLoadAgents();
        const id = 'agent-' + Date.now();
        const dataDir = path.join(app.getPath('userData'), 'agents', id);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        const newAgent = {
          id,
          name: name.trim(),
          description: description.trim(),
          systemPrompt: systemPrompt.trim(),
          model,
          apiKey,
          baseUrl,
          temperature,
          tools: Array.isArray(tools) ? tools : ['file_read', 'file_write', 'file_list', 'file_delete', 'create_folder', 'execute_command', 'open_software', 'take_screenshot', 'create_agent', 'list_agents', 'search_meeting_notes', 'search_knowledge_base', 'get_current_time', 'open_url', 'search_web', 'fetch_url', 'win_find_window', 'win_activate_window', 'win_send_keys', 'win_click', 'run_ahk_script', 'ahk_find_window', 'ahk_send_input', 'ahk_click_control'],
          dataDir,
          knowledgeBasePath,
          createdAt: new Date().toISOString()
        };
        fs.writeFileSync(path.join(getAgentConfigsDir(), id + '.json'), JSON.stringify(newAgent, null, 2));
        agents.push(newAgent);
        fs.writeFileSync(getAgentsPath(), JSON.stringify(agents, null, 2));
        return { success: true, agent: newAgent, message: `Agent "${name}" 已创建，ID: ${id}，配置已保存` };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'list_agents': {
      try {
        const agents = safeLoadAgents();
        return { success: true, agents: agents.map(a => ({ 
          id: a.id, name: a.name, description: a.description,
          tools: a.tools || [],
          systemPrompt: ((a.systemPrompt || a.prompt || '').substring(0, 600))  // 让AI了解Agent的能力范围
        })) };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'search_meeting_notes': {
      try {
        // 优先使用 Agent 的 knowledgeBasePath
        let searchDir_root = null;
        if (args.agentId) {
          try {
            const agents = safeLoadAgents();
            const agent = agents.find(a => a.id === args.agentId);
            if (agent && agent.knowledgeBasePath && fs.existsSync(agent.knowledgeBasePath)) {
              searchDir_root = agent.knowledgeBasePath;
            }
          } catch (e) { console.error('[search_knowledge_base] 查找Agent知识库路径失败:', e.message); }
        }
        if (!searchDir_root) {
          // 未指定 agentId 时，默认用会议纪要 Agent 的知识库路径（与保存目录保持一致）
          try {
            const agents = safeLoadAgents();
            const ma = agents.find(a => a.id === 'meeting-assistant');
            if (ma && ma.knowledgeBasePath && fs.existsSync(ma.knowledgeBasePath)) searchDir_root = ma.knowledgeBasePath;
            else if (ma && ma.notesDir && fs.existsSync(ma.notesDir)) searchDir_root = ma.notesDir;
          } catch (e) { console.error('[search_knowledge_base] 查找会议助理目录失败:', e.message); }
        }
        if (!searchDir_root) searchDir_root = getCurrentNotesDir();
        if (!fs.existsSync(searchDir_root)) {
          return { success: true, results: [], message: '知识库目录不存在，请确认路径是否正确: ' + searchDir_root };
        }
        const results = [];
        const q = (args.query || '').toLowerCase();
        const supportedExts = ['.md', '.txt', '.docx'];
        function extractFileText(fullPath, ext) {
          try {
            if (ext === '.docx') {
              // docx: 读取 Buffer，提取可读 ASCII/中文字符
              const buf = fs.readFileSync(fullPath);
              const str = buf.toString('utf-8');
              // 提取连续可读字符（中文 + 英文 + 标点）
              const readable = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ');
              return readable;
            } else {
              return fs.readFileSync(fullPath, 'utf-8');
            }
          } catch (e) { return ''; }
        }
        function searchDirectory(dir) {
          try {
            for (const item of fs.readdirSync(dir)) {
              const fullPath = path.join(dir, item);
              if (fs.statSync(fullPath).isDirectory()) { searchDirectory(fullPath); continue; }
              const ext = path.extname(item).toLowerCase();
              if (!supportedExts.includes(ext)) continue;
              const content = extractFileText(fullPath, ext);
              if (!content) continue;
              const contentLower = content.toLowerCase();
              if (contentLower.includes(q)) {
                const idx = contentLower.indexOf(q);
                results.push({
                  file: item, path: fullPath, ext,
                  snippet: content.substring(Math.max(0, idx - 100), Math.min(content.length, idx + 500)),
                  score: (content.match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
                });
              }
            }
          } catch (e) { console.error('[search_knowledge_base] 搜索目录失败:', e.message); }
        }
        searchDirectory(searchDir_root);
        results.sort((a, b) => b.score - a.score);
        const finalResults = results.slice(0, args.limit || 5);
        if (finalResults.length === 0) {
          return { success: true, results: [], message: `未在知识库中找到包含"${args.query}"的内容，搜索路径: ${searchDir_root}，请确认文件路径和内容是否正确` };
        }
        return { success: true, results: finalResults, searchPath: searchDir_root };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'search_knowledge_base': {
      try {
        const kbPath = args.path;
        if (!kbPath) return { success: false, error: '请提供知识库路径 path 参数' };
        if (!fs.existsSync(kbPath)) return { success: false, error: `路径不存在: ${kbPath}` };
        const rawQuery = (args.query || '').toLowerCase().trim();
        if (!rawQuery) return { success: false, error: '请提供搜索关键词 query 参数' };
        // 支持多关键词（空格分隔，AND 逻辑）
        const keywords = rawQuery.split(/\s+/).filter(k => k.length > 0);
        const supportedExts = args.fileTypes || ['.md', '.txt', '.docx', '.json', '.js', '.ts', '.py', '.html', '.css'];
        const results = [];
        function extractText(fullPath, ext) {
          try {
            if (ext === '.docx') {
              const buf = fs.readFileSync(fullPath);
              return buf.toString('utf-8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ');
            }
            return fs.readFileSync(fullPath, 'utf-8');
          } catch (e) { return ''; }
        }
        // 简单同义词扩展
        const synonymMap = {
          'config': ['configuration', '配置', '设置'],
          'setup': ['install', '配置', '安装'],
          'error': ['bug', 'exception', '失败', '错误'],
          'fix': ['repair', 'resolve', '修复', '解决'],
          'delete': ['remove', 'erase', '删除', '移除'],
          'create': ['make', 'new', '添加', '新建'],
          'file': ['document', '文件', '文档'],
          'folder': ['directory', 'dir', '文件夹', '目录']
        };
        function getRelatedTerms(term) {
          const related = [term];
          for (const [key, vals] of Object.entries(synonymMap)) {
            if (term === key || vals.includes(term)) {
              related.push(key, ...vals);
            }
          }
          return [...new Set(related)];
        }
        const allSearchTerms = [...new Set(keywords.flatMap(getRelatedTerms))];
        function calcScore(content, fileName) {
          const contentLower = content.toLowerCase();
          const nameLower = fileName.toLowerCase();
          let score = 0;
          let allMatched = true;
          let bestIdx = -1;
          for (const term of keywords) {
            const termScore = (contentLower.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
            if (termScore === 0) allMatched = false;
            score += termScore * 2;
            const idx = contentLower.indexOf(term);
            if (idx >= 0 && (bestIdx === -1 || idx < bestIdx)) bestIdx = idx;
          }
          // 文件名匹配加分
          for (const term of keywords) {
            if (nameLower.includes(term)) score += 5;
          }
          // 标题匹配（# 开头的行）
          const headings = contentLower.match(/^#+\s+.+/gm) || [];
          for (const h of headings) {
            for (const term of keywords) {
              if (h.includes(term)) score += 3;
            }
          }
          // 同义词匹配加分（较低权重）
          for (const term of allSearchTerms) {
            if (!keywords.includes(term)) {
              score += (contentLower.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length * 0.5;
            }
          }
          return { score, allMatched, bestIdx };
        }
        function walkKB(dir) {
          try {
            for (const item of fs.readdirSync(dir)) {
              const fullPath = path.join(dir, item);
              if (fs.statSync(fullPath).isDirectory()) { walkKB(fullPath); continue; }
              const ext = path.extname(item).toLowerCase();
              if (!supportedExts.includes(ext)) continue;
              const content = extractText(fullPath, ext);
              if (!content) continue;
              const { score, allMatched, bestIdx } = calcScore(content, item);
              if (score > 0) {
                const idx = bestIdx >= 0 ? bestIdx : 0;
                results.push({
                  file: item, path: fullPath, ext,
                  snippet: content.substring(Math.max(0, idx - 150), Math.min(content.length, idx + 600)),
                  score: Math.round(score),
                  relevance: allMatched ? 'high' : 'medium'
                });
              }
            }
          } catch (e) { console.error('[search_knowledge_base] walkKB 失败:', e.message); }
        }
        walkKB(kbPath);
        results.sort((a, b) => b.score - a.score);
        const finalResults = results.slice(0, args.limit || 8);
        if (finalResults.length === 0) {
          return { success: true, results: [], message: `未在 ${kbPath} 中找到包含"${args.query}"的内容，请确认文件路径和内容是否正确` };
        }
        return { success: true, results: finalResults, searchPath: kbPath, totalFound: results.length, keywords: keywords };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'organize_files': {
      try {
        const targetPath = args.path;
        if (!targetPath) return { success: false, error: '请提供要整理的文件夹路径 path 参数' };
        if (!fs.existsSync(targetPath)) return { success: false, error: `路径不存在: ${targetPath}` };
        const strategy = args.strategy || 'type'; // 'type' | 'date' | 'name'
        const moved = [];
        const errors = [];
        const typeMap = {
          images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'],
          documents: ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.xls', '.xlsx', '.ppt', '.pptx', '.csv'],
          videos: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'],
          audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma'],
          archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'],
          code: ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.go', '.rs', '.rb', '.php', '.html', '.css', '.scss', '.json', '.xml', '.yaml', '.yml']
        };
        function getTypeFolder(filename) {
          const ext = path.extname(filename).toLowerCase();
          for (const [folder, exts] of Object.entries(typeMap)) {
            if (exts.includes(ext)) return folder;
          }
          return 'others';
        }
        function getDateFolder(filePath) {
          try {
            const stat = fs.statSync(filePath);
            const d = new Date(stat.mtime);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
          } catch (e) { return 'unknown-date'; }
        }
        function getNameFolder(filename) {
          const firstChar = filename.charAt(0).toUpperCase();
          if (/[A-Z]/.test(firstChar)) return firstChar;
          if (/[0-9]/.test(firstChar)) return '0-9';
          return '#';
        }
        for (const item of fs.readdirSync(targetPath)) {
          const fullPath = path.join(targetPath, item);
          if (fs.statSync(fullPath).isDirectory()) continue;
          let folderName;
          if (strategy === 'type') folderName = getTypeFolder(item);
          else if (strategy === 'date') folderName = getDateFolder(fullPath);
          else if (strategy === 'name') folderName = getNameFolder(item);
          else folderName = 'others';
          const destDir = path.join(targetPath, folderName);
          try {
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
            const destPath = path.join(destDir, item);
            if (!fs.existsSync(destPath)) {
              fs.renameSync(fullPath, destPath);
              moved.push({ from: fullPath, to: destPath, folder: folderName });
            } else {
              errors.push(`目标已存在，跳过: ${item}`);
            }
          } catch (err) { errors.push(`${item}: ${err.message}`); }
        }
        return { success: true, moved, errors, strategy, totalMoved: moved.length };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'mcp_call': {
      try {
        const { serverUrl, toolName, toolArgs, apiKey } = args || {};
        if (!serverUrl) return { success: false, error: '请提供 MCP 服务器地址 serverUrl' };
        if (!toolName) return { success: false, error: '请提供要调用的工具名 toolName' };
        const url = serverUrl.replace(/\/$/, '') + '/call';
        const payload = { tool: toolName, arguments: toolArgs || {} };
        // 使用 Node.js https/http 模块发送请求
        const httpModule = url.startsWith('https') ? require('https') : require('http');
        const urlObj = new URL(url);
        const postData = JSON.stringify(payload);
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || (url.startsWith('https') ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            ...(apiKey ? { 'Authorization': 'Bearer ' + apiKey } : {})
          },
          timeout: 30000
        };
        return new Promise((resolve) => {
          const req = httpModule.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              try {
                const json = JSON.parse(data);
                resolve({ success: true, result: json, statusCode: res.statusCode });
              } catch (err) {
                resolve({ success: true, raw: data, statusCode: res.statusCode });
              }
            });
          });
          req.on('error', (err) => resolve({ success: false, error: err.message }));
          req.on('timeout', () => { req.destroy(); resolve({ success: false, error: '请求超时' }); });
          req.write(postData);
          req.end();
        });
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'save_meeting_note': {
      try {
        const notesDir = getCurrentNotesDir();
        const now = new Date();
        const dateDir = path.join(notesDir, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'));
        if (!fs.existsSync(dateDir)) fs.mkdirSync(dateDir, { recursive: true });
        const fileName = (args.filename || '会议纪要-' + Date.now()) + '.md';
        const filePath = path.join(dateDir, fileName);
        fs.writeFileSync(filePath, args.content, 'utf-8');
        return { success: true, path: filePath, message: '会议纪要已保存: ' + filePath };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'list_meeting_notes': {
      try {
        const notesDir = getCurrentNotesDir();
        if (!fs.existsSync(notesDir)) return { success: true, files: [] };
        const files = [];
        function walkDir(dir) {
          try {
            for (const item of fs.readdirSync(dir)) {
              const fullPath = path.join(dir, item);
              if (fs.statSync(fullPath).isDirectory()) walkDir(fullPath);
              else if (item.endsWith('.md')) files.push({ name: item, path: fullPath });
            }
          } catch (e) { console.error('[list_meeting_notes] 遍历目录失败:', e.message); }
        }
        walkDir(notesDir);
        return { success: true, files: files.slice(0, 20) };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'get_current_time': {
      return { time: new Date().toLocaleString('zh-CN'), timestamp: Date.now(), date: new Date().toLocaleDateString('zh-CN') };
    }
    case 'get_agent': {
      try {
        const agents = safeLoadAgents();
        const agent = agents.find(a => a.id === args.id);
        if (!agent) return { success: false, error: 'Agent不存在: ' + args.id };
        return { success: true, agent };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'add_tool_to_agent': {
      try {
        const agents = safeLoadAgents();
        const idx = agents.findIndex(a => a.id === args.id);
        if (idx === -1) return { success: false, error: 'Agent不存在: ' + args.id };
        const existingTools = agents[idx].tools || [];
        const addedTools = [];
        for (const t of (args.tools || [])) {
          if (!existingTools.includes(t)) { existingTools.push(t); addedTools.push(t); }
        }
        agents[idx].tools = existingTools;
        agents[idx].updatedAt = new Date().toISOString();
        const agentConfigPath3 = path.join(getAgentConfigsDir(), args.id + '.json');
        fs.writeFileSync(agentConfigPath3, JSON.stringify(agents[idx], null, 2));
        fs.writeFileSync(getAgentsPath(), JSON.stringify(agents, null, 2));
        return { success: true, addedTools, currentTools: existingTools, message: '已添加工具: ' + addedTools.join(', ') };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'write_agent_code': {
      try {
        const agents = safeLoadAgents();
        const agent = agents.find(a => a.id === args.agent_id);
        if (!agent) return { success: false, error: 'Agent不存在: ' + args.agent_id };
        const codeDir = path.join(agent.dataDir || path.join(app.getPath('userData'), 'agents', args.agent_id), 'code');
        if (!fs.existsSync(codeDir)) fs.mkdirSync(codeDir, { recursive: true });
        const codePath = path.join(codeDir, args.filename);
        const header = '// Agent: ' + agent.name + '\n// Description: ' + (args.description || '') + '\n// Generated: ' + new Date().toISOString() + '\n\n';
        fs.writeFileSync(codePath, header + args.code, 'utf-8');
        return { success: true, path: codePath, message: '代码已写入: ' + codePath };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'update_agent': {
      try {
        const agents = safeLoadAgents();
        const idx = agents.findIndex(a => a.id === args.id);
        if (idx === -1) return { success: false, error: 'Agent不存在: ' + args.id };
        // 支持两种传参方式：{ id, updates: {...} } 或 { id, name, description, systemPrompt, ... }
        let updates = args.updates || {};
        // 如果 LLM 把参数直接放在 args 中（非嵌套），也兼容处理
        const directFields = ['name', 'description', 'systemPrompt', 'system_prompt', 'tools', 'model', 'apiKey', 'api_key', 'baseUrl', 'base_url', 'temperature', 'knowledgeBasePath', 'knowledge_base_path'];
        for (const key of directFields) {
          if (args[key] !== undefined && key !== 'id' && key !== 'updates') {
            const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
            updates[camelKey] = args[key];
          }
        }
        // 将 snake_case 字段映射到 camelCase
        if (updates.system_prompt !== undefined) { updates.systemPrompt = updates.system_prompt; delete updates.system_prompt; }
        if (updates.api_key !== undefined) { updates.apiKey = updates.api_key; delete updates.api_key; }
        if (updates.base_url !== undefined) { updates.baseUrl = updates.base_url; delete updates.base_url; }
        if (updates.knowledge_base_path !== undefined) { updates.knowledgeBasePath = updates.knowledge_base_path; delete updates.knowledge_base_path; }
        agents[idx] = { ...agents[idx], ...updates, updatedAt: new Date().toISOString() };
        const agentConfigPath = path.join(getAgentConfigsDir(), args.id + '.json');
        fs.writeFileSync(agentConfigPath, JSON.stringify(agents[idx], null, 2));
        fs.writeFileSync(getAgentsPath(), JSON.stringify(agents, null, 2));
        return { success: true, agent: agents[idx], message: 'Agent "' + agents[idx].name + '" 已更新' };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'list_available_tools': {
      return { success: true, tools: ALL_TOOLS.map(t => ({ name: t.function.name, description: t.function.description })) };
    }
    case 'read_agent_file': {
      try {
        const agentConfigPath = path.join(getAgentConfigsDir(), args.id + '.json');
        if (!fs.existsSync(agentConfigPath)) {
          const agents = safeLoadAgents();
          const agent = agents.find(a => a.id === args.id);
          if (!agent) return { success: false, error: 'Agent配置文件不存在: ' + args.id };
          return { success: true, content: JSON.stringify(agent, null, 2), source: 'agents.json' };
        }
        const content = fs.readFileSync(agentConfigPath, 'utf-8');
        return { success: true, content, source: agentConfigPath };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'write_agent_file': {
      try {
        const agentConfigPath = path.join(getAgentConfigsDir(), args.id + '.json');
        const configStr = typeof args.config === 'string' ? args.config : JSON.stringify(args.config, null, 2);
        fs.writeFileSync(agentConfigPath, configStr, 'utf-8');
        // 同步更新 agents.json
        const config = JSON.parse(configStr);
        const agents = safeLoadAgents();
        const idx = agents.findIndex(a => a.id === args.id);
        if (idx !== -1) { agents[idx] = { ...agents[idx], ...config, updatedAt: new Date().toISOString() }; }
        else { agents.push({ ...config, id: args.id }); }
        fs.writeFileSync(getAgentsPath(), JSON.stringify(agents, null, 2));
        return { success: true, message: 'Agent配置文件已写入: ' + agentConfigPath };
      } catch (e) { return { success: false, error: e.message }; }
    }

    case 'read_source_file': {
      try {
        const projectDir = __dirname;
        const targetPath = path.isAbsolute(args.filename) ? args.filename : path.join(projectDir, args.filename);
        if (!fs.existsSync(targetPath)) return { success: false, error: '文件不存在: ' + targetPath };
        const fileContent = fs.readFileSync(targetPath, 'utf-8');
        return { success: true, content: fileContent, path: targetPath, lines: fileContent.split('\n').length };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'write_source_file': {
      try {
        const projectDir = __dirname;
        const targetPath = path.isAbsolute(args.filename) ? args.filename : path.join(projectDir, args.filename);
        // 写入前备份
        if (fs.existsSync(targetPath)) {
          fs.writeFileSync(targetPath + '.bak', fs.readFileSync(targetPath));
        }
        fs.writeFileSync(targetPath, args.content, 'utf-8');
        return { success: true, message: '文件已写入: ' + targetPath + '（备份已创建 .bak）', path: targetPath };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'patch_source_file': {
      try {
        const projectDir = __dirname;
        const targetPath = path.isAbsolute(args.filename) ? args.filename : path.join(projectDir, args.filename);
        if (!fs.existsSync(targetPath)) return { success: false, error: '文件不存在: ' + targetPath };
        let fileContent = fs.readFileSync(targetPath, 'utf-8');
        const count = (fileContent.split(args.oldCode).length - 1);
        if (count === 0) return { success: false, error: '原始代码未找到，请确认 oldCode 与文件内容完全匹配' };
        if (count > 1) return { success: false, error: '原始代码在文件中出现 ' + count + ' 次，请提供更具体的代码片段以确保唯一匹配' };
        // 备份
        fs.writeFileSync(targetPath + '.bak', fileContent);
        fileContent = fileContent.replace(args.oldCode, args.newCode);
        fs.writeFileSync(targetPath, fileContent, 'utf-8');
        return { success: true, message: '代码已替换（备份已创建 .bak）', path: targetPath };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'list_project_files': {
      try {
        const projectDir = __dirname;
        function listDir(dir, depth) {
          if (depth > 2) return [];
          const items = [];
          for (const name of fs.readdirSync(dir)) {
            if (['node_modules', '.git', 'dist', 'build'].includes(name)) continue;
            const fullPath = path.join(dir, name);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              items.push({ name, type: 'dir', children: listDir(fullPath, depth + 1) });
            } else {
              items.push({ name, type: 'file', size: stat.size });
            }
          }
          return items;
        }
        return { success: true, projectDir, files: listDir(projectDir, 0) };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'check_syntax': {
      return new Promise((resolve) => {
        const projectDir = __dirname;
        const targetPath = path.isAbsolute(args.filename) ? args.filename : path.join(projectDir, args.filename);
        exec('node --check "' + targetPath + '"', { encoding: 'utf-8' }, (err, stdout, stderr) => {
          if (err) resolve({ success: false, error: stderr || err.message, hasError: true });
          else resolve({ success: true, message: '语法检查通过 ✓', hasError: false });
        });
      });
    }
    case 'run_node_check': {
      return new Promise((resolve) => {
        const { exec: cpExec } = require('child_process');
        cpExec('node --check "' + (args.file_path || '') + '"', { encoding: 'buffer' }, (err, stdout, stderr) => {
          const decode = (buf) => { try { return buf.toString('utf-8'); } catch { return buf.toString('binary'); } };
          if (err) resolve({ success: false, error: decode(stderr) || err.message });
          else resolve({ success: true, message: '语法检查通过: ' + args.file_path });
        });
      });
    }
    case 'analyze-file': {
      try {
        const fs = require('fs');
        const path = require('path');
        const mammoth = require('mammoth');
        const pptxgen = require('pptxgenjs');
        const { parsePdf } = require('./libs/pdf-parse-lib');

        const filePath = args.filePath;
        if (!fs.existsSync(filePath)) {
          throw new Error(`文件不存在: ${filePath}`);
        }

        const ext = path.extname(filePath).toLowerCase();
        let result = { success: true, type: ext, originalPath: filePath, timestamp: Date.now() };

        if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
          // Use OpenClaw's image tool via IPC (requires OpenClaw gateway)
          const { exec } = require('child_process');
          // ✅ FIXED: Safe string concatenation — no nested template literals
          const escapedPath = filePath.replace(/'/g, "\\'");
          const cmd = 'node -e "const { image } = require(\'@openclaw/core\'); image({ image: \'' + escapedPath + '\', prompt: \'请精确识别图中所有文字内容，并总结核心信息。如果是流程图/架构图，请描述各模块关系。\' }).then(r => console.log(JSON.stringify({success:true,content:r.text}))).catch(e => console.log(JSON.stringify({success:false,error:e.message})));"';
          
          const output = await new Promise((resolve) => {
            exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
              try {
                const data = JSON.parse(stdout.trim());
                resolve(data);
              } catch (e) {
                resolve({ success: false, error: '图像分析工具调用失败: ' + (stderr || err?.message || 'unknown') });
              }
            });
          });
          
          if (output.success) {
            result.content = output.content;
            result.type = 'image';
          } else {
            throw new Error(output.error);
          }

        } else if (ext === '.pdf') {
          const buffer = fs.readFileSync(filePath);
          const pdfData = await parsePdf(buffer, { maxPages: 5 });
          result.content = pdfData.text;
          result.type = 'pdf';
          if (pdfData.images && pdfData.images.length > 0) {
            const previewPath = path.join(path.dirname(filePath), `preview-${Date.now()}.png`);
            fs.writeFileSync(previewPath, pdfData.images[0]);
            result.previewImage = previewPath;
          }

        } else if (['.docx', '.doc'].includes(ext)) {
          const buffer = fs.readFileSync(filePath);
          const html = await mammoth.convertToHtml({ arrayBuffer: buffer });
          result.content = html.value;
          result.type = 'docx';

        } else if (['.pptx', '.ppt'].includes(ext)) {
          const preso = new pptxgen();
          const slides = await preso.readSlideData(filePath);
          result.content = slides.map((s, i) => 
            `${i+1}. ${s.title || '无标题'}：${s.text || '无内容'}\n${s.notes || ''}`
          ).join('\n');
          result.type = 'pptx';

        } else if (['.txt', '.md'].includes(ext)) {
          result.content = fs.readFileSync(filePath, 'utf8');
          result.type = 'text';

        } else {
          throw new Error(`不支持的文件类型: ${ext}`);
        }

        return result;

      } catch (err) {
        console.error('File analysis error:', err);
        return { success: false, error: err.message, originalPath: args.filePath };
      }
    }
    case 'restart_app': {
      try {
        app.relaunch();
        setTimeout(() => app.exit(0), 500);
        return { success: true, message: '应用正在重启...' };
      } catch (e) { return { success: false, error: e.message }; }
    }
    case 'search_web': {
      try {
        const result = await searchWeb(args.query, { limit: args.limit || 5 });
        return result;
      } catch (e) { return { success: false, error: '搜索失败: ' + e.message }; }
    }
    case 'fetch_url': {
      try {
        const result = await fetchUrl(args.url, { maxLength: args.maxLength || 8000 });
        return result;
      } catch (e) { return { success: false, error: '抓取失败: ' + e.message }; }
    }
    case 'win_find_window': {
      try {
        const keyword = args.keyword || '';
        if (!keyword) return { success: false, error: '缺少 keyword 参数（窗口标题关键字）' };
        const safeKeyword = keyword.replace(/'/g, "''");
        const psCmd = `Get-Process | Where-Object { $_.MainWindowTitle -like '*${safeKeyword}*' -and $_.MainWindowHandle -ne 0 } | Select-Object Name, Id, MainWindowTitle, MainWindowHandle | ConvertTo-Json -Depth 2`;
        const stdout = execSync('powershell -Command "' + psCmd + '"', { encoding: 'utf8', timeout: 10000 });
        if (!stdout || stdout.trim() === '') {
          return { success: true, windows: [], message: '未找到匹配的窗口' };
        }
        const data = JSON.parse(stdout);
        const windows = Array.isArray(data) ? data : [data];
        return {
          success: true,
          windows: windows.map(w => ({
            name: w.Name,
            pid: w.Id,
            title: w.MainWindowTitle,
            handle: w.MainWindowHandle
          }))
        };
      } catch (e) {
        return { success: false, error: '查找窗口失败: ' + e.message };
      }
    }
    case 'win_activate_window': {
      try {
        const title = args.title || '';
        const handle = args.handle || 0;
        if (!title && !handle) return { success: false, error: '缺少 title 或 handle 参数' };
        let psCmd;
        if (handle) {
          psCmd = `Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);' -Name WinAPI -Namespace WinAuto; [WinAuto.WinAPI]::ShowWindow([IntPtr]${handle}, 9); [WinAuto.WinAPI]::SetForegroundWindow([IntPtr]${handle}); 'activated'`;
        } else {
          const safeTitle = title.replace(/'/g, "''");
          psCmd = `$shell = New-Object -ComObject WScript.Shell; $shell.AppActivate('${safeTitle}'); 'activated'`;
        }
        execSync('powershell -Command "' + psCmd + '"', { encoding: 'utf8', timeout: 10000 });
        return { success: true, message: '窗口已激活: ' + (title || ('handle=' + handle)) };
      } catch (e) {
        return { success: false, error: '激活窗口失败: ' + e.message };
      }
    }
    case 'win_send_keys': {
      try {
        const keys = args.keys || '';
        const delay = args.delay || 50;
        if (!keys) return { success: false, error: '缺少 keys 参数（要发送的按键文本）' };
        const safeKeys = keys.replace(/'/g, "''");
        const psCmd = `$shell = New-Object -ComObject WScript.Shell; $shell.SendKeys('${safeKeys}'); 'sent'`;
        execSync('powershell -Command "' + psCmd + '"', { encoding: 'utf8', timeout: 10000 });
        return { success: true, message: '已发送按键: ' + keys };
      } catch (e) {
        return { success: false, error: '发送按键失败: ' + e.message };
      }
    }
    case 'win_click': {
      try {
        const x = args.x || 0;
        const y = args.y || 0;
        const psCmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y}); Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, int info);' -Name WinAPI -Namespace WinAuto; [WinAuto.WinAPI]::mouse_event(0x0002, 0, 0, 0, 0); Start-Sleep -Milliseconds 50; [WinAuto.WinAPI]::mouse_event(0x0004, 0, 0, 0, 0); 'clicked'`;
        execSync('powershell -Command "' + psCmd + '"', { encoding: 'utf8', timeout: 10000 });
        return { success: true, message: `已点击坐标 (${x}, ${y})` };
      } catch (e) {
        return { success: false, error: '点击失败: ' + e.message };
      }
    }
    case 'run_ahk_script': {
      const ahkCheck = checkAhkInstalled();
      if (!ahkCheck.installed) return { success: false, error: ahkCheck.message };
      const result = await runAhkScript(args.code, args.timeout || 30000);
      return result;
    }
    case 'ahk_find_window': {
      const ahkCheck = checkAhkInstalled();
      if (!ahkCheck.installed) return { success: false, error: ahkCheck.message };
      const result = await ahkFindWindow({
        title: args.title,
        className: args.className,
        exe: args.exe
      });
      return result;
    }
    case 'ahk_send_input': {
      const ahkCheck = checkAhkInstalled();
      if (!ahkCheck.installed) return { success: false, error: ahkCheck.message };
      const result = await ahkSendInput({
        text: args.text,
        keys: args.keys,
        windowTitle: args.windowTitle,
        controlName: args.controlName
      });
      return result;
    }
    case 'ahk_click_control': {
      const ahkCheck = checkAhkInstalled();
      if (!ahkCheck.installed) return { success: false, error: ahkCheck.message };
      const result = await ahkClickControl({
        windowTitle: args.windowTitle,
        controlName: args.controlName,
        x: args.x,
        y: args.y,
        button: args.button
      });
      return result;
    }
    // ===== 待办管理（直接操作 PetManager 数据）=====
    case 'list_todos': {
      if (!petManager) return { success: true, output: '桌面宠物未启动，请先打开桌面宠物' };
      const todos = petManager.loadTodos();
      if (todos.length === 0) return { success: true, output: '当前没有待办事项' };
      return { success: true, output: '待办列表（共' + todos.length + '条）:\n' + todos.map((t, i) => {
        const status = t.done ? '✅' : '⬜';
        const priority = t.priority === 'red' ? '🔴' : t.priority === 'orange' ? '🟠' : t.priority === 'blue' ? '🔵' : '🟢';
        const date = t.due_date ? ' 📅' + t.due_date : '';
        const time = t.due_time ? ' ' + t.due_time : '';
        return 'ID:' + (i + 1) + ' ' + status + priority + ' ' + (t.text || '') + date + time;
      }).join('\n') };
    }
    case 'create_todo': {
      if (!petManager) return { success: true, output: '桌面宠物未启动，请先打开桌面宠物' };
      const text = args.text || '';
      if (!text) return { success: false, error: '未提供待办内容' };
      const todos = petManager.loadTodos();
      const newTodo = {
        text: text, done: false, createdAt: Date.now(),
        reminderTime: null, priority: args.priority || 'green',
        due_date: args.due_date || null, due_time: args.due_time || null,
        category: args.category || '', note: args.note || ''
      };
      todos.push(newTodo);
      petManager.saveTodos(todos);
      petManager.notifyAllPanels();
      return { success: true, output: '✅ 待办已创建: ' + text + '（可在桌面宠物待办面板查看）' };
    }
    case 'update_todo': {
      if (!petManager) return { success: true, output: '桌面宠物未启动，请先打开桌面宠物' };
      const id = args.id;
      if (id === undefined) return { success: false, error: '未提供待办ID，请先用 list_todos 查看' };
      const todos = petManager.loadTodos();
      const idx = id - 1;
      if (idx < 0 || idx >= todos.length) return { success: false, error: '待办ID不存在: ' + id };
      if (args.text !== undefined) todos[idx].text = args.text;
      if (args.done !== undefined) todos[idx].done = args.done;
      if (args.priority !== undefined) todos[idx].priority = args.priority;
      if (args.due_date !== undefined) todos[idx].due_date = args.due_date;
      if (args.due_time !== undefined) todos[idx].due_time = args.due_time;
      if (args.category !== undefined) todos[idx].category = args.category;
      petManager.saveTodos(todos);
      petManager.notifyAllPanels();
      return { success: true, output: '✅ 待办已更新(ID:' + id + '): ' + (todos[idx].text || '') };
    }
    case 'delete_todo': {
      if (!petManager) return { success: true, output: '桌面宠物未启动，请先打开桌面宠物' };
      const id = args.id;
      if (id === undefined) return { success: false, error: '未提供待办ID，请先用 list_todos 查看' };
      const todos = petManager.loadTodos();
      const idx = id - 1;
      if (idx < 0 || idx >= todos.length) return { success: false, error: '待办ID不存在: ' + id };
      const removed = todos.splice(idx, 1)[0];
      petManager.saveTodos(todos);
      petManager.notifyAllPanels();
      return { success: true, output: '✅ 已删除待办: ' + (removed.text || '') };
    }
    case 'call_agent': {
      // ===== 多Agent协同：委派子任务给指定Agent =====
      const targetAgentId = args.agentId || '';
      const task = args.task || '';
      const context = args.context || '';
      if (!targetAgentId || !task) return { success: false, error: '缺少 agentId 或 task 参数' };
      
      // 1. 查找目标 Agent（支持 ID 精确匹配 + 名称模糊匹配）
      const agents = safeLoadAgents();
      let agent = agents.find(a => a.id === targetAgentId);
      // 🔧 [v1.3.5] 如果 ID 精确匹配失败，尝试按名称模糊匹配
      if (!agent) {
        agent = agents.find(a => a.name === targetAgentId);
        if (agent) console.log(`[call_agent] 按名称匹配到 Agent: "${targetAgentId}" → ${agent.id}`);
      }
      if (!agent) {
        agent = agents.find(a => a.name.toLowerCase().includes(targetAgentId.toLowerCase()));
        if (agent) console.log(`[call_agent] 按名称模糊匹配到 Agent: "${targetAgentId}" → ${agent.id}`);
      }
      if (!agent) {
        agent = agents.find(a => targetAgentId.toLowerCase().includes(a.name.toLowerCase()));
        if (agent) console.log(`[call_agent] 按名称反模糊匹配到 Agent: "${targetAgentId}" → ${agent.id}`);
      }
      if (!agent) {
        const agentList = agents.map(a => `"${a.name}" (id: ${a.id})`).join(', ');
        return { success: false, error: `Agent "${targetAgentId}" 不存在。可用Agent: ${agentList}` };
      }
      
      // 2. 获取 LLM 配置（🔧 [v1.3.6] 优先使用目标Agent自身配置，再 fallback 到主调用配置）
      const cfg = _currentAiConfig;
      if (!cfg || !cfg.apiKey) {
        try { _currentAiConfig = JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8')); } catch(e) { console.error('[getAiConfig] 读取配置文件失败:', e.message); }
      }
      const mainConfig = _currentAiConfig || cfg;

      // 🔧 [v1.3.6] 关键修复：如果目标Agent有独立API配置，优先使用Agent自身的
      // 这解决了"默认对话调call_agent(email)失败但直接用email Agent可以"的问题
      let llmConfig;
      if (agent.apiKey && agent.baseUrl) {
        // Agent 有完整独立配置 → 使用Agent自己的
        llmConfig = {
          apiKey: agent.apiKey,
          baseUrl: agent.baseUrl,
          model: agent.model || mainConfig.model || 'gpt-4o',
          temperature: agent.temperature || 0.7
        };
        console.log(`[call_agent] 使用Agent "${agent.name}" 自身配置: model=${llmConfig.model}, baseUrl=${llmConfig.baseUrl.slice(0,30)}...`);
      } else if (agent.model) {
        // Agent 只指定了模型名 → 用全局apiKey/baseUrl + Agent的model
        llmConfig = {
          apiKey: mainConfig.apiKey || '',
          baseUrl: mainConfig.baseUrl || '',
          model: agent.model,
          temperature: agent.temperature || 0.7
        };
        console.log(`[call_agent] 混合配置: model=${agent.model}(Agent), api=全局`);
      } else {
        // Agent无独立配置 → 完全使用主调用的配置
        llmConfig = mainConfig;
        console.log(`[call_agent] 使用主调用配置: model=${mainConfig.model || '(default)'}`);
      }
      if (!llmConfig || !llmConfig.apiKey) return { success: false, error: 'LLM 配置未找到，无法委派Agent任务' };

      const cleanBaseUrl = (llmConfig.baseUrl || '').replace(/\/$/, '');
      const apiKey = llmConfig.apiKey;
      const model = llmConfig.model || 'gpt-4o';
      const temperature = llmConfig.temperature || 0.7;
      const urls = buildChatUrls(cleanBaseUrl);
      
      // 3. 构建消息：Agent的系统提示词 + 任务 + 上下文
      let systemPrompt = agent.systemPrompt || agent.prompt || '';
      const agentTools = agent.tools || [];
      const activeAgentTools = getAgentTools(agentTools);
      
      const contextBlock = context ? `\n\n【参考上下文】：${context}` : '';
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请完成以下任务：\n\n${task}${contextBlock}\n\n请使用你可用的工具完成此任务，完成后返回最终结果。` }
      ];
      
      // 4. 调用 LLM 执行 Agent 任务（支持工具调用循环，最多15轮）
      let currentMsgs = [...messages];
      const agentMaxIterations = 15;
      let agentResult = '';
      
      try {
        for (let iter = 0; iter < agentMaxIterations; iter++) {
          if (signal && signal.aborted) return { success: false, error: '任务被中断' };
          
          // 🔧 [v1.3.3] 推送Agent进度到渲染进程
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ai-stream', {
              type: 'tool-thinking',
              tool: 'call_agent: ' + (agent.name || targetAgentId) + ' (第' + (iter + 1) + '轮)'
            });
          }

          const body = { model, messages: currentMsgs, temperature, max_tokens: 4096, stream: true };
          if (activeAgentTools && activeAgentTools.length > 0) {
            body.tools = activeAgentTools;
            body.tool_choice = 'auto';
          }
          
          // [v1.2.1] 为每次 Agent LLM 调用创建独立超时（120s），防止 Agent 挂死导致整个会话中断
          let agentTimeout = null;
          let agentAbort = new AbortController();
          const timeoutId = setTimeout(() => {
            agentTimeout = true;
            agentAbort.abort();
          }, 120000);
          
          let llmResponse = null;
          for (const url of urls) {
            if (agentTimeout) break;
            try {
              // 合并外部 signal 和超时 signal
              const mergedSignal = signal 
                ? combineSignals(signal, agentAbort.signal)
                : agentAbort.signal;
              const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify(body),
                signal: mergedSignal
              });
              clearTimeout(timeoutId);
              if (!resp.ok) {
                const errText = await resp.text().catch(() => '');
                console.error(`[call_agent] API 错误 (${resp.status}):`, errText.substring(0, 200));
                continue;
              }
              // 🔧 [v1.3.3] 改用流式SSE读取
              // 🔧 [v1.3.9] Agent 内部迭代使用 skipStreamEnd=true，不再由 streamSSETokens 自动发事件
              const agentStreamResult = await streamSSETokens(resp, mainWindow, mergedSignal, { skipStreamEnd: true });
              // 🔧 [v1.3.9] Agent 所有迭代都发 stream-reset（不发 stream-end）
              //   原因：Agent 的迭代是从 call-ai-with-tools 视角的中间内容，
              //   不应设 _streamCompleted=true。Agent 的最终文本也需要 stream-reset（而非 stream-end），
              //   因为父级 call-ai-with-tools 才负责最终的 stream-end。
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('ai-stream', { type: 'stream-reset' });
              }
              llmResponse = {
                choices: [{
                  message: {
                    role: 'assistant',
                    content: agentStreamResult.fullContent || null,
                    tool_calls: agentStreamResult.toolCalls.length > 0 ? agentStreamResult.toolCalls : undefined
                  },
                  finish_reason: agentStreamResult.toolCalls.length > 0 ? 'tool_calls' : 'stop'
                }]
              };
              break;
            } catch (fetchErr) {
              clearTimeout(timeoutId);
              if (agentTimeout) {
                console.error(`[call_agent] Agent "${agent.name}" LLM 调用超时（120s），中断执行`);
                return { success: false, error: `Agent "${agent.name}" 执行超时：LLM API 在 120 秒内未响应` };
              }
              if (fetchErr.name === 'AbortError') {
                if (signal && signal.aborted) return { success: false, error: '任务被中断' };
                // 如果只是 agentAbort 超时，已经被上面处理了
                continue;
              }
              console.error(`[call_agent] 请求失败:`, fetchErr.message);
              continue;
            }
          }
          clearTimeout(timeoutId);
          
          if (!llmResponse || !llmResponse.choices || !llmResponse.choices[0]) {
            if (agentTimeout) continue; // 超时已处理
            return { success: false, error: 'Agent 调用失败：无法连接到 LLM API' };
          }
          
          const choice = llmResponse.choices[0];
          const message = choice.message;
          
          // 如果有工具调用，并行执行它们
          if (message.tool_calls && message.tool_calls.length > 0) {
            currentMsgs.push(message);
            // 🔧 [v1.3.1] 并行执行工具调用（替代原来的串行 for 循环）
            const toolResults = await Promise.all(message.tool_calls.map(async (tc) => {
              const toolName = tc.function.name;
              let toolArgs = {};
              try { toolArgs = JSON.parse(tc.function.arguments || '{}'); } catch(e) { console.error('[call_agent] 解析工具参数失败:', e.message); }
              // 🔧 [v1.3.3] 推送工具执行进度
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('ai-stream', {
                  type: 'tool-start',
                  tool: toolName + ' (via ' + (agent.name || targetAgentId) + ')'
                });
              }
              try {
                const result = await Promise.race([
                  executeTool(toolName, toolArgs, signal),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('工具执行超时（90s）')), 90000))
                ]);
                // 推送完成事件
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('ai-stream', {
                    type: 'tool-done',
                    tool: toolName,
                    result: result
                  });
                }
                return result;
              } catch (toolErr) {
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('ai-stream', {
                    type: 'tool-done',
                    tool: toolName,
                    result: { success: false }
                  });
                }
                return { success: false, error: `工具 ${toolName} 执行失败: ${toolErr.message}` };
              }
            }));
            for (let i = 0; i < message.tool_calls.length; i++) {
              const tc = message.tool_calls[i];
              const toolResult = toolResults[i];
              currentMsgs.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2)
              });
            }
            continue; // 继续循环，让 LLM 处理工具结果
          }
          
          // 无工具调用 → 这是最终回复
          agentResult = message.content || '';
          break;
        }
        
        if (!agentResult) agentResult = '(Agent 未返回结果)';
        return { success: true, output: `[Agent "${agent.name}" 执行结果]\n\n${agentResult}` };
        
      } catch (e) {
        console.error(`[call_agent] Agent "${agent.name}" 执行异常:`, e.message);
        return { success: false, error: `Agent "${agent.name}" 执行异常: ${e.message}` };
      }
    }
    default:
      return { error: `未知工具: ${name}，可用工具: ` + ALL_TOOLS.map(t => t.function.name).join(', ') };
  }
}

// ===================================================================
// 全局中断控制器（点击停止按钮时触发）
// ===================================================================

let _globalAbortController = null; // 当前正在执行的 AI 任务的中断控制器
let _activeChildProcesses = new Set(); // 追踪所有活跃的子进程（AHK、PowerShell等）
let _currentAiConfig = null; // 当前正在进行的 AI 调用配置（供 call_agent 使用）

// 注册 abort-generation IPC：前端点击停止按钮时调用
ipcMain.handle('abort-generation', async () => {
  console.log('[Abort] 用户点击停止按钮');

  // 1. 中断 AI API 请求
  if (_globalAbortController) {
    console.log('[Abort] 中断当前 AI API 请求...');
    _globalAbortController.abort();
    _globalAbortController = null;
  }

  // 2. 杀死所有活跃的子进程（AHK、PowerShell、cmd等）
  // 🔧 [v1.3.3] 只杀非Electron子进程，避免闪退
  if (_activeChildProcesses.size > 0) {
    console.log(`[Abort] 正在终止 ${_activeChildProcesses.size} 个活跃子进程...`);
    const pidsToKill = [];
    for (const child of _activeChildProcesses) {
      try {
        if (child.pid) {
          pidsToKill.push(child.pid);
        }
        child.kill('SIGKILL');
      } catch (e) {
        // 进程可能已经退出
      }
    }
    _activeChildProcesses.clear();
    // 批量用 taskkill 杀死（不带 /T，避免杀进程树波及Electron）
    for (const pid of pidsToKill) {
      try {
        require('child_process').exec(`taskkill /F /PID ${pid} 2>nul`, () => {});
      } catch (e) { /* ignore */ }
    }
  }

  // 🔧 [v1.3.3] 移除危险的 PowerShell 全局进程搜索！
  // 旧代码用 WMI 搜索 CommandLine 含 "lobster" 的进程并强制杀掉，
  // 但这会杀死 Electron 的 renderer/GPU 子进程，导致整个应用闪退。
  // 现在只依赖精确的 _activeChildProcesses 追踪来管理子进程。

  console.log('[Abort] 所有任务已终止');
  return { success: true };
});

// ===================================================================
// 危险操作内嵌确认对话框
// ===================================================================
const _pendingConfirmations = new Map();

ipcMain.handle('request-confirmation', async (event, confirmId, details) => {
  // 发送确认请求到渲染进程
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('show-confirmation', { confirmId, details });
  }

  // 等待渲染进程返回结果（Promise）
  return new Promise((resolve) => {
    _pendingConfirmations.set(confirmId, {
      resolve,
      timeout: setTimeout(() => {
        _pendingConfirmations.delete(confirmId);
        resolve(false); // 超时默认拒绝
      }, 120000) // 2分钟超时
    });
  });
});

ipcMain.on('confirmation-result', (event, confirmId, result) => {
  const pending = _pendingConfirmations.get(confirmId);
  if (pending) {
    clearTimeout(pending.timeout);
    _pendingConfirmations.delete(confirmId);
    pending.resolve(result === true || result === 'confirm' || result === 1);
  }
});

// ===================================================================
// SSE 流式读取辅助函数
// ===================================================================
/**
 * 从 fetch Response 中流式读取 SSE，逐 token 推送给渲染进程
 * @returns {{ fullContent: string, toolCalls: Array }}
 */
async function streamSSETokens(response, mainWindow, abortSignal, options) {
  if (!response.body) throw new Error('No response body for streaming');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullContent = '';
  // 累积 tool_calls（跨 chunk 拼接 arguments）
  const toolCalls = {}; // index -> { id, type, function: { name, arguments } }

  while (true) {
    if (abortSignal && abortSignal.aborted) break;
    let done, value;
    try {
      const result = await reader.read();
      done = result.done;
      value = result.value;
    } catch (readErr) {
      // 🔧 [v1.3.1] reader.read() 在 abort 时会抛出，静默处理
      if (abortSignal && abortSignal.aborted) break;
      console.error('[streamSSETokens] 读取流失败:', readErr.message);
      break;
    }
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    // SSE 以 \n\n 分隔消息
    const parts = buffer.split('\n\n');
    buffer = parts.pop(); // 最后一段可能不完整，留到下次

    for (const part of parts) {
      const lines = part.split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        const dataStr = line.slice(6); // 去掉 "data: "
        if (dataStr.trim() === '[DONE]') break;

        try {
          const json = JSON.parse(dataStr);
          const choice = json.choices && json.choices[0];
          if (!choice) continue;

          // 文本 delta
          const deltaContent = choice.delta && choice.delta.content;
          if (deltaContent && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ai-stream', { type: 'token', content: deltaContent });
            fullContent += deltaContent;
          }

          // 工具调用 delta（streaming tool calls）
          const deltaToolCalls = choice.delta && choice.delta.tool_calls;
          if (deltaToolCalls && Array.isArray(deltaToolCalls)) {
            for (const tc of deltaToolCalls) {
              const idx = tc.index;
              if (!toolCalls[idx]) {
                toolCalls[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
              }
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function) {
                if (tc.function.name) {
                  toolCalls[idx].function.name = tc.function.name;
                  // 🔧 [v1.3.3] 推送工具调用开始事件到渲染进程
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('ai-stream', {
                      type: 'tool-thinking',
                      tool: tc.function.name,
                      index: idx
                    });
                  }
                }
                if (tc.function.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
              }
            }
          }
        } catch (e) {
          // 忽略无法解析的 chunk（heartbeat 等）
        }
      }
    }
  }

  // 把 toolCalls object 转成数组
  const toolCallsArray = Object.keys(toolCalls).map(i => {
    const tc = toolCalls[i];
    return {
      id: tc.id || ('stream_' + i),
      type: tc.type,
      function: tc.function
    };
  });

  // 🔧 [v1.3.2] 回退：如果流式解析零token，尝试按非流式JSON解析
  // 某些API提供商不支持 stream: true，会直接返回完整JSON
  if (!fullContent && toolCallsArray.length === 0 && buffer) {
    try {
      const data = JSON.parse(buffer);
      const choice = data.choices && data.choices[0];
      if (choice && choice.message) {
        fullContent = choice.message.content || '';
        if (choice.message.tool_calls && Array.isArray(choice.message.tool_calls)) {
          // 合并回退tool_calls到toolCallsArray
          choice.message.tool_calls.forEach((tc, i) => {
            toolCallsArray.push({
              id: tc.id || ('fallback_' + i),
              type: tc.type || 'function',
              function: tc.function || { name: '', arguments: '{}' }
            });
          });
        }
        console.log('[streamSSETokens] 非流式回退解析成功，content长度:', fullContent.length);
      }
    } catch (e) {
      console.error('[streamSSETokens] 非流式回退解析失败:', e.message);
    }
  }

  // 🔧 [v1.3.9] 流式结束事件策略：
  //   skipStreamEnd=false（call-ai 简单路径）：直接发 stream-end，renderer finalize 气泡
  //   skipStreamEnd=true（call-ai-with-tools/call-ai-with-plan/call_agent）：
  //     **不在此处发任何事件**！由调用方根据 tool_calls 结果决定发 stream-reset 还是 stream-end。
  const skipStreamEnd = options && options.skipStreamEnd;
  // 🔧 [v1.3.9-diag] 诊断日志
  console.log('[streamSSETokens] 结束: skipStreamEnd=', skipStreamEnd, 'fullContent_len=', fullContent.length, 'toolCalls_len=', toolCallsArray.length, '→ 发送事件:', skipStreamEnd ? '无(由调用方决定)' : 'stream-end');
  if (!skipStreamEnd && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ai-stream', { type: 'stream-end' });
  }

  return { fullContent, toolCalls: toolCallsArray };
}

// ===================================================================
// 主 AI 调用 Handler（Function Calling 循环）
// ===================================================================

ipcMain.handle('call-ai-with-tools', async (event, { messages, config, tools, agentId }) => {
  if (!config) return { success: false, error: '模型配置缺失，请在设置中配置 API Key 和 Base URL' };
  const cleanBaseUrl = (config.baseUrl || '').replace(/\/$/, '');
  if (!cleanBaseUrl) return { success: false, error: 'Base URL 未配置，请在设置页面填写 API 地址' };

  const apiKey = config.apiKey || '';
  const model = config.model || 'gpt-4o';
  const temperature = config.temperature || 0.7;
  const urls = buildChatUrls(cleanBaseUrl);

  // ===== 创建本次任务的中断控制器 =====
  const abortController = new AbortController();
  _globalAbortController = abortController;
  const abortSignal = abortController.signal;

  // 获取当前 Agent 的工具白名单
  let agentToolNames = null;
  if (agentId && agentId !== 'default') {
    try {
      const agents = safeLoadAgents();
      const agent = agents.find(a => a.id === agentId);
      if (agent && agent.tools) agentToolNames = agent.tools;
    } catch (e) { console.error('[call-ai-with-tools] 加载Agent工具失败:', e.message); }
  }

  const activeTools = tools || getAgentTools(agentToolNames);
  _currentAiConfig = config; // 保存当前配置供 call_agent 使用
  const toolCallLog = [];
  let currentMessages = [...messages];
  const maxIterations = 50;
  const toolFailCount = {}; // 熔断计数器
  let textModeRetryDone = 0; // 文本模式重试计数器 [v1.1.6] 从 bool 改为 int，支持多次重试
  // 🔧 [v1.3.6] 同一工具重复调用追踪（call-ai-with-tools 路径）
  const toolsCalledNames = []; // 记录所有调用过的工具名
  const TOOL_REPEAT_WARN_THRESHOLD = 3; // 同一工具被调用3次时警告

  try {
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // ===== 每次循环开始检查是否已中断 =====
      if (abortSignal.aborted) {
        console.log('[Abort] 任务已在循环开始处被中断');
        return { success: false, error: '⛔ 已停止：用户手动终止了任务' };
      }

      // 🔧 [v1.3.9] 移除 iteration>0 时自动发的 stream-end（v1.3.4 加的）
      //   原因：上一轮的中间迭代已经通过 stream-reset 清理了流式状态，
      //   如果再发 stream-end 会过早设 _streamCompleted=true，导致最终迭代的内容无法正确渲染。
      //   新流程：中间迭代→手动发 stream-reset（清状态但不设 _streamCompleted）
      //           最终迭代→手动发 stream-end（finalize 并设 _streamCompleted）

      let responded = false;

      for (const url of urls) {
        // ===== 检查中断信号 =====
        if (abortSignal.aborted) {
          return { success: false, error: '⛔ 已停止：用户手动终止了任务' };
        }

        try {
          // ===== 预处理 messages：确保所有 message.content 不为 undefined/null =====
          // JSON.stringify 会省略 undefined 字段，导致 API 收到不完整的消息
          // 某些 API 提供商（如百度文心等）也拒绝 content: null
          const safeMessages = currentMessages.map(msg => {
            const m = { ...msg };
            if (m.content === undefined || m.content === null) {
              // assistant + tool_calls 时 content 可以是空字符串（OpenAI 规范允许 null，但部分提供商不支持）
              m.content = '';
            }
            return m;
          });

          const body = { model, messages: safeMessages, temperature, max_tokens: 4096, stream: true };
          if (activeTools && activeTools.length > 0) {
            body.tools = activeTools;
            body.tool_choice = 'auto';
          }
          // ===== 流式 SSE 读取（替换 arrayBuffer 等待）=====
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(body),
            signal: abortSignal
          });
          if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.error(`[API] HTTP ${response.status}:`, errText.substring(0, 200));
            continue;
          }

          // 流式读取 SSE，逐 token 推送给渲染进程
          // 🔧 [v1.3.8] 默认不自动发 stream-end（中间迭代可能还有 tool_calls）
          //   只有最终迭代（纯文本回复）才发 stream-end → renderer finalize
          const streamResult = await streamSSETokens(response, mainWindow, abortSignal, { skipStreamEnd: true });
          const fullContent = streamResult.fullContent;
          const streamToolCalls = streamResult.toolCalls;

          // 🔧 [v1.3.9] 根据本轮结果决定发什么事件给 renderer：
          //   - 有 tool_calls（中间迭代）→ 发 stream-reset（清除状态，不 finalize）
          //   - 无 tool_calls（最终迭代）→ 发 stream-end（finalize 气泡）
          // 🔧 [v1.3.9-diag] 诊断日志
          console.log('[call-ai-with-tools] iter=' + iteration, 'toolCalls_len=' + streamToolCalls.length, 'fullContent_len=' + (fullContent || '').length, '→ 发送事件:', streamToolCalls.length > 0 ? 'stream-reset' : 'stream-end');
          if (streamToolCalls.length > 0) {
            // 中间迭代：有工具调用，不需要 finalize
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('ai-stream', { type: 'stream-reset' });
            }
          } else {
            // 最终迭代：纯文本回复，需要 finalize
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('ai-stream', { type: 'stream-end' });
            }
          }

          // 从流式结果直接构造 data 对象（兼容下游 tool call 逻辑）
          const message = {
            role: 'assistant',
            content: fullContent || null,
            tool_calls: streamToolCalls.length > 0 ? streamToolCalls : undefined
          };
          const data = { choices: [{ message, finish_reason: streamToolCalls.length > 0 ? 'tool_calls' : 'stop' }] };
          if (fullContent && fullContent.trim().startsWith('<')) { console.log('HTML response at', url, 'skipping'); continue; }

          if (!data || !data.choices || !data.choices[0]) {
            return { success: false, error: data?.error?.message || '响应格式异常: ' + JSON.stringify(data).slice(0, 200) };
          }

          // ===== 文本模式工具调用解析（兼容不支持 function calling 的模型）=====
          // 某些模型部署（如自托管的 deepseek）不支持 tools/tool_choice 参数，
          // AI 会在 content 中以 JSON 格式输出工具调用指令
          if (!message.tool_calls || message.tool_calls.length === 0) {
            const textToolCall = parseTextModeToolCall(message.content);
            if (textToolCall && textToolCall.tool) {
              // 构造伪 tool_calls 结构，走统一的执行逻辑
              message.tool_calls = [{
                id: 'textmode_' + Date.now(),
                type: 'function',
                function: {
                  name: textToolCall.tool,
                  arguments: JSON.stringify(textToolCall.args || {})
                }
              }];
              console.log('[TextMode] 解析到文本模式工具调用:', textToolCall.tool, textToolCall.args);
            }
          }

          // 有工具调用 → 执行工具，继续循环
          if (message.tool_calls && message.tool_calls.length > 0) {
            currentMessages.push(message);

            // ===== 工具调用期间自动跳过确认UI =====
            globalThis._plannerAutoApprove = true;

            // ===== 第二阶段：并行执行引擎 =====
            // 将多个独立工具调用并行执行，提升效率
            const toolCallResults = await executeToolCallsParallel(
              message.tool_calls,
              async (toolName, toolArgs, signal) => {
                toolCallLog.push({ tool: toolName, args: toolArgs });
                return await executeToolSmart(toolName, toolArgs, signal);
              },
              (phase, toolName, data) => {
                // 细粒度进度推送
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('tool-progress', {
                    phase,
                    tool: toolName,
                    ...data
                  });
                }
              },
              abortSignal,
              { maxRetries: 2, enableVerify: true }
            );

            // 恢复确认UI（工具调用完成）
            globalThis._plannerAutoApprove = false;

            // 检查中断
            if (abortSignal.aborted) {
              return { success: false, error: '⛔ 已停止：用户手动终止了任务' };
            }

            // 处理每个工具的结果
            for (let i = 0; i < message.tool_calls.length; i++) {
              const toolCall = message.tool_calls[i];
              const toolName = toolCall.function.name;
              const toolResult = toolCallResults[i];

              // 🔧 [v1.3.6] 记录工具调用名称用于重复检测
              // 🔧 [v1.3.7] 对于 call_agent，附带目标Agent名以便精确检测"反复调同一Agent"
              let trackKey = toolName;
              if (toolName === 'call_agent') {
                try {
                  const parsedArgs = JSON.parse(toolCall.function?.arguments || '{}');
                  const targetAgentId = parsedArgs.agentId || '';
                  if (targetAgentId) {
                    // 查找Agent的显示名称
                    const allAgents = safeLoadAgents();
                  const targetAgent = allAgents.find(a => a.id === targetAgentId || a.name === targetAgentId);
                  if (targetAgent) {
                    trackKey = `call_agent:${targetAgent.name}`;
                  } else {
                    trackKey = `call_agent:${targetAgentId}`;
                  }
                }
                } catch(e) { /* 解析失败则用原始toolName */ }
              }
              toolsCalledNames.push(trackKey);

              // 智能熔断策略
              if (toolResult && toolResult.success === false) {
                toolFailCount[toolName] = (toolFailCount[toolName] || 0) + 1;
                const totalFails = Object.values(toolFailCount).reduce((a, b) => a + b, 0);

                // 同一工具失败3次：添加警告提示
                if (toolFailCount[toolName] >= 3) {
                  toolResult.warning = `工具 [${toolName}] 已连续失败 ${toolFailCount[toolName]} 次，建议尝试其他方法或检查问题根源。`;
                  toolResult._suggestion = toolResult._suggestion || '请尝试：1）使用不同的工具达成相同目标；2）检查文件路径/权限是否正确；3）简化命令或分步执行。';
                }

                // 总失败次数超过8次：中止
                if (totalFails >= 8) {
                  return { success: false, error: `任务中工具总失败次数已达 ${totalFails} 次，已自动中止以避免无限循环。\n最后错误：${toolResult.error}\n\n建议：请简化任务，分步执行，或检查环境配置。` };
                }
              } else {
                toolFailCount[toolName] = 0; // 成功则重置计数
              }

              // 如果有验证信息，加入结果
              if (toolResult && toolResult._verification) {
                const v = toolResult._verification;
                if (!v.valid) {
                  toolResult._verifyWarning = v.reason;
                } else if (v.message) {
                  toolResult._verifyInfo = v.message;
                }
              }

              currentMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(toolResult) });
            }

            // 🔧 [v1.3.6] 同一工具重复调用检测（call-ai-with-tools 路径）
            // 统计每个工具被调用的次数，如果某个工具超过阈值，注入引导提示
            if (toolsCalledNames.length >= TOOL_REPEAT_WARN_THRESHOLD) {
              const toolFreq = {};
              toolsCalledNames.forEach(t => { toolFreq[t] = (toolFreq[t] || 0) + 1; });
              const repeatedTools = Object.entries(toolFreq).filter(([, c]) => c >= TOOL_REPEAT_WARN_THRESHOLD);
              if (repeatedTools.length > 0) {
                // 检查是否已经注入过类似的提示（避免每轮都注入）
                const lastMsg = currentMessages[currentMessages.length - 1];
                const alreadyWarned = lastMsg && lastMsg.role === 'user' && (lastMsg.content || '').includes('反复调用');
                if (!alreadyWarned) {
                  // 🔧 [v1.3.7] 区分"反复调同一Agent"和"反复调同一工具"，给出更精准的引导
                  const agentRepeatedCalls = repeatedTools.filter(([k]) => k.startsWith('call_agent:'));
                  const toolRepeatedCalls = repeatedTools.filter(([k]) => !k.startsWith('call_agent:'));

                  let warningContent = '';
                  if (agentRepeatedCalls.length > 0) {
                    const agentNames = agentRepeatedCalls.map(([n, c]) => n.replace('call_agent:', '') + `(${c}次)`).join('、');
                    warningContent += `⚠️ 你已反复调用同一个Agent【${agentNames}】多次，它似乎无法完成当前任务或陷入了循环。\n\n`;
                    warningContent += `请立即停止调用此Agent，改为以下操作之一：\n`;
                    warningContent += `1. 基于已获取的信息，直接向用户总结结果\n`;
                    warningContent += `2. 如果任务需要其他Agent（如邮件发送），请改用 call_agent 调用目标Agent\n`;
                    warningContent += `3. 如果该Agent的工具执行失败，尝试用其他工具替代\n\n`;
                  }
                  if (toolRepeatedCalls.length > 0) {
                    const toolNames = toolRepeatedCalls.map(([n, c]) => `${n}(${c}次)`).join('、');
                    warningContent += (agentRepeatedCalls.length > 0 ? '\n另外，' : '⚠️ ') + `你已反复调用工具【${toolNames}】，当前方法似乎不太有效。\n\n建议：换个方向试试。`;
                  }

                  console.log(`[call-ai-with-tools] 检测到重复调用: ${repeatedTools.map(([n,c])=>`${n}(${c}次)`).join('、')}，注入引导`);
                  currentMessages.push({ role: 'user', content: warningContent });
                }
              }
            }

            responded = true;
            break; // 跳出 url 循环，进行下一次 iteration
          }

          // 没有工具调用 → 检查是否需要重试
          // [v1.1.6 增强] 模型在工具失败后容易"退化"为纯文字模式，需要多次强制拉回工具路径
          // [v1.3.4 修复] 只有当 content 为空或明显是糊弄时才重试，避免重复输出
          const content = data.choices[0].message.content || '';
          const misleadingPatterns = [
            /首先打开/, /我来帮你/, /让我来/, /我会操作/, /我将执行/, /正在为你/,
            /首先.*软件/, /让我.*执行/, /我来.*操作/, /现在.*打开/, /下面.*执行/,
            /第一步/, /接下来.*我会/, /开始.*操作/
          ];
          const isMisleading = content.length > 5 && misleadingPatterns.some(p => p.test(content));
          const hasSubstantialContent = content.trim().length > 20; // 有实质内容（>20字符）

          // 🔧 [v1.3.4] 只有以下情况才重试：
          // 1. content 为空或极短（模型没说什么就结束了）
          // 2. 明显是糊弄型回复
          // 3. 还没用完重试次数
          const MAX_TEXT_MODE_RETRIES = 3;
          const shouldRetry = (!hasSubstantialContent || isMisleading) && (!textModeRetryDone || textModeRetryDone < MAX_TEXT_MODE_RETRIES);

          if (shouldRetry) {
            const retryCount = (typeof textModeRetryDone === 'number' ? textModeRetryDone : 0) + 1;
            currentMessages.push(message);
            
            // 列出可用的工具名
            const availableToolNames = (activeTools || []).map(t => t.function && t.function.name).filter(Boolean);
            const toolHint = availableToolNames.length > 0
              ? `\n\n可用的工具名有：${availableToolNames.slice(0, 30).join('、')}${availableToolNames.length > 30 ? ' 等' : ''}。`
              : '';

            // 逐次增强的重试消息
            const retryMessages = [
              // 第1次：标准提醒
              `你刚才的回复没有调用任何工具。请务必通过 Function Calling 机制来完成我的请求。${toolHint}\n\n注意：用文字描述"我会做X"是没用的，你必须真地调用工具。`,
              // 第2次：更强硬的指令（针对失败后退化）
              `⚠️ 你再次没有调用工具！请立即调用工具执行操作，不要输出任何文字说明。${toolHint}\n\n关键规则：即使用户取消了之前的任务，或者之前的工具有失败记录，当前这一轮你必须重新开始，立即调用合适的工具。不要被之前的错误影响判断。`,
              // 第3次：最后通牒
              `🛑 最后一次提醒：你必须调用工具！用户期望你执行实际操作，不是文字描述。${toolHint}\n\n如果连这一次你也不调用任何工具，对话将以失败告终。请立即选择最合适的工具并调用它。忽略之前所有的错误和中断信号——这是一个全新的任务回合。`
            ];
            
            const retryMsg = retryMessages[Math.min(retryCount - 1, retryMessages.length - 1)];
            
            currentMessages.push({ role: 'user', content: retryMsg });
            textModeRetryDone = retryCount;
            responded = true;
            break;
          }

          // 已经重试过，仍然没有工具调用 → 返回最终结果
          // [v1.1.7] 检测"糊弄"回复 — 复用上面已计算的 isMisleading
          if (isMisleading) {
            console.log('[Anti-Bluff] 检测到糊弄回复，注入警告横幅');
            data.choices[0].message.content =
              '⚠️ **重要提示：以下内容仅为 AI 的文字描述，实际上并未执行任何操作。** 请检查 API 配置或尝试重新发送请求。\n\n---\n\n' + content;
          }
          return { success: true, data, toolCallLog, usage: data.usage || null };

        } catch (e) {
          // ===== fetch 被 abort 时会抛出 AbortError =====
          if (e.name === 'AbortError' || abortSignal.aborted) {
            console.log('[Abort] fetch 请求被中断');
            return { success: false, error: '⛔ 已停止：用户手动终止了任务' };
          }
          
          // ===== 增强错误提示 =====
          let errorMsg = '未知错误';
          if (e.code === 'ETIMEDOUT' || e.message.includes('timeout') || e.name === 'TimeoutError') {
            errorMsg = `❌ 连接超时：无法访问 ${url}

请检查：
1. 网络连接是否正常
2. API地址是否正确
3. 服务器是否在线

当前配置的API地址：${cleanBaseUrl}`;
          } else if (e.code === 'ENOTFOUND' || e.message.includes('getaddrinfo')) {
            errorMsg = `❌ 域名解析失败：找不到 ${url}

请检查：
1. 域名是否正确
2. DNS设置是否正常`;
          } else if (e.code === 'ECONNREFUSED') {
            errorMsg = `❌ 连接被拒绝：${url} 无法连接

可能原因：
1. 服务器未启动
2. 端口号错误
3. 防火墙拦截`;
          } else if (e.message.includes('Invalid URL') || e.message.includes('invalid url')) {
            errorMsg = `❌ URL格式错误：${url}

请在设置页面检查 Base URL 配置
当前配置：${cleanBaseUrl}`;
          } else if (e.name === 'TypeError' && e.message.includes('fetch')) {
            errorMsg = `❌ 网络请求失败：${e.message}

请求地址：${url}
可能是网络不可达或API地址配置错误`;
          } else {
            errorMsg = `❌ 网络错误：${e.message}

请求地址：${url}
错误类型：${e.name || 'Unknown'}${e.code ? '\n错误代码：' + e.code : ''}`;
          }
          
          console.error('[call-ai-with-tools] Request error:', errorMsg);
          
          // 如果这是最后一个 URL，返回详细错误；否则继续尝试下一个
          if (url === urls[urls.length - 1]) {
            return { success: false, error: errorMsg };
          }
          continue;
        }
      }

      if (!responded) {
        // 所有 URL 都失败了，返回详细的最后一次错误信息
        return { 
          success: false, 
          error: `❌ API 请求失败\n\n尝试了 ${urls.length} 个端点均无法获取有效响应。\n\n请检查：\n1. Base URL 是否正确（当前：${cleanBaseUrl}）\n2. API Key 是否有效\n3. 网络连接是否正常\n4. 模型名称是否正确（当前：${model}）\n\n如果使用的是代理/中转服务，请确认服务是否正常运行。` 
        };
      }
    }
  } finally {
    // ===== 任务结束时清理全局控制器 =====
    if (_globalAbortController === abortController) {
      _globalAbortController = null;
    }
  }

  return { success: false, error: '工具调用超过最大迭代次数(50)，任务可能过于复杂，请拆分后重试' };
});

// ===================================================================
// 智能规划 AI 调用 Handler（Planner + 执行引擎）
// ===================================================================
ipcMain.handle('call-ai-with-plan', async (event, { messages, config, agentId }) => {
  if (!config) return { success: false, error: '模型配置缺失，请在设置中配置 API Key 和 Base URL' };
  const cleanBaseUrl = (config.baseUrl || '').replace(/\/$/, '');
  if (!cleanBaseUrl) return { success: false, error: 'Base URL 未配置，请在设置页面填写 API 地址' };

  const apiKey = config.apiKey || '';
  const model = config.model || 'gpt-4o';
  const temperature = config.temperature || 0.7;

  // 创建中断控制器
  const abortController = new AbortController();
  _globalAbortController = abortController;
  const abortSignal = abortController.signal;

  // 获取当前 Agent 的工具
  let agentToolNames = null;
  if (agentId && agentId !== 'default') {
    try {
      const agents = safeLoadAgents();
      const agent = agents.find(a => a.id === agentId);
      if (agent && agent.tools) agentToolNames = agent.tools;
    } catch (e) { console.error('[call-ai-with-tools] 加载Agent工具失败:', e.message); }
  }
  let activeTools = getAgentTools(agentToolNames);

  // 流式推送辅助函数
  function sendStream(type, payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ai-stream', { type, ...payload });
    }
  }

  try {
    // ===== 步骤 1：生成执行计划 =====
    sendStream('planning', { message: '正在分析任务...' });

    const userMessage = messages[messages.length - 1];
    const userRequest = userMessage?.content || '';

    const plan = await generatePlan(userRequest, activeTools, config, abortSignal);

    if (abortSignal.aborted) {
      return { success: false, error: '⛔ 已停止：用户手动终止了任务' };
    }

    // 推送计划摘要
    sendStream('plan', {
      analysis: plan.analysis,
      strategy: plan.strategy,
      steps: plan.steps.map(s => ({ id: s.id, description: s.description, tool: s.tool })),
      expectedOutcome: plan.expectedOutcome
    });

    // ===== 步骤 2：执行计划 =====
    let planResults = null;
    let hasToolSteps = plan.steps.some(s => s.tool && s.tool !== '');

    if (hasToolSteps) {
      sendStream('executing', { message: `开始执行，共 ${plan.steps.length} 个步骤...` });

      // ===== 修复：Planner 模式下自动跳过确认对话框，保证工具调用连贯执行 =====
      // 安全审计仍会运行（高危操作记录日志），但不会弹出确认UI阻塞流程
      globalThis._plannerAutoApprove = true;

      planResults = await executePlan(
        plan,
        async (toolName, toolArgs, signal) => {
          // 包装 executeToolSmart，增加进度推送
          sendStream('tool-start', { tool: toolName, args: toolArgs });
          const result = await executeToolSmart(toolName, toolArgs, signal);
          sendStream('tool-done', { tool: toolName, result });
          return result;
        },
        (step, status, result) => {
          sendStream('step-progress', {
            stepId: step.id,
            description: step.description,
            status,
            result: result ? { success: result.success !== false } : null
          });
        },
        abortSignal
      );

      globalThis._plannerAutoApprove = false;

      if (abortSignal.aborted) {
        return { success: false, error: '⛔ 已停止：用户手动终止了任务' };
      }

      // 推送执行摘要
      sendStream('plan-summary', {
        summary: planResults.summary,
        results: Object.entries(planResults.results).map(([id, r]) => ({
          stepId: id,
          success: r && r.success !== false,
          error: r?.error
        }))
      });
    }

    // ===== 步骤 3：生成最终回复（带工具调用）=====
    // 如果 Phase 2 被跳过了（没有工具步骤），Phase 3 必须尝试工具调用
    // 使用 call-ai-with-tools 的完整工具迭代循环逻辑
    if (!planResults) {
      sendStream('generating', { message: '正在执行任务...' });
      
      // 直接用 call-ai-with-tools 的完整逻辑处理（带工具迭代循环）
      const toolMessages = [...messages];
      const toolCallLog = [];
      let toolIterMessages = toolMessages;
      const maxIters = 50;
      
      for (let iter = 0; iter < maxIters; iter++) {
        if (abortSignal.aborted) break;
        
        let responded = false;
        const urls = buildChatUrls(cleanBaseUrl);
        
        for (const url of urls) {
          if (abortSignal.aborted) break;
          try {
            const body = { model, messages: toolIterMessages, temperature, max_tokens: 4096, stream: true };
            if (activeTools && activeTools.length > 0) {
              body.tools = activeTools;
              body.tool_choice = 'auto';
            }
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
              body: JSON.stringify(body),
              signal: abortSignal
            });
            if (!response.ok) {
              console.error(`[Plan|Phase3] HTTP ${response.status}`);
              continue;
            }
            // 🔧 [v1.3.9] 改用 skipStreamEnd=true，与 call-ai-with-tools 保持一致
            //   不由 streamSSETokens 自动发事件，由调用方根据 tool_calls 决定发 stream-reset 还是 stream-end
            const streamResult = await streamSSETokens(response, mainWindow, abortSignal, { skipStreamEnd: true });
            const fullContent = streamResult.fullContent;
            const streamToolCalls = streamResult.toolCalls;

            // 🔧 [v1.3.9] 根据 tool_calls 决定发 stream-reset 还是 stream-end（与其他路径一致）
            if (streamToolCalls.length > 0) {
              // 中间迭代：有工具调用，发 stream-reset
              sendStream('stream-reset', {});
            } else {
              // 最终迭代：纯文本回复，发 stream-end
              sendStream('stream-end', {});
            }

            const message = {
              role: 'assistant',
              content: fullContent || null,
              tool_calls: streamToolCalls.length > 0 ? streamToolCalls : undefined
            };
            const data = { choices: [{ message, finish_reason: streamToolCalls.length > 0 ? 'tool_calls' : 'stop' }] };
            if (fullContent && fullContent.trim().startsWith('<')) continue;
            if (!data?.choices?.[0]) continue;
            
            // ===== 文本模式工具调用解析（兼容不支持 function calling 的模型）=====
            if (!message.tool_calls || message.tool_calls.length === 0) {
              const textToolCall = parseTextModeToolCall(message.content);
              if (textToolCall && textToolCall.tool) {
                message.tool_calls = [{
                  id: 'textmode_' + Date.now(),
                  type: 'function',
                  function: {
                    name: textToolCall.tool,
                    arguments: JSON.stringify(textToolCall.args || {})
                  }
                }];
                console.log('[TextMode|Plan] 解析到文本模式工具调用:', textToolCall.tool);
              }
            }
            
            // 有工具调用 → 执行
            if (message.tool_calls && message.tool_calls.length > 0) {
              sendStream('tool-start', { tool: message.tool_calls[0].function?.name || 'unknown' });
              toolIterMessages.push(message);
              
              for (const tc of message.tool_calls) {
                let toolName = tc.function?.name || '';
                let toolArgs;
                try { toolArgs = JSON.parse(tc.function?.arguments || '{}'); } catch(e) { toolArgs = {}; }
                toolCallLog.push({ tool: toolName, args: toolArgs });
                const toolResult = await executeToolSmart(toolName, toolArgs, abortSignal);
                let toolResultStr = JSON.stringify(toolResult);
                if (toolResultStr.length > 2000) {
                  toolResultStr = toolResultStr.slice(0, 2000) + '...[内容已截断]';
                }
                toolIterMessages.push({ role: 'tool', tool_call_id: tc.id, content: toolResultStr });
              }
              responded = true;
              break;
            }
            
            // 没有工具调用 → 返回最终结果
            sendStream('done', {});
            return { success: true, data, toolCallLog, plan: null, executionSummary: null };
          } catch(e) {
            if (e.name === 'AbortError' || abortSignal.aborted) break;
            if (url === urls[urls.length - 1]) {
              if (iter >= 2) return { success: false, error: '请求失败: ' + e.message };
            }
          }
        }
        if (!responded) break;
      }
      return { success: false, error: '已达到最大执行轮数' };
    }

    // === 原有 Phase 3：基于 Plan 结果生成回复 ===
    sendStream('generating', { message: '正在生成回复...' });

    // 构建最终消息
    const finalMessages = [...messages];

    // 如果有计划结果，将精简结果作为上下文加入（防止消息体过大导致 API 拒绝）
    if (planResults) {
      const stepResults = Object.entries(planResults.results).map(([id, r]) => {
        const step = plan.steps.find(s => s.id === id);
        const status = r.success !== false ? '成功' : '失败';
        const err = r.error ? ` (${String(r.error).slice(0, 100)})` : '';
        return `- ${step?.description || id}: ${status}${err}`;
      }).join('\n');

      const resultContext = `\n\n[执行结果摘要] ${planResults.summary.message}\n步骤状态：\n${stepResults}`;

      // 替换最后一条用户消息，加入执行结果上下文
      finalMessages[finalMessages.length - 1] = {
        ...userMessage,
        content: userMessage.content + resultContext
      };
    }

    // 调用 LLM 生成最终回复
    // ===== Phase 3 策略：先不带 tools 直接生成总结，如需工具操作再带 tools 重试 =====
    const finalMessagesLocal = [...finalMessages];
    let lastApiError = '';
    let toolsRemoved = false; // 标记是否已降级（移除 tools）
    // Phase 3 默认不带 tools（工具在 Phase 2 已执行完），如果响应中有工具调用再处理
    let phase3ActiveTools = activeTools; // Phase 3 始终保留 tools 能力，让模型在总结时还能继续调用工具
    // [backport from 1.0.7-fix] urls 提到循环外声明，避免 return 错误信息时报 "urls is not defined"
    const phase3Urls = buildChatUrls(cleanBaseUrl);
    // [backport] 跟踪"模型是否反复调工具但没给最终回复"的情况
    let phase3StuckInToolLoop = false;
    let phase3ToolCallRounds = 0;
    const PHASE3_MAX_TOOL_ROUNDS = 12;   // 🔧 [v1.3.6] 5→12：复杂任务（如调用Agent协同）需要更多轮次
    const PHASE3_FORCE_FINAL_AFTER = 6;  // 🔧 [v1.3.6] 3→6：给模型足够探索空间
    // 🔧 [v1.3.6] 同一工具重复调用检测——模型卡在同一个工具上反复尝试时，主动引导换思路
    const phase3ToolCallHistory = []; // 记录每轮调用的工具名列表
    const SAME_TOOL_REPEAT_THRESHOLD = 3; // 同一工具被连续调用3次时触发引导
    for (let finalIter = 0; finalIter < PHASE3_MAX_TOOL_ROUNDS; finalIter++) {
      if (abortSignal.aborted) {
        return { success: false, error: '⛔ 已停止：用户手动终止了任务' };
      }

      let responded = false;
      const urls = phase3Urls;

      for (const url of urls) {
        if (abortSignal.aborted) break;

        try {
          const body = {
            model,
            messages: finalMessagesLocal,
            temperature,
            max_tokens: 4096,
            stream: true  // 🔧 [v1.3.2] 流式输出
          };

          // Phase 3 按策略决定是否带工具
          if (phase3ActiveTools && phase3ActiveTools.length > 0) {
            body.tools = phase3ActiveTools;
            body.tool_choice = 'auto';
          }

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body),
            signal: abortSignal
          });

          // 🔧 [v1.3.2] 改用流式 SSE 读取
          // 🔧 [v1.3.8] 默认不发 stream-end（中间迭代可能还有 tool_calls）
          const streamResult = await streamSSETokens(response, mainWindow, abortSignal, { skipStreamEnd: true });
          const fullContent = streamResult.fullContent;
          const streamToolCalls = streamResult.toolCalls;

          // 🔧 [v1.3.8] 根据本轮结果决定发什么事件给 renderer
          if (streamToolCalls.length > 0) {
            // 中间迭代：有工具调用，不需要 finalize
            sendStream('stream-reset', {});
          } else {
            // 最终迭代：纯文本回复，需要 finalize
            sendStream('stream-end', {});
          }
          if (fullContent && fullContent.trim().startsWith('<')) {
            console.log('[PlanFinal] HTML response at', url, 'skipping');
            lastApiError = `服务器返回 HTML（可能是网关 404/反代错误页），URL: ${url}`;
            continue;
          }

          const message = {
            role: 'assistant',
            content: fullContent || null,
            tool_calls: streamToolCalls.length > 0 ? streamToolCalls : undefined
          };
          const data = { choices: [{ message, finish_reason: streamToolCalls.length > 0 ? 'tool_calls' : 'stop' }] };
          if (!data || !data.choices || !data.choices[0]) {
            const apiErr = data?.error?.message || data?.error?.code || JSON.stringify(data).slice(0, 300);
            console.error('[PlanFinal] API error:', apiErr);
            // 记录所有错误（不只是 tools 相关的）
            lastApiError = apiErr;
            // 如果带了 tools 且 API 报错，立即触发降级
            if (phase3ActiveTools && phase3ActiveTools.length > 0 && !toolsRemoved) {
              phase3ActiveTools = [];
              toolsRemoved = true;
              console.log('[PlanFinal] 检测到带tools请求失败，降级为无tools模式');
              sendStream('generating', { message: '正在生成回复...' });
              // 直接再发一次不带tools的请求
              try {
                const bodyNoTools = { model, messages: finalMessagesLocal, temperature, max_tokens: 4096 };
                const resp2 = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(bodyNoTools), signal: abortSignal });
                const buf2 = await resp2.arrayBuffer();
                const txt2 = new TextDecoder('utf-8').decode(buf2);
                if (!txt2.trim().startsWith('<')) {
                  let data2;
                  try { data2 = parseApiResponse(txt2); } catch(e2) { data2 = null; }
                  if (data2?.choices?.[0]) {
                    const msg2 = data2.choices[0].message;
                    if (msg2 && (msg2.content || msg2.tool_calls)) {
                      sendStream('done', {});
                      return { success: true, data: data2, plan: plan._fallback ? null : plan, executionSummary: planResults?.summary || null };
                    }
                    // [backport] 降级请求返回了 JSON 但没有有效 content，要更新 lastApiError
                    const fallbackErr = data2?.error?.message || data2?.error?.code || JSON.stringify(data2).slice(0, 200);
                    lastApiError = `降级请求被拒绝：${fallbackErr}`;
                  } else {
                    // [backport] 降级请求返回了 JSON 但没有 choices
                    lastApiError = `降级请求返回空响应（URL: ${url}）`;
                  }
                } else {
                  // [backport] 降级请求也返回了 HTML
                  lastApiError = `降级请求返回 HTML（URL: ${url}）`;
                }
              } catch(e2) {
                console.error('[PlanFinal] 降级请求失败:', e2.message);
                // [backport] 降级请求异常也要更新 lastApiError
                lastApiError = `降级请求异常：${e2.message}`;
              }
            }
            continue;
          }

          // ===== 文本模式工具调用解析（兼容不支持 function calling 的模型）=====
          if (!message.tool_calls || message.tool_calls.length === 0) {
            const textToolCall = parseTextModeToolCall(message.content);
            if (textToolCall && textToolCall.tool) {
              message.tool_calls = [{
                id: 'textmode_' + Date.now(),
                type: 'function',
                function: {
                  name: textToolCall.tool,
                  arguments: JSON.stringify(textToolCall.args || {})
                }
              }];
              // [v1.1.2] 剥除消息中的 <think> 和 <tool_call> 标签，避免污染 UI 和消息历史
              const thinkStripRe = new RegExp('<think>[\\s\\S]*?<\\/think>', 'gi');
              const toolCallStripRe = new RegExp('<tool_call>[\\s\\S]*?<\\/tool_call>', 'gi');
              message.content = (message.content || '')
                .replace(thinkStripRe, '')
                .replace(toolCallStripRe, '')
                .trim();
              console.log('[TextMode|PlanFinal] 解析到文本模式工具调用:', textToolCall.tool);
            }
          }

          // ===== 如果有工具调用，执行工具然后继续循环 =====
          if (message.tool_calls && message.tool_calls.length > 0) {
            sendStream('executing', { message: '正在执行工具调用...' });
            finalMessagesLocal.push(message);

            // 🔧 [v1.3.6] 记录本轮调用的工具名，用于重复检测
            // 🔧 [v1.3.7] 对于 call_agent 附加目标Agent名，精确检测反复调同一Agent
            const roundToolNames = message.tool_calls.map(tc => {
              const baseName = tc.function?.name || 'unknown';
              if (baseName === 'call_agent') {
                try {
                  const parsedArgs = JSON.parse(tc.function?.arguments || '{}');
                  const tid = parsedArgs.agentId || '';
                  if (tid) {
                    const allAgents = safeLoadAgents();
                    const ta = allAgents.find(a => a.id === tid || a.name === tid);
                    return ta ? `call_agent:${ta.name}` : `call_agent:${tid}`;
                  }
                } catch(e) {}
              }
              return baseName;
            }).filter(Boolean);
            phase3ToolCallHistory.push(...roundToolNames);

            for (const tc of message.tool_calls) {
              let toolName = tc.function?.name || '';
              let toolArgs;
              try { toolArgs = JSON.parse(tc.function?.arguments || '{}'); }
              catch (e) { toolArgs = {}; }

              sendStream('tool-start', { tool: toolName, args: toolArgs });
              const toolResult = await executeToolSmart(toolName, toolArgs, abortSignal);
              sendStream('tool-done', { tool: toolName, result: toolResult });

              // 限制 tool result 长度，防止消息体膨胀导致 API 拒绝
              let toolResultStr = JSON.stringify(toolResult);
              if (toolResultStr.length > 2000) {
                toolResultStr = toolResultStr.slice(0, 2000) + '...[内容已截断]';
              }

              finalMessagesLocal.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: toolResultStr
              });
            }

            // [backport] 累计工具调用轮数；超过阈值就强制要求模型给最终回复
            phase3ToolCallRounds++;
            phase3StuckInToolLoop = true;

            // 🔧 [v1.3.6] 同一工具重复调用检测：如果某个工具被连续/频繁调用，主动引导换思路
            const toolFreq = {};
            phase3ToolCallHistory.forEach(t => { toolFreq[t] = (toolFreq[t] || 0) + 1; });
            const repeatedTools = Object.entries(toolFreq).filter(([, count]) => count >= SAME_TOOL_REPEAT_THRESHOLD).map(([name, count]) => `${name}(${count}次)`);

            if (phase3ToolCallRounds >= PHASE3_FORCE_FINAL_AFTER) {
              console.log(`[PlanFinal] 模型已连续 ${phase3ToolCallRounds} 轮调工具，注入强提示要求用文字回复`);

              // 🔧 [v1.3.7] 根据是否有重复工具调用，生成不同的引导提示
              let forceFinalMsg;
              const agentRepeated = repeatedTools.filter(([k]) => k.startsWith('call_agent:'));
              const toolRepeated = repeatedTools.filter(([k]) => !k.startsWith('call_agent:'));

              if (agentRepeated.length > 0) {
                // 有Agent被反复调用 → 强制停止并要求换思路
                const agentNames = agentRepeated.map(([n]) => n.replace('call_agent:', '')).join('、');
                forceFinalMsg = '【系统强制提示】你已连续调用工具 ' + phase3ToolCallRounds + ' 轮未给出最终回复。\n\n⚠️ 检测到你反复调用同一个Agent【' + agentNames + '】共 ' + agentRepeated.length + ' 种重复。这表明该Agent无法完成当前任务或你陷入了循环。\n\n请立即换思路：\n1. 基于已获取的所有信息，直接向用户总结结果\n2. 如果还需要其他能力（如发邮件），改用 call_agent 调用对应的专门Agent\n3. 不要再调用 [' + agentNames + '] 了\n\n现在 tools 字段已被强制清空，禁止再尝试调用任何工具。直接用自然语言向用户说明：1）你尝试做了什么；2）已获取了哪些信息；3）最终结论或建议用户如何继续。';
              } else if (toolRepeated.length > 0) {
                // 有工具被反复调用（非Agent）
                forceFinalMsg = '【系统强制提示】你已连续调用工具 ' + phase3ToolCallRounds + ' 轮未给出最终回复。\n\n⚠️ 检测到以下工具被重复调用：' + toolRepeated.map(([n,c])=>`${n}(${c}次)`).join('、') + '。这表明当前方法行不通。\n\n请立即换一个完全不同的思路：\n1. 如果你在反复搜索知识库但找不到信息 → 直接用你已有的知识回答，或告诉用户需要什么信息\n2. 如果任务需要调用其他Agent → 使用 call_agent 工具（先用 list_agents 查看可用Agent列表）\n3. 如果工具执行失败 → 不要重试同一个失败的工具，尝试替代方案\n\n现在 tools 字段已被强制清空，禁止再尝试调用任何工具。直接用自然语言向用户说明：1）你尝试做了什么；2）遇到了什么阻碍；3）建议用户如何继续。';
              } else {
                // 只是轮数多但没有重复工具 → 标准的强制最终回复提示
                forceFinalMsg = '【系统强制提示】你已连续调用工具 ' + phase3ToolCallRounds + ' 轮未给出最终回复。现在 tools 字段已被强制清空，禁止再尝试调用任何工具。直接用自然语言向用户说明：1）你尝试做了什么；2）遇到了什么阻碍（缺什么工具 / 工具失败 / 任务超出能力）；3）建议用户如何继续。';
              }

              // [v1.1.2 修复] 强制清空 tools 字段 + 注入 system 级别提示，确保模型一定停止调工具
              phase3ActiveTools = [];
              toolsRemoved = true;
              finalMessagesLocal.push({ role: 'system', content: forceFinalMsg });
            } else if (repeatedTools.length > 0 && phase3ToolCallRounds >= 3) {
              // 🔧 [v1.3.6] 还没达到强制阈值，但已有重复工具 → 注入温和提醒（不清空tools）
              // 🔧 [v1.3.7] 区分Agent重复和普通工具重复
              const agentRepeatedEarly = repeatedTools.filter(([k]) => k.startsWith('call_agent:'));
              const toolRepeatedEarly = repeatedTools.filter(([k]) => !k.startsWith('call_agent:'));

              let earlyWarning = '⚠️ 提醒：你已经在 ' + phase3ToolCallRounds + ' 轮中';
              if (agentRepeatedEarly.length > 0) {
                const aNames = agentRepeatedEarly.map(([n,c]) => n.replace('call_agent:', '') + `(${c}次)`).join('、');
                earlyWarning += `反复调用同一个【${aNames}】Agent`;
                if (toolRepeatedEarly.length > 0) {
                  const tNames = toolRepeatedEarly.map(([n,c]) => `${n}(${c}次)`).join('、');
                  earlyWarning += `，以及反复调用工具【${tNames}】`;
                }
              } else if (toolRepeatedEarly.length > 0) {
                const tNames = toolRepeatedEarly.map(([n,c]) => `${n}(${c}次)`).join('、');
                earlyWarning += `重复调用了【${tNames}】工具`;
              }
              earlyWarning += '，当前方法似乎不太有效。\n\n';

              if (agentRepeatedEarly.length > 0) {
                earlyWarning += `建议：\n- 停止调用该Agent，基于已获取的信息直接回答\n- 或改用 call_agent 调用其他专门的Agent完成任务\n\n请不要再重复调用同一个Agent了。`;
              } else {
                earlyWarning += '建议你换个思路：\n- 如果要调用其他Agent完成任务 → 请使用 list_agents 先查看可用Agent列表，再用 call_agent 调用\n- 如果在搜索知识库 → 搜索结果不理想的话，基于已有信息直接回答即可\n- 如果工具报错 → 尝试使用其他功能相似的工具\n\n请不要再重复调用同样的工具了，换个方向试试。';
              }

              console.log(`[PlanFinal] 检测到工具重复调用: ${repeatedTools.map(([n,c])=>`${n}(${c}次)`).join('、')}，第${phase3ToolCallRounds}轮，注入引导`);
              finalMessagesLocal.push({ role: 'user', content: earlyWarning });
            }

            responded = true;
            break; // 继续下一个 finalIter 循环
          }

          // 没有工具调用 → 返回最终结果
          sendStream('done', {});
          return {
            success: true,
            data,
            plan: plan._fallback ? null : plan,
            executionSummary: planResults?.summary || null
          };

        } catch (e) {
          if (e.name === 'AbortError' || abortSignal.aborted) {
            return { success: false, error: '⛔ 已停止：用户手动终止了任务' };
          }
          // [backport] catch 块必须更新 lastApiError，否则真实错误信息会丢失 → 通用报错
          const errMsg = `${e.name || 'Error'}: ${e.message || e.toString()}`;
          console.error('[PlanFinal] Network/fetch error at', url, ':', errMsg);
          lastApiError = `网络错误（${url}）：${errMsg}`;
          if (url === urls[urls.length - 1]) {
            if (finalIter === PHASE3_MAX_TOOL_ROUNDS - 1) {
              return { success: false, error: `❌ 请求失败：${errMsg}\n\nURL: ${url}` };
            }
          }
        }
      }

          // ===== 所有 URL 都失败了，检查是否需要降级（移除 tools）重试 =====
      if (!responded) {
        if (lastApiError && !toolsRemoved) {
          console.log('[PlanFinal] API 不支持 tools，降级为无工具模式重试。错误:', lastApiError);
          phase3ActiveTools = []; // 清空 tools
          toolsRemoved = true;
          lastApiError = '';
          sendStream('generating', { message: '正在生成回复...' });
          continue; // 继续下一个 finalIter 循环（不带 tools）
        }
        break; // 降级后也失败了，退出循环
      }
    }

    // 🔧 [v1.3.6] 构建工具调用历史摘要，用于错误信息展示
    const toolHistorySummary = phase3ToolCallHistory.length > 0
      ? (() => {
          const freq = {};
          phase3ToolCallHistory.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
          return Object.entries(freq).map(([name, count]) => `  • ${name}：${count}次`).join('\n');
        })()
      : '（无）';

    return {
      success: false,
      error: phase3StuckInToolLoop
        ? `❌ 错误：🔧 模型陷入工具调用循环\n\n模型连续 ${phase3ToolCallRounds} 轮都返回了工具调用，但始终没有给出最终回复。\n\n📋 工具调用历史：\n${toolHistorySummary}\n\n${lastApiError ? '🔍 末次API错误：' + lastApiError + '\n\n' : ''}可能原因：\n1. 模型反复尝试同一个工具（如反复搜索知识库），但没有换思路\n2. 模型应该使用 call_agent 调用专业Agent，但一直用其他工具绕路\n3. 任务需要的工具当前系统不支持（如某些桌面自动化操作）\n4. 工具返回的结果不足以完成任务，模型不知道下一步该怎么走\n\n建议：\n• 把任务拆成更小的子任务分步执行\n• 如果涉及Agent协作，明确告诉模型"请用call_agent调用XXXAgent"\n• 或直接说"不要再调工具，先用文字回复"\n\n当前配置：\n• Base URL：${cleanBaseUrl}\n• 模型：${model}\n• 工具调用轮数：${phase3ToolCallRounds}/${PHASE3_MAX_TOOL_ROUNDS}`
        : `❌ 规划模式 API 请求失败\n\n尝试了所有端点均无法获取有效响应。\n\n${lastApiError ? '🔍 真实错误：' + lastApiError + '\n\n' : '⚠️ 未捕获到具体错误（已修复错误处理路径，请重试一次以获取详细信息）\n\n'}当前配置：\n• Base URL：${cleanBaseUrl}\n• 模型：${model}\n• 降级已尝试：${toolsRemoved ? '是（已移除 tools 重试）' : '否'}\n• 尝试轮数：${PHASE3_MAX_TOOL_ROUNDS} × ${phase3Urls.length} 个端点\n\n可能原因：\n1. 网络不通或网关离线\n2. API Key 错误或过期\n3. 模型名 ${model} 在该网关上不支持\n4. 网关代理/反代返回 HTML 错误页（已记录到上方）\n5. 请求被网关拒绝（如 CORS/鉴权失败）`
    };

  } catch (e) {
    if (e.name === 'AbortError' || abortSignal.aborted) {
      return { success: false, error: '⛔ 已停止：用户手动终止了任务' };
    }
    console.error('[call-ai-with-plan] Error:', e);
    return { success: false, error: `规划执行失败: ${e.message}` };
  } finally {
    if (_globalAbortController === abortController) {
      _globalAbortController = null;
    }
  }
});

// 简单 AI 调用（不带工具）
ipcMain.handle('call-ai', async (event, { messages, config }) => {
  if (!config) return { success: false, error: '模型配置缺失' };
  const cleanBaseUrl = (config.baseUrl || '').replace(/\/$/, '');
  const apiKey = config.apiKey || '';
  const model = config.model || 'gpt-4o';
  const urls = buildChatUrls(cleanBaseUrl);
  // 🔧 [v1.3.9-diag-v2] 诊断——打印接收到的配置和生成的 URL
  console.log('[call-ai] 收到配置:', JSON.stringify({
    baseUrl: config.baseUrl, model: config.model, apiKey_len: (config.apiKey || '').length
  }));
  console.log('[call-ai] 实际使用:', { cleanBaseUrl, model, urls, apiKey_len: apiKey.length });
  
  // [v1.3.2] 流式读取，token 实时推送
  const abortController = new AbortController();
  _globalAbortController = abortController;
  const abortSignal = abortController.signal;

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096, stream: true }),
        signal: abortSignal
      });
      if (!response.ok) { console.error(`[call-ai] HTTP ${response.status}`); continue; }
      // 流式 SSE 读取（内置非流式回退）
      const streamResult = await streamSSETokens(response, mainWindow, abortSignal);
      const fullContent = streamResult.fullContent;
      const content = fullContent || '';
      const streamToolCalls = streamResult.toolCalls;
      // 🔧 [v1.3.9-diag] 诊断日志
      console.log('[call-ai] fullContent_len=', content.length, 'toolCalls_len=', streamToolCalls.length, 'content_preview=', content.substring(0, 80));
      if (content.trim().startsWith('<')) continue;
      
      const message = {
        role: 'assistant',
        content: content || null,
        tool_calls: streamToolCalls.length > 0 ? streamToolCalls : undefined
      };
      const data = { choices: [{ message, finish_reason: streamToolCalls.length > 0 ? 'tool_calls' : 'stop' }] };
      if (message.content && (!message.tool_calls || message.tool_calls.length === 0)) {
        const textToolCall = parseTextModeToolCall(message.content);
        if (textToolCall && textToolCall.tool) {
          // 剥除原始内容中的伪调用标签，避免污染 UI
          const thinkStripRe = new RegExp('<think>[\\s\\S]*?<\\/think>', 'gi');
          const tcStripRe = new RegExp('<tool_call[^>]*>[\\s\\S]*?<\\/tool_call>', 'gi');
          const tcOpenRe = new RegExp('<tool_call\\s*\\([\\s\\S]*?\\)\\s*\\)', 'gi');
          const tcAttrRe = new RegExp('<tool\\s+call\\s*=\\s*"[^"]*"[^>]*>', 'gi');
          message.content = (message.content || '')
            .replace(thinkStripRe, '')
            .replace(tcStripRe, '')
            .replace(tcOpenRe, '')
            .replace(tcAttrRe, '')
            .trim();
          // 附加工具调用结果到返回数据
          data._textModeToolCall = textToolCall;
          console.log('[callAI] 解析到文本模式工具调用:', textToolCall.tool);
        }
      }
      
      return { success: true, data };
    } catch (e) {
      if (e.name === 'AbortError' || abortSignal.aborted) {
        return { success: false, error: '⛔ 已停止：用户手动终止了任务' };
      }
      console.error('[call-ai] 请求失败:', e.message); 
      continue;
    }
  }
  if (_globalAbortController === abortController) _globalAbortController = null;
  return { success: false, error: '请求失败，请检查API配置' };
});

ipcMain.handle('test-connection', async (event, config) => {
  const cleanBaseUrl = (config.baseUrl || '').replace(/\/$/, '');
  const urls = buildChatUrls(cleanBaseUrl);
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey || ''}` },
        body: JSON.stringify({ model: config.model || 'gpt-4o', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })
      });
      const arrayBuf = await response.arrayBuffer();
      const text = new TextDecoder('utf-8').decode(arrayBuf);
      if (text.trim().startsWith('<')) continue;
      const data = JSON.parse(text);
      if (data?.choices || data?.error) return { success: true, url };
    } catch (e) { continue; }
  }
  return { success: false, error: '连接失败，请检查 URL 和 API Key' };
});

ipcMain.handle('list-models', async (event, config) => {
  const cleanBase = (config.baseUrl || '').replace(/\/$/, '');
  const baseEndsWithV1 = /\/v1\/?$/.test(cleanBase);
  const endpoints = baseEndsWithV1 ? [cleanBase + '/models'] : [cleanBase + '/v1/models', cleanBase + '/models'];
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, { headers: { 'Authorization': 'Bearer ' + (config.apiKey || ''), 'Accept': 'application/json' } });
      const buf = await res.arrayBuffer();
      const txt = new TextDecoder('utf-8').decode(buf);
      if (!txt.trim().startsWith('{') && !txt.trim().startsWith('[')) continue;
      const data = JSON.parse(txt);
      const models = (data.data || data.models || []).map(m => m.id || m.name || m).filter(Boolean);
      if (models.length > 0) return { success: true, models };
    } catch (e) { continue; }
  }
  return { success: false, error: '无法获取模型列表，请手动输入' };
});

// 重复注册已移除
