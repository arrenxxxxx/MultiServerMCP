import { log } from "../src/component/logger.js";
import { MultiServerMCP } from "../src/server/mcp.js";

// 创建MCP服务器
const server = new MultiServerMCP({
  name: "multi server",
  version: "1.0.0",
});

// 启动服务器
server
  .start({
    transportType: "sse",
  })
  .then(() => {
    log.info(`[server]server started`);
  })
  .catch((error) => {
    log.error(`[server]server start failed: ${error}`);
    process.exit(1);
  });
