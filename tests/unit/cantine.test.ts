import { beforeEach, describe, expect, it } from 'vitest';
import { DepotMemoire, etatDemo, jetonDemo } from '../../src/data/depotMemoire';
import { controlerEleve, filtrerPassages, lignesExport, statistiques, versCsv } from '../../src/domain/cantine';
import { genererJeton, jetonValide } from '../../src/domain/qr';
import { peut } from '../../src/domain/permissions';

let depot: DepotMemoire;
beforeEach(() => { depot = new DepotMemoire(etatDemo(), false); });

describe('QR codes', () => {
  it('jeton opaque, au format attendu, sans donnée personnelle', () => {
    const j = genererJeton();
    expect(jetonValide(j)).toBe(true);
    expect(j).toMatch(/^VHSC-[A-Z2-7]{24}$/);
    expect(genererJeton()).not.toBe(j);
  });
  it('refus d’un QR code invalide (format)', () => {
    for (const c of ['', 'https://exemple.test', 'VHSC-123', 'Yassine Ben Ali 1re B', 'VHSC-abcdefghijklmnopqrstuvwx']) {
      expect(jetonValide(c)).toBe(false);
    }
  });
  it('refus d’un QR code au bon format mais inconnu', async () => {
    expect(await depot.resoudreJeton(genererJeton())).toBeNull();
  });
  it('un QR code régénéré invalide l’ancien', async () => {
    const ancien = jetonDemo('YASSINE');
    expect(await depot.resoudreJeton(ancien)).toBe('demo-e1');
    const nouveau = await depot.regenererJeton('demo-e1');
    expect(await depot.resoudreJeton(ancien)).toBeNull();
    expect(await depot.resoudreJeton(nouveau)).toBe('demo-e1');
  });
});

describe('Passages à la cantine', () => {
  it('enregistre un passage puis refuse le doublon pour le même service et la même date', async () => {
    const e = (await depot.lireEleve('demo-e1'))!;
    expect((await depot.enregistrerPassage(e, 'dejeuner', '2026-09-14', 'agent')).statut).toBe('confirme');
    expect((await depot.enregistrerPassage(e, 'dejeuner', '2026-09-14', 'agent')).statut).toBe('doublon');
    // Autre date ou autre service : autorisé.
    expect((await depot.enregistrerPassage(e, 'dejeuner', '2026-09-15', 'agent')).statut).toBe('confirme');
    expect((await depot.enregistrerPassage(e, 'diner', '2026-09-14', 'agent')).statut).toBe('confirme');
    const lignes = await depot.listerPassages('2026-09-14', '2026-09-14');
    expect(statistiques(lignes)).toEqual({ passages: 2, elevesDistincts: 1, refus: 0, doublons: 1 });
  });
  it('un échec d’écriture ne produit jamais de passage confirmé', async () => {
    const e = (await depot.lireEleve('demo-e1'))!;
    depot.echecProchaineEcriture = true;
    await expect(depot.enregistrerPassage(e, 'dejeuner', '2026-09-14', 'agent')).rejects.toThrow();
    expect(statistiques(await depot.listerPassages('2026-09-14', '2026-09-14')).passages).toBe(0);
    // La tentative suivante fonctionne et n'est pas un doublon.
    expect((await depot.enregistrerPassage(e, 'dejeuner', '2026-09-14', 'agent')).statut).toBe('confirme');
  });
  it('contrôles : élève inactif ou non autorisé', async () => {
    expect(controlerEleve((await depot.lireEleve('demo-e3'))!)).toMatchObject({ autorise: false });
    expect(controlerEleve((await depot.lireEleve('demo-e5'))!)).toMatchObject({ autorise: false });
    expect(controlerEleve((await depot.lireEleve('demo-e1'))!)).toEqual({ autorise: true });
    expect(controlerEleve(null)).toMatchObject({ autorise: false });
  });
  it('statistiques séparées, filtres et exports limités aux passages confirmés', async () => {
    const [e1, e2, e4] = await Promise.all(['demo-e1', 'demo-e2', 'demo-e4'].map((id) => depot.lireEleve(id)));
    await depot.enregistrerPassage(e1!, 'dejeuner', '2026-09-14', 'a');
    await depot.enregistrerPassage(e2!, 'dejeuner', '2026-09-14', 'a');
    await depot.enregistrerPassage(e1!, 'dejeuner', '2026-09-15', 'a');
    await depot.enregistrerPassage(e4!, 'dejeuner', '2026-09-15', 'a');
    await depot.enregistrerPassage(e4!, 'dejeuner', '2026-09-15', 'a');
    await depot.journaliserRefus({ eleveId: '', nom: '', prenom: '', classe: '', date: '2026-09-15', service: 'dejeuner', horodatage: new Date().toISOString(), agentUid: 'a', raison: 'QR code invalide' });
    const lignes = await depot.listerPassages('2026-09-14', '2026-09-15');
    expect(statistiques(lignes)).toEqual({ passages: 4, elevesDistincts: 3, refus: 1, doublons: 1 });
    const classe1B = filtrerPassages(lignes, { dateDebut: '2026-09-14', dateFin: '2026-09-15', classe: '1re B' });
    expect(statistiques(classe1B)).toMatchObject({ passages: 3, elevesDistincts: 2 });
    expect(filtrerPassages(lignes, { dateDebut: '2026-09-15', dateFin: '2026-09-15', eleveId: 'demo-e4' })).toHaveLength(2);
    const exp = lignesExport(lignes, [{ id: 'dejeuner', libelle: 'Déjeuner', debut: '11:30', fin: '14:00' }]);
    expect(exp).toHaveLength(4);
    const csv = versCsv(exp);
    expect(csv.startsWith('﻿Date;Service;Heure;Nom;Prénom;Classe')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(5);
  });
  it('CSV : neutralise les formules', () => {
    expect(versCsv([{ Nom: '=HYPERLINK("x")' }])).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('Permissions par rôle', () => {
  it('le personnel de cantine ne scanne que la cantine', () => {
    expect(peut(['cantine'], 'scanner_cantine')).toBe(true);
    for (const c of ['scanner_edt', 'importer_edt', 'gerer_eleves', 'voir_eleves', 'historique_cantine', 'administrer'] as const) {
      expect(peut(['cantine'], c)).toBe(false);
    }
  });
  it('la vie scolaire scanne l’emploi du temps mais ne publie pas', () => {
    expect(peut(['vie_scolaire'], 'scanner_edt')).toBe(true);
    expect(peut(['vie_scolaire'], 'publier_edt')).toBe(false);
  });
});
