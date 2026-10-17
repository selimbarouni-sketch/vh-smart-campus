import { describe, expect, it } from 'vitest';
import { bilan, confirmerChamp, modifierChamp, verifierSeances } from '../../src/domain/verification';
import { actionsSurAnciennes, ErreurPublication, modifierSeances, preparerPublication, valider } from '../../src/domain/publication';
import { analyserCellule } from '../../src/extraction/cellule';
import { seancesDepuisVision } from '../../src/extraction/vision';
import type { ImportEDT } from '../../src/domain/types';
import { seance, version } from './donneesFictives';

const importFictif = (p: Partial<ImportEDT> = {}): ImportEDT => ({
  id: 'imp-fictif', fichierNom: 'edt-fictif.pdf', fichierType: 'application/pdf', nbPages: 1, typeDocument: 'classe',
  ciblesParDefaut: ['classe:1re B'], importePar: 'u', importeParNom: 'Test', importeLe: '2026-09-01T08:00:00Z',
  statut: 'brouillon', version: 2, validiteDebut: '2026-09-07', validiteFin: '2027-07-03',
  seances: [seance({ id: 'a' }), seance({ id: 'b', debut: '09:00', fin: '10:00' })], extraction: [], avertissements: [], ...p,
});

describe('Tableau de vérification', () => {
  it('signale erreurs, champs incertains, informations absentes et chevauchements', () => {
    const p = verifierSeances([
      seance({ id: '1', debut: '10:00', fin: '09:00' }),
      seance({ id: '2', matiere: '', salle: '', enseignant: '' }),
      seance({ id: '3', incertitudes: ['salle'] }),
      seance({ id: '4', debut: '08:30', fin: '09:30' }),
    ]);
    expect(p.find((x) => x.seanceId === '1' && x.niveau === 'erreur')).toBeTruthy();
    expect(p.find((x) => x.seanceId === '2' && x.champ === 'matiere' && x.niveau === 'erreur')).toBeTruthy();
    expect(p.filter((x) => x.seanceId === '2' && x.niveau === 'manquant')).toHaveLength(2);
    expect(p.find((x) => x.seanceId === '3' && x.niveau === 'incertain')).toBeTruthy();
    expect(p.some((x) => x.niveau === 'chevauchement')).toBe(true);
  });
  it('semaines A et B au même créneau : pas de chevauchement', () => {
    const p = verifierSeances([seance({ id: 'x', semaine: 'A' }), seance({ id: 'y', semaine: 'B' })]);
    expect(p.some((x) => x.niveau === 'chevauchement')).toBe(false);
  });
  it('correction manuelle d’une erreur OCR : la valeur corrigée est confirmée', () => {
    // Case lue par OCR avec une faute et une faible confiance (texte fictif).
    const lu = analyserCellule([{ texte: 'NSsI', conf: 34 }, { texte: 'M. Code', conf: 90 }, { texte: 'Salle 210', conf: 92 }]);
    expect(lu.matiere).toBe('NSsI');
    expect(lu.incertitudes).toContain('matiere');
    const s = seance({ matiere: lu.matiere, incertitudes: lu.incertitudes });
    expect(bilan(verifierSeances([s])).validable).toBe(false);
    const corrige = modifierChamp(s, 'matiere', 'Numérique et sciences informatiques');
    expect(corrige.incertitudes).not.toContain('matiere');
    expect(bilan(verifierSeances([corrige])).validable).toBe(true);
  });
  it('confirmer un champ sans le modifier', () => {
    expect(confirmerChamp(seance({ incertitudes: ['salle', 'jour'] }), 'salle').incertitudes).toEqual(['jour']);
  });
});

describe('Validation et publication', () => {
  it('aucune validation tant qu’il reste un champ incertain', () => {
    const imp = importFictif({ seances: [seance({ incertitudes: ['debut'] })] });
    expect(() => valider(imp, 'u', 'now')).toThrow(ErreurPublication);
  });
  it('aucune publication sans validation explicite', () => {
    expect(() => preparerPublication(importFictif(), [], 'u', 'now')).toThrow(/vérifié et validé/);
  });
  it('une modification après validation remet l’import en brouillon', () => {
    const v = valider(importFictif(), 'u', '2026-09-02T08:00:00Z');
    expect(v.statut).toBe('verifie');
    expect(modifierSeances(v, v.seances).statut).toBe('brouillon');
  });
  it('publication : nouvelle version active, ancienne version de la même classe archivée', () => {
    const ancienne = version([seance({})], { id: 'ancienne', validiteDebut: '2026-09-07' });
    const v = valider(importFictif(), 'u', '2026-09-02T08:00:00Z');
    const p = preparerPublication(v, [ancienne], 'u', '2026-09-03T08:00:00Z');
    expect(p.version.statut).toBe('active');
    expect(p.version.cibles).toEqual(['classe:1re B']);
    expect(p.version.seances[0]).not.toHaveProperty('incertitudes');
    expect(p.importPublie.statut).toBe('publie');
    expect(p.actions).toEqual([{ id: 'ancienne', action: 'archiver' }]);
  });
  it('nouvelle version en cours d’année : l’ancienne reste valable jusqu’à la veille', () => {
    const ancienne = version([seance({})], { id: 'ancienne', validiteDebut: '2026-09-01' });
    expect(actionsSurAnciennes(importFictif({ validiteDebut: '2027-01-04' }), [ancienne]))
      .toEqual([{ id: 'ancienne', action: 'raccourcir', nouvelleFin: '2027-01-03' }]);
  });
  it('document multi-classes : une ancienne version couvrant d’autres classes reste active', () => {
    const multi = version([seance({}), seance({ cible: 'classe:1re A' })], { id: 'multi' });
    expect(actionsSurAnciennes(importFictif(), [multi])[0].action).toBe('aucune');
  });
});

describe('Analyse multimodale (réponse simulée, données fictives)', () => {
  it('ne complète jamais un champ absent et marque tout comme à vérifier', () => {
    const r = seancesDepuisVision({
      titre_classe: 'Classe : 1re B',
      seances: [
        { classe_ou_groupe: '', jour: 'mardi', debut: '8h', fin: '9:00', matiere: 'SVT', enseignant: '', salle: '', semaine: 'B', groupe: '', champs_incertains: ['salle'], texte_case: 'SVT Sem B' },
        { classe_ou_groupe: '', jour: 'jeudi', debut: '25:00', fin: '', matiere: 'ESP', enseignant: 'M. Essai', salle: 'Salle 105', semaine: 'toutes', groupe: 'Gr 1', champs_incertains: [], texte_case: 'ESP Gr 1' },
      ],
      remarques: ['Coin inférieur flou'],
    }, 1, []);
    expect(r.seances[0]).toMatchObject({ cible: 'classe:1re B', debut: '08:00', fin: '09:00', matiere: 'Sciences de la vie et de la Terre', salle: '', enseignant: '', semaine: 'B' });
    expect(r.seances[0].incertitudes).toEqual(expect.arrayContaining(['salle', 'jour', 'debut', 'fin']));
    expect(r.seances[1].debut).toBe('');
    expect(r.seances[1].incertitudes).toContain('cible');
    expect(r.avertissements[0]).toMatch(/flou/);
  });
  it('réponse illisible : aucune séance', () => {
    expect(seancesDepuisVision(null, 1, []).seances).toHaveLength(0);
  });
});
