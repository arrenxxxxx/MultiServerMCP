// 主入口文件 - 导出 MultiServerMCP

// 从 server/mcp.ts 导出 MultiServerMCP 类
export { MultiServerMCP } from "./server/mcp.js";

// 导出相关类型
export { ClientContext } from "./server/client-context.js";
export {
  SessionManager,
  getClientContextBySessionId,
  getSseReqQuery,
} from "./server/session-manager.js";

// 导出配置
export { config } from "./config/server-config.js";

// 导出日志工具
export { createLoggerWithTraceId, log } from "./component/logger.js";
