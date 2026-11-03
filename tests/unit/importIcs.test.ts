import { describe, expect, it } from 'vitest';
import { lireIcs, seancesDepuisOccurrences } from '../../src/domain/importIcs';
import { CALENDRIER_DEFAUT } from '../../src/data/depot';

// Export FICTIF au format PRONOTE (ICS). Semaine du 7 septembre 2026 = semaine A.
const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Africa/Tunis:20260907T080000',
  'DTEND;TZID=Africa/Tunis:20260907T090000',
  'SUMMARY:Mathématiques',
  'LOCATION:Salle 12',
  'DESCRIPTION:Classe 1re B\\, Prof fictif',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Africa/Tunis:20260914T080000',
  'DTEND;TZID=Africa/Tunis:20260914T090000',
  'SUMMARY:Mathématiques',
  'LOCATION:Salle 12',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Paris:20260908T100000',
  'DTEND;TZID=Europe/Paris:20260908T110000',
  'SUMMARY:Histoire-',
  ' géographie',
  'LOCATION:Salle 3',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20260907T090000Z',
  'DTEND:20260907T100000Z',
  'SUMMARY:Anglais',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Africa/Tunis:20260907T120000',
  'SUMMARY:Sans fin',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('Import ICS PRONOTE', () => {
  it('lit les événements, convertit les heures vers l’heure de l’établissement et déplie les lignes', () => {
    const { occurrences, avertissements } = lireIcs(ICS);
    expect(occurrences).toHaveLength(5 - 1);
    expect(occurrences.find((o) => o.resume.startsWith('Histoire'))).toMatchObject({
      date: '2026-09-08', debut: '09:00', fin: '10:00', resume: 'Histoire-géographie', lieu: 'Salle 3',
    });
    expect(occurrences.find((o) => o.resume === 'Anglais')).toMatchObject({ debut: '10:00', fin: '11:00' });
    expect(occurrences[0].description).toBe('Classe 1re B, Prof fictif');
    expect(avertissements).toHaveLength(1);
  });

  it('regroupe une même semaine type : toutes les semaines, ou semaine A / B seulement', () => {
    const { occurrences } = lireIcs(ICS);
    const seances = seancesDepuisOccurrences(occurrences, 'classe:1re B', CALENDRIER_DEFAUT);
    const maths = seances.find((s) => s.matiere === 'Mathématiques');
    expect(maths).toMatchObject({ jour: 'lundi', debut: '08:00', fin: '09:00', salle: 'Salle 12', semaine: 'toutes', cible: 'classe:1re B' });
    expect(seances.find((s) => s.matiere.startsWith('Histoire'))).toMatchObject({ jour: 'mardi', semaine: 'A' });
    expect(seances.find((s) => s.matiere === 'Anglais')).toMatchObject({ semaine: 'A' });
    expect(new Set(seances.map((s) => s.id)).size).toBe(seances.length);
  });
});
