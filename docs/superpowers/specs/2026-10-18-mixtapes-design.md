# Mixtapes

Validé le 18.10.2026 (grill-me). Prototype : `2026-10-18-mixtapes/proto-mixtapes.html` (servi avec
`python3 -m http.server` depuis ce dossier ; pistes et pochettes tirées de « DexVault · Listen Next »).

Une mixtape est une sélection de pistes faite à la main, à travers plusieurs CD, comme une cassette
d'autrefois. Elle se joue, se met dans Listen Next et se compose depuis DexVault.

## Source et cache

- Les mixtapes sont **les playlists Navidrome de `NAVIDROME_USER`**, sauf « DexVault · Listen Next »
  (une sortie de DexVault) et les smart playlists (`.nsp`, leur contenu change seul). Les playlists
  des autres comptes sont ignorées.
- **Navidrome fait foi.** DexVault garde un cache et écrit toute modification directement dans
  Navidrome, puis relit la mixtape.
- Le cache recopie chaque mixtape comme **un album DexVault** (`title_status = 'playlist'`, la
  playlist reconnue par son identifiant Navidrome) avec ses pistes dans l'ordre de la playlist,
  chacune rattachée à son album d'origine (CD ou album numérique). Elle hérite ainsi de Listen Next
  (`album_collections`), du lecteur, de la fenêtre des pistes, du détour et de la playlist Amperfy.
- Elle est **exclue** de tout ce qui compte des disques : statistiques, rangement, wishlist,
  MusicBrainz, rips, Digital/Buy, histoires, guides.
- **Relecture** : un appel `getPlaylists` (avec la date `changed` de chaque playlist) à l'ouverture
  de MusicDex, à l'ouverture de la fiche d'une mixtape, et toutes les 30 min ; seules les mixtapes
  nouvelles, changées ou supprimées sont relues (`getPlaylist`). Après une modification faite depuis
  DexVault, la mixtape est relue aussitôt. Les plugins de Navidrome 0.64 n'ont aucun événement de
  playlist (vérifié) : s'il en vient un, il remplacera l'appel.
- **Changé dans Navidrome** : supprimée, elle disparaît de DexVault et de Listen Next (pas de départ,
  rien dans Keep here) ; vidée, elle reste (« 0 tracks ») et Listen Next la saute comme un CD non
  rippé ; renommée, elle suit.

## Dans MusicDex

- Rangées **parmi les CD** selon le tri en cours. Pochette : **la mosaïque de Navidrome** (une seule
  pochette quand la mixtape a moins de quatre albums, cas de bord accepté). `CoverTag` « Mixtape »
  avec l'icône `BsCassetteFill`. Deuxième ligne : les artistes ayant le plus de pistes,
  « Miles Davis, Bach & 6 more ».
- Un troisième interrupteur **Mixtapes** après Digital (gardé dans le navigateur) ; éteint, les
  mixtapes ne sont plus montrées. Les mots `mixtape:yes` (les mixtapes seules) et `mixtape:no` (les
  albums seuls) filtrent la recherche.
- **Recherche** : le nom de la mixtape et son contenu (titres et artistes de ses pistes). Les mots qui
  décrivent un disque (`cd:`, `ripped:`, `shelf:`, étoiles…) écartent les mixtapes.

## La fiche d'une mixtape

`Dialog` des albums, sobre :
- tête : icône cassette, le nom modifiable sur place (✓ ✕), ⋯ (Rename, Open in Navidrome, Delete
  mixtape… en rouge avec `confirm`, qui la supprime de Navidrome et la sort de Listen Next), ✕ ;
- à gauche : la mosaïque, les artistes, « 14 tracks · 58 min », **Play** (or) et **Listen Next** ;
- à droite : les pistes **sans numéros**, chacune avec la vignette de son CD (un clic ouvre la fiche
  du CD par-dessus), titre, « artiste · album », durée ; un clic sur le titre joue la mixtape depuis
  là ; une poignée pour glisser à une autre place ; ✕ au survol pour retirer cette copie (Undo dans le
  toast) ; une piste présente deux fois porte « · twice » ;
- pas d'étoiles, de note, de paroles ni d'histoire : elles restent aux CD.

## Composer

- Dans la fiche d'un CD, au bout de chaque piste, un bouton cassette (au survol ; doré et toujours
  visible quand la piste est dans une mixtape, son infobulle les nomme) ; sous la pochette, un bouton
  **Mixtapes** pour tout le CD. Les deux ouvrent un `Menu` **en bascule** :
  - ✓ doré : tout est dedans, un clic retire (toutes les copies) ;
  - tiret « 4 of 17 » : une partie y est, un clic ajoute les manquantes à la fin ;
  - rien : un clic ajoute à la fin ;
  - puis **New mixtape…** : un nom, et la mixtape est créée avec la piste ou le CD.
  - Les mixtapes y sont triées de la plus récemment modifiée à la plus ancienne.
  - Chaque geste a son **Undo** dans le toast.
- **Doublons** : DexVault n'en crée jamais. Ajouter un CD dont une piste y est déjà n'ajoute que les
  autres ; celle qui y était reste à sa place. Ceux faits dans Amperfy sont respectés et montrés.
- Une mixtape créée depuis DexVault est privée dans Navidrome, comme dans Amperfy.

## Dans Listen Next et le lecteur

- Une mixtape se met dans Listen Next comme un CD et s'y joue comme un CD ; la playlist Amperfy
  l'aplatit à sa place.
- Elle **sort** au scrobble de sa dernière piste par `NAVIDROME_USER` (d'où que vienne l'écoute), ou
  sur ⏭ à sa dernière piste dans DexVault, sauf avec Repeat. Si cette piste est aussi la dernière d'un
  CD de la liste, un scrobble ne fait sortir que le premier des deux dans la liste (accepté).
- Keep here, la fenêtre des pistes et le détour la traitent comme un CD.
- **La barre du lecteur** montre la pochette du CD de la piste en cours et « artiste · nom de la
  mixtape » ; un clic sur la pochette ouvre la fiche de ce CD, un clic sur le nom la fenêtre des
  pistes.
- Hors de Listen Next, Play dans sa fiche la joue d'un bout à l'autre.

## Mis de côté

- Sauter des pistes d'un CD dans Listen Next (« Skips 4 tracks ») : idée remise à plus tard.
- Pochettes dessinées par DexVault (étiquette, cassette) : jugées de trop.
