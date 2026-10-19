import { describe, expect, it } from 'vitest';
import { ciblesPubliees, construireGrille } from '../../src/domain/tableau';
import { decouper, texteSur } from '../../src/app/pdfTableau';
import type { Seance, VersionEDT } from '../../src/domain/types';

const seance = (p: Partial<Seance>): Seance => ({
  id: 's', cible: 'classe:1re B', jour: 'lundi', debut: '08:00', fin: '09:00',
  matiere: 'Mathématiques', enseignant: '', salle: '', semaine: 'toutes', ...p,
});

const version = (p: Partial<VersionEDT>): VersionEDT => ({
  id: 'v', statut: 'active', cibles: ['classe:1re B'], seances: [], validiteDebut: '2026-09-07', validiteFin: '2027-07-03',
  publieeLe: '2026-09-01T10:00:00.000Z', ...p,
} as VersionEDT);

describe('Tableau des cours', () => {
  it('retient, pour chaque cible, la version active la plus récemment publiée', () => {
    const ancienne = version({ id: 'ancienne', publieeLe: '2026-08-01T00:00:00.000Z' });
    const recente = version({ id: 'recente', cibles: ['classe:1re B', 'groupe:1B-ESP'], publieeLe: '2026-09-10T00:00:00.000Z' });
    const archivee = version({ id: 'archivee', statut: 'archivee', cibles: ['classe:Tle A'], publieeLe: '2026-09-20T00:00:00.000Z' });
    const cibles = ciblesPubliees([ancienne, recente, archivee]);
    expect(cibles.map((c) => [c.cible, c.version.id])).toEqual([
      ['classe:1re B', 'recente'],
      ['groupe:1B-ESP', 'recente'],
    ]);
  });

  it('une grille par créneau et par jour, triée par heure, avec la semaine demandée', () => {
    const v = version({
      seances: [
        seance({ id: 'a', jour: 'mardi', debut: '10:00', fin: '11:00', matiere: 'Physique', semaine: 'A' }),
        seance({ id: 'b', jour: 'lundi', debut: '08:00', fin: '09:00', matiere: 'Histoire' }),
        seance({ id: 'c', jour: 'mardi', debut: '10:00', fin: '11:00', matiere: 'Anglais', semaine: 'B' }),
        seance({ id: 'd', cible: 'groupe:1B-ESP', jour: 'lundi', debut: '08:00', fin: '09:00', matiere: 'Espagnol' }),
      ],
    });
    const grilleA = construireGrille(v, 'classe:1re B', 'A');
    expect(grilleA.map((l) => l.debut)).toEqual(['08:00', '10:00']);
    expect(grilleA[0].cases.lundi.map((s) => s.matiere)).toEqual(['Histoire']);
    expect(grilleA[1].cases.mardi.map((s) => s.matiere)).toEqual(['Physique']);
    const grilleB = construireGrille(v, 'classe:1re B', 'B');
    expect(grilleB[1].cases.mardi.map((s) => s.matiere)).toEqual(['Anglais']);
  });

  it('une cible sans séance donne une grille vide', () => {
    expect(construireGrille(version({}), 'classe:1re B', 'A')).toEqual([]);
  });
});

describe('Export PDF : mise en forme du texte', () => {
  // Largeur simulée : un caractère = 1 unité.
  const mesure = (t: string) => t.length;

  it('découpe le texte en lignes qui tiennent dans la largeur', () => {
    expect(decouper('Mathématiques appliquées', mesure, 12)).toEqual(['Mathématiques', 'appliquées']);
    expect(decouper('Court', mesure, 40)).toEqual(['Court']);
  });

  it('remplace les caractères absents des polices standard du PDF', () => {
    expect(texteSur('Œuvre → été')).toBe('OEuvre ? été');
    expect(texteSur('Salle 3 – Bâtiment’A')).toBe('Salle 3 – Bâtiment’A');
  });
});

describe('Export PDF : fichier produit', () => {
  it('génère un PDF A4 paysage, avec pagination si la grille est longue', async () => {
    const { genererPdfTableau } = await import('../../src/app/pdfTableau');
    const { PDFDocument } = await import('pdf-lib');
    const ligne = (i: number) => ({
      debut: `${String(8 + i).padStart(2, '0')}:00`, fin: `${String(9 + i).padStart(2, '0')}:00`,
      cases: { lundi: [seance({ matiere: 'Éducation physique et sportive', salle: 'Gymnase', enseignant: 'Mme Exemple' })], mardi: [], mercredi: [], jeudi: [], vendredi: [], samedi: [] },
    });
    const lignes = Array.from({ length: 14 }, (_, i) => ligne(i));
    const octets = await genererPdfTableau({
      etablissement: { nom: 'Lycée fictif', nomCourt: 'LFI Fictif', logosPartenaires: [], logo: '', couleur: '#0f3d6e' },
      titre: 'Classe 1re B', semaine: 'A', anneeScolaire: '2026-2027', validite: 'du 07/09/2026 au 03/07/2027',
      dateEdition: '14/09/2026', lignes,
    });
    const doc = await PDFDocument.load(octets);
    expect(new TextDecoder().decode(octets.slice(0, 4))).toBe('%PDF');
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(doc.getPage(0).getWidth()).toBeCloseTo(842);
    expect(doc.getPage(0).getHeight()).toBeCloseTo(595);
    if (process.env.SORTIE_PDF_TEST) await (await import('node:fs/promises')).writeFile(process.env.SORTIE_PDF_TEST, octets);
  });
});
