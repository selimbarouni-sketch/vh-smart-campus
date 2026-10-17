import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ConfigurationRequise } from './app/ConfigurationRequise';
import { DepotFirebase } from './data/depotFirebase';
import { DepotMemoire } from './data/depotMemoire';
import type { Depot } from './data/depot';
import './styles.css';
import { ecouterInstallation } from './app/installation';

ecouterInstallation();

// Application installable (PWA) : le service worker ne met en cache que l'interface, jamais les données.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}

const env = import.meta.env;
const configurationFirebase = !!env.VITE_FIREBASE_PROJECT_ID;
// Démonstration (données fictives) : seulement sur demande explicite (VITE_MODE_DEMO=oui)
// ou en développement local sans Firebase. Jamais sur le site officiel.
const demo = env.VITE_MODE_DEMO === 'oui' || (!configurationFirebase && env.DEV);

const racine = createRoot(document.getElementById('racine')!);
if (configurationFirebase) {
  const depot: Depot = new DepotFirebase({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  }, env.VITE_FIREBASE_REGION || 'europe-west1', undefined, { multimodal: env.VITE_ANALYSE_MULTIMODALE === 'oui' });
  racine.render(<StrictMode><App depot={depot} /></StrictMode>);
} else if (demo) {
  racine.render(<StrictMode><App depot={new DepotMemoire()} /></StrictMode>);
} else {
  racine.render(<StrictMode><ConfigurationRequise /></StrictMode>);
}
