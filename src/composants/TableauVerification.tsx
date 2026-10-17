import { cloneElement, useMemo, useState } from 'react';
import type { ChampSeance, Seance } from '../domain/types';
import { JOURS } from '../domain/types';
import { libelleCible } from '../domain/emploiDuTemps';
import { confirmerChamp, modifierChamp, type Probleme } from '../domain/verification';
import { nouvelId } from '../extraction/analyseTableau';

interface Props {
  seances: Seance[];
  problemes: Probleme[];
  cibles: string[];               // classes et groupes proposés
  pageAffichee: number | null;
  surChangement: (s: Seance[]) => void;
  surVoirPage: (page: number) => void;
}

const NOMS_CHAMPS: Record<ChampSeance, string> = {
  jour: 'Jour', debut: 'Début', fin: 'Fin', matiere: 'Matière', enseignant: 'Enseignant', salle: 'Salle', semaine: 'Semaine', cible: 'Classe / groupe',
};
const JOURS_LIBELLES: Record<string, string> = { lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi', jeudi: 'Jeudi', vendredi: 'Vendredi', samedi: 'Samedi' };

export function TableauVerification({ seances, problemes, cibles, surChangement, surVoirPage, pageAffichee }: Props) {
  const [seulementAVerifier, setSeulementAVerifier] = useState(false);
  const parSeance = useMemo(() => {
    const m = new Map<string, Probleme[]>();
    for (const p of problemes) m.set(p.seanceId, [...(m.get(p.seanceId) ?? []), p]);
    return m;
  }, [problemes]);

  const maj = (id: string, f: (s: Seance) => Seance) => surChangement(seances.map((s) => (s.id === id ? f(s) : s)));
  const supprimer = (id: string) => surChangement(seances.filter((s) => s.id !== id));
  const ajouter = () => surChangement([...seances, {
    id: nouvelId(), cible: cibles.length === 1 ? cibles[0] : '', jour: 'lundi', debut: '', fin: '', matiere: '',
    enseignant: '', salle: '', semaine: 'toutes', incertitudes: [], texteSource: 'Ajout manuel', page: pageAffichee ?? undefined,
  }]);

  const ordre = [...seances].sort((a, b) =>
    a.cible.localeCompare(b.cible) || JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour) || a.debut.localeCompare(b.debut));
  const visibles = seulementAVerifier ? ordre.filter((s) => (parSeance.get(s.id) ?? []).some((p) => p.niveau !== 'manquant')) : ordre;
  const optionsCibles = [...new Set([...cibles, ...seances.map((s) => s.cible).filter(Boolean)])].sort();

  return (
    <div className="tableau-verif">
      <div className="barre-outils">
        <label className="case"><input type="checkbox" checked={seulementAVerifier} onChange={(e) => setSeulementAVerifier(e.target.checked)} /> Seulement les séances à vérifier</label>
        <button type="button" className="bouton" onClick={ajouter}>+ Ajouter une séance manquante</button>
      </div>
      {visibles.length === 0 && <p className="discret">Aucune séance à afficher.</p>}
      {visibles.map((s) => {
        const ps = parSeance.get(s.id) ?? [];
        const niveau = (c: ChampSeance) => {
          const n = ps.filter((p) => p.champ === c).map((p) => p.niveau);
          return n.includes('erreur') ? 'champ-erreur' : n.includes('incertain') ? 'champ-incertain' : n.includes('manquant') ? 'champ-manquant' : '';
        };
        const chevauche = ps.some((p) => p.niveau === 'chevauchement');
        const inc = s.incertitudes ?? [];
        const champ = (c: ChampSeance, contenu: JSX.Element) => (
          <div className={`champ ${niveau(c)}`}>
            <span>{NOMS_CHAMPS[c]}
              {inc.includes(c) && <button type="button" className="confirmer" aria-label={`Confirmer : ${NOMS_CHAMPS[c]}`} onClick={() => maj(s.id, (x) => confirmerChamp(x, c))}>✓ confirmer</button>}
            </span>
            {cloneElement(contenu, { 'aria-label': NOMS_CHAMPS[c] })}
          </div>
        );
        return (
          <article key={s.id} className={`ligne-seance ${chevauche ? 'chevauchement' : ''} ${ps.some((p) => p.niveau === 'erreur') ? 'en-erreur' : ''}`} data-testid="ligne-seance">
            <div className="ligne-champs">
              {champ('cible', (
                <select value={s.cible} onChange={(e) => maj(s.id, (x) => modifierChamp(x, 'cible', e.target.value))}>
                  <option value="">— à associer —</option>
                  {optionsCibles.map((c) => <option key={c} value={c}>{libelleCible(c)}</option>)}
                </select>
              ))}
              {champ('jour', (
                <select value={s.jour} onChange={(e) => maj(s.id, (x) => modifierChamp(x, 'jour', e.target.value as Seance['jour']))}>
                  {JOURS.map((j) => <option key={j} value={j}>{JOURS_LIBELLES[j]}</option>)}
                </select>
              ))}
              {champ('debut', <input type="time" value={s.debut} onChange={(e) => maj(s.id, (x) => modifierChamp(x, 'debut', e.target.value))} />)}
              {champ('fin', <input type="time" value={s.fin} onChange={(e) => maj(s.id, (x) => modifierChamp(x, 'fin', e.target.value))} />)}
              {champ('matiere', <input value={s.matiere} onChange={(e) => maj(s.id, (x) => modifierChamp(x, 'matiere', e.target.value))} />)}
              {champ('enseignant', <input value={s.enseignant} placeholder="non indiqué" onChange={(e) => maj(s.id, (x) => modifierChamp(x, 'enseignant', e.target.value))} />)}
              {champ('salle', <input value={s.salle} placeholder="non indiquée" onChange={(e) => maj(s.id, (x) => modifierChamp(x, 'salle', e.target.value))} />)}
              {champ('semaine', (
                <select value={s.semaine} onChange={(e) => maj(s.id, (x) => modifierChamp(x, 'semaine', e.target.value as Seance['semaine']))}>
                  <option value="toutes">Toutes</option><option value="A">Semaine A</option><option value="B">Semaine B</option>
                </select>
              ))}
            </div>
            <div className="ligne-pied">
              <span className="source">
                {s.page && <button type="button" className="lien" onClick={() => surVoirPage(s.page!)}>Page {s.page}</button>}
                {s.texteSource && <> · Lu : « {s.texteSource} »</>}
                {s.indiceGroupe && <strong> · Groupe repéré : {s.indiceGroupe}</strong>}
                {s.confiance !== undefined && s.confiance < 0.8 && <> · confiance OCR {Math.round(s.confiance * 100)} %</>}
              </span>
              <details className="validite">
                <summary>Validité</summary>
                <label>Du <input type="date" value={s.validiteDebut ?? ''} onChange={(e) => maj(s.id, (x) => ({ ...x, validiteDebut: e.target.value || undefined }))} /></label>
                <label>au <input type="date" value={s.validiteFin ?? ''} onChange={(e) => maj(s.id, (x) => ({ ...x, validiteFin: e.target.value || undefined }))} /></label>
              </details>
              {inc.length > 0 && <button type="button" className="bouton petit" onClick={() => maj(s.id, (x) => ({ ...x, incertitudes: [] }))}>Tout confirmer (relu)</button>}
              <button type="button" className="bouton petit danger" onClick={() => supprimer(s.id)}>Supprimer</button>
            </div>
            {ps.filter((p) => p.niveau !== 'incertain').map((p, i) => <p key={i} className={`probleme ${p.niveau}`}>{p.message}</p>)}
          </article>
        );
      })}
    </div>
  );
}
