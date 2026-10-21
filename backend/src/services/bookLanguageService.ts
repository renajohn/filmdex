import axios from 'axios';
import Book from '../models/book';
import { getDatabase } from '../database';
import { getConfig, requestFailure } from './coverScanService';
import logger from '../logger';

/**
 * A book's description is in French or English: one in another language
 * (German from a publisher, Spanish from a shop) is translated into French by
 * the local LLM, after the book is added, so adding it never waits on the model.
 */

const LLM_TIMEOUT_SEC = 180;

const WORDS: Record<string, string[]> = {
  fr: ['le', 'la', 'les', 'et', 'est', 'des', 'du', 'une', 'un', 'pour', 'dans', 'que', 'qui', 'sur', 'au', 'aux', 'pas', 'ce', 'il', 'elle', 'avec', 'son', 'sa', 'ses', 'mais'],
  en: ['the', 'and', 'of', 'is', 'with', 'for', 'to', 'was', 'in', 'that', 'it', 'on', 'as', 'by', 'his', 'her', 'this', 'are', 'from', 'an', 'be', 'which', 'has'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'für', 'sich', 'auch', 'eine', 'einen', 'dem', 'den', 'des', 'zu', 'von', 'wurde', 'werden', 'bei', 'nach', 'aus', 'ein', 'im', 'sie', 'er'],
  es: ['el', 'los', 'las', 'y', 'es', 'que', 'en', 'una', 'por', 'con', 'para', 'del', 'su', 'sus', 'como', 'pero', 'más', 'se', 'lo', 'al'],
  it: ['il', 'gli', 'e', 'è', 'di', 'che', 'una', 'per', 'con', 'del', 'della', 'non', 'sono', 'nel', 'nella', 'questo', 'anche', 'come', 'ma'],
  da: ['og', 'af', 'den', 'det', 'er', 'til', 'på', 'med', 'som', 'ikke', 'har', 'et', 'jeg', 'hun', 'han', 'fra', 'efter', 'bliver', 'hans', 'hendes'],
  sv: ['och', 'att', 'det', 'som', 'är', 'på', 'med', 'för', 'av', 'inte', 'har', 'till', 'den', 'ett', 'hon', 'han', 'från', 'efter', 'blir'],
  no: ['og', 'av', 'det', 'er', 'til', 'på', 'med', 'som', 'ikke', 'har', 'et', 'hun', 'han', 'fra', 'etter', 'blir', 'hans', 'hennes'],
  pt: ['o', 'os', 'as', 'e', 'é', 'de', 'que', 'em', 'um', 'uma', 'por', 'com', 'para', 'do', 'da', 'não', 'seu', 'sua', 'mais', 'mas'],
  nl: ['het', 'een', 'en', 'van', 'dat', 'niet', 'met', 'voor', 'op', 'zijn', 'ook', 'naar', 'bij', 'wordt', 'deze', 'maar', 'aan'],
};

/** The language most of its small words are in; null when too short to tell. */
export const languageOf = (text: string): string | null => {
  const words = text.toLowerCase().split(/[^a-zäöüßàâçéèêëîïôûùáíóúñìåæøãõ]+/).filter(Boolean);
  let best: string | null = null;
  let most = 0;
  for (const [language, list] of Object.entries(WORDS)) {
    const set = new Set(list);
    const count = words.filter(word => set.has(word)).length;
    if (count > most) { best = language; most = count; }
  }
  return most >= 4 ? best : null;
};

/** Whether a description must be translated: written in neither French nor English. */
export const needsTranslation = (text: string | null | undefined): boolean => {
  const language = text ? languageOf(text) : null;
  return !!language && language !== 'fr' && language !== 'en';
};

/** The description in French, by the local LLM. */
export const toFrench = async (text: string): Promise<string> => {
  const { baseUrl, model } = getConfig();
  try {
    const response = await axios.post(`${baseUrl}/v1/chat/completions`, {
      model,
      messages: [
        { role: 'system', content: 'You translate book descriptions into French. Answer with the translation alone: no title, no note, no quotation marks. Keep the paragraphs, the names and the titles of works as they are.' },
        { role: 'user', content: text },
      ],
      max_tokens: Math.min(4000, Math.ceil(text.length / 2) + 200),
      temperature: 0.2,
    }, { timeout: LLM_TIMEOUT_SEC * 1000 });
    const french: string | undefined = response.data?.choices?.[0]?.message?.content;
    if (!french?.trim()) throw new Error('The local LLM answered with nothing');
    return french.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  } catch (error) {
    throw requestFailure(error);
  }
};

/** One book's description put into French when it is in another language; whether it was. */
const translateBook = async (bookId: number): Promise<boolean> => {
  const book = await Book.findById(bookId);
  if (!book || !needsTranslation(book.description)) return false;
  const french = await toFrench(String(book.description));
  if (needsTranslation(french)) throw new Error('The translation is not in French');
  await new Promise<void>((resolve, reject) => getDatabase().run('UPDATE books SET description = ? WHERE id = ?', [french, bookId],
    (err: Error | null) => (err ? reject(err) : resolve())));
  logger.info(`[BookLanguage] Book ${bookId}: its description translated from ${languageOf(String(book.description))} into French`);
  return true;
};

/** One translation at a time: the local LLM serves one request well, several badly. */
let queue: Promise<unknown> = Promise.resolve();
const later = (bookId: number): Promise<boolean> => {
  const next = queue.catch(() => undefined).then(() => translateBook(bookId));
  queue = next;
  return next;
};

/** After a book is added: its description translated in the background, a failure only logged. */
const afterAdding = (bookId: number): void => {
  later(bookId).catch(error => logger.warn(`[BookLanguage] Book ${bookId} not translated: ${(error as Error).message}`));
};

/** Every book whose description is in another language, translated: those done and those that failed. */
const translateAll = async (): Promise<{ translated: Array<{ id: number; title: string }>; failed: Array<{ id: number; title: string; error: string }> }> => {
  const rows = await new Promise<Array<{ id: number; title: string; description: string | null }>>((resolve, reject) =>
    getDatabase().all('SELECT id, title, description FROM books WHERE description IS NOT NULL', (err: Error | null, found: Array<{ id: number; title: string; description: string | null }>) =>
      (err ? reject(err) : resolve(found || []))));
  const translated: Array<{ id: number; title: string }> = [];
  const failed: Array<{ id: number; title: string; error: string }> = [];
  for (const row of rows.filter(r => needsTranslation(r.description))) {
    try { if (await later(row.id)) translated.push({ id: row.id, title: row.title }); } catch (error) {
      failed.push({ id: row.id, title: row.title, error: (error as Error).message });
    }
  }
  return { translated, failed };
};

export default { afterAdding, translateAll, translateBook };
