// src/components/QuizCreator.jsx
import { useState } from 'react';
import { generateAiQuiz, regenerateAiQuestion, saveQuiz } from '../services/examApi';

export default function QuizCreator({ initialQuiz = null, onSaved, onCancel }) {
  // Form Configuration State
  const [title, setTitle] = useState(initialQuiz?.title || '');
  const [topic, setTopic] = useState(initialQuiz?.category || '');
  const [numQuestions, setNumQuestions] = useState(initialQuiz?.questions?.length || 5);
  const [difficulty, setDifficulty] = useState(initialQuiz?.difficulty || 'Medium');
  const [questionType, setQuestionType] = useState('MCQ');
  const [timeLimit, setTimeLimit] = useState(initialQuiz?.durationMinutes || 10);

  // Time Slot Scheduling State
  const formatDatetimeLocal = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const calculateEndTime = (startStr, durationMin) => {
    if (!startStr) return '';
    try {
      const startDate = new Date(startStr);
      if (isNaN(startDate.getTime())) return '';
      const endDate = new Date(startDate.getTime() + (Number(durationMin) || 10) * 60 * 1000);
      return formatDatetimeLocal(endDate);
    } catch {
      return '';
    }
  };

  const defaultStart = new Date();
  const defaultInitialMinutes = initialQuiz?.durationMinutes || 10;

  const [hasSchedule, setHasSchedule] = useState(
    initialQuiz?.schedule?.hasSchedule ?? true
  );
  const [slotStartTime, setSlotStartTime] = useState(
    initialQuiz?.schedule?.startTime
      ? initialQuiz.schedule.startTime.slice(0, 16)
      : formatDatetimeLocal(defaultStart)
  );
  const [slotEndTime, setSlotEndTime] = useState(
    initialQuiz?.schedule?.endTime
      ? initialQuiz.schedule.endTime.slice(0, 16)
      : calculateEndTime(formatDatetimeLocal(defaultStart), defaultInitialMinutes)
  );

  const handleStartTimeChange = (newStart) => {
    setSlotStartTime(newStart);
    if (newStart && timeLimit) {
      const calcEnd = calculateEndTime(newStart, timeLimit);
      if (calcEnd) setSlotEndTime(calcEnd);
    }
  };

  const handleTimeLimitChange = (newLimit) => {
    const val = Number(newLimit) || 1;
    setTimeLimit(val);
    if (slotStartTime) {
      const calcEnd = calculateEndTime(slotStartTime, val);
      if (calcEnd) setSlotEndTime(calcEnd);
    }
  };

  // Quiz Editor State
  const [quizData, setQuizData] = useState(initialQuiz || null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [regeneratingIndex, setRegeneratingIndex] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 1. Generate full quiz using AI
  async function handleGenerate() {
    if (!topic.trim() && !title.trim()) {
      setErrorMsg('Please specify a topic or quiz title.');
      return;
    }

    setIsGenerating(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await generateAiQuiz({
        title: title.trim() || `${topic.trim()} Assessment`,
        topic: topic.trim() || title.trim(),
        numQuestions: Number(numQuestions) || 5,
        difficulty,
        questionType,
        timeLimit: Number(timeLimit) || 10,
      });

      if (res.quiz) {
        setQuizData(res.quiz);
        if (!title.trim()) setTitle(res.quiz.title);
        setSuccessMsg(`Generated ${res.quiz.questions.length} questions successfully! You can now review, edit, or publish.`);
      }
    } catch (err) {
      console.error('Generation failed:', err);
      setErrorMsg(err.message || 'Failed to generate quiz. Please check API key and try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  // 2. Regenerate single question using AI
  async function handleRegenerateQuestion(idx) {
    if (!quizData) return;
    const currentQ = quizData.questions[idx];

    setRegeneratingIndex(idx);
    setErrorMsg('');

    try {
      const res = await regenerateAiQuestion({
        topic: topic.trim() || quizData.category || quizData.title,
        difficulty: quizData.difficulty || difficulty,
        questionType,
        existingQuestion: currentQ.question,
        index: idx + 1,
      });

      if (res.question) {
        const updatedQuestions = [...quizData.questions];
        updatedQuestions[idx] = res.question;
        setQuizData({ ...quizData, questions: updatedQuestions });
      }
    } catch (err) {
      console.error('Regenerate question failed:', err);
      setErrorMsg(`Could not regenerate question #${idx + 1}: ${err.message}`);
    } finally {
      setRegeneratingIndex(null);
    }
  }

  // 3. Question editing handlers
  function handleQuestionTextChange(idx, text) {
    const updated = [...quizData.questions];
    updated[idx] = { ...updated[idx], question: text };
    setQuizData({ ...quizData, questions: updated });
  }

  function handleOptionTextChange(qIdx, optIdx, text) {
    const updated = [...quizData.questions];
    const newOptions = [...updated[qIdx].options];
    newOptions[optIdx] = text;
    updated[qIdx] = { ...updated[qIdx], options: newOptions };
    setQuizData({ ...quizData, questions: updated });
  }

  function handleSetCorrectAnswer(qIdx, optIdx) {
    const updated = [...quizData.questions];
    updated[qIdx] = { ...updated[qIdx], correctAnswer: optIdx };
    setQuizData({ ...quizData, questions: updated });
  }

  function handleExplanationChange(qIdx, text) {
    const updated = [...quizData.questions];
    updated[qIdx] = { ...updated[qIdx], explanation: text };
    setQuizData({ ...quizData, questions: updated });
  }

  function handleDeleteQuestion(idx) {
    if (quizData.questions.length <= 1) {
      alert('A quiz must have at least one question.');
      return;
    }
    const updated = quizData.questions
      .filter((_, i) => i !== idx)
      .map((q, i) => ({ ...q, id: i + 1 }));
    setQuizData({ ...quizData, questions: updated });
  }

  function handleAddQuestion() {
    const newQ = {
      id: (quizData?.questions?.length || 0) + 1,
      question: 'New custom question...',
      options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
      correctAnswer: 0,
      explanation: 'Explanation for correct option.',
    };
    if (quizData) {
      setQuizData({ ...quizData, questions: [...quizData.questions, newQ] });
    } else {
      setQuizData({
        title: title || 'New Custom Quiz',
        description: topic || 'Custom assessment',
        category: topic || 'Custom',
        difficulty,
        durationMinutes: Number(timeLimit) || 10,
        questions: [newQ],
      });
    }
  }

  // 4. Save (Draft or Published)
  async function handleSave(status) {
    if (!title.trim() && !quizData?.title?.trim()) {
      setErrorMsg('Please give your quiz a title before saving.');
      return;
    }
    if (!quizData || !quizData.questions || quizData.questions.length === 0) {
      setErrorMsg('Please generate or add questions before saving.');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');

    try {
      const payload = {
        id: initialQuiz?.id || quizData.id,
        title: title.trim() || quizData.title,
        description: quizData.description || `Assessment on ${topic || title}`,
        category: topic.trim() || quizData.category || 'Custom',
        difficulty: quizData.difficulty || difficulty,
        durationMinutes: Number(timeLimit) || Number(quizData.durationMinutes) || 10,
        schedule: {
          hasSchedule: Boolean(hasSchedule),
          startTime: hasSchedule && slotStartTime ? new Date(slotStartTime).toISOString() : null,
          endTime: hasSchedule && slotEndTime ? new Date(slotEndTime).toISOString() : null,
        },
        status,
        questions: quizData.questions,
      };

      const res = await saveQuiz(payload);
      setSuccessMsg(status === 'published' ? '🎉 Quiz published successfully!' : '💾 Quiz saved as draft!');
      if (onSaved) {
        setTimeout(() => onSaved(res.quiz), 800);
      }
    } catch (err) {
      console.error('Save failed:', err);
      setErrorMsg(err.message || 'Failed to save quiz.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="card-container creator-container">
      {/* Header */}
      <div className="creator-header">
        <div className="creator-title-row">
          <div>
            <h2>✨ AI-Powered Custom Quiz Creator</h2>
            <p>Generate high-quality multiple choice assessments using Grok / Groq AI inference</p>
          </div>
          <button className="btn btn-outline" onClick={onCancel}>
            ← Back to Quizzes
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="warning-banner" style={{ margin: '16px 0' }}>
          <span>❌ {errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="success-banner" style={{ margin: '16px 0' }}>
          <span>{successMsg}</span>
        </div>
      )}

      {/* Generator Configuration Form */}
      <div className="generator-box">
        <h3 className="section-label">1. Configure Quiz Parameters</h3>
        <div className="creator-form-grid">
          <div className="input-group">
            <label>Quiz Title</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. Distributed Systems & Docker"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label>Topic / Subject / Concept</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. Kubernetes Pods, Ingress, and Services"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label>Number of Questions</label>
            <select
              className="input-field"
              value={numQuestions}
              onChange={(e) => setNumQuestions(Number(e.target.value))}
            >
              <option value={3}>3 Questions (Quick Check)</option>
              <option value={5}>5 Questions (Standard)</option>
              <option value={8}>8 Questions</option>
              <option value={10}>10 Questions (Comprehensive)</option>
              <option value={15}>15 Questions (Full Exam)</option>
            </select>
          </div>

          <div className="input-group">
            <label>Difficulty Level</label>
            <div className="pill-group">
              {['Easy', 'Medium', 'Hard'].map((diff) => (
                <button
                  key={diff}
                  type="button"
                  className={`pill-btn ${difficulty === diff ? 'active' : ''}`}
                  onClick={() => setDifficulty(diff)}
                >
                  {diff}
                </button>
              ))}
            </div>
          </div>

          <div className="input-group">
            <label>Question Type</label>
            <select
              className="input-field"
              value={questionType}
              onChange={(e) => setQuestionType(e.target.value)}
            >
              <option value="MCQ">Multiple Choice (4 Options)</option>
              <option value="True/False">True / False (2 Options)</option>
              <option value="Mixed">Mixed (MCQ + True/False)</option>
            </select>
          </div>

          <div className="input-group">
            <label>⏱️ Allotted Exam Duration (Minutes)</label>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
              {[5, 10, 15, 20, 30, 45, 60].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  className={`pill-btn ${timeLimit === mins ? 'active' : ''}`}
                  onClick={() => handleTimeLimitChange(mins)}
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                >
                  {mins}m
                </button>
              ))}
            </div>
            <input
              type="number"
              className="input-field"
              min={1}
              max={180}
              value={timeLimit}
              onChange={(e) => handleTimeLimitChange(Number(e.target.value))}
              placeholder="Custom allotted minutes"
            />
          </div>
        </div>

        {/* Scheduled Time Slot Configuration */}
        <div className="slot-scheduling-box" style={{ marginTop: '16px', background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>📅</span>
              <div>
                <strong style={{ fontSize: '14px', color: '#0f172a', display: 'block' }}>Schedule Official Examination Time Slot</strong>
                <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                  Students taking the quiz outside this slot can practice, but their score will not be considered or displayed in instructor grades.
                </p>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 600, color: '#2563eb' }}>
              <input
                type="checkbox"
                checked={hasSchedule}
                onChange={(e) => setHasSchedule(e.target.checked)}
              />
              Enforce Slot
            </label>
          </div>

          {hasSchedule && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  🟢 Window Start (Date & Time)
                </label>
                <input
                  type="datetime-local"
                  className="input-field"
                  value={slotStartTime}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  🔴 Window End (Date & Time)
                </label>
                <input
                  type="datetime-local"
                  className="input-field"
                  value={slotEndTime}
                  onChange={(e) => setSlotEndTime(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="generator-actions">
          <button
            className="btn btn-ai-generate"
            disabled={isGenerating || (!topic.trim() && !title.trim())}
            onClick={handleGenerate}
          >
            {isGenerating ? (
              <>
                <span className="spinner-dot"></span> Generating with AI...
              </>
            ) : (
              '⚡ Generate Questions with AI'
            )}
          </button>
          <button className="btn btn-outline" onClick={handleAddQuestion}>
            ➕ Add Question Manually
          </button>
        </div>
      </div>

      {/* Live Preview & Editor */}
      {quizData && quizData.questions && quizData.questions.length > 0 && (
        <div className="editor-section">
          <div className="editor-header-bar">
            <div>
              <h3 className="section-label">2. Review & Edit Questions ({quizData.questions.length})</h3>
              <p className="text-muted">Click any option to set it as the correct answer (highlighted in green). Edit text directly.</p>
            </div>
            <div className="editor-top-actions">
              <button
                className="btn btn-outline"
                disabled={isSaving}
                onClick={() => handleSave('draft')}
              >
                💾 Save Draft
              </button>
              <button
                className="btn btn-publish"
                disabled={isSaving}
                onClick={() => handleSave('published')}
              >
                🚀 Publish Quiz
              </button>
            </div>
          </div>

          <div className="questions-editor-list">
            {quizData.questions.map((q, qIdx) => (
              <div key={q.id || qIdx} className="question-edit-card">
                <div className="question-edit-header">
                  <div className="q-badge">Question #{qIdx + 1}</div>
                  <div className="q-actions">
                    <button
                      className="btn-text-action"
                      title="Generate an alternative question for this slot"
                      disabled={regeneratingIndex === qIdx}
                      onClick={() => handleRegenerateQuestion(qIdx)}
                    >
                      {regeneratingIndex === qIdx ? '🔄 Regenerating...' : '🔄 Regenerate AI'}
                    </button>
                    <button
                      className="btn-text-action danger"
                      title="Delete question"
                      onClick={() => handleDeleteQuestion(qIdx)}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>

                {/* Question Text */}
                <div className="input-group" style={{ marginBottom: '14px' }}>
                  <textarea
                    className="input-field text-area"
                    rows={2}
                    value={q.question}
                    onChange={(e) => handleQuestionTextChange(qIdx, e.target.value)}
                    placeholder="Enter question text..."
                  />
                </div>

                {/* Options List */}
                <div className="options-edit-grid">
                  {q.options.map((opt, optIdx) => {
                    const isCorrect = q.correctAnswer === optIdx;
                    return (
                      <div
                        key={optIdx}
                        className={`option-edit-row ${isCorrect ? 'is-correct' : ''}`}
                      >
                        <button
                          type="button"
                          className="correct-toggle-btn"
                          title="Click to mark as correct answer"
                          onClick={() => handleSetCorrectAnswer(qIdx, optIdx)}
                        >
                          {isCorrect ? '✓ Correct' : 'Mark'}
                        </button>
                        <input
                          type="text"
                          className="input-field opt-input"
                          value={opt}
                          onChange={(e) => handleOptionTextChange(qIdx, optIdx, e.target.value)}
                          placeholder={`Option ${optIdx + 1}`}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Explanation */}
                <div className="input-group explanation-group">
                  <label>Explanation (shown upon quiz submission review):</label>
                  <input
                    type="text"
                    className="input-field"
                    value={q.explanation || ''}
                    onChange={(e) => handleExplanationChange(qIdx, e.target.value)}
                    placeholder="Why this answer is correct..."
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Save Bar */}
          <div className="editor-footer-bar">
            <button className="btn btn-outline" onClick={handleAddQuestion}>
              ➕ Add Another Question
            </button>
            <div className="bottom-save-group">
              <button
                className="btn btn-outline"
                disabled={isSaving}
                onClick={() => handleSave('draft')}
              >
                💾 Save as Draft
              </button>
              <button
                className="btn btn-publish"
                disabled={isSaving}
                onClick={() => handleSave('published')}
              >
                {isSaving ? 'Publishing...' : '🚀 Publish Quiz to Students'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
