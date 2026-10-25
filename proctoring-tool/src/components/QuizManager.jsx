// src/components/QuizManager.jsx
import { useEffect, useState } from 'react';
import {
  deleteQuiz,
  getAllProctoringSessions,
  getManagedQuizzes,
  publishQuiz,
  terminateProctoringSession,
  unlockProctoringSession,
  addExtraTimeToQuiz,
  addExtraTimeToSession,
  getInstructorScores
} from '../services/examApi';

export default function QuizManager({ onCreateNew, onEditQuiz, onTakeExam, onSwitchRole }) {
  // Quizzes State
  const [quizzes, setQuizzes] = useState([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [quizFilter, setQuizFilter] = useState('all'); // 'all' | 'published' | 'draft'

  // Selected Quiz for dedicated Detail & Scorecard View
  const [selectedQuiz, setSelectedQuiz] = useState(null);

  // Student Scores State
  const [scores, setScores] = useState([]);
  const [loadingScores, setLoadingScores] = useState(false);

  // Proctoring Sessions State
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedSessionAudit, setSelectedSessionAudit] = useState(null);

  // Extra Time Modal State
  const [extraTimeTarget, setExtraTimeTarget] = useState(null); // { type: 'quiz' | 'session', id: string, name: string, currentMins: number }
  const [extraMinutesToAdd, setExtraMinutesToAdd] = useState(5);
  const [savingExtraTime, setSavingExtraTime] = useState(false);

  // Copy plain text notification state
  const [copiedText, setCopiedText] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Load quizzes
  async function loadQuizzes() {
    setLoadingQuizzes(true);
    setErrorMsg('');
    try {
      const list = await getManagedQuizzes();
      setQuizzes(list || []);
      // If a quiz is selected, refresh its details from the list
      if (selectedQuiz) {
        const updated = (list || []).find((q) => q.id === selectedQuiz.id);
        if (updated) setSelectedQuiz(updated);
      }
    } catch (err) {
      console.error('Failed to load managed quizzes:', err);
      setErrorMsg('Could not connect to backend server. Make sure the backend is running.');
    } finally {
      setLoadingQuizzes(false);
    }
  }

  // Load scores
  async function loadScores() {
    setLoadingScores(true);
    try {
      const data = await getInstructorScores('all');
      setScores(data || []);
    } catch (err) {
      console.error('Failed to load instructor scores:', err);
    } finally {
      setLoadingScores(false);
    }
  }

  // Load sessions
  async function loadSessions() {
    setLoadingSessions(true);
    try {
      const sList = await getAllProctoringSessions();
      setSessions(sList || []);
    } catch (err) {
      console.error('Failed to load proctoring sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  }

  useEffect(() => {
    loadQuizzes();
    loadScores();
    loadSessions();
  }, []);

  // When selectedQuiz changes, refresh scores
  useEffect(() => {
    if (selectedQuiz) {
      loadScores();
      loadSessions();
    }
  }, [selectedQuiz]);

  // Publish a quiz
  async function handlePublish(quizId) {
    try {
      await publishQuiz(quizId);
      setSuccessMsg(`Quiz published successfully! It is now live for exam takers.`);
      await loadQuizzes();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to publish quiz.');
    }
  }

  // Delete a quiz and all associated student captures
  async function handleDelete(quizId, title) {
    if (!window.confirm(`Are you sure you want to delete "${title}"? All student camera & screen captures for this quiz will be permanently deleted.`)) {
      return;
    }
    try {
      if (window.athena?.deleteQuizCaptures) {
        await window.athena.deleteQuizCaptures(quizId);
      }
      await deleteQuiz(quizId);
      setSuccessMsg(`Quiz "${title}" and all associated student captures were deleted.`);
      if (selectedQuiz?.id === quizId) {
        setSelectedQuiz(null);
      }
      await loadQuizzes();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to delete quiz.');
    }
  }

  // Submit extra time
  async function handleSaveExtraTime() {
    if (!extraTimeTarget) return;
    setSavingExtraTime(true);
    try {
      if (extraTimeTarget.type === 'quiz') {
        const res = await addExtraTimeToQuiz(extraTimeTarget.id, extraMinutesToAdd);
        setSuccessMsg(res.message || `Added +${extraMinutesToAdd} minutes.`);
        await loadQuizzes();
      } else if (extraTimeTarget.type === 'session') {
        const res = await addExtraTimeToSession(extraTimeTarget.id, extraMinutesToAdd);
        setSuccessMsg(res.message || `Added +${extraMinutesToAdd} minutes to student session.`);
        await loadSessions();
      }
      setExtraTimeTarget(null);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to add extra time.');
    } finally {
      setSavingExtraTime(false);
    }
  }

  // Unlock session
  async function handleUnlockSession(sessionId) {
    try {
      await unlockProctoringSession(sessionId);
      setSuccessMsg(`Session unlocked! Student can now resume their exam.`);
      await loadSessions();
      if (selectedSessionAudit?.sessionId === sessionId) {
        setSelectedSessionAudit((prev) => ({ ...prev, status: 'in-progress', lockedReason: null }));
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to unlock session.');
    }
  }

  // Terminate session
  async function handleTerminateSession(sessionId) {
    if (!window.confirm('Are you sure you want to disqualify/terminate this exam attempt?')) {
      return;
    }
    try {
      await terminateProctoringSession(sessionId);
      setSuccessMsg(`Session terminated.`);
      await loadSessions();
      if (selectedSessionAudit?.sessionId === sessionId) {
        setSelectedSessionAudit((prev) => ({ ...prev, status: 'terminated' }));
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to terminate session.');
    }
  }

  // Filter quizzes for list
  const filteredQuizzes = quizzes.filter((q) => {
    if (quizFilter === 'published') return q.status === 'published';
    if (quizFilter === 'draft') return q.status === 'draft';
    return true;
  });

  // Only students who took the exam in the scheduled time (practice records excluded from instructor)
  const scheduledScores = selectedQuiz
    ? scores.filter((s) => s.quizId === selectedQuiz.id && s.scoreConsidered !== false && s.withinTimeSlot !== false)
    : [];

  // Proctoring sessions specific to selected quiz
  const quizSessions = selectedQuiz
    ? sessions.filter((s) => s.quizId === selectedQuiz.id)
    : [];

  // Statistics for students who took the exam in scheduled time
  const scheduledAttemptsCount = scheduledScores.length;
  const avgScore = scheduledAttemptsCount > 0
    ? Math.round(scheduledScores.reduce((acc, s) => acc + (s.percentage || 0), 0) / scheduledAttemptsCount)
    : 0;

  // Generate plain text scorecard for easy copying / text viewing
  function generatePlainTextScorecard() {
    if (!selectedQuiz) return '';
    const lines = [
      `========================================================================`,
      `ATHENA ASSESSMENT SCORECARD: ${selectedQuiz.title}`,
      `Topic: ${selectedQuiz.category || 'General'} | Duration: ${selectedQuiz.durationMinutes || 10} min`,
      `Schedule Window: ${selectedQuiz.schedule?.hasSchedule ? `${selectedQuiz.schedule.startTime} to ${selectedQuiz.schedule.endTime}` : 'Open / Anytime'}`,
      `Students Taken in Scheduled Time: ${scheduledAttemptsCount}`,
      `Average Score: ${scheduledAttemptsCount > 0 ? `${avgScore}%` : 'N/A'}`,
      `========================================================================`,
      ''
    ];

    if (scheduledScores.length === 0) {
      lines.push('No students have taken the exam in the scheduled time yet.');
    } else {
      scheduledScores.forEach((s, idx) => {
        lines.push(`[Attempt #${idx + 1}]`);
        lines.push(`  Name  : ${s.name}`);
        lines.push(`  ID    : ${s.userId}`);
        lines.push(`  Score : ${s.displayScore}`);
        lines.push(`  Flags : ${s.flagCount || 0} / 5${s.autoSubmitted ? ' (Auto-submitted on 5 flags)' : ''}`);
        lines.push(`------------------------------------------------------------------------`);
      });
    }

    return lines.join('\n');
  }

  // Copy text scorecard to clipboard
  function handleCopyTextScorecard() {
    const text = generatePlainTextScorecard();
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    }).catch(() => {
      alert('Could not copy to clipboard. Please copy manually from the text view.');
    });
  }

  return (
    <div className="card-container manager-container">
      {/* Top Instructor Header */}
      <div className="manager-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span className="instructor-badge">INSTRUCTOR SECTION</span>
            {selectedQuiz && (
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                / {selectedQuiz.title}
              </span>
            )}
          </div>
          <h2>🎓 Instructor Portal</h2>
          <p>Create AI quizzes, manage allotted duration, adjust extra time, and inspect student scorecards</p>
        </div>

        <div className="manager-header-actions">
          {selectedQuiz ? (
            <button
              className="btn btn-outline"
              onClick={() => setSelectedQuiz(null)}
              style={{ fontWeight: 600 }}
            >
              ← Back to All Quizzes
            </button>
          ) : (
            <button className="btn btn-primary" onClick={onCreateNew}>
              ✨ Create AI Quiz
            </button>
          )}

          {onSwitchRole && (
            <button className="btn btn-outline" onClick={onSwitchRole} title="Switch to Student view">
              🚪 Switch Role
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="warning-banner" style={{ margin: '14px 0' }}>
          <span>❌ {errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="success-banner" style={{ margin: '14px 0' }}>
          <span>{successMsg}</span>
        </div>
      )}

      {/* ============================================================== */}
      {/* VIEW A: ALL QUIZZES CATALOG (Clicking any quiz opens its view) */}
      {/* ============================================================== */}
      {!selectedQuiz && (
        <div className="quiz-catalog-section">
          <div className="manager-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>
                📚 Examination Quizzes ({filteredQuizzes.length})
              </span>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                — Click on any quiz to view its scorecard, edit, or add extra time
              </span>
            </div>

            <div className="filter-pill-group">
              <button
                className={`filter-btn ${quizFilter === 'all' ? 'active' : ''}`}
                onClick={() => setQuizFilter('all')}
              >
                All ({quizzes.length})
              </button>
              <button
                className={`filter-btn ${quizFilter === 'published' ? 'active' : ''}`}
                onClick={() => setQuizFilter('published')}
              >
                Published
              </button>
              <button
                className={`filter-btn ${quizFilter === 'draft' ? 'active' : ''}`}
                onClick={() => setQuizFilter('draft')}
              >
                Drafts
              </button>
            </div>
          </div>

          {loadingQuizzes ? (
            <div className="empty-state">
              <p>Loading quizzes...</p>
            </div>
          ) : filteredQuizzes.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📝</span>
              <p>No quizzes found. Click "Create AI Quiz" to generate an assessment.</p>
              <button className="btn btn-primary" onClick={onCreateNew} style={{ marginTop: '12px' }}>
                ✨ Create AI Quiz
              </button>
            </div>
          ) : (
            <div className="instructor-quiz-grid">
              {filteredQuizzes.map((quiz) => {
                const scheduledCount = scores.filter(
                  (s) => s.quizId === quiz.id && s.scoreConsidered !== false && s.withinTimeSlot !== false
                ).length;
                return (
                  <div
                    key={quiz.id}
                    className="instructor-quiz-card"
                    onClick={() => setSelectedQuiz(quiz)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="instructor-card-top">
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="quiz-category-tag">{quiz.category || 'General'}</span>
                          <span className="mono-id" style={{ fontSize: '10px', color: '#64748b' }}>
                            ID: {quiz.id}
                          </span>
                        </div>
                        <h4 className="instructor-card-title">{quiz.title}</h4>
                      </div>
                      <span className={`status-pill pill-${quiz.status || 'published'}`}>
                        {quiz.status === 'draft' ? '✏️ Draft' : '✓ Live'}
                      </span>
                    </div>

                    <p className="instructor-card-desc">{quiz.description}</p>

                    <div className="instructor-card-meta">
                      <span className="meta-chip">📝 {quiz.questions?.length || quiz.questionCount || 5} Questions</span>
                      <span className="meta-chip">⏱️ {quiz.durationMinutes || 10} Mins Allotted</span>
                      <span className="meta-chip">👥 {scheduledCount} In Scheduled Time</span>
                    </div>

                    {quiz.schedule?.hasSchedule && (
                      <div className="instructor-card-slot">
                        <span>📅 Slot: {new Date(quiz.schedule.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(quiz.schedule.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    )}

                    <div className="instructor-card-footer">
                      <span className="click-to-inspect">
                        📊 View Scorecard & Manage →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* VIEW B: SELECTED QUIZ DETAIL & SCORECARD (MANAGED SEPARATELY)  */}
      {/* ============================================================== */}
      {selectedQuiz && (
        <div className="selected-quiz-dashboard">
          {/* Quiz Action & Info Banner */}
          <div className="quiz-detail-header-card">
            <div className="quiz-detail-main-info">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                <span className="quiz-category-tag">{selectedQuiz.category || 'General'}</span>
                <span className={`status-pill pill-${selectedQuiz.status || 'published'}`}>
                  {selectedQuiz.status === 'draft' ? '✏️ Draft' : '✓ Published & Live'}
                </span>
                <span className="mono-id" style={{ fontSize: '11px', color: '#475569' }}>
                  ID: {selectedQuiz.id}
                </span>
              </div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '20px', color: '#0f172a' }}>
                {selectedQuiz.title}
              </h3>
              <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#64748b' }}>
                {selectedQuiz.description}
              </p>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="meta-chip">📝 {selectedQuiz.questions?.length || selectedQuiz.questionCount || 5} Questions</span>
                <span className="meta-chip" style={{ background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0' }}>
                  ⏱️ {selectedQuiz.durationMinutes || 10} Mins Allotted
                </span>
                {selectedQuiz.schedule?.hasSchedule ? (
                  <span className="meta-chip" style={{ background: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }}>
                    📅 Slot: {new Date(selectedQuiz.schedule.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} – {new Date(selectedQuiz.schedule.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                ) : (
                  <span className="meta-chip">📅 Slot: Anytime / Open Window</span>
                )}
              </div>
            </div>

            {/* Quiz Management Action Buttons */}
            {(() => {
              const now = new Date();
              const hasSchedule = selectedQuiz.schedule?.hasSchedule;
              const scheduleOngoing = Boolean(
                hasSchedule &&
                selectedQuiz.schedule?.startTime &&
                selectedQuiz.schedule?.endTime &&
                new Date(selectedQuiz.schedule.startTime) <= now &&
                new Date(selectedQuiz.schedule.endTime) >= now
              );
              const hasActiveStudent = (sessions || []).some(
                (s) => s.quizId === selectedQuiz.id && (s.status === 'in-progress' || s.status === 'paused' || s.status === 'locked')
              );
              const isQuizOngoing = scheduleOngoing || hasActiveStudent;

              return (
                <div className="quiz-detail-actions-panel">
                  <button
                    className="btn btn-outline"
                    disabled={!isQuizOngoing}
                    title={!isQuizOngoing ? "Extra time can only be added while an exam is currently ongoing (active examinees or scheduled window)." : "Add extra time to this ongoing quiz"}
                    style={!isQuizOngoing ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                    onClick={() => {
                      if (!isQuizOngoing) return;
                      setExtraTimeTarget({
                        type: 'quiz',
                        id: selectedQuiz.id,
                        name: selectedQuiz.title,
                        currentMins: selectedQuiz.durationMinutes || 10
                      });
                      setExtraMinutesToAdd(5);
                    }}
                  >
                    ⏱️ + Extra Time {isQuizOngoing ? '(Ongoing)' : ''}
                  </button>

                  <button
                    className="btn btn-outline"
                    onClick={() => onEditQuiz(selectedQuiz.id)}
                  >
                    ✏️ Edit Quiz
                  </button>

                  {selectedQuiz.status === 'draft' && (
                    <button
                      className="btn btn-primary"
                      onClick={() => handlePublish(selectedQuiz.id)}
                    >
                      🚀 Publish
                    </button>
                  )}

                  <button
                    className="btn btn-outline"
                    style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                    onClick={() => handleDelete(selectedQuiz.id, selectedQuiz.title)}
                  >
                    🗑️ Delete
                  </button>
                </div>
              );
            })()}
          </div>

          {/* Scorecard Metrics Row for this quiz */}
          <div className="scores-metrics-grid" style={{ marginTop: '20px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div className="metric-card">
              <span className="metric-title">Students Taken in Scheduled Time</span>
              <span className="metric-value" style={{ color: '#16a34a' }}>{scheduledAttemptsCount}</span>
              <span className="metric-sub">Examinees within official time slot</span>
            </div>
            <div className="metric-card">
              <span className="metric-title">Average Score</span>
              <span className="metric-value" style={{ color: '#2563eb' }}>
                {scheduledAttemptsCount > 0 ? `${avgScore}%` : '—'}
              </span>
              <span className="metric-sub">Scheduled examinees average</span>
            </div>
          </div>

          {/* ============================================================== */}
          {/* SCORECARD IN TEXT FORMAT                                        */}
          {/* ============================================================== */}
          <div className="scorecard-text-container" style={{ marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>
                  📊 Student Scorecard (Text Format)
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  Official examinees who took "{selectedQuiz.title}" within the scheduled time slot.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleCopyTextScorecard}
                  style={{ fontSize: '13px', padding: '6px 12px' }}
                >
                  {copiedText ? '✓ Copied Text!' : '📋 Copy Scorecard as Plain Text'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => loadScores()}
                  style={{ fontSize: '13px', padding: '6px 12px' }}
                >
                  🔄 Refresh
                </button>
              </div>
            </div>

            {loadingScores ? (
              <p style={{ fontSize: '13px', color: '#64748b' }}>Loading student scores...</p>
            ) : scheduledScores.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <span className="empty-icon">📋</span>
                <p>No students have taken this exam in the scheduled time yet.</p>
              </div>
            ) : (
              <>
                {/* Structured Text Cards (Name, ID, Score) */}
                <div className="text-scorecard-list">
                  {scheduledScores.map((attempt, idx) => (
                    <div
                      key={attempt.sessionId || idx}
                      className="text-scorecard-entry"
                    >
                      <div className="text-scorecard-row">
                        <span className="text-scorecard-label">Name:</span>
                        <strong className="text-scorecard-value">{attempt.name}</strong>
                      </div>

                      <div className="text-scorecard-row">
                        <span className="text-scorecard-label">ID:</span>
                        <span className="text-scorecard-value mono-id">{attempt.userId}</span>
                      </div>

                      <div className="text-scorecard-row">
                        <span className="text-scorecard-label">Score:</span>
                        <strong className="text-scorecard-value score-highlight">
                          {attempt.displayScore}
                        </strong>
                      </div>

                      <div className="text-scorecard-row">
                        <span className="text-scorecard-label">Flags:</span>
                        <span
                          className="text-scorecard-value"
                          style={{
                            fontWeight: 600,
                            color: (attempt.flagCount >= 5 || attempt.autoSubmitted) ? '#dc2626' : attempt.flagCount > 0 ? '#b45309' : '#16a34a'
                          }}
                        >
                          🚩 {attempt.flagCount || 0} / 5
                          {attempt.autoSubmitted ? ' (Auto-submitted on 5 flags)' : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Monospace Raw Text Output Block */}
                <details style={{ marginTop: '16px' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#2563eb' }}>
                    View Raw Plain Text Scorecard
                  </summary>
                  <pre
                    style={{
                      marginTop: '8px',
                      padding: '14px',
                      background: '#0f172a',
                      color: '#e2e8f0',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      overflowX: 'auto',
                      whiteSpace: 'pre-wrap',
                      lineHeight: '1.5'
                    }}
                  >
                    {generatePlainTextScorecard()}
                  </pre>
                </details>
              </>
            )}
          </div>


        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: ADD EXTRA TIME (TO QUIZ DEFINITION OR ACTIVE SESSION)    */}
      {/* ============================================================== */}
      {extraTimeTarget && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>⏱️ Add Extra Examination Time</h3>
              <button className="modal-close" onClick={() => setExtraTimeTarget(null)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <p style={{ fontSize: '13px', color: '#475569', marginBottom: '14px' }}>
                Grant additional duration to <strong>{extraTimeTarget.name}</strong>.
              </p>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Quick Preset Extra Minutes:
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[5, 10, 15, 30, 45].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      className={`pill-btn ${extraMinutesToAdd === mins ? 'active' : ''}`}
                      onClick={() => setExtraMinutesToAdd(mins)}
                      style={{ padding: '6px 14px', fontSize: '13px' }}
                    >
                      +{mins} min
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Custom Extra Minutes:
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  className="input-field"
                  value={extraMinutesToAdd}
                  onChange={(e) => setExtraMinutesToAdd(Math.max(1, Number(e.target.value)))}
                />
              </div>

              <div style={{ marginTop: '12px', fontSize: '12px', color: '#64748b', background: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
                ℹ️ Currently allotted: <strong>{extraTimeTarget.currentMins || 10} minutes</strong>. New allotted total will be <strong>{(extraTimeTarget.currentMins || 10) + Number(extraMinutesToAdd)} minutes</strong>.
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setExtraTimeTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveExtraTime}
                disabled={savingExtraTime}
              >
                {savingExtraTime ? 'Saving...' : `Add +${extraMinutesToAdd} Minutes`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
