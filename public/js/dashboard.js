// AI Shorts Automation Dashboard Controller

let activeTab = 'dashboard';
let pollTimer = null;
let progressPollTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  // Check URL query parameters (e.g. YouTube connected message)
  const params = new URLSearchParams(window.location.search);
  if (params.get('youtube') === 'connected') {
    alert('🎉 YouTube Channel successfully connected! Automated Shorts can now be published directly.');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (params.get('youtube') === 'error') {
    alert(`⚠️ YouTube Connection Failed: ${params.get('msg') || 'Unknown error'}`);
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  refreshData();
  loadSettings();
  loadLogs();
  checkActiveJob();

  // Polling every 2.5 seconds for real-time video generation percentage and active job tracking
  progressPollTimer = setInterval(checkActiveJob, 2500);

  // Polling every 12 seconds for overall statistics & video lists
  pollTimer = setInterval(() => {
    loadStats();
    if (activeTab === 'dashboard' || activeTab === 'videos') {
      loadVideos();
    }
    if (activeTab === 'logs') {
      loadLogs();
    }
    if (activeTab === 'diagnostics') {
      loadDiagnostics();
    }
  }, 12000);
});

function switchTab(tabId) {
  activeTab = tabId;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));

  const clickedNav = Array.from(document.querySelectorAll('.nav-item')).find(el => 
    el.textContent.trim().toLowerCase().includes(tabId)
  );
  if (clickedNav) clickedNav.classList.add('active');

  const targetSection = document.getElementById(`section-${tabId}`);
  if (targetSection) targetSection.classList.add('active');

  if (tabId === 'research') loadResearch();
  if (tabId === 'settings') loadSettings();
  if (tabId === 'logs') loadLogs();
  if (tabId === 'videos') loadVideos();
  if (tabId === 'diagnostics') loadDiagnostics();
}

async function refreshData() {
  await Promise.all([loadStats(), loadYouTubeStatus(), loadVideos(), checkActiveJob()]);
}

// ----------------------------------------------------
// Real-Time Percentage & Generation Progress Tracking
// ----------------------------------------------------
async function checkActiveJob() {
  try {
    const res = await fetch('/api/admin/active-job');
    if (res.status === 401) return (window.location.href = '/login');
    if (!res.ok) return;

    const data = await res.json();
    const card = document.getElementById('live-progress-card');
    if (!card) return;

    if (data.active && data.job) {
      card.style.display = 'block';
      const pct = Math.min(Math.max(data.job.progress || 0, 0), 100);
      const step = data.job.step || 'processing';
      const stageMsg = data.job.stage_message || 'Processing automated pipeline...';

      // Update progress badges and bar
      document.getElementById('progress-percent-badge').textContent = `${pct}%`;
      document.getElementById('progress-bar-fill').style.width = `${pct}%`;
      document.getElementById('progress-step-badge').textContent = step.toUpperCase();
      document.getElementById('progress-stage-desc').textContent = stageMsg;

      if (data.job.started_at) {
        const elapsedSec = Math.round((Date.now() - new Date(data.job.started_at).getTime()) / 1000);
        document.getElementById('progress-time-elapsed').textContent = `Elapsed: ${elapsedSec}s`;
      }

      // Update step checklist indicators
      updateStepChecklist(pct);
    } else {
      // If was previously showing and reached 100%, show completed state briefly before hiding
      const currentPct = document.getElementById('progress-percent-badge')?.textContent;
      if (currentPct === '100%') {
        setTimeout(() => {
          if (card) card.style.display = 'none';
        }, 6000);
      } else {
        card.style.display = 'none';
      }
    }
  } catch (err) {
    console.warn('Active job check failed:', err);
  }
}

function updateStepChecklist(pct) {
  const steps = [
    { id: 'research', iconId: 'step-icon-research', minPct: 15 },
    { id: 'script', iconId: 'step-icon-script', minPct: 35 },
    { id: 'voice', iconId: 'step-icon-voice', minPct: 55 },
    { id: 'captions', iconId: 'step-icon-captions', minPct: 65 },
    { id: 'render', iconId: 'step-icon-render', minPct: 90 },
    { id: 'upload', iconId: 'step-icon-upload', minPct: 96 }
  ];

  steps.forEach(s => {
    const el = document.getElementById(`step-ind-${s.id}`);
    const icon = document.getElementById(s.iconId);
    if (!el || !icon) return;

    if (pct >= s.minPct) {
      el.style.color = '#34d399';
      el.style.fontWeight = '600';
      icon.textContent = '✓';
      icon.style.color = '#34d399';
    } else if (pct >= (s.minPct - 20) && pct < s.minPct) {
      el.style.color = '#38bdf8';
      el.style.fontWeight = '600';
      icon.textContent = '⏳';
      icon.style.color = '#38bdf8';
    } else {
      el.style.color = '#94a3b8';
      el.style.fontWeight = 'normal';
      icon.textContent = '○';
      icon.style.color = '#94a3b8';
    }
  });
}

// ----------------------------------------------------
// Statistics & Pipeline Engine Status
// ----------------------------------------------------
async function loadStats() {
  try {
    const res = await fetch('/api/admin/stats');
    if (res.status === 401) return (window.location.href = '/login');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const genToday = data.today?.generatedToday || 0;
    const quota = data.today?.quota || 2;
    document.getElementById('stat-quota-progress').textContent = `${genToday} / ${quota}`;
    
    document.getElementById('stat-uploaded-today').textContent = data.today?.uploadedToday || 0;
    document.getElementById('stat-total-videos').textContent = `Total Produced: ${data.totals?.total_videos || 0}`;

    if (data.today?.timezone) {
      document.getElementById('stat-quota-desc').textContent = `Daily target: ${quota} (${data.today.timezone})`;
    }

    if (data.lastUpload?.uploaded_at) {
      const dateStr = new Date(data.lastUpload.uploaded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      document.getElementById('stat-last-upload').textContent = `Last: ${dateStr} ("${(data.lastUpload.title || '').slice(0, 20)}...")`;
    } else {
      document.getElementById('stat-last-upload').textContent = 'Last: No uploads today yet';
    }
  } catch (err) {
    console.error('Error loading stats:', err);
    document.getElementById('stat-quota-progress').textContent = 'Offline';
  }
}

// ----------------------------------------------------
// YouTube Channel Connection Status
// ----------------------------------------------------
async function loadYouTubeStatus() {
  try {
    const res = await fetch('/api/youtube/status');
    const data = await res.json();
    const channelEl = document.getElementById('stat-yt-channel');
    const subsEl = document.getElementById('stat-yt-subs');
    const btnYt = document.getElementById('btn-yt-connect');

    if (data.isConnected) {
      channelEl.textContent = data.title || 'Connected';
      channelEl.style.color = '#34d399';
      subsEl.textContent = `${data.subscriberCount || '0'} Subscribers • ${data.videoCount || '0'} Videos`;
      btnYt.textContent = '✓ YouTube Connected';
      btnYt.style.background = '#059669';
    } else {
      channelEl.textContent = 'Not Connected';
      channelEl.style.color = '#fb7185';
      subsEl.textContent = data.error ? `${data.error.slice(0, 45)}...` : 'Click "Connect YouTube" to authorize';
      btnYt.textContent = 'Connect YouTube';
      btnYt.style.background = '#cc0000';
    }
  } catch (err) {
    console.error('YouTube status check error:', err);
    const channelEl = document.getElementById('stat-yt-channel');
    if (channelEl) {
      channelEl.textContent = 'Unreachable';
      channelEl.style.color = '#fb7185';
    }
  }
}

// ----------------------------------------------------
// Videos List & Table Renderers
// ----------------------------------------------------
async function loadVideos() {
  const recentTable = document.getElementById('dashboard-recent-table');
  const allTable = document.getElementById('all-videos-table');

  try {
    const res = await fetch('/api/admin/videos?limit=50');
    if (res.status === 401) return (window.location.href = '/login');
    if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);

    const data = await res.json();
    const videos = data.videos || [];

    // 1. Dashboard recent table (top 5)
    if (videos.length === 0) {
      recentTable.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-dim);">No shorts generated yet. Click "⚡ Generate & Publish Short Instantly" to create your first video!</td></tr>`;
    } else {
      recentTable.innerHTML = videos.slice(0, 5).map(v => renderVideoRow(v, false)).join('');
    }

    // 2. All videos table
    if (videos.length === 0) {
      allTable.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-dim);">No videos generated yet.</td></tr>`;
    } else {
      allTable.innerHTML = videos.map(v => renderVideoRow(v, true)).join('');
    }
  } catch (err) {
    console.error('Error loading videos:', err);
    const errHtml = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#fb7185;">Unable to load video catalog: ${escapeHtml(err.message)} <button class="btn btn-secondary" style="margin-left:12px; padding:4px 10px; font-size:12px;" onclick="loadVideos()">Retry</button></td></tr>`;
    if (recentTable) recentTable.innerHTML = errHtml;
    if (allTable) allTable.innerHTML = errHtml;
  }
}

function renderVideoRow(v, isFullView) {
  const isVideoReady = v.video_file && ['ready', 'uploaded', 'dry_run_completed'].includes(v.status);
  const mediaUrl = v.video_file ? (v.video_file.startsWith('http') ? v.video_file : `/media/videos/${v.video_file.split('/').pop()}`) : '';

  const safeTitle = escapeHtml(v.title || v.tool_name || 'AI Short');
  const safeTopic = escapeHtml(v.topic || '');
  const safeScript = escapeHtml(v.script || '');
  const safeToolName = escapeHtml(v.tool_name || 'AI Tool');

  const thumbBtn = isVideoReady 
    ? `<div class="video-preview-btn" onclick="openModal('${mediaUrl}', '${safeTitle}', '${safeTopic}')">▶</div>`
    : `<div class="video-preview-btn" style="opacity:0.3; cursor:not-allowed;">⏳</div>`;

  const ytLink = v.youtube_url 
    ? `<a href="${v.youtube_url}" target="_blank" style="color:var(--accent-cyan); text-decoration:none; font-weight:600;">Open Short ↗</a>`
    : `<span style="color:var(--text-dim);">-</span>`;

  if (!isFullView) {
    const publishBtn = (v.status !== 'uploaded' && v.video_file)
      ? `<button class="btn btn-primary" style="padding:4px 8px; font-size:11px; background:#10b981; border:none;" onclick="publishVideo('${v.id}')">🚀 Publish</button>`
      : '';

    return `
      <tr>
        <td>${thumbBtn}</td>
        <td>
          <div style="font-weight:700; color:#fff;">${safeToolName}</div>
          <div style="font-size:12px; color:var(--text-dim);">${safeTopic.slice(0, 45)}${safeTopic.length > 45 ? '...' : ''}</div>
        </td>
        <td><div class="script-text">${safeScript || 'Script generating...'}</div></td>
        <td><span class="badge badge-${v.status}">${(v.status || 'pending').replace(/_/g, ' ')}</span></td>
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

  const publishBtn = (v.status !== 'uploaded' && v.video_file)
    ? `<button class="btn btn-primary" style="padding:6px 10px; font-size:12px; background:#10b981; border:none;" onclick="publishVideo('${v.id}')">🚀 Publish</button>`
    : '';

  return `
    <tr>
      <td>${thumbBtn}</td>
      <td style="font-weight:700; color:#fff;">${safeToolName}</td>
      <td>
        <div style="font-weight:500; color:var(--text-main); margin-bottom:4px;">${safeTitle}</div>
        <div class="script-text">${safeScript}</div>
      </td>
      <td>${v.duration_seconds ? `${v.duration_seconds}s` : '-'}</td>
      <td><span class="badge badge-${v.status}">${(v.status || 'pending').replace(/_/g, ' ')}</span></td>
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
// Pipeline Execution Actions
// ----------------------------------------------------
async function triggerInstantPublish() {
  if (!confirm('⚡ Start generating and automatically publish to YouTube Shorts immediately?')) return;
  try {
    const res = await fetch('/api/admin/generate-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDryRun: false })
    });
    const data = await res.json();
    alert('🚀 Autonomous generation & YouTube upload started! Monitor real-time status below.');
    checkActiveJob();
    loadStats();
    loadVideos();
  } catch (err) {
    alert('Trigger failed: ' + err.message);
  }
}

async function triggerDryRun() {
  try {
    const res = await fetch('/api/admin/generate-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDryRun: true })
    });
    const data = await res.json();
    alert('🧪 Test generation started! The video will be rendered and ready to preview here without publishing to YouTube.');
    checkActiveJob();
    loadStats();
    loadVideos();
  } catch (err) {
    alert('Dry run trigger failed: ' + err.message);
  }
}

async function publishVideo(videoId) {
  if (!confirm('🚀 Publish this Short to your YouTube channel right now?')) return;
  try {
    const res = await fetch(`/api/admin/publish/${videoId}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    alert(`🎉 Successfully published to YouTube!\n\nLink: ${data.youtubeUrl}`);
    loadStats();
    loadVideos();
  } catch (err) {
    alert('YouTube Upload Failed: ' + err.message);
  }
}

async function retryVideo(id) {
  try {
    const res = await fetch(`/api/admin/retry/${id}`, { method: 'POST' });
    const data = await res.json();
    alert(data.message || 'Retry initiated');
    checkActiveJob();
    loadVideos();
  } catch (err) {
    alert('Retry failed: ' + err.message);
  }
}

async function deleteVideo(id) {
  if (!confirm('Are you sure you want to delete this video and its files?')) return;
  try {
    await fetch(`/api/admin/videos/${id}`, { method: 'DELETE' });
    loadVideos();
    loadStats();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

// ----------------------------------------------------
// Research Feed
// ----------------------------------------------------
async function loadResearch() {
  const tbody = document.getElementById('research-table');
  try {
    const res = await fetch('/api/admin/research');
    if (res.status === 401) return (window.location.href = '/login');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const sources = data.sources || [];

    if (sources.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-dim);">No topics researched yet. The automated pipeline will harvest fresh AI news on the next run.</td></tr>`;
      return;
    }

    tbody.innerHTML = sources.map(s => `
      <tr>
        <td style="font-weight:700; color:#38bdf8;">${escapeHtml(s.tool_name || 'AI')}</td>
        <td>${escapeHtml(s.topic)}</td>
        <td style="font-size:12px; color:var(--text-muted); max-width:300px;">${escapeHtml((s.summary || '').slice(0, 120))}...</td>
        <td><a href="${s.source_url}" target="_blank" style="color:var(--text-dim); font-size:12px;">Link ↗</a></td>
        <td style="font-size:12px;">${new Date(s.researched_at).toLocaleDateString()}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading research:', err);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#fb7185;">Unable to load research catalog: ${escapeHtml(err.message)} <button class="btn btn-secondary" style="margin-left:10px; padding:4px 8px; font-size:11px;" onclick="loadResearch()">Retry</button></td></tr>`;
  }
}

// ----------------------------------------------------
// System Diagnostics Section
// ----------------------------------------------------
async function loadDiagnostics() {
  const grid = document.getElementById('diagnostics-grid');
  if (!grid) return;

  try {
    const res = await fetch('/api/admin/diagnostics');
    if (res.status === 401) return (window.location.href = '/login');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const diag = await res.json();
    const items = [
      { name: 'Application Server', val: diag.application, icon: '⚡' },
      { name: 'Database (PostgreSQL)', val: diag.database, icon: '🗄️' },
      { name: 'FFmpeg Media Encoder', val: diag.ffmpeg, icon: '🎬' },
      { name: 'TTS Voice Synthesizer', val: diag.tts_api, icon: '🎙️' },
      { name: 'AI Script Generator', val: diag.ai_api, icon: '🧠' },
      { name: 'Research Engine', val: diag.research_api, icon: '🌐' },
      { name: 'Storage Provider', val: diag.storage, icon: '📦' },
      { name: 'YouTube OAuth', val: diag.youtube_oauth, icon: '🔑' },
      { name: 'YouTube Channel API', val: diag.youtube_api, icon: '📺' },
      { name: 'Cron Trigger Endpoint', val: diag.cron_endpoint, icon: '⏰' }
    ];

    grid.innerHTML = items.map(item => {
      const isOk = item.val && (item.val.includes('Connected') || item.val.includes('Configured'));
      const badgeColor = isOk ? '#34d399' : '#fb7185';
      const badgeBg = isOk ? 'rgba(52, 211, 153, 0.15)' : 'rgba(251, 113, 133, 0.15)';
      const statusText = item.val || 'Unknown';

      return `
        <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-size: 13px; font-weight: 700; color: #fff;">${item.icon} ${item.name}</span>
            <span style="font-size: 11px; font-weight: 700; color: ${badgeColor}; background: ${badgeBg}; padding: 3px 8px; border-radius: 10px;">
              ${isOk ? '✓ READY' : '✗ CHECK'}
            </span>
          </div>
          <div style="font-size: 12px; color: var(--text-muted); font-family: monospace; word-break: break-all;">
            ${escapeHtml(statusText)}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    grid.innerHTML = `<div style="grid-column: 1 / -1; padding: 20px; color: #fb7185; text-align: center;">Diagnostics check failed: ${escapeHtml(err.message)}</div>`;
  }
}

// ----------------------------------------------------
// Settings Form
// ----------------------------------------------------
async function loadSettings() {
  try {
    const res = await fetch('/api/admin/settings');
    if (!res.ok) return;
    const settings = await res.json();
    if (settings.daily_quota) document.getElementById('setting-quota').value = settings.daily_quota;
    if (settings.tts_voice) document.getElementById('setting-voice').value = settings.tts_voice;
    if (settings.youtube_privacy) document.getElementById('setting-privacy').value = settings.youtube_privacy;
    if (settings.default_hashtags) document.getElementById('setting-hashtags').value = settings.default_hashtags;

    const dryRunEl = document.getElementById('setting-dryrun');
    if (dryRunEl && settings.dry_run !== undefined) {
      dryRunEl.checked = settings.dry_run === 'true';
    }

    if (settings.youtube_client_id) document.getElementById('setting-yt-client-id').value = settings.youtube_client_id;
    if (settings.youtube_client_secret) document.getElementById('setting-yt-client-secret').value = settings.youtube_client_secret;
    if (settings.youtube_refresh_token) document.getElementById('setting-yt-refresh-token').value = settings.youtube_refresh_token;
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const dryRunEl = document.getElementById('setting-dryrun');
  const payload = {
    daily_quota: document.getElementById('setting-quota').value,
    tts_voice: document.getElementById('setting-voice').value,
    youtube_privacy: document.getElementById('setting-privacy').value,
    default_hashtags: document.getElementById('setting-hashtags').value,
    dry_run: dryRunEl ? (dryRunEl.checked ? 'true' : 'false') : 'false',
    youtube_client_id: document.getElementById('setting-yt-client-id').value.trim(),
    youtube_client_secret: document.getElementById('setting-yt-client-secret').value.trim(),
    youtube_refresh_token: document.getElementById('setting-yt-refresh-token').value.trim()
  };

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    alert('Settings saved successfully!');
    loadStats();
    loadYouTubeStatus();
  } catch (err) {
    alert('Failed to save settings: ' + err.message);
  }
}

// ----------------------------------------------------
// Logs & Modals
// ----------------------------------------------------
async function loadLogs() {
  try {
    const res = await fetch('/api/admin/logs');
    if (!res.ok) return;
    const data = await res.json();
    const term = document.getElementById('terminal-logs');
    term.innerHTML = (data.logs || []).map(l => {
      const time = new Date(l.timestamp).toLocaleTimeString();
      return `<div class="log-line"><span class="log-time">[${time}]</span> <span class="log-level-${l.level}">[${l.level}]</span> ${escapeHtml(l.message)}</div>`;
    }).join('');
  } catch (err) {
    console.error('Error loading logs:', err);
  }
}

function openModal(videoUrl, title, topic) {
  const modal = document.getElementById('video-modal');
  const player = document.getElementById('modal-player');
  document.getElementById('modal-video-title').textContent = title;
  document.getElementById('modal-video-topic').textContent = topic;
  player.src = videoUrl;
  modal.classList.add('active');
}

function closeModal() {
  const modal = document.getElementById('video-modal');
  const player = document.getElementById('modal-player');
  player.pause();
  player.src = '';
  modal.classList.remove('active');
}

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  } catch (err) {
    window.location.href = '/login';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
