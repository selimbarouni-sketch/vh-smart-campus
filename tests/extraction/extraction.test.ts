// Extraction sur des emplois du temps FICTIFS générés par scripts/generer-fixtures.mjs.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chargerImage, chargerPdf, fixture, moteurOcrNode } from '../outils/noeud';
import { analyserPage, pageTexteExploitable } from '../../src/extraction/pipeline';
import { lireImageScannee, type MoteurOCR } from '../../src/extraction/ocr';
import type { Seance } from '../../src/domain/types';
import { DepotMemoire, etatDemo } from '../../src/data/depotMemoire';
import { modifierChamp, verifierSeances, bilan } from '../../src/domain/verification';
import { preparerPublication, valider } from '../../src/domain/publication';
import { journeeEleve, momentDeLaJournee } from '../../src/domain/emploiDuTemps';
import { jetonDemo } from '../../src/data/depotMemoire';
import type { ImportEDT } from '../../src/domain/types';

const trouver = (s: Seance[], jour: string, debut: string, matiere: RegExp) =>
  s.find((x) => x.jour === jour && x.debut === debut && matiere.test(x.matiere));

/** Séances attendues, lisibles quelle que soit la méthode (fiches du document fictif). */
function verifierContenuCommun(s: Seance[]) {
  // Case fusionnée sur deux créneaux.
  expect(trouver(s, 'lundi', '08:00', /Mathématiques/)).toMatchObject({ fin: '10:00', enseignant: 'M. Fictif', salle: 'Salle 204', semaine: 'toutes' });
  expect(trouver(s, 'lundi', '10:00', /Anglais/)).toMatchObject({ fin: '11:00', enseignant: 'Mme Exemple', salle: 'Salle 101' });
  // Semaines A et B empilées dans le même créneau.
  expect(trouver(s, 'mardi', '08:00', /Physique-Chimie/)).toMatchObject({ fin: '09:00', semaine: 'A', salle: 'Labo 2' });
  expect(trouver(s, 'mardi', '08:00', /vie et de la Terre/)).toMatchObject({ fin: '09:00', semaine: 'B', salle: 'Labo 1' });
  // Groupes de langue côte à côte : deux séances, association au groupe à confirmer.
  const esp = trouver(s, 'lundi', '13:00', /Espagnol/);
  const all = trouver(s, 'lundi', '13:00', /Allemand/);
  expect(esp?.incertitudes).toContain('cible');
  expect(all?.incertitudes).toContain('cible');
  expect(all?.indiceGroupe).toMatch(/Gr ?2/);
  // Case fusionnée sur 2 h.
  expect(trouver(s, 'mardi', '10:00', /physique et sportive/)).toMatchObject({ fin: '12:00', salle: 'Gymnase' });
  // Horaire inhabituel écrit dans la case : conservé, signalé car différent de la grille.
  const emc = trouver(s, 'jeudi', '10:15', /moral et civique/);
  expect(emc).toMatchObject({ fin: '11:45' });
  expect(emc?.incertitudes).toEqual(expect.arrayContaining(['debut', 'fin']));
  // Salle absente du document : jamais inventée.
  expect(trouver(s, 'mercredi', '08:00', /Enseignement scientifique/)).toMatchObject({ salle: '' });
  expect(s.every((x) => x.cible === 'classe:1re B')).toBe(true);
}

describe('PDF contenant du texte', () => {
  it('lit le calque texte et la grille du tableau', async () => {
    const [p] = await chargerPdf(fixture('edt-fictif-texte.pdf'));
    expect(pageTexteExploitable(p.jetons)).toBe(true);
    const r = analyserPage(p.gris, p.jetons, { page: 1, ciblesParDefaut: [] });
    expect(r.methode).toBe('grille');
    expect(r.classePage).toBe('1re B');
    expect(r.seances).toHaveLength(18);
    verifierContenuCommun(r.seances);
    // Lecture du texte : aucune incertitude hors cas signalés volontairement.
    expect(r.seances.filter((x) => (x.incertitudes ?? []).some((c) => !['cible', 'debut', 'fin'].includes(c)))).toHaveLength(0);
  });
});

describe('Documents scannés (OCR)', () => {
  let ocr: MoteurOCR;
  let fermer: () => Promise<void>;
  beforeAll(async () => ({ ocr, fermer } = await moteurOcrNode()));
  afterAll(async () => fermer());

  it('PDF scanné : aucune couche texte, redressement puis OCR case par case', async () => {
    const [p] = await chargerPdf(fixture('edt-fictif-scanne.pdf'), 3);
    expect(pageTexteExploitable(p.jetons)).toBe(false);
    const lu = await lireImageScannee(p.gris, ocr);
    expect(Math.abs(lu.inclinaison - 1.1)).toBeLessThan(0.4);
    expect(lu.grille).not.toBeNull();
    const r = analyserPage(lu.image, lu.jetons, { page: 1, ciblesParDefaut: [], seuilConfiance: 75 });
    expect(r.classePage).toBe('1re B');
    expect(r.seances.length).toBeGreaterThanOrEqual(16);
    verifierContenuCommun(r.seances);
  });

  it('image (photo) d’un tableau imprimé', async () => {
    const gris = await chargerImage(fixture('edt-fictif-photo.jpg'));
    const lu = await lireImageScannee(gris, ocr);
    expect(lu.grille).not.toBeNull();
    const r = analyserPage(lu.image, lu.jetons, { page: 1, ciblesParDefaut: [], seuilConfiance: 75 });
    expect(r.classePage).toBe('1re B');
    expect(r.seances.length).toBeGreaterThanOrEqual(16);
    verifierContenuCommun(r.seances);
  });
});

describe('Parcours complet : import → vérification → validation → publication → scan', () => {
  it('le cours affiché après scan provient uniquement de la version validée', async () => {
    const depot = new DepotMemoire(etatDemo(), false);
    const [p] = await chargerPdf(fixture('edt-fictif-texte.pdf'));
    const r = analyserPage(p.gris, p.jetons, { page: 1, ciblesParDefaut: ['classe:1re B'] });
    let imp: ImportEDT = {
      id: 'imp-test', fichierNom: 'edt-fictif-texte.pdf', fichierType: 'application/pdf', nbPages: 1, typeDocument: 'classe',
      ciblesParDefaut: ['classe:1re B'], importePar: 'demo-edt', importeParNom: 'Test', importeLe: '2026-09-01T08:00:00Z', statut: 'brouillon',
      version: 1, validiteDebut: '2026-09-07', validiteFin: '2027-07-03', seances: r.seances, extraction: [{ methode: 'texte_pdf', pages: [1] }], avertissements: [],
    };
    await depot.enregistrerImport(imp);

    // Avant publication : rien n'est affiché comme fiable.
    const eleve = (await depot.lireEleve(await depot.resoudreJeton(jetonDemo('YASSINE')) as string))!;
    const cal = await depot.lireCalendrier();
    const avant = journeeEleve({ eleve, scolarite: await depot.lireScolarite(eleve.id), date: '2026-09-14', versions: await depot.listerVersions(), modifications: [], calendrier: cal });
    expect(avant.statut).toBe('aucun_edt');

    // Vérification : le tableau n'est pas validable en l'état (groupes à associer, horaires EMC à confirmer).
    expect(bilan(verifierSeances(imp.seances), imp).validable).toBe(false);
    imp = {
      ...imp,
      seances: imp.seances.map((s) => {
        if (/Espagnol/.test(s.matiere)) return modifierChamp(s, 'cible', 'groupe:1B-ESP-LV2');
        if (/Allemand/.test(s.matiere)) return modifierChamp(s, 'cible', 'groupe:1B-ALL-LV2');
        if (/Numérique/.test(s.matiere)) return modifierChamp(s, 'cible', 'groupe:SPE-NSI-1re');
        return { ...s, incertitudes: [] }; // relu et confirmé
      }),
    };
    expect(bilan(verifierSeances(imp.seances), imp).validable).toBe(true);
    imp = valider(imp, 'demo-edt', '2026-09-02T08:00:00Z');
    const pub = preparerPublication(imp, await depot.listerVersions(), 'demo-edt', '2026-09-02T09:00:00Z');
    await depot.publier(pub.version, pub.actions, pub.importPublie);

    // Scan lundi 14/09/2026 (semaine B) à 10 h 30.
    const j = journeeEleve({ eleve, scolarite: await depot.lireScolarite(eleve.id), date: '2026-09-14', versions: await depot.listerVersions(), modifications: [], calendrier: cal });
    const m = momentDeLaJournee(j.seances, '10:30');
    expect(m.enCours[0]).toMatchObject({ matiere: 'Anglais', salle: 'Salle 101', enseignant: 'Mme Exemple' });
    expect(m.prochain).toMatchObject({ matiere: 'Français', debut: '11:00' });
    // Groupe de langue : Espagnol (groupe de l'élève), pas Allemand.
    expect(j.seances.map((s) => s.matiere)).toContain('Espagnol');
    expect(j.seances.map((s) => s.matiere)).not.toContain('Allemand');
    // Mardi 15/09 (semaine B) : SVT et non Physique-Chimie.
    const mardi = journeeEleve({ eleve, scolarite: await depot.lireScolarite(eleve.id), date: '2026-09-15', versions: await depot.listerVersions(), modifications: [], calendrier: cal });
    expect(momentDeLaJournee(mardi.seances, '08:10').enCours[0].matiere).toBe('Sciences de la vie et de la Terre');
    expect(momentDeLaJournee(mardi.seances, '12:30').etat).toBe('pause');
  });
});

// Mise en page type export EDT (Index Éducation) — document entièrement fictif.
const ATTENDU_INDEX: [string, string, string, string, string, string, string][] = [
  // jour, début, fin, matière, enseignant, salle, cible
  ['lundi', '08:00', '09:55', 'Histoire-géographie, géopolitique et sciences politiques', 'FICTIF A.', 'Salle de Réunion', 'groupe:1HGGSP1'],
  ['lundi', '08:00', '09:55', 'Sciences de la vie et de la Terre', 'EXEMPLE B.', '003-Lab SVT', 'groupe:1SVT1'],
  ['lundi', '08:00', '09:55', 'Mathématiques', 'ESSAI C.', '101', 'groupe:1MATHS1'],
  ['lundi', '10:10', '11:05', 'Allemand', 'MODELE D.', '102', 'groupe:1-ALL-LVB'],
  ['lundi', '10:10', '11:05', 'Espagnol', 'TEST E.', '206', 'groupe:1-ESP-LVB'],
  ['lundi', '11:10', '12:05', 'Arabe', 'DEMO F.', '002', 'groupe:1-ARA-LVC'],
  ['lundi', '11:10', '12:05', 'Arabe', 'ESSAI G.', '206', 'groupe:1-ARA-LVB'],
  ['mardi', '09:00', '09:55', 'Français', 'MODELE H.', '201', 'classe:1re C'],
  ['mercredi', '09:00', '09:55', 'Mathématiques', 'ESSAI C.', '005', 'groupe:1MATHS-NON-SP'],
  ['mercredi', '09:00', '09:55', 'Histoire-Géographie', 'FICTIF I.', '001', 'classe:1re C'],
  ['mercredi', '10:10', '12:05', 'Éducation physique et sportive', 'SPORT J.', 'SALLE DE SPORT2', 'classe:1re C'],
  ['jeudi', '09:00', '11:05', 'Français', 'MODELE H.', '006', 'classe:1re C'],
  ['jeudi', '13:20', '14:15', 'Mathématiques', 'ESSAI C.', '005', 'groupe:1MATHS-NON-SP'],
  ['jeudi', '14:20', '15:15', 'Enseignement scientifique', 'EXEMPLE B.', '004-Lab PC', 'classe:1re C'],
  ['vendredi', '15:35', '16:30', 'Anglais', 'TEST K.', '002', 'classe:1re C'],
];

describe('Mise en page type export EDT (sous-colonnes, codes de groupe, pauses compressées)', () => {
  it('PDF texte : toutes les séances exactes', async () => {
    const [p] = await chargerPdf(fixture('edt-fictif-index.pdf'));
    const r = analyserPage(p.gris, p.jetons, { page: 1, ciblesParDefaut: [] });
    expect(r.methode).toBe('cellules');
    expect(r.classePage).toBe('1re C');
    expect(r.seances).toHaveLength(ATTENDU_INDEX.length);
    for (const [jour, debut, fin, matiere, enseignant, salle, cible] of ATTENDU_INDEX) {
      const s = r.seances.find((x) => x.jour === jour && x.debut === debut && x.enseignant === enseignant);
      expect(s, `${jour} ${debut} ${enseignant}`).toMatchObject({ fin, matiere, salle, cible });
    }
    // Quinzaines : semaine A/B à confirmer.
    const q1 = r.seances.find((x) => x.jour === 'mercredi' && x.cible === 'groupe:1MATHS-NON-SP')!;
    const q2 = r.seances.find((x) => x.jour === 'mercredi' && x.matiere === 'Histoire-Géographie')!;
    expect([q1.semaine, q2.semaine]).toEqual(['A', 'B']);
    expect(q1.incertitudes).toContain('semaine');
    // L'étiquette parasite « 15h20 » est écartée.
    expect(r.avertissements.join(' ')).toMatch(/incohérent/);
  });

  it('photo : aucune erreur silencieuse (toute valeur fausse est signalée ou absente)', async () => {
    const { ocr, fermer } = await moteurOcrNode();
    const lu = await lireImageScannee(await chargerImage(fixture('edt-fictif-index-photo.jpg')), ocr);
    await fermer();
    const r = analyserPage(lu.image, lu.jetons, { page: 1, ciblesParDefaut: [], seuilConfiance: 75 });
    // Chaque case du document produit une ligne (lue ou « case illisible »).
    expect(r.seances.length).toBeGreaterThanOrEqual(ATTENDU_INDEX.length);
    let lues = 0;
    for (const [jour, debut, fin, , enseignant, salle] of ATTENDU_INDEX) {
      const s = r.seances.find((x) => x.jour === jour && (x.debut === debut || x.incertitudes?.includes('debut')) && (x.enseignant === enseignant || x.salle === salle));
      if (!s) continue;
      lues++;
      const inc = s.incertitudes ?? [];
      if (s.debut && s.debut !== debut) expect(inc, `${jour} ${debut}`).toContain('debut');
      if (s.fin && s.fin !== fin) expect(inc, `${jour} ${fin}`).toContain('fin');
    }
    expect(lues).toBeGreaterThanOrEqual(ATTENDU_INDEX.length - 3);
  });
});
