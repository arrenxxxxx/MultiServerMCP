import {
  McpServer,
  ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  CallToolResult,
  ErrorCode,
  ListToolsRequestSchema,
  ListToolsResult,
  McpError,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { AnyZodObject, z, ZodRawShape } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { log } from "../component/logger.js";
import { UriAwareTransport } from "./transport.js";
// 工具注册信息接口
interface ToolRegistration {
  name: string;
  group: string[];
  description?: string;
  inputSchema?: AnyZodObject;
  callback: ToolCallback<any>;
}

export class RouterMcpServer extends McpServer {
  // 存储活跃的传输，使用Map来管理多个连接
  private activeTransports = new Map<string, UriAwareTransport>();

  private registeredTools: Map<string, ToolRegistration> = new Map();

  async connect(transport: UriAwareTransport): Promise<void> {
    const sseTransport = transport.transport as SSEServerTransport;

    const sessionId = transport.sessionId;
    log.info(`[mcp]连接到MCP服务器: ${sessionId}`);
    this.activeTransports.set(sessionId, transport);

    await super.connect(transport);
  }

  /**
   * 根据工具名称解析其分组
   * @param name 工具名称，例如：jk.ftd.buildProject
   * @returns 分组数组，例如：['jk', 'ftd']
   */
  private parseToolGroup(name: string): string[] {
    if (!name) {
      return [];
    }
    const parts = name.split("/");
    // 最后一个是工具名，之前的都是分组
    const groups = parts.length > 1 ? parts.slice(0, -1) : [];
    log.debug(`[mcp]解析工具分组 "${name}" => ${JSON.stringify(groups)}`);
    return groups;
  }

  /**
   * 检查key是否有权限访问工具
   * @param toolGroups 工具的分组
   * @param keyGroups 当前会话key的分组
   * @returns 是否有权限访问
   */
  private hasPermission(toolGroups: string[], keyGroups?: string[]): boolean {
    log.debug(
      `[mcp]权限检查 - 工具分组: ${JSON.stringify(
        toolGroups
      )}, key分组: ${JSON.stringify(keyGroups)}`
    );

    // 没有key分组信息，表示没有限制
    if (!keyGroups || keyGroups.length === 0) {
      log.debug(`[mcp]权限检查 - 无key分组，允许访问`);
      return true;
    }

    // 如果工具没有分组，允许所有人访问
    if (!toolGroups || toolGroups.length === 0) {
      log.debug(`[mcp]权限检查 - 工具无分组，允许访问`);
      return true;
    }

    // 检查key分组是否是工具分组的前缀
    // 例如：key='jk.ftd'可以访问'jk.ftd.buildProject'
    if (toolGroups.length < keyGroups.length) {
      log.debug(
        `[mcp]权限检查 - 工具分组层级(${toolGroups.length})小于key分组层级(${keyGroups.length})，拒绝访问`
      );
      return false;
    }

    for (let i = 0; i < keyGroups.length; i++) {
      if (toolGroups[i] !== keyGroups[i]) {
        log.debug(
          `[mcp]权限检查 - 分组不匹配: ${toolGroups[i]} != ${keyGroups[i]}, 在位置 ${i}, 拒绝访问`
        );
        return false;
      }
    }

    log.debug(`[mcp]权限检查 - 分组匹配，允许访问`);
    return true;
  }

  tool(name: string, cb: ToolCallback): void;

  tool(name: string, description: string, cb: ToolCallback): void;

  tool<Args extends ZodRawShape>(
    name: string,
    paramsSchema: Args,
    cb: ToolCallback<Args>
  ): void;

  tool<Args extends ZodRawShape>(
    name: string,
    description: string,
    paramsSchema: Args,
    cb: ToolCallback<Args>
  ): void;

  tool(name: string, ...rest: unknown[]): void {
    // 解析工具分组
    const group = this.parseToolGroup(name);
    log.info(`[mcp]注册工具: ${name}, 分组: ${JSON.stringify(group)}`);
    name = name.replace("/", "_");

    // 保留原始参数以供记录
    const args = [...rest];

    // 直接调用父类tool方法，让TypeScript根据参数推断正确的重载版本
    // @ts-ignore - 我们绕过TypeScript的类型检查，因为我们无法直接使用...rest
    super.tool(name, args[0], args[1], args[2]);

    let description: string | undefined;
    if (typeof args[0] === "string") {
      description = args.shift() as string;
    }

    let paramsSchema: ZodRawShape | undefined;
    if (args.length > 1) {
      paramsSchema = args.shift() as ZodRawShape;
    }

    const cb = args[0] as ToolCallback<ZodRawShape | undefined>;

    this.registeredTools.set(name, {
      name,
      group,
      description,
      inputSchema:
        paramsSchema === undefined ? undefined : z.object(paramsSchema),
      callback: cb,
    });

    this.setCustomToolRequestHandlers();

    log.info(
      `[mcp]工具注册完成: ${name}, 当前工具总数: ${this.registeredTools.size}`
    );
  }

  private _customToolHandlersInitialized = false;

  private setCustomToolRequestHandlers() {
    if (this._customToolHandlersInitialized) {
      return;
    }

    this.server.registerCapabilities({
      tools: {},
    });

    this.server.setRequestHandler(
      ListToolsRequestSchema,
      (params, extra): ListToolsResult => {
        log.info(
          `[mcp]ListTools处理器收到请求，params: ${JSON.stringify(
            params
          )}, extra: ${JSON.stringify(extra)}`
        );

        const sessionId = extra.sessionId as string;
        log.info(`[mcp]ListTools处理器收到请求，sessionId: ${sessionId}`);
        const transport = this.activeTransports.get(
          sessionId
        ) as UriAwareTransport;
        log.info(
          `[mcp]ListTools处理器收到请求，transport: ${JSON.stringify(
            transport?.uri
          )}`
        );

        // 根据权限过滤工具
        const tools = Array.from(this.registeredTools.entries())
          .filter(([name, tool]) => {
            const urlGroups = transport?.urlGroups;
            const hasAccess = this.hasPermission(tool.group, urlGroups);
            log.info(
              `[mcp]工具 '${name}' 的访问权限: ${
                hasAccess ? "允许" : "拒绝"
              }, 工具分组: ${JSON.stringify(
                tool.group
              )}, 用户分组: ${JSON.stringify(urlGroups)}`
            );
            return hasAccess;
          })
          .map(([name, tool]) => ({
            name,
            description: tool.description,
            inputSchema: tool.inputSchema
              ? (zodToJsonSchema(tool.inputSchema, {
                  strictUnions: true,
                }) as Tool["inputSchema"])
              : {
                  type: "object" as const,
                },
          }));

        log.info(
          `[mcp]根据key权限返回 ${tools.length} 个工具, 总共 ${this.registeredTools.size} 个`
        );
        if (tools.length > 0) {
          log.debug(
            `[mcp]允许访问的工具: ${tools.map((t) => t.name).join(", ")}`
          );
        }

        return {
          tools,
        };
      }
    );

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request, extra): Promise<CallToolResult> => {
        const tool = this.registeredTools.get(request.params.name);
        if (!tool) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Tool ${request.params.name} not found`
          );
        }

        if (tool.inputSchema) {
          const parseResult = await tool.inputSchema.safeParseAsync(
            request.params.arguments
          );
          if (!parseResult.success) {
            throw new McpError(
              ErrorCode.InvalidParams,
              `Invalid arguments for tool ${request.params.name}: ${parseResult.error.message}`
            );
          }

          const args = parseResult.data;
          const cb = tool.callback as ToolCallback<ZodRawShape>;
          try {
            return await Promise.resolve(cb(args, extra));
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: error instanceof Error ? error.message : String(error),
                },
              ],
              isError: true,
            };
          }
        } else {
          const cb = tool.callback as ToolCallback<undefined>;
          try {
            return await Promise.resolve(cb(extra));
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: error instanceof Error ? error.message : String(error),
                },
              ],
              isError: true,
            };
          }
        }
      }
    );

    this._customToolHandlersInitialized = true;
  }
}
