# Inscribe

Éditeur PDF local construit avec SvelteKit et Tauri. Il permet d’ouvrir un PDF, de réorganiser, dupliquer ou supprimer des pages, de réunir deux PDF et d’exporter le résultat.

Dans l’éditeur, glissez les miniatures pour changer l’ordre des pages. Les flèches sous chaque page offrent la même action au clavier et sur écran tactile.

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
