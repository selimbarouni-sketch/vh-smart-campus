// Adaptateurs navigateur : lecture des PDF (pdf.js), des images, et OCR (Tesseract.js auto-hébergé).
import * as pdfjs from 'pdfjs-dist';
import workerPdf from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import type { MethodeExtraction, Seance } from '../domain/types';
import { decouper, versGris, type ImageGris } from './grille';
import { lireImageScannee, type MoteurOCR } from './ocr';
import { analyserPage, dedoublonner, jetonsDepuisPdf, pageTexteExploitable, type ElementTextePdf } from './pipeline';

pdfjs.GlobalWorkerOptions.workerSrc = workerPdf;
const BASE = import.meta.env.BASE_URL;

export const TYPES_ACCEPTES = ['application/pdf', 'image/jpeg', 'image/png'];

export interface DocumentCharge {
  fichier: File;
  type: 'pdf' | 'image';
  nbPages: number;
  /** Rendu d'une page dans un canvas. */
  rendre(page: number, echelle: number): Promise<HTMLCanvasElement>;
  /** Mots du calque texte du PDF (vide pour une image). */
  texte(page: number, echelle: number): Promise<ReturnType<typeof jetonsDepuisPdf>>;
}

export async function chargerDocument(fichier: File): Promise<DocumentCharge> {
  const type = fichier.type || (fichier.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '');
  if (!TYPES_ACCEPTES.includes(type) && !/\.(pdf|jpe?g|png)$/i.test(fichier.name)) {
    throw new Error('Format non pris en charge : utilisez un fichier PDF, JPG, JPEG ou PNG.');
  }
  if (type === 'application/pdf' || /\.pdf$/i.test(fichier.name)) {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()), standardFontDataUrl: `${BASE}vendor/pdfjs/standard_fonts/` }).promise;
    return {
      fichier, type: 'pdf', nbPages: doc.numPages,
      async rendre(n, echelle) {
        const page = await doc.getPage(n);
        const vp = page.getViewport({ scale: echelle });
        const c = document.createElement('canvas');
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        return c;
      },
      async texte(n, echelle) {
        const page = await doc.getPage(n);
        const vp = page.getViewport({ scale: echelle });
        const contenu = await page.getTextContent();
        const items = contenu.items.filter((i) => 'str' in i);
        return jetonsDepuisPdf(items as ElementTextePdf[], echelle, (x, y) => vp.convertToViewportPoint(x, y));
      },
    };
  }
  const url = URL.createObjectURL(fichier);
  const img = await new Promise<HTMLImageElement>((ok, ko) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ko(new Error("Impossible de lire l'image."));
    i.src = url;
  });
  return {
    fichier, type: 'image', nbPages: 1,
    async rendre(_n, echelle) {
      // Taille plafonnée pour garder un traitement rapide sur téléphone.
      const f = Math.min(echelle, 3200 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * f); c.height = Math.round(img.naturalHeight * f);
      c.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0, c.width, c.height);
      return c;
    },
    async texte() { return []; },
  };
}

export function grisDepuisCanvas(c: HTMLCanvasElement): ImageGris {
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
  return versGris(d.data, c.width, c.height);
}

function canvasDepuisGris(img: ImageGris): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.largeur; c.height = img.hauteur;
  const ctx = c.getContext('2d')!;
  const d = ctx.createImageData(img.largeur, img.hauteur);
  for (let i = 0; i < img.px.length; i++) {
    d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = img.px[i];
    d.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

let worker: Promise<Worker> | null = null;
function workerOcr(): Promise<Worker> {
  worker ??= createWorker('fra', 1, {
    workerPath: `${BASE}vendor/tesseract/worker.min.js`,
    corePath: `${BASE}vendor/tesseract/`,
    langPath: `${BASE}vendor/tesseract/lang`,
    workerBlobURL: false,
  });
  return worker;
}

export const moteurOcrNavigateur: MoteurOCR = async (image, zone, mode) => {
  const w = await workerOcr();
  const z = zone ?? { x: 0, y: 0, w: image.largeur, h: image.hauteur };
  await w.setParameters({ tessedit_pageseg_mode: mode === 'bloc' ? PSM.SINGLE_BLOCK : PSM.AUTO });
  const { data } = await w.recognize(canvasDepuisGris(decouper(image, z)));
  return data.words
    .filter((m) => m.text.trim())
    .map((m) => ({ texte: m.text, x: m.bbox.x0 + z.x, y: m.bbox.y0 + z.y, w: m.bbox.x1 - m.bbox.x0, h: m.bbox.y1 - m.bbox.y0, conf: m.confidence }));
};

export interface ResultatExtraction {
  seances: Seance[];
  avertissements: string[];
  extraction: MethodeExtraction[];
  classesDetectees: string[];
}

/**
 * Extraction automatique : texte du PDF lorsqu'il existe, sinon OCR case par case
 * après redressement et détection de la grille.
 */
export async function extraireDocument(
  doc: DocumentCharge, ciblesParDefaut: string[], progression: (message: string, part: number) => void,
): Promise<ResultatExtraction> {
  const seances: Seance[] = [];
  const avertissements: string[] = [];
  const parMethode = new Map<MethodeExtraction['methode'], number[]>();
  const classes = new Set<string>();
  for (let n = 1; n <= doc.nbPages; n++) {
    const base = (n - 1) / doc.nbPages;
    progression(`Page ${n}/${doc.nbPages} : lecture du texte…`, base);
    const jetons = doc.type === 'pdf' ? await doc.texte(n, 2) : [];
    let methode: MethodeExtraction['methode'];
    let res;
    if (pageTexteExploitable(jetons)) {
      methode = 'texte_pdf';
      res = analyserPage(grisDepuisCanvas(await doc.rendre(n, 2)), jetons, { page: n, ciblesParDefaut });
    } else {
      methode = 'ocr';
      progression(`Page ${n}/${doc.nbPages} : document scanné, reconnaissance de caractères (OCR)…`, base);
      const gris = grisDepuisCanvas(await doc.rendre(n, 3));
      const lu = await lireImageScannee(gris, moteurOcrNavigateur, (p) => progression(`Page ${n}/${doc.nbPages} : OCR ${Math.round(p * 100)} %`, base + p / doc.nbPages));
      if (Math.abs(lu.inclinaison) > 0.1) avertissements.push(`Page ${n} : document redressé de ${lu.inclinaison.toFixed(1)}°.`);
      res = analyserPage(lu.image, lu.jetons, { page: n, ciblesParDefaut, seuilConfiance: 75 });
    }
    parMethode.set(methode, [...(parMethode.get(methode) ?? []), n]);
    if (res.classePage) classes.add(res.classePage);
    seances.push(...res.seances);
    avertissements.push(...res.avertissements);
  }
  progression('Extraction terminée', 1);
  return {
    seances: dedoublonner(seances),
    avertissements,
    extraction: [...parMethode].map(([methode, pages]) => ({ methode, pages })),
    classesDetectees: [...classes],
  };
}

/** Image JPEG d'une page (base64, sans préfixe) pour l'analyse multimodale. */
export async function imagePourVision(doc: DocumentCharge, page: number): Promise<string> {
  const c = await doc.rendre(page, 2.5);
  const f = Math.min(1, 2000 / Math.max(c.width, c.height));
  const r = document.createElement('canvas');
  r.width = Math.round(c.width * f); r.height = Math.round(c.height * f);
  r.getContext('2d')!.drawImage(c, 0, 0, r.width, r.height);
  return r.toDataURL('image/jpeg', 0.9).split(',')[1];
}
