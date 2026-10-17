import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { messageErreur, useApp, useDonnee } from '../app/contexte';
import { libelleCible, seancesHabituelles } from '../domain/emploiDuTemps';
import { heureFr, instantLocal } from '../domain/temps';
import type { Modification, TypeModification } from '../domain/types';

const TYPES: { v: TypeModification; t: string }[] = [
  { v: 'salle', t: 'Changement de salle' },
  { v: 'enseignant', t: "Changement d'enseignant" },
  { v: 'horaire', t: "Changement d'horaire" },
  { v: 'remplacement', t: 'Cours remplacé par un autre' },
  { v: 'annulation', t: 'Cours annulé' },
  { v: 'ajout', t: 'Séance exceptionnelle (ajout)' },
];

/** Procédure de correction rapide : un changement ponctuel pour une date, sans republier l'emploi du temps. */
export function ModificationsEDT() {
  const { depot, utilisateur, maintenant } = useApp();
  const { donnee: calendrier } = useDonnee(() => depot.lireCalendrier(), [depot]);
  const { donnee: versions } = useDonnee(() => depot.listerVersions(), [depot]);
  const [date, setDate] = useState(instantLocal(maintenant(), 'Africa/Tunis').date);
  const { donnee: mods, recharger } = useDonnee(() => depot.listerModifications(date, date), [depot, date]);
  const [cible, setCible] = useState('');
  const [type, setType] = useState<TypeModification>('salle');
  const [seanceId, setSeanceId] = useState('');
  const [valeurs, setValeurs] = useState({ matiere: '', enseignant: '', salle: '', debut: '', fin: '' });
  const [motif, setMotif] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; t: string } | null>(null);

  const cibles = [...new Set((versions ?? []).filter((v) => v.statut === 'active').flatMap((v) => v.cibles))].sort();
  const seances = cible && calendrier && versions ? seancesHabituelles(cible, date, versions, calendrier) : [];
  const v = (k: keyof typeof valeurs) => (e: { target: { value: string } }) => setValeurs({ ...valeurs, [k]: e.target.value });

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault();
    if (!utilisateur) return;
    setMessage(null);
    if (type !== 'ajout' && !seanceId) return setMessage({ ok: false, t: 'Choisissez la séance concernée.' });
    if (type === 'ajout' && (!valeurs.matiere || !valeurs.debut || !valeurs.fin)) return setMessage({ ok: false, t: 'Matière, début et fin sont obligatoires pour une séance exceptionnelle.' });
    if (!motif.trim()) return setMessage({ ok: false, t: 'Indiquez le motif (affiché lors du scan).' });
    const m: Modification = {
      id: `mod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      date, type, cible, seanceId: type === 'ajout' ? undefined : seanceId, motif: motif.trim(),
      creePar: utilisateur.uid, creeLe: maintenant().toISOString(), actif: true,
      nouvelleMatiere: valeurs.matiere || undefined,
      nouvelEnseignant: ['enseignant', 'remplacement', 'ajout'].includes(type) && valeurs.enseignant ? valeurs.enseignant : undefined,
      nouvelleSalle: ['salle', 'remplacement', 'ajout'].includes(type) && valeurs.salle ? valeurs.salle : undefined,
      nouveauDebut: valeurs.debut || undefined, nouvelleFin: valeurs.fin || undefined,
    };
    try {
      await depot.enregistrerModification(m);
      setMessage({ ok: true, t: 'Changement enregistré : il est pris en compte immédiatement lors des scans.' });
      setValeurs({ matiere: '', enseignant: '', salle: '', debut: '', fin: '' });
      setMotif(''); setSeanceId('');
      recharger();
    } catch (err) { setMessage({ ok: false, t: messageErreur(err) }); }
  };

  const desactiver = async (m: Modification) => {
    try { await depot.enregistrerModification({ ...m, actif: false }); recharger(); } catch (err) { setMessage({ ok: false, t: messageErreur(err) }); }
  };

  return (
    <div className="module">
      <div className="titre-module"><Link to="/" className="retour">← Accueil</Link><h1>Changements ponctuels</h1></div>
      <p className="discret">
        Priorité : un jour férié ou de vacances supprime les cours habituels ; les changements de la date s'appliquent ensuite du plus ancien
        au plus récent (le plus récent l'emporte) ; une séance exceptionnelle s'ajoute même un jour sans cours.
      </p>
      <form className="carte formulaire" onSubmit={enregistrer}>
        <div className="ligne">
          <label>Date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>Classe ou groupe
            <select value={cible} onChange={(e) => { setCible(e.target.value); setSeanceId(''); }}>
              <option value="">— Choisir —</option>
              {cibles.map((c) => <option key={c} value={c}>{libelleCible(c)}</option>)}
            </select>
          </label>
          <label>Type <select value={type} onChange={(e) => setType(e.target.value as TypeModification)}>{TYPES.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}</select></label>
        </div>
        {cible && type !== 'ajout' && (
          <label>Séance concernée
            <select value={seanceId} onChange={(e) => setSeanceId(e.target.value)}>
              <option value="">— Choisir —</option>
              {seances.map((s) => <option key={s.id} value={s.id}>{heureFr(s.debut)}–{heureFr(s.fin)} · {s.matiere} · {s.salle || 'salle ?'}</option>)}
            </select>
            {seances.length === 0 && <small>Aucune séance publiée ce jour-là pour cette cible.</small>}
          </label>
        )}
        <div className="ligne">
          {(type === 'remplacement' || type === 'ajout') && <label>Matière <input value={valeurs.matiere} onChange={v('matiere')} /></label>}
          {['enseignant', 'remplacement', 'ajout'].includes(type) && <label>Enseignant <input value={valeurs.enseignant} onChange={v('enseignant')} /></label>}
          {['salle', 'remplacement', 'ajout'].includes(type) && <label>Salle <input value={valeurs.salle} onChange={v('salle')} /></label>}
          {['horaire', 'remplacement', 'ajout'].includes(type) && <>
            <label>Début <input type="time" value={valeurs.debut} onChange={v('debut')} /></label>
            <label>Fin <input type="time" value={valeurs.fin} onChange={v('fin')} /></label>
          </>}
        </div>
        <label>Motif (affiché lors du scan) <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="ex. Salle 204 indisponible" /></label>
        {message && <p className={`alerte ${message.ok ? 'alerte-ok' : 'alerte-erreur'}`}>{message.t}</p>}
        <button className="bouton principal" disabled={!cible}>Enregistrer le changement</button>
      </form>
      <section className="carte">
        <h2>Changements du {date}</h2>
        <ul className="liste">
          {(mods ?? []).sort((a, b) => a.creeLe.localeCompare(b.creeLe)).map((m) => (
            <li key={m.id} className={m.actif ? '' : 'barre'}>
              {libelleCible(m.cible)} · {TYPES.find((t) => t.v === m.type)?.t} · {m.motif}
              {m.actif ? <button className="bouton petit" onClick={() => desactiver(m)}>Annuler ce changement</button> : ' (annulé)'}
            </li>
          ))}
          {(mods ?? []).length === 0 && <li className="discret">Aucun changement.</li>}
        </ul>
      </section>
    </div>
  );
}
