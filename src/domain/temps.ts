import type { Jour } from './types';

const JOURS_SEMAINE: (Jour | 'dimanche')[] = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export interface InstantLocal {
  date: string;   // AAAA-MM-JJ
  heure: string;  // HH:MM
  jour: Jour | 'dimanche';
}

/** Date et heure locales de l'établissement, indépendamment du fuseau du téléphone. */
export function instantLocal(maintenant: Date, fuseau: string): InstantLocal {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuseau,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(maintenant);
  const v = (t: string) => parts.find((p) => p.type === t)!.value;
  const date = `${v('year')}-${v('month')}-${v('day')}`;
  return { date, heure: `${v('hour')}:${v('minute')}`, jour: jourDeLaSemaine(date) };
}

export function jourDeLaSemaine(date: string): Jour | 'dimanche' {
  return JOURS_SEMAINE[dateUTC(date).getUTCDay()];
}

export function dateUTC(date: string): Date {
  const [a, m, j] = date.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j));
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ajouterJours(date: string, n: number): string {
  const d = dateUTC(date);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDate(d);
}

/** Lundi de la semaine contenant la date. */
export function lundiDe(date: string): string {
  const jour = dateUTC(date).getUTCDay(); // 0 = dimanche
  return ajouterJours(date, jour === 0 ? -6 : 1 - jour);
}

export function minutes(heure: string): number {
  const [h, m] = heure.split(':').map(Number);
  return h * 60 + m;
}

export function heureValide(heure: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(heure);
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
}

export function dateValide(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && formatDate(dateUTC(date)) === date;
}

/** "10:00" → "10 h 00" (présentation française). */
export function heureFr(heure: string): string {
  if (!heureValide(heure)) return heure || '—';
  const [h, m] = heure.split(':');
  return `${Number(h)} h ${m}`;
}

export function dateFr(date: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(dateUTC(date));
}

export function dansPeriode(date: string, debut: string, fin: string): boolean {
  return date >= debut && date <= fin;
}
