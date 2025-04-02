# MultiServerMCP

支持多连接的MCP服务器框架，基于SSE实现长连接通信。

## 主要特性

- 支持SSE模式下多个客户端连接到服务器
- 按URL分组管理工具
- 内置心跳机制，确保连接稳定性
- 简化工具注册流程，开发者只需关注工具实现

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 启动服务器

```bash
pnpm run server
```

或使用美化日志输出：

```bash
pnpm run server:pretty
```

## 开发指南

工具开发者只需要将自定义工具注册到服务器即可，无需关心底层请求处理细节。
