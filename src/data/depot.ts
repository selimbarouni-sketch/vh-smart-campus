import type {
  Calendrier, Eleve, Etablissement, Groupe, ImportEDT, Modification, NouveauCompte, PassageCantine, ScolariteEleve, ServiceCantine, Utilisateur, VersionEDT,
} from '../domain/types';
import type { ActionAncienne } from '../domain/publication';
import type { Donnees, RapportRestauration } from '../domain/sauvegarde';

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
  /** Envoie un e-mail permettant de choisir un nouveau mot de passe. */
  envoyerReinitialisation(email: string): Promise<void>;
  changerMotDePasse(actuel: string, nouveau: string): Promise<void>;
  /** Vrai tant qu'aucun administrateur n'a été créé (première mise en service). */
  installationRequise(): Promise<boolean>;
  /** Crée le premier compte administrateur ; impossible une fois l'installation faite. */
  installer(compte: Omit<NouveauCompte, 'roles'>): Promise<void>;

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
  /** Conserve le document source ; renvoie la référence à mémoriser dans l'import. */
  televerserSource(importId: string, fichier: File): Promise<string>;
  /** Adresse locale (objet blob) du document source. */
  urlSource(reference: string): Promise<string>;
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
  /** Crée un compte du personnel (administrateur uniquement) sans fermer la session en cours. */
  creerCompte(c: NouveauCompte): Promise<string>;
  /** Identité de l'établissement : lisible sans être connecté. */
  lireEtablissement(): Promise<Etablissement>;
  enregistrerEtablissement(e: Etablissement): Promise<void>;
  /** Sauvegarde complète (administrateur). */
  exporterDonnees(): Promise<Donnees>;
  restaurerDonnees(d: Donnees, progression?: (fait: number, total: number) => void): Promise<RapportRestauration>;

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

export const ETABLISSEMENT_DEFAUT: Etablissement = {
  nom: 'Lycée Français International Victor Hugo – Djerba',
  nomCourt: 'LFI Victor Hugo Djerba Tunisie',
  logosPartenaires: [],
  couleur: '#0f3d6e',
};
