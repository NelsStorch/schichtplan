'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Callout, Card, useToast } from '@schichtplan/ui';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { QuestionsEditor, questionDraft, questionsPayload, type QuestionDraft } from '@/components/ok/QuestionsEditor';
import { api, errorMessage } from '@/lib/api';

/**
 * Eigene Fragen an die Helfenden (Adresse, Allergien, …) mit Aufbewahrungsdauer der Antworten.
 * Bearbeiten wie die Einstellungen: Abteilungsleitung und OK-Leitung. Die Antworten stehen unter
 * «Zugang & Antworten».
 */
export default function QuestionsPage() {
  const t = useTranslations('web.ok.questions');
  const { event, reload, permissions } = useOkEvent();
  const toast = useToast();
  const initial = () => event.questions.map(questionDraft);
  const [questions, setQuestions] = useState<QuestionDraft[]>(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(initial()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEdit = permissions.canEditSettings;
  const dirty = JSON.stringify(questions) !== saved;
  const removedWithAnswers = event.questions.length > questionsPayload(questions).filter((q) => q.id).length;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/events/${event.slug}`, { method: 'PATCH', json: { questions: questionsPayload(questions) } });
      await reload();
      setSaved(JSON.stringify(questions));
      toast({ title: t('savedSuccess'), tone: 'success' });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <OkPageHeader
        title={t('pageTitle')}
        description={t('pageDesc')}
        help="/ok/fragen/"
        actions={
          canEdit && (
            <Button onClick={save} loading={saving} disabled={!dirty}>
              {saving ? t('savingBtn') : t('saveBtn')}
            </Button>
          )
        }
      />

      {!canEdit && (
        <Callout tone="info" className="mb-4">
          {t('permissionHint')}
        </Callout>
      )}
      {error && (
        <Callout tone="danger" className="mb-4">
          {error}
        </Callout>
      )}
      {dirty && removedWithAnswers && (
        <Callout tone="warning" className="mb-4">
          {t('dirtyRemovedNotice')}
        </Callout>
      )}

      <Card className="p-4 sm:p-6">
        <QuestionsEditor questions={questions} onChange={setQuestions} disabled={!canEdit} />
      </Card>

      <p className="mt-4 text-xs text-fg-muted">
        {t('retentionHint')}
      </p>
    </div>
  );
}
