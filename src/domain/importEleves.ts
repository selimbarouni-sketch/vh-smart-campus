// Import d'une liste d'élèves (copier-coller depuis Excel/Pronote, CSV, TSV).
// Seules les données utiles sont retenues : nom, prénom(s), classe, autorisation cantine.
// La date de naissance éventuelle n'est pas conservée.
import type { Eleve } from './types';
import { normaliserClasse } from './classes';

export interface EleveImporte {
  ligne: number;
  nomComplet: string;
  nom: string;
  prenom: string;
  classe: string;
  regime: string;
  cantineAutorisee: boolean;
  /** Vrai quand la séparation nom / prénom(s) est une supposition à faire vérifier. */
  decoupageIncertain: boolean;
}

/** Découpe un texte tabulaire (tabulation, point-virgule ou virgule), guillemets compris. */
export function lireTableau(texte: string): string[][] {
  const lignes = texte.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lignes.length) return [];
  const sep = lignes[0].includes('\t') ? '\t' : lignes[0].split(';').length >= lignes[0].split(',').length ? ';' : ',';
  return lignes.map((l) => {
    const cellules: string[] = [];
    let cour = '', guill = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') {
        if (guill && l[i + 1] === '"') { cour += '"'; i++; } else guill = !guill;
      } else if (c === sep && !guill) { cellules.push(cour.trim()); cour = ''; } else cour += c;
    }
    cellules.push(cour.trim());
    return cellules;
  });
}

const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const PARTICULES = new Set(['ben', 'bel', 'bou', 'el', 'al', 'ait', 'abd', 'abou', 'ould', 'da', 'de', 'di', 'du', 'des', 'le', 'la', 'van', 'von', 'mac', 'mc', 'ibn', 'bin', 'ep', 'epouse']);

/**
 * Sépare « NOM Prénom(s) » écrits dans une seule colonne.
 *  - NOM en majuscules (format Pronote) : séparation certaine ;
 *  - deux mots : séparation certaine ;
 *  - au-delà : supposition (particules « Ben », « El »… rattachées au nom), à faire vérifier.
 */
export function separerNomPrenom(complet: string): { nom: string; prenom: string; incertain: boolean } {
  const mots = complet.trim().split(/\s+/).filter(Boolean);
  if (mots.length <= 1) return { nom: mots[0] ?? '', prenom: '', incertain: true };
  const majuscule = (m: string) => m.length > 1 && m === m.toUpperCase() && /[A-ZÀ-Ü]/.test(m);
  const nbMaj = mots.findIndex((m) => !majuscule(m));
  if (nbMaj > 0 && mots.slice(nbMaj).every((m) => !majuscule(m))) {
    return { nom: mots.slice(0, nbMaj).join(' '), prenom: mots.slice(nbMaj).join(' '), incertain: false };
  }
  if (mots.length === 2) return { nom: mots[0], prenom: mots[1], incertain: false };
  let n = 1;
  while (n < mots.length - 1 && PARTICULES.has(sansAccent(mots[n - 1]).replace(/-$/, ''))) n++;
  return { nom: mots.slice(0, n).join(' '), prenom: mots.slice(n).join(' '), incertain: true };
}

/** Pronote : « DEMI-PENSIONNAIRE … », « INTERNE … » → cantine ; « EXTERNE » ou vide → pas de cantine. */
export function regimeAutoriseCantine(regime: string): boolean {
  const r = sansAccent(regime);
  if (!r || r.includes('externe')) return false;
  return r.includes('demi-pension') || r.includes('demi pension') || r.includes('dp') || r.includes('interne');
}

export function analyserListeEleves(tableau: string[][]): { eleves: EleveImporte[]; avertissements: string[] } {
  const avertissements: string[] = [];
  if (!tableau.length) return { eleves: [], avertissements: ['Liste vide.'] };
  const entete = tableau[0].map(sansAccent);
  const col = (...noms: string[]) => entete.findIndex((e) => noms.some((n) => e === n || e.startsWith(n)));
  let iEleve = col('eleve', 'élève', 'nom et prenom', 'nom prenom');
  let iNom = col('nom');
  const iPrenom = col('prenom');
  let iClasse = col('classe', 'division');
  const iRegime = col('regime', 'régime');
  const aEntete = iClasse >= 0 || iEleve >= 0 || iNom >= 0;
  const donnees = aEntete ? tableau.slice(1) : tableau;
  if (!aEntete) {
    // Sans en-tête : « élève ; date ; classe ; régime » (export Pronote) ou « nom ; prénom ; classe ; régime ».
    avertissements.push("Aucune ligne d'en-tête reconnue : colonnes supposées « Élève, (date), Classe, Régime ».");
    iEleve = 0; iClasse = /\d{2}\/\d{2}\/\d{4}/.test(tableau[0][1] ?? '') ? 2 : 1;
  }
  if (iEleve === iNom) iNom = -1;
  if (iClasse < 0) avertissements.push('Colonne « Classe » introuvable.');
  if (iRegime < 0) avertissements.push('Colonne « Régime » introuvable : la cantine sera refusée par défaut, à cocher élève par élève.');

  const eleves: EleveImporte[] = [];
  donnees.forEach((cells, k) => {
    const ligne = k + (aEntete ? 2 : 1);
    let nom: string, prenom: string, incertain: boolean, nomComplet: string;
    if (iNom >= 0 && iPrenom >= 0) {
      nom = cells[iNom] ?? ''; prenom = cells[iPrenom] ?? ''; incertain = false; nomComplet = `${nom} ${prenom}`.trim();
    } else {
      nomComplet = (cells[iEleve >= 0 ? iEleve : 0] ?? '').trim();
      ({ nom, prenom, incertain } = separerNomPrenom(nomComplet));
    }
    if (!nomComplet) return;
    const classeBrute = iClasse >= 0 ? cells[iClasse] ?? '' : '';
    const regime = iRegime >= 0 ? cells[iRegime] ?? '' : '';
    if (!classeBrute.trim()) avertissements.push(`Ligne ${ligne} (${nomComplet}) : classe manquante.`);
    eleves.push({
      ligne, nomComplet, nom, prenom, classe: classeBrute.trim() ? normaliserClasse(classeBrute) : '',
      regime, cantineAutorisee: regimeAutoriseCantine(regime), decoupageIncertain: incertain,
    });
  });
  return { eleves, avertissements };
}

export const cleEleve = (nom: string, prenom: string) => sansAccent(`${nom} ${prenom}`).replace(/[^a-z0-9]+/g, ' ').trim();

export type ActionImport = { type: 'creer' } | { type: 'mettre_a_jour'; eleve: Eleve; changements: string[] } | { type: 'inchange'; eleve: Eleve } | { type: 'ambigu'; candidats: Eleve[] };

/** Rapproche chaque ligne importée des élèves déjà enregistrés (même nom complet). */
export function rapprocher(importe: EleveImporte, existants: Eleve[]): ActionImport {
  const cle = cleEleve(importe.nom, importe.prenom);
  const memes = existants.filter((e) => cleEleve(e.nom, e.prenom) === cle);
  if (memes.length > 1) return { type: 'ambigu', candidats: memes };
  if (!memes.length) return { type: 'creer' };
  const e = memes[0];
  const changements: string[] = [];
  if (e.classe !== importe.classe && importe.classe) changements.push(`classe ${e.classe} → ${importe.classe}`);
  if (e.cantineAutorisee !== importe.cantineAutorisee) changements.push(importe.cantineAutorisee ? 'cantine autorisée' : 'cantine retirée');
  if (!e.actif) changements.push('réactivé');
  return changements.length ? { type: 'mettre_a_jour', eleve: e, changements } : { type: 'inchange', eleve: e };
}
