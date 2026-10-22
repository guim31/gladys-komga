# Komga

Intégrez votre serveur [Komga](https://komga.org) (BD, comics, mangas,
livres, auto-hébergé) à Gladys : les chiffres de vos bibliothèques, vos séries
en cours et les tomes lus aujourd'hui, les derniers ajouts avec leurs
couvertures sur le tableau de bord, et des scènes qui réagissent à l'arrivée
d'une nouvelle série ou d'un nouveau tome, ou quand vous terminez une série.

L'intégration a été testée avec un vrai serveur Komga 1.29.1 (l'image Docker
officielle), pas encore dans une vraie installation de Gladys : vos retours
sont les bienvenus sur le [forum Gladys](https://community.gladysassistant.com)
ou dans les [issues](https://github.com/guim31/gladys-komga/issues).

## Ce qu'il vous faut

- Gladys Assistant 5.1.0 ou plus récent.
- Un serveur **Komga** joignable depuis Gladys : sur votre réseau, ou sur
  Internet derrière un reverse proxy. Testé avec Komga 1.29.
- Une **clé d'API** de votre compte Komga (Komga 1.12 et suivants) : dans
  Komga, **Paramètres du compte** → **Clés d'API**, créez une clé et
  copiez-la. Sur un Komga plus ancien, l'e-mail et le mot de passe du compte
  font l'affaire. L'intégration voit ce que voit ce compte : ses
  bibliothèques, sa progression de lecture.
- Un compte **administrateur** donne en plus la version de Komga et permet les
  scans de bibliothèques ; un compte lecteur suffit pour tout le reste.

## Mise en place

1. Installez l'intégration depuis le catalogue de Gladys.
2. Dans **Configuration**, saisissez l'**URL du serveur** avec son port (par
   exemple `http://192.168.1.20:25600` ; derrière un reverse proxy,
   `https://example.org/komga`) et la **clé d'API** (ou, sur un Komga plus
   ancien, l'**E-mail** et le **Mot de passe** du compte).
3. Si vous le souhaitez, choisissez la fréquence de lecture du serveur (toutes
   les 5 minutes par défaut) et la langue des noms.
4. Enregistrez, puis cliquez sur **Tester la connexion** : elle affiche la
   version, le compte (administrateur ou lecteur) et les chiffres trouvés.
5. Dans l'onglet **Découverte**, ajoutez l'appareil **Komga**.

## Appareil

**Komga** (un appareil pour le serveur, vu depuis votre compte) :

| Fonctionnalité            | Signification                                          |
| ------------------------- | ------------------------------------------------------ |
| **En ligne**              | 1 tant que l'intégration lit le serveur                |
| **Bibliothèques**         | bibliothèques visibles par votre compte                |
| **Séries**                | séries de ces bibliothèques                            |
| **Tomes**                 | tomes (volumes, numéros) de ces bibliothèques          |
| **Séries en cours**       | séries commencées et pas terminées                     |
| **Tomes lus aujourd'hui** | tomes terminés aujourd'hui (parmi les 20 derniers lus) |
| **Version**               | version de Komga (compte administrateur seulement)     |

## Tableau de bord

- **Komga : derniers ajouts** : une grille des dernières séries ajoutées,
  avec leurs couvertures, la date, la bibliothèque et le nombre de tomes, le
  nombre de séries et de tomes et (compte administrateur) un bouton
  **Lancer un scan**, le même que l'action de scène ci-dessous.
- **Komga : lectures en cours** : vos tomes en cours avec leurs couvertures,
  la page atteinte et la progression, le nombre de séries en cours et les
  tomes lus aujourd'hui.

## Scènes

### Déclencheurs

- **Nouvelle série ajoutée** : une nouvelle série (BD, manga, livre) apparaît
  dans une bibliothèque après un scan. Filtre : la bibliothèque, exactement
  comme dans Komga. Informations : titre de la série, bibliothèque, nombre de
  tomes.
- **Nouveau tome** : un nouveau tome (volume, numéro) est ajouté à une série
  déjà présente dans Komga. Filtre : la série que vous suivez, son titre
  exactement comme dans Komga. Informations : titre de la série, titre du
  tome, bibliothèque.
- **Série lue jusqu'au bout** : vous terminez le dernier tome non lu d'une
  série, ou marquez la série comme lue. Filtre : la bibliothèque.
  Informations : titre de la série, bibliothèque, nombre de tomes.

### Actions

- **Scanner les bibliothèques Komga** : Komga cherche les nouveaux fichiers
  dans une bibliothèque (son nom, sans tenir compte des majuscules) ou dans
  toutes ; le scan tourne en arrière-plan et les nouvelles séries arrivent
  quelques secondes plus tard. Compte administrateur seulement. Résultat : le
  nombre de bibliothèques scannées.
- **Lire les derniers ajouts de Komga** : une phrase pour une notification ou
  une enceinte, par exemple _« 2 nouvelle(s) série(s) sur Komga ces 7 derniers
  jours : Blue Skies et Green Leaf. »_ Résultats : la phrase, le nombre de
  nouvelles séries, le titre de la dernière (12 séries au plus).

### Idées de scènes

- **Nouveau tome de mon manga** : quand _Nouveau tome_ avec votre série,
  envoyer la notification « Nouveau tome de {series} : {title} ».
- **Résumé du dimanche** : chaque dimanche à 10 h, _Lire les derniers ajouts
  de Komga_, puis envoyer la phrase en message.
- **Après les téléchargements** : chaque nuit à 3 h, _Scanner les
  bibliothèques Komga_, pour que les fichiers déposés par vos outils de
  téléchargement soient là le matin.

## Dépannage

- **« le serveur ne répond pas »** : vérifiez l'adresse et le port depuis la
  machine de Gladys. Gladys fait tourner l'intégration dans un conteneur :
  `localhost` est le conteneur lui-même, utilisez l'adresse IP de la machine.
- **« clé d'API ou mot de passe refusé »** : la clé a été supprimée dans
  Komga, ou le mot de passe a changé ; créez une nouvelle clé.
- **« ce compte n'est pas administrateur »** : le scan demande un compte
  administrateur.
- **« aucun serveur Komga à cette adresse »** ou **« l'adresse redirige »** :
  un serveur derrière un reverse proxy demande son chemin de base
  (`https://example.org/komga`) ; une page de connexion du proxy bloque l'API.
- **« certificat refusé »** : le HTTPS avec un certificat auto-signé n'est pas
  pris en charge ; utilisez l'adresse en `http://` de votre réseau.
- L'intégration ne journalise que son cycle de vie ; avec `LOG_LEVEL=debug`,
  elle journalise aussi chaque événement, avec les titres.

## Limites

- Le serveur est lu toutes les 1 à 15 minutes. L'intégration écoute aussi les
  événements de Komga (un tome ou une série ajoutés, une progression de
  lecture) pour le relire en quelques secondes ; un reverse proxy qui retient
  ces événements retarde seulement les scènes jusqu'à la lecture suivante.
- Au plus 10 événements d'un même type par lecture (un premier gros scan
  annonce 10 séries, pas des centaines). Les tomes ajoutés depuis plus de 24
  heures ne sont pas annoncés (un Gladys arrêté deux jours ne les rejoue pas).
- **Série lue jusqu'au bout** et **Tomes lus aujourd'hui** suivent les 20
  derniers tomes lus.
- Un compte Komga et un serveur par installation de l'intégration.
- Sans lien avec le projet Komga.
