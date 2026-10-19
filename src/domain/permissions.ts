import type { Role } from './types';

export type Capacite =
  | 'scanner_cantine'
  | 'historique_cantine'
  | 'scanner_edt'
  | 'importer_edt'
  | 'publier_edt'
  | 'modifier_edt_ponctuel'
  | 'consulter_edt'
  | 'gerer_eleves'
  | 'voir_eleves'
  | 'administrer';

/**
 * Matrice des droits. Elle est reproduite côté serveur dans firestore.rules :
 * l'interface ne fait que masquer ce que les règles interdisent déjà.
 */
const DROITS: Record<Role, Capacite[]> = {
  admin: ['scanner_cantine', 'historique_cantine', 'scanner_edt', 'importer_edt', 'publier_edt', 'modifier_edt_ponctuel', 'consulter_edt', 'gerer_eleves', 'voir_eleves', 'administrer'],
  cantine: ['scanner_cantine'],
  vie_scolaire: ['scanner_edt', 'voir_eleves', 'historique_cantine', 'modifier_edt_ponctuel', 'consulter_edt'],
  gestion_edt: ['scanner_edt', 'importer_edt', 'publier_edt', 'modifier_edt_ponctuel', 'consulter_edt'],
  gestion_eleves: ['gerer_eleves', 'voir_eleves', 'historique_cantine'],
};

export function peut(roles: Role[] | undefined, c: Capacite): boolean {
  return (roles ?? []).some((r) => DROITS[r]?.includes(c));
}

export const LIBELLES_ROLES: Record<Role, string> = {
  admin: 'Administrateur',
  cantine: 'Agent de cantine',
  vie_scolaire: 'Vie scolaire',
  gestion_edt: 'Gestion des emplois du temps',
  gestion_eleves: 'Gestion des élèves',
};
