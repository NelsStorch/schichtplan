/**
 * Spuren gelöschter Personen entfernen (Recht auf Löschung, Art. 32 DSG).
 *
 * Protokolle und der Nachrichtenverlauf haben bewusst keine Kaskade auf Personen: Die Einträge sollen
 * eine Löschung überleben, damit Abteilung und Admins nachvollziehen können, was passiert ist. Namen,
 * E-Mail-Adressen und IDs der gelöschten Person haben darin danach aber nichts mehr zu suchen. Diese
 * Funktion ersetzt sie durch «Gelöschte Person». Aufrufen innerhalb derselben Transaktion, direkt bevor
 * die Konten gelöscht werden (Selbstlöschung, Löschung im Admin-Portal, Löschung inaktiver Konten).
 */
import { Prisma } from '../db.js';

export const DELETED_PERSON_LABEL = 'Gelöschte Person';

type Tx = Prisma.TransactionClient;

export async function anonymizeUserTraces(tx: Tx, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;

  // Protokoll der Ein- und Austragungen
  await tx.shiftSignupLog.updateMany({
    where: { helperUserId: { in: userIds } },
    data: { helperUserId: null, helperName: DELETED_PERSON_LABEL },
  });
  await tx.shiftSignupLog.updateMany({
    where: { performedByUserId: { in: userIds } },
    data: { performedByUserId: null, performedByName: DELETED_PERSON_LABEL },
  });

  // Nachrichtenverlauf des OK: Absender*in und Liste der Empfänger*innen
  await tx.eventMessage.updateMany({
    where: { sentByUserId: { in: userIds } },
    data: { sentByUserId: null, sentByName: DELETED_PERSON_LABEL },
  });
  await tx.$executeRaw`
    UPDATE event_messages
    SET recipient_user_ids = ARRAY(SELECT unnest(recipient_user_ids) EXCEPT SELECT unnest(${userIds}::text[]))
    WHERE recipient_user_ids && ${userIds}::text[]`;

  // Protokoll der Abteilung (Details können Namen und E-Mail enthalten)
  await tx.departmentAuditLog.updateMany({
    where: { actorId: { in: userIds } },
    data: { actorId: null, actorName: DELETED_PERSON_LABEL },
  });
  await tx.departmentAuditLog.updateMany({
    where: { targetUserId: { in: userIds } },
    data: { targetUserId: null, targetLabel: DELETED_PERSON_LABEL, details: Prisma.DbNull },
  });

  // Protokoll des Admin-Portals: Die Aktion bleibt, die Person nicht
  await tx.adminAuditLog.updateMany({
    where: { adminId: { in: userIds } },
    data: { adminId: null, adminName: DELETED_PERSON_LABEL },
  });
  await tx.adminAuditLog.updateMany({
    where: { targetType: 'USER', targetId: { in: userIds } },
    data: { targetId: null, targetLabel: DELETED_PERSON_LABEL, details: Prisma.DbNull },
  });
}

/**
 * Eintragungen eines automatisch gelöschten Kontos (inaktiv) im Anlass stehen lassen, aber anonym:
 * Die Schicht bleibt besetzt (Planung und Statistik des Anlasses stimmen weiter), ohne Namen,
 * Kontaktdaten, Notizen und Antworten. Muss vor dem Löschen des Kontos laufen (sonst Kaskade).
 */
export async function detachSignupsAnonymously(tx: Tx, userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const signups = await tx.shiftSignup.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const ids = signups.map((s) => s.id);
  if (ids.length === 0) return 0;
  await tx.shiftSignupAnswer.deleteMany({ where: { signupId: { in: ids } } });
  // Offene Bons hängen an der Person und verfallen mit ihr, eingelöste bleiben für die Abrechnung
  await tx.cateringToken.updateMany({
    where: { shiftSignupId: { in: ids }, status: 'REDEEMED' },
    data: { userId: null },
  });
  await tx.cateringToken.deleteMany({ where: { shiftSignupId: { in: ids }, status: { not: 'REDEEMED' } } });
  await tx.shiftSignup.updateMany({
    where: { id: { in: ids } },
    data: {
      userId: null,
      guestName: DELETED_PERSON_LABEL,
      guestEmail: null,
      guestPhone: null,
      notes: null,
      replacementNote: null,
      replacementWantedAt: null,
    },
  });
  return ids.length;
}
