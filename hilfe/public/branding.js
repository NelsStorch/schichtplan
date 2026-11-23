// GENERIERT aus hilfe/branding.template.js und packages/shared/src/organizations.ts (npm run generate).
// Nicht von Hand aendern: Verbandsdaten (Domain, Name, Farbe, Logo) kommen aus organizations.ts.
// Client-seitiges dynamisches Branding & Favicon fuer alle Verbaende / Organisationen.
(function () {
  const ORGS = {
    "cevi": {
      "slug": "cevi",
      "name": "Cevi Schichtplan",
      "shortName": "Cevi",
      "domain": "cevi-schichtplan.ch",
      "unitTerm": "Abteilung",
      "unitTermPlural": "Abteilungen",
      "leadTerm": "Abteilungsleitung",
      "nicknameTerm": "Cevi-Name",
      "authProvider": "Cevi.DB (Hitobito)",
      "logo": "/cevi-logo.svg",
      "notice": "Kein offizielles Angebot von Cevi Schweiz.",
      "accent": "225 29 72",
      "accentInkLight": "190 18 60",
      "accentInkDark": "251 113 133",
      "accentFg": "255 255 255"
    },
    "pfadi": {
      "slug": "pfadi",
      "name": "Pfadi Schichtplan",
      "shortName": "Pfadi",
      "domain": "pfadi-schichtplan.ch",
      "unitTerm": "Abteilung",
      "unitTermPlural": "Abteilungen",
      "leadTerm": "Abteilungsleitung",
      "nicknameTerm": "Pfadiname",
      "authProvider": "PBS MiData (Hitobito)",
      "logo": "/pfadi-schichtplan-logo.svg",
      "notice": "Unabhängiges Projekt, nicht von der Pfadibewegung Schweiz (PBS) betrieben oder herausgegeben.",
      "accent": "32 85 62",
      "accentInkLight": "32 85 62",
      "accentInkDark": "93 187 138",
      "accentFg": "255 255 255"
    },
    "jubla": {
      "slug": "jubla",
      "name": "Jubla Schichtplan",
      "shortName": "Jubla",
      "domain": "jubla-schichtplan.ch",
      "unitTerm": "Schar",
      "unitTermPlural": "Scharen",
      "leadTerm": "Scharleitung",
      "nicknameTerm": "Leitername",
      "authProvider": "Jubla-Datenbank (Hitobito)",
      "logo": "/jubla-logo.svg",
      "notice": "Kein offizielles Angebot von Jungwacht Blauring Schweiz.",
      "accent": "40 53 131",
      "accentInkLight": "40 53 131",
      "accentInkDark": "102 177 226",
      "accentFg": "255 255 255"
    },
    "verein": {
      "slug": "verein",
      "name": "Vereins Schichtplan",
      "shortName": "Verein",
      "domain": "vereins-schichtplan.ch",
      "unitTerm": "Verein",
      "unitTermPlural": "Vereine",
      "leadTerm": "Vereinsleitung / Vorstand",
      "nicknameTerm": "Spitzname",
      "authProvider": "E-Mail & Passwort",
      "logo": "/verein-logo.svg",
      "accent": "37 99 235",
      "accentInkLight": "29 78 216",
      "accentInkDark": "147 197 253",
      "accentFg": "255 255 255"
    }
  };
  // Auch fuer andere Skripte der Seite (z. B. den Ruecksprung in der Kopfzeile)
  window.SCHICHTPLAN_ORGS = ORGS;

  // Verband aus einem Hostnamen oder einer Rücksprung-URL. Massgebend ist das Domain-Ende: Eine Cevi-Abteilung
  // «pfadi-wald.cevi-schichtplan.ch» bleibt Cevi. Nur ohne Verbandsdomain (lokal, z. B. pfadi.localhost) zählt
  // die Kennung im Namen: erst die Verbände mit eigener Kennung, dann Cevi.
  function orgFromText(text) {
    let host = String(text || '').toLowerCase();
    try {
      if (host.includes('://')) host = new URL(host).hostname;
    } catch (_) {
      return null;
    }
    host = host.replace(/\.$/, '');
    const byDomain = Object.values(ORGS).find((o) => host === o.domain || host.endsWith('.' + o.domain));
    if (byDomain) return byDomain;
    const own = Object.values(ORGS).find((o) => o.slug !== 'cevi' && host.includes(o.slug));
    if (own) return own;
    return host.includes('cevi') ? ORGS.cevi : null;
  }

  function detectOrg() {
    const host = window.location.hostname.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const orgParam = params.get('org');
    // Nur eigene Schlüssel: «?org=__proto__» oder «?org=constructor» würde sonst ein Objekt ohne Verbandsdaten liefern
    if (orgParam && Object.prototype.hasOwnProperty.call(ORGS, orgParam)) return ORGS[orgParam];

    // Der Host der Hilfe-Seite hat Vorrang vor einem gemerkten Rücksprung
    const byHost = orgFromText(host);
    if (byHost) return byHost;

    // Check referrer or sessionStorage for return_url
    try {
      const returnUrl = sessionStorage.getItem('schichtplan_return_url');
      if (returnUrl) {
        const byReturn = orgFromText(returnUrl);
        if (byReturn) return byReturn;
      }
    } catch (_) {}

    return ORGS.cevi;
  }

  const org = detectOrg();

  // 1. CSS-Variablen sofort auf :root setzen (verhindert FOUC)
  function applyThemeVariables() {
    const root = document.documentElement;
    root.setAttribute('data-org', org.slug);
    root.style.setProperty('--accent', org.accent);
    root.style.setProperty('--accent-fg', org.accentFg);
    root.style.setProperty('--accent-ink-light', org.accentInkLight);
    root.style.setProperty('--accent-ink-dark', org.accentInkDark);

    const isDark =
      root.dataset.theme === 'dark' ||
      (root.dataset.theme !== 'light' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.style.setProperty(
      '--accent-ink',
      isDark ? org.accentInkDark : org.accentInkLight
    );
  }

  // 2. Favicon & Apple-Touch-Icon dynamisch setzen
  function applyFavicon() {
    if (!document.head) return;
    const iconUrl = org.logo;

    // Bestehende Icon-Tags entfernen/bereinigen, damit der Browser nicht das alte Icon cached
    document.querySelectorAll("link[rel*='icon']").forEach((el) => el.remove());

    const iconLink = document.createElement('link');
    iconLink.rel = 'icon';
    iconLink.type = 'image/svg+xml';
    iconLink.href = iconUrl;
    document.head.appendChild(iconLink);

    const appleLink = document.createElement('link');
    appleLink.rel = 'apple-touch-icon';
    appleLink.href = iconUrl;
    document.head.appendChild(appleLink);
  }

  applyThemeVariables();
  applyFavicon();

  // Theme-Umschaltung beobachten
  const observer = new MutationObserver(() => applyThemeVariables());
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  // 3. DOM-Elemente aktualisieren, sobald verfuegbar
  function updateDom() {
    applyThemeVariables();
    applyFavicon();

    const isFr = window.location.pathname.startsWith('/fr');
    const isIt = window.location.pathname.startsWith('/it');
    const isEn = window.location.pathname.startsWith('/en');
    const privacyPath = isFr ? '/fr/protection-des-donnees' : isIt ? '/it/protezione-dei-dati' : isEn ? '/en/privacy' : '/datenschutz';
    const termsPath = isFr ? '/fr/conditions-utilisation' : isIt ? '/it/condizioni-di-utilizzo' : isEn ? '/en/terms' : '/nutzungsbedingungen';
    const imprintPath = isFr ? '/fr/mentions-legales' : isIt ? '/it/colophon' : isEn ? '/en/imprint' : '/impressum';

    // Logo & Titel im Header
    document.querySelectorAll('[data-org-logo]').forEach((img) => {
      img.setAttribute('src', org.logo);
      img.setAttribute('alt', `${org.name} Logo`);
    });

    document.querySelectorAll('[data-org-sub]').forEach((el) => {
      el.textContent = org.name;
    });

    document.querySelectorAll('[data-org-title-link]').forEach((el) => {
      const titleLabel = isFr ? `${org.name} Aide, page d’accueil` : isIt ? `${org.name} Guida, pagina iniziale` : isEn ? `${org.name} Help, home` : `${org.name} Hilfe, Startseite`;
      el.setAttribute('aria-label', titleLabel);
    });

    // App-Links & Ruecksprung
    document.querySelectorAll('[data-app-link]').forEach((a) => {
      const current = a.getAttribute('href') || '';
      if (current.includes('cevi-schichtplan.ch') && org.slug !== 'cevi') {
        a.setAttribute('href', `https://${org.domain}`);
      }
    });

    // Footer-Elemente
    document.querySelectorAll('[data-footer-copyright]').forEach((el) => {
      const year = new Date().getFullYear();
      const volunteerText = isFr ? 'bénévolat & Open Source' : isIt ? 'volontariato & Open Source' : isEn ? 'volunteer & Open Source' : 'ehrenamtlich & Open Source';
      el.innerHTML = `&copy; ${year} ${org.name} &middot; ${volunteerText}${org.notice ? ' &middot; ' + org.notice : ''}`;
    });

    document.querySelectorAll('[data-footer-app-domain]').forEach((a) => {
      a.setAttribute('href', `https://${org.domain}`);
      a.textContent = org.domain;
    });

    document.querySelectorAll('[data-footer-login-domain]').forEach((a) => {
      a.setAttribute('href', `https://login.${org.domain}`);
    });

    document.querySelectorAll('[data-footer-status-domain]').forEach((a) => {
      a.setAttribute('href', `https://status.${org.domain}`);
    });

    document.querySelectorAll('[data-footer-privacy-domain]').forEach((a) => {
      a.setAttribute('href', `https://${org.domain}${privacyPath}`);
      if (isFr) a.textContent = 'Protection des données';
      else if (isIt) a.textContent = 'Protezione dei dati';
      else if (isEn) a.textContent = 'Privacy';
      else a.textContent = 'Datenschutz';
    });

    document.querySelectorAll('[data-footer-terms-domain]').forEach((a) => {
      a.setAttribute('href', `https://${org.domain}${termsPath}`);
      if (isFr) a.textContent = 'Conditions d’utilisation';
      else if (isIt) a.textContent = 'Condizioni';
      else if (isEn) a.textContent = 'Terms';
      else a.textContent = 'Nutzungsbedingungen';
    });

    document.querySelectorAll('[data-footer-imprint-domain]').forEach((a) => {
      a.setAttribute('href', `https://${org.domain}${imprintPath}`);
      if (isFr) a.textContent = 'Mentions légales';
      else if (isIt) a.textContent = 'Colophon';
      else if (isEn) a.textContent = 'Imprint';
      else a.textContent = 'Impressum';
    });

    // Seitentitel im Tab aktualisieren (falls noetig)
    if (document.title.includes('Cevi Schichtplan') && org.slug !== 'cevi') {
      document.title = document.title.replace(/Cevi Schichtplan/g, org.name);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateDom);
  } else {
    updateDom();
  }
})();
