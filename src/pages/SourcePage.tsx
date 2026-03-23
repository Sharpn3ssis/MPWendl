import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API_BASE from '../utils/apiBase';
import { QuestionManager } from '../components/QuestionManager';
import type { QuizQuestionDraft } from '../components/QuestionManager';
import { QuizRunner } from '../components/QuizRunner';
import type { QuizRunnerQuestion } from '../components/QuizRunner';
import { RichTextEditor } from '../components/RichTextEditor';
import { VideoGalleryEditor } from '../components/VideoGalleryEditor';
import { VideoGallery } from '../components/VideoGallery';
import type { SourceVideo } from '../types/videos';
import { formatYoutubeShortUrl } from '../utils/youtube';

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const SOURCE_AUTOSAVE_DELAY = 1500;

const ensureVideoId = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  return VIDEO_ID_REGEX.test(trimmed) ? trimmed : null;
};

const normalizeSourceVideos = (payload: unknown): SourceVideo[] => {
  if (!payload) return [];
  let rawItems: any[] = [];
  if (Array.isArray(payload)) {
    rawItems = payload;
  } else if (typeof payload === 'string') {
    try {
      rawItems = JSON.parse(payload);
    } catch {
      rawItems = [];
    }
  }
  const normalized: SourceVideo[] = [];
  rawItems.forEach((item, index) => {
    const videoId = ensureVideoId(item?.videoId) || ensureVideoId(item?.id) || ensureVideoId(item?.youtubeId);
    if (!videoId) {
      return;
    }
    const id = typeof item?.id === 'string' && item.id.trim().length ? item.id : `video_${index}_${videoId}`;
    normalized.push({
      id,
      videoId,
      title: typeof item?.title === 'string' ? item.title : '',
      description: typeof item?.description === 'string' ? item.description : '',
      url:
        typeof item?.url === 'string' && item.url.trim().length
          ? item.url.trim()
          : formatYoutubeShortUrl(videoId),
    });
  });
  return normalized;
};

const prepareVideosForRequest = (videos: SourceVideo[]) => {
  const sanitized: SourceVideo[] = [];
  videos.forEach((video, index) => {
    const videoId = ensureVideoId(video?.videoId);
    if (!videoId) {
      return;
    }
    sanitized.push({
      id: video.id || `video_${index}_${videoId}`,
      videoId,
      title: (video.title || '').trim(),
      description: (video.description || '').trim(),
      url: video.url || formatYoutubeShortUrl(videoId),
    });
  });
  return sanitized;
};

function stripHtml(value: string) {
  if (!value) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = value;
  return tmp.textContent?.trim() || '';
}

export const SourcePage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [source, setSource] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [contentHtml, setContentHtml] = useState('<p></p>');
  const [quiz, setQuiz] = useState<QuizRunnerQuestion[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState('');
  const [videos, setVideos] = useState<SourceVideo[]>([]);
  const [sourceSaveState, setSourceSaveState] = useState<'idle' | 'scheduled' | 'saving' | 'error'>('idle');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const sourceAutoSaveTimer = useRef<number | null>(null);
  const lastSourceSnapshotRef = useRef<string>('');

  useEffect(() => {
    return () => {
      if (sourceAutoSaveTimer.current) {
        window.clearTimeout(sourceAutoSaveTimer.current);
      }
    };
  }, []);

  function syncEditorWithSource(payload: any) {
    if (!payload) return null;
    const htmlValue = payload.content_html && payload.content_html.trim().length
      ? payload.content_html
      : payload.text
        ? `<p>${(payload.text || '').split('\n').map((line: string) => line || '<br/>').join('</p><p>')}</p>`
        : '<p></p>';
    setContentHtml(htmlValue);
    const plainValue = payload.text || stripHtml(htmlValue) || '';
    setTextValue(plainValue);
    const parsedVideos = normalizeSourceVideos(payload.videos || payload.videos_json);
    setVideos(parsedVideos);
    return { htmlValue, plainValue, parsedVideos };
  }

  const quizForEditor = useMemo<QuizQuestionDraft[]>(
    () =>
      quiz.map((question) => {
        const type: QuizQuestionDraft['type'] = 
          question.type === 'text' ? 'text' : 
          question.type === 'ai-understanding' ? 'ai-understanding' : 
          'multiple-choice';
        const rawTextAnswers = Array.isArray(question.textAnswers) ? question.textAnswers : [];
        const normalizedTextAnswers = rawTextAnswers.length ? rawTextAnswers : [''];
        return {
          id: question.id,
          prompt: question.prompt,
          type,
          textAnswers: normalizedTextAnswers,
          answers: question.answers.map((answer) => ({
            id: answer.id,
            text: answer.text,
            is_correct: answer.is_correct,
          })),
          referenceAnswer: (question as any).referenceAnswer || '',
        };
      }),
    [quiz]
  );

  const currentUserId = localStorage.getItem('userId');
  const currentRole = localStorage.getItem('role');

  const fetchQuiz = async () => {
    if (!id) return;
    try {
      setQuizLoading(true);
      setQuizError('');
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE}/api/sources/${id}/quiz`, { headers });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Chyba při načítání otázek');
      const normalized: QuizRunnerQuestion[] = Array.isArray(data.questions)
        ? data.questions.map((question: any) => {
            const type: QuizRunnerQuestion['type'] = question.type === 'text' 
              ? 'text' 
              : question.type === 'ai-understanding' 
                ? 'ai-understanding' 
                : 'multiple-choice';
            const textAnswers = Array.isArray(question.textAnswers)
              ? question.textAnswers.filter((value: any) => typeof value === 'string')
              : [];
            return {
              id: question.id,
              prompt: question.prompt,
              type,
              textAnswers,
              answers: Array.isArray(question.answers)
                ? question.answers.map((answer: any) => ({
                    id: answer.id,
                    text: answer.text,
                    is_correct: !!answer.is_correct,
                  }))
                : [],
              referenceAnswer: question.referenceAnswer,
            };
          })
        : [];
      setQuiz(normalized);
    } catch (err) {
      console.error(err);
      setQuizError(err instanceof Error ? err.message : 'Chyba při načítání otázek');
    } finally {
      setQuizLoading(false);
    }
  };

  const fetchSource = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE}/api/sources/${id}`, { headers });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Chyba při načítání pramene');
      const parsedVideos = normalizeSourceVideos(data.source?.videos ?? data.source?.videos_json);
      const enrichedSource = { ...data.source, videos: parsedVideos };
      setSource(enrichedSource);
      setTitle(data.source.title || '');
      setYear(data.source.year || '');
      const synced = syncEditorWithSource(enrichedSource);
      if (synced) {
        const snapshotPayload = {
          title: data.source.title || null,
          year: data.source.year || null,
          text: synced.plainValue || '',
          content_json: null,
          content_html: synced.htmlValue,
          videos: prepareVideosForRequest(synced.parsedVideos),
        };
        lastSourceSnapshotRef.current = JSON.stringify(snapshotPayload);
        setSourceSaveState('idle');
      }
      fetchQuiz();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Chyba');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSource(); }, [id]);

  if (loading) return <div style={{padding:16}}>Načítám...</div>;
  if (!source) return <div style={{padding:16}}>{error || 'Pramen nenalezen'}</div>;

  const canEdit = currentRole === 'admin' || String(source.owner_id) === String(currentUserId);
  const numericSourceId = source?.id ? Number(source.id) : (id ? Number(id) : NaN);
  const resolvedTitle = title || source.title || '';
  const statusKey = typeof source.status === 'string' ? source.status : '';
  const statusLabelMap: Record<string, string> = {
    draft: 'Draft',
    published: 'Publikováno',
    archived: 'Archivováno',
  };
  const statusLabel = statusKey ? statusLabelMap[statusKey] ?? statusKey : '';
  const statusValueClass = statusKey
    ? `source-meta-value source-meta-value--status-${statusKey}`
    : 'source-meta-value';
  const ownerRoleRaw = typeof source.owner_role === 'string' ? source.owner_role.toLowerCase() : '';
  const ownerRoleKey = ownerRoleRaw === 'admin' ? 'admin' : 'user';
  const ownerValueClass = `source-meta-value source-meta-value--author-${ownerRoleKey}`;
  const displayYear = canEdit ? (year === '' ? source.year : year) : source.year;
  const hasDisplayYear = displayYear !== null && displayYear !== undefined && displayYear !== '';
  const renderMetaInfo = () => (
    <div className="source-editor-meta">
      <span className="source-editor-context">
        {canEdit ? 'Režim úprav pramene' : 'Informace o prameni'}
      </span>
      <div className="source-editor-meta-info">
        {hasDisplayYear && (
          <span>
            Rok:{' '}
            <strong className="source-meta-value">{String(displayYear)}</strong>
          </span>
        )}
        <span>
          Autor:{' '}
          <strong className={ownerValueClass}>{source.owner_name || 'Neznámý'}</strong>
        </span>
        {statusKey && (
          <span>
            Stav:{' '}
            <strong className={statusValueClass}>{statusLabel}</strong>
          </span>
        )}
      </div>
    </div>
  );

  const buildSourcePayload = (sourceVideos: SourceVideo[] = videos) => {
    const trimmedText = textValue.trim();
    if (!trimmedText) {
      throw new Error('Text pramene je povinný');
    }
    return {
      title: title || null,
      year: year || null,
      text: trimmedText,
      content_json: null,
      content_html: contentHtml,
      videos: prepareVideosForRequest(sourceVideos),
    };
  };

  const persistSourceChanges = async (sourceVideos: SourceVideo[] = videos) => {
    if (!canEdit) {
      return;
    }
    if (!id) {
      setSourceSaveState('error');
      return;
    }
    let payload;
    try {
      payload = buildSourcePayload(sourceVideos);
      setError('');
    } catch (err) {
      setSourceSaveState('error');
      setError(err instanceof Error ? err.message : 'Text pramene je povinný');
      return;
    }
    const snapshot = JSON.stringify(payload);
    if (snapshot === lastSourceSnapshotRef.current) {
      setSourceSaveState('idle');
      return;
    }
    setSourceSaveState('saving');
    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/api/sources/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Chyba při ukládání');
      lastSourceSnapshotRef.current = snapshot;
      setSourceSaveState('idle');
    } catch (err) {
      setSourceSaveState('error');
      setError(err instanceof Error ? err.message : 'Chyba při ukládání');
    }
  };

  const scheduleSourceAutoSave = () => {
    if (!canEdit) {
      return;
    }
    if (sourceAutoSaveTimer.current) {
      window.clearTimeout(sourceAutoSaveTimer.current);
    }
    sourceAutoSaveTimer.current = window.setTimeout(() => {
      sourceAutoSaveTimer.current = null;
      persistSourceChanges();
    }, SOURCE_AUTOSAVE_DELAY);
    if (sourceSaveState !== 'saving') {
      setSourceSaveState('scheduled');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      // Auto-reset after 3 seconds
      setTimeout(() => setDeleteConfirm(false), 3000);
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const headers: Record<string,string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/api/sources/${id}`, {
        method: 'DELETE',
        headers,
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Chyba při mazání');
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba');
      setDeleteConfirm(false);
    }
  };

  const handlePublish = async () => {
    if (!source) return;
    setError('');
    setPublishing(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Musíte být přihlášeni, abyste mohli publikovat pramen');
      }
      const headers: Record<string,string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };

      const preparedVideos = prepareVideosForRequest(videos);
      const body = {
        title: title || null,
        year: year || null,
        summary: source.summary || null,
        location: source.location || null,
        status: 'published',
        text: (textValue || '').trim(),
        content_json: null,
        content_html: contentHtml,
        videos: preparedVideos
      };

      if (!body.text) {
        throw new Error('Obsah pramene je prázdný, publikace není možná');
      }

      const res = await fetch(`${API_BASE}/api/sources/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body)
      });

      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Nepodařilo se publikovat pramen');
      await fetchSource();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="source-page">
      <div className="source-page-inner">
        {error && <div className="source-page-error">{error}</div>}
        <div className="source-card">
        {canEdit ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
            }}
            className="source-editor-form"
          >
            <div className="source-card-title-row">
              <input
                className="source-title-input"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  scheduleSourceAutoSave();
                }}
                placeholder="Název pramene"
                aria-label="Název pramene"
                maxLength={200}
                autoComplete="off"
                spellCheck={true}
              />
              <div className="source-header-actions">
                {source.status && source.status !== 'published' && (
                  <button
                    type="button"
                    className="btn btn-publish"
                    onClick={handlePublish}
                    disabled={publishing}
                  >
                    {publishing ? 'Publikuji…' : '🚀 Publikovat'}
                  </button>
                )}
                {source.status && (
                  <span className={`source-page-status source-page-status--${source.status}`}>
                    {source.status === 'draft'
                      ? 'Draft'
                      : source.status === 'archived'
                      ? 'Archivováno'
                      : 'Publikováno'}
                  </span>
                )}
              </div>
            </div>
            {renderMetaInfo()}
            <RichTextEditor
              value={contentHtml}
              placeholder="Pište nebo formátujte text pramene…"
              onChange={({ html, text }) => {
                setContentHtml(html);
                setTextValue(text);
                scheduleSourceAutoSave();
              }}
            />
            <VideoGalleryEditor
              videos={videos}
              onChange={(nextVideos) => {
                setVideos(nextVideos);
                void persistSourceChanges(nextVideos);
              }}
            />
            <div className="source-editor-actions">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setTitle(source.title || '');
                  setYear(source.year || '');
                  const synced = syncEditorWithSource(source);
                  setError('');
                  if (sourceAutoSaveTimer.current) {
                    window.clearTimeout(sourceAutoSaveTimer.current);
                    sourceAutoSaveTimer.current = null;
                  }
                  if (synced) {
                    lastSourceSnapshotRef.current = JSON.stringify({
                      title: source.title || null,
                      year: source.year || null,
                      text: synced.plainValue || '',
                      content_json: null,
                      content_html: synced.htmlValue,
                      videos: prepareVideosForRequest(synced.parsedVideos),
                    });
                    setSourceSaveState('idle');
                  }
                }}
              >
                Vrátit změny
              </button>
              <div className={`source-autosave-status source-autosave-status--${sourceSaveState}`}>
                {sourceSaveState === 'saving' && 'Ukládám změny…'}
                {sourceSaveState === 'scheduled' && 'Čekám na dopsání…'}
                {sourceSaveState === 'error' && (error || 'Nepodařilo se uložit')}
                {sourceSaveState === 'idle' && 'Vše uloženo'}
              </div>
            </div>
          </form>
        ) : (
          <>
            <div className="source-card-title-row">
              {resolvedTitle && <h1>{resolvedTitle}</h1>}
              {source.status && (
                <span className={`source-page-status source-page-status--${source.status}`}>
                  {source.status === 'draft'
                    ? 'Draft'
                    : source.status === 'archived'
                    ? 'Archivováno'
                    : 'Publikováno'}
                </span>
              )}
            </div>
            {renderMetaInfo()}
            {source.summary && (
              <p style={{color:'var(--muted)', fontStyle:'italic'}}>{source.summary}</p>
            )}
            <div
              className="source-body source-body--sheet"
              dangerouslySetInnerHTML={{ __html: source.content_html || source.text?.replace(/\n/g, '<br/>') || '' }}
            />
            {Array.isArray(source.videos) && source.videos.length > 0 && (
              <VideoGallery videos={source.videos} />
            )}
          </>
        )}
        <div className="quiz-section">
          <h3>Otázky k prameni</h3>
          {quizLoading && <p>Načítám otázky…</p>}
          {!quizLoading && quizError && <p className="quiz-error">{quizError}</p>}
          {canEdit && Number.isFinite(numericSourceId) && (
            <QuestionManager
              sourceId={Number(numericSourceId)}
              initialQuestions={quizForEditor}
              onSaved={fetchQuiz}
            />
          )}
          {!quizLoading && !quizError && quiz.length > 0 && (
            <QuizRunner questions={quiz} />
          )}
          {!quizLoading && !quizError && quiz.length === 0 && !canEdit && (
            <p className="quiz-empty">Autor zatím nezadal žádné otázky.</p>
          )}
        </div>
        <div className="source-actions">
          {canEdit && (
            <button 
              className={`btn btn-sm btn-delete ${deleteConfirm ? 'btn-delete--confirm' : ''}`} 
              onClick={handleDelete}
            >
              {deleteConfirm ? '⚠️ Opravdu smazat?' : '🗑️ Smazat pramen'}
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

const parseJsonResponse = async (response: Response) => {
  const raw = await response.text();
  const isJson = response.headers.get('content-type')?.includes('application/json');
  if (!isJson) {
    if (!response.ok) {
      throw new Error(raw || 'Server vrátil chybu bez detailů.');
    }
    throw new Error('Server vrátil neočekávanou odpověď (ne-JSON).');
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error('Server vrátil neplatnou JSON odpověď.');
  }
};
