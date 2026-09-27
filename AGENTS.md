# Instructions pour Codex — Inscribe

## Projet

- Inscribe est un éditeur PDF local construit avec SvelteKit, Svelte 5, Tailwind 4 et Tauri.
- Utilise `pnpm` pour les commandes JavaScript. Les commandes de vérification sont `pnpm check`, `pnpm lint`, `pnpm exec vitest run` et `pnpm test:integration` selon le code modifié.
- Garde `src/routes` pour les pages et les layouts SvelteKit. Place les composants réutilisables dans `src/lib/components` et les utilitaires dans `src/lib/utils`.
- Préserve les fonctions essentielles de l’éditeur lors des changements visuels : import et rendu de PDF, miniatures, déplacement, duplication et suppression des pages, métadonnées, OCR et export.
- Vérifie les changements d’interface dans un navigateur avec un PDF représentatif. Contrôle aussi les états de chargement et d’erreur, le clavier et une largeur mobile.
- Applique les consignes de conception ci-dessous à toute création ou modification d’interface. Elles reprennent intégralement le document UI/UX établi pour ce projet.

## Releases et mises à jour automatiques

### Fonctionnement et configuration

- Dépôt de publication : `FlawedLabs/inscribe`.
- Le workflow `.github/workflows/release.yml` se déclenche au push d’un tag `v*`. Un simple push de branche ne publie pas de version.
- Le tag doit correspondre exactement à la version de l’application : version `0.1.1`, tag `v0.1.1`. Le workflow utilise `v__VERSION__` pour nommer la release ; un décalage entre le tag et la version peut empêcher sa publication correcte.
- Les builds couvrent Windows, Linux, macOS Intel (`x86_64-apple-darwin`) et macOS Apple Silicon (`aarch64-apple-darwin`). Ils déposent les installateurs, les artefacts de mise à jour et leurs signatures dans une release en brouillon. Le job `publish` publie cette release uniquement lorsque tous les builds réussissent.
- `bundle.createUpdaterArtifacts` doit rester activé dans `src-tauri/tauri.conf.json`. La clé publique de vérification est dans `plugins.updater.pubkey`.
- L’application consulte `https://github.com/FlawedLabs/inscribe/releases/latest/download/latest.json`. Ce canal est destiné aux releases stables publiées, pas aux brouillons ni aux préversions.
- Le secret GitHub Actions `TAURI_SIGNING_PRIVATE_KEY` a été configuré pour ce dépôt. Avant une release, vérifier sa présence avec `gh secret list --repo FlawedLabs/inscribe`, sans afficher de valeur privée. `GITHUB_TOKEN` est fourni automatiquement par GitHub Actions. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` est nécessaire uniquement si la clé privée est protégée par un mot de passe ; la clé initiale a été créée sans mot de passe.
- Ne jamais commiter, afficher dans les logs ou intégrer au frontend la clé privée. Conserver une sauvegarde durable et sécurisée hors du dépôt ; un fichier temporaire ne constitue pas une sauvegarde. Ne pas régénérer ni remplacer la paire de clés pour une release ordinaire : les applications déjà installées vérifient les mises à jour avec la clé publique embarquée.

### Procédure à suivre lorsqu’une release est demandée

Une demande explicite de publier une release autorise les commits, les pushes et le tag nécessaires à cette release. Une demande de développement ou de documentation seule ne déclenche pas de publication. Lorsque la publication est autorisée, effectuer toute la procédure et suivre son résultat sur GitHub.

1. Examiner `git status`, la branche courante, le dépôt distant et les dernières releases. Vérifier l’authentification avec `gh auth status --hostname github.com`. Ne pas inclure des changements utilisateur sans rapport avec la release. Vérifier que le tag prévu n’existe ni localement ni sur le dépôt distant et que la version est supérieure à la dernière version stable publiée.
2. Choisir la version demandée, ou une version SemVer cohérente avec les changements. Synchroniser cette version dans `package.json`, `src-tauri/Cargo.toml` et `src-tauri/tauri.conf.json`. Mettre également à jour l’entrée du paquet `inscribe` dans `src-tauri/Cargo.lock` au moyen de Cargo, et conserver les fichiers de verrouillage cohérents avec leurs manifests. La première version prévue avec ce mécanisme est `0.1.0` ; pour les suivantes, utiliser un nouveau numéro, par exemple `0.1.1`.
3. Vérifier le workflow, le secret de signature et la configuration de l’updater. Exécuter `pnpm check`, `pnpm lint`, `pnpm build` et `cargo check --manifest-path src-tauri/Cargo.toml`, ainsi que les tests unitaires et d’intégration pertinents selon le code modifié. Pour des changements d’interface, appliquer aussi les vérifications navigateur décrites dans ce fichier. Corriger les erreurs avant de pousser le tag.
4. Commiter les changements destinés à la release avec un message explicite, puis pousser le commit sur la branche appropriée. Le commit taggé doit contenir le workflow et tous les changements nécessaires ; les fichiers non commités ne seront pas construits par GitHub Actions. Respecter les protections et le parcours de revue du dépôt s’ils sont configurés.
5. Créer le tag correspondant sur le commit retenu et le pousser. Exemple, à adapter à la version choisie :

   ```sh
   git tag -a v0.1.1 -m "Inscribe v0.1.1"
   git push origin v0.1.1
   ```

6. Suivre le workflow **Release** dans GitHub Actions. Utiliser par exemple `gh run list --repo FlawedLabs/inscribe --workflow release.yml`, puis `gh run watch <run-id> --repo FlawedLabs/inscribe`. Vérifier que l’exécution correspond au tag et au commit poussés. Attendre le succès de tous les builds et du job `publish` avant d’annoncer la publication.
7. Contrôler la release avec `gh release view <tag> --repo FlawedLabs/inscribe`. Vérifier qu’elle est publiée, que les installateurs et artefacts signés des quatre cibles sont présents et que `latest.json` est accessible via l’URL configurée dans l’application. Vérifier sa version, ses entrées de plateformes, ses signatures et les URL de téléchargement. Pour valider une mise à jour réelle, utiliser une ancienne version signée équipée de l’updater ; indiquer clairement si cette vérification sur une application installée n’a pas pu être effectuée.
8. Rapporter la version, le tag, le commit, le lien de la release, le résultat du workflow et les vérifications réalisées. En cas d’échec, consulter les logs et corriger la cause ; ne pas publier manuellement une release incomplète. Ne pas déplacer ni réutiliser le tag d’une version déjà publiée : publier la correction avec un nouveau numéro de version.

### Distribution aux utilisateurs

- L’accueil web récupère les installateurs de la dernière release stable via l’API publique GitHub. Vérifier après publication que le bouton pointe vers le bon fichier pour Windows et Linux, et que le choix Apple Silicon / Intel fonctionne sur macOS. La détection de l’OS reste une suggestion : conserver le sélecteur manuel et le lien « Tous les installateurs ». Ne pas proposer d’installateur desktop sur mobile ni dans l’application Tauri déjà installée.
- La signature des artefacts de mise à jour avec la clé Tauri ne remplace pas la signature de code Windows ou la signature et la notarisation Apple. Le workflow initial ne configure pas ces certificats OS ; ne pas annoncer les installateurs comme notarifiés ou approuvés par ces systèmes.
- Les installations antérieures à l’ajout de l’updater doivent installer manuellement la première version signée depuis GitHub Releases. Elles ne peuvent pas recevoir automatiquement le mécanisme qu’elles ne contiennent pas encore.
- Dans les builds de production Tauri équipés de l’updater, l’application vérifie les mises à jour au démarrage puis toutes les six heures. Une version plus récente est téléchargée en arrière-plan ; une notification propose ensuite l’installation en un clic et le redémarrage.
- L’installation redémarre l’application : rappeler aux utilisateurs d’exporter leurs modifications PDF avant de l’installer. Le mode web et le mode développement ne permettent pas de valider à eux seuls l’installation d’une mise à jour native.

---

# Consignes de conception web — identité originale et UX solide

Utilise ces consignes pour concevoir ou améliorer une interface web. Elles complètent le brief utilisateur et les conventions du projet ; elles ne les remplacent pas.

## Résultat attendu

Produis une interface qui paraît conçue pour ce produit, son public et son contenu — pas un assemblage de composants génériques. L’originalité doit renforcer la compréhension, la mémorisation et le plaisir d’usage. Elle ne doit jamais masquer l’action principale, ralentir inutilement la navigation ou dégrader l’accessibilité.

Une bonne proposition doit être simultanément :

- spécifique au sujet et reconnaissable ;
- immédiatement compréhensible ;
- cohérente à travers ses pages et ses états ;
- agréable sur mobile comme sur grand écran ;
- accessible, performante et réalisable avec la stack existante.

## Avant de dessiner ou coder

Commence par comprendre ce qui existe déjà : structure du projet, composants, tokens, contenu réel, assets, contraintes techniques et conventions. Ne remplace pas un système cohérent sans raison.

À partir du brief, déduis puis formule une direction compacte :

1. **Promesse** — ce que l’utilisateur doit comprendre ou accomplir en premier.
2. **Caractère** — trois adjectifs précis, par exemple « éditorial, tactile, espiègle » plutôt que « moderne et propre ».
3. **Public et contexte** — appareil, niveau d’expertise, fréquence d’utilisation et contraintes probables.
4. **Idée directrice** — une métaphore, un principe de composition ou un motif issu du produit.
5. **Geste signature** — un élément visuel ou interactif mémorable, utilisé avec retenue.

Quand le contenu ou l’objectif essentiel manque, demande-le. Sinon, avance avec des hypothèses explicites et facilement réversibles.

## Références et originalité

Si des références sont disponibles, analyse-les au lieu de les copier. Pour chacune, identifie séparément :

- la hiérarchie et la grille ;
- la typographie ;
- la palette et le contraste ;
- le rythme des espacements ;
- le traitement des images et illustrations ;
- les interactions et transitions ;
- ce qui sert réellement l’usage.

Combine des principes provenant de références différentes avec des éléments propres au produit. Ne reproduis ni une composition distinctive, ni une identité, ni des assets protégés.

Cherche l’originalité dans le rapport entre contenu, typographie, composition et interaction. Une interface n’a pas besoin d’être spectaculaire partout. Un seul geste signature bien exécuté vaut mieux qu’une accumulation d’effets.

Évite par défaut les automatismes suivants, sauf justification liée au brief :

- hero interchangeable avec grand slogan vague et mockup flottant ;
- dégradé violet/bleu, glow diffus et glassmorphism utilisés comme identité par défaut ;
- succession uniforme de cartes arrondies ;
- pictogrammes décoratifs sans information ;
- texte centré partout ;
- animations déclenchées sur chaque élément ;
- faux témoignages, fausses métriques ou contenu de remplissage présenté comme réel ;
- copie visuelle d’un produit connu sans adaptation au contexte.

## Système visuel

Définis peu de règles, mais rends-les manifestes et cohérentes.

### Typographie

- Choisis les caractères selon le ton, les langues utilisées et les besoins de lecture.
- Crée une hiérarchie clairement perceptible sans dépendre uniquement de la taille.
- Contrôle largeur de ligne, interlignage, graisse, contraste et rythme vertical.
- Réserve les traitements expressifs aux zones courtes. Le texte fonctionnel doit rester très lisible.
- Utilise une vraie échelle typographique et évite les tailles presque identiques sans fonction distincte.

### Couleur

- Pars d’une palette réduite : fond, surface, texte, texte secondaire, bordure et accent fonctionnel.
- Donne un rôle à chaque couleur. Ne fais pas reposer un état uniquement sur la couleur.
- Vérifie le contraste des textes, contrôles, focus, états désactivés et contenus superposés à des images.
- Prévois les thèmes sombre et clair seulement s’ils sont demandés ou réellement utiles.

### Composition

- Utilise une grille et une échelle d’espacement cohérentes, puis autorise quelques ruptures intentionnelles.
- Fais varier densité, largeur et alignement pour créer un rythme ; ne transforme pas chaque section en bloc autonome identique.
- L’asymétrie doit guider l’œil, pas donner l’impression d’une mise en page cassée.
- L’espace vide sert la hiérarchie. Il ne compense pas un manque de contenu.
- Utilise des bordures, rayons et ombres comme langage cohérent, pas comme décor systématique.

### Images et matière

- Préfère des assets pertinents et de bonne qualité à des placeholders génériques.
- Définis un traitement commun : cadrage, ratio, contraste, grain, couleur ou découpe.
- Fournis des dimensions stables et des alternatives textuelles appropriées.
- Si aucun asset pertinent n’existe, compose avec la typographie et la mise en page plutôt que d’inventer une illustration décorative médiocre.

## Architecture de l’expérience

Conçois d’abord le parcours principal et les décisions de l’utilisateur.

- Chaque écran doit avoir une intention dominante et une action principale identifiable.
- La navigation doit indiquer où l’utilisateur se trouve et comment revenir.
- Place l’information nécessaire avant la décision qu’elle éclaire.
- Utilise la divulgation progressive pour les fonctions avancées ; ne cache pas les fonctions essentielles.
- Préserve les conventions familières pour les actions à risque, les formulaires, la navigation et les contrôles média.
- Rédige des libellés concrets. Évite les CTA ambigus comme « Découvrir » lorsque l’action peut être nommée précisément.

Prévois les états réels du produit : chargement, vide, erreur, succès, hors connexion si pertinent, contenu long, données absentes, permissions refusées et latence. Un écran nominal élégant ne suffit pas.

### Formulaires et actions

- Associe chaque champ à un label persistant.
- Explique format et contraintes avant l’erreur lorsque cela aide.
- Place les messages d’erreur près de leur cause et indique comment corriger.
- Ne supprime pas une saisie valide après une erreur.
- Distingue clairement action principale, action secondaire et action destructive.
- Demande une confirmation ou offre une annulation pour les conséquences difficiles à inverser.

## Responsive

Ne réduis pas simplement la version desktop.

- Identifie ce qui doit rester visible, se déplacer, se condenser ou disparaître à chaque largeur.
- Teste les contenus longs, les langues plus verboses, le zoom et les tailles de police agrandies.
- Évite les largeurs, hauteurs et positions absolues qui supposent un contenu fixe.
- Offre des cibles tactiles confortables et suffisamment espacées.
- Aucun contenu essentiel ni contrôle ne doit être inaccessible à cause d’un débordement horizontal.
- Les interactions basées sur le survol doivent disposer d’un équivalent tactile et clavier.

## Mouvement et feedback

Utilise le mouvement pour expliquer une relation, confirmer une action, maintenir le contexte ou créer le geste signature.

- Anime de préférence `transform` et `opacity`.
- Garde les interactions fréquentes rapides et les transitions structurelles plus posées.
- Évite de retarder une action pour montrer une animation.
- Les éléments qui apparaissent ensemble doivent sembler appartenir au même mouvement.
- Respecte `prefers-reduced-motion` et fournis une version stable sans mouvement essentiel.
- Ne détourne pas le scroll, le pointeur ou les raccourcis natifs sans bénéfice clair et solution de repli.

Les états hover, active, focus, loading, disabled, selected et success doivent être intentionnels. Une interaction doit répondre immédiatement, même lorsque son résultat prend du temps.

## Accessibilité et sémantique

- Utilise les éléments HTML natifs correspondant à leur fonction avant d’ajouter ARIA.
- Assure un ordre de lecture et de tabulation logique.
- Rends le focus clavier visible et ne le masque jamais sans remplacement équivalent.
- Les dialogues doivent gérer focus initial, piégeage du focus, fermeture et restitution du focus.
- Les images informatives ont un texte alternatif ; les images décoratives sont ignorées par les technologies d’assistance.
- Les messages dynamiques importants doivent être annoncés sans provoquer de verbosité permanente.
- Vérifie le contraste, le zoom, la navigation clavier et les préférences de mouvement.

## Implémentation

- Réutilise la stack et les primitives du projet lorsqu’elles conviennent.
- Centralise les tokens importants avec des variables CSS ou le système de thème existant.
- Crée un composant lorsqu’il existe une unité sémantique ou un motif réellement répété, pas pour chaque wrapper.
- Garde le contenu séparé de la décoration quand cela facilite la maintenance, la traduction ou les états dynamiques.
- N’ajoute pas une dépendance lourde pour un effet simple réalisable proprement avec la plateforme.
- Charge les médias avec des dimensions stables et évite les déplacements de mise en page.
- Dégrade les effets avancés avec élégance sur les appareils moins puissants.

Ne sacrifie pas la qualité fonctionnelle à la fidélité visuelle : liens, formulaires, navigation, historique, sélection de texte et contrôles natifs doivent continuer à fonctionner normalement.

## Boucle de critique visuelle

Quand un navigateur ou un outil de capture est disponible, ne considère pas l’interface terminée après la première compilation.

1. Lance l’application avec des données représentatives.
2. Observe au minimum un grand écran et un écran mobile ; ajoute les largeurs intermédiaires si la composition change fortement.
3. Capture les pages et les états importants.
4. Critique le résultat comme un directeur artistique et un testeur UX : hiérarchie, densité, alignements, lisibilité, cohérence, débordements, contenu réel, feedback et action principale.
5. Corrige les causes structurelles avant les détails cosmétiques.
6. Recommence jusqu’à ce qu’aucun problème majeur visible ou fonctionnel ne subsiste.

Ne valide pas une interface uniquement à partir du code. Les erreurs d’équilibre, de rythme, de contraste ou de responsive se découvrent dans le rendu.

## Ordre de décision en cas de conflit

Arbitre dans cet ordre :

1. tâche et besoins explicites de l’utilisateur ;
2. compréhension, accomplissement de la tâche et prévention des erreurs ;
3. accessibilité et fonctionnement ;
4. cohérence avec le produit existant ;
5. performance et maintenabilité ;
6. originalité et effets visuels.

L’originalité ne justifie jamais une expérience confuse. À l’inverse, une bonne UX ne nécessite pas une apparence générique : conserve les conventions d’interaction et innove dans l’expression.

## Critères de livraison

Avant de terminer, vérifie que :

- la proposition possède une idée directrice identifiable ;
- l’action et l’information principales sont évidentes ;
- la typographie, les couleurs, les espacements et les formes suivent un système ;
- le contenu paraît réel et spécifique au produit ;
- les états de chargement, vide, erreur et succès pertinents existent ;
- l’interface fonctionne au clavier et expose un focus visible ;
- le contraste et la réduction des animations sont pris en charge ;
- les versions mobile et desktop ont été observées dans un navigateur ;
- aucun débordement, saut de mise en page ou contrôle inaccessible n’est visible ;
- les effets distinctifs servent l’expérience et restent performants ;
- le résultat ne ressemble pas à une landing page IA interchangeable.

Dans le compte rendu final, résume la direction choisie, les décisions UX importantes, les vérifications effectuées et les compromis ou limites encore présents.
