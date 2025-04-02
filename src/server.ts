import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import cors from "cors";
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { createLoggerWithTraceId, log } from "./component/logger.js"; // 导入创建带有traceId的日志函数
import { config } from "./config/server-config.js";
import { RouterMcpServer } from "./server/mcp.js";
import { UriAwareTransport } from "./server/transport.js";

// 扩展Express请求类型
declare global {
  namespace Express {
    interface Request {
      log: ReturnType<typeof createLoggerWithTraceId>;
    }
  }
}

// 存储活跃的传输，使用Map来管理多个连接
export const activeTransports = new Map<string, UriAwareTransport>();

// 创建Express应用
const app = express();

// 启用CORS
app.use(cors());

// 添加请求跟踪中间件
app.use((req, res, next) => {
  // 从请求头中获取traceId，如果没有则生成一个新的
  const traceId = (req.headers["x-trace-id"] as string) || uuidv4();

  // 将traceId添加到响应头中
  res.setHeader("x-trace-id", traceId);

  // 为请求创建一个带有traceId的日志实例
  req.log = createLoggerWithTraceId(traceId);

  // 记录请求信息
  req.log.info(`${req.method} ${req.url}`);

  next();
});

// 创建MCP服务器
const server = new RouterMcpServer({
  name: config.mcp.serverName,
  version: config.mcp.serverVersion,
});

// 健康检查端点
app.get("/health", (req, res) => {
  req.log.info("健康检查请求");
  res.status(200).json({
    status: "ok",
    serverName: config.mcp.serverName,
    version: config.mcp.serverVersion,
  });
});

// 设置SSE端点
app.get(`${config.mcp.sseEndpoint}/:key(*)`, async (req, res) => {
  try {
    // 创建SSE传输
    const baseTransport = new SSEServerTransport(
      config.mcp.messagesEndpoint,
      res
    );

    // 获取路由参数中的key
    const key = req.params.key || "";
    req.log.info(`[sse]接收SSE连接请求，key: ${key || "空"}`);

    // 使用UriAwareTransport包装，便于在请求间传递uri信息
    const transport = new UriAwareTransport(baseTransport, key, res);

    // 获取服务器生成的会话ID
    const sessionId = transport.sessionId;

    // 存储传输
    activeTransports.set(sessionId, transport);
    req.log.info(
      `[sse]创建传输对象成功，存储到activeTransports, 当前连接数: ${activeTransports.size}`
    );

    // 连接MCP服务器
    req.log.info(`[sse]正在连接到MCP服务器: ${sessionId}, key: ${key || "空"}`);
    await server.connect(transport);
    req.log.info(`[sse]已连接到MCP服务器: ${sessionId}, key: ${key || "空"}`);

    // 设置心跳定时器，每分钟发送一次心跳消息
    const heartbeatInterval = setInterval(() => {
      try {
        // 发送符合JSON-RPC 2.0规范的心跳消息
        res.write(
          `data: {"jsonrpc":"2.0","method":"heartbeat","params":{"timestamp":${Date.now()}}}\n\n`
        );
        req.log.info(`[sse]发送心跳到客户端 ${sessionId}`);
      } catch (err) {
        req.log.error(`[sse]发送心跳失败 ${sessionId}: ${err}`);
        clearInterval(heartbeatInterval);
      }
    }, 60000); // 60秒 = 1分钟

    // 当客户端断开连接时
    req.on("close", () => {
      req.log.info(`[sse]准备清理连接 ${sessionId}`);
      // 清除心跳定时器
      clearInterval(heartbeatInterval);
      activeTransports.delete(sessionId);
      req.log.info(`[sse]客户端 ${sessionId} 断开连接`);
    });
    // 保持连接打开
    req.on("end", () => {
      req.log.info(`[sse]连接结束 ${sessionId}`);
      // 确保定时器被清除
      clearInterval(heartbeatInterval);
    });
  } catch (error) {
    req.log.error(`[sse]处理SSE连接请求失败: ${error}`);
    res.status(500).end();
  }
});

// 设置消息端点
app.post(`${config.mcp.messagesEndpoint}`, async (req, res) => {
  try {
    // 从查询参数中获取会话ID
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      req.log.error(`[message]缺少会话ID`);
      return res.status(400).json({ error: "缺少会话ID" });
    }

    req.log.info(`[message]收到消息请求，sessionId: ${sessionId}`);

    const transport = activeTransports.get(sessionId);

    if (!transport) {
      req.log.error(`[message]找不到会话ID为 ${sessionId} 的传输`);
      return res.status(400).json({ error: "没有活跃的连接" });
    }

    // 处理消息
    req.log.info(`[message]处理会话ID为 ${sessionId} 的消息`);

    // 根据传输类型处理消息
    await transport.handlePostMessage(req, res);
  } catch (error) {
    req.log.error(`[message]处理消息失败: ${error}`);
    if (!res.headersSent) {
      res.status(500).json({ error: "处理消息失败" });
    }
  }
});

// 启动服务器
const PORT = config.mcp.serverPort;
app.listen(PORT, () => {
  log.info(`[server]MCP服务器已启动，监听端口 ${PORT}`);
  log.info(`[server]服务器地址: http://localhost:${PORT}`);
  log.info(`[server]SSE端点: /sse/:key`);
  log.info(`[server]消息端点: /message?sessionId=xxx`);

  // 输出已注册工具信息
  setTimeout(() => {
    const registeredTools = server["registeredTools"] || new Map();
    const toolCount = registeredTools.size;
    log.info(`[server]已注册工具总数: ${toolCount}`);
    if (toolCount > 0) {
      const toolNames = Array.from(registeredTools.keys());
      log.info(`[server]已注册工具列表: ${toolNames.join(", ")}`);
    }
  }, 1000);
});

// 添加未捕获异常处理
process.on("uncaughtException", (error) => {
  log.error(`[server]未捕获的异常: ${error}`);
});

process.on("unhandledRejection", (reason, promise) => {
  log.error(`[server]未处理的Promise拒绝: ${reason}`);
});
