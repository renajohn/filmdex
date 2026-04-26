import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { renderMarkdownTable } from './markdownTable';

export type OutputFormat = 'markdown' | 'json';

export interface FormatListOptions<T extends object> {
  rows: ReadonlyArray<T>;
  columns: ReadonlyArray<keyof T & string>;
  totalCount: number;
  truncated: boolean;
  format: OutputFormat;
  emptyMessage?: string;
  /** Optional title displayed above the table for context. */
  heading?: string;
}

export const formatList = <T extends object>(
  options: FormatListOptions<T>
): CallToolResult => {
  const { rows, columns, totalCount, truncated, format, emptyMessage, heading } = options;

  if (format === 'json') {
    const payload = {
      total_count: totalCount,
      returned: rows.length,
      truncated,
      items: rows.map(r => {
        const out: Record<string, unknown> = {};
        const obj = r as Record<string, unknown>;
        for (const c of columns) out[c] = obj[c] ?? null;
        return out;
      }),
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    };
  }

  const table = renderMarkdownTable(
    rows as ReadonlyArray<Record<string, unknown>>,
    columns as ReadonlyArray<string>,
    { totalCount, truncated, emptyMessage }
  );
  const text = heading ? `${heading}\n\n${table}` : table;
  return { content: [{ type: 'text', text }] };
};

/** Format a single object as JSON — used by get_* tools. */
export const formatJson = (data: unknown): CallToolResult => {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
};

/** Format an error as MCP error result. */
export const formatError = (message: string): CallToolResult => {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
};
