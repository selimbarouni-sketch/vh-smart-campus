/** Affiché quand le site est publié sans être relié à la base de données (ni démonstration). */
export function ConfigurationRequise() {
  return (
    <div className="etroit">
      <div className="carte">
        <h1>Application non configurée</h1>
        <p>Cette version n'est pas encore reliée à la base de données de l'établissement. Contactez la personne en charge de l'informatique.</p>
        <p className="discret">Pour la personne en charge : renseignez les variables VITE_FIREBASE_… dans l'hébergeur (voir le README), puis redéployez.</p>
      </div>
    </div>
  );
}
