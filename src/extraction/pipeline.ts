import type { Seance } from '../domain/types';
import { analyserAvecGrille, analyserListe, analyserParPositions, enLignes, type Jeton, type OptionsAnalyse, type ResultatPage } from './analyseTableau';
import { detecterGrille, type ImageGris } from './grille';
import { analyserParCellules } from './analyseCellules';

export interface ElementTextePdf {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/**
 * Convertit les éléments texte de pdf.js en mots positionnés dans le repère de l'image rendue.
 * `versPixels` correspond à viewport.convertToViewportPoint.
 */
export function jetonsDepuisPdf(items: ElementTextePdf[], echelle: number, versPixels: (x: number, y: number) => number[]): Jeton[] {
  const r: Jeton[] = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const [x, yBase] = versPixels(it.transform[4], it.transform[5]);
    const hauteur = (it.height || Math.abs(it.transform[3]) || 10) * echelle;
    const largeur = it.width * echelle;
    // Découpe en mots, largeur répartie proportionnellement au nombre de caractères.
    const mots = it.str.split(/(\s+)/);
    const total = it.str.length || 1;
    let pos = 0;
    for (const m of mots) {
      if (m.trim()) {
        r.push({ texte: m, x: x + (pos / total) * largeur, y: yBase - hauteur, w: (m.length / total) * largeur, h: hauteur, conf: 100 });
      }
      pos += m.length;
    }
  }
  return r;
}

export interface ResultatAnalyse extends ResultatPage {
  grilleDetectee: boolean;
}

/** Score d'un résultat : séances complètes, pénalisées par les horaires incertains. */
function score(r: ResultatPage | null): number {
  if (!r) return -1;
  return r.seances.reduce((t, s) => {
    const complete = s.debut && s.fin && s.matiere ? 1 : 0.3;
    const doute = (s.incertitudes ?? []).filter((c) => c === 'debut' || c === 'fin').length * 0.2;
    return t + complete - doute;
  }, 0);
}

/**
 * Analyse d'une page (image en niveaux de gris + mots positionnés), quelle que soit leur origine.
 * Deux lectures de la structure sont tentées (cases fermées, grille de lignes) ; la plus complète est retenue.
 */
export function analyserPage(gris: ImageGris, jetons: Jeton[], opts: OptionsAnalyse): ResultatAnalyse {
  const parCases = analyserParCellules(gris, jetons, opts);
  const grille = detecterGrille(gris);
  let parGrille: ResultatPage | null = grille ? analyserAvecGrille(grille, jetons, opts) : null;
  if (parGrille && parGrille.seances.length === 0) parGrille = null;
  let res: ResultatPage | null = score(parCases) >= score(parGrille) ? parCases : parGrille;
  if (res && res.seances.length === 0) res = null;
  if (!res) {
    const pos = analyserParPositions(jetons, opts);
    if (pos.seances.length) res = pos;
  }
  if (!res) {
    const liste = analyserListe(enLignes(jetons).map((l) => l.texte), opts);
    res = liste.seances.length ? liste : { seances: [], avertissements: [`Page ${opts.page} : aucune séance n'a pu être extraite automatiquement. Ajoutez les séances manuellement ou essayez l'analyse multimodale.`], classePage: null, methode: 'positions' };
  }
  const defaut = opts.ciblesParDefaut.length === 1 && opts.ciblesParDefaut[0].startsWith('classe:') ? opts.ciblesParDefaut[0].slice(7) : null;
  if (defaut && res.classePage && res.classePage !== defaut) {
    res.avertissements.push(`Page ${opts.page} : le titre indique la classe ${res.classePage}, mais l'import a été déclaré pour ${defaut}. Vérifiez la classe.`);
  }
  return { ...res, grilleDetectee: res.methode === 'grille' || res.methode === 'cellules' };
}

/** Une page de PDF est considérée comme "texte" si elle contient suffisamment de mots exploitables. */
export function pageTexteExploitable(jetons: Jeton[]): boolean {
  const lettres = jetons.reduce((s, j) => s + j.texte.replace(/[^A-Za-zÀ-ÿ0-9]/g, '').length, 0);
  return jetons.length >= 8 && lettres >= 40;
}

/** Fusionne les séances de plusieurs pages ou méthodes, en éliminant les doublons exacts. */
export function dedoublonner(seances: Seance[]): Seance[] {
  const vues = new Set<string>();
  return seances.filter((s) => {
    const k = [s.cible, s.jour, s.debut, s.fin, s.matiere, s.enseignant, s.salle, s.semaine].join('|');
    if (vues.has(k)) return false;
    vues.add(k);
    return true;
  });
}
