# Simple RAG

![CI](https://github.com/pabiosoft/simple-rag/actions/workflows/ci.yml/badge.svg)

Un chatbot RAG minimal pour interroger vos documents (PDF / Excel / JSON) avec une UI propre et un mini espace admin.

## Aperçu

**Chat**
![Home](./backend/public/images/home.png)

**Admin**
![Admin](./backend/public/images/admin.png)

## Fonctionnalités

- Chat RAG avec sources
- Upload universel (PDF / Excel / JSON)
- Indexation ciblée par dossier (récursive)
- Réindexation complète du corpus

## Démarrage rapide

```bash
# 1) Configurer
cd backend
cp .env.example .env
# Ajoutez vos clés

# 2) Lancer
cd ..
docker compose up --build

# 3) Indexer (dev)
docker compose exec backend npm run index:dev
```

## Routes utiles

- `GET /` : Chat
- `GET /admin` : Admin (upload + indexation)
- `POST /corpus/upload/universal` : Upload (multipart/form-data)
- `POST /ask` : Question RAG

## /ask (API)

```bash
POST /ask
{
  "question": "..."
}
```

Options (stateless, pour apps externes) :

```json
{
  "question": "...",
  "conversation_id": "uuid",
  "last_topic": "...",
  "last_answer": "...",
  "last_question": "..."
}
```

Format brut (debug) :

```
/ask?row-json=true
```

Exemple standard (inclut `sources`) :

```json
{
  "answer": "Le code foncier et domanial en Guinée définit les principes du droit de propriété...",
  "followups": [
    "Si tu veux, on peut approfondir les baux et les droits réels.",
    "Si tu veux, je peux expliquer la procédure d'immatriculation foncière."
  ],
  "sources": [
    {
      "title": "PDF: code-foncier-et-domanial [Partie 8/9]",
      "author": "team_interne",
      "date": "2026-02-04",
      "score": 0.47
    },
    {
      "title": "PDF: code-foncier-et-domanial [Partie 1/9]",
      "author": "team_interne",
      "date": "2026-02-04",
      "score": 0.46
    }
  ]
}
```

Voici un exemple prêt à envoyer à ton agent (format brut de `/ask?row-json=true`, à parser côté client : Angular/Vue/React) :

```json
{
  "raw": "{\"answer\":\"Le code foncier et domanial en Guinée définit les principes du droit de propriété, les procédures d'immatriculation, et les droits réels concédés sur la propriété d'autrui. Il encadre la reconnaissance de la propriété, la gestion des commissions foncières et les règles d'expropriation pour utilité publique. Il précise aussi les servitudes et la publicité foncière, afin d'assurer la sécurité juridique des transactions immobilières.\\n\\n### Points clés\\n1. **Droit de propriété** : principes généraux et garanties.\\n2. **Immatriculation foncière** : registre foncier et procédure.\\n3. **Droits réels** : bail emphytéotique, superficie, antichrèse.\\n4. **Expropriation** : conditions et indemnisation.\\n\",\"followups\":[\"Si tu veux, on peut approfondir les baux et les droits réels.\",\"Si tu veux, je peux expliquer la procédure d'immatriculation foncière.\",\"Si tu veux, je peux résumer les règles d'expropriation.\"]}"
}
```

## Indexation ciblée

```bash
# Indexer un sous-dossier PDF (dev)
npm run index:dev 2026-03-02
```

## Config (KISS)

- `backend/config/settings/` : YAML (app + prompts)
- `backend/config/runtime/` : code config (chargement + exports)

## .env (exemple)

```
OPENAI_API_KEY=...
API_KEY=...
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
APP_COUNTRY=Guinée
ASSISTANT_MODE=hybrid
PROMPT_PROFILE=hybrid
ALLOWED_ORIGINS=https://example.com
```

## Déploiement

- `compose.prod.yml` (Qdrant + corpus persistants)
- Dockerfiles séparés `docker/` (dev/prod)

---
MIT
