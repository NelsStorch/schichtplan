import type { PrismaClient } from '../generated/prisma/client.js';
import { isPlaceholderEmail } from '@schichtplan/shared';
import { sendEmail, renderEmailTemplate } from './email.js';
import { resolveRecipientLocale, getTranslator, getEnabledLocales } from '@schichtplan/i18n';
import { sendPushToUser } from './webPush.js';
import { departmentPageUrl } from './shiftReminders.js';

/**
 * Sendet Bon-Erinnerungen (E-Mail und/oder Web Push) an Helfende mit offenen Bons:
 * 1. Schichtende-Erinnerung: ~30 Min nach Ende der Schicht (Fenster: 20–60 Min nach Schichtende)
 * 2. Festende-Erinnerung: ~1 Std vor Festende (Fenster: 40–80 Min vor der letzten Schicht des Anlasses)
 */
export async function sendDueCateringReminders(
  prisma: PrismaClient,
  now = new Date()
): Promise<number> {
  // Finde alle Events mit aktiven Bons und aktiver Erinnerung
  const events = await prisma.event.findMany({
    where: {
      cateringTokensEnabled: true,
      cateringRemindersEnabled: true,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      department: { select: { slug: true, name: true, organization: true, defaultLocale: true } },
      shifts: {
        select: {
          id: true,
          endTime: true,
        },
        orderBy: { endTime: 'desc' },
      },
    },
  });

  if (events.length === 0) return 0;

  let totalSent = 0;

  for (const event of events) {
    if (event.shifts.length === 0) continue;

    const lastShiftEnd = event.shifts[0].endTime;
    const msUntilFestEnd = lastShiftEnd.getTime() - now.getTime();
    // Ca. 1 Stunde vor Festende (Fenster 30 bis 90 Minuten vor der letzten Schicht)
    const isNearFestEnd = msUntilFestEnd >= 30 * 60_000 && msUntilFestEnd <= 90 * 60_000;

    // Finde alle offenen digitalen Bons für dieses Event, die noch keine Erinnerung erhalten haben
    const openTokens = await prisma.cateringToken.findMany({
      where: {
        status: 'AVAILABLE',
        reminderSentAt: null,
        isPhysical: false,
        OR: [
          { shift: { eventId: event.id } },
          { signup: { shift: { eventId: event.id } } },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            emailVerified: true,
            firstName: true,
            nickname: true,
            emailNotifyCateringTokens: true,
            pushNotifyCateringTokens: true,
            locale: true,
            _count: { select: { pushSubscriptions: true } },
          },
        },
        shift: { select: { id: true, endTime: true, title: true } },
        signup: {
          select: {
            id: true,
            guestEmail: true,
            guestName: true,
            shift: { select: { id: true, endTime: true, title: true } },
          },
        },
      },
    });

    if (openTokens.length === 0) continue;

    // Gruppiere nach Person (userId oder guestEmail)
    type RecipientGroup = {
      user: (typeof openTokens)[0]['user'];
      guestEmail: string | null;
      guestName: string | null;
      tokens: Array<{ id: string; title: string }>;
      shiftEnd: Date | null;
    };

    const byPerson = new Map<string, RecipientGroup>();

    for (const t of openTokens) {
      const shiftEnd = t.shift?.endTime ?? t.signup?.shift?.endTime ?? null;
      const key = t.user?.id ? `user_${t.user.id}` : t.signup?.guestEmail ? `guest_${t.signup.guestEmail}` : null;
      if (!key) continue;

      let group = byPerson.get(key);
      if (!group) {
        group = {
          user: t.user,
          guestEmail: t.signup?.guestEmail ?? null,
          guestName: t.signup?.guestName ?? null,
          tokens: [],
          shiftEnd,
        };
        byPerson.set(key, group);
      }
      group.tokens.push({ id: t.id, title: t.title });
    }

    for (const group of byPerson.values()) {
      let isDue = false;

      // 1. Schichtende-Trigger (20-60 Min nach Schichtende)
      if (group.shiftEnd) {
        const msSinceEnd = now.getTime() - group.shiftEnd.getTime();
        if (msSinceEnd >= 20 * 60_000 && msSinceEnd <= 60 * 60_000) {
          isDue = true;
        }
      }

      // 2. Festende-Trigger (ca. 1 Stunde vor Festende)
      if (isNearFestEnd) {
        isDue = true;
      }

      if (!isDue) continue;

      const recipientName = group.user?.nickname || group.user?.firstName || group.guestName || 'Helfende Person';
      const count = group.tokens.length;
      const tokenNames = group.tokens.map((x) => x.title).join(', ');
      // «Meine Schichten» der Abteilung zeigt die Bons; /events/<slug>/meine-schichten gibt es nicht
      const targetUrl = departmentPageUrl(event.department.slug, '/meine-schichten', event.department.organization);

      let sent = false;

      const hasEligiblePush = Boolean(
        group.user &&
        group.user.pushNotifyCateringTokens !== false &&
        group.user._count.pushSubscriptions > 0
      );

      const orgType = event.department.organization;
      const enabled = getEnabledLocales(orgType);
      const recipientLocale = resolveRecipientLocale({
        user: group.user?.locale,
        department: event.department.defaultLocale,
        enabled,
      });
      const tPush = getTranslator(recipientLocale, { namespace: 'push' });
      const tEmails = getTranslator(recipientLocale, { namespace: 'emails' });

      // Web Push
      if (hasEligiblePush && group.user) {
        try {
          await sendPushToUser(prisma, group.user.id, {
            title: tPush('cateringTokens.title'),
            body: tPush('cateringTokens.body', { name: recipientName, event: event.title, count, tokens: tokenNames }),
            url: targetUrl,
            tag: `catering-reminder-${event.id}`,
          });
          sent = true;
        } catch {}
      }

      // E-Mail
      const rawEmail = (group.user?.emailVerified && group.user?.email) ? group.user.email : group.guestEmail;
      const email = rawEmail && !isPlaceholderEmail(rawEmail) ? rawEmail : null;
      const hasEligibleEmail = Boolean(email && (group.user ? group.user.emailNotifyCateringTokens !== false : true));
      if (hasEligibleEmail && email) {
        try {
          const subject = tEmails('cateringTokens.subject', { event: event.title });
          const text = `${tEmails('cateringTokens.greeting', { name: recipientName })}\n\n${tEmails('cateringTokens.thankYou', { event: event.title })}\n\n${tEmails('cateringTokens.openCount', { count })} ${tokenNames}\n\n${tEmails('cateringTokens.instructions')}\n\n${targetUrl}\n\n${tEmails('cateringTokens.closing')}\n${tEmails('cateringTokens.team', { event: event.title })}`;
          const html = renderEmailTemplate({
            title: tEmails('cateringTokens.title'),
            eyebrow: tEmails('cateringTokens.eyebrow'),
            preheader: tEmails('cateringTokens.thankYou', { event: event.title }),
            organization: event.department.organization,
            locale: recipientLocale,
            contentHtml: `
              <p style="margin-top: 0; font-size: 15px;">${tEmails('cateringTokens.greeting', { name: `<strong>${recipientName}</strong>` })}</p>
              <p style="font-size: 14px; color: #334155;">${tEmails('cateringTokens.thankYou', { event: `<strong>${event.title}</strong>` })}</p>
              <div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
                <strong style="color: #0369a1; font-size: 14px;">${tEmails('cateringTokens.openCount', { count })}</strong>
                <div style="font-size: 14px; color: #0f172a; margin-top: 4px; font-weight: 600;">${tokenNames}</div>
              </div>
              <p style="font-size: 13px; color: #64748b; margin-bottom: 0;">${tEmails('cateringTokens.instructions')}</p>
            `,
            ctaText: tEmails('cateringTokens.cta'),
            ctaUrl: targetUrl,
          });

          await sendEmail({
            to: email,
            organization: event.department.organization,
            subject,
            text,
            html,
            kind: 'OTHER',
          });
          sent = true;
        } catch {}
      }

      // Markiere diese Tokens als erinnert, wenn versendet oder wenn keine Kanäle eingerichtet sind
      const hasEligibleChannel = hasEligiblePush || hasEligibleEmail;
      if (sent || !hasEligibleChannel) {
        const tokenIds = group.tokens.map((x) => x.id);
        await prisma.cateringToken.updateMany({
          where: { id: { in: tokenIds } },
          data: { reminderSentAt: now },
        });
      }

      if (sent) totalSent++;
    }
  }

  return totalSent;
}
