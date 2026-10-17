import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { messageErreur, useApp, useDonnee } from '../app/contexte';
import { LIBELLES_ROLES } from '../domain/permissions';
import { typeSemaine } from '../domain/calendrier';
import { instantLocal, lundiDe } from '../domain/temps';
import type { Calendrier, Role, ServiceCantine, Utilisateur } from '../domain/types';

const ROLES = Object.keys(LIBELLES_ROLES) as Role[];

export function Administration() {
  return (
    <div className="module">
      <div className="titre-module"><Link to="/" className="retour">← Accueil</Link><h1>Administration</h1></div>
      <Utilisateurs />
      <CalendrierScolaire />
      <Services />
    </div>
  );
}

function Utilisateurs() {
  const { depot } = useApp();
  const { donnee: utilisateurs, recharger, erreur } = useDonnee(() => depot.listerUtilisateurs(), [depot]);
  const [msg, setMsg] = useState<string | null>(null);
  const maj = async (u: Utilisateur) => {
    try { await depot.enregistrerUtilisateur(u); recharger(); } catch (e) { setMsg(messageErreur(e)); }
  };
  return (
    <section className="carte">
      <h2>Comptes et rôles</h2>
      <p className="discret">
        Chaque compte n'accède qu'aux fonctions de ses rôles. Le personnel de cantine ne voit que le nom, le prénom et la classe des élèves.
        {depot.mode === 'firebase' && ' Les nouveaux comptes sont créés dans la console Firebase (Authentication), puis activés ici.'}
      </p>
      {(erreur || msg) && <p className="alerte alerte-erreur">{erreur ?? msg}</p>}
      <div className="table-defilante">
        <table>
          <thead><tr><th>Nom</th><th>E-mail</th>{ROLES.map((r) => <th key={r}>{LIBELLES_ROLES[r]}</th>)}<th>Actif</th></tr></thead>
          <tbody>
            {(utilisateurs ?? []).map((u) => (
              <tr key={u.uid}>
                <td>{u.nom}</td><td>{u.email}</td>
                {ROLES.map((r) => (
                  <td key={r} className="centre">
                    <input type="checkbox" aria-label={`${u.nom} : ${LIBELLES_ROLES[r]}`} checked={u.roles.includes(r)}
                      onChange={(e) => maj({ ...u, roles: e.target.checked ? [...u.roles, r] : u.roles.filter((x) => x !== r) })} />
                  </td>
                ))}
                <td className="centre"><input type="checkbox" checked={u.actif} onChange={(e) => maj({ ...u, actif: e.target.checked })} aria-label={`${u.nom} actif`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    <section className="carte formulaire">
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
    <section className="carte formulaire">
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
