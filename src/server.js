const express = require("express");
const { simulateAspLogin } = require("./services/asp-login.service");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware CORS - autoriser toutes les origines
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Répondre immédiatement aux requêtes preflight OPTIONS
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Middleware pour parser le JSON
app.use(express.json());

/**
 * POST /api/login
 * Body: { username: string, password: string }
 * Response: { is_success: boolean, error_message: string | null }
 */
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  // Validation des paramètres
  if (!username || !password) {
    return res.status(400).json({
      is_success: false,
      error_message: "Les champs username et password sont requis",
    });
  }

  try {
    console.log(`[LOGIN] Tentative de connexion pour: ${username}`);

    const result = await simulateAspLogin(username, password);

    console.log(`[LOGIN] Résultat: ${result.is_success ? "Succès" : "Échec"}`);
    if (result.error_message) {
      console.log(`[LOGIN] Message: ${result.error_message}`);
    }

    return res.json(result);
  } catch (error) {
    console.error("[LOGIN] Erreur inattendue:", error);
    return res.status(500).json({
      is_success: false,
      error_message: `Erreur serveur: ${error.message}`,
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📍 Endpoint: POST /api/login`);
  console.log(
    `   Body: { "username": "prenom.nom", "password": "votre_mot_de_passe" }`
  );
});
