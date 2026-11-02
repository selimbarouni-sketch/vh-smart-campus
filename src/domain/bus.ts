import type { Eleve, Trajet } from './types';

/** Identifiant d'un passage au bus : un seul passage par élève, par date et par trajet. */
export const idPassageBus = (date: string, trajet: Trajet, eleveId: string) => `${date}_${trajet}_${eleveId}`;

export type ControleBus =
  | { autorise: true }
  | { autorise: false; raison: string };

/** Contrôles avant d'enregistrer la montée d'un élève dans le bus. */
export function controlerEleveBus(eleve: Eleve | null): ControleBus {
  if (!eleve) return { autorise: false, raison: 'Élève introuvable.' };
  if (!eleve.actif) return { autorise: false, raison: "Élève inactif (n'est plus inscrit)." };
  if (!eleve.bus) return { autorise: false, raison: "Cet élève n'est pas inscrit au bus." };
  return { autorise: true };
}
