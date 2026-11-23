import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import { formatZurichDate, type DepartmentDto, type DepartmentStatsResponseDto } from '@schichtplan/shared';
import { INTL_LOCALES, getTranslator, parseLocale } from '@schichtplan/i18n';

/** Texte aus dem PDF-Katalog `pdf.stats` (wie `getPlanLabels` beim Schichtplan-PDF) */
function statsTranslator(locale?: string | null) {
  return getTranslator(parseLocale(locale) ?? 'de', { namespace: 'pdf.stats' });
}

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const LINE_STRONG = '#cbd5e1';
const BG_SUBTLE = '#f8fafc';

let fontsRegistered = false;

export function registerPdfFonts(base: string) {
  if (fontsRegistered) return;
  Font.register({
    family: 'Geist',
    fonts: [
      { src: `${base}/Geist-Regular.ttf`, fontWeight: 400 },
      { src: `${base}/Geist-SemiBold.ttf`, fontWeight: 600 },
      { src: `${base}/Geist-Bold.ttf`, fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Geist',
    fontSize: 8.5,
    color: INK,
    paddingTop: 36,
    paddingBottom: 42,
    paddingHorizontal: 36,
    lineHeight: 1.3,
  },
  runningHead: {
    position: 'absolute',
    top: 16,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
    paddingBottom: 4,
  },
  runningText: {
    fontSize: 7.5,
    color: MUTED,
  },
  footerLine: {
    position: 'absolute',
    bottom: 26,
    left: 36,
    right: 36,
    borderTopWidth: 0.5,
    borderTopColor: LINE,
  },
  footerLogo: {
    position: 'absolute',
    bottom: 14,
    left: 36,
    width: 9,
    height: 9,
  },
  footerText: {
    position: 'absolute',
    bottom: 15,
    fontSize: 7,
    color: MUTED,
  },
  pageNumber: {
    position: 'absolute',
    right: 36,
    width: 80,
    fontSize: 7,
    color: MUTED,
    textAlign: 'right',
  },

  // Header
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  logo: {
    width: 44,
    height: 44,
    marginRight: 12,
    objectFit: 'contain',
  },
  titleGroup: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.15,
  },
  subtitle: {
    fontSize: 8.5,
    color: MUTED,
    marginTop: 2,
  },
  metaRight: {
    alignItems: 'flex-end',
  },
  metaLabel: {
    fontSize: 6.5,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 8.5,
    fontWeight: 600,
    marginTop: 1,
  },
  accentBar: {
    height: 2.5,
    marginTop: 6,
    marginBottom: 12,
    borderRadius: 1.5,
  },

  // KPI Bento Grid
  kpiRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  kpiCard: {
    flex: 1,
    borderWidth: 0.75,
    borderColor: LINE,
    borderRadius: 4,
    padding: 8,
    backgroundColor: '#ffffff',
    marginRight: 6,
  },
  kpiCardLast: {
    marginRight: 0,
  },
  kpiLabel: {
    fontSize: 6.5,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: MUTED,
  },
  kpiValue: {
    fontSize: 15,
    fontWeight: 700,
    marginTop: 2,
    color: INK,
  },
  kpiSub: {
    fontSize: 7,
    color: MUTED,
    marginTop: 1,
  },
  kpiDetail: {
    fontSize: 6.5,
    color: '#0284c7',
    marginTop: 3,
  },

  // Section Header
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 4,
    color: INK,
  },
  sectionSubtitle: {
    fontSize: 7.5,
    color: MUTED,
    marginBottom: 8,
  },

  // Podest Top 3
  podestRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  podestCard: {
    flex: 1,
    borderWidth: 0.75,
    borderRadius: 4,
    padding: 7,
    marginRight: 6,
  },
  podestCard1: {
    borderColor: '#f59e0b',
    backgroundColor: '#fffbeb',
  },
  podestCard2: {
    borderColor: '#94a3b8',
    backgroundColor: '#f8fafc',
  },
  podestCard3: {
    borderColor: '#fb923c',
    backgroundColor: '#fff7ed',
    marginRight: 0,
  },
  podestBadge: {
    fontSize: 6.5,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  podestName: {
    fontSize: 10,
    fontWeight: 700,
    color: INK,
  },
  podestRealName: {
    fontSize: 7.5,
    color: MUTED,
  },
  podestHours: {
    fontSize: 9,
    fontWeight: 700,
    marginTop: 4,
  },

  // Table
  table: {
    width: '100%',
    marginBottom: 14,
    borderWidth: 0.75,
    borderColor: LINE,
    borderRadius: 3,
    overflow: 'hidden',
  },
  thRow: {
    flexDirection: 'row',
    backgroundColor: BG_SUBTLE,
    borderBottomWidth: 0.75,
    borderBottomColor: LINE_STRONG,
    paddingVertical: 4.5,
    paddingHorizontal: 6,
  },
  thCell: {
    fontSize: 6.5,
    fontWeight: 700,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
    paddingVertical: 3.5,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  trAlt: {
    backgroundColor: '#fcfcfd',
  },
  td: {
    fontSize: 7.5,
    color: INK,
  },
  badge: {
    fontSize: 6,
    backgroundColor: '#f1f5f9',
    color: '#475569',
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
    marginRight: 2,
  },
});

export interface DepartmentStatsPdfProps {
  data: DepartmentStatsResponseDto;
  department: DepartmentDto | null;
  logoUrl?: string | null;
  /** Sprache des Dokuments (de, fr-CH …) */
  locale?: string | null;
  nicknameTerm: string;
}

export function DepartmentStatsPdf({ data, department, logoUrl, locale, nicknameTerm }: DepartmentStatsPdfProps) {
  const t = statsTranslator(locale);
  const lang = INTL_LOCALES[parseLocale(locale) ?? 'de'];
  const accent = department?.primaryColor || '#e11d48';
  const yearText = data.year === 'ALL' ? t('yearAll') : t('yearReport', { year: String(data.year) });
  const deptName = department?.name || t('deptFallback');
  const filterDesc = [
    data.filter.countAttendedOnly ? t('attendedOnly') : t('allSignups'),
    data.filter.includeSetupTeardown ? t('withSetup') : t('withoutSetup'),
  ].join(' · ');

  const footerText = t('footer', { dept: deptName, year: yearText, date: formatZurichDate(new Date()) });

  // Top 3 für das Podest
  const top3 = data.topHelpers.slice(0, 3);
  const helpersList = data.topHelpers.slice(0, 35); // Erste 35 Helfende für den kompakten GV-Druck

  return (
    <Document
      title={t('docTitle', { dept: deptName, year: yearText })}
      author={deptName}
      creator="Cevi Schichtplan"
      language={lang}
    >
      <Page size="A4" orientation="portrait" style={s.page}>
        {/* Seitennummerierung */}
        <Text
          fixed
          style={{ ...s.pageNumber, top: 841.89 - 24 }}
          render={({ pageNumber, totalPages }) => t('page', { page: pageNumber, total: totalPages })}
        />

        {/* Wiederkehrende Kopfzeile ab Seite 2 */}
        <View
          fixed
          style={s.runningHead}
          render={({ pageNumber }) =>
            pageNumber > 1 ? (
              <>
                <Text style={s.runningText}>
                  {deptName} · {yearText}
                </Text>
                <Text style={s.runningText}>{t('running')}</Text>
              </>
            ) : null
          }
        />

        {/* Fusszeile */}
        <View fixed style={s.footerLine} />
        <Image fixed src="/images/cevi-logo.png" style={s.footerLogo} />
        <Text fixed style={[s.footerText, { left: 50, right: 110 }]}>
          {footerText}
        </Text>

        {/* Header */}
        <View style={s.head}>
          {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
          <View style={s.titleGroup}>
            <Text style={s.title}>{deptName}</Text>
            <Text style={s.subtitle}>
              {data.year === 'ALL' ? t('subtitleAll') : t('subtitleYear', { year: String(data.year) })}
            </Text>
            <Text style={[s.subtitle, { fontSize: 7, color: MUTED }]}>
              {filterDesc}
            </Text>
          </View>
          <View style={s.metaRight}>
            <Text style={s.metaLabel}>{t('asOf')}</Text>
            <Text style={s.metaValue}>{formatZurichDate(new Date())}</Text>
            <Text style={[s.metaLabel, { marginTop: 3 }]}>{t('events')}</Text>
            <Text style={s.metaValue}>{data.summary.totalEvents}</Text>
          </View>
        </View>

        {/* Akzent-Balken */}
        <View style={[s.accentBar, { backgroundColor: accent }]} />

        {/* KPI Kacheln */}
        <View style={s.kpiRow}>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>{t('hours')}</Text>
            <Text style={s.kpiValue}>{data.summary.totalHours} h</Text>
            <Text style={s.kpiSub}>{data.summary.formattedTime}</Text>
            <Text style={s.kpiDetail}>{t('hoursSplit', { event: data.summary.eventHours, setup: data.summary.setupHours })}</Text>
          </View>

          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>{t('activeHelpers')}</Text>
            <Text style={s.kpiValue}>{data.summary.totalHelpers}</Text>
            <Text style={s.kpiSub}>{t('perPerson', { hours: data.summary.averageHoursPerHelper })}</Text>
            <Text style={s.kpiDetail}>{t('inEvents', { count: data.summary.totalEvents })}</Text>
          </View>

          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>{t('fillRate')}</Text>
            <Text style={s.kpiValue}>{data.summary.fillRatePct} %</Text>
            <Text style={s.kpiSub}>{t('filledOf', { filled: data.summary.totalFilledSlots, total: data.summary.totalRequiredSlots })}</Text>
            <Text style={s.kpiDetail}>{t('shiftsTotal', { count: data.summary.totalShifts })}</Text>
          </View>

          <View style={[s.kpiCard, s.kpiCardLast]}>
            <Text style={s.kpiLabel}>{t('attendance')}</Text>
            <Text style={s.kpiValue}>{data.summary.attendedRatePct} %</Text>
            <Text style={s.kpiSub}>{t('hoursConfirmed', { hours: data.summary.attendedHours })}</Text>
            <Text style={s.kpiDetail}>{data.filter.countAttendedOnly ? t('filterActive') : t('attendanceRate')}</Text>
          </View>
        </View>

        {/* Podest für die GV */}
        {top3.length === 3 && (
          <View wrap={false} style={{ marginBottom: 10 }}>
            <Text style={s.sectionTitle}>{t('honourTitle')}</Text>
            <Text style={s.sectionSubtitle}>
              {t('honourText')}
            </Text>

            <View style={s.podestRow}>
              {/* 2. Platz */}
              <View style={[s.podestCard, s.podestCard2]}>
                <Text style={[s.podestBadge, { color: '#64748b' }]}>{t('rank2')}</Text>
                <Text style={s.podestName}>{top3[1].ceviName || top3[1].displayName}</Text>
                {top3[1].ceviName && top3[1].firstName && (
                  <Text style={s.podestRealName}>{top3[1].firstName} {top3[1].lastName || ''}</Text>
                )}
                <Text style={[s.podestHours, { color: '#475569' }]}>
                  {t('hoursShifts', { hours: top3[1].hours, count: top3[1].shiftCount })}
                </Text>
              </View>

              {/* 1. Platz */}
              <View style={[s.podestCard, s.podestCard1]}>
                <Text style={[s.podestBadge, { color: '#b45309' }]}>{t('rank1')}</Text>
                <Text style={[s.podestName, { fontSize: 11 }]}>{top3[0].ceviName || top3[0].displayName}</Text>
                {top3[0].ceviName && top3[0].firstName && (
                  <Text style={s.podestRealName}>{top3[0].firstName} {top3[0].lastName || ''}</Text>
                )}
                <Text style={[s.podestHours, { color: '#b45309' }]}>
                  {t('hoursShifts', { hours: top3[0].hours, count: top3[0].shiftCount })}
                </Text>
              </View>

              {/* 3. Platz */}
              <View style={[s.podestCard, s.podestCard3]}>
                <Text style={[s.podestBadge, { color: '#c2410c' }]}>{t('rank3')}</Text>
                <Text style={s.podestName}>{top3[2].ceviName || top3[2].displayName}</Text>
                {top3[2].ceviName && top3[2].firstName && (
                  <Text style={s.podestRealName}>{top3[2].firstName} {top3[2].lastName || ''}</Text>
                )}
                <Text style={[s.podestHours, { color: '#c2410c' }]}>
                  {t('hoursShifts', { hours: top3[2].hours, count: top3[2].shiftCount })}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Rangliste der Helfenden */}
        <View wrap={false} style={{ marginBottom: 12 }}>
          <Text style={s.sectionTitle}>{t('rankingTitle')}</Text>
          <View style={s.table}>
            <View style={s.thRow}>
              <Text style={[s.thCell, { width: 22, textAlign: 'center' }]}>#</Text>
              <Text style={[s.thCell, { flex: 1 }]}>{t('colName', { nickname: nicknameTerm })}</Text>
              <Text style={[s.thCell, { width: 110 }]}>{t('colLevels')}</Text>
              <Text style={[s.thCell, { width: 44, textAlign: 'right' }]}>{t('colEvents')}</Text>
              <Text style={[s.thCell, { width: 44, textAlign: 'right' }]}>{t('colShifts')}</Text>
              <Text style={[s.thCell, { width: 44, textAlign: 'right' }]}>{t('colConfirmed')}</Text>
              <Text style={[s.thCell, { width: 55, textAlign: 'right' }]}>{t('colHours')}</Text>
            </View>

            {helpersList.map((h, i) => (
              <View key={h.userId || `${h.displayName}-${i}`} style={[s.tr, i % 2 === 1 ? s.trAlt : {}]}>
                <Text style={[s.td, { width: 22, textAlign: 'center', fontWeight: i < 3 ? 700 : 400, color: i === 0 ? '#b45309' : MUTED }]}>
                  {i + 1}
                </Text>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                  {h.ceviName ? (
                    <>
                      <Text style={[s.td, { fontWeight: 700, color: INK }]}>«{h.ceviName}»</Text>
                      {h.firstName && (
                        <Text style={[s.td, { fontSize: 6.8, color: MUTED, marginLeft: 3 }]}>
                          ({h.firstName} {h.lastName || ''})
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={[s.td, { fontWeight: 600 }]}>{h.displayName}</Text>
                  )}
                  {h.isGuest && <Text style={[s.badge, { marginLeft: 3 }]}>{t('guest')}</Text>}
                </View>

                <View style={{ width: 110, flexDirection: 'row', flexWrap: 'wrap' }}>
                  {h.stufen.length > 0 ? (
                    h.stufen.map((st) => (
                      <Text key={st} style={s.badge}>
                        {st}
                      </Text>
                    ))
                  ) : (
                    <Text style={[s.td, { color: MUTED, fontSize: 6.8 }]}>-</Text>
                  )}
                </View>

                <Text style={[s.td, { width: 44, textAlign: 'right', color: MUTED }]}>{h.eventCount}</Text>
                <Text style={[s.td, { width: 44, textAlign: 'right', color: MUTED }]}>{h.shiftCount}</Text>
                <Text style={[s.td, { width: 44, textAlign: 'right', fontWeight: 600, color: h.attendedShiftCount > 0 ? '#166534' : MUTED }]}>
                  {h.attendedShiftCount}
                </Text>
                <View style={{ width: 55, alignItems: 'flex-end' }}>
                  <Text style={[s.td, { fontWeight: 700 }]}>{h.hours} h</Text>
                  <Text style={{ fontSize: 6, color: MUTED }}>{h.formattedTime}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Anlässe & Stufen */}
        <View wrap={false} style={{ marginBottom: 10 }}>
          <Text style={s.sectionTitle}>{t('eventsTitle')}</Text>
          <View style={s.table}>
            <View style={s.thRow}>
              <Text style={[s.thCell, { flex: 1 }]}>{t('colEvent')}</Text>
              <Text style={[s.thCell, { width: 70 }]}>{t('colDate')}</Text>
              <Text style={[s.thCell, { width: 48, textAlign: 'right' }]}>{t('colHelpers')}</Text>
              <Text style={[s.thCell, { width: 48, textAlign: 'right' }]}>{t('colShifts')}</Text>
              <Text style={[s.thCell, { width: 60, textAlign: 'right' }]}>{t('colStaffing')}</Text>
              <Text style={[s.thCell, { width: 55, textAlign: 'right' }]}>{t('colHours')}</Text>
            </View>

            {data.events.map((ev, i) => (
              <View key={ev.id} style={[s.tr, i % 2 === 1 ? s.trAlt : {}]}>
                <Text style={[s.td, { flex: 1, fontWeight: 600 }]}>{ev.title}</Text>
                <Text style={[s.td, { width: 70, color: MUTED, fontSize: 7 }]}>
                  {formatZurichDate(ev.startDate)}
                </Text>
                <Text style={[s.td, { width: 48, textAlign: 'right', color: MUTED }]}>{ev.helpersCount}</Text>
                <Text style={[s.td, { width: 48, textAlign: 'right', color: MUTED }]}>
                  {ev.filledSlots} / {ev.totalSlots}
                </Text>
                <Text style={[s.td, { width: 60, textAlign: 'right', fontWeight: 600, color: ev.fillRatePct >= 80 ? '#166534' : '#b45309' }]}>
                  {ev.fillRatePct} %
                </Text>
                <View style={{ width: 55, alignItems: 'flex-end' }}>
                  <Text style={[s.td, { fontWeight: 700 }]}>{ev.totalHours} h</Text>
                  <Text style={{ fontSize: 5.8, color: MUTED }}>{ev.eventHours}h / {ev.setupHours}h</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Stufen-Verteilung */}
        {data.stufen.length > 0 && (
          <View wrap={false}>
            <Text style={s.sectionTitle}>{t('levelsTitle')}</Text>
            <View style={s.table}>
              <View style={s.thRow}>
                <Text style={[s.thCell, { flex: 1 }]}>{t('colLevel')}</Text>
                <Text style={[s.thCell, { width: 60, textAlign: 'right' }]}>{t('colHelpers')}</Text>
                <Text style={[s.thCell, { width: 60, textAlign: 'right' }]}>{t('colShifts')}</Text>
                <Text style={[s.thCell, { width: 65, textAlign: 'right' }]}>{t('colShare')}</Text>
                <Text style={[s.thCell, { width: 65, textAlign: 'right' }]}>{t('colHours')}</Text>
              </View>

              {data.stufen.map((st, i) => (
                <View key={st.id} style={[s.tr, i % 2 === 1 ? s.trAlt : {}]}>
                  <Text style={[s.td, { flex: 1, fontWeight: 600 }]}>{st.name}</Text>
                  <Text style={[s.td, { width: 60, textAlign: 'right', color: MUTED }]}>{st.helpersCount}</Text>
                  <Text style={[s.td, { width: 60, textAlign: 'right', color: MUTED }]}>{st.totalShifts}</Text>
                  <Text style={[s.td, { width: 65, textAlign: 'right', fontWeight: 600, color: '#0284c7' }]}>
                    {st.percentageOfTotal} %
                  </Text>
                  <Text style={[s.td, { width: 65, textAlign: 'right', fontWeight: 700 }]}>{st.totalHours} h</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </Page>
    </Document>
  );
}

/** Erstellt das PDF als Blob und lädt benötigte Schriften */
export async function renderDepartmentStatsPdf(
  data: DepartmentStatsResponseDto,
  department: DepartmentDto | null,
  labels: { locale?: string | null; nicknameTerm: string },
  fontBase = '/fonts/pdf'
): Promise<Blob> {
  registerPdfFonts(fontBase);
  return pdf(
    <DepartmentStatsPdf
      data={data}
      department={department}
      logoUrl={department?.logoUrl}
      {...labels}
    />
  ).toBlob();
}
