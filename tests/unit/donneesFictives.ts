// DONNÉES FICTIVES DE TEST : aucune ne correspond à un élève, une classe ou un enseignant réel.
import type { Calendrier, Eleve, Seance, VersionEDT } from '../../src/domain/types';

export const CALENDRIER_FICTIF: Calendrier = {
  fuseau: 'Africa/Tunis',
  anneeDebut: '2026-09-01',
  anneeFin: '2027-07-03',
  reference: { lundi: '2026-09-07', type: 'A' },
  modeAlternance: 'continu',
  semainesForcees: {},
  vacances: [{ debut: '2026-10-24', fin: '2026-11-08', libelle: 'Vacances fictives' }],
  feries: [{ date: '2026-09-30', libelle: 'Férié fictif' }],
};

export const ELEVE_FICTIF: Eleve = { id: 'fictif-1', nom: 'Ben Ali (fictif)', prenom: 'Yassine', classe: '1re B', actif: true, cantineAutorisee: true };

let n = 0;
export const seance = (p: Partial<Seance>): Seance => ({
  id: `f${n++}`, cible: 'classe:1re B', jour: 'lundi', debut: '08:00', fin: '09:00', matiere: 'Matière fictive',
  enseignant: 'M. Fictif', salle: 'Salle 000', semaine: 'toutes', ...p,
});

export const version = (seances: Seance[], p: Partial<VersionEDT> = {}): VersionEDT => ({
  id: `v${n++}`, version: 1, cibles: [...new Set(seances.map((s) => s.cible))], validiteDebut: '2026-09-01', validiteFin: '2027-07-03',
  publieeLe: '2026-09-01T08:00:00Z', publieePar: 'test', statut: 'active', seances, ...p,
});
