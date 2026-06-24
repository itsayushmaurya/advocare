const API_BASE = "http://localhost:8000";
const TOKEN_KEY = "advocare_token";
let conversationHistory = [];
let isLoading = false;
let currentSessionId = null;
let isSidebarCollapsed = localStorage.getItem("sidebarCollapsed") === "true";
let sidebarView = localStorage.getItem("sidebarView") || "recents"; // 'recents' or 'pinned'
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
  
  const activeNavId = sidebarView === "pinned" ? "navPinned" : "navRecents";
  setSidebarActiveNav(activeNavId);

  updateHeroGreeting();
  await loadCurrentUser();
  applySidebarState();
  initStrengthPanel();
  await renderSidebar();
  await loadInitialSession();
  updateReplyToggle();
  updateLanguageToggle();
  applyLanguageText();
  initSidebarExpandOnClick();
  initGlobalSearchShortcuts();
});

function initGlobalSearchShortcuts() {
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      openGlobalSearch();
    }
    if (e.key === "Escape") {
      closeGlobalSearch();
      closeSidebarPopout();
      closeSessionMenu();
      cancelInlineRename();
    }
  });
}

function openGlobalSearch() {
  const modal = document.getElementById("searchModal");
  const input = document.getElementById("globalSearchInput");
  if (!modal || !input) return;

  modal.classList.remove("hidden");
  input.value = "";
  input.focus();
  document.getElementById("globalSearchResults").innerHTML =
    '<p class="search-hint">Type to search through all your chats...</p>';
}

function closeGlobalSearch() {
  document.getElementById("searchModal")?.classList.add("hidden");
}

async function handleGlobalSearch() {
  const query = document.getElementById("globalSearchInput").value.trim().toLowerCase();
  const resultsContainer = document.getElementById("globalSearchResults");

  if (!query) {
    resultsContainer.innerHTML = '<p class="search-hint">Type to search through all your chats...</p>';
    return;
  }

  if (query.length < 2) return;

  try {
    const sessions = await getAllSessions();
    const results = [];

    for (const session of sessions) {
      let match = false;
      let snippet = "";

      if (session.title.toLowerCase().includes(query)) {
        match = true;
      }

      const resp = await apiFetch(`/sessions/${session.id}/messages`);
      const messages = await resp.json();
      
      for (const msg of messages) {
        if (msg.content.toLowerCase().includes(query)) {
          match = true;
          if (!snippet) {
            const index = msg.content.toLowerCase().indexOf(query);
            const start = Math.max(0, index - 40);
            const end = Math.min(msg.content.length, index + query.length + 60);
            snippet = (start > 0 ? "..." : "") + msg.content.substring(start, end) + (end < msg.content.length ? "..." : "");
          }
        }
      }

      if (match) {
        results.push({
          id: session.id,
          title: session.title,
          snippet: snippet || "Matched in title",
        });
      }
    }

    if (results.length === 0) {
      resultsContainer.innerHTML = '<p class="search-hint">No chats found matching your search.</p>';
      return;
    }

    resultsContainer.innerHTML = results
      .map(
        (res) => `
      <div class="search-result-item" onclick="loadAndCloseSearch(${res.id})">
        <div class="search-result-title">${highlightText(res.title, query)}</div>
        <div class="search-result-snippet">${highlightText(res.snippet, query)}</div>
      </div>
    `,
      )
      .join("");
  } catch (err) {
    console.error("Search error:", err);
    resultsContainer.innerHTML = '<p class="search-hint">Error performing search.</p>';
  }
}

function highlightText(text, query) {
  if (!query) return text;
  const regex = new RegExp(`(${query})`, "gi");
  return text.replace(regex, '<span class="highlight">$1</span>');
}

async function loadAndCloseSearch(sessionId) {
  closeGlobalSearch();
  await loadSession(sessionId);
}

function initSidebarExpandOnClick() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  sidebar.addEventListener("click", (e) => {
    if (!e.target.closest(".sidebar-nav-item") && !e.target.closest(".action-menu") && !e.target.closest(".inline-rename-input")) {
      closeSidebarPopout();
    }

    if (isSidebarCollapsed) {
      if (!e.target.closest("#sidebarToggle") && !e.target.closest(".sidebar-nav-item")) {
        toggleSidebarCollapse();
      }
    }
  });
}

function applySidebarState() {
  const appLayout = document.getElementById("appLayout");
  const toggleBtn = document.getElementById("sidebarToggle");
  if (!appLayout || !toggleBtn) return;

  appLayout.classList.toggle("sidebar-collapsed", isSidebarCollapsed);
  toggleBtn.textContent = isSidebarCollapsed ? "▶" : "◀";
  toggleBtn.title = isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
  toggleBtn.setAttribute("aria-label", toggleBtn.title);
  
  if (!isSidebarCollapsed) {
    closeSidebarPopout();
  }
}

function toggleSidebarCollapse(event) {
  if (event) event.stopPropagation();
  isSidebarCollapsed = !isSidebarCollapsed;
  localStorage.setItem("sidebarCollapsed", isSidebarCollapsed);
  applySidebarState();
}

function setSidebarActiveNav(navId) {
  document.querySelectorAll(".sidebar-nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.id === navId);
    if (btn.id === "navPinned") {
      btn.classList.toggle("active-toggle", sidebarView === "pinned");
    }
  });
}

async function handleSidebarNav(action) {
  if (isSidebarCollapsed) {
    if (action === "recents") {
      await openSidebarPopout("recents");
    } else if (action === "pinned") {
      await openSidebarPopout("pinned");
    } else if (action === "new") {
      toggleSidebarCollapse();
      startNewSession();
    }
    return;
  }

  if (action === "new") {
    startNewSession();
  } else if (action === "pinned") {
    sidebarView = sidebarView === "pinned" ? "recents" : "pinned";
    localStorage.setItem("sidebarView", sidebarView);
    setSidebarActiveNav(sidebarView === "pinned" ? "navPinned" : "navRecents");
    await renderSidebar();
  } else if (action === "recents") {
    sidebarView = "recents";
    localStorage.setItem("sidebarView", sidebarView);
    setSidebarActiveNav("navRecents");
    await renderSidebar();
  }
}

async function openSidebarPopout(type) {
  const popout = document.getElementById("sidebarPopout");
  const title = document.getElementById("popoutTitle");
  const list = document.getElementById("popoutList");
  const text = UI_TEXT[language] || UI_TEXT.en;

  if (!popout || !title || !list) return;

  title.textContent = type === "pinned" ? text.pinnedChats : text.recents;
  popout.classList.remove("hidden");

  let sessions = await getAllSessions();
  let visible = sessions;

  if (type === "pinned") {
    visible = sessions.filter(s => s.is_pinned).slice(0, 10);
  } else {
    visible = sessions.slice(0, 10);
  }

  if (visible.length === 0) {
    list.innerHTML = `<p class="no-sessions">No chats found.</p>`;
  } else {
    list.innerHTML = visible
      .map(
        (s) => `
      <div class="session-item" onclick="loadAndClosePopout(${s.id})">
        <div class="session-info">
          <span class="session-title">${escapeHtml(s.title)}</span>
          <span class="session-date">${formatDate(s.updated_at)}</span>
        </div>
        <button class="session-actions-btn" 
                onclick="toggleSessionMenu(event, ${s.id}, ${s.is_pinned}, '${encodeURIComponent(s.title)}')" 
                title="More actions">
          <i data-lucide="more-horizontal"></i>
        </button>
      </div>
    `
      )
      .join("");
  }
  if (window.lucide?.createIcons) window.lucide.createIcons();
}

function closeSidebarPopout() {
  document.getElementById("sidebarPopout")?.classList.add("hidden");
}

async function loadAndClosePopout(sessionId) {
  closeSidebarPopout();
  await loadSession(sessionId);
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
  resetStrengthPanel();
  document.getElementById("chatHeader")?.classList.add("hidden");
  const activeTitleEl = document.getElementById("activeChatTitle");
  if (activeTitleEl) activeTitleEl.textContent = "Chat";
  clearSessionFromUrl();
  syncHeroLayoutWithChat();
}

async function loadSession(sessionId) {
  const response = await apiFetch(`/sessions/${sessionId}/messages`);
  if (!response.ok) {
    throw new Error("Could not load session messages.");
  }
  const messages = await response.json();

  const sessions = await getAllSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (session) {
    const header = document.getElementById("chatHeader");
    const titleEl = document.getElementById("activeChatTitle");
    if (header && titleEl) {
      titleEl.textContent = session.title;
      header.classList.remove("hidden");
    }
  }

  currentSessionId = sessionId;
  conversationHistory = [];
  clearChatWindow();
  resetStrengthPanel();

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
  } catch { }
  startNewSession();
}

async function loadInitialSession() {
  const shareSessionId = getSessionIdFromUrl();
  if (shareSessionId) {
    try {
      await loadSession(shareSessionId);
      return;
    } catch (err) {
      console.error(err);
    }
  }

  await loadLastSession();
}

// ─── Sidebar Rendering ──────────────────────────────────────
let activeMenuSessionId = null;
let renamingSessionId = null;

async function renderSidebar() {
  const list = document.getElementById("sessionList");
  const label = document.getElementById("sidebarListLabel");
  const text = UI_TEXT[language] || UI_TEXT.en;
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

  let visibleSessions = [];
  const pinnedSessions = sessions.filter((s) => s.is_pinned).slice(0, 10);
  const unpinnedSessions = sessions.filter((s) => !s.is_pinned);

  if (sidebarView === "pinned") {
    if (label) label.textContent = text.pinnedChats;
    visibleSessions = pinnedSessions;
  } else {
    if (label) label.textContent = text.recents;
    visibleSessions = [...pinnedSessions, ...unpinnedSessions];
  }

  if (visibleSessions.length === 0) {
    list.innerHTML = `<p class="no-sessions">No chats found.</p>`;
    return;
  }

  list.innerHTML = visibleSessions
    .map((session) => {
      const isActive = session.id === currentSessionId;
      const isRenaming = session.id === renamingSessionId;

      return `
    <div class="session-item ${isActive ? "active" : ""}"
         onclick="${isRenaming ? "" : `loadSession(${session.id})`}">
      <div class="session-info">
        ${
          isRenaming
            ? `<input type="text" class="inline-rename-input" id="renameInput-${session.id}" 
                      value="${escapeHtml(session.title)}" 
                      onclick="event.stopPropagation()"
                      onkeydown="handleRenameKey(event, ${session.id})" 
                      onblur="cancelInlineRename()">`
            : `<span class="session-title">${escapeHtml(session.title)}</span>`
        }
        <span class="session-date">${formatDate(session.updated_at)}</span>
      </div>
      ${
        isRenaming
          ? ""
          : `
      <button class="session-actions-btn" 
              onclick="toggleSessionMenu(event, ${session.id}, ${session.is_pinned}, '${encodeURIComponent(session.title)}')" 
              title="More actions">
        <i data-lucide="more-horizontal"></i>
      </button>`
      }
    </div>
  `;
    })
    .join("");

  if (window.lucide?.createIcons) window.lucide.createIcons();

  if (renamingSessionId) {
    const input = document.getElementById(`renameInput-${renamingSessionId}`);
    if (input) {
      input.focus();
      input.select();
    }
  }
}

function handleRenameKey(event, sessionId) {
  event.stopPropagation();
  if (event.key === "Enter") {
    confirmInlineRename(sessionId);
  } else if (event.key === "Escape") {
    cancelInlineRename();
  }
}

async function confirmInlineRename(sessionId) {
  const input = document.getElementById(`renameInput-${sessionId}`);
  const newTitle = input?.value.trim();
  if (!newTitle) {
    cancelInlineRename();
    return;
  }

  try {
    const response = await apiFetch(`/sessions/${sessionId}/rename`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });
    if (!response.ok) throw new Error("Failed to rename");
    
    renamingSessionId = null;
    const activeTitleEl = document.getElementById("activeChatTitle");
    if (currentSessionId === sessionId && activeTitleEl) {
      activeTitleEl.textContent = newTitle;
    }
    await renderSidebar();
  } catch (err) {
    console.error(err);
    alert("Error renaming session");
    cancelInlineRename();
  }
}

function cancelInlineRename() {
  renamingSessionId = null;
  renderSidebar();
}

function toggleSessionMenu(event, sessionId, isPinned, title) {
  event.stopPropagation();
  const menu = document.getElementById("sessionActionMenu");
  const btn = event.currentTarget;
  
  if (activeMenuSessionId === sessionId && !menu.classList.contains("hidden")) {
    closeSessionMenu();
    return;
  }

  activeMenuSessionId = sessionId;
  
  const pinToggle = document.getElementById("menuPinToggle");
  if (pinToggle) {
    pinToggle.innerHTML = isPinned 
      ? '<i data-lucide="pin-off"></i> Unpin' 
      : '<i data-lucide="pin"></i> Pin';
  }

  const rect = btn.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 5}px`;
  menu.style.left = `${rect.left - 130}px`;
  menu.classList.remove("hidden");
  btn.classList.add("active");

  if (window.lucide?.createIcons) window.lucide.createIcons();

  setTimeout(() => {
    document.addEventListener("click", closeSessionMenuOnClickOutside);
  }, 0);
}

function closeSessionMenu() {
  const menu = document.getElementById("sessionActionMenu");
  if (menu) menu.classList.add("hidden");
  document.querySelectorAll(".session-actions-btn").forEach(b => b.classList.remove("active"));
  document.removeEventListener("click", closeSessionMenuOnClickOutside);
}

function closeSessionMenuOnClickOutside(event) {
  const menu = document.getElementById("sessionActionMenu");
  if (menu && !menu.contains(event.target)) {
    closeSessionMenu();
  }
}

async function handleSessionAction(action) {
  const sessionId = activeMenuSessionId;
  closeSessionMenu();

  if (action === "pin") {
    await togglePinSession(sessionId);
  } else if (action === "rename") {
    renamingSessionId = sessionId;
    renderSidebar();
  } else if (action === "delete") {
    if (confirm("Are you sure you want to delete this chat?")) {
      await deleteSession(sessionId);
    }
  } else if (action === "share") {
    shareSession(sessionId);
  }
}

async function deleteSession(sessionId) {
  try {
    const response = await apiFetch(`/sessions/${sessionId}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("Failed to delete");
    
    if (currentSessionId === sessionId) {
      startNewSession();
    }
    await renderSidebar();
  } catch (err) {
    console.error(err);
    alert("Error deleting session");
  }
}

function shareSession(sessionId) {
  currentSessionId = sessionId; // Ensure we focus on this session
  openShareModal();
}

async function openShareModal() {
  const modal = document.getElementById("shareModal");
  const linkInput = document.getElementById("shareLinkInput");
  if (!modal || !linkInput) return;

  modal.classList.remove("hidden");
  linkInput.value = getShareableChatLink();
  linkInput.focus();
  linkInput.select();
}

function closeShareModal() {
  document.getElementById("shareModal")?.classList.add("hidden");
}

function copyShareLink() {
  const link = document.getElementById("shareLinkInput")?.value || getShareableChatLink();
  copyTextToClipboard(link)
    .then(() => {
      const button = document.querySelector(".share-copy-btn");
      if (button) {
        button.classList.add("copied");
        clearTimeout(button._copyFeedbackTimer);
        button._copyFeedbackTimer = setTimeout(() => {
          button.classList.remove("copied");
        }, 2000);
      }
    })
    .catch(() => alert("Failed to copy link."));
}

async function exportCurrentChatToText() {
  if (!currentSessionId) return;
  try {
    const response = await apiFetch(`/sessions/${currentSessionId}/messages`);
    const messages = await response.json();
    
    let text = "ADVOCARE - LEGAL CHAT EXPORT\n";
    text += "============================\n\n";
    
    messages.forEach(m => {
      const role = m.role.toUpperCase();
      const content = m.content
        .replace(/---CASE_ANALYSIS_START---[\s\S]*?---CASE_ANALYSIS_END---/g, "")
        .replace(/---CASE_ANALYSIS_START---[\s\S]*$/g, "")
        .trim();
      text += `${role}:\n${content}\n\n`;
    });
    
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `advocare-chat-${currentSessionId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Failed to export chat.");
  }
}

async function exportCurrentChatToPDF() {
  if (!currentSessionId) return;
  try {
    const response = await apiFetch(`/sessions/${currentSessionId}/messages`);
    const messages = await response.json();
    const transcript = buildChatTranscript(messages);

    if (containsDevanagari(transcript)) {
      generateHTMLPDF(transcript);
    } else {
      const cleanText = stripEmojis(transcript);
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
    alert("Failed to export chat.");
  }
}

async function shareCurrentChatOnWhatsApp() {
  const link = getShareableChatLink();
  const shareText = `Check out this Advocare chat: ${link}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  window.open(whatsappUrl, "_blank", "noopener,noreferrer");
}

function getShareableChatLink() {
  const url = new URL(window.location.href);
  if (currentSessionId) {
    url.searchParams.set("session", currentSessionId);
  } else {
    url.searchParams.delete("session");
  }
  url.hash = "";
  return url.toString();
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Copy command failed");
  }
}

function buildChatTranscript(messages) {
  let text = "ADVOCARE - LEGAL CHAT EXPORT\n";
  text += "============================\n\n";

  messages.forEach((m) => {
    const role = m.role.toUpperCase();
    const content = m.content
      .replace(/---CASE_ANALYSIS_START---[\s\S]*?---CASE_ANALYSIS_END---/g, "")
      .replace(/---CASE_ANALYSIS_START---[\s\S]*$/g, "")
      .trim();
    text += `${role}:\n${content}\n\n`;
  });

  return text.trim();
}

function getSessionIdFromUrl() {
  const sessionId = new URL(window.location.href).searchParams.get("session");
  return sessionId && sessionId.trim() ? sessionId.trim() : null;
}

async function togglePinSession(sessionId, event) {
  if (event) event.stopPropagation();
  try {
    const response = await apiFetch(`/sessions/${sessionId}/pin`, {
      method: "PATCH",
    });
    if (!response.ok) {
      if (response.status === 400) {
        const errorData = await response.json();
        alert(errorData.detail);
        return;
      }
      throw new Error("Failed to toggle pin");
    }
    await renderSidebar();
  } catch (err) {
    console.error(err);
    alert("Error pinning session");
  }
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
  const cw = document.getElementById("chatWindow");
  if (cw) cw.innerHTML = "";
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
    });

    appendBotMessage(cleanText, data.detected_category, data.urgency);

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
  const copyButton = `<button type="button" class="copy-response-btn" onclick="copyResponseText(this)" title="Copy response" aria-label="Copy response" data-copy-text="${encodeURIComponent(cleanText)}">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
    <span class="copy-feedback" aria-live="polite">Copied!</span>
  </button>`;

  div.innerHTML = `
    <div class="bot-avatar">⚖️</div>
    <div class="message-content">
      ${urgencyBanner}
      ${categoryLabel}
      <div class="response-block">${formatResponse(text)}</div>
      ${copyButton}
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
    traffic: "Traffic / RTO",
    banking: "Banking / Finance",
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
  if (btn) {
    document.getElementById("btnText").classList.toggle("hidden", state);
    document.getElementById("btnLoader").classList.toggle("hidden", !state);
    btn.disabled = state;
  }
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
  if (input) {
    input.style.borderColor = "#ef4444";
    setTimeout(() => {
      input.style.borderColor = "";
    }, 2000);
  }
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
    cleanText = fullText
      .replace(/---CASE_ANALYSIS_START---[\s\S]*?---CASE_ANALYSIS_END---/, "")
      .replace(/---CASE_ANALYSIS_START---[\s\S]*$/, "")
      .trim();

    const scoreMatch = block.match(/STRENGTH_SCORE:\s*(\d+)/);
    if (scoreMatch) score = parseInt(scoreMatch[1]);

    const posSection = block.match(
      /POSITIVE_POINTS:([\s\S]*?)(?:NEGATIVE_POINTS:|---CASE_ANALYSIS_END---|$)/,
    );
    if (posSection) {
      positives = posSection[1]
        .trim()
        .split("\n")
        .map((l) => l.replace(/^-\s*/, "").trim())
        .filter(Boolean);
    }

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

async function copyResponseText(button) {
  const encodedText = button?.dataset?.copyText || "";
  const text = decodeURIComponent(encodedText);

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      textarea.style.left = "-9999px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (!copied) {
        throw new Error("Copy command failed");
      }
    }

    if (button._copyFeedbackTimer) {
      clearTimeout(button._copyFeedbackTimer);
    }
    button.classList.add("copied");
    button._copyFeedbackTimer = setTimeout(() => {
      button.classList.remove("copied");
      button._copyFeedbackTimer = null;
    }, 2000);
  } catch (err) {
    console.error(err);
    alert("Failed to copy the response.");
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
  const dropdown = document.getElementById("profileDropdown");
  if (!dropdown) return;
  const isHidden = dropdown.classList.contains("hidden");
  dropdown.classList.toggle("hidden", !isHidden);
  if (!isHidden) closeLanguageSubmenu();
}

function toggleLanguageSubmenu(event) {
  event.stopPropagation();
  const languageMenu = document.getElementById("profileLanguageMenu");
  if (!languageMenu) return;
  const willOpen = !languageMenu.classList.contains("open");
  languageMenu.classList.toggle("open", willOpen);
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
  if (profileContainer && dropdown && !profileContainer.contains(event.target)) {
    dropdown.classList.add("hidden");
    closeLanguageSubmenu();
  }
});

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = "auth.html?tab=login";
}

// ═══════════════════════════════════════════════════════
// STRENGTH PANEL
// ═══════════════════════════════════════════════════════
let panelCollapsed = localStorage.getItem("panelCollapsed") === "true";
let panelWidth = parseInt(localStorage.getItem("panelWidth")) || 260;

function initStrengthPanel() {
  const panel = document.getElementById("strengthPanel");
  if (!panel) return;
  updatePanelState();
  const handle = document.querySelector(".strength-resize-handle");
  if (handle) handle.addEventListener("mousedown", startResize);
  document.getElementById("strengthToggleBtn")?.addEventListener("click", collapsePanelToggle);
  document.getElementById("strengthExpandBtn")?.addEventListener("click", expandPanel);
  document.getElementById("strengthCollapsed")?.addEventListener("click", expandPanel);
}

function startResize(e) {
  if (panelCollapsed) return;
  e.preventDefault();
  const startX = e.clientX;
  const startW = document.getElementById("strengthPanel").offsetWidth;
  const doResize = (e) => {
    let newW = startW + (startX - e.clientX);
    newW = Math.max(60, Math.min(newW, 400));
    document.getElementById("strengthPanel").style.width = newW + "px";
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
    content?.classList.add("hidden");
    collapsed?.classList.remove("hidden");
    if (handle) handle.style.display = "none";
    if (panel) panel.style.width = "56px";
  } else {
    content?.classList.remove("hidden");
    collapsed?.classList.add("hidden");
    if (handle) handle.style.display = "block";
    if (panel) panel.style.width = panelWidth + "px";
  }
}

function updateStrengthPanel(score, positives, negatives) {
  document.getElementById("strengthEmpty").classList.add("hidden");
  document.getElementById("strengthResults").classList.remove("hidden");
  const color = score >= 65 ? "#059669" : score >= 40 ? "#f59e0b" : "#ef4444";
  document.getElementById("scoreDisplay").innerHTML = `<span style="color:${color}">${score}%</span><br><span style="font-size:13px;font-weight:500;color:#64748b">Case Strength</span>`;
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

function resetStrengthPanel() {
  const emptyState = document.getElementById("strengthEmpty");
  const results = document.getElementById("strengthResults");
  const scoreDisplay = document.getElementById("scoreDisplay");
  const barRed = document.getElementById("barRed");
  const barGreen = document.getElementById("barGreen");
  const positivePoints = document.getElementById("positivePoints");
  const negativePoints = document.getElementById("negativePoints");
  const tooltip = document.getElementById("strengthTooltip");
  const tooltipTitle = document.getElementById("tooltipTitle");
  const tooltipList = document.getElementById("tooltipList");

  emptyState?.classList.remove("hidden");
  results?.classList.add("hidden");

  if (scoreDisplay) scoreDisplay.innerHTML = "";
  if (barRed) barRed.style.width = "0%";
  if (barGreen) barGreen.style.width = "0%";
  if (positivePoints) {
    positivePoints.className = "points-box";
    positivePoints.innerHTML = "";
    positivePoints.classList.add("hidden");
  }
  if (negativePoints) {
    negativePoints.className = "points-box";
    negativePoints.innerHTML = "";
    negativePoints.classList.add("hidden");
  }
  if (tooltip) tooltip.classList.add("hidden");
  if (tooltipTitle) tooltipTitle.textContent = "";
  if (tooltipList) tooltipList.innerHTML = "";
}

function clearSessionFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("session")) return;
  url.searchParams.delete("session");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}
