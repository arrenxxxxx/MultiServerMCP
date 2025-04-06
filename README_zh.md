# MultiServerMCP

支持多连接的MCP服务器框架，基于SSE实现长连接通信。为AI助手提供上下文和功能扩展能力。
目前仅支持SSE模式。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![English](https://img.shields.io/badge/Language-English-blue)](README.md)
[![中文简体](https://img.shields.io/badge/Language-简体中文-red)](README_zh.md)

🚀 MultiServerMCP —— 让每个AI助手都拥有强大的扩展能力！

MultiServerMCP 项目旨在提供一个强大的服务器框架，支持多个客户端连接到同一服务器，为AI助手提供高效的工具和权限管理。

## 🌟 主要特性

- 支持SSE模式下多个客户端连接到同一服务器
- 按URL分组管理工具和权限
- 内置心跳机制，确保连接稳定性
- 简化工具注册流程
- 完全兼容MCP协议

## 📦 安装

```bash
npm install multi-server-mcp
# 或
yarn add multi-server-mcp
# 或
pnpm add multi-server-mcp
```

## 🚀 快速开始

### 基本用法

```typescript
import { MultiServerMCP } from 'multi-server-mcp';

// 创建MCP服务器实例
const server = new MultiServerMCP({
  name: 'my-mcp-server',
  version: '1.0.0'
});

// 注册工具
server.tool('my-tool', async () => {
  return {
    content: [{ type: 'text', text: '工具执行成功!' }]
  };
});

// 启动服务器
server.start({
  transportType: 'sse',
  sse: {
    port: 3000,
    endpoint: '/mcp',
    messagesEndpoint: '/mcp-messages'
  }
});
```

### 工具分组与权限管理

```typescript
// 使用分组注册工具
server.tool('group1/group2/my-tool', async () => {
  return {
    content: [{ type: 'text', text: '工具执行成功!' }]
  };
});

// 启动带权限管理的服务器
server.start({
  transportType: 'sse',
  enableUrlGroups: true
});
```

## 🔧 开发指南

目前仅支持SSE模式。

### 支持的工具类型

- 普通工具：`server.tool()`
- 资源工具：`server.resource()`
- 提示词工具：`server.prompt()`

## 🤝 贡献

欢迎提交贡献、问题和功能请求！

## 📄 许可证

[MIT](LICENSE) 