/* ═══ STATE ═══ */
let SPREADSHEET_ID, VENUE_LABEL, VENUE;
const SHEETS = {
  venue:      '会場・基本情報',
  timetable:  'タイムテーブル',
  rotation:   'ローテーション',
  team:       'チーム',
};
let DATA = { venue: [], timetable: [], rotation: [], team: [] };
let loadedAt = null;

function csvUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

/* ═══ BOOTSTRAP ═══ */
async function bootstrap() {
  try {
    const config = await fetch('venues.json').then(r => {
      if (!r.ok) throw new Error('venues.json 読み込み失敗');
      return r.json();
    });
    VENUE = (config.venues || []).find(v => v.key === window.VENUE_KEY);
    if (!VENUE) throw new Error(`会場設定が見つかりません: ${window.VENUE_KEY}`);
    SPREADSHEET_ID = VENUE.spreadsheetId;
    VENUE_LABEL = VENUE.shortLabel;
    injectVenueMeta();
    setupListeners();
    loadAll();
    setInterval(loadAll, 30000);
  } catch (e) {
    const el = document.getElementById('venueInfoBlock');
    if (el) el.innerHTML = `<div class="error-box">会場設定の読み込みに失敗しました<br><small>${e.message}</small></div>`;
  }
}

function injectVenueMeta() {
  document.title = `HARIBOW オーディション 2026 — ${VENUE.shortLabel}`;
  const badge = document.getElementById('venueBadge');
  if (badge) badge.textContent = VENUE.label;
  updateSearchSubtitle(VENUE.fallbackDate);
}

function updateSearchSubtitle(dateStr) {
  const el = document.getElementById('search-subtitle');
  if (!el || !VENUE) return;
  const short = shortDate(dateStr);
  el.textContent = `HARIBOW オーディション 2026 — 二次審査 ${VENUE.shortLabel}${short ? ' ' + short : ''}`;
}

function shortDate(jpDate) {
  const m = /(\d+)月(\d+)日/.exec(jpDate || '');
  return m ? `${m[1]}/${m[2]}` : '';
}

function setupListeners() {
  const input = document.getElementById('nameInput');
  if (input) input.addEventListener('keydown', e => {
    if (e.key === 'Enter') searchName();
  });
}

/* ═══ LOAD ═══ */
async function fetchCSV(sheetName) {
  const res = await fetch(csvUrl(sheetName));
  if (!res.ok) throw new Error(`${sheetName} の読み込みに失敗しました`);
  const text = await res.text();
  return parseCSV(text);
}

function parseCSV(text) {
  const rows = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i+1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === ',' && !inQ) {
        cols.push(cur.trim()); cur = '';
      } else cur += c;
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

async function loadAll() {
  try {
    const [venue, timetable, rotation, team] = await Promise.all([
      fetchCSV(SHEETS.venue),
      fetchCSV(SHEETS.timetable),
      fetchCSV(SHEETS.rotation),
      fetchCSV(SHEETS.team),
    ]);
    DATA.venue = venue;
    DATA.timetable = timetable;
    DATA.rotation = rotation;
    DATA.team = team;
    loadedAt = new Date();
    document.getElementById('lastUpdated').textContent = loadedAt.toLocaleTimeString('ja-JP');
    renderAll();
  } catch(e) {
    document.getElementById('lastUpdated').textContent = 'エラー';
    ['venueInfoBlock','timetableBlock','rotationBlock','teamBlock'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div class="error-box">データの読み込みに失敗しました。スプシの公開設定を確認してください。<br><small>${e.message}</small></div>`;
    });
  }
}

function reloadData() {
  document.getElementById('lastUpdated').textContent = '更新中...';
  ['venueInfoBlock','timetableBlock','rotationBlock','teamBlock'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="loading"><div class="spinner"></div>読み込み中...</div>';
  });
  loadAll();
}

/* ═══ RENDER ALL ═══ */
function renderAll() {
  renderVenue();
  renderTimetable();
  renderRotation();
  renderTeam();
}

/* ─── 会場情報 ─── */
function renderVenue() {
  const rows = DATA.venue.filter(r => r.length >= 2 && r[0] && r[1] && r[0] !== '項目');
  if (!rows.length) {
    document.getElementById('venueInfoBlock').innerHTML = '<div class="empty-box">会場情報が登録されていません</div>';
    return;
  }
  const html = `<div class="venue-grid">${rows.map(r =>
    `<div class="venue-row"><span class="venue-key">${r[0]}</span><span class="venue-val">${r[1]}</span></div>`
  ).join('')}</div>`;
  document.getElementById('venueInfoBlock').innerHTML = html;

  // タイムテーブルのサブタイトルも更新
  const dateRow = rows.find(r => r[0] === '審査日');
  const venueRow = rows.find(r => r[0] === '会場名');
  if (dateRow || venueRow) {
    document.getElementById('timetable-subtitle').textContent =
      `${dateRow ? dateRow[1] : ''} ${venueRow ? '— ' + venueRow[1] : ''}`;
  }
  // 自分の出番確認ページのサブタイトルも更新
  if (dateRow) updateSearchSubtitle(dateRow[1]);
}

/* ─── タイムテーブル ─── */
function renderTimetable() {
  const rows = DATA.timetable.filter(r => r.length >= 2 && r[0] && r[0] !== '時間');
  if (!rows.length) {
    document.getElementById('timetableBlock').innerHTML = '<div class="empty-box">タイムテーブルが登録されていません</div>';
    return;
  }
  const phaseColors = { '休憩': 'break', '昼休憩': 'break', 'チーム審査': 'team' };
  const html = `<div class="timeline">${rows.map(r => {
    const [time, phase, content, note] = r;
    const dotClass = phaseColors[phase] || 'active';
    return `<div class="tl-item">
      <div class="tl-time">${time||''}</div>
      <div class="tl-dot ${dotClass}"></div>
      <div class="tl-content">
        <div class="tl-title">${phase||''} ${content ? '— ' + content : ''}</div>
        ${note ? `<div class="tl-tags"><span class="tl-tag">${note}</span></div>` : ''}
      </div>
    </div>`;
  }).join('')}</div>`;
  document.getElementById('timetableBlock').innerHTML = html;
}

/* ─── ローテーション ─── */
const SKILL_CLASS = {'ベーシック':'sk-basic','ハリー':'sk-harry','３倍':'sk-speed','フロア':'sk-floor','アクロ':'sk-acro','縄':'sk-rope'};

function renderRotation() {
  const rows = DATA.rotation.filter(r => r.length >= 5 && r[0] && r[0] !== 'Rot番号');
  if (!rows.length) {
    document.getElementById('rotationBlock').innerHTML = '<div class="empty-box">ローテーションが登録されていません<br><small>生成アプリでCSVを出力して、スプシに貼り付けてください</small></div>';
    return;
  }

  // Rot番号でグループ化
  const groups = {};
  rows.forEach(r => {
    const [rotNum, type, court, skill, jumper, t1, t2, judgeJ, judgeR] = r;
    if (!groups[rotNum]) groups[rotNum] = [];
    groups[rotNum].push({type, court, skill, jumper, t1, t2, judgeJ, judgeR});
  });

  let html = '';
  Object.entries(groups).forEach(([rotNum, courts]) => {
    const isBasic = courts[0].type === 'ベーシック';
    const colCount = Math.min(courts.length, 3);
    html += `<div class="rot-card">
      <div class="rot-header">
        <span class="rot-header-num">Rot. ${rotNum}</span>
        ${isBasic
          ? `<span class="skill-tag sk-basic">ベーシック（リズム）</span><span style="font-size:11px;color:var(--text3)">単独審査</span>`
          : `<span style="font-size:12px;color:var(--text3)">${courts.length}コート同時進行</span>`
        }
      </div>
      <div class="rot-body" style="grid-template-columns:repeat(${colCount},1fr)">
        ${courts.map(c => {
          const skClass = SKILL_CLASS[c.skill] || '';
          const turners = [c.t1, c.t2].filter(Boolean);
          return `<div class="court-block">
            ${!isBasic ? `<div class="court-lbl">${c.court} — <span class="skill-tag ${skClass}" style="font-size:10px;padding:1px 6px">${c.skill}</span></div>` : ''}
            <div class="court-field"><span class="court-key">ジャンパー</span><span class="role-chip chip-jumper">${c.jumper}</span></div>
            <div class="court-field"><span class="court-key">ターナー</span>
              ${turners.length ? turners.map(t=>`<span class="role-chip chip-turner">${t}</span>`).join(' ') : '<span style="font-size:11px;color:var(--text3)">なし</span>'}
            </div>
            <div class="judge-sep">
              <div class="court-field"><span class="court-key">J審査員</span><span style="font-size:11px;background:#fff8ee;border:.5px solid #f5d090;color:#9a6000;padding:2px 8px;border-radius:20px">${c.judgeJ||''}</span></div>
              ${c.judgeR && c.judgeR !== '（不要）' ? `<div class="court-field"><span class="court-key">縄審査員</span><span style="font-size:11px;background:#eefff4;border:.5px solid #a0e0b8;color:#1a7a40;padding:2px 8px;border-radius:20px">${c.judgeR}</span></div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  });
  document.getElementById('rotationBlock').innerHTML = html;
}

/* ─── チーム ─── */
const TEAM_COLORS = ['#1a5fb4','#1a7a40','#854F0B','#3C3489','#993C1D','#0F6E56','#c0392b','#9a6000'];
function renderTeam() {
  const rows = DATA.team.filter(r => r.length >= 2 && r[0] && r[0] !== 'チーム名');
  if (!rows.length) {
    document.getElementById('teamBlock').innerHTML = '<div class="empty-box">チーム情報が登録されていません<br><small>生成アプリでCSVを出力して、スプシに貼り付けてください</small></div>';
    return;
  }

  // チーム名でグループ化
  const teams = {};
  const teamOrder = [];
  rows.forEach(r => {
    const [teamName, name, type, skills] = r;
    if (!teams[teamName]) { teams[teamName] = []; teamOrder.push(teamName); }
    teams[teamName].push({name, type, skills});
  });

  const html = `<div class="team-grid">${teamOrder.map((tName, ti) => {
    const members = teams[tName];
    const color = TEAM_COLORS[ti % TEAM_COLORS.length];
    return `<div class="team-card">
      <div class="team-card-header" style="border-top:3px solid ${color}">
        <span class="team-card-name">${tName}</span>
        <span style="font-size:11px;color:var(--text3)">${members.length}名</span>
      </div>
      <div class="team-card-body">
        ${members.map(m => {
          const skillList = (m.skills || '').split('・').filter(Boolean);
          return `<div class="team-member-row">
            <span class="member-name">${m.name}</span>
            <span style="font-size:10px;color:var(--text3);margin-right:2px">${m.type === '運営スタッフ' ? '運営' : ''}</span>
            <div class="member-pills">${skillList.map(s => `<span class="member-pill ${SKILL_CLASS[s]||''}">${s}</span>`).join('')}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('')}</div>`;
  document.getElementById('teamBlock').innerHTML = html;
}

/* ═══ SEARCH ═══ */
function searchName() {
  const query = document.getElementById('nameInput').value.trim();
  const el = document.getElementById('searchResult');
  if (!query) { el.innerHTML = ''; return; }

  // ローテから検索
  const rotRows = DATA.rotation.filter(r => r.length >= 5 && r[0] && r[0] !== 'Rot番号');
  const appearances = [];
  const seen = new Set();

  rotRows.forEach(r => {
    const [rotNum, type, court, skill, jumper, t1, t2] = r;
    if (jumper && jumper.includes(query)) {
      const key = `${rotNum}-${skill}-ジャンパー`;
      if (!seen.has(key)) { seen.add(key); appearances.push({rotNum, skill, role: 'ジャンパー'}); }
    }
    [t1, t2].forEach(t => {
      if (t && t.includes(query)) {
        const key = `${rotNum}-${skill}-ターナー`;
        if (!seen.has(key)) { seen.add(key); appearances.push({rotNum, skill, role: 'ターナー'}); }
      }
    });
  });

  // チームから検索
  const teamRows = DATA.team.filter(r => r.length >= 2 && r[0] && r[0] !== 'チーム名');
  let myTeam = null;
  let myTeamMembers = [];
  teamRows.forEach(r => {
    const [teamName, name] = r;
    if (name && name.includes(query)) myTeam = teamName;
  });
  if (myTeam) {
    myTeamMembers = teamRows.filter(r => r[0] === myTeam).map(r => ({
      name: r[1],
      type: r[2],
      skills: r[3]
    }));
  }

  if (!appearances.length && !myTeam) {
    el.innerHTML = `<div class="no-result">「${query}」は見つかりませんでした。<br><span style="font-size:12px;color:var(--text3)">名前の表記を確認してください</span></div>`;
    return;
  }

  let html = `<div class="result-card">
    <div class="result-header">
      <span style="display:flex;align-items:center"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="7" r="4"/><path d="M3 19c0-3.9 3.1-7 7-7s7 3.1 7 7"/></svg></span>
      <span class="result-name">${query}</span>
      ${myTeam ? `<span class="team-chip">${myTeam}</span>` : ''}
    </div>`;

  if (appearances.length) {
    html += `<div class="result-section">
      <div class="result-section-title">ソロ審査 出番（${appearances.length}回）</div>
      <div class="result-rows">
        ${appearances.map(a => `<div class="result-row">
          <span class="rot-num">Rot.${a.rotNum}</span>
          <span class="skill-tag ${SKILL_CLASS[a.skill]||''}">${a.skill||'ベーシック'}</span>
          <span class="role-chip ${a.role==='ジャンパー'?'chip-jumper':'chip-turner'}">${a.role}</span>
        </div>`).join('')}
      </div>
    </div>`;
  }

  if (myTeam) {
    html += `<hr class="result-divider">
    <div class="result-section">
      <div class="result-section-title">チーム審査</div>
      <div class="team-card">
        <div class="team-card-header" style="border-top:3px solid #1a5fb4">
          <span class="team-card-name">${myTeam}</span>
          <span style="font-size:11px;color:var(--text3)">${myTeamMembers.length}名</span>
        </div>
        <div class="team-card-body">
          ${myTeamMembers.map(m => {
            const skillList = (m.skills || '').split('・').filter(Boolean);
            const isMe = m.name && m.name.includes(query);
            return `<div class="team-member-row"${isMe ? ' style="background:#fff8ee;margin:0 -14px;padding:6px 14px"' : ''}>
              <span class="member-name">${m.name}${isMe ? ' <span style="font-size:11px;color:#d9730d;font-weight:600;margin-left:4px">← あなた</span>' : ''}</span>
              <span style="font-size:10px;color:var(--text3);margin-right:2px">${m.type === '運営スタッフ' ? '運営' : ''}</span>
              <div class="member-pills">${skillList.map(s => `<span class="member-pill ${SKILL_CLASS[s]||''}">${s}</span>`).join('')}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
  }

  html += '</div>';
  el.innerHTML = html;
}

/* ═══ NAVIGATION ═══ */
function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
}

/* ═══ INIT ═══ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
