import { renderMarkdownTable } from '../../src/mcp/format/markdownTable';
import { formatList, formatJson, formatError } from '../../src/mcp/format/resultFormatter';

describe('renderMarkdownTable', () => {
  it('renders a header with id first and rows in column order', () => {
    const out = renderMarkdownTable(
      [
        { id: 1, title: 'A', year: 2020 },
        { id: 2, title: 'B', year: 2021 },
      ],
      ['id', 'title', 'year']
    );
    const lines = out.split('\n');
    expect(lines[0]).toBe('| id | title | year |');
    expect(lines[1]).toBe('| --- | --- | --- |');
    expect(lines[2]).toBe('| 1 | A | 2020 |');
    expect(lines[3]).toBe('| 2 | B | 2021 |');
  });

  it('renders null cells as em-dash', () => {
    const out = renderMarkdownTable(
      [{ id: 1, title: null, year: null }],
      ['id', 'title', 'year']
    );
    expect(out).toContain('| 1 | — | — |');
  });

  it('handles empty rows with a clear message', () => {
    const out = renderMarkdownTable([] as Array<Record<string, unknown>>, ['id']);
    expect(out).toContain('No results.');
  });

  it('appends total_count and truncated metadata when provided', () => {
    const out = renderMarkdownTable(
      [{ id: 1, title: 'A' }],
      ['id', 'title'],
      { totalCount: 25, truncated: true }
    );
    expect(out).toContain('total_count: 25');
    expect(out).toContain('truncated: true');
  });

  it('escapes pipe and newline characters in cells', () => {
    const out = renderMarkdownTable(
      [{ id: 1, title: 'foo|bar\nbaz' }],
      ['id', 'title']
    );
    expect(out).toContain('foo\\|bar baz');
    expect(out).not.toMatch(/\| foo\|bar/);
  });

  it('formats booleans as yes/no', () => {
    const out = renderMarkdownTable(
      [{ id: 1, watched: true, read: false }],
      ['id', 'watched', 'read']
    );
    expect(out).toContain('| 1 | yes | no |');
  });
});

describe('formatList', () => {
  it('produces JSON with total_count, truncated, items when format=json', () => {
    const result = formatList({
      rows: [{ id: 1, title: 'A' }],
      columns: ['id', 'title'],
      totalCount: 5,
      truncated: true,
      format: 'json',
    });
    expect(result.content).toHaveLength(1);
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed).toEqual({
      total_count: 5,
      returned: 1,
      truncated: true,
      items: [{ id: 1, title: 'A' }],
    });
  });

  it('produces a Markdown table when format=markdown', () => {
    const result = formatList({
      rows: [{ id: 1, title: 'A' }],
      columns: ['id', 'title'],
      totalCount: 1,
      truncated: false,
      format: 'markdown',
    });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('| id | title |');
    expect(text).toContain('| 1 | A |');
  });

  it('JSON output replaces undefined column values with null', () => {
    const result = formatList({
      rows: [{ id: 1 } as Record<string, unknown>],
      columns: ['id', 'title'],
      totalCount: 1,
      truncated: false,
      format: 'json',
    });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.items[0]).toEqual({ id: 1, title: null });
  });
});

describe('formatJson and formatError', () => {
  it('formatJson serializes the data to text content', () => {
    const r = formatJson({ a: 1, b: 'x' });
    expect(JSON.parse((r.content[0] as { text: string }).text)).toEqual({ a: 1, b: 'x' });
    expect(r.isError).toBeUndefined();
  });

  it('formatError sets isError true and includes the message', () => {
    const r = formatError('boom');
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toBe('boom');
  });
});
