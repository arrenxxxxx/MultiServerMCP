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
  mcp: {
    serverName: process.env.MCP_SERVER_NAME || 'MultiServerMCP',
    serverVersion: process.env.MCP_SERVER_VERSION || '1.0.0',
    serverPort: process.env.MCP_SERVER_PORT || '3001',
    sseEndpoint: formatPath(process.env.MCP_SSE_ENDPOINT || '/sse'),
    messagesEndpoint: formatPath(process.env.MCP_MESSAGES_ENDPOINT || '/message'),
  },
  log: {
    level: process.env.LOG_LEVEL || 'info',
  },

}; 