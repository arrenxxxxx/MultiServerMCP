import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Request, Response } from 'express';
import { log } from '../component/logger.js';

/**
 * 带有uri的Transport包装类
 * 用于记录会话uri信息并在请求间传递
 */
export class UriAwareTransport implements Transport {
  private _transport: SSEServerTransport;
  private _uri: string;
  private _urlGroups: string[];
  private _res: Response;

  constructor(transport: SSEServerTransport, uri: string, res: Response) {
    this._transport = transport;
    this._uri = uri;
    this._res = res;

    log.info(`[UriAwareTransport]创建传输包装，sessionId: ${transport.sessionId}, uri: ${uri}`);

    // 生成工具组权限
    this._urlGroups = uri ? uri.split('/') : [];
    log.debug(`[UriAwareTransport]解析toolGroups: ${JSON.stringify(this._urlGroups)}`);
  }

  get uri(): string {
    return this._uri;
  }

  // 代理原始transport的属性和方法
  get sessionId(): string {
    return this.transport.sessionId;
  }

  get transport(): SSEServerTransport {
    return this._transport;
  }

  get urlGroups(): string[] {
    return this._urlGroups;
  }

  // 实现ServerTransport接口方法
  async send(message: any): Promise<void> {
    log.debug(`[UriAwareTransport]发送消息: ${typeof message === 'object' ? JSON.stringify(message) : message}`);
    await this.transport.send(message);
  }

  async close(): Promise<void> {
    log.info(`[UriAwareTransport]关闭传输: ${this.sessionId}, uri: ${this.uri}`);
    await this.transport.close();
  }

  // 实现Transport接口必需的start方法
  async start(): Promise<void> {
    log.info(`[UriAwareTransport]启动传输: ${this.sessionId}, uri: ${this.uri}`);
    await this._transport.start();
  }

  // 处理POST消息的方法，代理到原始transport
  async handlePostMessage(req: Request, res: Response): Promise<void> {
    log.info(`[UriAwareTransport]处理POST消息: ${this.sessionId}, uri: ${this.uri}`);
    await this.transport.handlePostMessage(req, res);
  }

} 