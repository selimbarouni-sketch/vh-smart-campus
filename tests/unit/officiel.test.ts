import { describe, expect, it } from 'vitest';
import { creerSauvegarde, lireSauvegarde, resumeSauvegarde } from '../../src/domain/sauvegarde';
import { hexVersTsl } from '../../src/app/apparence';
import { DepotMemoire, etatDemo } from '../../src/data/depotMemoire';

describe('Sauvegarde', () => {
  it('fichier valide relu à l’identique', () => {
    const f = creerSauvegarde({ eleves: { e1: { nom: 'Fictif' } } }, 'admin@test', '2026-10-17T08:00:00Z');
    expect(lireSauvegarde(JSON.stringify(f))).toEqual(f);
    expect(resumeSauvegarde(f).find((c) => c.collection === 'eleves')?.nombre).toBe(1);
  });
  it('fichiers invalides refusés avec un message clair', () => {
    expect(() => lireSauvegarde('pas du json')).toThrow(/illisible/);
    expect(() => lireSauvegarde('{"format":"autre"}')).toThrow(/n'est pas une sauvegarde/);
    expect(() => lireSauvegarde(JSON.stringify({ format: 'vh-smart-campus', version: 1, collections: { piratage: {} } }))).toThrow(/inconnue/);
    expect(() => lireSauvegarde(JSON.stringify({ format: 'vh-smart-campus', version: 1, collections: { eleves: { 'a/b': {} } } }))).toThrow(/invalide/);
  });
  it('démonstration : export puis restauration sur une base vide', async () => {
    const source = new DepotMemoire(etatDemo(), false);
    const e = (await source.lireEleve('demo-e1'))!;
    await source.enregistrerPassage(e, 'dejeuner', '2026-09-14', 'demo-cantine');
    await source.enregistrerEtablissement({ nom: 'Lycée fictif', nomCourt: 'Fictif', logosPartenaires: [], couleur: '#7a1f3d' });
    const donnees = await source.exporterDonnees();
    expect(JSON.stringify(donnees)).not.toContain('motDePasse');
    const vide = etatDemo();
    vide.eleves = []; vide.jetons = []; vide.scolarites = [];
    const cible = new DepotMemoire(vide, false);
    const r = await cible.restaurerDonnees(donnees);
    expect(r.ecrits).toBeGreaterThan(5);
    expect((await cible.lireEleve('demo-e1'))?.prenom).toBe('Yassine');
    expect((await cible.lireEtablissement()).nomCourt).toBe('Fictif');
    expect((await cible.listerPassages('2026-09-14', '2026-09-14'))).toHaveLength(1);
    // Rejouer la restauration ne duplique pas le passage.
    const r2 = await cible.restaurerDonnees(donnees);
    expect(r2.ignores).toBe(1);
    expect((await cible.listerPassages('2026-09-14', '2026-09-14'))).toHaveLength(1);
  });
});

describe('Comptes (démonstration)', () => {
  it('création, connexion, changement de mot de passe', async () => {
    const d = new DepotMemoire(etatDemo(), false);
    await d.creerCompte({ nom: 'Agent fictif', email: 'Agent@Test.local', roles: ['cantine'], motDePasse: 'provisoire1' });
    await expect(d.creerCompte({ nom: 'Doublon', email: 'agent@test.local', roles: ['cantine'], motDePasse: 'provisoire1' })).rejects.toThrow(/existe déjà/);
    await d.connexion('agent@test.local', 'provisoire1');
    await expect(d.changerMotDePasse('faux', 'nouveau-mdp')).rejects.toThrow();
    await d.changerMotDePasse('provisoire1', 'nouveau-mdp');
    await d.deconnexion();
    await expect(d.connexion('agent@test.local', 'provisoire1')).rejects.toThrow();
    await d.connexion('agent@test.local', 'nouveau-mdp');
    expect(await d.installationRequise()).toBe(false);
  });
});

describe('Couleur principale', () => {
  it('conversion en teinte / saturation / luminosité', () => {
    expect(hexVersTsl('#0f3d6e')).toEqual([211, 76, 25]);
    expect(hexVersTsl('#ffffff')).toEqual([0, 0, 100]);
    expect(hexVersTsl('invalide')).toEqual(hexVersTsl('#0f3d6e'));
  });
});
