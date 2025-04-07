import { ServerOptions } from "@modelcontextprotocol/sdk/server/index.js";
import {
  McpServer,
  PromptCallback,
  ReadResourceCallback,
  ReadResourceTemplateCallback,
  ResourceMetadata,
  ResourceTemplate,
  ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  CallToolResult,
  ErrorCode,
  GetPromptRequestSchema,
  GetPromptResult,
  Implementation,
  ListPromptsRequestSchema,
  ListPromptsResult,
  ListResourcesRequestSchema,
  ListResourcesResult,
  ListToolsRequestSchema,
  ListToolsResult,
  McpError,
  Prompt,
  PromptArgument,
  ReadResourceRequestSchema,
  ReadResourceResult,
  Resource,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import cors from "cors";
import express, { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  AnyZodObject,
  z,
  ZodOptional,
  ZodRawShape,
  ZodType,
  ZodTypeDef,
} from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { createLoggerWithTraceId, log } from "../component/logger.js";
import { config } from "../config/server-config.js";
import { ClientContext } from "./client-context.js";
import { SessionManager } from "./session-manager.js";

declare global {
  namespace Express {
    interface Request {
      log: ReturnType<typeof createLoggerWithTraceId>;
    }
  }
}

interface ToolRegistration {
  name: string;
  group: string[];
  description?: string;
  inputSchema?: AnyZodObject;
  callback: ToolCallback<any>;
}

interface ResourceRegistration {
  name: string;
  group: string[];
  uri?: string;
  template?: ResourceTemplate;
  metadata?: ResourceMetadata;
  readCallback: ReadResourceCallback | ReadResourceTemplateCallback;
  type: "uri" | "template";
}

interface PromptRegistration {
  name: string;
  group: string[];
  description?: string;
  argsSchema?: AnyZodObject;
  callback: PromptCallback<any>;
}

export class MultiServerMCP extends McpServer {
  private $registeredTools: Map<string, ToolRegistration> = new Map();
  private $registeredResources: Map<string, ResourceRegistration> = new Map();
  private $registeredPrompts: Map<string, PromptRegistration> = new Map();

  private _app: express.Application | null = null;
  private _serverInstance: ReturnType<express.Application["listen"]> | null =
    null;
  private _enableUrlGroups: boolean;
  private _mainServerInfo: Implementation;

  private _subServerCount: number = 0;

  constructor(
    serverInfo: Implementation,
    options?: ServerOptions & { enableUrlGroups?: boolean }
  ) {
    super(serverInfo, options);
    this._enableUrlGroups = options?.enableUrlGroups ?? false;
    this._mainServerInfo = serverInfo;
  }

  public async start(options?: {
    transportType?: "sse";
    sse?: {
      endpoint?: `/${string}`;
      messagesEndpoint?: `/${string}`;
      port?: number | string;
    };
  }) {
    const transportType = options?.transportType || "sse";
    const sseEndpoint = options?.sse?.endpoint || config.mcp.sseEndpoint;
    const messagesEndpoint =
      options?.sse?.messagesEndpoint || config.mcp.messagesEndpoint;
    const ssePort = options?.sse?.port || config.mcp.serverPort;

    if (transportType !== "sse") {
      throw new Error(`Unsupported transport type: ${transportType}`);
    }

    // create express
    const app = express();
    this._app = app;

    // use CORS
    app.use(cors());

    // trace request
    app.use((req, res, next) => {
      const traceId = (req.headers["x-trace-id"] as string) || uuidv4();

      // add traceId to response header
      res.setHeader("x-trace-id", traceId);

      req.log = createLoggerWithTraceId(traceId);

      req.log.info(`${req.method} ${req.url}`);

      next();
    });

    // health check endpoint
    app.get("/health", (req, res) => {
      req.log.debug("health check request");
      res.status(200).json({
        status: "ok",
      });
    });

    // set SSE endpoint
    app.get([`${sseEndpoint}`, `${sseEndpoint}/:key(*)`], async (req, res) => {
      try {
        // get key from route params, if not present use empty string
        const key = req.params.key || "";
        req.log.info(
          `[sse] receive sse connection request, key: ${key || "empty"}`
        );

        // create SSE transport
        const transport = new SSEServerTransport(messagesEndpoint, res);

        const clientContext = new ClientContext(transport, key, req, res);

        await this.connectServer(clientContext);
      } catch (error) {
        req.log.error(`[sse]handle sse connection request failed: ${error}`);
        res.status(500).end();
      }
    });

    // set message endpoint
    app.post(`${messagesEndpoint}`, async (req, res) => {
      try {
        await this.handleMessage(req, res);
      } catch (error) {
        req.log.error(`[message]handle message failed: ${error}`);
        if (!res.headersSent) {
          res.status(500).json({ error: "handle message failed" });
        }
      }
    });

    // start server
    const PORT = ssePort;
    this._serverInstance = app.listen(PORT, () => {
      log.info(`[server]mcp server started, listening on port ${PORT}`);
      log.info(`[server]sse endpoint: ${sseEndpoint}`);
      log.info(`[server]message endpoint: ${messagesEndpoint}`);

      // output registered tools info
      setTimeout(() => {
        const registeredTools = this.$registeredTools;
        const toolCount = registeredTools.size;
        log.debug(`[server]registered tools count: ${toolCount}`);
        if (toolCount > 0) {
          const toolNames = Array.from(registeredTools.keys());
          log.debug(`[server]registered tools list: ${toolNames.join(", ")}`);
        }
      }, 1000);
    });

    process.on("uncaughtException", (error) => {
      log.error(`[server]uncaught exception: ${error}`);
    });

    process.on("unhandledRejection", (reason, promise) => {
      log.error(`[server]unhandled promise rejection: ${reason}`);
    });

    return this;
  }

  async connectServer(clientContext: ClientContext): Promise<void> {
    const req = clientContext.req;
    // connect to mcp server
    req.log.info(
      `[sse]connecting to mcp server: ${clientContext.sessionId}, key: ${
        clientContext.uri || "empty"
      }`
    );

    req.log.debug(`[mcp]connect to mcp server: ${clientContext.sessionId}`);

    // create mcp server
    const server = new McpServer({
      name: `${this._mainServerInfo.name}-${this._subServerCount}`,
      version: this._mainServerInfo.version,
    });

    clientContext.server = server;
    // register client
    SessionManager.getInstance().registerClientContext(clientContext);

    // set custom request handlers
    this.setCustomToolRequestHandlers(server);
    this.setCustomResourceRequestHandlers(server);
    this.setCustomPromptRequestHandlers(server);

    await server.connect(clientContext.transport);

    const heartbeatInterval = setInterval(() => {
      try {
        server.server.ping();
        req.log.debug(
          `[sse]send heartbeat to client: ${clientContext.sessionId}`
        );
      } catch (err) {
        req.log.error(
          `[sse]send heartbeat failed: ${clientContext.sessionId}: ${err}`
        );
        clearInterval(heartbeatInterval);
      }
    }, 60000);

    req.on("close", () => {
      req.log.debug(
        `[sse]prepare to clean connection: ${clientContext.sessionId}`
      );
      clearInterval(heartbeatInterval);

      // remove from session
      SessionManager.getInstance().removeSession(clientContext.sessionId);

      req.log.debug(`[sse]client ${clientContext.sessionId} disconnected`);
    });

    req.on("end", () => {
      req.log.debug(`[sse]connection closed: ${clientContext.sessionId}`);
      clearInterval(heartbeatInterval);
    });
  }

  /**
   * handle message request
   * @param req request object
   * @param res response object
   */
  async handleMessage(req: Request, res: Response): Promise<void> {
    // get sessionId from query params
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      req.log.error(`[message]missing sessionId`);
      res.status(400).json({ error: "missing sessionId" });
      return;
    }

    req.log.info(`[message]receive message request, sessionId: ${sessionId}`);

    // handle message based on transport type
    const clientContext =
      SessionManager.getInstance().getClientContext(sessionId);
    if (!clientContext) {
      req.log.error(`[message]client ${sessionId} not found`);
      res.status(404).json({ error: "client not found" });
      return;
    }
    await clientContext.transport.handlePostMessage(req, res);
  }

  /**
   * parse tool group from tool name
   */
  private parseToolGroup(name: string): string[] {
    if (!this._enableUrlGroups) {
      return [];
    }

    if (!name) {
      return [];
    }
    const parts = name.split("/");
    const groups = parts.length > 1 ? parts.slice(0, -1) : [];
    log.debug(`[mcp]parse tool group: "${name}" => ${JSON.stringify(groups)}`);
    return groups;
  }

  /**
   * check permission
   */
  private hasPermission(toolGroups: string[], keyGroups?: string[]): boolean {
    if (!this._enableUrlGroups) {
      return true;
    }

    log.debug(
      `[mcp]check permission - tool groups: ${JSON.stringify(
        toolGroups
      )}, key groups: ${JSON.stringify(keyGroups)}`
    );

    if (!keyGroups || keyGroups.length === 0) {
      log.debug(`[mcp]check permission - no key groups, allow access`);
      return true;
    }

    if (!toolGroups || toolGroups.length === 0) {
      log.debug(`[mcp]check permission - tool has no groups, allow access`);
      return true;
    }

    if (toolGroups.length < keyGroups.length) {
      log.debug(
        `[mcp]check permission - tool groups level(${toolGroups.length}) is less than key groups level(${keyGroups.length}), reject access`
      );
      return false;
    }

    for (let i = 0; i < keyGroups.length; i++) {
      if (toolGroups[i] !== keyGroups[i]) {
        log.debug(
          `[mcp]check permission - groups not match: ${toolGroups[i]} != ${keyGroups[i]}, at position ${i}, reject access`
        );
        return false;
      }
    }

    log.debug(`[mcp]check permission - groups match, allow access`);
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
    const group = this.parseToolGroup(name);
    log.info(`[mcp]register tool: ${name}, group: ${JSON.stringify(group)}`);
    name = name.replace("/", "_");

    const args = [...rest];

    let description: string | undefined;
    if (typeof args[0] === "string") {
      description = args.shift() as string;
    }

    let paramsSchema: ZodRawShape | undefined;
    if (args.length > 1) {
      paramsSchema = args.shift() as ZodRawShape;
    }

    const cb = args[0] as ToolCallback<ZodRawShape | undefined>;

    this.$registeredTools.set(name, {
      name,
      group,
      description,
      inputSchema:
        paramsSchema === undefined ? undefined : z.object(paramsSchema),
      callback: cb,
    });

    log.info(
      `[mcp]tool registered: ${name}, total tools: ${this.$registeredTools.size}`
    );
  }

  resource(name: string, uri: string, readCallback: ReadResourceCallback): void;
  resource(
    name: string,
    uri: string,
    metadata: ResourceMetadata,
    readCallback: ReadResourceCallback
  ): void;
  resource(
    name: string,
    template: ResourceTemplate,
    readCallback: ReadResourceTemplateCallback
  ): void;
  resource(
    name: string,
    template: ResourceTemplate,
    metadata: ResourceMetadata,
    readCallback: ReadResourceTemplateCallback
  ): void;
  resource(name: string, ...rest: unknown[]): void {
    const group = this.parseToolGroup(name);
    log.info(
      `[mcp]register resource: ${name}, group: ${JSON.stringify(group)}`
    );

    const args = [...rest];

    let uri: string | undefined;
    let template: ResourceTemplate | undefined;
    let metadata: ResourceMetadata | undefined;
    let readCallback:
      | ReadResourceCallback
      | ReadResourceTemplateCallback
      | undefined;
    let type: "uri" | "template" | undefined;

    if (typeof args[0] === "string") {
      type = "uri";
      uri = args[0] as string;
      if (args.length === 2) {
        readCallback = args[1] as ReadResourceCallback;
      } else if (args.length === 3) {
        metadata = args[1] as ResourceMetadata;
        readCallback = args[2] as ReadResourceCallback;
      }
    } else if (args[0] instanceof ResourceTemplate) {
      type = "template";
      template = args[0] as ResourceTemplate;
      if (args.length === 2) {
        readCallback = args[1] as ReadResourceTemplateCallback;
      } else if (args.length === 3) {
        metadata = args[1] as ResourceMetadata;
        readCallback = args[2] as ReadResourceTemplateCallback;
      }
    }

    if (!readCallback || !type) {
      log.error(`[mcp]invalid resource registration for ${name}`);
      return;
    }

    this.$registeredResources.set(name, {
      name,
      group,
      uri,
      template,
      metadata,
      readCallback,
      type,
    });

    log.info(
      `[mcp]resource registered: ${name}, total resources: ${this.$registeredResources.size}`
    );
  }

  prompt(name: string, cb: PromptCallback): void;
  prompt(name: string, description: string, cb: PromptCallback): void;
  prompt<
    Args extends {
      [k: string]:
        | ZodType<string, ZodTypeDef, string>
        | ZodOptional<ZodType<string, ZodTypeDef, string>>;
    }
  >(name: string, argsSchema: Args, cb: PromptCallback<Args>): void;
  prompt<
    Args extends {
      [k: string]:
        | ZodType<string, ZodTypeDef, string>
        | ZodOptional<ZodType<string, ZodTypeDef, string>>;
    }
  >(
    name: string,
    description: string,
    argsSchema: Args,
    cb: PromptCallback<Args>
  ): void;
  prompt(name: string, ...rest: unknown[]): void {
    const group = this.parseToolGroup(name);
    log.info(`[mcp]register prompt: ${name}, group: ${JSON.stringify(group)}`);
    name = name.replace("/", "_");

    const args = [...rest];

    let description: string | undefined;
    if (typeof args[0] === "string") {
      description = args.shift() as string;
    }

    let argsSchema: AnyZodObject | undefined;
    if (args.length > 1) {
      const schemaArg = args.shift();
      if (
        typeof schemaArg === "object" &&
        schemaArg !== null &&
        typeof (schemaArg as any).safeParseAsync === "function"
      ) {
        argsSchema = z.object(schemaArg as ZodRawShape);
      } else {
        log.warn(
          `[mcp]invalid argsSchema for prompt ${name}, expected Zod schema object, got ${typeof schemaArg}`
        );
        if (description === undefined && typeof schemaArg === "string") {
          description = schemaArg;
        }
      }
    }

    const cb = args[0] as PromptCallback<any>;

    this.$registeredPrompts.set(name, {
      name,
      group,
      description,
      argsSchema,
      callback: cb,
    });

    log.info(
      `[mcp]prompt registered: ${name}, total prompts: ${this.$registeredPrompts.size}`
    );
  }

  private setCustomToolRequestHandlers(server: McpServer) {
    server.server.registerCapabilities({
      tools: {},
      resources: {},
      prompts: {},
    });

    server.server.setRequestHandler(
      ListToolsRequestSchema,
      (params, extra): ListToolsResult => {
        log.info(
          `[mcp]ListTools processor received request, params: ${JSON.stringify(
            params
          )}, extra: ${JSON.stringify(extra)}`
        );

        const sessionId = extra.sessionId as string;
        log.info(
          `[mcp]ListTools processor received request, sessionId: ${sessionId}`
        );
        const clientContext = SessionManager.getInstance().getClientContext(
          sessionId
        ) as ClientContext;

        const tools = Array.from(this.$registeredTools.entries())
          .filter(([name, tool]) => {
            const urlGroups = clientContext.urlGroups;
            const hasAccess = this.hasPermission(tool.group, urlGroups);
            log.info(
              `[mcp]tool '${name}' access permission: ${
                hasAccess ? "allow" : "reject"
              }, tool groups: ${JSON.stringify(
                tool.group
              )}, user groups: ${JSON.stringify(urlGroups)}`
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
          `[mcp]return ${tools.length} tools based on key permission, total ${this.$registeredTools.size} tools`
        );
        if (tools.length > 0) {
          log.debug(
            `[mcp]allowed tools: ${tools.map((t) => t.name).join(", ")}`
          );
        }

        return {
          tools,
        };
      }
    );

    server.server.setRequestHandler(
      CallToolRequestSchema,
      async (request, extra): Promise<CallToolResult> => {
        const tool = this.$registeredTools.get(request.params.name);
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

          const sessionId = extra.sessionId as string;
          const clientContext = SessionManager.getInstance().getClientContext(
            sessionId
          ) as ClientContext;

          const args = parseResult.data || {};
          args.reqQuery = clientContext.reqQuery;

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
  }

  private setCustomResourceRequestHandlers(server: McpServer) {
    server.server.setRequestHandler(
      ListResourcesRequestSchema,
      (params, extra): ListResourcesResult => {
        log.info(
          `[mcp]ListResources processor received request, params: ${JSON.stringify(
            params
          )}, extra: ${JSON.stringify(extra)}`
        );
        const sessionId = extra.sessionId as string;
        const clientContext = SessionManager.getInstance().getClientContext(
          sessionId
        ) as ClientContext;

        const resources = Array.from(this.$registeredResources.entries())
          .filter(([name, resource]) => {
            const urlGroups = clientContext.urlGroups;
            const hasAccess = this.hasPermission(resource.group, urlGroups);
            log.debug(
              `[mcp]resource '${name}' access permission: ${
                hasAccess ? "allow" : "reject"
              }
               , resource groups: ${JSON.stringify(
                 resource.group
               )}, user groups: ${JSON.stringify(urlGroups)}`
            );
            return hasAccess;
          })
          .map(([name, resource]): Resource => {
            if (resource.type === "uri" && resource.uri) {
              return {
                name,
                uri: resource.uri,
                ...resource.metadata,
              };
            } else if (resource.type === "template" && resource.template) {
              const templateString = resource.template.uriTemplate.toString();
              const variableNames = this.extractVariableNames(templateString);
              return {
                name,
                uri: templateString,
                variables: variableNames.map((v: string) => ({ name: v })),
                ...resource.metadata,
              };
            } else {
              // Should not happen due to registration validation
              throw new Error("Invalid resource registration found");
            }
          });

        log.info(
          `[mcp]return ${resources.length} resources based on key permission, total ${this.$registeredResources.size} resources`
        );
        if (resources.length > 0) {
          log.debug(
            `[mcp]allowed resources: ${resources.map((r) => r.name).join(", ")}`
          );
        }

        return {
          resources,
        };
      }
    );

    server.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request, extra): Promise<ReadResourceResult> => {
        const resourceName = request.params.name as string;
        const resourceReg = this.$registeredResources.get(resourceName);
        if (!resourceReg) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Resource ${resourceName} not found`
          );
        }

        const sessionId = extra.sessionId as string;
        const clientContext = SessionManager.getInstance().getClientContext(
          sessionId
        ) as ClientContext;
        const hasAccess = this.hasPermission(
          resourceReg.group,
          clientContext.urlGroups
        );
        if (!hasAccess) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Access denied to resource ${resourceName}`
          );
        }

        try {
          if (resourceReg.type === "uri") {
            const cb = resourceReg.readCallback as ReadResourceCallback;
            const uri = new URL(request.params.uri); // Ensure URI is parsed
            return await Promise.resolve(cb(uri, extra));
          } else if (resourceReg.type === "template" && resourceReg.template) {
            const cb = resourceReg.readCallback as ReadResourceTemplateCallback;
            const reqUri = new URL(request.params.uri);
            const currentTemplateString =
              resourceReg.template.uriTemplate.toString();
            const variables = this.extractVariablesFromUri(
              currentTemplateString,
              request.params.uri
            );
            if (variables === null) {
              throw new McpError(
                ErrorCode.InvalidParams,
                `URI ${request.params.uri} does not match template for resource ${resourceName}`
              );
            }
            return await Promise.resolve(cb(reqUri, variables, extra));
          } else {
            // Should not happen
            throw new McpError(
              ErrorCode.InternalError,
              "Invalid resource registration state"
            );
          }
        } catch (error) {
          log.error(`[mcp]Error reading resource ${resourceName}: ${error}`);
          throw error; // Re-throw after logging
        }
      }
    );
  }

  private setCustomPromptRequestHandlers(server: McpServer) {
    server.server.setRequestHandler(
      ListPromptsRequestSchema,
      (params, extra): ListPromptsResult => {
        log.info(
          `[mcp]ListPrompts processor received request, params: ${JSON.stringify(
            params
          )}, extra: ${JSON.stringify(extra)}`
        );
        const sessionId = extra.sessionId as string;
        const clientContext = SessionManager.getInstance().getClientContext(
          sessionId
        ) as ClientContext;

        const prompts = Array.from(this.$registeredPrompts.entries())
          .filter(([name, prompt]) => {
            const urlGroups = clientContext.urlGroups;
            const hasAccess = this.hasPermission(prompt.group, urlGroups);
            log.info(
              `[mcp]prompt '${name}' access permission: ${
                hasAccess ? "allow" : "reject"
              }
               , prompt groups: ${JSON.stringify(
                 prompt.group
               )}, user groups: ${JSON.stringify(urlGroups)}`
            );
            return hasAccess;
          })
          .map(
            ([name, prompt]): Prompt => ({
              name,
              description: prompt.description,
              arguments: prompt.argsSchema
                ? this.promptArgumentsFromSchema(prompt.argsSchema)
                : [],
            })
          );

        log.info(
          `[mcp]return ${prompts.length} prompts based on key permission, total ${this.$registeredPrompts.size} prompts`
        );
        if (prompts.length > 0) {
          log.debug(
            `[mcp]allowed prompts: ${prompts.map((p) => p.name).join(", ")}`
          );
        }

        return {
          prompts,
        };
      }
    );

    server.server.setRequestHandler(
      GetPromptRequestSchema,
      async (request, extra): Promise<GetPromptResult> => {
        const promptReg = this.$registeredPrompts.get(request.params.name);
        if (!promptReg) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Prompt ${request.params.name} not found`
          );
        }

        const sessionId = extra.sessionId as string;
        const clientContext = SessionManager.getInstance().getClientContext(
          sessionId
        ) as ClientContext;
        const hasAccess = this.hasPermission(
          promptReg.group,
          clientContext.urlGroups
        );
        if (!hasAccess) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Access denied to prompt ${request.params.name}`
          );
        }

        try {
          if (promptReg.argsSchema) {
            const parseResult = await promptReg.argsSchema.safeParseAsync(
              request.params.arguments
            );
            if (!parseResult.success) {
              throw new McpError(
                ErrorCode.InvalidParams,
                `Invalid arguments for prompt ${request.params.name}: ${parseResult.error.message}`
              );
            }
            const args = parseResult.data;
            const cb = promptReg.callback as PromptCallback<any>; // Cast needed due to generic nature
            // @ts-ignore -
            return await Promise.resolve(cb(args, extra));
          } else {
            const cb = promptReg.callback as PromptCallback<undefined>; // Cast needed
            return await Promise.resolve(cb(extra));
          }
        } catch (error) {
          log.error(
            `[mcp]Error getting prompt ${request.params.name}: ${error}`
          );
          throw error; // Re-throw after logging
        }
      }
    );
  }

  // Helper function to convert Zod schema to PromptArgument array
  private promptArgumentsFromSchema(schema: AnyZodObject): PromptArgument[] {
    return Object.entries(schema.shape).map(([name, field]) => {
      const zodField = field as z.ZodTypeAny; // Assert type
      return {
        name,
        // Safely access description, defaulting to undefined if not present
        description: (zodField as any)?.description ?? undefined,
        required: !(zodField instanceof z.ZodOptional),
      };
    });
  }

  // Helper function to extract variable names from a URI template string
  private extractVariableNames(template: string): string[] {
    const regex = /{(\w+)}/g;
    const matches = [];
    let match;
    while ((match = regex.exec(template)) !== null) {
      matches.push(match[1]);
    }
    return matches;
  }

  // Helper function to extract variables from a URI based on a template string
  private extractVariablesFromUri(
    template: string,
    uri: string
  ): { [key: string]: string } | null {
    const variableNames = this.extractVariableNames(template);
    // Create a regex pattern from the template string
    // Escape regex special characters in the template, except for our variable syntax {}
    const escapedTemplate = template
      .replace(/[-\/\\^$*+?.()|[\]]/g, "\\$&")
      .replace(/\{\w+\}/g, "([^/]+)");
    const regex = new RegExp(`^${escapedTemplate}$`);
    const match = uri.match(regex);

    if (!match) {
      return null;
    }

    const variables: { [key: string]: string } = {};
    // Start from index 1 because index 0 is the full match
    for (let i = 0; i < variableNames.length; i++) {
      variables[variableNames[i]] = match[i + 1];
    }

    return variables;
  }
}
