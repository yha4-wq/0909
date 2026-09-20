'use strict';

/**
 * The page never holds an API key. It calls server.js on the same origin,
 * which adds the key server-side. If the server is not running (or has no key
 * configured) the page falls back to local keyword matching so it still works
 * when opened as a plain file.
 */

const RECORD_SECONDS = 10;

const SPECIAL_DAY_PATTERNS = {
  birthday: ["birthday", "birth day", "생일", "생신", "탄생일", "버스데이"],
  wedding: ["wedding", "marriage", "결혼식", "웨딩", "예식", "결혼"],
  graduation: ["graduation", "졸업", "졸업식", "학위"],
  first_birthday: ["first birthday", "first birthday party", "돌잔치", "첫돌", "돌파티"],
  proposal: ["proposal", "engagement", "프로포즈", "청혼", "반지"],
  anniversary: ["anniversary", "our anniversary", "기념일", "우리의 날", "연애 기념일", "결혼 기념일"],
  year_end: ["christmas", "new year", "holiday", "연말", "크리스마스", "새해", "파티"],
};

const OCCASION_LABELS = {
  birthday: "생일",
  wedding: "결혼식",
  graduation: "졸업",
  first_birthday: "돌잔치",
  proposal: "프로포즈",
  anniversary: "기념일",
  year_end: "연말",
};

const HERO_PATTERNS = [
  "mom", "mother", "dad", "father", "boyfriend", "girlfriend", "partner",
  "sister", "brother", "family", "wife", "husband", "friend", "friends",
  "loved one", "our child", "daughter", "son", "amazing person",
  "엄마", "어머니", "아빠", "아버지", "남자친구", "여자친구", "애인",
  "동생", "언니", "오빠", "누나", "형", "아내", "남편", "친구", "가족",
  "딸", "아들", "할머니", "할아버지", "선생님",
];

const HERO_LABELS = {
  mom: "어머니", mother: "어머니", dad: "아버지", father: "아버지",
  boyfriend: "남자친구", girlfriend: "여자친구", partner: "연인",
  sister: "자매", brother: "형제", family: "가족", wife: "아내",
  husband: "남편", friend: "친구", friends: "친구들", "loved one": "소중한 분",
  "our child": "아이", daughter: "딸", son: "아들", "amazing person": "소중한 분",
};

const state = {
  recorder: null,
  recognition: null,
  isRecording: false,
  countdownTimer: null,
  hasOpened: false,
  busy: false,
};

const api = { checked: false, configured: false };

const elements = {
  box: document.getElementById('giftBox'),
  button: document.getElementById('storyButton'),
  demoButton: document.getElementById('demoBtn'),
  status: document.getElementById('statusText'),
  bubble: document.getElementById('speechBubble'),
  bubbleText: document.getElementById('bubbleText'),
  cardWrapper: document.getElementById('cardWrapper'),
  cardMessage: document.getElementById('cardMessage'),
  balloonArea: document.getElementById('balloonArea'),
  modal: document.getElementById('storyModal'),
  storyInput: document.getElementById('storyInput'),
  submitStory: document.getElementById('submitStory'),
  closeModal: document.getElementById('closeModal'),
  stage: document.querySelector('.gift-stage'),
};

const CONFETTI_COLORS = ['#ffc8d5', '#ffe8ad', '#9cd7b4', '#b9a8ff', '#ffb38d'];

// ------------------------------------------------------------------ display

function showBubble(text) {
  elements.bubbleText.textContent = text;
  elements.bubble.classList.add('is-visible');
  clearTimeout(showBubble.timeoutId);
  showBubble.timeoutId = setTimeout(() => {
    elements.bubble.classList.remove('is-visible');
  }, 4800);
}

function setCardText(text) {
  elements.cardMessage.innerHTML = String(text).replace(/\n/g, '<br />');
}

function setStatus(message) {
  elements.status.textContent = message;
}

/** Uses the .confetti-layer / .confetti-piece rules already in styles.css. */
function burstConfetti(count = 28) {
  if (!elements.stage) return;

  const layer = document.createElement('div');
  layer.className = 'confetti-layer';

  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 240}px`);
    piece.style.animationDelay = `${Math.random() * 0.45}s`;
    layer.appendChild(piece);
  }

  elements.stage.appendChild(layer);
  setTimeout(() => layer.remove(), 2600);
}

function openGiftBox() {
  const repeatVisit = state.hasOpened;

  elements.box.classList.add('open');
  elements.cardWrapper.classList.add('is-visible');
  elements.balloonArea.classList.add('is-visible');

  if (repeatVisit) {
    // a new story while the box is already open: balloons bounce, confetti falls
    elements.balloonArea.classList.remove('celebrate');
    void elements.balloonArea.offsetWidth; // restart the animation
    elements.balloonArea.classList.add('celebrate');
    burstConfetti();
    setTimeout(() => elements.balloonArea.classList.remove('celebrate'), 2000);
  }

  state.hasOpened = true;
}

function closeGiftBox() {
  elements.box.classList.remove('open');
  elements.cardWrapper.classList.remove('is-visible');
  elements.balloonArea.classList.remove('is-visible', 'celebrate');
  state.hasOpened = false;
}

function openModal() {
  elements.modal.classList.remove('hidden');
  setTimeout(() => elements.storyInput.focus(), 30);
}

function closeModal() {
  elements.modal.classList.add('hidden');
}

function stopTimer() {
  if (state.countdownTimer) {
    clearInterval(state.countdownTimer);
    state.countdownTimer = null;
  }
}

function startCountdown(onDone) {
  const startedAt = Date.now();
  stopTimer();
  state.countdownTimer = setInterval(() => {
    const remaining = Math.ceil(RECORD_SECONDS - (Date.now() - startedAt) / 1000);
    if (remaining <= 0) {
      stopTimer();
      onDone();
      return;
    }
    setStatus(`나날이 귀 기울여 듣고 있어요 · ${remaining}초`);
  }, 200);
}

// ------------------------------------------------------------------ offline

function localAnalyze(text) {
  const normalized = text.toLowerCase();

  let occasion = null;
  for (const [key, patterns] of Object.entries(SPECIAL_DAY_PATTERNS)) {
    if (patterns.some((pattern) => normalized.includes(pattern.toLowerCase()))) {
      occasion = key;
      break;
    }
  }

  let hero = null;
  for (const pattern of HERO_PATTERNS) {
    if (normalized.includes(pattern.toLowerCase())) {
      hero = pattern;
      break;
    }
  }

  if (!occasion || !hero) {
    return {
      special_day: false,
      occasion: '',
      hero: '',
      card: '',
      bubble: '나날이 조금 시무룩해졌어요. 어떤 특별한 날인지, 누구를 위한 날인지 함께 들려주시면 더 예쁜 선물을 준비할게요.',
    };
  }

  const heroLabel = HERO_LABELS[hero] || hero;
  const occasionLabel = OCCASION_LABELS[occasion] || '특별한 날';

  return {
    special_day: true,
    occasion: occasionLabel,
    hero: heroLabel,
    card: `${heroLabel}의 ${occasionLabel}을 한아름 축하드려요.\n오늘의 웃음과 따뜻함이 도담도담 쌓여 오래 남을 추억이 되기를 바랍니다.\n나날이 이 하루를 소중히 간직해 둘게요.`,
    bubble: `${heroLabel}의 ${occasionLabel}이라니! 나날이 이 반짝이는 순간을 오래 간직할게요.`,
  };
}

// ------------------------------------------------------------------- server

async function probeServer() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    if (!response.ok) throw new Error('health check failed');
    const health = await response.json();
    api.configured = Boolean(health.configured);
  } catch {
    api.configured = false;
  }
  api.checked = true;
  return api.configured;
}

async function analyzeStory(text) {
  if (!api.checked) await probeServer();
  if (!api.configured) return localAnalyze(text);

  try {
    const response = await fetch('/api/story', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.message || `HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn('[nanal] falling back to local matching:', error.message);
    return localAnalyze(text);
  }
}

async function transcribe(blob) {
  const response = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'content-type': blob.type || 'audio/webm' },
    body: blob,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.message || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return String(data.text || '').trim();
}

// -------------------------------------------------------------------- story

async function handleStory(text) {
  const cleaned = String(text || '').trim();

  if (!cleaned) {
    setStatus('나날이 아직 이야기를 듣지 못했어요.');
    showBubble('조금 더 가까이서 듣고 싶어요. 특별한 날 이야기를 들려주시겠어요?');
    return;
  }

  state.busy = true;
  setStatus('나날이 추억을 정리하고 있어요…');

  try {
    const result = await analyzeStory(cleaned);

    if (!result.special_day) {
      closeGiftBox();
      setStatus('나날이 조금 아쉬워하고 있어요.');
      showBubble(result.bubble || '특별한 날 이야기를 들려주시면 더 예쁜 선물을 준비할게요.');
      return;
    }

    setCardText(result.card);
    openGiftBox();
    setStatus('나날이 기쁜 마음으로 선물을 열었어요.');
    showBubble(result.bubble);
  } finally {
    state.busy = false;
    elements.button.classList.remove('recording');
    state.isRecording = false;
  }
}

// ----------------------------------------------------------------- listening

async function recordWithMicrophone() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    openModal();
    setStatus('마이크를 사용할 수 없어 글로 받을게요.');
    showBubble('괜찮아요. 특별한 날 이야기를 글로 적어 주세요.');
    return;
  }

  const recorder = new MediaRecorder(stream);
  const chunks = [];

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });

  recorder.addEventListener('stop', async () => {
    stream.getTracks().forEach((track) => track.stop());
    stopTimer();
    state.isRecording = false;
    state.recorder = null;
    elements.button.classList.remove('recording');

    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    if (!blob.size) {
      setStatus('소리가 담기지 않았어요.');
      showBubble('한 번만 더 들려주시겠어요? 나날이 귀 기울이고 있어요.');
      return;
    }

    setStatus('나날이 이야기를 받아 적고 있어요…');
    try {
      const transcript = await transcribe(blob);
      if (!transcript) {
        setStatus('나날이 이야기를 알아듣지 못했어요.');
        showBubble('조금만 더 또렷하게 들려주시면 나날이 잘 받아 적을게요.');
        return;
      }
      await handleStory(transcript);
    } catch (error) {
      console.warn('[nanal] transcription failed:', error.message);
      openModal();
      setStatus('음성을 옮기지 못해 글로 받을게요.');
      showBubble('잠시 문제가 있었어요. 특별한 날 이야기를 글로 적어 주세요.');
    }
  });

  state.recorder = recorder;
  state.isRecording = true;
  elements.button.classList.add('recording');
  recorder.start();
  setStatus(`나날이 귀 기울여 듣고 있어요 · ${RECORD_SECONDS}초`);
  startCountdown(() => {
    if (recorder.state === 'recording') recorder.stop();
  });
}

function recordWithWebSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    openModal();
    setStatus('이야기를 글로 들려주세요.');
    showBubble('나날이 기다리고 있어요. 특별한 날 이야기를 적어 주세요.');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'ko-KR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    state.isRecording = true;
    elements.button.classList.add('recording');
    setStatus(`나날이 귀 기울여 듣고 있어요 · ${RECORD_SECONDS}초`);
    startCountdown(() => recognition.stop());
  };

  recognition.onresult = (event) => {
    handleStory(event.results[0][0].transcript);
  };

  recognition.onerror = () => {
    stopTimer();
    state.isRecording = false;
    elements.button.classList.remove('recording');
    setStatus('음성 인식에 잠시 문제가 있었어요.');
    showBubble('한 번만 더 들려주시겠어요? 나날이 한 마디도 놓치지 않고 들을게요.');
  };

  recognition.onend = () => {
    stopTimer();
    state.isRecording = false;
    elements.button.classList.remove('recording');
  };

  state.recognition = recognition;
  recognition.start();
}

async function startListening() {
  if (state.isRecording || state.busy) return;

  if (!api.checked) await probeServer();

  const canRecord = Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';
  if (api.configured && canRecord) {
    await recordWithMicrophone();
  } else {
    recordWithWebSpeech();
  }
}

function stopRecording() {
  if (state.recorder && state.recorder.state === 'recording') {
    state.recorder.stop();
    return;
  }
  if (state.recognition) {
    state.recognition.stop();
    state.recognition = null;
  }
  stopTimer();
  state.isRecording = false;
  elements.button.classList.remove('recording');
}

function submitStoryFromInput() {
  const value = elements.storyInput.value.trim();
  if (!value) {
    showBubble('몇 마디만 적어 주시면 나날이 귀 기울여 들을게요.');
    return;
  }
  closeModal();
  elements.storyInput.value = '';
  handleStory(value);
}

// -------------------------------------------------------------------- events

elements.button.addEventListener('click', () => {
  if (state.isRecording) {
    stopRecording();
    return;
  }
  startListening();
});

elements.demoButton.addEventListener('click', () => {
  elements.storyInput.value = '오늘은 엄마 생일이에요. 늘 우리를 위해 애써 주셨는데, 이번 날만큼은 정말 특별하게 만들어 드리고 싶어요.';
  openModal();
});

elements.submitStory.addEventListener('click', submitStoryFromInput);
elements.closeModal.addEventListener('click', closeModal);

elements.storyInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    submitStoryFromInput();
  }
});

// --------------------------------------------------------------------- start

closeGiftBox();
showBubble('나날이 기다리고 있어요. 오늘의 가장 소중한 이야기를 들려주세요.');

probeServer().then((configured) => {
  setStatus(
    configured
      ? '나날이 이야기를 들을 준비가 되었어요.'
      : '나날이 기다리고 있어요. (오프라인 모드 — 서버가 꺼져 있어요)'
  );
});
