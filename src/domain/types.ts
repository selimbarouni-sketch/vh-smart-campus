// Modèle de données de VH Smart Campus.
// Toutes les dates sont au format "AAAA-MM-JJ" et les heures au format "HH:MM",
// exprimées dans le fuseau de l'établissement (Africa/Tunis par défaut).

export type Role =
  | 'admin'
  | 'cantine'          // agent de cantine : scan cantine uniquement
  | 'vie_scolaire'     // scan emploi du temps, consultation des élèves
  | 'gestion_edt'      // import, vérification et publication des emplois du temps
  | 'gestion_eleves';  // création des élèves, groupes, QR codes

export interface Utilisateur {
  uid: string;
  email: string;
  nom: string;
  roles: Role[];
  actif: boolean;
}

export type Jour = 'lundi' | 'mardi' | 'mercredi' | 'jeudi' | 'vendredi' | 'samedi';
export const JOURS: Jour[] = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** Semaine d'application d'une séance. "toutes" = chaque semaine. */
export type Semaine = 'toutes' | 'A' | 'B';

/** Identité de l'élève : seules informations accessibles au personnel de cantine. */
export interface Eleve {
  id: string;
  nom: string;
  prenom: string;
  classe: string;          // ex. "1re B"
  actif: boolean;
  cantineAutorisee: boolean;
}

/** Données pédagogiques : réservées à la vie scolaire, à la gestion et à l'administration. */
export interface ScolariteEleve {
  eleveId: string;
  /** Identifiants des groupes (spécialités, options, langues, demi-groupes). */
  groupes: string[];
}

export interface Groupe {
  id: string;              // ex. "1B-ESP-LV2"
  libelle: string;         // ex. "Espagnol LV2 – 1re B"
  type: 'specialite' | 'option' | 'langue' | 'demi_groupe' | 'autre';
  classes: string[];       // classes concernées
}

export interface JetonQR {
  jeton: string;           // identifiant opaque (aucune donnée personnelle)
  eleveId: string;
  actif: boolean;
  creeLe: string;          // ISO
}

/** Indique, pour chaque champ, s'il a été lu avec certitude. */
export type ChampSeance = 'jour' | 'debut' | 'fin' | 'matiere' | 'enseignant' | 'salle' | 'semaine' | 'cible';

export interface Seance {
  id: string;
  /** Cible : une classe ("classe:1re B") ou un groupe ("groupe:1B-ESP-LV2"). */
  cible: string;
  jour: Jour;
  debut: string;
  fin: string;
  matiere: string;
  enseignant: string;      // vide si absent : jamais inventé
  salle: string;           // vide si absent : jamais inventée
  semaine: Semaine;
  /** Restriction optionnelle de validité à l'intérieur de la version. */
  validiteDebut?: string;
  validiteFin?: string;
  // Métadonnées d'extraction (brouillon uniquement)
  incertitudes?: ChampSeance[];
  texteSource?: string;
  /** Groupe repéré dans la case (ex. "LV2 ESP") : simple indication, l'association reste manuelle. */
  indiceGroupe?: string;
  page?: number;
  confiance?: number;      // 0..1
}

export type StatutImport = 'brouillon' | 'verifie' | 'publie' | 'archive' | 'rejete';

export type TypeDocument = 'classe' | 'multi_classes' | 'groupe';

export interface MethodeExtraction {
  methode: 'texte_pdf' | 'ocr' | 'vision' | 'manuel';
  pages: number[];
  details?: string;
}

/** Import d'un document d'emploi du temps : il suit le cycle brouillon → vérifié → publié. */
export interface ImportEDT {
  id: string;
  fichierNom: string;
  fichierType: string;
  cheminStockage?: string;  // chemin Firebase Storage du document source
  nbPages: number;
  typeDocument: TypeDocument;
  ciblesParDefaut: string[];
  importePar: string;      // uid
  importeParNom: string;
  importeLe: string;       // ISO
  statut: StatutImport;
  version: number;
  validiteDebut: string;
  validiteFin: string;
  seances: Seance[];
  extraction: MethodeExtraction[];
  avertissements: string[];
  valideePar?: string;
  valideeLe?: string;
  publieePar?: string;
  publieeLe?: string;
  archiveeLe?: string;
  remplacePar?: string;
}

/** Version publiée (seule source de vérité pour l'affichage après scan). */
export interface VersionEDT {
  id: string;              // = id de l'import publié
  version: number;
  cibles: string[];
  validiteDebut: string;
  validiteFin: string;
  publieeLe: string;
  publieePar: string;
  statut: 'active' | 'archivee';
  seances: Seance[];
}

export type TypeModification =
  | 'annulation'
  | 'remplacement'   // une autre séance remplace la séance habituelle
  | 'salle'
  | 'enseignant'
  | 'horaire'
  | 'ajout';         // séance exceptionnelle (rattrapage, examen, sortie)

/** Changement ponctuel, appliqué à une date précise, prioritaire sur l'emploi du temps habituel. */
export interface Modification {
  id: string;
  date: string;
  type: TypeModification;
  /** Séance habituelle visée (sauf pour "ajout"). */
  seanceId?: string;
  cible: string;
  nouvelleMatiere?: string;
  nouvelEnseignant?: string;
  nouvelleSalle?: string;
  nouveauDebut?: string;
  nouvelleFin?: string;
  motif: string;
  creePar: string;
  creeLe: string;          // ISO, sert au départage
  actif: boolean;
}

export interface Periode {
  debut: string;
  fin: string;
  libelle: string;
}

export interface Calendrier {
  fuseau: string;                         // "Africa/Tunis"
  anneeDebut: string;                     // premier jour de l'année scolaire
  anneeFin: string;                       // dernier jour de l'année scolaire
  /** Lundi d'une semaine de référence et son type. */
  reference: { lundi: string; type: 'A' | 'B' };
  /**
   * "continu" : alternance chaque semaine civile, vacances comprises.
   * "hors_vacances" : les semaines entièrement en vacances ne comptent pas.
   */
  modeAlternance: 'continu' | 'hors_vacances';
  /** Forçage manuel du type d'une semaine (clé = lundi). Prioritaire sur le calcul. */
  semainesForcees: Record<string, 'A' | 'B'>;
  vacances: Periode[];
  feries: { date: string; libelle: string }[];
}

export interface ServiceCantine {
  id: string;              // "dejeuner"
  libelle: string;         // "Déjeuner"
  debut: string;
  fin: string;
}

export type StatutPassage = 'confirme' | 'refuse' | 'doublon';

export interface PassageCantine {
  id: string;
  eleveId: string;
  nom: string;
  prenom: string;
  classe: string;
  date: string;
  service: string;
  horodatage: string;      // ISO
  agentUid: string;
  statut: StatutPassage;
  raison?: string;
}

/** Identité visuelle de l'établissement (lisible avant connexion : page d'accueil et de connexion). */
export interface Etablissement {
  nom: string;                 // « Lycée Français International Victor Hugo – Djerba »
  nomCourt: string;            // « LFI Victor Hugo – Djerba » (cartes QR, en-tête mobile)
  /** Logo principal, image PNG/JPEG/WebP en data URL (redimensionnée côté client). */
  logo?: string;
  /** Logos partenaires (réseau, tutelle), affichés en pied de page. */
  logosPartenaires: string[];
  /** Couleur principale du site (#rrggbb). */
  couleur: string;
}

export interface NouveauCompte {
  email: string;
  nom: string;
  roles: Role[];
  motDePasse: string;
}
