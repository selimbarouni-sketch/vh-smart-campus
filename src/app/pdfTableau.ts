// Génération du PDF du tableau des cours (A4 paysage) : en-tête aux couleurs de l'établissement,
// titre, validité, grille horaire, pied de page et numérotation. Chargé à la demande.
import type { Etablissement } from '../domain/types';
import { JOURS, type Jour, type Seance } from '../domain/types';
import type { LigneTableau, Vue } from '../domain/tableau';
import { heureFr } from '../domain/temps';

export interface DonneesTableauPdf {
  etablissement: Etablissement;
  titre: string;              // ex. « Classe 1re B »
  semaine: Vue;
  anneeScolaire: string;      // ex. « 2026-2027 »
  validite: string;           // ex. « du 07/09/2026 au 03/07/2027 »
  dateEdition: string;        // ex. « 14/09/2026 »
  lignes: LigneTableau[];
}

const LARGEUR = 842;          // A4 paysage, en points
const HAUTEUR = 595;
const MARGE = 36;
const BANDE = 78;
const COL_HORAIRE = 84;
const HAUTEUR_ENTETE_TABLEAU = 22;
const BAS_UTILE = 40;         // réserve pour le pied de page

const LIBELLE_JOUR: Record<Jour, string> = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi', jeudi: 'Jeudi', vendredi: 'Vendredi', samedi: 'Samedi',
};

/** Ramène le texte aux caractères disponibles dans les polices standard du PDF (WinAnsi). */
export function texteSur(s: string): string {
  return s
    .replace(/œ/g, 'oe').replace(/Œ/g, 'OE')
    .replace(/[  ]/g, ' ')
    .replace(/[^\t\n\r\x20-\x7E\xA0-\xFF–—‘’“”•…€]/g, '?');
}

/** Coupe un texte en lignes qui tiennent dans la largeur donnée. */
export function decouper(texte: string, mesure: (t: string) => number, largeur: number): string[] {
  const lignes: string[] = [];
  let courante = '';
  for (const mot of texteSur(texte).split(/\s+/).filter(Boolean)) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (mesure(essai) <= largeur || !courante) {
      courante = essai;
    } else {
      lignes.push(courante);
      courante = mot;
    }
  }
  if (courante) lignes.push(courante);
  return lignes;
}

function couleurHex(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  const [r, g, b] = m ? [m[1], m[2], m[3]].map((x) => parseInt(x ?? '0', 16) / 255) : [0.06, 0.24, 0.43];
  return { r, g, b };
}

/** Logo (PNG, JPEG ou WebP) converti en PNG, format lisible par le PDF. */
async function logoPng(dataUrl: string | undefined): Promise<Uint8Array | null> {
  if (!dataUrl) return null;
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

function texteCase(seances: Seance[]): { matiere: string; detail: string }[] {
  return seances.map((s) => ({
    matiere: s.matiere,
    detail: [s.salle ? `Salle ${s.salle}` : '', s.enseignant].filter(Boolean).join(' · '),
  }));
}

export async function genererPdfTableau(d: DonneesTableauPdf): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(texteSur(`Emploi du temps – ${d.titre} – semaine ${d.semaine}`));
  pdf.setAuthor(texteSur(d.etablissement.nomCourt));
  pdf.setCreator('VH Smart Campus');
  const police = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  const marque = couleurHex(d.etablissement.couleur);
  const couleurMarque = rgb(marque.r, marque.g, marque.b);
  const blanc = rgb(1, 1, 1);
  const encre = rgb(0.12, 0.14, 0.18);
  const gris = rgb(0.42, 0.45, 0.5);
  const trait = rgb(0.84, 0.86, 0.89);
  const zebra = rgb(0.965, 0.97, 0.98);

  const logo = await logoPng(d.etablissement.logo);
  const imageLogo = logo ? await pdf.embedPng(logo) : null;

  const pages: ReturnType<typeof pdf.addPage>[] = [];
  const largeurColonne = (LARGEUR - 2 * MARGE - COL_HORAIRE) / JOURS.length;

  const enTete = (page: ReturnType<typeof pdf.addPage>) => {
    page.drawRectangle({ x: 0, y: HAUTEUR - BANDE, width: LARGEUR, height: BANDE, color: couleurMarque });
    let x = MARGE;
    if (imageLogo) {
      const taille = 50;
      const { width, height } = imageLogo.scaleToFit(taille, taille);
      page.drawImage(imageLogo, { x, y: HAUTEUR - BANDE / 2 - height / 2, width, height });
      x += taille + 14;
    }
    page.drawText(texteSur(d.etablissement.nomCourt), { x, y: HAUTEUR - 36, size: 15, font: gras, color: blanc });
    page.drawText('Vie Scolaire', { x, y: HAUTEUR - 52, size: 9, font: police, color: blanc });

    const titre = texteSur(`Emploi du temps : ${d.titre}`);
    const sousTitre = texteSur(`Semaine ${d.semaine} · année scolaire ${d.anneeScolaire}`);
    const droite = LARGEUR - MARGE;
    page.drawText(titre, { x: droite - gras.widthOfTextAtSize(titre, 14), y: HAUTEUR - 38, size: 14, font: gras, color: blanc });
    page.drawText(sousTitre, { x: droite - police.widthOfTextAtSize(sousTitre, 9.5), y: HAUTEUR - 54, size: 9.5, font: police, color: blanc });

    page.drawText(texteSur(`Validité : ${d.validite}`), { x: MARGE, y: HAUTEUR - BANDE - 18, size: 8.5, font: police, color: gris });
  };

  const ligneEntetes = (page: ReturnType<typeof pdf.addPage>, y: number) => {
    page.drawRectangle({ x: MARGE, y: y - HAUTEUR_ENTETE_TABLEAU, width: LARGEUR - 2 * MARGE, height: HAUTEUR_ENTETE_TABLEAU, color: couleurMarque });
    page.drawText('Horaire', { x: MARGE + 8, y: y - 14, size: 8.5, font: gras, color: blanc });
    JOURS.forEach((j, i) => {
      const x = MARGE + COL_HORAIRE + i * largeurColonne;
      page.drawText(LIBELLE_JOUR[j], { x: x + 8, y: y - 14, size: 9, font: gras, color: blanc });
    });
    return y - HAUTEUR_ENTETE_TABLEAU;
  };

  // Pagination : la grille se poursuit sur une nouvelle page si nécessaire, avec ses en-têtes.
  let page = pdf.addPage([LARGEUR, HAUTEUR]);
  pages.push(page);
  enTete(page);
  let y = ligneEntetes(page, HAUTEUR - BANDE - 30);

  if (!d.lignes.length) {
    page.drawText('Aucun cours publié pour cette vue.', { x: MARGE + 8, y: y - 22, size: 10, font: police, color: gris });
  }

  const mesureGras = (t: string) => gras.widthOfTextAtSize(t, 8.5);
  const mesureNormal = (t: string) => police.widthOfTextAtSize(t, 7.5);

  // Une case = une liste de séances, chacune découpée en lignes de matière puis de détail.
  type Bloc = { matiere: string[]; detail: string[] };
  const hauteurCase = (blocs: Bloc[]) =>
    blocs.reduce((h, b) => h + b.matiere.length * 10.5 + b.detail.length * 9 + 5, 0);

  for (const [index, ligne] of d.lignes.entries()) {
    const cases: Bloc[][] = JOURS.map((j) =>
      texteCase(ligne.cases[j]).map((c) => ({
        matiere: decouper(c.matiere, mesureGras, largeurColonne - 14),
        detail: c.detail ? decouper(c.detail, mesureNormal, largeurColonne - 14) : [],
      })),
    );
    // La case la plus haute impose la hauteur de la ligne.
    const hauteur = Math.max(34, ...cases.map((blocs) => hauteurCase(blocs) + 8));

    if (y - hauteur < BAS_UTILE) {
      page = pdf.addPage([LARGEUR, HAUTEUR]);
      pages.push(page);
      enTete(page);
      y = ligneEntetes(page, HAUTEUR - 40);
    }

    const haut = y;
    const bas = y - hauteur;
    if (index % 2 === 1) page.drawRectangle({ x: MARGE, y: bas, width: LARGEUR - 2 * MARGE, height: hauteur, color: zebra });
    page.drawLine({ start: { x: MARGE, y: bas }, end: { x: LARGEUR - MARGE, y: bas }, thickness: 0.6, color: trait });

    page.drawText(heureFr(ligne.debut), { x: MARGE + 8, y: haut - hauteur / 2 + 3, size: 8, font: gras, color: encre });
    page.drawText(heureFr(ligne.fin), { x: MARGE + 8, y: haut - hauteur / 2 - 8, size: 8, font: police, color: gris });

    cases.forEach((blocs, i) => {
      const x = MARGE + COL_HORAIRE + i * largeurColonne + 7;
      let yc = haut - 12;
      for (const bloc of blocs) {
        for (const l of bloc.matiere) {
          page.drawText(l, { x, y: yc, size: 8.5, font: gras, color: encre });
          yc -= 10.5;
        }
        for (const l of bloc.detail) {
          page.drawText(l, { x, y: yc, size: 7.5, font: police, color: gris });
          yc -= 9;
        }
        yc -= 5;
      }
    });
    y = bas;
  }
  // Ligne de fermeture du tableau.
  pages[pages.length - 1].drawLine({ start: { x: MARGE, y }, end: { x: LARGEUR - MARGE, y }, thickness: 0.6, color: trait });

  // Pied de page et numérotation.
  pages.forEach((p, i) => {
    p.drawText(texteSur(`${d.etablissement.nomCourt} · édité le ${d.dateEdition} · document généré par VH Smart Campus`), {
      x: MARGE, y: 18, size: 7.5, font: police, color: gris,
    });
    const numero = `Page ${i + 1} / ${pages.length}`;
    p.drawText(numero, { x: LARGEUR - MARGE - police.widthOfTextAtSize(numero, 7.5), y: 18, size: 7.5, font: police, color: gris });
  });

  return pdf.save();
}
