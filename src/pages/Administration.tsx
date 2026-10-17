import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { messageErreur, useApp, useDonnee } from '../app/contexte';
import { LIBELLES_ROLES } from '../domain/permissions';
import { typeSemaine } from '../domain/calendrier';
import { instantLocal, lundiDe } from '../domain/temps';
import type { Calendrier, Etablissement, Role, ServiceCantine, Utilisateur } from '../domain/types';
import { creerSauvegarde, lireSauvegarde, resumeSauvegarde, type FichierSauvegarde } from '../domain/sauvegarde';
import { imageVersDataUrl } from '../app/images';

const ROLES = Object.keys(LIBELLES_ROLES) as Role[];

export function Administration() {
  return (
    <div className="module">
      <div className="titre-module"><Link to="/" className="retour">← Accueil</Link><h1>Administration</h1></div>
      <nav className="sommaire" aria-label="Sections">
        <a href="#etablissement">Établissement</a><a href="#comptes">Comptes</a><a href="#calendrier">Calendrier</a>
        <a href="#services">Cantine</a><a href="#sauvegarde">Sauvegarde</a>
      </nav>
      <IdentiteEtablissement />
      <Comptes />
      <CalendrierScolaire />
      <Services />
      <Sauvegarde />
    </div>
  );
}

const COULEURS = [
  { nom: 'Bleu marine', v: '#0f3d6e' }, { nom: 'Bleu', v: '#1f5fbf' }, { nom: 'Vert', v: '#1d6b45' },
  { nom: 'Bordeaux', v: '#7a1f3d' }, { nom: 'Violet', v: '#4b2c82' }, { nom: 'Anthracite', v: '#2f3a45' }, { nom: 'Rouge', v: '#a3241f' },
];

function IdentiteEtablissement() {
  const { depot, etablissement, rechargerEtablissement } = useApp();
  const [e, setE] = useState<Etablissement>(etablissement);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  useEffect(() => setE(etablissement), [etablissement]);

  const lireLogo = async (f: File | undefined, cible: 'principal' | 'partenaire') => {
    if (!f) return;
    try {
      const url = await imageVersDataUrl(f, cible === 'principal' ? 320 : 240);
      setE((x) => cible === 'principal' ? { ...x, logo: url } : { ...x, logosPartenaires: [...x.logosPartenaires, url].slice(0, 4) });
    } catch (err) { setMsg({ ok: false, t: messageErreur(err) }); }
  };
  const enregistrer = async () => {
    try { await depot.enregistrerEtablissement(e); rechargerEtablissement(); setMsg({ ok: true, t: 'Identité enregistrée : elle s’affiche sur toutes les pages et sur les cartes.' }); }
    catch (err) { setMsg({ ok: false, t: messageErreur(err) }); }
  };

  return (
    <section className="carte formulaire" id="etablissement">
      <h2>Identité de l'établissement</h2>
      <div className="ligne">
        <label>Nom complet <input value={e.nom} onChange={(x) => setE({ ...e, nom: x.target.value })} /></label>
        <label>Nom court (cartes, en-tête) <input value={e.nomCourt} maxLength={40} onChange={(x) => setE({ ...e, nomCourt: x.target.value })} /></label>
      </div>
      <fieldset>
        <legend>Logo de l'établissement</legend>
        <div className="ligne">
          {e.logo ? <img src={e.logo} alt="Logo actuel" className="apercu-logo" /> : <span className="discret">Aucun logo.</span>}
          <label className="bouton">Choisir une image<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden data-testid="logo-principal" onChange={(x) => lireLogo(x.target.files?.[0], 'principal')} /></label>
          {e.logo && <button type="button" className="bouton petit danger" onClick={() => setE({ ...e, logo: undefined })}>Retirer</button>}
        </div>
        <p className="discret">Affiché dans l'en-tête, sur la page de connexion, dans l'onglet du navigateur et sur les cartes QR. Image PNG à fond transparent conseillée.</p>
      </fieldset>
      <fieldset>
        <legend>Logos partenaires (pied de page, 4 au maximum)</legend>
        <div className="ligne">
          {e.logosPartenaires.map((l, i) => (
            <span key={i} className="logo-partenaire">
              <img src={l} alt={`Logo partenaire ${i + 1}`} className="apercu-logo" />
              <button type="button" className="bouton petit danger" onClick={() => setE({ ...e, logosPartenaires: e.logosPartenaires.filter((_, k) => k !== i) })}>Retirer</button>
            </span>
          ))}
          {e.logosPartenaires.length < 4 && <label className="bouton">Ajouter un logo<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden data-testid="logo-partenaire" onChange={(x) => lireLogo(x.target.files?.[0], 'partenaire')} /></label>}
        </div>
      </fieldset>
      <fieldset>
        <legend>Couleur principale du site</legend>
        <div className="ligne">
          {COULEURS.map((c) => (
            <button key={c.v} type="button" className={`pastille-couleur ${e.couleur === c.v ? 'actif' : ''}`} style={{ background: c.v }}
              onClick={() => setE({ ...e, couleur: c.v })} aria-label={c.nom} title={c.nom} />
          ))}
          <label className="case">Autre : <input type="color" value={e.couleur} onChange={(x) => setE({ ...e, couleur: x.target.value })} aria-label="Couleur personnalisée" /></label>
        </div>
        <div className="apercu-entete" style={{ background: e.couleur }}>
          {e.logo && <img src={e.logo} alt="" className="marque-logo" />}<strong>{e.nomCourt}</strong><small>Vie Scolaire</small>
        </div>
      </fieldset>
      {msg && <p className={`alerte ${msg.ok ? 'alerte-ok' : 'alerte-erreur'}`} role="status">{msg.t}</p>}
      <button className="bouton principal" onClick={enregistrer}>Enregistrer l'identité</button>
    </section>
  );
}

/** Mot de passe provisoire lisible (sans caractères ambigus). */
function motDePasseProvisoire(): string {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(r, (n) => a[n % a.length]).join('');
}

function Comptes() {
  const { depot, utilisateur: moi } = useApp();
  const { donnee: utilisateurs, recharger, erreur } = useDonnee(() => depot.listerUtilisateurs(), [depot]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [nouveau, setNouveau] = useState({ nom: '', email: '', roles: [] as Role[], motDePasse: motDePasseProvisoire() });
  const [cree, setCree] = useState<{ email: string; motDePasse: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const maj = async (u: Utilisateur) => {
    try { await depot.enregistrerUtilisateur(u); recharger(); } catch (e) { setMsg({ ok: false, t: messageErreur(e) }); }
  };
  const creer = async (ev: FormEvent) => {
    ev.preventDefault();
    setMsg(null); setCree(null);
    if (!nouveau.roles.length) return setMsg({ ok: false, t: 'Choisissez au moins un rôle.' });
    if (nouveau.motDePasse.length < 8) return setMsg({ ok: false, t: 'Mot de passe provisoire : 8 caractères minimum.' });
    setEnvoi(true);
    try {
      await depot.creerCompte(nouveau);
      setCree({ email: nouveau.email.trim().toLowerCase(), motDePasse: nouveau.motDePasse });
      setNouveau({ nom: '', email: '', roles: [], motDePasse: motDePasseProvisoire() });
      recharger();
    } catch (e) { setMsg({ ok: false, t: messageErreur(e) }); } finally { setEnvoi(false); }
  };
  const envoyerLien = async (email: string) => {
    try { await depot.envoyerReinitialisation(email); setMsg({ ok: true, t: depot.mode === 'demo' ? "Mode démonstration : aucun e-mail n'est envoyé." : `E-mail envoyé à ${email} pour choisir son mot de passe.` }); }
    catch (e) { setMsg({ ok: false, t: messageErreur(e) }); }
  };

  return (
    <section className="carte" id="comptes">
      <h2>Comptes du personnel</h2>
      <form className="formulaire sous-carte" onSubmit={creer}>
        <h3>Créer un compte</h3>
        <div className="ligne">
          <label>Nom et prénom <input value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} required /></label>
          <label>Adresse e-mail <input type="email" inputMode="email" value={nouveau.email} onChange={(e) => setNouveau({ ...nouveau, email: e.target.value })} required /></label>
        </div>
        <fieldset>
          <legend>Rôle(s)</legend>
          {ROLES.map((r) => (
            <label key={r} className="case">
              <input type="checkbox" checked={nouveau.roles.includes(r)} onChange={(e) => setNouveau({ ...nouveau, roles: e.target.checked ? [...nouveau.roles, r] : nouveau.roles.filter((x) => x !== r) })} />
              {LIBELLES_ROLES[r]}
            </label>
          ))}
        </fieldset>
        <div className="ligne">
          <label>Mot de passe provisoire <input value={nouveau.motDePasse} onChange={(e) => setNouveau({ ...nouveau, motDePasse: e.target.value })} required autoComplete="off" /></label>
          <button type="button" className="bouton" onClick={() => setNouveau({ ...nouveau, motDePasse: motDePasseProvisoire() })}>Générer</button>
        </div>
        <button className="bouton principal" disabled={envoi}>{envoi ? 'Création…' : 'Créer le compte'}</button>
      </form>
      {cree && (
        <div className="alerte alerte-ok" role="status" data-testid="compte-cree">
          <strong>Compte créé.</strong> À transmettre à la personne : identifiant <code>{cree.email}</code>, mot de passe provisoire <code>{cree.motDePasse}</code>.
          Elle pourra le changer dans « Mon compte ».
          <div className="ligne"><button type="button" className="bouton petit" onClick={() => envoyerLien(cree.email)}>Envoyer plutôt un e-mail pour choisir son mot de passe</button></div>
        </div>
      )}
      {(erreur || msg) && <p className={`alerte ${msg?.ok ? 'alerte-ok' : 'alerte-erreur'}`} role="status">{erreur ?? msg?.t}</p>}
      <p className="discret">Chaque compte n'accède qu'aux fonctions de ses rôles. Le personnel de cantine ne voit que le nom, le prénom et la classe des élèves. Un compte désactivé ne peut plus rien consulter.</p>
      <div className="liste-comptes">
        {(utilisateurs ?? []).sort((a, b) => a.nom.localeCompare(b.nom)).map((u) => {
          const soiMeme = u.uid === moi?.uid;
          return (
            <article key={u.uid} className={`fiche-compte ${u.actif ? '' : 'inactif'}`} data-testid="fiche-compte">
              <div><strong>{u.nom}</strong>{soiMeme && ' (vous)'}<br /><span className="discret">{u.email}</span></div>
              <div className="roles">
                {ROLES.map((r) => (
                  <label key={r} className="case">
                    <input type="checkbox" checked={u.roles.includes(r)} disabled={soiMeme && r === 'admin'} aria-label={`${u.nom} : ${LIBELLES_ROLES[r]}`}
                      onChange={(e) => maj({ ...u, roles: e.target.checked ? [...u.roles, r] : u.roles.filter((x) => x !== r) })} />
                    {LIBELLES_ROLES[r]}
                  </label>
                ))}
              </div>
              <div className="ligne">
                <label className="case"><input type="checkbox" checked={u.actif} disabled={soiMeme} onChange={(e) => maj({ ...u, actif: e.target.checked })} aria-label={`${u.nom} actif`} /> Compte actif</label>
                <button type="button" className="bouton petit" onClick={() => envoyerLien(u.email)}>Lien de nouveau mot de passe</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Sauvegarde() {
  const { depot, utilisateur, maintenant } = useApp();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [encours, setEncours] = useState<string | null>(null);
  const [fichier, setFichier] = useState<FichierSauvegarde | null>(null);
  const [confirme, setConfirme] = useState(false);

  const telecharger = async () => {
    setMsg(null); setEncours('Préparation de la sauvegarde…');
    try {
      const f = creerSauvegarde(await depot.exporterDonnees(), utilisateur?.email ?? '', maintenant().toISOString());
      const total = resumeSauvegarde(f).reduce((t, c) => t + c.nombre, 0);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(f)], { type: 'application/json' }));
      a.download = `sauvegarde-vh-smart-campus-${instantLocal(maintenant(), 'Africa/Tunis').date}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      setMsg({ ok: true, t: `Sauvegarde téléchargée (${total} enregistrements).` });
    } catch (e) { setMsg({ ok: false, t: messageErreur(e) }); } finally { setEncours(null); }
  };
  const choisir = async (f: File | undefined) => {
    setMsg(null); setFichier(null); setConfirme(false);
    if (!f) return;
    try { setFichier(lireSauvegarde(await f.text())); } catch (e) { setMsg({ ok: false, t: messageErreur(e) }); }
  };
  const restaurer = async () => {
    if (!fichier) return;
    setMsg(null);
    try {
      const r = await depot.restaurerDonnees(fichier.collections, (fait, total) => setEncours(`Restauration ${fait}/${total}…`));
      setMsg({ ok: true, t: `Restauration terminée : ${r.ecrits} enregistrement(s) écrit(s), ${r.ignores} déjà présent(s) conservé(s).` });
      setFichier(null);
    } catch (e) { setMsg({ ok: false, t: `Restauration interrompue : ${messageErreur(e)}` }); } finally { setEncours(null); }
  };

  return (
    <section className="carte formulaire" id="sauvegarde">
      <h2>Sauvegarde des données</h2>
      <p className="discret">
        {depot.mode === 'firebase'
          ? 'Toutes les données sont enregistrées en continu dans la base Firebase. Téléchargez en plus une sauvegarde régulière (par exemple chaque semaine) et conservez-la en lieu sûr : elle contient des données personnelles.'
          : 'Mode démonstration : les données restent dans ce navigateur.'}
      </p>
      <button className="bouton principal" onClick={telecharger} disabled={!!encours}>Télécharger une sauvegarde complète</button>
      <h3>Restaurer une sauvegarde</h3>
      <label>Fichier de sauvegarde (.json) <input type="file" accept="application/json,.json" onChange={(e) => choisir(e.target.files?.[0])} data-testid="fichier-sauvegarde" /></label>
      {fichier && (
        <div className="alerte alerte-attention">
          <strong>Sauvegarde du {new Date(fichier.creeLe).toLocaleString('fr-FR')}</strong>{fichier.creePar && ` par ${fichier.creePar}`}
          <ul>{resumeSauvegarde(fichier).filter((c) => c.nombre).map((c) => <li key={c.collection}>{c.collection} : {c.nombre}</li>)}</ul>
          Les enregistrements de la sauvegarde remplacent ceux qui portent le même identifiant ; les passages de cantine déjà présents ne sont jamais écrasés ;
          rien n'est supprimé. Les mots de passe ne font pas partie des sauvegardes.
          <label className="case"><input type="checkbox" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} /> Je confirme la restauration</label>
          <button className="bouton principal" disabled={!confirme || !!encours} onClick={restaurer}>Restaurer</button>
        </div>
      )}
      {encours && <p className="alerte alerte-info" role="status">{encours}</p>}
      {msg && <p className={`alerte ${msg.ok ? 'alerte-ok' : 'alerte-erreur'}`} role="status">{msg.t}</p>}
    </section>
  );
}

function CalendrierScolaire() {
  const { depot, maintenant } = useApp();
  const { donnee } = useDonnee(() => depot.lireCalendrier(), [depot]);
  const [c, setC] = useState<Calendrier | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [force, setForce] = useState({ lundi: '', type: 'A' as 'A' | 'B' });
  useEffect(() => { if (donnee) setC(donnee); }, [donnee]);
  if (!c) return null;
  const aujourdhui = instantLocal(maintenant(), c.fuseau).date;
  const enregistrer = async () => {
    try { await depot.enregistrerCalendrier(c); setMsg({ ok: true, t: 'Calendrier enregistré.' }); } catch (e) { setMsg({ ok: false, t: messageErreur(e) }); }
  };
  return (
    <section className="carte formulaire" id="calendrier">
      <h2>Calendrier scolaire et semaines A/B</h2>
      <p>Cette semaine : <strong>semaine {typeSemaine(aujourdhui, c)}</strong> (lundi {lundiDe(aujourdhui)})</p>
      <div className="ligne">
        <label>Début d'année <input type="date" value={c.anneeDebut} onChange={(e) => setC({ ...c, anneeDebut: e.target.value })} /></label>
        <label>Fin d'année <input type="date" value={c.anneeFin} onChange={(e) => setC({ ...c, anneeFin: e.target.value })} /></label>
        <label>Fuseau horaire <input value={c.fuseau} onChange={(e) => setC({ ...c, fuseau: e.target.value })} /></label>
      </div>
      <div className="ligne">
        <label>Lundi de référence <input type="date" value={c.reference.lundi} onChange={(e) => setC({ ...c, reference: { ...c.reference, lundi: e.target.value } })} /></label>
        <label>Cette semaine est <select value={c.reference.type} onChange={(e) => setC({ ...c, reference: { ...c.reference, type: e.target.value as 'A' | 'B' } })}><option>A</option><option>B</option></select></label>
        <label>Alternance
          <select value={c.modeAlternance} onChange={(e) => setC({ ...c, modeAlternance: e.target.value as Calendrier['modeAlternance'] })}>
            <option value="hors_vacances">Les semaines de vacances ne comptent pas</option>
            <option value="continu">Continue, vacances comprises</option>
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Forçage ponctuel d'une semaine</legend>
        <ul className="liste">{Object.entries(c.semainesForcees).map(([l, t]) => (
          <li key={l}>Semaine du {l} : {t} <button type="button" className="bouton petit" onClick={() => { const s = { ...c.semainesForcees }; delete s[l]; setC({ ...c, semainesForcees: s }); }}>Retirer</button></li>
        ))}</ul>
        <div className="ligne">
          <label>Semaine du <input type="date" value={force.lundi} onChange={(e) => setForce({ ...force, lundi: e.target.value })} /></label>
          <label>Type <select value={force.type} onChange={(e) => setForce({ ...force, type: e.target.value as 'A' | 'B' })}><option>A</option><option>B</option></select></label>
          <button type="button" className="bouton" disabled={!force.lundi} onClick={() => setC({ ...c, semainesForcees: { ...c.semainesForcees, [lundiDe(force.lundi)]: force.type } })}>Forcer</button>
        </div>
      </fieldset>
      <Periodes titre="Vacances" valeurs={c.vacances} surChangement={(vacances) => setC({ ...c, vacances })} />
      <fieldset>
        <legend>Jours fériés</legend>
        {c.feries.map((f, i) => (
          <div className="ligne" key={i}>
            <input type="date" value={f.date} onChange={(e) => setC({ ...c, feries: c.feries.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })} />
            <input value={f.libelle} onChange={(e) => setC({ ...c, feries: c.feries.map((x, j) => (j === i ? { ...x, libelle: e.target.value } : x)) })} />
            <button type="button" className="bouton petit danger" onClick={() => setC({ ...c, feries: c.feries.filter((_, j) => j !== i) })}>Supprimer</button>
          </div>
        ))}
        <button type="button" className="bouton" onClick={() => setC({ ...c, feries: [...c.feries, { date: '', libelle: '' }] })}>+ Jour férié</button>
      </fieldset>
      {msg && <p className={`alerte ${msg.ok ? 'alerte-ok' : 'alerte-erreur'}`}>{msg.t}</p>}
      <button className="bouton principal" onClick={enregistrer}>Enregistrer le calendrier</button>
    </section>
  );
}

function Periodes({ titre, valeurs, surChangement }: { titre: string; valeurs: Calendrier['vacances']; surChangement: (v: Calendrier['vacances']) => void }) {
  const maj = (i: number, k: 'debut' | 'fin' | 'libelle', v: string) => surChangement(valeurs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <fieldset>
      <legend>{titre}</legend>
      {valeurs.map((p, i) => (
        <div className="ligne" key={i}>
          <label>Du <input type="date" value={p.debut} onChange={(e) => maj(i, 'debut', e.target.value)} /></label>
          <label>au <input type="date" value={p.fin} onChange={(e) => maj(i, 'fin', e.target.value)} /></label>
          <input value={p.libelle} placeholder="Libellé" onChange={(e) => maj(i, 'libelle', e.target.value)} />
          <button type="button" className="bouton petit danger" onClick={() => surChangement(valeurs.filter((_, j) => j !== i))}>Supprimer</button>
        </div>
      ))}
      <button type="button" className="bouton" onClick={() => surChangement([...valeurs, { debut: '', fin: '', libelle: '' }])}>+ Période</button>
    </fieldset>
  );
}

function Services() {
  const { depot } = useApp();
  const { donnee } = useDonnee(() => depot.servicesCantine(), [depot]);
  const [s, setS] = useState<ServiceCantine[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (donnee) setS(donnee); }, [donnee]);
  if (!s) return null;
  const maj = (i: number, k: keyof ServiceCantine, v: string) => setS(s.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <section className="carte formulaire" id="services">
      <h2>Services de cantine</h2>
      {s.map((x, i) => (
        <div className="ligne" key={i}>
          <label>Identifiant <input value={x.id} onChange={(e) => maj(i, 'id', e.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase())} /></label>
          <label>Libellé <input value={x.libelle} onChange={(e) => maj(i, 'libelle', e.target.value)} /></label>
          <label>Début <input type="time" value={x.debut} onChange={(e) => maj(i, 'debut', e.target.value)} /></label>
          <label>Fin <input type="time" value={x.fin} onChange={(e) => maj(i, 'fin', e.target.value)} /></label>
        </div>
      ))}
      <button type="button" className="bouton" onClick={() => setS([...s, { id: '', libelle: '', debut: '', fin: '' }])}>+ Service</button>
      {msg && <p className="alerte alerte-info">{msg}</p>}
      <button className="bouton principal" onClick={() => depot.enregistrerServices(s.filter((x) => x.id)).then(() => setMsg('Services enregistrés.'), (e) => setMsg(messageErreur(e)))}>Enregistrer les services</button>
    </section>
  );
}
