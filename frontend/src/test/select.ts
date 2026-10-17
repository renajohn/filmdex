import { fireEvent, screen } from '@testing-library/react';

/**
 * DexVault's Select in a test, as a person uses it: what it shows, the
 * choices it offers, a choice made by opening it and picking the entry.
 */
export const selectedValue = (field: HTMLElement): string =>
  field.querySelector('.menu-select__value')?.getAttribute('data-value') ?? '';

const entries = () => Array.from(screen.getByRole('menu').querySelectorAll<HTMLElement>('[role="menuitemradio"]'));

/** The values it offers, in their order. */
export const selectValues = (field: HTMLElement): string[] => {
  fireEvent.click(field);
  const values = entries().map(entry => entry.getAttribute('data-value') ?? '');
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  return values;
};

/** Chooses the entry of that value. */
export const chooseValue = (field: HTMLElement, value: string): void => {
  fireEvent.click(field);
  const entry = entries().find(item => item.getAttribute('data-value') === value);
  if (!entry) throw new Error(`No entry of value "${value}" in the Select`);
  fireEvent.click(entry);
};
