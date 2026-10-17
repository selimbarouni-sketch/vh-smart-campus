import type { Calendrier } from './types';
import { ajouterJours, dansPeriode, lundiDe } from './temps';

export function vacancesDu(date: string, cal: Calendrier) {
  return cal.vacances.find((v) => dansPeriode(date, v.debut, v.fin));
}

export function ferieDu(date: string, cal: Calendrier) {
  return cal.feries.find((f) => f.date === date);
}

/** Une semaine "en vacances" : tous ses jours ouvrés (lundi → vendredi) sont en vacances ou fériés. */
function semaineSansCours(lundi: string, cal: Calendrier): boolean {
  for (let i = 0; i < 5; i++) {
    const d = ajouterJours(lundi, i);
    if (!vacancesDu(d, cal) && !ferieDu(d, cal)) return false;
  }
  return true;
}

/**
 * Type de semaine (A ou B) d'une date.
 * Règles, par ordre de priorité :
 *  1. forçage manuel de la semaine (semainesForcees) ;
 *  2. alternance depuis la semaine de référence, en ignorant les semaines
 *     de vacances si modeAlternance = "hors_vacances".
 * Un forçage sert aussi de nouveau point de départ pour les semaines suivantes.
 */
export function typeSemaine(date: string, cal: Calendrier): 'A' | 'B' {
  const cible = lundiDe(date);
  if (cal.semainesForcees[cible]) return cal.semainesForcees[cible];

  // Point d'ancrage : le forçage le plus proche avant la date, sinon la référence.
  let ancre = lundiDe(cal.reference.lundi);
  let typeAncre = cal.reference.type;
  for (const [lundi, t] of Object.entries(cal.semainesForcees)) {
    const l = lundiDe(lundi);
    if (l < cible && l > ancre && ancre <= cible) { ancre = l; typeAncre = t; }
  }

  const sens = cible >= ancre ? 1 : -1;
  let ecart = 0;
  for (let l = ancre; l !== cible; l = ajouterJours(l, 7 * sens)) {
    const suivante = ajouterJours(l, 7 * sens);
    const compte = cal.modeAlternance === 'continu' || !semaineSansCours(sens > 0 ? suivante : l, cal);
    if (compte) ecart++;
  }
  return ecart % 2 === 0 ? typeAncre : typeAncre === 'A' ? 'B' : 'A';
}
