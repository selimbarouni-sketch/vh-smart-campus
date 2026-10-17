import type { ChampSeance, ImportEDT, Seance } from './types';
import { JOURS } from './types';
import { chevauche, libelleCible } from './emploiDuTemps';
import { dateValide, heureValide, minutes } from './temps';

export type NiveauProbleme = 'erreur' | 'incertain' | 'manquant' | 'chevauchement';

export interface Probleme {
  seanceId: string;
  champ?: ChampSeance;
  niveau: NiveauProbleme;
  message: string;
}

const LIBELLES: Record<ChampSeance, string> = {
  jour: 'jour', debut: 'heure de début', fin: 'heure de fin', matiere: 'matière',
  enseignant: 'enseignant', salle: 'salle', semaine: 'semaine A/B', cible: 'classe ou groupe',
};

/** Contrôles effectués sur le tableau de vérification avant toute validation. */
export function verifierSeances(seances: Seance[]): Probleme[] {
  const p: Probleme[] = [];
  for (const s of seances) {
    if (!s.cible) p.push({ seanceId: s.id, champ: 'cible', niveau: 'erreur', message: 'Séance non associée à une classe ou un groupe.' });
    if (!JOURS.includes(s.jour)) p.push({ seanceId: s.id, champ: 'jour', niveau: 'erreur', message: 'Jour manquant ou invalide.' });
    if (!heureValide(s.debut)) p.push({ seanceId: s.id, champ: 'debut', niveau: 'erreur', message: 'Heure de début manquante ou invalide.' });
    if (!heureValide(s.fin)) p.push({ seanceId: s.id, champ: 'fin', niveau: 'erreur', message: 'Heure de fin manquante ou invalide.' });
    if (heureValide(s.debut) && heureValide(s.fin) && minutes(s.fin) <= minutes(s.debut)) {
      p.push({ seanceId: s.id, champ: 'fin', niveau: 'erreur', message: "L'heure de fin doit être postérieure à l'heure de début." });
    }
    if (!s.matiere.trim()) p.push({ seanceId: s.id, champ: 'matiere', niveau: 'erreur', message: 'Matière manquante.' });
    if (!s.enseignant.trim()) p.push({ seanceId: s.id, champ: 'enseignant', niveau: 'manquant', message: 'Enseignant non indiqué dans le document.' });
    if (!s.salle.trim()) p.push({ seanceId: s.id, champ: 'salle', niveau: 'manquant', message: 'Salle non indiquée dans le document.' });
    if (s.validiteDebut && !dateValide(s.validiteDebut)) p.push({ seanceId: s.id, niveau: 'erreur', message: 'Date de début de validité invalide.' });
    if (s.validiteFin && !dateValide(s.validiteFin)) p.push({ seanceId: s.id, niveau: 'erreur', message: 'Date de fin de validité invalide.' });
    for (const champ of s.incertitudes ?? []) {
      p.push({ seanceId: s.id, champ, niveau: 'incertain', message: `Lecture incertaine : ${LIBELLES[champ]} à confirmer.` });
    }
  }
  // Chevauchements dans une même cible, pour des semaines compatibles.
  for (let i = 0; i < seances.length; i++) {
    for (let j = i + 1; j < seances.length; j++) {
      const a = seances[i], b = seances[j];
      if (a.cible !== b.cible || a.jour !== b.jour) continue;
      if (a.semaine !== 'toutes' && b.semaine !== 'toutes' && a.semaine !== b.semaine) continue;
      if (!heureValide(a.debut) || !heureValide(a.fin) || !heureValide(b.debut) || !heureValide(b.fin)) continue;
      if (chevauche(a, b)) {
        const msg = `Chevauchement avec « ${b.matiere || '?'} » (${libelleCible(a.cible)}). S'il s'agit de groupes, associez chaque séance à son groupe.`;
        p.push({ seanceId: a.id, niveau: 'chevauchement', message: msg });
        p.push({ seanceId: b.id, niveau: 'chevauchement', message: `Chevauchement avec « ${a.matiere || '?'} » (${libelleCible(b.cible)}).` });
      }
    }
  }
  return p;
}

export interface Bilan {
  erreurs: number;
  incertains: number;
  manquants: number;
  chevauchements: number;
  /** La validation est possible lorsqu'il ne reste ni erreur, ni champ incertain non confirmé, ni chevauchement. */
  validable: boolean;
}

export function bilan(problemes: Probleme[], imp?: Pick<ImportEDT, 'validiteDebut' | 'validiteFin' | 'seances'>): Bilan {
  const n = (niv: NiveauProbleme) => problemes.filter((x) => x.niveau === niv).length;
  const periodeOk = !imp || (dateValide(imp.validiteDebut) && dateValide(imp.validiteFin) && imp.validiteDebut <= imp.validiteFin);
  const nonVide = !imp || imp.seances.length > 0;
  const b = { erreurs: n('erreur'), incertains: n('incertain'), manquants: n('manquant'), chevauchements: n('chevauchement') };
  return { ...b, validable: periodeOk && nonVide && b.erreurs === 0 && b.incertains === 0 && b.chevauchements === 0 };
}

/** Confirme un champ (l'utilisateur l'a relu) : il n'est plus marqué incertain. */
export function confirmerChamp(s: Seance, champ: ChampSeance): Seance {
  return { ...s, incertitudes: (s.incertitudes ?? []).filter((c) => c !== champ) };
}

/** Modifier un champ vaut confirmation de ce champ. */
export function modifierChamp<K extends keyof Seance>(s: Seance, champ: K, valeur: Seance[K]): Seance {
  const maj = { ...s, [champ]: valeur } as Seance;
  return (['jour', 'debut', 'fin', 'matiere', 'enseignant', 'salle', 'semaine', 'cible'] as string[]).includes(champ as string)
    ? confirmerChamp(maj, champ as ChampSeance)
    : maj;
}
