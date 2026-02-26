import React, { useEffect, useMemo, useState } from 'react';
import API_BASE from '../utils/apiBase';

export interface QuizAnswerDraft {
	id?: number;
	text: string;
	is_correct: boolean;
}

export type QuizQuestionType = 'multiple-choice' | 'text' | 'ai-understanding';

export interface QuizQuestionDraft {
	id?: number;
	prompt: string;
	type: QuizQuestionType;
	textAnswers: string[];
	answers: QuizAnswerDraft[];
	referenceAnswer?: string;
}

interface Props {
	sourceId: number;
	initialQuestions: QuizQuestionDraft[];
	onSaved?: () => void;
}

const MAX_TEXT_ANSWERS = 10;
const MAX_AI_GENERATE_COUNT = 20;

const createEmptyAnswer = (): QuizAnswerDraft => ({ text: '', is_correct: false });
const createEmptyQuestion = (type: QuizQuestionType = 'multiple-choice'): QuizQuestionDraft => ({
	prompt: '',
	type,
	textAnswers: [''],
	answers: [createEmptyAnswer(), createEmptyAnswer(), createEmptyAnswer(), createEmptyAnswer()],
	referenceAnswer: '',
});

const cloneDraftQuestion = (question: QuizQuestionDraft): QuizQuestionDraft => ({
	...question,
	answers: question.answers.map((answer) => ({ ...answer })),
	textAnswers: [...question.textAnswers],
	referenceAnswer: question.referenceAnswer || '',
});

export const QuestionManager: React.FC<Props> = ({ sourceId, initialQuestions, onSaved }) => {
	const [questions, setQuestions] = useState<QuizQuestionDraft[]>([createEmptyQuestion()]);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);
	const [saving, setSaving] = useState(false);
	const [generating, setGenerating] = useState(false);
	const [generateError, setGenerateError] = useState<string | null>(null);
	const [aiDraft, setAiDraft] = useState<QuizQuestionDraft[] | null>(null);
	const [mcCount, setMcCount] = useState(3); // Multiple choice count
	const [textCount, setTextCount] = useState(2); // Text questions count
	const [hasChanges, setHasChanges] = useState(false);
	const totalAiCount = mcCount + textCount;

	useEffect(() => {
		if (initialQuestions && initialQuestions.length) {
			const cloned = initialQuestions.map((q) => {
				const type: QuizQuestionType = q.type === 'text' ? 'text' : q.type === 'ai-understanding' ? 'ai-understanding' : 'multiple-choice';
				const rawTextAnswers = Array.isArray(q.textAnswers)
					? q.textAnswers
					: typeof (q as any).textAnswer === 'string'
						? [(q as any).textAnswer]
						: [''];
				const normalizedTextAnswers = rawTextAnswers
					.map((value) => (typeof value === 'string' ? value : ''))
					.filter((_, index) => index < MAX_TEXT_ANSWERS);
				if (!normalizedTextAnswers.length) {
					normalizedTextAnswers.push('');
				}
				return {
					id: q.id,
					prompt: q.prompt,
					type,
					textAnswers: normalizedTextAnswers,
					answers: q.answers.map((a) => ({ id: a.id, text: a.text, is_correct: !!a.is_correct })),
					referenceAnswer: q.referenceAnswer || '',
				};
			});
			setQuestions(cloned);
			setHasChanges(false);
		} else {
			setQuestions([createEmptyQuestion()]);
			setHasChanges(false);
		}
	}, [initialQuestions]);

	useEffect(() => {
		if (!success) return;
		const timer = setTimeout(() => setSuccess(false), 2500);
		return () => clearTimeout(timer);
	}, [success]);

	// Manual save function
	const handleSaveQuiz = async () => {
		if (!sourceId) return;
		const token = localStorage.getItem('token');
		if (!token) {
			setError('Pro uložení se musíte přihlásit');
			return;
		}

		// Validate questions
		const validQuestions = questions.filter((q) => {
			if (!q.prompt.trim()) return false;
			if (q.type === 'multiple-choice') {
				const answers = q.answers.filter((a) => a.text.trim().length);
				return answers.length >= 2 && answers.some((a) => a.is_correct);
			} else if (q.type === 'ai-understanding') {
				return (q.referenceAnswer || '').trim().length > 0;
			} else {
				const textAnswers = q.textAnswers.filter((v) => v.trim().length);
				return textAnswers.length > 0;
			}
		});

		if (validQuestions.length === 0) {
			setError('Není co uložit - vyplňte alespoň jednu kompletní otázku');
			return;
		}

		setSaving(true);
		setError(null);

		try {
			const prepared = validQuestions.map((question) => {
				if (question.type === 'text') {
					return {
						type: 'text',
						prompt: question.prompt.trim(),
						textAnswers: question.textAnswers.filter((v) => v.trim().length).map((v) => v.trim()),
					};
				}
				if (question.type === 'ai-understanding') {
					return {
						type: 'ai-understanding',
						prompt: question.prompt.trim(),
						referenceAnswer: (question.referenceAnswer || '').trim(),
					};
				}
				return {
					type: 'multiple-choice',
					prompt: question.prompt.trim(),
					answers: question.answers
						.filter((a) => a.text.trim().length)
						.map((a) => ({ text: a.text.trim(), is_correct: !!a.is_correct })),
				};
			});

			const response = await fetch(`${API_BASE}/api/sources/${sourceId}/quiz`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ questions: prepared }),
			});

			const data = await parseJsonResponse(response);
			if (!response.ok) {
				throw new Error(data?.error || 'Nepodařilo se uložit');
			}

			setSuccess(true);
			setHasChanges(false);
			onSaved?.();
		} catch (err) {
			console.error(err);
			setError(err instanceof Error ? err.message : 'Chyba při ukládání');
		} finally {
			setSaving(false);
		}
	};

	// Mark changes when questions are modified
	const markChanged = () => {
		setHasChanges(true);
		setError(null);
	};

	const totalAnswers = useMemo(
		() =>
			questions.reduce((acc, q) => {
				if (q.type === 'multiple-choice') return acc + q.answers.length;
				const count = q.textAnswers
					.map((value) => value.trim())
					.filter((value) => value.length).length;
				return acc + (count || 1);
			}, 0),
		[questions]
	);

	const updateQuestionPrompt = (index: number, prompt: string) => {
		setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, prompt } : q)));
		markChanged();
	};

	const updateAnswerText = (questionIndex: number, answerIndex: number, text: string) => {
		setQuestions((prev) =>
			prev.map((question, qIdx) => {
				if (qIdx !== questionIndex) return question;
				return {
					...question,
					answers: question.answers.map((answer, aIdx) => (aIdx === answerIndex ? { ...answer, text } : answer)),
				};
			})
		);
		markChanged();
	};

	const markCorrectAnswer = (questionIndex: number, answerIndex: number) => {
		setQuestions((prev) =>
			prev.map((question, qIdx) => {
				if (qIdx !== questionIndex) return question;
				return {
					...question,
					answers: question.answers.map((answer, aIdx) => ({
						...answer,
						is_correct: aIdx === answerIndex,
					})),
				};
			})
		);
		markChanged();
	};

	const addQuestion = (type: QuizQuestionType = 'multiple-choice') => {
		setQuestions((prev) => [...prev, createEmptyQuestion(type)]);
		markChanged();
	};

	const removeQuestion = (index: number) => {
		setQuestions((prev) => prev.filter((_, i) => i !== index));
		markChanged();
	};

	const setQuestionType = (questionIndex: number, type: QuizQuestionType) => {
		setQuestions((prev) =>
			prev.map((question, qIdx) => {
				if (qIdx !== questionIndex) return question;
				if (question.type === type) return question;
				if (type === 'multiple-choice') {
					const preparedAnswers = question.answers.length
						? question.answers
						: [createEmptyAnswer(), createEmptyAnswer(), createEmptyAnswer(), createEmptyAnswer()];
					return {
						...question,
						type,
						answers: preparedAnswers,
					};
				}
				if (type === 'ai-understanding') {
					return {
						...question,
						type,
						referenceAnswer: question.referenceAnswer || '',
					};
				}
				return {
					...question,
					type,
					textAnswers: question.textAnswers && question.textAnswers.length ? question.textAnswers : [''],
				};
			})
		);
		markChanged();
	};

	const updateReferenceAnswer = (questionIndex: number, value: string) => {
		setQuestions((prev) =>
			prev.map((question, qIdx) => (qIdx === questionIndex ? { ...question, referenceAnswer: value } : question))
		);
		markChanged();
	};

	const addAnswer = (questionIndex: number) => {
		setQuestions((prev) =>
			prev.map((question, qIdx) => {
				if (qIdx !== questionIndex) return question;
				if (question.answers.length >= 6) return question;
				return {
					...question,
					answers: [...question.answers, createEmptyAnswer()],
				};
			})
		);
		markChanged();
	};

	const updateTextAnswer = (questionIndex: number, answerIndex: number, value: string) => {
		setQuestions((prev) =>
			prev.map((question, qIdx) => {
				if (qIdx !== questionIndex) return question;
				return {
					...question,
					textAnswers: question.textAnswers.map((existing, idx) => (idx === answerIndex ? value : existing)),
				};
			})
		);
		markChanged();
	};

	const addTextAnswer = (questionIndex: number) => {
		setQuestions((prev) =>
			prev.map((question, qIdx) => {
				if (qIdx !== questionIndex) return question;
				if (question.textAnswers.length >= MAX_TEXT_ANSWERS) return question;
				return {
					...question,
					textAnswers: [...question.textAnswers, ''],
				};
			})
		);
		markChanged();
	};

	const removeTextAnswer = (questionIndex: number, answerIndex: number) => {
		setQuestions((prev) =>
			prev.map((question, qIdx) => {
				if (qIdx !== questionIndex) return question;
				if (question.textAnswers.length <= 1) return question;
				const next = question.textAnswers.filter((_, idx) => idx !== answerIndex);
				return {
					...question,
					textAnswers: next.length ? next : [''],
				};
			})
		);
		markChanged();
	};

	const removeAnswer = (questionIndex: number, answerIndex: number) => {
		setQuestions((prev) =>
			prev.map((question, qIdx) => {
				if (qIdx !== questionIndex) return question;
				if (question.answers.length <= 2) return question;
				return {
					...question,
					answers: question.answers.filter((_, aIdx) => aIdx !== answerIndex),
				};
			})
		);
		markChanged();
	};

	const normalizeAiQuestion = (rawQuestion: any): QuizQuestionDraft | null => {
		if (!rawQuestion) return null;
		const prompt = typeof rawQuestion.prompt === 'string' ? rawQuestion.prompt.trim() : '';
		if (!prompt) return null;
		const type: QuizQuestionType = rawQuestion.type === 'text' ? 'text' : 'multiple-choice';
		if (type === 'text') {
			const textAnswersSource = Array.isArray(rawQuestion.textAnswers)
				? rawQuestion.textAnswers
				: typeof rawQuestion.textAnswer === 'string'
					? [rawQuestion.textAnswer]
					: [];
			const normalizedTextAnswers = textAnswersSource
				.map((value: any) => (typeof value === 'string' ? value.trim() : ''))
				.filter((value: string, index: number, arr: string[]) => value.length && arr.indexOf(value) === index)
				.slice(0, MAX_TEXT_ANSWERS);
			if (!normalizedTextAnswers.length) return null;
			return {
				prompt,
				type: 'text',
				textAnswers: normalizedTextAnswers,
				answers: [],
			};
		}
		const answersSource = Array.isArray(rawQuestion.answers) ? rawQuestion.answers : [];
		const normalizedAnswers: QuizAnswerDraft[] = answersSource
			.map((answer: any): QuizAnswerDraft => ({
				text: typeof answer?.text === 'string' ? answer.text.trim() : '',
				is_correct: !!answer?.is_correct,
			}))
			.filter((answer: QuizAnswerDraft) => answer.text.length)
			.slice(0, 6);
		if (normalizedAnswers.length < 2) return null;
		if (!normalizedAnswers.some((answer) => answer.is_correct)) return null;
		return {
			prompt,
			type: 'multiple-choice',
			textAnswers: [''],
			answers: normalizedAnswers,
		};
	};

	const handleGenerateAiDraft = async () => {
		if (!sourceId) {
			setGenerateError('Chybí ID pramene pro generování otázek.');
			return;
		}
		const token = localStorage.getItem('token');
		if (!token) {
			setGenerateError('Pro generování otázek se musíte přihlásit.');
			return;
		}
		setGenerateError(null);
		setGenerating(true);
		setAiDraft(null);
		try {
			const response = await fetch(`${API_BASE}/api/sources/${sourceId}/quiz/generate`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ 
					count: totalAiCount,
					mcCount: mcCount,
					textCount: textCount
				}),
			});
			const data = await parseJsonResponse(response);
			if (!response.ok) {
				throw new Error(data?.error || 'Generování otázek selhalo');
			}
			const normalizedDraft = Array.isArray(data?.questions)
				? data.questions
					.map((question: any) => normalizeAiQuestion(question))
					.filter((question: QuizQuestionDraft | null): question is QuizQuestionDraft => Boolean(question))
				: [];
			if (!normalizedDraft.length) {
				setGenerateError('AI nevrátila žádné použitelné otázky. Zkuste to znovu.');
				return;
			}
			setAiDraft(normalizedDraft.map((question: QuizQuestionDraft) => cloneDraftQuestion(question)));
		} catch (err) {
			console.error(err);
			setGenerateError(err instanceof Error ? err.message : 'Generování se nezdařilo.');
		} finally {
			setGenerating(false);
		}
	};

	const applyAiDraft = (mode: 'append' | 'replace') => {
		if (!aiDraft || !aiDraft.length) return;
		setQuestions((prev) => {
			const preparedDraft = aiDraft.map((question) => cloneDraftQuestion(question));
			return mode === 'replace' ? preparedDraft : [...prev, ...preparedDraft];
		});
		setAiDraft(null);
		markChanged();
	};

	const discardAiDraft = () => {
		setAiDraft(null);
	};

	return (
		<section className="quiz-editor">
			<header className="quiz-editor-header">
				<div>
					<h3>Správa kvízu</h3>
					<p>Otázky budou zobrazeny studentům přímo pod pramenem.</p>
				</div>
				<div className="quiz-editor-meta">
					<span>{questions.length} otázek</span>
					<span>{totalAnswers} odpovědí</span>
				</div>
			</header>

			{/* AI Generation - Simplified */}
			<div className="quiz-ai-simple">
				<div className="quiz-ai-simple-row">
					<div className="quiz-ai-simple-inputs">
						<label className="quiz-ai-input-group">
							<span>📝 Kvízové</span>
							<input
								type="number"
								min={0}
								max={MAX_AI_GENERATE_COUNT}
								value={mcCount}
								onChange={(e) => setMcCount(Math.min(MAX_AI_GENERATE_COUNT, Math.max(0, Number(e.target.value) || 0)))}
								disabled={generating}
							/>
						</label>
						<label className="quiz-ai-input-group">
							<span>💬 Textové</span>
							<input
								type="number"
								min={0}
								max={MAX_AI_GENERATE_COUNT}
								value={textCount}
								onChange={(e) => setTextCount(Math.min(MAX_AI_GENERATE_COUNT, Math.max(0, Number(e.target.value) || 0)))}
								disabled={generating}
							/>
						</label>
					</div>
					<button
						type="button"
						className="quiz-ai-btn"
						onClick={handleGenerateAiDraft}
						disabled={generating || totalAiCount === 0}
					>
						{generating ? '⏳ Generuji…' : `✨ Generovat ${totalAiCount} otázek`}
					</button>
				</div>
				{generateError && <div className="quiz-ai-error-simple">⚠️ {generateError}</div>}
			</div>

			{error && <div className="quiz-editor-error">{error}</div>}
			{success && <div className="quiz-editor-success">Otázky uloženy</div>}
			{aiDraft && (
				<div className="quiz-ai-draft">
					<div className="quiz-ai-draft-header">
						<div>
							<h4>AI návrhy ({aiDraft.length})</h4>
							<p>Prohlédněte si návrhy a rozhodněte se, jak je vložit.</p>
						</div>
						<div className="quiz-ai-draft-actions">
							<button type="button" className="quiz-secondary" onClick={() => applyAiDraft('append')}>
								Přidat ke stávajícím
							</button>
							<button type="button" className="quiz-secondary" onClick={() => applyAiDraft('replace')}>
								Nahradit všechno
							</button>
							<button type="button" className="quiz-remove" onClick={discardAiDraft}>
								Zavřít
							</button>
						</div>
					</div>
					<ol className="quiz-ai-draft-list">
						{aiDraft.map((draftQuestion, index) => (
							<li key={`ai-draft-${index}`}>
								<div className="quiz-ai-draft-question">
									<strong>{draftQuestion.prompt}</strong>
									<span className="quiz-ai-chip">
										{draftQuestion.type === 'text' ? 'Textová' : 'Kvízová'}
									</span>
								</div>
								{draftQuestion.type === 'multiple-choice' ? (
									<ul className="quiz-ai-answer-preview">
										{draftQuestion.answers.map((answer, answerIndex) => (
											<li key={`ai-answer-${index}-${answerIndex}`}>
												{answer.is_correct && <span className="quiz-ai-chip quiz-ai-chip--success">Správně</span>}
												{answer.text}
											</li>
										))}
									</ul>
								) : (
									<ul className="quiz-ai-answer-preview">
										{draftQuestion.textAnswers.map((textAnswer, answerIndex) => (
											<li key={`ai-text-${index}-${answerIndex}`}>{textAnswer}</li>
										))}
									</ul>
								)}
							</li>
						))}
					</ol>
				</div>
			)}

			<div className="quiz-editor-list">
				{questions.map((question, questionIndex) => (
					<div className="quiz-question-editor" key={`quiz-question-${questionIndex}`}>
						<div className="quiz-question-header">
							<h4>Otázka {questionIndex + 1}</h4>
							{questions.length > 1 && (
								<button
									type="button"
									className="quiz-remove"
									onClick={() => removeQuestion(questionIndex)}
								>
									Odebrat otázku
								</button>
							)}
						</div>
						<input
							className="quiz-question-input"
							value={question.prompt}
							onChange={(event) => updateQuestionPrompt(questionIndex, event.target.value)}
							placeholder="Zadejte znění otázky"
						/>
						<div className="quiz-question-type">
							<button
								type="button"
								className={`quiz-type-toggle ${question.type === 'multiple-choice' ? 'active' : ''}`}
								onClick={() => setQuestionType(questionIndex, 'multiple-choice')}
							>
								📝 Kvízová
							</button>
							<button
								type="button"
								className={`quiz-type-toggle ${question.type === 'text' ? 'active' : ''}`}
								onClick={() => setQuestionType(questionIndex, 'text')}
							>
								💬 Textová
							</button>
							<button
								type="button"
								className={`quiz-type-toggle quiz-type-toggle--ai ${question.type === 'ai-understanding' ? 'active' : ''}`}
								onClick={() => setQuestionType(questionIndex, 'ai-understanding')}
							>
								🧠 Hlubší porozumění (AI)
							</button>
						</div>
						{question.type === 'multiple-choice' ? (
							<div className="quiz-answer-list">
								{question.answers.map((answer, answerIndex) => (
									<div className="quiz-answer-row" key={`answer-${questionIndex}-${answerIndex}`}>
										<button
											type="button"
											className={`quiz-answer-flag ${answer.is_correct ? 'active' : ''}`}
											onClick={() => markCorrectAnswer(questionIndex, answerIndex)}
										>
											Správná
										</button>
										<input
											className="quiz-answer-input"
											value={answer.text}
											onChange={(event) => updateAnswerText(questionIndex, answerIndex, event.target.value)}
											placeholder={`Odpověď ${answerIndex + 1}`}
										/>
										{question.answers.length > 2 && (
											<button
												type="button"
												className="quiz-remove"
												onClick={() => removeAnswer(questionIndex, answerIndex)}
											>
												Odebrat
											</button>
										)}
									</div>
								))}
								{question.answers.length < 6 && (
									<button
										type="button"
										className="quiz-add-option"
										onClick={() => addAnswer(questionIndex)}
									>
										Přidat odpověď
									</button>
								)}
							</div>
						) : question.type === 'text' ? (
							<div className="quiz-text-answer-list">
								{question.textAnswers.map((value, answerIndex) => (
									<div className="quiz-text-answer-row" key={`text-answer-${questionIndex}-${answerIndex}`}>
										<input
											className="quiz-answer-input"
											value={value}
											onChange={(event) => updateTextAnswer(questionIndex, answerIndex, event.target.value)}
											placeholder={`Správná odpověď ${answerIndex + 1}`}
										/>
										{question.textAnswers.length > 1 && (
											<button
												type="button"
												className="quiz-remove"
												onClick={() => removeTextAnswer(questionIndex, answerIndex)}
											>
												Odebrat
											</button>
										)}
									</div>
								))}
								{question.textAnswers.length < MAX_TEXT_ANSWERS && (
									<button
										type="button"
										className="quiz-add-option"
										onClick={() => addTextAnswer(questionIndex)}
									>
										Přidat další odpověď
									</button>
								)}
								<p className="quiz-hint">Odpovědi se porovnávají bez ohledu na velikost písmen.</p>
							</div>
						) : question.type === 'ai-understanding' ? (
							<div className="quiz-ai-understanding-editor">
								<div className="quiz-ai-understanding-info">
									<div className="quiz-ai-understanding-icon">🧠</div>
									<div className="quiz-ai-understanding-text">
										<strong>Hlubší porozumění</strong>
										<p>Zadejte referenční odpověď. AI vyhodnotí, zda odpověď studenta odpovídá alespoň z 80%.</p>
									</div>
								</div>
								<label className="quiz-ai-understanding-label">
									Referenční (správná) odpověď:
								</label>
								<textarea
									className="quiz-ai-understanding-textarea"
									value={question.referenceAnswer || ''}
									onChange={(e) => updateReferenceAnswer(questionIndex, e.target.value)}
									placeholder="Napište vzorovou odpověď, podle které AI vyhodnotí odpovědi studentů...

Např. pro otázku 'Proč vznikla 2. světová válka?':

Druhá světová válka vznikla z několika hlavních příčin: nespokojenost Německa s Versailleskou smlouvou, hospodářská krize 30. let, vzestup nacismu a Hitlerova expanzivní politika, selhání politiky appeasementu a rozpínavost totalitních režimů."
									rows={6}
								/>
								<p className="quiz-hint">Čím podrobnější referenční odpověď, tím přesnější vyhodnocení.</p>
							</div>
						) : null}
					</div>
				))}
			</div>

			<div className="quiz-editor-actions">
				<div className="quiz-editor-add-group">
					<button type="button" className="quiz-secondary" onClick={() => addQuestion('multiple-choice')}>
						📝 Kvízová
					</button>
					<button type="button" className="quiz-secondary" onClick={() => addQuestion('text')}>
						💬 Textová
					</button>
					<button type="button" className="quiz-secondary quiz-secondary--ai" onClick={() => addQuestion('ai-understanding')}>
						🧠 Hlubší porozumění
					</button>
				</div>
				<button 
					type="button" 
					className={`quiz-save-btn ${hasChanges ? 'quiz-save-btn--active' : ''} ${saving ? 'quiz-save-btn--saving' : ''}`}
					onClick={handleSaveQuiz}
					disabled={saving}
				>
					{saving ? (
						<>
							<span className="quiz-save-spinner"></span>
							Ukládám…
						</>
					) : success ? (
						<>
							<span className="quiz-save-icon">✓</span>
							Uloženo!
						</>
					) : (
						<>
							<span className="quiz-save-icon">💾</span>
							Uložit kvíz
							{hasChanges && <span className="quiz-save-badge">●</span>}
						</>
					)}
				</button>
			</div>
		</section>
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

