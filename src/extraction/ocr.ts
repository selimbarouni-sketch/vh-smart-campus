import type { Jeton } from './analyseTableau';
import { binariser, decouper, detecterGrille, estimerInclinaison, pivoter, type Grille, type ImageGris } from './grille';
import { contient, detecterCellules, encre } from './cellules';
import { casesPrincipales } from './analyseCellules';

export interface Zone { x: number; y: number; w: number; h: number }

/**
 * Moteur OCR abstrait (Tesseract.js dans le navigateur comme dans les tests).
 * mode : "bloc" pour une case du tableau, "page" pour une page ou un bandeau (segmentation automatique).
 * Les coordonnées renvoyées sont celles de l'image complète.
 */
export type MoteurOCR = (image: ImageGris, zone: Zone | null, mode: 'bloc' | 'page') => Promise<Jeton[]>;

export interface ResultatOCR {
  image: ImageGris;       // image redressée, dans laquelle les jetons sont positionnés
  jetons: Jeton[];
  inclinaison: number;
  grille: Grille | null;
}

/** Zones à lire : chaque case (cellules fusionnées comprises) et le bandeau de titre. */
export function zonesDeLecture(g: Grille, img: ImageGris): Zone[] {
  const zones: Zone[] = [];
  const marge = 5;
  if (g.ys[0] > 20) zones.push({ x: 0, y: 0, w: img.largeur, h: g.ys[0] - 4 });
  const R = g.ys.length - 1;
  for (let c = 0; c < g.xs.length - 1; c++) {
    let r0 = 0;
    for (let r = 0; r < R; r++) {
      const ferme = r === R - 1 || g.bordHorizontal[r]?.[c] !== false;
      if (!ferme) continue;
      const z = { x: g.xs[c] + marge, y: g.ys[r0] + marge, w: g.xs[c + 1] - g.xs[c] - 2 * marge, h: g.ys[r + 1] - g.ys[r0] - 2 * marge };
      if (z.w > 8 && z.h > 8) zones.push(z);
      r0 = r + 1;
    }
  }
  return zones;
}

export { encre } from './cellules';

/** OCR d'un document scanné : redressement, détection des cases, puis lecture case par case. */
export async function lireImageScannee(source: ImageGris, ocr: MoteurOCR, progression?: (p: number) => void): Promise<ResultatOCR> {
  const inclinaison = estimerInclinaison(source);
  const image = pivoter(source, -inclinaison);
  const grille = detecterGrille(image);
  const cases = casesPrincipales(detecterCellules(image), image.largeur, image.hauteur);

  // Zones à lire : les cases fermées si elles sont nombreuses, sinon les cases de la grille.
  let zones: Zone[] = [];
  let titre: Zone | null = null;
  if (cases.length >= 6) {
    const marge = 3;
    zones = cases.map((r) => ({ x: r.x0 + marge, y: r.y0 + marge, w: r.x1 - r.x0 - 2 * marge, h: r.y1 - r.y0 - 2 * marge }))
      .filter((z) => z.w > 8 && z.h > 8 && encre(image, z) > 0.004);
    // Cases de la grille non couvertes par une case détectée (trait interrompu, bord de page) : lues aussi.
    if (grille) {
      for (const z of zonesDeLecture(grille, image)) {
        if (z.y === 0) continue;
        const recouvrement = (r: (typeof cases)[number]) =>
          Math.max(0, Math.min(r.x1, z.x + z.w) - Math.max(r.x0, z.x)) * Math.max(0, Math.min(r.y1, z.y + z.h) - Math.max(r.y0, z.y));
        const couvert = cases.reduce((t, r) => t + recouvrement(r), 0) / (z.w * z.h);
        if (couvert < 0.3 && encre(image, z) > 0.004) zones.push(z);
      }
    }
  } else if (grille) {
    const toutes = zonesDeLecture(grille, image);
    titre = toutes[0] && toutes[0].y === 0 ? toutes[0] : null;
    zones = toutes.filter((z) => z === titre || encre(image, z) > 0.004);
  } else {
    const jetons = await ocr(image, null, 'page');
    progression?.(1);
    return { image, jetons, inclinaison, grille };
  }

  const jetons: Jeton[] = [];
  // Les traits du tableau sont parfois lus comme « | » ou « ; » : on les écarte.
  const utile = (j: Jeton) => !/^[|;:!\[\]_'"`.,]+$/.test(j.texte);
  // Une case sur aplat foncé est binarisée avant lecture ; une case claire est lue telle quelle
  // (la binarisation amincit les lettres et dégrade la lecture sur fond clair).
  const lireZone = async (z: Zone, mode: 'bloc' | 'page') => {
    const brut = decouper(image, z);
    const morceau = mediane(brut) < 200 ? binariser(brut) : brut;
    const lus = await ocr(morceau, null, mode);
    return lus.filter(utile).map((j) => ({ ...j, x: j.x + Math.round(z.x), y: j.y + Math.round(z.y) }));
  };
  const bandes: Zone[] = [];
  if (cases.length >= 6) {
    // Titre et jours (au-dessus des cases), axe horaire (à gauche) : lus comme des bandes séparées.
    const haut = Math.min(...cases.map((r) => r.y0)), gauche = Math.min(...cases.map((r) => r.x0));
    if (haut > 20) bandes.push({ x: 0, y: 0, w: image.largeur, h: haut - 2 });
    if (gauche > 20) bandes.push({ x: 0, y: Math.max(0, haut - 30), w: gauche - 1, h: image.hauteur - Math.max(0, haut - 30) });
  }
  const total = zones.length + bandes.length;
  for (let i = 0; i < zones.length; i++) {
    jetons.push(...(await lireZone(zones[i], zones[i] === titre ? 'page' : 'bloc')));
    progression?.((i + 1) / total);
  }
  for (let i = 0; i < bandes.length; i++) {
    const lus = await lireZone(bandes[i], 'page');
    jetons.push(...lus.filter((j) => !cases.some((r) => contient(r, j.x + j.w / 2, j.y + j.h / 2))));
    progression?.((zones.length + i + 1) / total);
  }
  progression?.(1);
  return { image, jetons, inclinaison, grille };
}

function mediane(img: ImageGris): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < img.px.length; i += 3) hist[img.px[i]]++;
  const moitie = Math.ceil(img.px.length / 3) / 2;
  let cumul = 0;
  for (let v = 0; v < 256; v++) { cumul += hist[v]; if (cumul >= moitie) return v; }
  return 255;
}
