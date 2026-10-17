import type { Calendrier, Eleve, Modification, ScolariteEleve, Seance, VersionEDT } from './types';
import { typeSemaine, ferieDu, vacancesDu } from './calendrier';
import { dansPeriode, jourDeLaSemaine, minutes } from './temps';
import { normaliserClasse } from './classes';

export const cibleClasse = (classe: string) => `classe:${normaliserClasse(classe)}`;
export const cibleGroupe = (groupe: string) => `groupe:${groupe}`;

export function libelleCible(cible: string): string {
  if (cible.startsWith('classe:')) return cible.slice(7);
  if (cible.startsWith('groupe:')) return `Groupe ${cible.slice(7)}`;
  return cible || '(non associée)';
}

/** Cibles suivies par l'élève : sa classe + les groupes auxquels il est explicitement associé. */
export function ciblesEleve(eleve: Eleve, scolarite: ScolariteEleve | null): string[] {
  return [cibleClasse(eleve.classe), ...(scolarite?.groupes ?? []).map(cibleGroupe)];
}

export interface SeanceDuJour extends Seance {
  annulee: boolean;
  origine: 'habituelle' | 'exceptionnelle';
  modifications: { type: Modification['type']; motif: string }[];
  versionId?: string;
}

export type StatutJournee = 'ok' | 'ferie' | 'vacances' | 'dimanche' | 'aucun_edt';

export interface Journee {
  statut: StatutJournee;
  motif?: string;
  semaine: 'A' | 'B';
  seances: SeanceDuJour[];
  avertissements: string[];
}

/**
 * Pour une cible, la version applicable est la version ACTIVE la plus récemment publiée
 * qui couvre la date et qui contient cette cible. Les brouillons et versions archivées
 * ne sont jamais utilisés.
 */
export function versionPourCible(cible: string, date: string, versions: VersionEDT[]): VersionEDT | undefined {
  return versions
    .filter((v) => v.statut === 'active' && v.cibles.includes(cible) && dansPeriode(date, v.validiteDebut, v.validiteFin))
    .sort((a, b) => b.publieeLe.localeCompare(a.publieeLe))[0];
}

/**
 * Règles de priorité appliquées à une séance habituelle :
 *  1. Un jour férié ou de vacances supprime toutes les séances habituelles.
 *  2. Les modifications ponctuelles de la date s'appliquent ensuite, de la plus
 *     ancienne à la plus récente : la plus récente l'emporte, champ par champ.
 *     - "annulation" annule la séance ;
 *     - "remplacement" réactive la séance et remplace les champs fournis ;
 *     - "salle", "enseignant", "horaire" ne modifient que le champ concerné.
 *  3. Les séances "ajout" s'ajoutent, y compris un jour férié (rattrapage, examen).
 */
export function appliquerModifications(seance: SeanceDuJour, mods: Modification[]): SeanceDuJour {
  const s: SeanceDuJour = { ...seance, modifications: [...seance.modifications] };
  for (const m of [...mods].sort((a, b) => a.creeLe.localeCompare(b.creeLe))) {
    s.modifications.push({ type: m.type, motif: m.motif });
    switch (m.type) {
      case 'annulation':
        s.annulee = true;
        break;
      case 'remplacement':
        s.annulee = false;
        if (m.nouvelleMatiere) s.matiere = m.nouvelleMatiere;
        if (m.nouvelEnseignant !== undefined) s.enseignant = m.nouvelEnseignant;
        if (m.nouvelleSalle !== undefined) s.salle = m.nouvelleSalle;
        if (m.nouveauDebut) s.debut = m.nouveauDebut;
        if (m.nouvelleFin) s.fin = m.nouvelleFin;
        break;
      case 'salle':
        if (m.nouvelleSalle !== undefined) s.salle = m.nouvelleSalle;
        break;
      case 'enseignant':
        if (m.nouvelEnseignant !== undefined) s.enseignant = m.nouvelEnseignant;
        break;
      case 'horaire':
        if (m.nouveauDebut) s.debut = m.nouveauDebut;
        if (m.nouvelleFin) s.fin = m.nouvelleFin;
        break;
    }
  }
  return s;
}

export interface ParamsJournee {
  eleve: Eleve;
  scolarite: ScolariteEleve | null;
  date: string;
  versions: VersionEDT[];
  modifications: Modification[];
  calendrier: Calendrier;
}

export function journeeEleve(p: ParamsJournee): Journee {
  const { eleve, scolarite, date, versions, calendrier } = p;
  const avertissements: string[] = [];
  const semaine = typeSemaine(date, calendrier);
  const cibles = ciblesEleve(eleve, scolarite);
  const jour = jourDeLaSemaine(date);
  const mods = p.modifications.filter((m) => m.actif && m.date === date && cibles.includes(m.cible));

  const ajouts: SeanceDuJour[] = mods
    .filter((m) => m.type === 'ajout' && m.nouveauDebut && m.nouvelleFin && m.nouvelleMatiere)
    .map((m) => ({
      id: `ajout:${m.id}`, cible: m.cible, jour: jour === 'dimanche' ? 'lundi' : jour,
      debut: m.nouveauDebut!, fin: m.nouvelleFin!, matiere: m.nouvelleMatiere!,
      enseignant: m.nouvelEnseignant ?? '', salle: m.nouvelleSalle ?? '', semaine: 'toutes',
      annulee: false, origine: 'exceptionnelle', modifications: [{ type: 'ajout', motif: m.motif }],
    }));

  const fin = (statut: StatutJournee, seances: SeanceDuJour[], motif?: string): Journee => ({
    statut, motif, semaine, avertissements, seances: trier(seances),
  });

  if (date < calendrier.anneeDebut || date > calendrier.anneeFin) {
    avertissements.push("Date en dehors de l'année scolaire configurée.");
  }
  const ferie = ferieDu(date, calendrier);
  if (ferie) return fin('ferie', ajouts, ferie.libelle);
  const vac = vacancesDu(date, calendrier);
  if (vac) return fin('vacances', ajouts, vac.libelle);
  if (jour === 'dimanche') return fin('dimanche', ajouts);

  // La classe doit disposer d'un emploi du temps publié et valide à cette date.
  const versionClasse = versionPourCible(cibleClasse(eleve.classe), date, versions);
  if (!versionClasse) {
    return fin('aucun_edt', ajouts, `Aucun emploi du temps validé et publié pour la classe ${eleve.classe} à cette date.`);
  }

  const habituelles: SeanceDuJour[] = [];
  for (const cible of cibles) {
    const v = versionPourCible(cible, date, versions);
    if (!v) {
      if (cible.startsWith('groupe:')) {
        avertissements.push(`Aucun emploi du temps publié pour le ${libelleCible(cible).toLowerCase()}.`);
      }
      continue;
    }
    for (const s of v.seances) {
      if (s.cible !== cible || s.jour !== jour) continue;
      if (s.semaine !== 'toutes' && s.semaine !== semaine) continue;
      if (s.validiteDebut && date < s.validiteDebut) continue;
      if (s.validiteFin && date > s.validiteFin) continue;
      habituelles.push({ ...s, annulee: false, origine: 'habituelle', modifications: [], versionId: v.id });
    }
  }

  // Séances de groupe présentes dans la version de la classe alors que l'élève n'a aucun groupe.
  const aDesGroupes = versionClasse.seances.some((s) => s.cible.startsWith('groupe:'));
  if (aDesGroupes && (scolarite?.groupes.length ?? 0) === 0) {
    avertissements.push("Les groupes de cet élève ne sont pas renseignés : ses cours de spécialité, d'option ou de langue ne peuvent pas être affichés.");
  }

  const appliquees = habituelles.map((s) => {
    const concernees = mods.filter((m) => m.type !== 'ajout' && m.seanceId === s.id);
    return concernees.length ? appliquerModifications(s, concernees) : s;
  });
  for (const m of mods) {
    if (m.type !== 'ajout' && !habituelles.some((s) => s.id === m.seanceId)) {
      avertissements.push(`Une modification ponctuelle (« ${m.motif} ») vise une séance introuvable ce jour-là.`);
    }
  }

  const resultat = [...appliquees, ...ajouts];
  const actives = resultat.filter((s) => !s.annulee);
  for (let i = 0; i < actives.length; i++) {
    for (let j = i + 1; j < actives.length; j++) {
      if (chevauche(actives[i], actives[j])) {
        avertissements.push(`Deux séances se chevauchent (${actives[i].matiere} et ${actives[j].matiere}) : vérifiez les groupes de l'élève.`);
      }
    }
  }
  return fin('ok', resultat);
}

export function chevauche(a: Pick<Seance, 'debut' | 'fin'>, b: Pick<Seance, 'debut' | 'fin'>): boolean {
  return minutes(a.debut) < minutes(b.fin) && minutes(b.debut) < minutes(a.fin);
}

function trier(seances: SeanceDuJour[]): SeanceDuJour[] {
  return [...seances].sort((a, b) => minutes(a.debut) - minutes(b.debut) || a.matiere.localeCompare(b.matiere));
}

export type EtatMoment = 'en_cours' | 'pause' | 'avant_cours' | 'fin_des_cours' | 'aucun_cours';

export interface Moment {
  etat: EtatMoment;
  enCours: SeanceDuJour[];
  prochain: SeanceDuJour | null;
  reste: SeanceDuJour[];      // séances non annulées restantes après le cours en cours
  annuleesRestantes: SeanceDuJour[];
}

/** Cours en cours, prochain cours et reste de la journée à une heure donnée. */
export function momentDeLaJournee(seances: SeanceDuJour[], heure: string): Moment {
  const h = minutes(heure);
  const actives = seances.filter((s) => !s.annulee);
  const enCours = actives.filter((s) => minutes(s.debut) <= h && h < minutes(s.fin));
  const futures = actives.filter((s) => minutes(s.debut) > h);
  const prochain = futures[0] ?? null;
  const annuleesRestantes = seances.filter((s) => s.annulee && minutes(s.fin) > h);
  let etat: EtatMoment;
  if (actives.length === 0) etat = 'aucun_cours';
  else if (enCours.length) etat = 'en_cours';
  else if (!prochain) etat = 'fin_des_cours';
  else if (actives.every((s) => minutes(s.debut) > h)) etat = 'avant_cours';
  else etat = 'pause';
  return { etat, enCours, prochain, reste: futures, annuleesRestantes };
}

/** Séances habituelles d'une cible à une date (avant modifications ponctuelles). */
export function seancesHabituelles(cible: string, date: string, versions: VersionEDT[], calendrier: Calendrier): Seance[] {
  const v = versionPourCible(cible, date, versions);
  const jour = jourDeLaSemaine(date);
  if (!v || jour === 'dimanche') return [];
  const semaine = typeSemaine(date, calendrier);
  return v.seances
    .filter((s) => s.cible === cible && s.jour === jour && (s.semaine === 'toutes' || s.semaine === semaine))
    .filter((s) => (!s.validiteDebut || date >= s.validiteDebut) && (!s.validiteFin || date <= s.validiteFin))
    .sort((a, b) => minutes(a.debut) - minutes(b.debut));
}
