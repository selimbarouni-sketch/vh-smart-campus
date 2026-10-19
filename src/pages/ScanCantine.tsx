import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { messageErreur, useApp, useDonnee } from '../app/contexte';
import { ScannerQR } from '../composants/ScannerQR';
import { CRENEAU_CANTINE, controlerEleve, dansCreneau } from '../domain/cantine';
import { jetonValide, normaliserContenuQR } from '../domain/qr';
import { heureFr, instantLocal } from '../domain/temps';
import type { Eleve } from '../domain/types';
import { CALENDRIER_DEFAUT } from '../data/depot';

type Resultat =
  | { type: 'confirme'; eleve: Eleve }
  | { type: 'doublon'; eleve: Eleve; heure: string }
  | { type: 'refuse'; eleve: Eleve | null; raison: string; nonJournalise?: boolean }
  | { type: 'echec'; eleve: Eleve | null; raison: string };

export function ScanCantine() {
  const { depot, utilisateur, maintenant } = useApp();
  const { donnee: cal } = useDonnee(() => depot.lireCalendrier().catch(() => CALENDRIER_DEFAUT), [depot]);
  const fuseau = cal?.fuseau ?? CALENDRIER_DEFAUT.fuseau;
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [compteur, setCompteur] = useState(0);
  const [traitement, setTraitement] = useState(false);
  const [, rafraichir] = useState(0);
  const minuteur = useRef<number>();

  // Le créneau (12 h 05 – 13 h 20) est réévalué régulièrement : le scan s'ouvre et se ferme seul.
  useEffect(() => {
    const t = window.setInterval(() => rafraichir((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);
  const ouvert = dansCreneau(instantLocal(maintenant(), fuseau).heure);

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
    const { date, heure } = instantLocal(maintenant(), fuseau);
    if (!utilisateur || !dansCreneau(heure)) return;
    setTraitement(true);
    const service = CRENEAU_CANTINE.id;
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
      const c = controlerEleve(eleve, date);
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

  return (
    <div className="module module-cantine">
      <div className="titre-module">
        <Link to="/" className="retour">← Accueil</Link>
        <h1>Cantine</h1>
      </div>
      <p className="discret">
        Service : <strong>{CRENEAU_CANTINE.libelle}</strong> · de {heureFr(CRENEAU_CANTINE.debut)} à {heureFr(CRENEAU_CANTINE.fin)} · {compteur} passage(s) enregistré(s) sur cet appareil
      </p>
      {!ouvert ? (
        <p className="alerte alerte-attention">Scan fermé : la cantine est ouverte de {heureFr(CRENEAU_CANTINE.debut)} à {heureFr(CRENEAU_CANTINE.fin)}.</p>
      ) : (
        <>
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
