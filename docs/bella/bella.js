(function () {
  "use strict";

  var cards = Array.isArray(window.BELLA_FLASHCARDS) ? window.BELLA_FLASHCARDS.slice() : [];
  var app = document.getElementById("bella-app");

  if (!app) {
    return;
  }

  var STORAGE_KEY = "bella-legal-terminology-progress-v7";
  var memoryStore = {};
  var storageAvailable = true;
  var CATEGORY_OPTIONS = [
    "Filing & Service",
    "Courtroom Flow",
    "Parties",
    "Records & Outcomes",
    "Criminal Basics",
    "Contrast Cards"
  ];
  var SESSION_OPTIONS = [
    { value: "full", label: "Learn" },
    { value: "test", label: "Test" }
  ];

  try {
    var probeKey = STORAGE_KEY + "-probe";
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
  } catch (error) {
    storageAvailable = false;
  }

  function storageGet() {
    if (!storageAvailable) {
      return memoryStore[STORAGE_KEY] || null;
    }
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return memoryStore[STORAGE_KEY] || null;
    }
  }

  function storageSet(value) {
    if (!storageAvailable) {
      memoryStore[STORAGE_KEY] = value;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (error) {
      memoryStore[STORAGE_KEY] = value;
    }
  }

  function createInitialState() {
    return {
      order: cards.map(function (card) { return card.id; }),
      currentIndex: 0,
      currentCardId: "",
      flipped: false,
      filter: "All",
      session: "full",
      streak: 0,
      progress: {}
    };
  }

  function loadState() {
    var fallback = createInitialState();
    var raw = storageGet();

    if (!raw) {
      return fallback;
    }

    try {
      var parsed = JSON.parse(raw);
      return Object.assign(fallback, parsed, {
        progress: parsed.progress || fallback.progress,
        order: Array.isArray(parsed.order) ? parsed.order : fallback.order
      });
    } catch (error) {
      return fallback;
    }
  }

  var state = loadState();

  function saveState() {
    storageSet(JSON.stringify(state));
  }

  function getCardById(id) {
    return cards.find(function (card) {
      return card.id === id;
    });
  }

  function isTestMode() {
    return state.session === "test";
  }

  function buildDeck() {
    var orderedCards = state.order.map(getCardById).filter(Boolean);
    var missingCards = cards.filter(function (card) {
      return !state.order.includes(card.id);
    });
    var fullDeck = orderedCards.concat(missingCards);

    return fullDeck.filter(function (card) {
      if (state.filter === "All") {
        return true;
      }

      return card.category === state.filter;
    });
  }

  function clampIndex(deck) {
    if (deck.length === 0) {
      state.currentIndex = 0;
      return;
    }

    if (state.currentIndex >= deck.length) {
      state.currentIndex = 0;
    }
  }

  function clearCardState() {
    state.flipped = false;
  }

  function resetState() {
    state = createInitialState();
    saveState();
    render();
  }

  function cardWeight(card) {
    var weight = 1;

    if (card.difficulty === "medium") {
      weight = 2;
    } else if (card.difficulty === "hard") {
      weight = 3;
    }

    if (card.category === "Contrast Cards") {
      weight += 3;
    }

    return weight;
  }

  function weightedPick(deck, excludeId) {
    var pool = deck.filter(function (card) {
      return card.id !== excludeId;
    });

    if (pool.length === 0) {
      pool = deck.slice();
    }

    var totalWeight = pool.reduce(function (sum, card) {
      return sum + cardWeight(card);
    }, 0);

    var target = Math.random() * totalWeight;
    var running = 0;

    for (var i = 0; i < pool.length; i += 1) {
      running += cardWeight(pool[i]);
      if (target <= running) {
        return pool[i];
      }
    }

    return pool[0] || null;
  }

  function getCurrentCard(deck) {
    if (deck.length === 0) {
      state.currentCardId = "";
      return null;
    }

    if (isTestMode()) {
      var current = getCardById(state.currentCardId);
      if (current && deck.some(function (card) { return card.id === current.id; })) {
        return current;
      }

      var nextCard = weightedPick(deck, "");
      state.currentCardId = nextCard ? nextCard.id : "";
      return nextCard;
    }

    clampIndex(deck);
    state.currentCardId = deck[state.currentIndex].id;
    return deck[state.currentIndex];
  }

  function nextCardAfterScore(deck, currentCard) {
    if (deck.length === 0) {
      state.currentCardId = "";
      return;
    }

    if (isTestMode()) {
      var nextWeightedCard = weightedPick(deck, currentCard.id);
      state.currentCardId = nextWeightedCard ? nextWeightedCard.id : "";
      return;
    }

    var currentDeckIndex = deck.findIndex(function (card) {
      return card.id === currentCard.id;
    });

    if (currentDeckIndex < 0) {
      currentDeckIndex = state.currentIndex;
    }

    state.currentIndex = (currentDeckIndex + 1) % deck.length;
    state.currentCardId = deck[state.currentIndex] ? deck[state.currentIndex].id : "";
  }

  function scoreCard(level) {
    var deck = buildDeck();
    var currentCard = getCurrentCard(deck);

    if (!currentCard) {
      return;
    }

    var progress = state.progress[currentCard.id] || { seen: 0, score: 0, streak: 0, last: "", review: false };

    progress.seen += 1;
    progress.last = level;

    if (level === "again") {
      progress.score = Math.max(progress.score - 1, 0);
      progress.streak = 0;
      progress.review = true;
      state.streak = 0;
    } else {
      progress.score = Math.min(progress.score + 1, 3);
      progress.streak += 1;
      progress.review = false;
      state.streak += 1;
    }

    state.progress[currentCard.id] = progress;
    clearCardState();
    nextCardAfterScore(deck, currentCard);
    saveState();
    render();
  }

  function frontQuestion(card) {
    if (!isTestMode()) {
      return card.prompt;
    }

    return (card.test && card.test.question) || card.prompt;
  }

  function backAnswer(card) {
    if (!isTestMode()) {
      return card.answer;
    }

    return (card.test && card.test.response) || card.answer;
  }

  function render() {
    var deck = buildDeck();
    var currentCard = getCurrentCard(deck);
    var weakCount = cards.filter(function (card) {
      var progress = state.progress[card.id];
      return progress && progress.review;
    }).length;
    var cardPosition = currentCard ? deck.findIndex(function (card) { return card.id === currentCard.id; }) + 1 : 0;
    var progressLine = "Card " + cardPosition + " / " + deck.length;

    var filterOptions = [{ value: "All", label: "All" }]
      .concat(CATEGORY_OPTIONS.map(function (category) {
        return { value: category, label: category };
      }))
      .map(function (option) {
        var selected = option.value === state.filter ? " selected" : "";
        return '<option value="' + escapeHtml(option.value) + '"' + selected + ">" + escapeHtml(option.label) + "</option>";
      }).join("");

    var sessionOptions = SESSION_OPTIONS.map(function (option) {
      var selected = option.value === state.session ? " selected" : "";
      return '<option value="' + option.value + '"' + selected + ">" + escapeHtml(option.label) + "</option>";
    }).join("");

    var content = [
      '<div class="bella-shell">',
      '<section class="bella-panel">',
      '<div class="bella-header">',
      '<h1 class="bella-title">Legal Terminology Flashcards</h1>',
      '<div class="bella-badge">' + cards.length + " cards</div>",
      "</div>",
      '<div class="bella-mini-progress"><span>' + progressLine + '</span><span>Review: ' + weakCount + ' weak cards</span><span>Streak: ' + state.streak + "</span></div>",
      "</section>",
      '<section class="bella-panel bella-toolbar">',
      '<div class="bella-filter-row">',
      '<label class="bella-filter-label" for="bella-filter">Category</label>',
      '<select class="bella-select" id="bella-filter">' + filterOptions + "</select>",
      "</div>",
      '<div class="bella-filter-row">',
      '<label class="bella-filter-label" for="bella-session">Session</label>',
      '<select class="bella-select" id="bella-session">' + sessionOptions + "</select>",
      "</div>",
      "</section>"
    ];

    if (!currentCard) {
      content.push(
        '<section class="bella-empty">',
        "<h2>No cards match this filter.</h2>",
        "<p>Choose another category or switch back to All.</p>",
        "</section>"
      );
    } else {
      var label = state.flipped ? "Answer" : "Prompt";
      var faceText = state.flipped ? escapeHtml(backAnswer(currentCard)) : escapeHtml(frontQuestion(currentCard));
      var faceClass = state.flipped ? "bella-card-answer" : "";
      var modeBadge = isTestMode()
        ? '<span class="bella-mode-chip">Test</span>'
        : '<span class="bella-mode-chip">' + escapeHtml(currentCard.category) + "</span>";

      content.push(
        '<section class="bella-card">',
        '<button class="bella-card-button" type="button" data-action="flip-card" aria-label="Flip flashcard">',
        '<div class="bella-card-top">' + modeBadge + "</div>",
        '<div class="bella-card-body"><span class="bella-side-label">' + escapeHtml(label) + '</span><p class="bella-card-text ' + faceClass + '">' + faceText + "</p></div>",
        "</button>",
        "</section>"
      );

      if (!state.flipped) {
        content.push(
          '<section class="bella-controls bella-controls-single">',
          '<button class="bella-button bella-flip-button" type="button" data-action="flip-card">Show Answer</button>',
          "</section>"
        );
      } else {
        content.push(
          '<section class="bella-controls">',
          '<button class="bella-button bella-score-again" type="button" data-score="again">Again</button>',
          '<button class="bella-button bella-score-good" type="button" data-score="good">Got It</button>',
          "</section>"
        );
      }
    }

    content.push(
      '<div class="bella-footer-actions">',
      '<button class="bella-button bella-button-ghost is-danger" type="button" data-action="reset-progress">Reset progress</button>',
      "</div>",
      "</div>"
    );

    app.innerHTML = content.join("");

    var filterSelect = document.getElementById("bella-filter");
    if (filterSelect) {
      filterSelect.addEventListener("change", function (event) {
        state.filter = event.target.value;
        state.currentIndex = 0;
        state.currentCardId = "";
        clearCardState();
        saveState();
        render();
      });
    }

    var sessionSelect = document.getElementById("bella-session");
    if (sessionSelect) {
      sessionSelect.addEventListener("change", function (event) {
        state.session = event.target.value;
        state.currentIndex = 0;
        state.currentCardId = "";
        clearCardState();
        saveState();
        render();
      });
    }

    app.querySelectorAll("[data-action]").forEach(function (element) {
      element.addEventListener("click", function () {
        var action = element.getAttribute("data-action");

        if (action === "flip-card") {
          state.flipped = !state.flipped;
          saveState();
          render();
          return;
        }

        if (action === "reset-progress") {
          resetState();
        }
      });
    });

    app.querySelectorAll("[data-score]").forEach(function (element) {
      element.addEventListener("click", function () {
        scoreCard(element.getAttribute("data-score"));
      });
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  if (["All"].concat(CATEGORY_OPTIONS).indexOf(state.filter) === -1) {
    state.filter = "All";
  }

  if (SESSION_OPTIONS.map(function (item) { return item.value; }).indexOf(state.session) === -1) {
    state.session = "full";
  }

  saveState();
  render();
}());
