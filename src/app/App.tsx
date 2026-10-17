import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import type { Depot } from '../data/depot';
import type { Capacite } from '../domain/permissions';
import { FournisseurApp, useApp } from './contexte';
import { Connexion } from '../pages/Connexion';
import { Accueil } from '../pages/Accueil';
import { ScanCantine } from '../pages/ScanCantine';
import { ScanEDT } from '../pages/ScanEDT';

// Écrans lourds (pdf.js, OCR, export Excel) chargés à la demande : l'accueil et les scanners restent légers.
const differe = <K extends string>(charger: () => Promise<Record<K, () => JSX.Element>>, nom: K) =>
  lazy(() => charger().then((m) => ({ default: m[nom] })));
const HistoriqueCantine = differe(() => import('../pages/HistoriqueCantine'), 'HistoriqueCantine');
const ImportEDT = differe(() => import('../pages/ImportEDT'), 'ImportEDT');
const VersionsEDT = differe(() => import('../pages/VersionsEDT'), 'VersionsEDT');
const ModificationsEDT = differe(() => import('../pages/ModificationsEDT'), 'ModificationsEDT');
const Eleves = differe(() => import('../pages/Eleves'), 'Eleves');
const Administration = differe(() => import('../pages/Administration'), 'Administration');

function Garde({ capacite, children }: { capacite: Capacite; children: ReactNode }) {
  const { peut } = useApp();
  if (!peut(capacite)) {
    return (
      <div className="carte alerte alerte-erreur">
        <h2>Accès non autorisé</h2>
        <p>Votre rôle ne permet pas d'accéder à cette page.</p>
        <Link to="/">Retour à l'accueil</Link>
      </div>
    );
  }
  return <>{children}</>;
}

function Cadre() {
  const { utilisateur, chargement, depot } = useApp();
  const lieu = useLocation();
  if (chargement) return <p className="centre">Chargement…</p>;
  return (
    <>
      {depot.mode === 'demo' && (
        <div className="bandeau-demo" role="status">
          MODE DÉMONSTRATION : données fictives, aucune connexion à la base réelle.
        </div>
      )}
      <header className="entete">
        <Link to="/" className="marque">VH Smart Campus</Link>
        {utilisateur && (
          <span className="utilisateur">
            {utilisateur.nom}
            <button className="lien" onClick={() => depot.deconnexion()}>Déconnexion</button>
          </span>
        )}
      </header>
      <main className="contenu">
        {!utilisateur ? (
          <Connexion />
        ) : !utilisateur.actif ? (
          <div className="carte alerte alerte-erreur">
            <h2>Compte non activé</h2>
            <p>Votre compte n'a pas encore de rôle attribué. Contactez l'administrateur de l'application.</p>
          </div>
        ) : (
          <Suspense fallback={<p className="centre">Chargement…</p>}>
          <Routes location={lieu}>
            <Route path="/" element={<Accueil />} />
            <Route path="/cantine" element={<Garde capacite="scanner_cantine"><ScanCantine /></Garde>} />
            <Route path="/cantine/historique" element={<Garde capacite="historique_cantine"><HistoriqueCantine /></Garde>} />
            <Route path="/edt" element={<Garde capacite="scanner_edt"><ScanEDT /></Garde>} />
            <Route path="/edt/import" element={<Garde capacite="importer_edt"><ImportEDT /></Garde>} />
            <Route path="/edt/import/:id" element={<Garde capacite="importer_edt"><ImportEDT /></Garde>} />
            <Route path="/edt/versions" element={<Garde capacite="importer_edt"><VersionsEDT /></Garde>} />
            <Route path="/edt/modifications" element={<Garde capacite="modifier_edt_ponctuel"><ModificationsEDT /></Garde>} />
            <Route path="/eleves" element={<Garde capacite="gerer_eleves"><Eleves /></Garde>} />
            <Route path="/administration" element={<Garde capacite="administrer"><Administration /></Garde>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        )}
      </main>
    </>
  );
}

export function App({ depot, maintenant }: { depot: Depot; maintenant?: () => Date }) {
  return (
    <FournisseurApp depot={depot} maintenant={maintenant}>
      <BrowserRouter>
        <Cadre />
      </BrowserRouter>
    </FournisseurApp>
  );
}
