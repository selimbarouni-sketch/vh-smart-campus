import { useEffect, useRef, useState, type FormEvent } from 'react';
import jsQR from 'jsqr';

interface Props {
  /** Appelé à chaque QR code lu. Le scanner est suspendu pendant le traitement. */
  surLecture: (contenu: string) => Promise<void> | void;
  /** Délai pendant lequel un même code relu est ignoré (évite les doubles lectures involontaires). */
  delaiMemeCode?: number;
}

interface DetecteurNatif { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }

/** Scanner caméra optimisé pour smartphone : BarcodeDetector natif si disponible, sinon jsQR. */
export function ScannerQR({ surLecture, delaiMemeCode = 4000 }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const occupe = useRef(false);
  const dernier = useRef<{ code: string; t: number }>({ code: '', t: 0 });
  const [etatCamera, setEtatCamera] = useState<'demarrage' | 'active' | 'indisponible'>('demarrage');
  const [messageCamera, setMessageCamera] = useState('');
  const [manuel, setManuel] = useState('');
  const piste = useRef<MediaStreamTrack | null>(null);
  const [lampeDispo, setLampeDispo] = useState(false);
  const [lampe, setLampe] = useState(false);
  const rappel = useRef(surLecture);
  rappel.current = surLecture;

  const traiter = async (code: string) => {
    const t = Date.now();
    if (occupe.current) return;
    if (code === dernier.current.code && t - dernier.current.t < delaiMemeCode) return;
    dernier.current = { code, t };
    occupe.current = true;
    try { await rappel.current(code); } finally { occupe.current = false; }
  };

  useEffect(() => {
    let flux: MediaStream | null = null;
    let arret = false;
    let minuteur: number | undefined;
    const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => DetecteurNatif };
    const natif = W.BarcodeDetector ? new W.BarcodeDetector({ formats: ['qr_code'] }) : null;

    const boucle = async () => {
      if (arret) return;
      const v = video.current, c = canvas.current;
      if (v && c && v.readyState >= 2 && !occupe.current) {
        try {
          let code: string | null = null;
          if (natif) {
            const r = await natif.detect(v);
            code = r[0]?.rawValue ?? null;
          } else {
            // Image réduite : lecture plus rapide sur les téléphones modestes.
            const f = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
            c.width = Math.round(v.videoWidth * f); c.height = Math.round(v.videoHeight * f);
            const ctx = c.getContext('2d', { willReadFrequently: true })!;
            ctx.drawImage(v, 0, 0, c.width, c.height);
            const img = ctx.getImageData(0, 0, c.width, c.height);
            code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
          }
          if (code) await traiter(code);
        } catch { /* image non exploitable : on continue */ }
      }
      minuteur = window.setTimeout(boucle, natif ? 100 : 150);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setEtatCamera('indisponible');
        setMessageCamera('Caméra non disponible sur cet appareil ou connexion non sécurisée (HTTPS requis).');
        return;
      }
      try {
        flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (arret) { flux.getTracks().forEach((t) => t.stop()); return; }
        if (video.current) {
          video.current.srcObject = flux;
          await video.current.play().catch(() => undefined);
        }
        setEtatCamera('active');
        // Lampe du téléphone (Android/Chrome) : proposée seulement si l'appareil la gère.
        const t = flux.getVideoTracks()[0];
        piste.current = t ?? null;
        const capacites = (t?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setLampeDispo(!!capacites.torch);
        boucle();
      } catch (e) {
        setEtatCamera('indisponible');
        setMessageCamera(e instanceof DOMException && e.name === 'NotAllowedError'
          ? "Accès à la caméra refusé. Autorisez la caméra dans les réglages du navigateur."
          : 'Caméra indisponible. Utilisez la saisie manuelle.');
      }
    })();
    return () => {
      arret = true;
      window.clearTimeout(minuteur);
      flux?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // L'écran reste allumé pendant le scan (téléphone posé à l'entrée de la cantine).
  useEffect(() => {
    type Verrou = { release: () => Promise<void> };
    const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<Verrou> } };
    let verrou: Verrou | null = null;
    const demander = () => { if (document.visibilityState === 'visible') nav.wakeLock?.request('screen').then((v) => { verrou = v; }).catch(() => undefined); };
    demander();
    document.addEventListener('visibilitychange', demander);
    return () => { document.removeEventListener('visibilitychange', demander); verrou?.release().catch(() => undefined); };
  }, []);

  const basculerLampe = async () => {
    const t = piste.current;
    if (!t) return;
    try {
      await t.applyConstraints({ advanced: [{ torch: !lampe } as MediaTrackConstraintSet] });
      setLampe(!lampe);
    } catch { setLampeDispo(false); }
  };

  const envoyerManuel = async (e: FormEvent) => {
    e.preventDefault();
    const code = manuel.trim();
    if (!code) return;
    setManuel('');
    dernier.current = { code: '', t: 0 };
    await traiter(code);
  };

  return (
    <div className="scanner">
      <div className={`viseur ${etatCamera}`}>
        <video ref={video} muted playsInline aria-label="Image de la caméra" />
        <canvas ref={canvas} hidden />
        {etatCamera === 'demarrage' && <p className="viseur-message">Démarrage de la caméra…</p>}
        {etatCamera === 'indisponible' && <p className="viseur-message">{messageCamera}</p>}
        {etatCamera === 'active' && <div className="viseur-cadre" aria-hidden />}
        {lampeDispo && <button type="button" className={`bouton-lampe ${lampe ? 'allumee' : ''}`} onClick={basculerLampe} aria-pressed={lampe}>{lampe ? 'Éteindre la lampe' : 'Lampe'}</button>}
      </div>
      <form className="saisie-manuelle" onSubmit={envoyerManuel}>
        <input aria-label="Code du QR (saisie manuelle)" placeholder="Saisie manuelle du code" value={manuel}
          onChange={(e) => setManuel(e.target.value)} autoCapitalize="characters" autoComplete="off" />
        <button className="bouton">Valider</button>
      </form>
    </div>
  );
}
