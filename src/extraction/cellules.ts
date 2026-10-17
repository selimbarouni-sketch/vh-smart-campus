// Détection des cases d'un emploi du temps par régions : on repère les traits fins du tableau,
// puis chaque zone fermée par ces traits devient une case. Cette méthode gère les sous-colonnes
// de groupes, les cases fusionnées et les axes horaires compressés (exports EDT / Index Éducation).
import type { ImageGris } from './grille';

export interface Rect { x0: number; y0: number; x1: number; y1: number }

/**
 * Masque des traits fins : un pixel appartient à un trait horizontal s'il est nettement plus sombre
 * que les pixels situés quelques lignes au-dessus et au-dessous (et inversement pour un trait vertical).
 * Seules les longues séquences sont conservées : le texte n'en produit pas.
 */
export function masqueTraits(img: ImageGris, longueurMin = 20, ecart = 3, contraste = 22, trou = 1): Uint8Array {
  const { largeur: w, hauteur: h, px } = img;
  const m = new Uint8Array(w * h);
  const marquer = (horizontal: boolean) => {
    const L = horizontal ? h : w, C = horizontal ? w : h;
    const v = (a: number, b: number) => (horizontal ? px[a * w + b] : px[b * w + a]);
    const pose = (a: number, b: number) => { if (horizontal) m[a * w + b] = 1; else m[b * w + a] = 1; };
    for (let a = ecart + 1; a < L - ecart - 1; a++) {
      let debut = -1, dernier = -1;
      for (let b = 0; b <= C; b++) {
        let trait = false;
        if (b < C) {
          const p = v(a, b);
          const avant = v(a - ecart, b), apres = v(a + ecart, b);
          // Plus sombre des deux côtés, ou très sombre d'un côté (trait collé à du texte),
          // ou limite entre deux aplats de couleur (case colorée sans trait).
          trait = (p < 235 && ((p + contraste <= avant && p + contraste <= apres) || (p < 128 && p + 60 <= Math.max(avant, apres))))
            || (Math.abs(avant - apres) >= 45 && Math.abs(v(a - 1, b) - v(a + 1, b)) >= 30
              && Math.abs(v(a - ecart - 1, b) - avant) <= 6 && Math.abs(v(a + ecart + 1, b) - apres) <= 6);
        }
        if (trait) {
          if (debut < 0) debut = b;
          dernier = b;
        } else if (debut >= 0 && b - dernier > trou) {
          if (dernier - debut + 1 >= longueurMin) {
            // Prolongé de 2 pixels pour fermer les angles.
            for (let k = Math.max(0, debut - 2); k <= Math.min(C - 1, dernier + 2); k++) pose(a, k);
          }
          debut = -1;
        }
      }
    }
  };
  marquer(true);
  marquer(false);
  return dilater(m, w, h);
}

/** Épaissit les traits d'un pixel : ferme les passages d'un pixel aux croisements et sur les bords anticrénelés. */
function dilater(m: Uint8Array, w: number, h: number): Uint8Array {
  const r = new Uint8Array(m);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!m[i] && (m[i - 1] || m[i + 1] || m[i - w] || m[i + w] || m[i - w - 1] || m[i - w + 1] || m[i + w - 1] || m[i + w + 1])) r[i] = 1;
    }
  }
  return r;
}

export interface Region extends Rect { aire: number }

/** Zones fermées par les traits (remplissage 4-connexe). Les zones touchant le bord de l'image sont ignorées. */
export function regions(img: ImageGris, masque: Uint8Array): Region[] {
  const { largeur: w, hauteur: h } = img;
  const etiquette = new Int32Array(w * h);
  const pile = new Int32Array(w * h);
  const res: Region[] = [];
  let n = 0;
  for (let depart = 0; depart < w * h; depart++) {
    if (masque[depart] || etiquette[depart]) continue;
    n++;
    let haut = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, aire = 0, bord = false;
    pile[haut++] = depart;
    etiquette[depart] = n;
    while (haut) {
      const p = pile[--haut];
      const x = p % w, y = (p - x) / w;
      aire++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) bord = true;
      if (x > 0 && !masque[p - 1] && !etiquette[p - 1]) { etiquette[p - 1] = n; pile[haut++] = p - 1; }
      if (x < w - 1 && !masque[p + 1] && !etiquette[p + 1]) { etiquette[p + 1] = n; pile[haut++] = p + 1; }
      if (y > 0 && !masque[p - w] && !etiquette[p - w]) { etiquette[p - w] = n; pile[haut++] = p - w; }
      if (y < h - 1 && !masque[p + w] && !etiquette[p + w]) { etiquette[p + w] = n; pile[haut++] = p + w; }
    }
    const lw = x1 - x0 + 1, lh = y1 - y0 + 1;
    const minW = Math.max(14, w * 0.012), minH = Math.max(10, h * 0.01);
    if (!bord && lw >= minW && lh >= minH && aire >= 0.6 * lw * lh && lw * lh < 0.5 * w * h) {
      res.push({ x0, y0, x1, y1, aire });
    }
  }
  return res;
}

export function detecterCellules(img: ImageGris): Region[] {
  // Échelle des paramètres proportionnelle à la taille de la page.
  const f = Math.max(1, Math.min(img.largeur, img.hauteur) / 1200);
  return regions(img, masqueTraits(img, Math.round(20 * f), Math.max(3, Math.round(3 * f)), 22, Math.max(1, Math.round(f))));
}

export const contient = (r: Rect, x: number, y: number) => x >= r.x0 - 1 && x <= r.x1 + 1 && y >= r.y0 - 1 && y <= r.y1 + 1;

/** Proportion de pixels sombres dans une zone (hors zones exclues) : distingue une case vide d'une case illisible. */
export function encre(img: ImageGris, z: { x: number; y: number; w: number; h: number }, exclues: Rect[] = []): number {
  let n = 0, t = 0;
  for (let y = Math.max(0, z.y | 0); y < Math.min(img.hauteur, z.y + z.h); y += 2) {
    for (let x = Math.max(0, z.x | 0); x < Math.min(img.largeur, z.x + z.w); x += 2) {
      if (exclues.length && exclues.some((r) => contient(r, x, y))) continue;
      t++;
      if (img.px[y * img.largeur + x] < 120) n++;
    }
  }
  return t ? n / t : 0;
}
