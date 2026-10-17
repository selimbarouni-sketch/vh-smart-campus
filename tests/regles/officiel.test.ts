// Version officielle sur émulateurs (Auth + Firestore, règles actives) : installation, comptes,
// identité de l'établissement, documents sources, sauvegarde et restauration. Données FICTIVES.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { DepotFirebase } from '../../src/data/depotFirebase';
import type { Utilisateur } from '../../src/domain/types';

const config = { apiKey: 'fake', projectId: 'demo-vhsc', authDomain: 'demo-vhsc.firebaseapp.com' };
const emu = { hote: '127.0.0.1' };
let env: RulesTestEnvironment;

const nouveauDepot = () => new DepotFirebase(config, 'europe-west1', emu);
const session = (d: DepotFirebase) => new Promise<Utilisateur>((ok) => { const stop = d.ecouterSession((u) => { if (u?.actif) { stop(); ok(u); } }); });

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-vhsc', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
  await env.clearFirestore();
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-vhsc/accounts', { method: 'DELETE' });
});
afterAll(async () => env.cleanup());

describe('Mise en service et comptes', () => {
  let admin: DepotFirebase;

  it('première installation : un seul administrateur possible', async () => {
    const visiteur = nouveauDepot();
    expect(await visiteur.installationRequise()).toBe(true);
    admin = nouveauDepot();
    await admin.installer({ nom: 'Admin fictif', email: 'admin@test.local', motDePasse: 'motdepasse-admin' });
    expect(await session(admin)).toMatchObject({ roles: ['admin'], actif: true });
    expect(await visiteur.installationRequise()).toBe(false);
    // Une seconde « installation » est refusée et ne laisse pas de compte orphelin.
    const pirate = nouveauDepot();
    await expect(pirate.installer({ nom: 'Pirate', email: 'pirate@test.local', motDePasse: 'motdepasse-pirate' })).rejects.toThrow();
    await expect(pirate.connexion('pirate@test.local', 'motdepasse-pirate')).rejects.toThrow();
  });

  it("l'administrateur crée un compte sans perdre sa session ; le compte créé se connecte", async () => {
    const uid = await admin.creerCompte({ nom: 'Agent cantine fictif', email: 'agent@test.local', roles: ['cantine'], motDePasse: 'provisoire-123' });
    expect(uid).toBeTruthy();
    expect((await admin.listerUtilisateurs()).map((u) => u.email).sort()).toEqual(['admin@test.local', 'agent@test.local']);
    const agent = nouveauDepot();
    await agent.connexion('agent@test.local', 'provisoire-123');
    expect(await session(agent)).toMatchObject({ roles: ['cantine'] });
    await agent.changerMotDePasse('provisoire-123', 'nouveau-mdp-456');
    await agent.deconnexion();
    await agent.connexion('agent@test.local', 'nouveau-mdp-456');
    // Un agent ne peut pas créer de compte : refus, et pas d'identifiant orphelin.
    await expect(agent.creerCompte({ nom: 'X', email: 'x@test.local', roles: ['admin'], motDePasse: 'motdepasse-x' })).rejects.toThrow();
    await expect(nouveauDepot().connexion('x@test.local', 'motdepasse-x')).rejects.toThrow();
  });

  it("identité de l'établissement : lisible sans connexion, modifiable par l'administrateur seul", async () => {
    const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await admin.enregistrerEtablissement({ nom: 'Lycée fictif', nomCourt: 'Fictif', logo, logosPartenaires: [logo], couleur: '#7a1f3d' });
    const visiteur = nouveauDepot();
    expect(await visiteur.lireEtablissement()).toMatchObject({ nomCourt: 'Fictif', logo, couleur: '#7a1f3d' });
    const agent = nouveauDepot();
    await agent.connexion('agent@test.local', 'nouveau-mdp-456');
    await expect(agent.enregistrerEtablissement({ nom: 'Pirate', nomCourt: 'P', logosPartenaires: [], couleur: '#000000' })).rejects.toThrow();
  });

  it('document source conservé dans Firestore en plusieurs morceaux, puis sauvegarde et restauration', { timeout: 90000 }, async () => {
    const octets = new Uint8Array(1_600_000).map((_, i) => (i * 7) % 251); // > 2 morceaux
    const ref = await admin.televerserSource('imp-fictif', new File([octets], 'edt-fictif.pdf', { type: 'application/pdf' }));
    expect(ref).toBe('firestore:edt_sources/imp-fictif');
    await admin.enregistrerEleve({ id: 'e1', nom: 'Fictif', prenom: 'Élève', classe: '1re B', actif: true, cantineAutorisee: true });
    const e = (await admin.lireEleve('e1'))!;
    await admin.enregistrerPassage(e, 'dejeuner', '2026-09-14', (await session(admin)).uid);

    const sauvegarde = await admin.exporterDonnees();
    const source = sauvegarde.edt_sources?.['imp-fictif'] as { contenu: string; nom: string };
    expect(source.nom).toBe('edt-fictif.pdf');
    expect(Buffer.from(source.contenu, 'base64').equals(Buffer.from(octets))).toBe(true);
    expect(Object.keys(sauvegarde.cantine_passages ?? {})).toEqual(['2026-09-14_dejeuner_e1']);
    expect(sauvegarde.config?.etablissement).toMatchObject({ nomCourt: 'Fictif' });

    // Nouvelle base vide (ex. nouveau projet) : l'administrateur réinstallé restaure la sauvegarde.
    const u = await session(admin);
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'utilisateurs', u.uid), { email: 'admin@test.local', nom: 'Admin fictif', roles: ['admin'], actif: true });
      await setDoc(doc(ctx.firestore(), 'config', 'installation'), { faiteLe: 'x', par: u.uid });
    });
    const rapport = await admin.restaurerDonnees(sauvegarde);
    expect(rapport.ecrits).toBeGreaterThan(5);
    expect((await admin.lireEleve('e1'))?.nom).toBe('Fictif');
    expect((await admin.listerPassages('2026-09-14', '2026-09-14')).filter((p) => p.statut === 'confirme')).toHaveLength(1);
    expect((await admin.lireEtablissement()).nomCourt).toBe('Fictif');
    const restauree = (await admin.exporterDonnees()).edt_sources?.['imp-fictif'] as { contenu: string };
    expect(restauree.contenu).toBe(source.contenu);
    // Une seconde restauration ne duplique ni n'écrase les passages.
    const r2 = await admin.restaurerDonnees(sauvegarde);
    expect(r2.ignores).toBeGreaterThanOrEqual(1);
    await env.withSecurityRulesDisabled(async (ctx) => {
      expect((await getDoc(doc(ctx.firestore(), 'config', 'installation'))).data()?.faiteLe).toBe('x');
    });
  });
});
