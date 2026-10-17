// Installation de l'application sur l'écran d'accueil du téléphone.
// L'évènement « beforeinstallprompt » (Android/Chrome) est capturé dès le démarrage.

interface EvenementInstallation extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

let invite: EvenementInstallation | null = null;
const abonnes = new Set<() => void>();

export function ecouterInstallation() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    invite = e as EvenementInstallation;
    abonnes.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => { invite = null; abonnes.forEach((f) => f()); });
}

export const installationPossible = () => !!invite;
export const dejaInstallee = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const estIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export async function installer(): Promise<boolean> {
  if (!invite) return false;
  await invite.prompt();
  const { outcome } = await invite.userChoice;
  invite = null;
  abonnes.forEach((f) => f());
  return outcome === 'accepted';
}

export function surChangementInstallation(f: () => void) {
  abonnes.add(f);
  return () => { abonnes.delete(f); };
}
