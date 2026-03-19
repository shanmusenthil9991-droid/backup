// popup.js – LectureLens with Groq API (FREE & ULTRA FAST)
'use strict';

// ===== STATE =====
let currentVideoInfo = null;
let currentTranscript = null;
let currentContentType = null;
let lastResults = null;
let apiKey = null;

// ===== DOM REFS =====
const $ = id => document.getElementById(id);
const apiSetup = $('apiSetup');
const actionPanel = $('actionPanel');
const loadingPanel = $('loadingPanel');
const resultsPanel = $('resultsPanel');
const statusPill = $('statusPill');
const statusText = $('statusText');
const videoTitle = $('videoTitle');
const videoSub = $('videoSub');
const notLectureModal = $('notLectureModal');
const resultsContent = $('resultsContent');
const contentTypeBadge = $('contentTypeBadge');
const resultsTitle = $('resultsTitle');
const newMcqBtn = $('newMcqBtn');

// ===== GROQ API CONFIG =====
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile'; // Best free model on Groq

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  await loadApiKey();
  await detectVideo();
  bindEvents();
});

async function loadApiKey() {
  const stored = await chrome.storage.local.get('groqApiKey');
  if (stored.groqApiKey) {
    apiKey = stored.groqApiKey;
    apiSetup.style.display = 'none';
    actionPanel.style.display = 'flex';
  }
}

async function detectVideo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.includes('youtube.com/watch')) {
      videoTitle.textContent = 'No YouTube video detected';
      videoSub.textContent = 'Navigate to a YouTube video';
      setStatus('idle', 'No video');
      return;
    }
    const info = await chrome.tabs.sendMessage(tab.id, { action: 'getVideoInfo' });
    if (info && !info.error) {
      currentVideoInfo = info;
      videoTitle.textContent = info.title || 'YouTube Video';
      videoSub.textContent = info.channelName || 'YouTube';
      if (info.thumbnail) {
        const wrap = document.querySelector('.video-thumb-wrap');
        wrap.innerHTML = `<img src="${info.thumbnail}" alt="thumb" onerror="this.parentElement.innerHTML='<div class=video-thumb-placeholder><svg width=16 height=16 viewBox=\\'0 0 24 24\\' fill=none stroke=currentColor stroke-width=2><polygon points=\\'5 3 19 12 5 21 5 3\\'/></svg></div>'" />`;
      }
      setStatus('ready', 'Video found');
    }
  } catch(e) {
    videoTitle.textContent = 'Could not detect video';
    videoSub.textContent = 'Try refreshing the page';
    setStatus('error', 'Error');
  }
}

function bindEvents() {
  $('saveKeyBtn').addEventListener('click', saveApiKey);
  $('apiKeyInput').addEventListener('keydown', e => { if (e.key === 'Enter') saveApiKey(); });
  $('analyzeBtn').addEventListener('click', () => runAnalysis('summary'));
  $('mcqBtn').addEventListener('click', () => runAnalysis('mcq'));
  $('backBtn').addEventListener('click', showActionPanel);
  $('clearBtn').addEventListener('click', () => { lastResults = null; showActionPanel(); });
  $('changeKeyBtn').addEventListener('click', () => {
    apiKey = null;
    chrome.storage.local.remove('groqApiKey');
    actionPanel.style.display = 'none';
    apiSetup.style.display = 'flex';
  });
  $('closeModal').addEventListener('click', () => { notLectureModal.style.display = 'none'; });
  $('copyBtn').addEventListener('click', copyResults);
  newMcqBtn.addEventListener('click', () => runAnalysis('mcq'));
}

async function saveApiKey() {
  const val = $('apiKeyInput').value.trim();
  if (!val || val.length < 10) {
    showError('Please enter your Groq API key from console.groq.com');
    return;
  }
  apiKey = val;
  await chrome.storage.local.set({ groqApiKey: val });
  apiSetup.style.display = 'none';
  actionPanel.style.display = 'flex';
}

// ===== MAIN ANALYSIS FLOW =====
async function runAnalysis(mode) {
  if (!apiKey) {
    apiSetup.style.display = 'flex';
    actionPanel.style.display = 'none';
    return;
  }

  showLoading(mode);

  try {
    setStep(1);
    const context = await getVideoContext();

    setStep(2);
    const contentType = await classifyContent(context);

    if (contentType === 'non_educational') {
      hideLoading();
      showActionPanel();
      notLectureModal.style.display = 'flex';
      return;
    }

    currentContentType = contentType;

    setStep(3);
    let result;
    if (mode === 'summary') {
      result = await generateSummary(context, contentType);
    } else {
      result = await generateMCQ(context, contentType);
    }

    renderResults(result, mode, contentType);

  } catch(e) {
    hideLoading();
    showActionPanel();
    showError('Error: ' + (e.message || 'Something went wrong. Check your API key and try again.'));
    setStatus('error', 'Error');
  }
}

async function getVideoContext() {
  if (!currentVideoInfo) throw new Error('No video detected. Please navigate to a YouTube video.');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'getTranscript' });
    if (res?.transcript) currentTranscript = res.transcript.slice(0, 8000);
  } catch(e) {}
  return {
    title: currentVideoInfo.title || '',
    channel: currentVideoInfo.channelName || '',
    description: currentVideoInfo.description || '',
    transcript: currentTranscript || null,
    url: currentVideoInfo.url || ''
  };
}

async function classifyContent(context) {
  const prompt = `Classify this YouTube video into exactly ONE category word from this list:
math, electrical, code, science, story, lecture, non_educational

Definitions:
- math: mathematics, calculus, algebra, statistics, geometry, arithmetic, quantitative aptitude
- electrical: electrical engineering, electronics, circuits, signals, components
- code: programming, software, coding tutorials, algorithms, data structures
- science: physics, chemistry, biology, general science
- story: literary analysis, stories, novels, poetry, history narratives
- lecture: general academic lecture, economics, humanities, social science
- non_educational: entertainment, music, gaming, vlogs, movies, sports, memes, comedy

Video Title: ${context.title}
Channel: ${context.channel}
Description: ${context.description.slice(0, 200)}

Reply with ONLY the single category word. Nothing else at all.`;

  const resp = await callGroq(prompt, 10);
  const raw = resp.trim().toLowerCase().replace(/[^a-z_]/g, '');
  const valid = ['math','electrical','code','science','story','lecture','non_educational'];
  return valid.includes(raw) ? raw : 'lecture';
}

async function generateSummary(context, contentType) {
  const ctx = buildContextString(context);
  let prompt = '';

  if (contentType === 'story') {
    prompt = `You are an expert literature tutor. Summarize this story/literary content clearly for a student.
${ctx}

Write a structured summary using these EXACT section headers on their own line in ALL CAPS:

OVERVIEW
PLOT SUMMARY
CHARACTERS
THEMES
KEY TAKEAWAYS

Under each header write bullet points starting with — (em dash).
Be detailed and helpful for exam preparation.`;

  } else if (contentType === 'math') {
    prompt = `You are an expert mathematics tutor. Summarize this math lecture clearly for a student.
${ctx}

Write a structured summary using these EXACT section headers on their own line in ALL CAPS:

TOPIC OVERVIEW
KEY CONCEPTS
FORMULAS & RULES
WORKED EXAMPLES
STUDY TIPS

Under each header write bullet points starting with — (em dash).
Include any formulas or equations mentioned. Be thorough.`;

  } else if (contentType === 'electrical') {
    prompt = `You are an expert electrical engineering tutor. Summarize this electronics lecture clearly for a student.
${ctx}

Write a structured summary using these EXACT section headers on their own line in ALL CAPS:

TOPIC OVERVIEW
KEY PRINCIPLES
COMPONENTS & CIRCUITS
ANALYSIS METHODS
KEY FORMULAS
PRACTICAL APPLICATIONS

Under each header write bullet points starting with — (em dash).
Include any equations or circuit analysis techniques mentioned.`;

  } else if (contentType === 'code') {
    prompt = `You are an expert programming tutor. Summarize this coding lecture clearly for a student.
${ctx}

Write a structured summary using these EXACT section headers on their own line in ALL CAPS:

TOPIC OVERVIEW
CORE CONCEPTS
CODE TECHNIQUES
COMPLEXITY & PERFORMANCE
PRACTICAL PROJECTS
NEXT STEPS

Under each header write bullet points starting with — (em dash).
Include any code patterns, syntax, or algorithms discussed.`;

  } else {
    prompt = `You are an expert academic tutor. Summarize this educational lecture clearly for a student.
${ctx}

Write a structured summary using these EXACT section headers on their own line in ALL CAPS:

OVERVIEW
KEY CONCEPTS
DETAILED NOTES
KEY TAKEAWAYS
FURTHER STUDY

Under each header write bullet points starting with — (em dash).
Be thorough and helpful for exam preparation.`;
  }

  return await callGroq(prompt, 1500);
}

async function generateMCQ(context, contentType) {
  const ctx = buildContextString(context);

  let specialInstructions = '';
  if (contentType === 'math') {
    specialInstructions = `MATH REQUIREMENT: In the EXPLANATION for every question, show the complete step-by-step mathematical solution with all working and calculations clearly shown. Label each step as Step 1:, Step 2:, etc.`;
  } else if (contentType === 'electrical') {
    specialInstructions = `ELECTRICAL REQUIREMENT: In the EXPLANATION, when relevant describe the circuit using ASCII art with symbols: --[R]-- for resistor, --[C]-- for capacitor, --[L]-- for inductor, (V) for voltage source, --||-- for battery. Show the circuit on its own line labeled ASCII_CIRCUIT:`;
  } else if (contentType === 'code') {
    specialInstructions = `CODE REQUIREMENT: Include relevant code snippets in backticks where helpful. For questions about output, show the expected result labeled as OUTPUT: on its own line.`;
  } else if (contentType === 'story') {
    specialInstructions = `STORY REQUIREMENT: Focus on plot events, character motivations, themes, literary devices, and the author's message. Avoid trivial details.`;
  }

  const prompt = `You are an expert exam question creator. Generate exactly 20 multiple choice questions based on this educational content.
${ctx}

${specialInstructions}

Use EXACTLY this format for every single question — no deviations:

Q1. [Question text]
A) [Option]
B) [Option]
C) [Option]
D) [Option]
ANSWER: [A or B or C or D]
EXPLANATION: [Detailed explanation. For math show full step-by-step working.]
---

Q2. [Question text]
A) [Option]
B) [Option]
C) [Option]
D) [Option]
ANSWER: [A or B or C or D]
EXPLANATION: [Detailed explanation]
---

Continue this exact pattern for all 20 questions.
- Make 7 easy, 8 medium, 5 hard questions
- Cover ALL major topics from the content
- Wrong options must be plausible, not obviously wrong
- Do not stop until all 20 questions are written`;

  return await callGroq(prompt, 4000);
}

function buildContextString(context) {
  let str = `Video Title: ${context.title}\nChannel: ${context.channel}\n`;
  if (context.description) str += `Description: ${context.description.slice(0, 400)}\n`;
  if (context.transcript) str += `\nTranscript:\n${context.transcript.slice(0, 6000)}`;
  else str += `\n(No transcript available — analyze based on title, channel and description only)`;
  return str;
}

// ===== GROQ API CALL =====
async function callGroq(prompt, maxTokens = 1000) {
  const response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.7
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const msg = data?.error?.message || '';
    if (response.status === 401) throw new Error('Invalid API key. Please get a fresh key from console.groq.com');
    if (response.status === 429) throw new Error('Rate limit hit. Wait 10 seconds and try again. (Groq free: 30 req/min)');
    if (response.status === 400) throw new Error('Bad request: ' + msg);
    if (response.status === 503) throw new Error('Groq service temporarily unavailable. Try again in a moment.');
    throw new Error('API error ' + response.status + ': ' + (msg || 'Unknown error'));
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from Groq. Please try again.');
  return text;
}

// ===== RENDER RESULTS =====
function renderResults(rawText, mode, contentType) {
  lastResults = rawText;
  hideLoading();

  const badgeMap = { math:'Math', electrical:'Electrical', code:'Code', science:'Science', story:'Story', lecture:'Lecture' };
  contentTypeBadge.textContent = badgeMap[contentType] || 'Lecture';
  contentTypeBadge.className = `results-badge ${contentType}`;
  resultsTitle.textContent = mode === 'summary' ? 'Video Summary' : '20 Practice MCQs';
  newMcqBtn.style.display = mode === 'summary' ? 'none' : 'flex';

  if (mode === 'summary') {
    resultsContent.innerHTML = renderSummaryHTML(rawText, contentType);
  } else {
    resultsContent.innerHTML = renderMCQHTML(rawText, contentType);
    bindMCQToggle();
  }

  actionPanel.style.display = 'none';
  loadingPanel.style.display = 'none';
  resultsPanel.style.display = 'flex';
  setStatus('ready', 'Done');
}

function renderSummaryHTML(text, contentType) {
  const lines = text.split('\n').filter(l => l.trim());
  let html = '<div class="summary-content">';
  let currentSection = '';
  let sectionContent = [];

  const sectionHeaders = [
    'OVERVIEW','TOPIC OVERVIEW','PLOT SUMMARY','CHARACTERS','THEMES',
    'KEY CONCEPTS','KEY TAKEAWAYS','FORMULAS & RULES','WORKED EXAMPLES','STUDY TIPS',
    'KEY PRINCIPLES','COMPONENTS & CIRCUITS','ANALYSIS METHODS','KEY FORMULAS',
    'PRACTICAL APPLICATIONS','CORE CONCEPTS','CODE TECHNIQUES','COMPLEXITY & PERFORMANCE',
    'PRACTICAL PROJECTS','NEXT STEPS','DETAILED NOTES','FURTHER STUDY'
  ];

  function flushSection() {
    if (!currentSection || sectionContent.length === 0) return;
    html += `<div class="summary-section">`;
    html += `<div class="section-label">${escHtml(currentSection)}</div>`;
    const points = sectionContent.filter(l => l.trim());
    if (points.length === 1 && !points[0].startsWith('—') && !points[0].startsWith('-')) {
      html += `<p class="summary-text">${escHtml(points[0])}</p>`;
    } else {
      html += `<ul class="key-points">`;
      points.forEach(p => {
        const cleaned = p.replace(/^[—\-•·▸▪►\*]\s*/, '').trim();
        if (cleaned) html += `<li class="key-point">${escHtml(cleaned)}</li>`;
      });
      html += `</ul>`;
    }
    html += `</div>`;
    sectionContent = [];
  }

  lines.forEach(line => {
    const trimmed = line.trim();
    const upper = trimmed.toUpperCase().replace(/:$/, '').trim();
    if (sectionHeaders.includes(upper)) {
      flushSection();
      currentSection = upper;
    } else if (trimmed) {
      sectionContent.push(trimmed);
    }
  });
  flushSection();

  if (!html.includes('summary-section')) {
    const paras = text.split('\n\n').filter(p => p.trim());
    paras.forEach(p => { html += `<p class="summary-text" style="margin-bottom:10px">${escHtml(p.trim())}</p>`; });
  }

  html += '</div>';
  return html;
}

function renderMCQHTML(text, contentType) {
  const questions = parseMCQs(text);
  if (questions.length === 0) {
    return `<div class="summary-section"><p class="summary-text">${escHtml(text)}</p></div>`;
  }

  let html = `<div class="mcq-container">`;
  questions.forEach((q, idx) => {
    html += `
    <div class="mcq-item" id="mcq-${idx}">
      <div class="mcq-question-header" onclick="toggleMCQ(${idx})">
        <div class="mcq-number">${idx + 1}</div>
        <div class="mcq-q-text">${escHtml(q.question)}</div>
        <div class="mcq-toggle" id="toggle-${idx}">▾</div>
      </div>
      <div class="mcq-body" id="body-${idx}">
        <div class="mcq-options">
          ${q.options.map((opt, i) => {
            const letters = ['A','B','C','D'];
            const isCorrect = q.answer === letters[i];
            return `<div class="mcq-option ${isCorrect ? 'correct' : ''}">
              <div class="opt-letter">${letters[i]}</div>
              <span>${escHtml(opt)}</span>
            </div>`;
          }).join('')}
        </div>
        ${renderExplanation(q, contentType)}
      </div>
    </div>`;
  });
  html += `</div>`;
  return html;
}

function renderExplanation(q, contentType) {
  if (!q.explanation) return '';
  let inner = '';

  // Electrical circuit diagram
  if (contentType === 'electrical') {
    const circuitMatch = q.explanation.match(/ASCII_CIRCUIT:\s*([^\n]+(?:\n[^\n]+)*?)(?=\n[A-Z]|$)/i);
    if (circuitMatch) {
      inner += `<div class="circuit-diagram"><div class="circuit-ascii">${escHtml(circuitMatch[1].trim())}</div></div>`;
      inner += `<p class="solution-text">${escHtml(q.explanation.replace(circuitMatch[0], '').trim())}</p>`;
    } else if (q.explanation.toLowerCase().match(/resistor|capacitor|voltage|current|circuit|ohm/)) {
      inner += renderGenericCircuit();
      inner += `<p class="solution-text">${escHtml(q.explanation)}</p>`;
    } else {
      inner += `<p class="solution-text">${escHtml(q.explanation)}</p>`;
    }
  }
  // Math step-by-step
  else if (contentType === 'math') {
    inner += `<div class="math-solution">
      <div class="solution-steps-label">📐 Step-by-Step Solution</div>
      <div class="solution-steps">${formatMathSteps(q.explanation)}</div>
    </div>`;
  }
  // Code with output
  else if (contentType === 'code') {
    const outputMatch = q.explanation.match(/OUTPUT:\s*(.+)/i);
    if (outputMatch) {
      inner += `<p class="solution-text">${escHtml(q.explanation.replace(outputMatch[0],'').trim())}</p>`;
      inner += `<div class="code-block">// Output\n${escHtml(outputMatch[1].trim())}</div>`;
    } else {
      inner += `<p class="solution-text">${escHtml(q.explanation)}</p>`;
    }
  }
  else {
    inner += `<p class="solution-text">${escHtml(q.explanation)}</p>`;
  }

  return `<div class="mcq-solution">
    <div class="solution-label">✓ Answer: ${q.answer} &nbsp;·&nbsp; Explanation</div>
    ${inner}
  </div>`;
}

function formatMathSteps(text) {
  const lines = text.split('\n').filter(l => l.trim());
  return lines.map(line => {
    const isStep = /^step\s*\d|^=|^\d+\.|→|=>|∴|therefore/i.test(line.trim());
    return `<div class="math-step ${isStep ? 'calc' : ''}">${escHtml(line.trim())}</div>`;
  }).join('');
}

function renderGenericCircuit() {
  return `<div class="circuit-diagram">
    <svg class="circuit-svg" viewBox="0 0 300 90" xmlns="http://www.w3.org/2000/svg">
      <style>.cl{stroke:#38bdf8;stroke-width:1.5;fill:none}.ct{fill:#7dd3fc;font-size:8px;font-family:monospace}.cb{fill:rgba(56,189,248,0.08);stroke:rgba(56,189,248,0.25);stroke-width:1}</style>
      <rect class="cb" x="8" y="8" width="284" height="74" rx="6"/>
      <line x1="30" y1="20" x2="30" y2="70" class="cl"/>
      <line x1="24" y1="32" x2="36" y2="32" class="cl" style="stroke-width:2.5"/>
      <line x1="26" y1="42" x2="34" y2="42" class="cl"/>
      <text class="ct" x="38" y="38" fill="#38bdf8">V</text>
      <line x1="30" y1="20" x2="270" y2="20" class="cl"/>
      <line x1="30" y1="70" x2="270" y2="70" class="cl"/>
      <rect class="cb" x="90" y="13" width="44" height="14" rx="3"/>
      <text class="ct" x="104" y="23" fill="#fbbf24">R1</text>
      <rect class="cb" x="165" y="13" width="44" height="14" rx="3"/>
      <text class="ct" x="179" y="23" fill="#fbbf24">R2</text>
      <line x1="270" y1="20" x2="270" y2="70" class="cl"/>
      <line x1="240" y1="66" x2="240" y2="74" class="cl" style="stroke-width:2"/>
      <line x1="236" y1="70" x2="244" y2="70" class="cl" style="stroke:#7dd3fc;stroke-width:2.5"/>
      <text class="ct" x="110" y="82" fill="#64748b">Circuit Schematic</text>
    </svg>
  </div>`;
}

function parseMCQs(text) {
  const questions = [];
  const qRegex = /Q(\d+)\.\s*([\s\S]*?)(?=\nQ\d+\.|$)/g;
  let match;

  while ((match = qRegex.exec(text)) !== null) {
    const block = match[2].trim();
    const lines = block.split('\n');
    let questionText = '';
    const options = [];
    let answer = '';
    let explanation = '';
    let mode = 'question';

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === '---') return;

      if (trimmed.match(/^A\)\s*/i) && mode === 'question') { options[0] = trimmed.replace(/^A\)\s*/i,''); mode = 'options'; }
      else if (trimmed.match(/^B\)\s*/i)) { options[1] = trimmed.replace(/^B\)\s*/i,''); }
      else if (trimmed.match(/^C\)\s*/i)) { options[2] = trimmed.replace(/^C\)\s*/i,''); }
      else if (trimmed.match(/^D\)\s*/i)) { options[3] = trimmed.replace(/^D\)\s*/i,''); }
      else if (trimmed.match(/^ANSWER:\s*/i)) {
        answer = trimmed.replace(/^ANSWER:\s*/i,'').trim().toUpperCase().charAt(0);
        mode = 'answer';
      }
      else if (trimmed.match(/^EXPLANATION:\s*/i)) {
        explanation = trimmed.replace(/^EXPLANATION:\s*/i,'');
        mode = 'explanation';
      }
      else if (mode === 'explanation') { explanation += '\n' + trimmed; }
      else if (mode === 'question') { questionText += (questionText ? ' ' : '') + trimmed; }
    });

    if (questionText && options.length >= 2) {
      questions.push({
        number: parseInt(match[1]),
        question: questionText.trim(),
        options: options.filter(Boolean),
        answer: answer || 'A',
        explanation: explanation.trim()
      });
    }
  }
  return questions.slice(0, 20);
}

// ===== UI HELPERS =====
function showLoading(mode) {
  actionPanel.style.display = 'none';
  resultsPanel.style.display = 'none';
  loadingPanel.style.display = 'flex';
  clearError();
  setStatus('loading', 'Analyzing...');
  $('loadingTitle').textContent = mode === 'summary' ? 'Analyzing video...' : 'Generating MCQs...';
  $('loadingSub').textContent = mode === 'summary'
    ? 'Processing with Groq AI — ultra fast!'
    : 'Creating 20 practice questions with Groq';
  ['step1','step2','step3'].forEach(id => $(id).className = 'step');
  $('step1').className = 'step active';
}

function hideLoading() { loadingPanel.style.display = 'none'; }

function setStep(n) {
  for (let i = 1; i <= 3; i++) {
    const el = $(`step${i}`);
    if (i < n) el.className = 'step done';
    else if (i === n) el.className = 'step active';
    else el.className = 'step';
  }
}

function showActionPanel() {
  loadingPanel.style.display = 'none';
  resultsPanel.style.display = 'none';
  clearError();
  if (apiKey) { actionPanel.style.display = 'flex'; apiSetup.style.display = 'none'; }
  else { actionPanel.style.display = 'none'; apiSetup.style.display = 'flex'; }
  setStatus('ready', 'Ready');
}

function setStatus(type, text) {
  statusPill.className = `status-pill ${type === 'loading' ? 'loading' : type === 'error' ? 'error' : ''}`;
  statusText.textContent = text;
}

function showError(msg) {
  clearError();
  const el = document.createElement('div');
  el.className = 'error-msg'; el.id = 'errorMsg'; el.textContent = msg;
  document.body.insertBefore(el, apiKey ? actionPanel : apiSetup);
}

function clearError() { const el = $('errorMsg'); if (el) el.remove(); }

function copyResults() {
  if (!lastResults) return;
  navigator.clipboard.writeText(lastResults).then(() => {
    const btn = $('copyBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> Copied!`;
    setTimeout(() => { btn.innerHTML = orig; }, 2000);
  });
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function bindMCQToggle() {
  const firstBody = document.querySelector('.mcq-body');
  if (firstBody) {
    firstBody.classList.add('open');
    const toggle = document.querySelector('.mcq-toggle');
    if (toggle) toggle.style.transform = 'rotate(180deg)';
  }
}

window.toggleMCQ = function(idx) {
  const body = document.getElementById(`body-${idx}`);
  const toggle = document.getElementById(`toggle-${idx}`);
  if (!body) return;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  if (toggle) toggle.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
};
