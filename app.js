const SUITS = [
  { id: "spades", symbol: "♠", foundation: "♠", color: "black", label: "пики" },
  { id: "hearts", symbol: "♥", foundation: "♥", color: "red", label: "черви" },
  { id: "clubs", symbol: "♣", foundation: "♣", color: "black", label: "трефы" },
  { id: "diamonds", symbol: "♦", foundation: "♦", color: "red", label: "бубны" },
];

const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RESULTS_KEY = "codex-solitaire-results";
const DEAL_KEY = "codex-solitaire-deal";
const TABLEAU_COUNT = 7;

const dom = {
  stage: document.querySelector("#stageValue"),
  score: document.querySelector("#scoreValue"),
  moves: document.querySelector("#movesValue"),
  time: document.querySelector("#timeValue"),
  foundations: document.querySelector("#foundations"),
  stockSlot: document.querySelector("#stockSlot"),
  wasteSlot: document.querySelector("#wasteSlot"),
  tableau: document.querySelector("#tableau"),
  felt: document.querySelector("#felt"),
  pauseScreen: document.querySelector("#pauseScreen"),
  newGameButton: document.querySelector("#newGameButton"),
  pauseButton: document.querySelector("#pauseButton"),
  pauseIcon: document.querySelector("#pauseIcon"),
  pauseText: document.querySelector("#pauseText"),
  undoButton: document.querySelector("#undoButton"),
  autoCollectButton: document.querySelector("#autoCollectButton"),
  hintButton: document.querySelector("#hintButton"),
  historyList: document.querySelector("#historyList"),
  toast: document.querySelector("#toast"),
  winDialog: document.querySelector("#winDialog"),
  lossDialog: document.querySelector("#lossDialog"),
  winTime: document.querySelector("#winTime"),
  winMoves: document.querySelector("#winMoves"),
  dialogNewGame: document.querySelector("#dialogNewGame"),
  lossNewGame: document.querySelector("#lossNewGame"),
};

let state = null;
let undoStack = [];
let selectedSource = null;
let dragSource = null;
let hintMarks = null;
let toastTimer = 0;
let hintTimer = 0;
let autoCollecting = false;
let audioContext = null;
let keyboardFocusTarget = null;
let keyboardHoverTarget = null;
let lastBoardPointer = null;

function buildDeck() {
  return SUITS.flatMap((suit) =>
    Array.from({ length: 13 }, (_, index) => ({
      id: `${suit.id}-${index + 1}`,
      suit: suit.id,
      rank: index + 1,
      color: suit.color,
      faceUp: false,
    })),
  );
}

function shuffle(cards) {
  const deck = cards.slice();
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

function createInitialState() {
  const deck = shuffle(buildDeck());
  const tableau = Array.from({ length: TABLEAU_COUNT }, () => []);

  for (let column = 0; column < TABLEAU_COUNT; column += 1) {
    for (let depth = 0; depth <= column; depth += 1) {
      const card = deck.pop();
      card.faceUp = depth === column;
      tableau[column].push(card);
    }
  }

  return {
    stage: nextDealNumber(),
    score: 0,
    moves: 0,
    elapsed: 0,
    paused: false,
    won: false,
    lost: false,
    resultSaved: false,
    stock: deck,
    waste: [],
    foundations: {
      spades: [],
      hearts: [],
      clubs: [],
      diamonds: [],
    },
    tableau,
  };
}

function nextDealNumber() {
  const next = Number(localStorage.getItem(DEAL_KEY) || "0") + 1;
  localStorage.setItem(DEAL_KEY, String(next));
  return next;
}

function cloneState() {
  return JSON.parse(JSON.stringify(state));
}

function startNewGame() {
  state = createInitialState();
  undoStack = [];
  selectedSource = null;
  dragSource = null;
  hintMarks = null;
  clearHintTimer();
  closeWinDialog();
  closeLossDialog();
  render();
  checkNoMoves();
  render();
  showToast("Новая раздача");
}

function getSuit(id) {
  return SUITS.find((suit) => suit.id === id);
}

function getRank(card) {
  return RANKS[card.rank];
}

function formatCard(card) {
  const suit = getSuit(card.suit);
  return `${getRank(card)} ${suit.symbol}`;
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function render() {
  renderStats();
  renderFoundations();
  renderStock();
  renderWaste();
  renderTableau();
  renderHistory();
  renderControls();
  restoreKeyboardFocus();
}

function renderStats() {
  dom.stage.textContent = state.stage;
  dom.score.textContent = state.score;
  dom.moves.textContent = state.moves;
  dom.time.textContent = formatTime(state.elapsed);
}

function renderControls() {
  const autoReady = canAutoCollect();
  dom.newGameButton.disabled = autoCollecting;
  dom.undoButton.disabled = undoStack.length === 0 || state.paused || state.lost || autoCollecting;
  dom.hintButton.disabled = state.paused || state.won || state.lost || autoCollecting;
  dom.autoCollectButton.hidden = !autoReady && !autoCollecting;
  dom.autoCollectButton.disabled = state.paused || state.won || state.lost || autoCollecting || !autoReady;
  dom.pauseButton.disabled = state.won || state.lost || autoCollecting;
  dom.pauseIcon.textContent = state.paused ? "▶" : "Ⅱ";
  dom.pauseText.textContent = state.paused ? "Играть" : "Пауза";
  dom.pauseScreen.hidden = !state.paused;
}

function renderFoundations() {
  dom.foundations.replaceChildren();
  SUITS.forEach((suit) => {
    const pile = state.foundations[suit.id];
    const slot = document.createElement("div");
    slot.className = "slot foundation-slot";
    slot.dataset.zone = "foundation";
    slot.dataset.foundationSuit = suit.id;
    slot.tabIndex = 0;
    slot.setAttribute("role", "button");
    slot.setAttribute("aria-label", `Дом ${suit.label}`);

    if (isTargetHint({ zone: "foundation", suit: suit.id })) {
      slot.classList.add("hint-target");
    }

    if (pile.length) {
      if (pile.length > 1) {
        slot.append(
          createCard(pile[pile.length - 2], {
            zone: "foundation-preview",
            suit: suit.id,
            preview: true,
            extraClass: "foundation-under",
          }),
        );
      }
      slot.append(createCard(pile[pile.length - 1], { zone: "foundation", suit: suit.id }));
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "foundation-empty";
      placeholder.textContent = "A";
      placeholder.setAttribute("aria-hidden", "true");
      slot.append(placeholder);
    }

    dom.foundations.append(slot);
  });
}

function renderStock() {
  dom.stockSlot.replaceChildren();
  const stockHint = isTargetHint({ zone: "stock" }) || isSourceHint({ zone: "stock" });
  dom.stockSlot.classList.toggle("hint-target", isTargetHint({ zone: "stock" }));
  dom.stockSlot.classList.toggle("deck-hint", stockHint);
  dom.stockSlot.setAttribute(
    "aria-label",
    state.stock.length ? `Колода, карт: ${state.stock.length}` : "Пустая колода, вернуть сброс",
  );

  if (state.stock.length) {
    const topCard = state.stock[state.stock.length - 1];
    const back = document.createElement("div");
    back.className = "card face-down stock-card";
    back.dataset.zone = "stock";
    back.dataset.cardId = topCard.id;
    back.tabIndex = 0;
    back.setAttribute("role", "button");
    back.setAttribute("aria-label", `Колода, карт: ${state.stock.length}`);
    if (stockHint) {
      back.classList.add("hint-source", "deck-hint");
    }
    dom.stockSlot.append(back);
  }
}

function renderWaste() {
  dom.wasteSlot.replaceChildren();
  dom.wasteSlot.classList.toggle("hint-target", isTargetHint({ zone: "waste" }));

  if (state.waste.length) {
    const topCard = state.waste[state.waste.length - 1];
    const visibleCards = state.waste.slice(-3);
    visibleCards.forEach((card, index) => {
      const isTopCard = index === visibleCards.length - 1;
      const cardElement = createCard(card, {
        zone: isTopCard ? "waste" : "waste-preview",
        preview: !isTopCard,
        extraClass: isTopCard ? "" : "waste-preview",
      });
      cardElement.style.setProperty("--waste-x", `calc(var(--waste-offset) * ${index})`);
      cardElement.style.zIndex = String(10 + index);
      dom.wasteSlot.append(cardElement);
    });
    dom.wasteSlot.setAttribute("aria-label", `Сброс, сверху ${formatCard(topCard)}`);
  } else {
    dom.wasteSlot.setAttribute("aria-label", "Пустой сброс");
  }
}

function renderTableau() {
  dom.tableau.replaceChildren();
  const metrics = getCardMetrics();
  state.tableau.forEach((pile, pileIndex) => {
    const pileElement = document.createElement("div");
    pileElement.className = "tableau-pile";
    pileElement.dataset.zone = "tableau";
    pileElement.dataset.tableauPile = String(pileIndex);
    pileElement.tabIndex = 0;
    pileElement.setAttribute("role", "button");
    pileElement.setAttribute("aria-label", `Столбец ${pileIndex + 1}`);

    if (isTargetHint({ zone: "tableau", pile: pileIndex })) {
      pileElement.classList.add("hint-target");
    }

    let offset = 0;
    pile.forEach((card, cardIndex) => {
      const cardElement = createCard(card, {
        zone: "tableau",
        pile: pileIndex,
        index: cardIndex,
      });
      cardElement.style.setProperty("--y", `${offset}px`);
      pileElement.append(cardElement);
      offset += card.faceUp ? metrics.openGap : metrics.closedGap;
    });

    const minHeight = metrics.height;
    pileElement.style.minHeight = `${Math.max(minHeight + 16, offset + minHeight)}px`;
    dom.tableau.append(pileElement);
  });
}

function getCardMetrics() {
  const width = dom.stockSlot.getBoundingClientRect().width || 74;
  return {
    height: width * 1.4,
    openGap: Math.min(Math.max(width * 0.4, 22), 34),
    closedGap: Math.min(Math.max(width * 0.24, 13), 20),
  };
}

function renderHistory() {
  const results = loadResults();
  dom.historyList.replaceChildren();

  if (!results.length) {
    const empty = document.createElement("li");
    empty.className = "empty-history";
    empty.textContent = "Побед пока нет";
    dom.historyList.append(empty);
    return;
  }

  results.forEach((result) => {
    const item = document.createElement("li");
    const time = document.createElement("strong");
    const meta = document.createElement("small");
    time.textContent = result.time;
    meta.textContent = `${result.moves} ходов · ${result.date}`;
    item.append(time, meta);
    dom.historyList.append(item);
  });
}

function createCard(card, source) {
  const cardElement = document.createElement("div");
  cardElement.className = `card ${card.faceUp ? `face-up ${card.color}` : "face-down"}`;
  if (source.preview) {
    cardElement.classList.add("card-preview");
  }
  if (source.extraClass) {
    cardElement.classList.add(...source.extraClass.split(" ").filter(Boolean));
  }
  cardElement.dataset.zone = source.zone;
  cardElement.dataset.cardId = card.id;
  cardElement.tabIndex = source.preview ? -1 : 0;
  if (source.preview) {
    cardElement.setAttribute("aria-hidden", "true");
  } else {
    cardElement.setAttribute("role", "button");
    cardElement.setAttribute("aria-label", card.faceUp ? formatCard(card) : "Закрытая карта");
  }

  if (source.pile !== undefined) {
    cardElement.dataset.pile = String(source.pile);
  }
  if (source.index !== undefined) {
    cardElement.dataset.index = String(source.index);
  }
  if (source.suit !== undefined) {
    cardElement.dataset.suit = source.suit;
  }

  if (!source.preview && card.faceUp && canSourceDrag(source)) {
    cardElement.draggable = true;
  }

  if (!source.preview && isSameSource(selectedSource, source)) {
    cardElement.classList.add("selected");
  }
  if (!source.preview && isSourceHint(source)) {
    cardElement.classList.add("hint-source");
  }

  if (card.faceUp) {
    const top = document.createElement("span");
    top.className = "card-corner";
    top.innerHTML = `<span>${getRank(card)}</span><span>${getSuit(card.suit).symbol}</span>`;

    const center = document.createElement("span");
    center.className = "card-center";
    center.textContent = getSuit(card.suit).symbol;

    const bottom = document.createElement("span");
    bottom.className = "card-corner bottom";
    bottom.innerHTML = `<span>${getRank(card)}</span><span>${getSuit(card.suit).symbol}</span>`;

    cardElement.append(top, center, bottom);
  }

  return cardElement;
}

function captureCardRects() {
  const rects = new Map();
  document.querySelectorAll(".card[data-card-id]").forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    rects.set(element.dataset.cardId, {
      left: rect.left,
      top: rect.top,
      faceUp: element.classList.contains("face-up"),
    });
  });
  return rects;
}

function animateCardChanges(beforeRects) {
  if (!beforeRects?.size || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  let movedCount = 0;
  document.querySelectorAll(".card[data-card-id]").forEach((element) => {
    const before = beforeRects.get(element.dataset.cardId);
    if (!before) {
      return;
    }

    const after = element.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    const distance = Math.hypot(dx, dy);
    const wasRevealed = !before.faceUp && element.classList.contains("face-up");

    if (distance > 2) {
      const originalZIndex = element.style.zIndex;
      const baseTransform = getComputedStyle(element).transform;
      const finalTransform = baseTransform === "none" ? "translate(0, 0)" : baseTransform;
      const startTransform =
        baseTransform === "none"
          ? `translate(${dx}px, ${dy}px)`
          : `translate(${dx}px, ${dy}px) ${baseTransform}`;

      element.classList.add("is-moving");
      element.style.zIndex = String(80 + movedCount);

      const animation = element.animate(
        [
          { transform: startTransform, filter: "brightness(1.08)" },
          { transform: finalTransform, filter: "brightness(1)" },
        ],
        {
          delay: Math.min(movedCount * 18, 90),
          duration: Math.min(Math.max(distance * 0.52, 190), 460),
          easing: "cubic-bezier(0.2, 0.82, 0.22, 1)",
          fill: "both",
        },
      );

      animation.addEventListener("finish", () => {
        element.classList.remove("is-moving");
        element.style.zIndex = originalZIndex;
      });
      movedCount += 1;
    } else if (wasRevealed) {
      element.classList.add("card-revealed");
      window.setTimeout(() => element.classList.remove("card-revealed"), 360);
    }
  });
}

function animateHintMove(hint) {
  if (!hint || hint.source.zone === "stock" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const sourceElement = getHintSourceElement(hint.source);
  const targetRect = getHintTargetRect(hint.target);
  if (!sourceElement || !targetRect) {
    return;
  }

  const sourceRect = sourceElement.getBoundingClientRect();
  const ghost = sourceElement.cloneNode(true);
  ghost.classList.remove("selected", "hint-source", "dragging", "is-moving");
  ghost.classList.add("hint-ghost");
  ghost.setAttribute("aria-hidden", "true");
  ghost.tabIndex = -1;
  ghost.style.left = `${sourceRect.left}px`;
  ghost.style.top = `${sourceRect.top}px`;
  ghost.style.width = `${sourceRect.width}px`;
  ghost.style.height = `${sourceRect.height}px`;
  ghost.style.setProperty("--y", "0px");
  ghost.style.setProperty("--waste-x", "0px");
  document.body.append(ghost);

  const dx = targetRect.left - sourceRect.left;
  const dy = targetRect.top - sourceRect.top;
  const lift = Math.max(-36, -Math.abs(dx) * 0.04);
  const animation = ghost.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 0.96, offset: 0 },
      { transform: `translate(${dx * 0.48}px, ${dy * 0.48 + lift}px) scale(1.08)`, opacity: 0.9, offset: 0.56 },
      { transform: `translate(${dx}px, ${dy}px) scale(1)`, opacity: 0.12, offset: 1 },
    ],
    {
      duration: 900,
      easing: "cubic-bezier(0.18, 0.86, 0.22, 1)",
      fill: "both",
    },
  );

  animation.addEventListener("finish", () => ghost.remove());
  window.setTimeout(() => ghost.remove(), 1100);
}

function getHintSourceElement(source) {
  if (!source) {
    return null;
  }

  if (source.zone === "waste") {
    return document.querySelector('.waste-slot .card[data-zone="waste"]');
  }

  if (source.zone === "tableau") {
    return document.querySelector(
      `.card[data-zone="tableau"][data-pile="${source.pile}"][data-index="${source.index}"]`,
    );
  }

  if (source.zone === "foundation") {
    return document.querySelector(`.card[data-zone="foundation"][data-suit="${source.suit}"]`);
  }

  return null;
}

function getHintTargetRect(target) {
  if (!target) {
    return null;
  }

  if (target.zone === "foundation") {
    return document.querySelector(`.foundation-slot[data-foundation-suit="${target.suit}"]`)?.getBoundingClientRect();
  }

  if (target.zone === "tableau") {
    const pileElement = document.querySelector(`.tableau-pile[data-tableau-pile="${target.pile}"]`);
    if (!pileElement) {
      return null;
    }

    const topCard = pileElement.querySelector(".card:last-child");
    const pileRect = pileElement.getBoundingClientRect();
    if (!topCard) {
      return pileRect;
    }

    const topRect = topCard.getBoundingClientRect();
    const metrics = getCardMetrics();
    return {
      left: topRect.left,
      top: topRect.top + metrics.openGap,
      width: topRect.width,
      height: topRect.height,
      right: topRect.right,
      bottom: topRect.top + metrics.openGap + topRect.height,
    };
  }

  if (target.zone === "stock") {
    return dom.stockSlot.getBoundingClientRect();
  }

  return null;
}

function ensureAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContextClass();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

function playCardSound(type = "move") {
  const context = ensureAudioContext();
  if (!context) {
    return;
  }

  const settings = {
    move: { duration: 0.075, gain: 0.055, frequency: 950 },
    draw: { duration: 0.09, gain: 0.06, frequency: 780 },
    foundation: { duration: 0.11, gain: 0.05, frequency: 1240 },
    undo: { duration: 0.08, gain: 0.05, frequency: 620 },
    hint: { duration: 0.045, gain: 0.025, frequency: 1450 },
  }[type] || { duration: 0.075, gain: 0.05, frequency: 900 };

  const sampleRate = context.sampleRate;
  const frameCount = Math.max(1, Math.floor(sampleRate * settings.duration));
  const buffer = context.createBuffer(1, frameCount, sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < frameCount; index += 1) {
    const decay = 1 - index / frameCount;
    data[index] = (Math.random() * 2 - 1) * decay * decay;
  }

  const noise = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  noise.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = settings.frequency;
  filter.Q.value = 3.2;
  gain.gain.setValueAtTime(settings.gain, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + settings.duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  noise.start();
}

function loadResults() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveResult() {
  if (state.resultSaved) {
    return;
  }

  const results = loadResults();
  results.unshift({
    seconds: state.elapsed,
    time: formatTime(state.elapsed),
    moves: state.moves,
    date: new Date().toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }),
  });
  localStorage.setItem(RESULTS_KEY, JSON.stringify(results.slice(0, 5)));
  state.resultSaved = true;
}

function canPlaceOnFoundation(card) {
  const pile = state.foundations[card.suit];
  if (!pile.length) {
    return card.rank === 1;
  }
  return pile[pile.length - 1].rank + 1 === card.rank;
}

function isSafeFoundationHint(card, revealsClosedCard = false) {
  if (revealsClosedCard || card.rank <= 2) {
    return true;
  }

  return SUITS.filter((suit) => suit.color !== card.color).every((suit) => {
    const pile = state.foundations[suit.id];
    return pile.length && pile[pile.length - 1].rank >= card.rank - 1;
  });
}

function canPlaceOnTableau(card, targetPile) {
  if (!targetPile.length) {
    return card.rank === 13;
  }

  const topCard = targetPile[targetPile.length - 1];
  return topCard.faceUp && topCard.color !== card.color && topCard.rank === card.rank + 1;
}

function canPlaceOnAnyTableau(card, excludedPile = null) {
  return state.tableau.some((pile, pileIndex) => {
    if (pileIndex === excludedPile) {
      return false;
    }
    return canPlaceOnTableau(card, pile);
  });
}

function getMovableCards(source) {
  if (!source || !source.zone) {
    return [];
  }

  if (source.zone === "tableau") {
    const pile = state.tableau[source.pile] || [];
    const index = Number(source.index);
    const card = pile[index];
    return card?.faceUp ? pile.slice(index) : [];
  }

  if (source.zone === "waste") {
    return state.waste.length ? [state.waste[state.waste.length - 1]] : [];
  }

  if (source.zone === "foundation") {
    const pile = state.foundations[source.suit] || [];
    return pile.length ? [pile[pile.length - 1]] : [];
  }

  return [];
}

function canSourceDrag(source) {
  if (!source || state?.paused || state?.won || state?.lost || autoCollecting) {
    return false;
  }
  return getMovableCards(source).length > 0;
}

function sourceFromElement(element) {
  if (!element) {
    return null;
  }

  const { zone, pile, index, suit } = element.dataset;
  if (!zone) {
    return null;
  }

  return {
    zone,
    pile: pile === undefined ? undefined : Number(pile),
    index: index === undefined ? undefined : Number(index),
    suit,
  };
}

function rememberKeyboardFocus(element) {
  const target = getKeyboardTargetFromElement(element);
  if (target) {
    keyboardFocusTarget = target;
  }
}

function rememberKeyboardHover(element) {
  keyboardHoverTarget = getKeyboardTargetFromElement(element);
}

function getKeyboardTargetFromElement(element) {
  const card = element?.closest?.(".card");
  const slot = element?.closest?.(".slot, .tableau-pile");
  const target = card || slot;

  if (!target?.dataset.zone || !dom.felt.contains(target)) {
    return null;
  }

  const { zone, pile, index, suit, foundationSuit, tableauPile } = target.dataset;

  if (zone === "tableau") {
    return {
      zone,
      pile: Number(pile ?? tableauPile),
      index: index === undefined ? undefined : Number(index),
    };
  }

  if (zone === "foundation") {
    return {
      zone,
      suit: suit ?? foundationSuit,
    };
  }

  return { zone };
}

function restoreKeyboardFocus() {
  if (!keyboardFocusTarget || state.lost) {
    return;
  }

  window.requestAnimationFrame(() => {
    const target = getKeyboardFocusElement(keyboardFocusTarget);
    if (target && document.contains(target)) {
      target.focus({ preventScroll: true });
    }
  });
}

function getKeyboardFocusElement(target) {
  if (!target) {
    return null;
  }

  if (target.zone === "stock") {
    return document.querySelector('.stock-slot .card[data-zone="stock"]') || dom.stockSlot;
  }

  if (target.zone === "waste") {
    return document.querySelector('.waste-slot .card[data-zone="waste"]') || dom.wasteSlot;
  }

  if (target.zone === "foundation") {
    return (
      document.querySelector(`.foundation-slot[data-foundation-suit="${target.suit}"] .card[data-zone="foundation"]`) ||
      document.querySelector(`.foundation-slot[data-foundation-suit="${target.suit}"]`)
    );
  }

  if (target.zone === "tableau") {
    const pile = document.querySelector(`.tableau-pile[data-tableau-pile="${target.pile}"]`);
    if (target.index !== undefined) {
      return (
        pile?.querySelector(`.card[data-zone="tableau"][data-pile="${target.pile}"][data-index="${target.index}"]`) ||
        pile?.querySelector(".card.face-up:last-of-type") ||
        pile
      );
    }
    return pile?.querySelector(".card.face-up:last-of-type") || pile;
  }

  return null;
}

function removeFromSource(source) {
  if (source.zone === "tableau") {
    return state.tableau[source.pile].splice(source.index);
  }

  if (source.zone === "waste") {
    return [state.waste.pop()];
  }

  if (source.zone === "foundation") {
    return [state.foundations[source.suit].pop()];
  }

  return [];
}

function revealTableauTop(source) {
  if (source.zone !== "tableau") {
    return;
  }

  const sourcePile = state.tableau[source.pile];
  const topCard = sourcePile[sourcePile.length - 1];
  if (topCard && !topCard.faceUp) {
    topCard.faceUp = true;
    state.score += 5;
  }
}

function moveSourceToTableau(source, targetPileIndex) {
  const movingCards = getMovableCards(source);
  const targetPile = state.tableau[targetPileIndex];

  if (!movingCards.length || !targetPile || (source.zone === "tableau" && source.pile === targetPileIndex)) {
    return false;
  }

  if (!canPlaceOnTableau(movingCards[0], targetPile)) {
    return false;
  }

  const cards = removeFromSource(source);
  targetPile.push(...cards);
  revealTableauTop(source);
  return true;
}

function moveSourceToFoundation(source) {
  const movingCards = getMovableCards(source);
  if (movingCards.length !== 1 || !canPlaceOnFoundation(movingCards[0])) {
    return false;
  }

  const [card] = removeFromSource(source);
  state.foundations[card.suit].push(card);
  state.score += 10;
  revealTableauTop(source);
  return true;
}

function performMove(mutator, options = {}) {
  if (state.paused || state.won || state.lost || autoCollecting) {
    return false;
  }

  const beforeRects = captureCardRects();
  const snapshot = cloneState();
  const moved = mutator();
  if (!moved) {
    return false;
  }

  undoStack.push(snapshot);
  state.moves += options.moves ?? 1;
  selectedSource = null;
  hintMarks = null;
  clearHintTimer();

  if (!checkWin()) {
    checkNoMoves();
  }
  render();
  animateCardChanges(beforeRects);
  playCardSound(options.sound || "move");
  return true;
}

function drawFromStock() {
  return performMove(() => {
    if (state.stock.length) {
      const card = state.stock.pop();
      card.faceUp = true;
      state.waste.push(card);
      return true;
    }

    if (state.waste.length) {
      state.stock = state.waste
        .reverse()
        .map((card) => ({ ...card, faceUp: false }));
      state.waste = [];
      state.score = Math.max(0, state.score - 20);
      return true;
    }

    return false;
  }, { sound: "draw" });
}

function undo() {
  if (!undoStack.length || state.paused || autoCollecting) {
    return;
  }

  const beforeRects = captureCardRects();
  const elapsed = state.elapsed;
  state = undoStack.pop();
  state.elapsed = elapsed;
  state.paused = false;
  state.won = false;
  state.lost = false;
  selectedSource = null;
  hintMarks = null;
  clearHintTimer();
  closeWinDialog();
  closeLossDialog();
  render();
  animateCardChanges(beforeRects);
  playCardSound("undo");
  showToast("Ход отменен");
}

function activateSource(source) {
  if (!source || state.paused || state.won || state.lost || autoCollecting) {
    return;
  }

  if (source.zone === "stock") {
    drawFromStock();
    return;
  }

  const cards = getMovableCards(source);
  if (!cards.length) {
    return;
  }

  if (selectedSource && !isSameSource(selectedSource, source)) {
    if (tryMoveSelectedTo(source)) {
      return;
    }
  }

  if (cards.length === 1 && performMove(() => moveSourceToFoundation(source), { sound: "foundation" })) {
    return;
  }

  const targetPile = findTableauTarget(source);
  if (targetPile !== null && performMove(() => moveSourceToTableau(source, targetPile))) {
    return;
  }

  selectedSource = isSameSource(selectedSource, source) ? null : source;
  hintMarks = null;
  render();
}

function tryMoveSelectedTo(targetSource) {
  if (!selectedSource) {
    return false;
  }

  if (targetSource.zone === "foundation") {
    return performMove(() => moveSourceToFoundation(selectedSource), { sound: "foundation" });
  }

  if (targetSource.zone === "tableau") {
    const pile = targetSource.pile ?? targetSource.index;
    return performMove(() => moveSourceToTableau(selectedSource, pile));
  }

  return false;
}

function activateSlot(element) {
  if (state.paused || state.won || state.lost || autoCollecting) {
    return;
  }

  const zone = element.dataset.zone;
  if (zone === "stock") {
    drawFromStock();
    return;
  }

  if (zone === "foundation") {
    const suit = element.dataset.foundationSuit;
    if (selectedSource) {
      performMove(() => moveSourceToFoundation(selectedSource), { sound: "foundation" });
      return;
    }
    activateSource({ zone: "foundation", suit });
    return;
  }

  if (zone === "tableau") {
    const pile = Number(element.dataset.tableauPile);
    if (selectedSource) {
      performMove(() => moveSourceToTableau(selectedSource, pile));
    }
    return;
  }

  if (zone === "waste") {
    activateSource({ zone: "waste" });
  }
}

function findTableauTarget(source) {
  const movingCards = getMovableCards(source);
  if (!movingCards.length) {
    return null;
  }

  for (let pileIndex = 0; pileIndex < state.tableau.length; pileIndex += 1) {
    if (source.zone === "tableau" && source.pile === pileIndex) {
      continue;
    }

    if (canPlaceOnTableau(movingCards[0], state.tableau[pileIndex])) {
      return pileIndex;
    }
  }

  return null;
}

function revealsHiddenTableauCard(source) {
  if (!source || source.zone !== "tableau" || source.index <= 0) {
    return false;
  }

  const pile = state.tableau[source.pile];
  return Boolean(pile?.[source.index - 1] && !pile[source.index - 1].faceUp);
}

function hasProgressMoves() {
  if (state.won || state.lost) {
    return true;
  }

  for (let pileIndex = 0; pileIndex < state.tableau.length; pileIndex += 1) {
    const pile = state.tableau[pileIndex];
    for (let cardIndex = 0; cardIndex < pile.length; cardIndex += 1) {
      const card = pile[cardIndex];
      if (!card.faceUp) {
        continue;
      }

      const movingCards = pile.slice(cardIndex);
      if (movingCards.length === 1 && canPlaceOnFoundation(card)) {
        return true;
      }

      if (canPlaceOnAnyTableau(movingCards[0], pileIndex)) {
        return true;
      }
    }
  }

  const reachableDrawCards = [...state.stock, ...state.waste];
  for (const card of reachableDrawCards) {
    if (canPlaceOnFoundation(card) || canPlaceOnAnyTableau(card)) {
      return true;
    }
  }

  return false;
}

function checkNoMoves() {
  if (state.won || state.lost || hasProgressMoves()) {
    return false;
  }

  state.lost = true;
  state.paused = false;
  selectedSource = null;
  hintMarks = null;
  clearHintTimer();
  openLossDialog();
  return true;
}

function canAutoCollect() {
  return !state.won && !state.lost && state.tableau.every((pile) => pile.every((card) => card.faceUp));
}

function getAutoCollectStep() {
  const wasteSource = { zone: "waste" };
  const wasteCards = getMovableCards(wasteSource);
  if (wasteCards.length && canPlaceOnFoundation(wasteCards[0])) {
    return {
      sound: "foundation",
      run: () => moveSourceToFoundation(wasteSource),
    };
  }

  for (let pile = 0; pile < state.tableau.length; pile += 1) {
    const index = state.tableau[pile].length - 1;
    if (index < 0) {
      continue;
    }

    const source = { zone: "tableau", pile, index };
    const cards = getMovableCards(source);
    if (cards.length === 1 && canPlaceOnFoundation(cards[0])) {
      return {
        sound: "foundation",
        run: () => moveSourceToFoundation(source),
      };
    }
  }

  if (state.stock.length) {
    return {
      sound: "draw",
      run: () => {
        const card = state.stock.pop();
        card.faceUp = true;
        state.waste.push(card);
        return true;
      },
    };
  }

  if (state.waste.length) {
    return {
      sound: "draw",
      run: () => {
        state.stock = state.waste
          .reverse()
          .map((card) => ({ ...card, faceUp: false }));
        state.waste = [];
        return true;
      },
    };
  }

  return null;
}

async function startAutoCollect() {
  if (!canAutoCollect() || state.paused || state.won || state.lost || autoCollecting) {
    return;
  }

  autoCollecting = true;
  selectedSource = null;
  hintMarks = null;
  clearHintTimer();
  hideToast();
  render();

  const snapshot = cloneState();
  let snapshotSaved = false;
  let steps = 0;
  let drawStepsSinceFoundation = 0;

  while (!state.won && steps < 700) {
    const step = getAutoCollectStep();
    if (!step) {
      break;
    }

    const beforeRects = captureCardRects();
    const moved = step.run();
    if (!moved) {
      break;
    }

    if (!snapshotSaved) {
      undoStack.push(snapshot);
      snapshotSaved = true;
    }

    state.moves += 1;
    steps += 1;

    if (step.sound === "foundation") {
      drawStepsSinceFoundation = 0;
    } else {
      drawStepsSinceFoundation += 1;
    }

    if (!checkWin()) {
      checkNoMoves();
    }
    render();
    animateCardChanges(beforeRects);
    playCardSound(step.sound);

    if (state.won || state.lost) {
      break;
    }

    if (drawStepsSinceFoundation > 60) {
      break;
    }

    await wait(120);
  }

  autoCollecting = false;
  render();
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function checkWin() {
  const completed = SUITS.every((suit) => state.foundations[suit.id].length === 13);
  if (!completed || state.won) {
    return completed;
  }

  state.won = true;
  saveResult();
  renderHistory();
  openWinDialog();
  return true;
}

function openWinDialog() {
  dom.winTime.textContent = formatTime(state.elapsed);
  dom.winMoves.textContent = state.moves;
  if (!dom.winDialog.open) {
    dom.winDialog.showModal();
  }
}

function closeWinDialog() {
  if (dom.winDialog.open) {
    dom.winDialog.close();
  }
}

function openLossDialog() {
  if (!dom.lossDialog.open) {
    dom.lossDialog.showModal();
  }
}

function closeLossDialog() {
  if (dom.lossDialog.open) {
    dom.lossDialog.close();
  }
}

function findHint() {
  const candidates = [];

  const wasteSource = { zone: "waste" };
  const wasteCards = getMovableCards(wasteSource);
  if (wasteCards.length) {
    if (canPlaceOnFoundation(wasteCards[0]) && isSafeFoundationHint(wasteCards[0])) {
      candidates.push({
        priority: 80,
        source: wasteSource,
        target: { zone: "foundation", suit: wasteCards[0].suit },
      });
    }

    const pile = findTableauTarget(wasteSource);
    if (pile !== null) {
      candidates.push({
        priority: 55,
        source: wasteSource,
        target: { zone: "tableau", pile },
      });
    }
  }

  state.tableau.forEach((pile, pileIndex) => {
    pile.forEach((card, cardIndex) => {
      if (!card.faceUp) {
        return;
      }

      const source = { zone: "tableau", pile: pileIndex, index: cardIndex };
      const movingCards = getMovableCards(source);
      if (!movingCards.length) {
        return;
      }

      const revealsClosedCard = revealsHiddenTableauCard(source);
      if (movingCards.length === 1 && canPlaceOnFoundation(card) && isSafeFoundationHint(card, revealsClosedCard)) {
        candidates.push({
          priority: revealsClosedCard ? 95 : 75,
          source,
          target: { zone: "foundation", suit: card.suit },
        });
      }

      const targetPile = findTableauTarget(source);
      if (targetPile !== null && revealsClosedCard) {
        candidates.push({
          priority: revealsClosedCard ? 90 : 40,
          source,
          target: { zone: "tableau", pile: targetPile },
        });
      }
    });
  });

  if (state.stock.length) {
    candidates.push({
      priority: 10,
      source: { zone: "stock" },
      target: { zone: "stock" },
    });
  } else if (state.waste.length) {
    candidates.push({
      priority: 8,
      source: { zone: "waste" },
      target: { zone: "stock" },
    });
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0] || null;
}

function showHint() {
  if (state.paused || state.won || state.lost || autoCollecting) {
    return;
  }

  clearHintTimer();
  const hint = findHint();
  if (!hint) {
    hintMarks = null;
    checkNoMoves();
    render();
    hideToast();
    bumpButton(dom.hintButton);
    return;
  }

  hintMarks = {
    source: hint.source,
    target: hint.target,
  };
  selectedSource = null;
  render();
  animateHintMove(hint);
  hideToast();
  playCardSound("hint");
  hintTimer = window.setTimeout(() => {
    hintMarks = null;
    render();
  }, 1800);
}

function isSameSource(left, right) {
  if (!left || !right || left.zone !== right.zone) {
    return false;
  }

  if (left.zone === "tableau") {
    return left.pile === right.pile && left.index === right.index;
  }
  if (left.zone === "foundation") {
    return left.suit === right.suit;
  }
  return true;
}

function isSourceHint(source) {
  return isSameSource(hintMarks?.source, source);
}

function isTargetHint(target) {
  if (!hintMarks?.target || hintMarks.target.zone !== target.zone) {
    return false;
  }

  if (target.zone === "tableau") {
    return hintMarks.target.pile === target.pile;
  }
  if (target.zone === "foundation") {
    return hintMarks.target.suit === target.suit;
  }
  return true;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.add("visible");
  toastTimer = window.setTimeout(() => {
    dom.toast.classList.remove("visible");
  }, 2200);
}

function hideToast() {
  window.clearTimeout(toastTimer);
  dom.toast.textContent = "";
  dom.toast.classList.remove("visible");
}

function clearHintTimer() {
  window.clearTimeout(hintTimer);
  hintTimer = 0;
}

function bumpButton(button) {
  button.classList.remove("button-bump");
  void button.offsetWidth;
  button.classList.add("button-bump");
  window.setTimeout(() => button.classList.remove("button-bump"), 420);
}

function togglePause() {
  if (state.won || state.lost) {
    return;
  }
  state.paused = !state.paused;
  selectedSource = null;
  hintMarks = null;
  clearHintTimer();
  render();
}

function handleBoardClick(event) {
  activateBoardElement(event.target);
}

function handleBoardKeydown(event) {
  if (!isActivationKey(event)) {
    return;
  }

  const target = getKeyboardActivationElement(event.target);
  if (!target) {
    return;
  }

  event.preventDefault();
  activateBoardElement(target);
}

function handleGlobalKeydown(event) {
  if (event.defaultPrevented || !isActivationKey(event)) {
    return;
  }

  const activeElement = document.activeElement;
  const hoveredTarget = getKeyboardActivationElement(null);
  if (hoveredTarget) {
    event.preventDefault();
    activateBoardElement(hoveredTarget);
    return;
  }

  const activeBoardTarget = activeElement?.closest?.(".card, .slot, .tableau-pile");
  if (activeBoardTarget && dom.felt.contains(activeBoardTarget)) {
    event.preventDefault();
    activateBoardElement(activeBoardTarget);
    return;
  }

  const activeIsOutsideControl =
    activeElement &&
    activeElement !== document.body &&
    activeElement !== document.documentElement &&
    !dom.felt.contains(activeElement);

  if (activeIsOutsideControl) {
    return;
  }

  const rememberedTarget = getKeyboardFocusElement(keyboardFocusTarget);
  if (!rememberedTarget || !dom.felt.contains(rememberedTarget)) {
    return;
  }

  event.preventDefault();
  activateBoardElement(rememberedTarget);
}

function getKeyboardActivationElement(fallbackElement) {
  const hoveredElement = getBoardElementUnderPointer();
  if (hoveredElement) {
    rememberKeyboardHover(hoveredElement);
    return hoveredElement;
  }

  const fallbackTarget = fallbackElement?.closest?.(".card, .slot, .tableau-pile");
  if (fallbackTarget && dom.felt.contains(fallbackTarget)) {
    return fallbackTarget;
  }

  return getKeyboardFocusElement(keyboardHoverTarget) || getKeyboardFocusElement(keyboardFocusTarget);
}

function getBoardElementUnderPointer() {
  if (!lastBoardPointer) {
    return null;
  }

  const element = document.elementFromPoint(lastBoardPointer.x, lastBoardPointer.y);
  const target = element?.closest?.(".card, .slot, .tableau-pile");
  return target && dom.felt.contains(target) ? target : null;
}

function handleBoardPointerMove(event) {
  lastBoardPointer = {
    x: event.clientX,
    y: event.clientY,
  };
  const target = event.target.closest(".card, .slot, .tableau-pile");
  keyboardHoverTarget = target && dom.felt.contains(target) ? getKeyboardTargetFromElement(target) : null;
}

function handleBoardPointerLeave() {
  lastBoardPointer = null;
  keyboardHoverTarget = null;
}

function activateBoardElement(element) {
  const card = element.closest(".card");
  if (card && dom.felt.contains(card)) {
    rememberKeyboardFocus(card);
    activateSource(sourceFromElement(card));
    return true;
  }

  const slot = element.closest(".slot, .tableau-pile");
  if (slot && dom.felt.contains(slot)) {
    rememberKeyboardFocus(slot);
    activateSlot(slot);
    return true;
  }

  return false;
}

function isActivationKey(event) {
  return event.key === "Enter" || event.key === " " || event.key === "Spacebar" || event.code === "Space";
}

function handleDragStart(event) {
  const card = event.target.closest(".card");
  const source = sourceFromElement(card);

  if (!source || !canSourceDrag(source)) {
    event.preventDefault();
    return;
  }

  dragSource = source;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", JSON.stringify(source));
  window.requestAnimationFrame(() => card.classList.add("dragging"));
}

function handleDragEnd(event) {
  const card = event.target.closest(".card");
  card?.classList.remove("dragging");
  dragSource = null;
}

function handleDragOver(event) {
  if (!dragSource) {
    return;
  }

  const foundation = event.target.closest(".foundation-slot");
  const tableau = event.target.closest(".tableau-pile");
  if (foundation || tableau) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }
}

function handleDrop(event) {
  if (!dragSource) {
    return;
  }

  const foundation = event.target.closest(".foundation-slot");
  const tableau = event.target.closest(".tableau-pile");

  if (!foundation && !tableau) {
    return;
  }

  event.preventDefault();

  if (foundation) {
    performMove(() => moveSourceToFoundation(dragSource), { sound: "foundation" });
  } else if (tableau) {
    performMove(() => moveSourceToTableau(dragSource, Number(tableau.dataset.tableauPile)));
  }

  dragSource = null;
}

function tickTimer() {
  if (!state || state.paused || state.won || state.lost) {
    return;
  }
  state.elapsed += 1;
  renderStats();
}

dom.felt.addEventListener("click", handleBoardClick);
dom.felt.addEventListener("keydown", handleBoardKeydown);
dom.felt.addEventListener("pointermove", handleBoardPointerMove);
dom.felt.addEventListener("pointerleave", handleBoardPointerLeave);
dom.felt.addEventListener("dragstart", handleDragStart);
dom.felt.addEventListener("dragend", handleDragEnd);
dom.felt.addEventListener("dragover", handleDragOver);
dom.felt.addEventListener("drop", handleDrop);
document.addEventListener("keydown", handleGlobalKeydown);
document.addEventListener("pointerdown", (event) => {
  if (!dom.felt.contains(event.target)) {
    keyboardFocusTarget = null;
    keyboardHoverTarget = null;
    lastBoardPointer = null;
  }
});

dom.newGameButton.addEventListener("click", startNewGame);
dom.pauseButton.addEventListener("click", togglePause);
dom.pauseScreen.addEventListener("click", togglePause);
dom.undoButton.addEventListener("click", undo);
dom.autoCollectButton.addEventListener("click", startAutoCollect);
dom.hintButton.addEventListener("click", showHint);

dom.winDialog.addEventListener("close", () => {
  if (dom.winDialog.returnValue === "new") {
    startNewGame();
  }
});

dom.dialogNewGame.addEventListener("click", () => {
  dom.winDialog.returnValue = "new";
});

dom.lossDialog.addEventListener("close", () => {
  if (dom.lossDialog.returnValue === "new") {
    startNewGame();
  }
});

dom.lossNewGame.addEventListener("click", () => {
  dom.lossDialog.returnValue = "new";
});

window.setInterval(tickTimer, 1000);
startNewGame();
