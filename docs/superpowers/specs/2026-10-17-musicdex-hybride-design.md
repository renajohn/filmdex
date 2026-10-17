# MusicDex hybride : Physical et Digital sur une seule page

Date : 2026-10-17
Statut : conception validée (grill-me + prototypes), à implémenter dans le worktree `musicdex-digital-physical`

## Objectif

Aujourd'hui MusicDex a deux pages : **Physical** (`/musicdex`, les CD de la base) et **Digital**
(`/musicdex/digital`, les albums Navidrome rapprochés à la volée). Elles ne se parlent presque pas : un
album sans CD n'a pas de ligne en base, donc ni paroles, ni Listen Next, ni guide.

Les fusionner en une seule page, calquée sur Physical, où le digital s'affiche ou se cache d'un geste.

Critères de réussite :

- une seule page MusicDex, un interrupteur **Digital** pour montrer ou cacher le digital ;
- une seule fiche d'album, que l'album ait un CD ou non ;
- on voit tout de suite ce qui est physique et ce qui est digital, sans bruit pour le cas normal
  (un CD rippé en FLAC) ;
- Listen Next devient une playlist Navidrome ;
- on peut marquer un album à acheter (wishlist) ;
- les albums digitaux ont leurs paroles ;
- acheter le CD d'un album digital garde ses paroles, son guide, ses écoutes et sa place dans Listen Next.

Prototypes (ouvrir dans un navigateur sur la machine qui a `data/images`) :
`2026-10-17-musicdex-hybride/proto-*.html`.

## 1. Modèle : un album sans CD est une vraie ligne

Chaque album Navidrome sans CD devient une ligne `albums` avec `title_status = 'digital'`. Son id
Navidrome est stocké (nouvelle colonne). Deux axes indépendants :

- **physique** : `owned` (CD en main), `wish` (à acheter), `digital` (ni l'un ni l'autre) ;
- **digital** : présence dans Navidrome, toujours calculée (`ripStatusService.matchesOf`, qualité, écoutes).

Conséquences :

- la wishlist passe une ligne de `digital` à `wish` et inversement, **sans créer ni supprimer** de ligne
  (aujourd'hui elle crée une ligne `wish` et la supprime) ;
- l'achat passe `wish`/`digital` à `owned` **sur la même ligne** : paroles, guide, notes, écoutes,
  Listen Next suivent ;
- `Album.findAll` ne renvoie que `owned`/NULL : statistiques, export, étagères restent des CD.

Création et suivi, à chaque sync Digital : une ligne `digital` par album Navidrome sans CD ni ligne
`wish` correspondante. Quand un album disparaît de Navidrome : la ligne `digital` est supprimée si rien
n'y est attaché (notes, guide, Listen Next), sinon gardée et marquée « plus dans Navidrome ». Une ligne
`wish` n'est jamais supprimée par la sync.

Pistes d'une ligne `digital` : copiées des tags Navidrome (titre, disque, numéro, durée, artiste) à la
création, remises à jour à la sync. « Refresh from MusicBrainz » reste possible quand le rip a un MBID.

## 2. La page

Un seul interrupteur **Digital** dans l'en-tête (à côté de Tri et Groupement), mémorisé dans le
navigateur.

- **Off** : la page Physical d'aujourd'hui, à une exception près (Help me choose, §6). Le ▶ reste.
- **On** (mode hybride) :
  - les albums sans CD entrent dans la grille, triés et groupés comme les CD ;
  - les cartes portent leurs marques (§3) ;
  - les puces de filtre apparaissent (§4) ;
  - l'en-tête gagne la barre de qualité de la bibliothèque, les avis (vieilles copies MP3, éditions
    adoptées, plugin muet) et Refresh.

`/musicdex/digital` redirige vers `/musicdex` avec Digital activé et la puce correspondante
(`?tab=buy` → `?filter=buy`, `album=<navidromeId>` → la fiche de la ligne). `DigitalPage` disparaît.

## 3. Les cartes : seulement les écarts (proto-2, variante E)

Un CD rippé en lossless ne porte **aucune marque** : il est identique dans les deux modes. Les écarts
s'affichent en pastilles rondes dans le coin haut-gauche de la pochette (le haut-droit est au code
d'étagère, le bas à ▶ et Listen Next) :

| Cas | Pastille |
|---|---|
| sans CD, lossless | nuage blanc |
| sans CD, lossy | nuage + format (`MP3 128`) en orange |
| CD rippé en lossy | format en orange |
| CD pas rippé | disque barré gris |
| suggéré à l'achat (écoute, ★, ♥) | chariot doré plein |
| wishlist | ♡ doré cerclé |

Near-lossless compte comme lossless. Orange = « copie à améliorer », doré = « à acheter ». Un `title`
au survol dit chaque pastille en clair.

## 4. Les puces de filtre (Digital on)

**All · 🛒 Buy N · ☁ Digital only · MP3 Lossy · ⦸ Not ripped**, chaque icône dans la couleur de sa
pastille.

- Lossless et Near-lossless ne sont plus des filtres (c'est la norme) ; la répartition reste dans la
  barre de qualité et dans « Group: Quality ».
- « Not ripped » = l'ancien « Physical only ».
- Une puce vide est masquée sauf si elle est active ; une seule puce à la fois ; elle se combine avec
  tri, groupement et recherche ; elle va dans l'URL (`?filter=`).

**Buy** (proto-4, variante J) garde les règles de la page Digital (règle D sur 90 jours, ★, ♥,
wishlist, « Not interested ») mais en grille :

- deux sections, « Suggested from your listening » puis « Wishlist » (« N more in the suggestions
  above ») ; « N not interested ▸ » replié en bas ;
- sous l'artiste, une ligne dorée dit pourquoi (seulement dans ce filtre) ;
- au survol : ▶ à gauche, ♡ et ✕ à droite (à la place de Listen Next) ;
- Ricardo est dans la fiche ; ‹ › y parcourt le filtre.

## 5. La fiche (proto-3, variante I)

La même fiche (`MusicDetailCard`) pour tous les albums.

- Le champ « Navidrome » devient deux lignes de faits :
  - **Physical** : « CD · shelf A-2 · NM · bought 2019 », ou « No CD » ;
  - **Digital** : « FLAC 16/44.1 · 5 tracks · 23 plays in 90 d » ; en orange avec « re-rip from the
    CD » quand c'est du lossy ; « Not ripped » sans copie.
- Encadré doré d'achat **seulement** quand l'album est à acheter : la raison, ♡ Wishlist, Ricardo,
  Not interested.
- Sans CD : pastille ☁ dans l'en-tête à la place du code d'étagère ; pas de Delete (la sync le
  recréerait) ; « I bought the CD » à la place de Edit (§7).
- Mode hybride : chaque piste montre aussi ses étoiles, son ♥ et ses écoutes sur 90 jours (comme le
  dépliage de la page Digital), pour tous les albums, CD compris.

## 6. Listen Next

- Un album sans CD peut entrer dans Listen Next.
- **Help me choose** (proto-5) : Digital on → la carte en pointillés est coupée en deux à
  l'horizontale, « From CDs » / « From anything (CDs + digital) » ; Digital off → carte entière, CD
  seulement, comme aujourd'hui. Les autres règles de Smart Fill ne changent pas.
- **Playlist Navidrome** : une seule, « DexVault · Listen Next », réécrite en entier par DexVault à
  chaque changement de Listen Next (ajout, retrait, Help me choose, shuffle) et à chaque sync. Ordre de
  Listen Next, pistes dans l'ordre. DexVault est la seule source : un réordonnancement fait dans Amperfy
  est écrasé, le commentaire de la playlist le dit. Albums sans rip sautés (disque barré dans le
  bandeau). Subsonic `createPlaylist` / `updatePlaylist`, compte `NAVIDROME_USER`.

## 7. Du digital au CD

Trois chemins, tous vers la même ligne :

1. **« I bought the CD »** dans la fiche d'un album `digital` ou `wish` : la fenêtre « Mark owned » de
   la wishlist (format, prix, état, date, notes) plus une ligne **Edition** : garder celle du rip
   (défaut), ou code-barres / MusicBrainz pour l'édition exacte (pistes rafraîchies depuis MusicBrainz).
2. **Add Album** d'un CD qui correspond à une ligne `digital` ou `wish` (MBID, sinon titre + artiste) :
   « Already in DexVault as digital — attach the CD to it » au lieu d'une nouvelle ligne.
3. **`adoptEditions`** promeut une ligne `digital` comme une ligne `wish`, **seulement si le rip porte
   un Disc ID** : un FLAC acheté en ligne n'est pas un CD. À vérifier : Navidrome (ou la bibliothèque
   que relaie le plugin) expose-t-il le tag Disc ID que pose Picard ?

Paroles à la conversion : `track_lyrics` est rangé par position et revalidé par titre. Même édition →
rien ne bouge ; piste déplacée → recherchée à nouveau sur LRCLIB, même texte.

## 8. Hors de la grille

| Endroit | Comportement |
|---|---|
| Recherche MusicDex | suit l'interrupteur ; mot-clé `cd:no` |
| Analytics, export CSV, étagères, Resize/Fill covers | CD seulement |
| Page Wish List | inchangée (lignes `wish`) |
| Outils MCP `search_albums`, `get_album` | incluent le digital, statut visible |

## Étapes

Chacune utilisable seule et vérifiée dans le navigateur avant la suivante.

1. **Fondations, sans changement visible** : lignes `digital` créées et suivies par la sync, id
   Navidrome stocké, pistes copiées des tags, règle de disparition ; l'interrupteur wishlist actuel
   bascule `digital` ↔ `wish`. Les paroles des albums digitaux arrivent par la tâche des 30 minutes.
2. **La page unifiée** : interrupteur, marques, puces, en-tête digital, Buy en grille, fiche
   Physical/Digital et écoutes par piste, redirection de `/musicdex/digital`, suppression de
   `DigitalPage`.
3. **Listen Next** : Help me choose en deux, playlist Navidrome.
4. **Digital → CD** : « I bought the CD », rattachement dans Add Album, promotion par Disc ID.

## Hors périmètre

- iPhone : pas de survol, donc ♡ et ✕ de Buy passent par la fiche ; ▶ ouvre Amperfy comme aujourd'hui.
- Guides « Before you listen » automatiques pour les albums sans CD.
- Une playlist par personne (attend les comptes par personne).
