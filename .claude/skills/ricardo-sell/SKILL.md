---
name: ricardo-sell
description: Prépare une annonce ricardo.ch pour vendre un CD, un DVD ou un Blu-ray (dans DexVault ou non, à partir d'une photo ou d'un code-barres), la fait valider par l'utilisateur, puis remplit le formulaire de vente dans Chrome. À utiliser quand l'utilisateur veut vendre un disque ou un film sur Ricardo.
---

# Vendre un CD ou un film sur Ricardo

Ricardo n'a pas d'API ouverte aux particuliers : l'annonce se remplit dans
l'onglet Chrome de l'utilisateur, déjà connecté (compte « Padox »).
**Le clic final sur PUBLIER revient à l'utilisateur** : le mode auto de
Claude Code le refuse (transaction réelle). Tout remplir, montrer le
récapitulatif, puis lui dire de cliquer.

## Étapes

1. **Identifier l'objet**
   - Dans DexVault : `mcp__dexvault__search_movies` / `search_albums`, puis
     `get_movie` / `get_album` pour l'édition, le code-barres, les pistes.
   - Hors DexVault : lire les photos (face et dos). Le dos donne l'éditeur,
     l'EAN, les langues audio et sous-titres, la zone, la durée, les bonus.
2. **Comparer les prix** : naviguer vers `https://www.ricardo.ch/fr/s/<titre>/`
   et lire les annonces en cours. Le formulaire de vente affiche ensuite
   « Articles similaires vendus » avec l'état : c'est la meilleure référence
   (vu le 11.10.2026 : Arrietty Blu-ray neuf vendu 17.80 et 19.60).
3. **Rédiger et faire valider** : titre, état, description, prix, envoi. Demander
   **l'état réel** à l'utilisateur (blister intact ? rayures ? livret ?) — ne
   jamais le déduire d'une photo seule. Attendre son accord avant de remplir.
4. **Remplir le formulaire** (`https://www.ricardo.ch/fr/list/` ; on y arrive
   par le bouton « Mettre en vente », la navigation directe vers `/fr/sell/`
   donne une page d'erreur) :
   - **Photos** : `find` « file input for photos », puis `file_upload` avec les
     chemins des photos partagées. La première devient la photo principale.
   - **Titre** : 60 caractères au plus.
   - **Type de produit** : après le titre, Ricardo propose des types. Pour un
     film : « DVD » (il n'existe pas de type Blu-ray ni Film), puis dans
     « Détails pour : DVD » le format **Blu-Ray** / DVD, code pays (EU), type
     de média (Films), âge, genre. Pour un CD, chercher le type « CD ».
   - **État** : D'occasion · Neuf avec emballage d'origine (sous blister) ·
     Neuf (voir description) · Défectueux.
   - **Description** : éditeur riche (contenteditable). Cliquer **aux
     coordonnées** de la zone visible avant de taper : un clic par `ref` puis
     `type` n'y écrit rien quand la page vient de se réorganiser. Une ligne
     « - … » devient une puce. Vérifier avec
     `document.querySelector('[contenteditable=true]').innerText`.
   - **Offre et prix** : Enchère (prix de départ, incrément 1.-) et/ou Achat
     direct. Ricardo réduit les frais de 10 % si l'enchère démarre à 1.-.
   - **Durée** : 7 jours par défaut, remise en vente automatique jusqu'à 9 fois
     cochée par défaut — le signaler dans le récapitulatif.
   - **Livraison** : « Envoi » propose un colis à 9.- par défaut. « Modifier »
     → **Lettre** → **B4** (un boîtier fait 17 cm : B5 est trop juste en
     enveloppe rembourrée), jusqu'à 2 cm, **jusqu'à 500 g**, courrier B ; les
     choix de poids changent selon le format, relire l'écran après chaque clic.
     Frais saisis à la main (3.- pour couvrir l'enveloppe). « Retrait » est
     activé par défaut avec l'adresse du compte : le couper si l'utilisateur
     ne veut que l'envoi.
   - Laisser Boost et Ricardo Plus décochés sauf demande.
5. **Récapitulatif** : contrôler les cases cochées
   (`input[type=checkbox]` avec leur libellé, et
   `[aria-pressed=true],[aria-checked=true]` pour les choix), puis présenter un
   tableau à l'utilisateur et lui demander de cliquer **PUBLIER**. Laisser
   l'onglet ouvert.
6. **Après la vente** (si l'objet est dans DexVault) : proposer de le retirer
   de la collection — suppression, donc permission explicite.

## Texte type d'un film

> Blu-ray neuf, jamais ouvert, sous blister d'origine.
>
> *Titre* (studio, année), réalisé par …, d'après …
>
> - Édition …, EAN …
> - Audio : …
> - Sous-titres : …
> - Pas de version allemande ni anglaise (quand c'est le cas : beaucoup
>   d'acheteurs sont germanophones)
> - Zone B (lit sur les lecteurs suisses et européens)
> - Durée, format, âge, bonus
>
> Envoi soigné en enveloppe rembourrée par courrier B.
