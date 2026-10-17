import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dejaInstallee, estIphone, installationPossible, installer, surChangementInstallation } from '../app/installation';
import { useApp } from '../app/contexte';

export function Accueil() {
  const { peut } = useApp();
  const secondaires = [
    peut('gerer_eleves') && { a: '/eleves', t: 'Gestion des élèves' },
    peut('importer_edt') && { a: '/edt/import', t: 'Importation des emplois du temps' },
    peut('importer_edt') && { a: '/edt/versions', t: 'Versions publiées' },
    peut('modifier_edt_ponctuel') && { a: '/edt/modifications', t: 'Changements ponctuels' },
    peut('historique_cantine') && { a: '/cantine/historique', t: 'Historique et exports' },
    peut('administrer') && { a: '/administration', t: 'Administration' },
  ].filter(Boolean) as { a: string; t: string }[];

  return (
    <div className="accueil">
      <p className="discret centre">Choisissez le module avant de scanner.</p>
      <div className="grands-boutons">
        {peut('scanner_cantine') && <Link to="/cantine" className="grand-bouton cantine">CANTINE</Link>}
        {peut('scanner_edt') && <Link to="/edt" className="grand-bouton edt">EMPLOI DU TEMPS</Link>}
      </div>
      <BlocInstallation />
      {secondaires.length > 0 && (
        <nav className="acces-secondaires" aria-label="Accès secondaires">
          {secondaires.map((s) => <Link key={s.a} to={s.a} className="bouton">{s.t}</Link>)}
        </nav>
      )}
    </div>
  );
}

/** Proposition d'installer l'application sur l'écran d'accueil (téléphone de scan). */
function BlocInstallation() {
  const [possible, setPossible] = useState(installationPossible());
  const [masque, setMasque] = useState(false);
  useEffect(() => surChangementInstallation(() => setPossible(installationPossible())), []);
  if (dejaInstallee() || masque) return null;
  if (possible) {
    return (
      <div className="carte installer">
        <span>Installer l'application sur ce téléphone pour l'ouvrir comme une application, en plein écran.</span>
        <button className="bouton principal" onClick={() => installer()}>Installer</button>
      </div>
    );
  }
  if (estIphone()) {
    return (
      <div className="carte installer">
        <span>Sur iPhone : touchez <strong>Partager</strong> puis <strong>Sur l'écran d'accueil</strong> pour installer l'application.</span>
        <button className="bouton petit" onClick={() => setMasque(true)}>Masquer</button>
      </div>
    );
  }
  return null;
}
