// Forme unique des noms de classe : « 1 A », « 1A », « 1ère A », « Première A » → « 1re A ».
// Indispensable pour relier élèves (listes Pronote) et emplois du temps (exports EDT).

const NIVEAUX: [RegExp, string][] = [
  [/^(premi[eè]re|1\s*(?:re|ère|ere|er)?)$/i, '1re'],
  [/^(seconde|2\s*(?:nde|de|nd)?)$/i, '2nde'],
  [/^(terminale|term|tle|t)$/i, 'Tle'],
  [/^([3-6])\s*(?:e|ème|eme)?$/i, '$1e'],
];

/** Normalise un nom de classe. Un libellé non reconnu est conservé tel quel (espaces réduits). */
export function normaliserClasse(brut: string): string {
  const t = brut.normalize('NFC').trim().replace(/\s+/g, ' ');
  const m = /^(premi[eè]re|seconde|terminale|term|tle|t|[1-6]\s*(?:re|ère|ere|er|nde|de|nd|e|ème|eme)?)\s*[-.]?\s*([A-Za-z]\d?|\d{1,2})$/i.exec(t);
  if (!m) return t;
  for (const [re, n] of NIVEAUX) {
    if (re.test(m[1].trim())) return `${m[1].trim().replace(re, n)} ${m[2].toUpperCase()}`;
  }
  return t;
}

/** Niveau d'une classe normalisée : « 1re », « 2nde », « Tle », « 6e »… */
export function niveauClasse(classe: string): string {
  return normaliserClasse(classe).split(' ')[0];
}

/** Identifiant de groupe stable à partir d'un code EDT : « 1.ALL LVB » → « 1-ALL-LVB ». */
export function idGroupe(code: string): string {
  return code.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
