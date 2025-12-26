const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

// URL du portail - il redirigera automatiquement vers la page de login avec des paramètres frais
const PORTAL_URL = 'https://sylae.asp.gouv.fr/portail-employeur/';

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
 * Lance le navigateur avec la bonne configuration selon l'environnement
 */
async function launchBrowser() {
  // En production (Render, AWS, etc.), utiliser @sparticuz/chromium
  if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }
  
  // En local, essayer de trouver Chrome installé sur le système
  const possiblePaths = [
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];

  let executablePath = null;
  const fs = require('fs');
  
  for (const path of possiblePaths) {
    if (fs.existsSync(path)) {
      executablePath = path;
      break;
    }
  }

  if (!executablePath) {
    throw new Error('Chrome non trouvé. Installez Google Chrome ou définissez NODE_ENV=production pour utiliser @sparticuz/chromium');
  }

  return puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });
}

/**
 * Simule une connexion sur ASP Connect
 * @param {string} username - L'identifiant de l'utilisateur (format: prenom.nom)
 * @param {string} password - Le mot de passe
 * @returns {Promise<{is_success: boolean, error_message: string|null}>}
 */
async function simulateAspLogin(username, password) {
  let browser = null;

  try {
    console.log('[PUPPETEER] Lancement du navigateur...');
    browser = await launchBrowser();

    const page = await browser.newPage();

    // Configuration du viewport
    await page.setViewport({ width: 1280, height: 800 });

    // Configuration du User-Agent pour paraître plus légitime
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log('[PUPPETEER] Navigation vers le portail...');
    
    // Navigation vers le portail - il redirigera vers la page de login
    await page.goto(PORTAL_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('[PUPPETEER] URL après redirection:', page.url());

    // Attendre que le formulaire de login soit visible
    await page.waitForSelector(SELECTORS.usernameInput, { timeout: 15000 });
    
    console.log('[PUPPETEER] Formulaire de connexion trouvé');

    console.log('[PUPPETEER] Remplissage du formulaire...');

    // Remplir le champ username
    await page.type(SELECTORS.usernameInput, username, { delay: 50 });

    // Remplir le champ password
    await page.type(SELECTORS.passwordInput, password, { delay: 50 });

    console.log('[PUPPETEER] Soumission du formulaire...');

    // Cliquer sur le bouton de connexion
    await page.click(SELECTORS.loginButton);
    
    // Attendre soit une navigation, soit un message d'erreur
    try {
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        page.waitForSelector('.asp-alert--error, .fr-alert--error, .kc-feedback-text', { timeout: 30000 })
      ]);
    } catch (e) {
      console.log('[PUPPETEER] Timeout en attendant la réponse');
    }

    // Petite pause pour laisser la page se stabiliser
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Vérifier l'URL actuelle
    const currentUrl = page.url();
    console.log('[PUPPETEER] URL actuelle:', currentUrl);

    // Chercher d'abord s'il y a un message d'erreur visible
    const errorMessage = await extractErrorMessage(page);
    if (errorMessage) {
      console.log('[PUPPETEER] Message d\'erreur trouvé:', errorMessage);
      return {
        is_success: false,
        error_message: errorMessage
      };
    }

    // Si on est redirigé vers le portail (pas sur la page d'auth) = succès
    if (currentUrl.includes('sylae.asp.gouv.fr/portail-employeur') && !currentUrl.includes('authkey')) {
      console.log('[PUPPETEER] Connexion réussie - redirection vers le portail');
      return {
        is_success: true,
        error_message: null
      };
    }

    // Si on est encore sur la page d'authentification sans message d'erreur visible
    if (currentUrl.includes('authkey.asp-public.fr') || currentUrl.includes('login-actions')) {
      // Vérifier le contenu de la page pour plus d'infos
      const pageTitle = await page.title();
      console.log('[PUPPETEER] Titre de la page:', pageTitle);
      
      return {
        is_success: false,
        error_message: 'Identifiant ou mot de passe incorrect/inconnu'
      };
    }

    // Cas indéterminé
    console.log('[PUPPETEER] État indéterminé');
    return {
      is_success: false,
      error_message: 'État de connexion indéterminé'
    };

  } catch (error) {
    console.error('[PUPPETEER] Erreur:', error.message);
    return {
      is_success: false,
      error_message: `Erreur lors de la tentative de connexion: ${error.message}`
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Extrait le message d'erreur de la page
 * @param {import('puppeteer-core').Page} page
 * @returns {Promise<string|null>}
 */
async function extractErrorMessage(page) {
  try {
    // Sélecteurs spécifiques au site ASP Connect
    const errorSelectors = [
      // Alerte ASP personnalisée
      '.asp-alert--error p',
      '.asp-alert--error',
      '#error-message',
      // DSFR alerts
      '.fr-alert--error p',
      '.fr-alert--error .fr-alert__title',
      '.fr-alert--error',
      // Keycloak
      '.kc-feedback-text',
      '.alert-error',
      '#kc-content-wrapper .alert',
      // Messages génériques
      '[role="alert"] p',
      '[role="alert"]',
      '.error-message',
      '.fr-error-text'
    ];

    for (const selector of errorSelectors) {
      const element = await page.$(selector);
      if (element) {
        // Vérifier si l'élément est visible
        const isVisible = await page.evaluate(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
        }, element);
        
        if (isVisible) {
          const text = await page.evaluate(el => el.textContent, element);
          const cleanText = text?.trim();
          if (cleanText && cleanText.length > 0 && cleanText.length < 500) {
            return cleanText;
          }
        }
      }
    }

    // Chercher dans le HTML brut
    const pageContent = await page.content();
    
    // Pattern pour les messages d'erreur ASP
    const patterns = [
      /id="error-message"[^>]*>([^<]+)</i,
      /class="[^"]*asp-alert--error[^"]*"[^>]*>.*?<p[^>]*>([^<]+)</is,
      /class="[^"]*kc-feedback-text[^"]*"[^>]*>([^<]+)</i
    ];
    
    for (const pattern of patterns) {
      const match = pageContent.match(pattern);
      if (match && match[1]) {
        const cleanText = match[1].trim();
        if (cleanText.length > 0) {
          return cleanText;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('[PUPPETEER] Erreur lors de l\'extraction du message:', error);
    return null;
  }
}

module.exports = { simulateAspLogin };
