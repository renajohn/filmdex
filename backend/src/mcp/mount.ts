import type { Express, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import logger from '../logger';
import { createMcpServer } from './server';

/**
 * Mount the DexVault MCP server on the given Express app at POST /mcp
 * (and optionally GET/DELETE for the streamable transport).
 *
 * Stateless mode: each request gets a fresh transport+server pair, no session
 * tracking. This matches the PRD decision: search operations are sub-second so
 * stateless HTTP is sufficient.
 */
export const mountMcp = (app: Express, mountPath: string = '/mcp'): void => {
  const handler = async (req: Request, res: Response): Promise<void> => {
    try {
      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on('close', () => {
        transport.close().catch(() => undefined);
        server.close().catch(() => undefined);
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[mcp] handler failed:', message);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal MCP error' },
          id: null,
        });
      }
    }
  };

  app.post(mountPath, handler);
  app.get(mountPath, async (_req: Request, res: Response) => {
    // Stateless transport doesn't support GET/SSE; respond with 405.
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed in stateless mode' },
      id: null,
    });
  });
  app.delete(mountPath, async (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed in stateless mode' },
      id: null,
    });
  });

  logger.info(`[mcp] DexVault MCP server mounted at POST ${mountPath}`);
};
