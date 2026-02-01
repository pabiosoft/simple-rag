# RAG Chat Bot

Un bot Q/A open-source qui mélange des fichiers locaux (JSON / Excel / PDF) avec GPT via Qdrant. Pensé pour itérer vite et documenté pour accueillir des contributions.

## Points clés
- **Recherche vectorielle adaptative** (OpenAI embeddings + Qdrant)
-  **Uploader** via l’UI ou `POST /corpus/upload` (auto-classement des fichiers + indexation)
-  **Chat** propre (`POST /ask`) avec affichage des sources et fallback polie
-  **Tests inclus** (Vitest + Supertest) pour travailler en TDD

## Démarrage express
```bash
git clone https://github.com/pabiosoft/poc-node-et-ia-rag.git
cd poc-node-et-ia-rag/backend
cp .env.example .env              # renseigne OPENAI_API_KEY + Qdrant
docker compose up --build         # au niveau racine
docker compose exec nodeapp npm run index   # importe les documents présents 
```
Interface : http://localhost:8000. Qdrant : http://localhost:6333/dashboard.

## Ajouter des documents
- UI : formulaire “Ajouter un document” (interface type Swagger, réponse JSON visible).
- API : `POST /corpus/upload` avec `multipart/form-data` → le serveur détecte l’extension, sauvegarde sous `corpus/{json|excel|pdf}` et relance l’indexation ciblée.
- Pour réindexer tout le corpus : `docker compose exec nodeapp npm run index`.

## Lancer les tests
```bash
cd backend
npm install
npm run test            # unitaires + routes (Vitest)
npm run test -- routes  # exemple pour ne lancer qu’un sous-dossier
```
Les specs sont rangées dans `tests/routes/` (Supertest) et `tests/services/` (unitaires). Les utilitaires communs peuvent vivre dans `tests/helpers/`.

## Charte Contributeur
1. **Visibilité** : ouvrez une issue avant une PR lorsqu’il y a un changement fonctionnel.
2. **Qualité** : chaque PR inclut des tests ou une justification (mocks, skip) pour les zones sensibles.
3. **Style** : ESM, code commenté avec parcimonie, pas de secrets commité·es.
4. **Documentation** : mettez à jour ce README quand une API ou variable d’environnement évolue.
5. **Feedback** : gardez un ton factuel et proposez une solution alternative lorsqu’un point bloque.

## Licence
MIT — libre de forker, déployer, apprendre. Toute contribution est appréciée.
