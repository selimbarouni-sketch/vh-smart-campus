// Vision par ordinateur légère (sans dépendance) : redressement d'une page scannée
// et détection des lignes du tableau, y compris les cellules fusionnées.
// Fonctionne sur une image en niveaux de gris, dans le navigateur comme dans Node.

export interface ImageGris {
  largeur: number;
  hauteur: number;
  px: Uint8Array; // 0 = noir, 255 = blanc
}

export function versGris(rgba: Uint8ClampedArray | Uint8Array, largeur: number, hauteur: number): ImageGris {
  const px = new Uint8Array(largeur * hauteur);
  for (let i = 0, j = 0; i < px.length; i++, j += 4) {
    // Fond transparent considéré comme blanc.
    const a = rgba[j + 3] / 255;
    const g = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
    px[i] = Math.round(g * a + 255 * (1 - a));
  }
  return { largeur, hauteur, px };
}

/** Estime l'inclinaison (en degrés) par maximisation de la variance du profil horizontal. */
export function estimerInclinaison(img: ImageGris, maxDeg = 4, pas = 0.2): number {
  const ech = Math.max(1, Math.floor(img.largeur / 600));
  const pts: [number, number][] = [];
  for (let y = 0; y < img.hauteur; y += ech) {
    for (let x = 0; x < img.largeur; x += ech) {
      if (img.px[y * img.largeur + x] < 128) pts.push([x, y]);
    }
  }
  if (pts.length < 50) return 0;
  let meilleur = 0, meilleureVar = -1;
  for (let deg = -maxDeg; deg <= maxDeg + 1e-9; deg += pas) {
    const t = Math.tan((deg * Math.PI) / 180);
    const bins = new Float64Array(Math.ceil(img.hauteur / ech) + Math.ceil((img.largeur * Math.abs(t)) / ech) + 2);
    const decal = t < 0 ? Math.ceil((img.largeur * -t) / ech) : 0;
    for (const [x, y] of pts) bins[Math.floor((y - x * t) / ech) + decal]++;
    let s = 0, s2 = 0;
    for (const b of bins) { s += b; s2 += b * b; }
    const v = s2 / bins.length - (s / bins.length) ** 2;
    if (v > meilleureVar + 1e-9) { meilleureVar = v; meilleur = deg; }
  }
  return Math.round(meilleur * 100) / 100;
}

/** Extrait une zone rectangulaire (coordonnées entières, bornées à l'image). */
export function decouper(img: ImageGris, z: { x: number; y: number; w: number; h: number }): ImageGris {
  const x0 = Math.max(0, Math.round(z.x)), y0 = Math.max(0, Math.round(z.y));
  const w = Math.max(1, Math.min(img.largeur - x0, Math.round(z.w))), h = Math.max(1, Math.min(img.hauteur - y0, Math.round(z.h)));
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) px.set(img.px.subarray((y0 + y) * img.largeur + x0, (y0 + y) * img.largeur + x0 + w), y * w);
  return { largeur: w, hauteur: h, px };
}

/** Binarisation d'Otsu : texte noir sur fond blanc, quel que soit l'aplat de couleur de la case. */
export function binariser(img: ImageGris): ImageGris {
  const hist = new Array(256).fill(0);
  for (const v of img.px) hist[v]++;
  const total = img.px.length;
  let somme = 0;
  for (let i = 0; i < 256; i++) somme += i * hist[i];
  let sB = 0, wB = 0, meilleur = 0, seuil = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sB += t * hist[t];
    const mB = sB / wB, mF = (somme - sB) / wF;
    const v = wB * wF * (mB - mF) ** 2;
    if (v > meilleur) { meilleur = v; seuil = t; }
  }
  const px = new Uint8Array(img.px.length);
  for (let i = 0; i < px.length; i++) px[i] = img.px[i] > seuil ? 255 : 0;
  return { largeur: img.largeur, hauteur: img.hauteur, px };
}

/** Rotation autour du centre (plus proche voisin), fond blanc. */
export function pivoter(img: ImageGris, deg: number): ImageGris {
  if (Math.abs(deg) < 0.05) return img;
  const r = (-deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const { largeur: w, hauteur: h } = img;
  const cx = w / 2, cy = h / 2;
  const px = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      const sx = Math.round(c * dx - s * dy + cx), sy = Math.round(s * dx + c * dy + cy);
      if (sx >= 0 && sy >= 0 && sx < w && sy < h) px[y * w + x] = img.px[sy * w + sx];
    }
  }
  return { largeur: w, hauteur: h, px };
}

export interface Segment { pos: number; debut: number; fin: number }

/**
 * Segments horizontaux (ou verticaux) : longues séquences de pixels de contour.
 * Un contour est une variation forte d'intensité ; cela couvre les traits noirs
 * comme les limites des cases colorées.
 */
export function segments(img: ImageGris, orientation: 'h' | 'v', longueurMin: number, seuil = 60): Segment[] {
  const { largeur: w, hauteur: h, px } = img;
  const L = orientation === 'h' ? h : w;
  const C = orientation === 'h' ? w : h;
  const val = (a: number, b: number) => (orientation === 'h' ? px[a * w + b] : px[b * w + a]);
  const brut: Segment[] = [];
  for (let a = 1; a < L - 1; a++) {
    let debut = -1;
    for (let b = 0; b <= C; b++) {
      let bord = false;
      if (b < C) {
        const v = val(a, b);
        // Trait sombre ou transition entre deux zones de teintes différentes.
        bord = v < 110 || Math.abs(v - val(a - 1, b)) > seuil || Math.abs(v - val(a + 1, b)) > seuil;
      }
      if (bord && debut < 0) debut = b;
      // Tolère des interruptions de 2 pixels (scan bruité).
      if (!bord && debut >= 0) {
        let k = 1;
        while (k <= 2 && b + k < C) {
          const v2 = val(a, b + k);
          if (v2 < 110) break;
          k++;
        }
        if (k <= 2 && b + k < C) continue;
        if (b - debut >= longueurMin) brut.push({ pos: a, debut, fin: b });
        debut = -1;
      }
    }
  }
  return brut;
}

/** Regroupe des segments proches (épaisseur du trait, double contour). */
export function regrouper(segs: Segment[], tolerance: number): Segment[][] {
  const tries = [...segs].sort((a, b) => a.pos - b.pos);
  const groupes: Segment[][] = [];
  for (const s of tries) {
    const g = groupes[groupes.length - 1];
    if (g && s.pos - g[g.length - 1].pos <= tolerance) g.push(s);
    else groupes.push([s]);
  }
  return groupes;
}

export interface Ligne1D { pos: number; segments: [number, number][] }

function fusionnerIntervalles(iv: [number, number][]): [number, number][] {
  const t = [...iv].sort((a, b) => a[0] - b[0]);
  const r: [number, number][] = [];
  for (const x of t) {
    const d = r[r.length - 1];
    if (d && x[0] <= d[1] + 3) d[1] = Math.max(d[1], x[1]);
    else r.push([...x]);
  }
  return r;
}

function lignes(img: ImageGris, o: 'h' | 'v', longueurMin: number): Ligne1D[] {
  return regrouper(segments(img, o, longueurMin), 4).map((g) => ({
    pos: Math.round(g.reduce((s, x) => s + x.pos, 0) / g.length),
    segments: fusionnerIntervalles(g.map((x) => [x.debut, x.fin] as [number, number])),
  }));
}

const couverture = (l: Ligne1D, a: number, b: number) => {
  let c = 0;
  for (const [d, f] of l.segments) c += Math.max(0, Math.min(f, b) - Math.max(d, a));
  return c / Math.max(1, b - a);
};

export interface Grille {
  xs: number[];          // positions des lignes verticales (colonnes)
  ys: number[];          // positions des lignes horizontales (rangées)
  /** bord[i][j] = vrai si un trait sépare la rangée i de la rangée i+1 dans la colonne j. */
  bordHorizontal: boolean[][];
}

/** Détecte la grille principale du tableau. Renvoie null si aucune grille fiable n'est trouvée. */
export function detecterGrille(img: ImageGris): Grille | null {
  const lmin = Math.max(20, Math.round(Math.min(img.largeur, img.hauteur) * 0.03));
  const hs = lignes(img, 'h', lmin);
  const vs = lignes(img, 'v', lmin);
  if (hs.length < 3 || vs.length < 3) return null;

  // Étendue du tableau : lignes horizontales et verticales les plus longues.
  const longueur = (l: Ligne1D) => l.segments.reduce((s, [a, b]) => s + b - a, 0);
  const hMax = Math.max(...hs.map(longueur));
  const vMax = Math.max(...vs.map(longueur));
  const vPrincipales = vs.filter((l) => longueur(l) >= vMax * 0.5);
  const hPrincipales = hs.filter((l) => longueur(l) >= hMax * 0.08);
  if (vPrincipales.length < 3) return null;

  const xs = vPrincipales.map((l) => l.pos);
  const x0 = xs[0], x1 = xs[xs.length - 1];
  // Une ligne horizontale doit couvrir au moins une colonne entière.
  const ys = hPrincipales
    .filter((l) => {
      for (let j = 0; j < xs.length - 1; j++) if (couverture(l, xs[j], xs[j + 1]) > 0.7) return true;
      return false;
    })
    .filter((l) => couverture(l, x0, x1) > 0.05)
    .map((l) => l.pos);
  const ysUniques = ys.filter((y, i) => i === 0 || y - ys[i - 1] > 6);
  if (ysUniques.length < 3) return null;

  const parY = new Map(hPrincipales.map((l) => [l.pos, l]));
  const bordHorizontal: boolean[][] = [];
  for (let i = 0; i < ysUniques.length - 2; i++) {
    const l = parY.get(ysUniques[i + 1])!;
    bordHorizontal.push(xs.slice(0, -1).map((x, j) => couverture(l, x + 2, xs[j + 1] - 2) > 0.6));
  }
  return { xs, ys: ysUniques, bordHorizontal };
}
