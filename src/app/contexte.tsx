import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ETABLISSEMENT_DEFAUT, type Depot } from '../data/depot';
import type { Etablissement, Utilisateur } from '../domain/types';
import { peut, type Capacite } from '../domain/permissions';
import { appliquerCouleur, appliquerIcone, appliquerTheme, enregistrerPreference, lirePreference, type PreferenceTheme } from './apparence';

interface Contexte {
  depot: Depot;
  utilisateur: Utilisateur | null;
  chargement: boolean;
  peut: (c: Capacite) => boolean;
  /** Horloge injectable (tests). */
  maintenant: () => Date;
  etablissement: Etablissement;
  rechargerEtablissement: () => void;
  theme: PreferenceTheme;
  choisirTheme: (t: PreferenceTheme) => void;
}

const Ctx = createContext<Contexte | null>(null);

export function FournisseurApp({ depot, children, maintenant = () => new Date() }: { depot: Depot; children: ReactNode; maintenant?: () => Date }) {
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [chargement, setChargement] = useState(true);
  const [etablissement, setEtablissement] = useState<Etablissement>(ETABLISSEMENT_DEFAUT);
  const [versionEtab, setVersionEtab] = useState(0);
  const [theme, setTheme] = useState<PreferenceTheme>(lirePreference);
  useEffect(() => depot.ecouterSession((u) => { setUtilisateur(u); setChargement(false); }), [depot]);
  // Identité visuelle : lisible avant connexion (page de connexion avec logo).
  useEffect(() => {
    depot.lireEtablissement().then((e) => {
      setEtablissement(e);
      appliquerCouleur(e.couleur);
      appliquerIcone(e.logo);
      document.title = e.nomCourt;
    }).catch(() => appliquerCouleur(ETABLISSEMENT_DEFAUT.couleur));
  }, [depot, versionEtab]);
  useEffect(() => appliquerTheme(theme), [theme]);
  const valeur = useMemo<Contexte>(() => ({
    depot, utilisateur, chargement, maintenant, etablissement, theme,
    rechargerEtablissement: () => setVersionEtab((v) => v + 1),
    choisirTheme: (t) => { enregistrerPreference(t); setTheme(t); },
    peut: (c) => !!utilisateur?.actif && peut(utilisateur.roles, c),
  }), [depot, utilisateur, chargement, maintenant, etablissement, theme]);
  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}

export function useApp(): Contexte {
  const c = useContext(Ctx);
  if (!c) throw new Error('FournisseurApp manquant');
  return c;
}

/** Charge une donnée asynchrone avec état d'erreur explicite. */
export function useDonnee<T>(charger: () => Promise<T>, deps: unknown[]): { donnee: T | undefined; erreur: string | null; recharger: () => void } {
  const [donnee, setDonnee] = useState<T>();
  const [erreur, setErreur] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let actif = true;
    setErreur(null);
    charger().then((d) => actif && setDonnee(d)).catch((e) => actif && setErreur(messageErreur(e)));
    return () => { actif = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { donnee, erreur, recharger: () => setN((x) => x + 1) };
}

export function messageErreur(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code.includes('permission-denied')) return "Accès refusé : votre rôle ne permet pas cette opération.";
  if (code.includes('unavailable') || code.includes('network')) return 'Connexion au serveur impossible. Vérifiez le réseau.';
  if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password') || code.includes('auth/user-not-found')) return 'Identifiants incorrects.';
  if (code.includes('auth/email-already-in-use')) return 'Un compte existe déjà avec cette adresse e-mail.';
  if (code.includes('auth/weak-password')) return 'Mot de passe trop faible (6 caractères minimum exigés par le serveur ; 8 conseillés).';
  if (code.includes('auth/invalid-email')) return 'Adresse e-mail invalide.';
  if (code.includes('auth/too-many-requests')) return 'Trop de tentatives : réessayez dans quelques minutes.';
  if (code.includes('auth/requires-recent-login')) return 'Pour des raisons de sécurité, reconnectez-vous puis recommencez.';
  if (code.includes('auth/network-request-failed')) return 'Connexion au serveur impossible. Vérifiez le réseau.';
  return e instanceof Error ? e.message : String(e);
}
