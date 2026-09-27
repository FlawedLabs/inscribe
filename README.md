# Inscribe

Éditeur PDF local construit avec SvelteKit et Tauri. Il permet d’ouvrir un PDF, de réorganiser, dupliquer ou supprimer des pages, de réunir deux PDF et d’exporter le résultat.

Dans l’éditeur, glissez les miniatures pour changer l’ordre des pages. Les flèches sous chaque page offrent la même action au clavier et sur écran tactile.

## Mises à jour de l’application

Sur l’accueil web, Inscribe propose l’installateur de la dernière release stable en fonction du système du visiteur. Sur macOS, choisissez Apple Silicon ou Intel ; le navigateur ne permet pas de distinguer ces processeurs de façon fiable. Le lien « Tous les installateurs » reste disponible pour choisir une autre version ou si GitHub est indisponible. Sur mobile, l’éditeur web reste accessible.

L’application vérifie les nouvelles versions au démarrage et périodiquement. Lorsqu’une version est disponible, elle se télécharge en arrière-plan. Une notification permet ensuite de l’installer en un clic ; l’application redémarre, donc exportez vos changements avant de lancer l’installation.

Les versions sont publiées sur GitHub en poussant un tag `v` correspondant à la version dans `package.json`, `src-tauri/Cargo.toml` et `src-tauri/tauri.conf.json` (par exemple `v0.1.0`). Le workflow construit les installateurs et leurs signatures de mise à jour pour macOS, Windows et Linux, puis publie la version. Configurez le secret GitHub Actions `TAURI_SIGNING_PRIVATE_KEY` avec la clé privée créée par `pnpm tauri signer generate`. La clé publique de vérification est dans `src-tauri/tauri.conf.json` ; conservez la clé privée en lieu sûr et ne la commitez jamais.

Les installations antérieures à l’activation du mécanisme de mise à jour doivent installer manuellement la première version signée. Les versions suivantes pourront être installées depuis l’application.

## Démarrer

Prérequis : Node.js 22.17 ou supérieur, pnpm 11 et Rust pour l’application Tauri.

```sh
pnpm install
pnpm tauri dev
```

L’interface web est également accessible avec `pnpm dev` sur `http://localhost:1420/`.

## Texte et formulaires

Dans la barre d’édition, le bouton **Ajouter du texte ou un formulaire** permet de créer du texte sélectionnable, un champ de texte, une case à cocher, une liste déroulante ou un groupe de boutons radio. Choisissez un outil, cliquez ou touchez une page, puis renseignez son contenu et ses dimensions. Le placement tient compte du zoom et de la rotation de la page.

Glissez un champ ou un texte ajouté pour le déplacer ; au clavier, utilisez **Alt + flèches**. Cliquez sur un champ pour modifier sa valeur ou son caractère obligatoire, ou pour le supprimer. Cliquez sur un bloc de texte pour modifier son contenu ou le supprimer. Les champs restent remplissables dans le PDF exporté. Le dernier ajout peut être annulé depuis le menu des outils tant qu’aucune autre modification n’a été effectuée. La police Mulish est intégrée au document et prend en charge les caractères latins, dont les accents français.

## Reconnaissance de texte

Dans l’éditeur, ouvrez **Outils texte → Reconnaître le texte**. Choisissez la langue, puis lancez l’OCR. Inscribe examine chaque page et traite uniquement celles qui ne contiennent pas déjà de texte sélectionnable. L’image d’origine est conservée ; un calque de texte transparent est ajouté au PDF. Exportez ensuite le document pour enregistrer le résultat.

Le moteur OCR et ses fichiers WebAssembly sont servis localement. Le modèle de langue français ou anglais est téléchargé lors de la première utilisation, puis mis en cache par Tesseract.js. Le PDF est traité sur l’appareil. La qualité de la reconnaissance dépend de la netteté du scan et de la langue sélectionnée.

## Vérifier

```sh
pnpm check
pnpm lint
pnpm exec vitest run
pnpm test:integration
pnpm build
```

Les tests unitaires vérifient l’édition, les annotations et les métadonnées PDF. Les tests d’intégration couvrent les parcours dans Chromium, dont les imports simultanés depuis plusieurs onglets et l’interface mobile. Le test OCR complet est optionnel : définir `OCR_E2E=1` pour l’exécuter avec le téléchargement du modèle de langue.
