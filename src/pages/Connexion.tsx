import { useState, type FormEvent } from 'react';
import { messageErreur, useApp } from '../app/contexte';

export function Connexion() {
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
    <form className="carte formulaire etroit" onSubmit={envoyer}>
      <h1>Connexion</h1>
      <p className="discret">Accès réservé au personnel du LFI Victor Hugo Djerba.</p>
      <label>Adresse e-mail
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>Mot de passe
        <input type="password" autoComplete="current-password" value={mdp} onChange={(e) => setMdp(e.target.value)} required />
      </label>
      {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}
      <button className="bouton principal" disabled={envoi}>{envoi ? 'Connexion…' : 'Se connecter'}</button>
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
