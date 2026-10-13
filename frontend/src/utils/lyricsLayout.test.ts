import { describe, it, expect } from 'vitest';
import { byChoruses, cutLine, layOutLyrics, sameLine } from './lyricsLayout';

describe('cutLine', () => {
  it('cuts a long line at the comma nearest its middle, the second half capitalised', () => {
    expect(cutLine('Walk me to the river, I will follow every bend of the water')).toEqual(['Walk me to the river,', 'I will follow every bend of the water']);
  });

  it('leaves a short line whole', () => {
    expect(cutLine('Hold on, hold on to me')).toEqual(['Hold on, hold on to me']);
  });

  it('never cuts after a lone word nor before a quotation', () => {
    expect(cutLine('Give me the lantern and the long road, oh, lead me out into the night')).toEqual(['Give me the lantern and the long road,', 'Oh, lead me out into the night']);
    expect(cutLine('She leans to the window, she whispers, "Leave the door open wide"')).toEqual(['She leans to the window,', 'She whispers, "Leave the door open wide"']);
  });

  it('cuts at a question mark too', () => {
    expect(cutLine('Who will mind the garden now? We have all gone down to the sea')).toEqual(['Who will mind the garden now?', 'We have all gone down to the sea']);
  });
});

describe('sameLine', () => {
  it('takes a line sung again with a word changed for the same', () => {
    expect(sameLine('And you can keep the silver ring', 'So you can keep the silver ring')).toBe(true);
    expect(sameLine('Oh, amen', 'Ah, amen')).toBe(false);
  });
});

describe('byChoruses', () => {
  const chorus = ['Bells ring over the harbour town', 'Lanterns swing as the tide comes down', 'Sing it loud for the ones who drown'];
  const variant = ['Bells ring over the harbour town', 'Lanterns swing when the tide comes down', 'Sing it loud for the ones who drown'];

  it('sets each chorus apart, a varied one too, and leaves a slight lead-in line with the verse', () => {
    const lines = ['First verse line one here', 'First verse line two here', 'Amen, amen', ...chorus, 'Second verse line one', 'Second verse line two', ...variant, 'Amen, amen', ...chorus];
    expect(byChoruses(lines)).toEqual([
      ['First verse line one here', 'First verse line two here', 'Amen, amen'],
      chorus,
      ['Second verse line one', 'Second verse line two'],
      variant,
      ['Amen, amen'],
      chorus,
    ]);
  });

  it('keeps a song without a chorus whole', () => {
    expect(byChoruses(['One line of a song', 'Another line of it', 'And a third one'])).toEqual([['One line of a song', 'Another line of it', 'And a third one']]);
  });
});

describe('layOutLyrics', () => {
  it('keeps the stanzas the plain text marks', () => {
    expect(layOutLyrics({ plain: 'One\nTwo\n\nThree', synced: null })).toEqual([['One', 'Two'], ['Three']]);
  });

  it('takes the stanzas from the empty timed lines when the plain text marks none', () => {
    expect(layOutLyrics({ plain: 'One\nTwo\nThree', synced: '[00:01.00] One\n[00:02.00] Two\n[00:05.00] \n[00:06.00] Three' }))
      .toEqual([['One', 'Two'], ['Three']]);
  });
});
