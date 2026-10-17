// Apparence : thème clair / sombre (préférence de chaque appareil) et couleur principale (choisie par l'administrateur).

export type PreferenceTheme = 'auto' | 'clair' | 'sombre';
const CLE = 'vhsc-theme';

export function lirePreference(): PreferenceTheme {
  try {
    const v = localStorage.getItem(CLE);
    return v === 'clair' || v === 'sombre' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function enregistrerPreference(p: PreferenceTheme) {
  try { localStorage.setItem(CLE, p); } catch { /* stockage indisponible : préférence non mémorisée */ }
}

const sombreSysteme = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

/** Applique le thème au document. En mode automatique, suit le réglage du téléphone. */
export function appliquerTheme(p: PreferenceTheme): () => void {
  const maj = () => { document.documentElement.dataset.theme = p === 'sombre' || (p === 'auto' && sombreSysteme()) ? 'sombre' : 'clair'; };
  maj();
  if (p !== 'auto' || typeof matchMedia !== 'function') return () => undefined;
  const m = matchMedia('(prefers-color-scheme: dark)');
  m.addEventListener('change', maj);
  return () => m.removeEventListener('change', maj);
}

/** « #0f3d6e » → [teinte, saturation, luminosité] */
export function hexVersTsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0x0f3d6e;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)];
}

/**
 * Couleur principale du site. L'en-tête garde la couleur choisie (assombrie si elle est trop claire
 * pour un texte blanc) ; en thème sombre, liens et bordures utilisent une variante éclaircie.
 */
export function appliquerCouleur(hex: string) {
  const [h, s, l] = hexVersTsl(hex);
  const st = document.documentElement.style;
  const entete = `hsl(${h} ${s}% ${Math.min(l, 38)}%)`;
  // Variables « primaire » seulement : la feuille de style en dérive les couleurs de chaque thème.
  st.setProperty('--primaire', entete);
  st.setProperty('--primaire-clair', `hsl(${h} ${Math.min(s, 60)}% 94%)`);
  st.setProperty('--primaire-sombre', `hsl(${h} ${Math.min(s, 70)}% 72%)`);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', entete);
}

/** Icône de l'onglet et de l'écran d'accueil : logo de l'établissement s'il est défini. */
export function appliquerIcone(logo?: string) {
  const lien = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (lien) lien.href = logo || '/icone.svg';
}
