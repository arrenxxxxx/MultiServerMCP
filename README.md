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

## 📦 Installation

```bash
npm install multi-server-mcp
# or
yarn add multi-server-mcp
# or
pnpm add multi-server-mcp
```

## 🚀 Quick Start

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

## 🔧 Development Guide

Currently only SSE mode is supported.

### Supported Tool Types

- Regular tools: `server.tool()`
- Resource tools: `server.resource()`
- Prompt tools: `server.prompt()`

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## 📄 License

[MIT](LICENSE)
