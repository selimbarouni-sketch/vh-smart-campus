import { libelleCible } from './emploiDuTemps';
import { minutes } from './temps';
import { type Jour, type Seance, type VersionEDT } from './types';

/** Semaine affichée dans le tableau : A ou B (les séances « toutes les semaines » apparaissent dans les deux). */
export type Vue = 'A' | 'B';

export interface LigneTableau {
  debut: string;
  fin: string;
  cases: Record<Jour, Seance[]>;
}

export interface CibleTableau {
  cible: string;
  libelle: string;
  version: VersionEDT;
}

/**
 * Classes et groupes disposant d'un emploi du temps actif, chacun associé à la version
 * active la plus récemment publiée qui le contient.
 */
export function ciblesPubliees(versions: VersionEDT[]): CibleTableau[] {
  const plusRecente = new Map<string, VersionEDT>();
  for (const v of versions) {
    if (v.statut !== 'active') continue;
    for (const cible of v.cibles) {
      const actuelle = plusRecente.get(cible);
      if (!actuelle || v.publieeLe > actuelle.publieeLe) plusRecente.set(cible, v);
    }
  }
  return [...plusRecente.entries()]
    .map(([cible, version]) => ({ cible, libelle: libelleCible(cible), version }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr', { numeric: true }));
}

const casesVides = (): Record<Jour, Seance[]> => ({ lundi: [], mardi: [], mercredi: [], jeudi: [], vendredi: [], samedi: [] });

/** Grille horaire d'une cible pour une semaine : une ligne par créneau, une colonne par jour. */
export function construireGrille(version: VersionEDT, cible: string, semaine: Vue): LigneTableau[] {
  const lignes = new Map<string, LigneTableau>();
  const seances = version.seances
    .filter((s) => s.cible === cible && (s.semaine === 'toutes' || s.semaine === semaine))
    .sort((a, b) => minutes(a.debut) - minutes(b.debut) || a.matiere.localeCompare(b.matiere, 'fr'));
  for (const s of seances) {
    const cle = `${s.debut}-${s.fin}`;
    if (!lignes.has(cle)) lignes.set(cle, { debut: s.debut, fin: s.fin, cases: casesVides() });
    lignes.get(cle)!.cases[s.jour].push(s);
  }
  return [...lignes.values()].sort((a, b) => minutes(a.debut) - minutes(b.debut) || minutes(a.fin) - minutes(b.fin));
}
