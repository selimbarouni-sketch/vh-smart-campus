import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { DepotFirebase } from './data/depotFirebase';
import { DepotMemoire } from './data/depotMemoire';
import type { Depot } from './data/depot';
import './styles.css';

const env = import.meta.env;
// Sans configuration Firebase, l'application fonctionne en mode démonstration (données fictives, bandeau permanent).
const depot: Depot = env.VITE_FIREBASE_PROJECT_ID
  ? new DepotFirebase({
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    }, env.VITE_FIREBASE_REGION || 'europe-west1')
  : new DepotMemoire();

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <App depot={depot} />
  </StrictMode>,
);
