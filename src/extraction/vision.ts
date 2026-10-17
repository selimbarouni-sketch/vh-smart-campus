import type { ChampSeance, Jour, Seance } from '../domain/types';
import { JOURS } from '../domain/types';
import { heureValide } from '../domain/temps';
import { ABREVIATIONS, lireClasse, normaliserHeure } from './cellule';
import { nouvelId } from './analyseTableau';

interface SeanceVision {
  classe_ou_groupe: string; jour: string; debut: string; fin: string; matiere: string; enseignant: string;
  salle: string; semaine: string; groupe: string; champs_incertains: string[]; texte_case: string;
}

export interface ReponseVision { titre_classe: string; seances: SeanceVision[]; remarques: string[] }

const CHAMPS: ChampSeance[] = ['jour', 'debut', 'fin', 'matiere', 'enseignant', 'salle', 'semaine', 'cible'];

function heure(h: unknown): string {
  if (typeof h !== 'string') return '';
  const m = /^(\d{1,2})\s*[:hH]\s*(\d{2})?$/.exec(h.trim());
  const n = m ? normaliserHeure(m[1], m[2]) : null;
  return n && heureValide(n) ? n : '';
}

/**
 * Convertit la réponse du modèle multimodal en séances de brouillon.
 * Tout ce qui n'est pas conforme est vidé et marqué incertain : rien n'est complété par défaut.
 * Toutes les séances issues de cette méthode restent soumises à la vérification manuelle.
 */
export function seancesDepuisVision(brut: unknown, page: number, ciblesParDefaut: string[]): { seances: Seance[]; avertissements: string[] } {
  const r = brut as Partial<ReponseVision> | null;
  if (!r || !Array.isArray(r.seances)) return { seances: [], avertissements: [`Page ${page} : réponse de l'analyse multimodale illisible.`] };
  const classeTitre = lireClasse(r.titre_classe ?? '');
  const seances: Seance[] = r.seances.map((s) => {
    const inc = new Set<ChampSeance>((s.champs_incertains ?? []).filter((c): c is ChampSeance => CHAMPS.includes(c as ChampSeance)));
    const jour = JOURS.includes(s.jour as Jour) ? (s.jour as Jour) : (inc.add('jour'), 'lundi' as Jour);
    const debut = heure(s.debut), fin = heure(s.fin);
    if (!debut) inc.add('debut');
    if (!fin) inc.add('fin');
    const matiereBrute = (s.matiere ?? '').trim();
    const cle = matiereBrute.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const matiere = ABREVIATIONS[cle] ?? matiereBrute;
    if (!matiere) inc.add('matiere');
    const classeCase = lireClasse(s.classe_ou_groupe ?? '');
    const classe = classeCase ?? classeTitre;
    let cible = classe ? `classe:${classe}` : ciblesParDefaut.length === 1 ? ciblesParDefaut[0] : '';
    if (!cible) inc.add('cible');
    if (s.groupe?.trim()) inc.add('cible');
    if (!classeCase && s.classe_ou_groupe?.trim() && !classe) { inc.add('cible'); cible = ''; }
    // L'analyse multimodale reste une lecture automatique : jour et horaires sont toujours à confirmer.
    inc.add('jour'); inc.add('debut'); inc.add('fin');
    return {
      id: nouvelId(), cible, jour, debut, fin, matiere,
      enseignant: (s.enseignant ?? '').trim(), salle: (s.salle ?? '').trim(),
      semaine: s.semaine === 'A' || s.semaine === 'B' ? s.semaine : 'toutes',
      incertitudes: [...inc], texteSource: s.texte_case ?? '', indiceGroupe: s.groupe?.trim() || undefined, page, confiance: undefined,
    };
  });
  return { seances, avertissements: (r.remarques ?? []).map((x) => `Page ${page} (analyse multimodale) : ${x}`) };
}
