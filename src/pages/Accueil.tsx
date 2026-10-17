import { Link } from 'react-router-dom';
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
      {secondaires.length > 0 && (
        <nav className="acces-secondaires" aria-label="Accès secondaires">
          {secondaires.map((s) => <Link key={s.a} to={s.a} className="bouton">{s.t}</Link>)}
        </nav>
      )}
    </div>
  );
}
