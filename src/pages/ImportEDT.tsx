import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { messageErreur, useApp, useDonnee } from '../app/contexte';
import { TableauVerification } from '../composants/TableauVerification';
import { cibleClasse, cibleGroupe, libelleCible } from '../domain/emploiDuTemps';
import { actionsSurAnciennes, ciblesImport, ErreurPublication, modifierSeances, preparerPublication, prochaineVersion, valider } from '../domain/publication';
import { instantLocal } from '../domain/temps';
import type { ImportEDT as Import, Seance, TypeDocument } from '../domain/types';
import { bilan, verifierSeances } from '../domain/verification';
import { nouvelId } from '../extraction/analyseTableau';
import { chargerDocument, extraireDocument, imagePourVision, type DocumentCharge } from '../extraction/navigateur';
import { seancesDepuisVision } from '../extraction/vision';

const ETAPES = ['Document', 'Extraction', 'Vérification', 'Publication'];

export function ImportEDT() {
  const { depot, utilisateur, maintenant } = useApp();
  const { id, source } = useParams();
  const copieFaite = useRef(false);

  // Modification d'un emploi du temps publié : brouillon copié de ses séances, sans nouveau fichier.
  // Le document source reste le même ; on corrige les séances puis on republie.
  useEffect(() => {
    if (!source || !utilisateur || copieFaite.current) return;
    copieFaite.current = true;
    (async () => {
      try {
        const origine = await depot.lireImport(source);
        if (!origine) { setErreur('Emploi du temps d’origine introuvable.'); return; }
        const versions = await depot.listerVersions();
        const copie: Import = {
          ...origine,
          id: `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          statut: 'brouillon',
          version: prochaineVersion(ciblesImport(origine), versions),
          importePar: utilisateur.uid,
          importeParNom: utilisateur.nom,
          importeLe: maintenant().toISOString(),
          seances: origine.seances.map((s) => ({ ...s, id: nouvelId() })),
          avertissements: [`Modification de la version ${origine.version} : séances copiées, sans nouveau fichier.`],
          valideePar: undefined, valideeLe: undefined,
          publieePar: undefined, publieeLe: undefined,
          archiveeLe: undefined, remplacePar: undefined,
        };
        await depot.enregistrerImport(copie);
        naviguer(`/edt/import/${copie.id}`, { replace: true });
      } catch (e) { setErreur(messageErreur(e)); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, utilisateur?.uid]);
  const naviguer = useNavigate();
  const { donnee: groupes, recharger: rechargerGroupes } = useDonnee(() => depot.listerGroupes(), [depot]);
  const { donnee: eleves } = useDonnee(() => depot.listerEleves().catch(() => []), [depot]);
  const { donnee: calendrier } = useDonnee(() => depot.lireCalendrier(), [depot]);
  const { donnee: imports, recharger: rechargerImports } = useDonnee(() => depot.listerImports(), [depot]);

  const [doc, setDoc] = useState<DocumentCharge | null>(null);
  const [apercus, setApercus] = useState<string[]>([]);
  const [typeDoc, setTypeDoc] = useState<TypeDocument>('classe');
  const [cible, setCible] = useState('');
  const [classeSaisie, setClasseSaisie] = useState('');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [imp, setImp] = useState<Import | null>(null);
  const [progression, setProgression] = useState<{ message: string; part: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [page, setPage] = useState<number | null>(1);
  const [compare, setCompare] = useState(true);
  const [relu, setRelu] = useState(false);
  const [enregistre, setEnregistre] = useState(true);

  const classes = useMemo(() => [...new Set((eleves ?? []).map((e) => e.classe))].sort(), [eleves]);
  const ciblesProposees = useMemo(() => [
    ...classes.map(cibleClasse), ...(groupes ?? []).map((g) => cibleGroupe(g.id)),
  ], [classes, groupes]);

  useEffect(() => {
    if (calendrier && !debut) {
      setDebut(instantLocal(maintenant(), calendrier.fuseau).date);
      setFin(calendrier.anneeFin);
    }
  }, [calendrier, debut, maintenant]);

  // Reprise d'un brouillon existant.
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const existant = await depot.lireImport(id);
        if (!existant) { setErreur('Import introuvable.'); return; }
        setImp(existant);
        if (existant.cheminStockage) {
          try {
            const url = await depot.urlSource(existant.cheminStockage);
            const blob = await (await fetch(url)).blob();
            const d = await chargerDocument(new File([blob], existant.fichierNom, { type: existant.fichierType }));
            setDoc(d);
            setApercus(await rendreApercus(d));
          } catch (e) { setInfo(`Document original non affichable : ${messageErreur(e)}`); }
        }
      } catch (e) { setErreur(messageErreur(e)); }
    })();
  }, [id, depot]);

  const choisirFichier = async (f: File | undefined) => {
    setErreur(null); setDoc(null); setApercus([]);
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { setErreur('Fichier trop volumineux (25 Mo maximum).'); return; }
    try {
      const d = await chargerDocument(f);
      setDoc(d);
      setApercus(await rendreApercus(d));
    } catch (e) { setErreur(messageErreur(e)); }
  };

  const lancerExtraction = async () => {
    if (!doc || !utilisateur || !calendrier) return;
    setErreur(null);
    const ciblesParDefaut = typeDoc === 'multi_classes' ? [] : cible ? [cible] : [];
    if (typeDoc !== 'multi_classes' && !cible) { setErreur('Indiquez la classe ou le groupe concerné par ce document.'); return; }
    const idImport = `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      setProgression({ message: 'Enregistrement du document source…', part: 0 });
      const chemin = await depot.televerserSource(idImport, doc.fichier);
      const res = await extraireDocument(doc, ciblesParDefaut, (message, part) => setProgression({ message, part }));
      const versions = await depot.listerVersions();
      const cibles = ciblesParDefaut.length ? ciblesParDefaut : res.classesDetectees.map(cibleClasse);
      const nouveau: Import = {
        id: idImport, fichierNom: doc.fichier.name, fichierType: doc.fichier.type, cheminStockage: chemin, nbPages: doc.nbPages,
        typeDocument: typeDoc, ciblesParDefaut, importePar: utilisateur.uid, importeParNom: utilisateur.nom,
        importeLe: maintenant().toISOString(), statut: 'brouillon',
        version: prochaineVersion(cibles, versions), validiteDebut: debut, validiteFin: fin,
        seances: res.seances, extraction: res.extraction, avertissements: res.avertissements,
      };
      await depot.enregistrerImport(nouveau);
      setImp(nouveau);
      setEnregistre(true);
      rechargerImports();
      naviguer(`/edt/import/${idImport}`, { replace: true });
    } catch (e) {
      setErreur(`Échec de l'extraction : ${messageErreur(e)}`);
    } finally {
      setProgression(null);
    }
  };

  const changerSeances = (s: Seance[]) => {
    if (!imp) return;
    try { setImp(modifierSeances(imp, s)); setEnregistre(false); setRelu(false); } catch (e) { setErreur(messageErreur(e)); }
  };

  const sauvegarder = async (i: Import) => {
    await depot.enregistrerImport(i);
    setImp(i);
    setEnregistre(true);
  };

  const analyseMultimodale = async () => {
    if (!doc || !imp || !page || !depot.analyseMultimodale) return;
    setErreur(null);
    try {
      setProgression({ message: `Analyse multimodale de la page ${page}…`, part: 0.5 });
      const brut = await depot.analyseMultimodale(await imagePourVision(doc, page), 'image/jpeg', `Type : ${typeDoc}. Cible : ${libelleCible(imp.ciblesParDefaut[0] ?? '')}`);
      const r = seancesDepuisVision(brut, page, imp.ciblesParDefaut);
      if (!confirm(`L'analyse multimodale propose ${r.seances.length} séance(s) pour la page ${page}. Remplacer les séances actuelles de cette page ? Elles devront toutes être vérifiées.`)) return;
      changerSeances([...imp.seances.filter((s) => s.page !== page), ...r.seances]);
      setImp((x) => x && { ...x, avertissements: [...x.avertissements, ...r.avertissements], extraction: [...x.extraction, { methode: 'vision', pages: [page] }] });
    } catch (e) {
      setErreur(`Analyse multimodale impossible : ${messageErreur(e)}`);
    } finally { setProgression(null); }
  };

  const problemes = useMemo(() => (imp ? verifierSeances(imp.seances) : []), [imp]);

  // Quinzaines Q1/Q2 : la correspondance avec les semaines A/B est confirmée une seule fois pour tout le document.
  const quinzaines = imp ? imp.seances.filter((s) => /\bQ\s?[12]\b/i.test(s.texteSource ?? '')) : [];
  const appliquerQuinzaines = (q1: 'A' | 'B') => {
    if (!imp) return;
    const q2 = q1 === 'A' ? 'B' : 'A';
    changerSeances(imp.seances.map((s) => {
      const m = /\bQ\s?([12])\b/i.exec(s.texteSource ?? '');
      return m ? { ...s, semaine: m[1] === '1' ? q1 : q2, incertitudes: (s.incertitudes ?? []).filter((c) => c !== 'semaine') } : s;
    }));
    setInfo(`Quinzaines appliquées : Q1 = semaine ${q1}, Q2 = semaine ${q2}.`);
  };

  // Groupes cités par le document mais absents de l'application : aucun élève ne verrait ces cours.
  const groupesManquants = imp ? [...new Set(imp.seances.map((s) => s.cible).filter((c) => c.startsWith('groupe:')).map((c) => c.slice(7)))]
    .filter((id) => !(groupes ?? []).some((g) => g.id === id)) : [];
  const creerGroupesManquants = async () => {
    if (!imp) return;
    try {
      const classes = [...new Set(imp.seances.map((s) => s.cible).filter((c) => c.startsWith('classe:')).map((c) => c.slice(7)))];
      for (const id of groupesManquants) {
        const exemple = imp.seances.find((s) => s.cible === `groupe:${id}`);
        await depot.enregistrerGroupe({
          id, libelle: `${exemple?.matiere ?? id} (${exemple?.indiceGroupe ?? id})`,
          type: /LV|ALL|ESP|ARA|ANG|ITA/i.test(id) ? 'langue' : /NON-SP/i.test(id) ? 'autre' : 'specialite',
          classes,
        });
      }
      rechargerGroupes();
      setInfo(`${groupesManquants.length} groupe(s) créé(s). Associez maintenant les élèves à leurs groupes (Gestion des élèves).`);
    } catch (e) { setErreur(messageErreur(e)); }
  };
  const b = imp ? bilan(problemes, imp) : null;

  const validerImport = async () => {
    if (!imp || !utilisateur) return;
    try { await sauvegarder(valider(imp, utilisateur.uid, maintenant().toISOString())); }
    catch (e) { setErreur(e instanceof ErreurPublication ? e.message : messageErreur(e)); }
  };

  const etape = !imp ? (progression ? 1 : 0) : imp.statut === 'brouillon' ? 2 : 3;

  return (
    <div className="module module-import">
      <div className="titre-module">
        <Link to="/" className="retour">← Accueil</Link>
        <h1>Importer un emploi du temps</h1>
      </div>
      <ol className="etapes">{ETAPES.map((e, i) => <li key={e} className={i === etape ? 'active' : i < etape ? 'faite' : ''}>{String.fromCharCode(65 + i)}. {e}</li>)}</ol>
      {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}
      {info && <p className="alerte alerte-info">{info}</p>}

      {!imp && (
        <section className="carte formulaire">
          <h2>A. Document</h2>
          <label>Fichier (PDF, JPG, JPEG ou PNG)
            <input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={(e) => choisirFichier(e.target.files?.[0])} data-testid="fichier-edt" />
          </label>
          {doc && (
            <div className="infos-fichier">
              <strong>{doc.fichier.name}</strong> · {doc.nbPages} page(s) · {(doc.fichier.size / 1024).toFixed(0)} Ko
              <div className="apercus">{apercus.map((a, i) => <img key={i} src={a} alt={`Aperçu de la page ${i + 1}`} />)}</div>
            </div>
          )}
          <fieldset>
            <legend>Le document concerne</legend>
            <label className="case"><input type="radio" checked={typeDoc === 'classe'} onChange={() => { setTypeDoc('classe'); setCible(''); setClasseSaisie(''); }} /> une classe</label>
            <label className="case"><input type="radio" checked={typeDoc === 'multi_classes'} onChange={() => { setTypeDoc('multi_classes'); setCible(''); }} /> plusieurs classes (une classe par page ou par case)</label>
            <label className="case"><input type="radio" checked={typeDoc === 'groupe'} onChange={() => { setTypeDoc('groupe'); setCible(''); }} /> un groupe de spécialité ou une option</label>
          </fieldset>
          {typeDoc === 'classe' && (
            <label>Classe
              <input list="liste-classes" value={classeSaisie} placeholder="ex. 1re B"
                onChange={(e) => { setClasseSaisie(e.target.value); setCible(e.target.value.trim() ? cibleClasse(e.target.value.trim()) : ''); }} />
              {cible && classeSaisie.trim() && cible.slice(7) !== classeSaisie.trim() && <small>Enregistrée sous : {cible.slice(7)}</small>}
              <datalist id="liste-classes">{classes.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
          )}
          {typeDoc === 'groupe' && (
            <label>Groupe
              <select value={cible} onChange={(e) => setCible(e.target.value)}>
                <option value="">— Choisir —</option>
                {groupes?.map((g) => <option key={g.id} value={cibleGroupe(g.id)}>{g.libelle}</option>)}
              </select>
            </label>
          )}
          <div className="ligne">
            <label>Valable du <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} /></label>
            <label>au <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></label>
          </div>
          <button className="bouton principal" disabled={!doc || !!progression} onClick={lancerExtraction}>Lancer l'extraction</button>
          {progression && <Progression {...progression} />}
        </section>
      )}

      {imp && (
        <>
          <section className="carte">
            <h2>{imp.statut === 'brouillon' ? 'C. Vérification obligatoire' : 'D. Publication'}</h2>
            <p>
              <strong>{imp.fichierNom}</strong> · {imp.nbPages} page(s) · importé le {new Date(imp.importeLe).toLocaleString('fr-FR')} par {imp.importeParNom}
              · version {imp.version} · statut <span className={`statut statut-${imp.statut}`}>{LIBELLES_STATUT[imp.statut]}</span>
            </p>
            <p className="discret">
              Méthodes : {imp.extraction.map((m) => `${LIBELLES_METHODE[m.methode]} (p. ${m.pages.join(', ')})`).join(' ; ') || '—'}
            </p>
            {imp.avertissements.length > 0 && (
              <details><summary>{imp.avertissements.length} remarque(s) d'extraction</summary><ul>{imp.avertissements.map((a, i) => <li key={i}>{a}</li>)}</ul></details>
            )}
            {imp.statut === 'brouillon' && (
              <div className="ligne">
                <label>Valable du <input type="date" value={imp.validiteDebut} onChange={(e) => { setImp({ ...imp, validiteDebut: e.target.value }); setEnregistre(false); }} /></label>
                <label>au <input type="date" value={imp.validiteFin} onChange={(e) => { setImp({ ...imp, validiteFin: e.target.value }); setEnregistre(false); }} /></label>
              </div>
            )}
          </section>

          {imp.statut === 'brouillon' && b && (
            <>
              {quinzaines.length > 0 && (
                <div className="alerte alerte-attention" data-testid="quinzaines">
                  <strong>{quinzaines.length} séance(s) en quinzaine (Q1/Q2).</strong> Indiquez une fois pour toutes la correspondance avec les semaines A/B :
                  <div className="ligne">
                    <button type="button" className="bouton" onClick={() => appliquerQuinzaines('A')}>Q1 = semaine A, Q2 = semaine B</button>
                    <button type="button" className="bouton" onClick={() => appliquerQuinzaines('B')}>Q1 = semaine B, Q2 = semaine A</button>
                  </div>
                </div>
              )}
              {groupesManquants.length > 0 && (
                <div className="alerte alerte-attention" data-testid="groupes-manquants">
                  <strong>Groupes inconnus de l'application :</strong> {groupesManquants.join(', ')}. Tant qu'ils n'existent pas et que les élèves n'y sont pas associés, aucun élève ne verra ces cours.
                  <div className="ligne"><button type="button" className="bouton" onClick={creerGroupesManquants}>Créer ces {groupesManquants.length} groupe(s)</button></div>
                </div>
              )}
              <div className="bilan" data-testid="bilan">
                <span className={b.erreurs ? 'compte erreur' : 'compte ok'}>{b.erreurs} erreur(s)</span>
                <span className={b.incertains ? 'compte incertain' : 'compte ok'}>{b.incertains} champ(s) incertain(s)</span>
                <span className={b.chevauchements ? 'compte chevauchement' : 'compte ok'}>{b.chevauchements / 2} chevauchement(s)</span>
                <span className="compte manquant">{b.manquants} information(s) absente(s) du document</span>
                <span className="compte">{imp.seances.length} séance(s)</span>
              </div>
              <div className={`verification ${compare ? 'avec-original' : ''}`}>
                {compare && (
                  <aside className="original">
                    <div className="barre-outils">
                      <strong>Document original</strong>
                      {imp.nbPages > 1 && Array.from({ length: imp.nbPages }, (_, i) => (
                        <button key={i} className={`bouton petit ${page === i + 1 ? 'actif' : ''}`} onClick={() => setPage(i + 1)}>p. {i + 1}</button>
                      ))}
                    </div>
                    {page && apercus[page - 1] ? <a href={apercus[page - 1]} target="_blank" rel="noreferrer"><img src={apercus[page - 1]} alt={`Page ${page} du document original`} /></a> : <p className="discret">Aperçu indisponible.</p>}
                  </aside>
                )}
                <TableauVerification seances={imp.seances} problemes={problemes} cibles={[...new Set([...imp.ciblesParDefaut, ...ciblesProposees])]}
                  pageAffichee={page} surChangement={changerSeances} surVoirPage={(p) => { setPage(p); setCompare(true); }} />
              </div>
              <div className="actions-collantes">
                <label className="case"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Comparer avec l'original</label>
                {depot.analyseMultimodale && doc && <button className="bouton" onClick={analyseMultimodale} disabled={!!progression}>Analyse multimodale (page {page})</button>}
                <button className="bouton" disabled={enregistre} onClick={() => sauvegarder(imp).catch((e) => setErreur(messageErreur(e)))}>{enregistre ? 'Brouillon enregistré' : 'Enregistrer le brouillon'}</button>
                <label className="case"><input type="checkbox" checked={relu} onChange={(e) => setRelu(e.target.checked)} data-testid="case-relu" /> J'ai comparé chaque séance avec le document original</label>
                <button className="bouton principal" disabled={!b.validable || !relu} onClick={validerImport}>Valider la vérification</button>
              </div>
              {progression && <Progression {...progression} />}
            </>
          )}

          {imp.statut === 'verifie' && <Publication imp={imp} surPublie={(i) => { setImp(i); setInfo(null); }} surModifier={() => changerSeances(imp.seances)} />}
          {imp.statut === 'publie' && (
            <div className="alerte alerte-ok" role="status">
              ✔ Emploi du temps publié le {new Date(imp.publieeLe!).toLocaleString('fr-FR')}. Il est désormais utilisé pour l'affichage après scan.
              <div><Link to="/edt/versions">Voir les versions publiées</Link> · <Link to={`/edt/copier/${imp.id}`}>Modifier cet emploi du temps</Link> · <a href="/edt/import">Importer un autre document</a></div>
            </div>
          )}
          {(imp.statut === 'archive' || imp.statut === 'rejete') && <p className="alerte alerte-info">Cet import est {LIBELLES_STATUT[imp.statut].toLowerCase()}.</p>}
        </>
      )}

      {!id && imports && imports.filter((i) => i.statut === 'brouillon' || i.statut === 'verifie').length > 0 && (
        <section className="carte">
          <h2>Imports en attente de vérification</h2>
          <ul className="liste">
            {imports.filter((i) => i.statut === 'brouillon' || i.statut === 'verifie').map((i) => (
              <li key={i.id}><Link to={`/edt/import/${i.id}`}>{i.fichierNom}</Link> · {LIBELLES_STATUT[i.statut]} · {new Date(i.importeLe).toLocaleDateString('fr-FR')}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Publication({ imp, surPublie, surModifier }: { imp: Import; surPublie: (i: Import) => void; surModifier: () => void }) {
  const { depot, utilisateur, maintenant } = useApp();
  const { donnee: versions } = useDonnee(() => depot.listerVersions(), [depot]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  if (!versions) return <p>Chargement…</p>;
  const actions = actionsSurAnciennes(imp, versions);
  const publier = async () => {
    if (!utilisateur) return;
    setEnvoi(true); setErreur(null);
    try {
      const p = preparerPublication(imp, versions, utilisateur.uid, maintenant().toISOString());
      await depot.publier(p.version, p.actions, p.importPublie);
      surPublie(p.importPublie);
    } catch (e) { setErreur(messageErreur(e)); } finally { setEnvoi(false); }
  };
  return (
    <section className="carte">
      <p className="alerte alerte-ok">✔ Vérification validée{imp.valideeLe && ` le ${new Date(imp.valideeLe).toLocaleString('fr-FR')}`}.</p>
      <ul>
        <li>Classes et groupes : {ciblesImport(imp).map(libelleCible).join(', ')}</li>
        <li>Période de validité : du {imp.validiteDebut} au {imp.validiteFin}</li>
        <li>{imp.seances.length} séance(s) · version {imp.version}</li>
      </ul>
      {actions.length > 0 ? (
        <div className="alerte alerte-attention">
          <strong>Effet sur les emplois du temps déjà publiés :</strong>
          <ul>{actions.map((a) => {
            const v = versions.find((x) => x.id === a.id)!;
            return <li key={a.id}>Version {v.version} ({v.cibles.map(libelleCible).join(', ')}) : {a.action === 'archiver' ? 'sera archivée' : a.action === 'raccourcir' ? `restera valable jusqu'au ${a.nouvelleFin}` : a.raison}</li>;
          })}</ul>
        </div>
      ) : <p className="discret">Aucun emploi du temps publié n'est remplacé.</p>}
      {erreur && <p className="alerte alerte-erreur">{erreur}</p>}
      <div className="ligne">
        <button className="bouton" onClick={surModifier}>Revenir à la vérification</button>
        <button className="bouton principal" onClick={publier} disabled={envoi}>{envoi ? 'Publication…' : 'Publier cet emploi du temps'}</button>
      </div>
    </section>
  );
}

function Progression({ message, part }: { message: string; part: number }) {
  return (
    <div className="progression" role="status">
      <div className="barre"><div style={{ width: `${Math.round(part * 100)}%` }} /></div>
      <span>{message}</span>
    </div>
  );
}

async function rendreApercus(d: DocumentCharge): Promise<string[]> {
  const r: string[] = [];
  for (let n = 1; n <= Math.min(d.nbPages, 30); n++) {
    const c = await d.rendre(n, d.type === 'pdf' ? 1.5 : 1);
    r.push(c.toDataURL('image/jpeg', 0.85));
  }
  return r;
}

const LIBELLES_STATUT: Record<Import['statut'], string> = {
  brouillon: 'Brouillon (non vérifié)', verifie: 'Vérifié, non publié', publie: 'Publié', archive: 'Archivé', rejete: 'Rejeté',
};
const LIBELLES_METHODE = { texte_pdf: 'texte du PDF', ocr: 'OCR', vision: 'analyse multimodale', manuel: 'saisie manuelle' } as const;
