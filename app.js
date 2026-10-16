/* ==========================================================================
   SCIENCE FIELD NOTEBOOK · APPLICATION JAVASCRIPT
   Single-page static app for Grade 6 Science exam review.
   No backend, offline capable, localStorage saved, accessible, mobile-first.
   ========================================================================== */

(function () {
  'use strict';

  // --- Constants & Storage Keys ---
  const STORAGE_KEY = 'science_notebook_progress_v2';
  const SEC_12_TITLE = 'Classifying Organisms';
  const SEC_13_TITLE = 'Heredity and Inheritance';

  // --- App State ---
  const state = {
    allQuestions: [],
    questionsById: {},
    currentView: 'home', // 'home' | 'practice-setup' | 'practice' | 'mock-setup' | 'mock' | 'mock-results' | 'mistakes'
    userProgress: {
      answered: {},    // qid -> { answered: bool, correct: bool, score: number, status: string, date: number }
      mistakes: [],    // array of qids needing review
      hintsUsed: 0,
      mockHistory: []
    },
    // Practice session state
    practice: {
      questions: [],
      currentIndex: 0,
      sessionAnswers: {}, // qid -> { answered, selected, studentText, revealed, status, hintOpened }
      section: 'all',
      type: 'all',
      level: 'all'
    },
    // Mock exam state
    mock: {
      questions: [],
      currentIndex: 0,
      sessionAnswers: {}, // qid -> { answered, selected, studentText, selfGrade }
      section: 'all',
      count: 20,
      timerDuration: 0, // seconds, 0 = no timer
      secondsRemaining: 0,
      timerInterval: null,
      isSubmitted: false,
      startTime: null,
      endTime: null
    },
    // Filter for mistakes view
    mistakesFilter: 'all'
  };

  // --- DOM Elements ---
  const appRoot = document.getElementById('app-root');
  const srAnnouncer = document.getElementById('sr-announcer');
  const topMistakeCount = document.getElementById('top-mistake-count');
  const imageModal = document.getElementById('image-modal');
  const modalImg = document.getElementById('modal-img');
  const modalCaption = document.getElementById('modal-fig-caption');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  // --- Utilities ---
  function announce(message) {
    if (srAnnouncer) {
      srAnnouncer.textContent = '';
      setTimeout(() => { srAnnouncer.textContent = message; }, 50);
    }
  }

  function loadProgress() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        state.userProgress = {
          answered: parsed.answered || {},
          mistakes: Array.isArray(parsed.mistakes) ? parsed.mistakes : [],
          hintsUsed: typeof parsed.hintsUsed === 'number' ? parsed.hintsUsed : 0,
          mockHistory: Array.isArray(parsed.mockHistory) ? parsed.mockHistory : []
        };
      }
    } catch (e) {
      console.warn('Failed to load progress from localStorage:', e);
    }
    updateTopMistakeCount();
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.userProgress));
    } catch (e) {
      console.warn('Failed to save progress to localStorage:', e);
    }
    updateTopMistakeCount();
  }

  function updateTopMistakeCount() {
    if (topMistakeCount) {
      topMistakeCount.textContent = state.userProgress.mistakes.length;
    }
  }

  function addMistake(qid) {
    if (!state.userProgress.mistakes.includes(qid)) {
      state.userProgress.mistakes.push(qid);
      saveProgress();
    }
  }

  function removeMistake(qid) {
    const idx = state.userProgress.mistakes.indexOf(qid);
    if (idx > -1) {
      state.userProgress.mistakes.splice(idx, 1);
      saveProgress();
    }
  }

  // Converts inline markdown (scientific italics, bold, code)
  function renderMarkdown(text) {
    if (!text) return '';
    let out = String(text);
    // Bold: **text**
    out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic: *text* (used for scientific names e.g. *Panthera tigris*)
    out = out.replace(/\*([^*]+?)\*/g, '<em class="scientific-name">$1</em>');
    // Inline code: `text`
    out = out.replace(/`([^`]+?)`/g, '<code>$1</code>');
    return out;
  }

  function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // --- Modal Lightbox ---
  function openImageModal(src, alt, caption) {
    if (!imageModal || !modalImg) return;
    modalImg.src = src;
    modalImg.alt = alt || 'Science figure';
    modalCaption.textContent = caption || alt || 'Figure diagram';
    imageModal.hidden = false;
    modalCloseBtn.focus();
    document.body.style.overflow = 'hidden';
  }

  function closeImageModal() {
    if (!imageModal) return;
    imageModal.hidden = true;
    modalImg.src = '';
    document.body.style.overflow = '';
  }

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeImageModal);
  }
  if (imageModal) {
    imageModal.addEventListener('click', (e) => {
      if (e.target === imageModal) closeImageModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && imageModal && !imageModal.hidden) {
      closeImageModal();
    }
  });

  // --- Router / Navigation ---
  function setView(viewName) {
    state.currentView = viewName;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Update active top tab
    document.querySelectorAll('.nav-tab').forEach((tab) => {
      const matches = tab.getAttribute('data-view') === viewName ||
        (tab.getAttribute('data-view') === 'practice-setup' && viewName === 'practice') ||
        (tab.getAttribute('data-view') === 'mock-setup' && (viewName === 'mock' || viewName === 'mock-results'));
      tab.classList.toggle('active', matches);
    });

    renderCurrentView();
  }

  function renderCurrentView() {
    switch (state.currentView) {
      case 'home':
        renderHomeView();
        break;
      case 'practice-setup':
        renderPracticeSetupView();
        break;
      case 'practice':
        renderPracticeQuestionView();
        break;
      case 'mock-setup':
        renderMockSetupView();
        break;
      case 'mock':
        renderMockQuestionView();
        break;
      case 'mock-results':
        renderMockResultsView();
        break;
      case 'mistakes':
        renderMistakesView();
        break;
      default:
        renderHomeView();
    }
  }

  // =========================================================================
  // VIEW: HOME / LEDGER INDEX
  // =========================================================================
  function renderHomeView() {
    const totalAnswered = Object.keys(state.userProgress.answered).length;
    let correctCount = 0;
    for (const k in state.userProgress.answered) {
      if (state.userProgress.answered[k].correct) correctCount++;
    }
    const mistakesCount = state.userProgress.mistakes.length;
    const hintsCount = state.userProgress.hintsUsed || 0;

    appRoot.innerHTML = `
      <div class="home-workspace">
        <!-- Section Selection Cards -->
        <section aria-labelledby="sections-heading">
          <h2 id="sections-heading" class="sr-only">Course Sections</h2>
          <div class="section-choice-row">
            <!-- Section 1.2 -->
            <div class="section-choice-card section-card-12" id="card-sec-12" tabindex="0" role="button">
              <div>
                <div class="section-card-header">
                  <span class="specimen-tag sec-12">SECTION 1.2</span>
                  <span class="specimen-tag">100 QUESTIONS</span>
                </div>
                <h3 class="section-card-title">${SEC_12_TITLE}</h3>
                <p class="section-card-desc">
                  Classification levels (Kingdom to Species), Scientific Naming (<em>Panthera tigris</em>), Dichotomous Keys, Vascular/Nonvascular Plants, Vertebrates and Invertebrates.
                </p>
              </div>
              <div>
                <div class="section-stats-list">
                  <span>36 MCQ</span> · <span>24 True/False</span> · <span>20 Find Mistake</span> · <span>20 Written</span>
                </div>
                <button type="button" class="btn-action btn-primary" style="margin-top:14px; width:100%;">
                  Practice Section 1.2
                </button>
              </div>
            </div>

            <!-- Section 1.3 -->
            <div class="section-choice-card section-card-13" id="card-sec-13" tabindex="0" role="button">
              <div>
                <div class="section-card-header">
                  <span class="specimen-tag sec-13">SECTION 1.3</span>
                  <span class="specimen-tag">100 QUESTIONS</span>
                </div>
                <h3 class="section-card-title">${SEC_13_TITLE}</h3>
                <p class="section-card-desc">
                  Inherited vs. Acquired Traits, Physical &amp; Behavioral Adaptations, Darwin's Finches, Natural Selection, and Fossils &amp; Extinction.
                </p>
              </div>
              <div>
                <div class="section-stats-list">
                  <span>36 MCQ</span> · <span>24 True/False</span> · <span>20 Find Mistake</span> · <span>20 Written</span>
                </div>
                <button type="button" class="btn-action btn-primary" style="margin-top:14px; width:100%;">
                  Practice Section 1.3
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Mode Selection Deck -->
        <section aria-labelledby="modes-heading">
          <h2 id="modes-heading" class="sr-only">Study Modes</h2>
          <div class="mode-selection-deck">
            <!-- Practice Mode -->
            <div class="mode-action-card" id="card-mode-practice" tabindex="0" role="button">
              <div>
                <span class="specimen-tag">MODE 1</span>
                <h3 class="mode-card-title">Practice Mode</h3>
                <p class="mode-card-desc">
                  Step-by-step questions with instant feedback, model explanations, free hints, and self-check buttons.
                </p>
              </div>
              <button type="button" class="btn-action btn-secondary" style="width:100%;">
                Configure Practice →
              </button>
            </div>

            <!-- Mock Exam -->
            <div class="mode-action-card" id="card-mode-mock" tabindex="0" role="button">
              <div>
                <span class="specimen-tag">MODE 2</span>
                <h3 class="mode-card-title">Mock Exam</h3>
                <p class="mode-card-desc">
                  Timed or untimed exam test (20, 40, or 60 questions). Hints off, answers scored at the end with a full breakdown.
                </p>
              </div>
              <button type="button" class="btn-action btn-secondary" style="width:100%;">
                Start Mock Exam →
              </button>
            </div>

            <!-- My Mistakes -->
            <div class="mode-action-card" id="card-mode-mistakes" tabindex="0" role="button">
              <div>
                <span class="specimen-tag">MODE 3</span>
                <h3 class="mode-card-title">My Mistakes</h3>
                <p class="mode-card-desc">
                  Targeted retry notebook of every question answered incorrectly or marked "not yet".
                </p>
              </div>
              <button type="button" class="btn-action btn-secondary" style="width:100%;">
                Review Mistakes (${mistakesCount}) →
              </button>
            </div>
          </div>
        </section>

        <!-- Progress Summary Ledger -->
        <section class="progress-ledger" aria-labelledby="ledger-title">
          <div class="ledger-header">
            <span id="ledger-title">STUDENT PROGRESS LEDGER</span>
            <button type="button" id="btn-reset-progress" style="background:none; border:none; font-family:var(--font-body); font-size:0.8rem; color:var(--ink-muted); cursor:pointer; text-decoration:underline;">
              Reset Saved Progress
            </button>
          </div>
          <div class="ledger-grid">
            <div class="ledger-cell">
              <div class="ledger-cell-num">${totalAnswered} / 200</div>
              <div class="ledger-cell-label">Questions Attempted</div>
            </div>
            <div class="ledger-cell">
              <div class="ledger-cell-num">${correctCount}</div>
              <div class="ledger-cell-label">Questions Mastered</div>
            </div>
            <div class="ledger-cell">
              <div class="ledger-cell-num" style="color:var(--sec-13-accent);">${mistakesCount}</div>
              <div class="ledger-cell-label">Mistakes To Retry</div>
            </div>
            <div class="ledger-cell">
              <div class="ledger-cell-num">${hintsCount}</div>
              <div class="ledger-cell-label">Hints Consulted</div>
            </div>
          </div>
        </section>
      </div>
    `;

    // Event listeners
    document.getElementById('card-sec-12').addEventListener('click', () => {
      startPracticeSession('1.2', 'all', 'all');
    });
    document.getElementById('card-sec-13').addEventListener('click', () => {
      startPracticeSession('1.3', 'all', 'all');
    });
    document.getElementById('card-mode-practice').addEventListener('click', () => {
      setView('practice-setup');
    });
    document.getElementById('card-mode-mock').addEventListener('click', () => {
      setView('mock-setup');
    });
    document.getElementById('card-mode-mistakes').addEventListener('click', () => {
      setView('mistakes');
    });

    const resetBtn = document.getElementById('btn-reset-progress');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all saved practice and mistake records?')) {
          state.userProgress = { answered: {}, mistakes: [], hintsUsed: 0, mockHistory: [] };
          saveProgress();
          renderHomeView();
          announce('Saved progress has been reset.');
        }
      });
    }
  }

  // =========================================================================
  // VIEW: PRACTICE SETUP
  // =========================================================================
  function renderPracticeSetupView() {
    let selSection = 'all';
    let selType = 'all';
    let selLevel = 'all';

    appRoot.innerHTML = `
      <div class="setup-form-card">
        <span class="specimen-tag">MODE 1 CONFIGURATION</span>
        <h2 class="setup-title" style="margin-top:6px;">Practice Session Setup</h2>
        <p class="setup-desc">Choose your topic, question format, and difficulty level.</p>

        <!-- Section Picker -->
        <div class="form-group">
          <label class="form-label">1. Choose Section</label>
          <div class="option-pill-group" id="group-sec">
            <button type="button" class="pill-option active" data-val="all">Both Sections (200)</button>
            <button type="button" class="pill-option" data-val="1.2">1.2 Classifying (100)</button>
            <button type="button" class="pill-option" data-val="1.3">1.3 Heredity (100)</button>
          </div>
        </div>

        <!-- Question Type Picker -->
        <div class="form-group">
          <label class="form-label">2. Question Type</label>
          <div class="option-pill-group" id="group-type">
            <button type="button" class="pill-option active" data-val="all">All Formats</button>
            <button type="button" class="pill-option" data-val="MCQ">Multiple Choice</button>
            <button type="button" class="pill-option" data-val="True/False">True / False</button>
            <button type="button" class="pill-option" data-val="Find the Mistake">Find Mistake</button>
            <button type="button" class="pill-option" data-val="Written">Written</button>
          </div>
        </div>

        <!-- Level Picker -->
        <div class="form-group">
          <label class="form-label">3. Difficulty Level</label>
          <div class="option-pill-group" id="group-level">
            <button type="button" class="pill-option active" data-val="all">All Levels</button>
            <button type="button" class="pill-option" data-val="Medium">Medium</button>
            <button type="button" class="pill-option" data-val="Hard">Hard</button>
          </div>
        </div>

        <div style="margin-top:30px; display:flex; gap:12px;">
          <button type="button" id="btn-start-practice" class="btn-action btn-primary" style="flex:1;">
            Begin Practice Session →
          </button>
          <button type="button" id="btn-cancel-setup" class="btn-action btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    `;

    function setupPillGroup(groupId, onChange) {
      const group = document.getElementById(groupId);
      group.querySelectorAll('.pill-option').forEach((btn) => {
        btn.addEventListener('click', () => {
          group.querySelectorAll('.pill-option').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          onChange(btn.getAttribute('data-val'));
        });
      });
    }

    setupPillGroup('group-sec', val => { selSection = val; });
    setupPillGroup('group-type', val => { selType = val; });
    setupPillGroup('group-level', val => { selLevel = val; });

    document.getElementById('btn-cancel-setup').addEventListener('click', () => setView('home'));
    document.getElementById('btn-start-practice').addEventListener('click', () => {
      startPracticeSession(selSection, selType, selLevel);
    });
  }

  function startPracticeSession(section, type, level, customQuestions = null) {
    let filtered = [];
    if (customQuestions && Array.isArray(customQuestions)) {
      filtered = customQuestions;
    } else {
      filtered = state.allQuestions.filter((q) => {
        if (section !== 'all' && q.section !== section) return false;
        if (type !== 'all' && q.type !== type) return false;
        if (level !== 'all' && q.level !== level) return false;
        return true;
      });
    }

    if (filtered.length === 0) {
      alert('No questions match this filter combination. Try selecting All Levels or All Types.');
      return;
    }

    state.practice = {
      questions: filtered,
      currentIndex: 0,
      sessionAnswers: {},
      section: section,
      type: type,
      level: level
    };

    setView('practice');
  }

  // =========================================================================
  // VIEW: PRACTICE QUESTIONS (One at a time, interactive)
  // =========================================================================
  function renderPracticeQuestionView() {
    const qList = state.practice.questions;
    const idx = state.practice.currentIndex;
    const q = qList[idx];

    if (!q) {
      setView('home');
      return;
    }

    // Initialize answer state for this question if not exists
    if (!state.practice.sessionAnswers[q.id]) {
      // Check if user previously answered this in progress
      const prev = state.userProgress.answered[q.id];
      state.practice.sessionAnswers[q.id] = {
        answered: !!prev,
        selected: prev ? prev.lastAnswer : null,
        studentText: '',
        revealed: !!prev,
        status: prev ? prev.status : null,
        hintOpened: false
      };
    }

    const ansState = state.practice.sessionAnswers[q.id];
    const secTagClass = q.section === '1.2' ? 'sec-12' : 'sec-13';
    const isHard = q.level === 'Hard';

    // Desktop dual column: main card + side question list
    appRoot.innerHTML = `
      <div class="two-column-workspace">
        <!-- Main Column: Question Plate -->
        <div class="field-plate" id="practice-card">
          <!-- Numeral & Specimen Metadata Row -->
          <div class="numeral-row">
            <div class="question-big-num">Q${q.number}</div>
            <div class="question-tags-group">
              <span class="specimen-tag ${secTagClass}">SEC ${q.section}</span>
              <span class="specimen-tag">${q.type.toUpperCase()}</span>
              <span class="specimen-tag">${q.lp}</span>
              <span class="specimen-tag ${isHard ? 'level-hard' : ''}">${q.level.toUpperCase()}</span>
            </div>
          </div>

          <!-- Question Prompt / Figure / Table -->
          <div class="question-body-section">
            ${renderQuestionCore(q, ansState, 'practice')}
          </div>

          <!-- Inline Taped Field Note (Hint) -->
          <div class="taped-note-container" id="hint-wrapper">
            ${renderHintSection(q, ansState)}
          </div>

          <!-- Answer & Solution Reveal Plate -->
          <div id="solution-area">
            ${renderSolutionArea(q, ansState)}
          </div>
        </div>

        <!-- Side Rail: Progress & Question Navigation (Desktop) -->
        <aside class="journal-side-rail" aria-label="Question Navigation">
          <div class="side-rail-title">
            <span>QUESTION INDEX</span>
            <span>${idx + 1} / ${qList.length}</span>
          </div>
          <div class="progress-rail-container" style="margin-bottom:14px;">
            <div class="progress-rail">
              <div class="progress-fill" style="width: ${((idx + 1) / qList.length) * 100}%;"></div>
            </div>
          </div>
          <div class="question-nav-grid" id="practice-nav-grid">
            ${qList.map((item, i) => {
              const itemAns = state.practice.sessionAnswers[item.id];
              let statusClass = '';
              if (i === idx) statusClass = 'current';
              else if (itemAns && itemAns.answered) {
                statusClass = itemAns.status === 'wrong' || itemAns.status === 'not_yet' ? 'answered-wrong' : 'answered-correct';
              }
              return `
                <button type="button" class="nav-dot-btn ${statusClass}" data-index="${i}" title="Question ${item.number} (${item.type})">
                  ${item.number}
                </button>
              `;
            }).join('')}
          </div>

          <div style="margin-top:20px; border-top:1px dashed var(--ink-border); padding-top:14px;">
            <button type="button" id="btn-exit-practice" class="btn-action btn-secondary" style="width:100%;">
              ← Finish Session
            </button>
          </div>
        </aside>
      </div>

      <!-- Sticky Bottom Action Bar (Mobile First) -->
      <nav class="bottom-action-bar" aria-label="Question Actions">
        <div class="action-bar-inner">
          <div class="action-bar-left">
            <button type="button" id="btn-prev-q" class="btn-action btn-secondary" ${idx === 0 ? 'disabled' : ''}>
              ← Previous
            </button>
          </div>
          <div class="progress-rail-container" style="text-align:center;">
            <span class="progress-text">${idx + 1} of ${qList.length}</span>
          </div>
          <div class="action-bar-right">
            <button type="button" id="btn-next-q" class="btn-action btn-primary">
              ${idx === qList.length - 1 ? 'Finish →' : 'Next Question →'}
            </button>
          </div>
        </div>
      </nav>
    `;

    // Bind question interactions
    bindQuestionInteractions(q, ansState, 'practice');

    // Navigation buttons
    document.getElementById('btn-prev-q').addEventListener('click', () => {
      if (state.practice.currentIndex > 0) {
        state.practice.currentIndex--;
        renderPracticeQuestionView();
      }
    });

    document.getElementById('btn-next-q').addEventListener('click', () => {
      if (state.practice.currentIndex < state.practice.questions.length - 1) {
        state.practice.currentIndex++;
        renderPracticeQuestionView();
      } else {
        alert('You have completed all questions in this practice set!');
        setView('home');
      }
    });

    const exitBtn = document.getElementById('btn-exit-practice');
    if (exitBtn) {
      exitBtn.addEventListener('click', () => setView('home'));
    }

    // Side rail dots
    document.querySelectorAll('#practice-nav-grid .nav-dot-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetIdx = parseInt(btn.getAttribute('data-index'), 10);
        state.practice.currentIndex = targetIdx;
        renderPracticeQuestionView();
      });
    });
  }

  // --- Core Question Renderer (Figure, Table, Prompt, Options/Inputs) ---
  function renderQuestionCore(q, ansState, mode) {
    let html = '';

    // 1. Archival Figure / Diagram (if question contains an image)
    if (q.image) {
      html += `
        <figure class="archival-figure-frame">
          <div class="archival-figure-interactive" data-src="${q.image.src}" data-alt="${q.image.alt}">
            <img src="${q.image.src}" alt="${q.image.alt}" class="archival-figure-img" loading="lazy">
            <span class="figure-inspect-hint">Tap to enlarge</span>
          </div>
          <figcaption class="figure-plate-caption">
            Fig. ${q.number} — ${q.image.alt}
          </figcaption>
        </figure>
      `;
    }

    // 2. Specimen Table (if question contains a table)
    if (q.table_html) {
      html += q.table_html;
    }

    // 3. Question Prompt / Statement / Student's Attempt based on type
    if (q.type === 'MCQ') {
      html += `
        <div class="question-prompt-text">
          ${renderMarkdown(q.prompt)}
        </div>
        <div class="mcq-options-list" role="radiogroup" aria-label="Multiple choice options">
          ${q.options.map((opt) => {
            let stateClass = '';
            let statusBadge = '';
            if (ansState.answered) {
              const isCorrectOpt = opt.key === q.answer;
              const isSelected = ansState.selected === opt.key;
              if (isCorrectOpt) {
                stateClass = 'state-correct';
                statusBadge = '<span class="mcq-feedback-status" style="color:var(--feedback-correct-ink);">[✓] Correct</span>';
              } else if (isSelected) {
                stateClass = 'state-wrong';
                statusBadge = '<span class="mcq-feedback-status" style="color:var(--feedback-wrong-ink);">[✗] Incorrect</span>';
              } else {
                stateClass = 'state-dimmed';
              }
            } else if (mode === 'mock' && ansState.selected === opt.key) {
              stateClass = 'state-correct'; // in mock, just shows active selection
            }

            return `
              <button type="button" class="mcq-option-btn ${stateClass}" data-key="${opt.key}" ${mode === 'practice' && ansState.answered ? '' : ''}>
                <span class="mcq-key-pill">${opt.key}</span>
                <span class="mcq-text-content">${renderMarkdown(opt.text)}</span>
                ${statusBadge}
              </button>
            `;
          }).join('')}
        </div>
      `;
    } else if (q.type === 'True/False') {
      const isAnswered = ansState.answered;
      let trueClass = '';
      let falseClass = '';
      if (isAnswered) {
        if (q.is_true) {
          trueClass = 'state-correct';
          if (ansState.selected === 'False') falseClass = 'state-wrong';
        } else {
          falseClass = 'state-correct';
          if (ansState.selected === 'True') trueClass = 'state-wrong';
        }
      } else if (mode === 'mock') {
        if (ansState.selected === 'True') trueClass = 'state-correct';
        if (ansState.selected === 'False') falseClass = 'state-correct';
      }

      html += `
        <div class="question-prompt-text" style="font-weight:400; font-family:var(--font-serif); font-size:1.25rem;">
          <span class="prompt-lead-in">Statement to Evaluate:</span>
          "${renderMarkdown(q.statement)}"
        </div>
        <div class="tf-buttons-row">
          <button type="button" class="tf-choice-btn ${trueClass}" data-choice="True">
            <span>TRUE</span>
            ${isAnswered && q.is_true ? '<span style="font-size:0.75rem; color:var(--feedback-correct-ink);">[✓] Correct Answer</span>' : ''}
            ${isAnswered && !q.is_true && ansState.selected === 'True' ? '<span style="font-size:0.75rem; color:var(--feedback-wrong-ink);">[✗] Incorrect</span>' : ''}
          </button>
          <button type="button" class="tf-choice-btn ${falseClass}" data-choice="False">
            <span>FALSE</span>
            ${isAnswered && !q.is_true ? '<span style="font-size:0.75rem; color:var(--feedback-correct-ink);">[✓] Correct Answer</span>' : ''}
            ${isAnswered && q.is_true && ansState.selected === 'False' ? '<span style="font-size:0.75rem; color:var(--feedback-wrong-ink);">[✗] Incorrect</span>' : ''}
          </button>
        </div>
      `;
    } else if (q.type === 'Find the Mistake') {
      html += `
        ${q.student_answer ? `
          <div class="student-attempt-box">
            <div class="student-attempt-header">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="10" cy="10" r="8"/>
                <path d="M10 6v4m0 4h.01"/>
              </svg>
              <span>Student's Work (Contains a Mistake):</span>
            </div>
            <div class="student-attempt-text">
              "${renderMarkdown(q.student_answer)}"
            </div>
          </div>
        ` : ''}

        ${q.question ? `
          <div class="question-prompt-text">
            ${renderMarkdown(q.question)}
          </div>
        ` : ''}

        <div class="student-input-container">
          <label class="form-label" for="mistake-input-${q.id}">Your Correction (Identify the mistake and write what is correct):</label>
          <textarea id="mistake-input-${q.id}" class="student-textarea" placeholder="Type what was wrong and how to fix it...">${ansState.studentText || ''}</textarea>
        </div>

        ${mode === 'practice' && !ansState.revealed ? `
          <button type="button" id="btn-reveal-mistake" class="btn-action btn-primary" style="margin-top:6px;">
            Check My Correction &amp; Reveal Solution →
          </button>
        ` : ''}
      `;
    } else if (q.type === 'Written') {
      html += `
        <div class="question-prompt-text">
          <span class="prompt-lead-in">Written Question:</span>
          ${renderMarkdown(q.prompt)}
        </div>

        <div class="student-input-container">
          <label class="form-label" for="written-input-${q.id}">Your Written Answer:</label>
          <textarea id="written-input-${q.id}" class="student-textarea" placeholder="Write your full explanation here before checking the model answer...">${ansState.studentText || ''}</textarea>
        </div>

        ${mode === 'practice' && !ansState.revealed ? `
          <button type="button" id="btn-reveal-written" class="btn-action btn-primary" style="margin-top:6px;">
            Compare with Model Answer →
          </button>
        ` : ''}
      `;
    }

    return html;
  }

  // --- Taped Hint Section ---
  function renderHintSection(q, ansState) {
    if (!q.hint) return '';

    if (!ansState.hintOpened) {
      return `
        <button type="button" class="hint-trigger-btn" id="btn-open-hint">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M7 10h6m-3-3v6"/>
            <rect x="3" y="3" width="14" height="14" rx="2"/>
          </svg>
          <span>Consult Field Note (Hint)</span>
        </button>
      `;
    }

    return `
      <div class="taped-field-note" role="region" aria-label="Field Note Hint">
        <div class="taped-note-header">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="10" cy="10" r="7"/>
            <path d="M10 8v5M10 5.5h.01"/>
          </svg>
          <span>OBSERVATION HINT · FIELD NOTE</span>
        </div>
        <div class="taped-note-content">
          ${renderMarkdown(q.hint)}
        </div>
      </div>
    `;
  }

  // --- Solution & Explanation Reveal Area ---
  function renderSolutionArea(q, ansState) {
    if (!ansState.revealed && !ansState.answered) return '';

    let html = '';

    if (q.type === 'MCQ') {
      html += `
        <div class="solution-reveal-plate">
          <div class="solution-section-title">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M4 10l4 4L16 6"/>
            </svg>
            <span>Correct Answer: Option ${q.answer}</span>
          </div>
          <p class="solution-explanation-text">
            <strong>Explanation:</strong> ${renderMarkdown(q.explanation)}
          </p>
        </div>
      `;
    } else if (q.type === 'True/False') {
      const isFalse = !q.is_true;
      html += `
        <div class="solution-reveal-plate ${isFalse ? 'for-false' : ''}">
          <div class="solution-section-title">
            <span>Statement is: <strong>${q.is_true ? 'TRUE' : 'FALSE'}</strong></span>
          </div>
          ${isFalse ? `
            <div class="solution-correction-highlight">
              <strong>Corrected Statement:</strong> ${renderMarkdown(q.correction || q.explanation)}
            </div>
          ` : ''}
          <p class="solution-explanation-text">
            <strong>Scientific Explanation:</strong> ${renderMarkdown(q.explanation)}
          </p>
        </div>
      `;
    } else if (q.type === 'Find the Mistake') {
      html += `
        <div class="solution-reveal-plate">
          <div class="solution-section-title">
            <span>Solution &amp; Scientific Review</span>
          </div>
          <div style="margin-bottom:10px;">
            <strong>The Mistake:</strong> ${renderMarkdown(q.mistake)}
          </div>
          <div style="margin-bottom:10px; color:var(--feedback-correct-ink);">
            <strong>Correct Answer:</strong> ${renderMarkdown(q.correct_answer)}
          </div>
          <p class="solution-explanation-text">
            <strong>Scientific Explanation:</strong> ${renderMarkdown(q.explanation)}
          </p>
          ${renderSelfCheckButtons(q, ansState)}
        </div>
      `;
    } else if (q.type === 'Written') {
      html += `
        <div class="solution-reveal-plate">
          <div class="solution-section-title">
            <span>Model Science Answer</span>
          </div>
          <div style="margin-bottom:12px; font-size:1.05rem; line-height:1.5;">
            ${renderMarkdown(q.model_answer)}
          </div>
          <p class="solution-explanation-text">
            <strong>Scientific Explanation:</strong> ${renderMarkdown(q.explanation)}
          </p>
          ${renderSelfCheckButtons(q, ansState)}
        </div>
      `;
    }

    return html;
  }

  function renderSelfCheckButtons(q, ansState) {
    const sel = ansState.status;
    return `
      <div class="self-check-container">
        <div class="self-check-prompt">Rate Your Answer:</div>
        <div class="self-check-buttons-row">
          <button type="button" class="self-btn got-it ${sel === 'got_it' ? 'selected' : ''}" data-grade="got_it">
            <span>[✓] I got it</span>
            <small style="font-size:0.75rem; font-weight:400;">Full understanding</small>
          </button>
          <button type="button" class="self-btn partly ${sel === 'partly' ? 'selected' : ''}" data-grade="partly">
            <span>[〜] Partly</span>
            <small style="font-size:0.75rem; font-weight:400;">Needs review</small>
          </button>
          <button type="button" class="self-btn not-yet ${sel === 'not_yet' ? 'selected' : ''}" data-grade="not_yet">
            <span>[✗] Not yet</span>
            <small style="font-size:0.75rem; font-weight:400;">Save to mistakes</small>
          </button>
        </div>
      </div>
    `;
  }

  // --- Bind Interactivity for Question Elements ---
  function bindQuestionInteractions(q, ansState, mode) {
    // 1. Figures Tap to enlarge
    document.querySelectorAll('.archival-figure-interactive').forEach((fig) => {
      fig.addEventListener('click', () => {
        openImageModal(fig.getAttribute('data-src'), fig.getAttribute('data-alt'), fig.nextElementSibling ? fig.nextElementSibling.textContent : '');
      });
    });

    // 2. Hint Toggle (Practice only)
    const hintBtn = document.getElementById('btn-open-hint');
    if (hintBtn) {
      hintBtn.addEventListener('click', () => {
        ansState.hintOpened = true;
        state.userProgress.hintsUsed = (state.userProgress.hintsUsed || 0) + 1;
        saveProgress();
        renderPracticeQuestionView();
        announce('Hint note opened.');
      });
    }

    // 3. MCQ Options
    document.querySelectorAll('.mcq-option-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        ansState.selected = key;
        ansState.answered = true;
        ansState.revealed = true;

        const isCorrect = key === q.answer;
        ansState.status = isCorrect ? 'correct' : 'wrong';

        // Save progress
        state.userProgress.answered[q.id] = {
          lastAnswer: key,
          correct: isCorrect,
          status: ansState.status,
          date: Date.now()
        };

        if (isCorrect) {
          removeMistake(q.id);
          announce(`Correct! Option ${key}. Explanation revealed.`);
        } else {
          addMistake(q.id);
          announce(`Incorrect. Option ${key}. Correct answer is ${q.answer}. Explanation revealed.`);
        }
        saveProgress();

        if (mode === 'practice') {
          renderPracticeQuestionView();
        } else if (mode === 'mock') {
          renderMockQuestionView();
        }
      });
    });

    // 4. True / False Buttons
    document.querySelectorAll('.tf-choice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const choice = btn.getAttribute('data-choice');
        ansState.selected = choice;
        ansState.answered = true;
        ansState.revealed = true;

        const choiceBool = choice === 'True';
        const isCorrect = choiceBool === q.is_true;
        ansState.status = isCorrect ? 'correct' : 'wrong';

        state.userProgress.answered[q.id] = {
          lastAnswer: choice,
          correct: isCorrect,
          status: ansState.status,
          date: Date.now()
        };

        if (isCorrect) {
          removeMistake(q.id);
          announce(`Correct! Statement is ${choice}.`);
        } else {
          addMistake(q.id);
          announce(`Incorrect. Statement is ${q.is_true ? 'True' : 'False'}.`);
        }
        saveProgress();

        if (mode === 'practice') {
          renderPracticeQuestionView();
        } else if (mode === 'mock') {
          renderMockQuestionView();
        }
      });
    });

    // 5. Find the Mistake reveal
    const revealMistakeBtn = document.getElementById('btn-reveal-mistake');
    if (revealMistakeBtn) {
      revealMistakeBtn.addEventListener('click', () => {
        const textarea = document.getElementById(`mistake-input-${q.id}`);
        ansState.studentText = textarea ? textarea.value : '';
        ansState.revealed = true;
        renderPracticeQuestionView();
        announce('Solution revealed. Please rate your answer.');
      });
    }

    // 6. Written reveal
    const revealWrittenBtn = document.getElementById('btn-reveal-written');
    if (revealWrittenBtn) {
      revealWrittenBtn.addEventListener('click', () => {
        const textarea = document.getElementById(`written-input-${q.id}`);
        ansState.studentText = textarea ? textarea.value : '';
        ansState.revealed = true;
        renderPracticeQuestionView();
        announce('Model answer revealed. Please rate your answer.');
      });
    }

    // 7. Self-Check Rating Buttons
    document.querySelectorAll('.self-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const grade = btn.getAttribute('data-grade');
        ansState.status = grade;
        ansState.answered = true;

        const isCorrect = grade === 'got_it';
        state.userProgress.answered[q.id] = {
          lastAnswer: ansState.studentText,
          correct: isCorrect,
          status: grade,
          date: Date.now()
        };

        if (grade === 'not_yet' || grade === 'partly') {
          addMistake(q.id);
          announce(`Marked as ${grade}. Added to My Mistakes.`);
        } else {
          removeMistake(q.id);
          announce('Marked as understood!');
        }
        saveProgress();
        renderPracticeQuestionView();
      });
    });
  }

  // =========================================================================
  // VIEW: MOCK EXAM SETUP
  // =========================================================================
  function renderMockSetupView() {
    let selSection = 'all';
    let selCount = 20;
    let selTimer = 15; // minutes, 0 = no timer

    appRoot.innerHTML = `
      <div class="setup-form-card">
        <span class="specimen-tag">MODE 2 CONFIGURATION</span>
        <h2 class="setup-title" style="margin-top:6px;">Mock Science Exam Setup</h2>
        <p class="setup-desc">
          Test conditions: hints are disabled, answers are hidden during the exam, and a full score breakdown is provided upon submission.
        </p>

        <!-- Section Picker -->
        <div class="form-group">
          <label class="form-label">1. Choose Section</label>
          <div class="option-pill-group" id="mock-group-sec">
            <button type="button" class="pill-option active" data-val="all">Both Sections (Balanced)</button>
            <button type="button" class="pill-option" data-val="1.2">1.2 Classifying Only</button>
            <button type="button" class="pill-option" data-val="1.3">1.3 Heredity Only</button>
          </div>
        </div>

        <!-- Question Count Picker -->
        <div class="form-group">
          <label class="form-label">2. Exam Length</label>
          <div class="option-pill-group" id="mock-group-count">
            <button type="button" class="pill-option active" data-val="20">20 Questions (Standard)</button>
            <button type="button" class="pill-option" data-val="40">40 Questions (Deep Review)</button>
            <button type="button" class="pill-option" data-val="60">60 Questions (Full Simulation)</button>
          </div>
        </div>

        <!-- Timer Picker -->
        <div class="form-group">
          <label class="form-label">3. Exam Timer</label>
          <div class="option-pill-group" id="mock-group-timer">
            <button type="button" class="pill-option active" data-val="standard">Timed (Recommended)</button>
            <button type="button" class="pill-option" data-val="none">No Timer (Untimed)</button>
          </div>
        </div>

        <div style="margin-top:30px; display:flex; gap:12px;">
          <button type="button" id="btn-start-mock" class="btn-action btn-primary" style="flex:1;">
            Begin Mock Exam →
          </button>
          <button type="button" id="btn-cancel-mock" class="btn-action btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    `;

    function setupPillGroup(groupId, onChange) {
      const group = document.getElementById(groupId);
      group.querySelectorAll('.pill-option').forEach((btn) => {
        btn.addEventListener('click', () => {
          group.querySelectorAll('.pill-option').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          onChange(btn.getAttribute('data-val'));
        });
      });
    }

    setupPillGroup('mock-group-sec', val => { selSection = val; });
    setupPillGroup('mock-group-count', val => { selCount = parseInt(val, 10); });
    setupPillGroup('mock-group-timer', val => {
      selTimer = val === 'none' ? 0 : (selCount === 20 ? 15 : (selCount === 40 ? 30 : 45));
    });

    document.getElementById('btn-cancel-mock').addEventListener('click', () => setView('home'));
    document.getElementById('btn-start-mock').addEventListener('click', () => {
      startMockExam(selSection, selCount, selTimer);
    });
  }

  function startMockExam(section, count, timerMinutes) {
    let pool = state.allQuestions;
    if (section !== 'all') {
      pool = pool.filter(q => q.section === section);
    }

    const shuffled = shuffle(pool);
    const chosen = shuffled.slice(0, Math.min(count, shuffled.length));

    // Clear previous timer
    if (state.mock.timerInterval) {
      clearInterval(state.mock.timerInterval);
      state.mock.timerInterval = null;
    }

    const durationSeconds = timerMinutes * 60;

    state.mock = {
      questions: chosen,
      currentIndex: 0,
      sessionAnswers: {},
      section: section,
      count: chosen.length,
      timerDuration: durationSeconds,
      secondsRemaining: durationSeconds,
      timerInterval: null,
      isSubmitted: false,
      startTime: Date.now(),
      endTime: null
    };

    if (durationSeconds > 0) {
      state.mock.timerInterval = setInterval(() => {
        state.mock.secondsRemaining--;
        updateTimerDisplay();
        if (state.mock.secondsRemaining <= 0) {
          clearInterval(state.mock.timerInterval);
          state.mock.timerInterval = null;
          alert('Time is up for this mock exam! Submitting your answers now.');
          submitMockExam();
        }
      }, 1000);
    }

    setView('mock');
  }

  function updateTimerDisplay() {
    const timerElem = document.getElementById('exam-timer-text');
    if (!timerElem) return;
    const s = state.mock.secondsRemaining;
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    timerElem.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    if (s <= 120) {
      timerElem.classList.add('timer-warning');
    }
  }

  // =========================================================================
  // VIEW: MOCK EXAM IN PROGRESS
  // =========================================================================
  function renderMockQuestionView() {
    const qList = state.mock.questions;
    const idx = state.mock.currentIndex;
    const q = qList[idx];

    if (!q) {
      setView('home');
      return;
    }

    if (!state.mock.sessionAnswers[q.id]) {
      state.mock.sessionAnswers[q.id] = {
        answered: false,
        selected: null,
        studentText: '',
        selfGrade: null
      };
    }

    const ansState = state.mock.sessionAnswers[q.id];
    const secTagClass = q.section === '1.2' ? 'sec-12' : 'sec-13';

    // Count how many answered so far
    let answeredTotal = 0;
    for (const item of qList) {
      const a = state.mock.sessionAnswers[item.id];
      if (a && (a.selected || (a.studentText && a.studentText.trim().length > 0))) {
        answeredTotal++;
      }
    }

    appRoot.innerHTML = `
      <!-- Exam Masthead Bar with Timer -->
      <div class="exam-masthead-bar">
        <div>
          <span class="specimen-tag" style="background:#FFFFFF;">MOCK EXAM · HINTS OFF</span>
          <span style="margin-left:8px; font-weight:700; font-size:0.95rem;">Answered: ${answeredTotal} / ${qList.length}</span>
        </div>
        ${state.mock.timerDuration > 0 ? `
          <div class="timer-display" aria-label="Time remaining">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="10" cy="10" r="7"/>
              <path d="M10 6v4l3 2"/>
            </svg>
            <span id="exam-timer-text">--:--</span>
          </div>
        ` : `
          <div style="font-size:0.85rem; color:var(--ink-secondary); font-weight:700;">UNTIMED EXAM</div>
        `}
      </div>

      <div class="two-column-workspace">
        <!-- Main Question Plate -->
        <div class="field-plate">
          <div class="numeral-row">
            <div class="question-big-num">Q${q.number}</div>
            <div class="question-tags-group">
              <span class="specimen-tag ${secTagClass}">SEC ${q.section}</span>
              <span class="specimen-tag">${q.type.toUpperCase()}</span>
              <span class="specimen-tag">${q.lp}</span>
            </div>
          </div>

          <div class="question-body-section">
            ${renderQuestionCore(q, ansState, 'mock')}
          </div>
        </div>

        <!-- Side Rail: Exam Navigator -->
        <aside class="journal-side-rail" aria-label="Exam Question Navigator">
          <div class="side-rail-title">
            <span>EXAM QUESTIONS</span>
            <span>${idx + 1} / ${qList.length}</span>
          </div>
          <div class="progress-rail-container" style="margin-bottom:14px;">
            <div class="progress-rail">
              <div class="progress-fill" style="width: ${((idx + 1) / qList.length) * 100}%;"></div>
            </div>
          </div>
          <div class="question-nav-grid">
            ${qList.map((item, i) => {
              const itemAns = state.mock.sessionAnswers[item.id];
              let isAnswered = itemAns && (itemAns.selected || (itemAns.studentText && itemAns.studentText.trim().length > 0));
              let statusClass = '';
              if (i === idx) statusClass = 'current';
              else if (isAnswered) statusClass = 'answered-correct';
              return `
                <button type="button" class="nav-dot-btn ${statusClass}" data-index="${i}">
                  ${item.number}
                </button>
              `;
            }).join('')}
          </div>

          <div style="margin-top:20px; border-top:1px dashed var(--ink-border); padding-top:14px;">
            <button type="button" id="btn-finish-mock" class="btn-action btn-primary" style="width:100%;">
              Submit Exam Now →
            </button>
          </div>
        </aside>
      </div>

      <!-- Sticky Bottom Action Bar -->
      <nav class="bottom-action-bar">
        <div class="action-bar-inner">
          <div class="action-bar-left">
            <button type="button" id="mock-btn-prev" class="btn-action btn-secondary" ${idx === 0 ? 'disabled' : ''}>
              ← Previous
            </button>
          </div>
          <div class="progress-rail-container" style="text-align:center;">
            <span class="progress-text">${idx + 1} of ${qList.length}</span>
          </div>
          <div class="action-bar-right">
            ${idx === qList.length - 1 ? `
              <button type="button" id="mock-btn-submit" class="btn-action btn-primary">
                Review &amp; Submit →
              </button>
            ` : `
              <button type="button" id="mock-btn-next" class="btn-action btn-primary">
                Next →
              </button>
            `}
          </div>
        </div>
      </nav>
    `;

    updateTimerDisplay();

    // Auto-save textarea input on change
    const mistakeInput = document.getElementById(`mistake-input-${q.id}`);
    if (mistakeInput) {
      mistakeInput.addEventListener('input', (e) => {
        ansState.studentText = e.target.value;
      });
    }
    const writtenInput = document.getElementById(`written-input-${q.id}`);
    if (writtenInput) {
      writtenInput.addEventListener('input', (e) => {
        ansState.studentText = e.target.value;
      });
    }

    // Bind core interactions (MCQ / TF / Images)
    bindQuestionInteractions(q, ansState, 'mock');

    // Navigation
    document.getElementById('mock-btn-prev').addEventListener('click', () => {
      if (state.mock.currentIndex > 0) {
        state.mock.currentIndex--;
        renderMockQuestionView();
      }
    });

    const nextBtn = document.getElementById('mock-btn-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (state.mock.currentIndex < state.mock.questions.length - 1) {
          state.mock.currentIndex++;
          renderMockQuestionView();
        }
      });
    }

    const submitBtn = document.getElementById('mock-btn-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', promptMockSubmit);
    }

    const finishBtn = document.getElementById('btn-finish-mock');
    if (finishBtn) {
      finishBtn.addEventListener('click', promptMockSubmit);
    }

    document.querySelectorAll('.journal-side-rail .nav-dot-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.mock.currentIndex = parseInt(btn.getAttribute('data-index'), 10);
        renderMockQuestionView();
      });
    });
  }

  function promptMockSubmit() {
    let answered = 0;
    const total = state.mock.questions.length;
    for (const q of state.mock.questions) {
      const a = state.mock.sessionAnswers[q.id];
      if (a && (a.selected || (a.studentText && a.studentText.trim().length > 0))) {
        answered++;
      }
    }

    const msg = answered < total
      ? `You have answered ${answered} of ${total} questions.\nAre you sure you want to finish and submit the exam?`
      : `You have answered all ${total} questions!\nReady to submit and view your score breakdown?`;

    if (confirm(msg)) {
      submitMockExam();
    }
  }

  function submitMockExam() {
    if (state.mock.timerInterval) {
      clearInterval(state.mock.timerInterval);
      state.mock.timerInterval = null;
    }
    state.mock.isSubmitted = true;
    state.mock.endTime = Date.now();
    setView('mock-results');
  }

  // =========================================================================
  // VIEW: MOCK EXAM RESULTS & SCORE BREAKDOWN
  // =========================================================================
  function renderMockResultsView() {
    const qList = state.mock.questions;
    let autoScore = 0;
    let autoTotal = 0;

    const breakdown = {
      MCQ: { correct: 0, total: 0 },
      'True/False': { correct: 0, total: 0 },
      'Find the Mistake': { correct: 0, partly: 0, wrong: 0, total: 0 },
      Written: { correct: 0, partly: 0, wrong: 0, total: 0 }
    };

    const secBreakdown = {
      '1.2': { correct: 0, total: 0 },
      '1.3': { correct: 0, total: 0 }
    };

    // Grade objective questions automatically, gather self-checks for subjective
    qList.forEach((q) => {
      const ans = state.mock.sessionAnswers[q.id] || {};
      const type = q.type;
      breakdown[type].total++;
      secBreakdown[q.section].total++;

      if (type === 'MCQ') {
        autoTotal++;
        const isCorrect = ans.selected === q.answer;
        if (isCorrect) {
          autoScore++;
          breakdown.MCQ.correct++;
          secBreakdown[q.section].correct++;
          removeMistake(q.id);
        } else {
          addMistake(q.id);
        }
      } else if (type === 'True/False') {
        autoTotal++;
        const isCorrect = (ans.selected === 'True') === q.is_true;
        if (isCorrect) {
          autoScore++;
          breakdown['True/False'].correct++;
          secBreakdown[q.section].correct++;
          removeMistake(q.id);
        } else {
          addMistake(q.id);
        }
      } else {
        // Find the Mistake / Written: self grade
        const selfGrade = ans.selfGrade || 'not_yet';
        if (selfGrade === 'got_it') {
          breakdown[type].correct++;
          secBreakdown[q.section].correct += 1;
        } else if (selfGrade === 'partly') {
          breakdown[type].partly = (breakdown[type].partly || 0) + 1;
          secBreakdown[q.section].correct += 0.5;
          addMistake(q.id);
        } else {
          breakdown[type].wrong = (breakdown[type].wrong || 0) + 1;
          addMistake(q.id);
        }
      }
    });

    // Total points calculation (including self checks)
    let totalPoints = 0;
    totalPoints += breakdown.MCQ.correct;
    totalPoints += breakdown['True/False'].correct;
    totalPoints += breakdown['Find the Mistake'].correct + (breakdown['Find the Mistake'].partly || 0) * 0.5;
    totalPoints += breakdown.Written.correct + (breakdown.Written.partly || 0) * 0.5;

    const percentage = Math.round((totalPoints / qList.length) * 100);

    let assessmentBand = 'Excellent Field Mastery';
    if (percentage < 60) assessmentBand = 'Needs Targeted Review';
    else if (percentage < 75) assessmentBand = 'Good Foundation - Practice Mistakes';
    else if (percentage < 90) assessmentBand = 'Very Strong Performance';

    appRoot.innerHTML = `
      <div class="results-card">
        <span class="specimen-tag">OFFICIAL MOCK EXAM SCORE REPORT</span>
        <h2 style="font-family:var(--font-serif); font-size:1.85rem; margin-top:8px;">
          Assessment Summary
        </h2>
        <p style="color:var(--ink-secondary); font-size:0.95rem;">
          Grade 6 Science · Chapter 1 Review (Classifying &amp; Heredity)
        </p>

        <!-- Big Score Hero -->
        <div class="score-hero-box">
          <div class="score-big-num">${percentage}%</div>
          <div class="score-grade-text">${assessmentBand}</div>
          <p style="font-size:0.9rem; color:var(--ink-muted); margin-top:6px;">
            ${totalPoints} points out of ${qList.length} total questions
          </p>
        </div>

        <!-- Breakdown by Question Type -->
        <h3 style="font-family:var(--font-serif); font-size:1.25rem; margin-top:20px;">
          Breakdown by Question Type
        </h3>
        <table class="results-breakdown-table">
          <thead>
            <tr>
              <th>Format</th>
              <th>Your Score</th>
              <th>Percentage</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Multiple Choice (MCQ)</strong></td>
              <td>${breakdown.MCQ.correct} / ${breakdown.MCQ.total}</td>
              <td>${breakdown.MCQ.total ? Math.round((breakdown.MCQ.correct / breakdown.MCQ.total) * 100) : 0}%</td>
            </tr>
            <tr>
              <td><strong>True / False</strong></td>
              <td>${breakdown['True/False'].correct} / ${breakdown['True/False'].total}</td>
              <td>${breakdown['True/False'].total ? Math.round((breakdown['True/False'].correct / breakdown['True/False'].total) * 100) : 0}%</td>
            </tr>
            <tr>
              <td><strong>Find the Mistake</strong></td>
              <td>${breakdown['Find the Mistake'].correct + (breakdown['Find the Mistake'].partly || 0) * 0.5} / ${breakdown['Find the Mistake'].total}</td>
              <td>${breakdown['Find the Mistake'].total ? Math.round(((breakdown['Find the Mistake'].correct + (breakdown['Find the Mistake'].partly || 0) * 0.5) / breakdown['Find the Mistake'].total) * 100) : 0}%</td>
            </tr>
            <tr>
              <td><strong>Written Questions</strong></td>
              <td>${breakdown.Written.correct + (breakdown.Written.partly || 0) * 0.5} / ${breakdown.Written.total}</td>
              <td>${breakdown.Written.total ? Math.round(((breakdown.Written.correct + (breakdown.Written.partly || 0) * 0.5) / breakdown.Written.total) * 100) : 0}%</td>
            </tr>
          </tbody>
        </table>

        <!-- Breakdown by Section -->
        <h3 style="font-family:var(--font-serif); font-size:1.25rem; margin-top:24px;">
          Breakdown by Section
        </h3>
        <table class="results-breakdown-table">
          <thead>
            <tr>
              <th>Section</th>
              <th>Score</th>
              <th>Percentage</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Section 1.2 – ${SEC_12_TITLE}</strong></td>
              <td>${secBreakdown['1.2'].correct} / ${secBreakdown['1.2'].total}</td>
              <td>${secBreakdown['1.2'].total ? Math.round((secBreakdown['1.2'].correct / secBreakdown['1.2'].total) * 100) : 0}%</td>
            </tr>
            <tr>
              <td><strong>Section 1.3 – ${SEC_13_TITLE}</strong></td>
              <td>${secBreakdown['1.3'].correct} / ${secBreakdown['1.3'].total}</td>
              <td>${secBreakdown['1.3'].total ? Math.round((secBreakdown['1.3'].correct / secBreakdown['1.3'].total) * 100) : 0}%</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top:28px; display:flex; flex-direction:column; gap:10px;">
          <button type="button" id="btn-review-exam-mistakes" class="btn-action btn-primary" style="width:100%;">
            Practice Missed Questions in "My Mistakes" →
          </button>
          <button type="button" id="btn-return-home-from-mock" class="btn-action btn-secondary" style="width:100%;">
            Return to Notebook Index
          </button>
        </div>
      </div>
    `;

    document.getElementById('btn-review-exam-mistakes').addEventListener('click', () => {
      setView('mistakes');
    });
    document.getElementById('btn-return-home-from-mock').addEventListener('click', () => {
      setView('home');
    });
  }

  // =========================================================================
  // VIEW: MY MISTAKES (Targeted retry list)
  // =========================================================================
  function renderMistakesView() {
    const mistakeIds = state.userProgress.mistakes;
    const filter = state.mistakesFilter;

    let mistakeQuestions = mistakeIds
      .map(id => state.questionsById[id])
      .filter(Boolean);

    if (filter !== 'all') {
      mistakeQuestions = mistakeQuestions.filter(q => q.section === filter);
    }

    appRoot.innerHTML = `
      <div style="max-width:800px; margin:0 auto;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
          <div>
            <span class="specimen-tag">MODE 3</span>
            <h2 style="font-family:var(--font-serif); font-size:1.85rem; margin-top:4px;">
              My Mistakes Notebook
            </h2>
          </div>
          ${mistakeQuestions.length > 0 ? `
            <button type="button" id="btn-clear-mistakes" style="font-size:0.85rem; background:none; border:none; text-decoration:underline; color:var(--ink-muted); cursor:pointer;">
              Clear All Mistakes
            </button>
          ` : ''}
        </div>
        <p style="color:var(--ink-secondary); font-size:1rem; margin-bottom:20px;">
          Every question answered incorrectly or marked "not yet" is saved here until you master it.
        </p>

        <!-- Filter Pills -->
        <div class="option-pill-group" style="margin-bottom:24px;">
          <button type="button" class="pill-option ${filter === 'all' ? 'active' : ''}" data-filter="all">
            All Sections (${mistakeIds.length})
          </button>
          <button type="button" class="pill-option ${filter === '1.2' ? 'active' : ''}" data-filter="1.2">
            Section 1.2 (${mistakeIds.filter(id => id.startsWith('s12')).length})
          </button>
          <button type="button" class="pill-option ${filter === '1.3' ? 'active' : ''}" data-filter="1.3">
            Section 1.3 (${mistakeIds.filter(id => id.startsWith('s13')).length})
          </button>
        </div>

        ${mistakeQuestions.length === 0 ? `
          <div class="field-plate" style="text-align:center; padding:48px 24px;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--sec-12-accent)" stroke-width="2" style="margin:0 auto 12px;" aria-hidden="true">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
              <path d="M22 4L12 14.01l-3-3"/>
            </svg>
            <h3 style="font-family:var(--font-serif); font-size:1.4rem; color:var(--ink-primary); margin-bottom:8px;">
              Your Field Notebook is Clear!
            </h3>
            <p style="color:var(--ink-secondary); max-width:440px; margin:0 auto 20px;">
              You have no active mistakes saved. As you practice or take mock exams, any questions you miss will be collected here for retry.
            </p>
            <button type="button" id="btn-goto-practice" class="btn-action btn-primary">
              Start a Practice Session →
            </button>
          </div>
        ` : `
          <div style="margin-bottom:20px;">
            <button type="button" id="btn-practice-all-mistakes" class="btn-action btn-primary" style="width:100%; min-height:52px; font-size:1.1rem;">
              Practice These ${mistakeQuestions.length} Mistakes Now →
            </button>
          </div>

          <div style="display:flex; flex-direction:column; gap:12px;">
            ${mistakeQuestions.map((q) => {
              const secClass = q.section === '1.2' ? 'sec-12' : 'sec-13';
              return `
                <div class="field-plate-alt" style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                  <div>
                    <div style="display:flex; gap:6px; margin-bottom:6px;">
                      <span class="specimen-tag ${secClass}">SEC ${q.section}</span>
                      <span class="specimen-tag">Q${q.number}</span>
                      <span class="specimen-tag">${q.type}</span>
                    </div>
                    <div style="font-size:0.95rem; font-weight:700; color:var(--ink-primary);">
                      ${renderMarkdown(q.prompt || q.statement || q.question || 'Inspect question')}
                    </div>
                  </div>
                  <div style="display:flex; gap:8px; flex-shrink:0;">
                    <button type="button" class="btn-action btn-secondary btn-retry-single" data-qid="${q.id}">
                      Retry
                    </button>
                    <button type="button" class="btn-action btn-remove-mistake" data-qid="${q.id}" style="background:none; border:1px solid var(--ink-border-dark); color:var(--ink-muted);" title="Mark as mastered and remove">
                      ✓ Mastered
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    // Event bindings
    document.querySelectorAll('.pill-option[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.mistakesFilter = btn.getAttribute('data-filter');
        renderMistakesView();
      });
    });

    const practiceAllBtn = document.getElementById('btn-practice-all-mistakes');
    if (practiceAllBtn) {
      practiceAllBtn.addEventListener('click', () => {
        startPracticeSession(state.mistakesFilter, 'all', 'all', mistakeQuestions);
      });
    }

    const gotoPracticeBtn = document.getElementById('btn-goto-practice');
    if (gotoPracticeBtn) {
      gotoPracticeBtn.addEventListener('click', () => setView('practice-setup'));
    }

    const clearBtn = document.getElementById('btn-clear-mistakes');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Clear all saved questions from your mistakes notebook?')) {
          state.userProgress.mistakes = [];
          saveProgress();
          renderMistakesView();
        }
      });
    }

    document.querySelectorAll('.btn-retry-single').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-qid');
        const q = state.questionsById[qid];
        if (q) {
          startPracticeSession(q.section, 'all', 'all', [q]);
        }
      });
    });

    document.querySelectorAll('.btn-remove-mistake').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-qid');
        removeMistake(qid);
        renderMistakesView();
      });
    });
  }

  // =========================================================================
  // INITIALIZATION
  // =========================================================================
  async function init() {
    // 1. Load questions (either window.SCIENCE_QUESTIONS from questions-data.js or fetch questions.json)
    if (window.SCIENCE_QUESTIONS && Array.isArray(window.SCIENCE_QUESTIONS)) {
      state.allQuestions = window.SCIENCE_QUESTIONS;
    } else {
      try {
        const res = await fetch('questions.json');
        if (res.ok) {
          state.allQuestions = await res.json();
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (err) {
        console.error('Failed to load questions.json:', err);
        appRoot.innerHTML = `
          <div class="field-plate" style="text-align:center; padding:32px;">
            <h2 style="font-family:var(--font-serif); color:var(--sec-13-accent);">Error Loading Questions</h2>
            <p>Could not load the question bank. Please ensure questions.json or questions-data.js is present.</p>
          </div>
        `;
        return;
      }
    }

    // Index questions by id
    state.questionsById = {};
    state.allQuestions.forEach((q) => {
      state.questionsById[q.id] = q;
    });

    // 2. Load stored progress
    loadProgress();

    // 3. Bind Top Nav Tabs & Logo
    document.getElementById('site-logo').addEventListener('click', () => { window.location.hash = ''; setView('home'); });
    document.getElementById('tab-home').addEventListener('click', () => { window.location.hash = ''; setView('home'); });
    document.getElementById('tab-practice').addEventListener('click', () => { window.location.hash = 'practice'; setView('practice-setup'); });
    document.getElementById('tab-mock').addEventListener('click', () => { window.location.hash = 'mock'; setView('mock-setup'); });
    document.getElementById('tab-mistakes').addEventListener('click', () => { window.location.hash = 'mistakes'; setView('mistakes'); });

    // Handle initial URL hash or question deep link (e.g. #practice?qid=s12_q15)
    function handleHashRouting() {
      const hash = window.location.hash.replace('#', '');
      if (!hash) {
        setView('home');
        return;
      }
      const [route, queryStr] = hash.split('?');
      const params = new URLSearchParams(queryStr || '');
      const qid = params.get('qid');

      if (qid && state.questionsById[qid]) {
        const targetQ = state.questionsById[qid];
        const secQs = state.allQuestions.filter(q => q.section === targetQ.section);
        const targetIdx = secQs.findIndex(q => q.id === qid);
        state.practice = {
          questions: secQs,
          currentIndex: targetIdx >= 0 ? targetIdx : 0,
          sessionAnswers: {},
          section: targetQ.section,
          type: 'all',
          level: 'all'
        };
        setView('practice');
        return;
      }

      if (route === 'practice') setView('practice-setup');
      else if (route === 'mock') setView('mock-setup');
      else if (route === 'mistakes') setView('mistakes');
      else setView('home');
    }

    window.addEventListener('hashchange', handleHashRouting);
    handleHashRouting();
  }

  // Start app on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
