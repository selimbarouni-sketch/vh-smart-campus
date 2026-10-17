import type {
  Calendrier, Eleve, Groupe, ImportEDT, Modification, PassageCantine, ScolariteEleve, ServiceCantine, Utilisateur, VersionEDT,
} from '../domain/types';
import type { ActionAncienne } from '../domain/publication';
import { idPassage } from '../domain/cantine';
import { genererJeton } from '../domain/qr';
import { CALENDRIER_DEFAUT, SERVICES_DEFAUT, type Depot, type ResultatPassage } from './depot';

interface Etat {
  utilisateurs: (Utilisateur & { motDePasse: string })[];
  eleves: Eleve[];
  scolarites: ScolariteEleve[];
  groupes: Groupe[];
  jetons: { jeton: string; eleveId: string; actif: boolean; creeLe: string }[];
  services: ServiceCantine[];
  passages: PassageCantine[];
  anomalies: PassageCantine[];
  imports: ImportEDT[];
  versions: VersionEDT[];
  modifications: Modification[];
  calendrier: Calendrier;
}

const CLE = 'vhsc-demo-v1';
const CLE_SESSION = 'vhsc-demo-session';

/** Jetons de démonstration lisibles (format valide, préfixe DEMO). */
export const jetonDemo = (nom: string) => `VHSC-${('DEMO' + nom).padEnd(24, 'A')}`;

/** Données de démonstration : TOUTES FICTIVES. L'interface affiche un bandeau permanent en mode démo. */
export function etatDemo(): Etat {
  const eleves: Eleve[] = [
    { id: 'demo-e1', nom: 'Ben Ali (fictif)', prenom: 'Yassine', classe: '1re B', actif: true, cantineAutorisee: true },
    { id: 'demo-e2', nom: 'Exemple (fictif)', prenom: 'Lina', classe: '1re B', actif: true, cantineAutorisee: true },
    { id: 'demo-e3', nom: 'Test (fictif)', prenom: 'Adam', classe: '1re B', actif: true, cantineAutorisee: false },
    { id: 'demo-e4', nom: 'Essai (fictif)', prenom: 'Sarra', classe: '2nde 1', actif: true, cantineAutorisee: true },
    { id: 'demo-e5', nom: 'Ancien (fictif)', prenom: 'Omar', classe: '1re B', actif: false, cantineAutorisee: true },
  ];
  const jetons = [
    { jeton: jetonDemo('YASSINE'), eleveId: 'demo-e1' },
    { jeton: jetonDemo('LINA'), eleveId: 'demo-e2' },
    { jeton: jetonDemo('ADAM'), eleveId: 'demo-e3' },
    { jeton: jetonDemo('SARRA'), eleveId: 'demo-e4' },
    { jeton: jetonDemo('OMAR'), eleveId: 'demo-e5' },
  ].map((j) => ({ ...j, actif: true, creeLe: '2026-09-01T08:00:00Z' }));
  return {
    utilisateurs: [
      { uid: 'demo-admin', email: 'admin@demo.local', nom: 'Administrateur (démo)', roles: ['admin'], actif: true, motDePasse: 'demo' },
      { uid: 'demo-cantine', email: 'cantine@demo.local', nom: 'Agent cantine (démo)', roles: ['cantine'], actif: true, motDePasse: 'demo' },
      { uid: 'demo-viesco', email: 'viesco@demo.local', nom: 'Vie scolaire (démo)', roles: ['vie_scolaire'], actif: true, motDePasse: 'demo' },
      { uid: 'demo-edt', email: 'edt@demo.local', nom: 'Gestion EDT (démo)', roles: ['gestion_edt'], actif: true, motDePasse: 'demo' },
    ],
    eleves,
    scolarites: [
      { eleveId: 'demo-e1', groupes: ['1B-ESP-LV2', 'SPE-NSI-1re'] },
      { eleveId: 'demo-e2', groupes: ['1B-ALL-LV2'] },
      { eleveId: 'demo-e3', groupes: [] },
    ],
    groupes: [
      { id: '1B-ESP-LV2', libelle: 'Espagnol LV2 – 1re B (gr. 1)', type: 'langue', classes: ['1re B'] },
      { id: '1B-ALL-LV2', libelle: 'Allemand LV2 – 1re B (gr. 2)', type: 'langue', classes: ['1re B'] },
      { id: 'SPE-NSI-1re', libelle: 'Spécialité NSI – 1re', type: 'specialite', classes: ['1re A', '1re B'] },
    ],
    jetons,
    services: SERVICES_DEFAUT,
    passages: [],
    anomalies: [],
    imports: [],
    versions: [],
    modifications: [],
    calendrier: {
      ...CALENDRIER_DEFAUT,
      // Périodes d'exemple pour la démonstration uniquement : à remplacer par le calendrier officiel.
      vacances: [{ debut: '2026-10-17', fin: '2026-11-01', libelle: 'Vacances (exemple de démonstration)' }],
      feries: [{ date: '2026-11-11', libelle: 'Jour férié (exemple de démonstration)' }],
    },
  };
}

const copie = <T,>(v: T): T => structuredClone(v);

export class DepotMemoire implements Depot {
  readonly mode = 'demo' as const;
  private etat: Etat;
  private session: Utilisateur | null = null;
  private abonnes = new Set<(u: Utilisateur | null) => void>();
  private sources = new Map<string, string>();
  /** Pour les tests : force l'échec de la prochaine écriture. */
  echecProchaineEcriture = false;

  constructor(etatInitial?: Etat, private persister = true) {
    this.etat = etatInitial ?? this.charger() ?? etatDemo();
    if (this.persister) {
      try {
        const uid = sessionStorage.getItem(CLE_SESSION);
        const u = this.etat.utilisateurs.find((x) => x.uid === uid && x.actif);
        if (u) { const { motDePasse: _m, ...public_ } = u; this.session = public_; }
      } catch { /* stockage indisponible */ }
    }
  }

  private charger(): Etat | null {
    if (!this.persister) return null;
    try {
      const brut = localStorage.getItem(CLE);
      return brut ? (JSON.parse(brut) as Etat) : null;
    } catch {
      return null;
    }
  }

  private async ecrire<T>(f: () => T): Promise<T> {
    await new Promise((r) => setTimeout(r, 0));
    if (this.echecProchaineEcriture) {
      this.echecProchaineEcriture = false;
      throw new Error('Échec simulé de l’écriture.');
    }
    const r = f();
    if (this.persister) {
      try { localStorage.setItem(CLE, JSON.stringify(this.etat)); } catch { /* stockage indisponible */ }
    }
    return r;
  }

  reinitialiser() {
    this.etat = etatDemo();
    try { localStorage.removeItem(CLE); } catch { /* ignoré */ }
  }

  ecouterSession(cb: (u: Utilisateur | null) => void) {
    this.abonnes.add(cb);
    cb(this.session);
    return () => { this.abonnes.delete(cb); };
  }
  async connexion(email: string, motDePasse: string) {
    const u = this.etat.utilisateurs.find((x) => x.email === email.trim().toLowerCase() && x.motDePasse === motDePasse && x.actif);
    if (!u) throw new Error('Identifiants incorrects.');
    const { motDePasse: _m, ...public_ } = u;
    this.session = public_;
    try { if (this.persister) sessionStorage.setItem(CLE_SESSION, u.uid); } catch { /* ignoré */ }
    this.abonnes.forEach((cb) => cb(this.session));
  }
  async deconnexion() {
    this.session = null;
    try { sessionStorage.removeItem(CLE_SESSION); } catch { /* ignoré */ }
    this.abonnes.forEach((cb) => cb(null));
  }

  async listerEleves() { return copie(this.etat.eleves); }
  async lireEleve(id: string) { return copie(this.etat.eleves.find((e) => e.id === id) ?? null); }
  async enregistrerEleve(e: Eleve) {
    await this.ecrire(() => { this.etat.eleves = [...this.etat.eleves.filter((x) => x.id !== e.id), copie(e)]; });
  }
  async lireScolarite(id: string) { return copie(this.etat.scolarites.find((s) => s.eleveId === id) ?? null); }
  async enregistrerScolarite(s: ScolariteEleve) {
    await this.ecrire(() => { this.etat.scolarites = [...this.etat.scolarites.filter((x) => x.eleveId !== s.eleveId), copie(s)]; });
  }
  async listerGroupes() { return copie(this.etat.groupes); }
  async enregistrerGroupe(g: Groupe) {
    await this.ecrire(() => { this.etat.groupes = [...this.etat.groupes.filter((x) => x.id !== g.id), copie(g)]; });
  }
  async resoudreJeton(jeton: string) {
    const j = this.etat.jetons.find((x) => x.jeton === jeton && x.actif);
    return j ? j.eleveId : null;
  }
  async regenererJeton(eleveId: string) {
    const jeton = genererJeton();
    await this.ecrire(() => {
      this.etat.jetons = this.etat.jetons.map((j) => (j.eleveId === eleveId ? { ...j, actif: false } : j));
      this.etat.jetons.push({ jeton, eleveId, actif: true, creeLe: new Date().toISOString() });
    });
    return jeton;
  }
  async jetonActif(eleveId: string) {
    return this.etat.jetons.find((j) => j.eleveId === eleveId && j.actif)?.jeton ?? null;
  }

  async servicesCantine() { return copie(this.etat.services); }
  async enregistrerServices(s: ServiceCantine[]) { await this.ecrire(() => { this.etat.services = copie(s); }); }
  async enregistrerPassage(eleve: Eleve, service: string, date: string, agentUid: string): Promise<ResultatPassage> {
    return this.ecrire(() => {
      const id = idPassage(date, service, eleve.id);
      const base = { eleveId: eleve.id, nom: eleve.nom, prenom: eleve.prenom, classe: eleve.classe, date, service, horodatage: new Date().toISOString(), agentUid };
      const existant = this.etat.passages.find((p) => p.id === id);
      if (existant) {
        const doublon: PassageCantine = { ...base, id: `${id}_${Date.now()}`, statut: 'doublon', raison: 'Passage déjà enregistré pour ce service.' };
        this.etat.anomalies.push(doublon);
        return { statut: 'doublon' as const, passage: copie(existant) };
      }
      const p: PassageCantine = { ...base, id, statut: 'confirme' };
      this.etat.passages.push(p);
      return { statut: 'confirme' as const, passage: copie(p) };
    });
  }
  async journaliserRefus(p: Omit<PassageCantine, 'id' | 'statut'>) {
    await this.ecrire(() => { this.etat.anomalies.push({ ...p, id: `refus_${Date.now()}_${Math.random()}`, statut: 'refuse' }); });
  }
  async listerPassages(debut: string, fin: string) {
    return copie([...this.etat.passages, ...this.etat.anomalies].filter((p) => p.date >= debut && p.date <= fin));
  }

  async listerImports() { return copie(this.etat.imports); }
  async lireImport(id: string) { return copie(this.etat.imports.find((i) => i.id === id) ?? null); }
  async enregistrerImport(imp: ImportEDT) {
    await this.ecrire(() => { this.etat.imports = [...this.etat.imports.filter((x) => x.id !== imp.id), copie(imp)]; });
  }
  async televerserSource(importId: string, fichier: File) {
    const chemin = `edt_sources/${importId}/${fichier.name}`;
    this.sources.set(chemin, URL.createObjectURL(fichier));
    return chemin;
  }
  async urlSource(chemin: string) {
    const u = this.sources.get(chemin);
    if (!u) throw new Error('Document source indisponible en mode démonstration après rechargement de la page.');
    return u;
  }
  async publier(version: VersionEDT, actions: ActionAncienne[], importPublie: ImportEDT) {
    await this.ecrire(() => {
      for (const a of actions) {
        const v = this.etat.versions.find((x) => x.id === a.id);
        if (!v) continue;
        if (a.action === 'archiver') v.statut = 'archivee';
        if (a.action === 'raccourcir') v.validiteFin = a.nouvelleFin;
        const imp = this.etat.imports.find((i) => i.id === a.id);
        if (imp && a.action === 'archiver') { imp.statut = 'archive'; imp.remplacePar = version.id; imp.archiveeLe = version.publieeLe; }
      }
      this.etat.versions = [...this.etat.versions.filter((v) => v.id !== version.id), copie(version)];
      this.etat.imports = [...this.etat.imports.filter((x) => x.id !== importPublie.id), copie(importPublie)];
    });
  }
  async listerVersions() { return copie(this.etat.versions); }
  async listerModifications(debut: string, fin: string) {
    return copie(this.etat.modifications.filter((m) => m.date >= debut && m.date <= fin));
  }
  async enregistrerModification(m: Modification) {
    await this.ecrire(() => { this.etat.modifications = [...this.etat.modifications.filter((x) => x.id !== m.id), copie(m)]; });
  }
  async lireCalendrier() { return copie(this.etat.calendrier); }
  async enregistrerCalendrier(c: Calendrier) { await this.ecrire(() => { this.etat.calendrier = copie(c); }); }

  async listerUtilisateurs() { return copie(this.etat.utilisateurs.map(({ motDePasse: _m, ...u }) => u)); }
  async enregistrerUtilisateur(u: Utilisateur) {
    await this.ecrire(() => {
      const ex = this.etat.utilisateurs.find((x) => x.uid === u.uid);
      this.etat.utilisateurs = [...this.etat.utilisateurs.filter((x) => x.uid !== u.uid), { ...copie(u), motDePasse: ex?.motDePasse ?? 'demo' }];
    });
  }
}
