/**
 * 灵动AI - AutoHotkey 执行器模块
 *
 * 功能：
 * 1. findAutoHotkeyPath() - 自动检测 AutoHotkey.exe 安装路径（优先内置，其次系统）
 * 2. runAhkScript(code, timeoutMs) - 执行 AHK 代码块
 * 3. runAhkCommand(command, timeoutMs) - 执行单行 AHK 命令
 * 4. checkAhkInstalled() - 检查 AHK 是否可用
 *
 * AHK 检测优先级：
 * 1. 内置 AutoHotkey64.exe（libs/ahk/AutoHotkey64.exe，v1 版本）— 无需用户安装
 * 2. 系统 AHK v1（C:\Program Files\AutoHotkey\AutoHotkey.exe）
 * 3. 系统 AHK v2（C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe）
 * 4. PATH 环境变量
 * 5. 注册表 InstallDir
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================================
// 路径检测
// ============================================================================

// 内置 AHK 路径（打包在应用内，无需用户安装）
const BUNDLED_AHK_PATH = path.join(__dirname, 'libs', 'ahk', 'AutoHotkey64.exe');
// 内置 AHK 提取后的运行路径（asar 内的 exe 无法直接执行，需提取到临时目录）
const BUNDLED_AHK_EXTRACTED = path.join(os.tmpdir(), 'lobster-ahk', 'AutoHotkey64.exe');

// 系统 AHK 搜索路径（v1 优先，因为内置代码都是 v1 语法）
const SYSTEM_AHK_PATHS = [
  // === AutoHotkey v1 路径（优先，确保语法一致）===
  'C:\\Program Files\\AutoHotkey\\AutoHotkey.exe',
  'C:\\Program Files (x86)\\AutoHotkey\\AutoHotkey.exe',
  path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'AutoHotkey', 'AutoHotkey.exe'),
  path.join(os.homedir(), 'AutoHotkey', 'AutoHotkey.exe'),
  // === AutoHotkey v2 路径（兼容）===
  'C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey64.exe',
  'C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey.exe',
  'C:\\Program Files (x86)\\AutoHotkey\\v2\\AutoHotkey64.exe',
  path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'AutoHotkey', 'v2', 'AutoHotkey64.exe'),
];

let _cachedAhkPath = null;
let _isBundled = false;

/**
 * 从 asar 中提取内置 AHK 到临时目录（asar 内的 exe 无法直接 spawn）
 * @returns {string|null} 提取后的路径，失败返回 null
 */
function extractBundledAhk() {
  try {
    // 检查是否已在 asar 内（打包后 __dirname 包含 app.asar）
    const isPacked = __dirname.includes('app.asar');
    
    // 如果不在 asar 内（开发模式），直接用原始路径
    if (!isPacked && fs.existsSync(BUNDLED_AHK_PATH)) {
      return BUNDLED_AHK_PATH;
    }
    
    // asar 模式或提取后的文件不存在/损坏时，需要提取
    const extractedDir = path.dirname(BUNDLED_AHK_EXTRACTED);
    if (!fs.existsSync(extractedDir)) {
      fs.mkdirSync(extractedDir, { recursive: true });
    }
    
    // 检查提取后的文件是否已存在且完整（比较大小）
    if (fs.existsSync(BUNDLED_AHK_EXTRACTED)) {
      const srcStat = fs.statSync(BUNDLED_AHK_PATH);
      const dstStat = fs.statSync(BUNDLED_AHK_EXTRACTED);
      if (srcStat.size === dstStat.size) {
        return BUNDLED_AHK_EXTRACTED;
      }
    }
    
    // 提取文件
    fs.copyFileSync(BUNDLED_AHK_PATH, BUNDLED_AHK_EXTRACTED);
    console.log('[AHK] 已提取内置 AutoHotkey 到:', BUNDLED_AHK_EXTRACTED);
    return BUNDLED_AHK_EXTRACTED;
  } catch (e) {
    console.error('[AHK] 提取内置 AutoHotkey 失败:', e.message);
    return null;
  }
}

/**
 * 自动检测 AutoHotkey.exe 路径
 * 优先级：内置 > 系统 v2 > 系统 v1 > PATH > 注册表
 * @returns {string|null} AHK 路径，未找到返回 null
 */
function findAutoHotkeyPath() {
  if (_cachedAhkPath && fs.existsSync(_cachedAhkPath)) {
    return _cachedAhkPath;
  }

  // 0. 最高优先：内置 AutoHotkey64.exe（打包在应用内，开箱即用）
  // asar 内无法直接执行 exe，需要先提取到临时目录
  const extractedPath = extractBundledAhk();
  if (extractedPath) {
    _cachedAhkPath = extractedPath;
    _isBundled = true;
    console.log('[AHK] 使用内置 AutoHotkey:', extractedPath);
    return extractedPath;
  }

  // 1. 检查系统安装路径（v2 优先于 v1）
  for (const p of SYSTEM_AHK_PATHS) {
    if (fs.existsSync(p)) {
      _cachedAhkPath = p;
      _isBundled = false;
      console.log('[AHK] 使用系统 AutoHotkey:', p);
      return p;
    }
  }

  // 2. 检查 PATH 环境变量
  try {
    const whereOutput = execSync('where AutoHotkey.exe 2>nul', { encoding: 'utf8', timeout: 5000 });
    const found = whereOutput.trim().split('\n')[0].trim();
    if (found && fs.existsSync(found)) {
      _cachedAhkPath = found;
      _isBundled = false;
      return found;
    }
  } catch (e) {
    // where 命令失败，继续
  }

  // 3. 检查注册表
  try {
    const regOutput = execSync(
      'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\AutoHotkey" /v InstallDir 2>nul || reg query "HKEY_CURRENT_USER\\SOFTWARE\\AutoHotkey" /v InstallDir 2>nul',
      { encoding: 'utf8', timeout: 5000 }
    );
    const match = regOutput.match(/InstallDir\s+REG_SZ\s+(\S.+)/);
    if (match) {
      const installDir = match[1].trim();
      // 先尝试 v2 子目录
      const v2Path = path.join(installDir, 'v2', 'AutoHotkey64.exe');
      if (fs.existsSync(v2Path)) {
        _cachedAhkPath = v2Path;
        _isBundled = false;
        return v2Path;
      }
      // 再尝试根目录（v1）
      const exePath = path.join(installDir, 'AutoHotkey.exe');
      if (fs.existsSync(exePath)) {
        _cachedAhkPath = exePath;
        _isBundled = false;
        return exePath;
      }
    }
  } catch (e) {
    // 注册表查询失败
  }

  // 4. 最后一招：尝试 Start Menu 快捷方式解析
  try {
    const startMenuDir = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs';
    const items = fs.readdirSync(startMenuDir).filter(f => f.toLowerCase().includes('autohotkey'));
    for (const item of items) {
      const lnkPath = path.join(startMenuDir, item);
      // 用 PowerShell 解析快捷方式目标
      const psCmd = `$sh = New-Object -ComObject WScript.Shell; $sh.CreateShortcut('${lnkPath}').TargetPath`;
      const target = execSync(`powershell -NoProfile -Command "${psCmd}"`, { encoding: 'utf8', timeout: 5000 }).trim();
      if (target && fs.existsSync(target)) {
        _cachedAhkPath = target;
        _isBundled = false;
        console.log('[AHK] 从开始菜单找到:', target);
        return target;
      }
    }
  } catch (e) {
    // 开始菜单解析失败
  }

  console.log('[AHK] 未找到任何 AutoHotkey 安装');
  return null;
}

/**
 * 检查当前使用的是否为内置 AHK
 * @returns {boolean}
 */
function isBundledAhk() {
  return _isBundled;
}

/**
 * 检查 AutoHotkey 是否已安装（含内置版本）
 * @returns {{installed: boolean, path?: string, bundled: boolean, message: string}}
 */
function checkAhkInstalled() {
  const ahkPath = findAutoHotkeyPath();
  if (ahkPath) {
    const bundled = isBundledAhk();
    return {
      installed: true,
      path: ahkPath,
      bundled,
      message: bundled
        ? 'AutoHotkey 已就绪（内置版本）: ' + ahkPath
        : 'AutoHotkey 已安装: ' + ahkPath
    };
  }
  return {
    installed: false,
    bundled: false,
    message: 'AutoHotkey 未安装。请从 https://www.autohotkey.com/ 下载安装（推荐 v2 版本）。\n安装后重启灵动AI即可使用 AHK 自动化功能。'
  };
}

// ============================================================================
// 脚本执行
// ============================================================================

/**
 * 执行 AHK 代码块
 * @param {string} code - AHK 代码（v2 语法）
 * @param {number} timeoutMs - 超时毫秒，默认 30000
 * @returns {Promise<{success: boolean, output?: string, error?: string, exitCode?: number}>}
 */
function runAhkScript(code, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const ahkPath = findAutoHotkeyPath();
    if (!ahkPath) {
      resolve({
        success: false,
        error: 'AutoHotkey 未安装。请从 https://www.autohotkey.com/ 下载安装（推荐 v2 版本）。安装后重启灵动AI即可使用。'
      });
      return;
    }

    // 生成临时 .ahk 文件（UTF-8 with BOM 确保中文不乱码）
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `ld-ahk-${Date.now()}.ahk`);

    // AHK v1 使用 UTF-8 BOM 确保中文不乱码
    const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
    const codeBuffer = Buffer.from(code, 'utf8');
    fs.writeFileSync(tmpFile, Buffer.concat([bom, codeBuffer]));

    let stdout = '';
    let stderr = '';
    let killed = false;

    const child = spawn(ahkPath, [tmpFile], {
      encoding: 'utf8',
      windowsHide: true
    });

    const timeoutId = setTimeout(() => {
      killed = true;
      try { child.kill('SIGTERM'); } catch (e) {}
      // 强制清理
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (e) {}
      }, 2000);
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      stdout += data.toString('utf8');
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString('utf8');
    });

    child.on('close', (exitCode) => {
      clearTimeout(timeoutId);
      // 清理临时文件
      try { fs.unlinkSync(tmpFile); } catch (e) {}

      if (killed) {
        resolve({ success: false, error: `AHK 脚本执行超时（${timeoutMs}ms），已强制终止`, output: stdout.slice(0, 2000) });
        return;
      }

      if (exitCode !== 0 && exitCode !== null) {
        resolve({
          success: false,
          error: `AHK 脚本执行失败 (exitCode=${exitCode}): ${stderr || '未知错误'}`,
          output: stdout.slice(0, 2000),
          exitCode
        });
        return;
      }

      resolve({
        success: true,
        output: stdout.slice(0, 5000),
        exitCode: exitCode || 0
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      try { fs.unlinkSync(tmpFile); } catch (e) {}
      resolve({ success: false, error: '启动 AHK 失败: ' + err.message });
    });
  });
}

/**
 * 执行单行 AHK 命令（快捷方式）
 * @param {string} command - 单行 AHK 命令
 * @param {number} timeoutMs - 超时毫秒
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
function runAhkCommand(command, timeoutMs = 30000) {
  // [v1.1.7] 内置 AHK 是 v1，强制 v1 语法
  const code = '#NoEnv\n#SingleInstance Force\n' + command + '\n';
  return runAhkScript(code, timeoutMs);
}

// ============================================================================
// 常用 AHK 工具函数
// ============================================================================

/**
 * 查找窗口，返回窗口信息
 * 使用数组拼接避免模板字符串中转义问题
 * @param {{title?: string, className?: string, exe?: string}} options
 * @returns {Promise<{success: boolean, windows?: Array, error?: string}>}
 */
async function ahkFindWindow(options = {}) {
  const title = options.title || '';
  const className = options.className || '';
  const exe = options.exe || '';

  // [v1.1.7] 全部使用 AHK v1 语法（内置 AHK 二进制是 v1）
  const lines = [
    '#NoEnv',
    '#SingleInstance Force',
    'SetBatchLines, -1',
    'json := "["',
    'first := true',
  ];

  if (title) {
    const safeTitle = title.replace(/"/g, '""');
    lines.push(
      'WinGet, ids, List, % "' + safeTitle + '"',
      'Loop, %ids% {',
      '    hwnd := ids%A_Index%',
      '    WinGetTitle, winTitle, % "ahk_id " hwnd',
      '    if (winTitle = "") continue',
      '    WinGetClass, winClass, % "ahk_id " hwnd',
      '    WinGet, winExe, ProcessName, % "ahk_id " hwnd',
      '    WinGet, winPid, PID, % "ahk_id " hwnd',
      '    WinGetPos, winX, winY, winW, winH, % "ahk_id " hwnd',
      '    if (!first) json .= ","',
      '    first := false',
      '    json .= "{""handle"":" hwnd ",""title"":""" EscapeJson(winTitle) """,""class"":""" EscapeJson(winClass) """,""exe"":""" EscapeJson(winExe) """,""pid"":" winPid ",""x"":" winX ",""y"":" winY ",""width"":" winW ",""height"":" winH "}"',
      '}'
    );
  } else if (className) {
    lines.push(
      'WinGet, ids, List, % "ahk_class ' + className + '"',
      'Loop, %ids% {',
      '    hwnd := ids%A_Index%',
      '    WinGetTitle, winTitle, % "ahk_id " hwnd',
      '    if (winTitle = "") continue',
      '    WinGetClass, winClass, % "ahk_id " hwnd',
      '    WinGet, winExe, ProcessName, % "ahk_id " hwnd',
      '    WinGet, winPid, PID, % "ahk_id " hwnd',
      '    WinGetPos, winX, winY, winW, winH, % "ahk_id " hwnd',
      '    if (!first) json .= ","',
      '    first := false',
      '    json .= "{""handle"":" hwnd ",""title"":""" EscapeJson(winTitle) """,""class"":""" EscapeJson(winClass) """,""exe"":""" EscapeJson(winExe) """,""pid"":" winPid ",""x"":" winX ",""y"":" winY ",""width"":" winW ",""height"":" winH "}"',
      '}'
    );
  } else if (exe) {
    lines.push(
      'WinGet, ids, List, % "ahk_exe ' + exe + '"',
      'Loop, %ids% {',
      '    hwnd := ids%A_Index%',
      '    WinGetTitle, winTitle, % "ahk_id " hwnd',
      '    if (winTitle = "") continue',
      '    WinGetClass, winClass, % "ahk_id " hwnd',
      '    WinGet, winExe, ProcessName, % "ahk_id " hwnd',
      '    WinGet, winPid, PID, % "ahk_id " hwnd',
      '    WinGetPos, winX, winY, winW, winH, % "ahk_id " hwnd',
      '    if (!first) json .= ","',
      '    first := false',
      '    json .= "{""handle"":" hwnd ",""title"":""" EscapeJson(winTitle) """,""class"":""" EscapeJson(winClass) """,""exe"":""" EscapeJson(winExe) """,""pid"":" winPid ",""x"":" winX ",""y"":" winY ",""width"":" winW ",""height"":" winH "}"',
      '}'
    );
  } else {
    // 枚举所有顶层窗口
    lines.push(
      'WinGet, ids, List, , , Program Manager',
      'Loop, %ids% {',
      '    hwnd := ids%A_Index%',
      '    WinGetTitle, winTitle, % "ahk_id " hwnd',
      '    if (winTitle = "") continue',
      '    WinGetClass, winClass, % "ahk_id " hwnd',
      '    WinGet, winExe, ProcessName, % "ahk_id " hwnd',
      '    WinGet, winPid, PID, % "ahk_id " hwnd',
      '    WinGetPos, winX, winY, winW, winH, % "ahk_id " hwnd',
      '    if (!first) json .= ","',
      '    first := false',
      '    json .= "{""handle"":" hwnd ",""title"":""" EscapeJson(winTitle) """,""class"":""" EscapeJson(winClass) """,""exe"":""" EscapeJson(winExe) """,""pid"":" winPid ",""x"":" winX ",""y"":" winY ",""width"":" winW ",""height"":" winH "}"',
      '}'
    );
  }

  // 输出 JSON
  lines.push(
    'json .= "]"',
    'FileAppend, %json%, *',
    'ExitApp',
    '',
    'EscapeJson(str) {',
    '    if (str = "") return ""',
    '    StringReplace, str, str, \\, \\\\, All',
    '    StringReplace, str, str, ", \\", All',
    '    str := StrReplace(str, "``n", "\\n")',
    '    str := StrReplace(str, "``r", "\\r")',
    '    str := StrReplace(str, "``t", "\\t")',
    '    return str',
    '}'
  );

  const code = lines.join('\n');
  const result = await runAhkScript(code, 15000);
  if (!result.success) return result;

  try {
    const windows = JSON.parse(result.output || '[]');
    return { success: true, windows };
  } catch (e) {
    return { success: false, error: '解析窗口信息失败: ' + e.message, raw: result.output };
  }
}

/**
 * 向窗口发送输入
 * @param {{text?: string, keys?: string, windowTitle?: string, controlName?: string}} options
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function ahkSendInput(options = {}) {
  const text = options.text || '';
  const keys = options.keys || '';
  const windowTitle = options.windowTitle || '';
  const controlName = options.controlName || '';

  if (!text && !keys) {
    return { success: false, error: '缺少 text 或 keys 参数' };
  }

  // [v1.1.7] AHK v1 语法
  const lines = ['#NoEnv', '#SingleInstance Force'];

  if (windowTitle) {
    const safeTitle = windowTitle.replace(/"/g, '""');
    lines.push(
      'WinWait, % "' + safeTitle + '", , 5',
      'WinActivate, % "' + safeTitle + '"',
      'Sleep, 200'
    );
  }

  if (controlName && windowTitle) {
    const input = text || keys;
    const safeInput = input.replace(/"/g, '""');
    lines.push('ControlSend, , ' + safeInput + ', ' + controlName);
  } else {
    if (text) {
      const safeText = text.replace(/"/g, '""');
      lines.push('SendInput, ' + safeText);
    }
    if (keys) {
      const safeKeys = keys.replace(/"/g, '""');
      lines.push('Send, ' + safeKeys);
    }
  }

  lines.push('FileAppend, sent, *');
  lines.push('ExitApp');

  const code = lines.join('\n');
  const result = await runAhkScript(code, 15000);
  if (!result.success) return result;

  return { success: true, message: '输入已发送' + (windowTitle ? ' 到窗口: ' + windowTitle : '') };
}

/**
 * 点击控件或坐标
 * @param {{windowTitle: string, controlName?: string, x?: number, y?: number, button?: string}} options
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function ahkClickControl(options = {}) {
  const windowTitle = options.windowTitle || '';
  const controlName = options.controlName || '';
  const x = options.x;
  const y = options.y;
  const button = options.button || 'Left';

  // [v1.1.7] AHK v1 语法
  const lines = ['#NoEnv', '#SingleInstance Force'];

  if (windowTitle) {
    const safeTitle = windowTitle.replace(/"/g, '""');
    lines.push(
      'WinWait, % "' + safeTitle + '", , 5',
      'WinActivate, % "' + safeTitle + '"',
      'Sleep, 200'
    );
  }

  if (controlName && windowTitle) {
    lines.push('ControlClick, ' + controlName + ', ' + windowTitle);
  } else if (x !== undefined && y !== undefined) {
    const bt = { Left: 'Left', Right: 'Right', Middle: 'Middle' }[button] || 'Left';
    lines.push('Click, ' + x + ', ' + y + ', ' + bt);
  } else if (windowTitle) {
    lines.push('Click');  // 点击激活窗口中心
  } else {
    return { success: false, error: '缺少定位参数：需要提供 controlName、坐标(x,y) 或 windowTitle' };
  }

  lines.push('FileAppend, clicked, *');
  lines.push('ExitApp');

  const code = lines.join('\n');
  const result = await runAhkScript(code, 15000);
  if (!result.success) return result;

  return { success: true, message: `已点击 (${controlName || x + ',' + y || windowTitle})` };
}

module.exports = {
  findAutoHotkeyPath,
  isBundledAhk,
  checkAhkInstalled,
  runAhkScript,
  runAhkCommand,
  ahkFindWindow,
  ahkSendInput,
  ahkClickControl
};
