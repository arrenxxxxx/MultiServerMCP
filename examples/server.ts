import { z } from "zod";
import { log } from "../src/component/logger.js";
import { MultiServerMCP } from "../src/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSseReqQuery } from "../src/index.js";

// create mcp server
const server = new MultiServerMCP(
  {
    name: "multi server",
    version: "1.0.0",
  },
  {
    enableUrlGroups: true,
  }
);

server.tool("calc/add", { a: z.number(), b: z.number() }, async ({ a, b }, extra) => {
  console.log(extra);
  const reqQuery = getSseReqQuery(extra.sessionId as string);
  console.log(reqQuery);
  return {
    content: [{ type: "text", text: String(a + b) }],
  };
});

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

// start server
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
