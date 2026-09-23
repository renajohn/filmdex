# Araignées et serpents : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** classer chaque film *avec*, *sans* ou *inconnu* pour les araignées et les serpents à partir
des votes DoesTheDogDie, filtrer la collection sur ce classement, et corriger à la main.

**Architecture :** deux tables dédiées (`movie_ddd` pour le lien, `movie_warnings` pour les votes et la
correction) ; une règle pure (`classify`) doublée d'une expression SQL construite depuis les mêmes
constantes ; un client DoesTheDogDie isolé ; un `warningsService` qui orchestre rafraîchissement,
import du snapshot et tâche quotidienne ; des routes REST ; côté React, un composant de pastilles
dans la fiche, un badge dans la grille et trois filtres rapides.

**Tech Stack :** Node/Express 5, sqlite3 (SQLite 3.44, upsert `ON CONFLICT` disponible), axios,
Jest + ts-jest + supertest (backend) ; React 19, Vitest + Testing Library, react-icons (frontend).

**Spec :** `docs/superpowers/specs/2026-09-23-araignees-serpents-design.md`

## Global Constraints

- Sujets : `spiders` → TopicId **165**, `snakes` → TopicId **214**, déclarés à un seul endroit.
- Règle B : correction manuelle d'abord ; `oui + non = 0` → `unknown` ; `oui ≥ 5` ou `oui ≥ 25 %` des votes → `with` ; sinon `without`.
- Seuils en constantes nommées : `MIN_YES_VOTES = 5`, `MIN_YES_PERCENT = 25` ; calcul entier (`yes * 100 >= 25 * (yes + no)`), jamais de flottant.
- Le classement est calculé à la lecture, jamais stocké.
- Clé API : variable d'environnement **`DOES_DOG_DIE`**, puis `doesthedogdie_api_key` dans `options.json`.
- Toute requête DoesTheDogDie envoie `Accept: application/json`, `X-API-KEY` et le User-Agent `DexVault/1.0 +https://github.com/renajohn/filmdex` ; délai 10 s.
- HTTP 403 ou 429 → `DddQuotaError`, qui interrompt tout lot en cours.
- Quota : 5 000 requêtes/mois ; tâche quotidienne ≤ **300 requêtes/jour**, ≤ 1 requête/s, films vérifiés il y a plus de **30 jours**.
- Aucun rafraîchissement ni import ne modifie `override` ni un lien `matched_by = 'manual'`.
- L'ajout d'un film n'attend jamais DoesTheDogDie.
- Aucun test n'appelle la vraie API ; `DOES_DOG_DIE` est retirée de l'environnement des tests.
- Libellés d'interface en anglais, comme le reste de l'application.
- Messages de commit sans ligne `Co-Authored-By`.

## Review Focus

- Snapshot importé sur une base dont les `id` ont bougé : chaque ligne est vérifiée par `tmdb_id` ou `imdb_id` et ignorée si aucun ne concorde (test en tâche 4).
- Clé absente en prod : aucun plantage, tout reste *unknown*, la route de rafraîchissement répond 503 (tests en tâches 4 et 5).
- Quota épuisé au milieu de la tâche quotidienne : elle s'arrête au premier 403/429 au lieu d'enchaîner les échecs (test en tâche 4).
- Film supprimé : ses lignes `movie_ddd` et `movie_warnings` disparaissent (`ON DELETE CASCADE`, test en tâche 2).
- Prédicat combiné ou invalide : `spiders:without genre:"Comedy"` combine les deux ; `spiders:maybe` ne lève pas d'erreur SQL (tests en tâche 6).

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `backend/src/warnings/rules.ts` (créé) | sujets, seuils, `classify`, fragment SQL du classement |
| `backend/src/warnings/titles.ts` (créé) | nettoyage et normalisation des titres |
| `backend/src/models/movieWarning.ts` (créé) | tables `movie_ddd` et `movie_warnings`, requêtes |
| `backend/src/services/doesTheDogDieService.ts` (créé) | client HTTP DoesTheDogDie, correspondance |
| `backend/src/services/warningsService.ts` (créé) | rafraîchissement, correction, import, tâche quotidienne |
| `backend/src/controllers/warningsController.ts` (créé) | routes REST |
| `backend/src/config.ts`, `backend/src/types/index.ts` (modifiés) | clé `doesthedogdie` |
| `backend/src/database.ts` (modifié) | création des tables au démarrage |
| `backend/src/models/movie.ts` (modifié) | prédicats `spiders:`/`snakes:`, colonnes `*_status` |
| `backend/index.ts` (modifié) | routes, démarrage de la tâche quotidienne |
| `backend/src/services/movieService.ts`, `importService.ts`, `controllers/movieController.ts` (modifiés) | déclenchement après création |
| `backend/tests/setup.js` (modifié) | clé retirée des tests |
| `frontend/src/services/api.ts` (modifié) | quatre appels |
| `frontend/src/components/MovieWarnings.tsx` + `.css` (créés) | pastilles et panneau de la fiche |
| `frontend/src/components/MovieDetailCard.tsx` (modifié) | insertion des pastilles |
| `frontend/src/components/FilmDexPage.tsx`, `BoxSetStack.tsx` (modifiés) | badge sur l'affiche |
| `frontend/src/App.tsx` (modifié) | autocomplétion, aide, filtres rapides |
| `docker-compose.yml` (modifié) | passage de `DOES_DOG_DIE` au conteneur |

---

### Task 1 : règle de classement et titres

**Files:**
- Create: `backend/src/warnings/rules.ts`
- Create: `backend/src/warnings/titles.ts`
- Test: `backend/tests/warnings/rules.test.ts`
- Test: `backend/tests/warnings/titles.test.ts`

**Interfaces:**
- Consumes : rien.
- Produces :
  - `TOPICS: { spiders: 165; snakes: 214 }`, `type Topic = 'spiders' | 'snakes'`, `isTopic(v: string): v is Topic`
  - `type WarningStatus = 'with' | 'without' | 'unknown'`, `type Override = 'with' | 'without'`
  - `MIN_YES_VOTES = 5`, `MIN_YES_PERCENT = 25`
  - `classify(yes: number, no: number, override?: Override | null): WarningStatus`
  - `statusSql(topic: Topic, movieIdExpr?: string): string` — expression SQL qui vaut `'with' | 'without' | 'unknown'`
  - `warningStatusColumnsSql(): string` — `"<expr> AS spiders_status, <expr> AS snakes_status"`
  - `cleanTitle(title: string): string`, `normalizeTitle(title: string): string`

- [ ] **Step 1 : écrire les tests de la règle**

`backend/tests/warnings/rules.test.ts` :

```ts
import { classify, isTopic, statusSql, warningStatusColumnsSql, TOPICS } from '../../src/warnings/rules';

describe('classify (règle B)', () => {
  it.each([
    [0, 0, 'unknown'],   // aucun vote
    [0, 1, 'without'],   // un seul non suffit
    [1, 1, 'with'],      // 50 % : La Cité de la peur
    [1, 3, 'with'],      // 25 % pile
    [1, 4, 'without'],   // 20 %
    [3, 8, 'with'],      // 27 % : Jumanji, serpents
    [4, 113, 'without'], // 3 % et < 5 : The Thing, serpents
    [5, 58, 'with'],     // 5 oui : Flow
    [22, 93, 'with'],    // Le Silence des agneaux
    [2, 69, 'without'],  // Jurassic Park
  ])('%i oui / %i non → %s', (yes, no, expected) => {
    expect(classify(yes, no)).toBe(expected);
  });

  it('laisse la correction manuelle primer sur les votes', () => {
    expect(classify(1, 1, 'without')).toBe('without');
    expect(classify(0, 50, 'with')).toBe('with');
    expect(classify(0, 0, 'without')).toBe('without');
  });
});

describe('isTopic', () => {
  it('ne reconnaît que les sujets déclarés', () => {
    expect(isTopic('spiders')).toBe(true);
    expect(isTopic('snakes')).toBe(true);
    expect(isTopic('dogs')).toBe(false);
    expect(isTopic('toString')).toBe(false);
  });
});

describe('statusSql', () => {
  it('refuse un sujet inconnu plutôt que de l’injecter dans le SQL', () => {
    expect(() => statusSql('x; DROP TABLE movies' as any)).toThrow(/topic/i);
  });

  it('produit une colonne par sujet', () => {
    const sql = warningStatusColumnsSql();
    for (const topic of Object.keys(TOPICS)) expect(sql).toContain(`AS ${topic}_status`);
  });
});
```

- [ ] **Step 2 : écrire les tests des titres**

`backend/tests/warnings/titles.test.ts` :

```ts
import { cleanTitle, normalizeTitle } from '../../src/warnings/titles';

describe('cleanTitle', () => {
  it.each([
    ["Pan's Labyrinth (zone A)", "Pan's Labyrinth"],
    ['le parfum [fr]', 'le parfum'],
    ['Robots [fr]', 'Robots'],
    ['Blade Runner - FINAL CUT', 'Blade Runner'],
    ["Hellboy - Director's Cut", 'Hellboy'],
    ['The Big Bang Theory, the complete series', 'The Big Bang Theory'],
    ['Top Gun : Maverick', 'Top Gun : Maverick'],
  ])('%s → %s', (input, expected) => {
    expect(cleanTitle(input)).toBe(expected);
  });
});

describe('normalizeTitle', () => {
  it('ignore casse, accents, ponctuation et « et »/« & »/« and »', () => {
    expect(normalizeTitle('Astérix et Obélix mission Cléopatre'))
      .toBe(normalizeTitle('Astérix & Obélix: Mission Cléopâtre'));
    expect(normalizeTitle('Le prénom')).toBe(normalizeTitle('Le Prenom'));
    expect(normalizeTitle('La cité de la peur')).toBe(normalizeTitle('La Cité De La Peur'));
    expect(normalizeTitle("Ocean's Thirteen")).toBe(normalizeTitle('Oceans Thirteen'));
  });

  it('distingue des titres réellement différents', () => {
    expect(normalizeTitle('La Cité de la peur')).not.toBe(normalizeTitle('La Cité de La Peur Suédé'));
  });
});
```

- [ ] **Step 3 : lancer les tests, vérifier qu'ils échouent**

Run : `cd backend && npx jest tests/warnings/rules.test.ts tests/warnings/titles.test.ts`
Expected : FAIL, « Cannot find module '../../src/warnings/rules' ».

- [ ] **Step 4 : implémenter `rules.ts`**

`backend/src/warnings/rules.ts` :

```ts
/**
 * Topics we read from DoesTheDogDie, keyed by our own name. Adding one here is
 * enough: votes live in movie_warnings rows, so no migration is needed.
 */
export const TOPICS = { spiders: 165, snakes: 214 } as const;

export type Topic = keyof typeof TOPICS;
export type WarningStatus = 'with' | 'without' | 'unknown';
export type Override = 'with' | 'without';

/** A movie is "with" once this many people saw the animal, whatever the others say. */
export const MIN_YES_VOTES = 5;
/** ...or once yes votes reach this share of all votes. */
export const MIN_YES_PERCENT = 25;

export const isTopic = (value: string): value is Topic =>
  Object.prototype.hasOwnProperty.call(TOPICS, value);

export const isOverride = (value: unknown): value is Override =>
  value === 'with' || value === 'without';

export const classify = (yes: number, no: number, override: Override | null = null): WarningStatus => {
  if (override) return override;
  if (yes + no === 0) return 'unknown';
  // Integer arithmetic keeps this identical to the SQL expression below.
  if (yes >= MIN_YES_VOTES || yes * 100 >= MIN_YES_PERCENT * (yes + no)) return 'with';
  return 'without';
};

/**
 * The same rule as classify(), as a SQL expression over movie_warnings. A movie
 * without a row for the topic is 'unknown'. The topic is checked against TOPICS
 * because it is interpolated, not bound.
 */
export const statusSql = (topic: Topic, movieIdExpr = 'm.id'): string => {
  if (!isTopic(topic)) throw new Error(`Unknown warning topic: ${String(topic)}`);
  return `COALESCE((
    SELECT CASE
      WHEN w.override IS NOT NULL THEN w.override
      WHEN w.yes_votes + w.no_votes = 0 THEN 'unknown'
      WHEN w.yes_votes >= ${MIN_YES_VOTES}
        OR w.yes_votes * 100 >= ${MIN_YES_PERCENT} * (w.yes_votes + w.no_votes) THEN 'with'
      ELSE 'without'
    END
    FROM movie_warnings w
    WHERE w.movie_id = ${movieIdExpr} AND w.topic = '${topic}'
  ), 'unknown')`;
};

export const warningStatusColumnsSql = (): string =>
  (Object.keys(TOPICS) as Topic[]).map(topic => `${statusSql(topic)} AS ${topic}_status`).join(',\n');
```

- [ ] **Step 5 : implémenter `titles.ts`**

`backend/src/warnings/titles.ts` :

```ts
/**
 * Strip what DexVault adds to a title and DoesTheDogDie does not know about:
 * "[fr]", "(zone A)", "- FINAL CUT", "- Director's Cut", ", the complete series".
 */
export const cleanTitle = (title: string): string =>
  title
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\s+-\s+(final cut|director'?s cut)\b.*$/i, '')
    .replace(/,?\s*the complete series$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-:,]+|[\s\-:,]+$/g, '');

/**
 * Comparison key for a title: no accents, no case, no punctuation, and "et",
 * "&" and "and" dropped, so "Astérix & Obélix" meets "Astérix et Obélix".
 */
export const normalizeTitle = (title: string): string =>
  cleanTitle(title)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(et|and)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
```

- [ ] **Step 6 : lancer les tests, vérifier qu'ils passent**

Run : `cd backend && npx jest tests/warnings/rules.test.ts tests/warnings/titles.test.ts`
Expected : PASS.

- [ ] **Step 7 : commit**

```bash
git add backend/src/warnings backend/tests/warnings/rules.test.ts backend/tests/warnings/titles.test.ts
git commit -m "Classify spider and snake votes with a rule shared by code and SQL"
```

---

### Task 2 : tables et accès aux données

**Files:**
- Create: `backend/src/models/movieWarning.ts`
- Modify: `backend/src/database.ts` (bloc « Create tables with final schema », vers les lignes 312-340)
- Modify: `backend/tests/setup.js`
- Test: `backend/tests/warnings/movieWarning.test.ts`

**Interfaces:**
- Consumes : `Topic`, `Override` (tâche 1).
- Produces (export par défaut `MovieWarning`) :
  - `type MatchedBy = 'imdb' | 'tmdb' | 'title_year' | 'manual'`
  - `interface DddLinkRow { movie_id: number; ddd_id: number | null; matched_by: MatchedBy | null; checked_at: string | null }`
  - `interface WarningRow { movie_id: number; topic: Topic; yes_votes: number; no_votes: number; override: Override | null; override_at: string | null; fetched_at: string | null }`
  - `createTable(): Promise<void>`
  - `getLink(movieId: number): Promise<DddLinkRow | null>`
  - `saveLink(movieId: number, dddId: number | null, matchedBy: MatchedBy | null, checkedAt: string | null): Promise<void>`
  - `getWarnings(movieId: number): Promise<WarningRow[]>`
  - `saveVotes(movieId: number, topic: Topic, yes: number, no: number, fetchedAt: string): Promise<void>` — ne touche pas `override`
  - `setOverride(movieId: number, topic: Topic, override: Override | null, at: string): Promise<void>` — ne touche pas les votes
  - `listDueForRefresh(checkedBefore: string, limit: number): Promise<number[]>`

- [ ] **Step 1 : retirer la clé de l'environnement des tests**

Dans `backend/tests/setup.js`, juste après `process.env.NODE_ENV = 'test';` :

```js
// The developer's shell may export the real key; tests must never reach the API.
delete process.env.DOES_DOG_DIE;
```

et dans le mock de `getApiKeys` :

```js
  getApiKeys: () => ({ omdb: '', tmdb: '', discogs: 'test-token', doesthedogdie: '' }),
```

- [ ] **Step 2 : écrire les tests du modèle**

`backend/tests/warnings/movieWarning.test.ts` :

```ts
import { getDatabase } from '../../src/database';
import MovieWarning from '../../src/models/movieWarning';

const run = (sql: string, params: unknown[] = []) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) {
      if (err) reject(err); else resolve(this.lastID);
    }));

let seq = 0;
const insertMovie = () =>
  run(`INSERT INTO movies (title, tmdb_id, title_status) VALUES (?, ?, 'owned')`, [`Film ${++seq}`, 900000 + seq]);

describe('MovieWarning', () => {
  it('enregistre les votes sans toucher à la correction, et inversement', async () => {
    const id = await insertMovie();
    await MovieWarning.setOverride(id, 'spiders', 'without', '2026-09-23T10:00:00.000Z');
    await MovieWarning.saveVotes(id, 'spiders', 1, 1, '2026-09-23T11:00:00.000Z');

    let [row] = await MovieWarning.getWarnings(id);
    expect(row).toMatchObject({ topic: 'spiders', yes_votes: 1, no_votes: 1, override: 'without' });

    await MovieWarning.setOverride(id, 'spiders', null, '2026-09-24T10:00:00.000Z');
    [row] = await MovieWarning.getWarnings(id);
    expect(row).toMatchObject({ yes_votes: 1, no_votes: 1, override: null });
  });

  it('remplace le lien existant', async () => {
    const id = await insertMovie();
    await MovieWarning.saveLink(id, 10812, 'imdb', '2026-09-23T00:00:00.000Z');
    await MovieWarning.saveLink(id, 22644, 'manual', null);
    expect(await MovieWarning.getLink(id)).toEqual({
      movie_id: id, ddd_id: 22644, matched_by: 'manual', checked_at: null
    });
  });

  it('liste les films jamais vérifiés ou vérifiés avant la date donnée', async () => {
    const never = await insertMovie();
    const old = await insertMovie();
    const fresh = await insertMovie();
    await MovieWarning.saveLink(old, 1, 'tmdb', '2026-01-01T00:00:00.000Z');
    await MovieWarning.saveLink(fresh, 2, 'tmdb', '2026-09-20T00:00:00.000Z');

    const due = await MovieWarning.listDueForRefresh('2026-08-24T00:00:00.000Z', 10000);
    expect(due).toEqual(expect.arrayContaining([never, old]));
    expect(due).not.toContain(fresh);
  });

  it('respecte la limite demandée', async () => {
    await insertMovie();
    await insertMovie();
    expect(await MovieWarning.listDueForRefresh('2026-08-24T00:00:00.000Z', 1)).toHaveLength(1);
  });

  it('efface les lignes d’un film supprimé', async () => {
    const id = await insertMovie();
    await MovieWarning.saveLink(id, 5, 'tmdb', '2026-09-23T00:00:00.000Z');
    await MovieWarning.saveVotes(id, 'snakes', 3, 1, '2026-09-23T00:00:00.000Z');
    await run('DELETE FROM movies WHERE id = ?', [id]);
    expect(await MovieWarning.getLink(id)).toBeNull();
    expect(await MovieWarning.getWarnings(id)).toEqual([]);
  });
});
```

- [ ] **Step 3 : lancer, vérifier l'échec**

Run : `cd backend && npx jest tests/warnings/movieWarning.test.ts`
Expected : FAIL, « Cannot find module '../../src/models/movieWarning' ».

- [ ] **Step 4 : implémenter le modèle**

`backend/src/models/movieWarning.ts` :

```ts
import { getDatabase } from '../database';
import type { Override, Topic } from '../warnings/rules';

export type MatchedBy = 'imdb' | 'tmdb' | 'title_year' | 'manual';

export interface DddLinkRow {
  movie_id: number;
  ddd_id: number | null;
  matched_by: MatchedBy | null;
  checked_at: string | null;
}

export interface WarningRow {
  movie_id: number;
  topic: Topic;
  yes_votes: number;
  no_votes: number;
  override: Override | null;
  override_at: string | null;
  fetched_at: string | null;
}

const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) =>
    getDatabase().run(sql, params, (err: Error | null) => (err ? reject(err) : resolve())));

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) =>
    getDatabase().all(sql, params, (err: Error | null, rows: T[]) => (err ? reject(err) : resolve(rows))));

const get = <T>(sql: string, params: unknown[] = []): Promise<T | null> =>
  new Promise((resolve, reject) =>
    getDatabase().get(sql, params, (err: Error | null, row: T | undefined) => (err ? reject(err) : resolve(row ?? null))));

const MovieWarning = {
  createTable: async (): Promise<void> => {
    await run(`
      CREATE TABLE IF NOT EXISTS movie_ddd (
        movie_id   INTEGER PRIMARY KEY REFERENCES movies(id) ON DELETE CASCADE,
        ddd_id     INTEGER,
        matched_by TEXT,
        checked_at TEXT
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS movie_warnings (
        movie_id    INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
        topic       TEXT    NOT NULL,
        yes_votes   INTEGER NOT NULL DEFAULT 0,
        no_votes    INTEGER NOT NULL DEFAULT 0,
        override    TEXT,
        override_at TEXT,
        fetched_at  TEXT,
        PRIMARY KEY (movie_id, topic)
      )
    `);
    await run(`CREATE INDEX IF NOT EXISTS idx_movie_ddd_checked ON movie_ddd(checked_at)`);
  },

  getLink: (movieId: number): Promise<DddLinkRow | null> =>
    get<DddLinkRow>(`SELECT movie_id, ddd_id, matched_by, checked_at FROM movie_ddd WHERE movie_id = ?`, [movieId]),

  saveLink: (movieId: number, dddId: number | null, matchedBy: MatchedBy | null, checkedAt: string | null): Promise<void> =>
    run(
      `INSERT INTO movie_ddd (movie_id, ddd_id, matched_by, checked_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(movie_id) DO UPDATE SET
         ddd_id = excluded.ddd_id, matched_by = excluded.matched_by, checked_at = excluded.checked_at`,
      [movieId, dddId, matchedBy, checkedAt]
    ),

  getWarnings: (movieId: number): Promise<WarningRow[]> =>
    all<WarningRow>(
      `SELECT movie_id, topic, yes_votes, no_votes, override, override_at, fetched_at
       FROM movie_warnings WHERE movie_id = ? ORDER BY topic`,
      [movieId]
    ),

  saveVotes: (movieId: number, topic: Topic, yes: number, no: number, fetchedAt: string): Promise<void> =>
    run(
      `INSERT INTO movie_warnings (movie_id, topic, yes_votes, no_votes, fetched_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(movie_id, topic) DO UPDATE SET
         yes_votes = excluded.yes_votes, no_votes = excluded.no_votes, fetched_at = excluded.fetched_at`,
      [movieId, topic, yes, no, fetchedAt]
    ),

  setOverride: (movieId: number, topic: Topic, override: Override | null, at: string): Promise<void> =>
    run(
      `INSERT INTO movie_warnings (movie_id, topic, override, override_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(movie_id, topic) DO UPDATE SET
         override = excluded.override, override_at = excluded.override_at`,
      [movieId, topic, override, at]
    ),

  /** Movies never checked first, then the oldest checks. */
  listDueForRefresh: async (checkedBefore: string, limit: number): Promise<number[]> => {
    const rows = await all<{ id: number }>(
      `SELECT m.id FROM movies m
       LEFT JOIN movie_ddd d ON d.movie_id = m.id
       WHERE d.movie_id IS NULL OR d.checked_at IS NULL OR d.checked_at < ?
       ORDER BY d.checked_at IS NOT NULL, d.checked_at, m.id
       LIMIT ?`,
      [checkedBefore, limit]
    );
    return rows.map(row => row.id);
  },
};

export default MovieWarning;
```

- [ ] **Step 5 : créer les tables au démarrage**

La spec parle d'auto-migration ; pour des **tables nouvelles**, le projet utilise plutôt un
`createTable()` idempotent (`CREATE TABLE IF NOT EXISTS`) appelé au démarrage, comme
`PlaylistHistory`. Les migrations de `runAutoMigrations` servent aux `ALTER TABLE` sur des tables
existantes. Le résultat est le même à chaque démarrage, en prod comme en test.

Dans `backend/src/database.ts`, bloc « Create tables with final schema » : ajouter l'import à la suite des autres, puis l'appel **après** `await PlaylistHistory.createTable();` (la table référence `movies`, créée plus haut).

```ts
          const MovieWarning = (await import('./models/movieWarning')).default;
```

```ts
          await MovieWarning.createTable();
```

- [ ] **Step 6 : lancer, vérifier le succès**

Run : `cd backend && npx jest tests/warnings/movieWarning.test.ts`
Expected : PASS.

- [ ] **Step 7 : commit**

```bash
git add backend/src/models/movieWarning.ts backend/src/database.ts backend/tests/setup.js backend/tests/warnings/movieWarning.test.ts
git commit -m "Store DoesTheDogDie links, votes and manual overrides per movie"
```

---

### Task 3 : client DoesTheDogDie et correspondance

**Files:**
- Modify: `backend/src/types/index.ts` (`DataConfig`, `ApiKeys`, vers les lignes 30-50)
- Modify: `backend/src/config.ts:140-147` (`getApiKeys`)
- Create: `backend/src/services/doesTheDogDieService.ts`
- Test: `backend/tests/warnings/doesTheDogDieService.test.ts`

**Interfaces:**
- Consumes : `TOPICS`, `Topic` (tâche 1) ; `cleanTitle`, `normalizeTitle` (tâche 1) ; `MatchedBy` (tâche 2) ; `tmdbService.getMovieDetails(tmdbId)` et `tmdbService.getTVShowDetails(tmdbId)`, qui renvoient `{ title } | null` (titre en anglais, langue par défaut de TMDB).
- Produces (export par défaut `ddd`, plus exports nommés) :
  - `class DddQuotaError extends Error { status: number }`
  - `interface DddItem { id: number; name: string; releaseYear: string | null; imdbId: string | null; tmdbid: number | null }`
  - `type Votes = Record<Topic, { yes: number; no: number }>`
  - `interface MatchInput { title: string; original_title?: string | null; imdb_id?: string | null; tmdb_id?: number | null; release_date?: string | null; media_type?: string | null }`
  - `interface Match { dddId: number; matchedBy: Exclude<MatchedBy, 'manual'> }`
  - `isConfigured(): boolean`
  - `search(query: string): Promise<DddItem[]>`
  - `getVotes(dddId: number): Promise<Votes>`
  - `pickMatch(items: DddItem[], movie: MatchInput, queryTitle?: string): Match | null`
  - `findMatch(movie: MatchInput): Promise<Match | null>`
  - `getRequestCount(): number` — compteur monotone des requêtes envoyées
  - `dddUrl(dddId: number): string`

- [ ] **Step 1 : déclarer la clé**

`backend/src/types/index.ts`, dans `DataConfig` après `discogs_token?` :

```ts
  /** DoesTheDogDie API key; the DOES_DOG_DIE env var wins. */
  doesthedogdie_api_key?: string;
```

dans `ApiKeys` après `discogs?` :

```ts
  /** DoesTheDogDie API key; optional, enables spider and snake warnings. */
  doesthedogdie?: string;
```

`backend/src/config.ts`, dans `getApiKeys()` :

```ts
    return {
      omdb: process.env.OMDB_API_KEY || dataConfig.omdb_api_key,
      tmdb: process.env.TMDB_API_KEY || dataConfig.tmdb_api_key,
      discogs: process.env.DISCOGS_TOKEN || dataConfig.discogs_token,
      doesthedogdie: process.env.DOES_DOG_DIE || dataConfig.doesthedogdie_api_key
    };
```

- [ ] **Step 2 : écrire les tests du client**

Les fixtures reprennent des réponses réelles relevées le 2026-09-23.

`backend/tests/warnings/doesTheDogDieService.test.ts` :

```ts
import axios from 'axios';
import ddd, { DddQuotaError, pickMatch, DddItem } from '../../src/services/doesTheDogDieService';
import tmdbService from '../../src/services/tmdbService';

const item = (over: Partial<DddItem>): DddItem => ({
  id: 1, name: 'x', releaseYear: null, imdbId: null, tmdbid: null, ...over
});

const PANS = [item({ id: 10812, name: "Pan's Labyrinth", releaseYear: '2006', imdbId: 'tt0457430', tmdbid: null })];
const OCEANS = [item({ id: 17560, name: "Ocean's Thirteen", releaseYear: 'Unknown' })];
const ASTERIX = [item({ id: 775091, name: 'Astérix & Obélix: Mission Cléopâtre', releaseYear: '2002', tmdbid: 822678 })];
const CITE = [
  item({ id: 22644, name: 'La Cité De La Peur', releaseYear: '1994' }),
  item({ id: 1739404, name: 'La Cité de La Peur Suédé', releaseYear: 'Unknown', tmdbid: 1703590 }),
];

const MEDIA = {
  item: { id: 9880 },
  topicItemStats: [
    { TopicId: 165, yesSum: 125, noSum: 0 },
    { TopicId: 214, yesSum: 87, noSum: 0 },
    { TopicId: 153, yesSum: 3, noSum: 40 },
  ],
};

beforeEach(() => { process.env.DOES_DOG_DIE = 'test-key'; });
afterEach(() => { delete process.env.DOES_DOG_DIE; jest.restoreAllMocks(); });

describe('requêtes', () => {
  it('envoie la clé, un User-Agent explicite et un délai', async () => {
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: PANS } } as any);
    await ddd.search("Pan's Labyrinth");
    expect(spy).toHaveBeenCalledWith('https://www.doesthedogdie.com/dddsearch', expect.objectContaining({
      params: { q: "Pan's Labyrinth" },
      timeout: 10000,
      headers: expect.objectContaining({ 'X-API-KEY': 'test-key', 'User-Agent': expect.stringMatching(/^DexVault\//) }),
    }));
  });

  it('lit les votes des deux sujets et ignore les autres', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: MEDIA } as any);
    expect(await ddd.getVotes(9880)).toEqual({ spiders: { yes: 125, no: 0 }, snakes: { yes: 87, no: 0 } });
  });

  it('compte zéro vote pour un sujet absent de la fiche', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { topicItemStats: [] } } as any);
    expect(await ddd.getVotes(1)).toEqual({ spiders: { yes: 0, no: 0 }, snakes: { yes: 0, no: 0 } });
  });

  it.each([403, 429])('transforme un HTTP %i en DddQuotaError', async status => {
    jest.spyOn(axios, 'get').mockRejectedValue({ isAxiosError: true, response: { status } });
    await expect(ddd.search('Alien')).rejects.toBeInstanceOf(DddQuotaError);
  });

  it('compte chaque requête envoyée', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } } as any);
    const before = ddd.getRequestCount();
    await ddd.search('a');
    await ddd.search('b');
    expect(ddd.getRequestCount() - before).toBe(2);
  });

  it('se dit non configuré sans clé', () => {
    delete process.env.DOES_DOG_DIE;
    expect(ddd.isConfigured()).toBe(false);
  });
});

describe('pickMatch', () => {
  it('préfère l’IMDb ID, même sans tmdbid sur la fiche', () => {
    expect(pickMatch(PANS, { title: "Pan's Labyrinth (zone A)", imdb_id: 'tt0457430', tmdb_id: 1417 }))
      .toEqual({ dddId: 10812, matchedBy: 'imdb' });
  });

  it('se rabat sur le titre et l’année quand la fiche n’a aucun identifiant', () => {
    expect(pickMatch(CITE, { title: 'La cité de la peur', release_date: '1994-03-09', imdb_id: 'tt0109440', tmdb_id: 15097 }))
      .toEqual({ dddId: 22644, matchedBy: 'title_year' });
  });

  it('accepte une année inconnue côté DDD si le titre concorde', () => {
    expect(pickMatch(OCEANS, { title: "Ocean's Thirteen", release_date: '2007-06-08', tmdb_id: 298 }))
      .toEqual({ dddId: 17560, matchedBy: 'title_year' });
  });

  it('passe outre un tmdbid erroné grâce au titre et à l’année', () => {
    expect(pickMatch(ASTERIX, { title: 'Astérix et Obélix mission Cléopatre', release_date: '2002-01-30', tmdb_id: 2899 }))
      .toEqual({ dddId: 775091, matchedBy: 'title_year' });
  });

  it('refuse un titre identique à plus d’un an d’écart', () => {
    expect(pickMatch([item({ id: 5, name: 'Alien', releaseYear: '2025' })], { title: 'Alien', release_date: '1979-05-25' }))
      .toBeNull();
  });
});

describe('findMatch', () => {
  it('essaie le titre nettoyé, puis l’original, puis le titre anglais TMDB', async () => {
    const queries: string[] = [];
    jest.spyOn(axios, 'get').mockImplementation(async (_url: string, config: any) => {
      queries.push(config.params.q);
      const items = config.params.q === 'Amélie'
        ? [item({ id: 14134, name: 'Amélie', releaseYear: '2001', imdbId: 'tt0211915' })]
        : [];
      return { data: { items } } as any;
    });
    jest.spyOn(tmdbService, 'getMovieDetails').mockResolvedValue({ title: 'Amélie' } as any);

    const match = await ddd.findMatch({
      title: "Le Fabuleux destin d'Amélie Poulain", original_title: "Le Fabuleux Destin d'Amélie Poulain",
      imdb_id: 'tt0211915', tmdb_id: 194, release_date: '2001-04-25', media_type: 'movie'
    });

    expect(match).toEqual({ dddId: 14134, matchedBy: 'imdb' });
    expect(queries).toEqual(["Le Fabuleux destin d'Amélie Poulain", "Le Fabuleux Destin d'Amélie Poulain", 'Amélie']);
  });

  it('ne recherche pas deux fois le même titre', async () => {
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } } as any);
    jest.spyOn(tmdbService, 'getMovieDetails').mockResolvedValue({ title: 'Alien' } as any);
    expect(await ddd.findMatch({ title: 'Alien', original_title: 'Alien', tmdb_id: 348, media_type: 'movie' })).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('interroge TMDB en mode série pour une série', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } } as any);
    const tv = jest.spyOn(tmdbService, 'getTVShowDetails').mockResolvedValue(null);
    await ddd.findMatch({ title: 'Kaamelott', tmdb_id: 11466, media_type: 'tv' });
    expect(tv).toHaveBeenCalledWith(11466);
  });
});
```

- [ ] **Step 3 : lancer, vérifier l'échec**

Run : `cd backend && npx jest tests/warnings/doesTheDogDieService.test.ts`
Expected : FAIL, module introuvable.

- [ ] **Step 4 : implémenter le client**

`backend/src/services/doesTheDogDieService.ts` :

```ts
import axios, { AxiosError } from 'axios';
import configManager from '../config';
import tmdbService from './tmdbService';
import { TOPICS, Topic } from '../warnings/rules';
import { cleanTitle, normalizeTitle } from '../warnings/titles';
import type { MatchedBy } from '../models/movieWarning';

const BASE_URL = 'https://www.doesthedogdie.com';
/** Cloudflare answers 403 to anonymous clients such as Python-urllib. */
const USER_AGENT = 'DexVault/1.0 +https://github.com/renajohn/filmdex';
const TIMEOUT_MS = 10000;

/** 403 or 429: the key is refused or the quota is spent. Stops any batch. */
export class DddQuotaError extends Error {
  constructor(public status: number) {
    super(`DoesTheDogDie refused the request (HTTP ${status})`);
    this.name = 'DddQuotaError';
  }
}

export interface DddItem {
  id: number;
  name: string;
  releaseYear: string | null;
  imdbId: string | null;
  tmdbid: number | null;
}

export type Votes = Record<Topic, { yes: number; no: number }>;

export interface MatchInput {
  title: string;
  original_title?: string | null;
  imdb_id?: string | null;
  tmdb_id?: number | null;
  release_date?: string | null;
  media_type?: string | null;
}

export interface Match {
  dddId: number;
  matchedBy: Exclude<MatchedBy, 'manual'>;
}

let requestCount = 0;
export const getRequestCount = (): number => requestCount;

const getApiKey = (): string | null => {
  // Read the environment first: getApiKeys() throws until the data config is loaded.
  if (process.env.DOES_DOG_DIE) return process.env.DOES_DOG_DIE;
  try {
    return configManager.getApiKeys().doesthedogdie || null;
  } catch (_) {
    return null;
  }
};

export const isConfigured = (): boolean => Boolean(getApiKey());

export const dddUrl = (dddId: number): string => `${BASE_URL}/media/${dddId}`;

const request = async <T>(path: string, params?: Record<string, unknown>): Promise<T> => {
  const key = getApiKey();
  if (!key) throw new Error('DoesTheDogDie is not configured: set DOES_DOG_DIE to enable it');

  requestCount += 1;
  try {
    const response = await axios.get<T>(`${BASE_URL}${path}`, {
      params,
      timeout: TIMEOUT_MS,
      headers: { Accept: 'application/json', 'X-API-KEY': key, 'User-Agent': USER_AGENT },
    });
    return response.data;
  } catch (error) {
    const status = (error as AxiosError).response?.status;
    if (status === 403 || status === 429) throw new DddQuotaError(status);
    throw error;
  }
};

export const search = async (query: string): Promise<DddItem[]> => {
  const data = await request<{ items?: DddItem[] }>('/dddsearch', { q: query });
  return data.items ?? [];
};

export const getVotes = async (dddId: number): Promise<Votes> => {
  const data = await request<{ topicItemStats?: Array<{ TopicId: number; yesSum: number; noSum: number }> }>(
    `/media/${dddId}`
  );
  const votes = {} as Votes;
  for (const [topic, topicId] of Object.entries(TOPICS) as Array<[Topic, number]>) {
    const stat = data.topicItemStats?.find(s => s.TopicId === topicId);
    votes[topic] = { yes: stat?.yesSum ?? 0, no: stat?.noSum ?? 0 };
  }
  return votes;
};

const yearOf = (value: string | null | undefined): number | null => {
  const year = value ? parseInt(value.slice(0, 4), 10) : NaN;
  return Number.isNaN(year) ? null : year;
};

/** Identifiers first; a title and year only when DDD has no usable identifier. */
export const pickMatch = (items: DddItem[], movie: MatchInput, queryTitle?: string): Match | null => {
  if (movie.imdb_id) {
    const hit = items.find(i => i.imdbId === movie.imdb_id);
    if (hit) return { dddId: hit.id, matchedBy: 'imdb' };
  }
  if (movie.tmdb_id) {
    const hit = items.find(i => i.tmdbid === movie.tmdb_id);
    if (hit) return { dddId: hit.id, matchedBy: 'tmdb' };
  }

  const titles = new Set(
    [movie.title, movie.original_title, queryTitle].filter((t): t is string => Boolean(t)).map(normalizeTitle)
  );
  const year = yearOf(movie.release_date);
  const hit = items.find(i => {
    if (!titles.has(normalizeTitle(i.name))) return false;
    const itemYear = yearOf(i.releaseYear);
    return year === null || itemYear === null || Math.abs(itemYear - year) <= 1;
  });
  return hit ? { dddId: hit.id, matchedBy: 'title_year' } : null;
};

const englishTitle = async (movie: MatchInput): Promise<string | null> => {
  if (!movie.tmdb_id) return null;
  const details = movie.media_type === 'tv'
    ? await tmdbService.getTVShowDetails(movie.tmdb_id)
    : await tmdbService.getMovieDetails(movie.tmdb_id);
  return (details as { title?: string } | null)?.title ?? null;
};

/** DexVault title, then original title, then TMDB's English title. */
export const findMatch = async (movie: MatchInput): Promise<Match | null> => {
  const tried = new Set<string>();
  const attempts: Array<() => Promise<string | null> | string | null> = [
    () => cleanTitle(movie.title),
    () => (movie.original_title ? cleanTitle(movie.original_title) : null),
    () => englishTitle(movie),
  ];

  for (const next of attempts) {
    const query = await next();
    if (!query || tried.has(query)) continue;
    tried.add(query);
    const match = pickMatch(await search(query), movie, query);
    if (match) return match;
  }
  return null;
};

export default { isConfigured, search, getVotes, pickMatch, findMatch, getRequestCount, dddUrl };
```

- [ ] **Step 5 : lancer, vérifier le succès**

Run : `cd backend && npx jest tests/warnings/doesTheDogDieService.test.ts`
Expected : PASS. Si `jest.spyOn(tmdbService, 'getMovieDetails')` échoue parce que l'export n'est pas un objet, lire `backend/src/services/tmdbService.ts` (fin de fichier) et adapter l'import au véritable export par défaut.

- [ ] **Step 6 : commit**

```bash
git add backend/src/types/index.ts backend/src/config.ts backend/src/services/doesTheDogDieService.ts backend/tests/warnings/doesTheDogDieService.test.ts
git commit -m "Query DoesTheDogDie and match its entries to DexVault movies"
```

---

### Task 4 : service des avertissements

**Files:**
- Create: `backend/src/services/warningsService.ts`
- Test: `backend/tests/warnings/warningsService.test.ts`

**Interfaces:**
- Consumes : `MovieWarning` (tâche 2), `ddd`, `DddQuotaError` (tâche 3), `classify`, `TOPICS`, `Topic`, `Override`, `WarningStatus` (tâche 1), `Movie.findById(id): Promise<MovieData | null>` (existant).
- Produces (export par défaut `warningsService`) :
  - `interface TopicWarning { topic: Topic; status: WarningStatus; yes: number; no: number; override: Override | null; overrideAt: string | null; fetchedAt: string | null }`
  - `interface MovieWarnings { movieId: number; dddId: number | null; dddUrl: string | null; matchedBy: MatchedBy | null; checkedAt: string | null; topics: TopicWarning[] }` — `topics` contient toujours un élément par sujet de `TOPICS`, dans l'ordre de `TOPICS`
  - `type RefreshOutcome = 'updated' | 'not_found' | 'skipped'`
  - `refreshMovie(movieId: number): Promise<RefreshOutcome>` — `'skipped'` si non configuré ou film absent ; propage `DddQuotaError`
  - `scheduleRefresh(movieId: number): void` — file séquentielle, n'attend rien, n'échoue jamais
  - `getMovieWarnings(movieId: number): Promise<MovieWarnings>`
  - `setOverride(movieId: number, topic: Topic, override: Override | null): Promise<MovieWarnings>`
  - `setManualLink(movieId: number, dddId: number): Promise<MovieWarnings>`
  - `interface SnapshotEntry { movie_id: number; imdb_id: string | null; tmdb_id: number | null; ddd_id: number | null; matched_by: MatchedBy | null } & Partial<Record<Topic, { yes: number; no: number } | null>>`
  - `interface Snapshot { fetched_at: string; movies: SnapshotEntry[] }`
  - `importSnapshot(snapshot: Snapshot): Promise<{ imported: number; skipped: Array<{ movie_id: number; reason: 'missing' | 'mismatch' | 'manual' | 'no_link' }> }>`
  - `runDailyRefresh(opts?: { maxRequests?: number; delayMs?: number; staleDays?: number; now?: Date }): Promise<{ refreshed: number; stoppedByQuota: boolean }>`
  - `startDailyRefresh(): void`

- [ ] **Step 1 : écrire les tests**

`backend/tests/warnings/warningsService.test.ts` :

```ts
import { getDatabase } from '../../src/database';
import MovieWarning from '../../src/models/movieWarning';
import ddd, { DddQuotaError } from '../../src/services/doesTheDogDieService';
import warningsService from '../../src/services/warningsService';

const run = (sql: string, params: unknown[] = []) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) {
      if (err) reject(err); else resolve(this.lastID);
    }));

let seq = 0;
const insertMovie = (over: { imdb_id?: string | null; tmdb_id?: number } = {}) => {
  seq += 1;
  return run(
    `INSERT INTO movies (title, imdb_id, tmdb_id, release_date, title_status) VALUES (?, ?, ?, '2002-01-01', 'owned')`,
    [`Service film ${seq}`, over.imdb_id ?? `tt9${seq}`, over.tmdb_id ?? 800000 + seq]
  );
};

const VOTES = { spiders: { yes: 125, no: 0 }, snakes: { yes: 1, no: 13 } };

beforeEach(() => {
  jest.spyOn(ddd, 'isConfigured').mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

describe('refreshMovie', () => {
  it('trouve la fiche, enregistre les votes et classe', async () => {
    const id = await insertMovie();
    jest.spyOn(ddd, 'findMatch').mockResolvedValue({ dddId: 9880, matchedBy: 'tmdb' });
    jest.spyOn(ddd, 'getVotes').mockResolvedValue(VOTES);

    expect(await warningsService.refreshMovie(id)).toBe('updated');

    const w = await warningsService.getMovieWarnings(id);
    expect(w).toMatchObject({ dddId: 9880, matchedBy: 'tmdb', dddUrl: 'https://www.doesthedogdie.com/media/9880' });
    expect(w.topics).toEqual([
      expect.objectContaining({ topic: 'spiders', status: 'with', yes: 125, no: 0 }),
      expect.objectContaining({ topic: 'snakes', status: 'without', yes: 1, no: 13 }),
    ]);
  });

  it('réutilise le lien connu : une seule requête, pas de recherche', async () => {
    const id = await insertMovie();
    await MovieWarning.saveLink(id, 9880, 'tmdb', '2026-01-01T00:00:00.000Z');
    const find = jest.spyOn(ddd, 'findMatch');
    jest.spyOn(ddd, 'getVotes').mockResolvedValue(VOTES);

    await warningsService.refreshMovie(id);
    expect(find).not.toHaveBeenCalled();
  });

  it('ne remet jamais en cause un lien manuel ni une correction', async () => {
    const id = await insertMovie();
    await warningsService.setOverride(id, 'spiders', 'without');
    await MovieWarning.saveLink(id, 22644, 'manual', null);
    jest.spyOn(ddd, 'getVotes').mockResolvedValue(VOTES);

    await warningsService.refreshMovie(id);
    const w = await warningsService.getMovieWarnings(id);
    expect(w).toMatchObject({ dddId: 22644, matchedBy: 'manual' });
    expect(w.topics[0]).toMatchObject({ topic: 'spiders', status: 'without', override: 'without', yes: 125 });
  });

  it('note un film introuvable sans votes', async () => {
    const id = await insertMovie();
    jest.spyOn(ddd, 'findMatch').mockResolvedValue(null);
    expect(await warningsService.refreshMovie(id)).toBe('not_found');
    const w = await warningsService.getMovieWarnings(id);
    expect(w.dddId).toBeNull();
    expect(w.checkedAt).not.toBeNull();
    expect(w.topics.map(t => t.status)).toEqual(['unknown', 'unknown']);
  });

  it('ne fait rien sans clé', async () => {
    (ddd.isConfigured as jest.Mock).mockReturnValue(false);
    const find = jest.spyOn(ddd, 'findMatch');
    expect(await warningsService.refreshMovie(await insertMovie())).toBe('skipped');
    expect(find).not.toHaveBeenCalled();
  });

  it('propage DddQuotaError', async () => {
    const id = await insertMovie();
    jest.spyOn(ddd, 'findMatch').mockRejectedValue(new DddQuotaError(429));
    await expect(warningsService.refreshMovie(id)).rejects.toBeInstanceOf(DddQuotaError);
  });
});

describe('getMovieWarnings', () => {
  it('renvoie tous les sujets, inconnus, pour un film jamais vérifié', async () => {
    const w = await warningsService.getMovieWarnings(await insertMovie());
    expect(w).toMatchObject({ dddId: null, dddUrl: null, matchedBy: null, checkedAt: null });
    expect(w.topics).toEqual([
      expect.objectContaining({ topic: 'spiders', status: 'unknown', yes: 0, no: 0, override: null }),
      expect.objectContaining({ topic: 'snakes', status: 'unknown', yes: 0, no: 0, override: null }),
    ]);
  });
});

describe('importSnapshot', () => {
  it('importe les liens et les votes sans appeler l’API', async () => {
    const id = await insertMovie({ imdb_id: 'tt0109440', tmdb_id: 15097 });
    const find = jest.spyOn(ddd, 'findMatch');
    const votes = jest.spyOn(ddd, 'getVotes');

    const result = await warningsService.importSnapshot({
      fetched_at: '2026-09-23',
      movies: [{ movie_id: id, imdb_id: 'tt0109440', tmdb_id: 15097, ddd_id: 22644, matched_by: 'title_year',
                 spiders: { yes: 1, no: 1 }, snakes: { yes: 0, no: 1 } }],
    });

    expect(result).toEqual({ imported: 1, skipped: [] });
    expect(find).not.toHaveBeenCalled();
    expect(votes).not.toHaveBeenCalled();
    const w = await warningsService.getMovieWarnings(id);
    expect(w).toMatchObject({ dddId: 22644, matchedBy: 'title_year', checkedAt: '2026-09-23T00:00:00.000Z' });
    expect(w.topics[0]).toMatchObject({ status: 'with', yes: 1, no: 1 });
  });

  it('ignore une ligne dont les identifiants ne concordent pas', async () => {
    const id = await insertMovie({ imdb_id: 'tt1111111', tmdb_id: 111 });
    const result = await warningsService.importSnapshot({
      fetched_at: '2026-09-23',
      movies: [{ movie_id: id, imdb_id: 'tt2222222', tmdb_id: 222, ddd_id: 5, matched_by: 'tmdb',
                 spiders: { yes: 9, no: 0 }, snakes: { yes: 0, no: 9 } }],
    });
    expect(result.skipped).toEqual([{ movie_id: id, reason: 'mismatch' }]);
    expect((await warningsService.getMovieWarnings(id)).dddId).toBeNull();
  });

  it('accepte la ligne si un seul des deux identifiants concorde', async () => {
    const id = await insertMovie({ imdb_id: null, tmdb_id: 9421 });
    const result = await warningsService.importSnapshot({
      fetched_at: '2026-09-23',
      movies: [{ movie_id: id, imdb_id: null, tmdb_id: 9421, ddd_id: 1484671, matched_by: 'title_year',
                 spiders: { yes: 0, no: 1 }, snakes: { yes: 0, no: 1 } }],
    });
    expect(result.imported).toBe(1);
  });

  it('signale un film absent et ne touche pas un lien manuel', async () => {
    const id = await insertMovie({ imdb_id: 'tt3333333', tmdb_id: 333 });
    await MovieWarning.saveLink(id, 42, 'manual', null);
    await warningsService.setOverride(id, 'spiders', 'without');

    const result = await warningsService.importSnapshot({
      fetched_at: '2026-09-23',
      movies: [
        { movie_id: 99999999, imdb_id: 'tt0', tmdb_id: 0, ddd_id: 1, matched_by: 'tmdb', spiders: null, snakes: null },
        { movie_id: id, imdb_id: 'tt3333333', tmdb_id: 333, ddd_id: 7, matched_by: 'tmdb',
          spiders: { yes: 50, no: 0 }, snakes: { yes: 0, no: 5 } },
      ],
    });

    expect(result.skipped).toEqual([
      { movie_id: 99999999, reason: 'missing' },
      { movie_id: id, reason: 'manual' },
    ]);
    const w = await warningsService.getMovieWarnings(id);
    expect(w).toMatchObject({ dddId: 42, matchedBy: 'manual' });
    expect(w.topics[0]).toMatchObject({ override: 'without', yes: 0 });
  });
});

describe('runDailyRefresh', () => {
  it('s’arrête au premier refus de quota', async () => {
    await insertMovie();
    await insertMovie();
    const find = jest.spyOn(ddd, 'findMatch').mockRejectedValue(new DddQuotaError(429));

    const result = await warningsService.runDailyRefresh({ delayMs: 0 });
    expect(result.stoppedByQuota).toBe(true);
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('s’arrête une fois le budget de requêtes consommé', async () => {
    await insertMovie();
    await insertMovie();
    await insertMovie();
    // Every refresh that finds its entry calls getVotes once, whatever the path
    // (known link, manual link, or fresh match): charging the whole cost there
    // makes each refresh cost exactly 3, whichever movies the file left behind.
    let count = 0;
    jest.spyOn(ddd, 'getRequestCount').mockImplementation(() => count);
    jest.spyOn(ddd, 'findMatch').mockResolvedValue({ dddId: 1, matchedBy: 'tmdb' });
    jest.spyOn(ddd, 'getVotes').mockImplementation(async () => { count += 3; return VOTES; });

    const result = await warningsService.runDailyRefresh({ maxRequests: 5, delayMs: 0 });
    expect(result.refreshed).toBe(2); // 3 requêtes, puis 6 ≥ 5 : arrêt
  });

  it('ne fait rien sans clé', async () => {
    (ddd.isConfigured as jest.Mock).mockReturnValue(false);
    const find = jest.spyOn(ddd, 'findMatch');
    expect(await warningsService.runDailyRefresh({ delayMs: 0 })).toEqual({ refreshed: 0, stoppedByQuota: false });
    expect(find).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : lancer, vérifier l'échec**

Run : `cd backend && npx jest tests/warnings/warningsService.test.ts`
Expected : FAIL, module introuvable.

- [ ] **Step 3 : implémenter le service**

`backend/src/services/warningsService.ts` :

```ts
import Movie from '../models/movie';
import MovieWarning, { MatchedBy } from '../models/movieWarning';
import ddd, { DddQuotaError } from './doesTheDogDieService';
import { TOPICS, Topic, Override, WarningStatus, classify } from '../warnings/rules';
import logger from '../logger';

export interface TopicWarning {
  topic: Topic;
  status: WarningStatus;
  yes: number;
  no: number;
  override: Override | null;
  overrideAt: string | null;
  fetchedAt: string | null;
}

export interface MovieWarnings {
  movieId: number;
  dddId: number | null;
  dddUrl: string | null;
  matchedBy: MatchedBy | null;
  checkedAt: string | null;
  topics: TopicWarning[];
}

export type RefreshOutcome = 'updated' | 'not_found' | 'skipped';

type SnapshotVotes = { yes: number; no: number } | null;
export type SnapshotEntry = {
  movie_id: number;
  imdb_id: string | null;
  tmdb_id: number | null;
  ddd_id: number | null;
  matched_by: MatchedBy | null;
} & Partial<Record<Topic, SnapshotVotes>>;

export interface Snapshot {
  fetched_at: string;
  movies: SnapshotEntry[];
}

type SkipReason = 'missing' | 'mismatch' | 'manual' | 'no_link';

const TOPIC_LIST = Object.keys(TOPICS) as Topic[];
const DAY_MS = 24 * 60 * 60 * 1000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getMovieWarnings = async (movieId: number): Promise<MovieWarnings> => {
  const [link, rows] = await Promise.all([MovieWarning.getLink(movieId), MovieWarning.getWarnings(movieId)]);
  return {
    movieId,
    dddId: link?.ddd_id ?? null,
    dddUrl: link?.ddd_id ? ddd.dddUrl(link.ddd_id) : null,
    matchedBy: link?.matched_by ?? null,
    checkedAt: link?.checked_at ?? null,
    topics: TOPIC_LIST.map(topic => {
      const row = rows.find(r => r.topic === topic);
      const yes = row?.yes_votes ?? 0;
      const no = row?.no_votes ?? 0;
      const override = row?.override ?? null;
      return {
        topic, yes, no, override,
        status: classify(yes, no, override),
        overrideAt: row?.override_at ?? null,
        fetchedAt: row?.fetched_at ?? null,
      };
    }),
  };
};

const refreshMovie = async (movieId: number): Promise<RefreshOutcome> => {
  if (!ddd.isConfigured()) return 'skipped';
  const movie = await Movie.findById(movieId);
  if (!movie) return 'skipped';

  const now = new Date().toISOString();
  const link = await MovieWarning.getLink(movieId);
  let dddId = link?.ddd_id ?? null;
  let matchedBy = link?.matched_by ?? null;

  if (dddId === null) {
    const match = await ddd.findMatch(movie as unknown as Parameters<typeof ddd.findMatch>[0]);
    if (!match) {
      await MovieWarning.saveLink(movieId, null, null, now);
      return 'not_found';
    }
    dddId = match.dddId;
    matchedBy = match.matchedBy;
  }

  const votes = await ddd.getVotes(dddId);
  for (const topic of TOPIC_LIST) {
    await MovieWarning.saveVotes(movieId, topic, votes[topic].yes, votes[topic].no, now);
  }
  await MovieWarning.saveLink(movieId, dddId, matchedBy, now);
  return 'updated';
};

// One refresh at a time, so a CSV import of 200 movies does not fire 800 requests at once.
let queue: Promise<void> = Promise.resolve();

const scheduleRefresh = (movieId: number): void => {
  queue = queue
    .then(() => refreshMovie(movieId))
    .then(() => undefined)
    .catch(error => {
      logger.warn(`Spider/snake warnings not fetched for movie ${movieId}: ${(error as Error).message}`);
    });
};

const setOverride = async (movieId: number, topic: Topic, override: Override | null): Promise<MovieWarnings> => {
  await MovieWarning.setOverride(movieId, topic, override, new Date().toISOString());
  return getMovieWarnings(movieId);
};

const setManualLink = async (movieId: number, dddId: number): Promise<MovieWarnings> => {
  await MovieWarning.saveLink(movieId, dddId, 'manual', null);
  try {
    await refreshMovie(movieId);
  } catch (error) {
    logger.warn(`Votes not fetched after manual link for movie ${movieId}: ${(error as Error).message}`);
  }
  return getMovieWarnings(movieId);
};

const identifiersAgree = (entry: SnapshotEntry, movie: { imdb_id?: string | null; tmdb_id?: number | null }): boolean =>
  Boolean((entry.tmdb_id && entry.tmdb_id === movie.tmdb_id) || (entry.imdb_id && entry.imdb_id === movie.imdb_id));

const importSnapshot = async (snapshot: Snapshot) => {
  const checkedAt = new Date(snapshot.fetched_at).toISOString();
  const skipped: Array<{ movie_id: number; reason: SkipReason }> = [];
  let imported = 0;

  for (const entry of snapshot.movies) {
    const movie = await Movie.findById(entry.movie_id);
    if (!movie) { skipped.push({ movie_id: entry.movie_id, reason: 'missing' }); continue; }
    if (!identifiersAgree(entry, movie as { imdb_id?: string | null; tmdb_id?: number | null })) {
      skipped.push({ movie_id: entry.movie_id, reason: 'mismatch' }); continue;
    }
    const link = await MovieWarning.getLink(entry.movie_id);
    if (link?.matched_by === 'manual') { skipped.push({ movie_id: entry.movie_id, reason: 'manual' }); continue; }
    if (!entry.ddd_id) { skipped.push({ movie_id: entry.movie_id, reason: 'no_link' }); continue; }

    for (const topic of TOPIC_LIST) {
      const votes = entry[topic];
      if (votes) await MovieWarning.saveVotes(entry.movie_id, topic, votes.yes, votes.no, checkedAt);
    }
    await MovieWarning.saveLink(entry.movie_id, entry.ddd_id, entry.matched_by, checkedAt);
    imported += 1;
  }
  return { imported, skipped };
};

const runDailyRefresh = async (
  { maxRequests = 300, delayMs = 1000, staleDays = 30, now = new Date() }:
  { maxRequests?: number; delayMs?: number; staleDays?: number; now?: Date } = {}
): Promise<{ refreshed: number; stoppedByQuota: boolean }> => {
  if (!ddd.isConfigured()) return { refreshed: 0, stoppedByQuota: false };

  const cutoff = new Date(now.getTime() - staleDays * DAY_MS).toISOString();
  const ids = await MovieWarning.listDueForRefresh(cutoff, maxRequests);
  const start = ddd.getRequestCount();
  let refreshed = 0;

  for (const id of ids) {
    if (ddd.getRequestCount() - start >= maxRequests) break;
    try {
      await refreshMovie(id);
      refreshed += 1;
    } catch (error) {
      if (error instanceof DddQuotaError) {
        logger.warn(`Spider/snake refresh stopped: ${error.message}`);
        return { refreshed, stoppedByQuota: true };
      }
      logger.warn(`Spider/snake refresh failed for movie ${id}: ${(error as Error).message}`);
    }
    if (delayMs > 0) await sleep(delayMs);
  }
  return { refreshed, stoppedByQuota: false };
};

const startDailyRefresh = (): void => {
  if (process.env.NODE_ENV === 'test') return;
  const tick = () => {
    runDailyRefresh()
      .then(r => logger.info(`Spider/snake refresh: ${r.refreshed} movies${r.stoppedByQuota ? ' (stopped by quota)' : ''}`))
      .catch(error => logger.warn(`Spider/snake refresh crashed: ${(error as Error).message}`));
  };
  // Let the server settle before the first run, then once a day.
  setTimeout(tick, 60 * 1000).unref();
  setInterval(tick, DAY_MS).unref();
};

export default {
  refreshMovie, scheduleRefresh, getMovieWarnings, setOverride, setManualLink,
  importSnapshot, runDailyRefresh, startDailyRefresh,
};
```

- [ ] **Step 4 : lancer, vérifier le succès**

Run : `cd backend && npx jest tests/warnings/warningsService.test.ts`
Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add backend/src/services/warningsService.ts backend/tests/warnings/warningsService.test.ts
git commit -m "Refresh, correct and import spider and snake warnings"
```

---

### Task 5 : routes REST

**Files:**
- Create: `backend/src/controllers/warningsController.ts`
- Modify: `backend/index.ts` (imports vers la ligne 20, routes films vers les lignes 156-167)
- Test: `backend/tests/warnings/warningsRoutes.test.ts`

**Interfaces:**
- Consumes : `warningsService` (tâche 4), `isTopic`, `isOverride` (tâche 1), `DddQuotaError`, `ddd.isConfigured` (tâche 3), `Movie.findById`.
- Produces : les routes

```
GET  /api/movies/:id/warnings                  → 200 MovieWarnings | 404
PUT  /api/movies/:id/warnings/:topic/override  → 200 MovieWarnings | 400 | 404
PUT  /api/movies/:id/ddd-link                  → 200 MovieWarnings | 400 | 404
POST /api/movies/:id/warnings/refresh          → 200 MovieWarnings | 404 | 429 | 502 | 503
POST /api/warnings/import                      → 200 { imported, skipped } | 400
```

- [ ] **Step 1 : écrire les tests**

`backend/tests/warnings/warningsRoutes.test.ts` :

```ts
import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import ddd, { DddQuotaError } from '../../src/services/doesTheDogDieService';
import warningsService from '../../src/services/warningsService';

const insertMovie = () =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(
      `INSERT INTO movies (title, tmdb_id, imdb_id, title_status) VALUES (?, ?, ?, 'owned')`,
      [`Route film ${Math.random()}`, Math.floor(Math.random() * 1e9), `tt${Math.floor(Math.random() * 1e9)}`],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }
    ));

afterEach(() => jest.restoreAllMocks());

describe('routes des avertissements', () => {
  it('renvoie les avertissements d’un film', async () => {
    const id = await insertMovie();
    const res = await request(app).get(`/api/movies/${id}/warnings`);
    expect(res.status).toBe(200);
    expect(res.body.topics.map((t: { topic: string }) => t.topic)).toEqual(['spiders', 'snakes']);
  });

  it('répond 404 pour un film inconnu', async () => {
    expect((await request(app).get('/api/movies/99999999/warnings')).status).toBe(404);
  });

  it('enregistre puis efface une correction manuelle', async () => {
    const id = await insertMovie();
    let res = await request(app).put(`/api/movies/${id}/warnings/spiders/override`).send({ override: 'without' });
    expect(res.status).toBe(200);
    expect(res.body.topics[0]).toMatchObject({ topic: 'spiders', status: 'without', override: 'without' });

    res = await request(app).put(`/api/movies/${id}/warnings/spiders/override`).send({ override: null });
    expect(res.body.topics[0]).toMatchObject({ status: 'unknown', override: null });
  });

  it.each([
    ['dogs', { override: 'with' }],
    ['spiders', { override: 'maybe' }],
    ['spiders', {}],
  ])('refuse le sujet %s avec %j', async (topic, body) => {
    const id = await insertMovie();
    expect((await request(app).put(`/api/movies/${id}/warnings/${topic}/override`).send(body)).status).toBe(400);
  });

  it('enregistre un lien manuel', async () => {
    const id = await insertMovie();
    jest.spyOn(ddd, 'isConfigured').mockReturnValue(true);
    jest.spyOn(ddd, 'getVotes').mockResolvedValue({ spiders: { yes: 0, no: 2 }, snakes: { yes: 0, no: 2 } });
    const res = await request(app).put(`/api/movies/${id}/ddd-link`).send({ dddId: 22644 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dddId: 22644, matchedBy: 'manual' });
  });

  it.each([{ dddId: 'abc' }, { dddId: -3 }, { dddId: 1.5 }, {}])('refuse le lien %j', async body => {
    const id = await insertMovie();
    expect((await request(app).put(`/api/movies/${id}/ddd-link`).send(body)).status).toBe(400);
  });

  it('répond 503 au rafraîchissement sans clé', async () => {
    const id = await insertMovie();
    expect((await request(app).post(`/api/movies/${id}/warnings/refresh`)).status).toBe(503);
  });

  it('répond 429 quand DoesTheDogDie refuse', async () => {
    const id = await insertMovie();
    jest.spyOn(ddd, 'isConfigured').mockReturnValue(true);
    jest.spyOn(warningsService, 'refreshMovie').mockRejectedValue(new DddQuotaError(429));
    expect((await request(app).post(`/api/movies/${id}/warnings/refresh`)).status).toBe(429);
  });

  it('importe un snapshot et refuse un corps sans liste de films', async () => {
    expect((await request(app).post('/api/warnings/import').send({ fetched_at: '2026-09-23' })).status).toBe(400);
    const res = await request(app).post('/api/warnings/import').send({ fetched_at: '2026-09-23', movies: [] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ imported: 0, skipped: [] });
  });
});
```

- [ ] **Step 2 : lancer, vérifier l'échec**

Run : `cd backend && npx jest tests/warnings/warningsRoutes.test.ts`
Expected : FAIL, 404 sur les routes.

- [ ] **Step 3 : implémenter le contrôleur**

`backend/src/controllers/warningsController.ts` :

```ts
import { Request, Response } from 'express';
import Movie from '../models/movie';
import ddd, { DddQuotaError } from '../services/doesTheDogDieService';
import warningsService from '../services/warningsService';
import { isOverride, isTopic } from '../warnings/rules';
import logger from '../logger';

const movieIdOf = async (req: Request, res: Response): Promise<number | null> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !(await Movie.findById(id))) {
    res.status(404).json({ error: 'Movie not found' });
    return null;
  }
  return id;
};

const warningsController = {
  get: async (req: Request, res: Response): Promise<void> => {
    const id = await movieIdOf(req, res);
    if (id === null) return;
    res.json(await warningsService.getMovieWarnings(id));
  },

  setOverride: async (req: Request, res: Response): Promise<void> => {
    const topic = String(req.params.topic);
    const override = req.body?.override;
    if (!isTopic(topic) || !(override === null || isOverride(override))) {
      res.status(400).json({ error: "Expected topic spiders|snakes and override 'with', 'without' or null" });
      return;
    }
    const id = await movieIdOf(req, res);
    if (id === null) return;
    res.json(await warningsService.setOverride(id, topic, override));
  },

  setLink: async (req: Request, res: Response): Promise<void> => {
    const dddId = req.body?.dddId;
    if (!Number.isInteger(dddId) || dddId <= 0) {
      res.status(400).json({ error: 'dddId must be a positive integer' });
      return;
    }
    const id = await movieIdOf(req, res);
    if (id === null) return;
    res.json(await warningsService.setManualLink(id, dddId));
  },

  refresh: async (req: Request, res: Response): Promise<void> => {
    const id = await movieIdOf(req, res);
    if (id === null) return;
    if (!ddd.isConfigured()) {
      res.status(503).json({ error: 'DoesTheDogDie is not configured: set DOES_DOG_DIE' });
      return;
    }
    try {
      await warningsService.refreshMovie(id);
      res.json(await warningsService.getMovieWarnings(id));
    } catch (error) {
      if (error instanceof DddQuotaError) {
        res.status(429).json({ error: error.message });
        return;
      }
      logger.warn(`Warning refresh failed for movie ${id}: ${(error as Error).message}`);
      res.status(502).json({ error: 'DoesTheDogDie did not answer' });
    }
  },

  importSnapshot: async (req: Request, res: Response): Promise<void> => {
    if (!Array.isArray(req.body?.movies) || typeof req.body?.fetched_at !== 'string') {
      res.status(400).json({ error: 'Expected { fetched_at, movies: [...] }' });
      return;
    }
    res.json(await warningsService.importSnapshot(req.body));
  },
};

export default warningsController;
```

- [ ] **Step 4 : déclarer les routes**

`backend/index.ts` : import après celui de `bookCommentController` :

```ts
import warningsController from './src/controllers/warningsController';
```

routes, juste avant `app.get('/api/movies/:id', movieController.getMovieById);` :

```ts
// Spider and snake warnings (DoesTheDogDie)
app.get('/api/movies/:id/warnings', warningsController.get);
app.put('/api/movies/:id/warnings/:topic/override', warningsController.setOverride);
app.put('/api/movies/:id/ddd-link', warningsController.setLink);
app.post('/api/movies/:id/warnings/refresh', warningsController.refresh);
app.post('/api/warnings/import', warningsController.importSnapshot);
```

- [ ] **Step 5 : lancer, vérifier le succès**

Run : `cd backend && npx jest tests/warnings/warningsRoutes.test.ts`
Expected : PASS.

- [ ] **Step 6 : commit**

```bash
git add backend/src/controllers/warningsController.ts backend/index.ts backend/tests/warnings/warningsRoutes.test.ts
git commit -m "Expose spider and snake warnings, overrides and snapshot import over REST"
```

---

### Task 6 : prédicats de recherche et colonnes de classement

**Files:**
- Modify: `backend/src/models/movie.ts` — `SearchFilters` (:51-70), initialisation des filtres (:323-342), extraction (après le bloc `has_comments`, :555-562), `incompletePredicateRegex` (:636), application SQL (après le bloc `has_comments`, :924-933), SELECT de `search` (:288-304) et de `findByStatus` (:1497-1512)
- Test: `backend/tests/warnings/warningSearch.test.ts`

**Interfaces:**
- Consumes : `statusSql`, `warningStatusColumnsSql`, `classify`, `Topic`, `WarningStatus` (tâche 1) ; `MovieWarning.saveVotes`, `setOverride` (tâche 2) ; `Movie.search({ searchText })`, `Movie.findByStatus('owned')`.
- Produces : chaque film renvoyé par `Movie.search` et `Movie.findByStatus` porte `spiders_status` et `snakes_status` (`'with' | 'without' | 'unknown'`) ; `searchText` accepte `spiders:with|without|unknown` et `snakes:with|without|unknown`.

- [ ] **Step 1 : écrire les tests**

`backend/tests/warnings/warningSearch.test.ts` :

```ts
import { getDatabase } from '../../src/database';
import Movie from '../../src/models/movie';
import MovieWarning from '../../src/models/movieWarning';
import { classify } from '../../src/warnings/rules';

const run = (sql: string, params: unknown[] = []) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) {
      if (err) reject(err); else resolve(this.lastID);
    }));

const PREFIX = 'Grille araignées';
const expected = new Map<number, string>();

beforeAll(async () => {
  // Every vote pair around the thresholds, so the SQL and TypeScript rules must agree everywhere.
  let n = 0;
  for (let yes = 0; yes <= 7; yes++) {
    for (let no = 0; no <= 30; no++) {
      const id = await run(
        `INSERT INTO movies (title, tmdb_id, genre, title_status) VALUES (?, ?, ?, 'owned')`,
        [`${PREFIX} ${yes}-${no}`, 700000 + n++, no % 2 ? 'Comedy' : 'Drama']
      );
      await MovieWarning.saveVotes(id, 'spiders', yes, no, '2026-09-23T00:00:00.000Z');
      expected.set(id, classify(yes, no));
    }
  }
  const overridden = await run(`INSERT INTO movies (title, tmdb_id, title_status) VALUES (?, 699999, 'owned')`, [`${PREFIX} override`]);
  await MovieWarning.saveVotes(overridden, 'spiders', 1, 1, '2026-09-23T00:00:00.000Z');
  await MovieWarning.setOverride(overridden, 'spiders', 'without', '2026-09-23T00:00:00.000Z');
  expected.set(overridden, 'without');
});

const idsFor = async (searchText: string) =>
  (await Movie.search({ searchText: `${searchText} title:"${PREFIX}"` } as any)).map(m => (m as any).id as number);

describe('prédicats spiders:', () => {
  it.each(['with', 'without'])('spiders:%s concorde avec classify pour chaque paire de votes', async status => {
    const ids = await idsFor(`spiders:${status}`);
    const want = [...expected].filter(([, s]) => s === status).map(([id]) => id);
    expect(ids.sort()).toEqual(want.sort());
  });

  it('classe unknown un film sans aucune ligne', async () => {
    const id = await run(`INSERT INTO movies (title, tmdb_id, title_status) VALUES (?, 699998, 'owned')`, [`${PREFIX} sans ligne`]);
    expect(await idsFor('spiders:unknown')).toContain(id);
    expect(await idsFor('snakes:unknown')).toContain(id);
  });

  it('se combine avec un autre prédicat', async () => {
    const ids = await idsFor('spiders:without genre:"Comedy"');
    expect(ids.length).toBeGreaterThan(0);
    const rows = await Movie.search({ searchText: `spiders:without genre:"Comedy" title:"${PREFIX}"` } as any);
    for (const movie of rows as any[]) {
      expect(movie.genre).toBe('Comedy');
      expect(movie.spiders_status).toBe('without');
    }
  });

  it('ne lève pas d’erreur sur une valeur invalide', async () => {
    await expect(Movie.search({ searchText: 'spiders:maybe' } as any)).resolves.toBeDefined();
  });
});

describe('colonnes de classement', () => {
  it('ajoute spiders_status et snakes_status aux films de la collection', async () => {
    const movies = await Movie.findByStatus('owned');
    const sample = (movies as any[]).find(m => expected.has(m.id))!;
    expect(sample.spiders_status).toBe(expected.get(sample.id));
    expect(sample.snakes_status).toBe('unknown');
  });
});
```

- [ ] **Step 2 : lancer, vérifier l'échec**

Run : `cd backend && npx jest tests/warnings/warningSearch.test.ts`
Expected : FAIL (le prédicat reste dans le texte libre, aucun film ne correspond ; `spiders_status` indéfini).

- [ ] **Step 3 : ajouter l'import dans `movie.ts`**

En tête de `backend/src/models/movie.ts`, avec les autres imports :

```ts
import { statusSql, warningStatusColumnsSql, Topic, WarningStatus } from '../warnings/rules';
```

- [ ] **Step 4 : déclarer le filtre**

Dans `interface SearchFilters`, après `hasComments: boolean[];` :

```ts
  warnings: Array<{ topic: Topic; status: WarningStatus }>;
```

Dans l'objet `filters` initialisé par `search` (après `hasComments: [],`) :

```ts
          warnings: [],
```

- [ ] **Step 5 : extraire le prédicat**

Juste après `searchText = searchText.replace(hasCommentsRegex, '').trim();` :

```ts
        // Extract spiders:/snakes: filters (with | without | unknown)
        const warningRegex = /\b(spiders|snakes):(with|without|unknown)\b/g;
        let warningMatch: RegExpExecArray | null;
        while ((warningMatch = warningRegex.exec(searchText)) !== null) {
          filters.warnings.push({ topic: warningMatch[1] as Topic, status: warningMatch[2] as WarningStatus });
        }
        searchText = searchText.replace(warningRegex, '').trim();
```

Dans `incompletePredicateRegex`, ajouter `spiders|snakes` à l'alternative :

```ts
        const incompletePredicateRegex = /\b(actor|director|title|collection|box_set|genre|format|original_language|media_type|year|imdb_rating|tmdb_rating|rotten_tomato_rating|recommended_age|price|has_comments|watched|last_watched|spiders|snakes):\s*$/g;
```

- [ ] **Step 6 : appliquer le filtre en SQL**

Juste après le bloc `filters.hasComments.forEach(...)` :

```ts
        // Apply spiders:/snakes: filters (AND logic); the topic comes from a closed regex
        filters.warnings.forEach(({ topic, status }) => {
          sql += ` AND ${statusSql(topic)} = ?`;
          params.push(status);
        });
```

- [ ] **Step 7 : exposer les colonnes**

Dans le SELECT de `search` et dans celui de `findByStatus`, remplacer la première ligne `SELECT m.*,` par :

```ts
        SELECT m.*,
          ${warningStatusColumnsSql()},
```

(les deux requêtes sont des gabarits `` ` `` : l'interpolation fonctionne telle quelle).

- [ ] **Step 8 : lancer les tests ciblés puis toute la suite backend**

Run : `cd backend && npx jest tests/warnings`
Expected : PASS.
Run : `cd backend && npx jest`
Expected : PASS, sans régression sur les tests existants de recherche.

- [ ] **Step 9 : commit**

```bash
git add backend/src/models/movie.ts backend/tests/warnings/warningSearch.test.ts
git commit -m "Filter movies by spider and snake status in search"
```

---

### Task 7 : déclenchement à l'ajout, tâche quotidienne, déploiement

**Files:**
- Modify: `backend/src/services/movieService.ts:226`
- Modify: `backend/src/services/importService.ts:445`, `:666`
- Modify: `backend/src/controllers/movieController.ts:524`, `:670`, `:697`
- Modify: `backend/index.ts` (bloc `serverReady`, vers la ligne 552)
- Modify: `docker-compose.yml` (section `environment`)
- Test: `backend/tests/warnings/refreshOnCreate.test.ts`

**Interfaces:**
- Consumes : `warningsService.scheduleRefresh(movieId: number): void`, `warningsService.startDailyRefresh(): void` (tâche 4) ; `movieService.createMovieWithRatings` (existant).
- Produces : tout film créé déclenche un rafraîchissement non attendu.

- [ ] **Step 1 : écrire le test**

`backend/tests/warnings/refreshOnCreate.test.ts` :

```ts
import movieService from '../../src/services/movieService';
import warningsService from '../../src/services/warningsService';
import omdbService from '../../src/services/omdbService';
import ageRecommendationService from '../../src/services/ageRecommendationService';

afterEach(() => jest.restoreAllMocks());

it('programme la récupération des avertissements après la création, sans l’attendre', async () => {
  // OMDB falls back to a public demo key: without these mocks the test would reach the network.
  jest.spyOn(omdbService, 'getMovieRatings').mockResolvedValue(null as any);
  jest.spyOn(ageRecommendationService, 'getRecommendedAge').mockResolvedValue(null as any);
  const schedule = jest.spyOn(warningsService, 'scheduleRefresh').mockImplementation(() => undefined);
  const created = await movieService.createMovieWithRatings({
    title: 'Ajout déclencheur', format: 'Blu-ray', title_status: 'owned', tmdb_id: 123456789,
  } as any);
  expect(schedule).toHaveBeenCalledWith(created.id);
});
```

- [ ] **Step 2 : lancer, vérifier l'échec**

Run : `cd backend && npx jest tests/warnings/refreshOnCreate.test.ts`
Expected : FAIL, `scheduleRefresh` jamais appelé. Si `createMovieWithRatings` échoue sur des champs obligatoires, lire sa signature (`movieService.ts:190`) et compléter l'objet passé, sans modifier le code de production pour le test.

- [ ] **Step 3 : brancher les six sites de création**

Dans chacun des trois fichiers, ajouter l'import :

```ts
import warningsService from './warningsService';            // movieService.ts, importService.ts
import warningsService from '../services/warningsService';  // movieController.ts
```

`movieService.ts:226`, remplacer `return await Movie.create(movieData as unknown as MovieData);` par :

```ts
      const created = await Movie.create(movieData as unknown as MovieData);
      warningsService.scheduleRefresh(created.id);
      return created;
```

Aux cinq autres sites (`importService.ts:445` et `:666`, `movieController.ts:524`, `:670` et `:697`), ajouter immédiatement après la ligne `const createdMovie = await Movie.create(...)` :

```ts
      warningsService.scheduleRefresh(createdMovie.id);
```

- [ ] **Step 4 : démarrer la tâche quotidienne**

`backend/index.ts`, dans `startServer().then(() => { if (process.env.NODE_ENV !== 'test') { ... } })`, après le réglage de `server.headersTimeout` :

```ts
    warningsService.startDailyRefresh();
```

avec l'import en tête de fichier :

```ts
import warningsService from './src/services/warningsService';
```

- [ ] **Step 5 : transmettre la clé au conteneur**

`docker-compose.yml`, section `environment`, après `DISCOGS_TOKEN` :

```yaml
      # DoesTheDogDie key for the spider and snake warnings. Without it every
      # movie stays "unknown" and the daily refresh does nothing.
      - DOES_DOG_DIE=${DOES_DOG_DIE:-}
```

- [ ] **Step 6 : lancer toute la suite backend**

Run : `cd backend && npx jest`
Expected : PASS.

- [ ] **Step 7 : commit**

```bash
git add backend/src/services/movieService.ts backend/src/services/importService.ts backend/src/controllers/movieController.ts backend/index.ts docker-compose.yml backend/tests/warnings/refreshOnCreate.test.ts
git commit -m "Fetch warnings for every new movie and refresh stale ones daily"
```

---

### Task 8 : pastilles et correction dans la fiche du film

**Files:**
- Modify: `frontend/src/services/api.ts` (après `getMovieById`, vers la ligne 145)
- Create: `frontend/src/components/MovieWarnings.tsx`
- Create: `frontend/src/components/MovieWarnings.css`
- Modify: `frontend/src/components/MovieDetailCard.tsx` (après le bloc `.movie-detail-facts`, vers la ligne 1786)
- Modify: `frontend/src/components/MovieDetailCard.test.tsx` (mock de `../services/api`)
- Test: `frontend/src/components/MovieWarnings.test.tsx`

**Interfaces:**
- Consumes : routes de la tâche 5 ; réponse `MovieWarnings` de la tâche 4.
- Produces :
  - dans `apiService` : `getMovieWarnings(id)`, `setWarningOverride(id, topic, override)`, `setDddLink(id, dddId)`, `refreshMovieWarnings(id)`, chacune `Promise<MovieWarningsData>`
  - `export interface MovieWarningsData` et `export type WarningTopic = 'spiders' | 'snakes'` dans `MovieWarnings.tsx`
  - composant `<MovieWarnings movieId={number} onSearch?={(query: string) => void} />`

- [ ] **Step 1 : ajouter les appels d'API**

`frontend/src/services/api.ts`, après `getMovieById` :

```ts
  async getMovieWarnings(id: number | string): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${id}/warnings`);
    return await response.json();
  }

  async setWarningOverride(id: number | string, topic: string, override: 'with' | 'without' | null): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${id}/warnings/${topic}/override`, {
      method: 'PUT',
      body: JSON.stringify({ override }),
    });
    return await response.json();
  }

  async setDddLink(id: number | string, dddId: number): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${id}/ddd-link`, {
      method: 'PUT',
      body: JSON.stringify({ dddId }),
    });
    return await response.json();
  }

  async refreshMovieWarnings(id: number | string): Promise<unknown> {
    const response = await this.makeRequest(`/movies/${id}/warnings/refresh`, { method: 'POST' });
    return await response.json();
  }
```

- [ ] **Step 2 : écrire les tests du composant**

`frontend/src/components/MovieWarnings.test.tsx` :

```tsx
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MovieWarnings from './MovieWarnings';

vi.mock('../services/api', () => ({
  default: {
    getMovieWarnings: vi.fn(),
    setWarningOverride: vi.fn(),
    setDddLink: vi.fn(),
    refreshMovieWarnings: vi.fn(),
  },
}));

import apiService from '../services/api';

const data = (over: Record<string, unknown> = {}) => ({
  movieId: 214, dddId: 22644, dddUrl: 'https://www.doesthedogdie.com/media/22644',
  matchedBy: 'title_year', checkedAt: '2026-09-23T00:00:00.000Z',
  topics: [
    { topic: 'spiders', status: 'with', yes: 1, no: 1, override: null, overrideAt: null, fetchedAt: null },
    { topic: 'snakes', status: 'without', yes: 0, no: 1, override: null, overrideAt: null, fetchedAt: null },
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  (apiService.getMovieWarnings as any).mockResolvedValue(data());
});

describe('MovieWarnings', () => {
  it('affiche le classement et les votes bruts de chaque sujet', async () => {
    render(<MovieWarnings movieId={214} />);
    await waitFor(() => expect(screen.getByText(/Spiders/)).toBeInTheDocument());
    expect(screen.getByText('With · 1 yes / 1 no')).toBeInTheDocument();
    expect(screen.getByText('Without · 0 yes / 1 no')).toBeInTheDocument();
  });

  it('corrige le classement à la main et affiche la mention', async () => {
    (apiService.setWarningOverride as any).mockResolvedValue(data({
      topics: [
        { topic: 'spiders', status: 'without', yes: 1, no: 1, override: 'without', overrideAt: 'x', fetchedAt: null },
        { topic: 'snakes', status: 'without', yes: 0, no: 1, override: null, overrideAt: null, fetchedAt: null },
      ],
    }));
    render(<MovieWarnings movieId={214} />);
    fireEvent.click(await screen.findByText('With · 1 yes / 1 no'));
    fireEvent.click(screen.getByRole('radio', { name: 'Without' }));

    await waitFor(() => expect(apiService.setWarningOverride).toHaveBeenCalledWith(214, 'spiders', 'without'));
    expect(await screen.findByText('Without (manual) · 1 yes / 1 no')).toBeInTheDocument();
  });

  it('rend la main aux votes', async () => {
    (apiService.getMovieWarnings as any).mockResolvedValue(data({
      topics: [
        { topic: 'spiders', status: 'without', yes: 1, no: 1, override: 'without', overrideAt: 'x', fetchedAt: null },
        { topic: 'snakes', status: 'without', yes: 0, no: 1, override: null, overrideAt: null, fetchedAt: null },
      ],
    }));
    (apiService.setWarningOverride as any).mockResolvedValue(data());
    render(<MovieWarnings movieId={214} />);
    fireEvent.click(await screen.findByText('Without (manual) · 1 yes / 1 no'));
    fireEvent.click(screen.getByRole('radio', { name: 'Follow votes' }));
    await waitFor(() => expect(apiService.setWarningOverride).toHaveBeenCalledWith(214, 'spiders', null));
  });

  it('lance la recherche du sujet au clic sur son nom', async () => {
    const onSearch = vi.fn();
    render(<MovieWarnings movieId={214} onSearch={onSearch} />);
    fireEvent.click(await screen.findByRole('button', { name: /Spiders/ }));
    expect(onSearch).toHaveBeenCalledWith('spiders:with');
  });

  it('enregistre un ID DoesTheDogDie saisi à la main', async () => {
    (apiService.setDddLink as any).mockResolvedValue(data({ dddId: 1, matchedBy: 'manual' }));
    render(<MovieWarnings movieId={214} />);
    fireEvent.click(await screen.findByText('With · 1 yes / 1 no'));
    fireEvent.change(screen.getByLabelText('DoesTheDogDie ID'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save link' }));
    await waitFor(() => expect(apiService.setDddLink).toHaveBeenCalledWith(214, 12345));
  });

  it('reste discret si le chargement échoue', async () => {
    (apiService.getMovieWarnings as any).mockRejectedValue(new Error('boom'));
    const { container } = render(<MovieWarnings movieId={214} />);
    await waitFor(() => expect(apiService.getMovieWarnings).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 3 : lancer, vérifier l'échec**

Run : `cd frontend && npx vitest --run MovieWarnings`
Expected : FAIL, module introuvable.

- [ ] **Step 4 : implémenter le composant**

`frontend/src/components/MovieWarnings.tsx` :

```tsx
import React, { useEffect, useState } from 'react';
import { GiSpiderAlt, GiSnake } from 'react-icons/gi';
import apiService from '../services/api';
import './MovieWarnings.css';

export type WarningTopic = 'spiders' | 'snakes';
type Status = 'with' | 'without' | 'unknown';
type Override = 'with' | 'without' | null;

interface TopicWarning {
  topic: WarningTopic;
  status: Status;
  yes: number;
  no: number;
  override: Override;
  overrideAt: string | null;
  fetchedAt: string | null;
}

export interface MovieWarningsData {
  movieId: number;
  dddId: number | null;
  dddUrl: string | null;
  matchedBy: string | null;
  checkedAt: string | null;
  topics: TopicWarning[];
}

const LABELS: Record<WarningTopic, { name: string; Icon: React.ComponentType<{ size?: number }> }> = {
  spiders: { name: 'Spiders', Icon: GiSpiderAlt },
  snakes: { name: 'Snakes', Icon: GiSnake },
};

const STATUS_TEXT: Record<Status, string> = { with: 'With', without: 'Without', unknown: 'Unknown' };

interface Props {
  movieId: number;
  onSearch?: (query: string) => void;
}

const MovieWarnings: React.FC<Props> = ({ movieId, onSearch }) => {
  const [data, setData] = useState<MovieWarningsData | null>(null);
  const [open, setOpen] = useState<WarningTopic | null>(null);
  const [linkInput, setLinkInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiService.getMovieWarnings(movieId)
      .then(result => { if (!cancelled) setData(result as MovieWarningsData); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [movieId]);

  if (!data) return null;

  const apply = (promise: Promise<unknown>) => {
    setError(null);
    promise
      .then(result => setData(result as MovieWarningsData))
      .catch((err: Error) => setError(err.message));
  };

  const saveLink = () => {
    const dddId = Number(linkInput);
    if (!Number.isInteger(dddId) || dddId <= 0) {
      setError('Enter the number at the end of the DoesTheDogDie page address');
      return;
    }
    apply(apiService.setDddLink(movieId, dddId));
  };

  return (
    <div className="movie-warnings">
      {data.topics.map(warning => {
        const { name, Icon } = LABELS[warning.topic];
        const summary = `${STATUS_TEXT[warning.status]}${warning.override ? ' (manual)' : ''} · ${warning.yes} yes / ${warning.no} no`;
        return (
          <div key={warning.topic} className="movie-warning">
            <span className={`movie-warning-chip status-${warning.status}`}>
              <button
                type="button"
                className="movie-warning-name"
                onClick={() => onSearch?.(`${warning.topic}:${warning.status}`)}
              >
                <Icon size={14} /> {name}
              </button>
              <button
                type="button"
                className="movie-warning-summary"
                aria-expanded={open === warning.topic}
                onClick={() => setOpen(open === warning.topic ? null : warning.topic)}
              >
                {summary}
              </button>
            </span>

            {open === warning.topic && (
              <div className="movie-warning-panel">
                <fieldset>
                  <legend>{name}</legend>
                  {([['Follow votes', null], ['With', 'with'], ['Without', 'without']] as Array<[string, Override]>).map(([label, value]) => (
                    <label key={label}>
                      <input
                        type="radio"
                        name={`override-${warning.topic}`}
                        checked={warning.override === value}
                        onChange={() => apply(apiService.setWarningOverride(movieId, warning.topic, value))}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>

                <div className="movie-warning-link">
                  {data.dddUrl
                    ? <a href={data.dddUrl} target="_blank" rel="noreferrer">DoesTheDogDie #{data.dddId}</a>
                    : <span>Not found on DoesTheDogDie</span>}
                  {data.matchedBy && <span className="movie-warning-meta"> · matched by {data.matchedBy}</span>}
                </div>

                <label className="movie-warning-input">
                  DoesTheDogDie ID
                  <input
                    type="text"
                    inputMode="numeric"
                    value={linkInput}
                    placeholder={data.dddId ? String(data.dddId) : ''}
                    onChange={e => setLinkInput(e.target.value)}
                  />
                </label>
                <button type="button" onClick={saveLink}>Save link</button>
                <button type="button" onClick={() => apply(apiService.refreshMovieWarnings(movieId))}>Refresh</button>

                <div className="movie-warning-meta">
                  {data.checkedAt ? `Checked ${new Date(data.checkedAt).toLocaleDateString()}` : 'Never checked'}
                </div>
                {error && <div className="movie-warning-error">{error}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MovieWarnings;
```

`frontend/src/components/MovieWarnings.css` :

```css
.movie-warnings {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 6px 0 10px;
}

.movie-warning-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  overflow: hidden;
  font-size: 0.85rem;
  border: 1px solid currentColor;
}

.movie-warning-chip button {
  background: none;
  border: none;
  color: inherit;
  padding: 2px 8px;
  cursor: pointer;
}

.movie-warning-name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}

.movie-warning-summary {
  border-left: 1px solid currentColor !important;
}

.movie-warning-chip.status-with { color: #e5534b; }
.movie-warning-chip.status-without { color: #46954a; }
.movie-warning-chip.status-unknown { color: #8b949e; }

.movie-warning-panel {
  margin-top: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.85rem;
  display: grid;
  gap: 6px;
}

.movie-warning-panel fieldset {
  display: flex;
  gap: 12px;
  border: none;
  margin: 0;
  padding: 0;
}

.movie-warning-panel legend {
  font-weight: 600;
  margin-right: 8px;
  float: left;
}

.movie-warning-input input {
  margin-left: 6px;
  width: 8em;
}

.movie-warning-meta { opacity: 0.7; }
.movie-warning-error { color: #e5534b; }
```

- [ ] **Step 5 : insérer le composant dans la fiche**

`frontend/src/components/MovieDetailCard.tsx`, import en tête :

```tsx
import MovieWarnings from './MovieWarnings';
```

juste après la fermeture `</div>` du bloc `<div className="movie-detail-facts">` :

```tsx
                {movieDetails.id != null && (
                  <MovieWarnings
                    movieId={Number(movieDetails.id)}
                    onSearch={onSearch ? (query) => { onSearch(query); onClose(); } : undefined}
                  />
                )}
```

(`movieDetails`, `onSearch` et `onClose` sont les props déjà utilisées par `handleAgeClick`. Si la prop du film porte un autre nom dans la signature du composant, utiliser ce nom.)

- [ ] **Step 6 : compléter le mock de la fiche**

`frontend/src/components/MovieDetailCard.test.tsx`, dans l'objet `default` du `vi.mock('../services/api', ...)` :

```ts
    getMovieWarnings: vi.fn(() => Promise.resolve({
      movieId: 1, dddId: null, dddUrl: null, matchedBy: null, checkedAt: null, topics: []
    })),
```

- [ ] **Step 7 : lancer les tests**

Run : `cd frontend && npx vitest --run MovieWarnings MovieDetailCard`
Expected : PASS.

- [ ] **Step 8 : commit**

```bash
git add frontend/src/services/api.ts frontend/src/components/MovieWarnings.tsx frontend/src/components/MovieWarnings.css frontend/src/components/MovieDetailCard.tsx frontend/src/components/MovieDetailCard.test.tsx frontend/src/components/MovieWarnings.test.tsx
git commit -m "Show spider and snake votes on the movie card and let them be corrected"
```

---

### Task 9 : badge sur l'affiche, filtres rapides, autocomplétion

**Files:**
- Modify: `frontend/src/components/FilmDexPage.tsx:416-442` (pile `.poster-badges-left`)
- Modify: `frontend/src/components/BoxSetStack.tsx:299-300` (badge d'âge répété)
- Modify: la feuille de style qui définit `.collection-badge-large` (la trouver avec `grep -rn "collection-badge-large" frontend/src --include=*.css`)
- Modify: `frontend/src/App.tsx` — mots-clés (:125-137), aide (:655-662), `handleFilterSelection` (:470-520), section « Special » (:1488-1499)
- Test: `frontend/src/components/WarningBadges.test.tsx`
- Create: `frontend/src/components/WarningBadges.tsx`

**Interfaces:**
- Consumes : `spiders_status` et `snakes_status` sur chaque film de `/api/movies` et `/api/movies/search` (tâche 6) ; prédicats `spiders:`/`snakes:` (tâche 6).
- Produces : `<WarningBadges movie={{ spiders_status?: string; snakes_status?: string }} />`, qui ne rend rien si aucun sujet n'est `with`.

- [ ] **Step 1 : écrire le test du badge**

`frontend/src/components/WarningBadges.test.tsx` :

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WarningBadges from './WarningBadges';

describe('WarningBadges', () => {
  it('signale seulement les sujets présents', () => {
    render(<WarningBadges movie={{ spiders_status: 'with', snakes_status: 'without' }} />);
    expect(screen.getByTitle('Spiders')).toBeInTheDocument();
    expect(screen.queryByTitle('Snakes')).not.toBeInTheDocument();
  });

  it('ne rend rien pour un film sans ou inconnu', () => {
    const { container } = render(<WarningBadges movie={{ spiders_status: 'unknown', snakes_status: 'without' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('tolère un film sans colonnes de classement', () => {
    const { container } = render(<WarningBadges movie={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2 : lancer, vérifier l'échec**

Run : `cd frontend && npx vitest --run WarningBadges`
Expected : FAIL, module introuvable.

- [ ] **Step 3 : implémenter le badge**

`frontend/src/components/WarningBadges.tsx` :

```tsx
import React from 'react';
import { GiSpiderAlt, GiSnake } from 'react-icons/gi';

interface Props {
  movie: { spiders_status?: string; snakes_status?: string };
}

/** Only "with" earns a badge: the poster should flag danger, not reassure. */
const WarningBadges: React.FC<Props> = ({ movie }) => (
  <>
    {movie.spiders_status === 'with' && (
      <span className="warning-badge-large" title="Spiders"><GiSpiderAlt size={14} /></span>
    )}
    {movie.snakes_status === 'with' && (
      <span className="warning-badge-large" title="Snakes"><GiSnake size={14} /></span>
    )}
  </>
);

export default WarningBadges;
```

Dans la feuille de style trouvée par le `grep`, juste après la règle `.collection-badge-large` : copier ses déclarations dans une nouvelle règle `.warning-badge-large`, puis ajouter ou remplacer la couleur :

```css
.warning-badge-large {
  /* mêmes dimensions que .collection-badge-large ; seule la couleur change */
  background: rgba(229, 83, 75, 0.9);
  color: #fff;
}
```

- [ ] **Step 4 : poser le badge dans la grille**

`FilmDexPage.tsx`, import en tête :

```tsx
import WarningBadges from './WarningBadges';
```

dans `.poster-badges-left`, juste après le badge d'âge (`{movie.recommended_age != null && (...)}`) :

```tsx
              <WarningBadges movie={movie} />
```

`BoxSetStack.tsx` : même import, et même ligne juste après le badge d'âge (vers la ligne 300).

- [ ] **Step 5 : filtres rapides et autocomplétion**

`App.tsx`, liste des mots-clés des films, après `'has_comments:true', 'has_comments:false',` :

```ts
            'spiders:with', 'spiders:without', 'spiders:unknown',
            'snakes:with', 'snakes:without', 'snakes:unknown',
```

aide, après `'has_comments:false': 'Movies without comments',` :

```ts
            'spiders:with': 'Movies showing spiders',
            'spiders:without': 'Movies without spiders',
            'spiders:unknown': 'Spiders not reported yet',
            'snakes:with': 'Movies showing snakes',
            'snakes:without': 'Movies without snakes',
            'snakes:unknown': 'Snakes not reported yet',
```

`handleFilterSelection`, après `case 'comments': ... break;` :

```ts
      case 'no_spiders':
        predicate = 'spiders:without';
        break;
      case 'no_snakes':
        predicate = 'snakes:without';
        break;
      case 'no_spiders_snakes':
        predicate = 'spiders:without snakes:without';
        break;
```

section « Special », après le bouton « Has Comments » :

```tsx
                          {([['no_spiders', 'No spiders'], ['no_snakes', 'No snakes'], ['no_spiders_snakes', 'No spiders or snakes']] as const).map(([type, label]) => (
                            <button
                              key={type}
                              className="filter-option"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleFilterSelection(type, '');
                              }}
                            >
                              {label}
                            </button>
                          ))}
```

- [ ] **Step 6 : lancer toute la suite frontend**

Run : `cd frontend && npx vitest --run`
Expected : PASS.

- [ ] **Step 7 : vérifier dans l'application**

Run : `npm run dev` à la racine, puis ouvrir `http://localhost:3000`.
Avec la base de dev (2 films), importer le snapshot n'a pas de sens ; poser à la main une correction `with` sur un film par l'API :
`curl -X PUT -H 'Content-Type: application/json' -d '{"override":"with"}' http://localhost:3001/api/movies/<id>/warnings/spiders/override`
Expected : le badge araignée apparaît sur l'affiche ; la fiche montre « Spiders With (manual) · 0 yes / 0 no » ; le filtre « No spiders » masque ce film ; le clic sur « Spiders » dans la fiche lance `spiders:with`.

- [ ] **Step 8 : commit**

```bash
git add frontend/src/components/WarningBadges.tsx frontend/src/components/WarningBadges.test.tsx frontend/src/components/FilmDexPage.tsx frontend/src/components/BoxSetStack.tsx frontend/src/App.tsx
git add -u frontend/src
git commit -m "Flag spider and snake movies on posters and add no-spider filters"
```

---

### Task 10 : mise en production et import du snapshot

Étapes manuelles, après fusion de la branche et publication de l'image (workflow `.github/workflows/publish.yml`, puis Watchtower sur p-cloud).

- [ ] **Step 1 : fournir la clé à la prod**

Sur p-cloud, dans l'environnement du compose de DexVault, définir `DOES_DOG_DIE=<clé>` puis recréer le conteneur (`docker compose up -d`). Vérifier :

```bash
curl -s -X POST https://dexvault.lab.crog.org/api/movies/76/warnings/refresh | head -c 300
```

Expected : HTTP 200 et, pour *Harry Potter et la Chambre des secrets*, `spiders` et `snakes` en `with`. Une 503 signifie que la clé n'est pas arrivée dans le conteneur.

- [ ] **Step 2 : importer le snapshot**

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  --data @data/ddd-snapshot-2026-09-23.json \
  https://dexvault.lab.crog.org/api/warnings/import
```

Expected : `{"imported":214,"skipped":[]}` (ou 213 et une ligne `manual` si le film 76 a été lié à la main entre-temps). Toute ligne `mismatch` est à examiner avant d'aller plus loin.

- [ ] **Step 3 : poser la première correction manuelle**

*La Cité de la peur* (id 214 en prod) n'a ni araignée ni serpent :

```bash
curl -s -X PUT -H 'Content-Type: application/json' -d '{"override":"without"}' \
  https://dexvault.lab.crog.org/api/movies/214/warnings/spiders/override
```

- [ ] **Step 4 : vérifier les totaux**

```bash
for q in spiders:with spiders:without spiders:unknown snakes:with snakes:without snakes:unknown; do
  printf '%s ' "$q"; curl -s "https://dexvault.lab.crog.org/api/movies/search?searchText=$q" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))'
done
```

Expected : araignées 54 / 158 / 2 (55 / 157 moins la correction de *La Cité de la peur*), serpents 44 / 164 / 6.
