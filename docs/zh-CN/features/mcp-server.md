# MCP 服务器

让 AI 工具通过 Model Context Protocol（MCP）控制 PackageFlow。

## 什么是 MCP？

Model Context Protocol（MCP）是 AI 工具与应用程序交互的标准。PackageFlow 可以作为 MCP 服务器，允许 AI 助手如：

- Claude Code
- Codex CLI
- Gemini CLI

以编程方式查询和控制 PackageFlow。

## 概览

启用后，PackageFlow 公开 AI 助手可以调用的工具：

- 列出项目
- 运行脚本
- 运行工作流
- 触发部署
- 还有更多

<!-- TODO: Add diagram of MCP architecture -->

## 启用 MCP 服务器

1. 前往**设置** → **MCP**
2. 切换**启用 MCP 服务器**
3. 配置服务器设置
4. 点击**启动服务器**

<!-- TODO: Add screenshot of MCP settings panel -->

## 服务器配置

### 端口

默认：`7234`

如果端口已被使用请更改。

### 主机

默认：`localhost`

基于安全考虑，默认只允许本地连接。

## 权限等级

控制 AI 工具可以做什么：

### 只读

AI 只能查询信息：
- 列出项目
- 查看工作流
- 检查状态

无法进行更改或运行命令。

### 需确认运行

AI 可以请求操作，但您必须批准：
- 出现确认对话框
- 您可以批准或拒绝
- 日常使用安全

### 完整访问

AI 可以无需确认运行任何操作：
- 仅与信任的 AI 工具使用
- 仅建议用于个人自动化

<!-- TODO: Add screenshot of permission level selector -->

## 工具权限

对单独工具的细粒度控制：

| 工具 | 说明 | 风险等级 |
|------|------|----------|
| `list_projects` | 列出所有项目 | 低 |
| `get_project_details` | 获取项目信息 | 低 |
| `list_workflows` | 列出工作流 | 低 |
| `execute_workflow` | 运行工作流 | 中 |
| `run_script` | 运行 npm 脚本 | 中 |
| `execute_command` | 运行 shell 命令 | 高 |
| `trigger_webhook` | 触发 webhook | 中 |

### 自定义工具访问

1. 前往**设置** → **MCP** → **工具权限**
2. 对每个工具设置：
   - **允许**：可以使用
   - **确认**：需要批准
   - **封锁**：无法使用

<!-- TODO: Add screenshot of tool permission matrix -->

## AI CLI 集成

### 支持的 AI CLI

PackageFlow 检测并集成：

| CLI | 检测 |
|-----|------|
| Claude Code | `claude` 命令 |
| Codex CLI | `codex` 命令 |
| Gemini CLI | `gemini` 命令 |

### 运行 AI 命令

1. 前往**设置** → **AI CLI**
2. 选择已安装的 CLI
3. 输入提示
4. 点击**运行**

输出显示在面板中。

<!-- TODO: Add screenshot of AI CLI panel -->

### 示例

**使用 Claude Code：**
```
"将我的项目部署到 Netlify staging"
```

**使用 Codex：**
```
"运行测试并修复任何失败"
```

## MCP 工具参考

### 项目工具

| 工具 | 参数 | 返回 |
|------|------|------|
| `list_projects` | 无 | 项目数组 |
| `get_project_details` | `project_id` | 项目详情 |
| `scan_project` | `path` | 新项目 |

### 工作流工具

| 工具 | 参数 | 返回 |
|------|------|------|
| `list_workflows` | 无 | 工作流数组 |
| `execute_workflow` | `workflow_id` | 运行结果 |
| `get_workflow_status` | `execution_id` | 状态 |

### 脚本工具

| 工具 | 参数 | 返回 |
|------|------|------|
| `list_scripts` | `project_id` | 脚本数组 |
| `run_script` | `project_id`、`script_name` | 运行结果 |
| `stop_script` | `execution_id` | 成功状态 |

### 部署工具

| 工具 | 参数 | 返回 |
|------|------|------|
| `list_deploy_accounts` | 无 | 账户数组 |
| `deploy` | `project_id`、`account_id` | 部署结果 |
| `get_deploy_status` | `deploy_id` | 状态 |

## 日志与监控

### 请求日志

查看所有 MCP 请求：

1. 前往**设置** → **MCP** → **日志**
2. 查看：
   - 时间戳
   - 调用的工具
   - 参数
   - 结果
   - 持续时间

<!-- TODO: Add screenshot of MCP logs -->

### 会话跟踪

跟踪每个 AI 会话：
- 会话 ID
- 连接的 AI 工具
- 请求数量
- 持续时间

## 安全最佳实践

1. **从只读开始**：仅在需要时提升
2. **使用确认模式**：用于敏感操作
3. **定期查看日志**：检查 AI 工具在做什么
4. **限制工具访问**：停用不需要的工具
5. **仅限本地**：除非必要，不要暴露到网络

## 使用案例

### 自动化工作流

让 AI 工具自动化重复任务：

```
"每天早上拉取最新变更并为所有项目运行测试"
```

### 语音控制开发

与语音 AI 配对进行免手操作编程：

```
"为我的博客项目运行开发服务器"
```

### CI/CD 集成

使用 AI 工具管理部署：

```
"测试通过后将最新构建部署到 staging"
```

## 疑难排解

### 服务器无法启动

- 检查端口是否被使用
- 尝试不同的端口
- 确保 PackageFlow 有网络权限

### AI 无法连接

- 验证服务器正在运行
- 检查端口号
- 确保防火墙允许本地连接

### 命令失败

- 检查工具权限
- 查看日志中的错误
- 验证请求的资源存在
