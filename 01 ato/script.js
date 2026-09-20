const SPECIAL_DAY_PATTERNS = {
  birthday: ["birthday", "birth day", "생일", "생신", "탄생일", "버스데이"],
  wedding: ["wedding", "marriage", "결혼식", "웨딩", "예식", "결혼"],
  graduation: ["graduation", "졸업", "졸업식", "학위"],
  first_birthday: ["first birthday", "first birthday party", "돌잔치", "첫돌", "돌파티"],
  proposal: ["proposal", "engagement", "프로포즈", "청혼", "반지"],
  anniversary: ["anniversary", "our anniversary", "기념일", "우리의 날", "연애 기념일", "결혼 기념일"],
  year_end: ["christmas", "new year", "holiday", "연말", "크리스마스", "새해", "파티"],
};

const HERO_PATTERNS = [
  "mom",
  "mother",
  "dad",
  "father",
  "boyfriend",
  "girlfriend",
  "partner",
  "sister",
  "brother",
  "family",
  "wife",
  "husband",
  "friend",
  "friends",
  "loved one",
  "our child",
  "daughter",
  "son",
  "amazing person",
  "엄마",
  "아빠",
  "어머니",
  "아버지",
  "남자친구",
  "여자친구",
  "애인",
  "동생",
  "언니",
  "오빠",
  "누나",
  "가족",
  "아내",
  "남편",
  "친구",
  "친구들",
  "사랑하는 사람",
  "우리 아이",
  "딸",
  "아들",
  "멋진 사람",
];

const state = {
  isRecording: false,
  recognition: null,
  recognitionTimer: null,
  countdownTimer: null,
  startedAt: 0,
  maxSeconds: 8,
  hasOpened: false,
};

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
};

function showBubble(text) {
  elements.bubbleText.textContent = text;
  elements.bubble.classList.add('is-visible');
  clearTimeout(showBubble.timeoutId);
  showBubble.timeoutId = setTimeout(() => {
    elements.bubble.classList.remove('is-visible');
  }, 3200);
}

function setCardText(text) {
  elements.cardMessage.innerHTML = text.replace(/\n/g, '<br />');
}

function openGiftBox() {
  elements.box.classList.add('open');
  elements.cardWrapper.classList.add('is-visible');
  elements.balloonArea.classList.add('is-visible');
  state.hasOpened = true;
}

function closeGiftBox() {
  elements.box.classList.remove('open');
  elements.cardWrapper.classList.remove('is-visible');
  elements.balloonArea.classList.remove('is-visible');
  state.hasOpened = false;
}

function setStatus(msg) {
  elements.status.textContent = msg;
}

function stopTimer() {
  if (state.countdownTimer) {
    clearInterval(state.countdownTimer);
    state.countdownTimer = null;
  }
}

function updateCountdown() {
  const elapsed = (Date.now() - state.startedAt) / 1000;
  const remaining = Math.max(0, state.maxSeconds - elapsed);

  if (remaining <= 0) {
    stopRecording();
  }
}

function openModal() {
  elements.modal.classList.remove('hidden');
  setTimeout(() => elements.storyInput.focus(), 30);
}

function closeModal() {
  elements.modal.classList.add('hidden');
}

function getOccurrence(text) {
  const normalized = text.toLowerCase();

  for (const [occasion, patterns] of Object.entries(SPECIAL_DAY_PATTERNS)) {
    if (patterns.some((pattern) => normalized.includes(pattern.toLowerCase()))) {
      return occasion;
    }
  }

  return null;
}

function getHero(text) {
  const normalized = text.toLowerCase();

  for (const pattern of HERO_PATTERNS) {
    if (normalized.includes(pattern.toLowerCase())) {
      return pattern;
    }
  }

  return null;
}

function buildCard(occasion, hero) {
  const templates = {
    birthday: [
      `${hero}, today is a shining day for you. ATO wants to hold onto this beautiful moment and keep it warm in memory.`,
      `${hero}’s birthday is a special celebration, and ATO has prepared a small gift of joy to keep this smile alive for a long time.`,
    ],
    wedding: [
      `${hero}, today’s wedding is a day full of radiant memories. ATO has prepared a little note to keep that love and happiness close.`,
      `This ${occasion} is a moment when love grows even deeper. ATO hopes the warmth of today stays with you always.`,
    ],
    graduation: [
      `${hero}, today is a moment of hard work and joy shining brightly. ATO is honoring that effort and pride with a small, heartfelt message.`,
      `Congratulations on this ${occasion}. ATO hopes this beautiful chapter becomes the beginning of even brighter days ahead.`,
    ],
    first_birthday: [
      `${hero}, the first steps and laughter of today are incredibly precious. ATO has kept every bit of that joy in a warm little memory.`,
      `This ${occasion} is full of tiny miracles and bright smiles. ATO hopes these happy moments stay with you forever.`,
    ],
    proposal: [
      `${hero}, this moment is unforgettable and deeply special. ATO has wrapped your excitement and love into a meaningful memory.`,
      `Today’s promise is a beautiful beginning, and ATO is keeping that fluttering joy close.`,
    ],
    anniversary: [
      `${hero}, this ${occasion} reminds us how much love and time can shape a life together. ATO is holding that warmth in a little keepsake.`,
      `The time you’ve shared is truly precious. ATO hopes many more beautiful memories continue to bloom between you.`,
    ],
    year_end: [
      `${hero}, may this ending of the year be wrapped in warmth and beauty. ATO wants to keep this moment as a memory worth holding forever.`,
      `This season is full of togetherness and light. ATO hopes every memory shared with you shines even brighter.`,
    ],
  };

  const pool = templates[occasion] || [
    `${hero}, ATO has prepared a heartfelt gift for this special moment, hoping it becomes a warm memory that lasts a lifetime.`,
  ];

  return pool[Math.floor(Math.random() * pool.length)];
}

function buildBubble(occasion, hero) {
  const messages = {
    birthday: `${hero}'s ${occasion}! ATO will keep this sparkling moment close forever.`,
    wedding: `${hero}'s ${occasion} is a day when love grows even brighter. ATO will hold that warmth with you.`,
    graduation: `Congratulations on ${hero}'s ${occasion}. ATO hopes this proud moment shines for a long time.`,
    first_birthday: `${hero}'s ${occasion} is filled with giggles and wonder. ATO will keep that joyful smile for as long as possible.`,
    proposal: `A beautiful moment has arrived for ${hero}. ATO is carefully keeping the excitement of today.`,
    anniversary: `Celebrating ${hero}'s ${occasion} together. ATO wants this love-filled day to stay warm in your memory.`,
    year_end: `${hero}'s year-end memory will stay gentle and beautiful in ATO’s hands.`,
  };

  return messages[occasion] || `${hero}'s special day is being prepared with care. ATO will keep it as a lovely memory.`;
}

function handleStory(text) {
  const cleaned = text.trim();

  if (!cleaned) {
    setStatus('ATO did not catch the story yet.');
    showBubble('ATO wants to listen more closely. Please share a story about a special day.');
    return;
  }

  const occasion = getOccurrence(cleaned);
  const hero = getHero(cleaned);

  if (!occasion || !hero) {
    closeGiftBox();
    setStatus('ATO is a little disappointed.');
    showBubble('If you tell us about a special day, ATO will prepare something even more beautiful. Try mentioning a moment like a birthday, wedding, graduation, or celebration.');
    return;
  }

  const heroLabel = hero === 'family' || hero === '가족' ? 'dear family' : hero;
  const cardText = buildCard(occasion, heroLabel);
  const bubbleText = buildBubble(occasion, heroLabel);

  setCardText(cardText);
  openGiftBox();
  setStatus('ATO is opening the gift with joy.');
  showBubble(bubbleText);
  elements.button.classList.remove('recording');
  state.isRecording = false;
}

function startListening() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    openModal();
    setStatus('Please share your story in text instead of microphone.');
    showBubble('ATO is ready to listen. Write down your special-day story.');
    return;
  }

  if (state.isRecording) {
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    state.isRecording = true;
    state.startedAt = Date.now();
    elements.button.classList.add('recording');
    setStatus('ATO is listening to your story.');
    stopTimer();
    state.countdownTimer = setInterval(() => {
      const elapsed = (Date.now() - state.startedAt) / 1000;
      const remaining = Math.max(0, state.maxSeconds - elapsed);
      if (remaining <= 0) {
        recognition.stop();
      }
    }, 150);
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    handleStory(transcript);
  };

  recognition.onerror = () => {
    state.isRecording = false;
    elements.button.classList.remove('recording');
    setStatus('There was a brief issue with voice recognition.');
    showBubble('Please say it again. ATO is listening carefully to every word.');
  };

  recognition.onend = () => {
    state.isRecording = false;
    elements.button.classList.remove('recording');
    stopTimer();
    setStatus('ATO is organizing the memory.');
  };

  state.recognition = recognition;
  recognition.start();
}

function stopRecording() {
  if (state.recognition) {
    state.recognition.stop();
    state.recognition = null;
  }
  stopTimer();
  state.isRecording = false;
  elements.button.classList.remove('recording');
  setStatus('ATO heard your story clearly.');
}

function submitStoryFromInput() {
  const value = elements.storyInput.value.trim();
  if (!value) {
    showBubble('Please write a few words so ATO can listen properly.');
    return;
  }

  handleStory(value);
  closeModal();
  elements.storyInput.value = '';
}

document.getElementById('storyButton').addEventListener('click', () => {
  if (state.isRecording) {
    stopRecording();
    return;
  }

  startListening();
});

document.getElementById('demoBtn').addEventListener('click', () => {
  elements.storyInput.value = 'Today is my mom’s birthday. She has always worked so hard for us, and I want to make this day really special for her.';
  openModal();
});

elements.submitStory.addEventListener('click', submitStoryFromInput);
elements.closeModal.addEventListener('click', closeModal);

elements.storyInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    submitStoryFromInput();
  }
});

closeGiftBox();
showBubble('ATO is waiting. Share the most precious story of today.');
