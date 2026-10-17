// Liste FICTIVE au format d'un export Pronote (Élève / Né(e) le / Classe / Régime).
import { describe, expect, it } from 'vitest';
import { analyserListeEleves, lireTableau, rapprocher, regimeAutoriseCantine, separerNomPrenom } from '../../src/domain/importEleves';

const COLLE = [
  'Élève\tNé(e) le\tClasse\tRégime',
  'Ben Fictif Ali Omar\t01/01/2010\t1B\tDEMI-PENSIONNAIRE DANS L\'ETABLISSEMENT',
  'Exemple Lina\t02/02/2010\t1B\t',
  'Test Sofia Meriem\t03/03/2009\t1B\tDEMI-PENSIONNAIRE DANS L\'ETABLISSEMENT',
  'modele Alya\t04/04/2010\t2 C\tEXTERNE',
  'ESSAI DE TEST Jean Paul\t05/05/2010\tTA\tINTERNE',
].join('\n');

describe('Import de la liste des élèves', () => {
  it('lit un copier-coller depuis Excel et normalise classes et régimes', () => {
    const { eleves, avertissements } = analyserListeEleves(lireTableau(COLLE));
    expect(avertissements).toEqual([]);
    expect(eleves.map((e) => [e.nom, e.prenom, e.classe, e.cantineAutorisee, e.decoupageIncertain])).toEqual([
      ['Ben Fictif', 'Ali Omar', '1re B', true, true],
      ['Exemple', 'Lina', '1re B', false, false],
      ['Test', 'Sofia Meriem', '1re B', true, true],
      ['modele', 'Alya', '2nde C', false, false],
      ['ESSAI DE TEST', 'Jean Paul', 'Tle A', true, false],
    ]);
    // La date de naissance n'est pas reprise.
    expect(JSON.stringify(eleves)).not.toContain('2010');
  });
  it('CSV avec colonnes Nom et Prénom séparées', () => {
    const { eleves } = analyserListeEleves(lireTableau('Nom;Prénom;Classe;Régime\n"Ben Exemple";"Sarra";1A;Demi-pensionnaire'));
    expect(eleves[0]).toMatchObject({ nom: 'Ben Exemple', prenom: 'Sarra', classe: '1re A', cantineAutorisee: true, decoupageIncertain: false });
  });
  it('découpage nom / prénoms', () => {
    expect(separerNomPrenom('BEN SALAH Mohamed Amine')).toEqual({ nom: 'BEN SALAH', prenom: 'Mohamed Amine', incertain: false });
    expect(separerNomPrenom('Exemple Lina')).toEqual({ nom: 'Exemple', prenom: 'Lina', incertain: false });
    expect(separerNomPrenom('El Fictif Yasmine')).toMatchObject({ nom: 'El Fictif', prenom: 'Yasmine', incertain: true });
  });
  it('régimes', () => {
    expect(regimeAutoriseCantine("DEMI-PENSIONNAIRE DANS L'ETABLISSEMENT")).toBe(true);
    expect(regimeAutoriseCantine('Interne')).toBe(true);
    expect(regimeAutoriseCantine('EXTERNE')).toBe(false);
    expect(regimeAutoriseCantine('')).toBe(false);
  });
  it('rapprochement avec les élèves existants : pas de doublon', () => {
    const existant = { id: 'x', nom: 'Exemple', prenom: 'Lina', classe: '1re A', actif: true, cantineAutorisee: false };
    const { eleves } = analyserListeEleves(lireTableau(COLLE));
    expect(rapprocher(eleves[1], [existant])).toMatchObject({ type: 'mettre_a_jour', changements: ['classe 1re A → 1re B'] });
    expect(rapprocher(eleves[0], [existant])).toEqual({ type: 'creer' });
    expect(rapprocher({ ...eleves[1], classe: '1re A' }, [existant])).toMatchObject({ type: 'inchange' });
  });
});
