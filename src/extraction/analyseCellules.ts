import type { Jour, Seance } from '../domain/types';
import { lireJour, lirePlage, normaliserHeure } from './cellule';
import { classeDuTitre, construireSeance, enLignes, minutesDe, nouvelId, versHeure as formatHeure, type Jeton, type OptionsAnalyse, type ResultatPage } from './analyseTableau';
import { contient, detecterCellules, encre, type Rect, type Region } from './cellules';
import type { ImageGris } from './grille';

const cx = (j: Jeton) => j.x + j.w / 2;
const cy = (j: Jeton) => j.y + j.h / 2;
const RE_ETIQUETTE = /^\W*(\d{1,2})\s*[hH:]\s*(\d{2})\W*$/;

type Sorte = 'debut' | 'fin' | 'milieu';
interface Ancre { y: number; m: number; sorte: Sorte; conf: number }

/**
 * Retire les très petites cases imbriquées dans une autre (cadres « Q1 », « Q2 »).
 * Une vraie case imbriquée dans une zone vide en forme de L est conservée.
 */
export function casesPrincipales(regions: Region[], largeurPage = 0, hauteurPage = 0): Region[] {
  const dedans = (a: Rect, b: Rect) => a !== b && a.x0 >= b.x0 - 2 && a.x1 <= b.x1 + 2 && a.y0 >= b.y0 - 2 && a.y1 <= b.y1 + 2;
  const L = largeurPage || Math.max(...regions.map((r) => r.x1)), H = hauteurPage || Math.max(...regions.map((r) => r.y1));
  const minuscule = (r: Rect) => r.x1 - r.x0 < L * 0.03 && r.y1 - r.y0 < H * 0.035;
  return regions.filter((r) => !(minuscule(r) && regions.some((o) => o !== r && dedans(r, o))));
}

/** Supprime les mots dessinés deux fois au même endroit (faux gras des PDF). */
export function sansDoublons(jetons: Jeton[]): Jeton[] {
  const r: Jeton[] = [];
  for (const j of jetons) if (!r.some((k) => k.texte === j.texte && Math.abs(k.x - j.x) < 2 && Math.abs(k.y - j.y) < 2)) r.push(j);
  return r;
}

/**
 * Conserve les repères horaires cohérents (heure croissante vers le bas) : sous-suite croissante
 * de poids maximal, un repère posé sur un trait comptant plus qu'une étiquette isolée.
 */
function coherents(ancres: Ancre[]): Ancre[] {
  const rang = { fin: 0, milieu: 1, debut: 2 };
  const a = [...ancres].sort((p, q) => p.y - q.y || rang[p.sorte] - rang[q.sorte]);
  const poids: number[] = a.map((x) => (x.sorte === 'milieu' ? 0.5 : 1));
  const total: number[] = [...poids], prec = a.map(() => -1);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < i; j++) {
      if (a[j].m <= a[i].m && total[j] + poids[i] > total[i]) { total[i] = total[j] + poids[i]; prec[i] = j; }
    }
  }
  let k = total.indexOf(Math.max(...total));
  const res: Ancre[] = [];
  while (k >= 0) { res.unshift(a[k]); k = prec[k]; }
  return res;
}

/**
 * Conversion d'une position verticale en heure. Un trait peut porter deux heures
 * (fin d'un cours au-dessus, début du suivant au-dessous, pause non représentée) :
 * le haut d'une case prend l'heure de début, le bas l'heure de fin.
 */
function convertisseur(ancres: Ancre[], tolerance: number, douteux: number[]) {
  return (y: number, bord: 'haut' | 'bas'): { m: number; exact: boolean } | null => {
    const proches = ancres.filter((a) => Math.abs(a.y - y) <= tolerance);
    const ordre: Sorte[] = bord === 'haut' ? ['debut', 'milieu', 'fin'] : ['fin', 'milieu', 'debut'];
    // Un repère illisible ou écarté près de ce trait : l'heure retenue n'est pas sûre.
    const suspect = douteux.some((d) => Math.abs(d - y) <= tolerance * 6);
    for (const s of ordre) {
      const a = proches.find((x) => x.sorte === s);
      if (a) return { m: a.m, exact: a.conf >= 85 && (s === ordre[0] || !suspect) };
    }
    const avant = ancres.filter((a) => a.y < y).sort((p, q) => q.y - p.y || (p.sorte === 'debut' ? -1 : 1))[0];
    const apres = ancres.filter((a) => a.y > y).sort((p, q) => p.y - q.y || (p.sorte === 'fin' ? -1 : 1))[0];
    if (!avant || !apres || apres.y === avant.y) return null;
    const m = avant.m + ((y - avant.y) / (apres.y - avant.y)) * (apres.m - avant.m);
    return { m: Math.round(m / 5) * 5, exact: false };
  };
}

/**
 * Analyse par cases : chaque zone fermée par les traits du tableau est une séance
 * potentielle. Adapté aux exports EDT (Index Éducation) : sous-colonnes de groupes,
 * cases fusionnées, axe horaire compressé, codes de groupe entre crochets.
 */
export function analyserParCellules(img: ImageGris, jetonsBruts: Jeton[], opts: OptionsAnalyse, regionsCalculees?: Region[]): ResultatPage | null {
  const avertissements: string[] = [];
  const jetons = sansDoublons(jetonsBruts);
  const cases = casesPrincipales(regionsCalculees ?? detecterCellules(img), img.largeur, img.hauteur);
  if (cases.length < 3) return null;

  // Rattache chaque mot à la plus petite case qui le contient.
  const contenu = new Map<Region, Jeton[]>();
  const horsCases: Jeton[] = [];
  for (const j of jetons) {
    const c = cases.filter((r) => contient(r, cx(j), cy(j))).sort((a, b) => (a.x1 - a.x0) * (a.y1 - a.y0) - (b.x1 - b.x0) * (b.y1 - b.y0))[0];
    if (c) contenu.set(c, [...(contenu.get(c) ?? []), j]); else horsCases.push(j);
  }
  const texte = (r: Region) => enLignes(contenu.get(r) ?? []).map((l) => l.texte).join(' ');

  // Colonnes des jours : noms de jours alignés (en-tête), dans une case ou au-dessus du tableau.
  const nomsJours = jetons.map((j) => ({ j, jour: lireJour(j.texte) })).filter((x): x is { j: Jeton; jour: Jour } => !!x.jour);
  if (nomsJours.length < 2) return null;
  const yEntete = nomsJours.map((x) => cy(x.j)).sort((a, b) => a - b)[Math.floor(nomsJours.length / 2)];
  const entetes = nomsJours.filter((x) => Math.abs(cy(x.j) - yEntete) < 25).sort((a, b) => cx(a.j) - cx(b.j));
  if (entetes.length < 2) return null;
  const casesSousEntete = cases.filter((r) => r.y0 > yEntete);
  const gauche = Math.min(...casesSousEntete.map((r) => r.x0));
  const droite = Math.max(...casesSousEntete.map((r) => r.x1));
  const bornes = entetes.map((e, i) => {
    const prec = entetes[i - 1], suiv = entetes[i + 1];
    const pas = suiv ? cx(suiv.j) - cx(e.j) : cx(e.j) - cx(prec.j);
    return {
      jour: e.jour,
      x0: prec ? (cx(prec.j) + cx(e.j)) / 2 : Math.max(gauche - 2, cx(e.j) - pas / 2),
      x1: suiv ? (cx(e.j) + cx(suiv.j)) / 2 : Math.min(droite + 2, cx(e.j) + pas / 2),
    };
  });
  const debutJours = bornes[0].x0;

  // Traits horizontaux du tableau (hauts et bas de cases).
  const traits: number[] = [];
  for (const r of cases) for (const y of [r.y0 - 2, r.y1 + 2]) if (!traits.some((t) => Math.abs(t - y) <= 5)) traits.push(y);
  const hauteurTexte = jetons.length ? jetons.map((j) => j.h).sort((a, b) => a - b)[Math.floor(jetons.length / 2)] : 12;

  // Repères horaires : étiquettes de l'axe (hors cases) et cases d'horaires à gauche des jours.
  const ancres: Ancre[] = [];
  const douteux: number[] = [];
  for (const j of horsCases) {
    if (cx(j) > debutJours || cy(j) < yEntete) continue;
    const m = RE_ETIQUETTE.exec(j.texte.trim());
    if (!m) {
      if (/\d\s*[hH:]\s*\d/.test(j.texte)) douteux.push(cy(j));
      continue;
    }
    // Étiquette lue avec une confiance insuffisante (OCR) : écartée, le trait voisin devient douteux.
    if (j.conf < 60) { douteux.push(cy(j)); continue; }
    const minutes = minutesDe(normaliserHeure(m[1], m[2]) ?? '00:00');
    const proche = traits.reduce((best, t) => (Math.abs(t - cy(j)) < Math.abs(best - cy(j)) ? t : best), Infinity);
    if (Math.abs(proche - cy(j)) <= hauteurTexte * 1.6) ancres.push({ y: proche, m: minutes, sorte: cy(j) < proche ? 'fin' : 'debut', conf: j.conf });
    else ancres.push({ y: cy(j), m: minutes, sorte: 'milieu', conf: j.conf });
  }
  for (const r of cases) {
    if ((r.x0 + r.x1) / 2 > debutJours) continue;
    const plage = lirePlage(texte(r));
    if (plage) {
      const conf = Math.min(...(contenu.get(r) ?? []).map((j) => j.conf));
      ancres.push({ y: r.y0 - 2, m: minutesDe(plage.debut), sorte: 'debut', conf });
      ancres.push({ y: r.y1 + 2, m: minutesDe(plage.fin), sorte: 'fin', conf });
    }
  }
  const valides = coherents(ancres);
  for (const a of ancres) if (!valides.includes(a)) douteux.push(a.y);
  if (valides.length < ancres.length) avertissements.push(`Page ${opts.page} : ${ancres.length - valides.length} repère(s) horaire(s) incohérent(s) ignoré(s).`);
  if (douteux.length > ancres.length - valides.length) avertissements.push(`Page ${opts.page} : certaines heures de l'axe sont illisibles ; les horaires voisins sont à vérifier.`);
  if (valides.length < 2) return null;
  const versHeure = convertisseur(valides, 8, douteux);

  const classePage = classeDuTitre(jetons, Math.min(yEntete, ...cases.map((r) => r.y0)) - 2);
  const seances: Seance[] = [];
  let illisibles = 0;
  for (const r of cases) {
    const mots = contenu.get(r);
    const xc = (r.x0 + r.x1) / 2;
    const col = bornes.find((b) => xc >= b.x0 && xc < b.x1);
    if (!col || r.y0 < yEntete) continue;
    if (!mots?.length) {
      // Case qui contient de l'encre mais aucun mot lu : jamais ignorée en silence.
      const marge = 4;
      // Encre propre à la zone : les cases incluses dans son cadre (zone en L) ne comptent pas.
      const autres = cases.filter((o) => o !== r && o.x0 >= r.x0 - 2 && o.x1 <= r.x1 + 2 && o.y0 >= r.y0 - 2 && o.y1 <= r.y1 + 2);
      if (encre(img, { x: r.x0 + marge, y: r.y0 + marge, w: r.x1 - r.x0 - 2 * marge, h: r.y1 - r.y0 - 2 * marge }, autres) > 0.01) {
        const d = versHeure(r.y0 - 2, 'haut'), f = versHeure(r.y1 + 2, 'bas');
        illisibles++;
        seances.push({
          id: nouvelId(), cible: opts.ciblesParDefaut.length === 1 ? opts.ciblesParDefaut[0] : classePage ? `classe:${classePage}` : '',
          jour: col.jour, debut: d ? formatHeure(d.m) : '', fin: f ? formatHeure(f.m) : '', matiere: '', enseignant: '', salle: '', semaine: 'toutes',
          incertitudes: ['debut', 'fin', 'cible', 'semaine'], texteSource: '[case illisible : à compléter ou supprimer]', page: opts.page,
        });
      }
      continue;
    }
    const lignes = enLignes(mots);
    if (lignes.every((l) => lireJour(l.texte))) continue; // case d'en-tête
    const d = versHeure(r.y0 - 2, 'haut'), f = versHeure(r.y1 + 2, 'bas');
    const s = construireSeance(lignes, col.jour, d?.m ?? null, f?.m ?? null, classePage, opts);
    if (!s) continue;
    // Zone non rectangulaire (case mal fermée) : son étendue, donc ses horaires, ne sont pas sûrs.
    const rectangulaire = r.aire >= 0.85 * (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
    const douteD = (d && !d.exact) || !rectangulaire, douteF = (f && !f.exact) || !rectangulaire;
    if (douteD || douteF) s.incertitudes = [...new Set([...(s.incertitudes ?? []), ...(douteD ? ['debut' as const] : []), ...(douteF ? ['fin' as const] : [])])];
    seances.push(s);
  }
  if (illisibles) avertissements.push(`Page ${opts.page} : ${illisibles} case(s) non lue(s) ; elles apparaissent dans le tableau et doivent être complétées ou supprimées.`);
  return { seances, avertissements, classePage, methode: 'cellules' };
}
