// src/App.jsx
import { useEffect, useRef, useState, useCallback } from 'react';
import './App.css';
import {
  getAllQuestions,
  getManagedQuiz,
  getQuizzes,
  startExam,
  submitAnswer,
  submitExam,
  reportViolation,
  resumeExam,
  loginInstructor
} from './services/examApi';
import QuizCreator from './components/QuizCreator';
import QuizManager from './components/QuizManager';

function CountdownTimerDisplay({ targetDate }) {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (!targetDate) return 0;
    const diff = Math.max(0, new Date(targetDate).getTime() - Date.now());
    return Math.floor(diff / 1000);
  });

  useEffect(() => {
    const tick = () => {
      if (!targetDate) {
        setSecondsLeft(0);
        return;
      }
      const diff = Math.max(0, new Date(targetDate).getTime() - Date.now());
      setSecondsLeft(Math.floor(diff / 1000));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const seconds = secondsLeft % 60;
  const pad = (n) => String(n).padStart(2, '0');

  if (secondsLeft <= 0) {
    return (
      <div className="countdown-live-banner">
        🎉 The scheduled start time has arrived! The exam is now unlocked.
      </div>
    );
  }

  return (
    <div className="countdown-clock-container">
      <div className="countdown-clock-unit">
        <span className="countdown-digit">{pad(hours)}</span>
        <span className="countdown-label">Hours</span>
      </div>
      <span className="countdown-separator">:</span>
      <div className="countdown-clock-unit">
        <span className="countdown-digit">{pad(minutes)}</span>
        <span className="countdown-label">Minutes</span>
      </div>
      <span className="countdown-separator">:</span>
      <div className="countdown-clock-unit">
        <span className="countdown-digit">{pad(seconds)}</span>
        <span className="countdown-label">Seconds</span>
      </div>
    </div>
  );
}

function App() {
  // App view state: 'setup' | 'quiz' | 'result'
  const [view, setView] = useState('setup');

  // Role Selection State: null (Role select screen) | 'student' | 'instructor'
  const [userRole, setUserRole] = useState(null);

  // Student Flow Steps: 'identity' -> 'quiz' -> 'permissions' -> 'instructions'
  const [studentStep, setStudentStep] = useState('identity');
  const [studentQuizCategoryFilter, setStudentQuizCategoryFilter] = useState('ongoing'); // 'ongoing' | 'past' | 'all'

  // Global clock ticker for reactive schedule countdowns and slot updates
  const [nowTime, setNowTime] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Instructor Flow: 'manage' | 'create'
  const [activeInstructorTab, setActiveInstructorTab] = useState('manage');
  const [editingQuiz, setEditingQuiz] = useState(null);

  // Role & Instructor Authentication (admin 101 required)
  const [isInstructor, setIsInstructor] = useState(() => {
    try {
      return sessionStorage.getItem('athena_instructor_auth') === 'true';
    } catch (e) {
      return false;
    }
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [instructorPassword, setInstructorPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Helper to check if quiz is within its scheduled time slot
  function getQuizSlotInfo(quiz) {
    if (!quiz?.schedule?.hasSchedule || !quiz.schedule.startTime) {
      return { hasSlot: false, isCurrent: true, isBefore: false, isAfter: false, label: 'Open Window / Anytime', start: null, end: null };
    }
    const now = new Date(nowTime);
    const start = new Date(quiz.schedule.startTime);
    const end = quiz.schedule.endTime ? new Date(quiz.schedule.endTime) : null;

    const isBefore = start > now;
    const isAfter = end && end < now;
    const isCurrent = !isBefore && !isAfter;

    const startStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endStr = end ? end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Open';
    const dateStr = start.toLocaleDateString([], { month: 'short', day: 'numeric' });

    let label = `${dateStr}, ${startStr} - ${endStr}`;
    return { hasSlot: true, isCurrent, isBefore, isAfter, label, start, end };
  }

  // Instructor authentication handler (password: admin 101)
  async function handleInstructorLoginSubmit(e) {
    if (e) e.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    try {
      const res = await loginInstructor(instructorPassword);
      if (res.success) {
        setIsInstructor(true);
        sessionStorage.setItem('athena_instructor_auth', 'true');
        setShowLoginModal(false);
        setUserRole('instructor');
        setActiveInstructorTab('manage');
        setInstructorPassword('');
      }
    } catch (err) {
      setLoginError(err.message || 'Incorrect instructor password. Please try again.');
    } finally {
      setLoggingIn(false);
    }
  }

  // Instructor logout handler
  function handleInstructorLogout() {
    setIsInstructor(false);
    sessionStorage.removeItem('athena_instructor_auth');
    setUserRole(null);
    setStudentStep('identity');
    setActiveInstructorTab('manage');
  }

  // Multi-quiz state
  const [quizzes, setQuizzes] = useState([
    {
      id: 'electron-basics',
      title: 'Electron & System Architecture',
      description: 'Fundamental concepts of Electron processes, IPC communication, and desktop app architecture.',
      category: 'Electron',
      durationMinutes: 10,
      questionCount: 5
    },
    {
      id: 'javascript-core',
      title: 'JavaScript Core & Asynchronous Concepts',
      description: 'Evaluate understanding of closures, promises, event loop microtasks, and modern ES features.',
      category: 'JavaScript',
      durationMinutes: 10,
      questionCount: 5
    },
    {
      id: 'react-fundamentals',
      title: 'React Hooks & Component Lifecycle',
      description: 'Test your mastery of useState, useEffect, cleanups, props, and React virtual DOM principles.',
      category: 'React',
      durationMinutes: 10,
      questionCount: 5
    }
  ]);
  const [selectedQuizId, setSelectedQuizId] = useState('electron-basics');
  const [activeQuizMeta, setActiveQuizMeta] = useState(null);

  // Student details
  const [studentName, setStudentName] = useState('Aditya Sharma');
  const [studentId, setStudentId] = useState('student-101');

  // Permissions state
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenSharingEnabled, setScreenSharingEnabled] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState('');



  // Exam session state
  const [sessionId, setSessionId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({}); // { [questionId]: optionIndex }
  const [answeredSubmitted, setAnsweredSubmitted] = useState(new Set()); // set of questionIds submitted to backend
  const [timer, setTimer] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Exam result state
  const [examResult, setExamResult] = useState(null);
  const [showReview, setShowReview] = useState(false);

  // Proctoring Flags State (Auto-submits on 5 flags)
  const [flagCount, setFlagCount] = useState(0);
  const [flagWarning, setFlagWarning] = useState(null); // { count, reason, critical }
  const flagCountRef = useRef(0);
  const lastFlagTimeRef = useRef(0);
  const isAutoSubmittingRef = useRef(false);
  const isQuizSubmittedRef = useRef(false);

  // References
  const videoRef = useRef(null);
  const screenVideoRef = useRef(null);
  const streamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const sessionIdRef = useRef('');
  const selectedAnswersRef = useRef({});
  const questionsRef = useRef([]);
  const viewRef = useRef('setup');
  const studentIdRef = useRef('student-101');

  // Sync refs with state
  useEffect(() => {
    flagCountRef.current = flagCount;
  }, [flagCount]);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    selectedAnswersRef.current = selectedAnswers;
  }, [selectedAnswers]);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    studentIdRef.current = studentId;
  }, [studentId]);

  // Periodic Camera snapshot capture
  async function saveVideoScreenShot() {
    if (viewRef.current !== 'quiz') {
      return;
    }

    const stream = streamRef.current || videoRef.current?.srcObject;
    if (!stream) {
      return;
    }

    try {
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState !== 'live') return;

      if (window.ImageCapture) {
        const imageCapture = new ImageCapture(track);
        const blob = await imageCapture.takePhoto();
        const arrayBuffer = await blob.arrayBuffer();
        window.athena?.storeCameraSnapImageOnDisk?.(arrayBuffer);
      } else if (videoRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth || 640;
        canvas.height = videoRef.current.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          if (blob) {
            const arrayBuffer = await blob.arrayBuffer();
            window.athena?.storeCameraSnapImageOnDisk?.(arrayBuffer);
          }
        }, 'image/jpeg', 0.8);
      }
    } catch (error) {
      console.error('Failed to capture camera snapshot:', error);
    }
  }

  // Ensure active video elements are attached to current camera and screen streams on view changes
  useEffect(() => {
    if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
    if (screenVideoRef.current && screenStreamRef.current && screenVideoRef.current.srcObject !== screenStreamRef.current) {
      screenVideoRef.current.srcObject = screenStreamRef.current;
    }
  }, [view, cameraEnabled, screenSharingEnabled]);

  // Fetch dynamic quizzes from backend on load
  async function loadQuizzes() {
    try {
      const list = await getQuizzes();
      if (Array.isArray(list) && list.length > 0) {
        setQuizzes(list);
        if (!selectedQuizId || !list.some((q) => q.id === selectedQuizId)) {
          setSelectedQuizId(list[0].id);
          setActiveQuizMeta(list[0]);
        }
      }
    } catch (err) {
      console.warn('Backend not yet reachable or returned error, using fallback quizzes:', err.message);
    }
  }

  useEffect(() => {
    loadQuizzes();
  }, []);

  // Handler when quiz is saved from Creator
  async function handleQuizSaved(savedQuiz) {
    await loadQuizzes();
    if (savedQuiz?.status === 'published') {
      setSelectedQuizId(savedQuiz.id);
      setActiveQuizMeta(savedQuiz);
    }
    setActiveInstructorTab('manage');
    setEditingQuiz(null);
  }

  // Handler to edit quiz from Manager
  async function handleEditQuiz(quizId) {
    try {
      const full = await getManagedQuiz(quizId);
      setEditingQuiz(full);
      setActiveInstructorTab('create');
    } catch (err) {
      alert(`Could not load quiz details: ${err.message}`);
    }
  }

  // Handler to directly take an exam from Manager
  function handleTakeQuizFromManager(quizId) {
    setSelectedQuizId(quizId);
    const target = quizzes.find((q) => q.id === quizId);
    if (target) setActiveQuizMeta(target);
    setUserRole('student');
    setStudentStep('permissions');
  }

  // IPC listeners for Timer and Camera snap from Electron Main process
  useEffect(() => {
    const removeTimerTick = window.athena?.registerListenerForTimerTickFromMain?.((tick) => {
      setTimer(tick);
    });

    const removeCameraSnap = window.athena?.registerListenerForCameraSnapFromMain?.(() => {
      saveVideoScreenShot();
    });

    return () => {
      removeTimerTick?.();
      removeCameraSnap?.();
    };
  }, []);

  // Proctoring Flag Recording Handler (Max 5 flags -> auto submit)
  const handleRecordFlag = useCallback((reason) => {
    // Strictly disallow flagging once quiz submission starts or once submitted
    if (viewRef.current !== 'quiz' || isAutoSubmittingRef.current || isQuizSubmittedRef.current) return;

    const now = Date.now();
    // 1500ms debounce so exit-fullscreen + blur doesn't increment twice for a single event
    if (now - lastFlagTimeRef.current < 1500) {
      return;
    }
    lastFlagTimeRef.current = now;

    const nextCount = flagCountRef.current + 1;
    flagCountRef.current = nextCount;
    setFlagCount(nextCount);

    if (nextCount >= 5) {
      isAutoSubmittingRef.current = true;
      isQuizSubmittedRef.current = true;
      setFlagWarning({
        count: 5,
        reason: reason || 'Maximum 5 flags reached',
        critical: true,
      });
      performSubmitExam(true, `Auto-submitted: 5 flags reached (${reason || 'exited fullscreen or switched windows 5 times'}).`);
    } else {
      setFlagWarning({
        count: nextCount,
        reason: reason || 'Exited fullscreen or changed window',
        critical: false,
      });
      setTimeout(() => {
        setFlagWarning((curr) => (curr?.count === nextCount ? null : curr));
      }, 4500);
    }
  }, []);

  // Fullscreen & Window Switch Flag Recording Listeners
  useEffect(() => {
    function handleFullscreenChange() {
      if (viewRef.current === 'quiz' && !isQuizSubmittedRef.current) {
        const isFs = !!document.fullscreenElement;
        setFullScreen(isFs);
        if (!isFs) {
          handleRecordFlag('Exited Fullscreen');
        }
      }
    }

    function handleWindowBlur() {
      if (viewRef.current === 'quiz' && !isQuizSubmittedRef.current) {
        handleRecordFlag('Switched to another application / window');
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    window.addEventListener('blur', handleWindowBlur);

    const removeFullscreenEnter = window.athena?.registerListenerForFullscreenEnter?.(() => {
      setFullScreen(true);
    });

    const removeFullscreenExit = window.athena?.registerListenerForFullscreenExit?.(() => {
      if (viewRef.current === 'quiz' && !isQuizSubmittedRef.current) {
        setFullScreen(false);
        handleRecordFlag('Exited Fullscreen');
      }
    });

    const removeWindowBlur = window.athena?.registerListenerForWindowBlur?.(() => {
      if (viewRef.current === 'quiz' && !isQuizSubmittedRef.current) {
        handleRecordFlag('Switched to another window');
      }
    });

    const removeWindowMinimize = window.athena?.registerListenerForWindowMinimize?.(() => {
      if (viewRef.current === 'quiz' && !isQuizSubmittedRef.current) {
        handleRecordFlag('Window minimized');
      }
    });

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      window.removeEventListener('blur', handleWindowBlur);
      removeFullscreenEnter?.();
      removeFullscreenExit?.();
      removeWindowBlur?.();
      removeWindowMinimize?.();
    };
  }, [handleRecordFlag]);

  // Page lifecycle & emergency shortcut handling during active quiz
  useEffect(() => {
    if (view === 'quiz') {
      const handleKeyDown = (e) => {
        // Emergency quit bypass: Cmd+Shift+Q or Ctrl+Shift+Q
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'q') {
          handleQuitQuiz();
          return;
        }
      };

      const handleBeforeUnload = (e) => {
        e.preventDefault();
        e.returnValue = '';
        return '';
      };

      window.addEventListener('keydown', handleKeyDown, true);
      window.addEventListener('beforeunload', handleBeforeUnload);

      return () => {
        window.removeEventListener('keydown', handleKeyDown, true);
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
  }, [view]);

  // Camera permissions
  async function getCameraAccess() {
    try {
      const videoData = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      streamRef.current = videoData;
      setCameraEnabled(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = videoData;
        }
      }, 50);
    } catch (error) {
      alert('Cannot access camera. Please allow camera permissions.');
    }
  }

  // Screen Sharing permission & capture stream setup
  async function getScreenShareAccess() {
    try {
      let displayStream = null;

      // 1. Check if running inside Electron and has getScreenSources support
      if (window.athena?.getScreenSources) {
        try {
          const status = await window.athena?.getMediaAccessStatus?.('screen');
          if (status === 'denied') {
            alert(
              'Screen Recording permission is denied on your Mac.\n\n' +
              'Please open System Settings > Privacy & Security > Screen Recording, toggle Electron / Athena ON, and restart the application.'
            );
            return;
          }

          const sources = await window.athena.getScreenSources();
          console.log('Available screen sources in Electron:', sources);

          if (sources && sources.length > 0) {
            const targetSource = sources.find((s) => s.id.startsWith('screen:')) || sources[0];

            try {
              displayStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                  mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: targetSource.id,
                    minWidth: 1280,
                    maxWidth: 1920,
                    minHeight: 720,
                    maxHeight: 1080
                  }
                }
              });
            } catch (userMediaErr) {
              console.warn('getUserMedia desktop source error, trying fallback:', userMediaErr);
            }
          }
        } catch (ipcErr) {
          console.warn('Electron screen sources query error:', ipcErr);
        }
      }

      // 2. Standard getDisplayMedia fallback (works with Electron setDisplayMediaRequestHandler and in web browsers)
      if (!displayStream && navigator.mediaDevices?.getDisplayMedia) {
        try {
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false
          });
        } catch (displayMediaErr) {
          console.warn('getDisplayMedia simple constraint error, retrying without audio option:', displayMediaErr);
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true
          });
        }
      }

      if (!displayStream) {
        throw new Error('Could not establish screen capture stream.');
      }

      screenStreamRef.current = displayStream;
      setScreenSharingEnabled(true);
      setTimeout(() => {
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = displayStream;
        }
      }, 50);

      // Detect if user clicks "Stop sharing" button in browser or system bar
      const track = displayStream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          setScreenSharingEnabled(false);
          screenStreamRef.current = null;
        };
      }
    } catch (err) {
      console.error('Cannot access screen capture:', err);
      let msg = 'Screen sharing permission is required for examination proctoring.';
      if (err.name === 'NotAllowedError' || err.message?.toLowerCase().includes('denied') || err.message?.toLowerCase().includes('permission')) {
        msg += '\n\nPermission was denied. On macOS, please ensure Screen Recording permission is allowed in System Settings > Privacy & Security > Screen Recording.';
      }
      alert(msg);
    }
  }

  // Fullscreen toggle & lock
  async function enableFullScreen() {
    // 1. Immediately request DOM fullscreen synchronously in user gesture
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => {
          console.warn('DOM requestFullscreen non-fatal:', err?.message || err);
        });
      }
    } catch (err) {
      console.warn('DOM requestFullscreen sync error:', err);
    }

    // 2. Also invoke Electron main process to fullscreen the native OS window
    try {
      if (window.athena?.enterFullscreen) {
        await window.athena.enterFullscreen();
      }
    } catch (error) {
      console.warn('Electron enterFullscreen error:', error);
    }

    // 3. Mark state as active and granted
    setFullScreen(true);
  }

  // Cleanup active media streams (both camera and screen recording)
  function cleanupMediaStreams() {
    // 1. Stop and release screen recording stream
    if (screenStreamRef.current) {
      try {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch (e) {
        console.warn('Error stopping screen track:', e);
      }
      screenStreamRef.current = null;
    }
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
    }
    setScreenSharingEnabled(false);

    // 2. Stop and release user camera stream
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop());
      } catch (e) {
        console.warn('Error stopping camera track:', e);
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraEnabled(false);
  }

  // Start exam session & fetch questions
  async function handleStartExam() {
    if (!studentName.trim() || !studentId.trim()) {
      alert('Please provide student name and student ID.');
      setStudentStep('identity');
      return;
    }



    const chosenQuiz = quizzes.find((q) => q.id === selectedQuizId) || activeQuizMeta || quizzes[0];
    const slotInfo = getQuizSlotInfo(chosenQuiz);
    if (slotInfo.isBefore) {
      alert(`This examination has not started yet. It is scheduled to begin at ${slotInfo.start ? slotInfo.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : slotInfo.label}.`);
      return;
    }

    if (!cameraEnabled || !screenSharingEnabled || !fullScreen) {
      alert('Camera, Screen Sharing, and Fullscreen permissions are all required to begin the examination.');
      setStudentStep('permissions');
      return;
    }

    // Trigger fullscreen immediately synchronously in the click gesture!
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      if (window.athena?.enterFullscreen) {
        window.athena.enterFullscreen().catch(() => {});
      }
    } catch (fsErr) {
      // non-fatal
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const chosenQuiz = quizzes.find((q) => q.id === selectedQuizId) || quizzes[0];
      setActiveQuizMeta(chosenQuiz);

      // 1. Initialize backend session with quizId
      const sessionData = await startExam(studentId.trim(), studentName.trim(), selectedQuizId);
      setSessionId(sessionData.sessionId);

      // 2. Fetch MCQ questions for selected quiz
      const qList = await getAllQuestions(selectedQuizId);
      if (!qList || qList.length === 0) {
        throw new Error(`No exam questions found for quiz "${chosenQuiz?.title || selectedQuizId}".`);
      }
      setQuestions(qList);
      setCurrentIndex(0);
      setSelectedAnswers({});
      setAnsweredSubmitted(new Set());

      // 3. Start main process proctoring timer & camera captures with student info and quiz details
      await window.athena?.startTimerOnMain?.({
        studentName: studentName.trim(),
        studentId: studentId.trim(),
        quizId: chosenQuiz?.id || selectedQuizId,
        quizTitle: chosenQuiz?.title || activeQuizMeta?.title || "Quiz"
      });

      // Reset flag counters for new test attempt
      setFlagCount(0);
      flagCountRef.current = 0;
      setFlagWarning(null);
      isAutoSubmittingRef.current = false;
      isQuizSubmittedRef.current = false;
      lastFlagTimeRef.current = Date.now() + 1500; // 1.5s grace period

      // 4. Switch to quiz view & enter standard fullscreen (without kiosk lock)
      setView('quiz');
      setFullScreen(true);
      if (window.athena?.lockQuizScreen) {
        await window.athena.lockQuizScreen().catch(() => {});
      }
      if (window.athena?.enterFullscreen) {
        window.athena.enterFullscreen().catch(() => {});
      }
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch (err) {
      console.error('Failed to start exam:', err);
      setErrorMsg(err.message || 'Error connecting to exam backend');
    } finally {
      setLoading(false);
    }
  }

  // Select an option for the current question
  function handleSelectOption(optionIndex) {
    if (view !== 'quiz') return;
    const currentQ = questions[currentIndex];
    if (!currentQ) return;

    setSelectedAnswers((prev) => ({
      ...prev,
      [currentQ.id]: optionIndex,
    }));
  }

  // Move to next question and sync answer to backend if needed
  async function handleNextQuestion() {
    const currentQ = questions[currentIndex];
    const selected = selectedAnswers[currentQ.id];

    if (selected !== undefined && !answeredSubmitted.has(currentQ.id)) {
      try {
        await submitAnswer(sessionId, currentQ.id, selected);
        setAnsweredSubmitted((prev) => new Set(prev).add(currentQ.id));
      } catch (err) {
        console.error('Error saving answer:', err);
      }
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  }

  // Move to previous question
  function handlePrevQuestion() {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }

  // Submit exam and retrieve final score with foolproof unlocking and stream cleanup
  async function performSubmitExam(isAuto = false, autoReason = null) {
    // Immediately block any further flag recording during or after submission
    isQuizSubmittedRef.current = true;
    setFlagWarning(null);
    setLoading(true);
    let finalResult = null;
    try {
      const activeSession = sessionIdRef.current;
      const activeQuestions = questionsRef.current;
      const answersMap = selectedAnswersRef.current;

      for (const q of activeQuestions) {
        if (answersMap[q.id] !== undefined && !answeredSubmitted.has(q.id)) {
          try {
            await submitAnswer(activeSession, q.id, answersMap[q.id]);
          } catch (e) {
            // ignore if already submitted
          }
        }
      }

      try {
        const response = await submitExam(activeSession, {
          flagCount: flagCountRef.current,
          autoSubmitted: isAuto,
          autoSubmitReason: autoReason,
        });
        finalResult = response?.result;
        if (finalResult) {
          if (finalResult.flagCount === undefined) {
            finalResult.flagCount = flagCountRef.current;
          }
          if (!finalResult.quizTitle) {
            finalResult.quizTitle = response?.quizTitle || activeQuizMeta?.title;
          }
        }
        if (isAuto && finalResult) {
          finalResult.autoSubmitted = true;
          finalResult.autoSubmitReason = autoReason;
        }
      } catch (submitErr) {
        console.warn('Backend submit error, using local computation:', submitErr);
        let correctCount = 0;
        let attemptedCount = 0;
        activeQuestions.forEach((q) => {
          if (answersMap[q.id] !== undefined) {
            attemptedCount++;
            if (answersMap[q.id] === q.correctAnswer) {
              correctCount++;
            }
          }
        });
        finalResult = {
          attempted: attemptedCount,
          correct: correctCount,
          wrong: Math.max(0, attemptedCount - correctCount),
          totalQuestions: activeQuestions.length,
          scoreConsidered: true,
          withinTimeSlot: true,
          flagCount: flagCountRef.current,
          autoSubmitted: isAuto,
          autoSubmitReason: autoReason,
        };
      }
      setExamResult(finalResult);
    } catch (err) {
      console.error('Error in exam submission:', err);
    } finally {
      // GUARANTEED UNLOCK & TEARDOWN:
      // Even if submitting fails, ALWAYS unlock screen, stop timer, turn off camera/screen, and exit fullscreen!
      try {
        await window.athena?.unlockQuizScreen?.();
      } catch (_) {}
      try {
        await window.athena?.stopTimerOnMain?.();
      } catch (_) {}
      try {
        cleanupMediaStreams();
      } catch (_) {}
      try {
        await window.athena?.exitFullscreen?.();
        if (document.fullscreenElement) {
          await document.exitFullscreen?.().catch(() => {});
        }
      } catch (_) {}
      setFullScreen(false);
      setLoading(false);
      setView('result');
    }
  }

  function handleSubmitExam() {
    // Suppress flags while native confirm dialog is shown
    isQuizSubmittedRef.current = true;
    if (window.confirm('Are you sure you want to submit your exam?')) {
      performSubmitExam();
    } else {
      // User cancelled dialog, resume proctoring flag checks with grace window
      isQuizSubmittedRef.current = false;
      lastFlagTimeRef.current = Date.now() + 1500;
    }
  }

  // Quit exam handler with guaranteed unlock and stream teardown
  const handleQuitQuiz = async () => {
    isQuizSubmittedRef.current = true;
    setFlagWarning(null);
    try {
      await window.athena?.unlockQuizScreen?.();
    } catch (_) {}
    try {
      await window.athena?.stopTimerOnMain?.();
    } catch (_) {}
    try {
      cleanupMediaStreams();
    } catch (_) {}
    try {
      await window.athena?.exitFullscreen?.();
      if (document.fullscreenElement) {
        await document.exitFullscreen?.().catch(() => {});
      }
    } catch (_) {}
    setFullScreen(false);

    if (window.athena?.quitQuiz) {
      window.athena.quitQuiz();
    } else {
      setView('setup');
      setUserRole(null);
    }
  };

  const allMarked =
    questions.length > 0 &&
    questions.every((q) => selectedAnswers[q.id] !== undefined);

  const isLastQuestion =
    questions.length > 0 && currentIndex === questions.length - 1;

  const isNextDisabled = allMarked || isLastQuestion;
  const currentQ = questions[currentIndex];

  // Number of granted permissions
  const grantedCount =
    (cameraEnabled ? 1 : 0) +
    (screenSharingEnabled ? 1 : 0) +
    (fullScreen ? 1 : 0);

  // ---------------- Render Views ----------------

  return (
    <div className="page-container">
      {/* ============================================================== */}
      {/* SETUP VIEW: Role Select, Instructor Section, or Student Flow   */}
      {/* ============================================================== */}
      {view === 'setup' && (
        <>
          {/* SCENARIO 1: ROLE SELECTION LANDING SCREEN (When userRole === null) */}
          {userRole === null && (
            <div className="welcome-portal-wrapper">
              <div className="welcome-header">
                <div className="welcome-logo-badge">🛡️</div>
                <h1>Welcome to Athena Assessment Portal</h1>
                <p>Select your role below to proceed with examinations or administrative controls</p>
              </div>

              <div className="role-selection-grid">
                {/* 1. Student Option */}
                <div
                  className="role-card"
                  onClick={() => {
                    setUserRole('student');
                    setStudentStep('identity');
                  }}
                >
                  <div className="role-card-icon">🎓</div>
                  <h3 className="role-card-title">I am a Student</h3>
                  <p className="role-card-desc">
                    Enter student credentials, select an ongoing examination or practice test, grant device permissions, and begin your proctored exam.
                  </p>
                  <div className="role-card-btn">
                    Continue as Student →
                  </div>
                </div>

                {/* 2. Instructor Option */}
                <div
                  className="role-card"
                  onClick={() => {
                    if (isInstructor) {
                      setUserRole('instructor');
                      setActiveInstructorTab('manage');
                    } else {
                      setInstructorPassword('');
                      setLoginError('');
                      setShowLoginModal(true);
                    }
                  }}
                >
                  <div className="role-card-icon">👨‍🏫</div>
                  <h3 className="role-card-title">I am an Instructor</h3>
                  <p className="role-card-desc">
                    Create AI-generated quizzes, set allotted time limits and time slots, add extra time, and inspect student scorecards.
                  </p>
                  <div className="role-card-btn">
                    Access Instructor Portal →
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SCENARIO 2: INSTRUCTOR SECTION (When userRole === 'instructor' && isInstructor) */}
          {userRole === 'instructor' && isInstructor && (
            <>
              {/* Instructor Top Bar */}
              <nav className="app-navbar instructor-navbar">
                <div className="nav-brand">
                  <span style={{ fontSize: '20px' }}>🛡️</span>
                  <span>Athena Proctor</span>
                  <span className="brand-badge instructor-badge">INSTRUCTOR SECTION</span>
                </div>

                <div className="nav-tabs">
                  <button
                    className={`nav-item ${activeInstructorTab === 'manage' ? 'active' : ''}`}
                    onClick={() => setActiveInstructorTab('manage')}
                  >
                    📋 Quizzes & Scorecards
                  </button>
                  <button
                    className={`nav-item ${activeInstructorTab === 'create' ? 'active' : ''}`}
                    onClick={() => {
                      setEditingQuiz(null);
                      setActiveInstructorTab('create');
                    }}
                  >
                    ✨ Create AI Quiz
                  </button>
                </div>

                <div className="nav-instructor-action">
                  <button
                    type="button"
                    className="btn-instructor-logout"
                    onClick={handleInstructorLogout}
                    title="Switch to Student view or change role"
                  >
                    🚪 Switch Role / Logout
                  </button>
                </div>
              </nav>

              {/* View 1A: Quiz Creator (Inside Instructor Section Only!) */}
              {activeInstructorTab === 'create' && (
                <QuizCreator
                  initialQuiz={editingQuiz}
                  onSaved={handleQuizSaved}
                  onCancel={() => {
                    setEditingQuiz(null);
                    setActiveInstructorTab('manage');
                  }}
                />
              )}

              {/* View 1B: Quiz Manager (Quizzes list -> Click quiz -> Scorecard in text format + options) */}
              {activeInstructorTab === 'manage' && (
                <QuizManager
                  onCreateNew={() => {
                    setEditingQuiz(null);
                    setActiveInstructorTab('create');
                  }}
                  onEditQuiz={handleEditQuiz}
                  onTakeExam={handleTakeQuizFromManager}
                  onSwitchRole={() => setUserRole(null)}
                />
              )}
            </>
          )}

          {/* SCENARIO 3: STUDENT FLOW (When userRole === 'student') */}
          {userRole === 'student' && (
            <>
              {/* Student Top Bar */}
              <nav className="app-navbar">
                <div className="nav-brand">
                  <span style={{ fontSize: '20px' }}>🛡️</span>
                  <span>Athena Proctor</span>
                  <span className="brand-badge">STUDENT PORTAL</span>
                </div>

                <div className="nav-tabs">
                  <div className="step-wizard-bar" style={{ margin: 0 }}>
                    <div className={`step-pill ${studentStep === 'identity' ? 'active' : 'completed'}`}>
                      1. Identity
                    </div>
                    <span className="step-arrow">→</span>
                    <div className={`step-pill ${studentStep === 'quiz' ? 'active' : (studentStep === 'permissions' || studentStep === 'instructions') ? 'completed' : ''}`}>
                      2. Select Quiz
                    </div>
                    <span className="step-arrow">→</span>
                    <div className={`step-pill ${studentStep === 'permissions' ? 'active' : studentStep === 'instructions' ? 'completed' : ''}`}>
                      3. Permissions
                    </div>
                    <span className="step-arrow">→</span>
                    <div className={`step-pill ${studentStep === 'instructions' ? 'active' : ''}`}>
                      4. Instructions
                    </div>
                  </div>
                </div>

                <div className="nav-instructor-action">
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ fontSize: '12px', padding: '5px 12px' }}
                    onClick={() => setUserRole(null)}
                  >
                    ← Change Role
                  </button>
                </div>
              </nav>

              {/* STUDENT STEP 1: ASK NAME AND STUDENT ID */}
              {studentStep === 'identity' && (
                <div className="card-container minimal-setup-card">
                  <div className="header-section" style={{ marginBottom: '24px' }}>
                    <h1>Step 1: Student Verification</h1>
                    <p>Please enter your official student credentials to proceed</p>
                  </div>

                  <div className="student-form-compact">
                    <div className="input-group">
                      <label>Full Name</label>
                      <input
                        className="input-field"
                        type="text"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        placeholder="Enter your full name"
                        autoFocus
                      />
                    </div>
                    <div className="input-group">
                      <label>Student ID / Roll Number</label>
                      <input
                        className="input-field"
                        type="text"
                        value={studentId}
                        onChange={(e) => setStudentId(e.target.value)}
                        placeholder="e.g. STU-101"
                      />
                    </div>
                  </div>

                  <div className="minimal-footer-actions" style={{ marginTop: '28px' }}>
                    <button
                      className="btn btn-primary"
                      disabled={!studentName.trim() || !studentId.trim()}
                      onClick={() => setStudentStep('quiz')}
                    >
                      Next: Select Assessment →
                    </button>
                    <button
                      className="btn btn-outline"
                      onClick={() => setUserRole(null)}
                    >
                      ← Back to Role Selection
                    </button>
                  </div>
                </div>
              )}

              {/* STUDENT STEP 2: SELECT QUIZ (SMALL CARDS, ONGOING & PAST TABS) */}
              {studentStep === 'quiz' && (
                <div className="card-container minimal-setup-card">
                  <div className="header-section" style={{ marginBottom: '16px' }}>
                    <h1>Step 2: Select Assessment</h1>
                    <p>Select an ongoing exam during its scheduled slot, or attempt a past quiz for practice</p>
                  </div>

                  {/* Filter Tabs: Ongoing vs Past Quizzes */}
                  <div className="quiz-filter-toggle">
                    <button
                      type="button"
                      className={`quiz-filter-tab ${studentQuizCategoryFilter === 'ongoing' ? 'active' : ''}`}
                      onClick={() => setStudentQuizCategoryFilter('ongoing')}
                    >
                      🟢 Ongoing & Scheduled ({quizzes.filter((q) => { const s = getQuizSlotInfo(q); return s.isCurrent || s.isBefore; }).length})
                    </button>
                    <button
                      type="button"
                      className={`quiz-filter-tab ${studentQuizCategoryFilter === 'past' ? 'active' : ''}`}
                      onClick={() => setStudentQuizCategoryFilter('past')}
                    >
                      ⏳ Past Quizzes ({quizzes.filter((q) => getQuizSlotInfo(q).isAfter).length})
                    </button>
                    <button
                      type="button"
                      className={`quiz-filter-tab ${studentQuizCategoryFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setStudentQuizCategoryFilter('all')}
                    >
                      📚 All Quizzes ({quizzes.length})
                    </button>
                  </div>

                  {/* Compact Quiz Cards Grid */}
                  <div className="compact-quiz-grid">
                    {(() => {
                      const list = quizzes.filter((q) => {
                        const slot = getQuizSlotInfo(q);
                        if (studentQuizCategoryFilter === 'ongoing') return slot.isCurrent || slot.isBefore;
                        if (studentQuizCategoryFilter === 'past') return slot.isAfter;
                        return true;
                      });

                      if (list.length === 0) {
                        return (
                          <div style={{ gridColumn: '1 / -1', padding: '24px', textAlign: 'center', color: '#64748b' }}>
                            No quizzes found in this category. Try switching filter tabs.
                          </div>
                        );
                      }

                      return list.map((quiz) => {
                        const isSelected = quiz.id === selectedQuizId;
                        const slotInfo = getQuizSlotInfo(quiz);
                        return (
                          <div
                            key={quiz.id}
                            className={`compact-quiz-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => {
                              setSelectedQuizId(quiz.id);
                              setActiveQuizMeta(quiz);
                            }}
                            onDoubleClick={() => {
                              setSelectedQuizId(quiz.id);
                              setActiveQuizMeta(quiz);
                              setStudentStep('permissions');
                            }}
                          >
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                <span className="compact-chip" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                                  {quiz.category || 'Quiz'}
                                </span>
                                {slotInfo.isBefore ? (
                                  <span className="badge-tag-slot-scheduled" style={{ fontSize: '9px', padding: '1px 6px' }}>
                                    ⏳ Scheduled ({slotInfo.start?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                                  </span>
                                ) : slotInfo.isCurrent ? (
                                  <span className="badge-tag-slot-ok" style={{ fontSize: '9px', padding: '1px 6px' }}>
                                    ✓ Active
                                  </span>
                                ) : (
                                  <span className="badge-tag-slot-warn" style={{ fontSize: '9px', padding: '1px 6px' }}>
                                    Past
                                  </span>
                                )}
                              </div>
                              <h4 className="compact-card-title">{quiz.title}</h4>
                            </div>

                            <div>
                              <div className="compact-card-meta">
                                <span className="compact-chip">📝 {quiz.questionCount || quiz.questions?.length || 5} Qs</span>
                                <span className="compact-chip">⏱️ {quiz.durationMinutes || 10}m</span>
                              </div>
                              <div className="compact-card-slot">
                                <span>📅 {slotInfo.label}</span>
                                {isSelected && (
                                  <span style={{ color: '#2563eb', fontWeight: 700, fontSize: '11px' }}>
                                    ✓ Selected
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* Selected Quiz Practice / Scheduled Notice */}
                  {(() => {
                    const chosen = quizzes.find((q) => q.id === selectedQuizId);
                    if (!chosen) return null;
                    const slotInfo = getQuizSlotInfo(chosen);
                    if (slotInfo.isBefore) {
                      return (
                        <div className="warning-banner" style={{ margin: '16px 0 0', background: '#eff6ff', borderLeft: '4px solid #3b82f6', color: '#1e40af', fontSize: '13px', textAlign: 'left' }}>
                          <span>⏳ <strong>Scheduled Examination:</strong> "{chosen.title}" is scheduled to begin at <strong>{slotInfo.label}</strong>. You may proceed to grant permissions and review instructions; the exam will unlock at the scheduled start time.</span>
                        </div>
                      );
                    }
                    if (slotInfo.isAfter) {
                      return (
                        <div className="warning-banner" style={{ margin: '16px 0 0', background: '#fffbeb', borderLeft: '4px solid #f59e0b', color: '#92400e', fontSize: '13px', textAlign: 'left' }}>
                          <span>⚠️ <strong>Practice Notice:</strong> "{chosen.title}" was scheduled for {slotInfo.label}. You may attempt this past quiz for practice, but your score is marked as Unconsidered and will not appear in official instructor grading.</span>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div className="minimal-footer-actions" style={{ marginTop: '24px' }}>
                    <button
                      className="btn btn-primary"
                      disabled={!selectedQuizId}
                      onClick={() => setStudentStep('permissions')}
                    >
                      Next: Permissions →
                    </button>
                    <button
                      className="btn btn-outline"
                      onClick={() => setStudentStep('identity')}
                    >
                      ← Back to Student Info
                    </button>
                  </div>
                </div>
              )}

              {/* STUDENT STEP 3: ASK PERMISSIONS (CAMERA & SCREEN ONLY) THEN BEGIN QUIZ */}
              {studentStep === 'permissions' && (
                <div className="card-container minimal-setup-card">
                  <div className="header-section" style={{ marginBottom: '16px' }}>
                    <h1>Step 3: Device Permissions</h1>
                    <p>Grant camera and screen sharing access to proceed with examination proctoring</p>
                  </div>

                  {/* Selected Quiz Summary Chip */}
                  {(() => {
                    const chosen = quizzes.find((q) => q.id === selectedQuizId) || quizzes[0];
                    return (
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <strong style={{ fontSize: '14px', color: '#0f172a' }}>{chosen.title}</strong>
                          <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>({chosen.category || 'General'})</span>
                        </div>
                        <span className="compact-chip" style={{ background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0' }}>
                          ⏱️ {chosen.durationMinutes || 10} Minutes Allotted
                        </span>
                      </div>
                    );
                  })()}

                  {errorMsg && (
                    <div className="warning-banner" style={{ marginBottom: '14px' }}>
                      <span>❌ {errorMsg}</span>
                    </div>
                  )}



                  {/* Permissions Grid: Camera, Screen, and Fullscreen permissions */}
                  <div className="minimal-permissions-box">
                    <div className="perm-header">
                      <span className="perm-title">🔒 Required Examination Permissions</span>
                      <span className={`perm-badge ${cameraEnabled && screenSharingEnabled && fullScreen ? 'all-good' : ''}`}>
                        {cameraEnabled && screenSharingEnabled && fullScreen
                          ? '✓ All 3 Permissions Granted'
                          : `${(cameraEnabled ? 1 : 0) + (screenSharingEnabled ? 1 : 0) + (fullScreen ? 1 : 0)} / 3 Granted`}
                      </span>
                    </div>

                    <div className="perm-grid-three">
                      {/* 1. Camera Permission */}
                      <div className={`perm-tile ${cameraEnabled ? 'active' : ''}`}>
                        <div className="perm-tile-header">
                          <div className="perm-tile-icon">📷</div>
                          <div className="perm-tile-text">
                            <strong>Camera Proctoring</strong>
                            <span>{cameraEnabled ? 'Webcam active' : 'Periodic integrity snapshot'}</span>
                          </div>
                        </div>

                        <div className="perm-tile-control">
                          {cameraEnabled && (
                            <video
                              ref={videoRef}
                              autoPlay
                              playsInline
                              muted
                              className="perm-video-thumb"
                            />
                          )}
                          <button
                            type="button"
                            className={`btn ${cameraEnabled ? 'btn-granted' : 'btn-primary'}`}
                            disabled={cameraEnabled}
                            onClick={getCameraAccess}
                          >
                            {cameraEnabled ? '✓ Connected' : 'Enable Camera'}
                          </button>
                        </div>
                      </div>

                      {/* 2. Screen Sharing Permission */}
                      <div className={`perm-tile ${screenSharingEnabled ? 'active' : ''}`}>
                        <div className="perm-tile-header">
                          <div className="perm-tile-icon">🖥️</div>
                          <div className="perm-tile-text">
                            <strong>Screen Sharing</strong>
                            <span>{screenSharingEnabled ? 'Screen captured' : 'Live desktop monitoring'}</span>
                          </div>
                        </div>

                        <div className="perm-tile-control">
                          {screenSharingEnabled && (
                            <video
                              ref={screenVideoRef}
                              autoPlay
                              playsInline
                              muted
                              className="perm-video-thumb"
                            />
                          )}
                          <button
                            type="button"
                            className={`btn ${screenSharingEnabled ? 'btn-granted' : 'btn-primary'}`}
                            disabled={screenSharingEnabled}
                            onClick={getScreenShareAccess}
                          >
                            {screenSharingEnabled ? '✓ Screen Shared' : 'Share Screen'}
                          </button>
                        </div>
                      </div>

                      {/* 3. Fullscreen Permission */}
                      <div className={`perm-tile ${fullScreen ? 'active' : ''}`}>
                        <div className="perm-tile-header">
                          <div className="perm-tile-icon">⛶</div>
                          <div className="perm-tile-text">
                            <strong>Fullscreen Mode</strong>
                            <span>{fullScreen ? 'Fullscreen granted' : 'Lock screen focus for exam'}</span>
                          </div>
                        </div>

                        <div className="perm-tile-control">
                          <button
                            type="button"
                            className={`btn ${fullScreen ? 'btn-granted' : 'btn-primary'}`}
                            disabled={fullScreen}
                            onClick={enableFullScreen}
                          >
                            {fullScreen ? '✓ Fullscreen Active' : 'Lock Fullscreen'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions: Proceed to Instructions */}
                  <div className="minimal-footer-actions" style={{ marginTop: '24px' }}>
                    <button
                      className="btn btn-primary btn-start-large"
                      disabled={!cameraEnabled || !screenSharingEnabled || !fullScreen}
                      onClick={() => setStudentStep('instructions')}
                    >
                      Next: Review Instructions & Start →
                    </button>

                    <button
                      className="btn btn-outline"
                      onClick={() => setStudentStep('quiz')}
                    >
                      ← Back to Quiz Selection
                    </button>
                  </div>
                </div>
              )}

              {/* STUDENT STEP 4: INSTRUCTIONS & SCHEDULED COUNTDOWN */}
              {studentStep === 'instructions' && (() => {
                const currentQuiz = quizzes.find((q) => q.id === selectedQuizId) || activeQuizMeta || quizzes[0];
                const slotInfo = getQuizSlotInfo(currentQuiz);

                return (
                  <div className="card-container minimal-setup-card instructions-card">
                    <div className="header-section" style={{ marginBottom: '20px' }}>
                      <h1>Step 4: Examination Instructions</h1>
                      <p>Review the assessment structure and rules carefully before commencing</p>
                    </div>

                    {/* Candidate & Quiz Header Summary */}
                    <div className="instructions-quiz-banner">
                      <div className="instructions-banner-meta">
                        <span className="compact-chip" style={{ background: '#e0f2fe', color: '#0369a1', fontWeight: 600 }}>
                          {currentQuiz?.category || 'Assessment'}
                        </span>
                        <h3 className="instructions-quiz-title">{currentQuiz?.title || 'Selected Assessment'}</h3>
                        <p className="instructions-candidate-line">
                          Candidate: <strong>{studentName}</strong> (ID: <code>{studentId}</code>)
                        </p>
                      </div>
                      <div className="instructions-banner-slot">
                        {slotInfo.isBefore ? (
                          <span className="badge-tag-slot-scheduled">
                            ⏳ Scheduled: {slotInfo.start?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : slotInfo.isCurrent ? (
                          <span className="badge-tag-slot-ok">
                            🟢 Live Window Active
                          </span>
                        ) : (
                          <span className="badge-tag-slot-warn">
                            ⚠️ Practice Window
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Grid: Format, Questions, Duration, Proctoring */}
                    <div className="instructions-stats-grid">
                      <div className="instruction-stat-card">
                        <div className="instruction-stat-icon">📝</div>
                        <div className="instruction-stat-info">
                          <span className="instruction-stat-label">Format</span>
                          <strong className="instruction-stat-value">MCQ (Single Choice)</strong>
                        </div>
                      </div>

                      <div className="instruction-stat-card">
                        <div className="instruction-stat-icon">❓</div>
                        <div className="instruction-stat-info">
                          <span className="instruction-stat-label">Total Questions</span>
                          <strong className="instruction-stat-value">
                            {currentQuiz?.questions?.length || currentQuiz?.questionCount || 5} Questions
                          </strong>
                        </div>
                      </div>

                      <div className="instruction-stat-card">
                        <div className="instruction-stat-icon">⏱️</div>
                        <div className="instruction-stat-info">
                          <span className="instruction-stat-label">Duration</span>
                          <strong className="instruction-stat-value">
                            {currentQuiz?.durationMinutes || 10} Minutes
                          </strong>
                        </div>
                      </div>

                      <div className="instruction-stat-card">
                        <div className="instruction-stat-icon">🛡️</div>
                        <div className="instruction-stat-info">
                          <span className="instruction-stat-label">Proctoring</span>
                          <strong className="instruction-stat-value">Max 5 Flags (Strict)</strong>
                        </div>
                      </div>
                    </div>

                    {/* Exam Rules & Guidelines Card */}
                    <div className="instructions-guidelines-box">
                      <h4 className="guidelines-title">⚠️ Examination Rules & Anti-Cheating Protocol</h4>
                      <ul className="guidelines-list">
                        <li>
                          <strong>Stay in Fullscreen:</strong> Exiting fullscreen or defocusing/switching windows logs an immediate integrity flag strike.
                        </li>
                        <li>
                          <strong>Auto-Submit Threshold:</strong> If you accumulate <strong>5 flags</strong>, your exam will automatically submit immediately, and your session will be locked.
                        </li>
                        <li>
                          <strong>Active Monitoring:</strong> Camera and screen feeds are monitored during the exam session to ensure test integrity.
                        </li>
                        <li>
                          <strong>Navigation & Submission:</strong> You may navigate freely between questions. Answers are saved as you choose them. Click "Submit Final Exam" when finished.
                        </li>
                      </ul>
                    </div>

                    {/* Countdown or Active Notice */}
                    {slotInfo.isBefore ? (
                      <div className="quiz-countdown-box">
                        <div className="countdown-header">
                          <span className="countdown-hourglass">⏳</span>
                          <div>
                            <h4 className="countdown-title">Assessment Scheduled For Later</h4>
                            <p className="countdown-subtitle">
                              Scheduled start: {slotInfo.start?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({slotInfo.start?.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })})
                            </p>
                          </div>
                        </div>

                        {/* Live Digital Countdown Clock */}
                        <CountdownTimerDisplay targetDate={slotInfo.start} />

                        <div className="countdown-status-hint">
                          🔒 The <strong>"Begin Quiz"</strong> button is locked until the scheduled start time. It will automatically unlock once the timer reaches zero.
                        </div>
                      </div>
                    ) : (
                      <div className="active-exam-ready-box">
                        <div className="active-ready-icon">🟢</div>
                        <div>
                          <strong>Assessment Window is Live!</strong>
                          <p>Your environment is verified and permissions are granted. Click below when you are ready to begin.</p>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="minimal-footer-actions" style={{ marginTop: '24px' }}>
                      <button
                        className="btn btn-primary btn-start-large"
                        disabled={slotInfo.isBefore || loading}
                        onClick={handleStartExam}
                        style={{
                          opacity: slotInfo.isBefore ? 0.6 : 1,
                          cursor: slotInfo.isBefore ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {loading ? (
                          'Initializing Exam...'
                        ) : slotInfo.isBefore ? (
                          '⏳ Waiting for Scheduled Start Time...'
                        ) : (
                          '🚀 Begin Quiz Now →'
                        )}
                      </button>

                      <button
                        className="btn btn-outline"
                        onClick={() => setStudentStep('permissions')}
                      >
                        ← Back to Permissions
                      </button>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </>
      )}

      {/* View 2: Active Quiz */}
      {view === 'quiz' && currentQ && (
        <div>
          {/* Top Proctoring Status Bar */}
          <div className="quiz-top-bar">
            <div className="quiz-user-info">
              <span className="user-name">👤 {studentName} ({studentId})</span>
              <span className="session-id">
                {activeQuizMeta ? `Quiz: ${activeQuizMeta.title} • ` : ''}Session: {sessionId}
              </span>
            </div>

            <div className="quiz-status-chips">
              {/* Live Proctoring Mini-cam preview */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                title="Camera Feed"
                style={{
                  width: '44px',
                  height: '32px',
                  objectFit: 'cover',
                  borderRadius: '6px',
                  border: '1.5px solid #10b981',
                  background: '#0f172a'
                }}
              />

              {/* Live Proctoring Mini-screen preview */}
              <video
                ref={screenVideoRef}
                autoPlay
                playsInline
                muted
                title="Screen Share Stream"
                style={{
                  width: '44px',
                  height: '32px',
                  objectFit: 'cover',
                  borderRadius: '6px',
                  border: '1.5px solid #3b82f6',
                  background: '#0f172a'
                }}
              />

              <div className="chip chip-proctor">
                <span className="timer-indicator"></span>
                <span>Proctoring (Camera + Screen)</span>
              </div>

              {timer !== '' && (
                <div className="timer-badge">
                  <span className="timer-indicator"></span>
                  <span>{timer}s elapsed</span>
                </div>
              )}

              {/* Flag Counter Pill */}
              <div
                className={`flag-counter-pill ${flagCount >= 4 ? 'flag-danger' : flagCount > 0 ? 'flag-warn' : 'flag-normal'}`}
                title="Flagged when exiting fullscreen or changing windows. Auto-submits on 5 flags."
              >
                🚩 Flags: <strong>{flagCount} / 5</strong>
              </div>

              <button className="btn btn-quit" style={{ padding: '8px 14px' }} onClick={handleQuitQuiz}>
                Quit
              </button>
            </div>
          </div>

          {/* Flag Warning Floating Banner */}
          {flagWarning && (
            <div className={`flag-warning-banner ${flagWarning.critical ? 'critical' : ''}`}>
              <div className="flag-warning-content">
                <span className="flag-warning-icon">{flagWarning.critical ? '🚨' : '⚠️'}</span>
                <div>
                  <strong>
                    {flagWarning.critical
                      ? 'Maximum 5 flags reached! Automatically submitting quiz...'
                      : `Warning: Flag ${flagWarning.count}/5 Recorded`}
                  </strong>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px' }}>
                    {flagWarning.critical
                      ? 'Your examination is being finalized and submitted now.'
                      : `${flagWarning.reason}. Caution: The quiz will automatically submit after 5 flags!`}
                  </p>
                </div>
              </div>
              {!flagWarning.critical && (
                <button
                  type="button"
                  className="flag-warning-dismiss"
                  onClick={() => setFlagWarning(null)}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Quiz Question Card */}
          <div className="quiz-card">
            <div className="question-meta">
              <div className="question-meta-left">
                <span className="question-badge">
                  Question {currentIndex + 1} of {questions.length}
                </span>
                <span className="question-progress-track">
                  {Object.keys(selectedAnswers).length} / {questions.length} Answered
                </span>
              </div>

              {/* Submit Exam Button */}
              <button
                className="btn btn-submit-exam"
                disabled={loading}
                onClick={handleSubmitExam}
              >
                {loading ? 'Submitting...' : 'Submit Exam'}
              </button>
            </div>

            {/* Progress bar */}
            <div className="progress-bar-container">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${((currentIndex + 1) / questions.length) * 100}%`,
                }}
              ></div>
            </div>

            {/* Question Text */}
            <h2 className="question-title">{currentQ.question}</h2>

            {/* Options List */}
            <div className="options-list">
              {currentQ.options.map((optionText, optIndex) => {
                const isSelected = selectedAnswers[currentQ.id] === optIndex;
                const optionLetter = String.fromCharCode(65 + optIndex); // 'A', 'B', 'C', 'D'

                return (
                  <div
                    key={optIndex}
                    className={`option-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectOption(optIndex)}
                  >
                    <div className="option-badge">{optionLetter}</div>
                    <div className="option-text">{optionText}</div>
                    <div className="option-radio-dot"></div>
                  </div>
                );
              })}
            </div>

            {/* Navigation Controls */}
            <div className="quiz-nav-row">
              <button
                className="btn btn-outline"
                disabled={currentIndex === 0}
                onClick={handlePrevQuestion}
              >
                Previous
              </button>

              <button
                className={`btn ${isNextDisabled ? 'btn-next-disabled' : 'btn-primary'}`}
                disabled={isNextDisabled}
                onClick={handleNextQuestion}
                title={
                  allMarked
                    ? 'All questions marked. Proceed to Submit Exam.'
                    : isLastQuestion
                    ? 'Last question reached.'
                    : 'Next Question'
                }
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View 3: Score Modal / Box */}
      {view === 'result' && (() => {
        const resultData = examResult || {
          attempted: questions.length,
          correct: 0,
          wrong: questions.length,
          totalQuestions: questions.length,
        };
        const totalCount = questions.length || resultData.totalQuestions || 1;
        const correctCount = resultData.correct || 0;
        const attemptedCount = resultData.attempted !== undefined ? resultData.attempted : totalCount;
        const wrongCount = resultData.wrong !== undefined ? resultData.wrong : Math.max(0, attemptedCount - correctCount);
        const percentage = Math.round((correctCount / totalCount) * 100);

        return (
          <div className="modal-backdrop">
            <div className="score-modal">
              <div className="score-modal-icon">
                {correctCount >= Math.ceil(totalCount / 2) ? '🏆' : '📝'}
              </div>

              <h2 className="score-modal-title">Exam Completed!</h2>

              <p className="score-modal-subtitle">
                {resultData.quizTitle || activeQuizMeta?.title ? (
                  <span style={{ display: 'block', fontWeight: 600, color: '#1d4ed8', marginBottom: '4px' }}>
                    {resultData.quizTitle || activeQuizMeta?.title}
                  </span>
                ) : null}
                Student: <strong>{studentName}</strong> | Session: <code>{sessionId}</code>
              </p>

              {/* Circular Percentage */}
              <div className="score-circle-container">
                <div className="score-percentage">
                  {percentage}%
                </div>
                <div className="score-label">Final Score</div>
              </div>

              {/* Auto-submission notification if 5 flags were reached */}
              {(resultData.autoSubmitted || resultData.flagCount >= 5) && (
                <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '10px', padding: '12px 16px', color: '#991b1b', margin: '14px 0', fontSize: '13px', textAlign: 'left', lineHeight: 1.4 }}>
                  <strong style={{ fontSize: '14px' }}>🚨 Exam Automatically Submitted:</strong>
                  <p style={{ marginTop: '4px', fontSize: '12px', color: '#b91c1c' }}>
                    {resultData.autoSubmitReason || 'This exam was automatically submitted because 5 flags were triggered by exiting fullscreen or switching to another window.'}
                  </p>
                </div>
              )}

              {/* Outside-slot result notice */}
              {(resultData.scoreConsidered === false || resultData.withinTimeSlot === false) && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px', color: '#92400e', margin: '14px 0', fontSize: '13px', textAlign: 'left', lineHeight: 1.4 }}>
                  <strong>⚠️ Practice / Unconsidered Examination Result:</strong>
                  <p style={{ marginTop: '3px', fontSize: '12px' }}>
                    This assessment was submitted outside the official scheduled time slot. Your score is displayed here for personal self-review only and is excluded from official instructor grades.
                  </p>
                </div>
              )}

              {/* Score Breakdown Cards */}
              <div className="score-stats-grid">
                <div className="stat-box">
                  <div className="stat-box-val blue">{attemptedCount} / {totalCount}</div>
                  <div className="stat-box-lbl">Attempted</div>
                </div>

                <div className="stat-box">
                  <div className="stat-box-val green">{correctCount}</div>
                  <div className="stat-box-lbl">Correct</div>
                </div>

                <div className="stat-box">
                  <div className="stat-box-val red">{wrongCount}</div>
                  <div className="stat-box-lbl">Wrong</div>
                </div>

                <div className="stat-box">
                  <div
                    className="stat-box-val"
                    style={{
                      color: (resultData.flagCount >= 5 || resultData.autoSubmitted)
                        ? '#dc2626'
                        : ((resultData.flagCount || 0) > 0 ? '#d97706' : '#16a34a')
                    }}
                  >
                    🚩 {resultData.flagCount !== undefined ? resultData.flagCount : (flagCount || 0)} / 5
                  </div>
                  <div className="stat-box-lbl">Flags Incurred</div>
                </div>
              </div>

              {/* Status Summary (No time taken or scheduled time displayed) */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '13px',
                  color: '#475569',
                  marginBottom: '24px',
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '24px',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <strong>Status:</strong>{' '}
                  <span style={{ color: resultData.autoSubmitted ? '#dc2626' : '#16a34a', fontWeight: 'bold' }}>
                    {resultData.autoSubmitted ? '🚨 Auto-Submitted (5 Flags Reached)' : '✓ Examination Submitted'}
                  </span>
                </div>
                <div>
                  <strong>Proctoring Flags:</strong>{' '}
                  <span
                    style={{
                      color: (resultData.flagCount >= 5 || resultData.autoSubmitted)
                        ? '#dc2626'
                        : ((resultData.flagCount || 0) > 0 ? '#b45309' : '#16a34a'),
                      fontWeight: 600,
                    }}
                  >
                    🚩 {resultData.flagCount !== undefined ? resultData.flagCount : (flagCount || 0)} / 5 {(resultData.flagCount || 0) === 0 ? '(Clean Session)' : ''}
                  </span>
                </div>
              </div>

            {/* Modal Actions */}
            <div className="score-modal-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  cleanupMediaStreams();
                  window.athena?.stopTimerOnMain?.();
                  setView('setup');
                  setStudentStep('quiz');
                }}
              >
                Take Another Assessment
              </button>
              <button
                className="btn btn-outline"
                onClick={() => setShowReview(!showReview)}
              >
                {showReview ? 'Hide Review' : 'Review Questions'}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => {
                  cleanupMediaStreams();
                  window.athena?.stopTimerOnMain?.();
                  setView('setup');
                  setUserRole(null);
                }}
              >
                Home / Switch Role
              </button>
              <button className="btn btn-quit" onClick={handleQuitQuiz}>
                Exit App
              </button>
            </div>

            {/* Optional Answers Review */}
            {showReview && (
              <div
                style={{
                  marginTop: '20px',
                  textAlign: 'left',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  padding: '12px',
                  background: '#f8fafc',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <h4 style={{ marginBottom: '10px', fontSize: '14px', color: '#0f172a' }}>
                  Question Summary
                </h4>
                {questions.map((q, idx) => {
                  const userAnsIdx = selectedAnswers[q.id];
                  const hasAnswered = userAnsIdx !== undefined;
                  return (
                    <div
                      key={q.id}
                      style={{
                        marginBottom: '10px',
                        fontSize: '13px',
                        paddingBottom: '8px',
                        borderBottom: '1px solid #e2e8f0',
                      }}
                    >
                      <div>
                        <strong>Q{idx + 1}:</strong> {q.question}
                      </div>
                      <div style={{ color: hasAnswered ? '#2563eb' : '#94a3b8', marginTop: '2px' }}>
                        Your Choice: {hasAnswered ? `${String.fromCharCode(65 + userAnsIdx)}. ${q.options[userAnsIdx]}` : 'Unanswered'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          </div>
        );
      })()}

      {/* Instructor Login Modal (admin 101) */}
      {showLoginModal && (
        <div className="blocking-violation-backdrop" style={{ zIndex: 100000 }}>
          <div className="blocking-violation-card" style={{ maxWidth: '440px' }}>
            <div className="violation-badge-header">
              <span className="violation-icon">🔐</span>
              <div className="violation-title-wrap">
                <h2>Instructor Verification</h2>
                <span className="violation-counter-pill" style={{ background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }}>
                  Restricted Admin Area
                </span>
              </div>
            </div>

            <div className="violation-body">
              <p style={{ fontSize: '14px', color: '#475569', marginBottom: '14px' }}>
                Please enter the administrative password to access Quiz Creation, Management, and Student Gradebook.
              </p>

              {loginError && (
                <div className="warning-banner" style={{ marginBottom: '12px' }}>
                  <span>❌ {loginError}</span>
                </div>
              )}

              <form onSubmit={handleInstructorLoginSubmit}>
                <div className="input-group">
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Admin Password</label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder="Enter instructor password"
                    value={instructorPassword}
                    onChange={(e) => setInstructorPassword(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="violation-actions" style={{ marginTop: '16px' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loggingIn || !instructorPassword.trim()}
                  >
                    {loggingIn ? 'Verifying...' : 'Unlock Instructor Portal →'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-quit-outline"
                    onClick={() => setShowLoginModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
