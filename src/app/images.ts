// Préparation des logos envoyés par l'administrateur : redimensionnés dans le navigateur,
// enregistrés en data URL (aucun service de stockage de fichiers nécessaire).

export const TYPES_IMAGE = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export async function imageVersDataUrl(fichier: File, tailleMax = 320): Promise<string> {
  if (!TYPES_IMAGE.includes(fichier.type)) throw new Error('Format accepté : PNG, JPEG, WebP ou SVG.');
  if (fichier.size > 5 * 1024 * 1024) throw new Error('Image trop volumineuse (5 Mo maximum).');
  const url = URL.createObjectURL(fichier);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error("Impossible de lire l'image."));
      i.src = url;
    });
    const w = img.naturalWidth || tailleMax, h = img.naturalHeight || tailleMax;
    const f = Math.min(1, tailleMax / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * f));
    c.height = Math.max(1, Math.round(h * f));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    // PNG pour conserver la transparence ; WebP si le PNG est trop lourd.
    const png = c.toDataURL('image/png');
    return png.length < 200_000 ? png : c.toDataURL('image/webp', 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}
