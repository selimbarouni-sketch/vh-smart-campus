import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { messageErreur, useApp, useDonnee } from '../app/contexte';
import type { Eleve, Groupe } from '../domain/types';
import { idGroupe, normaliserClasse } from '../domain/classes';
import { couleurClasse } from '../domain/couleursClasses';
import { qrAvecLogo } from '../app/qrCarte';
import { analyserListeEleves, lireTableau, rapprocher, type EleveImporte } from '../domain/importEleves';
import { dateFr, dateValide, jourDeLaSemaine } from '../domain/temps';

const vide = (): Eleve => ({ id: '', nom: '', prenom: '', classe: '', actif: true, cantineAutorisee: true });

export function Eleves() {
  const { depot } = useApp();
  const { donnee: eleves, recharger, erreur } = useDonnee(() => depot.listerEleves(), [depot]);
  const { donnee: groupes, recharger: rechargerGroupes } = useDonnee(() => depot.listerGroupes(), [depot]);
  const [recherche, setRecherche] = useState('');
  const [classe, setClasse] = useState('');
  const [edite, setEdite] = useState<Eleve | null>(null);
  const [cartes, setCartes] = useState<Eleve[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const classes = useMemo(() => [...new Set((eleves ?? []).map((e) => e.classe))].sort(), [eleves]);
  const liste = (eleves ?? [])
    .filter((e) => !classe || e.classe === classe)
    .filter((e) => `${e.nom} ${e.prenom}`.toLowerCase().includes(recherche.toLowerCase()))
    .sort((a, b) => a.classe.localeCompare(b.classe) || a.nom.localeCompare(b.nom));

  const [importer, setImporter] = useState(false);

  if (cartes) return <CartesQR eleves={cartes} retour={() => setCartes(null)} />;
  if (importer) return <ImportListe existants={eleves ?? []} fermer={(m) => { setImporter(false); if (m) setMessage(m); recharger(); }} />;

  return (
    <div className="module">
      <div className="titre-module"><Link to="/" className="retour">← Accueil</Link><h1>Gestion des élèves</h1></div>
      {erreur && <p className="alerte alerte-erreur">{erreur}</p>}
      {message && <p className="alerte alerte-info">{message}</p>}
      <section className="carte filtres">
        <label>Recherche <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom ou prénom" /></label>
        <label>Classe <select value={classe} onChange={(e) => setClasse(e.target.value)}><option value="">Toutes</option>{classes.map((c) => <option key={c}>{c}</option>)}</select></label>
        <button className="bouton principal" onClick={() => setEdite(vide())}>+ Nouvel élève</button>
        <button className="bouton" onClick={() => setImporter(true)}>Importer une liste (Pronote, Excel, CSV)</button>
        <button className="bouton" disabled={!liste.length} onClick={() => setCartes(liste.filter((e) => e.actif))}>Imprimer les cartes QR ({liste.filter((e) => e.actif).length})</button>
      </section>
      {edite && <FicheEleve eleve={edite} groupes={groupes ?? []} fermer={() => { setEdite(null); recharger(); }} />}
      <div className="table-defilante">
        <table>
          <thead><tr><th>Nom</th><th>Prénom</th><th>Classe</th><th>Cantine</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            {liste.map((e) => (
              <tr key={e.id}>
                <td>{e.nom}</td><td>{e.prenom}</td><td><span className="pastille" style={{ background: couleurClasse(e.classe).fond }} />{e.classe}</td>
                <td>{e.cantineAutorisee ? 'Autorisée' : 'Non'}{e.datesCantine?.length ? ` · ${e.datesCantine.length} lundi(s)` : ''}</td><td>{e.actif ? 'Actif' : 'Inactif'}</td>
                <td><button className="bouton petit" onClick={() => setEdite(e)}>Modifier</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Groupes groupes={groupes ?? []} classes={classes} surChangement={rechargerGroupes} />
    </div>
  );
}

function FicheEleve({ eleve, groupes, fermer }: { eleve: Eleve; groupes: Groupe[]; fermer: () => void }) {
  const { depot, etablissement } = useApp();
  const [e, setE] = useState(eleve);
  const [groupesEleve, setGroupesEleve] = useState<string[]>([]);
  const [jeton, setJeton] = useState<string | null>(null);
  const [qr, setQr] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [lundi, setLundi] = useState('');

  useEffect(() => {
    if (!eleve.id) return;
    depot.lireScolarite(eleve.id).then((s) => setGroupesEleve(s?.groupes ?? [])).catch(() => undefined);
    depot.jetonActif(eleve.id).then(setJeton).catch(() => undefined);
  }, [eleve.id, depot]);
  useEffect(() => { if (jeton) qrAvecLogo(jeton, etablissement.logo, 240).then(setQr); else setQr(''); }, [jeton, etablissement.logo]);

  const enregistrer = async (ev: FormEvent) => {
    ev.preventDefault();
    setErreur(null);
    try {
      const id = e.id || `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      await depot.enregistrerEleve({ ...e, id, nom: e.nom.trim(), prenom: e.prenom.trim(), classe: normaliserClasse(e.classe) });
      await depot.enregistrerScolarite({ eleveId: id, groupes: groupesEleve });
      if (!e.id) await depot.regenererJeton(id);
      fermer();
    } catch (err) { setErreur(messageErreur(err)); }
  };
  const regenerer = async () => {
    if (!e.id || !confirm("Générer un nouveau QR code ? L'ancienne carte ne fonctionnera plus (carte perdue ou volée).")) return;
    try { setJeton(await depot.regenererJeton(e.id)); } catch (err) { setErreur(messageErreur(err)); }
  };

  const ajouterLundi = () => {
    if (!dateValide(lundi) || jourDeLaSemaine(lundi) !== 'lundi') { setErreur('Choisissez une date qui tombe un lundi.'); return; }
    setErreur(null);
    setE({ ...e, datesCantine: [...new Set([...(e.datesCantine ?? []), lundi])].sort() });
    setLundi('');
  };
  const retirerLundi = (d: string) => setE({ ...e, datesCantine: (e.datesCantine ?? []).filter((x) => x !== d) });

  return (
    <form className="carte formulaire" onSubmit={enregistrer}>
      <h2>{eleve.id ? 'Modifier un élève' : 'Nouvel élève'}</h2>
      <div className="ligne">
        <label>Nom <input value={e.nom} onChange={(x) => setE({ ...e, nom: x.target.value })} required /></label>
        <label>Prénom <input value={e.prenom} onChange={(x) => setE({ ...e, prenom: x.target.value })} required /></label>
        <label>Classe <input value={e.classe} onChange={(x) => setE({ ...e, classe: x.target.value })} placeholder="ex. 1re B" required /></label>
      </div>
      <label className="case"><input type="checkbox" checked={e.cantineAutorisee} onChange={(x) => setE({ ...e, cantineAutorisee: x.target.checked })} /> Autorisé à la cantine</label>
      <label className="case"><input type="checkbox" checked={e.actif} onChange={(x) => setE({ ...e, actif: x.target.checked })} /> Élève actif (inscrit)</label>
      <fieldset>
        <legend>Cantine certains lundis (ex. élève ayant un club)</legend>
        <p className="discret">Ces lundis précis s'ajoutent au régime de l'élève. Aucun autre jour n'est ouvert.</p>
        <div className="ligne">
          <label>Lundi <input type="date" value={lundi} onChange={(x) => setLundi(x.target.value)} /></label>
          <button type="button" className="bouton" onClick={ajouterLundi} disabled={!lundi}>+ Ajouter ce lundi</button>
        </div>
        {e.datesCantine?.length ? (
          <ul className="liste-simple">
            {e.datesCantine.map((d) => (
              <li key={d}>{dateFr(d)} <button type="button" className="lien" onClick={() => retirerLundi(d)}>Retirer</button></li>
            ))}
          </ul>
        ) : <p className="discret">Aucun lundi particulier.</p>}
      </fieldset>
      <fieldset>
        <legend>Groupes (spécialités, options, langues)</legend>
        <p className="discret">Un élève ne voit les cours d'un groupe que s'il y est explicitement associé.</p>
        {groupes.filter((g) => !e.classe || g.classes.length === 0 || g.classes.includes(e.classe)).map((g) => (
          <label key={g.id} className="case">
            <input type="checkbox" checked={groupesEleve.includes(g.id)} onChange={(x) => setGroupesEleve(x.target.checked ? [...groupesEleve, g.id] : groupesEleve.filter((y) => y !== g.id))} />
            {g.libelle}
          </label>
        ))}
      </fieldset>
      {eleve.id && (
        <div className="qr-eleve">
          {qr ? <img src={qr} alt="QR code de l'élève" /> : <p className="discret">Aucun QR code actif.</p>}
          <button type="button" className="bouton" onClick={regenerer}>Générer un nouveau QR code</button>
        </div>
      )}
      {erreur && <p className="alerte alerte-erreur">{erreur}</p>}
      <div className="ligne"><button type="button" className="bouton" onClick={fermer}>Annuler</button><button className="bouton principal">Enregistrer</button></div>
    </form>
  );
}

function Groupes({ groupes, classes, surChangement }: { groupes: Groupe[]; classes: string[]; surChangement: () => void }) {
  const { depot } = useApp();
  const [g, setG] = useState<Groupe>({ id: '', libelle: '', type: 'specialite', classes: [] });
  const [erreur, setErreur] = useState<string | null>(null);
  const ajouter = async (ev: FormEvent) => {
    ev.preventDefault();
    const id = idGroupe(g.id);
    if (!id) return;
    try { await depot.enregistrerGroupe({ ...g, id }); setG({ id: '', libelle: '', type: 'specialite', classes: [] }); surChangement(); }
    catch (e) { setErreur(messageErreur(e)); }
  };
  return (
    <section className="carte">
      <h2>Groupes</h2>
      <ul className="liste">{groupes.map((x) => <li key={x.id}><code>{x.id}</code> · {x.libelle} · {x.classes.join(', ') || 'toutes classes'}</li>)}</ul>
      <form className="formulaire" onSubmit={ajouter}>
        <div className="ligne">
          <label>Identifiant <input value={g.id} onChange={(e) => setG({ ...g, id: e.target.value })} placeholder="ex. SPE-SES-1re" required /></label>
          <label>Libellé <input value={g.libelle} onChange={(e) => setG({ ...g, libelle: e.target.value })} required /></label>
          <label>Type
            <select value={g.type} onChange={(e) => setG({ ...g, type: e.target.value as Groupe['type'] })}>
              <option value="specialite">Spécialité</option><option value="option">Option</option><option value="langue">Langue</option>
              <option value="demi_groupe">Demi-groupe</option><option value="autre">Autre</option>
            </select>
          </label>
        </div>
        <fieldset><legend>Classes concernées</legend>
          {classes.map((c) => <label key={c} className="case"><input type="checkbox" checked={g.classes.includes(c)} onChange={(e) => setG({ ...g, classes: e.target.checked ? [...g.classes, c] : g.classes.filter((x) => x !== c) })} />{c}</label>)}
        </fieldset>
        {erreur && <p className="alerte alerte-erreur">{erreur}</p>}
        <button className="bouton">Ajouter le groupe</button>
      </form>
    </section>
  );
}

/** Import d'une liste d'élèves avec aperçu vérifiable avant enregistrement. */
function ImportListe({ existants, fermer }: { existants: Eleve[]; fermer: (message?: string) => void }) {
  const { depot } = useApp();
  const [texte, setTexte] = useState('');
  const [lignes, setLignes] = useState<EleveImporte[]>([]);
  const [avertissements, setAvertissements] = useState<string[]>([]);
  const [verifie, setVerifie] = useState(false);
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const analyser = (t: string) => {
    setTexte(t);
    const r = analyserListeEleves(lireTableau(t));
    setLignes(r.eleves);
    setAvertissements(r.avertissements);
    setVerifie(false);
  };
  const lireFichier = async (f: File | undefined) => {
    if (!f) return;
    setErreur(null);
    try {
      if (/\.xlsx$/i.test(f.name)) {
        const ExcelJS = (await import('exceljs')).default;
        const classeur = new ExcelJS.Workbook();
        await classeur.xlsx.load(await f.arrayBuffer());
        const feuille = classeur.worksheets[0];
        const tsv: string[] = [];
        feuille.eachRow((row) => {
          const valeurs = (row.values as unknown[]).slice(1).map((v) => (v instanceof Date ? v.toLocaleDateString('fr-FR') : String((v as { text?: string })?.text ?? v ?? '')));
          tsv.push(valeurs.join('\t'));
        });
        analyser(tsv.join('\n'));
      } else analyser(await f.text());
    } catch (e) { setErreur(`Fichier illisible : ${messageErreur(e)}`); }
  };
  const maj = (i: number, champ: 'nom' | 'prenom' | 'classe' | 'cantineAutorisee', v: string | boolean) =>
    setLignes(lignes.map((l, k) => (k === i ? { ...l, [champ]: champ === 'classe' ? normaliserClasse(String(v)) : v, decoupageIncertain: champ === 'nom' || champ === 'prenom' ? false : l.decoupageIncertain } : l)));

  const actions = lignes.map((l) => rapprocher(l, existants));
  const incertains = lignes.filter((l) => l.decoupageIncertain).length;
  const sansClasse = lignes.filter((l) => !l.classe).length;
  const ambigus = actions.filter((a) => a.type === 'ambigu').length;

  const enregistrer = async () => {
    setErreur(null);
    let crees = 0, maj_ = 0;
    try {
      for (let i = 0; i < lignes.length; i++) {
        const l = lignes[i], a = actions[i];
        setEnvoi(`Enregistrement ${i + 1}/${lignes.length}…`);
        if (a.type === 'creer') {
          const id = `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
          await depot.enregistrerEleve({ id, nom: l.nom.trim(), prenom: l.prenom.trim(), classe: l.classe, actif: true, cantineAutorisee: l.cantineAutorisee });
          await depot.regenererJeton(id);
          crees++;
        } else if (a.type === 'mettre_a_jour') {
          await depot.enregistrerEleve({ ...a.eleve, classe: l.classe || a.eleve.classe, cantineAutorisee: l.cantineAutorisee, actif: true });
          maj_++;
        }
      }
      fermer(`${crees} élève(s) créé(s) avec leur QR code, ${maj_} mis à jour.`);
    } catch (e) {
      setErreur(`Import interrompu après ${crees + maj_} élève(s) : ${messageErreur(e)}. Les élèves déjà enregistrés ne seront pas dupliqués si vous relancez l'import.`);
    } finally { setEnvoi(null); }
  };

  return (
    <div className="module">
      <div className="titre-module"><button className="lien" onClick={() => fermer()}>← Élèves</button><h1>Importer une liste d'élèves</h1></div>
      <section className="carte formulaire">
        <label>Collez la liste copiée depuis Excel ou Pronote (avec la ligne d'en-tête)
          <textarea rows={6} value={texte} onChange={(e) => analyser(e.target.value)} placeholder={'Élève\tNé(e) le\tClasse\tRégime'} data-testid="liste-collee" />
        </label>
        <label>ou choisissez un fichier (XLSX, CSV, TXT)
          <input type="file" accept=".xlsx,.csv,.txt,.tsv,text/csv,text/plain" onChange={(e) => lireFichier(e.target.files?.[0])} />
        </label>
        <p className="discret">Seuls le nom, le(s) prénom(s), la classe et le régime sont enregistrés. La date de naissance n'est pas conservée.
          Régime « demi-pensionnaire » ou « interne » : cantine autorisée ; « externe » ou vide : non autorisée.</p>
      </section>
      {erreur && <p className="alerte alerte-erreur">{erreur}</p>}
      {avertissements.map((a, i) => <p key={i} className="alerte alerte-attention">{a}</p>)}
      {lignes.length > 0 && (
        <>
          <div className="bilan">
            <span className="compte">{lignes.length} élève(s)</span>
            <span className="compte ok">{actions.filter((a) => a.type === 'creer').length} à créer</span>
            <span className="compte">{actions.filter((a) => a.type === 'mettre_a_jour').length} à mettre à jour</span>
            <span className="compte">{actions.filter((a) => a.type === 'inchange').length} inchangé(s)</span>
            {incertains > 0 && <span className="compte incertain">{incertains} nom(s) à vérifier</span>}
            {ambigus > 0 && <span className="compte erreur">{ambigus} homonyme(s)</span>}
          </div>
          <div className="table-defilante">
            <table data-testid="apercu-import">
              <thead><tr><th>Ligne</th><th>Nom</th><th>Prénom(s)</th><th>Classe</th><th>Cantine</th><th>Action</th></tr></thead>
              <tbody>
                {lignes.map((l, i) => {
                  const a = actions[i];
                  return (
                    <tr key={i} className={l.decoupageIncertain ? 'a-verifier' : ''}>
                      <td>{l.ligne}</td>
                      <td><input aria-label={`Nom ligne ${l.ligne}`} value={l.nom} onChange={(e) => maj(i, 'nom', e.target.value)} /></td>
                      <td><input aria-label={`Prénom ligne ${l.ligne}`} value={l.prenom} onChange={(e) => maj(i, 'prenom', e.target.value)} /></td>
                      <td><span className="pastille" style={{ background: couleurClasse(l.classe).fond }} />{l.classe || <em>manquante</em>}</td>
                      <td><input type="checkbox" aria-label={`Cantine ligne ${l.ligne}`} checked={l.cantineAutorisee} onChange={(e) => maj(i, 'cantineAutorisee', e.target.checked)} /></td>
                      <td>{a.type === 'creer' ? 'Créer' : a.type === 'mettre_a_jour' ? `Mettre à jour (${a.changements.join(', ')})` : a.type === 'inchange' ? 'Déjà enregistré' : 'Homonymes : à traiter à la main'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {incertains > 0 && (
            <p className="alerte alerte-attention">
              Les lignes surlignées contiennent plus de deux mots : la séparation nom / prénom(s) est une supposition. Corrigez-la si besoin
              (modifier une case la marque comme vérifiée).
            </p>
          )}
          <div className="actions-collantes">
            <label className="case"><input type="checkbox" checked={verifie} onChange={(e) => setVerifie(e.target.checked)} data-testid="case-liste-verifiee" /> J'ai vérifié les noms, prénoms, classes et autorisations cantine</label>
            <button className="bouton principal" disabled={!verifie || !!envoi || sansClasse > 0 || ambigus > 0} onClick={enregistrer}>{envoi ?? 'Enregistrer et créer les QR codes'}</button>
          </div>
        </>
      )}
    </div>
  );
}

const PAR_PAGE = 6;

/** Planche de cartes : 6 cartes par page A4, une couleur par niveau et par classe. */
function CartesQR({ eleves, retour }: { eleves: Eleve[]; retour: () => void }) {
  const { depot, etablissement } = useApp();
  const [cartes, setCartes] = useState<{ e: Eleve; qr: string }[] | null>(null);
  const [pageParClasse, setPageParClasse] = useState(true);
  useEffect(() => {
    (async () => {
      const r = [];
      const tries = [...eleves].sort((a, b) => a.classe.localeCompare(b.classe, 'fr', { numeric: true }) || a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'));
      for (const e of tries) {
        const j = await depot.jetonActif(e.id);
        if (j) r.push({ e, qr: await qrAvecLogo(j, etablissement.logo) });
      }
      setCartes(r);
    })();
  }, [eleves, depot, etablissement.logo]);

  // Découpage en pages de 6, avec saut de page à chaque classe si demandé.
  const pages: { e: Eleve; qr: string }[][] = [];
  for (const c of cartes ?? []) {
    const derniere = pages[pages.length - 1];
    if (!derniere || derniere.length === PAR_PAGE || (pageParClasse && derniere[0].e.classe !== c.e.classe)) pages.push([c]);
    else derniere.push(c);
  }
  const specimen = depot.mode === 'demo';
  const sansQr = eleves.length - (cartes?.length ?? 0);

  return (
    <div>
      <div className="ligne pas-imprimer">
        <button className="bouton" onClick={retour}>← Retour</button>
        <label className="case"><input type="checkbox" checked={pageParClasse} onChange={(e) => setPageParClasse(e.target.checked)} /> Nouvelle page à chaque classe</label>
        <button className="bouton principal" onClick={() => window.print()} disabled={!cartes}>Imprimer ({pages.length} page(s) A4)</button>
      </div>
      {specimen && <p className="alerte alerte-attention pas-imprimer">Mode démonstration : les QR codes de ces cartes ne fonctionnent pas dans l'application réelle. Imprimez les cartes depuis l'application de production.</p>}
      {cartes && sansQr > 0 && <p className="alerte alerte-attention pas-imprimer">{sansQr} élève(s) sans QR code actif : ouvrez leur fiche pour en générer un.</p>}
      {!cartes && <p className="pas-imprimer">Préparation des cartes…</p>}
      <div className="planches">
        {pages.map((p, i) => (
          <div className="page-cartes" key={i}>
            {p.map(({ e, qr }) => {
              const c = couleurClasse(e.classe);
              return (
                <div key={e.id} className="carte-eleve" style={{ borderColor: c.fond }} data-testid="carte-eleve">
                  <div className="carte-bandeau" style={{ background: c.fond, color: c.texte }}>
                    <span className="carte-titre">
                      {etablissement.logo && <img src={etablissement.logo} alt="" className="carte-logo" />}
                      <span className="carte-classe">{e.classe}</span>
                    </span>
                    <span className="carte-niveau">{c.niveau}</span>
                  </div>
                  <div className="carte-corps">
                    <img src={qr} alt="" className="carte-qr" />
                    <div className="carte-nom"><strong>{e.nom.toUpperCase()}</strong><br />{e.prenom}</div>
                  </div>
                  <div className="carte-pied" style={{ background: c.clair }}>{etablissement.nomCourt} · Cantine et emploi du temps</div>
                  {specimen && <div className="carte-specimen">SPÉCIMEN – NON VALABLE</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
