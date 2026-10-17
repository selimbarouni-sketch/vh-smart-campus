import type {
  Calendrier, Eleve, Groupe, ImportEDT, Modification, PassageCantine, ScolariteEleve, ServiceCantine, Utilisateur, VersionEDT,
} from '../domain/types';
import type { ActionAncienne } from '../domain/publication';

export interface NouveauCompte {
  email: string;
  nom: string;
  roles: Utilisateur['roles'];
  /** Mot de passe provisoire (10 caractères minimum), à changer par l'utilisateur. */
  motDePasse: string;
}

export interface ResultatPassage {
  statut: 'confirme' | 'doublon';
  passage: PassageCantine;
}

/**
 * Accès aux données. Deux implémentations :
 *  - Firebase (production) ;
 *  - mémoire locale (mode démonstration, données fictives signalées à l'écran).
 * Toute méthode d'écriture rejette sa promesse en cas d'échec : l'interface
 * n'affiche jamais de confirmation tant que l'écriture n'est pas acquittée.
 */
export interface Depot {
  readonly mode: 'firebase' | 'demo';

  // Authentification
  ecouterSession(cb: (u: Utilisateur | null) => void): () => void;
  connexion(email: string, motDePasse: string): Promise<void>;
  deconnexion(): Promise<void>;

  // Élèves, groupes et QR codes
  listerEleves(): Promise<Eleve[]>;
  lireEleve(id: string): Promise<Eleve | null>;
  enregistrerEleve(e: Eleve): Promise<void>;
  lireScolarite(eleveId: string): Promise<ScolariteEleve | null>;
  enregistrerScolarite(s: ScolariteEleve): Promise<void>;
  listerGroupes(): Promise<Groupe[]>;
  enregistrerGroupe(g: Groupe): Promise<void>;
  /** Renvoie l'identifiant de l'élève si le jeton existe et est actif, sinon null. */
  resoudreJeton(jeton: string): Promise<string | null>;
  /** Crée un nouveau jeton et désactive les précédents de l'élève. */
  regenererJeton(eleveId: string): Promise<string>;
  jetonActif(eleveId: string): Promise<string | null>;

  // Cantine
  servicesCantine(): Promise<ServiceCantine[]>;
  enregistrerServices(s: ServiceCantine[]): Promise<void>;
  /** Transaction : crée le passage s'il n'existe pas (sinon : doublon journalisé). */
  enregistrerPassage(eleve: Eleve, service: string, date: string, agentUid: string): Promise<ResultatPassage>;
  journaliserRefus(p: Omit<PassageCantine, 'id' | 'statut'>): Promise<void>;
  listerPassages(dateDebut: string, dateFin: string): Promise<PassageCantine[]>;

  // Emplois du temps
  listerImports(): Promise<ImportEDT[]>;
  lireImport(id: string): Promise<ImportEDT | null>;
  enregistrerImport(imp: ImportEDT): Promise<void>;
  televerserSource(importId: string, fichier: File): Promise<string>;
  urlSource(chemin: string): Promise<string>;
  /** Publication atomique : nouvelle version + effets sur les anciennes + statut de l'import. */
  publier(version: VersionEDT, actions: ActionAncienne[], importPublie: ImportEDT): Promise<void>;
  listerVersions(): Promise<VersionEDT[]>;
  listerModifications(dateDebut: string, dateFin: string): Promise<Modification[]>;
  enregistrerModification(m: Modification): Promise<void>;
  lireCalendrier(): Promise<Calendrier>;
  enregistrerCalendrier(c: Calendrier): Promise<void>;

  // Administration
  listerUtilisateurs(): Promise<Utilisateur[]>;
  enregistrerUtilisateur(u: Utilisateur): Promise<void>;
  /** Crée un compte du personnel (authentification + profil). Réservé à l'administrateur. */
  creerUtilisateur(c: NouveauCompte): Promise<void>;

  /** Analyse multimodale d'une page (fonction serveur). */
  analyseMultimodale?(imageBase64: string, typeMime: string, contexte: string): Promise<unknown>;
}

export const CALENDRIER_DEFAUT: Calendrier = {
  fuseau: 'Africa/Tunis',
  anneeDebut: '2026-09-01',
  anneeFin: '2027-07-03',
  reference: { lundi: '2026-09-07', type: 'A' },
  modeAlternance: 'hors_vacances',
  semainesForcees: {},
  vacances: [],
  feries: [],
};

export const SERVICES_DEFAUT: ServiceCantine[] = [
  { id: 'dejeuner', libelle: 'Déjeuner', debut: '11:30', fin: '14:00' },
];
