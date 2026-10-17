import Anthropic from '@anthropic-ai/sdk';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { analyserImage, type DemandeAnalyse } from './vision';

initializeApp();
const CLE_ANTHROPIC = defineSecret('ANTHROPIC_API_KEY');
const REGION = 'europe-west1';
const ROLES = ['admin', 'cantine', 'vie_scolaire', 'gestion_edt', 'gestion_eleves'];

async function exigerRole(req: CallableRequest, autorises: string[]) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const profil = await getFirestore().doc(`utilisateurs/${req.auth.uid}`).get();
  const d = profil.data();
  if (!d?.actif || !(d.roles as string[] | undefined)?.some((r) => autorises.includes(r))) {
    throw new HttpsError('permission-denied', 'Droits insuffisants.');
  }
}

/** Analyse multimodale d'une page d'emploi du temps (réservée à la gestion des EDT). */
export const analyserEmploiDuTemps = onCall(
  { region: REGION, secrets: [CLE_ANTHROPIC], timeoutSeconds: 300, memory: '512MiB', enforceAppCheck: false },
  async (req: CallableRequest<DemandeAnalyse>) => {
    await exigerRole(req, ['admin', 'gestion_edt']);
    const { imageBase64, typeMime, contexte } = req.data ?? ({} as DemandeAnalyse);
    if (typeof imageBase64 !== 'string' || !['image/png', 'image/jpeg'].includes(typeMime)) {
      throw new HttpsError('invalid-argument', 'Image PNG ou JPEG attendue.');
    }
    if (imageBase64.length > 7_000_000) throw new HttpsError('invalid-argument', 'Image trop volumineuse (5 Mo maximum).');
    try {
      const client = new Anthropic({ apiKey: CLE_ANTHROPIC.value() });
      return await analyserImage(client, { imageBase64, typeMime, contexte: String(contexte ?? '').slice(0, 500) });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) throw new HttpsError('resource-exhausted', 'Service d’analyse saturé, réessayez dans une minute.');
      if (e instanceof Anthropic.APIError) throw new HttpsError('unavailable', `Service d’analyse indisponible (${e.status ?? 'réseau'}).`);
      throw new HttpsError('internal', e instanceof Error ? e.message : 'Erreur inconnue.');
    }
  },
);

/** Création d'un compte du personnel par un administrateur (aucune inscription libre). */
export const creerUtilisateur = onCall({ region: REGION }, async (req: CallableRequest<{ email: string; nom: string; roles: string[]; motDePasse: string }>) => {
  await exigerRole(req, ['admin']);
  const { email, nom, roles, motDePasse } = req.data ?? ({} as never);
  if (!email || !nom || !Array.isArray(roles) || !roles.every((r) => ROLES.includes(r))) throw new HttpsError('invalid-argument', 'Données invalides.');
  if (!motDePasse || motDePasse.length < 10) throw new HttpsError('invalid-argument', 'Mot de passe provisoire : 10 caractères minimum.');
  const u = await getAuth().createUser({ email, password: motDePasse, displayName: nom });
  await getFirestore().doc(`utilisateurs/${u.uid}`).set({ email, nom, roles, actif: true });
  return { uid: u.uid };
});
