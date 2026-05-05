const API_BASE = "http://localhost:8000";
const TOKEN_KEY = "advocare_token";
let conversationHistory = [];
let isLoading = false;
let currentSessionId = null;
let isSidebarCollapsed = false;
let sidebarView = "recents";
let sidebarSearchQuery = "";
let currentUserId = null;
let replyMode = normalizeReplyMode(localStorage.getItem("replyMode")); // 'quick' or 'detail'
let language = normalizeLanguage(localStorage.getItem("language")); // 'en' or 'hi'
const UI_TEXT = {
  en: {
    inputPlaceholder:
      "Describe your legal problem here... (e.g. 'My boss fired me without notice')",
    sendButton: "Get Legal Help →",
    loadingButton: "Analyzing...",
    newChat: "New Chat",
    searchChats: "Search Chats",
    pinnedChats: "Pinned Chats",
    recents: "Recents",
    previousChats: "Previous Chats",
    settings: "Settings",
    outputType: "Output Type",
    quick: "Quick",
    detailed: "Detailed",
    language: "Language",
    welcomeTitle: "Hello! I'm your AI Legal Assistant.",
    welcomeBody:
      "Describe your legal problem in simple language and I'll guide you step-by-step on what to do, where to complain, and what your rights are.",
    welcomeDisclaimer:
      "⚠️ This is for informational purposes only and does not constitute legal advice.",
  },
  hi: {
    inputPlaceholder:
      "अपनी कानूनी समस्या यहां लिखें... (जैसे 'मेरे बॉस ने मुझे बिना नोटिस के नौकरी से निकाल दिया')",
    sendButton: "कानूनी मदद पाएं →",
    loadingButton: "विश्लेषण हो रहा है...",
    newChat: "नई चैट",
    searchChats: "चैट खोजें",
    pinnedChats: "पिन की गई चैट",
    recents: "हाल की चैट",
    previousChats: "पिछली चैट्स",
    settings: "सेटिंग्स",
    outputType: "उत्तर का प्रकार",
    quick: "संक्षिप्त",
    detailed: "विस्तृत",
    language: "भाषा",
    welcomeTitle: "नमस्ते! मैं आपका AI कानूनी सहायक हूं।",
    welcomeBody:
      "अपनी कानूनी समस्या सरल भाषा में बताएं और मैं आपको चरण-दर-चरण बताऊंगा कि क्या करना है, कहां शिकायत करनी है और आपके अधिकार क्या हैं।",
    welcomeDisclaimer:
      "⚠️ यह केवल जानकारी के लिए है और कानूनी सलाह नहीं है।",
  },
};

function normalizeReplyMode(mode) {
  return mode === "quick" ? "quick" : "detail";
}

function normalizeLanguage(lang) {
  return lang === "hi" ? "hi" : "en";
}

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function parseJwtPayload(token) {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isTokenValid(token) {
  if (!token) return false;
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return false;
  return payload.exp > Math.floor(Date.now() / 1000);
}

function redirectToAuth() {
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = "auth.html";
}

function ensureAuthenticated() {
  const token = getStoredToken();
  if (!isTokenValid(token)) {
    redirectToAuth();
    return false;
  }
  currentUserId = parseJwtPayload(token)?.sub || null;
  return true;
}

function getInitials(name) {
  return (
    (name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "--"
  );
}

function updateProfileUI(user) {
  const profileAvatar = document.getElementById("profileAvatar");
  const profileName = document.getElementById("profileName");
  const profileEmail = document.getElementById("profileEmail");

  if (profileAvatar) profileAvatar.textContent = getInitials(user.name);
  if (profileName) profileName.textContent = user.name;
  if (profileEmail) profileEmail.textContent = user.email;
  updateHeroGreeting(user.name);
}

function updateHeroGreeting(name = "") {
  const greetingEl = document.getElementById("chatHeroGreeting");
  if (!greetingEl) return;
  const fallbackName =
    document.getElementById("profileName")?.textContent ||
    localStorage.getItem("advocare_user_name") ||
    "";
  const firstName = (name || fallbackName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)[0];
  greetingEl.textContent = firstName ? `Hello, ${firstName}` : "Hello";
}

function setHeroLayout(enabled) {
  const chatContainer = document.getElementById("chatContainer");
  if (!chatContainer) return;
  chatContainer.classList.toggle("hero-layout", enabled);
}

function syncHeroLayoutWithChat() {
  const chatWindow = document.getElementById("chatWindow");
  if (!chatWindow) return;
  // Keep hero mode until the user sends their first message in the current session.
  const hasUserMessage = chatWindow.querySelector(".user-message") !== null;
  setHeroLayout(!hasUserMessage);
}

async function loadCurrentUser() {
  const token = getStoredToken();
  const payload = parseJwtPayload(token);
  currentUserId = payload?.sub || null;
  if (!currentUserId) {
    redirectToAuth();
    return;
  }

  const response = await apiFetch("/me");
  if (!response.ok) {
    redirectToAuth();
    return;
  }

  updateProfileUI(await response.json());
}

// ─── On Page Load ───────────────────────────────────────────
window.addEventListener("load", async () => {
  if (!ensureAuthenticated()) return;
  if (window.lucide?.createIcons) window.lucide.createIcons();
  setSidebarActiveNav("navRecents");
  updateHeroGreeting();
  await loadCurrentUser();
  applySidebarState();
  initStrengthPanel();
  await renderSidebar();
  await loadLastSession();
  updateReplyToggle();
  updateLanguageToggle();
  applyLanguageText();
});

function applySidebarState() {
  const appLayout = document.getElementById("appLayout");
  const toggleBtn = document.getElementById("sidebarToggle");
  if (!appLayout || !toggleBtn) return;

  appLayout.classList.toggle("sidebar-collapsed", isSidebarCollapsed);
  toggleBtn.textContent = isSidebarCollapsed ? "▶" : "◀";
  toggleBtn.title = isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
  toggleBtn.setAttribute("aria-label", toggleBtn.title);
}

function toggleSidebarCollapse() {
  isSidebarCollapsed = !isSidebarCollapsed;
  applySidebarState();
}

function setSidebarActiveNav(navId) {
  document.querySelectorAll(".sidebar-nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.id === navId);
  });
}

function handleSidebarNav(action) {
  if (action === "new") {
    setSidebarActiveNav("navNewChat");
    startNewSession();
    return;
  }

  if (action === "search") {
    sidebarView = "search";
    setSidebarActiveNav("navSearch");
    document.getElementById("sidebarSearchWrap")?.classList.remove("hidden");
    document.getElementById("sidebarSearchInput")?.focus();
    renderSidebar();
    return;
  }

  if (action === "pinned") {
    sidebarView = "pinned";
    sidebarSearchQuery = "";
    const searchInput = document.getElementById("sidebarSearchInput");
    if (searchInput) searchInput.value = "";
    document.getElementById("sidebarSearchWrap")?.classList.add("hidden");
    setSidebarActiveNav("navPinned");
    renderSidebar();
    return;
  }

  sidebarView = "recents";
  sidebarSearchQuery = "";
  const searchInput = document.getElementById("sidebarSearchInput");
  if (searchInput) searchInput.value = "";
  document.getElementById("sidebarSearchWrap")?.classList.add("hidden");
  setSidebarActiveNav("navRecents");
  renderSidebar();
}

function handleSidebarSearchInput() {
  const input = document.getElementById("sidebarSearchInput");
  sidebarSearchQuery = (input?.value || "").trim().toLowerCase();
  renderSidebar();
}

function setReplyMode(mode) {
  replyMode = normalizeReplyMode(mode);
  localStorage.setItem("replyMode", replyMode);
  updateReplyToggle();
}

function setLanguage(lang) {
  language = normalizeLanguage(lang);
  localStorage.setItem("language", language);
  updateLanguageToggle();
  applyLanguageText();
}

function updateLanguageToggle() {
  const enBtn = document.getElementById("langEnToggle");
  const hiBtn = document.getElementById("langHiToggle");
  if (!enBtn || !hiBtn) return;
  enBtn.classList.toggle("active", language === "en");
  hiBtn.classList.toggle("active", language === "hi");
  enBtn.setAttribute("aria-pressed", language === "en");
  hiBtn.setAttribute("aria-pressed", language === "hi");
}

function updateReplyToggle() {
  const quickBtn = document.getElementById("quickToggle");
  const detailBtn = document.getElementById("detailToggle");
  if (!quickBtn || !detailBtn) return;
  quickBtn.classList.toggle("active", replyMode === "quick");
  detailBtn.classList.toggle("active", replyMode === "detail");
  quickBtn.setAttribute("aria-pressed", replyMode === "quick");
  detailBtn.setAttribute("aria-pressed", replyMode === "detail");
}

function applyLanguageText() {
  const text = UI_TEXT[language] || UI_TEXT.en;
  const userInput = document.getElementById("userInput");
  const btnText = document.getElementById("btnText");
  const btnLoader = document.getElementById("btnLoader");
  const newChatLabel = document.getElementById("navNewChatLabel");
  const searchChatsLabel = document.getElementById("navSearchLabel");
  const pinnedChatsLabel = document.getElementById("navPinnedLabel");
  const recentsLabel = document.getElementById("navRecentsLabel");
  const previousChatsLabel = document.getElementById("sidebarListLabel");
  const searchInput = document.getElementById("sidebarSearchInput");
  const settingsHeader = document.querySelector(".settings-menu-header");
  const settingsLabels = document.querySelectorAll(".settings-label");
  const quickToggle = document.getElementById("quickToggle");
  const detailToggle = document.getElementById("detailToggle");
  const welcome = document.querySelector(".bot-message.welcome");

  if (userInput) userInput.placeholder = text.inputPlaceholder;
  if (btnText) btnText.textContent = text.sendButton;
  if (btnLoader) btnLoader.textContent = text.loadingButton;
  if (newChatLabel) newChatLabel.textContent = text.newChat;
  if (searchChatsLabel) searchChatsLabel.textContent = text.searchChats;
  if (pinnedChatsLabel) pinnedChatsLabel.textContent = text.pinnedChats;
  if (recentsLabel) recentsLabel.textContent = text.recents;
  if (previousChatsLabel) previousChatsLabel.textContent = text.previousChats;
  if (searchInput) searchInput.placeholder = text.searchChats;
  if (settingsHeader) settingsHeader.textContent = text.settings;
  if (settingsLabels[0]) settingsLabels[0].textContent = text.outputType;
  if (settingsLabels[1]) settingsLabels[1].textContent = text.language;
  if (quickToggle) quickToggle.textContent = text.quick;
  if (detailToggle) detailToggle.textContent = text.detailed;
  if (welcome) {
    welcome.querySelector(".welcome-title").textContent = text.welcomeTitle;
    welcome.querySelector(".welcome-body").textContent = text.welcomeBody;
    welcome.querySelector(".welcome-disclaimer").textContent =
      text.welcomeDisclaimer;
  }
}

async function apiFetch(path, options = {}) {
  const token = getStoredToken();
  if (!isTokenValid(token)) {
    redirectToAuth();
    throw new Error("Unauthorized");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    redirectToAuth();
    throw new Error("Unauthorized");
  }

  return response;
}

// ─── Session Helpers ────────────────────────────────────────
async function getAllSessions() {
  const response = await apiFetch("/sessions");
  if (!response.ok) {
    throw new Error("Could not load sessions.");
  }
  return response.json();
}

function startNewSession() {
  currentSessionId = null;
  conversationHistory = [];
  clearChatWindow();
  syncHeroLayoutWithChat();
}

async function loadSession(sessionId) {
  const response = await apiFetch(`/sessions/${sessionId}/messages`);
  if (!response.ok) {
    throw new Error("Could not load session messages.");
  }
  const messages = await response.json();

  currentSessionId = sessionId;
  conversationHistory = [];
  clearChatWindow();

  let hasStrength = false;
  messages.forEach((msg) => {
    if (msg.role === "user") {
      appendUserMessage(msg.content, false);
      conversationHistory.push({ role: "user", content: msg.content });
      return;
    }

    if (msg.role === "assistant") {
      const { cleanText, score, positives, negatives } = parseResponse(msg.content);
      appendBotMessage(cleanText, msg.category || "", false);
      conversationHistory.push({ role: "assistant", content: cleanText });
      if (score !== null) {
        updateStrengthPanel(score, positives, negatives);
        hasStrength = true;
      }
    }
  });

  if (!hasStrength) {
    document.getElementById("strengthEmpty").classList.remove("hidden");
    document.getElementById("strengthResults").classList.add("hidden");
  }

  syncHeroLayoutWithChat();
  await renderSidebar();
}

async function loadLastSession() {
  try {
    const sessions = await getAllSessions();
    if (sessions.length > 0) {
      await loadSession(sessions[0].id);
      return;
    }
  } catch {
    // keep default empty state on error
  }
  startNewSession();
}

// ─── Sidebar Rendering ──────────────────────────────────────
async function renderSidebar() {
  const list = document.getElementById("sessionList");
  let sessions = [];

  try {
    sessions = await getAllSessions();
  } catch {
    list.innerHTML = `<p class="no-sessions">Could not load sessions.</p>`;
    return;
  }

  if (sessions.length === 0) {
    list.innerHTML = `<p class="no-sessions">No previous chats yet.</p>`;
    return;
  }

  let visibleSessions = sessions;
  if (sidebarView === "pinned") {
    visibleSessions = sessions.filter(
      (session) =>
        session?.is_pinned === true ||
        session?.pinned === true ||
        session?.isPinned === true ||
        (session?.title || "").trim().startsWith("📌"),
    );
  }

  if (sidebarView === "search" && sidebarSearchQuery) {
    visibleSessions = visibleSessions.filter((session) =>
      (session?.title || "").toLowerCase().includes(sidebarSearchQuery)
    );
  }

  if (sidebarView === "search" && !sidebarSearchQuery) {
    list.innerHTML = `<p class="no-sessions">Type to search your chats.</p>`;
    return;
  }

  if (visibleSessions.length === 0) {
    list.innerHTML =
      sidebarView === "pinned"
        ? `<p class="no-sessions">No pinned chats yet.</p>`
        : `<p class="no-sessions">No matching chats found.</p>`;
    return;
  }

  list.innerHTML = visibleSessions
    .map(
      (session) => `
    <div class="session-item ${session.id === currentSessionId ? "active" : ""}"
         onclick="loadSession(${session.id})">
      <div class="session-info">
        <span class="session-title">${escapeHtml(session.title)}</span>
        <span class="session-date">${formatDate(session.created_at)}</span>
      </div>
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
  syncHeroLayoutWithChat();
}

function showWelcomeMessage() {
  const chatWindow = document.getElementById("chatWindow");
  const text = UI_TEXT[language] || UI_TEXT.en;
  const div = document.createElement("div");
  div.className = "message bot-message welcome";
  div.innerHTML = `
    <div class="bot-avatar">⚖️</div>
    <div class="message-content">
      <p><strong class="welcome-title">${text.welcomeTitle}</strong></p>
      <p class="welcome-body">${text.welcomeBody}</p>
      <p class="disclaimer welcome-disclaimer">${text.welcomeDisclaimer}</p>
    </div>
  `;
  chatWindow.appendChild(div);
}

document.getElementById("userInput").addEventListener("input", function () {
  const count = this.value.length;
  document.getElementById("charCount").textContent = `${count} / 2000`;
  document.getElementById("charCount").style.color =
    count > 1900 ? "#ef4444" : "#64748b";
  this.style.height = "auto";
  this.style.height = `${Math.min(this.scrollHeight, 220)}px`;
  this.style.overflowY = this.scrollHeight > 220 ? "auto" : "hidden";
});

function handleKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submitQuery();
  }
}

async function submitQuery() {
  if (isLoading) return;
  if (!ensureAuthenticated()) {
    redirectToAuth();
    return;
  }

  const input = document.getElementById("userInput").value.trim();
  if (!input || input.length < 10) {
    showError("Please describe your problem in a bit more detail.");
    return;
  }

  setLoading(true);
  appendUserMessage(input);
  const inputEl = document.getElementById("userInput");
  inputEl.value = "";
  inputEl.style.height = "";
  inputEl.style.overflowY = "hidden";
  document.getElementById("charCount").textContent = "0 / 2000";

  const typingId = showTyping();

  try {
    const response = await apiFetch("/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        problem: input,
        conversation_history: conversationHistory,
        reply_mode: replyMode,
        language: language,
        session_id: currentSessionId,
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
    if (data.session_id) currentSessionId = data.session_id;

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

    appendBotMessage(cleanText, data.detected_category, data.urgency);

    // Update strength panel
    if (score !== null) {
      updateStrengthPanel(score, positives, negatives);
    }
    await renderSidebar();
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
  syncHeroLayoutWithChat();
  scrollToBottom();
}

function appendBotMessage(text, category = "", urgency = "normal", save = true) {
  const chatWindow = document.getElementById("chatWindow");
  const shouldAutoScroll = isNearBottom(chatWindow);
  const div = document.createElement("div");
  div.className = "message bot-message";

  const categoryLabel =
    category && category !== "general" && category !== "error"
      ? `<div class="category-badge">📂 ${formatCategory(category)}</div>`
      : "";

  const urgencyBanner = urgency === "high"
    ? `<div class="urgency-banner">
        🚨 EMERGENCY - CALL IMMEDIATELY<br>
        Police: <strong>100</strong> | Women's Helpline: <strong>181</strong> | General Emergency: <strong>112</strong>
      </div>`
    : "";

  const cleanText = text
    .replace(/---CASE_ANALYSIS_START---[\s\S]*?---CASE_ANALYSIS_END---/g, "")
    .replace(/---CASE_ANALYSIS_START---[\s\S]*$/g, "")
    .trim();
  
  const shareLink = `https://wa.me/?text=${encodeURIComponent(cleanText)}`;
  const msgId = `msg-${Date.now()}`;
  
  const shareButton = `<button class="whatsapp-share" onclick="window.open('${shareLink}', '_blank')" title="Share on WhatsApp">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.403h-.004a9.87 9.87 0 00-5.031 1.378c-1.557.927-2.751 2.236-3.584 3.787-1.269 2.369-.666 5.048.193 6.978 1.305 2.937 4.165 5.031 7.437 5.031 1.686 0 3.248-.374 4.681-1.076l.335-.16 3.332.869-.902-3.319.19-.303a9.325 9.325 0 001.428-4.19c.105-1.12.032-2.297-.288-3.415-.547-1.607-1.557-3.083-2.982-4.209C15.258 2.39 12.274 1.979 11.051 1.979z"/>
    </svg>
    Share
  </button>`;

  const pdfButton = `<button class="pdf-export" onclick="exportToPDF('${msgId}', '${encodeURIComponent(cleanText)}')" title="Export as PDF">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
    PDF
  </button>`;

  div.innerHTML = `
    <div class="bot-avatar">⚖️</div>
    <div class="message-content">
      ${urgencyBanner}
      ${categoryLabel}
      <div class="response-block">${formatResponse(text)}</div>
      <div class="message-actions">${shareButton}${pdfButton}</div>
    </div>
  `;
  chatWindow.appendChild(div);
  syncHeroLayoutWithChat();
  if (shouldAutoScroll) scrollToBottom();
}

function formatResponse(text) {
  const cleanText = text
    .replace(/---CASE_ANALYSIS_START---[\s\S]*?---CASE_ANALYSIS_END---/g, "")
    .replace(/---CASE_ANALYSIS_START---[\s\S]*$/g, "")
    .trim();

  const mdHtml = marked.parse(cleanText);

  return mdHtml
    .replace(/🔍 ISSUE TYPE/g, "<strong>🔍 ISSUE TYPE</strong>")
    .replace(/📋 STEPS TO TAKE/g, "<strong>📋 STEPS TO TAKE</strong>")
    .replace(/🏛️ WHERE TO FILE COMPLAINT/g, "<strong>🏛️ WHERE TO FILE COMPLAINT</strong>")
    .replace(/⚖️ YOUR RIGHTS/g, "<strong>⚖️ YOUR RIGHTS</strong>")
    .replace(/💡 IMPORTANT TIP/g, "<strong>💡 IMPORTANT TIP</strong>")
    .replace(
      /<a href="(https?:\/\/[^"]+)">/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#1a56db">',
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

function togglePoints(type) {
  const posBox = document.getElementById("positivePoints");
  const negBox = document.getElementById("negativePoints");

  if (type === "positive") {
    posBox.classList.toggle("hidden");
  } else {
    negBox.classList.toggle("hidden");
  }
}

function stripEmojis(text) {
  return text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu, '').trim();
}

function containsDevanagari(text) {
  return /[\u0900-\u097F]/.test(text);
}

async function exportToPDF(msgId, encodedText) {
  try {
    const text = decodeURIComponent(encodedText);
    
    if (containsDevanagari(text)) {
      generateHTMLPDF(text);
    } else {
      const cleanText = stripEmojis(text);
      if (typeof window.jsPDF === "undefined") {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.onload = () => generateJsPDF(cleanText);
        script.onerror = () => alert("Failed to load PDF library");
        document.head.appendChild(script);
      } else {
        generateJsPDF(cleanText);
      }
    }
  } catch (err) {
    alert("Error exporting PDF");
    console.error(err);
  }
}

function generateJsPDF(text) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const textWidth = pageWidth - 2 * margin;
  
  const date = new Date().toLocaleDateString('en-IN');
  
  doc.setFontSize(20);
  doc.setTextColor(26, 86, 219);
  doc.text("Advocare", margin, margin + 5);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text("AI Legal Assistant for Indian Citizens", margin, margin + 12);
  
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, margin + 15, pageWidth - margin, margin + 15);
  
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  
  const splitText = doc.splitTextToSize(text, textWidth);
  let yPosition = margin + 25;
  
  splitText.forEach((line) => {
    if (yPosition > pageHeight - 30) {
      doc.addPage();
      yPosition = margin;
    }
    doc.text(line, margin, yPosition);
    yPosition += 6;
  });
  
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);
  
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Disclaimer: This is AI-generated information and NOT legal advice.", margin, pageHeight - 14);
  doc.text(`Exported on ${date}`, margin, pageHeight - 10);
  
  doc.save("legal-advice.pdf");
}

function generateHTMLPDF(text) {
  const date = new Date().toLocaleDateString('en-IN');
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Legal Advice</title>
      <style>
        @media print {
          body { margin: 0; padding: 0; }
          .print-break { page-break-inside: avoid; }
        }
        body {
          font-family: "Segoe UI", Arial, sans-serif;
          margin: 20px;
          line-height: 1.6;
          color: #1e293b;
        }
        .header {
          text-align: center;
          margin-bottom: 20px;
          border-bottom: 2px solid #ccc;
          padding-bottom: 15px;
        }
        .header h1 {
          font-size: 24px;
          color: #1a56db;
          margin: 0;
        }
        .header p {
          font-size: 14px;
          color: #64748b;
          margin: 5px 0 0 0;
        }
        .content {
          font-size: 14px;
          line-height: 1.8;
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        .footer {
          margin-top: 30px;
          padding-top: 15px;
          border-top: 1px solid #ccc;
          font-size: 11px;
          color: #64748b;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Advocare</h1>
        <p>AI Legal Assistant for Indian Citizens</p>
      </div>
      <div class="content">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      <div class="footer">
        <p>Disclaimer: This is AI-generated information and NOT legal advice.</p>
        <p>Exported on ${date}</p>
      </div>
    </body>
    </html>
  `;
  
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  
  iframe.onload = () => {
    iframe.contentDocument.write(htmlContent);
    iframe.contentDocument.close();
    setTimeout(() => {
      iframe.contentWindow.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 100);
    }, 500);
  };
  
  iframe.src = 'about:blank';
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar?.classList.toggle("active");
}

function closeLanguageSubmenu() {
  const languageMenu = document.getElementById("profileLanguageMenu");
  if (!languageMenu) return;
  languageMenu.classList.remove("open");
  languageMenu.setAttribute("aria-expanded", "false");
}

function toggleProfileMenu(event) {
  event.stopPropagation();
  const item = event.target.closest(".profile-menu-item");
  if (item) {
    if (item.id === "profileLanguageMenu") {
      return;
    }
    const text = item.textContent.trim();
    if (text === "Privacy Policy") {
      window.location.href = "privacy.html";
      return;
    }
    if (text === "Contact Us") {
      window.location.href = "contact.html";
      return;
    }
    if (text === "Logout") {
      logout();
      return;
    }
  }
  const dropdown = document.getElementById("profileDropdown");
  if (!dropdown) return;
  const nextHidden = !dropdown.classList.contains("hidden");
  dropdown.classList.toggle("hidden");
  if (nextHidden) {
    closeLanguageSubmenu();
  }
}

function toggleLanguageSubmenu(event) {
  event.stopPropagation();
  const languageMenu = document.getElementById("profileLanguageMenu");
  if (!languageMenu) return;
  const willOpen = !languageMenu.classList.contains("open");
  languageMenu.classList.toggle("open");
  languageMenu.setAttribute("aria-expanded", willOpen ? "true" : "false");
}

function openProfilePage(event) {
  event.stopPropagation();
  window.location.href = "profile.html";
}

function selectProfileLanguage(event, lang) {
  event.stopPropagation();
  setLanguage(lang);
  closeLanguageSubmenu();
  document.getElementById("profileDropdown")?.classList.add("hidden");
}

document.addEventListener("click", function (event) {
  const profileContainer = document.getElementById("profileContainer");
  const dropdown = document.getElementById("profileDropdown");
  if (!profileContainer || !dropdown) return;
  const item = event.target.closest(".profile-menu-item");
  if (item) {
    const text = item.textContent.trim();
    if (text === "Privacy Policy") {
      window.location.href = "privacy.html";
      return;
    }
    if (text === "Contact Us") {
      window.location.href = "contact.html";
      return;
    }
    if (text === "Logout") {
      logout();
      return;
    }
  }
  if (!profileContainer.contains(event.target)) {
    dropdown.classList.add("hidden");
    closeLanguageSubmenu();
  }
});

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  conversationHistory = [];
  currentSessionId = null;
  isLoading = false;
  window.location.href = "auth.html?tab=login";
}

// ═══════════════════════════════════════════════════════
// STRENGTH PANEL REDESIGN
// ═══════════════════════════════════════════════════════
let panelCollapsed = localStorage.getItem("panelCollapsed") === "true";
let panelWidth = parseInt(localStorage.getItem("panelWidth")) || 260;


function initStrengthPanel() {
  const panel = document.getElementById("strengthPanel");
  if (!panel) return;

  const handle = document.querySelector(".strength-resize-handle");
  const toggleBtn = document.getElementById("strengthToggleBtn");
  const expandBtn = document.getElementById("strengthExpandBtn");
  const collapsed = document.getElementById("strengthCollapsed");

  updatePanelState();

  if (handle) {
    handle.addEventListener("mousedown", startResize);
  }

  if (toggleBtn) {
    toggleBtn.addEventListener("click", collapsePanelToggle);
  }
  
  if (expandBtn) {
    expandBtn.addEventListener("click", expandPanel);
  }

  if (collapsed) {
    collapsed.addEventListener("click", expandPanel);
  }
}

function startResize(e) {
  if (panelCollapsed) return;
  e.preventDefault();
  const panel = document.getElementById("strengthPanel");
  const startX = e.clientX;
  const startW = panel.offsetWidth;

  const doResize = (e) => {
    let newW = startW + (e.clientX - startX);
    newW = Math.max(60, Math.min(newW, 400));
    panel.style.width = newW + "px";
  };

  const stopResize = () => {
    document.removeEventListener("mousemove", doResize);
    document.removeEventListener("mouseup", stopResize);
    panelWidth = document.getElementById("strengthPanel").offsetWidth;
    localStorage.setItem("panelWidth", panelWidth);
  };

  document.addEventListener("mousemove", doResize);
  document.addEventListener("mouseup", stopResize);
}

function collapsePanelToggle() {
  panelCollapsed = !panelCollapsed;
  localStorage.setItem("panelCollapsed", panelCollapsed);
  updatePanelState();
}

function expandPanel() {
  panelCollapsed = false;
  localStorage.setItem("panelCollapsed", "false");
  updatePanelState();
}

function updatePanelState() {
  const panel = document.getElementById("strengthPanel");
  const content = document.getElementById("strengthContent");
  const collapsed = document.getElementById("strengthCollapsed");
  const handle = document.querySelector(".strength-resize-handle");

  if (panelCollapsed) {
    content.classList.add("hidden");
    collapsed.classList.remove("hidden");
    if (handle) handle.style.display = "none";
    if (panel) panel.style.width = "56px";
  } else {
    content.classList.remove("hidden");
    collapsed.classList.add("hidden");
    if (handle) handle.style.display = "block";
    if (panel) panel.style.width = panelWidth + "px";
  }
}

function updateStrengthPanel(score, positives, negatives) {
  document.getElementById("strengthEmpty").classList.add("hidden");
  document.getElementById("strengthResults").classList.remove("hidden");

  const color = score >= 65 ? "#059669" : score >= 40 ? "#f59e0b" : "#ef4444";
  document.getElementById("scoreDisplay").innerHTML =
    `<span style="color:${color}">${score}%</span><br>
     <span style="font-size:13px;font-weight:500;color:#64748b">Case Strength</span>`;

  const barRed = document.getElementById("barRed");
  const barGreen = document.getElementById("barGreen");
  if (barRed) barRed.style.width = `${100 - score}%`;
  if (barGreen) barGreen.style.width = `${score}%`;

  const posBox = document.getElementById("positivePoints");
  const negBox = document.getElementById("negativePoints");

  posBox.className = "points-box green-box";
  posBox.innerHTML = "<ul>" + positives.map((p) => `<li>✦ ${escapeHtml(p)}</li>`).join("") + "</ul>";

  negBox.className = "points-box red-box";
  negBox.innerHTML = "<ul>" + negatives.map((n) => `<li>⚠ ${escapeHtml(n)}</li>`).join("") + "</ul>";
}
