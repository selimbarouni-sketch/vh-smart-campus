import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { messageErreur, useApp, useDonnee } from '../app/contexte';
import { ScannerQR } from '../composants/ScannerQR';
import { controlerEleve, serviceEnCours } from '../domain/cantine';
import { jetonValide, normaliserContenuQR } from '../domain/qr';
import { instantLocal } from '../domain/temps';
import type { Eleve } from '../domain/types';
import { CALENDRIER_DEFAUT } from '../data/depot';

type Resultat =
  | { type: 'confirme'; eleve: Eleve }
  | { type: 'doublon'; eleve: Eleve; heure: string }
  | { type: 'refuse'; eleve: Eleve | null; raison: string; nonJournalise?: boolean }
  | { type: 'echec'; eleve: Eleve | null; raison: string };

export function ScanCantine() {
  const { depot, utilisateur, maintenant } = useApp();
  const { donnee: services, erreur } = useDonnee(() => depot.servicesCantine(), [depot]);
  const { donnee: cal } = useDonnee(() => depot.lireCalendrier().catch(() => CALENDRIER_DEFAUT), [depot]);
  const fuseau = cal?.fuseau ?? CALENDRIER_DEFAUT.fuseau;
  const [service, setService] = useState('');
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [compteur, setCompteur] = useState(0);
  const [traitement, setTraitement] = useState(false);
  const minuteur = useRef<number>();

  useEffect(() => {
    if (services && !service) {
      const s = serviceEnCours(services, instantLocal(maintenant(), fuseau).heure);
      if (s) setService(s.id);
    }
  }, [services, service, fuseau, maintenant]);

  const afficher = (r: Resultat) => {
    setResultat(r);
    window.clearTimeout(minuteur.current);
    // Réinitialisation automatique pour l'élève suivant.
    minuteur.current = window.setTimeout(() => setResultat(null), r.type === 'confirme' ? 2500 : 5000);
    if (r.type === 'confirme') navigator.vibrate?.(80);
    else navigator.vibrate?.([60, 60, 60]);
  };
  useEffect(() => () => window.clearTimeout(minuteur.current), []);

  const lecture = async (brut: string) => {
    if (!service || !utilisateur) return;
    setTraitement(true);
    const { date } = instantLocal(maintenant(), fuseau);
    const refus = async (eleve: Eleve | null, raison: string) => {
      let nonJournalise = false;
      try {
        await depot.journaliserRefus({
          eleveId: eleve?.id ?? '', nom: eleve?.nom ?? '', prenom: eleve?.prenom ?? '', classe: eleve?.classe ?? '',
          date, service, horodatage: new Date().toISOString(), agentUid: utilisateur.uid, raison,
        });
      } catch { nonJournalise = true; }
      afficher({ type: 'refuse', eleve, raison, nonJournalise });
    };
    let eleve: Eleve | null = null;
    try {
      const code = normaliserContenuQR(brut);
      if (!jetonValide(code)) return await refus(null, 'QR code invalide : ce code n’appartient pas à VH Smart Campus.');
      const id = await depot.resoudreJeton(code);
      if (!id) return await refus(null, 'QR code inconnu ou désactivé.');
      eleve = await depot.lireEleve(id);
      const c = controlerEleve(eleve);
      if (!c.autorise) return await refus(eleve, c.raison);
      const r = await depot.enregistrerPassage(eleve!, service, date, utilisateur.uid);
      if (r.statut === 'confirme') { setCompteur((n) => n + 1); afficher({ type: 'confirme', eleve: eleve! }); }
      else {
        const h = new Date(r.passage.horodatage).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: fuseau });
        afficher({ type: 'doublon', eleve: eleve!, heure: h });
      }
    } catch (e) {
      // L'écriture n'a pas été acquittée : le passage n'est PAS enregistré.
      afficher({ type: 'echec', eleve, raison: messageErreur(e) });
    } finally {
      setTraitement(false);
    }
  };

  const libelleService = services?.find((s) => s.id === service)?.libelle;

  return (
    <div className="module module-cantine">
      <div className="titre-module">
        <Link to="/" className="retour">← Accueil</Link>
        <h1>Cantine</h1>
      </div>
      {erreur && <p className="alerte alerte-erreur">{erreur}</p>}
      <label className="choix-service">Service
        <select value={service} onChange={(e) => setService(e.target.value)}>
          <option value="">— Choisir le service —</option>
          {services?.map((s) => <option key={s.id} value={s.id}>{s.libelle} ({s.debut}–{s.fin})</option>)}
        </select>
      </label>
      {!service ? (
        <p className="alerte alerte-attention">Aucun service en cours à cette heure : choisissez explicitement le service avant de scanner.</p>
      ) : (
        <>
          <p className="discret">Service : <strong>{libelleService}</strong> · {compteur} passage(s) enregistré(s) sur cet appareil</p>
          <ScannerQR surLecture={lecture} />
          {traitement && <p className="resultat resultat-attente" role="status">Enregistrement en cours…</p>}
          {resultat && <AffichageResultat r={resultat} />}
        </>
      )}
    </div>
  );
}

function Identite({ e }: { e: Eleve | null }) {
  if (!e) return null;
  return (
    <div className="identite">
      <span className="nom">{e.prenom} {e.nom}</span>
      <span className="classe">{e.classe}</span>
    </div>
  );
}

function AffichageResultat({ r }: { r: Resultat }) {
  switch (r.type) {
    case 'confirme':
      return <div className="resultat resultat-ok" role="status" data-testid="resultat-cantine"><strong>✔ PASSAGE ENREGISTRÉ</strong><Identite e={r.eleve} /></div>;
    case 'doublon':
      return <div className="resultat resultat-attention" role="alert" data-testid="resultat-cantine"><strong>⚠ DÉJÀ PASSÉ pour ce service à {r.heure}</strong><Identite e={r.eleve} /><span>Second passage non enregistré.</span></div>;
    case 'refuse':
      return <div className="resultat resultat-erreur" role="alert" data-testid="resultat-cantine"><strong>✖ PASSAGE REFUSÉ</strong><Identite e={r.eleve} /><span>{r.raison}</span>{r.nonJournalise && <small>(refus non journalisé : réseau indisponible)</small>}</div>;
    case 'echec':
      return <div className="resultat resultat-erreur" role="alert" data-testid="resultat-cantine"><strong>✖ ÉCHEC : PASSAGE NON ENREGISTRÉ</strong><Identite e={r.eleve} /><span>{r.raison}</span><span>Faites scanner à nouveau la carte.</span></div>;
  }
}
