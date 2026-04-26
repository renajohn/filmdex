export interface MarkdownTableOptions {
  totalCount?: number;
  truncated?: boolean;
  emptyMessage?: string;
}

const MAX_CELL_LENGTH = 200;

const formatCell = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—';
    return String(value);
  }
  let str = String(value);
  // Escape pipe and newline so we don't break the table
  str = str.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
  if (str.length > MAX_CELL_LENGTH) {
    str = str.slice(0, MAX_CELL_LENGTH - 1) + '…';
  }
  return str;
};

export const renderMarkdownTable = <T extends Record<string, unknown>>(
  rows: ReadonlyArray<T>,
  columns: ReadonlyArray<keyof T & string>,
  options: MarkdownTableOptions = {}
): string => {
  const { totalCount, truncated, emptyMessage } = options;
  const lines: string[] = [];

  if (rows.length === 0) {
    lines.push(emptyMessage ?? 'No results.');
    if (typeof totalCount === 'number') {
      lines.push('');
      lines.push(`_total_count: ${totalCount}_`);
    }
    return lines.join('\n');
  }

  const header = `| ${columns.join(' | ')} |`;
  const separator = `| ${columns.map(() => '---').join(' | ')} |`;
  lines.push(header);
  lines.push(separator);
  for (const row of rows) {
    const cells = columns.map(c => formatCell(row[c]));
    lines.push(`| ${cells.join(' | ')} |`);
  }

  const meta: string[] = [];
  if (typeof totalCount === 'number') {
    meta.push(`total_count: ${totalCount}`);
  }
  meta.push(`returned: ${rows.length}`);
  if (truncated) {
    meta.push('truncated: true');
  }
  if (meta.length > 0) {
    lines.push('');
    lines.push(`_${meta.join(' • ')}_`);
  }

  return lines.join('\n');
};
