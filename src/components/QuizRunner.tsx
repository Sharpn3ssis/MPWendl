import React, { useMemo, useState, useCallback } from 'react';
import API_BASE from '../utils/apiBase';

export interface QuizRunnerAnswer {
	id?: number;
	text: string;
	is_correct: boolean;
}

export type QuizRunnerQuestionType = 'multiple-choice' | 'text' | 'ai-understanding';

export interface QuizRunnerQuestion {
	id?: number;
	prompt: string;
	type?: QuizRunnerQuestionType;
	textAnswers?: string[];
	answers: QuizRunnerAnswer[];
	referenceAnswer?: string;
}

interface Props {
	questions: QuizRunnerQuestion[];
}

interface QuestionResult {
	isCorrect: boolean;
	selectedIndex?: number;
	submittedText?: string;
}

interface AiEvaluationResult {
	isCorrect: boolean;
	matchPercentage: number;
	feedback: string;
	keyPointsMissed: string[];
	keyPointsCorrect: string[];
	threshold: number;
}

export const QuizRunner: React.FC<Props> = ({ questions }) => {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [results, setResults] = useState<Record<number, QuestionResult>>({});
	const [textInput, setTextInput] = useState('');
	const [showingResult, setShowingResult] = useState(false);
	const [slideDirection, setSlideDirection] = useState<'in' | 'out' | null>(null);
	const [quizComplete, setQuizComplete] = useState(false);
	const [hint, setHint] = useState<string | null>(null);
	const [hintCount, setHintCount] = useState(0);
	const [hintAnswer, setHintAnswer] = useState<string>('');
	
	// AI evaluation state
	const [aiLoading, setAiLoading] = useState(false);
	const [aiResult, setAiResult] = useState<AiEvaluationResult | null>(null);
	const [aiError, setAiError] = useState<string | null>(null);

	const totalQuestions = questions.length;
	const correctCount = useMemo(
		() => Object.values(results).filter((r) => r.isCorrect).length,
		[results]
	);

	const currentQuestion = questions[currentIndex];
	const currentResult = results[currentIndex];
	const questionType: QuizRunnerQuestionType = currentQuestion?.type === 'text' 
		? 'text' 
		: currentQuestion?.type === 'ai-understanding' 
			? 'ai-understanding' 
			: 'multiple-choice';

	const allowedTextAnswers = Array.isArray(currentQuestion?.textAnswers) 
		? currentQuestion.textAnswers 
		: [];

	const handleSelectAnswer = useCallback((answerIndex: number, isCorrect: boolean) => {
		if (showingResult) return;
		
		setResults((prev) => ({
			...prev,
			[currentIndex]: {
				isCorrect,
				selectedIndex: answerIndex,
			},
		}));
		setShowingResult(true);
	}, [currentIndex, showingResult]);

	const handleTextSubmit = useCallback((e: React.FormEvent) => {
		e.preventDefault();
		if (showingResult) return;
		
		const rawValue = textInput.trim();
		const normalizedValue = rawValue.toLowerCase();
		const normalizedBank = allowedTextAnswers
			.map((answer) => answer.trim().toLowerCase())
			.filter((answer) => answer.length);
		const isCorrect = normalizedValue.length > 0 && normalizedBank.includes(normalizedValue);
		
		setResults((prev) => ({
			...prev,
			[currentIndex]: {
				isCorrect,
				submittedText: rawValue,
			},
		}));
		setShowingResult(true);
	}, [currentIndex, textInput, allowedTextAnswers, showingResult]);

	const handleAiSubmit = useCallback(async (e: React.FormEvent) => {
		e.preventDefault();
		if (showingResult || !currentQuestion?.id) return;
		
		const rawValue = textInput.trim();
		if (!rawValue) return;

		setAiLoading(true);
		setAiError(null);

		try {
			const token = localStorage.getItem('token');
			const response = await fetch(`${API_BASE}/api/quiz/evaluate-ai`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
				body: JSON.stringify({
					questionId: currentQuestion.id,
					userAnswer: rawValue,
				}),
			});

			const data = await response.json();
			
			if (!response.ok) {
				throw new Error(data.error || 'Nepodařilo se vyhodnotit odpověď');
			}

			setAiResult(data);
			setResults((prev) => ({
				...prev,
				[currentIndex]: {
					isCorrect: data.isCorrect,
					submittedText: rawValue,
				},
			}));
			setShowingResult(true);
		} catch (err) {
			setAiError(err instanceof Error ? err.message : 'Neznámá chyba');
		} finally {
			setAiLoading(false);
		}
	}, [currentIndex, currentQuestion?.id, textInput, showingResult]);

	const handleNextQuestion = useCallback(() => {
		if (currentIndex >= totalQuestions - 1) {
			// Quiz complete
			setSlideDirection('out');
			setTimeout(() => {
				setQuizComplete(true);
			}, 300);
			return;
		}

		setSlideDirection('out');
		setTimeout(() => {
			setCurrentIndex((prev) => prev + 1);
			setShowingResult(false);
			setTextInput('');
			setHint(null);
			setAiResult(null);
			setAiError(null);
			setSlideDirection('in');
			setTimeout(() => setSlideDirection(null), 300);
		}, 300);
	}, [currentIndex, totalQuestions]);

	const revealHint = useCallback(() => {
		const normalized = allowedTextAnswers
			.map((answer) => answer.trim())
			.filter((answer) => answer.length);
		if (!normalized.length) return;
		
		// Pick a random answer on first click, then keep revealing letters
		let answer = hintAnswer;
		if (!answer) {
			answer = normalized[Math.floor(Math.random() * normalized.length)];
			setHintAnswer(answer);
		}
		
		const nextCount = hintCount + 1;
		if (nextCount > answer.length) return;
		
		setHintCount(nextCount);
		setHint(answer.slice(0, nextCount).toUpperCase());
	}, [allowedTextAnswers, hint, hintCount, hintAnswer]);

	const resetQuiz = useCallback(() => {
		setCurrentIndex(0);
		setResults({});
		setTextInput('');
		setShowingResult(false);
		setSlideDirection(null);
		setQuizComplete(false);
		setHint(null);
		setHintCount(0);
		setHintAnswer('');
		setHintCount(0);
		setHintAnswer('');
		setAiResult(null);
		setAiError(null);
		setAiLoading(false);
	}, []);

	if (!questions.length) {
		return null;
	}

	// Final score screen
	if (quizComplete) {
		const percentage = Math.round((correctCount / totalQuestions) * 100);
		const emoji = percentage >= 80 ? '🏆' : percentage >= 60 ? '👍' : percentage >= 40 ? '📚' : '💪';
		const message = percentage >= 80 
			? 'Výborně! Skvělá znalost pramene!' 
			: percentage >= 60 
				? 'Dobrá práce! Ještě trochu a budete mistr.' 
				: percentage >= 40 
					? 'Ujde to. Zkuste si pramen přečíst znovu.' 
					: 'Nevadí! Každý začátek je těžký.';

		return (
			<section className="quiz-runner quiz-runner--complete">
				<div className="quiz-final-card">
					<div className="quiz-final-emoji">{emoji}</div>
					<h2 className="quiz-final-title">Kvíz dokončen!</h2>
					<div className="quiz-final-score">
						<div className="quiz-final-score-circle">
							<svg viewBox="0 0 100 100">
								<circle className="quiz-score-bg" cx="50" cy="50" r="45" />
								<circle 
									className="quiz-score-progress" 
									cx="50" 
									cy="50" 
									r="45"
									style={{ 
										strokeDasharray: `${percentage * 2.83} 283`,
										stroke: percentage >= 60 ? 'var(--color-success)' : percentage >= 40 ? 'var(--color-warning)' : 'var(--color-error)'
									}}
								/>
							</svg>
							<div className="quiz-score-text">
								<span className="quiz-score-number">{correctCount}</span>
								<span className="quiz-score-total">/{totalQuestions}</span>
							</div>
						</div>
						<div className="quiz-final-percentage">{percentage}%</div>
					</div>
					<p className="quiz-final-message">{message}</p>
					<button type="button" className="quiz-restart-btn" onClick={resetQuiz}>
						🔄 Zkusit znovu
					</button>
				</div>
			</section>
		);
	}

	return (
		<section className="quiz-runner">
			{/* Progress bar */}
			<div className="quiz-progress">
				<div className="quiz-progress-bar">
					<div 
						className="quiz-progress-fill"
						style={{ width: `${((currentIndex + (showingResult ? 1 : 0)) / totalQuestions) * 100}%` }}
					/>
				</div>
				<div className="quiz-progress-text">
					Otázka {currentIndex + 1} z {totalQuestions}
				</div>
			</div>

			{/* Question card */}
			<div className={`quiz-card-container ${slideDirection ? `slide-${slideDirection}` : ''}`}>
				<div className={`quiz-card ${questionType === 'ai-understanding' ? 'quiz-card--ai' : ''}`}>
					{/* Question type badge */}
					<div className="quiz-card-badge">
						{questionType === 'multiple-choice' && <span>📝 Kvízová otázka</span>}
						{questionType === 'text' && <span>💬 Textová otázka</span>}
						{questionType === 'ai-understanding' && <span>🧠 Hlubší porozumění</span>}
					</div>

					{/* Question prompt */}
					<h3 className="quiz-card-question">{currentQuestion.prompt}</h3>

					{/* Multiple choice answers */}
					{questionType === 'multiple-choice' && (
						<div className="quiz-card-answers">
							{currentQuestion.answers.map((answer, answerIndex) => {
								const isSelected = currentResult?.selectedIndex === answerIndex;
								let stateClass = '';
								if (showingResult) {
									if (answer.is_correct) stateClass = 'correct';
									else if (isSelected) stateClass = 'wrong';
									else stateClass = 'disabled';
								}

								return (
									<button
										key={answer.id ?? `a-${answerIndex}`}
										type="button"
										className={`quiz-card-answer ${stateClass} ${isSelected ? 'selected' : ''}`}
										onClick={() => handleSelectAnswer(answerIndex, answer.is_correct)}
										disabled={showingResult}
									>
										<span className="quiz-answer-letter">
											{String.fromCharCode(65 + answerIndex)}
										</span>
										<span className="quiz-answer-text">{answer.text}</span>
										{showingResult && answer.is_correct && (
											<span className="quiz-answer-icon">✓</span>
										)}
										{showingResult && isSelected && !answer.is_correct && (
											<span className="quiz-answer-icon">✗</span>
										)}
									</button>
								);
							})}
						</div>
					)}

					{/* Text answer */}
					{questionType === 'text' && (
						<div className="quiz-card-text-input">
							<form onSubmit={handleTextSubmit}>
								<input
									type="text"
									className="quiz-text-field"
									value={textInput}
									onChange={(e) => setTextInput(e.target.value)}
									placeholder="Napište svou odpověď..."
									disabled={showingResult}
								/>
								{!showingResult && (
									<div className="quiz-text-actions">
										<button 
											type="button" 
											className="quiz-hint-btn"
											onClick={revealHint}
											disabled={!allowedTextAnswers.length || !!hint}
										>
											💡 Nápověda
										</button>
										<button type="submit" className="quiz-submit-btn" disabled={!textInput.trim()}>
											Ověřit
										</button>
									</div>
								)}
							</form>
							{hint && !showingResult && (
								<div className="quiz-hint-reveal">
									<div className="quiz-hint-header">
										<span>💡 Nápověda</span>
										<span className="quiz-hint-counter">{hintCount} / {hintAnswer.length} písmen</span>
									</div>
									<div className="quiz-hint-letters">
										{hintAnswer.split('').map((letter, i) => (
											<span 
												key={i} 
												className={`quiz-hint-letter ${i < hintCount ? 'revealed' : 'hidden'}`}
												style={{ animationDelay: i < hintCount ? `${i * 0.05}s` : '0s' }}
											>
												{i < hintCount ? letter.toUpperCase() : '•'}
											</span>
										))}
									</div>
									<div className="quiz-hint-progress">
										<div 
											className="quiz-hint-progress-fill"
											style={{ width: `${(hintCount / hintAnswer.length) * 100}%` }}
										/>
									</div>
								</div>
							)}
							{showingResult && currentResult && (
								<div className={`quiz-text-result ${currentResult.isCorrect ? 'correct' : 'wrong'}`}>
									{currentResult.isCorrect ? (
										<>✓ Správně!</>
									) : (
										<>✗ Špatně. Správná odpověď: <strong>{allowedTextAnswers[0]}</strong></>
									)}
								</div>
							)}
						</div>
					)}

					{/* AI understanding answer */}
					{questionType === 'ai-understanding' && (
						<div className="quiz-card-ai-input">
							<form onSubmit={handleAiSubmit}>
								<textarea
									className="quiz-ai-field"
									value={textInput}
									onChange={(e) => setTextInput(e.target.value)}
									placeholder="Napište svou odpověď... Vysvětlete svými slovy, jak rozumíte dané problematice."
									rows={4}
									disabled={showingResult || aiLoading}
								/>
								{!showingResult && (
									<button 
										type="submit" 
										className="quiz-ai-submit-btn"
										disabled={!textInput.trim() || aiLoading}
									>
										{aiLoading ? (
											<>
												<span className="quiz-spinner"></span>
												AI vyhodnocuje...
											</>
										) : (
											<>🧠 Nechat vyhodnotit AI</>
										)}
									</button>
								)}
							</form>

							{aiError && (
								<div className="quiz-ai-error">❌ {aiError}</div>
							)}

							{showingResult && aiResult && (
								<div className={`quiz-ai-result-card ${aiResult.isCorrect ? 'correct' : 'wrong'}`}>
									<div className="quiz-ai-result-header">
										<span className="quiz-ai-result-icon">
											{aiResult.isCorrect ? '✅' : '❌'}
										</span>
										<div className="quiz-ai-result-score">
											<span className="quiz-ai-score-value">{aiResult.matchPercentage}%</span>
											<span className="quiz-ai-score-label">shoda</span>
										</div>
									</div>
									<div className="quiz-ai-progress">
										<div 
											className={`quiz-ai-progress-bar ${aiResult.isCorrect ? 'correct' : 'wrong'}`}
											style={{ width: `${aiResult.matchPercentage}%` }}
										/>
										<div 
											className="quiz-ai-threshold-marker"
											style={{ left: `${aiResult.threshold}%` }}
										/>
									</div>
									<p className="quiz-ai-feedback">{aiResult.feedback}</p>
									
									{aiResult.keyPointsCorrect?.length > 0 && (
										<div className="quiz-ai-points correct">
											<strong>✓ Správné body:</strong>
											<ul>
												{aiResult.keyPointsCorrect.map((p, i) => <li key={i}>{p}</li>)}
											</ul>
										</div>
									)}
									{aiResult.keyPointsMissed?.length > 0 && (
										<div className="quiz-ai-points missed">
											<strong>✗ Chybějící:</strong>
											<ul>
												{aiResult.keyPointsMissed.map((p, i) => <li key={i}>{p}</li>)}
											</ul>
										</div>
									)}
								</div>
							)}
						</div>
					)}

					{/* Result feedback & next button */}
					{showingResult && (
						<div className="quiz-card-footer">
							{questionType === 'multiple-choice' && currentResult && (
								<div className={`quiz-result-banner ${currentResult.isCorrect ? 'correct' : 'wrong'}`}>
									{currentResult.isCorrect ? '🎉 Správně!' : '❌ Bohužel špatně'}
								</div>
							)}
							<button 
								type="button" 
								className="quiz-next-btn"
								onClick={handleNextQuestion}
							>
								{currentIndex >= totalQuestions - 1 ? 'Zobrazit výsledky' : 'Další otázka'} →
							</button>
						</div>
					)}
				</div>
			</div>

			{/* Score preview */}
			<div className="quiz-score-preview">
				<span className="quiz-score-correct">{correctCount} správně</span>
				<span className="quiz-score-separator">•</span>
				<span className="quiz-score-remaining">{totalQuestions - Object.keys(results).length} zbývá</span>
			</div>
		</section>
	);
};

