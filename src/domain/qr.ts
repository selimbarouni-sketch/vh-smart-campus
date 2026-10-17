// Le QR code d'un élève ne contient qu'un jeton opaque et aléatoire (120 bits).
// Aucune donnée personnelle n'y figure : l'élève est retrouvé dans la base.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const PREFIXE_QR = 'VHSC-';
const RE_JETON = /^VHSC-[A-Z2-7]{24}$/;

export function genererJeton(aleatoire: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const octets = aleatoire(24);
  let s = '';
  for (let i = 0; i < 24; i++) s += ALPHABET[octets[i] & 31];
  return PREFIXE_QR + s;
}

/** Vérifie le format avant toute requête : un contenu quelconque est refusé immédiatement. */
export function jetonValide(contenu: string): boolean {
  return RE_JETON.test(contenu.trim());
}

export function normaliserContenuQR(contenu: string): string {
  return contenu.trim().toUpperCase();
}
