// AI Shorts Automation Dashboard Controller

let activeTab = 'dashboard';
let pollTimer = null;

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

  // Polling every 10 seconds for real-time video generation updates
  pollTimer = setInterval(() => {
    loadStats();
    if (activeTab === 'dashboard' || activeTab === 'videos') {
      loadVideos();
    }
    if (activeTab === 'logs') {
      loadLogs();
    }
  }, 10000);
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
}

async function refreshData() {
  await Promise.all([loadStats(), loadYouTubeStatus(), loadVideos()]);
}

async function loadStats() {
  try {
    const res = await fetch('/api/admin/stats');
    if (res.status === 401) return (window.location.href = '/login');
    const data = await res.json();

    document.getElementById('stat-quota-progress').textContent = 
      `${data.today?.generatedToday || 0} / ${data.today?.quota || 2}`;
    
    document.getElementById('stat-uploaded-today').textContent = 
      data.today?.uploadedToday || 0;

    document.getElementById('stat-total-videos').textContent = 
      `Total Produced: ${data.totals?.total_videos || 0}`;

    if (data.lastUpload?.uploaded_at) {
      const dateStr = new Date(data.lastUpload.uploaded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      document.getElementById('stat-last-upload').textContent = `Last: ${dateStr} ("${(data.lastUpload.title || '').slice(0, 20)}...")`;
    }
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

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
      subsEl.textContent = 'Click "Connect YouTube" to authorize';
      btnYt.textContent = 'Connect YouTube';
      btnYt.style.background = '#cc0000';
    }
  } catch (err) {
    console.error('YouTube status check error:', err);
  }
}

async function loadVideos() {
  try {
    const res = await fetch('/api/admin/videos?limit=50');
    const data = await res.json();
    const videos = data.videos || [];

    // 1. Dashboard recent table (top 5)
    const recentTable = document.getElementById('dashboard-recent-table');
    if (videos.length === 0) {
      recentTable.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-dim);">No shorts generated yet. Click "⚡ Generate Short Now" to create your first video!</td></tr>`;
    } else {
      recentTable.innerHTML = videos.slice(0, 5).map(v => renderVideoRow(v, false)).join('');
    }

    // 2. All videos table
    const allTable = document.getElementById('all-videos-table');
    if (videos.length === 0) {
      allTable.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-dim);">No videos generated yet.</td></tr>`;
    } else {
      allTable.innerHTML = videos.map(v => renderVideoRow(v, true)).join('');
    }
  } catch (err) {
    console.error('Error loading videos:', err);
  }
}

function renderVideoRow(v, isFullView) {
  const isVideoReady = v.video_file && ['ready', 'uploaded', 'dry_run_completed'].includes(v.status);
  const mediaUrl = v.video_file ? (v.video_file.startsWith('http') ? v.video_file : `/media/videos/${v.video_file.split('/').pop()}`) : '';

  const thumbBtn = isVideoReady 
    ? `<div class="video-preview-btn" onclick="openModal('${mediaUrl}', '${escapeHtml(v.title || v.tool_name)}', '${escapeHtml(v.topic)}')">▶</div>`
    : `<div class="video-preview-btn" style="opacity:0.3; cursor:not-allowed;">⏳</div>`;

  const ytLink = v.youtube_url 
    ? `<a href="${v.youtube_url}" target="_blank" style="color:var(--accent-cyan); text-decoration:none; font-weight:600;">Open Short ↗</a>`
    : `<span style="color:var(--text-dim);">-</span>`;

  const dateStr = new Date(v.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  if (!isFullView) {
    return `
      <tr>
        <td>${thumbBtn}</td>
        <td>
          <div style="font-weight:700; color:#fff;">${escapeHtml(v.tool_name)}</div>
          <div style="font-size:12px; color:var(--text-dim);">${escapeHtml(v.topic.slice(0, 45))}...</div>
        </td>
        <td><div class="script-text">${escapeHtml(v.script || 'Script generating...')}</div></td>
        <td><span class="badge badge-${v.status}">${v.status.replace(/_/g, ' ')}</span></td>
        <td>${ytLink}</td>
        <td>
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" onclick="retryVideo('${v.id}')">Retry</button>
        </td>
      </tr>
    `;
  }

  return `
    <tr>
      <td>${thumbBtn}</td>
      <td style="font-weight:700; color:#fff;">${escapeHtml(v.tool_name)}</td>
      <td>
        <div style="font-weight:500; color:var(--text-main); margin-bottom:4px;">${escapeHtml(v.title || v.topic)}</div>
        <div class="script-text">${escapeHtml(v.script)}</div>
      </td>
      <td>${v.duration_seconds ? `${v.duration_seconds}s` : '-'}</td>
      <td><span class="badge badge-${v.status}">${v.status.replace(/_/g, ' ')}</span></td>
      <td>${ytLink}</td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" onclick="retryVideo('${v.id}')" title="Retry">↻</button>
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px; color:#fb7185;" onclick="deleteVideo('${v.id}')" title="Delete">🗑</button>
        </div>
      </td>
    </tr>
  `;
}

async function triggerManualShort() {
  const isDryRun = confirm('Do you want to run in DRY RUN mode (generates video & audio without publishing to YouTube)?\n\nClick [OK] for Dry Run (Recommended for testing)\nClick [Cancel] for Live YouTube Upload');
  try {
    const res = await fetch('/api/admin/generate-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDryRun })
    });
    const data = await res.json();
    alert(data.message || 'Generation initiated!');
    loadStats();
    loadVideos();
  } catch (err) {
    alert('Trigger failed: ' + err.message);
  }
}

async function retryVideo(id) {
  try {
    const res = await fetch(`/api/admin/retry/${id}`, { method: 'POST' });
    const data = await res.json();
    alert(data.message || 'Retry initiated');
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

async function loadResearch() {
  try {
    const res = await fetch('/api/admin/research');
    const data = await res.json();
    const tbody = document.getElementById('research-table');
    tbody.innerHTML = (data.sources || []).map(s => `
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
  }
}

async function loadSettings() {
  try {
    const res = await fetch('/api/admin/settings');
    const settings = await res.json();
    if (settings.daily_quota) document.getElementById('setting-quota').value = settings.daily_quota;
    if (settings.tts_voice) document.getElementById('setting-voice').value = settings.tts_voice;
    if (settings.youtube_privacy) document.getElementById('setting-privacy').value = settings.youtube_privacy;
    if (settings.default_hashtags) document.getElementById('setting-hashtags').value = settings.default_hashtags;
    if (settings.dry_run !== undefined) document.getElementById('setting-dryrun').checked = settings.dry_run === 'true';
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const payload = {
    daily_quota: document.getElementById('setting-quota').value,
    tts_voice: document.getElementById('setting-voice').value,
    youtube_privacy: document.getElementById('setting-privacy').value,
    default_hashtags: document.getElementById('setting-hashtags').value,
    dry_run: document.getElementById('setting-dryrun').checked ? 'true' : 'false'
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
  } catch (err) {
    alert('Failed to save settings: ' + err.message);
  }
}

async function loadLogs() {
  try {
    const res = await fetch('/api/admin/logs');
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
