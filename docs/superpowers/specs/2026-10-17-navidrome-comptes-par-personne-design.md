# Un compte Navidrome par personne

Date : 2026-10-17
Statut : conception validée, à implémenter après la première vague du lecteur intégré

## Objectif

Aujourd'hui, l'utilisateur et sa femme écoutent sous le même nom d'utilisateur Navidrome, exprès : c'est
le seul moyen pour que DexVault compte toutes les écoutes (onglet Buy, Listen Next, statistiques). Le
prix : on ne sait pas qui écoute quoi, les étoiles et les cœurs de l'un écrasent ceux de l'autre, et
Amperfy partage une seule file d'attente.

Passer à un compte par personne, sans que DexVault perde quoi que ce soit de ce qu'il compte.

Critères de réussite :

- chaque personne a son compte Navidrome et son Amperfy configuré dessus ;
- l'onglet Buy, Listen Next et les statistiques comptent les écoutes de tous les comptes, additionnées ;
- l'historique déjà relevé par DexVault (`navidrome_plays`, jour par jour) est conservé tel quel ;
- les étoiles de DexVault restent synchronisées avec le compte principal (celui de l'utilisateur) ;
- pour Buy, un album qu'un des comptes note 4-5 étoiles ou marque d'un cœur compte ;
- un compte dont le mot de passe est faux n'empêche pas de relever les autres, et l'erreur se voit.

Hors périmètre : une notation séparée par personne dans DexVault (choix C écarté), une connexion à
DexVault par personne, la lecture de la base SQLite de Navidrome.

## Ce que permet Navidrome

- Les écoutes (`playCount`, `played`), les étoiles (`userRating`) et les cœurs (`starred`) sont rangés
  **par compte**. L'API Subsonic ne donne à un compte que les siens, même administrateur.
- `getNowPlaying` liste ce que **tous** les comptes jouent, avec le nom d'utilisateur et l'appareil.

DexVault doit donc s'identifier auprès de Navidrome avec chaque compte, l'un après l'autre. Lire la base
de Navidrome directement donnerait tout d'un coup, mais une mise à jour de Navidrome peut en changer la
structure sans prévenir : écarté.

## Configuration

Les identifiants restent des variables de la stack Portainer (voir la mémoire « Secrets dans
Portainer »), jamais dans le dépôt.

- `NAVIDROME_USER` / `NAVIDROME_PASSWORD` : le compte principal, inchangés. Il sert à tout ce qui écrit
  (étoiles de DexVault, écoutes du lecteur intégré) et à tout ce qui ne dépend pas du compte (albums,
  pistes, pochettes, chemins, stream).
- `NAVIDROME_LISTENERS` : les comptes **en plus** dont on relève les écoutes et les notes, sous la forme
  `nom:motdepasse,nom2:motdepasse2`. Vide ou absent : DexVault se comporte exactement comme aujourd'hui.

## Écoutes

Aujourd'hui, `navidrome_play_counts` garde, par chanson, le compteur Navidrome noté au dernier passage,
et chaque heure le gain s'ajoute à `navidrome_plays` (jour par jour).

Changements :

- `navidrome_play_counts` prend une colonne `navidrome_user`, et sa clé devient
  `(navidrome_user, song_id)`. Les lignes existantes reçoivent le nom du compte principal : rien ne
  repart de zéro, et aucune écoute ancienne n'est recomptée.
- Le relevé horaire passe sur chaque compte, l'un après l'autre : le gain de chaque compte s'ajoute à la
  même `navidrome_plays`. Les écoutes simultanées sur deux appareils comptent deux fois, comme voulu.
- Un nouveau compte rencontré la première fois est **amorcé** : ses compteurs sont notés sans rien
  ajouter à `navidrome_plays` (sinon tout son passé tomberait sur le jour du premier relevé). Ses
  écoutes comptent à partir de là.
- `navidrome_plays` ne change pas : elle reste une somme, sans dire qui. Si un jour on veut « qui a
  écouté », on ajoutera la colonne à ce moment.

## Étoiles et cœurs

- La note de DexVault reste celle du compte principal, synchronisée dans les deux sens comme aujourd'hui
  (`albumRatingService`).
- Pour l'onglet Buy, la règle « 4-5 étoiles ou un cœur » regarde **tous** les comptes : on prend, pour
  chaque chanson, la meilleure note et le cœur de n'importe quel compte.
- L'affichage reste celui du compte principal partout ailleurs.

## Lecteur intégré

- Il annonce ses écoutes (`scrobble`) sous le compte principal.
- « Now playing » dans DexVault reste ce que DexVault joue lui-même.
- Plus tard, l'affichage de ce qui joue ailleurs pourra dire **qui** (« <prénom> écoute *Blue* sur son
  iPhone ») grâce au nom d'utilisateur que renvoie `getNowPlaying`. Ce n'est possible qu'avec un compte
  par personne.

## Migration, côté utilisateur

1. Créer le compte de sa femme dans Navidrome (Settings > Users), non administrateur.
2. Configurer Amperfy sur son iPhone avec ce compte. Ses écoutes à venir y seront comptées.
3. Ajouter `NAVIDROME_LISTENERS` dans la stack Portainer, puis redéployer.
4. Vérifier sur la page Digital que les écoutes du jour des deux comptes apparaissent.

L'historique d'écoute de l'ancien compte partagé reste sur le compte principal dans Navidrome ; DexVault,
lui, a déjà tout gardé jour par jour.

## Erreurs

- Un compte qui refuse l'identification est sauté pour ce relevé ; les autres continuent. L'erreur
  apparaît sur la page Digital, avec le nom du compte, comme les autres erreurs Navidrome.
- Le compte principal en erreur bloque comme aujourd'hui tout ce qui écrit dans Navidrome.

## Tests

- relevé à deux comptes : les gains s'additionnent dans `navidrome_plays` ;
- compte nouveau : amorcé sans gain, puis compté au relevé suivant ;
- migration : les lignes existantes passent au compte principal, sans gain ;
- Buy : un cœur posé par le second compte suffit ;
- un compte au mot de passe faux n'empêche pas de relever l'autre.
