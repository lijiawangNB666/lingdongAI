/**
 * 灵动AI - 增强执行引擎 (Executor)
 *
 * 功能：
 * 1. 并行工具执行 - 同时运行多个独立工具调用
 * 2. 细粒度进度反馈 - 准备中/执行中/验证中/完成
 * 3. 执行后主动验证 - 验证文件/命令结果
 * 4. 智能重试 - 失败时自动重试
 * 5. JSON Schema 校验 - 工具参数预校验
 */

const fs = require('fs');
const path = require('path');

// ===================================================================
// 工具参数 Schema 定义（用于预校验）
// ===================================================================
const TOOL_SCHEMAS = {
  file_read: {
    required: ['path'],
    properties: {
      path: { type: 'string', description: '文件绝对路径' }
    }
  },
  file_write: {
    required: ['path', 'content'],
    properties: {
      path: { type: 'string', description: '文件绝对路径' },
      content: { type: 'string', description: '文件内容' }
    }
  },
  file_list: {
    required: ['path'],
    properties: {
      path: { type: 'string', description: '目录绝对路径' }
    }
  },
  file_delete: {
    required: ['path'],
    properties: {
      path: { type: 'string', description: '文件绝对路径' }
    }
  },
  create_folder: {
    required: ['path'],
    properties: {
      path: { type: 'string', description: '文件夹绝对路径' }
    }
  },
  execute_command: {
    required: ['command'],
    properties: {
      command: { type: 'string', description: 'PowerShell 命令' }
    }
  },
  search_web: {
    required: ['query'],
    properties: {
      query: { type: 'string', description: '搜索关键词' },
      limit: { type: 'number', description: '返回数量', default: 5 }
    }
  },
  fetch_url: {
    required: ['url'],
    properties: {
      url: { type: 'string', description: '网页 URL' },
      maxLength: { type: 'number', description: '最大字符数', default: 8000 }
    }
  }
};

// ===================================================================
// 步骤 1：JSON Schema 参数预校验
// ===================================================================

/**
 * 校验工具参数是否符合 Schema
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateToolArgs(toolName, args) {
  const schema = TOOL_SCHEMAS[toolName];
  if (!schema) {
    return { valid: true, errors: [] }; // 无 schema 则跳过校验
  }

  const errors = [];

  // 检查必填字段
  for (const required of schema.required || []) {
    if (args[required] === undefined || args[required] === null || args[required] === '') {
      errors.push(`缺少必填参数: ${required}`);
    }
  }

  // 检查类型
  for (const [key, prop] of Object.entries(schema.properties || {})) {
    const value = args[key];
    if (value === undefined || value === null) continue;

    if (prop.type === 'string' && typeof value !== 'string') {
      errors.push(`参数 ${key} 应为字符串类型，实际为 ${typeof value}`);
    }
    if (prop.type === 'number' && typeof value !== 'number') {
      errors.push(`参数 ${key} 应为数字类型，实际为 ${typeof value}`);
    }
    if (prop.type === 'array' && !Array.isArray(value)) {
      errors.push(`参数 ${key} 应为数组类型，实际为 ${typeof value}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ===================================================================
// 步骤 2：执行后主动验证
// ===================================================================

/**
 * 验证工具执行结果
 * @param {string} toolName - 工具名称
 * @param {Object} args - 原始参数
 * @param {Object} result - 执行结果
 * @returns {{valid: boolean, verified: boolean, reason?: string}}
 */
function verifyToolResult(toolName, args, result) {
  // 如果执行本身失败，不需要再验证
  if (!result || result.success === false) {
    return { valid: false, verified: false, reason: result?.error || '执行失败' };
  }

  try {
    switch (toolName) {
      case 'file_write': {
        // 验证文件是否真的写入了
        const filePath = args.path;
        if (!filePath) return { valid: true, verified: false, reason: '无法验证：缺少路径' };
        if (!fs.existsSync(filePath)) {
          return { valid: false, verified: true, reason: `文件写入验证失败：${filePath} 不存在` };
        }
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
          return { valid: false, verified: true, reason: `文件写入验证失败：${filePath} 大小为0` };
        }
        return { valid: true, verified: true, message: `文件验证通过：${filePath} (${stats.size} 字节)` };
      }

      case 'file_read': {
        // 验证读取的内容非空
        const content = result.content;
        if (!content || content.length === 0) {
          return { valid: true, verified: true, reason: '文件内容为空', warning: true };
        }
        return { valid: true, verified: true };
      }

      case 'create_folder': {
        // 验证目录是否创建成功
        const dirPath = args.path;
        if (!dirPath) return { valid: true, verified: false };
        if (!fs.existsSync(dirPath)) {
          return { valid: false, verified: true, reason: `目录创建验证失败：${dirPath} 不存在` };
        }
        return { valid: true, verified: true };
      }

      case 'file_delete': {
        // 验证文件是否已被删除
        const delPath = args.path;
        if (!delPath) return { valid: true, verified: false };
        if (fs.existsSync(delPath)) {
          return { valid: false, verified: true, reason: `文件删除验证失败：${delPath} 仍存在` };
        }
        return { valid: true, verified: true };
      }

      case 'execute_command': {
        // 验证退出码
        if (result.exitCode !== undefined && result.exitCode !== 0) {
          return { valid: false, verified: true, reason: `命令退出码非零: ${result.exitCode}` };
        }
        // 验证输出非空（某些命令允许空输出）
        return { valid: true, verified: true };
      }

      default:
        return { valid: true, verified: false }; // 无验证规则，标记为未验证
    }
  } catch (e) {
    return { valid: true, verified: false, reason: `验证过程出错: ${e.message}` };
  }
}

// ===================================================================
// 步骤 3：智能重试机制
// ===================================================================

/**
 * 判断是否可重试
 */
function isRetryable(toolName, error) {
  if (!error) return false;
  const msg = (error.message || error.error || String(error)).toLowerCase();

  // 网络相关错误可重试
  if (msg.includes('timeout') || msg.includes('etimedout')) return true;
  if (msg.includes('econnrefused') || msg.includes('enotfound')) return true;
  if (msg.includes('network') || msg.includes('fetch')) return true;

  // 文件锁定可重试
  if (msg.includes('eBUSY') || msg.includes('resource busy')) return true;
  if (msg.includes('eacces') || msg.includes('permission')) return true;

  // 某些命令可重试
  if (toolName === 'execute_command' && msg.includes('not found')) return false; // 命令不存在不重试

  return false;
}

/**
 * 带重试的工具执行
 */
async function executeWithRetry(toolName, toolArgs, executeFn, signal, maxRetries = 2) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 中断检查
    if (signal && signal.aborted) {
      return { success: false, error: '⛔ 已停止：用户手动终止了任务' };
    }

    try {
      const result = await executeFn();

      // 如果执行成功，返回结果
      if (result && result.success !== false) {
        return result;
      }

      // 执行返回了错误，判断是否可重试
      lastError = result;
      if (attempt < maxRetries && isRetryable(toolName, result)) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // 指数退避，最大5秒
        await sleep(delay);
        continue;
      }

      return result; // 不可重试的错误，直接返回

    } catch (e) {
      lastError = { success: false, error: e.message };
      if (attempt < maxRetries && isRetryable(toolName, e)) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await sleep(delay);
        continue;
      }
      return lastError;
    }
  }

  return lastError || { success: false, error: '重试次数耗尽' };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===================================================================
// 步骤 4：并行执行引擎
// ===================================================================

/**
 * 判断两个工具调用是否可以并行执行
 * 规则：
 * 1. 如果涉及同一路径的文件读写，必须串行
 * 2. 命令执行默认串行（避免互相干扰）
 * 3. 不相关文件操作可以并行
 */
function canRunInParallel(toolCallA, toolCallB) {
  const nameA = toolCallA.function.name;
  const nameB = toolCallB.function.name;
  let argsA = {}, argsB = {};
  try { argsA = JSON.parse(toolCallA.function.arguments); } catch (e) {}
  try { argsB = JSON.parse(toolCallB.function.arguments); } catch (e) {}

  // 命令执行默认串行（安全考虑）
  if (nameA === 'execute_command' || nameB === 'execute_command') {
    return false;
  }

  // 涉及同一路径的读写操作串行
  const pathA = argsA.path || '';
  const pathB = argsB.path || '';
  if (pathA && pathB && pathA === pathB) {
    // 同一个文件，检查是否是读写冲突
    const isReadA = nameA === 'file_read' || nameA === 'file_list';
    const isReadB = nameB === 'file_read' || nameB === 'file_list';
    // 双读可以并行
    if (isReadA && isReadB) return true;
    // 其他情况（读写混用）串行
    return false;
  }

  // 默认允许并行
  return true;
}

/**
 * 将工具调用分组为可并行执行的批次
 */
function groupToolCalls(toolCalls) {
  if (!toolCalls || toolCalls.length === 0) return [];
  if (toolCalls.length === 1) return [[toolCalls[0]]];

  const groups = [];
  const remaining = [...toolCalls];

  while (remaining.length > 0) {
    const batch = [remaining.shift()];

    // 找出可与当前批次并行的其他调用
    for (let i = remaining.length - 1; i >= 0; i--) {
      const canParallel = batch.every(tc => canRunInParallel(tc, remaining[i]));
      if (canParallel) {
        batch.push(remaining.splice(i, 1)[0]);
      }
    }

    groups.push(batch);
  }

  return groups;
}

/**
 * 并行执行一批工具调用
 * @param {Array} toolCalls - 工具调用数组
 * @param {Function} executeFn - 执行函数 (toolName, args, signal) => result
 * @param {Function} progressFn - 进度回调 (phase, toolName, data)
 * @param {AbortSignal} signal - 中断信号
 * @param {Object} options - 选项 { maxRetries, enableVerify }
 * @returns {Promise<Array>} 执行结果数组，与 toolCalls 一一对应
 */
async function executeToolCallsParallel(toolCalls, executeFn, progressFn, signal, options = {}) {
  const { maxRetries = 2, enableVerify = true } = options;
  const results = new Array(toolCalls.length).fill(null);

  // 将工具调用分组
  const groups = groupToolCalls(toolCalls);

  for (const group of groups) {
    if (signal && signal.aborted) {
      // 中断：标记剩余未执行的为中断状态
      for (let i = 0; i < toolCalls.length; i++) {
        if (results[i] === null) {
          results[i] = { success: false, error: '⛔ 已停止：用户手动终止了任务' };
        }
      }
      break;
    }

    // 同一组内的工具调用并行执行
    const groupPromises = group.map(async (toolCall) => {
      const index = toolCalls.indexOf(toolCall);
      const toolName = toolCall.function.name;
      let toolArgs = {};
      try { toolArgs = JSON.parse(toolCall.function.arguments); } catch (e) {}

      // ===== 阶段 1：准备中 =====
      if (progressFn) {
        progressFn('preparing', toolName, { args: toolArgs, index });
      }

      // ===== 阶段 2：参数校验 =====
      const validation = validateToolArgs(toolName, toolArgs);
      if (!validation.valid) {
        const errorResult = {
          success: false,
          error: `参数校验失败: ${validation.errors.join(', ')}`,
          _validationErrors: validation.errors
        };
        results[index] = errorResult;
        if (progressFn) progressFn('done', toolName, { result: errorResult, index });
        return errorResult;
      }

      // ===== 阶段 3：执行中 =====
      if (progressFn) {
        progressFn('executing', toolName, { args: toolArgs, index });
      }

      // 执行（带重试）
      const result = await executeWithRetry(
        toolName,
        toolArgs,
        () => executeFn(toolName, toolArgs, signal),
        signal,
        maxRetries
      );

      // ===== 阶段 4：结果验证 =====
      if (enableVerify && result && result.success !== false) {
        if (progressFn) {
          progressFn('verifying', toolName, { index });
        }

        const verifyResult = verifyToolResult(toolName, toolArgs, result);
        result._verification = verifyResult;

        if (!verifyResult.valid) {
          result.success = false;
          result.error = verifyResult.reason;
        }
      }

      // ===== 阶段 5：完成 =====
      results[index] = result;
      if (progressFn) {
        progressFn('done', toolName, { result, index });
      }

      return result;
    });

    await Promise.all(groupPromises);
  }

  return results;
}

// ===================================================================
// 步骤 5：执行摘要生成
// ===================================================================

function generateExecutionSummary(toolCalls, results) {
  const total = toolCalls.length;
  const succeeded = results.filter(r => r && r.success !== false).length;
  const failed = total - succeeded;
  const verified = results.filter(r => r && r._verification && r._verification.verified).length;

  const details = toolCalls.map((tc, i) => {
    const r = results[i];
    return {
      tool: tc.function.name,
      success: r ? r.success !== false : false,
      verified: r?._verification?.verified || false,
      error: r?.error || null,
      retryCount: r?._retryCount || 0
    };
  });

  return {
    total,
    succeeded,
    failed,
    verified,
    success: failed === 0,
    details,
    message: `执行完成：${succeeded}/${total} 成功，${failed} 失败${verified > 0 ? `，${verified} 项已验证` : ''}`
  };
}

// ===================================================================
// 导出
// ===================================================================

module.exports = {
  // Schema 校验
  validateToolArgs,
  TOOL_SCHEMAS,

  // 结果验证
  verifyToolResult,

  // 重试机制
  executeWithRetry,
  isRetryable,

  // 并行执行
  canRunInParallel,
  groupToolCalls,
  executeToolCallsParallel,

  // 摘要
  generateExecutionSummary
};
