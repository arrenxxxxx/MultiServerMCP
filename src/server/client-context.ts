import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Request, Response } from "express";
import { log } from "../component/logger.js";

export class ClientContext {
  private _transport: SSEServerTransport;
  private _uri: string;
  private _urlGroups: string[];
  private _req: Request;
  private _res: Response;
  private _metadata: Map<string, any> = new Map();

  constructor(
    transport: SSEServerTransport,
    uri: string,
    req: Request,
    res: Response
  ) {
    this._transport = transport;
    this._uri = uri;
    this._req = req;
    this._res = res;

    log.debug(
      `[ClientContext]create client context, sessionId: ${transport.sessionId}, uri: ${uri}`
    );

    // parse permission groups
    this._urlGroups = uri ? uri.split("/") : [];
    log.debug(
      `[ClientContext]parse permission groups: ${JSON.stringify(
        this._urlGroups
      )}`
    );
  }

  get uri(): string {
    return this._uri;
  }

  get sessionId(): string {
    return this.transport.sessionId;
  }

  get transport(): SSEServerTransport {
    return this._transport;
  }

  get urlGroups(): string[] {
    return this._urlGroups;
  }

  get req(): Request {
    return this._req;
  }

  get res(): Response {
    return this._res;
  }

  setMetadata(key: string, value: any): void {
    this._metadata.set(key, value);
  }

  getMetadata<T>(key: string): T | undefined {
    return this._metadata.get(key) as T | undefined;
  }

  /**
   * 清空URL分组信息
   */
  clearUrlGroups(): void {
    this._urlGroups = [];
    log.debug(
      `[ClientContext]cleared URL groups for session: ${this.sessionId}`
    );
  }
}
