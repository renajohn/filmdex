# Recherche à pastilles — conception et plan

Choisie le 22.10.2026. Prototype : `2026-10-22-search-pills/search-pills-prototype.html` (variante B « Pastilles » retenue).

## Le principe

- La recherche reste **une chaîne** : `?search=`, le localStorage par section, les clics qui écrivent `actor:"…"`, `owner:Alice` ou `composer:Bach` dans la recherche, les analyseurs du backend. Seul le champ change : il lit cette chaîne et la montre en pastilles, et ce qu'on y fait la réécrit.
- Chaque filtre fini (`clé:valeur`) est une **pastille** ; les mots libres restent du texte entre elles.
- Un **registre des clés par section** (MusicDex, FilmDex, BookDex, Scores, Wish list) dit tout d'une clé : son nom, ses alias, son groupe, son type (texte, liste, oui/non, nombre, date), sa description, un exemple, ses valeurs ou raccourcis, et d'où viennent ses suggestions. L'autocomplétion, les infobulles, la validation et le texte des pastilles le lisent ; plus de listes recopiées dans `App.tsx`.

## Le champ

- **Une clé reconnue ouvre une pastille** : `composer:` tapé, ou `comp` puis Tab. La valeur se tape dedans, sans guillemets.
- **La suite en gris** : la suite probable de la clé ou de la valeur s'affiche après le curseur, avec un petit `TAB` ; Tab ou → la prend. La ligne lumineuse du menu est toujours celle que Tab prend.
- Dans une pastille ouverte : Tab, Entrée ou → prend la valeur proposée ; `,` la prend et en ajoute une autre (`composer Mozart or Debussy`) ; l'espace continue un nom de plusieurs mots connu (Joni ⎵ Mitchell) et ferme la pastille sinon ; `!` au début exclut ; ⌫ sur une valeur vide reprend la précédente, puis rend le texte de la clé ; Échap remet la pastille comme elle était.
- ⌫ dans le champ vide rouvre la dernière pastille sur sa dernière valeur.
- **Clic sur la clé** d'une pastille : son menu (Exclude it / Include it again, Add another value…, Edit the words, Remove). **Clic sur une valeur** (pas le « or ») : la pastille s'ouvre à sa place sur cette valeur, sélectionnée, le menu liste **toutes** les valeurs de la clé, la courante cochée d'un ✓ or, les autres valeurs de la pastille absentes.
- Champ vide au focus : les recherches récentes de la section (localStorage), puis les clés par groupe avec un exemple. Un mot tapé propose le mot libre, les clés qui commencent par lui, et les valeurs de toutes les clés qui le contiennent (`bach` → `composer:Bach`).
- Une clé inconnue : pastille au bord rouge, vague rouge sous la valeur, et sous le champ « `artst` is not a filter. Did you mean `artist`? » avec un bouton qui corrige. Une valeur hors liste (`cd:maybe`) de même.
- Sous le champ, une ligne dit ce qui a été compris quand la section n'a pas déjà son compte (optionnel par section).

## Le vocabulaire

- **yes/no partout.** `true/false`, `with/without`, `y/n`, `1/0` restent compris (analyseurs du backend et du frontend) ; une pastille réécrit yes/no.
- **L'exclusion s'écrit `!clé:`** ; `-clé:` reste compris. La chaîne enregistrée garde `-` (les liens et les analyseurs existants), la pastille montre `!`.
- Les clés en snake_case gardent leur nom ; un alias court peut s'ajouter (`lang` pour `original_language`).

## L'apparence (docs/design-guidelines.md)

- Une pastille a la matière du `Chip`, un cran plus clair : verre `--dv-glass-hover`, bord `--dv-edge-hover` ; sous le pointeur ou ouverte, `--dv-pill-glass-hover` (rgba 255,255,255,.17) et `--dv-pill-edge-hover` (.34), deux tokens nouveaux. Ronde, **26 px** de haut, texte **15 px** ; la clé en `#b8bec8` (token `--dv-pill-key`), la valeur en `--dv-text` demi-gras, « or » en `--dv-text-faint` 13 px, ✕ au bout.
- L'exclusion : un `!` gras couleur du texte, **jamais d'orange** (l'orange veut dire « à refaire »). Une erreur : bord `--dv-danger-tint-edge`, vague `--dv-danger`.
- Le menu des suggestions : la matière des menus (`menu-surface`, `menu-item`), voile clair sous le pointeur, ✓ or pour la valeur choisie, pied avec les touches.
- Le champ garde sa place, sa hauteur minimale (48 px) et son bord or au focus ; le ✕ qui vide tout et le ▾ des filtres restent au bout.

## Les cas de bord

- **Longue recherche** : les pastilles passent à la ligne dans le champ. Hors focus, le champ ne dépasse pas **deux lignes** ; ce qui ne tient pas est remplacé par une pastille discrète « +N » qui ouvre le champ. Au focus, jusqu'à quatre lignes, puis le champ défile en lui-même ; l'en-tête de l'app ne pousse jamais la page. Une valeur très longue se coupe d'un « … » (pastille au plus la largeur du champ), entière dans l'infobulle et quand on l'ouvre.
- **Téléphone** : le champ prend toute la largeur ; les pastilles passent à la ligne ; le menu prend la largeur du champ ; pas de survol nécessaire (le ✕ est toujours visible).
- **Les boutons de propriétaires de BookDex (Alice, Oriane, No owner)** écrivent `owner:Alice` ou `owner:Alice,Oriane` : la pastille `owner Alice or Oriane` et les boutons dorés disent toujours la même chose, dans les deux sens (retirer la pastille éteint le bouton, un clic sur le bouton change la pastille). La rangée « active-filters » de BookSearch, sous la grille, fait double emploi avec les pastilles : elle disparaît.
- **Injections** (acteur, réalisateur, artiste, genre, étagère, filtres du ▾) : elles écrivent toujours dans la chaîne ; le champ les montre aussitôt en pastilles.
- Guillemets mal fermés, deux-points dans un titre (`title:"Vol: 2"`), `stars:>=4`, plages `1960-1969`, dates `last_watched:>2024-01-01` : comme avant.
- Une pastille de la même clé qu'une autre est un second filtre (ET), comme dans la chaîne.

## Plan d'implémentation

1. **Fondation** (un agent) : `frontend/src/components/shared/search/` — `query.ts` (découpage, lecture d'un mot, valeurs, guillemets, `!`/`-`, alias oui/non, réécriture), `schema.ts` (le type du registre), `SearchPills.tsx` + `search-pills.css` (le champ, les pastilles, la pastille ouverte, la suite en gris, le menu, les cas de bord), tokens dans `tokens.css`. Branchement dans `App.tsx` à la place de l'`<input>` et de l'autocomplétion, le registre choisi par section, la section MusicDex en premier exemple. Tests vitest du découpage et du composant.
2. **Sections** (un agent chacune, en parallèle, fichiers disjoints) : registre et suggestions de MusicDex ; de FilmDex et de la Wish list ; de BookDex (boutons de propriétaires, retrait de la rangée de filtres) et de Scores. Chaque agent met aussi à jour l'analyseur de sa section (backend ou frontend) pour `!` et yes/no, avec tests.
3. **Validation** (un agent Fable) : tests, puis l'app en vrai dans le navigateur, section par section, recherche longue, téléphone, Alice/Oriane, et un jugement esthétique ; corrections jusqu'à son accord.
