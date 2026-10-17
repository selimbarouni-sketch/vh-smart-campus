// Sauvegarde complète des données (fichier JSON) et vérification avant restauration.

export const COLLECTIONS_SAUVEGARDE = [
  'config', 'utilisateurs', 'eleves', 'scolarites', 'groupes', 'qr_jetons',
  'cantine_passages', 'cantine_anomalies',
  'edt_imports', 'edt_versions', 'edt_modifications', 'edt_sources',
] as const;
export type CollectionSauvegarde = (typeof COLLECTIONS_SAUVEGARDE)[number];

/** Collections à ajout seul : une restauration ne remplace jamais un enregistrement existant. */
export const AJOUT_SEUL: CollectionSauvegarde[] = ['cantine_passages', 'cantine_anomalies'];

export type Donnees = Partial<Record<CollectionSauvegarde, Record<string, Record<string, unknown>>>>;

export interface FichierSauvegarde {
  format: 'vh-smart-campus';
  version: 1;
  creeLe: string;
  creePar: string;
  collections: Donnees;
}

export function creerSauvegarde(collections: Donnees, creePar: string, maintenant: string): FichierSauvegarde {
  return { format: 'vh-smart-campus', version: 1, creeLe: maintenant, creePar, collections };
}

export function resumeSauvegarde(f: FichierSauvegarde): { collection: string; nombre: number }[] {
  return COLLECTIONS_SAUVEGARDE.map((c) => ({ collection: c, nombre: Object.keys(f.collections[c] ?? {}).length }));
}

/** Lit et vérifie un fichier de sauvegarde. Lève une erreur explicite si le fichier n'est pas valide. */
export function lireSauvegarde(texte: string): FichierSauvegarde {
  let brut: unknown;
  try { brut = JSON.parse(texte); } catch { throw new Error("Ce fichier n'est pas une sauvegarde VH Smart Campus (JSON illisible)."); }
  const f = brut as Partial<FichierSauvegarde>;
  if (f?.format !== 'vh-smart-campus' || f.version !== 1 || typeof f.collections !== 'object' || !f.collections) {
    throw new Error("Ce fichier n'est pas une sauvegarde VH Smart Campus.");
  }
  for (const [nom, docs] of Object.entries(f.collections)) {
    if (!(COLLECTIONS_SAUVEGARDE as readonly string[]).includes(nom)) throw new Error(`Collection inconnue dans la sauvegarde : ${nom}.`);
    if (typeof docs !== 'object' || docs === null || Array.isArray(docs)) throw new Error(`Collection mal formée : ${nom}.`);
    for (const [id, d] of Object.entries(docs)) {
      if (!id || id.includes('/') || typeof d !== 'object' || d === null) throw new Error(`Enregistrement invalide dans ${nom} : « ${id} ».`);
    }
  }
  return f as FichierSauvegarde;
}

export interface RapportRestauration { ecrits: number; ignores: number }
