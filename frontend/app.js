const API_BASE = "http://localhost:8000";
const TOKEN_KEY = "advocare_token";
let conversationHistory = [];
let isLoading = false;
let currentSessionId = null;
let replyMode = "detail"; // 'quick' or 'detail'
let language = "en"; // 'en' or 'hi'

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
  return true;
}

// ─── On Page Load ───────────────────────────────────────────
window.addEventListener("load", async () => {
  if (!ensureAuthenticated()) return;
  await renderSidebar();
  await loadLastSession();
  updateReplyToggle();
  updateLanguageToggle();
});

function setReplyMode(mode) {
  replyMode = mode;
  updateReplyToggle();
}

function setLanguage(lang) {
  language = lang;
  updateLanguageToggle();
}

function updateLanguageToggle() {
  const enBtn = document.getElementById("langEnBtn");
  const hiBtn = document.getElementById("langHiBtn");
  if (!enBtn || !hiBtn) return;
  if (language === "en") {
    enBtn.classList.add("active");
    hiBtn.classList.remove("active");
  } else {
    enBtn.classList.remove("active");
    hiBtn.classList.add("active");
  }
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
  showWelcomeMessage();
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
  showWelcomeMessage();

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

  list.innerHTML = sessions
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
  document.getElementById("userInput").value = "";
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

async function exportToPDF(msgId, encodedText) {
  try {
    const text = decodeURIComponent(encodedText);
    
    if (typeof window.jsPDF === "undefined") {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      script.onload = () => generatePDF(text);
      script.onerror = () => alert("Failed to load PDF library");
      document.head.appendChild(script);
    } else {
      generatePDF(text);
    }
  } catch (err) {
    alert("Error exporting PDF");
    console.error(err);
  }
}

function generatePDF(text) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const textWidth = pageWidth - 2 * margin;
  
  const date = new Date().toLocaleDateString('en-IN');
  
  doc.setFontSize(20);
  doc.setTextColor(26, 86, 219);
  doc.text("⚖️ Advocare", margin, margin + 5);
  
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
  doc.text("⚠️ Disclaimer: This is AI-generated information and NOT legal advice.", margin, pageHeight - 14);
  doc.text(`Exported on ${date}`, margin, pageHeight - 10);
  
  doc.save("legal-advice.pdf");
}
