// Règles de sécurité Firestore, vérifiées sur l'émulateur avec des données FICTIVES.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
const ROLES: Record<string, string[]> = {
  admin: ['admin'], cantine: ['cantine'], viesco: ['vie_scolaire'], edt: ['gestion_edt'], eleves: ['gestion_eleves'], inactif: ['admin'],
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-vhsc',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, roles] of Object.entries(ROLES)) await setDoc(doc(db, 'utilisateurs', uid), { email: `${uid}@test`, nom: uid, roles, actif: uid !== 'inactif' });
    await setDoc(doc(db, 'eleves', 'e1'), { nom: 'Fictif', prenom: 'Élève', classe: '1re B', actif: true, cantineAutorisee: true });
    await setDoc(doc(db, 'eleves', 'e2'), { nom: 'Fictif', prenom: 'Externe', classe: '1re B', actif: true, cantineAutorisee: false });
    await setDoc(doc(db, 'eleves', 'e3'), { nom: 'Fictif', prenom: 'Club', classe: '1re B', actif: true, cantineAutorisee: false, datesCantine: ['2026-09-14'] });
    await setDoc(doc(db, 'scolarites', 'e1'), { groupes: ['ESP'] });
    await setDoc(doc(db, 'qr_jetons', 'VHSC-JETON'), { eleveId: 'e1', actif: true });
    await setDoc(doc(db, 'edt_versions', 'v1'), { statut: 'active', cibles: ['classe:1re B'], seances: [] });
    await setDoc(doc(db, 'edt_modifications', 'm1'), { date: '2026-09-14', type: 'salle', cible: 'classe:1re B', motif: 'test', creePar: 'edt', actif: true });
  });
});

const db = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const passage = (eleveId: string, agentUid: string) => ({ eleveId, nom: 'Fictif', prenom: 'Élève', classe: '1re B', date: '2026-09-14', service: 'dejeuner', horodatage: 'x', agentUid, statut: 'confirme' });

describe('Personnel de cantine', () => {
  it('lit l’identité de l’élève et résout un jeton, sans lister les jetons', async () => {
    await assertSucceeds(getDoc(doc(db('cantine'), 'eleves', 'e1')));
    await assertSucceeds(getDoc(doc(db('cantine'), 'qr_jetons', 'VHSC-JETON')));
    await assertFails(getDocs(collection(db('cantine'), 'qr_jetons')));
  });
  it('n’accède pas aux données pédagogiques ni aux emplois du temps', async () => {
    await assertFails(getDoc(doc(db('cantine'), 'scolarites', 'e1')));
    await assertFails(getDoc(doc(db('cantine'), 'edt_versions', 'v1')));
    await assertFails(getDocs(collection(db('cantine'), 'cantine_passages')));
  });
  it('enregistre un passage ; un second passage identique est refusé par le serveur', async () => {
    const d = db('cantine');
    await assertSucceeds(setDoc(doc(d, 'cantine_passages', '2026-09-14_dejeuner_e1'), passage('e1', 'cantine')));
    await assertFails(setDoc(doc(d, 'cantine_passages', '2026-09-14_dejeuner_e1'), passage('e1', 'cantine')));
    await assertFails(deleteDoc(doc(d, 'cantine_passages', '2026-09-14_dejeuner_e1')));
  });
  it('élève sans cantine habituelle : passage uniquement aux dates listées', async () => {
    const d = db('cantine');
    const passageE3 = (date: string) => ({ ...passage('e3', 'cantine'), date });
    await assertSucceeds(setDoc(doc(d, 'cantine_passages', '2026-09-14_dejeuner_e3'), passageE3('2026-09-14')));
    await assertFails(setDoc(doc(d, 'cantine_passages', '2026-09-21_dejeuner_e3'), passageE3('2026-09-21')));
  });
  it('refuse un passage pour un élève non autorisé, un identifiant incohérent ou un autre agent', async () => {
    const d = db('cantine');
    await assertFails(setDoc(doc(d, 'cantine_passages', '2026-09-14_dejeuner_e2'), passage('e2', 'cantine')));
    await assertFails(setDoc(doc(d, 'cantine_passages', 'autre-id'), passage('e1', 'cantine')));
    await assertFails(setDoc(doc(d, 'cantine_passages', '2026-09-14_dejeuner_e1'), passage('e1', 'admin')));
  });
});

describe('Autres rôles', () => {
  it('vie scolaire : lit les emplois du temps et les groupes, ne publie pas, ne scanne pas la cantine', async () => {
    await assertSucceeds(getDoc(doc(db('viesco'), 'edt_versions', 'v1')));
    await assertSucceeds(getDoc(doc(db('viesco'), 'scolarites', 'e1')));
    await assertFails(setDoc(doc(db('viesco'), 'edt_versions', 'v2'), { statut: 'active' }));
    await assertFails(setDoc(doc(db('viesco'), 'cantine_passages', '2026-09-14_dejeuner_e1'), passage('e1', 'viesco')));
  });
  it('gestion EDT : crée imports et versions', async () => {
    await assertSucceeds(setDoc(doc(db('edt'), 'edt_imports', 'i1'), { statut: 'brouillon' }));
    await assertSucceeds(setDoc(doc(db('edt'), 'edt_versions', 'v2'), { statut: 'active' }));
  });
  it('changement ponctuel : seule l’annulation est modifiable après création', async () => {
    await assertSucceeds(updateDoc(doc(db('viesco'), 'edt_modifications', 'm1'), { actif: false }));
    await assertFails(updateDoc(doc(db('viesco'), 'edt_modifications', 'm1'), { motif: 'autre' }));
  });
  it('un utilisateur ne peut pas s’attribuer de rôle', async () => {
    await assertFails(updateDoc(doc(db('cantine'), 'utilisateurs', 'cantine'), { roles: ['admin'] }));
    await assertSucceeds(getDoc(doc(db('cantine'), 'utilisateurs', 'cantine')));
  });
  it('compte désactivé ou non connecté : aucun accès', async () => {
    await assertFails(getDoc(doc(db('inactif'), 'eleves', 'e1')));
    await assertFails(getDoc(doc(db(null), 'eleves', 'e1')));
    await assertFails(getDoc(doc(db(null), 'qr_jetons', 'VHSC-JETON')));
  });
});
