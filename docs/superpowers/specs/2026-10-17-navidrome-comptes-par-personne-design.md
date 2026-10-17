# Un compte Navidrome par personne

Date : 2026-10-17
Statut : implémenté le 17.10.2026 par un plugin Navidrome ; installation sur p-cloud à faire

## Objectif

Aujourd'hui, l'utilisateur et sa femme écoutent sous le même nom d'utilisateur Navidrome, exprès : c'est
le seul moyen pour que DexVault compte toutes les écoutes (onglet Buy, Listen Next, statistiques). Le
prix : on ne sait pas qui écoute quoi, les étoiles et les cœurs de l'un écrasent ceux de l'autre, et
Amperfy partage une seule file d'attente.

Passer à un compte par personne, sans que DexVault perde quoi que ce soit de ce qu'il compte.

Critères de réussite :

- chaque personne a son compte Navidrome et son Amperfy configuré dessus ;
- la page Digital (onglet Buy, écoutes des 90 jours) compte les écoutes de tous les comptes, additionnées
  (Listen Next ne lit pas les écoutes de Navidrome) ;
- l'historique déjà relevé par DexVault (`navidrome_plays`, jour par jour) est conservé tel quel ;
- les étoiles de DexVault restent synchronisées avec le compte principal (celui de l'utilisateur) ;
- pour Buy, un album qu'un des comptes note 4-5 étoiles ou marque d'un cœur compte ;
- aucun mot de passe d'un autre compte dans DexVault ; un relevé en panne se voit sur la page Digital.

Hors périmètre : une notation séparée par personne dans DexVault (choix C écarté), une connexion à
DexVault par personne, la lecture de la base SQLite de Navidrome.

## Ce que permet Navidrome

- Les écoutes (`playCount`, `played`), les étoiles (`userRating`) et les cœurs (`starred`) sont rangés
  **par compte**. L'API Subsonic ne donne à un compte que les siens, même administrateur.
- Depuis la 0.58 (p-cloud : 0.64.2), Navidrome charge des **plugins** WebAssembly. Un plugin
  « scrobbler » reçoit chaque écoute de chaque compte qu'on lui assigne, avec le nom du compte ; il
  peut aussi appeler l'API Subsonic de l'intérieur au nom d'un compte, sans son mot de passe.

Première idée (écartée le 17.10.2026) : `NAVIDROME_LISTENERS`, les mots de passe des autres comptes
dans DexVault, relevés un par un chaque heure. Le plugin évite ces mots de passe et donne chaque écoute
avec son heure et son compte.

## Le plugin (`navidrome-plugin/`)

- Écrit en Go (TinyGo), construit par `navidrome-plugin/build.sh` en `dexvault.ndp`.
- Réglages dans Navidrome : l'adresse de DexVault (`http://dexvault:3001`) et un jeton,
  `NAVIDROME_PLUGIN_TOKEN` dans la stack DexVault.
- Chaque écoute : `POST /api/music/navidrome/plugin/listens` `{ user, songId, playedAt }`. Si DexVault
  ne répond pas, le plugin demande à Navidrome de réessayer : Navidrome garde l'écoute dans sa base
  et la renvoie (vérifié de bout en bout).
- Chaque heure, et une minute après le démarrage : pour chaque compte, `search3` et `getAlbumList2`
  au nom du compte, puis `PUT /api/music/navidrome/plugin/favourites/:user` avec les pistes et albums
  notés ou aimés, qui remplacent ce que DexVault avait.

## Écoutes

- `navidrome_listens (navidrome_user, song_id, played_at)` garde chaque écoute, une seule fois même
  renvoyée.
- Les écoutes d'un compte autre que `NAVIDROME_USER` s'ajoutent à `navidrome_plays`, à leur jour.
- Celles de `NAVIDROME_USER` sont seulement gardées : le relevé horaire de ses compteurs les compte
  déjà, comme avant. Rien n'est compté deux fois, et sans plugin DexVault fait comme avant.
- `navidrome_plays` reste une somme, sans dire qui. `navidrome_listens` permettra « qui a écouté ».

## Étoiles et cœurs

- La note de DexVault reste celle du compte principal, synchronisée dans les deux sens comme aujourd'hui
  (`albumRatingService`).
- Pour l'onglet Buy, la règle « 4-5 étoiles ou un cœur » regarde aussi les autres comptes
  (`navidrome_favourites`) ; la copie que le plugin envoie de `NAVIDROME_USER` est ignorée, DexVault
  lisant ses notes à jour.
- L'affichage reste celui du compte principal partout ailleurs.

## Lecteur intégré

- Il annonce ses écoutes (`scrobble`) sous le compte principal.
- « Now playing » dans DexVault reste ce que DexVault joue lui-même.
- Plus tard, l'affichage de ce qui joue ailleurs pourra dire **qui** (« <prénom> écoute *Blue* sur son
  iPhone ») grâce au nom d'utilisateur que renvoie `getNowPlaying`. Ce n'est possible qu'avec un compte
  par personne.

## Migration, côté utilisateur

1. Construire le plugin, ajouter `NAVIDROME_PLUGIN_TOKEN` à la stack DexVault, déposer `dexvault.ndp`
   dans `/data/plugins` de Navidrome, l'activer pour tous les comptes (voir `navidrome-plugin/README.md`).
2. Créer le compte de sa femme dans Navidrome (Settings > Users), non administrateur.
3. Configurer Amperfy sur son iPhone avec ce compte. Ses écoutes à venir y seront comptées.
4. Vérifier que la page Digital dit « plays and likes of … counted too ».

L'historique d'écoute de l'ancien compte partagé reste sur le compte principal dans Navidrome ; DexVault,
lui, a déjà tout gardé jour par jour.

## Erreurs

- DexVault arrêté ou jeton faux : Navidrome garde les écoutes et réessaie ; rien ne se perd.
- Le plugin muet depuis plus de trois heures (désactivé, mauvaise adresse) : la page Digital le dit.
- Le compte principal en erreur bloque comme aujourd'hui tout ce qui écrit dans Navidrome.

## Tests

- une écoute d'un autre compte compte à son jour, une seule fois même renvoyée ;
- une écoute de `NAVIDROME_USER` est gardée sans être comptée ;
- Buy : un cœur posé par un autre compte suffit, et le retirer sort l'album de Buy ;
- sans jeton ou avec un faux : refusé ;
- plugin muet depuis trois heures : signalé ;
- de bout en bout, avec un Navidrome 0.64.2 local : écoutes, notes, et écoute renvoyée après un arrêt
  de DexVault.
