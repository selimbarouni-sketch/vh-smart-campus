import { Link } from 'react-router-dom';
import { useApp, useDonnee } from '../app/contexte';
import { libelleCible } from '../domain/emploiDuTemps';

const STATUTS = { brouillon: 'Brouillon', verifie: 'Vérifié', publie: 'Publié', archive: 'Archivé', rejete: 'Rejeté' } as const;

export function VersionsEDT() {
  const { depot } = useApp();
  const { donnee: imports, erreur } = useDonnee(() => depot.listerImports(), [depot]);
  const { donnee: versions } = useDonnee(() => depot.listerVersions(), [depot]);
  const tries = [...(imports ?? [])].sort((a, b) => b.importeLe.localeCompare(a.importeLe));
  return (
    <div className="module">
      <div className="titre-module"><Link to="/" className="retour">← Accueil</Link><h1>Versions des emplois du temps</h1></div>
      <div className="ligne">
        <Link to="/edt/import" className="bouton principal">Importer une nouvelle version</Link>
        <Link to="/edt/modifications" className="bouton">Changement ponctuel (salle, enseignant, horaire)</Link>
      </div>
      {erreur && <p className="alerte alerte-erreur">{erreur}</p>}
      <div className="table-defilante">
        <table>
          <thead><tr><th>Document</th><th>Classes / groupes</th><th>Version</th><th>Validité</th><th>Statut</th><th>Importé</th><th>Validé</th><th>Publié</th></tr></thead>
          <tbody>
            {tries.map((i) => {
              const v = versions?.find((x) => x.id === i.id);
              return (
                <tr key={i.id}>
                  <td><Link to={`/edt/import/${i.id}`}>{i.fichierNom}</Link></td>
                  <td>{(v?.cibles ?? i.ciblesParDefaut).map(libelleCible).join(', ') || '—'}</td>
                  <td>{i.version}</td>
                  <td>{i.validiteDebut} → {v?.validiteFin ?? i.validiteFin}</td>
                  <td><span className={`statut statut-${i.statut}`}>{STATUTS[i.statut]}{v?.statut === 'active' ? ' (active)' : ''}</span></td>
                  <td>{new Date(i.importeLe).toLocaleDateString('fr-FR')} · {i.importeParNom}</td>
                  <td>{i.valideeLe ? new Date(i.valideeLe).toLocaleDateString('fr-FR') : '—'}</td>
                  <td>{i.publieeLe ? new Date(i.publieeLe).toLocaleDateString('fr-FR') : '—'}</td>
                </tr>
              );
            })}
            {tries.length === 0 && <tr><td colSpan={8} className="centre discret">Aucun import.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
