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
- 全局会话管理器 `SessionManager`，可在任何地方访问客户端上下文
- 提供便捷全局函数，通过sessionId获取请求参数和客户端上下文

## 📦 安装

```bash
npm install multi-server-mcp
# 或
yarn add multi-server-mcp
# 或
pnpm add multi-server-mcp
```

## 🚀 快速开始

### 完整服务器示例

```typescript
import { z } from "zod";
import { MultiServerMCP } from "multi-server-mcp";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSseReqQuery } from "multi-server-mcp";

// 创建启用URL分组的MCP服务器
const server = new MultiServerMCP(
  {
    name: "multi server",
    version: "1.0.0",
  },
  {
    enableUrlGroups: true,
  }
);

// 注册一个使用请求参数的计算器工具
server.tool("calc/add", { a: z.number(), b: z.number() }, async ({ a, b }, extra) => {
  console.log(extra);
  // 获取SSE连接中的请求参数
  const reqQuery = getSseReqQuery(extra.sessionId as string);
  console.log(reqQuery);
  return {
    content: [{ type: "text", text: String(a + b) }],
  };
});

// 注册一个资源模板
server.resource(
  "greeting",
  new ResourceTemplate("greeting://{name}", { list: undefined }),
  async (uri, { name }) => ({
    contents: [
      {
        uri: uri.href,
        text: `你好，${name}！`,
      },
    ],
  })
);

// 启动服务器
server
  .start({
    transportType: "sse",
  })
  .then(() => {
    console.log(`服务器已启动`);
  })
  .catch((error) => {
    console.error(`服务器启动失败: ${error}`);
    process.exit(1);
  });
```

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

### 全局访问客户端上下文

```typescript
import { getSseReqQuery, getClientContextBySessionId } from 'multi-server-mcp';
import { z } from "zod";

// 注册一个使用请求参数的工具
server.tool("calc/add", { a: z.number(), b: z.number() }, async ({ a, b }, extra) => {
  // 获取SSE连接中的请求参数
  const reqQuery = getSseReqQuery(extra.sessionId as string);
  console.log('查询参数:', reqQuery);
  
  return {
    content: [{ type: "text", text: String(a + b) }],
  };
});

// 在代码的任何部分，都可以访问客户端的请求参数
function myFunction(sessionId: string) {
  // 获取SSE连接请求中的查询参数
  const reqQuery = getSseReqQuery(sessionId);
  console.log('客户端查询参数:', reqQuery);
  
  // 需要时可获取完整的客户端上下文
  const clientContext = getClientContextBySessionId(sessionId);
  if (clientContext) {
    console.log('客户端URL分组:', clientContext.urlGroups);
    // 访问客户端上下文的其他属性
  }
}
```

## 🔧 开发指南

目前仅支持SSE模式。

### 支持的工具类型

- 普通工具：`server.tool()`
- 资源工具：`server.resource()`
- 提示词工具：`server.prompt()`

### 会话管理

`SessionManager` 提供了一个单例实例来管理客户端会话：

- `SessionManager.getInstance()`：获取单例实例
- `SessionManager.getInstance().getClientContext(sessionId)`：通过sessionId获取客户端上下文
- `SessionManager.getInstance().getReqQuery(sessionId)`：通过sessionId获取请求查询参数
- `SessionManager.getInstance().getSessionCount()`：获取活跃会话数量

为了方便使用，提供了以下全局函数：

- `getSseReqQuery(sessionId)`：通过sessionId获取请求查询参数
- `getClientContextBySessionId(sessionId)`：通过sessionId获取客户端上下文

## 🤝 贡献

欢迎提交贡献、问题和功能请求！

## 📄 许可证

[MIT](LICENSE) 