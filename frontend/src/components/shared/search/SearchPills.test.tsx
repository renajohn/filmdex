import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SearchPills from './SearchPills';
import { yesNo, type SearchSchema } from './schema';

const composers = ['Bach', 'Carl Philipp Emanuel Bach', 'Händel', 'Joni Mitchell', 'Mozart'];

const schema: SearchSchema = {
  section: 'test',
  placeholder: 'Search the test',
  wordsHint: 'In titles',
  keys: [
    {
      key: 'composer', group: 'Who', type: 'text', desc: 'A composer', example: 'composer:Bach',
      suggest: async typed => composers.filter(c => c.toLowerCase().includes(typed.toLowerCase())).map(value => ({ value })),
    },
    { key: 'cd', group: 'Medium', type: 'bool', desc: 'A CD', values: yesNo('Only your CDs', 'Not your CDs') },
    { key: 'file', group: 'Medium', type: 'enum', desc: 'Its files', values: [{ value: 'lossless', desc: 'FLAC' }, { value: 'lossy', desc: 'Compressed' }] },
    { key: 'genre', group: 'What', type: 'text', desc: 'A genre' },
  ],
};

/** The field as App holds it: the string in a state, every change handed on. */
const Harness: React.FC<{ initial?: string; onChange?: (q: string) => void; measureTops?: (els: HTMLElement[]) => number[] }> = ({ initial = '', onChange, measureTops }) => {
  const [value, setValue] = useState(initial);
  return (
    <>
      <SearchPills schema={schema} value={value} measureTops={measureTops}
        onChange={q => { setValue(q); onChange?.(q); }} />
      <button type="button" onClick={() => setValue('cd:true genre:jazz')}>Set from outside</button>
    </>
  );
};

const input = () => screen.getByRole('combobox');
const pills = () => screen.queryAllByRole('group').map(g => g.getAttribute('aria-label'));
const type = (text: string) => {
  const field = input();
  fireEvent.change(field, { target: { value: text } });
};

describe('SearchPills', () => {
  it('shows a string set from outside as pills, in the words a pill writes', () => {
    render(<Harness initial="composer:Bach,Händel blue" />);
    expect(pills()).toEqual(['composer: Bach or Händel']);
    expect(screen.getByText('blue')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Set from outside' }));

    expect(pills()).toEqual(['cd: yes', 'genre: jazz']);
  });

  it('opens a pill on a key typed, without searching at each letter of its value', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.focus(input());

    type('composer:');
    expect(input()).toHaveAccessibleName('A value of composer');
    onChange.mockClear();

    type('Moz');
    type('Mozart');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('composer:Mozart');
    expect(pills()).toEqual(['composer: Mozart']);
  });

  it('takes the grey rest with Tab: a key, then a value', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.focus(input());

    type('comp');
    expect(screen.getByText('oser:')).toBeInTheDocument();
    fireEvent.keyDown(input(), { key: 'Tab' });
    expect(input()).toHaveAccessibleName('A value of composer');

    type('Moz');
    await waitFor(() => expect(screen.getByText('art')).toBeInTheDocument());
    fireEvent.keyDown(input(), { key: 'Tab' });

    expect(onChange).toHaveBeenLastCalledWith('composer:Mozart');
  });

  it('adds another value with a comma, and keeps the words as typed', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.focus(input());
    type('composer:');

    type('bach');
    fireEvent.keyDown(input(), { key: ',' });
    type('Händel');
    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(onChange).toHaveBeenLastCalledWith('composer:bach,Händel');
  });

  it('excludes with ! typed first, and writes it -', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.focus(input());
    type('!genre:');
    type('jazz');
    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(onChange).toHaveBeenLastCalledWith('-genre:jazz');
    expect(pills()).toEqual(['Not genre: jazz']);
  });

  it('opens the last pill again on ⌫ in the empty field, on its last value', () => {
    render(<Harness initial="cd:yes composer:Bach,Mozart" />);
    fireEvent.focus(input());

    fireEvent.keyDown(input(), { key: 'Backspace' });

    expect(input()).toHaveAccessibleName('A value of composer');
    expect(input()).toHaveValue('Mozart');
    expect(pills()).toEqual(['cd: yes']);

    // Esc leaves it as it was.
    fireEvent.keyDown(input(), { key: 'Escape' });
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(pills()).toEqual(['cd: yes', 'composer: Bach or Mozart']);
  });

  it('opens a pill on a value clicked, with every value of its key, the current one ✓', () => {
    const onChange = vi.fn();
    render(<Harness initial="file:lossless" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'lossless' }));

    const list = screen.getByRole('listbox');
    const options = within(list).getAllByRole('option');
    expect(options.map(o => o.textContent)).toEqual([expect.stringContaining('lossless'), expect.stringContaining('lossy')]);
    expect(options[0]).toHaveTextContent('✓');
    expect(options[1]).not.toHaveTextContent('✓');

    fireEvent.click(options[1]);
    expect(onChange).toHaveBeenLastCalledWith('file:lossy');
  });

  it('opens its menu on a click on a pill\'s key, Remove taking it away', () => {
    const onChange = vi.fn();
    render(<Harness initial="cd:yes genre:jazz" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'genre' }));
    expect(screen.getByRole('menuitem', { name: 'Exclude it' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));

    expect(onChange).toHaveBeenLastCalledWith('cd:yes');
    expect(pills()).toEqual(['cd: yes']);
  });

  it('excludes a pill from its menu', () => {
    const onChange = vi.fn();
    render(<Harness initial="genre:jazz" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'genre' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Exclude it' }));
    expect(onChange).toHaveBeenLastCalledWith('-genre:jazz');
  });

  it('takes a pill away with its ✕', () => {
    const onChange = vi.fn();
    render(<Harness initial="cd:yes genre:jazz blue" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove cd' }));

    expect(onChange).toHaveBeenLastCalledWith('genre:jazz blue');
  });

  it('says what a mistyped key was meant to be, and mends it', () => {
    const onChange = vi.fn();
    render(<Harness initial="composr:Bach" onChange={onChange} />);

    expect(screen.getByRole('alert')).toHaveTextContent('composr is not a filter. Did you mean composer?');
    fireEvent.click(screen.getByRole('button', { name: 'Use composer' }));

    expect(onChange).toHaveBeenLastCalledWith('composer:Bach');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the keys by group in the empty field, and the recent searches', () => {
    render(<SearchPills schema={schema} value="" onChange={() => undefined} recentKey="test-recent" />);
    fireEvent.focus(input());
    const list = screen.getByRole('listbox');
    expect(within(list).getByText('Who')).toBeInTheDocument();
    expect(within(list).getByText('composer:Bach')).toBeInTheDocument();
  });

  it('shows two rows at rest, "+N" for the pills that do not fit', () => {
    // One pill a row: two rows hold the first pill and "+N".
    render(<Harness initial="cd:yes genre:jazz file:lossy composer:Bach" measureTops={els => els.map((_, i) => i * 30)} />);

    const more = screen.getByRole('button', { name: '+3' });
    expect(more).toBeVisible();
    expect(screen.getByRole('group', { name: 'genre: jazz' })).toHaveClass('is-hidden');

    // In use, the field shows them all.
    act(() => { fireEvent.focus(input()); });
    expect(screen.getByRole('group', { name: 'genre: jazz' })).not.toHaveClass('is-hidden');
  });
});
