// Icônes de l'application installée (écran d'accueil du téléphone).
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
function icone(taille, marge, nom) {
  const c = createCanvas(taille, taille);
  const x = c.getContext('2d');
  x.fillStyle = '#0f3d6e';
  if (marge) x.fillRect(0, 0, taille, taille);
  else { x.beginPath(); x.roundRect(0, 0, taille, taille, taille * 0.22); x.fill(); }
  x.fillStyle = '#fff';
  x.font = `bold ${Math.round(taille * (marge ? 0.3 : 0.4))}px sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('VH', taille / 2, taille / 2 + taille * 0.02);
  writeFileSync(path.join(pub, nom), c.toBuffer('image/png'));
}
icone(192, false, 'icone-192.png');
icone(512, false, 'icone-512.png');
icone(512, true, 'icone-maskable-512.png');
icone(180, true, 'apple-touch-icon.png');
console.log('Icônes générées');
