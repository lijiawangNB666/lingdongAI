# lingdongAI
我是一个能操作电脑、能一句话创建管理 Agent /创建团队、能修改自己源码、还能通过 MCP 无限扩展的 Windows 原生 AI 操作系统。
<img width="1266" height="847" alt="6de18f47494b92175a7166f853d8d410" src="https://github.com/user-attachments/assets/a6a5b3c0-1f98-4ab0-8c22-72b13935acc8" />
<img width="1258" height="852" alt="712e73fa589b12fdc518ee93aaa5d60f" src="https://github.com/user-attachments/assets/60749413-0145-41b5-b74f-2440f9ca0f6e" />
<img width="1259" height="849" alt="0a26ce8e70e0155a65180ba12a234592" src="https://github.com/user-attachments/assets/96e27a04-0000-454a-81ae-42c7c2945ee7" />
<img width="1254" height="807" alt="92fdb8c21a87277a68a2bd6bb59a3ec4" src="https://github.com/user-attachments/assets/dfdc30a0-5e70-4555-8c11-ec0115292ed9" />
<img width="1264" height="812" alt="3640d9446d504b1af20cc6a450e1a755" src="https://github.com/user-attachments/assets/e10b9d9e-accb-46e1-98ed-3e1d19779e1a" />
[README_Bilingual.md](https://github.com/user-attachments/files/29954813/README_Bilingual.md)
<img width="1264" height="795" alt="0860592912a6f836a8f3b0f856403109" src="https://github.com/user-attachments/assets/de78cc1b-8106-4dba-84a4-0bb33bb0d299" />
# 灵动 AI — 可进化、可协作、可执行的 Windows 原生 AI 操作系统
# LingDong AI — An Evolvable, Collaborative, and Executable Windows-Native AI OS

> 中文 / English

---

## 一、项目简介 | Project Introduction

**灵动 AI** 是一款面向 Windows 平台开发的原生 AI 助手。它不同于传统的聊天机器人，拥有完整的本地操作系统权限，能够通过 Function Calling 机制调用丰富的工具，完成文件操作、系统命令、软件控制、窗口自动化、Agent 协作、源码自修改等任务。

**LingDong AI** is a native AI assistant developed for the Windows platform. Unlike traditional chatbots, it has full local operating system privileges and can invoke a rich set of tools through Function Calling to complete tasks such as file operations, system commands, software control, window automation, Agent collaboration, and self-source-code modification.

> **核心理念 | Core Philosophy**
>
> **AI 不仅是顾问，更是执行者。**
>
> **AI is not just an advisor, but an executor.**

---

## 二、核心特色 | Core Features

### 1. 源码级自我进化能力 | Source-Level Self-Evolution

灵动 AI 能够读取、修改、编译乃至重启自己。

LingDong AI can read, modify, compile, and even restart itself.

| 工具 / Tool | 说明 / Description |
| --- | --- |
| `read_source_file` | 读取源码文件 / Read source files |
| `write_source_file` | 写入源码文件 / Write source files |
| `patch_source_file` | 补丁方式修改源码 / Patch source files |
| `check_syntax` | 检查代码语法 / Check code syntax |
| `run_node_check` | 运行 Node 检查 / Run Node.js checks |
| `restart_app` | 重启应用使修改生效 / Restart app to apply changes |

> 这是“AI 迭代 AI”的雏形。
>
> This is the prototype of "AI iterating AI".

### 2. Agent 工厂与多 Agent 协作 | Agent Factory and Multi-Agent Collaboration

通过内置的 Agent 管理系统，灵动 AI 可以：

Through the built-in Agent management system, LingDong AI can:

- 创建具备独立系统提示词、模型、工具集的 Agent
- Create Agents with independent system prompts, models, and tool sets
- 动态修改 Agent 的底层配置
- Dynamically modify Agent configurations
- 调用多个专业 Agent 协同完成复杂任务
- Invoke multiple professional Agents to collaboratively complete complex tasks

### 3. 全链路本地操作系统能力 | Full-Chain Local OS Capabilities

| 类别 / Category | 能力 / Capability |
| --- | --- |
| 文件操作 / File Operations | 读写、列出、删除、创建文件夹 / Read, write, list, delete, create folders |
| 系统命令 / System Commands | 执行 PowerShell 命令 / Execute PowerShell commands |
| 软件控制 / Software Control | 打开本地软件、打开网页 / Open local software and web pages |
| 屏幕截图 / Screenshots | 截取当前屏幕 / Capture current screen |
| 文件整理 / File Organization | 按类型/日期/名称智能整理 / Organize files by type/date/name |
| 待办管理 / Todo Management | 创建、查看、修改、删除待办 / Create, view, update, delete todos |

### 4. Windows 原生 UI 自动化 | Windows-Native UI Automation

项目内嵌 `AutoHotkey64.exe`，支持精准的 Windows UI 操控。

The project embeds `AutoHotkey64.exe` to support precise Windows UI manipulation.

| 工具 / Tool | 说明 / Description |
| --- | --- |
| `win_find_window` | 查找窗口 / Find windows |
| `win_activate_window` | 激活窗口 / Activate windows |
| `win_send_keys` | 发送按键 / Send keystrokes |
| `win_click` | 模拟鼠标点击 / Simulate mouse clicks |
| `run_ahk_script` | 运行 AHK 脚本 / Run AHK scripts |

### 5. MCP 无限生态扩展 | MCP Infinite Ecosystem Extension

通过 `mcp_call`，灵动 AI 可以接入任何支持 Model Context Protocol 的第三方服务。

Through `mcp_call`, LingDong AI can connect to any third-party service supporting the Model Context Protocol.

### 6. 强制 Function Calling 的执行纪律 | Mandatory Function Calling Execution Discipline

灵动 AI 的设计哲学是**能动手就不逼逼**。系统强制通过工具调用完成任务，而不是只给文字建议。

LingDong AI's design philosophy is **"do it, don't just talk about it."** The system enforces task completion through tool calls rather than mere textual suggestions.

---

## 三、功能全景 | Feature Map

```
灵动 AI / LingDong AI
├── 文件操作 / File Operations
├── 系统命令 / System Commands
├── 软件控制 / Software Control
├── 截图能力 / Screenshot Capability
├── 网页搜索与抓取 / Web Search and Fetch
├── Agent 管理 / Agent Management
├── Agent 开发 / Agent Development
├── 源码开发 / Source Code Development
├── 项目管理 / Project Management
├── 应用控制 / Application Control
├── Windows UI 自动化 / Windows UI Automation
├── 文件整理 / File Organization
├── 待办管理 / Todo Management
├── MCP 扩展 / MCP Extension
├── 会议纪要 / Meeting Notes
├── 知识检索 / Knowledge Retrieval
└── 时间工具 / Time Tools
```

---

## 四、快速开始 | Quick Start

### 环境要求 | Requirements

- Windows 10 / Windows 11
- Node.js 18.x or higher
- Configured LLM API Key

### 安装步骤 | Installation

```bash
# 克隆仓库 / Clone the repository
git clone https://github.com/your-repo/lingdong-ai.git
cd lingdong-ai

# 安装依赖 / Install dependencies
npm install

# 配置环境变量 / Configure environment variables
cp .env.example .env

# 启动应用 / Start the application
npm start
```

---

## 五、项目结构 | Project Structure

```
lobster-desktop/
├── main.js                 # 主进程入口 / Main process entry
├── preload.js              # 预加载脚本 / Preload script
├── renderer.js             # 渲染进程脚本 / Renderer script
├── pet-manager.js          # 桌面宠物管理 / Desktop pet manager
├── voice-browser.html      # 语音交互页面 / Voice interaction page
├── resources/
│   ├── app.asar            # 应用源码包 / App source package
│   └── AutoHotkey64.exe    # AHK 自动化引擎 / AHK automation engine
├── agents/                 # Agent 配置文件目录 / Agent config directory
├── notes/                  # 会议纪要目录 / Meeting notes directory
├── knowledge/              # 本地知识库目录 / Local knowledge base directory
└── package.json
```

---

## 六、工具说明 | Tool Reference

### 文件操作 | File Operations

| 工具 / Tool | 中文说明 | English Description |
| --- | --- | --- |
| `file_read` | 读取文件内容 | Read file content |
| `file_write` | 写入文件内容 | Write file content |
| `file_list` | 列出目录内容 | List directory contents |
| `file_delete` | 删除文件或文件夹 | Delete file or folder |
| `create_folder` | 创建文件夹 | Create folder |

### 系统命令 | System Commands

| 工具 / Tool | 中文说明 | English Description |
| --- | --- | --- |
| `execute_command` | 执行 Windows PowerShell 命令 | Execute Windows PowerShell commands |

### 软件控制 | Software Control

| 工具 / Tool | 中文说明 | English Description |
| --- | --- | --- |
| `open_software` | 打开本地软件或文件 | Open local software or file |
| `open_url` | 在浏览器中打开指定网页 | Open specified URL in browser |

### Agent 管理 | Agent Management

| 工具 / Tool | 中文说明 | English Description |
| --- | --- | --- |
| `create_agent` | 创建新 Agent | Create new Agent |
| `list_agents` | 列出所有 Agent | List all Agents |
| `get_agent` | 获取指定 Agent 信息 | Get specified Agent info |
| `update_agent` | 更新 Agent 配置 | Update Agent configuration |
| `delete_agent` | 删除 Agent | Delete Agent |
| `call_agent` | 调用指定 Agent 完成任务 | Invoke specified Agent to complete task |

### 源码开发 | Source Code Development

| 工具 / Tool | 中文说明 | English Description |
| --- | --- | --- |
| `read_source_file` | 读取源码文件 | Read source file |
| `write_source_file` | 写入源码文件 | Write source file |
| `patch_source_file` | 补丁方式修改源码 | Patch source file |
| `check_syntax` | 检查代码语法 | Check code syntax |
| `run_node_check` | 运行 Node 检查 | Run Node.js check |
| `restart_app` | 重启应用使修改生效 | Restart app to apply changes |

### Windows UI 自动化 | Windows UI Automation

| 工具 / Tool | 中文说明 | English Description |
| --- | --- | --- |
| `win_find_window` | 查找窗口 | Find window |
| `win_activate_window` | 激活窗口 | Activate window |
| `win_send_keys` | 发送按键 | Send keystrokes |
| `win_click` | 模拟鼠标点击 | Simulate mouse click |
| `run_ahk_script` | 运行 AHK 脚本 | Run AHK script |
| `ahk_find_window` | AHK 方式查找窗口 | Find window via AHK |
| `ahk_send_input` | AHK 方式发送输入 | Send input via AHK |
| `ahk_click_control` | AHK 方式点击控件 | Click control via AHK |

---

## 七、Agent 系统 | Agent System

### 内置 Agent | Built-in Agents

| Agent ID | 名称 / Name | 定位 / Position |
| --- | --- | --- |
| `default` | 灵动 AI 助手 / LingDong AI Assistant | 默认助手，支持全量本地工具 / Default assistant with full local tools |
| `meeting-assistant` | 智能会议纪要助手 / Smart Meeting Notes Assistant | 录音转文字，自动生成结构化会议纪要 / Transcribe audio and generate structured meeting notes |
| `weather-assistant` | 天气查询助手 / Weather Assistant | 查询全国各地实时天气、未来预报 / Query real-time weather and forecasts |
| `agent-1782184315667` | 项目跟进管理助手 / Project Tracking Assistant | 专业管理 Excel 项目跟踪表 / Manage Excel project tracking sheets |
| `agent-1782375348127` | 高德地图标记助手 / Amap Marker Assistant | 地址转坐标并在地图上标记 / Convert addresses to coordinates and mark on map |
| `agent-1782807780751` | 本地知识库助手 / Local Knowledge Base Assistant | 管理和检索本地知识库 / Manage and retrieve local knowledge base |
| `agent-1783913401881` | 顶级市场研究员 / Top Market Researcher | 行业洞察、竞品分析、用户调研 / Industry insight, competitive analysis, user research |
| `agent-1783913401888` | 顶级产品专家 / Top Product Expert | 产品规划、需求分析、UX 设计 / Product planning, requirement analysis, UX design |
| `agent-1783913401892` | 顶级投资战略专家 / Top Investment Strategy Expert | 商业模式、投融资分析、战略规划 / Business model, investment analysis, strategic planning |

### 创建 Agent | Create Agent

```javascript
create_agent({
  name: "我的专属助手",
  description: "一个专业的数据分析助手",
  systemPrompt: "你是一个专业的数据分析师，擅长...",
  tools: ["file_read", "search_web", "execute_command"]
});
```

### 调用 Agent | Invoke Agent

```javascript
call_agent({
  agentId: "agent-1783913401881",
  task: "分析一下 AI 陪伴市场的规模和竞争格局"
});
```

---

## 八、源码开发 | Source Code Development

### 读取源码 | Read Source Code

```javascript
read_source_file({
  filename: "main.js"
});
```

### 修改源码 | Write Source Code

```javascript
write_source_file({
  filename: "main.js",
  content: "// 新的源码内容"
});
```

### 补丁修改 | Patch Source Code

```javascript
patch_source_file({
  filename: "main.js",
  oldCode: "console.log('old')",
  newCode: "console.log('new')"
});
```

### 重启生效 | Restart to Apply

```javascript
restart_app();
```

---

## 九、MCP 扩展 | MCP Extension

通过 `mcp_call`，灵动 AI 可以接入任何 MCP Server。

Through `mcp_call`, LingDong AI can connect to any MCP Server.

```javascript
mcp_call({
  serverUrl: "http://localhost:3000",
  toolName: "create_issue",
  toolArgs: {
    repo: "your-repo",
    title: "Bug report",
    body: "Something went wrong..."
  }
});
```

---

## 十、安全与权限 | Security and Permissions

灵动 AI 拥有强大的系统操作权限，因此安全设计至关重要。

LingDong AI has powerful system operation privileges, so security design is critical.

### 安全建议 | Security Recommendations

1. **最小权限原则 / Principle of Least Privilege**：仅在必要时启用高风险工具 / Enable high-risk tools only when necessary
2. **操作确认 / Operation Confirmation**：对于删除、格式化等危险操作，增加二次确认 / Add secondary confirmation for dangerous operations
3. **沙箱隔离 / Sandbox Isolation**：敏感操作在隔离环境中执行 / Execute sensitive operations in isolated environments
4. **日志审计 / Log Auditing**：记录所有工具调用日志 / Log all tool invocations
5. **API Key 保护 / API Key Protection**：不要将 API Key 硬编码在源码中 / Do not hardcode API keys in source code

### 风险提示 | Risk Warning

灵动 AI 可以执行删除文件、运行命令等操作，请在可信环境中使用，并确保理解每个工具调用的后果。

LingDong AI can delete files, run commands, and perform other operations. Please use it in a trusted environment and ensure you understand the consequences of each tool invocation.

---

## 十一、开发路线 | Development Roadmap

### 第一阶段：核心能力 | Phase 1: Core Capabilities

- [x] 文件与系统操作 / File and system operations
- [x] 网页搜索与抓取 / Web search and fetching
- [x] Agent 管理与协作 / Agent management and collaboration
- [x] 源码自修改能力 / Self-source-code modification

### 第二阶段：自动化增强 | Phase 2: Automation Enhancement

- [ ] 更强大的 Windows UI 自动化 / More powerful Windows UI automation
- [ ] 定时任务与计划任务 / Scheduled and cron tasks
- [ ] 跨应用工作流编排 / Cross-application workflow orchestration

### 第三阶段：生态扩展 | Phase 3: Ecosystem Expansion

- [ ] MCP Server 市场 / MCP Server marketplace
- [ ] 插件系统 / Plugin system
- [ ] 多模态能力增强 / Multimodal capability enhancement

### 第四阶段：智能进化 | Phase 4: Intelligent Evolution

- [ ] AI 自动修复自身 bug / AI auto-fixes its own bugs
- [ ] AI 自动生成新工具 / AI auto-generates new tools
- [ ] 长期记忆与个性化 / Long-term memory and personalization

---

## 十二、贡献指南 | Contributing

欢迎贡献代码、提交 Issue、分享想法！

Contributions, issues, and ideas are welcome!

### 提交 Issue | Submitting Issues

请描述清楚问题复现步骤、期望结果和实际结果。

Please describe the reproduction steps, expected results, and actual results.

### 提交 Pull Request | Submitting Pull Requests

```bash
# Fork 本仓库 / Fork this repository
git checkout -b feature/your-feature
git commit -m "Add some feature"
git push origin feature/your-feature
# 发起 Pull Request / Open a Pull Request
```

---

## 十三、许可证 | License

本项目采用 MIT License 开源协议。

This project is licensed under the MIT License.

---

## 十四、致谢 | Acknowledgements

感谢所有贡献者和用户的支持。灵动 AI 的愿景是成为每个人的智能操作系统，让 AI 真正走进工作和生活。

Thanks to all contributors and users. LingDong AI's vision is to become everyone's intelligent operating system, allowing AI to truly enter work and life.

---

> **灵动 AI / LingDong AI**
>
> **不只是聊天，更是执行。**
>
> **Not just chat, but execution.**

