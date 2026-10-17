import { describe, expect, it } from 'vitest';
import { normaliserClasse, niveauClasse } from '../../src/domain/classes';

describe('Noms de classe', () => {
  it('formes courantes ramenées à une forme unique', () => {
    for (const c of ['1B', '1 B', '1re B', '1ère B', '1ERE B', 'Première B', '1-B', '1b']) expect(normaliserClasse(c)).toBe('1re B');
    expect(normaliserClasse('2nde 3')).toBe('2nde 3');
    expect(normaliserClasse('2de3')).toBe('2nde 3');
    expect(normaliserClasse('Seconde A')).toBe('2nde A');
    for (const c of ['TA', 'T A', 'Tle A', 'Terminale A', 'Term A']) expect(normaliserClasse(c)).toBe('Tle A');
    expect(normaliserClasse('6ème A')).toBe('6e A');
    expect(normaliserClasse('3 C')).toBe('3e C');
  });
  it('libellé inconnu conservé', () => {
    expect(normaliserClasse('  BTS  SIO ')).toBe('BTS SIO');
  });
  it('niveau', () => {
    expect(niveauClasse('1B')).toBe('1re');
    expect(niveauClasse('Tle G1')).toBe('Tle');
  });
});
