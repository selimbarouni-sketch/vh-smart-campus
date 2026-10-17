import Anthropic from '@anthropic-ai/sdk';

/** Schéma de sortie imposé au modèle (sorties structurées). */
export const SCHEMA_EDT = {
  type: 'object',
  additionalProperties: false,
  required: ['titre_classe', 'seances', 'remarques'],
  properties: {
    titre_classe: { type: 'string', description: 'Classe ou groupe indiqué dans le titre, ou chaîne vide.' },
    seances: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['classe_ou_groupe', 'jour', 'debut', 'fin', 'matiere', 'enseignant', 'salle', 'semaine', 'groupe', 'champs_incertains', 'texte_case'],
        properties: {
          classe_ou_groupe: { type: 'string' },
          jour: { type: 'string', enum: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', ''] },
          debut: { type: 'string', description: 'HH:MM ou chaîne vide' },
          fin: { type: 'string', description: 'HH:MM ou chaîne vide' },
          matiere: { type: 'string' },
          enseignant: { type: 'string' },
          salle: { type: 'string' },
          semaine: { type: 'string', enum: ['toutes', 'A', 'B'] },
          groupe: { type: 'string' },
          champs_incertains: {
            type: 'array',
            items: { type: 'string', enum: ['jour', 'debut', 'fin', 'matiere', 'enseignant', 'salle', 'semaine', 'cible'] },
          },
          texte_case: { type: 'string' },
        },
      },
    },
    remarques: { type: 'array', items: { type: 'string' } },
  },
} as const;

export const CONSIGNES = `Tu lis l'image d'un emploi du temps de lycée français (document exporté, scanné ou photographié).
Transcris chaque case de cours en une séance structurée.

Règles impératives :
- Ne jamais inventer : si une salle, un enseignant, un horaire ou une matière est absent ou illisible, laisse le champ vide ("") et ajoute-le à champs_incertains.
- Recopie la matière telle qu'elle est écrite (abréviation comprise) : ne la développe pas si tu n'es pas certain du sens.
- Horaires au format HH:MM. Une case fusionnée sur plusieurs créneaux va du début du premier créneau à la fin du dernier. Si un horaire est écrit dans la case, il prévaut ; s'il contredit la grille, signale debut/fin comme incertains.
- semaine : "A" ou "B" uniquement si la case l'indique (Sem A, (A), Q1/Q2…), sinon "toutes". Une correspondance Q1/Q2 → A/B est incertaine.
- Deux cours dans le même créneau (groupes, langues, spécialités) donnent deux séances distinctes ; indique le groupe écrit dans "groupe" et marque "cible" comme incertain.
- classe_ou_groupe : la classe ou le groupe écrit dans la case, sinon celui du titre, sinon "".
- Les couleurs ne portent aucune information fiable à elles seules.
- texte_case : le texte brut lu dans la case.
- Dans "remarques", signale tout ce qui empêche une lecture fiable (zone floue, cellule coupée, légende non comprise).`;

export interface DemandeAnalyse {
  imageBase64: string;
  typeMime: 'image/png' | 'image/jpeg';
  contexte: string;
}

export async function analyserImage(client: Anthropic, d: DemandeAnalyse): Promise<unknown> {
  const reponse = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA_EDT } },
    system: CONSIGNES,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: d.typeMime, data: d.imageBase64 } },
        { type: 'text', text: `Contexte fourni par l'utilisateur : ${d.contexte || '(aucun)'}\nTranscris toutes les séances de cette page.` },
      ],
    }],
  });
  if (reponse.stop_reason === 'refusal') throw new Error("L'analyse multimodale a été refusée pour ce document.");
  if (reponse.stop_reason === 'max_tokens') throw new Error('Réponse tronquée : page trop chargée, découpez le document.');
  const texte = reponse.content.find((b) => b.type === 'text');
  if (!texte || texte.type !== 'text') throw new Error('Réponse vide du modèle.');
  return JSON.parse(texte.text);
}
