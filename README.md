# ASP Login Simulator

Serveur API utilisant Puppeteer pour simuler une connexion sur ASP Connect (SYLAE).

## Installation

```bash
cd server-trust
npm install
```

## Utilisation

### Démarrer le serveur

```bash
npm start
# ou en mode développement avec watch
npm run dev
```

Le serveur démarre sur `http://localhost:3000` par défaut.

## API

### POST /api/login

Simule une tentative de connexion sur ASP Connect.

**Request Body:**
```json
{
  "username": "prenom.nom",
  "password": "votre_mot_de_passe"
}
```

**Response:**
```json
{
  "is_success": true,
  "error_message": null
}
```

ou en cas d'échec:
```json
{
  "is_success": false,
  "error_message": "Message d'erreur affiché sur la page"
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-26T10:00:00.000Z"
}
```

## Exemple avec cURL

```bash
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username": "prenom.nom", "password": "monmotdepasse"}'
```

## Notes

- Le navigateur Puppeteer tourne en mode headless (sans interface)
- Les timeouts sont configurés à 30 secondes pour la navigation
- Le serveur gère proprement les erreurs et ferme toujours le navigateur

