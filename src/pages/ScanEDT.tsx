import { useState } from 'react';
import { Link } from 'react-router-dom';
import { messageErreur, useApp } from '../app/contexte';
import { ScannerQR } from '../composants/ScannerQR';
import { journeeEleve, libelleCible, momentDeLaJournee, type Journee, type Moment, type SeanceDuJour } from '../domain/emploiDuTemps';
import { jetonValide, normaliserContenuQR } from '../domain/qr';
import { dateFr, heureFr, instantLocal } from '../domain/temps';
import type { Eleve } from '../domain/types';

type Etat =
  | { type: 'resultat'; eleve: Eleve; journee: Journee; moment: Moment; date: string; heure: string }
  | { type: 'erreur'; message: string; eleve?: Eleve };

export function ScanEDT() {
  const { depot, maintenant } = useApp();
  const [etat, setEtat] = useState<Etat | null>(null);
  const [traitement, setTraitement] = useState(false);

  const lecture = async (brut: string) => {
    setTraitement(true);
    try {
      const code = normaliserContenuQR(brut);
      if (!jetonValide(code)) { setEtat({ type: 'erreur', message: 'QR code invalide : ce code n’appartient pas à VH Smart Campus.' }); return; }
      // Lectures indépendantes de l'élève lancées dès le scan : affichage plus rapide.
      const calendrierP = depot.lireCalendrier();
      const versionsP = depot.listerVersions();
      calendrierP.catch(() => undefined); versionsP.catch(() => undefined);
      const id = await depot.resoudreJeton(code);
      if (!id) { setEtat({ type: 'erreur', message: 'QR code inconnu ou désactivé.' }); return; }
      const eleve = await depot.lireEleve(id);
      if (!eleve) { setEtat({ type: 'erreur', message: 'Élève introuvable.' }); return; }
      if (!eleve.actif) { setEtat({ type: 'erreur', message: "Cet élève n'est plus inscrit (fiche inactive).", eleve }); return; }
      const calendrier = await calendrierP;
      const { date, heure } = instantLocal(maintenant(), calendrier.fuseau);
      const [scolarite, versions, modifications] = await Promise.all([
        depot.lireScolarite(eleve.id), versionsP, depot.listerModifications(date, date),
      ]);
      const journee = journeeEleve({ eleve, scolarite, date, versions, modifications, calendrier });
      setEtat({ type: 'resultat', eleve, journee, moment: momentDeLaJournee(journee.seances, heure), date, heure });
      navigator.vibrate?.(60);
    } catch (e) {
      setEtat({ type: 'erreur', message: `Impossible d'afficher l'emploi du temps : ${messageErreur(e)}` });
    } finally {
      setTraitement(false);
    }
  };

  return (
    <div className="module module-edt">
      <div className="titre-module">
        <Link to="/" className="retour">← Accueil</Link>
        <h1>Emploi du temps</h1>
      </div>
      <ScannerQR surLecture={lecture} delaiMemeCode={2500} />
      {traitement && <p className="resultat resultat-attente" role="status">Recherche…</p>}
      {etat?.type === 'erreur' && (
        <div className="resultat resultat-erreur" role="alert" data-testid="resultat-edt">
          <strong>✖ {etat.message}</strong>
          {etat.eleve && <span>{etat.eleve.prenom} {etat.eleve.nom} – {etat.eleve.classe}</span>}
        </div>
      )}
      {etat?.type === 'resultat' && <FicheEDT {...etat} />}
    </div>
  );
}

function Seance({ s, titre }: { s: SeanceDuJour; titre?: string }) {
  return (
    <div className={`seance ${s.annulee ? 'annulee' : ''} ${s.modifications.length ? 'modifiee' : ''}`}>
      {titre && <h3>{titre}</h3>}
      <div className="seance-matiere">{s.matiere}{s.annulee && ' – ANNULÉ'}</div>
      <div>{s.salle ? s.salle : <em>Salle non renseignée</em>}</div>
      {s.enseignant ? <div>Enseignant(e) : {s.enseignant}</div> : <div><em>Enseignant non renseigné</em></div>}
      <div className="seance-heure">{heureFr(s.debut)} – {heureFr(s.fin)}</div>
      {s.cible.startsWith('groupe:') && <div className="discret">{libelleCible(s.cible)}</div>}
      {s.modifications.map((m, i) => <div key={i} className="badge-modif">Changement : {m.motif}</div>)}
    </div>
  );
}

function FicheEDT({ eleve, journee, moment, date, heure }: Extract<Etat, { type: 'resultat' }>) {
  const { statut } = journee;
  return (
    <section className="fiche-edt" data-testid="resultat-edt" aria-live="polite">
      <div className="fiche-identite">
        <div><span className="etiquette">ÉLÈVE :</span> {eleve.prenom} {eleve.nom}</div>
        <div><span className="etiquette">CLASSE :</span> {eleve.classe}</div>
        <div className="discret">{dateFr(date)} · {heureFr(heure)} · Semaine {journee.semaine}</div>
      </div>

      {statut === 'aucun_edt' && (
        <div className="alerte alerte-erreur" role="alert">
          <strong>⚠ Emploi du temps non disponible</strong>
          <p>{journee.motif} Aucune information supposée n'est affichée.</p>
        </div>
      )}
      {(statut === 'ferie' || statut === 'vacances' || statut === 'dimanche') && (
        <div className="alerte alerte-info">
          <strong>Pas de cours aujourd'hui</strong>
          <p>{statut === 'dimanche' ? 'Dimanche.' : journee.motif}</p>
        </div>
      )}

      {statut === 'ok' || journee.seances.length > 0 ? (
        <>
          {moment.etat === 'en_cours' && moment.enCours.map((s) => <Seance key={s.id} s={s} titre="COURS EN COURS" />)}
          {moment.etat === 'pause' && <div className="etat-moment">Aucun cours en cours</div>}
          {moment.etat === 'avant_cours' && <div className="etat-moment">Aucun cours en cours (les cours n'ont pas commencé)</div>}
          {moment.etat === 'fin_des_cours' && <div className="etat-moment fin">Fin des cours</div>}
          {moment.etat === 'aucun_cours' && statut === 'ok' && <div className="etat-moment">Aucun cours prévu aujourd'hui</div>}
          {moment.prochain && <Seance s={moment.prochain} titre="PROCHAIN COURS" />}
          {moment.reste.length > 1 && (
            <details className="reste-journee" open>
              <summary>Reste de la journée ({moment.reste.length - 1} autre(s) cours)</summary>
              {moment.reste.slice(1).map((s) => <Seance key={s.id} s={s} />)}
            </details>
          )}
          {moment.annuleesRestantes.length > 0 && (
            <details className="reste-journee">
              <summary>Cours annulés aujourd'hui ({moment.annuleesRestantes.length})</summary>
              {moment.annuleesRestantes.map((s) => <Seance key={s.id} s={s} />)}
            </details>
          )}
        </>
      ) : null}

      {journee.avertissements.map((a, i) => <p key={i} className="alerte alerte-attention">⚠ {a}</p>)}
    </section>
  );
}
