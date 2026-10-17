// Outils de test côté Node : rendu PDF (pdf.js + @napi-rs/canvas) et OCR (Tesseract.js, données locales).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import { decouper, versGris, type ImageGris } from '../../src/extraction/grille';
import { jetonsDepuisPdf, type ElementTextePdf } from '../../src/extraction/pipeline';
import type { Jeton } from '../../src/extraction/analyseTableau';
import type { MoteurOCR } from '../../src/extraction/ocr';

const racine = path.resolve(__dirname, '..', '..');
export const fixture = (nom: string) => path.join(racine, 'tests', 'fixtures', nom);

export interface PageNode { gris: ImageGris; jetons: Jeton[] }

export async function chargerPdf(fichier: string, echelle = 2): Promise<PageNode[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(fichier)),
    standardFontDataUrl: path.join(racine, 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/',
  }).promise;
  const pages: PageNode[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: echelle });
    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: ctx as any, viewport: vp }).promise;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const contenu = await page.getTextContent();
    const items = contenu.items.filter((i) => 'str' in i) as ElementTextePdf[];
    pages.push({
      gris: versGris(data.data, canvas.width, canvas.height),
      jetons: jetonsDepuisPdf(items, echelle, (x, y) => vp.convertToViewportPoint(x, y)),
    });
  }
  return pages;
}

export async function chargerImage(fichier: string): Promise<ImageGris> {
  const img = await loadImage(fichier);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return versGris(ctx.getImageData(0, 0, img.width, img.height).data, img.width, img.height);
}

function versPng(img: ImageGris): Buffer {
  const c = createCanvas(img.largeur, img.hauteur);
  const ctx = c.getContext('2d');
  const d = ctx.createImageData(img.largeur, img.hauteur);
  for (let i = 0; i < img.px.length; i++) {
    d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = img.px[i];
    d.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
  return c.toBuffer('image/png');
}

let worker: Worker | null = null;
export async function moteurOcrNode(): Promise<{ ocr: MoteurOCR; fermer: () => Promise<void> }> {
  worker ??= await createWorker('fra', 1, {
    langPath: path.join(racine, 'node_modules', '@tesseract.js-data', 'fra', '4.0.0_best_int'),
    cachePath: path.join(racine, 'tests', '.cache-ocr'),
  });
  const w = worker;
  const ocr: MoteurOCR = async (image, zone, mode) => {
    const z = zone ?? { x: 0, y: 0, w: image.largeur, h: image.hauteur };
    await w.setParameters({ tessedit_pageseg_mode: mode === 'bloc' ? PSM.SINGLE_BLOCK : PSM.AUTO });
    const { data } = await w.recognize(versPng(decouper(image, z)));
    return data.words
      .filter((m) => m.text.trim())
      .map((m) => ({ texte: m.text, x: m.bbox.x0 + z.x, y: m.bbox.y0 + z.y, w: m.bbox.x1 - m.bbox.x0, h: m.bbox.y1 - m.bbox.y0, conf: m.confidence }));
  };
  return { ocr, fermer: async () => { await worker?.terminate(); worker = null; } };
}
