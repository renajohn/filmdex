# Araignées et serpents : tag et filtre des films

Date : 2026-09-23
Statut : conception validée, en attente de relecture

## Objectif

Quelqu'un à la maison a la phobie des araignées ou des serpents. DexVault doit dire, pour chaque film,
s'il en montre, et permettre de filtrer la collection « sans araignées », « sans serpents », ou les deux.

Critères de réussite :

- chaque film possédé porte un classement *avec*, *sans* ou *inconnu* pour chaque animal ;
- un filtre rapide et un prédicat de recherche isolent les films sans l'animal ;
- le classement affiche toujours les votes bruts qui le fondent (« 2 oui / 5 non ») ;
- une correction manuelle prime sur les votes et survit à tout rafraîchissement ;
- un nouveau film est classé sans ralentir son ajout ;
- l'API externe n'est jamais sollicitée au-delà de son quota.

## Source : DoesTheDogDie

[doesthedogdie.com](https://www.doesthedogdie.com) est une base participative d'avertissements. Pour
chaque film, les utilisateurs votent oui ou non à des questions, dont :

| Sujet | TopicId |
|---|---|
| « Are there spiders? » | 165 |
| « Are there snakes? » | 214 |

API :

- `GET /dddsearch?q=<titre>` : liste d'éléments (`id`, `name`, `releaseYear`, `imdbId`, `tmdbid`) ;
- `GET /media/<id>` : `topicItemStats[]` avec `TopicId`, `yesSum`, `noSum` ;
- en-têtes : `Accept: application/json`, `X-API-KEY: <clé>`, et **un User-Agent explicite** ;
  Cloudflare répond 403 à `Python-urllib` et aux clients sans nom ;
- quota : **5 000 requêtes par mois**.

Ce qui n'est pas exploitable :

- les minutages (« Scene Alerts ») sont payants, et environ 250 films seulement sont minutés sur
  tout le site ;
- `numSceneAlerts` n'est pas un compte de scènes fiable : il vaut 1 sur des films sans aucun vote oui
  (*Joker* 0/107, *The Batman* 0/100), et presque les mêmes films portent 1 pour les deux animaux. Il
  semble signaler « film minuté côté payant ». Il est ignoré.

## Mesure sur la collection (2026-09-23)

Clone de la base de prod, 214 films possédés, tous appariés :

| Correspondance | Films |
|---|---|
| `tmdbid` | 204 |
| `imdbId` (titre anglais ou nettoyé) | 4 |
| titre et année (fiche DDD sans identifiant) | 6 |

Pièges rencontrés, que la correspondance doit gérer :

- suffixes propres à DexVault : `[fr]`, `(zone A)`, `- FINAL CUT`, `Director's Cut`, `, the complete series` ;
- titres français introuvables : *Bienvenue chez les Ch'tis*, *Amélie*, *Arthur et les Minimoys*
  ne se trouvent que par leur titre anglais ;
- fiches DDD sans `tmdbid` (*Pan's Labyrinth*, apparié par `imdbId`), sans aucun identifiant
  (*Ocean's Thirteen*, *La Cité de la peur*), ou avec un `tmdbid` erroné (*Astérix Mission Cléopâtre*) ;
- trois films DexVault n'ont pas d'`imdb_id` (*Harry Potter à l'école des sorciers*, *Kaamelott*,
  *Le Dîner de cons*).

Résultat conservé dans `data/ddd-snapshot-2026-09-23.json` (hors git) : pour chaque film, `movie_id`
de prod, `imdb_id`, `tmdb_id`, `ddd_id`, `matched_by`, et les votes des deux sujets.

## Règle de classement (« règle B »)

```
correction manuelle présente           → la correction
aucun vote (oui + non = 0)             → inconnu
oui ≥ 5  ou  oui / (oui + non) ≥ 25 %  → avec
sinon                                  → sans
```

Le seuil absolu de 5 attrape les vraies scènes que la majorité n'a pas relevées (*Le Silence des
agneaux*, 22 oui / 93 non ; *Alien*, 9 oui / 96 non pour les serpents). Le seuil relatif attrape les
films peu votés (*Hellboy*, 3/1 ; *Jumanji*, 3/8 pour les serpents).

Répartition sur la prod :

| | Avec | Sans | Inconnu |
|---|---|---|---|
| Araignées | 55 | 157 | 2 |
| Serpents | 44 | 164 | 6 |

Limites acceptées : un seul vote suffit à classer (*La Cité de la peur*, 1/1, passe « avec
araignées » : faux positif corrigé à la main), et une trentaine de films peu couverts sont « sans »
sur un ou deux votes. L'affichage des votes bruts rend ces cas lisibles.

Les seuils (5 et 25 %) sont des constantes nommées. La règle est calculée à la lecture, jamais
stockée : changer un seuil ne demande ni migration ni recalcul.

## Modèle de données

Deux tables, créées par une auto-migration dans `backend/src/database.ts` (`runAutoMigrations`), sur
le modèle de `010_add_watch_count` :

```sql
CREATE TABLE IF NOT EXISTS movie_ddd (
  movie_id    INTEGER PRIMARY KEY REFERENCES movies(id) ON DELETE CASCADE,
  ddd_id      INTEGER,     -- NULL : recherché mais introuvable
  matched_by  TEXT,        -- 'imdb' | 'tmdb' | 'title_year' | 'manual'
  checked_at  TEXT         -- ISO 8601, dernière interrogation
);

CREATE TABLE IF NOT EXISTS movie_warnings (
  movie_id     INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  topic        TEXT    NOT NULL,          -- 'spiders' | 'snakes'
  yes_votes    INTEGER NOT NULL DEFAULT 0,
  no_votes     INTEGER NOT NULL DEFAULT 0,
  override     TEXT,                      -- NULL | 'with' | 'without'
  override_at  TEXT,
  fetched_at   TEXT,
  PRIMARY KEY (movie_id, topic)
);
```

Les sujets sont déclarés à un seul endroit : `{ spiders: 165, snakes: 214 }`. En ajouter un ne
demande pas de migration.

Pourquoi des tables à part plutôt que des colonnes sur `movies` : `Movie.create`, `Movie.update`, le
mapping des résultats de recherche et l'export CSV listent leurs colonnes à la main ; des tables
dédiées évitent d'y toucher, au prix d'une jointure dans la recherche.

### Correction manuelle

- par film et par sujet : `override` vaut `'with'`, `'without'`, ou `NULL` pour suivre les votes ;
- elle fonctionne sans données DDD (ligne créée à 0/0 avec la correction) ;
- elle prime sur les votes sans les effacer : l'interface affiche les deux ;
- aucun rafraîchissement ni import ne la modifie.

Le lien DDD se corrige aussi à la main : `matched_by = 'manual'`, jamais remis en cause par la
correspondance automatique.

## Service DoesTheDogDie

Nouveau fichier `backend/src/services/doesTheDogDieService.ts`, construit comme `omdbService` :

- clé : `getApiKeys().doesthedogdie`, qui lit la variable d'environnement `DOES_DOG_DIE` puis
  `doesthedogdie_api_key` dans `options.json` (ajouts dans `config.ts`, `DataConfig`, `ApiKeys`) ;
  sans clé, avertissement et retour `null`, jamais d'exception ;
- User-Agent `DexVault/<version>`, délai d'attente de 10 s par requête.

Fonctions :

```ts
search(query: string): Promise<DddItem[]>                        // 1 requête
getVotes(dddId: number): Promise<Record<Topic, {yes, no}>>       // 1 requête
findMatch(movie): Promise<{ dddId, matchedBy } | null>           // 1 à 3 requêtes
```

`findMatch` essaie successivement trois requêtes, et s'arrête à la première qui apparie :

1. le titre DexVault nettoyé (suffixes retirés) ;
2. le titre original ;
3. le titre anglais, obtenu par `tmdbService` à partir du `tmdb_id`.

Pour chaque liste de résultats, l'ordre de préférence est : même `imdbId`, puis même `tmdbid`, puis
même titre normalisé (casse, accents, ponctuation, « & »/« et ») et année à ±1.

Erreurs :

- 403 ou 429 : erreur typée `DddQuotaError`, qui arrête le lot en cours ;
- autre erreur : le film reste inconnu, il sera repris au rafraîchissement suivant.

## Flux

Point d'entrée unique : `warningsService.refreshMovie(movieId)`.

- lien absent (et non manuel) : `findMatch`, puis `getVotes` ;
- `ddd_id` connu : `getVotes` seul, soit 1 requête ;
- écrit `movie_ddd` et les votes de `movie_warnings`, met à jour `checked_at` ; ne touche jamais
  `override` ni un lien `manual`.

### Ajout d'un film

Quatre chemins créent un film : `movieService.createMovieWithRatings`, `movieController.addMovie`,
`movieController.addMovieWithPipeline` et `importService.processMovie`. Après chaque `Movie.create`,
`refreshMovie` est lancé **sans être attendu** : l'ajout garde sa durée actuelle, et un échec laisse le
film inconnu. L'import CSV passe par une file qui traite les films un par un.

### Import du snapshot

`POST /api/warnings/import`, corps = le JSON du snapshot.

- chaque ligne est rattachée par `movie_id`, puis vérifiée par `tmdb_id` ou `imdb_id` ; une
  divergence fait ignorer la ligne et la signale dans la réponse ;
- écrit `movie_ddd` et `movie_warnings` sans aucun appel à l'API ;
- rejouable : n'écrase ni les corrections manuelles ni un lien `manual`.

C'est le backfill de la prod. Le fichier restant dans `data/` hors git, il est envoyé par curl après
le déploiement.

### Rafraîchissement

Au démarrage du backend puis toutes les 24 h, une tâche traite les films jamais vérifiés et ceux dont
`checked_at` a plus de 30 jours :

- une requête par seconde au plus ;
- plafond de 300 requêtes par jour ;
- sur `DddQuotaError`, arrêt jusqu'au lendemain.

Coût attendu pour 214 films : environ 220 requêtes par mois, sur un quota de 5 000.

Le backfill existant (`backfillService`, `backfillController`) n'est relié à aucune route ; il n'est
pas réutilisé.

### Routes

```
GET  /api/movies/:id/warnings                  → votes, classement, correction, lien, dates
PUT  /api/movies/:id/warnings/:topic/override  → { override: 'with' | 'without' | null }
PUT  /api/movies/:id/ddd-link                  → { dddId } ; matched_by = 'manual', puis refreshMovie
POST /api/movies/:id/warnings/refresh          → refreshMovie immédiat
POST /api/warnings/import                      → import du snapshot
```

## Interface

### Recherche

Prédicats analysés dans `Movie.search` (`backend/src/models/movie.ts`), sur le modèle de
`has_comments:` :

```
spiders:with   spiders:without   spiders:unknown
snakes:with    snakes:without    snakes:unknown
```

- combinables (`spiders:without snakes:without`) ;
- traduits par une jointure sur `movie_warnings` et une expression `CASE` construite à partir des
  mêmes constantes que `classify` ; un film sans ligne est `unknown` ;
- déclarés dans `incompletePredicateRegex`, dans l'autocomplétion (`App.tsx`, liste des mots-clés)
  et dans les indications d'aide.

### Filtres rapides

Section « Special » du menu de filtres (`App.tsx`, `handleFilterSelection`), libellés en anglais
comme le reste de l'interface :

- **No spiders** → `spiders:without`
- **No snakes** → `snakes:without`
- **No spiders or snakes** → les deux

### Grille

Dans la pile de badges à gauche de l'affiche (`FilmDexPage.tsx`, `.poster-badges-left`, et
`BoxSetStack.tsx`), un badge 🕷️ ou 🐍 (`GiSpider`, `GiSnake` de react-icons) **seulement quand le
film est « avec »**. Les films sans l'animal ou inconnus n'ont pas de badge.

### Fiche du film

Dans `MovieDetailCard.tsx`, sur la ligne des faits après l'âge, une pastille par sujet :

```
Fantasy | 2h41 | 7+ | 🕷️ With · 125 yes / 0 no | 🐍 With · 87 yes / 0 no
```

- rouge pour *with*, vert pour *without*, gris pour *unknown* ; « (manual) » si corrigé ;
- clic sur le libellé : recherche `spiders:with`, comme le clic sur l'âge ;
- clic sur les votes : panneau avec le réglage *Follow votes / With / Without*, le lien vers la
  fiche DoesTheDogDie avec un champ pour corriger l'ID, la date de vérification et un bouton
  *Refresh*.

## Tests

- `classify` : cas limites de la règle (0/0, 1/1, 4/113, 5/58, 3/8, correction) ;
- nettoyage et normalisation des titres : suffixes rencontrés, accents, « & » ;
- `findMatch` avec des réponses d'API enregistrées, tirées des cas réels : *Pan's Labyrinth* (pas de
  `tmdbid`), *Ocean's Thirteen* (aucun identifiant), *Astérix* (`tmdbid` erroné), *Amélie* (titre
  anglais) ; aucun test n'appelle la vraie API ;
- concordance SQL / TypeScript : les 214 films du snapshot classés par le `CASE` SQL et par
  `classify` donnent le même résultat ;
- import : rattachement, divergence d'identifiants, rejouabilité sans écraser une correction ;
- `refreshMovie` : correction manuelle et lien `manual` préservés ; `DddQuotaError` interrompt le
  lot.

## Hors périmètre (v1)

- minutages des scènes ;
- autres sujets DoesTheDogDie ;
- filtre dans le serveur MCP (`search_movies`) ;
- colonnes dans l'export CSV ;
- séries : traitées comme les films (une fiche DDD par série), sans détail par épisode.
