import { useEffect, useState, type FormEvent } from 'react';
import { messageErreur, useApp } from '../app/contexte';

export function Connexion() {
  const { depot, etablissement } = useApp();
  const [installation, setInstallation] = useState(false);
  const [vue, setVue] = useState<'connexion' | 'oubli'>('connexion');

  useEffect(() => {
    depot.installationRequise().then(setInstallation).catch(() => setInstallation(false));
  }, [depot]);

  return (
    <div className="etroit">
      <div className="carte">
        {etablissement.logo && <img src={etablissement.logo} alt={`Logo – ${etablissement.nom}`} className="logo-connexion" />}
        <p className="connexion-etablissement">{etablissement.nom}</p>
        {installation ? <Installation /> : vue === 'connexion' ? <FormConnexion surOubli={() => setVue('oubli')} /> : <FormOubli surRetour={() => setVue('connexion')} />}
      </div>
    </div>
  );
}

function FormConnexion({ surOubli }: { surOubli: () => void }) {
  const { depot } = useApp();
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try { await depot.connexion(email, mdp); } catch (err) { setErreur(messageErreur(err)); } finally { setEnvoi(false); }
  };

  return (
    <form className="formulaire" onSubmit={envoyer}>
      <h1>Connexion</h1>
      <p className="discret">Accès réservé au personnel de l'établissement.</p>
      <label>Adresse e-mail
        <input type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>Mot de passe
        <input type="password" autoComplete="current-password" value={mdp} onChange={(e) => setMdp(e.target.value)} required />
      </label>
      {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}
      <button className="bouton principal" disabled={envoi}>{envoi ? 'Connexion…' : 'Se connecter'}</button>
      <button type="button" className="lien" onClick={surOubli}>Mot de passe oublié ?</button>
      {depot.mode === 'demo' && (
        <div className="alerte alerte-info">
          <strong>Comptes de démonstration</strong> (mot de passe : <code>demo</code>)
          <ul>
            <li><code>admin@demo.local</code> : administrateur</li>
            <li><code>cantine@demo.local</code> : agent de cantine</li>
            <li><code>viesco@demo.local</code> : vie scolaire</li>
            <li><code>edt@demo.local</code> : gestion des emplois du temps</li>
          </ul>
        </div>
      )}
    </form>
  );
}

function FormOubli({ surRetour }: { surRetour: () => void }) {
  const { depot } = useApp();
  const [email, setEmail] = useState('');
  const [etat, setEtat] = useState<{ ok: boolean; t: string } | null>(null);
  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await depot.envoyerReinitialisation(email);
      // Même message que le compte existe ou non (pas d'indication sur les adresses enregistrées).
      setEtat({ ok: true, t: depot.mode === 'demo'
        ? "Mode démonstration : aucun e-mail n'est envoyé."
        : 'Si un compte existe pour cette adresse, un e-mail vient d’être envoyé pour choisir un nouveau mot de passe (pensez à vérifier les courriers indésirables).' });
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (code.includes('user-not-found')) setEtat({ ok: true, t: 'Si un compte existe pour cette adresse, un e-mail vient d’être envoyé.' });
      else setEtat({ ok: false, t: messageErreur(err) });
    }
  };
  return (
    <form className="formulaire" onSubmit={envoyer}>
      <h1>Mot de passe oublié</h1>
      <label>Adresse e-mail du compte
        <input type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      {etat && <p className={`alerte ${etat.ok ? 'alerte-ok' : 'alerte-erreur'}`} role="status">{etat.t}</p>}
      <button className="bouton principal">Recevoir un lien par e-mail</button>
      <button type="button" className="lien" onClick={surRetour}>← Retour à la connexion</button>
    </form>
  );
}

/** Première mise en service : création du compte administrateur (une seule fois). */
function Installation() {
  const { depot } = useApp();
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    if (mdp.length < 8) return setErreur('Mot de passe administrateur : 8 caractères minimum.');
    if (mdp !== confirmation) return setErreur('Les deux saisies du mot de passe sont différentes.');
    setEnvoi(true);
    try { await depot.installer({ nom, email, motDePasse: mdp }); } catch (err) { setErreur(messageErreur(err)); } finally { setEnvoi(false); }
  };
  return (
    <form className="formulaire" onSubmit={envoyer}>
      <h1>Première mise en service</h1>
      <p className="alerte alerte-attention">
        Aucun administrateur n'existe encore. Créez maintenant le compte de la personne qui administrera l'application :
        cet écran disparaît définitivement ensuite. Les autres comptes seront créés depuis l'administration.
      </p>
      <label>Nom et prénom <input value={nom} onChange={(e) => setNom(e.target.value)} required autoComplete="name" /></label>
      <label>Adresse e-mail <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" inputMode="email" /></label>
      <label>Mot de passe (8 caractères minimum) <input type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} required autoComplete="new-password" /></label>
      <label>Confirmer le mot de passe <input type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required autoComplete="new-password" /></label>
      {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}
      <button className="bouton principal" disabled={envoi}>{envoi ? 'Création…' : 'Créer le compte administrateur'}</button>
    </form>
  );
}
