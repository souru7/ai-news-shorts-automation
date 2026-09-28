// AI Shorts Automation Studio - Dashboard Controller

let activeTab = "dashboard";
let pollTimer = null;
let progressPollTimer = null;
let isJobActive = false;

const TAB_METADATA = {
  dashboard: {
    title: "Automation Dashboard",
    subtitle: "Publishing 2 High-Impact AI News Shorts Daily to YouTube"
  },
  videos: {
    title: "All Generated AI Shorts",
    subtitle: "Video Catalog, Direct 9:16 Previews & Autonomous YouTube Publishing"
  },
  research: {
    title: "AI Research Feed",
    subtitle: "Curated AI Tools & Daily Tech News Discovered by Autonomous Engine"
  },
  settings: {
    title: "Automation Settings",
    subtitle: "Configure API Keys, Daily Quota, Neural Voices & Cron Trigger"
  },
  diagnostics: {
    title: "System Diagnostics",
    subtitle: "Production Subsystems, FFmpeg Media Encoder & YouTube API Health"
  },
  logs: {
    title: "Live System Logs",
    subtitle: "Real-time Node.js & Cron Execution Log Terminal"
  }
};

document.addEventListener("DOMContentLoaded", () => {
  // Bind all sidebar tab navigation buttons directly via EventListeners
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const tab = item.getAttribute("data-tab");
      if (tab) switchTab(tab);
    });
  });

  // Check URL query parameters (e.g. YouTube OAuth redirect responses)
  const params = new URLSearchParams(window.location.search);
  if (params.get("youtube") === "connected") {
    showToast("YouTube Connected", "🎉 YouTube Channel successfully verified and connected!", "success");
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (params.get("youtube") === "error") {
    showToast("YouTube Connection Failed", params.get("msg") || "Authentication was cancelled or rejected.", "error");
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Initial data loads
  refreshData();
  loadSettings();
  loadLogs();
  checkActiveJob();

  // Progress polling (every 1.5 seconds)
  progressPollTimer = setInterval(checkActiveJob, 1500);

  // Background stats polling (every 10 seconds)
  pollTimer = setInterval(() => {
    loadStats();
    if (activeTab === "dashboard" || activeTab === "videos") {
      loadVideos();
    } else if (activeTab === "logs") {
      loadLogs();
    } else if (activeTab === "diagnostics") {
      loadDiagnostics();
    }
  }, 10000);
});

// ----------------------------------------------------
// Tab Switching Controller
// ----------------------------------------------------
function switchTab(tabId) {
  activeTab = tabId;

  // 1. Highlight sidebar navigation item
  document.querySelectorAll(".nav-item").forEach(el => {
    if (el.getAttribute("data-tab") === tabId) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });

  // 2. Toggle active section
  document.querySelectorAll(".section").forEach(el => {
    el.classList.remove("active");
  });

  const targetSection = document.getElementById("section-" + tabId);
  if (targetSection) {
    targetSection.classList.add("active");
  }

  // 3. Update top header title & description
  const meta = TAB_METADATA[tabId] || { title: "Automation Dashboard", subtitle: "" };
  const headingEl = document.getElementById("page-heading");
  const subHeadingEl = document.getElementById("page-subheading");
  if (headingEl) headingEl.textContent = meta.title;
  if (subHeadingEl) subHeadingEl.textContent = meta.subtitle;

  // 4. Smooth scroll to top of main viewport
  window.scrollTo({ top: 0, behavior: "smooth" });

  // 5. Trigger tab-specific data load
  if (tabId === "dashboard") {
    refreshData();
  } else if (tabId === "videos") {
    loadVideos();
  } else if (tabId === "research") {
    loadResearch();
  } else if (tabId === "settings") {
    loadSettings();
  } else if (tabId === "diagnostics") {
    loadDiagnostics();
  } else if (tabId === "logs") {
    loadLogs();
  }
}

async function refreshData() {
  await Promise.all([loadStats(), loadYouTubeStatus(), loadVideos(), checkActiveJob()]);
}

// ----------------------------------------------------
// Toast Notification Engine
// ----------------------------------------------------
function showToast(title, message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast toast-" + type;

  const iconMap = {
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "⚡"
  };

  toast.innerHTML = `
    <div class="toast-icon">${iconMap[type] || "⚡"}</div>
    <div class="toast-body">
      <div class="toast-title">${escapeHtml(title)}</div>
      <div>${escapeHtml(message)}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);

  // Auto remove after 5 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(100%)";
      setTimeout(() => toast.remove(), 300);
    }
  }, 5000);
}

// ----------------------------------------------------
// Real-Time Percentage & Generation Progress Tracking
// ----------------------------------------------------
async function checkActiveJob() {
  try {
    const res = await fetch("/api/admin/active-job");
    if (res.status === 401) return (window.location.href = "/login");
    if (!res.ok) return;

    const data = await res.json();
    const card = document.getElementById("live-progress-card");
    if (!card) return;

    if (data.active && data.job) {
      isJobActive = true;
      card.style.display = "block";
      const pct = Math.min(Math.max(data.job.progress || 0, 5), 100);
      const step = data.job.step || "processing";
      const stageMsg = data.job.stage_message || "Processing automated AI pipeline...";

      // Update progress badges and bar
      const pctEl = document.getElementById("progress-percent-badge");
      const barEl = document.getElementById("progress-bar-fill");
      const stepEl = document.getElementById("progress-step-badge");
      const descEl = document.getElementById("progress-stage-desc");
      const timeEl = document.getElementById("progress-time-elapsed");

      if (pctEl) pctEl.textContent = pct + "%";
      if (barEl) barEl.style.width = pct + "%";
      if (stepEl) stepEl.textContent = step.toUpperCase();
      if (descEl) descEl.textContent = stageMsg;

      if (timeEl && data.job.started_at) {
        const elapsedSec = Math.round((Date.now() - new Date(data.job.started_at).getTime()) / 1000);
        timeEl.textContent = "Elapsed: " + elapsedSec + "s";
      }

      // Update step checklist indicators
      updateStepChecklist(pct);
    } else {
      // If we were previously active and now finished
      if (isJobActive) {
        isJobActive = false;
        const pctEl = document.getElementById("progress-percent-badge");
        const barEl = document.getElementById("progress-bar-fill");
        const stepEl = document.getElementById("progress-step-badge");
        const descEl = document.getElementById("progress-stage-desc");

        if (pctEl) pctEl.textContent = "100%";
        if (barEl) barEl.style.width = "100%";
        if (stepEl) stepEl.textContent = "COMPLETED";
        if (descEl) descEl.textContent = "✨ Autonomous Short pipeline completed successfully!";
        updateStepChecklist(100);

        showToast("Pipeline Finished", "Short generated and processed successfully!", "success");
        loadStats();
        loadVideos();

        setTimeout(() => {
          if (!isJobActive && card) {
            card.style.display = "none";
          }
        }, 8000);
      } else {
        card.style.display = "none";
      }
    }
  } catch (err) {
    console.warn("Active job check failed:", err);
  }
}

function updateStepChecklist(pct) {
  const steps = [
    { id: "research", iconId: "step-icon-research", minPct: 15 },
    { id: "script", iconId: "step-icon-script", minPct: 35 },
    { id: "voice", iconId: "step-icon-voice", minPct: 55 },
    { id: "captions", iconId: "step-icon-captions", minPct: 65 },
    { id: "render", iconId: "step-icon-render", minPct: 90 },
    { id: "upload", iconId: "step-icon-upload", minPct: 96 }
  ];

  steps.forEach(s => {
    const el = document.getElementById("step-ind-" + s.id);
    const icon = document.getElementById(s.iconId);
    if (!el || !icon) return;

    if (pct >= s.minPct) {
      el.style.color = "#34d399";
      el.style.fontWeight = "600";
      icon.textContent = "✓";
      icon.style.color = "#34d399";
    } else if (pct >= (s.minPct - 20) && pct < s.minPct) {
      el.style.color = "#38bdf8";
      el.style.fontWeight = "600";
      icon.textContent = "⏳";
      icon.style.color = "#38bdf8";
    } else {
      el.style.color = "#94a3b8";
      el.style.fontWeight = "normal";
      icon.textContent = "○";
      icon.style.color = "#94a3b8";
    }
  });
}

// ----------------------------------------------------
// Statistics & Pipeline Engine Status
// ----------------------------------------------------
async function loadStats() {
  try {
    const res = await fetch("/api/admin/stats");
    if (res.status === 401) return (window.location.href = "/login");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    const genToday = data.today?.generatedToday || 0;
    const quota = data.today?.quota || 2;
    const statQuotaEl = document.getElementById("stat-quota-progress");
    if (statQuotaEl) statQuotaEl.textContent = genToday + " / " + quota;
    
    const statUploadedEl = document.getElementById("stat-uploaded-today");
    if (statUploadedEl) statUploadedEl.textContent = data.today?.uploadedToday || 0;
    
    const statTotalEl = document.getElementById("stat-total-videos");
    if (statTotalEl) statTotalEl.textContent = "Total Produced: " + (data.totals?.total_videos || 0);

    const statDescEl = document.getElementById("stat-quota-desc");
    if (statDescEl && data.today?.timezone) {
      statDescEl.textContent = "Daily target: " + quota + " (" + data.today.timezone + ")";
    }

    const statLastUploadEl = document.getElementById("stat-last-upload");
    if (statLastUploadEl) {
      if (data.lastUpload?.uploaded_at) {
        const dateStr = new Date(data.lastUpload.uploaded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        statLastUploadEl.textContent = "Last: " + dateStr + " (\"" + (data.lastUpload.title || "").slice(0, 20) + "...\")";
      } else {
        statLastUploadEl.textContent = "Last: No uploads today yet";
      }
    }
  } catch (err) {
    console.error("Error loading stats:", err);
    const el = document.getElementById("stat-quota-progress");
    if (el) el.textContent = "Offline";
  }
}

// ----------------------------------------------------
// YouTube Channel Connection Status
// ----------------------------------------------------
async function loadYouTubeStatus() {
  try {
    const res = await fetch("/api/youtube/status");
    const data = await res.json();
    const channelEl = document.getElementById("stat-yt-channel");
    const subsEl = document.getElementById("stat-yt-subs");
    const btnYt = document.getElementById("btn-yt-connect");
    const btnYtText = document.getElementById("btn-yt-connect-text");
    const btnDisconnect = document.getElementById("btn-yt-disconnect");
    const badgeEl = document.getElementById("stat-yt-badge");

    if (data.isConnected) {
      if (channelEl) {
        channelEl.textContent = (data.title || "Target Channel") + " (Verified)";
        channelEl.style.color = "#34d399";
      }
      if (subsEl) subsEl.innerHTML = `<span style="color:#34d399; font-weight:600;">✓ Matched: ${data.targetChannelId || "UCje0Deygks4X5w1oCRB-lew"}</span> • ${data.subscriberCount || "0"} Subs`;
      if (btnYtText) btnYtText.textContent = "Switch Account";
      if (btnYt) btnYt.style.background = "#0284c7";
      if (btnDisconnect) btnDisconnect.style.display = "inline-block";
      if (badgeEl) badgeEl.textContent = "✅";
    } else if (data.isWrongChannel) {
      if (channelEl) {
        channelEl.textContent = "Wrong Channel: " + (data.title || data.channelId);
        channelEl.style.color = "#fb7185";
      }
      if (subsEl) subsEl.innerHTML = `<span style="color:#fb7185; font-weight:600;">Requires: ${data.targetChannelId || "UCje0Deygks4X5w1oCRB-lew"}</span>`;
      if (btnYtText) btnYtText.textContent = "Connect Correct Channel";
      if (btnYt) btnYt.style.background = "#ef4444";
      if (btnDisconnect) btnDisconnect.style.display = "inline-block";
      if (badgeEl) badgeEl.textContent = "⚠️";
    } else {
      if (channelEl) {
        channelEl.textContent = "Not Connected";
        channelEl.style.color = "#fb7185";
      }
      if (subsEl) subsEl.innerHTML = `Target: <code style="color:#38bdf8;">${data.targetChannelId || "UCje0Deygks4X5w1oCRB-lew"}</code>`;
      if (btnYtText) btnYtText.textContent = "Connect YouTube Channel";
      if (btnYt) btnYt.style.background = "#cc0000";
      if (btnDisconnect) btnDisconnect.style.display = "none";
      if (badgeEl) badgeEl.textContent = "🔗";
    }
  } catch (err) {
    console.error("YouTube status check error:", err);
  }
}

async function testYouTubeConnection() {
  try {
    showToast("Testing Connection", "Validating OAuth token against target YouTube channel...", "info");
    const res = await fetch("/api/youtube/test-connection");
    const data = await res.json();
    if (data.isCorrect) {
      showToast("Channel Verified", "✅ Target matched: " + data.title + " (" + data.channelId + ")", "success");
      alert("✅ YouTube Channel Verified!\n\nTarget Channel: " + data.targetChannelId + "\nConnected Channel: " + data.title + " (" + data.channelId + ")\nSubscribers: " + data.subscriberCount + "\nVideos: " + data.videoCount + "\n\nStatus: Ready for autonomous YouTube Shorts publishing!");
    } else {
      showToast("Connection Issue", data.message || data.error || "Connection failed", "warning");
      alert("⚠️ YouTube Connection Test Result:\n\n" + (data.message || data.error || "Connection failed") + "\n\nPlease click 'Connect YouTube Channel' and authorize with Google account souroabh@gmail.com selecting target channel UCje0Deygks4X5w1oCRB-lew.");
    }
    loadYouTubeStatus();
  } catch (err) {
    showToast("Test Failed", err.message, "error");
  }
}

async function disconnectYouTube() {
  if (!confirm("Are you sure you want to disconnect YouTube? Stored OAuth tokens will be deleted and automated uploads will pause until reconnected.")) {
    return;
  }
  try {
    const res = await fetch("/api/youtube/disconnect", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      showToast("Disconnected", "YouTube channel credentials removed.", "info");
    } else {
      showToast("Disconnect Failed", data.error || "Unknown error", "error");
    }
    await refreshData();
  } catch (err) {
    showToast("Disconnect Error", err.message, "error");
  }
}

// ----------------------------------------------------
// Videos List & Table Renderers
// ----------------------------------------------------
async function loadVideos() {
  const recentTable = document.getElementById("dashboard-recent-table");
  const allTable = document.getElementById("all-videos-table");

  try {
    const res = await fetch("/api/admin/videos?limit=50");
    if (res.status === 401) return (window.location.href = "/login");
    if (!res.ok) throw new Error("Server returned HTTP " + res.status);

    const data = await res.json();
    const videos = data.videos || [];

    // 1. Dashboard recent table (top 5)
    if (recentTable) {
      if (videos.length === 0) {
        recentTable.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-dim);">No shorts generated yet. Click "⚡ Generate & Publish Short Instantly" to create your first video!</td></tr>';
      } else {
        recentTable.innerHTML = videos.slice(0, 5).map(v => renderVideoRow(v, false)).join("");
      }
    }

    // 2. All videos table
    if (allTable) {
      if (videos.length === 0) {
        allTable.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-dim);">No videos generated yet.</td></tr>';
      } else {
        allTable.innerHTML = videos.map(v => renderVideoRow(v, true)).join("");
      }
    }
  } catch (err) {
    console.error("Error loading videos:", err);
  }
}

function renderVideoRow(v, isFullView) {
  const isVideoReady = v.video_file && ["ready", "uploaded", "dry_run_completed"].includes(v.status);
  const mediaUrl = v.video_file ? (v.video_file.startsWith("http") ? v.video_file : "/media/videos/" + v.video_file.split("/").pop()) : "";

  const safeTitle = escapeHtml(v.title || v.tool_name || "AI Short");
  const safeTopic = escapeHtml(v.topic || "");
  const safeScript = escapeHtml(v.script || "");
  const safeToolName = escapeHtml(v.tool_name || "AI Tool");

  const thumbBtn = isVideoReady 
    ? `<div class="video-preview-btn" onclick="openModal('${mediaUrl}', '${safeTitle}', '${safeTopic}')" title="Play Short">▶</div>`
    : `<div class="video-preview-btn" style="opacity:0.3; cursor:not-allowed;" title="Processing">⏳</div>`;

  const ytLink = v.youtube_url 
    ? `<a href="${v.youtube_url}" target="_blank" style="color:var(--accent-cyan); text-decoration:none; font-weight:600;">Open Short ↗</a>`
    : '<span style="color:var(--text-dim);">-</span>';

  if (!isFullView) {
    const publishBtn = (v.status !== "uploaded" && v.video_file)
      ? `<button class="btn btn-primary" style="padding:4px 8px; font-size:11px; background:#10b981; border:none;" onclick="publishVideo('${v.id}')">🚀 Publish</button>`
      : "";

    return `
      <tr>
        <td>${thumbBtn}</td>
        <td>
          <div style="font-weight:700; color:#fff;">${safeToolName}</div>
          <div style="font-size:12px; color:var(--text-dim);">${safeTopic.slice(0, 45)}${safeTopic.length > 45 ? "..." : ""}</div>
        </td>
        <td><div class="script-text">${safeScript || "Script generating..."}</div></td>
        <td><span class="badge badge-${v.status}">${(v.status || "pending").replace(/_/g, " ")}</span></td>
        <td>${ytLink}</td>
        <td>
          <div style="display:flex; gap:6px;">
            ${publishBtn}
            <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="retryVideo('${v.id}')">Retry</button>
          </div>
        </td>
      </tr>
    `;
  }

  const publishBtn = (v.status !== "uploaded" && v.video_file)
    ? `<button class="btn btn-primary" style="padding:6px 10px; font-size:12px; background:#10b981; border:none;" onclick="publishVideo('${v.id}')">🚀 Publish</button>`
    : "";

  return `
    <tr>
      <td>${thumbBtn}</td>
      <td style="font-weight:700; color:#fff;">${safeToolName}</td>
      <td>
        <div style="font-weight:500; color:var(--text-main); margin-bottom:4px;">${safeTitle}</div>
        <div class="script-text">${safeScript}</div>
      </td>
      <td>${v.duration_seconds ? v.duration_seconds + "s" : "-"}</td>
      <td><span class="badge badge-${v.status}">${(v.status || "pending").replace(/_/g, " ")}</span></td>
      <td>${ytLink}</td>
      <td>
        <div style="display:flex; gap:6px;">
          ${publishBtn}
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" onclick="retryVideo('${v.id}')" title="Retry">↻</button>
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px; color:#fb7185;" onclick="deleteVideo('${v.id}')" title="Delete">🗑</button>
        </div>
      </td>
    </tr>
  `;
}

// ----------------------------------------------------
// Pipeline Execution Actions (With Instant Live Progress UI)
// ----------------------------------------------------
async function triggerInstantPublish() {
  if (!confirm("⚡ Start generating and automatically publish to YouTube Shorts immediately?")) return;
  
  // 1. Immediately show live progress card in UI with initial state
  showLiveProgressUI("INITIALIZING", "Starting autonomous AI Short research & generation pipeline...");
  showToast("Short Generation Started", "Researching top AI tool, synthesizing neural voice & creating 9:16 short...", "info");

  try {
    const res = await fetch("/api/admin/generate-now", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDryRun: false })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Server rejected trigger");
    
    checkActiveJob();
  } catch (err) {
    showToast("Trigger Failed", err.message, "error");
  }
}

async function triggerDryRun() {
  // 1. Immediately show live progress card in UI
  showLiveProgressUI("INITIALIZING (DRY RUN)", "Starting preview generation (will not upload to YouTube)...");
  showToast("Test Short Started", "Rendering 9:16 vertical short preview without uploading...", "info");

  try {
    const res = await fetch("/api/admin/generate-now", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDryRun: true })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Server rejected dry run");

    checkActiveJob();
  } catch (err) {
    showToast("Dry Run Failed", err.message, "error");
  }
}

function showLiveProgressUI(stepText, descText) {
  const card = document.getElementById("live-progress-card");
  if (!card) return;
  
  card.style.display = "block";
  isJobActive = true;

  const pctEl = document.getElementById("progress-percent-badge");
  const barEl = document.getElementById("progress-bar-fill");
  const stepEl = document.getElementById("progress-step-badge");
  const descEl = document.getElementById("progress-stage-desc");
  const timeEl = document.getElementById("progress-time-elapsed");

  if (pctEl) pctEl.textContent = "5%";
  if (barEl) barEl.style.width = "5%";
  if (stepEl) stepEl.textContent = stepText;
  if (descEl) descEl.textContent = descText;
  if (timeEl) timeEl.textContent = "Starting...";

  updateStepChecklist(5);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function publishVideo(videoId) {
  if (!confirm("🚀 Publish this Short to your YouTube channel right now?")) return;
  try {
    showToast("Uploading Short", "Transmitting video to YouTube API...", "info");
    const res = await fetch("/api/admin/publish/" + videoId, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    showToast("Published!", "🎉 Video successfully published to YouTube Shorts!", "success");
    alert("🎉 Successfully published to YouTube!\n\nLink: " + data.youtubeUrl);
    loadStats();
    loadVideos();
  } catch (err) {
    showToast("Publish Failed", err.message, "error");
    alert("YouTube Upload Failed: " + err.message);
  }
}

async function retryVideo(id) {
  try {
    showToast("Retrying Short", "Re-initiating video processing...", "info");
    const res = await fetch("/api/admin/retry/" + id, { method: "POST" });
    const data = await res.json();
    showLiveProgressUI("RETRYING", "Rebuilding short from step...");
    checkActiveJob();
    loadVideos();
  } catch (err) {
    showToast("Retry Failed", err.message, "error");
  }
}

async function deleteVideo(id) {
  if (!confirm("Are you sure you want to delete this video and its files?")) return;
  try {
    await fetch("/api/admin/videos/" + id, { method: "DELETE" });
    showToast("Deleted", "Video removed successfully.", "info");
    loadVideos();
    loadStats();
  } catch (err) {
    showToast("Delete Failed", err.message, "error");
  }
}

// ----------------------------------------------------
// Research Feed
// ----------------------------------------------------
async function loadResearch() {
  const tbody = document.getElementById("research-table");
  if (!tbody) return;
  try {
    const res = await fetch("/api/admin/research");
    if (res.status === 401) return (window.location.href = "/login");
    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();
    const sources = data.sources || [];

    if (sources.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-dim);">No topics researched yet. The automated pipeline will harvest fresh AI news on the next run.</td></tr>';
      return;
    }

    tbody.innerHTML = sources.map(s => `
      <tr>
        <td style="font-weight:700; color:#38bdf8;">${escapeHtml(s.tool_name || "AI")}</td>
        <td>${escapeHtml(s.topic)}</td>
        <td style="font-size:12px; color:var(--text-muted); max-width:300px;">${escapeHtml((s.summary || "").slice(0, 120))}...</td>
        <td><a href="${s.source_url}" target="_blank" style="color:var(--text-dim); font-size:12px;">Link ↗</a></td>
        <td style="font-size:12px;">${new Date(s.researched_at).toLocaleDateString()}</td>
      </tr>
    `).join("");
  } catch (err) {
    console.error("Error loading research:", err);
  }
}

// ----------------------------------------------------
// System Diagnostics Section
// ----------------------------------------------------
async function loadDiagnostics() {
  const grid = document.getElementById("diagnostics-grid");
  if (!grid) return;

  try {
    const res = await fetch("/api/admin/diagnostics");
    if (res.status === 401) return (window.location.href = "/login");
    if (!res.ok) throw new Error("HTTP " + res.status);

    const diag = await res.json();
    const items = [
      { name: "Application Server", val: diag.application, icon: "⚡" },
      { name: "Database (PostgreSQL)", val: diag.database, icon: "🗄️" },
      { name: "FFmpeg Media Encoder", val: diag.ffmpeg, icon: "🎬" },
      { name: "TTS Voice Synthesizer", val: diag.tts_api, icon: "🎙️" },
      { name: "AI Script Generator", val: diag.ai_api, icon: "🧠" },
      { name: "Research Engine", val: diag.research_api, icon: "🌐" },
      { name: "Storage Provider", val: diag.storage, icon: "📦" },
      { name: "YouTube OAuth", val: diag.youtube_oauth, icon: "🔑" },
      { name: "YouTube Channel API", val: diag.youtube_api, icon: "📺" },
      { name: "Cron Trigger Endpoint", val: diag.cron_endpoint, icon: "⏰" }
    ];

    grid.innerHTML = items.map(item => {
      const isOk = item.val && (item.val.includes("Connected") || item.val.includes("Configured"));
      const badgeColor = isOk ? "#34d399" : "#fb7185";
      const badgeBg = isOk ? "rgba(52, 211, 153, 0.15)" : "rgba(251, 113, 133, 0.15)";
      const statusText = item.val || "Unknown";

      return `
        <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-size: 13px; font-weight: 700; color: #fff;">${item.icon} ${item.name}</span>
            <span style="font-size: 11px; font-weight: 700; color: ${badgeColor}; background: ${badgeBg}; padding: 3px 8px; border-radius: 10px;">
              ${isOk ? "✓ READY" : "✗ CHECK"}
            </span>
          </div>
          <div style="font-size: 12px; color: var(--text-muted); font-family: monospace; word-break: break-all;">
            ${escapeHtml(statusText)}
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    grid.innerHTML = `<div style="grid-column: 1 / -1; padding: 20px; color: #fb7185; text-align: center;">Diagnostics check failed: ${escapeHtml(err.message)}</div>`;
  }
}

// ----------------------------------------------------
// Settings Form
// ----------------------------------------------------
async function loadSettings() {
  try {
    const res = await fetch("/api/admin/settings");
    if (!res.ok) return;
    const settings = await res.json();
    if (settings.daily_quota) document.getElementById("setting-quota").value = settings.daily_quota;
    if (settings.tts_voice) document.getElementById("setting-voice").value = settings.tts_voice;
    if (settings.youtube_privacy) document.getElementById("setting-privacy").value = settings.youtube_privacy;
    if (settings.default_hashtags) document.getElementById("setting-hashtags").value = settings.default_hashtags;

    const dryRunEl = document.getElementById("setting-dryrun");
    if (dryRunEl && settings.dry_run !== undefined) {
      dryRunEl.checked = settings.dry_run === "true";
    }

    if (settings.youtube_client_id) document.getElementById("setting-yt-client-id").value = settings.youtube_client_id;
    if (settings.youtube_client_secret) document.getElementById("setting-yt-client-secret").value = settings.youtube_client_secret;
    if (settings.youtube_refresh_token) document.getElementById("setting-yt-refresh-token").value = settings.youtube_refresh_token;
    if (settings.cron_secret) document.getElementById("setting-cron-secret").value = settings.cron_secret;
  } catch (err) {
    console.error("Error loading settings:", err);
  }
}

async function saveSettings(e) {
  if (e && e.preventDefault) e.preventDefault();
  const dryRunEl = document.getElementById("setting-dryrun");
  const cronSecretEl = document.getElementById("setting-cron-secret");
  const payload = {
    daily_quota: document.getElementById("setting-quota").value,
    tts_voice: document.getElementById("setting-voice").value,
    youtube_privacy: document.getElementById("setting-privacy").value,
    default_hashtags: document.getElementById("setting-hashtags").value,
    dry_run: dryRunEl ? (dryRunEl.checked ? "true" : "false") : "false",
    youtube_client_id: document.getElementById("setting-yt-client-id").value.trim(),
    youtube_client_secret: document.getElementById("setting-yt-client-secret").value.trim(),
    youtube_refresh_token: document.getElementById("setting-yt-refresh-token").value.trim(),
    cron_secret: cronSecretEl ? cronSecretEl.value.trim() : ""
  };

  try {
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    showToast("Settings Saved", "Configuration updated successfully in PostgreSQL!", "success");
    loadStats();
    loadYouTubeStatus();
  } catch (err) {
    showToast("Save Error", err.message, "error");
  }
}

// ----------------------------------------------------
// Logs & Modals
// ----------------------------------------------------
async function loadLogs() {
  try {
    const res = await fetch("/api/admin/logs");
    if (!res.ok) return;
    const data = await res.json();
    const term = document.getElementById("terminal-logs");
    if (!term) return;
    term.innerHTML = (data.logs || []).map(l => {
      const time = new Date(l.timestamp).toLocaleTimeString();
      return `<div class="log-line"><span class="log-time">[${time}]</span> <span class="log-level-${l.level}">[${l.level}]</span> ${escapeHtml(l.message)}</div>`;
    }).join("");
  } catch (err) {
    console.error("Error loading logs:", err);
  }
}

function openModal(videoUrl, title, topic) {
  const modal = document.getElementById("video-modal");
  const player = document.getElementById("modal-player");
  if (!modal || !player) return;
  document.getElementById("modal-video-title").textContent = title;
  document.getElementById("modal-video-topic").textContent = topic;
  player.src = videoUrl;
  modal.classList.add("active");
}

function closeModal() {
  const modal = document.getElementById("video-modal");
  const player = document.getElementById("modal-player");
  if (player) {
    player.pause();
    player.src = "";
  }
  if (modal) {
    modal.classList.remove("active");
  }
}

async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  } catch (err) {
    window.location.href = "/login";
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Expose all functions to global window scope
window.switchTab = switchTab;
window.refreshData = refreshData;
window.showToast = showToast;
window.checkActiveJob = checkActiveJob;
window.loadStats = loadStats;
window.loadYouTubeStatus = loadYouTubeStatus;
window.testYouTubeConnection = testYouTubeConnection;
window.disconnectYouTube = disconnectYouTube;
window.loadVideos = loadVideos;
window.triggerInstantPublish = triggerInstantPublish;
window.triggerDryRun = triggerDryRun;
window.publishVideo = publishVideo;
window.retryVideo = retryVideo;
window.deleteVideo = deleteVideo;
window.loadResearch = loadResearch;
window.loadDiagnostics = loadDiagnostics;
window.loadSettings = loadSettings;
window.saveSettings = saveSettings;
window.loadLogs = loadLogs;
window.openModal = openModal;
window.closeModal = closeModal;
window.logout = logout;
