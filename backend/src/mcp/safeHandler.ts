import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import logger from '../logger';
import { formatError } from './format/resultFormatter';

const summarize = (input: unknown): string => {
  try {
    const json = JSON.stringify(input);
    if (json && json.length > 300) return json.slice(0, 297) + '...';
    return json ?? 'undefined';
  } catch {
    return '[unserializable]';
  }
};

const sizeOfResult = (result: CallToolResult): number => {
  try {
    let total = 0;
    for (const item of result.content ?? []) {
      if ((item as { type: string }).type === 'text') {
        total += ((item as { text: string }).text || '').length;
      }
    }
    return total;
  } catch {
    return 0;
  }
};

export const safeToolHandler = <Args>(
  toolName: string,
  handler: (args: Args) => Promise<CallToolResult> | CallToolResult
) => {
  return async (args: Args): Promise<CallToolResult> => {
    const start = Date.now();
    try {
      const result = await handler(args);
      const duration = Date.now() - start;
      logger.info(
        `[mcp] tool=${toolName} input=${summarize(args)} duration=${duration}ms size=${sizeOfResult(result)}`
      );
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      logger.error(
        `[mcp] tool=${toolName} input=${summarize(args)} duration=${duration}ms error=${message}`,
        stack
      );
      return formatError(`Tool ${toolName} failed: ${message}`);
    }
  };
};
