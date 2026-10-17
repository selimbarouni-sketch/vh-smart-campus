import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, doc, getDoc, getDocs, initializeFirestore, query, runTransaction, serverTimestamp, setDoc, where, writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { connectStorageEmulator, getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type {
  Calendrier, Eleve, Groupe, ImportEDT, Modification, PassageCantine, ScolariteEleve, ServiceCantine, Utilisateur, VersionEDT,
} from '../domain/types';
import type { ActionAncienne } from '../domain/publication';
import { idPassage } from '../domain/cantine';
import { genererJeton } from '../domain/qr';
import { CALENDRIER_DEFAUT, SERVICES_DEFAUT, type Depot, type NouveauCompte, type ResultatPassage } from './depot';

const C = {
  utilisateurs: 'utilisateurs', eleves: 'eleves', scolarites: 'scolarites', groupes: 'groupes', jetons: 'qr_jetons',
  config: 'config', passages: 'cantine_passages', anomalies: 'cantine_anomalies',
  imports: 'edt_imports', versions: 'edt_versions', modifications: 'edt_modifications',
};

export class DepotFirebase implements Depot {
  readonly mode = 'firebase' as const;
  private db: Firestore;
  private app;

  constructor(config: FirebaseOptions, private region = 'europe-west1', emulateurs?: { hote: string }) {
    this.app = initializeApp(config, `vhsc-${Math.random().toString(36).slice(2)}`);
    // Pas de cache hors ligne : une écriture n'est confirmée qu'après acquittement du serveur.
    this.db = initializeFirestore(this.app, { ignoreUndefinedProperties: true });
    if (emulateurs) {
      connectAuthEmulator(getAuth(this.app), `http://${emulateurs.hote}:9099`, { disableWarnings: true });
      connectFirestoreEmulator(this.db, emulateurs.hote, 8080);
      connectStorageEmulator(getStorage(this.app), emulateurs.hote, 9199);
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
  async televerserSource(importId: string, fichier: File) {
    const chemin = `edt_sources/${importId}/${fichier.name.replace(/[^\w.\-]+/g, '_')}`;
    await uploadBytes(ref(getStorage(this.app), chemin), fichier, { contentType: fichier.type });
    return chemin;
  }
  urlSource(chemin: string) { return getDownloadURL(ref(getStorage(this.app), chemin)); }
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

  async creerUtilisateur(c: NouveauCompte) {
    // Cloud Function : la création d'un compte Firebase Auth exige les droits d'administration côté serveur.
    await httpsCallable(getFunctions(this.app, this.region), 'creerUtilisateur')(c);
  }

  async analyseMultimodale(imageBase64: string, typeMime: string, contexte: string) {
    const f = httpsCallable(getFunctions(this.app, this.region), 'analyserEmploiDuTemps', { timeout: 300_000 });
    return (await f({ imageBase64, typeMime, contexte })).data;
  }
}
