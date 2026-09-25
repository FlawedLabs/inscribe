# Inscribe

Éditeur PDF local construit avec SvelteKit et Tauri. Il permet d’ouvrir un PDF, de réorganiser, dupliquer ou supprimer des pages, de réunir deux PDF et d’exporter le résultat.

## Démarrer

Prérequis : Node.js, pnpm et Rust.

```sh
pnpm install
pnpm tauri dev
```

L’interface web est également accessible avec `pnpm dev` sur `http://localhost:1420/`.

## Reconnaissance de texte

Dans l’éditeur, ouvrez **Autres outils → Reconnaître le texte**. Choisissez la langue, puis lancez l’OCR. Inscribe examine chaque page et traite uniquement celles qui ne contiennent pas déjà de texte sélectionnable. L’image d’origine est conservée ; un calque de texte transparent est ajouté au PDF. Exportez ensuite le document pour enregistrer le résultat.

Le moteur OCR et ses fichiers WebAssembly sont servis localement. Le modèle de langue français ou anglais est téléchargé lors de la première utilisation, puis mis en cache par Tesseract.js. Le PDF est traité sur l’appareil. La qualité de la reconnaissance dépend de la netteté du scan et de la langue sélectionnée.

## Vérifier

```sh
pnpm check
pnpm build
```
