import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Menu from './Menu';

const sortMenu = (onSelect = vi.fn()) => render(
  <Menu label="Sort" trigger={(props, open) => <button type="button" {...props}>Sort{open ? ' (open)' : ''}</button>}>
    <Menu.Choice selected={false} onSelect={() => onSelect('title')}>Title</Menu.Choice>
    <Menu.Choice selected onSelect={() => onSelect('year')}>Year</Menu.Choice>
    <Menu.Choice selected={false} disabled onSelect={() => onSelect('shelf')}>Shelf</Menu.Choice>
    <Menu.Separator />
    <Menu.Item danger onSelect={() => onSelect('delete')}>Delete</Menu.Item>
  </Menu>,
);

describe('Menu', () => {
  it('opens from its trigger, on the choice made, its ✓ there', () => {
    sortMenu();
    const trigger = screen.getByRole('button', { name: 'Sort' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);

    expect(screen.getByRole('menu', { name: 'Sort' })).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Year' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Year' })).toHaveFocus();
  });

  it('picks an entry and closes, back on its trigger', () => {
    const onSelect = vi.fn();
    sortMenu(onSelect);
    fireEvent.click(screen.getByRole('button', { name: 'Sort' }));

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Title' }));

    expect(onSelect).toHaveBeenCalledWith('title');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort' })).toHaveFocus();
  });

  it('goes by the keys, over what is disabled, round from the end', () => {
    const onSelect = vi.fn();
    sortMenu(onSelect);
    const trigger = screen.getByRole('button', { name: 'Sort' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitemradio', { name: 'Title' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'End' });
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();

    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes on a click elsewhere, and on its trigger again', () => {
    sortMenu();
    const trigger = screen.getByRole('button', { name: 'Sort' });
    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('lies in the open modal when its trigger is in one, for the modal keeps the focus', () => {
    render(
      <div className="modal">
        <Menu trigger={props => <button type="button" {...props}>More</button>}>
          <Menu.Item onSelect={() => undefined}>Open in Navidrome</Menu.Item>
        </Menu>
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'More' }));

    expect(screen.getByRole('menu').parentElement).toHaveClass('modal');
  });
});
