// Parcours complet dans le navigateur, en MODE DÉMONSTRATION (données fictives).
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';

const fixtures = path.resolve('tests', 'fixtures');

// Les tests partagent le même navigateur : l'état de démonstration (localStorage) est conservé d'un test à l'autre.
test.describe.configure({ mode: 'serial' });
let contexte: BrowserContext;
let page: Page;
test.beforeAll(async ({ browser }) => {
  contexte = await browser.newContext();
  page = await contexte.newPage();
});
test.afterAll(async () => contexte.close());
const JETON_YASSINE = `VHSC-${'DEMOYASSINE'.padEnd(24, 'A')}`;

async function connexion(page: Page, email: string) {
  await page.goto('/');
  const deconnexion = page.getByRole('button', { name: 'Déconnexion' });
  if (await deconnexion.isVisible()) await deconnexion.click();
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill('demo');
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

async function scannerManuellement(page: Page, code: string) {
  await page.getByLabel('Code du QR (saisie manuelle)').fill(code);
  await page.getByRole('button', { name: 'Valider' }).click();
}

test('import PDF → extraction → vérification → validation → publication → scan et affichage', async () => {
  // Lundi 14 septembre 2026, 10 h 30 à Djerba (09 h 30 UTC) – semaine B.
  await page.clock.setFixedTime(new Date('2026-09-14T09:30:00Z'));
  await connexion(page, 'admin@demo.local');
  await expect(page.getByText('MODE DÉMONSTRATION')).toBeVisible();
  await expect(page.getByRole('link', { name: 'CANTINE', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'EMPLOI DU TEMPS', exact: true })).toBeVisible();

  // Avant publication : avertissement, aucune information supposée.
  await page.getByRole('link', { name: 'EMPLOI DU TEMPS', exact: true }).click();
  await scannerManuellement(page, JETON_YASSINE);
  await expect(page.getByTestId('resultat-edt')).toContainText('Emploi du temps non disponible');

  // A. Import du document
  await page.goto('/edt/import');
  await page.getByTestId('fichier-edt').setInputFiles(path.join(fixtures, 'edt-fictif-texte.pdf'));
  await expect(page.getByText('edt-fictif-texte.pdf')).toBeVisible();
  await expect(page.getByText('1 page(s)')).toBeVisible();
  await expect(page.getByAltText('Aperçu de la page 1')).toBeVisible();
  await page.getByLabel('Classe', { exact: true }).fill('1re B');
  await page.getByRole('button', { name: "Lancer l'extraction" }).click();

  // B/C. Extraction puis vérification obligatoire
  await expect(page.getByText('C. Vérification obligatoire')).toBeVisible();
  await expect(page.getByTestId('ligne-seance')).toHaveCount(18);
  await expect(page.getByAltText('Page 1 du document original')).toBeVisible();
  const valider = page.getByRole('button', { name: 'Valider la vérification' });
  await page.getByTestId('case-relu').check();
  await expect(valider).toBeDisabled(); // groupes à associer, horaires à confirmer

  const ligne = (texte: RegExp) => page.getByTestId('ligne-seance').filter({ has: page.locator(`input[value]`) }).filter({ hasText: texte });
  const associer = async (texteSource: RegExp, groupe: string) => {
    await ligne(texteSource).getByLabel('Classe / groupe', { exact: true }).selectOption({ label: groupe });
  };
  await associer(/ESP LV2/, 'Groupe 1B-ESP-LV2');
  await associer(/ALL LV2/, 'Groupe 1B-ALL-LV2');
  await associer(/Spe NSI/, 'Groupe SPE-NSI-1re');
  // Horaire inhabituel de l'EMC : relu et confirmé.
  await ligne(/10h15 - 11h45/).getByRole('button', { name: 'Tout confirmer (relu)' }).click();

  // Correction manuelle : la salle d'Anglais du lundi est modifiée, une séance est supprimée puis ajoutée.
  const viedeclasse = ligne(/VIE DE CLASSE/);
  await viedeclasse.getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByTestId('ligne-seance')).toHaveCount(17);
  await page.getByRole('button', { name: '+ Ajouter une séance manquante' }).click();
  const nouvelle = page.getByTestId('ligne-seance').filter({ hasText: 'Ajout manuel' });
  await nouvelle.getByLabel('Classe / groupe', { exact: true }).selectOption({ label: '1re B' });
  await nouvelle.getByLabel('Jour', { exact: true }).selectOption('vendredi');
  await nouvelle.getByLabel('Début', { exact: true }).fill('13:00');
  await nouvelle.getByLabel('Fin', { exact: true }).fill('14:00');
  await nouvelle.getByLabel('Matière', { exact: true }).fill('Vie de classe');
  await nouvelle.getByLabel('Salle', { exact: true }).fill('Salle 204');

  await page.getByTestId('case-relu').check();
  await expect(page.getByTestId('bilan')).toContainText('0 erreur(s)');
  await expect(page.getByTestId('bilan')).toContainText('0 champ(s) incertain(s)');
  await valider.click();

  // D. Publication
  await expect(page.getByText('Vérification validée')).toBeVisible();
  await page.getByRole('button', { name: 'Publier cet emploi du temps' }).click();
  await expect(page.getByText(/Emploi du temps publié le/)).toBeVisible();

  // Scan de l'élève : affichage immédiat, sans clic supplémentaire.
  await page.goto('/edt');
  await scannerManuellement(page, JETON_YASSINE);
  const fiche = page.getByTestId('resultat-edt');
  await expect(fiche).toContainText('ÉLÈVE : Yassine Ben Ali (fictif)');
  await expect(fiche).toContainText('CLASSE : 1re B');
  await expect(fiche).toContainText('Semaine B');
  await expect(fiche.locator('.seance').first()).toContainText('COURS EN COURS');
  await expect(fiche.locator('.seance').first()).toContainText('Anglais');
  await expect(fiche.locator('.seance').first()).toContainText('Salle 101');
  await expect(fiche.locator('.seance').first()).toContainText('Mme Exemple');
  await expect(fiche.locator('.seance').first()).toContainText('10 h 00 – 11 h 00');
  await expect(fiche.locator('.seance').nth(1)).toContainText('PROCHAIN COURS');
  await expect(fiche.locator('.seance').nth(1)).toContainText('Français');

  // QR code invalide refusé.
  await scannerManuellement(page, 'https://exemple.test/inconnu');
  await expect(page.getByTestId('resultat-edt')).toContainText('QR code invalide');
});

test('changement ponctuel de salle pris en compte au scan', async () => {
  await page.clock.setFixedTime(new Date('2026-09-14T09:30:00Z'));
  await connexion(page, 'admin@demo.local');
  await page.goto('/edt/modifications');
  await page.getByLabel('Classe ou groupe').selectOption({ label: '1re B' });
  await page.getByLabel('Séance concernée').selectOption({ index: 2 }); // 10 h – 11 h Anglais
  await page.getByLabel('Salle', { exact: true }).fill('CDI');
  await page.getByLabel('Motif (affiché lors du scan)').fill('Salle 101 indisponible (test fictif)');
  await page.getByRole('button', { name: 'Enregistrer le changement' }).click();
  await expect(page.getByText('Changement enregistré')).toBeVisible();
  await page.goto('/edt');
  await scannerManuellement(page, JETON_YASSINE);
  const encours = page.getByTestId('resultat-edt').locator('.seance').first();
  await expect(encours).toContainText('Anglais');
  await expect(encours).toContainText('CDI');
  await expect(encours).toContainText('Salle 101 indisponible');
});

test('pause et fin des cours', async () => {
  await page.clock.setFixedTime(new Date('2026-09-14T11:30:00Z')); // 12 h 30 à Djerba
  await connexion(page, 'viesco@demo.local');
  await page.getByRole('link', { name: 'EMPLOI DU TEMPS', exact: true }).click();
  await scannerManuellement(page, JETON_YASSINE);
  await expect(page.getByTestId('resultat-edt')).toContainText('Aucun cours en cours');
  await expect(page.getByTestId('resultat-edt')).toContainText('PROCHAIN COURS');
  await page.clock.setFixedTime(new Date('2026-09-14T16:30:00Z')); // 17 h 30
  await scannerManuellement(page, JETON_YASSINE);
  await expect(page.getByTestId('resultat-edt')).toContainText('Fin des cours');
});

test('cantine : passage, doublon, refus, historique et permissions', async () => {
  await page.clock.setFixedTime(new Date('2026-09-14T11:00:00Z')); // 12 h 00, service du déjeuner
  await connexion(page, 'cantine@demo.local');
  await expect(page.getByRole('link', { name: 'EMPLOI DU TEMPS', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'CANTINE', exact: true }).click();
  await expect(page.getByText('Service : Déjeuner')).toBeVisible();
  await scannerManuellement(page, JETON_YASSINE);
  await expect(page.getByTestId('resultat-cantine')).toContainText('PASSAGE ENREGISTRÉ');
  await expect(page.getByTestId('resultat-cantine')).toContainText('Yassine Ben Ali (fictif)');
  await expect(page.getByTestId('resultat-cantine')).toContainText('1re B');
  await scannerManuellement(page, JETON_YASSINE);
  await expect(page.getByTestId('resultat-cantine')).toContainText('DÉJÀ PASSÉ');
  await scannerManuellement(page, `VHSC-${'DEMOADAM'.padEnd(24, 'A')}`);
  await expect(page.getByTestId('resultat-cantine')).toContainText('non autorisé à la cantine');
  await scannerManuellement(page, 'N_IMPORTE_QUOI');
  await expect(page.getByTestId('resultat-cantine')).toContainText('QR code invalide');
  // Le personnel de cantine n'accède pas aux autres modules.
  await page.goto('/edt');
  await expect(page.getByText('Accès non autorisé')).toBeVisible();
  await page.goto('/cantine/historique');
  await expect(page.getByText('Accès non autorisé')).toBeVisible();

  // Historique (administrateur)
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await connexion(page, 'admin@demo.local');
  await page.goto('/cantine/historique');
  const stats = page.getByTestId('stats-cantine');
  await expect(stats).toContainText('1passages confirmés');
  await expect(stats).toContainText('1élèves distincts');
  await expect(stats).toContainText('2passages refusés');
  await expect(stats).toContainText('1doublons');
  const telechargement = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter (CSV)' }).click();
  expect((await telechargement).suggestedFilename()).toBe('passages-cantine_2026-09-14_2026-09-14.csv');
  const xlsx = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter (Excel)' }).click();
  expect((await xlsx).suggestedFilename()).toMatch(/\.xlsx$/);
});

test('extraction OCR d’un PDF scanné dans le navigateur', async () => {
  await connexion(page, 'edt@demo.local');
  await page.goto('/edt/import');
  await page.getByTestId('fichier-edt').setInputFiles(path.join(fixtures, 'edt-fictif-scanne.pdf'));
  await page.getByLabel('Classe', { exact: true }).fill('1re B');
  await page.getByRole('button', { name: "Lancer l'extraction" }).click();
  await expect(page.getByText('C. Vérification obligatoire')).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText(/OCR \(p\. 1\)/)).toBeVisible();
  expect(await page.getByTestId('ligne-seance').count()).toBeGreaterThanOrEqual(16);
  await expect(page.getByRole('button', { name: 'Valider la vérification' })).toBeDisabled();
});

test('import d’une liste d’élèves (format Pronote, fictive) et cartes QR 6 par page', async () => {
  await connexion(page, 'admin@demo.local');
  await page.goto('/eleves');
  await page.getByRole('button', { name: 'Importer une liste (Pronote, Excel, CSV)' }).click();
  const liste = ['Élève\tNé(e) le\tClasse\tRégime']
    .concat(Array.from({ length: 7 }, (_, i) => `Fictif${String.fromCharCode(65 + i)} Prenom${i}\t01/01/2010\t1C\t${i % 2 ? '' : "DEMI-PENSIONNAIRE DANS L'ETABLISSEMENT"}`))
    .concat(['Ben Exemple Ali Omar\t02/02/2010\t2A\tDEMI-PENSIONNAIRE DANS L\'ETABLISSEMENT'])
    .join('\n');
  await page.getByTestId('liste-collee').fill(liste);
  const apercu = page.getByTestId('apercu-import');
  await expect(apercu.locator('tbody tr')).toHaveCount(8);
  await expect(page.getByText('1 nom(s) à vérifier')).toBeVisible();
  await expect(apercu).toContainText('1re C');
  await expect(apercu).toContainText('2nde A');
  // Correction du découpage ambigu.
  await page.getByLabel('Nom ligne 9', { exact: true }).fill('Ben Exemple');
  await page.getByLabel('Prénom ligne 9').fill('Ali Omar');
  const enregistrer = page.getByRole('button', { name: 'Enregistrer et créer les QR codes' });
  await expect(enregistrer).toBeDisabled();
  await page.getByTestId('case-liste-verifiee').check();
  await enregistrer.click();
  await expect(page.getByText('8 élève(s) créé(s) avec leur QR code, 0 mis à jour.')).toBeVisible();

  // Réimport identique : aucun doublon.
  await page.getByRole('button', { name: 'Importer une liste (Pronote, Excel, CSV)' }).click();
  await page.getByTestId('liste-collee').fill(liste.replace('Ben Exemple Ali Omar', 'Ben Exemple Ali Omar'));
  await expect(page.getByText('8 inchangé(s)')).toBeVisible();
  await expect(page.getByText('0 à créer')).toBeVisible();
  await page.getByRole('button', { name: '← Élèves' }).click();

  // Cartes de la 1re C : 7 cartes → 2 pages (6 + 1), saut de page par classe.
  await page.getByLabel('Classe').selectOption('1re C');
  await page.getByRole('button', { name: /Imprimer les cartes QR \(7\)/ }).click();
  await expect(page.getByTestId('carte-eleve')).toHaveCount(7);
  await expect(page.locator('.page-cartes')).toHaveCount(2);
  await expect(page.getByText('SPÉCIMEN – NON VALABLE').first()).toBeVisible();
  const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  const nbPages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(nbPages).toBe(2);
});

test('historique cantine : rapport imprimable du jour', async () => {
  await page.clock.setFixedTime(new Date('2026-09-14T11:05:00Z'));
  await connexion(page, 'admin@demo.local');
  await page.goto('/cantine/historique');
  await expect(page.getByRole('button', { name: 'Rapport imprimable (PDF)' })).toBeEnabled();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByText('Rapport des passages à la cantine')).toBeVisible();
  await expect(page.getByText('lundi 14 septembre 2026', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exporter (CSV)' })).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
});
