import { beforeEach, describe, expect, it } from 'vitest';
import { DepotMemoire, etatDemo } from '../../src/data/depotMemoire';
import { dansCreneau } from '../../src/domain/cantine';
import { controlerEleveBus, idPassageBus } from '../../src/domain/bus';
import { peut } from '../../src/domain/permissions';
import type { Eleve } from '../../src/domain/types';

const eleve = (p: Partial<Eleve>): Eleve => ({ id: 'x', nom: 'N', prenom: 'P', classe: '1re B', actif: true, cantineAutorisee: true, ...p });

let depot: DepotMemoire;
beforeEach(() => { depot = new DepotMemoire(etatDemo(), false); });

describe('Bus : contrôles et identifiants', () => {
  it('seul un élève actif et inscrit au bus peut monter', () => {
    expect(controlerEleveBus(eleve({ bus: true }))).toEqual({ autorise: true });
    expect(controlerEleveBus(eleve({ bus: false }))).toMatchObject({ autorise: false });
    expect(controlerEleveBus(eleve({}))).toMatchObject({ autorise: false });
    expect(controlerEleveBus(eleve({ bus: true, actif: false }))).toMatchObject({ autorise: false });
    expect(controlerEleveBus(null)).toMatchObject({ autorise: false });
  });
  it('un passage par élève, par date et par trajet', () => {
    expect(idPassageBus('2026-11-02', 'aller', 'e1')).not.toBe(idPassageBus('2026-11-02', 'retour', 'e1'));
    expect(idPassageBus('2026-11-02', 'aller', 'e1')).toBe('2026-11-02_aller_e1');
  });
  it('le bus est accessible au seul rôle bus et à l’administrateur', () => {
    expect(peut(['bus'], 'scanner_bus')).toBe(true);
    expect(peut(['cantine'], 'scanner_bus')).toBe(false);
    expect(peut(['vie_scolaire'], 'scanner_bus')).toBe(false);
    expect(peut(['admin'], 'scanner_bus')).toBe(true);
  });
});

describe('Créneau de cantine réglable', () => {
  it('bornes du créneau fourni, inclusives', () => {
    const c = { debut: '12:30', fin: '13:00' };
    expect(dansCreneau('12:29', c)).toBe(false);
    expect(dansCreneau('12:30', c)).toBe(true);
    expect(dansCreneau('13:00', c)).toBe(true);
    expect(dansCreneau('13:01', c)).toBe(false);
  });
  it('le créneau enregistré est relu par la démonstration', async () => {
    expect(await depot.lireCreneauCantine()).toEqual({ debut: '12:05', fin: '13:20' });
    await depot.enregistrerCreneauCantine({ debut: '12:00', fin: '14:00' });
    expect(await depot.lireCreneauCantine()).toEqual({ debut: '12:00', fin: '14:00' });
    expect((await depot.servicesCantine())[0]).toMatchObject({ debut: '12:00', fin: '14:00' });
  });
});

describe('Module bus (démonstration)', () => {
  it('désactivé par défaut, puis activable par l’administrateur', async () => {
    expect((await depot.lireModules()).busActif).toBe(false);
    await depot.enregistrerModules({ busActif: true });
    expect((await depot.lireModules()).busActif).toBe(true);
  });
  it('une montée est confirmée une fois, le second scan du même trajet est un doublon', async () => {
    const e = (await depot.lireEleve('demo-e1'))!;
    expect((await depot.enregistrerPassageBus(e, 'aller', '2026-11-02', 'agent')).statut).toBe('confirme');
    const second = await depot.enregistrerPassageBus(e, 'aller', '2026-11-02', 'agent');
    expect(second.statut).toBe('doublon');
    expect(second.passage.station).toBe('Houmt Souk');
    expect((await depot.enregistrerPassageBus(e, 'retour', '2026-11-02', 'agent')).statut).toBe('confirme');
  });
});
