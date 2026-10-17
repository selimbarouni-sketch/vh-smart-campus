// Génère des emplois du temps FICTIFS pour les tests automatiques.
// Aucune de ces données ne correspond à une classe, un élève ou un enseignant réel.
//   tests/fixtures/edt-fictif-texte.pdf   : PDF exporté contenant du texte
//   tests/fixtures/edt-fictif-scanne.pdf  : même tableau, page scannée (image seule, inclinée, bruitée)
//   tests/fixtures/edt-fictif-photo.jpg   : photographie d'un tableau imprimé (image)
//   tests/fixtures/edt-fictif-index.pdf   : mise en page type export EDT (Index Éducation) : sous-colonnes de groupes,
//                                           codes entre crochets, quinzaines Q1/Q2, pauses compressées
//   tests/fixtures/edt-fictif-index-photo.jpg : photographie du précédent
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ici = path.dirname(fileURLToPath(import.meta.url));
const dossier = path.join(ici, '..', 'tests', 'fixtures');
mkdirSync(dossier, { recursive: true });

const L = 842, H = 595;               // A4 paysage (points)
const X0 = 40, COL_H = 90, COL_J = 142;
const Y_HAUT = 520, H_ENTETE = 26, H_CRENEAU = 48;
const CRENEAUX = ['08h00 - 09h00', '09h00 - 10h00', '10h00 - 11h00', '11h00 - 12h00', '12h00 - 13h00', '13h00 - 14h00', '14h00 - 15h00', '15h00 - 16h00'];
const JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI'];

// Contenu fictif : [jour, créneau de début, nombre de créneaux, lignes, options]
// options.moitie = 'haut' | 'bas' (cases A/B empilées) ; options.cote = 'gauche' | 'droite' (groupes côte à côte)
const CASES = [
  [0, 0, 2, ['MATHS', 'M. Fictif', 'Salle 204'], { fond: [0.85, 0.92, 1] }],
  [0, 2, 1, ['ANGLAIS', 'Mme Exemple', 'Salle 101']],
  [0, 3, 1, ['FRANCAIS', 'Mme Modele', 'Salle 112']],
  [0, 5, 1, ['ESP LV2', 'Gr 1', 'M. Essai', 'Salle 105'], { cote: 'gauche' }],
  [0, 5, 1, ['ALL LV2', 'Gr 2', 'Mme Demo', 'Salle 106'], { cote: 'droite' }],
  [0, 6, 1, ['HG', 'M. Demo', 'Salle 201']],
  [1, 0, 1, ['PC  Sem A', 'M. Essai  Labo 2'], { moitie: 'haut' }],
  [1, 0, 1, ['SVT  Sem B', 'Mme Exemple  Labo 1'], { moitie: 'bas' }],
  [1, 1, 1, ['MATHS', 'M. Fictif', 'Salle 204']],
  [1, 2, 2, ['EPS', 'M. Sport', 'Gymnase'], { fond: [0.88, 1, 0.88] }],
  [1, 5, 2, ['NSI', 'Spe NSI', 'M. Code', 'Salle 210']],
  [2, 0, 1, ['ENS SCI', 'Mme Modele']],
  [2, 1, 1, ['ANGLAIS', 'Mme Exemple', 'Salle 101']],
  [3, 0, 1, ['FRANCAIS', 'Mme Modele', 'Salle 112']],
  [3, 2, 2, ['EMC', '10h15 - 11h45', 'M. Demo', 'Salle 201']],
  [4, 0, 1, ['HG', 'M. Demo', 'Salle 201']],
  [4, 1, 1, ['MATHS', 'M. Fictif', 'Salle 204'], { fond: [0.85, 0.92, 1] }],
  [4, 5, 1, ['VIE DE CLASSE', 'M. Fictif', 'Salle 204']],
];

async function pdfTexte() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([L, H]);
  const police = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const noir = rgb(0, 0, 0);
  const texte = (t, x, y, taille = 9, f = police) => page.drawText(t, { x, y, size: taille, font: f, color: noir });
  const centre = (t, xc, y, taille = 9, f = police) => texte(t, xc - f.widthOfTextAtSize(t, taille) / 2, y, taille, f);
  const rect = (x, yHaut, w, h, fond) => page.drawRectangle({ x, y: yHaut - h, width: w, height: h, borderColor: noir, borderWidth: 0.8, color: fond ? rgb(...fond) : undefined });

  texte('DOCUMENT FICTIF - DONNEES DE TEST', X0, 570, 10, gras);
  texte('Emploi du temps - Classe : 1re B', X0, 550, 14, gras);
  texte('Lycee fictif - Annee 2026-2027', 560, 550, 9);

  rect(X0, Y_HAUT, COL_H, H_ENTETE);
  centre('Horaires', X0 + COL_H / 2, Y_HAUT - 17, 9, gras);
  JOURS.forEach((j, i) => {
    rect(X0 + COL_H + i * COL_J, Y_HAUT, COL_J, H_ENTETE);
    centre(j, X0 + COL_H + i * COL_J + COL_J / 2, Y_HAUT - 17, 10, gras);
  });
  CRENEAUX.forEach((c, r) => {
    const yh = Y_HAUT - H_ENTETE - r * H_CRENEAU;
    rect(X0, yh, COL_H, H_CRENEAU);
    centre(c, X0 + COL_H / 2, yh - H_CRENEAU / 2 - 3, 9);
  });
  // Cases vides : une par créneau non occupé.
  const occupe = new Set();
  for (const [j, r, n] of CASES) for (let k = 0; k < n; k++) occupe.add(`${j}:${r + k}`);
  for (let j = 0; j < JOURS.length; j++) {
    for (let r = 0; r < CRENEAUX.length; r++) {
      if (!occupe.has(`${j}:${r}`)) rect(X0 + COL_H + j * COL_J, Y_HAUT - H_ENTETE - r * H_CRENEAU, COL_J, H_CRENEAU);
    }
  }
  for (const [j, r, n, lignes, o = {}] of CASES) {
    let x = X0 + COL_H + j * COL_J, w = COL_J;
    let yh = Y_HAUT - H_ENTETE - r * H_CRENEAU, h = n * H_CRENEAU;
    if (o.moitie) { h = H_CRENEAU / 2; if (o.moitie === 'bas') yh -= h; }
    if (o.cote) { w = COL_J / 2; if (o.cote === 'droite') x += w; }
    rect(x, yh, w, h, o.fond);
    const taille = o.moitie ? 8 : 9;
    const interligne = taille + 2;
    const y0 = yh - h / 2 + ((lignes.length - 1) * interligne) / 2 - taille / 3;
    lignes.forEach((t, k) => centre(t, x + w / 2, y0 - k * interligne, taille, k === 0 ? gras : police));
  }
  return Buffer.from(await doc.save());
}

/** Rendu "scanné" : rotation, fond grisé, bruit. */
async function scanner(pdfBuffer, echelle, angle, graine) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer), useSystemFonts: false, standardFontDataUrl: path.join(ici, '..', 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/' }).promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: echelle });
  const net = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
  const ctx = net.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, net.width, net.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;

  const out = createCanvas(net.width, net.height);
  const o = out.getContext('2d');
  o.fillStyle = '#f4f1ea'; o.fillRect(0, 0, out.width, out.height);
  o.translate(out.width / 2, out.height / 2);
  o.rotate((angle * Math.PI) / 180);
  o.translate(-out.width / 2, -out.height / 2);
  o.globalCompositeOperation = 'multiply';
  o.drawImage(net, 0, 0);
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalCompositeOperation = 'source-over';
  const img = o.getImageData(0, 0, out.width, out.height);
  let s = graine;
  const alea = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (alea() - 0.5) * 30;
    for (let c = 0; c < 3; c++) img.data[i + c] = Math.max(0, Math.min(255, img.data[i + c] + n));
  }
  o.putImageData(img, 0, 0);
  return out;
}

// ——— Mise en page type export EDT (Index Éducation), entièrement fictive ———
const SEGMENTS = [['08:00', '08:55'], ['09:00', '09:55'], ['10:10', '11:05'], ['11:10', '12:05'], ['12:05', '13:00'], ['13:20', '14:15'], ['14:20', '15:15'], ['15:35', '16:30']];
const JOURS_MIN = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];
// [jour, colonne, nb colonnes, segment, nb segments, lignes, fond, quinzaine, sansTraitBas]
const CASES_INDEX = [
  [0, 0, 3, 0, 2, ['HGGSP', 'FICTIF A.', '[1HGGSP1]', 'Salle de Réunion'], [0.95, 0.95, 0.95]],
  [0, 1, 3, 0, 2, ['SVT', 'EXEMPLE B.', '[1SVT1]', '003-Lab SVT'], [0.95, 0.95, 0.95]],
  [0, 2, 3, 0, 2, ['Maths', 'ESSAI C.', '[1MATHS1]', '101'], [0.95, 0.95, 0.95]],
  [0, 0, 2, 2, 1, ['Allemand', 'MODELE D.', '[1.ALL LVB]', '102'], [0.55, 0.8, 0.78]],
  [0, 1, 2, 2, 1, ['ESPAGNOL', 'TEST E.', '[1.ESP.LVB]', '206'], [0.95, 0.88, 0.9]],
  [0, 0, 2, 3, 1, ['ARABE', 'DEMO F.', '[1.ARA.LVC]', '002'], [0.9, 0.93, 0.92]],
  [0, 1, 2, 3, 1, ['ARABE', 'ESSAI G.', '[1.ARA.LVB]', '206'], [0.9, 0.93, 0.92]],
  [1, 0, 1, 1, 1, ['Français', 'MODELE H.', '201'], [0.96, 0.95, 0.86]],
  [2, 0, 2, 1, 1, ['Mathématiques', 'ESSAI C.', '[1MATHS NON SP]', '005'], [0.47, 0.85, 0.47], 'Q1'],
  [2, 1, 2, 1, 1, ['Histoire-Géographie', 'FICTIF I.', '001'], [0.95, 0.95, 0.95], 'Q2'],
  [2, 0, 1, 2, 2, ['EPS', 'SPORT J.', 'SALLE DE SPORT2'], [0.75, 0.58, 0.62], null, true],
  [3, 0, 1, 1, 2, ['Français', 'MODELE H.', '006'], [0.96, 0.95, 0.86]],
  [3, 0, 1, 5, 1, ['Mathématiques', 'ESSAI C.', '[1MATHS NON SP]', '005'], [0.47, 0.85, 0.47]],
  [3, 0, 1, 6, 1, ['Enseignement scientifique', 'EXEMPLE B.', '004-Lab PC'], [0.73, 0.59, 0.75]],
  [4, 0, 2, 7, 1, ['Anglais', 'TEST K.', '002'], [0.86, 0.84, 0.47], 'Q1'],
];

async function pdfIndex() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([L, H]);
  const police = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const italique = await doc.embedFont(StandardFonts.HelveticaOblique);
  const noir = rgb(0, 0, 0);
  const X0 = 57, LJ = 151.6, YH = 520, HSEG = 50;
  const hautSeg = (i) => YH - 14 - i * HSEG;            // y (pdf) du haut du segment i
  const centre = (t, xc, y, taille, f) => page.drawText(t, { x: xc - f.widthOfTextAtSize(t, taille) / 2, y, size: taille, font: f, color: noir });
  const trait = (x1, y1, x2, y2) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.6, color: noir });
  page.drawText('Lycée fictif - DOCUMENT FICTIF', { x: 30, y: 565, size: 8, font: police });
  centre('1 C - Année Complète', L / 2, 548, 12, gras);
  JOURS_MIN.forEach((j, i) => centre(j, X0 + i * LJ + LJ / 2, YH - 10, 8, police));
  // Axe horaire : heure de fin au-dessus du trait, heure de début au-dessous (pauses non représentées).
  const etiquette = (t, y) => page.drawText(t, { x: X0 - 26, y, size: 8, font: police });
  SEGMENTS.forEach(([d, f], i) => {
    const prec = SEGMENTS[i - 1];
    if (!prec || prec[1] !== d) etiquette(d.replace(':', 'h').replace(/^0/, ''), hautSeg(i) - 8);
    else etiquette(d.replace(':', 'h').replace(/^0/, ''), hautSeg(i) - 8);
    const suiv = SEGMENTS[i + 1];
    if (!suiv || suiv[0] !== f) etiquette(f.replace(':', 'h').replace(/^0/, ''), hautSeg(i + 1) + 2);
    trait(X0 - 28, hautSeg(i), X0, hautSeg(i));
  });
  etiquette('15h20', hautSeg(6) - 18); // étiquette parasite, comme dans certains exports réels
  // Cadre et colonnes des jours (sans trait en haut de l'en-tête).
  for (let i = 0; i <= 5; i++) trait(X0 + i * LJ, YH, X0 + i * LJ, hautSeg(8));
  trait(X0, hautSeg(0), X0 + 5 * LJ, hautSeg(0));
  trait(X0, hautSeg(8), X0 + 5 * LJ, hautSeg(8));
  // Rangée du déjeuner : une case vide par jour.
  // (sous l'EPS du mercredi, aucun trait : seule la couleur sépare la case du déjeuner, comme dans certains exports)
  for (let j = 0; j < 5; j++) {
    const x = X0 + j * LJ;
    if (j !== 2) trait(x, hautSeg(4), x + LJ, hautSeg(4));
    trait(x, hautSeg(5), x + LJ, hautSeg(5));
  }
  for (const [j, c, n, seg, nb, lignes, fond, quinz, sansBas] of CASES_INDEX) {
    const w = LJ / n, x = X0 + j * LJ + c * w, yHaut = hautSeg(seg), h = nb * HSEG;
    page.drawRectangle({ x, y: yHaut - h, width: w, height: h, color: rgb(...fond) });
    trait(x, yHaut, x + w, yHaut); trait(x, yHaut, x, yHaut - h); trait(x + w, yHaut, x + w, yHaut - h);
    if (!sansBas) trait(x, yHaut - h, x + w, yHaut - h);
    const taille = n === 3 ? 6.5 : 8, inter = taille + 3.5;
    const y0 = yHaut - h / 2 + ((lignes.length - 1) * inter) / 2 - taille / 3;
    lignes.forEach((t, k) => {
      const f = k === 0 ? gras : k === lignes.length - 1 && !t.startsWith('[') ? italique : police;
      centre(t, x + w / 2, y0 - k * inter, taille, f);
    });
    if (quinz) {
      page.drawRectangle({ x: x + w - 13, y: yHaut - h + 1, width: 12, height: 10, borderColor: noir, borderWidth: 0.5, color: rgb(1, 1, 1) });
      page.drawText(quinz, { x: x + w - 12, y: yHaut - h + 3, size: 6.5, font: police });
    }
  }
  page.drawText('Mise en page inspirée des exports EDT - données fictives', { x: 560, y: 22, size: 6, font: police });
  return Buffer.from(await doc.save());
}

const texte = await pdfTexte();
writeFileSync(path.join(dossier, 'edt-fictif-texte.pdf'), texte);

const scan = await scanner(texte, 3, 1.1, 42);
const jpeg = scan.toBuffer('image/jpeg', 80);
const docScan = await PDFDocument.create();
const img = await docScan.embedJpg(jpeg);
const p = docScan.addPage([L, H]);
p.drawImage(img, { x: 0, y: 0, width: L, height: H });
writeFileSync(path.join(dossier, 'edt-fictif-scanne.pdf'), Buffer.from(await docScan.save()));

const photo = await scanner(texte, 2.6, -0.7, 7);
writeFileSync(path.join(dossier, 'edt-fictif-photo.jpg'), photo.toBuffer('image/jpeg', 88));
await loadImage(path.join(dossier, 'edt-fictif-photo.jpg'));

const index = await pdfIndex();
writeFileSync(path.join(dossier, 'edt-fictif-index.pdf'), index);
const photoIndex = await scanner(index, 3, 0.8, 11);
writeFileSync(path.join(dossier, 'edt-fictif-index-photo.jpg'), photoIndex.toBuffer('image/jpeg', 88));
console.log('Fixtures fictives générées dans', dossier);
