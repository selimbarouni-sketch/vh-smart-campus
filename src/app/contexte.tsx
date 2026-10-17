import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Depot } from '../data/depot';
import type { Utilisateur } from '../domain/types';
import { peut, type Capacite } from '../domain/permissions';

interface Contexte {
  depot: Depot;
  utilisateur: Utilisateur | null;
  chargement: boolean;
  peut: (c: Capacite) => boolean;
  /** Horloge injectable (tests). */
  maintenant: () => Date;
}

const Ctx = createContext<Contexte | null>(null);

export function FournisseurApp({ depot, children, maintenant = () => new Date() }: { depot: Depot; children: ReactNode; maintenant?: () => Date }) {
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [chargement, setChargement] = useState(true);
  useEffect(() => depot.ecouterSession((u) => { setUtilisateur(u); setChargement(false); }), [depot]);
  const valeur = useMemo<Contexte>(() => ({
    depot, utilisateur, chargement, maintenant,
    peut: (c) => !!utilisateur?.actif && peut(utilisateur.roles, c),
  }), [depot, utilisateur, chargement, maintenant]);
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
  return e instanceof Error ? e.message : String(e);
}
