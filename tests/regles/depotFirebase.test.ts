// Dépôt Firebase exécuté contre les émulateurs (Auth, Firestore), avec règles de sécurité actives. Données FICTIVES.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { DepotFirebase } from '../../src/data/depotFirebase';
import type { ImportEDT } from '../../src/domain/types';
import { preparerPublication, valider } from '../../src/domain/publication';

const config = { apiKey: 'fake', projectId: 'demo-vhsc', authDomain: 'demo-vhsc.firebaseapp.com', storageBucket: 'demo-vhsc.appspot.com' };
let env: RulesTestEnvironment;

async function creerCompte(email: string): Promise<string> {
  const r = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'motdepasse-test', returnSecureToken: true }),
  });
  return (await r.json()).localId;
}

async function connecte(email: string) {
  const d = new DepotFirebase(config, 'europe-west1', { hote: '127.0.0.1' });
  await d.connexion(email, 'motdepasse-test');
  return d;
}

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-vhsc', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
  await env.clearFirestore();
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-vhsc/accounts', { method: 'DELETE' });
  const uidCantine = await creerCompte('cantine@test.local');
  const uidEdt = await creerCompte('edt@test.local');
  const uidViesco = await creerCompte('viesco@test.local');
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'utilisateurs', uidCantine), { email: 'cantine@test.local', nom: 'Cantine', roles: ['cantine'], actif: true });
    await setDoc(doc(db, 'utilisateurs', uidEdt), { email: 'edt@test.local', nom: 'EDT', roles: ['gestion_edt'], actif: true });
    await setDoc(doc(db, 'utilisateurs', uidViesco), { email: 'viesco@test.local', nom: 'Vie scolaire', roles: ['vie_scolaire'], actif: true });
    await setDoc(doc(db, 'eleves', 'e1'), { nom: 'Fictif', prenom: 'Élève', classe: '1re B', actif: true, cantineAutorisee: true });
    await setDoc(doc(db, 'qr_jetons', 'VHSC-AAAAAAAAAAAAAAAAAAAAAAAA'), { eleveId: 'e1', actif: true });
  });
});
afterAll(async () => env.cleanup());

describe('DepotFirebase sur émulateurs', () => {
  it('session : rôles lus depuis le profil', async () => {
    const d = await connecte('cantine@test.local');
    const u = await new Promise<unknown>((ok) => { const stop = d.ecouterSession((x) => { if (x) { stop(); ok(x); } }); });
    expect(u).toMatchObject({ roles: ['cantine'], actif: true });
  });
  it('cantine : transaction de passage, doublon détecté, aucune donnée pédagogique', async () => {
    const d = await connecte('cantine@test.local');
    const id = await d.resoudreJeton('VHSC-AAAAAAAAAAAAAAAAAAAAAAAA');
    expect(id).toBe('e1');
    const e = (await d.lireEleve(id!))!;
    const uid = (await new Promise<{ uid: string }>((ok) => { const stop = d.ecouterSession((x) => { if (x) { stop(); ok(x); } }); })).uid;
    expect((await d.enregistrerPassage(e, 'dejeuner', '2026-09-14', uid)).statut).toBe('confirme');
    expect((await d.enregistrerPassage(e, 'dejeuner', '2026-09-14', uid)).statut).toBe('doublon');
    await expect(d.lireScolarite('e1')).rejects.toThrow();
    await expect(d.listerVersions()).rejects.toThrow();
    expect(await d.resoudreJeton('VHSC-BBBBBBBBBBBBBBBBBBBBBBBB')).toBeNull();
  });
  it('emploi du temps : import, validation, publication atomique, lecture par la vie scolaire', async () => {
    const d = await connecte('edt@test.local');
    const uid = (await new Promise<{ uid: string }>((ok) => { const stop = d.ecouterSession((x) => { if (x) { stop(); ok(x); } }); })).uid;
    let imp: ImportEDT = {
      id: 'imp-1', fichierNom: 'fictif.pdf', fichierType: 'application/pdf', nbPages: 1, typeDocument: 'classe', ciblesParDefaut: ['classe:1re B'],
      importePar: uid, importeParNom: 'EDT', importeLe: '2026-09-01T08:00:00Z', statut: 'brouillon', version: 1, validiteDebut: '2026-09-01', validiteFin: '2027-07-03',
      seances: [{ id: 's1', cible: 'classe:1re B', jour: 'lundi', debut: '10:00', fin: '11:00', matiere: 'Anglais', enseignant: 'Mme Exemple', salle: 'Salle 101', semaine: 'toutes', incertitudes: [] }],
      extraction: [{ methode: 'texte_pdf', pages: [1] }], avertissements: [],
    };
    await d.enregistrerImport(imp);
    imp = valider((await d.lireImport('imp-1'))!, uid, '2026-09-02T08:00:00Z');
    await d.enregistrerImport(imp);
    const p = preparerPublication(imp, await d.listerVersions(), uid, '2026-09-02T09:00:00Z');
    await d.publier(p.version, p.actions, p.importPublie);
    expect((await d.lireImport('imp-1'))!.statut).toBe('publie');
    const v = await connecte('viesco@test.local');
    const versions = await v.listerVersions();
    expect(versions).toHaveLength(1);
    expect(versions[0].seances[0]).toMatchObject({ matiere: 'Anglais', salle: 'Salle 101' });
    await expect(v.enregistrerImport({ ...imp, id: 'pirate' })).rejects.toThrow();
  });
});
