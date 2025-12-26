const puppeteer = require('puppeteer');

// URL de la page de connexion ASP Connect
const LOGIN_URL = 'https://authkey.asp-public.fr/iam/realms/calypso-x/protocol/openid-connect/auth?client_id=2a5e70139a25174f7bb832167e8f251d&redirect_uri=https%3A%2F%2Fsylae.asp.gouv.fr%2Fportail-employeur%2F&state=db9d31f0-4077-43df-b1ce-d5e4e5c86417&response_mode=fragment&response_type=code&scope=openid&nonce=6e517a1b-9cf7-4a71-b92f-10281a56f1e0&code_challenge=MVIwIfA-fmmqsfnw5_aNdMI_3xrbdUDTnfD-cnKoijA&code_challenge_method=S256';

// Sélecteurs CSS basés sur le HTML fourni
const SELECTORS = {
  usernameInput: '#username',
  passwordInput: '#password-input',
  loginButton: '#login-button',
  // Sélecteur pour les messages d'erreur (DSFR alert)
  errorAlert: '.fr-alert--error, .fr-message--error, [role="alert"]',
  // Sélecteur générique pour tout message d'erreur visible
  errorMessage: '.fr-error-text, .kc-feedback-text, .alert-error, .error-message'
};

/**
 * Simule une connexion sur ASP Connect
 * @param {string} username - L'identifiant de l'utilisateur (format: prenom.nom)
 * @param {string} password - Le mot de passe
 * @returns {Promise<{is_success: boolean, error_message: string|null}>}
 */
async function simulateAspLogin(username, password) {
  let browser = null;

  try {
    // Lancement du navigateur
    browser = await puppeteer.launch({
      headless: true, // Mode sans interface graphique
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    const page = await browser.newPage();

    // Configuration du viewport
    await page.setViewport({ width: 1280, height: 800 });

    // Configuration du User-Agent pour paraître plus légitime
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log('[PUPPETEER] Navigation vers la page de connexion...');
    
    // Navigation vers la page de login
    await page.goto(LOGIN_URL, {
      waitUntil: 'networkidle2', // Attendre que le réseau soit stable
      timeout: 30000
    });

    // Attendre que le formulaire soit visible
    await page.waitForSelector(SELECTORS.usernameInput, { timeout: 10000 });

    console.log('[PUPPETEER] Remplissage du formulaire...');

    // Remplir le champ username
    await page.type(SELECTORS.usernameInput, username, { delay: 50 });

    // Remplir le champ password
    await page.type(SELECTORS.passwordInput, password, { delay: 50 });

    console.log('[PUPPETEER] Soumission du formulaire...');

    // Cliquer sur le bouton de connexion et attendre la navigation
    await Promise.all([
      page.waitForNavigation({ 
        waitUntil: 'networkidle2',
        timeout: 30000 
      }).catch(() => null), // Ignore l'erreur si pas de navigation (erreur de login)
      page.click(SELECTORS.loginButton)
    ]);

    // Petite pause pour laisser la page se charger complètement
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Vérifier si on est toujours sur la page de login (= échec)
    const currentUrl = page.url();
    console.log('[PUPPETEER] URL actuelle:', currentUrl);

    // Si on est encore sur la page d'authentification, chercher le message d'erreur
    if (currentUrl.includes('authkey.asp-public.fr') || currentUrl.includes('login-actions')) {
      // Chercher les messages d'erreur
      const errorMessage = await extractErrorMessage(page);
      
      return {
        is_success: false,
        error_message: errorMessage || 'Échec de connexion (identifiants incorrects)'
      };
    }

    // Si redirection vers sylae.asp.gouv.fr = succès
    if (currentUrl.includes('sylae.asp') || currentUrl.includes('portail-employeur')) {
      return {
        is_success: true,
        error_message: null
      };
    }

    // Cas indéterminé - chercher quand même un message d'erreur
    const errorMessage = await extractErrorMessage(page);
    return {
      is_success: false,
      error_message: errorMessage || 'État de connexion indéterminé'
    };

  } catch (error) {
    console.error('[PUPPETEER] Erreur:', error.message);
    return {
      is_success: false,
      error_message: `Erreur lors de la tentative de connexion: ${error.message}`
    };
  } finally {
    // Toujours fermer le navigateur
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Extrait le message d'erreur de la page
 * @param {import('puppeteer').Page} page
 * @returns {Promise<string|null>}
 */
async function extractErrorMessage(page) {
  try {
    // Essayer plusieurs sélecteurs pour trouver le message d'erreur
    const errorSelectors = [
      // DSFR alerts
      '.fr-alert--error .fr-alert__title',
      '.fr-alert--error p',
      '.fr-alert--error',
      // Messages d'erreur Keycloak
      '.kc-feedback-text',
      '.alert-error',
      '#input-error',
      // Messages génériques
      '.error-message',
      '[role="alert"]',
      '.fr-error-text',
      // Message d'erreur dans le groupe de messages
      '#password-input-messages',
      '#username-messages'
    ];

    for (const selector of errorSelectors) {
      const element = await page.$(selector);
      if (element) {
        const text = await page.evaluate(el => el.textContent, element);
        const cleanText = text?.trim();
        if (cleanText && cleanText.length > 0) {
          return cleanText;
        }
      }
    }

    // Chercher tout élément contenant "erreur" ou "error" dans son texte
    const pageContent = await page.content();
    const errorMatch = pageContent.match(/class="[^"]*error[^"]*"[^>]*>([^<]+)</i);
    if (errorMatch && errorMatch[1]) {
      return errorMatch[1].trim();
    }

    return null;
  } catch (error) {
    console.error('[PUPPETEER] Erreur lors de l\'extraction du message:', error);
    return null;
  }
}

module.exports = { simulateAspLogin };

