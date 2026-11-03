// Import d'un emploi du temps exporté depuis PRONOTE au format ICS (calendrier).
// Chaque événement devient une séance : les occurrences d'une même semaine type sont regroupées,
// et la semaine A ou B est déduite du calendrier de l'établissement.
import { typeSemaine } from './calendrier';
import { jourDeLaSemaine } from './temps';
import type { Calendrier, Jour, Seance } from './types';

const FUSEAU = 'Africa/Tunis';

export interface OccurrenceIcs {
  date: string;        // AAAA-MM-JJ, heure de l'établissement
  debut: string;       // HH:MM
  fin: string;         // HH:MM
  resume: string;      // matière (ou intitulé du groupe)
  lieu: string;        // salle
  description: string; // texte brut PRONOTE (classe, enseignant…), conservé pour vérification
}

export interface ResultatIcs {
  occurrences: OccurrenceIcs[];
  avertissements: string[];
}

interface Champ { valeur: string; tzid?: string }

/** Déplie les lignes (RFC 5545 : une ligne qui commence par un espace prolonge la précédente). */
function lignesIcs(texte: string): string[] {
  return texte.replace(/\r?\n[ \t]/g, '').split(/\r?\n/).filter((l) => l.length > 0);
}

const unEchappe = (v: string) => v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

function parties(instant: Date, fuseau: string): Record<string, string> {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-CA', {
    timeZone: fuseau, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant)) p[x.type] = x.value;
  return p;
}

/** Décalage (ms) entre l'heure murale d'un fuseau et UTC, à l'instant donné. */
function decalage(instant: Date, fuseau: string): number {
  const p = parties(instant, fuseau);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - instant.getTime();
}

/** Date et heure de l'établissement correspondant à une valeur DTSTART / DTEND. */
function versHeureEtablissement(champ: Champ): { date: string; heure: string } | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(champ.valeur);
  if (!m) return null;
  const [, a, mo, j, h, mi, , z] = m;
  let instant: Date;
  if (z) {
    instant = new Date(Date.UTC(+a, +mo - 1, +j, +h, +mi));
  } else if (champ.tzid) {
    const mur = Date.UTC(+a, +mo - 1, +j, +h, +mi);
    instant = new Date(mur - decalage(new Date(mur), champ.tzid));
  } else {
    // Heure « flottante » : déjà exprimée dans l'heure de l'établissement.
    return { date: `${a}-${mo}-${j}`, heure: `${h}:${mi}` };
  }
  const p = parties(instant, FUSEAU);
  return { date: `${p.year}-${p.month}-${p.day}`, heure: `${p.hour}:${p.minute}` };
}

export function lireIcs(texte: string): ResultatIcs {
  const occurrences: OccurrenceIcs[] = [];
  const avertissements: string[] = [];
  let evenement: Record<string, Champ> | null = null;
  let numero = 0;

  for (const ligne of lignesIcs(texte)) {
    if (ligne === 'BEGIN:VEVENT') { evenement = {}; numero++; continue; }
    if (ligne === 'END:VEVENT') {
      if (evenement) {
        const occ = versOccurrence(evenement);
        if (occ) occurrences.push(occ);
        else avertissements.push(`Événement n°${numero} ignoré : date, heure ou intitulé manquant.`);
      }
      evenement = null;
      continue;
    }
    if (!evenement) continue;
    const deux = ligne.indexOf(':');
    if (deux < 0) continue;
    const [nom, ...params] = ligne.slice(0, deux).split(';');
    const tzid = params.find((p) => p.startsWith('TZID='))?.slice(5);
    evenement[nom.toUpperCase()] = { valeur: ligne.slice(deux + 1), tzid };
  }
  return { occurrences, avertissements };
}

function versOccurrence(e: Record<string, Champ>): OccurrenceIcs | null {
  const debut = e.DTSTART && versHeureEtablissement(e.DTSTART);
  const fin = e.DTEND && versHeureEtablissement(e.DTEND);
  const resume = e.SUMMARY ? unEchappe(e.SUMMARY.valeur) : '';
  if (!debut || !fin || !resume || debut.date !== fin.date) return null;
  return {
    date: debut.date,
    debut: debut.heure,
    fin: fin.heure,
    resume,
    lieu: e.LOCATION ? unEchappe(e.LOCATION.valeur) : '',
    description: e.DESCRIPTION ? unEchappe(e.DESCRIPTION.valeur) : '',
  };
}

/**
 * Regroupe les occurrences en séances d'une même semaine type.
 * Un cours présent les semaines A et B devient « toutes les semaines » ; sinon il est A ou B.
 */
export function seancesDepuisOccurrences(occurrences: OccurrenceIcs[], cible: string, calendrier: Calendrier): Seance[] {
  const groupes = new Map<string, { seance: Omit<Seance, 'id'>; semaines: Set<'A' | 'B'> }>();
  for (const o of occurrences) {
    const jour = jourDeLaSemaine(o.date);
    if (jour === 'dimanche') continue;
    const cle = [jour, o.debut, o.fin, o.resume, o.lieu].join('|');
    let g = groupes.get(cle);
    if (!g) {
      g = {
        seance: {
          cible, jour: jour as Jour, debut: o.debut, fin: o.fin, matiere: o.resume, enseignant: '', salle: o.lieu,
          semaine: 'toutes', texteSource: o.description,
        },
        semaines: new Set(),
      };
      groupes.set(cle, g);
    }
    g.semaines.add(typeSemaine(o.date, calendrier));
  }
  return [...groupes.values()].map((g, i) => ({
    ...g.seance,
    id: `ics-${i + 1}`,
    semaine: g.semaines.size === 2 ? 'toutes' : [...g.semaines][0],
  }));
}
