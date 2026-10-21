/** A score's title and the publisher's number it carries: "Préludes, Premier livre (HN 383)". */

const NUMBER = /\(\s*((?:HN|BA|EB|UT|ED)\s*[\d.]+)\s*\)/i;

/** "(HN 383)", Henle's number, and the like: a publisher's reference. */
export const referenceOf = (title: string) => title.match(NUMBER)?.[1] || null;

/** The piece, without its reference nor its instrument: "Préludes Vol. 1 - piano - (HN 383)" is "Préludes Vol. 1". */
export const pieceOf = (title: string) => title
  .replace(NUMBER, '')
  .replace(/\s*-\s*(?:piano|violon|violin|violoncelle|cello|fl[uû]te|guitare|guitar)\s*(?=-|$)/i, '')
  .replace(/[\s\-–]+$/, '')
  .trim();

/** The title with its number, as the scores keep it. */
export const titleWithNumber = (title: string, number: string | null | undefined) =>
  (number?.trim() && !title.includes(number.trim()) ? `${title.trim()} (${number.trim()})` : title.trim());
