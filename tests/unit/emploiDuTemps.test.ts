import { describe, expect, it } from 'vitest';
import { journeeEleve, momentDeLaJournee } from '../../src/domain/emploiDuTemps';
import { typeSemaine } from '../../src/domain/calendrier';
import { instantLocal } from '../../src/domain/temps';
import type { Modification } from '../../src/domain/types';
import { CALENDRIER_FICTIF, ELEVE_FICTIF, seance, version } from './donneesFictives';

// Lundi 14 septembre 2026 : semaine B (référence A le 7 septembre).
const LUNDI_B = '2026-09-14';
const LUNDI_A = '2026-09-21';

const anglais = seance({ id: 'ang', matiere: 'Anglais', salle: 'Salle 101', enseignant: 'Mme Dupont (fictive)', debut: '10:00', fin: '11:00' });
const maths = seance({ id: 'mat', matiere: 'Mathématiques', salle: 'Salle 204', debut: '11:00', fin: '12:00' });
const hg = seance({ id: 'hg', matiere: 'Histoire-Géographie', debut: '08:00', fin: '09:00' });
const pcA = seance({ id: 'pcA', matiere: 'Physique-Chimie', debut: '13:00', fin: '14:00', semaine: 'A' });
const svtB = seance({ id: 'svtB', matiere: 'SVT', debut: '13:00', fin: '14:00', semaine: 'B' });
const esp = seance({ id: 'esp', cible: 'groupe:ESP', matiere: 'Espagnol LV2', debut: '14:00', fin: '15:00' });
const all = seance({ id: 'all', cible: 'groupe:ALL', matiere: 'Allemand LV2', debut: '14:00', fin: '15:00' });
const nsi = seance({ id: 'nsi', cible: 'groupe:NSI', matiere: 'NSI', debut: '15:15', fin: '17:15' });
const v = version([hg, anglais, maths, pcA, svtB, esp, all, nsi]);

const journee = (date: string, groupes: string[] = ['ESP', 'NSI'], mods: Modification[] = [], versions = [v]) =>
  journeeEleve({ eleve: ELEVE_FICTIF, scolarite: { eleveId: ELEVE_FICTIF.id, groupes }, date, versions, modifications: mods, calendrier: CALENDRIER_FICTIF });

describe('Affichage du cours exact selon l’heure', () => {
  it('10 h 30 : cours en cours = Anglais, prochain = Mathématiques', () => {
    const m = momentDeLaJournee(journee(LUNDI_B).seances, '10:30');
    expect(m.etat).toBe('en_cours');
    expect(m.enCours.map((s) => s.matiere)).toEqual(['Anglais']);
    expect(m.enCours[0].salle).toBe('Salle 101');
    expect(m.prochain?.matiere).toBe('Mathématiques');
  });
  it('bornes : 11 h 00 pile = Mathématiques (début inclus, fin exclue)', () => {
    expect(momentDeLaJournee(journee(LUNDI_B).seances, '11:00').enCours[0].matiere).toBe('Mathématiques');
  });
  it('pendant une pause : « aucun cours en cours » et prochain cours', () => {
    const m = momentDeLaJournee(journee(LUNDI_B).seances, '09:30');
    expect(m.etat).toBe('pause');
    expect(m.enCours).toHaveLength(0);
    expect(m.prochain?.matiere).toBe('Anglais');
  });
  it('avant le premier cours', () => {
    expect(momentDeLaJournee(journee(LUNDI_B).seances, '07:30').etat).toBe('avant_cours');
  });
  it('après le dernier cours : fin des cours', () => {
    const m = momentDeLaJournee(journee(LUNDI_B).seances, '17:20');
    expect(m.etat).toBe('fin_des_cours');
    expect(m.prochain).toBeNull();
  });
  it('horaire inhabituel (15 h 15 – 17 h 15)', () => {
    const m = momentDeLaJournee(journee(LUNDI_B).seances, '17:00');
    expect(m.enCours[0].matiere).toBe('NSI');
  });
  it('heure locale de Djerba indépendante du fuseau du téléphone', () => {
    // 09:30 UTC = 10:30 à Djerba (UTC+1).
    expect(instantLocal(new Date('2026-09-14T09:30:00Z'), 'Africa/Tunis')).toEqual({ date: '2026-09-14', heure: '10:30', jour: 'lundi' });
  });
});

describe('Semaines A/B', () => {
  it('alternance depuis la semaine de référence', () => {
    expect(typeSemaine('2026-09-07', CALENDRIER_FICTIF)).toBe('A');
    expect(typeSemaine(LUNDI_B, CALENDRIER_FICTIF)).toBe('B');
    expect(typeSemaine('2026-09-18', CALENDRIER_FICTIF)).toBe('B');
    expect(typeSemaine(LUNDI_A, CALENDRIER_FICTIF)).toBe('A');
  });
  it('seule la séance de la semaine en cours est affichée', () => {
    expect(journee(LUNDI_B).seances.map((s) => s.matiere)).toContain('SVT');
    expect(journee(LUNDI_B).seances.map((s) => s.matiere)).not.toContain('Physique-Chimie');
    expect(journee(LUNDI_A).seances.map((s) => s.matiere)).toContain('Physique-Chimie');
    expect(journee(LUNDI_A).seances.map((s) => s.matiere)).not.toContain('SVT');
  });
  it('mode « hors vacances » : les semaines de vacances ne comptent pas', () => {
    // Une seule semaine de vacances fictive (26/10 → 30/10).
    const vacances = [{ debut: '2026-10-24', fin: '2026-11-01', libelle: 'Vacances fictives' }];
    const continu = { ...CALENDRIER_FICTIF, vacances };
    const horsVacances = { ...continu, modeAlternance: 'hors_vacances' as const };
    expect(typeSemaine('2026-10-19', horsVacances)).toBe('A');
    // Rentrée du 02/11 : 8 semaines civiles après la référence, mais 7 semaines de cours.
    expect(typeSemaine('2026-11-02', continu)).toBe('A');
    expect(typeSemaine('2026-11-02', horsVacances)).toBe('B');
    expect(typeSemaine('2026-11-09', horsVacances)).toBe('A');
  });
  it('forçage manuel prioritaire et repris pour la suite', () => {
    const cal = { ...CALENDRIER_FICTIF, semainesForcees: { '2026-09-14': 'A' as const } };
    expect(typeSemaine(LUNDI_B, cal)).toBe('A');
    expect(typeSemaine(LUNDI_A, cal)).toBe('B');
  });
});

describe('Groupes de spécialité et de langue', () => {
  it("l'élève ne voit que les cours de ses groupes", () => {
    const matieres = journee(LUNDI_B).seances.map((s) => s.matiere);
    expect(matieres).toContain('Espagnol LV2');
    expect(matieres).toContain('NSI');
    expect(matieres).not.toContain('Allemand LV2');
  });
  it('un élève sans groupe ne voit pas les cours de groupe, avec un avertissement', () => {
    const j = journee(LUNDI_B, []);
    expect(j.seances.map((s) => s.matiere)).not.toContain('Espagnol LV2');
    expect(j.avertissements.join(' ')).toMatch(/groupes de cet élève ne sont pas renseignés/);
  });
  it('élève dans plusieurs groupes en même temps : chevauchement signalé', () => {
    const j = journee(LUNDI_B, ['ESP', 'ALL']);
    expect(j.avertissements.join(' ')).toMatch(/se chevauchent/);
  });
});

describe('Modifications exceptionnelles et priorités', () => {
  const mod = (p: Partial<Modification>): Modification => ({
    id: `m${Math.random()}`, date: LUNDI_B, type: 'salle', seanceId: 'ang', cible: 'classe:1re B', motif: 'Test fictif',
    creePar: 'test', creeLe: '2026-09-10T08:00:00Z', actif: true, ...p,
  });
  it('changement de salle', () => {
    const s = journee(LUNDI_B, [], [mod({ nouvelleSalle: 'CDI' })]).seances.find((x) => x.id === 'ang')!;
    expect(s.salle).toBe('CDI');
    expect(s.modifications).toHaveLength(1);
  });
  it('cours annulé : jamais présenté comme cours en cours', () => {
    const j = journee(LUNDI_B, [], [mod({ type: 'annulation' })]);
    const m = momentDeLaJournee(j.seances, '10:30');
    expect(m.etat).toBe('pause');
    expect(m.annuleesRestantes.map((s) => s.id)).toEqual(['ang']);
  });
  it('le changement le plus récent l’emporte (annulation puis remplacement)', () => {
    const j = journee(LUNDI_B, [], [
      mod({ type: 'remplacement', nouvelleMatiere: 'Philosophie', nouvelEnseignant: 'M. Remplaçant (fictif)', creeLe: '2026-09-12T08:00:00Z' }),
      mod({ type: 'annulation', creeLe: '2026-09-11T08:00:00Z' }),
    ]);
    const s = j.seances.find((x) => x.id === 'ang')!;
    expect(s.annulee).toBe(false);
    expect(s.matiere).toBe('Philosophie');
  });
  it('changement d’horaire', () => {
    const j = journee(LUNDI_B, [], [mod({ type: 'horaire', nouveauDebut: '10:30', nouvelleFin: '11:30' })]);
    expect(momentDeLaJournee(j.seances, '10:15').enCours).toHaveLength(0);
    expect(momentDeLaJournee(j.seances, '10:45').enCours.map((s) => s.matiere)).toEqual(['Anglais']);
  });
  it('modification désactivée ou d’une autre date : ignorée', () => {
    expect(journee(LUNDI_B, [], [mod({ nouvelleSalle: 'CDI', actif: false })]).seances.find((x) => x.id === 'ang')!.salle).toBe('Salle 101');
    expect(journee(LUNDI_B, [], [mod({ nouvelleSalle: 'CDI', date: LUNDI_A })]).seances.find((x) => x.id === 'ang')!.salle).toBe('Salle 101');
  });
  it('séance exceptionnelle ajoutée, y compris un jour férié', () => {
    const ajout = mod({ type: 'ajout', seanceId: undefined, date: '2026-09-30', nouvelleMatiere: 'Rattrapage fictif', nouveauDebut: '09:00', nouvelleFin: '10:00' });
    const j = journee('2026-09-30', [], [ajout]);
    expect(j.statut).toBe('ferie');
    expect(j.seances.map((s) => s.matiere)).toEqual(['Rattrapage fictif']);
  });
});

describe('Absence de cours et emploi du temps non fiable', () => {
  it('jour férié', () => {
    const j = journee('2026-09-30');
    expect(j.statut).toBe('ferie');
    expect(j.seances).toHaveLength(0);
  });
  it('vacances', () => expect(journee('2026-10-26').statut).toBe('vacances'));
  it('dimanche', () => expect(journee('2026-09-13').statut).toBe('dimanche'));
  it('jour sans cours (mercredi) : aucun cours', () => {
    const j = journee('2026-09-16');
    expect(j.statut).toBe('ok');
    expect(momentDeLaJournee(j.seances, '10:00').etat).toBe('aucun_cours');
  });
  it('aucune version publiée : avertissement, aucune donnée supposée', () => {
    const j = journee(LUNDI_B, [], [], []);
    expect(j.statut).toBe('aucun_edt');
    expect(j.seances).toHaveLength(0);
  });
  it('version archivée ou hors période : non utilisée', () => {
    expect(journee(LUNDI_B, [], [], [{ ...v, statut: 'archivee' }]).statut).toBe('aucun_edt');
    expect(journee(LUNDI_B, [], [], [{ ...v, validiteDebut: '2027-01-01' }]).statut).toBe('aucun_edt');
  });
  it('la version publiée la plus récente est prioritaire', () => {
    const nouvelle = version([seance({ id: 'n1', matiere: 'Nouvelle matière fictive', debut: '10:00', fin: '11:00' })], { publieeLe: '2026-09-10T08:00:00Z' });
    const j = journee(LUNDI_B, [], [], [v, nouvelle]);
    expect(j.seances.map((s) => s.matiere)).toEqual(['Nouvelle matière fictive']);
  });
});
