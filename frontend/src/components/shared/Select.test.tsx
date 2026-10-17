import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Form } from 'react-bootstrap';
import * as navidrome from '../../utils/navidrome';
import Select from './Select';
import { chooseValue, selectedValue, selectValues } from '../../test/select';

afterEach(() => vi.restoreAllMocks());

const location = (value: string, onChange = vi.fn()) => render(
  <Form.Group controlId="location">
    <Form.Label>Location</Form.Label>
    <Select name="location" value={value} onChange={onChange}>
      <option value="">In order</option>
      <optgroup label="On a shelf">
        <option value="level:1">A-1</option>
        <option value="level:2" disabled>A-2</option>
      </optgroup>
      <>
        {['Desk', 'Attic'].map(place => <option key={place} value={`place:${place}`}>{place}</option>)}
      </>
    </Select>
  </Form.Group>,
);

describe('Select', () => {
  it('is named by its group’s label and shows the option chosen', () => {
    location('level:1');

    const field = screen.getByLabelText('Location');
    expect(field).toHaveTextContent('A-1');
    expect(selectedValue(field)).toBe('level:1');
  });

  it('offers its options, its optgroups as sections, the one chosen with a ✓', () => {
    location('level:1');
    const field = screen.getByLabelText('Location');

    expect(selectValues(field)).toEqual(['', 'level:1', 'level:2', 'place:Desk', 'place:Attic']);
    fireEvent.click(field);
    expect(screen.getByText('On a shelf')).toHaveClass('menu-section');
    expect(screen.getByRole('menuitemradio', { name: 'A-1' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'A-2' })).toBeDisabled();
  });

  it('hands onChange the value chosen and the field’s name, as a select', () => {
    const onChange = vi.fn();
    location('', onChange);

    chooseValue(screen.getByLabelText('Location'), 'place:Desk');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].target).toEqual({ value: 'place:Desk', name: 'location' });
  });

  it('shows its first option when the value is none of them, as a select', () => {
    location('gone');

    expect(selectedValue(screen.getByLabelText('Location'))).toBe('');
  });

  it('is the system’s own select on an iPhone', () => {
    vi.spyOn(navidrome, 'isAppleMobile').mockReturnValue(true);
    const onChange = vi.fn();
    location('', onChange);

    const field = screen.getByLabelText('Location');
    expect(field.tagName).toBe('SELECT');
    fireEvent.change(field, { target: { value: 'level:1' } });
    expect(onChange).toHaveBeenCalled();
  });
});
