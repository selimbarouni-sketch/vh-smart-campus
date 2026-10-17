import type { ChampSeance, Jour, Seance } from '../domain/types';
import { analyserCellule, lireClasse, lireJour, lirePlage, normaliserHeure, type ContenuCellule, type Ligne } from './cellule';
import { idGroupe } from '../domain/classes';
import type { Grille } from './grille';

/** Mot lu sur la page, en coordonnées de l'image (pixels). conf : 0–100. */
export interface Jeton {
  texte: string;
  x: number; y: number; w: number; h: number;
  conf: number;
}

export interface ResultatPage {
  seances: Seance[];
  avertissements: string[];
  classePage: string | null;
  methode: 'cellules' | 'grille' | 'positions' | 'liste';
}

let compteur = 0;
export const nouvelId = () => `s${Date.now().toString(36)}${(compteur++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const cx = (j: Jeton) => j.x + j.w / 2;
const cy = (j: Jeton) => j.y + j.h / 2;

/** Regroupe des mots en lignes de texte (ordre de lecture). */
export function enLignes(jetons: Jeton[]): Ligne[] {
  const tries = [...jetons].sort((a, b) => cy(a) - cy(b) || a.x - b.x);
  const lignes: Jeton[][] = [];
  for (const j of tries) {
    const l = lignes[lignes.length - 1];
    const hMoy = l ? l.reduce((s, x) => s + x.h, 0) / l.length : 0;
    if (l && Math.abs(cy(j) - cy(l[0])) < Math.max(4, hMoy * 0.5)) l.push(j);
    else lignes.push([j]);
  }
  return lignes.map((l) => {
    const t = [...l].sort((a, b) => a.x - b.x);
    return { texte: t.map((x) => x.texte).join(' '), conf: Math.min(...t.map((x) => x.conf)) };
  });
}

const RE_HEURES_TOUTES = /(\d{1,2})\s*[hH:]\s*(\d{2})?/g;
function heuresDans(texte: string): string[] {
  const r: string[] = [];
  for (const m of texte.matchAll(RE_HEURES_TOUTES)) {
    // Évite de confondre un numéro de salle avec une heure : "h" ou ":" obligatoire.
    const h = normaliserHeure(m[1], m[2]);
    if (h) r.push(h);
  }
  return r;
}

export const minutesDe = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
export const versHeure = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const arrondir5 = (m: number) => Math.round(m / 5) * 5;

interface Ancre { y: number; m: number }

/** Conversion position verticale → heure, par interpolation entre les repères horaires. */
function interpolateur(ancres: Ancre[]) {
  const a = [...ancres].sort((p, q) => p.y - q.y).filter((p, i, t) => i === 0 || p.y - t[i - 1].y > 2);
  return (y: number): number | null => {
    if (a.length < 2) return null;
    if (y < a[0].y - 3 || y > a[a.length - 1].y + 3) return null;
    for (let i = 0; i < a.length - 1; i++) {
      if (y <= a[i + 1].y + 3) {
        const t = Math.min(1, Math.max(0, (y - a[i].y) / (a[i + 1].y - a[i].y)));
        return arrondir5(a[i].m + t * (a[i + 1].m - a[i].m));
      }
    }
    return a[a.length - 1].m;
  };
}

export interface OptionsAnalyse {
  page: number;
  ciblesParDefaut: string[];
  seuilConfiance?: number;
}

/**
 * Cible d'une séance, par ordre de priorité : code de groupe écrit dans la case,
 * classe écrite dans la case, classe choisie à l'import, classe du titre de la page.
 */
function cibleDe(c: ContenuCellule, classePage: string | null, opts: OptionsAnalyse): { cible: string; incertain: boolean } {
  if (c.codeGroupe) return { cible: `groupe:${idGroupe(c.codeGroupe)}`, incertain: false };
  const defaut = opts.ciblesParDefaut.length === 1 ? opts.ciblesParDefaut[0] : null;
  const reference = defaut?.startsWith('classe:') ? defaut.slice(7) : classePage;
  if (c.classe) return { cible: `classe:${c.classe}`, incertain: !!reference && c.classe !== reference };
  if (defaut) return { cible: defaut, incertain: false };
  if (classePage) return { cible: `classe:${classePage}`, incertain: false };
  return { cible: '', incertain: true };
}

export function construireSeance(
  lignes: Ligne[], jour: Jour, debutGrille: number | null, finGrille: number | null,
  classePage: string | null, opts: OptionsAnalyse, incertitudesSup: ChampSeance[] = [],
): Seance | null {
  const c = analyserCellule(lignes, opts.seuilConfiance);
  if (!c.matiere && !c.enseignant && !c.salle) return null;
  const inc = new Set<ChampSeance>([...c.incertitudes, ...incertitudesSup]);
  let debut = '', fin = '';
  if (c.plage) {
    debut = c.plage.debut; fin = c.plage.fin;
    // Horaire écrit dans la case : prioritaire, mais signalé s'il contredit la grille.
    if (debutGrille !== null && Math.abs(minutesDe(debut) - debutGrille) > 10) inc.add('debut');
    if (finGrille !== null && Math.abs(minutesDe(fin) - finGrille) > 10) inc.add('fin');
  } else {
    if (debutGrille !== null) debut = versHeure(debutGrille); else inc.add('debut');
    if (finGrille !== null) fin = versHeure(finGrille); else inc.add('fin');
  }
  const { cible, incertain } = cibleDe(c, classePage, opts);
  if (incertain) inc.add('cible');
  const confs = lignes.map((l) => l.conf);
  return {
    id: nouvelId(), cible, jour, debut, fin,
    matiere: c.matiere, enseignant: c.enseignant, salle: c.salle, semaine: c.semaine,
    incertitudes: [...inc], texteSource: c.texteSource, indiceGroupe: c.groupe ?? undefined,
    page: opts.page, confiance: Math.round(Math.min(...confs, 100)) / 100,
  };
}

/** Classe indiquée en dehors du tableau (titre de page). */
export function classeDuTitre(jetons: Jeton[], limiteY: number): string | null {
  const lignes = enLignes(jetons.filter((j) => cy(j) < limiteY));
  for (const l of lignes) {
    if (/classe|emploi|edt|groupe/i.test(l.texte) || lignes.length <= 3) {
      const c = lireClasse(l.texte);
      if (c) return c;
    }
  }
  for (const l of lignes) { const c = lireClasse(l.texte); if (c) return c; }
  return null;
}

/** Sépare des mots d'une même case en colonnes lorsqu'un large espace vertical les sépare (groupes côte à côte). */
function sousColonnes(jetons: Jeton[], largeurCase: number): Jeton[][] {
  const tries = [...jetons].sort((a, b) => a.x - b.x);
  const groupes: Jeton[][] = [];
  let finX = -Infinity;
  for (const j of tries) {
    if (groupes.length && j.x - finX > largeurCase * 0.12) groupes.push([j]);
    else if (groupes.length) groupes[groupes.length - 1].push(j);
    else groupes.push([j]);
    finX = Math.max(finX, j.x + j.w);
  }
  // Ne sépare que si chaque partie contient plusieurs lignes (sinon : mots d'une même ligne).
  if (groupes.length > 1 && groupes.every((g) => enLignes(g).length >= 2)) return groupes;
  return [jetons];
}

/** Analyse d'une page à partir de la grille détectée (traits du tableau). */
export function analyserAvecGrille(grille: Grille, jetons: Jeton[], opts: OptionsAnalyse): ResultatPage {
  const avertissements: string[] = [];
  const { xs, ys, bordHorizontal } = grille;
  const R = ys.length - 1, C = xs.length - 1;
  const cellule = (j: Jeton): [number, number] | null => {
    const x = cx(j), y = cy(j);
    const c = xs.findIndex((v, i) => i < C && x >= v && x < xs[i + 1]);
    const r = ys.findIndex((v, i) => i < R && y >= v && y < ys[i + 1]);
    return c < 0 || r < 0 ? null : [r, c];
  };
  const cases: Jeton[][][] = Array.from({ length: R }, () => Array.from({ length: C }, () => []));
  for (const j of jetons) {
    const rc = cellule(j);
    if (rc) cases[rc[0]][rc[1]].push(j);
  }
  const texteCase = (r: number, c: number) => enLignes(cases[r][c]).map((l) => l.texte).join(' ');

  // Rangée d'en-tête : celle qui contient le plus de noms de jours.
  let rangEntete = -1, joursParColonne: (Jour | null)[] = [];
  for (let r = 0; r < Math.min(R, 4); r++) {
    const jrs = Array.from({ length: C }, (_, c) => texteCase(r, c).split(/\s+/).map(lireJour).find(Boolean) ?? null);
    if (jrs.filter(Boolean).length > joursParColonne.filter(Boolean).length) { rangEntete = r; joursParColonne = jrs; }
  }
  const classePage = classeDuTitre(jetons, ys[0]) ?? null;
  if (rangEntete < 0 || joursParColonne.filter(Boolean).length < 1) {
    avertissements.push(`Page ${opts.page} : aucun nom de jour trouvé dans l'en-tête du tableau.`);
    return { seances: [], avertissements, classePage, methode: 'grille' };
  }

  // Colonne des horaires : la colonne sans jour contenant le plus d'heures.
  let colHeures = -1, maxH = 0;
  for (let c = 0; c < C; c++) {
    if (joursParColonne[c]) continue;
    let n = 0;
    for (let r = rangEntete + 1; r < R; r++) if (heuresDans(texteCase(r, c)).length) n++;
    if (n > maxH) { maxH = n; colHeures = c; }
  }

  // Repères horaires (blocs de la colonne des heures, cellules fusionnées comprises).
  const ancres: Ancre[] = [];
  if (colHeures >= 0) {
    const blocs: [number, number][] = [];
    let r0 = rangEntete + 1;
    for (let r = rangEntete + 1; r < R; r++) {
      const separe = r === R - 1 || bordHorizontal[r]?.[colHeures] !== false;
      if (separe) { blocs.push([r0, r]); r0 = r + 1; }
    }
    const debuts: (number | null)[] = [];
    const fins: (number | null)[] = [];
    for (const [a, b] of blocs) {
      const t = [];
      for (let r = a; r <= b; r++) t.push(texteCase(r, colHeures));
      const plage = lirePlage(t.join(' '));
      const hs = heuresDans(t.join(' '));
      if (plage) { debuts.push(minutesDe(plage.debut)); fins.push(minutesDe(plage.fin)); }
      else if (hs.length >= 2) { debuts.push(minutesDe(hs[0])); fins.push(minutesDe(hs[hs.length - 1])); }
      else if (hs.length === 1) { debuts.push(minutesDe(hs[0])); fins.push(null); }
      else { debuts.push(null); fins.push(null); }
    }
    blocs.forEach(([a, b], i) => {
      if (debuts[i] !== null) ancres.push({ y: ys[a], m: debuts[i]! });
      const f = fins[i] ?? debuts[i + 1] ?? null;
      if (f !== null) ancres.push({ y: ys[b + 1], m: f });
    });
  }
  const versMinutes = interpolateur(ancres);
  if (ancres.length < 2) avertissements.push(`Page ${opts.page} : impossible de lire les horaires de la grille ; seuls les horaires écrits dans les cases seront utilisés.`);

  // Plages horaires élémentaires (pour les cases A/B empilées).
  const creneaux: [number, number][] = [];
  const ancresTriees = [...ancres].sort((a, b) => a.y - b.y);
  for (let i = 0; i < ancresTriees.length - 1; i++) creneaux.push([ancresTriees[i].m, ancresTriees[i + 1].m]);

  const seances: Seance[] = [];
  for (let c = 0; c < C; c++) {
    const jour = joursParColonne[c];
    if (!jour) continue;
    let r0 = rangEntete + 1;
    for (let r = rangEntete + 1; r < R; r++) {
      const fermeture = r === R - 1 || bordHorizontal[r]?.[c] !== false;
      if (!fermeture) continue;
      const contenu: Jeton[] = [];
      for (let k = r0; k <= r; k++) contenu.push(...cases[k][c]);
      const multi = r > r0;
      if (contenu.length) {
        let d = versMinutes(ys[r0]), f = versMinutes(ys[r + 1]);
        const parties = sousColonnes(contenu, xs[c + 1] - xs[c]);
        for (const partie of parties) {
          const inc: ChampSeance[] = [];
          if (parties.length > 1) inc.push('cible');
          const s = construireSeance(enLignes(partie), jour, d, f, classePage, opts, inc);
          if (!s) continue;
          // Case A/B empilée dans un créneau : la séance occupe le créneau entier.
          if (s.semaine !== 'toutes' && d !== null && f !== null) {
            const cr = creneaux.find(([a, b]) => d! >= a && f! <= b && (d! > a || f! < b));
            if (cr && !lirePlage(s.texteSource ?? '')) { s.debut = versHeure(cr[0]); s.fin = versHeure(cr[1]); }
          }
          if (multi && !lirePlage(s.texteSource ?? '')) s.texteSource = `${s.texteSource} [case fusionnée sur ${r - r0 + 1} rangées]`;
          seances.push(s);
        }
        d = f = null;
      }
      r0 = r + 1;
    }
  }
  return { seances, avertissements, classePage, methode: 'grille' };
}

/**
 * Analyse sans traits de tableau : position des noms de jours (colonnes)
 * et des horaires (marge gauche). Les horaires sont alors marqués incertains.
 */
export function analyserParPositions(jetons: Jeton[], opts: OptionsAnalyse): ResultatPage {
  const avertissements: string[] = [];
  const entetes = jetons.map((j) => ({ j, jour: lireJour(j.texte) })).filter((x) => x.jour) as { j: Jeton; jour: Jour }[];
  // Les jours de l'en-tête sont alignés horizontalement.
  const yEntete = entetes.length ? mediane(entetes.map((e) => cy(e.j))) : 0;
  const cols = entetes.filter((e) => Math.abs(cy(e.j) - yEntete) < 20).sort((a, b) => cx(a.j) - cx(b.j));
  const classePage = classeDuTitre(jetons, yEntete - 5);
  if (cols.length < 2) {
    avertissements.push(`Page ${opts.page} : structure du tableau non reconnue (moins de deux jours alignés).`);
    return { seances: [], avertissements, classePage, methode: 'positions' };
  }
  const pas = (cx(cols[cols.length - 1].j) - cx(cols[0].j)) / (cols.length - 1);
  const limites = cols.map((c) => [cx(c.j) - pas / 2, cx(c.j) + pas / 2] as [number, number]);
  const xGauche = limites[0][0];

  const ancres: Ancre[] = [];
  for (const j of jetons) {
    if (cx(j) >= xGauche || cy(j) <= yEntete + 5) continue;
    const plage = lirePlage(j.texte);
    if (plage) { ancres.push({ y: j.y, m: minutesDe(plage.debut) }); continue; }
    const h = heuresDans(j.texte);
    if (h.length === 1 && /^\s*\d{1,2}\s*[hH:]\s*\d{0,2}\s*$/.test(j.texte)) ancres.push({ y: j.y, m: minutesDe(h[0]) });
  }
  const versMinutes = interpolateur(ancres);

  const seances: Seance[] = [];
  cols.forEach((col, i) => {
    const dans = jetons
      .filter((j) => cy(j) > yEntete + 8 && cx(j) >= limites[i][0] && cx(j) < limites[i][1])
      .sort((a, b) => a.y - b.y);
    // Blocs : séparés par un espace vertical supérieur à une ligne et demie.
    const blocs: Jeton[][] = [];
    for (const j of dans) {
      const b = blocs[blocs.length - 1];
      const bas = b ? Math.max(...b.map((x) => x.y + x.h)) : 0;
      if (b && j.y - bas < j.h * 1.5) b.push(j);
      else blocs.push([j]);
    }
    for (const b of blocs) {
      const haut = Math.min(...b.map((x) => x.y)), bas = Math.max(...b.map((x) => x.y + x.h));
      const s = construireSeance(enLignes(b), col.jour, versMinutes(haut), versMinutes(bas), classePage, opts, ['debut', 'fin']);
      if (s) {
        if (lirePlage(s.texteSource ?? '')) s.incertitudes = s.incertitudes!.filter((x) => x !== 'debut' && x !== 'fin');
        seances.push(s);
      }
    }
  });
  avertissements.push(`Page ${opts.page} : traits du tableau non détectés ; horaires estimés d'après la position du texte, à vérifier.`);
  return { seances, avertissements, classePage, methode: 'positions' };
}

/** Format liste : "Lundi 08:00-09:00 Mathématiques M. Martin Salle 204". */
export function analyserListe(lignes: string[], opts: OptionsAnalyse): ResultatPage {
  const seances: Seance[] = [];
  let jourCourant: Jour | null = null;
  let classePage: string | null = null;
  for (const brut of lignes) {
    const l = brut.trim();
    if (!l) continue;
    const premier = l.split(/\s+/)[0];
    const j = lireJour(premier);
    if (j) jourCourant = j;
    const plage = lirePlage(l);
    if (!plage) {
      if (!classePage) classePage = lireClasse(l);
      continue;
    }
    if (!jourCourant) continue;
    const reste = l.replace(j ? premier : '', '').trim();
    const morceaux = reste.split(/\s{2,}|\t|\s[|;]\s/).filter(Boolean);
    const s = construireSeance(morceaux.map((t) => ({ texte: t, conf: 100 })), jourCourant, null, null, classePage, opts);
    if (s) seances.push(s);
  }
  return { seances, avertissements: [], classePage, methode: 'liste' };
}

function mediane(v: number[]): number {
  const t = [...v].sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
}
