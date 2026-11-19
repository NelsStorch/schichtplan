'use client';

import { useEffect } from 'react';

/** Alte Adresse: der Push-Schalter steht im Konto-Dialog */
export default function NotificationsRedirectPage() {
  useEffect(() => {
    window.location.replace('/?konto=push');
  }, []);

  return null;
}
