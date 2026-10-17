import type { ImportEDT, Seance, VersionEDT } from './types';
import { bilan, verifierSeances } from './verification';
import { ajouterJours } from './temps';

/** Cibles couvertes par un import : celles de ses séances et celles choisies à l'import. */
export function ciblesImport(imp: Pick<ImportEDT, 'seances' | 'ciblesParDefaut'>): string[] {
  return [...new Set([...imp.ciblesParDefaut, ...imp.seances.map((s) => s.cible)].filter(Boolean))].sort();
}

/** Versions actives qui seraient remplacées : même cible et périodes qui se recoupent. */
export function versionsRemplacees(imp: ImportEDT, versions: VersionEDT[]): VersionEDT[] {
  const cibles = ciblesImport(imp);
  return versions.filter(
    (v) => v.statut === 'active' && v.id !== imp.id
      && v.cibles.some((c) => cibles.includes(c))
      && v.validiteDebut <= imp.validiteFin && imp.validiteDebut <= v.validiteFin,
  );
}

export function prochaineVersion(cibles: string[], versions: VersionEDT[]): number {
  return 1 + Math.max(0, ...versions.filter((v) => v.cibles.some((c) => cibles.includes(c))).map((v) => v.version));
}

export class ErreurPublication extends Error {}

/** Validation explicite : uniquement si le tableau ne contient plus d'erreur ni de champ incertain. */
export function valider(imp: ImportEDT, uid: string, maintenant: string): ImportEDT {
  if (imp.statut !== 'brouillon') throw new ErreurPublication('Seul un brouillon peut être validé.');
  const b = bilan(verifierSeances(imp.seances), imp);
  if (!b.validable) {
    throw new ErreurPublication(`Validation impossible : ${b.erreurs} erreur(s), ${b.incertains} champ(s) incertain(s), ${b.chevauchements} chevauchement(s), ou période de validité invalide.`);
  }
  return { ...imp, statut: 'verifie', valideePar: uid, valideeLe: maintenant };
}

/** Toute modification du tableau après validation remet l'import à l'état de brouillon. */
export function modifierSeances(imp: ImportEDT, seances: Seance[]): ImportEDT {
  if (imp.statut === 'publie' || imp.statut === 'archive') throw new ErreurPublication('Un emploi du temps publié ne se modifie pas : importez une nouvelle version ou utilisez une modification ponctuelle.');
  return { ...imp, seances, statut: 'brouillon', valideePar: undefined, valideeLe: undefined };
}

/** Prépare la publication d'un import vérifié. */
export function preparerPublication(imp: ImportEDT, versions: VersionEDT[], uid: string, maintenant: string) {
  if (imp.statut !== 'verifie') throw new ErreurPublication("L'emploi du temps doit être vérifié et validé avant publication.");
  const b = bilan(verifierSeances(imp.seances), imp);
  if (!b.validable) throw new ErreurPublication('Le tableau contient encore des erreurs.');
  const cibles = ciblesImport(imp);
  const version: VersionEDT = {
    id: imp.id,
    version: imp.version,
    cibles,
    validiteDebut: imp.validiteDebut,
    validiteFin: imp.validiteFin,
    publieeLe: maintenant,
    publieePar: uid,
    statut: 'active',
    // Les métadonnées d'extraction ne sont pas recopiées dans la version publiée.
    seances: imp.seances.map(({ incertitudes: _i, confiance: _c, ...s }) => s),
  };
  const importPublie: ImportEDT = { ...imp, statut: 'publie', publieePar: uid, publieeLe: maintenant };
  return { version, actions: actionsSurAnciennes(imp, versions), importPublie };
}

export type ActionAncienne =
  | { id: string; action: 'archiver' }
  | { id: string; action: 'raccourcir'; nouvelleFin: string }
  | { id: string; action: 'aucune'; raison: string };

/**
 * Effet de la publication sur les versions actives qui se recoupent :
 *  - ancienne version entièrement couverte (cibles et période) : archivée ;
 *  - ancienne version commençant avant la nouvelle : sa validité s'arrête la veille ;
 *  - ancienne version couvrant d'autres classes : conservée, la nouvelle version,
 *    publiée plus récemment, est prioritaire pour les cibles communes.
 */
export function actionsSurAnciennes(imp: ImportEDT, versions: VersionEDT[]): ActionAncienne[] {
  const cibles = ciblesImport(imp);
  return versionsRemplacees(imp, versions).map((v) => {
    if (!v.cibles.every((c) => cibles.includes(c))) {
      return { id: v.id, action: 'aucune', raison: 'Cette version concerne aussi d’autres classes ou groupes : elle reste active pour eux.' };
    }
    if (v.validiteDebut < imp.validiteDebut) return { id: v.id, action: 'raccourcir', nouvelleFin: ajouterJours(imp.validiteDebut, -1) };
    return { id: v.id, action: 'archiver' };
  });
}
