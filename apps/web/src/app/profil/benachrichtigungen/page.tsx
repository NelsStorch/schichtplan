'use client';

import { useEffect } from 'react';

/** Alte Adresse: Push für diese Abteilungs-Adresse steht im Konto-Dialog */
export default function NotificationsRedirectPage() {
  useEffect(() => {
    window.location.replace('/?konto=push');
  }, []);

  return null;
}
