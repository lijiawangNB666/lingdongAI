/**
 * 灵动AI - 安全审计模块
 * 
 * 功能：
 * 1. auditCommand(command) - 检查命令是否包含危险操作
 * 2. confirmDangerousOperation(dialogFn, operation, details) - 弹窗确认危险操作
 * 3. auditFileOperation(operation, path) - 审计文件操作
 */

const { dialog } = require('electron');
const path = require('path');

// ============================================================================
// 危险命令黑名单
// ============================================================================

// 极高危命令 - 一旦检测到立即阻止
const CRITICAL_DANGEROUS_PATTERNS = [
  // 格式化/擦除
  /format\s+[a-zA-Z]:/i,
  /diskpart/i,
  /clean\s+all/i,
  /dd\s+if=.*of=\/dev\//i,

  // 系统级删除
  /rm\s+[-rf]+.*\/(bin|sbin|usr|etc|sys|dev|proc)/i,
  /rm\s+[-rf]+.*\s+\/\s*$/i,
  /rmdir\s+\/s\s+["']?c:\\/i,

  // 注册表破坏
  /reg\s+delete\s+.*hklm/i,

  // 恶意脚本执行
  /invoke-mimikatz/i,
  /invoke-expression.*http/i,
  /iex\s*\(.*new-object/i,
  /downloadstring/i,
  /bitsadmin.*\/(transfer|create)/i,

  // 网络攻击
  /net\s+user\s+.*\/add/i,
  /net\s+localgroup\s+administrators/i,

  // BIOS/固件
  /flashbios/i,
  /update-secureboot/i,
];

// 高危命令 - 需要二次确认
const HIGH_RISK_PATTERNS = [
  // 递归删除
  /rm\s+[-rf]+/i,
  /rmdir\s+\/s/i,
  /del\s+\/s/i,
  /remove-item\s+(-recurse|-force)/i,
  /ri\s+(-r|-f)/i,

  // 大规模修改
  /findstr.*>.*\.\*/i,
  /get-childitem.*\|.*remove-item/i,
  /gci.*\|.*ri/i,

  // 权限提升
  /takeown\s+\/f/i,
  /icacls.*\/grant.*everyone/i,
  /chmod\s+777/i,
  /set-acl/i,

  // 系统服务
  /sc\s+(delete|config|stop)/i,
  /stop-service/i,
  /remove-service/i,

  // 网络配置
  /netsh\s+(firewall|advfirewall)/i,
  /iptables/i,
  /route\s+delete/i,
];

// 中等风险 - 提醒用户
const MEDIUM_RISK_PATTERNS = [
  // 删除操作
  /del\s+/i,
  /remove-item\s+/i,
  /unlink\s*\(/i,
  /fs\.unlink/i,

  // 覆盖写入
  />\s*[a-zA-Z]:/i,
  /out-file\s+/i,
  /set-content\s+/i,

  // 进程操作
  /taskkill\s+\/f/i,
  /stop-process\s+/i,
  /kill\s+\d+/i,
];

// 敏感路径 - 操作这些路径需要额外确认
const SENSITIVE_PATHS = [
  'c:\\windows',
  'c:\\program files',
  'c:\\programdata',
  'c:\\users\\all users',
  'c:\\boot',
  'c:\\recovery',
  '/usr/',
  '/etc/',
  '/bin/',
  '/sbin/',
  '/lib/',
  '/sys/',
  '/dev/',
  '/proc/',
  '\\.ssh',
  '\\.gnupg',
];

// ============================================================================
// 审计函数
// ============================================================================

/**
 * 审计命令安全性
 * @param {string} command - 要执行的命令
 * @returns {Object} {safe: boolean, level: 'safe'|'medium'|'high'|'critical', reason: string, patterns: string[]}
 */
function auditCommand(command) {
  if (!command || typeof command !== 'string') {
    return { safe: true, level: 'safe', reason: '', patterns: [] };
  }

  const cmd = command.toLowerCase().trim();
  const matchedPatterns = [];

  // 检查极高危
  for (const pattern of CRITICAL_DANGEROUS_PATTERNS) {
    if (pattern.test(cmd)) {
      matchedPatterns.push(pattern.toString());
      return {
        safe: false,
        level: 'critical',
        reason: '检测到极高危操作，已被自动阻止。这类操作可能导致系统不可逆损坏。',
        patterns: matchedPatterns,
        action: 'block'
      };
    }
  }

  // 检查高危
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(cmd)) {
      matchedPatterns.push(pattern.toString());
    }
  }

  if (matchedPatterns.length > 0) {
    return {
      safe: false,
      level: 'high',
      reason: '检测到高危操作，需要二次确认。此操作可能影响系统稳定性或删除大量数据。',
      patterns: matchedPatterns,
      action: 'confirm'
    };
  }

  // 检查中危
  for (const pattern of MEDIUM_RISK_PATTERNS) {
    if (pattern.test(cmd)) {
      matchedPatterns.push(pattern.toString());
    }
  }

  if (matchedPatterns.length > 0) {
    return {
      safe: true,  // 允许但提醒
      level: 'medium',
      reason: '检测到潜在风险操作，执行前请确认目标是否正确。',
      patterns: matchedPatterns,
      action: 'warn'
    };
  }

  return { safe: true, level: 'safe', reason: '', patterns: [], action: 'allow' };
}

/**
 * 审计文件操作
 * @param {string} operation - 操作类型 'read'|'write'|'delete'|'list'
 * @param {string} filePath - 文件路径
 * @returns {Object} 审计结果
 */
function auditFileOperation(operation, filePath) {
  if (!filePath) {
    return { safe: true, level: 'safe', reason: '' };
  }

  const lowerPath = filePath.toLowerCase().replace(/\\/g, '\\');

  // 检查敏感路径
  for (const sensitive of SENSITIVE_PATHS) {
    if (lowerPath.includes(sensitive.toLowerCase())) {
      if (operation === 'delete' || operation === 'write') {
        return {
          safe: false,
          level: 'high',
          reason: `正在尝试${operation === 'delete' ? '删除' : '修改'}系统敏感路径：${filePath}。这可能导致系统不稳定。`,
          action: 'confirm'
        };
      }
      return {
        safe: true,
        level: 'medium',
        reason: `正在访问系统路径：${filePath}，请谨慎操作。`,
        action: 'warn'
      };
    }
  }

  // 检查删除操作的通配符
  if (operation === 'delete' || operation === 'write') {
    if (filePath.includes('*') || filePath.includes('?')) {
      return {
        safe: false,
        level: 'high',
        reason: `通配符操作可能影响多个文件：${filePath}，请确认范围是否正确。`,
        action: 'confirm'
      };
    }
  }

  return { safe: true, level: 'safe', reason: '', action: 'allow' };
}

/**
 * 弹窗确认危险操作
 * @param {Function} dialogFn - 可选的 dialog 函数（用于测试）
 * @param {string} operation - 操作描述
 * @param {Object} details - 详细信息 {command, path, reason}
 * @returns {Promise<boolean>} 用户是否确认
 */
async function confirmDangerousOperation(dialogFn, operation, details) {
  const dlg = dialogFn || dialog;

  if (!dlg || !dlg.showMessageBox) {
    console.warn('[Security] Dialog not available, denying dangerous operation');
    return false;
  }

  const buttons = ['取消操作', '确认执行'];
  const detailText = [
    details.reason || '此操作具有潜在风险。',
    '',
    details.command ? `命令：${details.command}` : '',
    details.path ? `路径：${details.path}` : '',
    '',
    '建议：如果不确定，请取消操作并咨询相关人员。'
  ].filter(Boolean).join('\n');

  const result = await dlg.showMessageBox({
    type: 'warning',
    title: '⚠️ 安全警告',
    message: `确认执行以下${operation || '危险操作'}？`,
    detail: detailText,
    buttons,
    defaultId: 0,  // 默认选中"取消"
    cancelId: 0,
    noLink: true
  });

  return result.response === 1;  // 用户点击了"确认执行"
}

/**
 * 获取安全提示信息（用于向 LLM 报告）
 */
function getSecurityContext() {
  return {
    rules: [
      '执行命令前会进行安全审计，危险操作需要用户确认',
      '以下命令会被自动阻止：格式化磁盘、删除系统目录、修改系统注册表',
      '以下命令需要二次确认：递归删除(rm -rf)、修改系统权限、停止系统服务',
      '操作敏感路径（如 C:\\Windows）会触发安全警告',
      '通配符删除操作（如 del *.exe）需要确认',
      '如果不确定命令安全性，AI 应该优先使用只读工具（file_read、file_list）'
    ],
    auditEnabled: true,
    version: '1.0'
  };
}

module.exports = {
  auditCommand,
  auditFileOperation,
  confirmDangerousOperation,
  getSecurityContext,
  CRITICAL_DANGEROUS_PATTERNS,
  HIGH_RISK_PATTERNS,
  MEDIUM_RISK_PATTERNS,
  SENSITIVE_PATHS
};
