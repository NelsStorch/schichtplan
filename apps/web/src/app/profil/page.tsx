'use client';

import { useEffect } from 'react';
import { getLandingUrl } from '@schichtplan/shared';

/**
 * Das Profil mit allen grösseren Einstellungen lebt auf der Startseite (cevi-schichtplan.ch/profil).
 * In der Abteilungs-App gibt es nur den kleinen Konto-Dialog; alte Links (auch `?tab=`) leiten weiter.
 * Ausnahme Benachrichtigungen: Push richtet man am besten in der (installierbaren) Abteilungs-App ein,
 * darum öffnen wir dafür den Konto-Dialog mit dem Push-Schalter.
 */
export default function DepartmentProfileRedirectPage() {
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'benachrichtigungen') {
      window.location.replace('/?konto=push');
      return;
    }
    window.location.replace(getLandingUrl(tab ? `/profil?tab=${encodeURIComponent(tab)}` : '/profil'));
  }, []);

  return null;
}
