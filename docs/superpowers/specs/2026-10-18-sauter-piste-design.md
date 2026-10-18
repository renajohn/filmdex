# Sauter à une piste depuis le lecteur — conception

Validée le 18.10.2026. Prototype : `2026-10-18-sauter-piste/proto-sauter-piste.html` (variante A « Détour » retenue).

## Le bouton et la fenêtre

- Dans la barre du lecteur, **le nom du morceau** ouvre la fenêtre des pistes, **la pochette** la fiche de l'album, comme avant. Un bouton liste de pistes, entre les paroles et ⏮, l'ouvre aussi ; il est doré quand la fenêtre est ouverte.
- Ouverte par-dessus la fiche d'un album, la fenêtre la laisse en place : un saut ne ferme que la fenêtre des pistes.
- La fenêtre : à gauche la grande pochette de l'album où en est la liste (elle suit le défilement), à droite les pistes, groupées par album sous un en-tête collé en haut. La piste en cours est dorée, avec les barres ; la fenêtre s'ouvre placée sur elle.
- Un clic sur une piste y saute et **ferme la fenêtre**. ↑ ↓ passent de piste en piste, Entrée lance, Échap ferme.
- Un album joué seul (fiche, grille) : la même fenêtre avec ses seules pistes. Le saut garde la suite de l'album, puis le lecteur s'arrête, comme aujourd'hui.

## Listen Next

- La fenêtre montre les CD de la séance sortis de la liste, en tête, puis la liste telle qu'elle est.
- **Séance :** du ▶ Listen Next au ▶ suivant. Elle est gardée dans le navigateur (`dexvault.listenNext.session`) et survit au rechargement.
- **CD sortis montrés :** ceux dont au moins une piste a été comptée comme écoutée pendant la séance (la moitié passée, ou 4 minutes : la règle du scrobble). Un CD retiré à la main sans rien écouter est ignoré. Pochette grise, étiquette **Played** quand son départ est dû à l'écoute (un départ noté par le serveur depuis le début de la séance), **Taken out** sinon.
- **Sauter dans un CD de la liste :** il joue depuis la piste choisie. Le CD quitté reste dans la liste et revient dans le tour.
- **Détour dans un CD sorti :** il joue depuis la piste choisie jusqu'à sa fin, sans revenir dans la liste. Puis Listen Next reprend où il avait été quitté : le même CD, au début de la piste quittée. Un détour pris pendant un détour garde le point de retour du premier.
