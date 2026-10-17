import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { messageErreur, useApp } from '../app/contexte';
import { LIBELLES_ROLES } from '../domain/permissions';
import type { PreferenceTheme } from '../app/apparence';

export function MonCompte() {
  const { depot, utilisateur, theme, choisirTheme } = useApp();
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; t: string } | null>(null);

  const changer = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (nouveau.length < 8) return setMessage({ ok: false, t: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' });
    if (nouveau !== confirmation) return setMessage({ ok: false, t: 'Les deux saisies du nouveau mot de passe sont différentes.' });
    try {
      await depot.changerMotDePasse(actuel, nouveau);
      setActuel(''); setNouveau(''); setConfirmation('');
      setMessage({ ok: true, t: 'Mot de passe modifié.' });
    } catch (err) { setMessage({ ok: false, t: messageErreur(err) }); }
  };

  return (
    <div className="module">
      <div className="titre-module"><Link to="/" className="retour">← Accueil</Link><h1>Mon compte</h1></div>
      <section className="carte">
        <p><strong>{utilisateur?.nom}</strong><br />{utilisateur?.email}</p>
        <p className="discret">Rôle(s) : {utilisateur?.roles.map((r) => LIBELLES_ROLES[r]).join(', ') || 'aucun'}</p>
      </section>
      <section className="carte formulaire">
        <h2>Apparence</h2>
        <fieldset>
          <legend>Thème de l'application sur cet appareil</legend>
          {(['auto', 'clair', 'sombre'] as PreferenceTheme[]).map((t) => (
            <label key={t} className="case">
              <input type="radio" name="theme" checked={theme === t} onChange={() => choisirTheme(t)} />
              {t === 'auto' ? 'Automatique (selon le réglage du téléphone)' : t === 'clair' ? 'Clair' : 'Sombre'}
            </label>
          ))}
        </fieldset>
      </section>
      <form className="carte formulaire" onSubmit={changer}>
        <h2>Changer de mot de passe</h2>
        <label>Mot de passe actuel <input type="password" autoComplete="current-password" value={actuel} onChange={(e) => setActuel(e.target.value)} required /></label>
        <label>Nouveau mot de passe (8 caractères minimum) <input type="password" autoComplete="new-password" value={nouveau} onChange={(e) => setNouveau(e.target.value)} required /></label>
        <label>Confirmer le nouveau mot de passe <input type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required /></label>
        {message && <p className={`alerte ${message.ok ? 'alerte-ok' : 'alerte-erreur'}`} role="status">{message.t}</p>}
        <button className="bouton principal">Modifier le mot de passe</button>
      </form>
    </div>
  );
}
