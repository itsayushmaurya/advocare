const API_BASE = "http://localhost:8000";
let conversationHistory = [];
let isLoading = false;
let currentSessionId = null;
let replyMode = "detail"; // 'quick' or 'detail'

// ─── On Page Load ───────────────────────────────────────────
window.addEventListener("load", () => {
  renderSidebar();
  loadLastSession();
  updateReplyToggle();
});

function setReplyMode(mode) {
  replyMode = mode;
  updateReplyToggle();
}

function updateReplyToggle() {
  const quickBtn = document.getElementById("quickBtn");
  const detailBtn = document.getElementById("detailBtn");
  if (!quickBtn || !detailBtn) return;
  if (replyMode === "quick") {
    quickBtn.classList.add("active");
    detailBtn.classList.remove("active");
  } else {
    quickBtn.classList.remove("active");
    detailBtn.classList.add("active");
  }
}

// ─── Session Helpers ────────────────────────────────────────
function generateId() {
  return "session_" + Date.now();
}

function getAllSessions() {
  const raw = localStorage.getItem("byol_sessions");
  return raw ? JSON.parse(raw) : {};
}

async function saveSession(sessionId, messages, strengthData = null) {
  const sessions = getAllSessions();

  // Keep existing strength if no new one passed
  const existing = sessions[sessionId];
  const strength =
    strengthData !== null ? strengthData : existing ? existing.strength : null;

  sessions[sessionId] = {
    id: sessionId,
    title: getSessionTitle(messages),
    messages: messages,
    strength: strength,
    updatedAt: Date.now(),
  };

  localStorage.setItem("byol_sessions", JSON.stringify(sessions));
  renderSidebar();
}

function getSessionTitle(messages) {
  // Use first user message as title
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New Chat";
  return first.content.length > 45
    ? first.content.substring(0, 45) + "..."
    : first.content;
}

function startNewSession() {
  currentSessionId = generateId();
  conversationHistory = [];
  clearChatWindow();
  showWelcomeMessage();
  renderSidebar();
}

function loadSession(sessionId) {
  const sessions = getAllSessions();
  const session = sessions[sessionId];
  if (!session) return;

  currentSessionId = sessionId;
  conversationHistory = session.messages;
  clearChatWindow();
  showWelcomeMessage();

  session.messages.forEach((msg) => {
    if (msg.role === "user") appendUserMessage(msg.content, false);
    else if (msg.role === "assistant")
      appendBotMessage(msg.content, msg.category || "", false);
  });

  // ← Restore strength panel
  if (session.strength) {
    updateStrengthPanel(
      session.strength.score,
      session.strength.positives,
      session.strength.negatives,
    );
  } else {
    // Reset panel to empty state
    document.getElementById("strengthEmpty").classList.remove("hidden");
    document.getElementById("strengthResults").classList.add("hidden");
  }

  renderSidebar();
}

function loadLastSession() {
  const sessions = getAllSessions();
  const sorted = Object.values(sessions).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
  if (sorted.length > 0) {
    loadSession(sorted[0].id);
  } else {
    startNewSession();
  }
}

function deleteSession(sessionId, e) {
  e.stopPropagation(); // prevent triggering loadSession
  const sessions = getAllSessions();
  delete sessions[sessionId];
  localStorage.setItem("byol_sessions", JSON.stringify(sessions));

  if (currentSessionId === sessionId) {
    startNewSession();
  }
  renderSidebar();
}

// ─── Sidebar Rendering ──────────────────────────────────────
function renderSidebar() {
  const sessions = getAllSessions();
  const sorted = Object.values(sessions).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
  const list = document.getElementById("sessionList");

  if (sorted.length === 0) {
    list.innerHTML = `<p class="no-sessions">No previous chats yet.</p>`;
    return;
  }

  list.innerHTML = sorted
    .map(
      (session) => `
    <div class="session-item ${session.id === currentSessionId ? "active" : ""}"
         onclick="loadSession('${session.id}')">
      <div class="session-info">
        <span class="session-title">${escapeHtml(session.title)}</span>
        <span class="session-date">${formatDate(session.updatedAt)}</span>
      </div>
      <button class="delete-btn" onclick="deleteSession('${session.id}', event)" title="Delete">✕</button>
    </div>
  `,
    )
    .join("");
}

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday)
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ─── Chat UI ────────────────────────────────────────────────
function clearChatWindow() {
  document.getElementById("chatWindow").innerHTML = "";
}

function showWelcomeMessage() {
  const chatWindow = document.getElementById("chatWindow");
  const div = document.createElement("div");
  div.className = "message bot-message welcome";
  div.innerHTML = `
    <div class="bot-avatar">⚖️</div>
    <div class="message-content">
      <p><strong>Hello! I'm your AI Legal Assistant.</strong></p>
      <p>Describe your legal problem in simple language and I'll guide you step-by-step on what to do, where to complain, and what your rights are.</p>
      <p class="disclaimer">⚠️ This is for informational purposes only and does not constitute legal advice.</p>
    </div>
  `;
  chatWindow.appendChild(div);
}

document.getElementById("userInput").addEventListener("input", function () {
  const count = this.value.length;
  document.getElementById("charCount").textContent = `${count} / 2000`;
  document.getElementById("charCount").style.color =
    count > 1900 ? "#ef4444" : "#64748b";
});

function setExample(text) {
  document.getElementById("userInput").value = text;
  document.getElementById("charCount").textContent = `${text.length} / 2000`;
  document.getElementById("userInput").focus();
}

function handleKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submitQuery();
  }
}

async function submitQuery() {
  if (isLoading) return;

  const input = document.getElementById("userInput").value.trim();
  if (!input || input.length < 10) {
    showError("Please describe your problem in a bit more detail.");
    return;
  }

  if (!currentSessionId) startNewSession();

  setLoading(true);
  appendUserMessage(input);
  document.getElementById("userInput").value = "";
  document.getElementById("charCount").textContent = "0 / 2000";

  const typingId = showTyping();

  try {
    const response = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        problem: input,
        conversation_history: conversationHistory,
        reply_mode: replyMode,
      }),
    });

    removeTyping(typingId);

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || "Server error");
    }

    const data = await response.json();
    const { cleanText, score, positives, negatives } = parseResponse(
      data.response,
    );

    console.log("PARSED:", score, positives, negatives);

    // Update history
    //conversationHistory.push({ role: "user", content: input });
    //conversationHistory.push({ role: "assistant", content: cleanText, category: data.detected_category });

    conversationHistory.push({ role: "user", content: input });
    conversationHistory.push({
      role: "assistant",
      content: cleanText
        .replace(
          /---CASE_ANALYSIS_START---[\s\S]*?---CASE_ANALYSIS_END---/g,
          "",
        )
        .replace(/---CASE_ANALYSIS_START---[\s\S]*$/g, "")
        .trim(),
      // NO category field here — Groq rejects unknown fields
    });

    appendBotMessage(cleanText, data.detected_category);

    // Update strength panel + save strength with session
    if (score !== null) {
      updateStrengthPanel(score, positives, negatives);
      await saveSession(currentSessionId, conversationHistory, {
        score,
        positives,
        negatives,
      });
    } else {
      await saveSession(currentSessionId, conversationHistory, null);
    }
  } catch (err) {
    removeTyping(typingId);
    appendBotMessage(
      err.message === "Failed to fetch"
        ? "❌ Could not connect to the server. Make sure backend is running on port 8000."
        : `❌ Error: ${err.message}`,
      "error",
    );
  }

  setLoading(false);
}

function appendUserMessage(text, save = true) {
  const chatWindow = document.getElementById("chatWindow");
  const div = document.createElement("div");
  div.className = "message user-message";
  div.innerHTML = `
    <div class="message-content"><p>${escapeHtml(text)}</p></div>
    <div class="bot-avatar" style="background:#f59e0b;">👤</div>
  `;
  chatWindow.appendChild(div);
  scrollToBottom();
}

function appendBotMessage(text, category = "", save = true) {
  const chatWindow = document.getElementById("chatWindow");
  const shouldAutoScroll = isNearBottom(chatWindow);
  const div = document.createElement("div");
  div.className = "message bot-message";

  const categoryLabel =
    category && category !== "general" && category !== "error"
      ? `<div class="category-badge">📂 ${formatCategory(category)}</div>`
      : "";

  div.innerHTML = `
    <div class="bot-avatar">⚖️</div>
    <div class="message-content">
      ${categoryLabel}
      <div class="response-block">${formatResponse(text)}</div>
    </div>
  `;
  chatWindow.appendChild(div);
  if (shouldAutoScroll) scrollToBottom();
}

function formatResponse(text) {
  const safeText = escapeHtml(text);

  return safeText
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/🔍 ISSUE TYPE/g, "<strong>🔍 ISSUE TYPE</strong>")
    .replace(/📋 STEPS TO TAKE/g, "<strong>📋 STEPS TO TAKE</strong>")
    .replace(
      /🏛️ WHERE TO FILE COMPLAINT/g,
      "<strong>🏛️ WHERE TO FILE COMPLAINT</strong>",
    )
    .replace(/⚖️ YOUR RIGHTS/g, "<strong>⚖️ YOUR RIGHTS</strong>")
    .replace(/💡 IMPORTANT TIP/g, "<strong>💡 IMPORTANT TIP</strong>")
    .replace(/\n/g, "<br>")
    .replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#1a56db">$1</a>',
    );
}

function formatCategory(cat) {
  const map = {
    cybercrime: "Cybercrime",
    consumer: "Consumer Complaint",
    labour: "Labour / Employment",
    rental: "Rental Dispute",
    domestic_violence: "Domestic Issue",
    property: "Property Dispute",
    general: "General Legal",
  };
  return map[cat] || cat;
}

function showTyping() {
  const chatWindow = document.getElementById("chatWindow");
  const shouldAutoScroll = isNearBottom(chatWindow);
  const id = "typing-" + Date.now();
  const div = document.createElement("div");
  div.className = "message bot-message";
  div.id = id;
  div.innerHTML = `
    <div class="bot-avatar">⚖️</div>
    <div class="message-content">
      <div class="typing"><span></span><span></span><span></span></div>
      <p style="font-size:12px;color:#64748b;margin-top:4px">Analyzing your case...</p>
    </div>
  `;
  chatWindow.appendChild(div);
  if (shouldAutoScroll) scrollToBottom();
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function setLoading(state) {
  isLoading = state;
  const btn = document.getElementById("sendBtn");
  document.getElementById("btnText").classList.toggle("hidden", state);
  document.getElementById("btnLoader").classList.toggle("hidden", !state);
  btn.disabled = state;
}

function isNearBottom(container, threshold = 150) {
  if (!container) return true;
  const distanceFromBottom =
    container.scrollHeight - (container.scrollTop + container.clientHeight);
  return distanceFromBottom <= threshold;
}

function scrollToBottom() {
  const cw = document.getElementById("chatWindow");
  if (!cw) return;

  requestAnimationFrame(() => {
    cw.scrollTop = cw.scrollHeight;
    const lastMessage = cw.lastElementChild;
    if (lastMessage) {
      lastMessage.scrollIntoView({ block: "end" });
    }
  });
}

function showError(msg) {
  const input = document.getElementById("userInput");
  input.style.borderColor = "#ef4444";
  setTimeout(() => {
    input.style.borderColor = "";
  }, 2000);
  alert(msg);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseResponse(fullText) {
  const analysisMatch = fullText.match(
    /---CASE_ANALYSIS_START---([\s\S]*?)(?:---CASE_ANALYSIS_END---|$)/,
  );

  let score = null;
  let positives = [];
  let negatives = [];
  let cleanText = fullText;

  if (analysisMatch) {
    const block = analysisMatch[1];

    // Remove the analysis block from visible chat text
    cleanText = fullText
      .replace(/---CASE_ANALYSIS_START---[\s\S]*?---CASE_ANALYSIS_END---/, "")
      .replace(/---CASE_ANALYSIS_START---[\s\S]*$/, "")
      .trim();

    // Parse score
    const scoreMatch = block.match(/STRENGTH_SCORE:\s*(\d+)/);
    if (scoreMatch) score = parseInt(scoreMatch[1]);

    // Parse positives
    const posSection = block.match(
      /POSITIVE_POINTS:([\s\S]*?)NEGATIVE_POINTS:/,
    );
    if (posSection) {
      positives = posSection[1]
        .trim()
        .split("\n")
        .map((l) => l.replace(/^-\s*/, "").trim())
        .filter(Boolean);
    }

    // Parse negatives
    const negSection = block.match(
      /NEGATIVE_POINTS:([\s\S]*?)(?:---CASE_ANALYSIS_END---|$)/,
    );
    if (negSection) {
      negatives = negSection[1]
        .trim()
        .split("\n")
        .map((l) => l.replace(/^-\s*/, "").trim())
        .filter(Boolean);
    }
  }

  return { cleanText, score, positives, negatives };
}

function updateStrengthPanel(score, positives, negatives) {
  // Show results, hide empty state
  document.getElementById("strengthEmpty").classList.add("hidden");
  document.getElementById("strengthResults").classList.remove("hidden");

  // Score color
  const color = score >= 65 ? "#059669" : score >= 40 ? "#f59e0b" : "#ef4444";
  document.getElementById("scoreDisplay").innerHTML =
    `<span style="color:${color}">${score}%</span><br>
     <span style="font-size:13px;font-weight:500;color:#64748b">Case Strength</span>`;

  // Bar — red on left, green on right
  document.getElementById("barRed").style.width = `${100 - score}%`;
  document.getElementById("barGreen").style.width = `${score}%`;

  // Store points for toggle
  const posBox = document.getElementById("positivePoints");
  const negBox = document.getElementById("negativePoints");

  posBox.className = "points-box green-box";
  posBox.innerHTML =
    "<ul>" +
    positives.map((p) => `<li>✦ ${escapeHtml(p)}</li>`).join("") +
    "</ul>";

  negBox.className = "points-box red-box";
  negBox.innerHTML =
    "<ul>" +
    negatives.map((n) => `<li>⚠ ${escapeHtml(n)}</li>`).join("") +
    "</ul>";
}

function togglePoints(type) {
  const posBox = document.getElementById("positivePoints");
  const negBox = document.getElementById("negativePoints");

  if (type === "positive") {
    posBox.classList.toggle("hidden");
  } else {
    negBox.classList.toggle("hidden");
  }
}
