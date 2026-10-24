---
name: ricardo-wishlist
description: Cherche les CD de la wish list DexVault sur ricardo.ch et classe les vendeurs par nombre d'albums disponibles chez eux, pour acheter un vendeur à la fois. À utiliser quand l'utilisateur demande de chercher sa wish list (CD, albums) sur Ricardo.
---

# Wish list CD sur Ricardo

But : trouver **un vendeur à la fois** chez qui acheter plusieurs CD de la wish
list en un seul envoi. L'utilisateur n'achète pas tout d'un coup : il prend le
meilleur vendeur, marque les CD comme possédés dans DexVault, et la recherche
suivante ne les cherche plus.

## Pourquoi par le navigateur

Ricardo est derrière Cloudflare : une requête serveur (curl, backend) reçoit
« Ricardo Captcha ». Un onglet Chrome qui a passé le challenge peut en revanche
faire des `fetch()` de **pages de recherche** sur la même origine et obtenir les
vraies données (payload React Server Components : `sellerId`, prix, frais de
port, date de fin, `productTypeKey`).

Les **pages d'annonce**, elles, répondent 429 + captcha à `fetch()`. Le pseudo
du vendeur n'est donc pas disponible : on regroupe par `sellerId`, et
l'utilisateur voit le pseudo en ouvrant une annonce.

## Étapes

1. **Wish list** : `mcp__dexvault__list_wishlist` avec `type: "album"`,
   `limit: 100`, `format_output: "json"`. Garder `id`, `creator` (→ `artist`)
   et `title`.
2. **Onglet** : charger les outils Chrome, puis naviguer vers une recherche
   Ricardo quelconque (`https://www.ricardo.ch/fr/s/cd/`) pour avoir un onglet
   sur l'origine.
3. **Lancer la recherche** : injecter `search.js` (dans ce dossier) avec
   `javascript_tool`, après avoir remplacé `__WISHLIST__` par le tableau JSON
   `[{id, artist, title}]`. Envelopper ainsi pour garder le résultat dans la
   page :
   ```js
   window.__ricardo = JSON.parse(await <contenu de search.js>);
   ```
   Il faut ~1,5 s par album : au-delà d'une trentaine d'albums, l'appel dépasse
   le délai de 45 s de l'outil et renvoie une erreur de timeout. **Ce n'est pas
   un échec** : le script continue dans la page. Ne pas le relancer ; relire
   `window.__ricardo` un peu plus tard avec un appel court (sans attente
   interne, qui ferait elle aussi expirer l'appel).
4. **Lire le résultat** : `window.__ricardo.sellers` est trié par nombre
   d'albums distincts, puis par coût total. Pour chaque vendeur :
   - `albums` : albums de la wish list trouvés en correspondance exacte ;
   - `total` : l'annonce la moins chère par album, **port compris pour chaque
     CD** ; `perAlbum` : ce total divisé par le nombre d'albums ;
   - `lots` : lots dont le titre nomme l'artiste mais pas l'album — à vérifier
     à la main ;
   - `items[]` : `album`, `title`, `price`, `buyNow`, `auction`, `bids`,
     `shipping`, `endDate`, `url`.
5. **Conditions du meilleur vendeur** : *naviguer* (pas `fetch`) vers une de
   ses annonces et lire le texte avec `get_page_text`. La navigation passe là où
   `fetch` reçoit un captcha. Le vendeur y écrit souvent ses conditions de port :
   « pas de commandes groupées », ou au contraire un barème dégressif (vu le
   04.10.2026 : « 1 CD : 2.-, 2 CD : 4.-, … dès 5 CD forfait 9.- »). Recalculer
   son total avec ce barème.
6. **Rapport** : présenter **le meilleur vendeur en premier**, avec ses albums
   et liens, puis deux ou trois suivants en bref. Laisser l'onglet ouvert si
   l'utilisateur veut voir l'annonce, sinon le fermer.

## Pièges

- **Port par CD** : beaucoup de vendeurs écrivent « pas de commandes
  groupées » dans l'annonce, et chaque CD est alors envoyé et facturé à part.
  Les données de recherche ne le disent pas, d'où le port compté par CD. Le
  rapport présente le regroupement comme une économie possible, à demander au
  vendeur, jamais comme acquis.
- **Prix d'enchère** : `bidPrice` est le prix de départ tant qu'il n'y a pas
  d'offre, puis l'**offre minimale suivante** (offre en tête + 1 CHF) dès qu'il
  y en a une. Un prix supérieur au maximum de l'utilisateur ne veut donc pas
  dire qu'il a été dépassé : la page des enchères fait foi.
- **Pépites d'un vendeur** : son nom et sa boutique sont sur une de ses
  annonces (lien « N offres en cours » → `/fr/shop/<pseudo>/offers/`). La
  boutique se pagine avec `?page=N`, 60 annonces par page, et `fetch()` y passe.
  Pour un gros vendeur (≈ 4000 annonces), lancer la boucle sans `await` en
  stockant dans `window`, puis relire. Croiser ensuite avec les artistes
  possédés (`GET https://dexvault.lab.crog.org/api/music/albums/status/owned`)
  et la wish list, en écartant les albums possédés, les compilations, les lives
  et les maxis.
- **Port à 0** : peut signifier « retrait sur place uniquement ». Le signaler
  plutôt que de le présenter comme gratuit.
- **Correspondance** : tous les mots significatifs de l'artiste et du titre
  doivent figurer dans le titre de l'annonce. Les vinyles sont exclus par
  `productTypeKey`. Les résultats « suggérés » de Ricardo (requête élargie quand
  rien ne correspond) sont ignorés.
- **Albums éponymes** (« Dire Straits » de Dire Straits, « Gorillaz ») : le titre
  est déjà dans l'artiste, donc toute annonce de l'artiste « correspond ».
  Vérifier à la main que l'annonce ne nomme pas un autre album.
- **Enchères en cours** : `https://www.ricardo.ch/fr/my-ricardo/buying/offers/`
  liste les enchères de l'utilisateur (titre, n° d'article, statut). Utile pour
  savoir chez quel vendeur il achète déjà.
- **Doublons** : un vendeur peut avoir deux annonces du même album ; le total
  ne compte que la moins chère.
