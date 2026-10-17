import { deleteApp, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import {
  EmailAuthProvider, connectAuthEmulator, createUserWithEmailAndPassword, getAuth, onAuthStateChanged, reauthenticateWithCredential,
  sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updatePassword,
} from 'firebase/auth';
import {
  Timestamp, collection, connectFirestoreEmulator, doc, getDoc, getDocs, initializeFirestore, query, runTransaction, serverTimestamp, setDoc, where, writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type {
  Calendrier, Eleve, Etablissement, Groupe, ImportEDT, Modification, NouveauCompte, PassageCantine, ScolariteEleve, ServiceCantine, Utilisateur, VersionEDT,
} from '../domain/types';
import type { ActionAncienne } from '../domain/publication';
import { idPassage } from '../domain/cantine';
import { genererJeton } from '../domain/qr';
import { AJOUT_SEUL, COLLECTIONS_SAUVEGARDE, type Donnees, type RapportRestauration } from '../domain/sauvegarde';
import { CALENDRIER_DEFAUT, ETABLISSEMENT_DEFAUT, SERVICES_DEFAUT, type Depot, type ResultatPassage } from './depot';

/** Taille d'un morceau de document source (base64) : sous la limite de 1 Mio d'un document Firestore. */
const TAILLE_MORCEAU = 700_000;
export const TAILLE_MAX_SOURCE = 15 * 1024 * 1024;

function versBase64(octets: Uint8Array): string {
  let s = '';
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s);
}
function depuisBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const r = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) r[i] = s.charCodeAt(i);
  return r;
}
/** Valeurs Firestore → JSON (dates en texte ISO). */
function versJson(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(versJson);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, versJson(x)]));
  return v;
}

const C = {
  utilisateurs: 'utilisateurs', eleves: 'eleves', scolarites: 'scolarites', groupes: 'groupes', jetons: 'qr_jetons',
  config: 'config', passages: 'cantine_passages', anomalies: 'cantine_anomalies',
  imports: 'edt_imports', versions: 'edt_versions', modifications: 'edt_modifications', sources: 'edt_sources',
};

export class DepotFirebase implements Depot {
  readonly mode = 'firebase' as const;
  private db: Firestore;
  private app: FirebaseApp;

  /** Présente seulement si la fonction serveur d'analyse multimodale est déployée (offre Blaze). */
  analyseMultimodale?: Depot['analyseMultimodale'];

  constructor(private config: FirebaseOptions, private region = 'europe-west1', private emulateurs?: { hote: string }, options: { multimodal?: boolean } = {}) {
    if (options.multimodal) this.analyseMultimodale = (image, type, contexte) => this.appelerAnalyse(image, type, contexte);
    this.app = initializeApp(config, `vhsc-${Math.random().toString(36).slice(2)}`);
    // Pas de cache hors ligne : une écriture n'est confirmée qu'après acquittement du serveur.
    this.db = initializeFirestore(this.app, { ignoreUndefinedProperties: true });
    getAuth(this.app).languageCode = 'fr';
    if (emulateurs) {
      connectAuthEmulator(getAuth(this.app), `http://${emulateurs.hote}:9099`, { disableWarnings: true });
      connectFirestoreEmulator(this.db, emulateurs.hote, 8080);
    }
  }

  private async tous<T>(nom: string): Promise<T[]> {
    const s = await getDocs(collection(this.db, nom));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
  }
  private async un<T>(nom: string, id: string): Promise<T | null> {
    const s = await getDoc(doc(this.db, nom, id));
    return s.exists() ? ({ id: s.id, ...s.data() } as T) : null;
  }

  ecouterSession(cb: (u: Utilisateur | null) => void) {
    return onAuthStateChanged(getAuth(this.app), async (fu) => {
      if (!fu) return cb(null);
      try {
        const profil = await getDoc(doc(this.db, C.utilisateurs, fu.uid));
        const d = profil.data();
        if (!profil.exists() || !d?.actif) {
          cb({ uid: fu.uid, email: fu.email ?? '', nom: fu.email ?? '', roles: [], actif: false });
          return;
        }
        cb({ uid: fu.uid, email: fu.email ?? '', nom: d.nom ?? fu.email, roles: d.roles ?? [], actif: true });
      } catch {
        cb({ uid: fu.uid, email: fu.email ?? '', nom: fu.email ?? '', roles: [], actif: false });
      }
    });
  }
  async connexion(email: string, motDePasse: string) {
    await signInWithEmailAndPassword(getAuth(this.app), email.trim(), motDePasse);
  }
  async deconnexion() { await signOut(getAuth(this.app)); }
  async envoyerReinitialisation(email: string) { await sendPasswordResetEmail(getAuth(this.app), email.trim()); }
  async changerMotDePasse(actuel: string, nouveau: string) {
    const u = getAuth(this.app).currentUser;
    if (!u?.email) throw new Error('Session expirée : reconnectez-vous.');
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, actuel));
    await updatePassword(u, nouveau);
  }
  async installationRequise() {
    return !(await getDoc(doc(this.db, C.config, 'installation'))).exists();
  }
  async installer(c: Omit<NouveauCompte, 'roles'>) {
    const auth = getAuth(this.app);
    const { user } = await createUserWithEmailAndPassword(auth, c.email.trim(), c.motDePasse);
    try {
      // Les règles n'acceptent ce lot que si l'installation n'a jamais été faite.
      const b = writeBatch(this.db);
      b.set(doc(this.db, C.utilisateurs, user.uid), { email: c.email.trim().toLowerCase(), nom: c.nom.trim(), roles: ['admin'], actif: true });
      b.set(doc(this.db, C.config, 'installation'), { faiteLe: new Date().toISOString(), par: user.uid });
      await b.commit();
      await signOut(auth);
      await signInWithEmailAndPassword(auth, c.email.trim(), c.motDePasse); // recharge la session avec le profil créé
    } catch (e) {
      await user.delete().catch(() => undefined);
      throw e;
    }
  }

  listerEleves() { return this.tous<Eleve>(C.eleves); }
  lireEleve(id: string) { return this.un<Eleve>(C.eleves, id); }
  async enregistrerEleve(e: Eleve) { const { id, ...d } = e; await setDoc(doc(this.db, C.eleves, id), d); }
  async lireScolarite(id: string) {
    const s = await getDoc(doc(this.db, C.scolarites, id));
    return s.exists() ? ({ eleveId: id, groupes: s.data().groupes ?? [] }) : null;
  }
  async enregistrerScolarite(s: ScolariteEleve) { await setDoc(doc(this.db, C.scolarites, s.eleveId), { groupes: s.groupes }); }
  listerGroupes() { return this.tous<Groupe>(C.groupes); }
  async enregistrerGroupe(g: Groupe) { const { id, ...d } = g; await setDoc(doc(this.db, C.groupes, id), d); }

  async resoudreJeton(jeton: string) {
    // Lecture unitaire uniquement : les règles interdisent de lister les jetons aux agents de scan.
    const s = await getDoc(doc(this.db, C.jetons, jeton));
    const d = s.data();
    return s.exists() && d?.actif ? (d.eleveId as string) : null;
  }
  async regenererJeton(eleveId: string) {
    const jeton = genererJeton();
    const anciens = await getDocs(query(collection(this.db, C.jetons), where('eleveId', '==', eleveId), where('actif', '==', true)));
    const b = writeBatch(this.db);
    anciens.forEach((d) => b.update(d.ref, { actif: false }));
    b.set(doc(this.db, C.jetons, jeton), { eleveId, actif: true, creeLe: new Date().toISOString() });
    await b.commit();
    return jeton;
  }
  async jetonActif(eleveId: string) {
    const s = await getDocs(query(collection(this.db, C.jetons), where('eleveId', '==', eleveId), where('actif', '==', true)));
    return s.empty ? null : s.docs[0].id;
  }

  async servicesCantine() {
    const s = await getDoc(doc(this.db, C.config, 'cantine'));
    return (s.data()?.services as ServiceCantine[] | undefined) ?? SERVICES_DEFAUT;
  }
  async enregistrerServices(services: ServiceCantine[]) { await setDoc(doc(this.db, C.config, 'cantine'), { services }); }

  async enregistrerPassage(eleve: Eleve, service: string, date: string, agentUid: string): Promise<ResultatPassage> {
    const id = idPassage(date, service, eleve.id);
    const refPassage = doc(this.db, C.passages, id);
    const base = { eleveId: eleve.id, nom: eleve.nom, prenom: eleve.prenom, classe: eleve.classe, date, service, agentUid };
    // Transaction : jamais hors ligne, résolue uniquement après validation par le serveur.
    return runTransaction(this.db, async (t) => {
      const existant = await t.get(refPassage);
      const horodatage = new Date().toISOString();
      if (existant.exists()) {
        t.set(doc(collection(this.db, C.anomalies)), { ...base, horodatage, statut: 'doublon', raison: 'Passage déjà enregistré pour ce service.', serveur: serverTimestamp() });
        return { statut: 'doublon' as const, passage: { id, ...existant.data() } as PassageCantine };
      }
      const p = { ...base, horodatage, statut: 'confirme' as const };
      t.set(refPassage, { ...p, serveur: serverTimestamp() });
      return { statut: 'confirme' as const, passage: { id, ...p } };
    });
  }
  async journaliserRefus(p: Omit<PassageCantine, 'id' | 'statut'>) {
    await setDoc(doc(collection(this.db, C.anomalies)), { ...p, statut: 'refuse', serveur: serverTimestamp() });
  }
  async listerPassages(debut: string, fin: string) {
    const q = (nom: string) => getDocs(query(collection(this.db, nom), where('date', '>=', debut), where('date', '<=', fin)));
    const [a, b] = await Promise.all([q(C.passages), q(C.anomalies)]);
    return [...a.docs, ...b.docs].map((d) => {
      const { serveur: _s, ...data } = d.data();
      return { id: d.id, ...data } as PassageCantine;
    });
  }

  listerImports() { return this.tous<ImportEDT>(C.imports); }
  lireImport(id: string) { return this.un<ImportEDT>(C.imports, id); }
  async enregistrerImport(imp: ImportEDT) { const { id, ...d } = imp; await setDoc(doc(this.db, C.imports, id), d); }
  /**
   * Document source conservé dans Firestore, découpé en morceaux (aucun service payant requis).
   * La référence renvoyée est « firestore:edt_sources/<id> ».
   */
  async televerserSource(importId: string, fichier: File) {
    if (fichier.size > TAILLE_MAX_SOURCE) throw new Error('Document trop volumineux (15 Mo maximum).');
    await this.ecrireSource(importId, { nom: fichier.name, type: fichier.type, contenu: versBase64(new Uint8Array(await fichier.arrayBuffer())) });
    return `firestore:${C.sources}/${importId}`;
  }
  private async ecrireSource(id: string, s: { nom: string; type: string; contenu: string; creeLe?: string }) {
    const morceaux: string[] = [];
    for (let i = 0; i < s.contenu.length; i += TAILLE_MORCEAU) morceaux.push(s.contenu.slice(i, i + TAILLE_MORCEAU));
    // Morceaux d'abord, description ensuite : une source n'est « présente » que lorsqu'elle est complète.
    for (let i = 0; i < morceaux.length; i++) await setDoc(doc(this.db, C.sources, id, 'morceaux', String(i)), { i, donnees: morceaux[i] });
    await setDoc(doc(this.db, C.sources, id), { nom: s.nom, type: s.type, morceaux: morceaux.length, taille: Math.floor((s.contenu.length * 3) / 4), creeLe: s.creeLe ?? new Date().toISOString() });
  }
  private async lireSource(id: string): Promise<{ nom: string; type: string; contenu: string; creeLe: string } | null> {
    const meta = await getDoc(doc(this.db, C.sources, id));
    if (!meta.exists()) return null;
    const m = meta.data();
    const parts = await getDocs(collection(this.db, C.sources, id, 'morceaux'));
    const tries = parts.docs.map((d) => d.data() as { i: number; donnees: string }).sort((a, b) => a.i - b.i);
    if (tries.length !== m.morceaux) throw new Error('Document source incomplet.');
    return { nom: m.nom, type: m.type, creeLe: m.creeLe, contenu: tries.map((t) => t.donnees).join('') };
  }
  async urlSource(reference: string) {
    const id = reference.replace(/^firestore:edt_sources\//, '');
    const s = await this.lireSource(id);
    if (!s) throw new Error('Document source introuvable.');
    return URL.createObjectURL(new Blob([depuisBase64(s.contenu)], { type: s.type || 'application/pdf' }));
  }
  async publier(version: VersionEDT, actions: ActionAncienne[], importPublie: ImportEDT) {
    const b = writeBatch(this.db);
    for (const a of actions) {
      if (a.action === 'archiver') {
        b.update(doc(this.db, C.versions, a.id), { statut: 'archivee' });
        b.update(doc(this.db, C.imports, a.id), { statut: 'archive', remplacePar: version.id, archiveeLe: version.publieeLe });
      } else if (a.action === 'raccourcir') {
        b.update(doc(this.db, C.versions, a.id), { validiteFin: a.nouvelleFin });
      }
    }
    const { id, ...v } = version;
    b.set(doc(this.db, C.versions, id), v);
    const { id: idImp, ...imp } = importPublie;
    b.set(doc(this.db, C.imports, idImp), imp);
    await b.commit();
  }
  async listerVersions() {
    return (await getDocs(query(collection(this.db, C.versions), where('statut', '==', 'active')))).docs.map((d) => ({ id: d.id, ...d.data() }) as VersionEDT);
  }
  async listerModifications(debut: string, fin: string) {
    const s = await getDocs(query(collection(this.db, C.modifications), where('date', '>=', debut), where('date', '<=', fin)));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }) as Modification);
  }
  async enregistrerModification(m: Modification) { const { id, ...d } = m; await setDoc(doc(this.db, C.modifications, id), d); }
  async lireCalendrier() {
    const s = await getDoc(doc(this.db, C.config, 'calendrier'));
    return (s.data() as Calendrier | undefined) ?? CALENDRIER_DEFAUT;
  }
  async enregistrerCalendrier(c: Calendrier) { await setDoc(doc(this.db, C.config, 'calendrier'), c); }

  async listerUtilisateurs() {
    return (await getDocs(collection(this.db, C.utilisateurs))).docs.map((d) => ({ uid: d.id, ...d.data() }) as Utilisateur);
  }
  async enregistrerUtilisateur(u: Utilisateur) { const { uid, ...d } = u; await setDoc(doc(this.db, C.utilisateurs, uid), d); }

  /**
   * Création d'un compte par l'administrateur : une seconde instance Firebase crée l'identifiant
   * (la session de l'administrateur reste ouverte), puis le profil et les rôles sont enregistrés.
   */
  async creerCompte(c: NouveauCompte) {
    const secondaire = initializeApp(this.config, `creation-${Date.now()}`);
    try {
      const auth2 = getAuth(secondaire);
      if (this.emulateurs) connectAuthEmulator(auth2, `http://${this.emulateurs.hote}:9099`, { disableWarnings: true });
      const { user } = await createUserWithEmailAndPassword(auth2, c.email.trim(), c.motDePasse);
      try {
        await setDoc(doc(this.db, C.utilisateurs, user.uid), { email: c.email.trim().toLowerCase(), nom: c.nom.trim(), roles: c.roles, actif: true });
      } catch (e) {
        // Profil refusé (droits insuffisants, réseau) : l'identifiant créé est supprimé, aucun compte orphelin.
        await user.delete().catch(() => undefined);
        throw e;
      }
      await signOut(auth2);
      return user.uid;
    } finally {
      await deleteApp(secondaire);
    }
  }

  async lireEtablissement(): Promise<Etablissement> {
    const s = await getDoc(doc(this.db, C.config, 'etablissement'));
    return { ...ETABLISSEMENT_DEFAUT, ...(s.data() as Partial<Etablissement> | undefined) };
  }
  async enregistrerEtablissement(e: Etablissement) { await setDoc(doc(this.db, C.config, 'etablissement'), e); }

  async exporterDonnees(): Promise<Donnees> {
    const res: Donnees = {};
    for (const nom of COLLECTIONS_SAUVEGARDE) {
      const docs = await getDocs(collection(this.db, nom));
      const r: Record<string, Record<string, unknown>> = {};
      for (const d of docs.docs) {
        if (nom === 'edt_sources') {
          const s = await this.lireSource(d.id);
          if (s) r[d.id] = s;
        } else r[d.id] = versJson(d.data()) as Record<string, unknown>;
      }
      res[nom] = r;
    }
    return res;
  }

  async restaurerDonnees(donnees: Donnees, progression?: (fait: number, total: number) => void): Promise<RapportRestauration> {
    const total = Object.values(donnees).reduce((t, c) => t + Object.keys(c ?? {}).length, 0);
    let fait = 0, ecrits = 0, ignores = 0;
    for (const nom of COLLECTIONS_SAUVEGARDE) {
      const docs = Object.entries(donnees[nom] ?? {});
      if (!docs.length) continue;
      const existants = new Set((await getDocs(collection(this.db, nom))).docs.map((d) => d.id));
      if (nom === 'edt_sources') {
        for (const [id, d] of docs) {
          await this.ecrireSource(id, d as { nom: string; type: string; contenu: string; creeLe?: string });
          ecrits++; progression?.(++fait, total);
        }
        continue;
      }
      let lot = writeBatch(this.db), taille = 0;
      for (const [id, d] of docs) {
        // L'installation n'est jamais rejouée ; les passages et anomalies ne sont jamais écrasés.
        if ((nom === 'config' && id === 'installation') || (AJOUT_SEUL.includes(nom) && existants.has(id))) { ignores++; progression?.(++fait, total); continue; }
        lot.set(doc(this.db, nom, id), d);
        ecrits++; taille++;
        if (taille === 400) { await lot.commit(); lot = writeBatch(this.db); taille = 0; }
        progression?.(++fait, total);
      }
      if (taille) await lot.commit();
    }
    return { ecrits, ignores };
  }

  private async appelerAnalyse(imageBase64: string, typeMime: string, contexte: string) {
    const f = httpsCallable(getFunctions(this.app, this.region), 'analyserEmploiDuTemps', { timeout: 300_000 });
    return (await f({ imageBase64, typeMime, contexte })).data;
  }
}
