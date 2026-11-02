import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { messageErreur, useApp, useDonnee } from '../app/contexte';
import { ScannerQR } from '../composants/ScannerQR';
import { controlerEleveBus } from '../domain/bus';
import { jetonValide, normaliserContenuQR } from '../domain/qr';
import { instantLocal } from '../domain/temps';
import type { Eleve, Trajet } from '../domain/types';
import { CALENDRIER_DEFAUT } from '../data/depot';

const LIBELLE_TRAJET: Record<Trajet, string> = { aller: 'Matin (aller)', retour: 'Soir (retour)' };

type Resultat =
  | { type: 'confirme'; eleve: Eleve }
  | { type: 'doublon'; eleve: Eleve; heure: string }
  | { type: 'refuse'; eleve: Eleve | null; raison: string }
  | { type: 'echec'; eleve: Eleve | null; raison: string };

export function ScanBus() {
  const { depot, utilisateur, maintenant } = useApp();
  const { donnee: cal } = useDonnee(() => depot.lireCalendrier().catch(() => CALENDRIER_DEFAUT), [depot]);
  const { donnee: modules, erreur } = useDonnee(() => depot.lireModules(), [depot]);
  const fuseau = cal?.fuseau ?? CALENDRIER_DEFAUT.fuseau;
  const [trajet, setTrajet] = useState<Trajet>('aller');
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [compteur, setCompteur] = useState(0);
  const [traitement, setTraitement] = useState(false);
  const minuteur = useRef<number>();

  useEffect(() => () => window.clearTimeout(minuteur.current), []);

  const afficher = (r: Resultat) => {
    setResultat(r);
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => setResultat(null), r.type === 'confirme' ? 2500 : 5000);
    if (r.type === 'confirme') navigator.vibrate?.(80);
    else navigator.vibrate?.([60, 60, 60]);
  };

  const lecture = async (brut: string) => {
    if (!utilisateur || traitement) return;
    setTraitement(true);
    const { date } = instantLocal(maintenant(), fuseau);
    let eleve: Eleve | null = null;
    try {
      const code = normaliserContenuQR(brut);
      if (!jetonValide(code)) {
        afficher({ type: 'refuse', eleve: null, raison: 'QR code invalide : ce code n’appartient pas à VH Smart Campus.' });
        return;
      }
      const id = await depot.resoudreJeton(code);
      if (!id) {
        afficher({ type: 'refuse', eleve: null, raison: 'QR code inconnu ou désactivé.' });
        return;
      }
      eleve = await depot.lireEleve(id);
      const c = controlerEleveBus(eleve);
      if (!c.autorise) {
        afficher({ type: 'refuse', eleve, raison: c.raison });
        return;
      }
      const r = await depot.enregistrerPassageBus(eleve!, trajet, date, utilisateur.uid);
      if (r.statut === 'confirme') {
        setCompteur((n) => n + 1);
        afficher({ type: 'confirme', eleve: eleve! });
      } else {
        const heure = new Date(r.passage.horodatage).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: fuseau });
        afficher({ type: 'doublon', eleve: eleve!, heure });
      }
    } catch (e) {
      // L'écriture n'a pas été acquittée : la montée n'est PAS enregistrée.
      afficher({ type: 'echec', eleve, raison: messageErreur(e) });
    } finally {
      setTraitement(false);
    }
  };

  return (
    <div className="module module-bus">
      <div className="titre-module">
        <Link to="/" className="retour">← Accueil</Link>
        <h1>Bus</h1>
      </div>
      {erreur && <p className="alerte alerte-erreur">{erreur}</p>}
      {!modules ? (
        <p className="centre">Chargement…</p>
      ) : !modules.busActif ? (
        <p className="alerte alerte-attention">Le module bus est désactivé. L'administrateur peut l'activer dans Administration.</p>
      ) : (
        <>
          <div className="segments" role="group" aria-label="Trajet">
            {(Object.keys(LIBELLE_TRAJET) as Trajet[]).map((t) => (
              <button key={t} type="button" className={`bouton ${trajet === t ? 'principal' : ''}`} aria-pressed={trajet === t} onClick={() => setTrajet(t)}>
                {LIBELLE_TRAJET[t]}
              </button>
            ))}
          </div>
          <p className="discret">Trajet : <strong>{LIBELLE_TRAJET[trajet]}</strong> · {compteur} montée(s) enregistrée(s) sur cet appareil</p>
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
      {e.station && <span className="station">Station : {e.station}</span>}
    </div>
  );
}

function AffichageResultat({ r }: { r: Resultat }) {
  switch (r.type) {
    case 'confirme':
      return <div className="resultat resultat-ok" role="status" data-testid="resultat-bus"><strong>✔ MONTÉE ENREGISTRÉE</strong><Identite e={r.eleve} /></div>;
    case 'doublon':
      return <div className="resultat resultat-attention" role="alert" data-testid="resultat-bus"><strong>⚠ DÉJÀ MONTÉ sur ce trajet à {r.heure}</strong><Identite e={r.eleve} /><span>Second passage non enregistré.</span></div>;
    case 'refuse':
      return <div className="resultat resultat-erreur" role="alert" data-testid="resultat-bus"><strong>✖ MONTÉE REFUSÉE</strong><Identite e={r.eleve} /><span>{r.raison}</span></div>;
    case 'echec':
      return <div className="resultat resultat-erreur" role="alert" data-testid="resultat-bus"><strong>✖ ÉCHEC : MONTÉE NON ENREGISTRÉE</strong><Identite e={r.eleve} /><span>{r.raison}</span><span>Faites scanner à nouveau la carte.</span></div>;
  }
}
