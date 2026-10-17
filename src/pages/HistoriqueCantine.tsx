import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ExcelJS from 'exceljs';
import { useApp, useDonnee } from '../app/contexte';
import { filtrerPassages, lignesExport, statistiques, versCsv } from '../domain/cantine';
import { instantLocal } from '../domain/temps';

const LIBELLES = { confirme: 'Confirmé', refuse: 'Refusé', doublon: 'Doublon' } as const;

export function HistoriqueCantine() {
  const { depot, maintenant } = useApp();
  const aujourdhui = instantLocal(maintenant(), 'Africa/Tunis').date;
  const [debut, setDebut] = useState(aujourdhui);
  const [fin, setFin] = useState(aujourdhui);
  const [classe, setClasse] = useState('');
  const [service, setService] = useState('');
  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState<'' | 'confirme' | 'refuse' | 'doublon'>('');
  const { donnee: services } = useDonnee(() => depot.servicesCantine(), [depot]);
  const { donnee: lignes, erreur } = useDonnee(() => depot.listerPassages(debut, fin), [depot, debut, fin]);

  const filtrees = useMemo(() => filtrerPassages(lignes ?? [], { dateDebut: debut, dateFin: fin, classe: classe || undefined, service: service || undefined, recherche }), [lignes, debut, fin, classe, service, recherche]);
  const stats = statistiques(filtrees);
  const classes = [...new Set((lignes ?? []).map((l) => l.classe).filter(Boolean))].sort();
  const affichees = statut ? filtrees.filter((l) => l.statut === statut) : filtrees;

  const nomFichier = `passages-cantine_${debut}_${fin}`;
  const exporterCsv = () => telecharger(new Blob([versCsv(lignesExport(filtrees, services ?? []))], { type: 'text/csv;charset=utf-8' }), `${nomFichier}.csv`);
  const exporterExcel = async () => {
    const lignesX = lignesExport(filtrees, services ?? []);
    const classeur = new ExcelJS.Workbook();
    const feuille = classeur.addWorksheet('Passages confirmés');
    feuille.columns = Object.keys(lignesX[0] ?? { Date: '' }).map((k) => ({ header: k, key: k, width: k === 'Identifiant élève' ? 22 : 16 }));
    feuille.getRow(1).font = { bold: true };
    feuille.addRows(lignesX);
    const resume = classeur.addWorksheet('Résumé');
    resume.addRows([
      ['Période', `${debut} au ${fin}`], ['Passages confirmés', stats.passages], ['Élèves distincts', stats.elevesDistincts],
      ['Passages refusés', stats.refus], ['Doublons', stats.doublons],
    ]);
    resume.getColumn(1).width = 22;
    const tampon = await classeur.xlsx.writeBuffer();
    telecharger(new Blob([tampon], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${nomFichier}.xlsx`);
  };

  return (
    <div className="module">
      <div className="titre-module"><Link to="/" className="retour">← Accueil</Link><h1>Historique de la cantine</h1></div>
      <section className="carte filtres">
        <label>Du <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} /></label>
        <label>Au <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></label>
        <label>Classe <select value={classe} onChange={(e) => setClasse(e.target.value)}><option value="">Toutes</option>{classes.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Service <select value={service} onChange={(e) => setService(e.target.value)}><option value="">Tous</option>{services?.map((s) => <option key={s.id} value={s.id}>{s.libelle}</option>)}</select></label>
        <label>Élève <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom ou prénom" /></label>
      </section>
      {erreur && <p className="alerte alerte-erreur">{erreur}</p>}
      <div className="stats" data-testid="stats-cantine">
        <button className={`stat ${statut === 'confirme' ? 'actif' : ''}`} onClick={() => setStatut(statut === 'confirme' ? '' : 'confirme')}><b>{stats.passages}</b>passages confirmés</button>
        <div className="stat"><b>{stats.elevesDistincts}</b>élèves distincts ayant mangé</div>
        <button className={`stat refus ${statut === 'refuse' ? 'actif' : ''}`} onClick={() => setStatut(statut === 'refuse' ? '' : 'refuse')}><b>{stats.refus}</b>passages refusés</button>
        <button className={`stat doublon ${statut === 'doublon' ? 'actif' : ''}`} onClick={() => setStatut(statut === 'doublon' ? '' : 'doublon')}><b>{stats.doublons}</b>doublons</button>
      </div>
      <div className="ligne">
        <button className="bouton" onClick={exporterExcel} disabled={!stats.passages}>Exporter (Excel)</button>
        <button className="bouton" onClick={exporterCsv} disabled={!stats.passages}>Exporter (CSV)</button>
        <span className="discret">Les exports ne contiennent que les passages confirmés.</span>
      </div>
      <div className="table-defilante">
        <table>
          <thead><tr><th>Date</th><th>Heure</th><th>Service</th><th>Élève</th><th>Classe</th><th>Statut</th><th>Motif</th></tr></thead>
          <tbody>
            {affichees.map((l) => (
              <tr key={l.id} className={`statut-${l.statut}`}>
                <td>{l.date}</td>
                <td>{new Date(l.horodatage).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Tunis' })}</td>
                <td>{services?.find((s) => s.id === l.service)?.libelle ?? l.service}</td>
                <td>{l.nom ? `${l.prenom} ${l.nom}` : '—'}</td>
                <td>{l.classe || '—'}</td>
                <td>{LIBELLES[l.statut]}</td>
                <td>{l.raison ?? ''}</td>
              </tr>
            ))}
            {affichees.length === 0 && <tr><td colSpan={7} className="centre discret">Aucun passage pour ces critères.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function telecharger(blob: Blob, nom: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
