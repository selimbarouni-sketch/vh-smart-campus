// Couleur des cartes : une famille de teinte par niveau, une nuance distincte par classe du niveau.
// Le nom de la classe est toujours écrit en grand sur la carte : la couleur n'est jamais le seul repère
// (impression en noir et blanc, daltonisme).
import { normaliserClasse } from './classes';

const TEINTES_NIVEAU: Record<string, number> = {
  '6e': 45, '5e': 175, '4e': 25, '3e': 285, '2nde': 140, '1re': 215, 'Tle': 350,
};
const NOMS_NIVEAU: Record<string, string> = {
  '6e': 'Sixième', '5e': 'Cinquième', '4e': 'Quatrième', '3e': 'Troisième', '2nde': 'Seconde', '1re': 'Première', 'Tle': 'Terminale',
};

/** Rang de la classe dans son niveau : A/1 → 0, B/2 → 1… */
function rangClasse(suffixe: string): number {
  const s = suffixe.toUpperCase();
  if (/^\d+$/.test(s)) return Number(s) - 1;
  return Math.max(0, s.charCodeAt(0) - 65) + (s.length > 1 ? Number(s.slice(1)) || 0 : 0);
}

export interface CouleurClasse {
  fond: string;       // bandeau de la carte
  texte: string;      // texte sur le bandeau
  clair: string;      // fond léger (QR, cadre)
  niveau: string;     // « Première »
}

export function couleurClasse(classe: string): CouleurClasse {
  const c = normaliserClasse(classe);
  const [niveau, suffixe = ''] = c.split(' ');
  const base = TEINTES_NIVEAU[niveau];
  if (base === undefined) {
    // Classe hors nomenclature : teinte calculée à partir du nom, gris-bleu discret.
    let h = 0;
    for (const ch of c) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return { fond: `hsl(${h} 25% 35%)`, texte: '#fff', clair: `hsl(${h} 25% 95%)`, niveau: c };
  }
  const r = rangClasse(suffixe);
  // Variation de teinte (±) et de luminosité selon la classe, en restant dans la famille du niveau.
  const decalages = [0, 14, -14, 28, -28, 7, -7, 21];
  const teinte = (base + decalages[r % decalages.length] + 360) % 360;
  const lumiere = [34, 42, 28, 38][Math.floor(r / decalages.length) % 4 === 0 ? r % 4 : (r + 1) % 4];
  return { fond: `hsl(${teinte} 62% ${lumiere}%)`, texte: '#fff', clair: `hsl(${teinte} 60% 95%)`, niveau: NOMS_NIVEAU[niveau] };
}
