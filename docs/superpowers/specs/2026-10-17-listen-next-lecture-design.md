# Lire Listen Next — conception

Validée le 17.10.2026 (session grill-me). Prototype : `2026-10-17-listen-next-lecture/listen-next-leaving.html` (variante C1 retenue).

## But

Un ▶ dans l'en-tête du bandeau Listen Next de MusicDex lance la lecture des albums de la liste : sur le Mac dans le lecteur intégré de DexVault, sur l'iPhone dans Amperfy (playlist « DexVault · Listen Next »). Un album écouté jusqu'au bout quitte la liste, sauf si Repeat est activé. Cela vaut aussi pour une écoute dans Amperfy, de façon asynchrone.

## En-tête du bandeau (musique seulement ; Watch Next inchangé)

- « 4 albums » est remplacé par un **bouton rond ▶**, dans la norme des boutons ronds de `index.css`. Il affiche ❚❚ quand c'est Listen Next qui joue sur le Mac, et redevient ▶ sur Pause. Si le lecteur joue un album lancé ailleurs, ▶ lance Listen Next à la place.
- Le tooltip du ▶ porte le nombre d'albums : « Play Listen Next · 4 albums ».
- **Petite icône ⟳ (Repeat)** à côté du ▶, grise quand elle est désactivée, dorée quand elle est activée. Tooltips : « Repeat: keep albums once played » et « Albums leave the list once played ».
- ▶ est grisé quand aucun album de la liste n'est rippé (« Nothing ripped yet »).
- Sur iPhone (`isAppleMobile()`), ▶ ouvre `amperfy://x-callback-url/playID?id=<playlistId>&libraryElementType=playlist`. Il n'y a pas de ❚❚ sur l'iPhone. Avec Repeat activé, le lien ajoute `&repeatOption=1`.

## Ligne de résumé

Sous le carrousel, alignée à droite, en petit et dans la couleur atténuée du thème : `5 CDs · 63 tracks · ~4 h 10`.

- On compte les **disques** (un coffret de 3 CD compte pour 3) ; un album digital compte comme un « album ».
- La durée est la somme des `tracks.duration_sec`, précédée de « ~ » quand des durées manquent.
- Pendant que Listen Next joue sur le Mac, la durée devient le **temps restant** (« ~2 h 35 left »).
- Un album en sursis n'est plus compté.

## Réglage Repeat

- Il est enregistré **côté serveur** : le retrait déclenché par une écoute sur l'iPhone se décide sans page ouverte. Un seul réglage vaut partout.
- **Désactivé (par défaut) :** un album écouté jusqu'au bout est retiré. Sur le Mac, la lecture s'arrête quand plus rien ne reste à jouer (voir l'enchaînement).
- **Activé :** rien n'est retiré, et le lecteur du Mac boucle sur la liste. Sur l'iPhone, le lien Amperfy passe `repeatOption=1` (vérifié dans le code d'Amperfy, `IntentManager.swift`) : Amperfy boucle aussi.

## Enchaînement sur le Mac (lecteur intégré)

- La lecture **suit la liste en direct**. À la fin d'un album, l'album suivant est **celui qui vient après l'album en cours dans la liste telle qu'elle est maintenant ; après le dernier, on repart du premier**.
- Conséquences de cette règle :
  - un album ajouté pendant l'écoute est joué ;
  - un album retiré ou remplacé avec 🔀 ne l'est pas ;
  - l'ordre de la liste est respecté ;
  - un album inséré avant celui qui joue passe en fin de tour.
- Un album retiré à la main pendant qu'il joue termine sa piste, puis on passe au suivant.
- Les albums sans rip sont sautés en silence, comme dans la playlist.
- ⏭ sur la dernière piste passe à l'album suivant. **Sauter un album ne le retire pas.**
- **Arrêt en mode retrait :** quand la liste est vide, ou quand le tour revient à un album déjà sauté pendant cette écoute (un album sauté revient une fois, pas en boucle).
- Le ▶ d'une pochette **dans le bandeau** lance Listen Next à partir de cet album, dans le même mode. Ailleurs (fiche, grille), ▶ joue l'album seul, comme aujourd'hui.

## Retrait d'un album écouté

- **Déclencheur :** le scrobble de la **dernière piste** (dernier disque, dernière piste) de la copie Navidrome d'un album de Listen Next, par `NAVIDROME_USER` seulement. Les autres comptes, comme celui de la femme de l'utilisateur, sont ignorés.
- Cela vaut d'où que vienne l'écoute : Listen Next, fiche, Amperfy hors de la playlist.
- **Chemins :**
  - **Mac :** le lecteur scrobble via `/api/music/navidrome/scrobble/:songId`. Le serveur vérifie le retrait et répond « album X retiré », et la carte réagit aussitôt.
  - **iPhone :** le plugin relaie le scrobble à `navidromePluginController.event`, qui fait la même vérification. Le relais du scrobble du Mac est alors sans effet, puisque l'album est déjà parti.
- **Côté serveur :** l'album sort tout de suite de Listen Next. Le départ est noté (album, position d'origine, heure), et la playlist Navidrome est réécrite.
- **Rafraîchissement de la page :** relecture de Listen Next au retour de visibilité ou au focus, et toutes les 60 s tant que la page est visible. Il n'y a pas de SSE.

## Sursis « Keep here » (10 s, variante C1)

- Le sursis n'existe **qu'à l'écran**. La carte reste en place :
  - la pochette passe en noir et blanc assombri ;
  - une étiquette « ✓ Played » apparaît en haut à gauche ;
  - au centre, un bouton rond ↺ porte un anneau doré qui **se vide dans le sens horaire**, sur un anneau de fond pâle, avec « Keep here » dessous.
- Pendant le sursis, ✕, 🔀, ▶ et le code d'étagère s'effacent.
- **Keep here** remet l'album à sa position d'origine, et la playlist est réécrite.
- **À 0**, la carte pâlit et rétrécit (~350 ms), puis sa place se referme (~250 ms). Il n'y a pas d'animation avec « réduire les animations ».
- Un départ survenu pendant que la page était fermée est montré **une fois par navigateur**, avec le même sursis, à la prochaine ouverture, s'il date de moins de 24 h. Au-delà, l'album a simplement disparu.

## Plus tard

- « Music without limits » : quand la liste se vide, ajouter automatiquement un album (en s'appuyant sur Help me choose).
