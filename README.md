# MultiServerMCP

A multi-connection MCP server framework based on SSE for long-connection communication. Provides context and functional extension capabilities for AI assistants.
Currently only supports SSE mode.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![English](https://img.shields.io/badge/Language-English-blue)](README.md)
[![中文简体](https://img.shields.io/badge/Language-简体中文-red)](README_zh.md)

🚀 MultiServerMCP — Enable AI assistants with extended capabilities through multi-connection server framework!

MultiServerMCP is designed to provide a robust server framework that supports multiple client connections to a single server, allowing for efficient tool and permission management for AI assistants.

## 🌟 Main Features

- Support for multiple client connections to a single server in SSE mode
- Tool and permission management by URL grouping
- Built-in heartbeat mechanism to ensure connection stability
- Simplified tool registration process
- Full compatibility with MCP protocol
- Global session management with `SessionManager` to access client context anywhere
- Convenient global functions to retrieve request parameters and client context by sessionId

## 📦 Installation

```bash
npm install multi-server-mcp
# or
yarn add multi-server-mcp
# or
pnpm add multi-server-mcp
```

## 🚀 Quick Start

### Complete Server Example

```typescript
import { z } from "zod";
import { MultiServerMCP } from "multi-server-mcp";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSseReqQuery } from "multi-server-mcp";

// Create MCP server with URL grouping enabled
const server = new MultiServerMCP(
  {
    name: "multi server",
    version: "1.0.0",
  },
  {
    enableUrlGroups: true,
  }
);

// Register a calculator tool that uses request parameters
server.tool("calc/add", { a: z.number(), b: z.number() }, async ({ a, b }, extra) => {
  console.log(extra);
  // Get query parameters from the SSE connection
  const reqQuery = getSseReqQuery(extra.sessionId as string);
  console.log(reqQuery);
  return {
    content: [{ type: "text", text: String(a + b) }],
  };
});

// Register a resource template
server.resource(
  "greeting",
  new ResourceTemplate("greeting://{name}", { list: undefined }),
  async (uri, { name }) => ({
    contents: [
      {
        uri: uri.href,
        text: `Hello, ${name}!`,
      },
    ],
  })
);

// Start the server
server
  .start({
    transportType: "sse",
  })
  .then(() => {
    console.log(`Server started`);
  })
  .catch((error) => {
    console.error(`Server start failed: ${error}`);
    process.exit(1);
  });
```

### Basic Usage

```typescript
import { MultiServerMCP } from 'multi-server-mcp';

// Create MCP server instance
const server = new MultiServerMCP({
  name: 'my-mcp-server',
  version: '1.0.0'
});

// Register a tool
server.tool('my-tool', async () => {
  return {
    content: [{ type: 'text', text: 'Tool executed successfully!' }]
  };
});

// Start the server
server.start({
  transportType: 'sse',
  sse: {
    port: 3000,
    endpoint: '/mcp',
    messagesEndpoint: '/mcp-messages'
  }
});
```

### Tool Grouping and Permission Management

```typescript
// Register a tool with grouping
server.tool('group1/group2/my-tool', async () => {
  return {
    content: [{ type: 'text', text: 'Tool executed successfully!' }]
  };
});

// Start server with permission management
server.start({
  transportType: 'sse',
  enableUrlGroups: true
});
```

### Accessing Client Context Globally

```typescript
import { getSseReqQuery, getClientContextBySessionId } from 'multi-server-mcp';
import { z } from "zod";

// Register a tool that uses request parameters
server.tool("calc/add", { a: z.number(), b: z.number() }, async ({ a, b }, extra) => {
  // Get request parameters from the SSE connection
  const reqQuery = getSseReqQuery(extra.sessionId as string);
  console.log('Query parameters:', reqQuery);
  
  return {
    content: [{ type: "text", text: String(a + b) }],
  };
});

// In any part of your code, you can also access client's request parameters
function myFunction(sessionId: string) {
  // Get query parameters from the SSE connection request
  const reqQuery = getSseReqQuery(sessionId);
  console.log('Client query parameters:', reqQuery);
  
  // Get the full client context if needed
  const clientContext = getClientContextBySessionId(sessionId);
  if (clientContext) {
    console.log('Client URL groups:', clientContext.urlGroups);
    // Access any other client context properties
  }
}
```

## 🔧 Development Guide

Currently only SSE mode is supported.

### Supported Tool Types

- Regular tools: `server.tool()`
- Resource tools: `server.resource()`
- Prompt tools: `server.prompt()`

### Session Management

The `SessionManager` provides a singleton instance to manage client sessions:

- `SessionManager.getInstance()`: Get the singleton instance
- `SessionManager.getInstance().getClientContext(sessionId)`: Get client context by sessionId
- `SessionManager.getInstance().getReqQuery(sessionId)`: Get request query parameters by sessionId
- `SessionManager.getInstance().getSessionCount()`: Get the count of active sessions

For convenience, the following global functions are provided:

- `getSseReqQuery(sessionId)`: Get request query parameters by sessionId
- `getClientContextBySessionId(sessionId)`: Get client context by sessionId

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## 📄 License

[MIT](LICENSE)
