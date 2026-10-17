// Copie dans public/vendor les ressources servies par l'application elle-même
// (aucun CDN externe : fonctionne sur un réseau filtré).
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = (...p) => path.join(racine, 'node_modules', ...p);
const dest = (...p) => path.join(racine, 'public', 'vendor', ...p);

mkdirSync(dest('tesseract', 'lang'), { recursive: true });
cpSync(nm('tesseract.js', 'dist', 'worker.min.js'), dest('tesseract', 'worker.min.js'));
for (const f of ['tesseract-core.wasm.js', 'tesseract-core-simd.wasm.js', 'tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js']) {
  cpSync(nm('tesseract.js-core', f), dest('tesseract', f));
}
cpSync(nm('@tesseract.js-data', 'fra', '4.0.0_best_int', 'fra.traineddata.gz'), dest('tesseract', 'lang', 'fra.traineddata.gz'));
if (!existsSync(dest('pdfjs', 'standard_fonts'))) cpSync(nm('pdfjs-dist', 'standard_fonts'), dest('pdfjs', 'standard_fonts'), { recursive: true });
console.log('Ressources copiées dans public/vendor');
