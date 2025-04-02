import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * 确保URL格式正确
 * @param url URL字符串
 */
function formatUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * 确保路径格式正确
 * @param path 路径字符串
 */
function formatPath(path: string): string {
  return '/' + path.replace(/^\/+|\/+$/g, '');
}

/**
 * 应用配置
 */
export const config = {
  // MCP服务器配置
  mcp: {
    // 服务器名称
    serverName: process.env.MCP_SERVER_NAME || 'MultiServerMCP',
    // 服务器版本
    serverVersion: process.env.MCP_SERVER_VERSION || '1.0.0',
    // 服务器连接地址
    serverPort: process.env.MCP_SERVER_PORT || '3001',
    // SSE端点
    sseEndpoint: formatPath(process.env.MCP_SSE_ENDPOINT || '/sse'),
    // 消息端点
    messagesEndpoint: formatPath(process.env.MCP_MESSAGES_ENDPOINT || '/message'),
  }

}; 