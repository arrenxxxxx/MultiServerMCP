import { log } from "../component/logger.js";
import { ClientContext } from "./client-context.js";

/**
 * session manager - singteon
 */
export class SessionManager {
  private static instance: SessionManager;
  private _clientContexts: Map<string, ClientContext> = new Map();

  private constructor() {}

  /**
   * get session manager instance
   */
  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * register client context
   * @param clientContext client context object
   */
  public registerClientContext(clientContext: ClientContext): void {
    const sessionId = clientContext.sessionId;
    this._clientContexts.set(sessionId, clientContext);
    log.debug(`[SessionManager]client context registered: ${sessionId}`);
  }

  /**
   * get req query by session id
   * @param sessionId session id
   * @returns req query, if not found return {}
   */
  public getReqQuery(sessionId: string): Record<string, any> {
    const clientContext = this.getClientContext(sessionId);
    if (!clientContext) {
      log.debug(`[SessionManager]session not found: ${sessionId}`);
      return {};
    }
    return clientContext.reqQuery;
  }

  /**
   * get client context by session id
   * @param sessionId session id
   * @returns client context, if not found return null
   */
  public getClientContext(sessionId: string): ClientContext | null {
    const clientContext = this._clientContexts.get(sessionId);
    if (!clientContext) {
      log.debug(`[SessionManager]client context not found: ${sessionId}`);
      return null;
    }
    return clientContext;
  }

  /**
   * remove session
   * @param sessionId session id
   */
  public removeSession(sessionId: string): void {
    const contextRemoved = this._clientContexts.delete(sessionId);

    if (contextRemoved) {
      log.debug(`[SessionManager]session removed: ${sessionId}`);
    }
  }

  /**
   * get active session
   */
  public getSessionCount(): number {
    return this._clientContexts.size;
  }
}

// export convenient get function
export function getSseReqQuery(
  sessionId: string
): Record<string, any> {
  return SessionManager.getInstance().getReqQuery(sessionId);
}

// export convenient get client context function
export function getClientContextBySessionId(
  sessionId: string
): ClientContext | null {
  return SessionManager.getInstance().getClientContext(sessionId);
}
