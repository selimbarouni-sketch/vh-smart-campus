import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { messageErreur, useApp, useDonnee } from '../app/contexte';
import { ciblesPubliees, construireGrille, type Vue } from '../domain/tableau';
import { CALENDRIER_DEFAUT } from '../data/depot';
import { dateFr, heureFr } from '../domain/temps';
import { JOURS, type Jour } from '../domain/types';

const LIBELLE_JOUR: Record<Jour, string> = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi', jeudi: 'Jeudi', vendredi: 'Vendredi', samedi: 'Samedi',
};

export function TableauEDT() {
  const { depot, etablissement } = useApp();
  const { donnee: versions, erreur } = useDonnee(() => depot.listerVersions(), [depot]);
  const { donnee: cal } = useDonnee(() => depot.lireCalendrier().catch(() => CALENDRIER_DEFAUT), [depot]);
  const cibles = useMemo(() => ciblesPubliees(versions ?? []), [versions]);
  const [choix, setChoix] = useState('');
  const [semaine, setSemaine] = useState<Vue>('A');
  const [enCours, setEnCours] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const choisie = cibles.find((c) => c.cible === choix) ?? cibles[0];
  const lignes = choisie ? construireGrille(choisie.version, choisie.cible, semaine) : [];
  const fuseau = cal?.fuseau ?? CALENDRIER_DEFAUT.fuseau;

  const exporterPdf = async () => {
    if (!choisie) return;
    setEnCours(true);
    setMsg(null);
    try {
      // Le moteur PDF n'est chargé qu'au moment de l'export.
      const { genererPdfTableau } = await import('../app/pdfTableau');
      const calendrier = cal ?? CALENDRIER_DEFAUT;
      const octets = await genererPdfTableau({
        etablissement,
        titre: choisie.libelle,
        semaine,
        anneeScolaire: `${calendrier.anneeDebut.slice(0, 4)}-${calendrier.anneeFin.slice(0, 4)}`,
        validite: `du ${dateFr(choisie.version.validiteDebut)} au ${dateFr(choisie.version.validiteFin)}`,
        dateEdition: new Date().toLocaleDateString('fr-FR', { timeZone: fuseau }),
        lignes,
      });
      const url = URL.createObjectURL(new Blob([octets], { type: 'application/pdf' }));
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = `emploi-du-temps_${choisie.libelle.replace(/[^\p{L}\p{N}]+/gu, '-')}_semaine-${semaine}.pdf`;
      lien.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setMsg(`Impossible de générer le PDF : ${messageErreur(e)}`);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="module module-tableau">
      <div className="titre-module">
        <Link to="/" className="retour">← Accueil</Link>
        <h1>Tableau des cours</h1>
      </div>
      {erreur && <p className="alerte alerte-erreur">{erreur}</p>}

      {!cibles.length ? (
        <p className="alerte alerte-info">Aucun emploi du temps publié pour le moment.</p>
      ) : (
        <>
          <div className="ligne tableau-commandes">
            <label>Classe ou groupe
              <select value={choisie?.cible ?? ''} onChange={(e) => setChoix(e.target.value)}>
                {cibles.map((c) => <option key={c.cible} value={c.cible}>{c.libelle}</option>)}
              </select>
            </label>
            <div className="segments" role="group" aria-label="Semaine">
              {(['A', 'B'] as Vue[]).map((s) => (
                <button key={s} type="button" className={`bouton ${semaine === s ? 'principal' : ''}`} aria-pressed={semaine === s} onClick={() => setSemaine(s)}>
                  Semaine {s}
                </button>
              ))}
            </div>
            <button type="button" className="bouton principal" onClick={exporterPdf} disabled={enCours || !choisie}>
              {enCours ? 'Génération…' : 'Télécharger en PDF'}
            </button>
          </div>
          {msg && <p className="alerte alerte-erreur" role="alert">{msg}</p>}
          {choisie && <p className="discret">Validité : du {dateFr(choisie.version.validiteDebut)} au {dateFr(choisie.version.validiteFin)}. Emploi du temps habituel, sans les changements ponctuels.</p>}

          <div className="table-defilante">
            <table className="tableau-cours">
              <thead>
                <tr>
                  <th scope="col">Horaire</th>
                  {JOURS.map((j) => <th key={j} scope="col">{LIBELLE_JOUR[j]}</th>)}
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={`${l.debut}-${l.fin}`}>
                    <th scope="row" className="horaire">{heureFr(l.debut)}<br />{heureFr(l.fin)}</th>
                    {JOURS.map((j) => (
                      <td key={j}>
                        {l.cases[j].length ? l.cases[j].map((s) => (
                          <div key={s.id} className="case-cours">
                            <strong>{s.matiere}</strong>
                            {(s.salle || s.enseignant) && <span className="discret">{[s.salle && `Salle ${s.salle}`, s.enseignant].filter(Boolean).join(' · ')}</span>}
                          </div>
                        )) : <span className="discret">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                {!lignes.length && <tr><td colSpan={JOURS.length + 1} className="centre discret">Aucun cours pour cette semaine.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
