# VH Smart Campus : LFI Victor Hugo Djerba

Application web mobile (PWA installable : le service worker `public/sw.js` ne met en cache que l'interface, jamais les données), entièrement en français, avec deux modules qui utilisent le **même QR code élève** :

- **CANTINE** : scan rapide, enregistrement des passages, blocage des doubles passages, historique et exports.
- **EMPLOI DU TEMPS** : import des emplois du temps (PDF texte, PDF scanné, photo), extraction, vérification obligatoire, publication, puis affichage instantané du cours en cours après un scan.

Technologies : React + TypeScript + Vite, Firebase (Auth, Firestore, Storage, Cloud Functions), pdf.js, Tesseract.js (OCR auto-hébergé), analyse multimodale facultative côté serveur.

---

## Démarrage rapide (mode démonstration)

```bash
npm install
npm run dev          # http://localhost:5173
```

Sans configuration Firebase, l'application démarre en **mode démonstration**. Un bandeau jaune permanent indique alors « données fictives ».

Comptes de démonstration (mot de passe `demo`) :

| Compte | Rôle |
|---|---|
| `admin@demo.local` | administrateur |
| `cantine@demo.local` | agent de cantine |
| `viesco@demo.local` | vie scolaire |
| `edt@demo.local` | gestion des emplois du temps |

Des emplois du temps fictifs à importer se trouvent dans `tests/fixtures/` (régénérables avec `npm run fixtures`).

## Mise en ligne sur Vercel (site) + Firebase (données)

Vercel héberge l'application web ; Firebase fournit les comptes, la base de données, le stockage des documents et la fonction d'analyse multimodale.
**Sans les variables Firebase, le site Vercel fonctionne en mode démonstration** (données fictives, bandeau jaune) : pratique pour une présentation, mais inutilisable pour le service réel.

### 1. Vercel
1. Sur https://vercel.com : *Add New… > Project > Import Git Repository* et choisir le dépôt GitHub.
2. Réglages détectés automatiquement grâce à `vercel.json` (framework Vite, commande `npm run build`, dossier `dist`).
3. *Settings > Environment Variables* : ajouter les variables de `.env.exemple` (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_REGION`), puis *Redeploy*.
4. Chaque `git push` sur la branche principale redéploie le site.

### 2. Firebase
1. Créer un projet Firebase (offre **Blaze**, indispensable pour les Cloud Functions), région européenne (ex. `europe-west1`).
2. Activer **Authentication > E-mail/Mot de passe**, **Firestore** et **Storage**.
3. **Authentication > Paramètres > Domaines autorisés** : ajouter le domaine Vercel (ex. `vh-smart-campus.vercel.app`).
4. Déployer les règles de sécurité et les fonctions (depuis un ordinateur) :
   ```bash
   npx firebase-tools login
   npx firebase-tools use <id-du-projet>
   (cd functions && npm install)
   npx firebase-tools deploy --only firestore,storage,functions
   ```
5. Premier administrateur : créer le compte dans **Authentication**, puis le document `utilisateurs/{uid}` dans Firestore :
   `{ email, nom, roles: ["admin"], actif: true }`.
   Les comptes suivants se créent ensuite depuis **Administration > Créer un compte du personnel**, via la fonction serveur `creerUtilisateur` (mot de passe provisoire de 10 caractères minimum, rôles cochés).
6. **Analyse multimodale (facultative)** : `npx firebase-tools functions:secrets:set ANTHROPIC_API_KEY`.

## Importer les élèves et imprimer les cartes QR

*Gestion des élèves > Importer une liste* : coller la liste copiée depuis Excel ou Pronote (colonnes « Élève, Né(e) le, Classe, Régime »), ou choisir un fichier XLSX/CSV.
- Classe « 1B » → « 1re B » (même écriture que dans les emplois du temps : « 1 A », « 1ère A »… sont reconnus).
- Régime « demi-pensionnaire » ou « interne » → cantine autorisée ; « externe » ou vide → non autorisée.
- Nom et prénoms dans une même colonne : la séparation est proposée ; les noms de plus de deux mots sont surlignés pour vérification.
- La date de naissance n'est pas enregistrée. Un réimport met à jour les élèves existants sans doublon.

*Imprimer les cartes QR* : 6 cartes par page A4, une couleur par niveau (Seconde vert, Première bleu, Terminale rouge…) et une nuance par classe ; la classe est écrite en grand (lisible aussi en noir et blanc). En mode démonstration, les cartes portent la mention « SPÉCIMEN – NON VALABLE ».

## Rôles et droits

Les droits sont appliqués **côté serveur** par `firestore.rules` et `storage.rules`. L'interface ne fait que masquer ce que les règles interdisent déjà.

| Rôle | Peut |
|---|---|
| Agent de cantine | scanner à la cantine ; voit uniquement nom, prénom, classe et autorisation cantine |
| Vie scolaire | scanner l'emploi du temps, voir les élèves et l'historique cantine, saisir des changements ponctuels |
| Gestion EDT | importer, vérifier et publier les emplois du temps, saisir des changements ponctuels |
| Gestion élèves | fiches élèves, groupes, QR codes, historique cantine |
| Administrateur | tout, plus les rôles, le calendrier et les services |

Le QR code contient uniquement un jeton aléatoire (`VHSC-` + 24 caractères, 120 bits). Un QR code régénéré invalide l'ancien (carte perdue).

## Fonctionnement

### Cantine
- Le service (déjeuner…) est présélectionné selon l'heure. En dehors des horaires, l'agent doit le choisir explicitement.
- Chaque passage est une **transaction Firestore** dont l'identifiant est `date_service_élève`. Un second passage est donc impossible, même si deux téléphones scannent en même temps ; il est journalisé comme doublon.
- La confirmation verte ne s'affiche **qu'après l'acquittement du serveur**. En cas d'échec, le message « ÉCHEC : PASSAGE NON ENREGISTRÉ » s'affiche.
- Les refus (QR code invalide ou inconnu, élève inactif, élève non autorisé) sont journalisés.
- L'historique est filtrable par date, classe, élève et service. Il affiche séparément les passages, les élèves distincts, les refus et les doublons. Les exports Excel et CSV ne contiennent que les passages confirmés.
- **Rapport imprimable (PDF)** : imprime la période et les filtres choisis (en-tête, compteurs, tableau) ; « Enregistrer au format PDF » dans la boîte d'impression du téléphone produit le PDF. Les heures utilisent le fuseau du calendrier scolaire (Africa/Tunis par défaut).

### Emploi du temps : importation
1. **Document** : PDF, JPG ou PNG ; une classe, plusieurs classes, ou un groupe ; période de validité. Le nom du fichier, le nombre de pages et un aperçu s'affichent.
2. **Extraction** : lecture du texte du PDF s'il existe. Sinon : redressement de la page, **détection des cases du tableau** (cellules fusionnées et cases colorées comprises), puis OCR case par case. En dernier recours, une analyse multimodale page par page est disponible.
   Les **exports EDT (Index Éducation)** sont reconnus : groupes côte à côte dans un même créneau, codes de groupe entre crochets (`[1HGGSP1]` → groupe `1HGGSP1`), quinzaines Q1/Q2 (correspondance avec A/B confirmée en un clic), axe horaire avec pauses non représentées (heure de fin au-dessus du trait, heure de début au-dessous), salles « 003-Lab SVT », enseignants « NOM I. ».
   Une case qui contient du texte illisible n'est jamais ignorée : elle apparaît comme ligne à compléter ou supprimer. Les groupes cités par le document et absents de l'application peuvent être créés en un clic.
3. **Vérification obligatoire** : tableau éditable à côté de la page originale. Les champs incertains apparaissent en jaune, les erreurs en rouge, les informations absentes en pointillés et les chevauchements en orange. On peut corriger, associer une classe ou un groupe, supprimer ou ajouter une séance. La validation n'est possible qu'une fois tous les points résolus et la case « J'ai comparé chaque séance avec le document original » cochée.
4. **Publication** : nouvelle version active. Une ancienne version de la même classe est archivée, ou raccourcie jusqu'à la veille si la nouvelle commence en cours d'année. Le document source, la date, l'auteur, la version, la période et l'état de validation sont conservés.

L'extraction **n'invente jamais** une salle, un enseignant, un horaire ou une matière : un champ absent reste vide. Une abréviation inconnue est conservée telle quelle et marquée à vérifier.

### Emploi du temps : affichage après scan
Le scan affiche, sans clic supplémentaire, l'élève, sa classe, la date, l'heure de Djerba (fuseau `Africa/Tunis`, quel que soit le réglage du téléphone), la semaine A/B, le cours en cours, le prochain cours et le reste de la journée. Selon la situation, il affiche aussi « Aucun cours en cours », « Fin des cours », un jour férié ou des vacances. S'il n'existe aucune version publiée valide, un avertissement remplace l'emploi du temps.

**Règles de priorité :**
1. Un jour férié ou de vacances supprime les cours habituels.
2. Les changements ponctuels de la date s'appliquent du plus ancien au plus récent ; le plus récent l'emporte, champ par champ. « Annulation » annule ; « remplacement » réactive et remplace ; « salle », « enseignant » et « horaire » ne modifient que leur champ.
3. Une séance exceptionnelle (« ajout ») s'ajoute, même un jour férié (rattrapage).
4. Pour une classe ou un groupe, la version active la plus récemment publiée couvrant la date est retenue.

Un élève ne voit les cours d'un groupe (spécialité, option, langue) que s'il est **explicitement** associé à ce groupe dans sa fiche.

## Tests

Toutes les données de test sont fictives et signalées comme telles.

```bash
npm test             # 64 tests : logique, extraction (PDF texte, scanné, photo, mise en page type EDT), import d'élèves
npm run test:e2e     # 6 tests navigateur (format téléphone) sur l'interface en mode démonstration
npm run test:regles  # 12 tests : règles de sécurité et accès Firebase sur émulateurs (Java requis)
```

## Arborescence

```
src/domain/        logique métier pure (EDT, semaines A/B, cantine, vérification, publication, droits)
src/extraction/    analyse des documents (grille, OCR, cases, réponses multimodales)
src/data/          accès aux données : Firebase et démonstration
src/pages/         écrans
functions/         Cloud Functions (analyse multimodale, création de comptes)
firestore.rules    règles de sécurité
tests/             tests unitaires, extraction, navigateur, règles
```
