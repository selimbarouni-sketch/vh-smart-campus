import QRCode from 'qrcode';

/**
 * QR code d'une carte élève, avec le logo de l'établissement au centre.
 * Le niveau de correction « H » (30 % de redondance) permet de masquer le centre sans gêner la lecture :
 * le logo n'occupe qu'environ 6 % de la surface du code.
 */
export async function qrAvecLogo(contenu: string, logo?: string, taille = 360): Promise<string> {
  const base = await QRCode.toDataURL(contenu, { width: taille, margin: 1, errorCorrectionLevel: logo ? 'H' : 'M' });
  if (!logo) return base;
  const charger = (src: string) => new Promise<HTMLImageElement>((ok, ko) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ko(new Error('Logo illisible'));
    i.src = src;
  });
  const [qr, img] = await Promise.all([charger(base), charger(logo)]);
  const c = document.createElement('canvas');
  c.width = c.height = taille;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, 0, 0, taille, taille);
  ctx.imageSmoothingEnabled = true;
  const cote = Math.round(taille * 0.24), x = (taille - cote) / 2;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect(x, x, cote, cote, cote * 0.18);
  ctx.fill();
  const marge = cote * 0.1, place = cote - 2 * marge;
  const f = Math.min(place / img.naturalWidth, place / img.naturalHeight);
  const w = img.naturalWidth * f, h = img.naturalHeight * f;
  ctx.drawImage(img, (taille - w) / 2, (taille - h) / 2, w, h);
  return c.toDataURL('image/png');
}
