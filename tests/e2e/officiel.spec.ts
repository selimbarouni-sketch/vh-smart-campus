// Fonctions de la version officielle, vérifiées au format téléphone sur l'interface (mode démonstration, données fictives).
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import jsQR from 'jsqr';
import { readFileSync } from 'node:fs';

test.describe.configure({ mode: 'serial' });
let contexte: BrowserContext;
let page: Page;
test.beforeAll(async ({ browser }) => {
  contexte = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page = await contexte.newPage();
});
test.afterAll(async () => contexte.close());

/** Logo FICTIF dessiné pour le test (cercle et lettres). */
function logoFictif(couleur: string, texte: string): Buffer {
  const c = createCanvas(300, 300);
  const x = c.getContext('2d');
  x.fillStyle = couleur; x.beginPath(); x.arc(150, 150, 140, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff'; x.font = 'bold 110px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(texte, 150, 160);
  return c.toBuffer('image/png');
}

async function connexion(email: string, mdp = 'demo') {
  await page.goto('/');
  const sortie = page.getByRole('button', { name: 'Déconnexion' });
  if (await sortie.isVisible()) await sortie.click();
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(mdp);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible();
}

test('logo, logos partenaires et couleur de l’établissement', async () => {
  await connexion('admin@demo.local');
  await page.goto('/administration');
  await page.getByTestId('logo-principal').setInputFiles({ name: 'logo-fictif.png', mimeType: 'image/png', buffer: logoFictif('#7a1f3d', 'LF') });
  await expect(page.getByAltText('Logo actuel')).toBeVisible();
  await page.getByTestId('logo-partenaire').setInputFiles({ name: 'partenaire-fictif.png', mimeType: 'image/png', buffer: logoFictif('#1d6b45', 'P1') });
  await expect(page.getByAltText('Logo partenaire 1')).toBeVisible();
  await page.getByRole('button', { name: 'Bordeaux' }).click();
  await page.getByLabel('Nom court (cartes, en-tête)').fill('LFI fictif');
  await page.getByRole('button', { name: "Enregistrer l'identité" }).click();
  await expect(page.getByText('Identité enregistrée')).toBeVisible();
  // En-tête : logo, nom court, couleur ; pied de page : partenaire.
  await expect(page.locator('.entete .marque-logo')).toBeVisible();
  await expect(page.locator('.entete')).toContainText('LFI fictif');
  await expect(page.locator('.pied img')).toHaveCount(1);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--entete').trim())).toBe("hsl(340 59% 30%)");
  // Page de connexion : logo visible avant connexion.
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(page.getByAltText(/Logo –/)).toBeVisible();
});

test('thème clair / sombre / automatique', async () => {
  await connexion('viesco@demo.local');
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  const bouton = page.getByRole('button', { name: /^Thème / });
  await expect(bouton).toHaveAccessibleName(/automatique/);
  await bouton.click();
  expect(await theme()).toBe('clair');
  await bouton.click();
  expect(await theme()).toBe('sombre');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(15, 17, 21)');
  // Préférence conservée après rechargement.
  await page.reload();
  expect(await theme()).toBe('sombre');
  await page.goto('/compte');
  await page.getByLabel('Clair').check();
  expect(await theme()).toBe('clair');
});

test('création d’un compte par l’administrateur, puis connexion de ce compte', async () => {
  await connexion('admin@demo.local');
  await page.goto('/administration');
  await page.getByLabel('Nom et prénom').fill('Agent cantine fictif');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('agent.fictif@demo.local');
  await page.locator('#comptes form').getByLabel('Agent de cantine').check();
  const mdp = await page.getByLabel('Mot de passe provisoire').inputValue();
  expect(mdp).toHaveLength(12);
  await page.getByRole('button', { name: 'Créer le compte' }).click();
  await expect(page.getByTestId('compte-cree')).toContainText('agent.fictif@demo.local');
  await expect(page.getByTestId('fiche-compte').filter({ hasText: 'Agent cantine fictif' })).toBeVisible();
  // Le compte créé ne voit que la cantine.
  await connexion('agent.fictif@demo.local', mdp);
  await expect(page.getByRole('link', { name: 'CANTINE', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'EMPLOI DU TEMPS', exact: true })).toHaveCount(0);
  // Changement de mot de passe dans « Mon compte ».
  await page.goto('/compte');
  await page.getByLabel('Mot de passe actuel').fill(mdp);
  await page.getByLabel('Nouveau mot de passe (8 caractères minimum)').fill('nouveau-mdp-fictif');
  await page.getByLabel('Confirmer le nouveau mot de passe').fill('nouveau-mdp-fictif');
  await page.getByRole('button', { name: 'Modifier le mot de passe' }).click();
  await expect(page.getByText('Mot de passe modifié.')).toBeVisible();
  await connexion('agent.fictif@demo.local', 'nouveau-mdp-fictif');
});

test('sauvegarde complète puis restauration', async () => {
  await connexion('admin@demo.local');
  await page.goto('/administration#sauvegarde');
  const telechargement = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger une sauvegarde complète' }).click();
  const fichier = await telechargement;
  expect(fichier.suggestedFilename()).toMatch(/^sauvegarde-vh-smart-campus-\d{4}-\d{2}-\d{2}\.json$/);
  const chemin = await fichier.path();
  const contenu = JSON.parse(readFileSync(chemin!, 'utf8'));
  expect(contenu.format).toBe('vh-smart-campus');
  expect(Object.keys(contenu.collections.eleves).length).toBeGreaterThan(0);
  expect(JSON.stringify(contenu)).not.toContain('motDePasse');
  await page.getByTestId('fichier-sauvegarde').setInputFiles(chemin!);
  await page.getByLabel('Je confirme la restauration').check();
  await page.getByRole('button', { name: 'Restaurer', exact: true }).click();
  await expect(page.getByText(/Restauration terminée/)).toBeVisible();
});

test('cartes QR avec le logo : le QR code reste lisible', async () => {
  await connexion('admin@demo.local');
  await page.goto('/eleves');
  await page.getByRole('combobox', { name: 'Classe' }).selectOption('1re B');
  await page.getByRole('button', { name: /Imprimer les cartes QR/ }).click();
  const carte = page.getByTestId('carte-eleve').first();
  await expect(carte.locator('.carte-logo')).toBeVisible();
  await expect(carte).toContainText('LFI fictif');
  const src = await carte.locator('.carte-qr').getAttribute('src');
  const img = await loadImage(Buffer.from(src!.split(',')[1], 'base64'));
  const c = createCanvas(img.width, img.height);
  c.getContext('2d').drawImage(img, 0, 0);
  const d = c.getContext('2d').getImageData(0, 0, img.width, img.height);
  const lu = jsQR(new Uint8ClampedArray(d.data), img.width, img.height);
  expect(lu?.data).toMatch(/^VHSC-[A-Z2-7]{24}$/);
});
