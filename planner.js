/**
 * 灵动AI - 任务规划引擎 (Planner)
 * 
 * 功能：将用户的复杂请求分解为可执行的子任务序列
 * 输出：ExecutionPlan（包含任务分析、执行策略、子步骤列表）
 */

const fs = require('fs');
const path = require('path');

// Planner 系统提示词 - 指导 LLM 输出结构化执行计划
const PLANNER_SYSTEM_PROMPT = `你是一个任务规划专家。你的职责是将用户的请求分析并分解为清晰的执行步骤。

## ⚠️ 铁律
- 你具备完整的能力规划，包括删除文件/文件夹、创建Agent、执行命令等所有操作
- 用户要求删除时，规划中必须包含 file_delete 步骤
- 不要输出"无法删除"或"没有权限"之类的结论

## 输出格式
你必须输出纯 JSON，格式如下：
{
  "analysis": "对用户需求的核心分析，1-2句话",
  "strategy": "serial|parallel|mixed",
  "steps": [
    {
      "id": "step-1",
      "description": "步骤描述（给人看）",
      "tool": "工具名称",
      "args": { "参数名": "参数值" },
      "dependsOn": [],
      "validation": [
        { "type": "file_exists|exit_code|output_contains", "params": {}, "onFailure": "retry|skip|abort" }
      ],
      "timeout": 30000,
      "retries": 2
    }
  ],
  "expectedOutcome": "预期结果描述",
  "fallbackPlan": "如果主计划失败的备选方案描述"
}

## 规则
1. strategy 选择：
   - "serial"：步骤有强依赖，必须顺序执行
   - "parallel"：步骤完全独立，可同时执行
   - "mixed"：部分并行、部分串行
2. dependsOn：填写依赖步骤的 id 数组，无依赖则留空
3. 每个步骤的 tool 必须是系统实际存在的工具名
4. 优先使用并行策略提高效率
5. 对于不确定的信息，使用 search_web 或 fetch_url 工具先获取
6. 文件写入操作后应加 file_exists 验证
7. 命令执行后应加 exit_code 验证

## 可用工具参考
- file_read: 读取文件内容
- file_write: 写入文件
- file_list: 列出目录
- file_delete: 删除文件或文件夹（支持递归删除）。用户要求删除时必须使用，不要说不能删除
- create_folder: 创建文件夹
- execute_command: 执行系统命令（PowerShell）
- open_software: 打开软件
- take_screenshot: 截图
- open_url: 在浏览器打开URL
- search_web: 搜索互联网信息
- fetch_url: 抓取网页内容
- get_current_time: 获取当前时间
- search_meeting_notes: 搜索会议纪要
- search_knowledge_base: 搜索知识库
- save_meeting_note: 保存会议纪要
- list_meeting_notes: 列出所有会议纪要
- create_agent: 创建新的AI Agent。参数：name(字符串,必填)、description(字符串,必填)、systemPrompt(字符串,必填,完整的系统提示词)、tools(字符串数组,可选,可用的工具列表)、model(字符串,可选)、baseUrl(字符串,可选)。注意：systemPrompt 必须是一个完整的、详细的系统提示词，描述Agent的能力和行为规则
- list_agents: 获取所有已创建的Agent列表
- get_agent: 获取指定 Agent 的完整配置（含 systemPrompt、tools、model 等）。参数：id(字符串,必填)
- update_agent: 修改已有 Agent 的任意字段。参数：id(字符串,必填)、updates(对象,必填)
- delete_agent: 删除指定 Agent。参数：id(字符串,必填)
- list_available_tools: 列出系统所有可用工具名称
- read_agent_file / write_agent_file: 读写 Agent 配置文件
- read_source_file / write_source_file / patch_source_file: 读写/打补丁源码文件（main.js 等）
- run_node_check: 用 node --check 语法检查 .js 文件
- run_node_script: 执行 Node.js 脚本
- run_python_script: 执行 Python 脚本
- install_npm_package: 安装 npm 包
- run_ahk_script: 运行 AutoHotkey 脚本
- organize_files: 按规则整理文件（如按类型/日期归档）
- mcp_call: 调用 MCP（Model Context Protocol）服务器工具
- win_find_window: 查找 Windows 窗口（按标题关键字）。参数：keyword(字符串,必填)
- win_activate_window: 激活（置顶）指定窗口。参数：title(字符串) 或 handle(数字)
- win_send_keys: 发送键盘按键。参数：keys(字符串,必填)、window(字符串,可选,目标窗口标题)
- win_click: 模拟鼠标点击坐标。参数：x(数字,必填)、y(数字,必填)
- ahk_find_window: 用 AHK 查找窗口（比 win_find_window 更可靠）。参数：keyword(字符串,必填)
- ahk_send_input: 用 AHK 发送输入。参数：keys(字符串,必填)
- ahk_click_control: 用 AHK 点击指定窗口内的控件。参数：title(字符串,必填)、control(字符串,必填)

## create_agent 使用示例
当用户要求创建Agent时，必须生成一个 create_agent 步骤：
{
  "id": "step-1",
  "description": "创建 XXXX Agent",
  "tool": "create_agent",
  "args": {
    "name": "Agent名称",
    "description": "Agent功能描述",
    "systemPrompt": "你是一个专业的XXX助手。你的能力包括...当用户...时，你应该...请用中文回复。",
    "tools": ["file_read", "file_write", "execute_command", "get_current_time"]
  }
}

重要规则：
- 创建Agent时 systemPrompt 必须详细完整，包含Agent的角色、能力、行为准则、工具使用说明
- systemPrompt 使用 camelCase 参数名（不要用 system_prompt 等蛇形命名）
- 不要使用空 tool 步骤来处理创建Agent请求，必须使用 create_agent 工具
- 用户要求删除文件/文件夹时，必须生成 file_delete 步骤。不要说"无法删除"或"没有权限"
- 删除前可先用 file_list 确认路径正确

## 删除操作示例
当用户要求删除文件或文件夹时：
{
  "id": "step-1",
  "description": "删除指定文件夹",
  "tool": "file_delete",
  "args": {
    "path": "C:\\Users\\XXX\\Desktop\\要删除的文件夹"
  }
}`;

/**
 * 生成执行计划
 * @param {string} userRequest - 用户原始请求
 * @param {Array} availableTools - 可用工具列表
 * @param {Object} config - LLM 配置 {apiKey, baseUrl, model}
 * @param {AbortSignal} signal - 中断信号
 * @returns {Promise<Object>} ExecutionPlan
 */
async function generatePlan(userRequest, availableTools, config, signal) {
  if (!config || !config.baseUrl) {
    return createSimplePlan(userRequest);
  }

  const cleanBaseUrl = (config.baseUrl || '').replace(/\/$/, '');
  const apiKey = config.apiKey || '';
  const model = config.model || 'gpt-4o';

  // 构建完整的工具参考信息（包含参数 schema）
  const toolRefs = availableTools.map(t => {
    const fn = t.function;
    let desc = `- ${fn.name}: ${fn.description}`;
    // 包含参数 schema 确保规划器知道正确的参数名
    if (fn.parameters && fn.parameters.properties) {
      const props = fn.parameters.properties;
      const required = fn.parameters.required || [];
      const paramDetails = Object.entries(props).map(([key, val]) => {
        const isRequired = required.includes(key);
        const typeInfo = val.items ? `array of ${val.items.type}` : (val.type || 'string');
        return `    ${key} (${typeInfo}${isRequired ? ', 必填' : ''}): ${val.description || ''}`;
      }).join('\n');
      if (paramDetails) {
        desc += '\n  参数：\n' + paramDetails;
      }
    }
    return desc;
  }).join('\n');

  const messages = [
    { role: 'system', content: PLANNER_SYSTEM_PROMPT },
    { role: 'user', content: `可用工具列表：\n${toolRefs}\n\n用户请求：${userRequest}\n\n请生成执行计划。` }
  ];

  const urls = buildChatUrls(cleanBaseUrl);

  for (const url of urls) {
    if (signal && signal.aborted) {
      throw new Error('计划生成被中断');
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,  // 低温度确保输出稳定
          max_tokens: 4096
          // 注意：某些模型部署不支持 response_format，改用提示词要求 JSON 输出
        }),
        signal
      });

      const arrayBuf = await response.arrayBuffer();
      const text = new TextDecoder('utf-8').decode(arrayBuf);

      if (text.trim().startsWith('<')) continue;

      const data = JSON.parse(text);
      if (!data.choices || !data.choices[0]) continue;

      const content = data.choices[0].message?.content;
      if (!content) continue;

      // 解析 JSON 计划
      let plan;
      try {
        plan = JSON.parse(content);
      } catch (e) {
        // 尝试从 Markdown 代码块中提取 JSON
        const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/```\s*([\s\S]*?)```/);
        if (jsonMatch) {
          plan = JSON.parse(jsonMatch[1].trim());
        } else {
          throw new Error('计划解析失败');
        }
      }

      // 验证计划结构
      if (!plan.steps || !Array.isArray(plan.steps)) {
        throw new Error('计划格式错误：缺少 steps 数组');
      }

      // 为每个步骤填充默认值
      plan.steps = plan.steps.map((step, idx) => ({
        id: step.id || `step-${idx + 1}`,
        description: step.description || '未命名步骤',
        tool: step.tool || '',
        args: step.args || {},
        dependsOn: step.dependsOn || [],
        validation: step.validation || [],
        timeout: step.timeout || 30000,
        retries: step.retries || 2,
        status: 'pending'  // pending | running | completed | failed
      }));

      plan.strategy = plan.strategy || 'serial';
      plan.analysis = plan.analysis || '';
      plan.expectedOutcome = plan.expectedOutcome || '';
      plan.fallbackPlan = plan.fallbackPlan || '';

      return plan;

    } catch (e) {
      if (e.name === 'AbortError') throw e;
      console.error('[Planner] URL failed:', url, e.message);
      if (url === urls[urls.length - 1]) {
        // 所有 URL 都失败，回退到简单计划
        return createSimplePlan(userRequest);
      }
    }
  }

  return createSimplePlan(userRequest);
}

/**
 * 生成简单计划（当 LLM 规划失败时的回退）
 */
function createSimplePlan(userRequest) {
  // ===== 修复 P0-01：根据关键词推断工具，并正确填入步骤 =====
  var stepTool = '';
  var stepArgs = {};
  var stepDesc = '直接处理用户请求';
  var req = userRequest.toLowerCase();

  // Agent 创建（最高优先级）
  if (/创建.*agent|创建.*智能体|新建.*agent|新建.*智能体|create.*agent/i.test(userRequest)) {
    stepTool = 'create_agent';
    stepArgs = { name: '(Agent名称)', description: '(Agent描述)', systemPrompt: '(Agent系统提示词)' };
    stepDesc = '创建新的AI Agent';
  }
  // 读文件
  else if (/读取?.*文件|查看?.*文件|打开.*文件|读.*内容|cat\s+/i.test(userRequest)) {
    stepTool = 'file_read';
    stepArgs = { path: '(文件路径)' };
    stepDesc = '读取文件内容';
  }
  // 写文件
  else if (/生成|创建|写|保存|输出.*文件|文档|写入/i.test(userRequest) && !/agent|智能体/i.test(userRequest)) {
    stepTool = 'file_write';
    stepArgs = { path: userRequest.match(/桌面|下载|文档/) ? '(桌面路径)' : '(目标路径)', content: '' };
    stepDesc = '生成/写入文件';
  }
  // 删除
  else if (/删除?|移除|清理|清空|干掉/i.test(userRequest)) {
    stepTool = 'file_delete';
    stepArgs = { path: '(目标路径)' };
    stepDesc = '删除文件或文件夹';
  }
  // 列表/目录
  else if (/列出?|列表|有哪些|目录|文件夹.*里|ls\s+/i.test(userRequest)) {
    stepTool = 'file_list';
    stepArgs = { path: '(目录路径)' };
    stepDesc = '列出目录内容';
  }
  // 截图
  else if (/截图|截屏|拍照|屏幕|screenshot/i.test(userRequest)) {
    stepTool = 'take_screenshot';
    stepArgs = {};
    stepDesc = '截取屏幕';
  }
  // 打开软件/URL
  else if (/打开.*软件|打开.*应用|打开.*程序|启动.*软件|启动.*应用/i.test(userRequest)) {
    stepTool = 'open_software';
    stepArgs = { name: '(软件名称)' };
    stepDesc = '打开本地软件';
  }
  else if (/打开.*网页|打开.*网站|打开.*url|访问.*网站|浏览.*网页/i.test(userRequest)) {
    stepTool = 'open_url';
    stepArgs = { url: '(网址)' };
    stepDesc = '在浏览器中打开网页';
  }
  // Windows UI 自动化：查找窗口
  else if (/查找.*窗口|找.*窗口|窗口.*标题|列出.*窗口|win_find/i.test(userRequest)) {
    stepTool = 'win_find_window';
    stepArgs = { keyword: '(窗口标题关键字)' };
    stepDesc = '查找窗口';
  }
  // Windows UI 自动化：激活窗口
  else if (/激活.*窗口|切换.*窗口|置顶.*窗口|focus.*窗口|win_activate/i.test(userRequest)) {
    stepTool = 'win_activate_window';
    stepArgs = { title: '(窗口标题)' };
    stepDesc = '激活窗口';
  }
  // Windows UI 自动化：发送按键
  else if (/输入|打字|按键|发送.*键|send_keys|sendkey/i.test(userRequest)) {
    stepTool = 'win_send_keys';
    stepArgs = { keys: '(要输入的文本)' };
    stepDesc = '发送键盘输入';
  }
  // Windows UI 自动化：鼠标点击
  else if (/点击|单击|鼠标.*点击|click.*坐标|win_click/i.test(userRequest)) {
    stepTool = 'win_click';
    stepArgs = { x: 0, y: 0 };
    stepDesc = '在指定坐标点击';
  }
  // AutoHotkey 自动化：执行 AHK 脚本
  else if (/ahk|autohotkey|自动化|自动填表|批量操作|脚本执行|ahk_script|run_ahk/i.test(userRequest)) {
    stepTool = 'run_ahk_script';
    stepArgs = { code: '; AutoHotkey v2 代码\n#Requires AutoHotkey v2.0\n' };
    stepDesc = '执行 AutoHotkey 脚本实现 Windows UI 自动化';
  }
  // AutoHotkey 自动化：查找窗口
  else if (/ahk.*查找|ahk.*窗口|ahk_find|autohotkey.*窗口/i.test(userRequest)) {
    stepTool = 'ahk_find_window';
    stepArgs = { title: '(窗口标题)' };
    stepDesc = '使用 AHK 查找窗口信息';
  }
  // AutoHotkey 自动化：发送输入
  else if (/ahk.*输入|ahk.*按键|ahk.*打字|ahk_send|autohotkey.*输入/i.test(userRequest)) {
    stepTool = 'ahk_send_input';
    stepArgs = { text: '(输入内容)' };
    stepDesc = '使用 AHK 发送键盘输入';
  }
  // AutoHotkey 自动化：点击控件
  else if (/ahk.*点击|ahk.*控件|ahk_click|autohotkey.*点击/i.test(userRequest)) {
    stepTool = 'ahk_click_control';
    stepArgs = { windowTitle: '(窗口标题)' };
    stepDesc = '使用 AHK 点击窗口控件';
  }
  // 搜索
  else if (/搜索|查找|查询|百度|谷歌|google|bing/i.test(userRequest)) {
    stepTool = 'search_web';
    stepArgs = { query: '(搜索关键词)' };
    stepDesc = '搜索互联网信息';
  }
  // 时间
  else if (/时间|几点|日期|现在|today|time/i.test(userRequest)) {
    stepTool = 'get_current_time';
    stepArgs = {};
    stepDesc = '获取当前时间';
  }
  // 会议/纪要
  else if (/会议|纪要|记录|笔记/i.test(userRequest)) {
    stepTool = 'search_meeting_notes';
    stepArgs = { keyword: '(搜索关键词)' };
    stepDesc = '搜索会议纪要';
  }
  // 网页爬取
  else if (/爬取|抓取|网页|url|http|网站|api/i.test(userRequest)) {
    stepTool = 'execute_command';
    stepArgs = { command: '(请根据具体URL生成PowerShell爬取命令)' };
    stepDesc = '爬取/抓取网页内容';
  }
  // 整理/分类/移动/复制/分析/统计（默认用命令执行）
  else if (/整理|分类|移动|复制|重命名|分析|统计|计算|比较|排序|过滤|查找/i.test(userRequest)) {
    stepTool = 'execute_command';
    stepArgs = { command: '(根据具体需求生成PowerShell命令)' };
    stepDesc = '执行系统命令完成操作';
  }
  // 通用命令执行
  else if (/执行|运行|启动|安装|卸载|cmd|powershell|命令/i.test(userRequest)) {
    stepTool = 'execute_command';
    stepArgs = { command: '(命令内容)' };
    stepDesc = '执行系统命令';
  }

  return {
    analysis: '用户请求：' + userRequest,
    strategy: 'serial',
    steps: [
      {
        id: 'step-1',
        description: stepDesc,
        tool: stepTool,
        args: stepArgs,
        dependsOn: [],
        validation: [],
        timeout: 30000,
        retries: stepTool === 'create_agent' ? 0 : 2,
        status: 'pending'
      }
    ],
    expectedOutcome: '完成用户请求',
    fallbackPlan: '直接对话回复',
    _fallback: true  // 标记为回退计划
  };
}

/**
 * 构建 API URL 列表（复用 main.js 的逻辑）
 */
function buildChatUrls(baseUrl) {
  const urls = [];
  if (baseUrl.includes('/chat/completions')) {
    urls.push(baseUrl);
  } else {
    urls.push(`${baseUrl}/chat/completions`);
    if (!baseUrl.endsWith('/v1')) urls.push(`${baseUrl}/v1/chat/completions`);
  }
  return urls;
}

/**
 * 按依赖关系对步骤进行拓扑排序
 * 返回可并行执行的批次数组
 */
function sortStepsByDependency(steps) {
  const visited = new Set();
  const batches = [];
  const remaining = new Set(steps.map(s => s.id));

  while (remaining.size > 0) {
    const batch = [];
    for (const stepId of remaining) {
      const step = steps.find(s => s.id === stepId);
      if (!step) continue;
      // 检查所有依赖是否已访问
      const depsSatisfied = (step.dependsOn || []).every(depId => visited.has(depId));
      if (depsSatisfied) {
        batch.push(step);
      }
    }

    if (batch.length === 0) {
      // 存在循环依赖，打破循环
      const arbitrary = steps.find(s => remaining.has(s.id));
      if (arbitrary) {
        arbitrary.dependsOn = [];  // 清空依赖强制继续
        batch.push(arbitrary);
      } else {
        break;
      }
    }

    for (const step of batch) {
      visited.add(step.id);
      remaining.delete(step.id);
    }
    batches.push(batch);
  }

  return batches;
}

/**
 * 执行计划
 * @param {Object} plan - 执行计划
 * @param {Function} executeToolFn - 工具执行函数
 * @param {Function} onProgress - 进度回调 (step, status, result)
 * @param {AbortSignal} signal - 中断信号
 * @returns {Promise<Object>} 执行结果汇总
 */
async function executePlan(plan, executeToolFn, onProgress, signal) {
  const results = {};
  const stepMap = new Map(plan.steps.map(s => [s.id, s]));

  // 按依赖批次执行
  const batches = sortStepsByDependency(plan.steps);

  for (const batch of batches) {
    if (signal && signal.aborted) {
      throw new Error('任务已中断');
    }

    // 同一批次的步骤并行执行
    const batchPromises = batch.map(async (step) => {
      if (signal && signal.aborted) {
        return { stepId: step.id, status: 'aborted', error: '已中断' };
      }

      // 更新状态为运行中
      step.status = 'running';
      if (onProgress) onProgress(step, 'running');

      try {
        let result;

        if (!step.tool || step.tool === '') {
          // 无工具步骤，直接标记完成
          result = { success: true, message: '跳过（无需工具执行）' };
        } else {
          // 解析参数中的变量引用（如 ${step-1.output}）
          const resolvedArgs = resolveArgs(step.args, results);
          result = await executeToolFn(step.tool, resolvedArgs, signal);
        }

        // 结果验证
        if (result && result.success !== false) {
          const validationResult = validateStepResult(step, result);
          if (!validationResult.valid) {
            result.success = false;
            result.error = `验证失败: ${validationResult.reason}`;
          }
        }

        step.status = result && result.success !== false ? 'completed' : 'failed';
        results[step.id] = result;

        if (onProgress) onProgress(step, step.status, result);

        return { stepId: step.id, status: step.status, result };

      } catch (e) {
        step.status = 'failed';
        const errorResult = { success: false, error: e.message };
        results[step.id] = errorResult;
        if (onProgress) onProgress(step, 'failed', errorResult);
        return { stepId: step.id, status: 'failed', error: e.message };
      }
    });

    await Promise.all(batchPromises);
  }

  return {
    plan,
    results,
    summary: generateSummary(plan, results)
  };
}

/**
 * 解析参数中的变量引用
 * 支持 ${stepId.result.field} 语法
 */
function resolveArgs(args, results) {
  const resolved = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
      const ref = value.slice(2, -1);  // stepId.result.field
      const parts = ref.split('.');
      const stepId = parts[0];
      const stepResult = results[stepId];
      if (stepResult && stepResult.success) {
        let val = stepResult;
        for (let i = 1; i < parts.length; i++) {
          val = val?.[parts[i]];
        }
        resolved[key] = val !== undefined ? val : value;
      } else {
        resolved[key] = value;
      }
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/**
 * 验证步骤执行结果
 */
function validateStepResult(step, result) {
  if (!step.validation || step.validation.length === 0) {
    return { valid: true };
  }

  for (const rule of step.validation) {
    switch (rule.type) {
      case 'file_exists': {
        const filePath = rule.params.path || result.path || step.args.path;
        if (!filePath || !fs.existsSync(filePath)) {
          return { valid: false, reason: `文件不存在: ${filePath}` };
        }
        break;
      }
      case 'exit_code': {
        if (result.exitCode !== undefined && result.exitCode !== 0) {
          return { valid: false, reason: `命令退出码非零: ${result.exitCode}` };
        }
        break;
      }
      case 'output_contains': {
        const output = result.output || result.content || '';
        const expected = rule.params.text || '';
        if (!output.includes(expected)) {
          return { valid: false, reason: `输出不包含期望内容: ${expected}` };
        }
        break;
      }
    }
  }

  return { valid: true };
}

/**
 * 生成执行摘要
 */
function generateSummary(plan, results) {
  const total = plan.steps.length;
  const completed = plan.steps.filter(s => s.status === 'completed').length;
  const failed = plan.steps.filter(s => s.status === 'failed').length;

  return {
    total,
    completed,
    failed,
    success: failed === 0,
    message: `执行完成：${completed}/${total} 成功，${failed} 失败`
  };
}

module.exports = {
  generatePlan,
  executePlan,
  sortStepsByDependency,
  createSimplePlan,
  PLANNER_SYSTEM_PROMPT
};
