import type { ChampSeance, Jour, Semaine } from '../domain/types';
import { normaliserClasse } from '../domain/classes';

/** Abréviations courantes des emplois du temps des lycées français. Clé en majuscules sans accents. */
export const ABREVIATIONS: Record<string, string> = {
  MATHS: 'Mathématiques', MATH: 'Mathématiques', MATHEMATIQUES: 'Mathématiques', MATHS_EXPERTES: 'Mathématiques expertes',
  'MATHS EXPERTES': 'Mathématiques expertes', 'MATHS COMP': 'Mathématiques complémentaires',
  FRANCAIS: 'Français', FRA: 'Français', FR: 'Français',
  ANGLAIS: 'Anglais', ANG: 'Anglais', ANGL: 'Anglais', 'LV1 ANG': 'Anglais LV1',
  ESPAGNOL: 'Espagnol', ESP: 'Espagnol', ALLEMAND: 'Allemand', ALL: 'Allemand',
  ARABE: 'Arabe', ARA: 'Arabe', ITALIEN: 'Italien', ITA: 'Italien',
  'HIST-GEO': 'Histoire-Géographie', 'HIST GEO': 'Histoire-Géographie', HG: 'Histoire-Géographie', 'H-G': 'Histoire-Géographie',
  'HISTOIRE-GEOGRAPHIE': 'Histoire-Géographie', 'HISTOIRE GEOGRAPHIE': 'Histoire-Géographie',
  EMC: 'Enseignement moral et civique',
  SVT: 'Sciences de la vie et de la Terre', PC: 'Physique-Chimie', 'PHYSIQUE-CHIMIE': 'Physique-Chimie', 'PHY-CHI': 'Physique-Chimie',
  SES: 'Sciences économiques et sociales', NSI: 'Numérique et sciences informatiques',
  SNT: 'Sciences numériques et technologie', EPS: 'Éducation physique et sportive',
  HGGSP: 'Histoire-géographie, géopolitique et sciences politiques',
  HLP: 'Humanités, littérature et philosophie', LLCER: 'Langues, littératures et cultures étrangères et régionales',
  LLCE: 'Langues, littératures et cultures étrangères', AMC: 'Anglais monde contemporain',
  'ENS SCI': 'Enseignement scientifique', 'ENS. SCI': 'Enseignement scientifique', 'ENS SCIENT': 'Enseignement scientifique',
  'ENSEIGNEMENT SCIENTIFIQUE': 'Enseignement scientifique', ES: 'Enseignement scientifique',
  PHILO: 'Philosophie', PHILOSOPHIE: 'Philosophie', AP: 'Accompagnement personnalisé',
  'VIE DE CLASSE': 'Vie de classe', VDC: 'Vie de classe', DS: 'Devoir surveillé',
  'ARTS PLA': 'Arts plastiques', 'ARTS PLASTIQUES': 'Arts plastiques', MUSIQUE: 'Musique', 'ED MUS': 'Éducation musicale',
  LATIN: 'Latin', LCA: 'Langues et cultures de l’Antiquité', DGEMC: 'Droit et grands enjeux du monde contemporain',
  SI: "Sciences de l'ingénieur", 'SC NUM': 'Sciences numériques et technologie', ORIENTATION: 'Orientation',
};

const SANS_ACCENT = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const cleAbrev = (t: string) => SANS_ACCENT(t).toUpperCase().replace(/[.:;,]+$/g, '').replace(/\s+/g, ' ').trim();

export const RE_PLAGE = /(\d{1,2})\s*[hH:]\s*(\d{2})?\s*(?:-|–|—|à|a)\s*(\d{1,2})\s*[hH:]\s*(\d{2})?/;
export const RE_HEURE = /^(\d{1,2})\s*[hH:]\s*(\d{2})?$/;

export function normaliserHeure(h: string, m?: string): string | null {
  const hh = Number(h), mm = Number(m ?? '0');
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function lirePlage(texte: string): { debut: string; fin: string } | null {
  const m = RE_PLAGE.exec(texte);
  if (!m) return null;
  const debut = normaliserHeure(m[1], m[2]), fin = normaliserHeure(m[3], m[4]);
  return debut && fin ? { debut, fin } : null;
}

const JOURS_RE: [RegExp, Jour][] = [
  [/^lun(di|\.)?$/i, 'lundi'], [/^mar(di|\.)?$/i, 'mardi'], [/^mer(credi|\.)?$/i, 'mercredi'],
  [/^jeu(di|\.)?$/i, 'jeudi'], [/^ven(dredi|\.)?$/i, 'vendredi'], [/^sam(edi|\.)?$/i, 'samedi'],
];

export function lireJour(texte: string): Jour | null {
  const t = SANS_ACCENT(texte).trim().replace(/[^a-zA-Z.]/g, '');
  for (const [re, j] of JOURS_RE) if (re.test(t)) return j;
  return null;
}

/** Repère un nom de classe : "1re B", "1ère B", "Première B", "2nde 3", "Terminale A", "Tle G1". */
export function lireClasse(texte: string): string | null {
  const t = SANS_ACCENT(texte);
  const m = /\b(6e|6eme|5e|5eme|4e|4eme|3e|3eme|2nde|2de|seconde|1re|1ere|premiere|terminale|tle|term)\.?\s*([A-Z]\d?|\d{1,2})\b/i.exec(t);
  if (m) return normaliserClasse(`${m[1]} ${m[2]}`);
  // Forme courte des exports EDT en début de ligne : « 1 A - Année Complète », « 2 C », « T B ».
  const c = /^\s*([1-6]|T)\s?([A-Z])(?=\s*[-–(]|\s*$)/.exec(texte);
  return c ? normaliserClasse(`${c[1]} ${c[2]}`) : null;
}

export interface Ligne { texte: string; conf: number }

export interface ContenuCellule {
  matiere: string;
  enseignant: string;
  salle: string;
  semaine: Semaine;
  plage: { debut: string; fin: string } | null;
  groupe: string | null;
  /** Code de groupe écrit entre crochets (exports EDT), ex. « 1HGGSP1 ». */
  codeGroupe: string | null;
  classe: string | null;
  incertitudes: ChampSeance[];
  texteSource: string;
}

const RE_SEMAINE = [
  /\b(?:sem(?:aine)?\.?|sem\.)\s*([AB])\b/i,
  /[([]\s*(?:sem\.?\s*)?([AB])\s*[)\]]/,
  /\bS\.?([AB])\b/,
];
const RE_QUINZAINE = /\b(?:qz|quinz(?:aine)?|q)\.?\s*([12])\b/i;
const RE_ENSEIGNANT = /\b(M\.|Mr\.?|MR\.?|Mme\.?|MME\.?|Mlle\.?|MLLE\.?|M)\s+([A-ZÀ-Ü][A-Za-zÀ-ÿ'’-]+(?:\s+[A-ZÀ-Ü][A-Za-zÀ-ÿ'’-]+)?(?:\s+[A-Z]\.)?)/;
const RE_SALLE = [
  /\b(?:salle|sal\.?|s\.)\s*([A-Z]?\s?\d{1,3}[A-Z]?)\b/i,
  /\b([A-H]\d{2,3})\b/,
  /\b(CDI|Gymnase|Gym|Amphi(?:th[ée]âtre)?|Labo(?:ratoire)?\s*\w*|Salle\s+info\w*|Plateau\s+EPS|Terrain|Piscine)\b/i,
];
/** Lignes entières désignant une salle : « 001 », « 003-Lab SVT », « Salle de Réunion », « Gymnase ». */
const RE_SALLE_LIGNE = [
  /^\d{2,4}[A-Za-z]?$/,
  /^\d{1,4}\s*-\s*\S.{0,30}$/,
  /^(?:salle|sal\.|s\.)\s+\S.{0,30}$/i,
  /^(?:cdi|gymnase|gym|amphi\S*|labo?\b.{0,20}|plateau\b.{0,20}|terrain\b.{0,20}|piscine)$/i,
];
/** Ligne entière « NOM I. » ou « NOM COMPOSÉ I. » (format des exports EDT). */
const RE_ENSEIGNANT_LIGNE = /^(?:[A-ZÀ-Ü][A-Za-zÀ-ÿ'’-]+\s+)+[A-Z]\.(?:\s*-?\s*[A-Z]\.)?$/;
const RE_CODE_GROUPE = /\[([^\]]{1,40})\]/;
const RE_GROUPE = /\b(gr(?:oupe|p)?\.?\s*\d+|G\d\b|demi[- ]groupe\s*\d?|1\/2\s*gr\w*|sp[ée](?:cialit[ée])?\.?\s+[A-Z]\w*|LV[123]\s*[A-Z]*\w*|option\s+\w+)/i;

/**
 * Analyse le texte d'une case d'emploi du temps. Seules les informations
 * effectivement présentes sont retenues : un champ absent reste vide.
 */
export function analyserCellule(lignes: Ligne[], seuilConfiance = 70): ContenuCellule {
  const incertitudes = new Set<ChampSeance>();
  const brut = lignes.map((l) => l.texte.trim()).filter(Boolean);
  const texteSource = brut.join(' / ');
  let reste = brut.map((t) => ' ' + t + ' ');

  const consommer = (re: RegExp): RegExpExecArray | null => {
    for (let i = 0; i < reste.length; i++) {
      const m = re.exec(reste[i]);
      if (m) { reste[i] = reste[i].replace(m[0], ' '); return m; }
    }
    return null;
  };
  const confDe = (fragment: string) => {
    const l = lignes.find((x) => x.texte.includes(fragment.trim()));
    return l ? l.conf : 100;
  };

  const mPlage = consommer(new RegExp(RE_PLAGE.source));
  const plage = mPlage ? lirePlage(mPlage[0]) : null;
  if (mPlage && confDe(mPlage[0]) < seuilConfiance) { incertitudes.add('debut'); incertitudes.add('fin'); }

  let semaine: Semaine = 'toutes';
  for (const re of RE_SEMAINE) {
    const m = consommer(re);
    if (m) { semaine = m[1].toUpperCase() as 'A' | 'B'; if (confDe(m[0]) < seuilConfiance) incertitudes.add('semaine'); break; }
  }
  if (semaine === 'toutes') {
    const q = consommer(RE_QUINZAINE);
    // Quinzaine 1/2 : correspondance avec A/B à confirmer par l'utilisateur.
    if (q) { semaine = q[1] === '1' ? 'A' : 'B'; incertitudes.add('semaine'); }
  }

  const codes: string[] = [];
  for (let m = consommer(RE_CODE_GROUPE); m; m = consommer(RE_CODE_GROUPE)) codes.push(m[1].replace(/\s+/g, ' ').trim());

  // Lignes entières : salle et enseignant (la première ligne reste réservée à la matière).
  let salle = '';
  let enseignant = '';
  for (let i = 0; i < reste.length; i++) {
    const t = reste[i].trim();
    if (!t || (i === 0 && reste.length > 1)) continue;
    if (!salle && RE_SALLE_LIGNE.some((re) => re.test(t))) {
      salle = t;
      if (confDe(t) < seuilConfiance) incertitudes.add('salle');
      reste[i] = ' ';
    } else if (!enseignant && RE_ENSEIGNANT_LIGNE.test(t) && !ABREVIATIONS[cleAbrev(t)]) {
      enseignant = t;
      if (confDe(t) < seuilConfiance) incertitudes.add('enseignant');
      reste[i] = ' ';
    }
  }

  // Salle écrite dans une ligne mêlée à d'autres informations.
  for (let k = 0; k < RE_SALLE.length && !salle; k++) {
    const m = consommer(RE_SALLE[k]);
    if (m) {
      salle = k === 0 ? `Salle ${m[1].replace(/\s/g, '')}` : m[1].replace(/\s+/g, ' ');
      if (k === 1 || confDe(m[0]) < seuilConfiance) incertitudes.add('salle');
    }
  }

  const mEns = enseignant ? null : consommer(RE_ENSEIGNANT);
  if (mEns) {
    const civ = mEns[1].replace(/\.$/, '').toLowerCase();
    const civilite = civ.startsWith('mme') ? 'Mme' : civ.startsWith('mlle') ? 'Mlle' : 'M.';
    enseignant = `${civilite} ${mEns[2].trim()}`;
    if (confDe(mEns[0]) < seuilConfiance || mEns[1] === 'M') incertitudes.add('enseignant');
  }

  const indices: string[] = [...codes];
  for (let mGr = consommer(RE_GROUPE); mGr; mGr = consommer(RE_GROUPE)) indices.push(mGr[1].replace(/\s+/g, ' ').trim());
  const groupe = indices.length ? indices.join(' · ') : null;
  const codeGroupe = codes[0] ?? null;

  let classe: string | null = null;
  for (const t of reste) { classe = lireClasse(t); if (classe) break; }

  // La matière : première ligne restante significative.
  const restants = reste.map((t) => t.replace(/[|/·•]+/g, ' ').replace(/\s+/g, ' ').trim()).filter((t) => t.length >= 2);
  let matiere = '';
  let matiereBrute = '';
  for (const t of restants) {
    if (classe && lireClasse(t) === classe && t.length <= 8) continue;
    matiereBrute = t;
    break;
  }
  if (matiereBrute) {
    const cle = cleAbrev(matiereBrute);
    if (ABREVIATIONS[cle]) {
      matiere = ABREVIATIONS[cle];
    } else {
      matiere = matiereBrute;
      // Abréviation inconnue (courte, en majuscules) : à confirmer, jamais devinée.
      if (/^[A-Z0-9.\- ]{2,6}$/.test(matiereBrute)) incertitudes.add('matiere');
    }
    if (confDe(matiereBrute) < seuilConfiance) incertitudes.add('matiere');
  }

  // Ligne en majuscules restante non reconnue : probablement un enseignant sans civilité.
  if (!enseignant) {
    const candidat = restants.find((t) => t !== matiereBrute && /^[A-ZÀ-Ü][A-ZÀ-Ü'’-]{2,}(?:\s+[A-Z]\.?)?$/.test(t) && !ABREVIATIONS[cleAbrev(t)]);
    if (candidat) { enseignant = candidat; incertitudes.add('enseignant'); }
  }

  // Un code de groupe explicite identifie la cible ; une simple mention (« Gr 1 », « LV2 ») est à confirmer.
  // Un code lu par OCR (confiance < 100) peut contenir une confusion (« 1 » lu « I ») : à confirmer.
  if (groupe && (codes.length !== 1 || indices.length > 1 || confDe(codes[0]) < 100)) incertitudes.add('cible');
  return { matiere, enseignant, salle, semaine, plage, groupe, codeGroupe, classe, incertitudes: [...incertitudes], texteSource };
}
