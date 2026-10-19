import type { Eleve, PassageCantine, ServiceCantine } from './types';
import { minutes } from './temps';

/** Créneau unique de la cantine : aucun choix de service à l'écran. */
export const CRENEAU_CANTINE: ServiceCantine = { id: 'dejeuner', libelle: 'Déjeuner', debut: '12:05', fin: '13:20' };

export const idPassage = (date: string, service: string, eleveId: string) => `${date}_${service}_${eleveId}`;

export type Controle =
  | { autorise: true }
  | { autorise: false; raison: string };

/** Vrai pendant le créneau de cantine (bornes incluses). */
export function dansCreneau(heure: string): boolean {
  const h = minutes(heure);
  return minutes(CRENEAU_CANTINE.debut) <= h && h <= minutes(CRENEAU_CANTINE.fin);
}

/**
 * Contrôles effectués avant d'enregistrer un passage à la cantine.
 * Un élève non autorisé en régime habituel (ex. élève ayant un club) peut manger
 * uniquement les dates précises listées dans `datesCantine`.
 */
export function controlerEleve(eleve: Eleve | null, date: string): Controle {
  if (!eleve) return { autorise: false, raison: 'Élève introuvable.' };
  if (!eleve.actif) return { autorise: false, raison: "Élève inactif (n'est plus inscrit)." };
  const dateAutorisee = !!eleve.datesCantine?.includes(date);
  if (!eleve.cantineAutorisee && !dateAutorisee) return { autorise: false, raison: "Élève non autorisé à la cantine (régime externe ou suspension)." };
  return { autorise: true };
}

export interface StatsCantine {
  passages: number;           // passages confirmés
  elevesDistincts: number;
  refus: number;
  doublons: number;
}

export function statistiques(lignes: PassageCantine[]): StatsCantine {
  const confirmes = lignes.filter((l) => l.statut === 'confirme');
  return {
    passages: confirmes.length,
    elevesDistincts: new Set(confirmes.map((l) => l.eleveId)).size,
    refus: lignes.filter((l) => l.statut === 'refuse').length,
    doublons: lignes.filter((l) => l.statut === 'doublon').length,
  };
}

export interface FiltresPassages {
  dateDebut: string;
  dateFin: string;
  classe?: string;
  eleveId?: string;
  service?: string;
  recherche?: string;   // nom ou prénom
}

export function filtrerPassages(lignes: PassageCantine[], f: FiltresPassages): PassageCantine[] {
  const q = f.recherche?.trim().toLowerCase();
  return lignes
    .filter((l) => l.date >= f.dateDebut && l.date <= f.dateFin)
    .filter((l) => !f.classe || l.classe === f.classe)
    .filter((l) => !f.eleveId || l.eleveId === f.eleveId)
    .filter((l) => !f.service || l.service === f.service)
    .filter((l) => !q || `${l.nom} ${l.prenom}`.toLowerCase().includes(q))
    .sort((a, b) => b.horodatage.localeCompare(a.horodatage));
}

/** Lignes d'export : uniquement les passages confirmés. */
export function lignesExport(lignes: PassageCantine[], services: ServiceCantine[]) {
  const libelle = (id: string) => services.find((s) => s.id === id)?.libelle ?? id;
  return lignes
    .filter((l) => l.statut === 'confirme')
    .sort((a, b) => a.date.localeCompare(b.date) || a.classe.localeCompare(b.classe) || a.nom.localeCompare(b.nom))
    .map((l) => ({
      Date: l.date,
      Service: libelle(l.service),
      Heure: new Date(l.horodatage).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Tunis' }),
      Nom: l.nom,
      Prénom: l.prenom,
      Classe: l.classe,
      'Identifiant élève': l.eleveId,
    }));
}

/** CSV compatible Excel (séparateur point-virgule, BOM UTF-8). */
export function versCsv(lignes: Record<string, string>[]): string {
  if (!lignes.length) return '﻿';
  const entetes = Object.keys(lignes[0]);
  const echapper = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  // Neutralise les formules (injection CSV).
  const securiser = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
  return '﻿' + [entetes.join(';'), ...lignes.map((l) => entetes.map((e) => echapper(securiser(String(l[e] ?? '')))).join(';'))].join('\r\n');
}
