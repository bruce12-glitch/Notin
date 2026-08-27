// app.js — WP-APP-001 + WP-APP-002 TipTap + WP-APP-003 Trash (memory token only, never localStorage)
import { api, getPersistedEmail } from './auth-client.js';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';

const API_BASE = (window.NOTIN_API || '').replace(/\/$/, '') || '';

let memToken = null;
let notes = [];
let selectedId = null;
let saveTimer = null;
let isSaving = false;
let editRevision = 0;
let editor = null;
let currentFilter = 'active'; // 'active' | 'trash'
let currentQuery = ''; // WP-APP-004 — active search string ('' = no search)
let searchDebounce = null; // debounce timer for search input
let notebooks = []; // WP-APP-005 — user's notebooks
let currentNotebookId = null; // WP-APP-005 — null = All notes (no notebook filter)
let tags = []; // WP-APP-006 — user's tags
let currentTagId = null; // WP-APP-006 — null = no tag filter
let currentSort = 'updated'; // WP-APP-007 — list sort control ('updated' | 'created' | 'title'); pins always win
const NOTES_PAGE_SIZE = 100;
let notesPage = 1;
let notesTotalPages = 1;
let notesTotal = 0;
// WP-UI-NOTES-3D-001 — motion state shared by list entrances, note-open
// transitions, and the delegated pointer-tilt engine.
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointerQuery = window.matchMedia('(pointer: fine)');
let listAnimateNext = false;
let listAnimationTimer = null;
// WP-UI-HOME-001 — tiny hash router for authenticated app views.
let currentView = 'home'; // home | notes | shortcuts | notebooks | tags | trash | tasks | templates | account
let routeReady = false;
let soonToastTimer = null;
// WP-APP-010 — offline read state. Tokens remain memory-only; only the non-secret user id
// is kept in sessionStorage so an IndexedDB snapshot can be scoped to this browser session.
let currentUserId = null;
let offlineReadOnly = !navigator.onLine;
let offlineSnapshot = null;

// DOM
const emailEl = document.getElementById('appEmail');
const countEl = document.getElementById('noteCount');
const countAllEl = document.getElementById('countAll');
const countTrashEl = document.getElementById('countTrash');
const listTitleEl = document.getElementById('listTitle');
const listEl = document.getElementById('noteList');
const loadMoreNotesBtn = document.getElementById('loadMoreNotes');
const emptyEl = document.getElementById('emptyState');
const emptyTrashEl = document.getElementById('emptyTrash');
// WP-APP-004 — full-text search UI (title + body plain text)
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const emptySearchEl = document.getElementById('emptySearch');
const clearSearchEmptyBtn = document.getElementById('clearSearchEmpty');
// WP-APP-005 — notebooks (minimal organize)
const newNotebookBtn = document.getElementById('newNotebookBtn');
const newNotebookForm = document.getElementById('newNotebookForm');
const newNotebookInput = document.getElementById('newNotebookInput');
const newNotebookAdd = document.getElementById('newNotebookAdd');
const newNotebookCancel = document.getElementById('newNotebookCancel');
const newNotebookErr = document.getElementById('newNotebookErr');
const notebookListEl = document.getElementById('notebookList');
const nbSelect = document.getElementById('noteNotebookSelect');
// WP-APP-006 — tags (minimal organize)
const newTagBtn = document.getElementById('newTagBtn');
const newTagForm = document.getElementById('newTagForm');
const newTagInput = document.getElementById('newTagInput');
const newTagAdd = document.getElementById('newTagAdd');
const newTagCancel = document.getElementById('newTagCancel');
const newTagErr = document.getElementById('newTagErr');
const tagListEl = document.getElementById('tagList');
const tagRow = document.getElementById('tagRow');
const tagChips = document.getElementById('tagChips');
const tagAddSelect = document.getElementById('tagAddSelect');
// WP-APP-007 — pin notes + sort control
const pinBtn = document.getElementById('pinBtn');       // editor action (hidden until a note is selected)
const sortSelect = document.getElementById('sortSelect'); // list-header sort dropdown
// WP-APP-009 — read-only share link controls
const shareBtn = document.getElementById('shareBtn');
const sharePanel = document.getElementById('sharePanel');
const shareLinkInput = document.getElementById('shareLinkInput');
const copyShareBtn = document.getElementById('copyShareBtn');
const revokeShareBtn = document.getElementById('revokeShareBtn');
const shareStatus = document.getElementById('shareStatus');
// WP-AI-001 — manual note summarization
const summarizeBtn = document.getElementById('summarizeBtn');
const aiSummaryCard = document.getElementById('aiSummaryCard');
const aiSummaryText = document.getElementById('aiSummaryText');
const aiSummaryMeta = document.getElementById('aiSummaryMeta');
const aiSummaryDismiss = document.getElementById('aiSummaryDismiss');
// WP-AI-002 — AI title suggestion (server suggests; user accepts via autosave)
const aiTitleBar = document.getElementById('aiTitleBar');
const aiTitleText = document.getElementById('aiTitleText');
const aiTitleApply = document.getElementById('aiTitleApply');
const aiTitleDismiss = document.getElementById('aiTitleDismiss');
let aiTitleNoteId = null;
const titleSuggestedFor = new Set(); // session-only: suggested-or-dismissed note ids
// WP-AI-002b — smart tag suggestions (server suggests; user applies)
const aiTagBar = document.getElementById('aiTagBar');
const aiTagChips = document.getElementById('aiTagChips');
const aiTagDismiss = document.getElementById('aiTagDismiss');
let aiTagNoteId = null;
const tagsSuggestedFor = new Set(); // session-only: never re-suggest after fetch/dismiss
// WP-AI-003 — chat with note (transcript is session-only: memory, never storage)
const askNoteBtn = document.getElementById('askNoteBtn');
const aiChatPanel = document.getElementById('aiChatPanel');
const aiChatLog = document.getElementById('aiChatLog');
const aiChatForm = document.getElementById('aiChatForm');
const aiChatInput = document.getElementById('aiChatInput');
const aiChatSend = document.getElementById('aiChatSend');
const aiChatClose = document.getElementById('aiChatClose');
let chatNoteId = null;
let chatHistory = []; // [{role,content}] — in-memory only, cleared on note change/reload
let chatInFlight = false;
// WP-AI-004 — writing assistant (pending suggestions live in memory only)
const assistBtn = document.getElementById('assistBtn');
const assistMenu = document.getElementById('assistMenu');
const aiAssistBar = document.getElementById('aiAssistBar');
const aiAssistLabel = document.getElementById('aiAssistLabel');
const aiAssistText = document.getElementById('aiAssistText');
const aiAssistApply = document.getElementById('aiAssistApply');
const aiAssistDismiss = document.getElementById('aiAssistDismiss');
// WP-AI-004b — floating selection bubble (same runner + Apply bar as the dropdown)
const aiBubbleMenu = document.getElementById('aiBubbleMenu');
let assistAction = null;
let assistRange = null;
let assistInFlight = false;
let assistSuggestion = '';
let assistNoteId = null;
let sharedNoteId = null;
// WP-APP-008 — image attachments
const attachmentRow = document.getElementById('attachmentRow');
const attachImageBtn = document.getElementById('attachImageBtn');
const attachImageInput = document.getElementById('attachImageInput');
const attachmentStatus = document.getElementById('attachmentStatus');
const attachmentGallery = document.getElementById('attachmentGallery');
let attachmentObjectUrls = [];
let attachmentLoadVersion = 0;
const titleInput = document.getElementById('editorTitle');
const saveBtn = document.getElementById('saveBtn');
const saveStatus = document.getElementById('saveStatus');
const newBtn = document.getElementById('newNoteBtn');
const newBtnEmpty = document.getElementById('newNoteBtnEmpty');
const newWrap = document.getElementById('newNoteWrap');
const logoutBtn = document.getElementById('logoutBtn');
// WP-AUTH-004 — account export + permanent deletion
const accountBtn = document.getElementById('accountBtn');
const accountModal = document.getElementById('accountModal');
const accountModalBackdrop = document.getElementById('accountModalBackdrop');
const accountModalClose = document.getElementById('accountModalClose');
const exportDataBtn = document.getElementById('exportDataBtn');
const deleteAccountConfirm = document.getElementById('deleteAccountConfirm');
const deleteAccountBtn = document.getElementById('deleteAccountBtn');
const accountStatus = document.getElementById('accountStatus');
const usageStats = document.getElementById('usageStats');
const sessionsList = document.getElementById('sessionsList');
const revokeOthersBtn = document.getElementById('revokeOthersBtn');
const refreshSessionsBtn = document.getElementById('refreshSessionsBtn');
// WP-BILLING-001 — plan summary + checkout/portal entry points
const planSummary = document.getElementById('planSummary');
const upgradeBtn = document.getElementById('upgradeBtn');
const manageBillingBtn = document.getElementById('manageBillingBtn');
const offlineBanner = document.getElementById('offlineBanner');
const errorBanner = document.getElementById('appError');
const mobileBar = document.getElementById('mobileBar');
const mobileBack = document.getElementById('mobileBack');
const layout = document.getElementById('appLayout');
const navAll = document.getElementById('navAllNotes');
const navTrash = document.getElementById('navTrash');
const trashBtn = document.getElementById('trashBtn');
const restoreBtn = document.getElementById('restoreBtn');
const deleteBtn = document.getElementById('deleteBtn');
const deleteModal = document.getElementById('deleteModal');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalCancel = document.getElementById('modalCancel');
const modalConfirm = document.getElementById('modalConfirm');
// WP-UI-HOME-001 — Home shell and global navigation.
const homeView = document.getElementById('homeView');
const editorWorkspace = document.getElementById('editorWorkspace');
const homeNoteGrid = document.getElementById('homeNoteGrid');
const homeGreeting = document.getElementById('homeGreeting');
const homeNewNoteTop = document.getElementById('homeNewNoteTop');
const homeViewAll = document.getElementById('homeViewAll');
const sidebarNewNote = document.getElementById('sidebarNewNote');
const syncNotesBtn = document.getElementById('syncNotesBtn');
const openAiToolsBtn = document.getElementById('openAiToolsBtn');
const openAiToolsFab = document.getElementById('openAiToolsFab');
const globalSearchForm = document.getElementById('globalSearchForm');
const globalSearchInput = document.getElementById('globalSearchInput');
const globalSearchClear = document.getElementById('globalSearchClear');
const navHome = document.getElementById('navHome');
const navShortcuts = document.getElementById('navShortcuts');
const navNotebooks = document.getElementById('navNotebooks');
const navTags = document.getElementById('navTags');
const notebookSection = document.getElementById('notebookSection');
const tagSection = document.getElementById('tagSection');
const accountUserBtn = document.getElementById('accountBtn');
const appAvatar = document.getElementById('appAvatar');
const appUserName = document.getElementById('appUserName');
const scratchPad = document.getElementById('scratchPad');
const scratchStatus = document.getElementById('scratchStatus');
const soonToast = document.getElementById('soonToast');
const sidebarOpen = document.getElementById('sidebarOpen');
const sidebarClose = document.getElementById('sidebarClose');
const sidebarScrim = document.getElementById('sidebarScrim');
const shortcutsView = document.getElementById('shortcutsView');
const shortcutsGrid = document.getElementById('shortcutsGrid');
const shortcutsCount = document.getElementById('shortcutsCount');
const shortcutsViewNotes = document.getElementById('shortcutsViewNotes');
const organizeView = document.getElementById('organizeView');
const organizeTitle = document.getElementById('organizeTitle');
const organizeDescription = document.getElementById('organizeDescription');
const organizeCreateBtn = document.getElementById('organizeCreateBtn');
const organizeCreateForm = document.getElementById('organizeCreateForm');
const organizeCreateInput = document.getElementById('organizeCreateInput');
const organizeInputLabel = document.getElementById('organizeInputLabel');
const organizeCreateCancel = document.getElementById('organizeCreateCancel');
const organizeCreateError = document.getElementById('organizeCreateError');
const organizeListTitle = document.getElementById('organizeListTitle');
const organizeCount = document.getElementById('organizeCount');
const organizeGrid = document.getElementById('organizeGrid');
const navTasks = document.getElementById('navTasks');
const navTemplates = document.getElementById('navTemplates');
const tasksView = document.getElementById('tasksView');
const tasksList = document.getElementById('tasksList');
const tasksCount = document.getElementById('tasksCount');
const tasksNewNote = document.getElementById('tasksNewNote');
const countTasksEl = document.getElementById('countTasks');
const templatesView = document.getElementById('templatesView');
const templatesGrid = document.getElementById('templatesGrid');
const templatesBlankNote = document.getElementById('templatesBlankNote');
const noteMoreBtn = document.getElementById('noteMoreBtn');
const noteMoreMenu = document.getElementById('noteMoreMenu');
const shortcutsHelpModal = document.getElementById('shortcutsHelpModal');
const shortcutsHelpBackdrop = document.getElementById('shortcutsHelpBackdrop');
const shortcutsHelpClose = document.getElementById('shortcutsHelpClose');

function getEmail(){
  const qs = new URLSearchParams(location.search);
  const q = qs.get('email');
  if(q){
    try{ sessionStorage.setItem('notin_email', q); }catch{}
    history.replaceState({},'', location.pathname);
    return q;
  }
  return getPersistedEmail() || '';
}
function setError(msg){
  if(!errorBanner) return;
  errorBanner.textContent = msg || '';
  if(msg) errorBanner.style.display = 'block';
  else errorBanner.style.display = 'none';
}
function formatDate(iso){
  try{ const d=new Date(iso); return d.toLocaleDateString(undefined,{month:'short', day:'numeric'}) + ' ' + d.toLocaleTimeString(undefined,{hour:'2-digit', minute:'2-digit'}); }catch{ return ''; }
}
function snippetFromText(text){
  if(!text) return '';
  const s = String(text).trim().replace(/\s+/g,' ');
  return s.length>110 ? s.slice(0,110)+'…' : s;
}
function plainFromNote(note){
  if(note.contentText) return note.contentText;
  if(note.description) return note.description;
  if(note.contentJson){
    try{
      const json = typeof note.contentJson === 'string' ? JSON.parse(note.contentJson) : note.contentJson;
      return extractPlain(json);
    }catch{}
  }
  return '';
}
function extractPlain(node){
  if(!node) return '';
  if(node.type==='text' && node.text) return node.text;
  let out='';
  if(Array.isArray(node.content)){
    for(const c of node.content){
      const t = extractPlain(c);
      if(t) out += (out && !out.endsWith(' ') ? ' ' : '') + t;
      if(c.type==='paragraph' || c.type==='heading') out += ' ';
    }
  }
  return out.trim();
}
function docFromNote(note){
  if(note.contentJson){
    try{
      const j = typeof note.contentJson === 'string' ? JSON.parse(note.contentJson) : note.contentJson;
      if(j && j.type==='doc') return j;
    }catch{}
  }
  const text = note.contentText || note.description || '';
  if(!text) return { type:'doc', content:[{type:'paragraph'}] };
  const paras = text.split(/\n{2,}/).map(t=>t.trim()).filter(Boolean);
  if(paras.length===0) return { type:'doc', content:[{type:'paragraph'}] };
  if(paras.length===1){
    return { type:'doc', content:[{type:'paragraph', content:[{type:'text', text: paras[0]}]}] };
  }
  return { type:'doc', content: paras.map(p=>({type:'paragraph', content:[{type:'text', text:p}]})) };
}
function createEmptyDoc(){ return { type:'doc', content:[{type:'paragraph'}] }; }
// WP-APP-007 — pushpin glyph (list rows + editor action share it)
const PIN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H16v-2c-1.66 0-3-1.34-3-3z"/></svg>';
function tPara(text){ return { type:'paragraph', content: text ? [{type:'text', text}] : [] }; }
function tHeading(level, text){ return { type:'heading', attrs:{level}, content:[{type:'text', text}] }; }
function tTask(text, checked=false){ return { type:'taskItem', attrs:{checked}, content:[tPara(text)] }; }
function tBullet(text){ return { type:'listItem', content:[tPara(text)] }; }
function tDoc(...content){ return { type:'doc', content }; }
function templatePlain(doc){ return extractPlain(doc); }
const NOTE_TEMPLATES = [
  { id:'meeting', icon:'🗓', name:'Meeting notes', blurb:'Agenda, decisions, and follow-ups.', title:'Meeting notes',
    doc: tDoc(tHeading(2,'Attendees'), tPara(''), tHeading(2,'Agenda'), {type:'bulletList', content:[tBullet('Topic 1'), tBullet('Topic 2')]}, tHeading(2,'Notes'), tPara(''), tHeading(2,'Decisions'), tPara(''), tHeading(2,'Action items'), {type:'taskList', content:[tTask('Owner — follow up'), tTask('Send recap')]}) },
  { id:'journal', icon:'✎', name:'Daily journal', blurb:'A short prompt to capture the day.', title:'Daily journal',
    doc: tDoc(tHeading(2,'Today I am grateful for'), tPara(''), tHeading(2,'What happened'), tPara(''), tHeading(2,'What I learned'), tPara(''), tHeading(2,'Tomorrow'), {type:'taskList', content:[tTask('One important next step')]}) },
  { id:'todo', icon:'☑', name:'To-do list', blurb:'A focused checklist you can reopen from Tasks.', title:'To-do list',
    doc: tDoc(tPara('Keep this list short. Move finished work out of the way.'), {type:'taskList', content:[tTask('Most important task'), tTask('Second priority'), tTask('Nice to have')]}) },
  { id:'project', icon:'▣', name:'Project brief', blurb:'Goal, scope, and next steps.', title:'Project brief',
    doc: tDoc(tHeading(2,'Goal'), tPara('What does done look like?'), tHeading(2,'Scope'), {type:'bulletList', content:[tBullet('In scope'), tBullet('Out of scope')]}, tHeading(2,'Milestones'), {type:'taskList', content:[tTask('Kickoff'), tTask('First draft'), tTask('Ship')]}, tHeading(2,'Risks'), tPara('')) },
  { id:'weekly', icon:'⟳', name:'Weekly review', blurb:'Look back, then plan the next week.', title:'Weekly review',
    doc: tDoc(tHeading(2,'Wins'), tPara(''), tHeading(2,'Misses'), tPara(''), tHeading(2,'Lessons'), tPara(''), tHeading(2,'Next week'), {type:'taskList', content:[tTask('Priority 1'), tTask('Priority 2'), tTask('Priority 3')]}) },
  { id:'braindump', icon:'✦', name:'Brain dump', blurb:'Empty the noise, then sort later.', title:'Brain dump',
    doc: tDoc(tPara('Write everything that is on your mind. Organize after the page is full.'), tPara('')) },
];

// WP-APP-007 — pin-aware sort. Pinned notes always precede unpinned ones;
// within each group the active sort control decides (updated/created/title).
function compareNotes(a,b){
  const pa = a.isPinned ? 1 : 0, pb = b.isPinned ? 1 : 0;
  if(pa !== pb) return pb - pa; // pin always wins
  if(currentSort==='title'){
    const t = String(a.title||'Untitled').localeCompare(String(b.title||'Untitled'));
    if(t!==0) return t;
  } else if(currentSort==='created'){
    const c = new Date(b.createdAt||0) - new Date(a.createdAt||0);
    if(c!==0) return c;
  }
  // default 'updated' (also the tiebreak): most recently edited first
  return new Date(b.updatedAt||b.createdAt||0) - new Date(a.updatedAt||a.createdAt||0);
}
function sortNotes(arr){
  arr.sort(compareNotes);
  return arr;
}

// ── WP-APP-010 — per-user IndexedDB snapshots (never tokens) ──
const OFFLINE_DB_NAME = 'notin-offline-v1';
const OFFLINE_STORE = 'snapshots';
function idbRequest(request){
  return new Promise((resolve,reject)=>{
    request.onsuccess = ()=> resolve(request.result);
    request.onerror = ()=> reject(request.error);
  });
}
function idbTransactionDone(tx){
  return new Promise((resolve,reject)=>{
    tx.oncomplete = ()=> resolve();
    tx.onerror = ()=> reject(tx.error);
    tx.onabort = ()=> reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}
async function openOfflineDb(){
  if(!('indexedDB' in window)) return null;
  return new Promise((resolve,reject)=>{
    const request = indexedDB.open(OFFLINE_DB_NAME, 1);
    request.onupgradeneeded = ()=>{
      const db = request.result;
      if(!db.objectStoreNames.contains(OFFLINE_STORE)) db.createObjectStore(OFFLINE_STORE, {keyPath:'userId'});
    };
    request.onsuccess = ()=> resolve(request.result);
    request.onerror = ()=> reject(request.error);
  });
}
async function readOfflineSnapshot(userId=currentUserId){
  if(!userId) return null;
  try{
    const db = await openOfflineDb();
    if(!db) return null;
    const tx = db.transaction(OFFLINE_STORE, 'readonly');
    const value = await idbRequest(tx.objectStore(OFFLINE_STORE).get(userId));
    db.close();
    return value || null;
  }catch{ return null; }
}
async function updateOfflineSnapshot(patch){
  if(!currentUserId || offlineReadOnly) return;
  try{
    const db = await openOfflineDb();
    if(!db) return;
    const tx = db.transaction(OFFLINE_STORE, 'readwrite');
    const store = tx.objectStore(OFFLINE_STORE);
    const existing = await idbRequest(store.get(currentUserId)) || {userId:currentUserId, notes:[], notebooks:[], tags:[]};
    const next = {...existing, ...patch, userId:currentUserId, email:getEmail(), savedAt:new Date().toISOString()};
    store.put(next);
    await idbTransactionDone(tx);
    offlineSnapshot = next;
    db.close();
  }catch{}
}
async function deleteOfflineSnapshot(userId=currentUserId){
  if(!userId) return;
  try{
    const db = await openOfflineDb();
    if(!db) return;
    const tx = db.transaction(OFFLINE_STORE, 'readwrite');
    tx.objectStore(OFFLINE_STORE).delete(userId);
    await idbTransactionDone(tx);
    db.close();
  }catch{}
}
function userIdFromToken(token){
  try{
    const encoded = token.split('.')[1];
    const normalized = encoded.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(encoded.length/4)*4, '=');
    return JSON.parse(atob(normalized)).sub || null;
  }catch{ return null; }
}
function cachedNotesForCurrentView(){
  let cached = Array.isArray(offlineSnapshot?.notes) ? [...offlineSnapshot.notes] : [];
  cached = cached.filter(note=> currentFilter==='trash' ? !!note.isTrashed : !note.isTrashed);
  if(currentNotebookId) cached = cached.filter(note=>note.notebookId===currentNotebookId);
  if(currentTagId) cached = cached.filter(note=>(note.tags||[]).some(tag=>tag.id===currentTagId));
  if(currentQuery){
    const q = currentQuery.toLowerCase();
    cached = cached.filter(note=>`${note.title||''} ${plainFromNote(note)}`.toLowerCase().includes(q));
  }
  return sortNotes(cached);
}
function loadCachedNotes(){
  notes = cachedNotesForCurrentView();
  renderList();
  const all = Array.isArray(offlineSnapshot?.notes) ? offlineSnapshot.notes : [];
  const activeCount = all.filter(note=>!note.isTrashed).length;
  const trashCount = all.filter(note=>!!note.isTrashed).length;
  if(countAllEl) countAllEl.textContent = String(activeCount);
  if(countTrashEl) countTrashEl.textContent = String(trashCount);
  if(countEl) countEl.textContent = `${notes.length} ${notes.length===1?'note':'notes'}`;
  if(notes.length){
    const next = notes.find(note=>note.id===selectedId) || notes[0];
    selectNote(next.id);
  }else{
    selectedId = null;
    titleInput.value = '';
    if(editor) editor.commands.setContent(createEmptyDoc(), false);
    updateEditorForSelection(null);
  }
}

// WP-SEC-002 — echo the signed double-submit cookie on cookie-carried mutations
function readCookie(name){
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}
function csrfHeaders(){
  const t = readCookie('notin_csrf');
  return t ? { 'x-notin-csrf': t } : {};
}
async function bootstrapTokenCore(){
  try{
    const r = await fetch(API_BASE + '/api/auth/refresh', {method:'POST', credentials:'include', headers: csrfHeaders()});
    if(r.ok){
      const j = await r.json();
      memToken = j.accessToken || j.token;
      if(memToken) return memToken;
    }
  }catch{}
  try{
    const r2 = await fetch(API_BASE + '/auth/refresh', {method:'POST', credentials:'include', headers: csrfHeaders()});
    if(r2.ok){
      const j = await r2.json();
      memToken = j.accessToken || j.token;
      if(memToken) return memToken;
    }
  }catch{}
  return null;
}
// WP-SEC-001 — single-flight refresh: parallel 401s share ONE rotation call.
// Without this, same-tab bursts replay a consumed cookie into the new
// server-side family detection and sign the user out for no reason.
let refreshFlight = null;
function bootstrapToken(){
  if(!refreshFlight){
    refreshFlight = bootstrapTokenCore().finally(()=>{ refreshFlight = null; });
  }
  return refreshFlight;
}
async function fetchWithAuth(url, opts={}){
  const headers = {...(opts.headers || {})};
  if(memToken) headers['Authorization'] = `Bearer ${memToken}`;
  // Let the browser add multipart boundaries for FormData uploads.
  if(!(opts.body instanceof FormData)) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  let res = await fetch(url, {...opts, headers, credentials:'include'});
  if(res.status===401){
    const newTok = await bootstrapToken();
    if(newTok){
      headers['Authorization'] = `Bearer ${newTok}`;
      res = await fetch(url, {...opts, headers, credentials:'include'});
      if(!res.ok && res.status===401){
        redirectToLogin();
        throw new Error('Unauthorized');
      }
    } else {
      redirectToLogin();
      throw new Error('Unauthorized');
    }
  }
  return res;
}
function redirectToLogin(){
  window.location.href = API_BASE ? `${API_BASE}/login.html` : '/login.html';
}
function setSaveStatus(text, cls){
  if(!saveStatus) return;
  saveStatus.textContent = text || '';
  saveStatus.className = 'app-save-status' + (cls ? ' ' + cls : '');
}
function hideAiSummary(){
  if(aiSummaryCard) aiSummaryCard.hidden = true;
}
function renderAiSummary(note, meta){
  const summary = typeof note?.summary === 'string' ? note.summary.trim() : '';
  if(!aiSummaryCard || !summary){
    hideAiSummary();
    return;
  }
  if(aiSummaryText) aiSummaryText.textContent = summary;
  if(aiSummaryMeta) aiSummaryMeta.textContent = meta || 'Saved summary — regenerate after edits.';
  aiSummaryCard.hidden = false;
}
// WP-AI-002 — title suggestion bar lifecycle
function hideAiTitle(){
  if(aiTitleBar) aiTitleBar.hidden = true;
  aiTitleNoteId = null;
}
async function maybeSuggestTitle(note){
  hideAiTitle();
  hideAiTags();
  hideAiChat(); // WP-AI-003
  hideAiAssist(); // WP-AI-004
  if(!note || note.isTrashed || offlineReadOnly) return;
  if(currentView !== 'notes') return;
  if(titleSuggestedFor.has(note.id)) return;
  const title = typeof note.title === 'string' ? note.title.trim() : '';
  if(title && title.toLowerCase() !== 'untitled') return;
  const text = (note.contentText || note.description || '').trim();
  if(text.length < 40) return;
  titleSuggestedFor.add(note.id); // before fetch — prevents double-fire
  try{
    const res = await fetchWithAuth(`${API_BASE}/api/notes/${note.id}/suggest-title`, { method: 'POST' });
    if(res.status !== 200) return; // silent degrade for background suggestions
    const payload = await res.json().catch(()=>({}));
    const suggested = typeof payload.title === 'string' ? payload.title.trim() : '';
    if(!suggested) return;
    if(selectedId !== note.id) return; // user moved on
    const cur = notes.find(n=>n.id===note.id);
    const curTitle = (cur && typeof cur.title === 'string') ? cur.title.trim() : '';
    if(curTitle && curTitle.toLowerCase() !== 'untitled') return;
    if(aiTitleText) aiTitleText.textContent = suggested;
    aiTitleNoteId = note.id;
    if(aiTitleBar) aiTitleBar.hidden = false;
  }catch{ /* silent: background suggestion failures never surface */ }
}

// WP-AI-002b — smart tag suggestion bar lifecycle
function hideAiTags(){
  if(aiTagBar){
    aiTagBar.hidden = true;
    aiTagBar.suggestions = new Map();
  }
  if(aiTagChips) aiTagChips.innerHTML = '';
  aiTagNoteId = null;
}
// WP-AI-004 — discard only the pending suggestion; editor content is untouched.
function hideAiAssist(){
  if(aiAssistBar) aiAssistBar.hidden = true;
  if(assistMenu) assistMenu.hidden = true;
  if(aiBubbleMenu) aiBubbleMenu.hidden = true; // WP-AI-004b — every reset kills the bubble
  if(aiAssistText) aiAssistText.textContent = '';
  assistAction = null;
  assistRange = null;
  assistSuggestion = '';
  assistNoteId = null;
}
// WP-AI-004b — selection bubble visibility. Hand-rolled positioning via
// editor.view.coordsAtPos() from the already-bundled @tiptap/core — no
// BubbleMenu extension, no floating-ui, zero new dependencies.
function syncAssistBubble(){
  if(!aiBubbleMenu || !editor) return;
  const note = notes.find(item=>item.id===selectedId);
  const selection = editor.state.selection;
  const selText = selection.empty ? '' : editor.state.doc.textBetween(selection.from, selection.to, ' ').trim();
  if(assistInFlight || currentView !== 'notes' || !note || note.isTrashed || offlineReadOnly || !selText){
    aiBubbleMenu.hidden = true;
    return;
  }
  const rect = editor.view.coordsAtPos(selection.to); // @tiptap/core — no new deps
  aiBubbleMenu.style.top = `${Math.max(8, rect.bottom + 8)}px`;
  aiBubbleMenu.style.left = `${Math.max(8, rect.left)}px`;
  aiBubbleMenu.hidden = false;
  // clamp off-viewport right edge after layout
  const w = aiBubbleMenu.offsetWidth;
  if(w && rect.left + w > window.innerWidth - 8){
    aiBubbleMenu.style.left = `${Math.max(8, window.innerWidth - w - 8)}px`;
  }
}
// WP-AI-003 — chat panel lifecycle. Hiding never persists or uploads anything;
// the transcript only survives while the same note stays selected.
function hideAiChat(){
  if(aiChatPanel) aiChatPanel.hidden = true;
}
function renderChatEmptyHint(){
  if(!aiChatLog) return;
  const hint = document.createElement('p');
  hint.className = 'app-ai-chat-hint';
  hint.textContent = 'Questions stay on this device until you switch notes.';
  aiChatLog.appendChild(hint);
}
function clearAiChat(){
  chatHistory = [];
  if(aiChatLog){
    aiChatLog.textContent = '';
    renderChatEmptyHint();
  }
  if(aiChatInput) aiChatInput.value = '';
  hideAiChat();
}
function appendChatBubble(role, text){
  if(!aiChatLog) return null;
  const hint = aiChatLog.querySelector('.app-ai-chat-hint');
  if(hint) hint.remove();
  const bubble = document.createElement('p');
  bubble.className = 'app-ai-chat-msg' + (role === 'user' ? ' is-user' : ' is-assistant');
  bubble.textContent = text; // never innerHTML — answers/questions are plain text
  aiChatLog.appendChild(bubble);
  aiChatLog.scrollTop = aiChatLog.scrollHeight;
  return bubble;
}
// Selection changed → the previous note's transcript is dropped entirely.
function syncAiChatForSelection(noteId){
  if(noteId === chatNoteId) return;
  chatNoteId = noteId;
  clearAiChat();
}

async function maybeSuggestTags(note){
  hideAiTags();
  hideAiChat(); // WP-AI-003
  hideAiAssist(); // WP-AI-004
  if(!note || note.isTrashed || offlineReadOnly) return;
  if(currentView !== 'notes' || tagsSuggestedFor.has(note.id)) return;
  const text = (note.contentText || note.description || '').trim();
  if(text.length < 100 || (note.tags || []).length >= 3) return;
  tagsSuggestedFor.add(note.id); // before fetch — prevents double-fire
  try{
    const res = await fetchWithAuth(`${API_BASE}/api/notes/${note.id}/suggest-tags`, { method:'POST' });
    if(res.status !== 200) return; // silent degrade for background suggestions
    const payload = await res.json().catch(()=>({}));
    if(selectedId !== note.id || !Array.isArray(payload.tags)) return;
    const suggestions = new Map();
    if(aiTagChips) aiTagChips.innerHTML = '';
    for(const item of payload.tags){
      const name = typeof item?.name === 'string' ? item.name.trim() : '';
      if(!name || suggestions.has(name)) continue;
      const suggestion = { name, existing: typeof item.existing === 'string' ? item.existing : null };
      suggestions.set(name, suggestion);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'app-ai-tag-chip';
      chip.dataset.tagName = name;
      chip.dataset.existing = suggestion.existing || '';
      chip.textContent = name;
      aiTagChips?.appendChild(chip);
    }
    if(!suggestions.size || selectedId !== note.id) return;
    if(aiTagBar){
      aiTagBar.suggestions = suggestions;
      aiTagBar.hidden = false;
    }
    aiTagNoteId = note.id;
  }catch{ /* silent: background suggestion failures never surface */ }
}

if(aiTagChips) aiTagChips.addEventListener('click', async (event)=>{
  const chip = event.target.closest('.app-ai-tag-chip');
  if(!chip || !aiTagChips.contains(chip) || !aiTagNoteId) return;
  const suggestion = aiTagBar?.suggestions instanceof Map
    ? aiTagBar.suggestions.get(chip.dataset.tagName)
    : null;
  const noteId = aiTagNoteId;
  const note = notes.find(item=>item.id===noteId);
  if(!suggestion || !note || selectedId !== noteId || note.isTrashed || offlineReadOnly) return;

  const label = suggestion.name;
  chip.disabled = true;
  chip.textContent = 'Adding…';
  setError('');
  try{
    let tagId = suggestion.existing;
    if(!tagId){
      const createRes = await fetchWithAuth(`${API_BASE}/api/tags`, {
        method:'POST',
        body:JSON.stringify({ name:label }),
      });
      if(createRes.status === 201){
        const created = await createRes.json();
        tagId = created.id;
      }else if(createRes.status === 409){
        const tagsRes = await fetchWithAuth(`${API_BASE}/api/tags`, { method:'GET' });
        const latestTags = await tagsRes.json().catch(()=>[]);
        if(!tagsRes.ok) throw new Error(tagsRes.status === 429 ? 'AI rate limit reached — try again in a few minutes.' : 'Could not refresh tags');
        tagId = latestTags.find(tag=>String(tag.name).toLowerCase()===label.toLowerCase())?.id || null;
        if(!tagId) throw new Error('Could not find that tag');
      }else{
        const payload = await createRes.json().catch(()=>({}));
        throw new Error(createRes.status === 429 ? 'AI rate limit reached — try again in a few minutes.' : (payload.message || 'Could not create tag'));
      }
    }

    const currentIds = (note.tags || []).map(tag=>tag.id);
    const newIds = [...new Set([...currentIds, tagId])];
    const applyRes = await fetchWithAuth(`${API_BASE}/api/notes/${noteId}`, {
      method:'PUT',
      body:JSON.stringify({ tagIds:newIds }),
    });
    const updated = await applyRes.json().catch(()=>({}));
    if(!applyRes.ok){
      throw new Error(applyRes.status === 429 ? 'AI rate limit reached — try again in a few minutes.' : (updated.message || 'Could not add tag'));
    }
    const index = notes.findIndex(item=>item.id===noteId);
    if(index >= 0) notes[index] = updated;
    // The user may switch notes while the writes are in flight. Preserve the
    // accepted update in memory, but never repaint or hide the new note's UI.
    if(selectedId === noteId && aiTagNoteId === noteId){
      renderTagChips(updated);
      chip.remove();
      aiTagBar?.suggestions?.delete(label);
      if(!aiTagChips.querySelector('.app-ai-tag-chip')){
        hideAiTags();
        hideAiAssist(); // WP-AI-004
      }
      markSaved();
    }
    await loadTags();
  }catch(error){
    setError(error.message || 'Could not add suggested tag');
    if(chip.isConnected){ chip.disabled = false; chip.textContent = label; }
  }
});
if(aiTagDismiss) aiTagDismiss.addEventListener('click', ()=>{ hideAiTags(); hideAiAssist(); });

// ── WP-UI-HOME-001 — authenticated view router + Home dashboard ──
const APP_ROUTES = new Set(['home','notes','shortcuts','notebooks','tags','trash','tasks','templates','account','graph','ask']);
function routeFromHash(){
  const value = location.hash.replace(/^#\/?/, '').split('/')[0].toLowerCase();
  return APP_ROUTES.has(value) ? value : 'home';
}
function setRouteHash(view, replace=false){
  const hash = `#/${view}`;
  if(location.hash===hash) return false;
  if(replace) history.replaceState({}, '', `${location.pathname}${location.search}${hash}`);
  else location.hash = `/${view}`;
  return true;
}
function closeMobileSidebar(){
  document.body.classList.remove('sidebar-open');
  if(sidebarScrim) sidebarScrim.hidden = true;
}
function setViewChrome(view){
  hideAiSummary();
  hideAiTitle(); // WP-AI-002
  hideAiTags(); // WP-AI-002b
  hideAiChat(); // WP-AI-003
  hideAiAssist(); // WP-AI-004
  const previousView = currentView;
  currentView = APP_ROUTES.has(view) ? view : 'home';
  if(previousView !== currentView) listAnimateNext = true; // WP-UI-NOTES-3D-001
  const showHome = currentView==='home' || currentView==='account';
  const showShortcuts = currentView==='shortcuts';
  const showOrganize = currentView==='notebooks' || currentView==='tags';
  const showTasks = currentView==='tasks';
  const showTemplates = currentView==='templates';
  const showGraph = currentView==='graph';
  const showAsk = currentView==='ask';
  if(homeView) homeView.hidden = !showHome;
  if(shortcutsView) shortcutsView.hidden = !showShortcuts;
  if(organizeView) organizeView.hidden = !showOrganize;
  if(tasksView) tasksView.hidden = !showTasks;
  if(templatesView) templatesView.hidden = !showTemplates;
  const graphView = document.getElementById('graphView');
  const askView = document.getElementById('askView');
  if(graphView) graphView.hidden = !showGraph;
  if(askView) askView.hidden = !showAsk;
  if(editorWorkspace) editorWorkspace.hidden = showHome || showShortcuts || showOrganize || showTasks || showTemplates || showGraph || showAsk;
  if(showGraph) renderGraph();
  if(layout){
    layout.classList.toggle('is-home', showHome);
    layout.classList.toggle('is-shortcuts', showShortcuts);
    layout.classList.toggle('is-organize', showOrganize);
    layout.classList.toggle('is-tasks', showTasks);
    layout.classList.toggle('is-templates', showTemplates);
    if(showHome || showShortcuts || showOrganize || showTasks || showTemplates || showGraph || showAsk){ layout.classList.remove('is-list','is-editor'); }
    else if(!layout.classList.contains('is-editor')) layout.classList.add('is-list');
  }
  [navHome,navAll,navShortcuts,navNotebooks,navTags,navTrash,navTasks,navTemplates,document.getElementById('navGraph'),document.getElementById('navAsk')].forEach(el=>{
    if(!el) return;
    const active = (el===navHome && currentView==='home')
      || (el===navAll && currentView==='notes')
      || (el===navShortcuts && currentView==='shortcuts')
      || (el===navNotebooks && currentView==='notebooks')
      || (el===navTags && currentView==='tags')
      || (el===navTrash && currentView==='trash')
      || (el===navTasks && currentView==='tasks')
      || (el===navTemplates && currentView==='templates')
      || (el.id==='navGraph' && currentView==='graph')
      || (el.id==='navAsk' && currentView==='ask');
    el.classList.toggle('is-active', active);
    el.setAttribute('aria-current', active ? 'page' : 'false');
  });
  if(notebookSection) notebookSection.hidden = currentView!=='notebooks';
  if(tagSection) tagSection.hidden = currentView!=='tags';
  closeMobileSidebar();
}
function renderHome(){
  if(!homeNoteGrid) return;
  homeNoteGrid.innerHTML = '';
  const create = document.createElement('button');
  create.type = 'button';
  create.className = 'home-note-card home-create-card tilt-3d';
  create.id = 'homeCreateNote';
  create.disabled = offlineReadOnly;
  create.innerHTML = '<span class="home-create-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></span><strong>Create new note</strong>';
  create.addEventListener('click', createNote);
  homeNoteGrid.appendChild(create);
  const recent = notes.filter(note=>!note.isTrashed).slice(0,7);
  if(!recent.length){
    const empty = document.createElement('div');
    empty.className = 'home-empty-copy';
    empty.innerHTML = '<strong>Your Home is ready for its first idea.</strong><span>Create a note and it will appear here automatically.</span><button type="button" class="home-empty-cta">Create a note</button><div class="home-template-row"></div>';
    empty.querySelector('button').addEventListener('click', createNote);
    const row = empty.querySelector('.home-template-row');
    NOTE_TEMPLATES.slice(0,4).forEach(tpl=>{
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'home-template-chip';
      chip.disabled = offlineReadOnly;
      chip.textContent = tpl.name;
      chip.addEventListener('click', ()=> createNoteFromTemplate(tpl.id));
      row.appendChild(chip);
    });
    homeNoteGrid.appendChild(empty);
    return;
  }
  recent.forEach(note=>{
    const notebook = note.notebookId ? notebooks.find(item=>item.id===note.notebookId) : null;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'home-note-card tilt-3d';
    card.dataset.noteId = note.id;
    card.innerHTML = `<span class="home-card-book">${escapeHtml(notebook?.name || 'Unfiled note')}</span><h3>${escapeHtml(note.title || 'Untitled')}</h3><span class="home-card-date">Edited ${formatDate(note.updatedAt || note.createdAt)}</span>${note.isPinned?'<span class="home-card-pin" title="Pinned">●</span>':''}`;
    card.addEventListener('click', ()=> openNoteFromHome(note.id));
    homeNoteGrid.appendChild(card);
  });
}
function renderShortcuts(){
  if(!shortcutsGrid) return;
  const pinned = notes.filter(note=>note.isPinned && !note.isTrashed);
  shortcutsGrid.innerHTML='';
  if(shortcutsCount) shortcutsCount.textContent=`${pinned.length} ${pinned.length===1?'shortcut':'shortcuts'}`;
  if(!pinned.length){
    const empty=document.createElement('div');
    empty.className='shortcuts-empty';
    empty.innerHTML='<span class="shortcuts-empty-icon" aria-hidden="true">☆</span><strong>Pin notes to see them here</strong><p>Pinned notes become shortcuts for quick access.</p><div class="shortcuts-empty-actions"><button type="button" data-action="notes">Go to Notes</button><button type="button" data-action="home">Back Home</button></div>';
    empty.querySelector('[data-action="notes"]').addEventListener('click',()=>goToView('notes'));
    empty.querySelector('[data-action="home"]').addEventListener('click',()=>goToView('home'));
    shortcutsGrid.appendChild(empty);
    return;
  }
  pinned.forEach(note=>{
    const notebook=note.notebookId ? notebooks.find(item=>item.id===note.notebookId) : null;
    const card=document.createElement('button');
    card.type='button';
    card.className='shortcut-card tilt-3d';
    card.dataset.noteId=note.id;
    card.innerHTML=`<span class="shortcut-card-book">${escapeHtml(notebook?.name || 'Unfiled note')}</span><h3>${escapeHtml(note.title || 'Untitled')}</h3><p>${escapeHtml(snippetFromText(plainFromNote(note))) || 'No additional text'}</p><span class="shortcut-card-date">Edited ${formatDate(note.updatedAt || note.createdAt)}</span><span class="shortcut-pin" title="Pinned">●</span>`;
    card.addEventListener('click',()=>openNoteFromHome(note.id));
    shortcutsGrid.appendChild(card);
  });
}
function renderOrganizeView(){
  if(!organizeGrid || !organizeView) return;
  const isTags = currentView==='tags';
  const items = isTags ? tags : notebooks;
  const singular = isTags ? 'tag' : 'notebook';
  const plural = isTags ? 'tags' : 'notebooks';
  if(organizeTitle) organizeTitle.textContent = isTags ? 'Tags' : 'Notebooks';
  if(organizeDescription) organizeDescription.textContent = isTags
    ? 'Label notes so related ideas are always easy to find.'
    : 'Group related notes into focused collections.';
  if(organizeCreateBtn) organizeCreateBtn.textContent = `+ New ${singular}`;
  if(organizeInputLabel) organizeInputLabel.textContent = `${singular[0].toUpperCase()+singular.slice(1)} name`;
  if(organizeCreateInput){
    organizeCreateInput.placeholder = `Name your ${singular}`;
    organizeCreateInput.maxLength = isTags ? 50 : 100;
  }
  if(organizeListTitle) organizeListTitle.textContent = `Your ${plural}`;
  if(organizeCount) organizeCount.textContent = `${items.length} ${items.length===1?singular:plural}`;
  organizeGrid.innerHTML = '';
  if(!items.length){
    const empty = document.createElement('div');
    empty.className = 'organize-empty';
    empty.innerHTML = `<strong>No ${plural} yet</strong><span>Create one to start organizing your notes.</span>`;
    organizeGrid.appendChild(empty);
    return;
  }
  items.forEach(item=>{
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'organize-card tilt-3d';
    card.dataset.id = item.id;
    card.innerHTML = `<span class="organize-card-icon" aria-hidden="true">${isTags?'#':'▥'}</span><span class="organize-card-copy"><strong>${escapeHtml(item.name)}</strong><span>${Number(item.noteCount)||0} ${(Number(item.noteCount)||0)===1?'note':'notes'}</span></span><span class="organize-card-arrow" aria-hidden="true">→</span>`;
    card.addEventListener('click', ()=> openOrganizeFilter(isTags ? 'tag' : 'notebook', item.id));
    organizeGrid.appendChild(card);
  });
}
function extractTasksFromNote(note){
  const tasks = [];
  let json = null;
  try{
    json = typeof note.contentJson === 'string' ? JSON.parse(note.contentJson) : note.contentJson;
  }catch{ json = null; }
  if(!json) return tasks;
  function walk(node){
    if(!node) return;
    if(node.type==='taskItem'){
      tasks.push({
        text: extractPlain(node) || 'Untitled task',
        checked: !!(node.attrs && node.attrs.checked),
        noteId: note.id,
        noteTitle: note.title || 'Untitled',
        index: tasks.length,
      });
    }
    if(Array.isArray(node.content)) node.content.forEach(walk);
  }
  walk(json);
  return tasks;
}
function allActiveTasks(){
  const source = notes.length ? notes : (Array.isArray(offlineSnapshot?.notes) ? offlineSnapshot.notes : []);
  return source.filter(note=>!note.isTrashed).flatMap(extractTasksFromNote);
}
function renderTasks(){
  if(!tasksList) return;
  const items = allActiveTasks();
  const openCount = items.filter(item=>!item.checked).length;
  if(tasksCount) tasksCount.textContent = `${items.length} ${items.length===1?'task':'tasks'}`;
  if(countTasksEl) countTasksEl.textContent = String(openCount);
  tasksList.innerHTML = '';
  if(!items.length){
    const empty = document.createElement('div');
    empty.className = 'tasks-empty';
    empty.innerHTML = '<strong>No checklists yet</strong><span>Add a to-do list template, or use the ☑ toolbar button in a note.</span>';
    tasksList.appendChild(empty);
    return;
  }
  items.forEach(item=>{
    const row = document.createElement('div');
    row.className = 'task-row' + (item.checked ? ' is-done' : '');
    const check = document.createElement('button');
    check.type = 'button';
    check.className = 'task-check-btn';
    check.disabled = offlineReadOnly;
    check.setAttribute('aria-pressed', item.checked ? 'true' : 'false');
    check.setAttribute('aria-label', item.checked ? 'Mark incomplete' : 'Mark complete');
    check.textContent = item.checked ? '✓' : '';
    check.addEventListener('click', ()=> toggleTaskChecked(item));
    const copy = document.createElement('div');
    copy.className = 'task-row-copy';
    const text = document.createElement('span');
    text.className = 'task-row-text';
    text.textContent = item.text;
    const noteBtn = document.createElement('button');
    noteBtn.type = 'button';
    noteBtn.className = 'task-row-note';
    noteBtn.textContent = item.noteTitle;
    noteBtn.addEventListener('click', ()=> openNoteFromHome(item.noteId));
    copy.append(text, noteBtn);
    row.append(check, copy);
    tasksList.appendChild(row);
  });
}
function cloneJson(value){
  return JSON.parse(JSON.stringify(value));
}
async function toggleTaskChecked(item){
  if(offlineReadOnly) return;
  const note = notes.find(n=>n.id===item.noteId);
  if(!note || note.isTrashed) return;
  let json;
  try{
    json = cloneJson(typeof note.contentJson === 'string' ? JSON.parse(note.contentJson) : (note.contentJson || docFromNote(note)));
  }catch{ return; }
  const found = [];
  function walk(node){
    if(!node) return;
    if(node.type==='taskItem') found.push(node);
    if(Array.isArray(node.content)) node.content.forEach(walk);
  }
  walk(json);
  const target = found[item.index];
  if(!target) return;
  target.attrs = {...(target.attrs||{}), checked: !item.checked};
  setError('');
  try{
    const res = await fetchWithAuth(API_BASE + `/api/notes/${note.id}`, {
      method:'PUT',
      body: JSON.stringify({ contentJson: json, contentText: extractPlain(json), description: extractPlain(json) }),
    });
    const updated = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(updated.message || 'Could not update task');
    const idx = notes.findIndex(n=>n.id===note.id);
    if(idx>=0) notes[idx] = updated;
    renderTasks();
    if(selectedId===note.id && editor){
      editor.commands.setContent(docFromNote(updated), false);
    }
  }catch(error){ setError(error.message || 'Could not update task'); }
}
function renderTemplates(){
  if(!templatesGrid) return;
  templatesGrid.innerHTML = '';
  NOTE_TEMPLATES.forEach(tpl=>{
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'template-card tilt-3d';
    card.disabled = offlineReadOnly;
    card.innerHTML = `<span class="template-card-icon" aria-hidden="true">${tpl.icon}</span><strong>${escapeHtml(tpl.name)}</strong><span>${escapeHtml(tpl.blurb)}</span>`;
    card.addEventListener('click', ()=> createNoteFromTemplate(tpl.id));
    templatesGrid.appendChild(card);
  });
}
async function createNoteFromTemplate(templateId){
  const tpl = NOTE_TEMPLATES.find(item=>item.id===templateId);
  if(!tpl) return createNote();
  if(offlineReadOnly){ setSaveStatus('Offline · read only','is-error'); return; }
  setViewChrome('notes');
  setRouteHash('notes', true);
  if(currentQuery) clearSearchNow(false);
  if(currentFilter==='trash'){
    currentFilter = 'active';
    updateNav();
    selectedId = null;
    await loadNotes();
  }
  setError('');
  try{
    const res = await fetchWithAuth(API_BASE + '/api/notes', {
      method:'POST',
      body: JSON.stringify({
        title: tpl.title,
        description: templatePlain(tpl.doc),
        contentJson: tpl.doc,
        contentText: templatePlain(tpl.doc),
        ...(currentNotebookId ? { notebookId: currentNotebookId } : {}),
      }),
    });
    const created = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(created.message || 'Could not create note');
    notes.unshift(created);
    selectedId = created.id;
    renderList();
    selectNote(created.id);
    markSaved();
    updateCounts();
    renderTasks();
  }catch(error){ setError(error.message || 'Could not create note from template'); }
}
function jsonToMarkdown(node){
  if(!node) return '';
  if(node.type==='text'){
    let t = node.text || '';
    (node.marks||[]).forEach(mark=>{
      if(mark.type==='bold') t = `**${t}**`;
      else if(mark.type==='italic') t = `*${t}*`;
      else if(mark.type==='code') t = `\`${t}\``;
      else if(mark.type==='underline') t = `<u>${t}</u>`;
    });
    return t;
  }
  const kids = Array.isArray(node.content) ? node.content : [];
  const inner = kids.map(jsonToMarkdown).join('');
  switch(node.type){
    case 'doc': return kids.map(jsonToMarkdown).join('\n\n').trim() + '\n';
    case 'paragraph': return inner;
    case 'heading': return `${'#'.repeat(node.attrs?.level || 1)} ${inner}`;
    case 'blockquote': return inner.split('\n').map(line=>`> ${line}`).join('\n');
    case 'codeBlock': return '```\n' + inner + '\n```';
    case 'horizontalRule': return '---';
    case 'bulletList': return kids.map(child=>`- ${jsonToMarkdown(child).trim()}`).join('\n');
    case 'orderedList': return kids.map((child,i)=>`${i+1}. ${jsonToMarkdown(child).trim()}`).join('\n');
    case 'taskList': return kids.map(jsonToMarkdown).join('\n');
    case 'taskItem': return `- [${node.attrs?.checked ? 'x' : ' '}] ${inner.trim()}`;
    case 'listItem': return inner.trim();
    default: return inner;
  }
}
function hideNoteMoreMenu(){ if(noteMoreMenu) noteMoreMenu.hidden = true; }
async function duplicateSelectedNote(){
  const cur = notes.find(n=>n.id===selectedId);
  if(offlineReadOnly || !cur || cur.isTrashed) return;
  hideNoteMoreMenu();
  setError('');
  try{
    const res = await fetchWithAuth(API_BASE + '/api/notes', {
      method:'POST',
      body: JSON.stringify({
        title: `${cur.title || 'Untitled'} (copy)`,
        description: cur.description || plainFromNote(cur),
        contentJson: docFromNote(cur),
        contentText: plainFromNote(cur),
        ...(cur.notebookId ? { notebookId: cur.notebookId } : {}),
      }),
    });
    const created = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(created.message || 'Could not duplicate note');
    notes.unshift(created);
    renderList();
    selectNote(created.id);
    setSaveStatus('Duplicated', 'is-saved');
    updateCounts();
  }catch(error){ setError(error.message || 'Could not duplicate note'); }
}
// WP-UX-005 — shared download helper (Markdown / Text / HTML exports)
function downloadBlob(filename, blob){
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 1000);
}
function exportFileBaseName(cur){
  return (cur.title || 'Untitled').replace(/[^\w\s-]+/g,'').trim().replace(/\s+/g,'-').slice(0,60) || 'note';
}
function exportSelectedMarkdown(){
  const cur = notes.find(n=>n.id===selectedId);
  if(!cur) return;
  hideNoteMoreMenu();
  const title = cur.title || 'Untitled';
  const md = `# ${title}\n\n${jsonToMarkdown(docFromNote(cur))}`;
  downloadBlob(`${exportFileBaseName(cur)}.md`, new Blob([md], {type:'text/markdown;charset=utf-8'}));
  showToast('Markdown downloaded.');
}
function exportSelectedText(){
  const cur = notes.find(n=>n.id===selectedId);
  if(!cur) return;
  hideNoteMoreMenu();
  const title = cur.title || 'Untitled';
  const txt = `${title}\n\n${plainFromNote(cur)}`;
  downloadBlob(`${exportFileBaseName(cur)}.txt`, new Blob([txt], {type:'text/plain;charset=utf-8'}));
  showToast('Text file downloaded.');
}
function exportSelectedHtml(){
  const cur = notes.find(n=>n.id===selectedId);
  if(!cur || !editor) return;
  hideNoteMoreMenu();
  const title = cur.title || 'Untitled';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:16px/1.6 Inter,system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 24px;color:#111}h1{font-size:28px}img{max-width:100%}</style></head><body><h1>${escapeHtml(title)}</h1>${editor.getHTML()}</body></html>`;
  downloadBlob(`${exportFileBaseName(cur)}.html`, new Blob([html], {type:'text/html;charset=utf-8'}));
  showToast('HTML downloaded.');
}
function printSelectedNote(){
  const cur = notes.find(n=>n.id===selectedId);
  if(!cur || !editor) return;
  hideNoteMoreMenu();
  const title = cur.title || 'Untitled';
  const html = editor.getHTML();
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden','true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>body{font:16px/1.6 Inter,system-ui,sans-serif;padding:32px;color:#111}h1{font-size:28px}</style></head><body><h1>${escapeHtml(title)}</h1>${html}</body></html>`);
  doc.close();
  frame.contentWindow.focus();
  frame.contentWindow.print();
  setTimeout(()=> frame.remove(), 1000);
}
function openShortcutsHelp(){ if(shortcutsHelpModal) shortcutsHelpModal.hidden = false; }
function closeShortcutsHelp(){ if(shortcutsHelpModal) shortcutsHelpModal.hidden = true; }

// ── WP-UX-003 — distraction-free focus mode ──────────────────────────────────
// Hides the sidebar and note list so the editor fills the screen. Ctrl+Shift+F
// toggles, Esc exits. State is intentionally NOT persisted: focus mode is a
// per-session posture, and a hidden sidebar on a cold load reads as a bug.
const focusModeBtn = document.getElementById('focusModeBtn');
const focusExitBtn = document.getElementById('focusExit');
function isFocusMode(){ return document.body.classList.contains('focus-mode'); }
function setFocusMode(on){
  if(on && (offlineReadOnly || currentView!=='notes')){
    showToast('Open a note to use focus mode');
    return;
  }
  document.body.classList.toggle('focus-mode', on);
  if(focusModeBtn) focusModeBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  if(focusExitBtn) focusExitBtn.hidden = !on;
  if(on && editor) editor.commands.focus();
}
function toggleFocusMode(){ setFocusMode(!isFocusMode()); }
function exitFocusMode(){ if(isFocusMode()) setFocusMode(false); }
if(focusModeBtn) focusModeBtn.addEventListener('click', toggleFocusMode);
if(focusExitBtn) focusExitBtn.addEventListener('click', exitFocusMode);

async function openOrganizeFilter(type,id){
  listAnimateNext = true; // WP-UI-NOTES-3D-001 — notebook/tag card filter
  currentFilter='active';
  if(type==='tag') currentTagId=id;
  else currentNotebookId=id;
  setViewChrome('notes');
  setRouteHash('notes', true);
  updateNav();
  selectedId=null;
  await loadNotes();
}
function showOrganizeCreate(){
  if(!organizeCreateForm) return;
  organizeCreateForm.hidden=false;
  if(organizeCreateError) organizeCreateError.textContent='';
  if(organizeCreateInput){ organizeCreateInput.value=''; organizeCreateInput.focus(); }
}
function hideOrganizeCreate(){
  if(organizeCreateForm) organizeCreateForm.hidden=true;
  if(organizeCreateError) organizeCreateError.textContent='';
}
async function submitOrganizeCreate(event){
  event?.preventDefault();
  if(offlineReadOnly) return;
  const isTags = currentView==='tags';
  const name=(organizeCreateInput?.value||'').trim();
  if(!name){ if(organizeCreateError) organizeCreateError.textContent=`Name your ${isTags?'tag':'notebook'}.`; return; }
  const submit=organizeCreateForm?.querySelector('button[type="submit"]');
  if(submit) submit.disabled=true;
  try{
    const res=await fetchWithAuth(API_BASE + (isTags?'/api/tags':'/api/notebooks'), {method:'POST',body:JSON.stringify({name})});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.message || 'Could not create item');
    hideOrganizeCreate();
    if(isTags) await loadTags(); else await loadNotebooks();
    renderOrganizeView();
  }catch(error){ if(organizeCreateError) organizeCreateError.textContent=error.message || 'Could not create item'; }
  finally{ if(submit) submit.disabled=false; }
}
async function applyRoute(view=routeFromHash(), {focusSearch=false}={}){
  view = APP_ROUTES.has(view) ? view : 'home';
  setViewChrome(view);
  if(view==='account'){
    openAccountModal();
    return;
  }
  if(accountModal && !accountModal.hidden) closeAccountModal();
  if(view==='home' || view==='notes' || view==='shortcuts' || view==='tasks' || view==='templates'){
    currentFilter='active'; currentNotebookId=null; currentTagId=null;
    if(view==='home' || view==='shortcuts' || view==='tasks' || view==='templates') clearSearchNow(false);
  }else if(view==='trash'){
    currentFilter='trash'; currentNotebookId=null; currentTagId=null; clearSearchNow(false);
  }else{
    currentFilter='active'; clearSearchNow(false);
    if(view==='notebooks'){ currentNotebookId=null; currentTagId=null; }
    if(view==='tags'){ currentTagId=null; currentNotebookId=null; }
  }
  updateNav();
  await loadNotes();
  if(view==='home') renderHome();
  if(view==='shortcuts') renderShortcuts();
  if(view==='notebooks' || view==='tags') renderOrganizeView();
  if(view==='tasks') renderTasks();
  if(view==='templates') renderTemplates();
  if(focusSearch) setTimeout(()=>searchInput?.focus(), 0);
}
function goToView(view, options={}){
  listAnimateNext = true; // WP-UI-NOTES-3D-001 — route changes repaint the list context
  if(!setRouteHash(view)) applyRoute(view, options);
  else if(options.focusSearch) setTimeout(()=>searchInput?.focus(), 80);
}
function openNoteFromHome(id){
  setViewChrome('notes');
  setRouteHash('notes', true);
  selectNote(id);
}
let soonToastAction = null; // WP-UX-001 — optional undo/redo action on the toast
// WP-UX-006 — "Saved · Xm ago" — the save status stays honest about recency.
let lastSavedAt = 0;
function formatSavedAgo(ts){
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if(s < 15) return 'just now';
  if(s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if(m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}
function markSaved(){
  lastSavedAt = Date.now();
  setSaveStatus('Saved · just now', 'is-saved');
}
setInterval(()=>{
  if(!lastSavedAt || !saveStatus) return;
  if(saveStatus.textContent.startsWith('Saved ·')) saveStatus.textContent = `Saved · ${formatSavedAgo(lastSavedAt)}`;
}, 15000);
function showToast(message, opts){
  if(!soonToast) return;
  soonToast.textContent = message;
  // Remove any previous action button
  const prevBtn = soonToast.querySelector('.app-toast-action');
  if(prevBtn) prevBtn.remove();
  soonToastAction = null;
  if(opts && opts.action && typeof opts.onAction === 'function'){
    soonToastAction = opts.onAction;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'app-toast-action';
    btn.textContent = opts.action;
    btn.addEventListener('click', ()=>{
      clearTimeout(soonToastTimer);
      soonToast.hidden = true;
      const fn = soonToastAction;
      soonToastAction = null;
      if(fn) fn();
    });
    soonToast.appendChild(btn);
  }
  soonToast.hidden = false;
  clearTimeout(soonToastTimer);
  soonToastTimer = setTimeout(()=>{
    soonToast.hidden = true;
    soonToastAction = null;
    const btn = soonToast.querySelector('.app-toast-action');
    if(btn) btn.remove();
  }, (opts && opts.duration) || 2200);
}
function initScratchPad(){
  if(!scratchPad || !currentUserId) return;
  const key = `notin_scratch_${currentUserId}`;
  try{ scratchPad.value = localStorage.getItem(key) || ''; }catch{}
  scratchPad.disabled = offlineReadOnly;
  scratchPad.addEventListener('input', ()=>{
    try{ localStorage.setItem(key, scratchPad.value); }catch{}
    if(scratchStatus){ scratchStatus.textContent='Saved locally'; setTimeout(()=>{ scratchStatus.textContent='Local only'; },900); }
  });
}
function updateNav(){
  // Route is the primary navigation state; notebook/tag filters remain secondary.
  if(navHome) navHome.classList.toggle('is-active', currentView==='home');
  if(navAll) navAll.classList.toggle('is-active', currentView==='notes');
  if(navShortcuts) navShortcuts.classList.toggle('is-active', currentView==='shortcuts');
  if(navNotebooks) navNotebooks.classList.toggle('is-active', currentView==='notebooks');
  if(navTags) navTags.classList.toggle('is-active', currentView==='tags');
  if(navTrash) navTrash.classList.toggle('is-active', currentView==='trash');
  if(navTasks) navTasks.classList.toggle('is-active', currentView==='tasks');
  if(navTemplates) navTemplates.classList.toggle('is-active', currentView==='templates');
  if(navHome) navHome.setAttribute('aria-current', currentView==='home'?'page':'false');
  if(navAll) navAll.setAttribute('aria-current', currentView==='notes'?'page':'false');
  if(navShortcuts) navShortcuts.setAttribute('aria-current', currentView==='shortcuts'?'page':'false');
  if(navNotebooks) navNotebooks.setAttribute('aria-current', currentView==='notebooks'?'page':'false');
  if(navTags) navTags.setAttribute('aria-current', currentView==='tags'?'page':'false');
  if(navTrash) navTrash.setAttribute('aria-current', currentView==='trash'?'page':'false');
  if(navTasks) navTasks.setAttribute('aria-current', currentView==='tasks'?'page':'false');
  if(navTemplates) navTemplates.setAttribute('aria-current', currentView==='templates'?'page':'false');
  // WP-APP-005/006 — list title reflects the selected notebook/tag (Trash keeps its title)
  const nb = currentNotebookId ? notebooks.find(x=>x.id===currentNotebookId) : null;
  const tg = currentTagId ? tags.find(x=>x.id===currentTagId) : null;
  if(listTitleEl) listTitleEl.textContent = currentFilter==='trash' ? 'Trash' : (tg ? `#${tg.name}` : (nb ? nb.name : 'All Notes'));
  if(newWrap) newWrap.hidden = currentFilter==='trash';
  renderNotebooks(); // keep sidebar active states in sync
  renderTags();      // WP-APP-006
}
async function updateCounts(){
  if(offlineReadOnly){
    const all = Array.isArray(offlineSnapshot?.notes) ? offlineSnapshot.notes : [];
    if(countAllEl) countAllEl.textContent = String(all.filter(note=>!note.isTrashed).length);
    if(countTrashEl) countTrashEl.textContent = String(all.filter(note=>!!note.isTrashed).length);
    return;
  }
  try{
    const [activeRes, trashRes] = await Promise.all([
      fetchWithAuth(API_BASE + `/api/notes?filter=active&page=1&limit=${NOTES_PAGE_SIZE}&includeMeta=true`, {method:'GET'}),
      fetchWithAuth(API_BASE + `/api/notes?filter=trash&page=1&limit=${NOTES_PAGE_SIZE}&includeMeta=true`, {method:'GET'})
    ]);
    const a = activeRes.ok ? await activeRes.json() : {items:[],meta:{total:0}};
    const t = trashRes.ok ? await trashRes.json() : {items:[],meta:{total:0}};
    const aCount = Number(a?.meta?.total || 0);
    const tCount = Number(t?.meta?.total || 0);
    if(activeRes.ok && trashRes.ok) {
      await updateOfflineSnapshot({notes:[...(a.items || []), ...(t.items || [])]});
    }
    if(countAllEl) countAllEl.textContent = String(aCount);
    if(countTrashEl) countTrashEl.textContent = String(tCount);
    if(countTasksEl) countTasksEl.textContent = String(allActiveTasks().filter(item=>!item.checked).length);
    if(countEl) countEl.textContent = `${currentFilter==='trash'? tCount: aCount} ${ (currentFilter==='trash'? tCount: aCount)===1?'note':'notes'}`;
  } catch{
    // fallback: use current notes length
    if(countEl) countEl.textContent = `${notes.length} ${notes.length===1?'note':'notes'}`;
  }
}

function initEditor(){
  const el = document.getElementById('tiptapEditor');
  if(!el) return;
  editor = new Editor({
    element: el,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1,2] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
      // WP-MEDIA-003 — bookmarks/links (open safely in a new tab)
      Link.configure({ openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] }),
    ],
    content: createEmptyDoc(),
    // WP-UX-002 — paste or drop images straight into the editor: they upload
    // as attachments on the open note instead of being swallowed silently.
    editorProps: {
      handlePaste: (_view, event) => {
        const files = [...((event.clipboardData && event.clipboardData.files) || [])]
          .filter((f) => f && f.type && f.type.startsWith('image/'));
        if(!files.length) return false;
        event.preventDefault();
        uploadNoteImages(files);
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if(moved) return false; // internal drag — let TipTap handle it
        const files = [...((event.dataTransfer && event.dataTransfer.files) || [])]
          .filter((f) => f && f.type && f.type.startsWith('image/'));
        if(!files.length) return false;
        event.preventDefault();
        uploadNoteImages(files);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      if(!selectedId) return;
      const cur = notes.find(n=>n.id===selectedId);
      if(cur && cur.isTrashed) return; // no autosave for trashed
      onEditorUpdate();
    },
    onCreate: () => { updateToolbar(); },
    onSelectionUpdate: () => { updateToolbar(); syncAssistBubble(); }, // WP-AI-004b — bubble follows selection
    onBlur: () => {
      if(aiBubbleMenu) aiBubbleMenu.hidden = true; // WP-AI-004b
      hideWikiPicker(); // WP-LINKS-002
    },
  });
  // WP-UX-FIX - deleting all content (Ctrl+A + Backspace) makes Chrome drop
  // focus to <body> silently (no blur/focusout fires). After a delete key,
  // if focus fell to body with an empty doc, recapture the caret.
  document.addEventListener('keyup', (event)=>{
    if(event.key !== 'Backspace' && event.key !== 'Delete') return;
    if(!editor || editor.isDestroyed) return;
    setTimeout(()=>{
      try{
        if(document.activeElement !== document.body) return;
        if(!editor.isFocused && editor.state.doc.textContent === '' && editor.state.doc.childCount <= 1){
          editor.commands.focus('start');
        }
      }catch{ /* editor tearing down */ }
    }, 0);
  });

  const toolbar = document.getElementById('toolbar');
  if(toolbar){
    toolbar.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-cmd]');
      if(!btn || !editor) return;
      const cmd = btn.dataset.cmd;
      switch(cmd){
        case 'bold': editor.chain().focus().toggleBold().run(); break;
        case 'italic': editor.chain().focus().toggleItalic().run(); break;
        case 'underline': editor.chain().focus().toggleUnderline().run(); break;
        case 'h1': editor.chain().focus().toggleHeading({level:1}).run(); break;
        case 'h2': editor.chain().focus().toggleHeading({level:2}).run(); break;
        case 'bulletList': editor.chain().focus().toggleBulletList().run(); break;
        case 'orderedList': editor.chain().focus().toggleOrderedList().run(); break;
        case 'taskList': editor.chain().focus().toggleTaskList().run(); break;
        case 'blockquote': editor.chain().focus().toggleBlockquote().run(); break;
        case 'code': editor.chain().focus().toggleCode().run(); break;
        case 'codeBlock': editor.chain().focus().toggleCodeBlock().run(); break;
        case 'link': {
          // WP-MEDIA-003 — bookmark a URL (selection becomes the label)
          const prev = editor.getAttributes('link').href || '';
          const url = window.prompt('Link or bookmark URL (https://…)', prev || 'https://');
          if(url === null) break;
          if(url === '' || url === 'https://'){ editor.chain().focus().extendMarkRange('link').unsetLink().run(); }
          else {
            const safe = /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`;
            editor.chain().focus().extendMarkRange('link').setLink({ href: safe, target: '_blank', rel: 'noopener noreferrer' }).run();
          }
          break;
        }
        case 'hr': editor.chain().focus().setHorizontalRule().run(); break;
        case 'clear': editor.chain().focus().clearNodes().unsetAllMarks().run(); break;
      }
      updateToolbar();
    });
  }
}
function updateToolbar(){
  if(!editor) return;
  const btns = document.querySelectorAll('.tb-btn[data-cmd]');
  btns.forEach(btn=>{
    const cmd = btn.dataset.cmd;
    let active = false;
    try{
      switch(cmd){
        case 'bold': active = editor.isActive('bold'); break;
        case 'italic': active = editor.isActive('italic'); break;
        case 'underline': active = editor.isActive('underline'); break;
        case 'h1': active = editor.isActive('heading',{level:1}); break;
        case 'h2': active = editor.isActive('heading',{level:2}); break;
        case 'bulletList': active = editor.isActive('bulletList'); break;
        case 'orderedList': active = editor.isActive('orderedList'); break;
        case 'taskList': active = editor.isActive('taskList'); break;
        case 'blockquote': active = editor.isActive('blockquote'); break;
        case 'code': active = editor.isActive('code'); break;
        case 'codeBlock': active = editor.isActive('codeBlock'); break;
        case 'link': active = editor.isActive('link'); break;
      }
    }catch{}
    btn.classList.toggle('is-active', active);
  });
}

async function loadNotes({append=false}={}){
  setError('');
  if(offlineReadOnly){ loadCachedNotes(); return; }
  const targetPage = append ? notesPage + 1 : 1;
  if(loadMoreNotesBtn){ loadMoreNotesBtn.disabled = true; loadMoreNotesBtn.textContent = append ? 'Loading…' : 'Load more notes'; }
  try{
    // Search/notebook/tag filters compose with stable server pagination.
    const qs = `/api/notes?filter=${currentFilter}&page=${targetPage}&limit=${NOTES_PAGE_SIZE}&includeMeta=true`
      + (currentQuery ? `&q=${encodeURIComponent(currentQuery)}` : '')
      + (currentNotebookId ? `&notebookId=${encodeURIComponent(currentNotebookId)}` : '')
      + (currentTagId ? `&tagId=${encodeURIComponent(currentTagId)}` : '');
    const res = await fetchWithAuth(API_BASE + qs, {method:'GET'});
    if(!res.ok){
      const j=await res.json().catch(()=>({}));
      throw new Error(j.message || `Fetch failed ${res.status}`);
    }
    const data = await res.json();
    const incoming = Array.isArray(data?.items) ? data.items : [];
    const meta = data?.meta || {page:targetPage,total:incoming.length,totalPages:1};
    if(append){
      const known = new Set(notes.map(note=>note.id));
      notes.push(...incoming.filter(note=>!known.has(note.id)));
    }else{
      notes = incoming;
    }
    notesPage = Number(meta.page || targetPage);
    notesTotalPages = Math.max(1, Number(meta.totalPages || 1));
    notesTotal = Number(meta.total || notes.length);
    sortNotes(notes); // WP-APP-007 — pin-aware
    renderList();
    if(currentView==='tasks') renderTasks();
    if(loadMoreNotesBtn){
      loadMoreNotesBtn.hidden = notesPage >= notesTotalPages || notes.length===0;
      loadMoreNotesBtn.disabled = false;
      loadMoreNotesBtn.textContent = `Load more (${Math.max(0, notesTotal-notes.length)} remaining)`;
    }
    await updateCounts(); // refresh sidebar counts (totals, unfiltered)
    if(countEl && (currentQuery || currentNotebookId || currentTagId)){
      countEl.textContent = currentQuery
        ? `${notesTotal} ${notesTotal===1?'match':'matches'}`
        : `${notesTotal} ${notesTotal===1?'note':'notes'}`;
    }
    if(notes.length===0){
      selectedId = null;
      titleInput.value = '';
      if(editor) editor.commands.setContent(createEmptyDoc(), false);
      setSaveStatus('', '');
      updateEditorForSelection(null);
    } else if(!append && (!selectedId || !notes.find(n=>n.id===selectedId))){
      selectNote(notes[0].id);
    } else {
      renderList();
      updateEditorForSelection(notes.find(n=>n.id===selectedId));
    }
  } catch(e){
    if(loadMoreNotesBtn){ loadMoreNotesBtn.disabled=false; loadMoreNotesBtn.textContent='Try loading more'; }
    setError(e.message || 'Could not load notes');
  }
}
if(loadMoreNotesBtn) loadMoreNotesBtn.addEventListener('click', ()=> loadNotes({append:true}));
function renderList(){
  if(!listEl) return;
  listEl.innerHTML = '';
  // WP-UI-NOTES-3D-001 — stagger only after a list-context change. A stored
  // timer keeps repeated paints in the same load cycle coherent, then removes
  // the hook before autosave-driven renders can replay it.
  if(listAnimateNext){
    clearTimeout(listAnimationTimer);
    listEl.classList.remove('is-animating');
    if(!reducedMotionQuery.matches){
      void listEl.offsetWidth;
      listEl.classList.add('is-animating');
      listAnimationTimer = setTimeout(()=> listEl.classList.remove('is-animating'), 700);
    }
    listAnimateNext = false;
  }
  const animateRows = listEl.classList.contains('is-animating');
  if(countEl) countEl.textContent = `${notes.length} ${notes.length===1?'note':'notes'}`;
  if(currentView==='home') renderHome();
  const isTrashView = currentFilter==='trash';
  if(notes.length===0){
    if(currentQuery){
      // WP-APP-004 — searching with zero results
      if(emptySearchEl) emptySearchEl.hidden = false;
      if(emptyEl) emptyEl.hidden = true;
      if(emptyTrashEl) emptyTrashEl.hidden = true;
    } else if(isTrashView){
      if(emptyTrashEl) emptyTrashEl.hidden = false;
      if(emptyEl) emptyEl.hidden = true;
      if(emptySearchEl) emptySearchEl.hidden = true;
    } else {
      if(emptyEl) emptyEl.hidden = false;
      if(emptyTrashEl) emptyTrashEl.hidden = true;
      if(emptySearchEl) emptySearchEl.hidden = true;
    }
    return;
  }
  if(emptyEl) emptyEl.hidden = true;
  if(emptyTrashEl) emptyTrashEl.hidden = true;
  if(emptySearchEl) emptySearchEl.hidden = true;
  notes.forEach((n,index)=>{
    const snippet = plainFromNote(n);
    const pinned = !!n.isPinned;
    // WP-UI-NOTES-001 — notebook label for the row meta line
    const notebook = n.notebookId ? notebooks.find(item=>item.id===n.notebookId) : null;
    // WP-APP-007 — row is a focusable div (not <button>) so the pin toggle is valid nested markup
    const btn = document.createElement('div');
    btn.className = 'app-note-item' + (pinned?' is-pinned':'') + (n.id===selectedId?' is-active':'');
    btn.dataset.id = n.id;
    btn.tabIndex = 0;
    if(animateRows) btn.style.setProperty('--i', String(Math.min(index, 14)));
    // Pin control: interactive in normal views; static indicator in Trash (pinned state is
    // preserved while trashed but no writes are allowed on a trashed note).
    const pinCtl = isTrashView
      ? (pinned ? `<span class="app-note-pin app-note-pin--static is-on" title="Pinned" aria-hidden="true">${PIN_SVG}</span>` : '')
      : `<button type="button" class="app-note-pin${pinned?' is-on':''}" title="${pinned?'Unpin note':'Pin note'}" aria-label="${pinned?'Unpin':'Pin'}: ${escapeHtml(n.title || 'Untitled')}" aria-pressed="${pinned?'true':'false'}">${PIN_SVG}</button>`;
    // WP-UI-NOTES-001 — richer row: 2-line snippet, tag chips, date + notebook meta
    const rowTags = (n.tags && n.tags.length)
      ? `<div class="app-note-tags">${n.tags.slice(0,3).map(t=>`<span class="app-note-tag" style="--tag-h:${tagHue(t.name)}">${escapeHtml(t.name)}</span>`).join('')}${n.tags.length>3?`<span class="app-note-tag app-note-tag-more">+${n.tags.length-3}</span>`:''}</div>`
      : '';
    btn.innerHTML = `
      ${pinCtl}
      <div class="app-note-title">${escapeHtml(n.title || 'Untitled')}</div>
      <div class="app-note-snippet">${escapeHtml(snippetFromText(snippet)) || '<span class="app-note-snippet-empty">No additional text</span>'}</div>
      ${rowTags}
      <div class="app-note-meta"><span>${formatDate(n.updatedAt || n.createdAt)}</span><span class="app-note-book">${escapeHtml(notebook ? notebook.name : 'Unfiled')}</span></div>
    `;
    btn.addEventListener('click', ()=> selectNote(n.id));
    btn.addEventListener('keydown', (e)=>{
      if((e.key==='Enter' || e.key===' ') && e.target===btn){ e.preventDefault(); selectNote(n.id); }
    });
    const pinEl = btn.querySelector('button.app-note-pin');
    if(pinEl) pinEl.addEventListener('click', (e)=>{ e.stopPropagation(); togglePin(n.id); });
    listEl.appendChild(btn);
  });
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// WP-UX-007 — ↑/↓ moves between note rows, Enter/Space opens (rows are focusable divs)
if(listEl) listEl.addEventListener('keydown', (e)=>{
  if(e.key!=='ArrowDown' && e.key!=='ArrowUp') return;
  const rows = [...listEl.querySelectorAll('.app-note-item')];
  if(!rows.length) return;
  const idx = rows.indexOf(document.activeElement);
  e.preventDefault();
  if(idx===-1){ rows[0].focus(); return; }
  const next = e.key==='ArrowDown' ? Math.min(idx+1, rows.length-1) : Math.max(idx-1, 0);
  rows[next].focus();
});
// WP-UI-NOTES-001 — editor meta strip (edited time + live word count) and
// the "no note open" empty state. Pure presentation; never touches save flow.
function updateEditorMeta(note){
  const empty = document.getElementById('editorEmpty');
  if(empty) empty.hidden = !!note;
  const meta = document.getElementById('editorMeta');
  if(!meta) return;
  if(!note){ meta.hidden = true; return; }
  meta.hidden = false;
  const editedEl = document.getElementById('editorMetaEdited');
  const wordsEl = document.getElementById('editorMetaWords');
  if(editedEl) editedEl.textContent = `Edited ${formatDate(note.updatedAt || note.createdAt)}`;
  if(wordsEl){
    const text = (editor ? editor.getText() : (note.contentText || '')).trim();
    const words = text ? text.split(/\s+/).length : 0;
    wordsEl.textContent = `${words} ${words===1?'word':'words'}`;
  }
  updateBacklinks(); // WP-LINKS-001 — linked mentions follow the open note
}
function updateEditorForSelection(note){
  const isTrashed = !!(note && note.isTrashed);
  const hasSelection = !!note;
  const readOnly = offlineReadOnly;
  hideAiSummary();
  hideAiTitle(); // WP-AI-002 — reset on every selection change
  hideAiTags(); // WP-AI-002b — reset on every selection change
  hideAiChat(); // WP-AI-003 — reset on every selection change
  hideAiAssist(); // WP-AI-004 — reset on every selection change
  syncAiChatForSelection(note ? note.id : null); // drops the transcript when the note changes
  if(note && (currentView === 'notes' || currentView === 'trash')) {
    renderAiSummary(note, 'Saved summary — regenerate after edits.');
  }
  if(note && currentView === 'notes') maybeSuggestTitle(note); // WP-AI-002
  if(note && currentView === 'notes') maybeSuggestTags(note); // WP-AI-002b
  // Title and editor
  updateEditorDisabled(!hasSelection || isTrashed || readOnly);
  // WP-APP-005 — notebook picker reflects selection; disabled for trashed/empty/offline
  if(nbSelect){
    nbSelect.disabled = !hasSelection || isTrashed || readOnly;
    nbSelect.value = (note && note.notebookId) || '';
  }
  // WP-APP-006 — tag chips reflect selection (hidden for trashed/empty)
  renderTagChips(hasSelection ? note : null);
  if(tagAddSelect) tagAddSelect.disabled = readOnly || !hasSelection || isTrashed;
  tagChips?.querySelectorAll('button').forEach(button=>{ button.disabled = readOnly; });
  // WP-APP-009 — sharing is disabled in Trash and offline.
  if(shareBtn) shareBtn.hidden = !hasSelection || isTrashed || readOnly;
  if(noteMoreBtn){
    noteMoreBtn.hidden = !hasSelection;
    noteMoreBtn.disabled = !hasSelection;
  }
  hideNoteMoreMenu();
  if(summarizeBtn) summarizeBtn.hidden = !hasSelection || isTrashed || readOnly;
  if(askNoteBtn) askNoteBtn.hidden = !hasSelection || isTrashed || readOnly; // WP-AI-003
  if(assistBtn) assistBtn.hidden = !hasSelection || isTrashed || readOnly; // WP-AI-004
  if(sharePanel){
    if(!hasSelection || isTrashed || readOnly) sharePanel.hidden = true;
    else if(sharedNoteId===note.id && shareLinkInput?.value) sharePanel.hidden = false;
  }
  // WP-APP-008 — attachments remain visible in Trash; uploads are disabled offline.
  if(attachmentRow) attachmentRow.hidden = !hasSelection;
  const mediaHidden = !hasSelection || isTrashed || readOnly;
  for(const btn of [attachImageBtn, document.getElementById('attachPdfBtn'), document.getElementById('recordAudioBtn'), document.getElementById('sketchBtn')]){
    if(btn){ btn.hidden = mediaHidden; btn.disabled = mediaHidden; }
  }
  if(!hasSelection) clearAttachmentGallery();
  // WP-APP-007 — editor pin control mirrors the selected note (hidden in Trash/no selection)
  if(pinBtn){
    pinBtn.hidden = !hasSelection || isTrashed || readOnly;
    pinBtn.disabled = !hasSelection || isTrashed || readOnly;
    const pinned = !!(note && note.isPinned);
    pinBtn.classList.toggle('is-pinned', pinned);
    pinBtn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
    pinBtn.title = pinned ? 'Unpin note' : 'Pin note';
    const lbl = pinBtn.querySelector('.app-pin-toggle-label');
    if(lbl) lbl.textContent = pinned ? 'Pinned' : 'Pin';
  }
  // WP-UX-003 — focus mode is available whenever a note is open
  if(focusModeBtn){
    focusModeBtn.hidden = !hasSelection;
    focusModeBtn.disabled = !hasSelection;
  }
  // Buttons
  if(trashBtn) trashBtn.hidden = !hasSelection || isTrashed || readOnly;
  if(restoreBtn) restoreBtn.hidden = !isTrashed || readOnly;
  if(deleteBtn) deleteBtn.hidden = !isTrashed || readOnly;
  const tb = document.getElementById('toolbar');
  if(tb){
    tb.style.opacity = (isTrashed || readOnly) ? '0.5' : '1';
    tb.style.pointerEvents = (isTrashed || readOnly) ? 'none' : 'auto';
  }
  if(readOnly && hasSelection){
    setSaveStatus('Offline · read only', 'is-error');
  } else if(isTrashed){
    setSaveStatus('Trashed', 'is-error');
  } else if(hasSelection){
    setSaveStatus('Saved', 'is-saved');
  } else {
    setSaveStatus('', '');
  }
  // WP-UI-NOTES-001 — meta strip + empty state follow the selection
  updateEditorMeta(note);
}
function selectNote(id){
  if(sharedNoteId && sharedNoteId!==id) resetSharePanel();
  selectedId = id;
  const n = notes.find(x=>x.id===id);
  if(!n) return;
  if(layout) { layout.classList.remove('is-list'); layout.classList.add('is-editor'); }
  if(mobileBar) mobileBar.hidden = false;
  titleInput.value = n.title || '';
  if(editor){
    const doc = docFromNote(n);
    editor.commands.setContent(doc, false);
    setTimeout(()=> updateToolbar(), 30);
  }
  // WP-UI-NOTES-3D-001 — note-open glide (restart-safe). Avoid the forced
  // reflow entirely when the user requests reduced motion.
  if(!reducedMotionQuery.matches){
    const editorPane = document.querySelector('.app-editor');
    if(editorPane){
      editorPane.classList.remove('note-open');
      void editorPane.offsetWidth;
      editorPane.classList.add('note-open');
    }
  }
  updateEditorForSelection(n);
  loadAttachments(n);
  renderList();
  titleInput.focus();
}
function updateEditorDisabled(disabled){
  if(titleInput) titleInput.disabled = disabled;
  if(saveBtn) saveBtn.disabled = disabled;
  if(editor){
    const isTrashed = !!(notes.find(n=>n.id===selectedId)?.isTrashed);
    const shouldDisable = disabled || isTrashed || offlineReadOnly;
    editor.setEditable(!shouldDisable);
    const el = document.querySelector('.tiptap-editor');
    if(el) el.style.opacity = shouldDisable ? '0.5' : '1';
  }
}

// ── WP-APP-009 — secret read-only share links ──
function resetSharePanel(){
  sharedNoteId = null;
  if(sharePanel) sharePanel.hidden = true;
  if(shareLinkInput) shareLinkInput.value = '';
  if(copyShareBtn) copyShareBtn.hidden = false;
  if(revokeShareBtn) revokeShareBtn.hidden = false;
  if(shareStatus) shareStatus.textContent = '';
  if(shareBtn){ shareBtn.disabled = false; shareBtn.textContent = 'Share'; }
}
if(shareBtn) shareBtn.addEventListener('click', async ()=>{
  const cur = notes.find(n=>n.id===selectedId);
  if(offlineReadOnly || !cur || cur.isTrashed) return;
  shareBtn.disabled = true;
  if(sharePanel) sharePanel.hidden = false;
  if(shareStatus) shareStatus.textContent = 'Creating link…';
  try{
    const res = await fetchWithAuth(API_BASE + `/api/notes/${cur.id}/share`, {method:'POST'});
    const j = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(j.message || `Share failed ${res.status}`);
    sharedNoteId = cur.id;
    if(shareLinkInput) shareLinkInput.value = j.url || '';
    if(copyShareBtn) copyShareBtn.hidden = false;
    if(revokeShareBtn) revokeShareBtn.hidden = false;
    if(shareStatus) shareStatus.textContent = 'Read-only link ready';
    shareBtn.textContent = 'Rotate link';
  }catch(e){
    if(shareStatus) shareStatus.textContent = e.message || 'Could not create share link';
  }finally{ shareBtn.disabled = false; }
});

if(summarizeBtn) summarizeBtn.addEventListener('click', async ()=>{
  if(!selectedId) return;
  const noteId = selectedId;
  summarizeBtn.disabled = true;
  summarizeBtn.textContent = 'Summarizing…';
  try{
    const res = await fetchWithAuth(`${API_BASE}/api/notes/${noteId}/summarize`, { method: 'POST' });
    const payload = await res.json().catch(()=>({}));
    if(res.status === 200){
      const { summary, provider } = payload;
      const note = notes.find(n=>n.id===noteId);
      if(note) note.summary = summary;
      if(selectedId === noteId){
        if(aiSummaryText) aiSummaryText.textContent = summary;
        if(aiSummaryMeta) aiSummaryMeta.textContent = provider === 'mock'
          ? 'Demo summary (no AI key configured)'
          : 'Generated just now';
        if(aiSummaryCard) aiSummaryCard.hidden = false;
      }
      setError('');
      return;
    }
    if(res.status === 400){
      setError(payload.message || 'Could not summarize this note');
    }else if(res.status === 429){
      setError('AI rate limit reached — try again in a few minutes.');
    }else{
      setError('AI is busy right now — try again in a moment.');
    }
  }catch{
    setError('AI is busy right now — try again in a moment.');
  }finally{
    summarizeBtn.disabled = false;
    summarizeBtn.textContent = '✨ Summarize';
  }
});
if(aiSummaryDismiss) aiSummaryDismiss.addEventListener('click', ()=> hideAiSummary());
// ── WP-AI-003/003b — chat with note. Stream-first transport: SSE deltas fill
// an empty bubble via textContent += as they arrive, with the original one-JSON
// request kept as the fallback transport when the stream endpoint answers
// anything other than 200 + text/event-stream (guards, 4xx JSON bodies, older
// deployments). Answers render through textContent only, and nothing is
// written anywhere; the transcript stays session-only.
if(askNoteBtn) askNoteBtn.addEventListener('click', ()=>{
  if(!selectedId) return;
  syncAiChatForSelection(selectedId);
  if(aiChatLog && !aiChatLog.childElementCount) renderChatEmptyHint();
  if(aiChatPanel) aiChatPanel.hidden = false;
  if(aiChatInput) aiChatInput.focus();
});
if(aiChatClose) aiChatClose.addEventListener('click', ()=> hideAiChat());
if(aiChatForm) aiChatForm.addEventListener('submit', async (event)=>{
  event.preventDefault();
  if(chatInFlight || !selectedId) return;
  const noteId = selectedId;
  const question = (aiChatInput?.value || '').trim();
  if(!question) return;
  chatInFlight = true;
  appendChatBubble('user', question);
  if(aiChatSend){ aiChatSend.disabled = true; aiChatSend.textContent = 'Thinking…'; }
  const requestBody = JSON.stringify({ question, history: chatHistory.slice(-6) });
  let assistantBubble = null;
  let assembled = '';
  try{
    // Stream-first (WP-AI-003b): same JSON body to the SSE endpoint. An empty
    // assistant bubble is created lazily on the first delta so a failed or
    // non-SSE response never leaves a stray bubble behind.
    let streamedAnswer = false;
    let cleanDone = false;
    let frameError = null;
    let useJsonFallback = false;
    try{
      const res = await fetchWithAuth(`${API_BASE}/api/notes/${noteId}/chat/stream`, {
        method: 'POST',
        body: requestBody
      });
      const contentType = res.headers.get('content-type') || '';
      if(res.status !== 200 || !contentType.includes('text/event-stream') || !res.body){
        // Not a stream upgrade (guard 4xx JSON bodies land here too) and no
        // delta has been applied yet → discard the (still empty) bubble and
        // fall through to the JSON path below.
        useJsonFallback = true;
      }else{
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finished = false;
        while(!finished){
          const { value, done } = await reader.read();
          if(done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep;
          while((sep = buffer.indexOf('\n\n')) !== -1){
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const dataLine = frame.split('\n').find((line)=> line.startsWith('data:'));
            if(!dataLine) continue; // malformed frame — skipped, never fatal
            const payload = dataLine.slice(5).trim();
            if(payload === '[DONE]'){ finished = true; cleanDone = true; break; }
            let parsed = null;
            try{ parsed = JSON.parse(payload); }catch{ /* malformed frame — skip */ }
            if(!parsed) continue;
            if(typeof parsed.delta === 'string' && parsed.delta){
              streamedAnswer = true;
              if(!assistantBubble) assistantBubble = appendChatBubble('assistant', '');
              assistantBubble.textContent += parsed.delta;
              if(aiChatLog) aiChatLog.scrollTop = aiChatLog.scrollHeight;
              assembled += parsed.delta;
            }else if(typeof parsed.error === 'string'){
              frameError = parsed.error;
              finished = true;
              break;
            }
          }
        }
        if(frameError){
          try{ reader.cancel(); }catch{ /* already closed */ }
          if(!streamedAnswer){
            if(assistantBubble) assistantBubble.remove();
            setError(frameError);
          }else{
            setError('Answer may be incomplete.');
          }
        }else if(cleanDone && !streamedAnswer){
          // Stream completed with no content: mirror the JSON path's empty
          // answer — no bubble, no history entry, no error.
          if(assistantBubble) assistantBubble.remove();
          setError('');
        }
      }
    }catch{
      // Mid-flight failure. Only fall back when nothing was rendered yet;
      // once deltas are on screen a retry would duplicate the answer.
      if(!streamedAnswer){ useJsonFallback = true; cleanDone = false; frameError = null; }
      else setError('AI is busy right now — try again in a moment.');
    }
    if(useJsonFallback){
      // Original JSON transport, unchanged.
      const res = await fetchWithAuth(`${API_BASE}/api/notes/${noteId}/chat`, {
        method: 'POST',
        body: requestBody
      });
      const payload = await res.json().catch(()=>({}));
      if(res.status === 200){
        const answer = typeof payload.answer === 'string' ? payload.answer : '';
        if(selectedId === noteId && answer){
          appendChatBubble('assistant', answer);
          chatHistory.push({ role:'user', content: question });
          chatHistory.push({ role:'assistant', content: answer });
          if(chatHistory.length > 12) chatHistory = chatHistory.slice(-12); // cap 6 turns
        }
        setError('');
      }else if(res.status === 400){
        setError(payload.message || 'Could not answer that question');
      }else if(res.status === 429){
        setError('AI rate limit reached — try again in a few minutes.');
      }else{
        setError('AI is busy right now — try again in a moment.');
      }
    }else if(cleanDone && streamedAnswer && assembled && selectedId === noteId){
      // Clean [DONE]: record the turn, session-only, same 12-entry cap.
      chatHistory.push({ role:'user', content: question });
      chatHistory.push({ role:'assistant', content: assembled });
      if(chatHistory.length > 12) chatHistory = chatHistory.slice(-12); // cap 6 turns
      setError('');
    }
  }catch{
    setError('AI is busy right now — try again in a moment.');
  }finally{
    chatInFlight = false;
    if(aiChatSend){ aiChatSend.disabled = false; aiChatSend.textContent = 'Send'; }
    if(aiChatInput) aiChatInput.value = '';
  }
});

// ── WP-AI-004 — non-streaming writing assistant. The endpoint only suggests;
// editor mutation happens here, and only after an explicit Apply click.
function setAssistControlsPending(pending){
  assistInFlight = pending;
  if(assistBtn){
    assistBtn.disabled = pending;
    assistBtn.textContent = pending ? 'Working…' : '✍ Assist';
  }
  assistMenu?.querySelectorAll('button').forEach(button=>{ button.disabled = pending; });
  aiBubbleMenu?.querySelectorAll('button').forEach(button=>{ button.disabled = pending; }); // WP-AI-004b
  if(aiAssistApply) aiAssistApply.disabled = pending;
  if(aiAssistDismiss) aiAssistDismiss.disabled = pending;
}
if(assistBtn) assistBtn.addEventListener('click', ()=>{
  if(assistInFlight || !selectedId || !assistMenu) return;
  assistMenu.hidden = !assistMenu.hidden;
});
// WP-AI-004/004b — ONE shared action runner. The toolbar dropdown and the
// floating selection bubble both funnel through runAssist() and end at the
// SAME review/Apply bar; only explicit Apply mutates the editor.
const ASSIST_LABELS = { continue:'✍ Continue suggestion', rephrase:'✍ Rephrase suggestion', shorten:'✍ Shorten suggestion', expand:'✍ Expand suggestion', grammar:'✍ Grammar fix', outline:'✍ Outline suggestion' };
async function runAssist(action){
  if(assistInFlight || !editor || !selectedId) return;
  if(!['continue','rephrase','shorten','expand','grammar','outline'].includes(action)) return;
  const noteId = selectedId;
  const note = notes.find(item=>item.id===noteId);
  if(!note || note.isTrashed || offlineReadOnly) return;

  const selection = editor.state.selection;
  const range = action === 'continue' ? null : { from:selection.from, to:selection.to };
  const selectedText = range ? editor.state.doc.textBetween(range.from, range.to, ' ').trim() : '';
  if(range && (!selectedText || range.from === range.to)){
    if(assistMenu) assistMenu.hidden = true;
    setError('Select some text to use this action.');
    return;
  }

  hideAiAssist();
  assistAction = action;
  assistRange = range;
  assistNoteId = noteId;
  setAssistControlsPending(true);
  setError('');
  try{
    const body = action === 'continue' ? { action } : { action, text:selectedText };
    const res = await fetchWithAuth(`${API_BASE}/api/notes/${noteId}/assist`, {
      method:'POST',
      body:JSON.stringify(body),
    });
    const payload = await res.json().catch(()=>({}));
    if(res.status === 200){
      const suggestion = typeof payload.suggestion === 'string' ? payload.suggestion.trim() : '';
      if(!suggestion){
        setError('AI is busy right now — try again in a moment.');
        hideAiAssist();
        return;
      }
      // A view/note change clears assistNoteId, preventing stale responses from resurfacing.
      if(selectedId !== noteId || assistNoteId !== noteId) return;
      assistSuggestion = suggestion;
      if(aiAssistLabel) aiAssistLabel.textContent = ASSIST_LABELS[action] || '✍ AI suggestion';
      if(aiAssistText) aiAssistText.textContent = suggestion; // plain text, never innerHTML
      if(aiAssistBar) aiAssistBar.hidden = false;
      setError('');
    }else if(res.status === 400){
      setError(payload.message || 'Could not create a writing suggestion');
      hideAiAssist();
    }else if(res.status === 429){
      setError('AI rate limit reached — try again in a few minutes.');
      hideAiAssist();
    }else{
      setError('AI is busy right now — try again in a moment.');
      hideAiAssist();
    }
  }catch{
    setError('AI is busy right now — try again in a moment.');
    hideAiAssist();
  }finally{
    setAssistControlsPending(false);
  }
}
if(assistMenu) assistMenu.addEventListener('click', (event)=>{
  const control = event.target.closest('button[data-action]');
  if(!control || !assistMenu.contains(control)) return;
  runAssist(control.dataset.action);
});
if(aiBubbleMenu) aiBubbleMenu.addEventListener('mousedown', (event)=>event.preventDefault()); // keep editor focus + selection
if(aiBubbleMenu) aiBubbleMenu.addEventListener('click', (event)=>{
  const control = event.target.closest('button[data-action]');
  if(!control || assistInFlight) return;
  aiBubbleMenu.hidden = true;
  runAssist(control.dataset.action);
});
document.addEventListener('keydown', (event)=>{
  if(event.key === 'Escape' && aiBubbleMenu && !aiBubbleMenu.hidden) aiBubbleMenu.hidden = true;
});
// Stale coordinates are worse than a re-select: hide the bubble when the
// editor column scrolls. .app-editor-body is the element that scrolls #tiptapEditor.
const assistEditorScroll = document.querySelector('.app-editor-body');
if(assistEditorScroll) assistEditorScroll.addEventListener('scroll', ()=>{
  if(aiBubbleMenu && !aiBubbleMenu.hidden) aiBubbleMenu.hidden = true;
}, { passive: true });
if(aiAssistApply) aiAssistApply.addEventListener('click', ()=>{
  if(!editor || !assistSuggestion || !assistAction || !assistNoteId) return;
  if(selectedId !== assistNoteId){ hideAiAssist(); return; }
  const currentSize = editor.state.doc.content.size;
  if(assistRange && assistRange.to > currentSize){ hideAiAssist(); return; }
  const suggestion = assistSuggestion;
  const applied = assistAction === 'continue'
    ? editor.chain().focus().insertContentAt(currentSize, suggestion).run()
    : editor.chain().focus().insertContentAt(assistRange, suggestion).run();
  if(!applied) return;
  onEdit(); // existing 900 ms autosave is the only persistence path
  hideAiAssist();
  editor.commands.focus();
});
if(aiAssistDismiss) aiAssistDismiss.addEventListener('click', hideAiAssist);

// WP-AI-002 — apply/dismiss the suggested title. Applying goes through the
// normal edit path (title input + onEdit → 900ms autosave), so the server's
// suggestion only ever persists with explicit user consent.
if(aiTitleApply) aiTitleApply.addEventListener('click', ()=>{
  if(!aiTitleNoteId || aiTitleNoteId !== selectedId || !titleInput) return;
  const suggested = aiTitleText ? aiTitleText.textContent.trim() : '';
  if(!suggested) return;
  titleInput.value = suggested;
  onEdit(); // marks dirty + schedules autosave
  hideAiTitle();
  hideAiTags();
  hideAiChat(); // WP-AI-003
  hideAiAssist(); // WP-AI-004
  titleInput.focus();
});
if(aiTitleDismiss) aiTitleDismiss.addEventListener('click', ()=>{ hideAiTitle(); hideAiTags(); hideAiChat(); hideAiAssist(); });
if(copyShareBtn) copyShareBtn.addEventListener('click', async ()=>{
  const value = shareLinkInput?.value || '';
  if(!value) return;
  try{
    await navigator.clipboard.writeText(value);
    if(shareStatus) shareStatus.textContent = 'Copied';
  }catch{
    shareLinkInput.focus();
    shareLinkInput.select();
    const copied = document.execCommand('copy');
    if(shareStatus) shareStatus.textContent = copied ? 'Copied' : 'Select and copy the link';
  }
});
if(revokeShareBtn) revokeShareBtn.addEventListener('click', async ()=>{
  if(!selectedId) return;
  revokeShareBtn.disabled = true;
  if(shareStatus) shareStatus.textContent = 'Revoking…';
  try{
    const res = await fetchWithAuth(API_BASE + `/api/notes/${selectedId}/share`, {method:'DELETE'});
    if(!res.ok){ const j=await res.json().catch(()=>({})); throw new Error(j.message || `Revoke failed ${res.status}`); }
    sharedNoteId = null;
    if(shareLinkInput) shareLinkInput.value = '';
    if(copyShareBtn) copyShareBtn.hidden = true;
    revokeShareBtn.hidden = true;
    if(shareStatus) shareStatus.textContent = 'Link revoked';
    if(shareBtn) shareBtn.textContent = 'Share';
  }catch(e){
    if(shareStatus) shareStatus.textContent = e.message || 'Could not revoke link';
  }finally{ revokeShareBtn.disabled = false; }
});

// ── WP-APP-008 — image attachments ──
function clearAttachmentGallery(){
  attachmentLoadVersion++;
  attachmentObjectUrls.forEach(url=> URL.revokeObjectURL(url));
  attachmentObjectUrls = [];
  if(attachmentGallery) attachmentGallery.innerHTML = '';
  if(attachmentStatus) attachmentStatus.textContent = '';
}
async function loadAttachments(note){
  if(!attachmentGallery || !note) return;
  if(offlineReadOnly){
    clearAttachmentGallery();
    if(attachmentStatus) attachmentStatus.textContent = 'Attachments are unavailable offline';
    return;
  }
  const version = ++attachmentLoadVersion;
  attachmentObjectUrls.forEach(url=> URL.revokeObjectURL(url));
  attachmentObjectUrls = [];
  attachmentGallery.innerHTML = '';
  if(attachmentStatus) attachmentStatus.textContent = 'Loading attachments…';
  try{
    const res = await fetchWithAuth(API_BASE + `/api/notes/${note.id}/attachments`, {method:'GET'});
    const items = await res.json().catch(()=>[]);
    if(!res.ok) throw new Error(items.message || `Attachment list failed ${res.status}`);
    if(version!==attachmentLoadVersion || selectedId!==note.id) return;
    for(const item of items){
      const mime = String(item.mime || '');
      const isImage = mime.startsWith('image/');
      const isPdf = mime === 'application/pdf';
      const isAudio = mime.startsWith('audio/');
      // PDFs and audio: metadata card first, bytes fetched lazily on demand —
      // a 15MB PDF should not download just to show one row in the gallery.
      if(isPdf || isAudio){
        const card = document.createElement('div');
        card.className = 'app-attachment-item app-attachment-file';
        card.dataset.attachmentId = item.id;
        const safeName = escapeHtml(item.filename || (isPdf ? 'document.pdf' : 'recording'));
        const icon = isPdf ? '📄' : '🎙';
        card.innerHTML = `<span class="app-attachment-fileicon" aria-hidden="true">${icon}</span><span class="app-attachment-name" title="${safeName}">${safeName}</span><button type="button" class="app-attachment-open" title="Open">${isPdf ? 'Open' : 'Play'}</button>${note.isTrashed ? '' : `<button type="button" class="app-attachment-remove" aria-label="Remove ${safeName}" title="Remove">×</button>`}`;
        card.querySelector('.app-attachment-open').addEventListener('click', async ()=>{
          const btn = card.querySelector('.app-attachment-open');
          btn.disabled = true;
          try{
            const fileRes = await fetchWithAuth(API_BASE + item.url, {method:'GET'});
            if(!fileRes.ok) throw new Error('Could not load file');
            const blob = await fileRes.blob();
            const objectUrl = URL.createObjectURL(blob);
            attachmentObjectUrls.push(objectUrl);
            if(isPdf){ window.open(objectUrl, '_blank', 'noopener'); }
            else {
              let player = card.querySelector('audio');
              if(!player){
                player = document.createElement('audio');
                player.controls = true;
                card.appendChild(player);
              }
              player.src = objectUrl;
              player.play().catch(()=>{});
              btn.textContent = 'Open';
            }
          }catch(e){ showToast(e.message || 'Could not open file'); }
          finally{ btn.disabled = false; }
        });
        const remove = card.querySelector('.app-attachment-remove');
        if(remove) remove.addEventListener('click', ()=> removeAttachment(item.id, note));
        attachmentGallery.appendChild(card);
        continue;
      }
      const fileRes = await fetchWithAuth(API_BASE + item.url, {method:'GET'});
      if(!fileRes.ok) continue;
      const blob = await fileRes.blob();
      if(version!==attachmentLoadVersion || selectedId!==note.id) return;
      const objectUrl = URL.createObjectURL(blob);
      attachmentObjectUrls.push(objectUrl);
      const card = document.createElement('div');
      card.className = 'app-attachment-item';
      card.dataset.attachmentId = item.id;
      const safeName = escapeHtml(item.filename || 'image');
      card.innerHTML = `<img alt="${safeName}"><span class="app-attachment-name" title="${safeName}">${safeName}</span>${note.isTrashed ? '' : `<button type="button" class="app-attachment-remove" aria-label="Remove image ${safeName}" title="Remove image">×</button>`}`;
      card.querySelector('img').src = objectUrl;
      const remove = card.querySelector('.app-attachment-remove');
      if(remove) remove.addEventListener('click', ()=> removeAttachment(item.id, note));
      attachmentGallery.appendChild(card);
    }
    if(attachmentStatus) attachmentStatus.textContent = items.length ? `${items.length} ${items.length===1?'file':'files'}` : 'No attachments';
  }catch(e){
    if(version===attachmentLoadVersion && attachmentStatus) attachmentStatus.textContent = e.message || 'Could not load attachments';
  }
}
async function removeAttachment(id, note){
  if(!id || !note || note.isTrashed) return;
  if(attachmentStatus) attachmentStatus.textContent = 'Removing…';
  try{
    const res = await fetchWithAuth(API_BASE + `/api/attachments/${id}`, {method:'DELETE'});
    if(!res.ok){ const j=await res.json().catch(()=>({})); throw new Error(j.message || `Remove failed ${res.status}`); }
    await loadAttachments(note);
  }catch(e){ if(attachmentStatus) attachmentStatus.textContent = e.message || 'Could not remove image'; }
}
if(attachImageBtn) attachImageBtn.addEventListener('click', ()=> attachImageInput?.click());
// WP-UX-002 — shared image upload used by the file picker AND paste/drop in the editor
async function uploadNoteImages(files){
  const cur = notes.find(n=>n.id===selectedId);
  const list = [...(files || [])];
  if(offlineReadOnly || !cur || cur.isTrashed || !list.length) return false;
  const form = new FormData();
  list.forEach(file=> form.append('images', file));
  if(attachmentStatus) attachmentStatus.textContent = 'Uploading…';
  if(attachImageBtn) attachImageBtn.disabled = true;
  try{
    const res = await fetchWithAuth(API_BASE + `/api/notes/${cur.id}/attachments`, {method:'POST', body:form});
    const j = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(j.message || `Upload failed ${res.status}`);
    await loadAttachments(cur);
    showToast(list.length===1 ? 'Image attached' : `${list.length} images attached`);
    return true;
  }catch(e){
    if(attachmentStatus) attachmentStatus.textContent = e.message || 'Image upload failed';
    showToast(e.message || 'Image upload failed');
    return false;
  }finally{
    if(attachImageBtn) attachImageBtn.disabled = false;
  }
}
if(attachImageInput) attachImageInput.addEventListener('change', async ()=>{
  const files = [...(attachImageInput.files || [])];
  attachImageInput.value = '';
  await uploadNoteImages(files);
});

async function createNote(){
  if(offlineReadOnly){ setSaveStatus('Offline · read only','is-error'); return; }
  // Creating from Home/global sidebar always opens the existing editor workspace.
  setViewChrome('notes');
  setRouteHash('notes', true);
  // WP-APP-004 — a new note must never hide behind an active search filter
  if(currentQuery) clearSearchNow(false);
  // If in trash, switch to active first
  if(currentFilter==='trash'){
    currentFilter = 'active';
    updateNav();
    selectedId = null;
    await loadNotes();
  }
  setError('');
  if(newBtn) newBtn.disabled = true;
  try{
    const emptyDoc = createEmptyDoc();
    const res = await fetchWithAuth(API_BASE + '/api/notes', {
      method:'POST',
      // WP-APP-005: a new note lands in the notebook you're currently viewing
      body: JSON.stringify({ title: 'Untitled', description: '', contentJson: emptyDoc, contentText: '', ...(currentNotebookId ? { notebookId: currentNotebookId } : {}) })
    });
    if(!res.ok){
      const j = await res.json().catch(()=>({}));
      throw new Error(j.message || 'Create failed');
    }
    const created = await res.json();
    // Ensure active filter
    if(currentFilter!=='active'){
      currentFilter='active';
      updateNav();
    }
    notes.unshift(created);
    selectedId = created.id;
    renderList();
    selectNote(created.id);
    markSaved();
    updateCounts();
  } catch(e){
    setError(e.message || 'Could not create note');
  } finally {
    if(newBtn) newBtn.disabled = false;
  }
}
async function saveNote(){
  if(offlineReadOnly){ setSaveStatus('Offline · read only','is-error'); return; }
  if(!selectedId || isSaving) return;
  const noteId = selectedId;
  const revisionAtStart = editRevision;
  const cur = notes.find(n=>n.id===noteId);
  if(cur && cur.isTrashed){
    setError('Cannot save a trashed note. Restore it first.');
    return;
  }
  const title = titleInput.value;
  const json = editor ? editor.getJSON() : createEmptyDoc();
  const text = editor ? editor.getText() : '';
  setSaveStatus('Saving…', 'is-saving');
  if(saveBtn) saveBtn.disabled = true;
  isSaving = true;
  try{
    const res = await fetchWithAuth(API_BASE + `/api/notes/${noteId}`, {
      method:'PUT',
      body: JSON.stringify({
        title: title || 'Untitled',
        contentJson: json,
        contentText: text,
        description: text,
        ...(cur?.updatedAt ? {expectedUpdatedAt: cur.updatedAt} : {}),
      })
    });
    if(!res.ok){
      const j = await res.json().catch(()=>({}));
      throw new Error(j.message || `Save failed ${res.status}`);
    }
    const updated = await res.json();
    const idx = notes.findIndex(n=>n.id===noteId);
    if(idx>=0) notes[idx] = updated;
    dirty = editRevision !== revisionAtStart;
    sortNotes(notes); // WP-APP-007 — pin-aware
    renderList();
    if(selectedId===noteId){ if(dirty){ setSaveStatus('Unsaved',''); } else { markSaved(); } }
    updateCounts();
  } catch(e){
    dirty = true;
    if(selectedId===noteId){
      setSaveStatus('Error', 'is-error');
      setError(e.message || 'Save failed');
    }
  } finally {
    isSaving = false;
    if(saveBtn) saveBtn.disabled = false;
    // An edit that happened while the request was in flight gets its own save;
    // the earlier response can never clear that newer dirty revision.
    if(dirty && selectedId===noteId){
      clearTimeout(saveTimer);
      saveTimer = setTimeout(()=>saveNote(), 300);
    }
  }
}

// Trash / Restore / Delete forever
async function moveToTrash(){
  if(!selectedId) return;
  const cur = notes.find(n=>n.id===selectedId);
  if(!cur || cur.isTrashed) return;
  setError('');
  setSaveStatus('Moving to Trash…','is-saving');
  try{
    // Prefer dedicated endpoint, fallback to PATCH
    let res = await fetchWithAuth(API_BASE + `/api/notes/${selectedId}/trash`, {method:'POST'});
    if(!res.ok){
      res = await fetchWithAuth(API_BASE + `/api/notes/${selectedId}`, {method:'PATCH', body: JSON.stringify({ isTrashed: true })});
    }
    if(!res.ok){
      const j = await res.json().catch(()=>({}));
      throw new Error(j.message || 'Could not move to trash');
    }
    const updated = await res.json().catch(()=>({}));
    const trashedId = cur.id;
    const trashedTitle = cur.title || 'Untitled';
    // Remove from current active list
    notes = notes.filter(n=>n.id!==selectedId);
    selectedId = null;
    titleInput.value = '';
    if(editor) editor.commands.setContent(createEmptyDoc(), false);
    updateEditorForSelection(null);
    renderList();
    setSaveStatus('Moved to Trash','is-saved');
    updateCounts();
    // If no notes left, show empty
    if(notes.length===0){
      updateEditorDisabled(true);
    }
    // WP-UX-001 — undo snackbar: restore straight from the toast
    showToast(`"${trashedTitle}" moved to trash`, {
      action: 'Undo',
      duration: 6000,
      onAction: ()=> restoreById(trashedId),
    });
  } catch(e){
    setError(e.message || 'Move to trash failed');
    setSaveStatus('Error','is-error');
  }
}
// WP-UX-001 — restore a note by id regardless of the current selection
// (shared by the Trash view action and the toast Undo control).
async function restoreById(id){
  if(offlineReadOnly || !id) return;
  setError('');
  setSaveStatus('Restoring…','is-saving');
  try{
    let res = await fetchWithAuth(API_BASE + `/api/notes/${id}/restore`, {method:'POST'});
    if(!res.ok){
      res = await fetchWithAuth(API_BASE + `/api/notes/${id}`, {method:'PATCH', body: JSON.stringify({ isTrashed: false })});
    }
    if(!res.ok){
      const j = await res.json().catch(()=>({}));
      throw new Error(j.message || 'Could not restore');
    }
    const restored = await res.json().catch(()=>({}));
    showToast('Note restored');
    // Switch to Notes to show the restored item.
    currentFilter = 'active';
    currentView = 'notes';
    setViewChrome('notes');
    setRouteHash('notes', true);
    updateNav();
    await loadNotes();
    if(restored && restored.id) selectNote(restored.id);
    setSaveStatus('Restored','is-saved');
  }catch(e){
    setError(e.message || 'Restore failed');
    setSaveStatus('Error','is-error');
  }
}
async function restoreNote(){
  if(!selectedId) return;
  const cur = notes.find(n=>n.id===selectedId);
  if(!cur || !cur.isTrashed) return;
  await restoreById(cur.id);
}
function showDeleteModal(){
  if(!deleteModal) return;
  deleteModal.hidden = false;
  // trap focus? simple
  if(modalConfirm) modalConfirm.focus();
}
function hideDeleteModal(){
  if(deleteModal) deleteModal.hidden = true;
}
async function deleteForever(){
  if(!selectedId) return;
  const cur = notes.find(n=>n.id===selectedId);
  if(!cur || !cur.isTrashed){
    setError('Only trashed notes can be deleted forever.');
    return;
  }
  hideDeleteModal();
  setSaveStatus('Deleting…','is-saving');
  try{
    const res = await fetchWithAuth(API_BASE + `/api/notes/${selectedId}`, {method:'DELETE'});
    if(!res.ok){
      const j = await res.json().catch(()=>({}));
      throw new Error(j.message || 'Delete failed');
    }
    notes = notes.filter(n=>n.id!==selectedId);
    selectedId = null;
    titleInput.value = '';
    if(editor) editor.commands.setContent(createEmptyDoc(), false);
    updateEditorForSelection(null);
    renderList();
    setSaveStatus('Deleted','is-saved');
    updateCounts();
    if(notes.length===0) updateEditorDisabled(true);
  } catch(e){
    setError(e.message || 'Delete forever failed');
    setSaveStatus('Error','is-error');
  }
}

// Dirty handling
let dirty = false;
function onEdit(){
  if(!selectedId) return;
  const cur = notes.find(n=>n.id===selectedId);
  if(cur && cur.isTrashed) return;
  dirty = true;
  editRevision += 1;
  setSaveStatus('Unsaved', '');
  updateEditorMeta(cur); // WP-UI-NOTES-001 — live word count while typing
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    if(dirty) saveNote();
  }, 900);
}
function onEditorUpdate(){
  onEdit();
  updateWikiPicker(); // WP-LINKS-002 — [[ autocomplete follows the caret
}
if(titleInput) titleInput.addEventListener('input', onEdit);
if(saveBtn) saveBtn.addEventListener('click', async ()=>{
  clearTimeout(saveTimer);
  await saveNote();
});
document.addEventListener('keydown', (e)=>{
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='s'){
    e.preventDefault();
    if(selectedId && !saveBtn.disabled) saveNote().then(()=> dirty=false);
  }
});

if(newBtn) newBtn.addEventListener('click', createNote);
if(newBtnEmpty) newBtnEmpty.addEventListener('click', createNote);
if(trashBtn) trashBtn.addEventListener('click', moveToTrash);
if(restoreBtn) restoreBtn.addEventListener('click', restoreNote);
if(deleteBtn) deleteBtn.addEventListener('click', showDeleteModal);
if(modalCancel) modalCancel.addEventListener('click', hideDeleteModal);
if(modalBackdrop) modalBackdrop.addEventListener('click', hideDeleteModal);
if(modalConfirm) modalConfirm.addEventListener('click', deleteForever);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && deleteModal && !deleteModal.hidden) hideDeleteModal(); });

if(navHome) navHome.addEventListener('click', ()=> goToView('home'));
if(navAll) navAll.addEventListener('click', ()=> goToView('notes'));
if(navShortcuts) navShortcuts.addEventListener('click', ()=> goToView('shortcuts'));
if(navNotebooks) navNotebooks.addEventListener('click', ()=> goToView('notebooks'));
if(navTags) navTags.addEventListener('click', ()=> goToView('tags'));
if(navTrash) navTrash.addEventListener('click', ()=> goToView('trash'));
if(navTasks) navTasks.addEventListener('click', ()=> goToView('tasks'));
if(navTemplates) navTemplates.addEventListener('click', ()=> goToView('templates'));
if(navGraph) navGraph.addEventListener('click', ()=> goToView('graph'));
if(navAsk) navAsk.addEventListener('click', ()=> goToView('ask'));
if(tasksNewNote) tasksNewNote.addEventListener('click', ()=> createNoteFromTemplate('todo'));
if(templatesBlankNote) templatesBlankNote.addEventListener('click', createNote);
if(noteMoreBtn) noteMoreBtn.addEventListener('click', (event)=>{
  event.stopPropagation();
  if(!noteMoreMenu) return;
  noteMoreMenu.hidden = !noteMoreMenu.hidden;
});
if(noteMoreMenu) noteMoreMenu.addEventListener('click', (event)=>{
  const action = event.target.closest('button[data-action]')?.dataset.action;
  if(action==='duplicate') duplicateSelectedNote();
  else if(action==='export') exportSelectedMarkdown();
  else if(action==='export-text') exportSelectedText();
  else if(action==='export-html') exportSelectedHtml();
  else if(action==='print') printSelectedNote();
});
document.addEventListener('click', (event)=>{
  if(noteMoreMenu && !noteMoreMenu.hidden && !event.target.closest('#noteMoreBtn, #noteMoreMenu')) hideNoteMoreMenu();
});
if(shortcutsHelpClose) shortcutsHelpClose.addEventListener('click', closeShortcutsHelp);
if(shortcutsHelpBackdrop) shortcutsHelpBackdrop.addEventListener('click', closeShortcutsHelp);
if(globalSearchForm) globalSearchForm.addEventListener('submit', (event)=>{
  event.preventDefault();
  const query=(globalSearchInput?.value||'').trim();
  currentQuery=query;
  if(searchInput) searchInput.value=query;
  if(searchClear) searchClear.hidden=!query;
  if(globalSearchClear) globalSearchClear.hidden=!query;
  goToView('notes');
});
if(globalSearchInput) globalSearchInput.addEventListener('input', ()=>{ if(globalSearchClear) globalSearchClear.hidden=!globalSearchInput.value; });
if(globalSearchClear) globalSearchClear.addEventListener('click', ()=>{ clearSearchNow(); globalSearchInput?.focus(); });
if(sidebarNewNote) sidebarNewNote.addEventListener('click', createNote);
if(syncNotesBtn) syncNotesBtn.addEventListener('click', async ()=>{
  syncNotesBtn.disabled=true;
  await Promise.all([loadNotes(), loadNotebooks(), loadTags()]);
  syncNotesBtn.disabled=false;
  showToast('Notes refreshed from the server.');
});
const openAiTools = ()=>{
  goToView('notes');
  showToast(selectedId ? 'Use Summarize, Ask this note, or Assist in the editor.' : 'Create or select a note to use AI tools.');
};
if(openAiToolsBtn) openAiToolsBtn.addEventListener('click', openAiTools);
if(openAiToolsFab) openAiToolsFab.addEventListener('click', openAiTools);
if(homeNewNoteTop) homeNewNoteTop.addEventListener('click', createNote);
if(homeViewAll) homeViewAll.addEventListener('click', ()=> goToView('notes'));
if(shortcutsViewNotes) shortcutsViewNotes.addEventListener('click', ()=> goToView('notes'));
if(organizeCreateBtn) organizeCreateBtn.addEventListener('click', showOrganizeCreate);
if(organizeCreateForm) organizeCreateForm.addEventListener('submit', submitOrganizeCreate);
if(organizeCreateCancel) organizeCreateCancel.addEventListener('click', hideOrganizeCreate);
if(sidebarOpen) sidebarOpen.addEventListener('click', ()=>{ document.body.classList.add('sidebar-open'); if(sidebarScrim) sidebarScrim.hidden=false; });
if(sidebarClose) sidebarClose.addEventListener('click', closeMobileSidebar);
if(sidebarScrim) sidebarScrim.addEventListener('click', closeMobileSidebar);
// WP-UI-HOME-PIXEL-001 — desktop sidebar collapse chevron (icon-rail mode)
const sidebarCollapseBtn = document.getElementById('sidebarCollapse');
if(sidebarCollapseBtn) sidebarCollapseBtn.addEventListener('click', ()=>{
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  sidebarCollapseBtn.setAttribute('aria-expanded', String(!collapsed));
  sidebarCollapseBtn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  sidebarCollapseBtn.setAttribute('aria-label', sidebarCollapseBtn.title);
  try{ localStorage.setItem('notin_sidebar_collapsed', collapsed ? '1' : '0'); }catch{}
});
try{ if(localStorage.getItem('notin_sidebar_collapsed')==='1'){
  document.body.classList.add('sidebar-collapsed');
  if(sidebarCollapseBtn){ sidebarCollapseBtn.setAttribute('aria-expanded','false'); sidebarCollapseBtn.title='Expand sidebar'; }
} }catch{}
document.addEventListener('keydown', (event)=>{
  if((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='k'){
    event.preventDefault(); globalSearchInput?.focus();
  }
  if((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='n'){
    event.preventDefault();
    createNote();
  }
  const typing = event.target && (event.target.tagName==='INPUT' || event.target.tagName==='TEXTAREA' || event.target.isContentEditable);
  if(!event.ctrlKey && !event.metaKey && !event.altKey && event.key==='?' && !typing){
    event.preventDefault();
    openShortcutsHelp();
  }
  if(event.key==='Escape') closeShortcutsHelp();
  // WP-UX-003 — focus mode: Ctrl/Cmd+Shift+F toggles, Esc exits
  if((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase()==='f'){
    event.preventDefault();
    toggleFocusMode();
  }
  if(event.key==='Escape' && isFocusMode()){
    const modalOpen = !shortcutsHelpModal?.hidden || !deleteModal?.hidden || !accountModal?.hidden;
    if(!modalOpen){ event.preventDefault(); exitFocusMode(); }
  }
});
// ── WP-APP-005 — notebooks (minimal organize: sidebar list + filter + editor picker) ──
async function loadNotebooks(){
  if(offlineReadOnly){
    notebooks = Array.isArray(offlineSnapshot?.notebooks) ? offlineSnapshot.notebooks : [];
    renderNotebooks(); populateNbSelect(); return;
  }
  try{
    const res = await fetchWithAuth(API_BASE + '/api/notebooks', {method:'GET'});
    if(!res.ok) throw new Error(`Fetch failed ${res.status}`);
    const data = await res.json();
    notebooks = Array.isArray(data) ? data : [];
    await updateOfflineSnapshot({notebooks});
  }catch(e){ notebooks = []; }
  renderNotebooks();
  populateNbSelect();
}
function renderNotebooks(){
  if(!notebookListEl) return;
  notebookListEl.innerHTML = '';
  if(notebooks.length===0){
    const d = document.createElement('div');
    d.className = 'app-nb-empty';
    d.textContent = 'No notebooks yet';
    notebookListEl.appendChild(d);
    return;
  }
  notebooks.forEach(nb=>{
    const row = document.createElement('div');
    row.className = 'app-nb-item' + (currentNotebookId===nb.id && currentFilter==='active' ? ' is-active' : '');
    row.dataset.id = nb.id;
    row.innerHTML = `
      <button type="button" class="app-nb-open" title="Show notes in ${escapeHtml(nb.name)}">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 3.5h12a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1v-11a1 1 0 011-1zm2 4v6l2.5-1.8L11 13.5v-6H6z" fill="currentColor" opacity=".85"/></svg>
        <span class="app-nb-name">${escapeHtml(nb.name)}</span>
        <span class="app-nb-count">${Number(nb.noteCount)||0}</span>
      </button>
      <button type="button" class="app-nb-del" title="Delete notebook" aria-label="Delete notebook ${escapeHtml(nb.name)}">×</button>`;
    row.querySelector('.app-nb-open').addEventListener('click', ()=> selectNotebook(nb.id));
    const deleteControl = row.querySelector('.app-nb-del');
    if(offlineReadOnly) deleteControl.hidden = true;
    else deleteControl.addEventListener('click', ()=> confirmDeleteNotebook(row, nb));
    notebookListEl.appendChild(row);
  });
}
async function selectNotebook(id){
  if(currentNotebookId===id && currentFilter==='active') return;
  listAnimateNext = true; // WP-UI-NOTES-3D-001 — notebook filter context
  currentNotebookId = id;
  if(currentFilter!=='active') currentFilter='active'; // notebooks organize non-trashed notes
  setViewChrome('notes');
  setRouteHash('notes', true);
  updateNav();
  selectedId=null; titleInput.value='';
  if(editor) editor.commands.setContent(createEmptyDoc(), false);
  updateEditorForSelection(null);
  await loadNotes();
}
function confirmDeleteNotebook(row, nb){
  // Inline confirm (no alert()): swap the row into confirm mode
  row.classList.add('is-confirming');
  row.innerHTML = `
    <div class="app-nb-confirm">
      <div class="app-nb-confirm-text">Delete “${escapeHtml(nb.name)}”?<span>Notes are kept (unfiled).</span></div>
      <div class="app-nb-confirm-actions">
        <button type="button" class="app-nb-yes">Delete</button>
        <button type="button" class="app-nb-no">Cancel</button>
      </div>
    </div>`;
  row.querySelector('.app-nb-no').addEventListener('click', ()=> renderNotebooks());
  row.querySelector('.app-nb-yes').addEventListener('click', async ()=>{
    setError('');
    try{
      const res = await fetchWithAuth(API_BASE + `/api/notebooks/${nb.id}`, {method:'DELETE'});
      if(!res.ok){ const j=await res.json().catch(()=>({})); throw new Error(j.message || `Delete failed ${res.status}`); }
      if(currentNotebookId===nb.id) currentNotebookId=null;
      await loadNotebooks();
      updateNav();
      await loadNotes();
    }catch(e){ setError(e.message || 'Could not delete notebook'); renderNotebooks(); }
  });
}
function showNotebookForm(){
  if(!newNotebookForm) return;
  newNotebookForm.hidden = false;
  if(newNotebookErr) newNotebookErr.textContent = '';
  if(newNotebookInput){ newNotebookInput.value=''; newNotebookInput.focus(); }
}
function hideNotebookForm(){
  if(newNotebookForm) newNotebookForm.hidden = true;
  if(newNotebookErr) newNotebookErr.textContent='';
}
async function submitNotebook(){
  if(offlineReadOnly) return;
  const name = (newNotebookInput?.value || '').trim();
  if(!name){ if(newNotebookErr) newNotebookErr.textContent = 'Name your notebook.'; return; }
  if(newNotebookAdd) newNotebookAdd.disabled = true;
  try{
    const res = await fetchWithAuth(API_BASE + '/api/notebooks', {method:'POST', body: JSON.stringify({name})});
    const j = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(j.message || `Create failed ${res.status}`);
    hideNotebookForm();
    await loadNotebooks();
    if(j.id) selectNotebook(j.id); // jump straight into the new notebook
  }catch(e){ if(newNotebookErr) newNotebookErr.textContent = e.message || 'Could not create notebook'; }
  finally{ if(newNotebookAdd) newNotebookAdd.disabled = false; }
}
// Editor notebook picker: rebuild options (values synced in updateEditorForSelection)
function populateNbSelect(){
  if(!nbSelect) return;
  nbSelect.innerHTML = '<option value="">None</option>' + notebooks.map(nb=>`<option value="${nb.id}">${escapeHtml(nb.name)}</option>`).join('');
  const cur = notes.find(n=>n.id===selectedId);
  nbSelect.value = cur?.notebookId || '';
}
if(newNotebookBtn) newNotebookBtn.addEventListener('click', ()=>{ (newNotebookForm && !newNotebookForm.hidden) ? hideNotebookForm() : showNotebookForm(); });
if(newNotebookCancel) newNotebookCancel.addEventListener('click', hideNotebookForm);
if(newNotebookAdd) newNotebookAdd.addEventListener('click', submitNotebook);
if(newNotebookInput) newNotebookInput.addEventListener('keydown', (e)=>{
  if(e.key==='Enter') submitNotebook();
  if(e.key==='Escape') hideNotebookForm();
});
// Changing the editor dropdown saves notebookId immediately (explicit save)
if(nbSelect) nbSelect.addEventListener('change', async ()=>{
  if(!selectedId || nbSelect.disabled) return;
  setError('');
  try{
    const res = await fetchWithAuth(API_BASE + `/api/notes/${selectedId}`, {
      method:'PUT',
      body: JSON.stringify({ notebookId: nbSelect.value || null })
    });
    const j = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(j.message || `Move failed ${res.status}`);
    const idx = notes.findIndex(n=>n.id===selectedId);
    if(idx>=0) notes[idx] = j;
    markSaved();
    await loadNotebooks(); // sidebar counts
    await loadNotes();     // note may drop out of the active notebook filter
  }catch(e){ setError(e.message || 'Could not move note'); }
});

// ── WP-APP-006 — tags (minimal: sidebar list + filter + editor chips) ──
async function loadTags(){
  if(offlineReadOnly){
    tags = Array.isArray(offlineSnapshot?.tags) ? offlineSnapshot.tags : [];
    renderTags(); renderTagChips(notes.find(n=>n.id===selectedId) || null); return;
  }
  try{
    const res = await fetchWithAuth(API_BASE + '/api/tags', {method:'GET'});
    if(!res.ok) throw new Error(`Fetch failed ${res.status}`);
    const data = await res.json();
    tags = Array.isArray(data) ? data : [];
    await updateOfflineSnapshot({tags});
  }catch(e){ tags = []; }
  renderTags();
  const cur = notes.find(n=>n.id===selectedId);
  renderTagChips(cur || null); // add-select options may have changed
}
// WP-UX-004 — deterministic tag color: same tag name always gets the same hue
// (FNV-1a → 0..359). Skips the muddy green/brown band by remapping into a
// brighter arc so chips stay readable on the dark UI.
function tagHue(name){
  const s = String(name || '');
  let h = 2166136261;
  for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 360);
}
function renderTags(){
  if(!tagListEl) return;
  tagListEl.innerHTML = '';
  if(tags.length===0){
    const d = document.createElement('div');
    d.className = 'app-nb-empty';
    d.textContent = 'No tags yet';
    tagListEl.appendChild(d);
    return;
  }
  tags.forEach(t=>{
    const row = document.createElement('div');
    row.className = 'app-nb-item' + (currentTagId===t.id ? ' is-active' : '');
    row.dataset.id = t.id;
    row.style.setProperty('--tag-h', String(tagHue(t.name)));
    row.innerHTML = `
      <button type="button" class="app-nb-open" title="Show notes tagged #${escapeHtml(t.name)}">
        <span class="app-tag-hash" aria-hidden="true">#</span>
        <span class="app-nb-name">${escapeHtml(t.name)}</span>
        <span class="app-nb-count">${Number(t.noteCount)||0}</span>
      </button>
      <button type="button" class="app-nb-del" title="Delete tag" aria-label="Delete tag ${escapeHtml(t.name)}">×</button>`;
    row.querySelector('.app-nb-open').addEventListener('click', ()=> selectTag(t.id));
    const deleteControl = row.querySelector('.app-nb-del');
    if(offlineReadOnly) deleteControl.hidden = true;
    else deleteControl.addEventListener('click', ()=> confirmDeleteTag(row, t));
    tagListEl.appendChild(row);
  });
}
async function selectTag(id){
  // Clicking the active tag again clears the filter (toggle)
  listAnimateNext = true; // WP-UI-NOTES-3D-001 — tag filter context
  currentTagId = (currentTagId===id) ? null : id;
  setViewChrome('notes');
  setRouteHash('notes', true);
  updateNav();
  selectedId=null; titleInput.value='';
  if(editor) editor.commands.setContent(createEmptyDoc(), false);
  updateEditorForSelection(null);
  await loadNotes();
}
function confirmDeleteTag(row, tag){
  // Inline confirm (no alert()): swap the row into confirm mode
  row.classList.add('is-confirming');
  row.innerHTML = `
    <div class="app-nb-confirm">
      <div class="app-nb-confirm-text">Delete “${escapeHtml(tag.name)}”?<span>Notes are kept (tag removed).</span></div>
      <div class="app-nb-confirm-actions">
        <button type="button" class="app-nb-yes">Delete</button>
        <button type="button" class="app-nb-no">Cancel</button>
      </div>
    </div>`;
  row.querySelector('.app-nb-no').addEventListener('click', ()=> renderTags());
  row.querySelector('.app-nb-yes').addEventListener('click', async ()=>{
    setError('');
    try{
      const res = await fetchWithAuth(API_BASE + `/api/tags/${tag.id}`, {method:'DELETE'});
      if(!res.ok){ const j=await res.json().catch(()=>({})); throw new Error(j.message || `Delete failed ${res.status}`); }
      if(currentTagId===tag.id) currentTagId=null;
      // tag may still be cached on loaded notes — detach locally so chips/filters stay true
      notes.forEach(n=>{ n.tags = (n.tags||[]).filter(t=>t.id!==tag.id); });
      await loadTags();
      updateNav();
      await loadNotes();
    }catch(e){ setError(e.message || 'Could not delete tag'); renderTags(); }
  });
}
function showTagForm(){
  if(!newTagForm) return;
  newTagForm.hidden = false;
  if(newTagErr) newTagErr.textContent = '';
  if(newTagInput){ newTagInput.value=''; newTagInput.focus(); }
}
function hideTagForm(){
  if(newTagForm) newTagForm.hidden = true;
  if(newTagErr) newTagErr.textContent='';
}
async function submitTag(){
  if(offlineReadOnly) return;
  const name = (newTagInput?.value || '').trim();
  if(!name){ if(newTagErr) newTagErr.textContent = 'Name your tag.'; return; }
  if(newTagAdd) newTagAdd.disabled = true;
  try{
    const res = await fetchWithAuth(API_BASE + '/api/tags', {method:'POST', body: JSON.stringify({name})});
    const j = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(j.message || `Create failed ${res.status}`);
    hideTagForm();
    await loadTags();
    if(j.id) selectTag(j.id); // filter to the new tag (shows empty state)
  }catch(e){ if(newTagErr) newTagErr.textContent = e.message || 'Could not create tag'; }
  finally{ if(newTagAdd) newTagAdd.disabled = false; }
}
// How tags are set on a note: PUT replaces the note's whole tag set (atomic replace-set)
async function saveNoteTagIds(tagIds){
  if(!selectedId) return;
  setError('');
  const res = await fetchWithAuth(API_BASE + `/api/notes/${selectedId}`, {
    method:'PUT',
    body: JSON.stringify({ tagIds })
  });
  const j = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(j.message || `Tag update failed ${res.status}`);
  const idx = notes.findIndex(n=>n.id===selectedId);
  if(idx>=0) notes[idx] = j;
  markSaved();
  await loadTags();  // sidebar counts
  await loadNotes(); // note may drop out of the active tag filter
}
function renderTagChips(note){
  if(!tagRow || !tagChips) return;
  const show = !!note && !note.isTrashed;
  tagRow.hidden = !show;
  tagChips.innerHTML = '';
  if(!show) return;
  const noteTags = Array.isArray(note.tags) ? note.tags : [];
  noteTags.forEach(t=>{
    const chip = document.createElement('span');
    chip.className = 'app-chip';
    chip.style.setProperty('--tag-h', String(tagHue(t.name)));
    chip.innerHTML = `<span class="app-chip-hash" aria-hidden="true">#</span>${escapeHtml(t.name)}<button type="button" class="app-chip-x" title="Remove tag" aria-label="Remove tag ${escapeHtml(t.name)}">×</button>`;
    chip.querySelector('.app-chip-x').addEventListener('click', async ()=>{
      try{
        await saveNoteTagIds(noteTags.filter(x=>x.id!==t.id).map(x=>x.id));
      }catch(e){ setError(e.message || 'Could not update tags'); }
    });
    tagChips.appendChild(chip);
  });
  if(tagAddSelect){
    const used = new Set(noteTags.map(t=>t.id));
    const available = tags.filter(t=>!used.has(t.id));
    tagAddSelect.innerHTML = '<option value="">+ Tag</option>' + available.map(t=>`<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
    tagAddSelect.value = '';
  }
}
if(newTagBtn) newTagBtn.addEventListener('click', ()=>{ (newTagForm && !newTagForm.hidden) ? hideTagForm() : showTagForm(); });
if(newTagCancel) newTagCancel.addEventListener('click', hideTagForm);
if(newTagAdd) newTagAdd.addEventListener('click', submitTag);
if(newTagInput) newTagInput.addEventListener('keydown', (e)=>{
  if(e.key==='Enter') submitTag();
  if(e.key==='Escape') hideTagForm();
});
if(tagAddSelect) tagAddSelect.addEventListener('change', async ()=>{
  if(!selectedId || !tagAddSelect.value) { if(tagAddSelect) tagAddSelect.value=''; return; }
  const cur = notes.find(n=>n.id===selectedId);
  const ids = [...(cur?.tags || []).map(t=>t.id), tagAddSelect.value];
  tagAddSelect.value = '';
  try{ await saveNoteTagIds(ids); }catch(e){ setError(e.message || 'Could not add tag'); }
});

// ── WP-APP-007 — pin notes + sort control ──
// Pin/unpin via PUT { isPinned } (works from the list row pin and the editor action).
// The pinned state belongs to the note: it composes with search/notebook/tag filters and
// is preserved through trash/restore (a pinned note only surfaces at the top of the view
// it currently belongs to — pinned+trashed means "top of Trash", not "top of All Notes").
async function togglePin(id){
  if(offlineReadOnly) return;
  if(!id) return;
  const cur = notes.find(n=>n.id===id);
  if(!cur || cur.isTrashed) return; // pin is read-only for trashed notes
  setError('');
  const next = !cur.isPinned;
  try{
    const res = await fetchWithAuth(API_BASE + `/api/notes/${id}`, {
      method:'PUT',
      body: JSON.stringify({ isPinned: next })
    });
    const j = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(j.message || `Pin failed ${res.status}`);
    const idx = notes.findIndex(n=>n.id===id);
    if(idx>=0) notes[idx] = j;
    sortNotes(notes); // repin-aware re-order, then repaint
    renderList();
    // pinning the open note re-syncs the editor pin button without touching the editor content
    if(selectedId===id) updateEditorForSelection(notes.find(n=>n.id===id));
    setSaveStatus(next ? 'Pinned' : 'Unpinned', 'is-saved');
  }catch(e){
    setError(e.message || 'Could not update pin');
  }
}
if(pinBtn) pinBtn.addEventListener('click', ()=> togglePin(selectedId));
if(sortSelect) sortSelect.addEventListener('change', ()=>{
  listAnimateNext = true; // WP-UI-NOTES-3D-001 — sort changes the visible list context
  currentSort = sortSelect.value || 'updated';
  sortNotes(notes);
  renderList();
});

// ── WP-APP-004 — search wiring (debounced 300ms, no page reload) ──
function applySearch(value){
  listAnimateNext = true; // WP-UI-NOTES-3D-001 — debounced search context
  currentQuery = String(value ?? '');
  if(globalSearchInput) globalSearchInput.value=currentQuery;
  if(globalSearchClear) globalSearchClear.hidden=!currentQuery;
  if(searchClear) searchClear.hidden = !(searchInput && searchInput.value);
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(()=>{
    currentQuery = currentQuery.trim();
    loadNotes();
  }, 300);
}
function clearSearchNow(reload=true){
  const hadQuery = !!(currentQuery || searchInput?.value || globalSearchInput?.value);
  if(searchInput) searchInput.value = '';
  if(globalSearchInput) globalSearchInput.value = '';
  currentQuery = '';
  if(hadQuery) listAnimateNext = true; // WP-UI-NOTES-3D-001 — cleared search context
  clearTimeout(searchDebounce);
  if(searchClear) searchClear.hidden = true;
  if(globalSearchClear) globalSearchClear.hidden = true;
  if(reload) loadNotes();
}
if(searchInput){
  searchInput.addEventListener('input', ()=> applySearch(searchInput.value));
  searchInput.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ clearSearchNow(); } });
}
if(searchClear) searchClear.addEventListener('click', ()=>{ clearSearchNow(); if(searchInput) searchInput.focus(); });
if(clearSearchEmptyBtn) clearSearchEmptyBtn.addEventListener('click', ()=>{ clearSearchNow(); if(searchInput) searchInput.focus(); });

// ── WP-APP-010 — connectivity + PWA shell ──
function updateConnectivityUi(){
  if(offlineBanner) offlineBanner.hidden = !offlineReadOnly;
  document.body.classList.toggle('is-offline', offlineReadOnly);
  if(newBtn) newBtn.disabled = offlineReadOnly;
  if(newBtnEmpty) newBtnEmpty.disabled = offlineReadOnly;
  if(sidebarNewNote) sidebarNewNote.disabled = offlineReadOnly;
  if(homeNewNoteTop) homeNewNoteTop.disabled = offlineReadOnly;
  const homeCreate = document.getElementById('homeCreateNote');
  if(homeCreate) homeCreate.disabled = offlineReadOnly;
  if(scratchPad) scratchPad.disabled = offlineReadOnly;
  if(newNotebookBtn) newNotebookBtn.disabled = offlineReadOnly;
  if(newTagBtn) newTagBtn.disabled = offlineReadOnly;
  if(accountBtn) accountBtn.disabled = offlineReadOnly;
  if(offlineReadOnly && accountModal && !accountModal.hidden) closeAccountModal();
  renderNotebooks();
  renderTags();
  const selected = notes.find(note=>note.id===selectedId) || null;
  updateEditorForSelection(selected);
}
window.addEventListener('offline', async ()=>{
  offlineReadOnly = true;
  offlineSnapshot = await readOfflineSnapshot() || offlineSnapshot;
  updateConnectivityUi();
  loadCachedNotes();
});
window.addEventListener('online', async ()=>{
  offlineReadOnly = false;
  updateConnectivityUi();
  if(!memToken){ location.reload(); return; }
  await loadNotebooks();
  await loadTags();
  await loadNotes();
});
async function registerServiceWorker(){
  const local = ['localhost','127.0.0.1','::1'].includes(location.hostname);
  if(!('serviceWorker' in navigator) || (!window.isSecureContext && !local)) return;
  // Service workers can make E2E state persist between tests; the production
  // path is covered manually while webdriver runs the unchanged network path.
  if(navigator.webdriver) return;
  try{ await navigator.serviceWorker.register('/sw.js', {scope:'/'}); }catch(e){ console.warn('Service worker registration failed', e); }
}

// ── WP-AUTH-004 — account export + permanent deletion ──
async function loadUsage(){
  if(!usageStats) return;
  usageStats.textContent = 'Loading usage…';
  try{
    const [usageRes, healthRes] = await Promise.all([
      fetchWithAuth(API_BASE + '/api/users/me/usage', {method:'GET'}),
      fetch(API_BASE + '/api/health', {method:'GET'}).catch(()=>null)
    ]);
    const data = await usageRes.json().catch(()=>({}));
    if(!usageRes.ok) throw new Error(data.message || 'Could not load usage');
    let healthData = null;
    try{ healthData = healthRes && healthRes.ok ? await healthRes.json() : null; }catch{}
    const notes = data.notes || {};
    const attach = data.attachments || {};
    const mb = (bytes)=> (bytes/1024/1024).toFixed(1);
    const notesPct = Math.min(100, ((notes.count||0)/(notes.quota||5000))*100);
    const storagePct = Math.min(100, ((attach.storageBytes||0)/(attach.storageQuota||262144000))*100);
    const bar = (pct, color) => `<div style="height:6px; background:#eee; border-radius:3px; overflow:hidden; margin:4px 0 8px;"><div style="height:100%; width:${pct}%; background:${color}; transition:width 0.3s;"></div></div>`;
    const provider = healthData?.storage?.provider || 'local';
    const sec = healthData?.security || {};
    usageStats.innerHTML = `
      <div style="font-weight:600;">Notes: ${notes.count||0} / ${notes.quota||5000}</div>
      ${bar(notesPct, notesPct>90?'#E53E3E':notesPct>70?'#DD6B20':'#00A82D')}
      <div>Notebooks: ${data.notebooks?.count||0} · Tags: ${data.tags?.count||0} · Sessions: ${data.sessions?.count||0}</div>
      <div style="margin-top:8px; font-weight:600;">Images: ${attach.count||0} · Storage: ${mb(attach.storageBytes||0)} MB / ${mb(attach.storageQuota||262144000)} MB (${escapeHtml(provider)})</div>
      ${bar(storagePct, storagePct>90?'#E53E3E':storagePct>70?'#DD6B20':'#00A82D')}
      <div style="font-size:11px; color:#666; margin-top:6px;">Security: ${sec.tokenVersioning?'tv✓':''} ${sec.deviceInventory?'sessions✓':''} ${sec.passwordPolicy?'pw✓':''} ${sec.cleanupJob?'cleanup✓':''}</div>
    `;
  }catch(e){
    usageStats.textContent = e.message || 'Could not load usage';
  }
}

async function loadSessions(){
  if(!sessionsList) return;
  sessionsList.innerHTML = '<div style="font-size:13px; color:#666;">Loading sessions…</div>';
  try{
    const res = await fetchWithAuth(API_BASE + '/api/auth/sessions', {method:'GET'});
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.message || 'Could not load sessions');
    const sessions = data.sessions || [];
    sessionsList.innerHTML = '';
    if(!sessions.length){
      sessionsList.innerHTML = '<div style="font-size:13px; color:#666;">No active sessions</div>';
      return;
    }
    sessions.forEach(s=>{
      const row = document.createElement('div');
      row.style.cssText = 'border:1px solid #e5e5e5; border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center; gap:8px;';
      const uaRaw = s.userAgent ? String(s.userAgent) : '';
      const ua = uaRaw ? uaRaw.slice(0,80) : 'Unknown device';
      const ip = s.ipAddress || '—';
      const when = s.lastActiveAt ? new Date(s.lastActiveAt).toLocaleString() : '';
      // Simple device type icon from UA
      const isMobile = /Mobile|Android|iPhone|iPad/i.test(uaRaw);
      const isChrome = /Chrome/i.test(uaRaw);
      const isFirefox = /Firefox/i.test(uaRaw);
      const isSafari = /Safari/i.test(uaRaw) && !isChrome;
      let icon = '💻';
      if(isMobile) icon = '📱';
      else if(isFirefox) icon = '🦊';
      else if(isChrome) icon = '🌐';
      else if(isSafari) icon = '🧭';
      row.innerHTML = `
        <div style="flex:1; min-width:0; display:flex; gap:8px; align-items:center;">
          <span style="font-size:18px;">${icon}</span>
          <div style="flex:1; min-width:0;">
            <div style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(ua)} ${s.isCurrent?'<span style="color:#00A82D;">(current)</span>':''}</div>
            <div style="font-size:11px; color:#666;">${escapeHtml(ip)} · ${escapeHtml(when)} · ${escapeHtml(s.id.slice(0,8))}…</div>
          </div>
        </div>
        <button type="button" data-family="${escapeHtml(s.id)}" style="height:32px; padding:0 10px; border-radius:6px; border:1px solid #d93025; color:#d93025; background:#fff; font-size:12px; ${s.isCurrent?'opacity:0.6;':''}" ${s.isCurrent?'disabled title="Current session"':'title="Revoke this session"'}>${s.isCurrent?'Current':'Revoke'}</button>
      `;
      const btn = row.querySelector('button');
      if(btn && !s.isCurrent){
        btn.addEventListener('click', async ()=>{
          btn.disabled = true; btn.textContent = 'Revoking…';
          try{
            const r = await fetchWithAuth(API_BASE + `/api/auth/sessions/${encodeURIComponent(s.id)}`, {method:'DELETE'});
            const j = await r.json().catch(()=>({}));
            if(!r.ok) throw new Error(j.message || 'Revoke failed');
            await loadSessions();
            await loadUsage();
            setError('');
            if(accountStatus) accountStatus.textContent = 'Session revoked';
          }catch(e){
            setError(e.message || 'Could not revoke');
            btn.disabled = false; btn.textContent = 'Revoke';
          }
        });
      }
      sessionsList.appendChild(row);
    });
  }catch(e){
    sessionsList.innerHTML = `<div style="font-size:13px; color:#d93025;">${escapeHtml(e.message || 'Could not load sessions')}</div>`;
  }
}

function openAccountModal(){
  if(!accountModal) return;
  accountModal.hidden = false;
  if(accountStatus) accountStatus.textContent = '';
  if(deleteAccountConfirm) deleteAccountConfirm.value = '';
  if(deleteAccountBtn) deleteAccountBtn.disabled = true;
  exportDataBtn?.focus();
  loadUsage();
  loadSessions();
  loadPlan(); // WP-BILLING-001
}

// -- WP-BILLING-001 — plan summary + Stripe checkout/portal -------------------
function formatMb(bytes){
  const n = Number(bytes) || 0;
  return n >= 1024 * 1024 * 1024 ? `${Math.round(n / (1024 * 1024 * 1024))} GB` : `${Math.round(n / (1024 * 1024))} MB`;
}

async function loadPlan(){
  if(!planSummary || !upgradeBtn) return;
  planSummary.textContent = 'Loading plan…';
  upgradeBtn.hidden = true;
  manageBillingBtn.hidden = true;
  try{
    const res = await fetchWithAuth(API_BASE + '/api/billing', { method: 'GET' });
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.message || 'Could not load plan');
    const isPro = data.plan === 'pro';
    const active = data.status == null || ['active','trialing'].includes(String(data.status));
    const ent = data.entitlements || {};
    if(isPro){
      const renews = data.renewsAt ? new Date(data.renewsAt).toLocaleDateString() : '';
      const label = active
        ? `Notin Pro — active${renews ? ` · renews ${renews}` : ''}`
        : `Notin Pro — ${data.status || 'paused'} · renew payment to restore Pro limits`;
      planSummary.innerHTML = `<div style="font-weight:600; color:${active ? '#00A82D' : '#DD6B20'};">${escapeHtml(label)}</div>
        <div style="margin-top:4px;">${formatMb(ent.storageQuota)} image storage · ${Number(ent.maxNotes||0).toLocaleString()} notes · ${ent.aiChatPer15Min||0} AI chats / 15 min</div>`;
      upgradeBtn.hidden = true;
      manageBillingBtn.hidden = !data.configured;
    }else{
      planSummary.innerHTML = `<div style="font-weight:600;">Free plan</div>
        <div style="margin-top:4px;">${formatMb(ent.storageQuota)} image storage · ${Number(ent.maxNotes||0).toLocaleString()} notes · ${ent.aiChatPer15Min||0} AI chats / 15 min</div>`;
      upgradeBtn.hidden = !data.configured;
      upgradeBtn.disabled = !data.configured;
      upgradeBtn.title = data.configured ? 'Upgrade to Notin Pro' : 'Billing is not set up on this deployment';
      manageBillingBtn.hidden = true;
      if(!data.configured && accountStatus) accountStatus.textContent = 'Online billing isn\u2019t set up on this deployment yet.';
    }
  }catch(e){
    planSummary.textContent = e.message || 'Could not load plan';
  }
}

async function startCheckout(){
  if(!upgradeBtn) return;
  upgradeBtn.disabled = true;
  const prev = upgradeBtn.textContent;
  upgradeBtn.textContent = 'Opening checkout…';
  try{
    const res = await fetchWithAuth(API_BASE + '/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'pro' }),
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.message || 'Could not start checkout');
    if(!data.url) throw new Error('Checkout did not return a payment link');
    window.location.assign(data.url); // Stripe-hosted payment page
  }catch(e){
    if(accountStatus) accountStatus.textContent = e.message || 'Could not start checkout';
    upgradeBtn.disabled = false;
    upgradeBtn.textContent = prev;
  }
}

async function openPortal(){
  if(!manageBillingBtn) return;
  manageBillingBtn.disabled = true;
  const prev = manageBillingBtn.textContent;
  manageBillingBtn.textContent = 'Opening…';
  try{
    const res = await fetchWithAuth(API_BASE + '/api/billing/portal', { method: 'POST' });
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.message || 'Could not open the billing portal');
    if(!data.url) throw new Error('Portal did not return a link');
    window.location.assign(data.url);
  }catch(e){
    if(accountStatus) accountStatus.textContent = e.message || 'Could not open the billing portal';
    manageBillingBtn.disabled = false;
    manageBillingBtn.textContent = prev;
  }
}

// Post-checkout return: the WEBHOOK flips the plan server-side, so the redirect
// alone proves nothing — the toast stays honest about the async activation.
function handleBillingReturnParams(){
  try{
    const params = new URLSearchParams(location.search);
    const state = params.get('billing');
    if(!state) return;
    history.replaceState(null, '', location.pathname); // clean the address bar
    if(state === 'success') showToast('Payment received \u2014 Pro unlocks automatically within a minute. No need to wait here.');
    else if(state === 'canceled') showToast('Checkout canceled \u2014 you were not charged.');
    else if(state === 'portal') showToast('Billing changes can take a moment to appear.');
  }catch{}
}
function closeAccountModal(){
  if(accountModal) accountModal.hidden = true;
  if(accountStatus) accountStatus.textContent = '';
  if(deleteAccountConfirm) deleteAccountConfirm.value = '';
  if(deleteAccountBtn) deleteAccountBtn.disabled = true;
}
if(accountBtn) accountBtn.addEventListener('click', ()=> goToView('account'));
// WP-BILLING-001 — checkout/portal entry points
if(upgradeBtn) upgradeBtn.addEventListener('click', ()=> startCheckout());
if(manageBillingBtn) manageBillingBtn.addEventListener('click', ()=> openPortal());
if(accountModalClose) accountModalClose.addEventListener('click', ()=> goToView('home'));
if(accountModalBackdrop) accountModalBackdrop.addEventListener('click', ()=> goToView('home'));
if(deleteAccountConfirm) deleteAccountConfirm.addEventListener('input', ()=>{
  if(deleteAccountBtn) deleteAccountBtn.disabled = deleteAccountConfirm.value !== 'DELETE';
  if(accountStatus) accountStatus.textContent = '';
});
if(exportDataBtn) exportDataBtn.addEventListener('click', async ()=>{
  exportDataBtn.disabled = true;
  if(accountStatus) accountStatus.textContent = 'Preparing export…';
  try{
    const res = await fetchWithAuth(API_BASE + '/api/users/me/export', {method:'GET'});
    if(!res.ok){ const j=await res.json().catch(()=>({})); throw new Error(j.message || `Export failed ${res.status}`); }
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') || '';
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'notin-export.json';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(()=> URL.revokeObjectURL(url), 1000);
    if(accountStatus) accountStatus.textContent = 'Export downloaded';
  }catch(e){
    if(accountStatus) accountStatus.textContent = e.message || 'Could not export data';
  }finally{ exportDataBtn.disabled = false; }
});
if(refreshSessionsBtn) refreshSessionsBtn.addEventListener('click', ()=>{ loadSessions(); loadUsage(); });
if(revokeOthersBtn) revokeOthersBtn.addEventListener('click', async ()=>{
  revokeOthersBtn.disabled = true;
  revokeOthersBtn.textContent = 'Revoking…';
  if(accountStatus) accountStatus.textContent = 'Revoking other sessions…';
  try{
    const res = await fetchWithAuth(API_BASE + '/api/auth/sessions/revoke-others', {method:'POST'});
    const j = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(j.message || 'Could not revoke');
    await loadSessions();
    await loadUsage();
    if(accountStatus) accountStatus.textContent = `Revoked ${j.revokedCount||0} other session(s)`;
  }catch(e){
    if(accountStatus) accountStatus.textContent = e.message || 'Could not revoke other sessions';
  }finally{
    revokeOthersBtn.disabled = false;
    revokeOthersBtn.textContent = 'Revoke all other sessions';
  }
});
if(deleteAccountBtn) deleteAccountBtn.addEventListener('click', async ()=>{
  if(deleteAccountConfirm?.value !== 'DELETE') return;
  deleteAccountBtn.disabled = true;
  if(exportDataBtn) exportDataBtn.disabled = true;
  if(accountStatus) accountStatus.textContent = 'Deleting account and files…';
  try{
    const res = await fetchWithAuth(API_BASE + '/api/users/me', {
      method:'DELETE',
      body: JSON.stringify({confirm:'DELETE'}),
    });
    if(!res.ok){ const j=await res.json().catch(()=>({})); throw new Error(j.message || `Delete failed ${res.status}`); }
    await deleteOfflineSnapshot();
    memToken = null;
    currentUserId = null;
    try{ sessionStorage.removeItem('notin_email'); sessionStorage.removeItem('notin_offline_user_id'); }catch{}
    redirectToLogin();
  }catch(e){
    if(accountStatus) accountStatus.textContent = e.message || 'Could not delete account';
    deleteAccountBtn.disabled = deleteAccountConfirm?.value !== 'DELETE';
    if(exportDataBtn) exportDataBtn.disabled = false;
  }
});
document.addEventListener('keydown', (e)=>{
  if(e.key==='Escape' && accountModal && !accountModal.hidden) goToView('home');
});

if(logoutBtn) logoutBtn.addEventListener('click', async ()=>{
  try{ await fetch(API_BASE + '/api/auth/logout', {method:'POST', credentials:'include', headers: csrfHeaders()}); }catch{}
  try{ await fetch(API_BASE + '/auth/logout', {method:'POST', credentials:'include', headers: csrfHeaders()}); }catch{}
  memToken = null;
  currentUserId = null;
  try{ sessionStorage.removeItem('notin_email'); sessionStorage.removeItem('notin_offline_user_id'); }catch{}
  redirectToLogin();
});
if(mobileBack){
  mobileBack.addEventListener('click', ()=>{
    if(layout){ layout.classList.remove('is-editor'); layout.classList.add('is-list'); }
  });
}

// Init
initEditor();
registerServiceWorker();
(async ()=>{
  const email = getEmail();
  if(emailEl){
    emailEl.textContent = email || '—';
    emailEl.title = email || '';
  }
  const identity = (email || 'Notin user').split('@')[0];
  if(appAvatar) appAvatar.textContent = (email || 'N').trim().charAt(0).toUpperCase();
  if(appUserName) appUserName.textContent = identity || 'Account';
  if(homeGreeting) homeGreeting.textContent = email ? `Welcome back, ${identity}.` : 'Welcome back.';
  const tok = await bootstrapToken();
  if(!tok){
    if(!navigator.onLine){
      try{ currentUserId = sessionStorage.getItem('notin_offline_user_id'); }catch{}
      offlineSnapshot = await readOfflineSnapshot();
      offlineReadOnly = true;
      notebooks = Array.isArray(offlineSnapshot?.notebooks) ? offlineSnapshot.notebooks : [];
      tags = Array.isArray(offlineSnapshot?.tags) ? offlineSnapshot.tags : [];
      updateConnectivityUi();
      currentView = routeFromHash();
      if(!location.hash) setRouteHash('home', true);
      setViewChrome(currentView);
      updateNav();
      loadCachedNotes();
      if(currentView==='home') renderHome();
      if(currentView==='shortcuts') renderShortcuts();
      if(currentView==='notebooks' || currentView==='tags') renderOrganizeView();
      if(currentView==='tasks') renderTasks();
      if(currentView==='templates') renderTemplates();
      if(!currentUserId || !offlineSnapshot) setError('No saved notes are available for this offline session. Reconnect to sign in.');
      routeReady = true;
      return;
    }
    redirectToLogin();
    return;
  }
  currentUserId = userIdFromToken(tok);
  if(currentUserId){
    try{ sessionStorage.setItem('notin_offline_user_id', currentUserId); }catch{}
    offlineSnapshot = await readOfflineSnapshot(currentUserId);
  }
  offlineReadOnly = false;
  updateConnectivityUi();
  updateEditorDisabled(true);
  await loadNotebooks(); // WP-APP-005 — sidebar notebooks
  await loadTags();      // WP-APP-006 — sidebar tags
  if(!location.hash) setRouteHash('home', true);
  currentView = routeFromHash();
  await applyRoute(currentView);
  await updateCounts();
  initScratchPad();
  renderHome();
  routeReady = true;
  handleClipParams(); // WP-CLIP-001 — bookmarklet intake (after boot, token ready)
  handleBillingReturnParams(); // WP-BILLING-001 — post-checkout return toast
})();
window.addEventListener('hashchange', ()=>{
  // WP-CLIP-001 — a bookmarklet landing on an already-open app is a
  // same-document navigation: only hashchange fires, boot never re-runs.
  if(routeReady && location.hash.startsWith('#clip')){ handleClipParams(); return; }
  if(routeReady) applyRoute(routeFromHash());
});

try{
  const has = Object.keys(localStorage).some(k=> /token/i.test(k) && localStorage.getItem(k)?.startsWith('eyJ'));
  if(has) console.warn('localStorage contains token — should be memory only');
}catch{}

// WP-UI-NOTES-3D-001 — pointer tilt engine
(()=>{
  if(!finePointerQuery.matches || reducedMotionQuery.matches) return;

  let activeElement = null;
  let pointerX = 0;
  let pointerY = 0;
  let frameId = 0;

  function resetTilt(){
    if(frameId){ cancelAnimationFrame(frameId); frameId = 0; }
    if(!activeElement) return;
    activeElement.classList.remove('is-tilting');
    activeElement.style.transform = '';
    activeElement = null;
  }

  function applyTilt(){
    frameId = 0;
    if(!activeElement) return;
    const rect = activeElement.getBoundingClientRect();
    if(!rect.width || !rect.height) return;
    const px = (pointerX - rect.left) / rect.width - 0.5;
    const py = (pointerY - rect.top) / rect.height - 0.5;
    activeElement.style.transform = `perspective(700px) rotateX(${(-py*5).toFixed(2)}deg) rotateY(${(px*5).toFixed(2)}deg) translateY(-2px)`;
  }

  function onPointerMove(event){
    if(reducedMotionQuery.matches){ resetTilt(); return; }
    const next = event.target?.closest?.('.tilt-3d') || null;
    if(!next) return;
    if(next !== activeElement){
      resetTilt();
      activeElement = next;
      activeElement.classList.add('is-tilting');
    }
    pointerX = event.clientX;
    pointerY = event.clientY;
    if(frameId) cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(applyTilt);
  }

  function onPointerOut(event){
    const leaving = event.target?.closest?.('.tilt-3d') || null;
    const stillInside = event.relatedTarget instanceof Node && leaving?.contains(event.relatedTarget);
    if(!leaving || leaving !== activeElement || stillInside) return;
    resetTilt();
  }

  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerout', onPointerOut);
  document.addEventListener('pointercancel', resetTilt);
  window.addEventListener('blur', resetTilt);
  reducedMotionQuery.addEventListener('change', resetTilt);
})();

// ============================================================================
// WP-FEATURES � capture, multimedia, bi-directional links, graph, global AI
// ============================================================================

// -- WP-CAPTURE-001 � Quick Add (Ctrl+Alt+N): thought ? note in one keystroke -
const quickAddModal = document.getElementById('quickAddModal');
const quickAddBackdrop = document.getElementById('quickAddBackdrop');
const quickAddInput = document.getElementById('quickAddInput');
function openQuickAdd(){
  if(offlineReadOnly){ setSaveStatus('Offline \u00b7 read only','is-error'); return; }
  if(!quickAddModal) return;
  quickAddModal.hidden = false;
  if(quickAddInput){ quickAddInput.value = ''; quickAddInput.focus(); }
}
function closeQuickAdd(){ if(quickAddModal) quickAddModal.hidden = true; }
async function submitQuickAdd(){
  const text = String(quickAddInput?.value || '').trim();
  if(!text) { closeQuickAdd(); return; }
  const firstLine = text.split('\n')[0].slice(0, 80);
  const title = firstLine.length > 60 ? firstLine.slice(0, 57) + '\u2026' : firstLine;
  setError('');
  try{
    const res = await fetchWithAuth(API_BASE + '/api/notes', {
      method:'POST',
      body: JSON.stringify({ title, contentText: text, description: text }),
    });
    const created = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(created.message || 'Could not create note');
    closeQuickAdd();
    setViewChrome('notes');
    setRouteHash('notes', true);
    notes.unshift(created);
    renderList();
    selectNote(created.id);
    markSaved();
    updateCounts();
    // Instant capture: cursor lands in the body, ready to expand the thought
    if(editor) setTimeout(()=> editor.commands.focus('end'), 60);
    showToast('Note captured');
  }catch(e){ setError(e.message || 'Quick add failed'); }
}
if(quickAddBackdrop) quickAddBackdrop.addEventListener('click', closeQuickAdd);
if(quickAddInput) quickAddInput.addEventListener('keydown', (e)=>{
  if(e.key==='Enter'){ e.preventDefault(); submitQuickAdd(); }
  if(e.key==='Escape') closeQuickAdd();
});

// -- WP-MEDIA-001 � PDF picker + audio recorder + sketch pad ------------------
const attachPdfBtn = document.getElementById('attachPdfBtn');
const attachPdfInput = document.createElement('input');
attachPdfInput.type = 'file';
attachPdfInput.accept = 'application/pdf';
attachPdfInput.hidden = true;
document.body.appendChild(attachPdfInput);
if(attachPdfBtn) attachPdfBtn.addEventListener('click', ()=> attachPdfInput.click());
if(attachPdfInput) attachPdfInput.addEventListener('change', async ()=>{
  const files = [...(attachPdfInput.files || [])];
  attachPdfInput.value = '';
  await uploadNoteImages(files);
});

const recordAudioBtn = document.getElementById('recordAudioBtn');
let mediaRecorder = null;
let mediaChunks = [];
let mediaStream = null;
if(recordAudioBtn) recordAudioBtn.addEventListener('click', async ()=>{
  if(mediaRecorder && mediaRecorder.state === 'recording'){
    mediaRecorder.stopAt = Date.now();
    mediaRecorder.stop(); // second click stops + saves
    return;
  }
  if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined'){
    showToast('Audio recording is not supported in this browser');
    return;
  }
  const cur = notes.find(n=>n.id===selectedId);
  if(offlineReadOnly || !cur || cur.isTrashed) return;
  try{
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }catch{ showToast('Microphone permission denied'); return; }
  mediaChunks = [];
  const mimeCandidates = ['audio/webm;codecs=opus','audio/webm','audio/mp4'];
  const mimeType = mimeCandidates.find((m)=> MediaRecorder.isTypeSupported(m)) || '';
  mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
  mediaRecorder.ondataavailable = (e)=>{ if(e.data && e.data.size) mediaChunks.push(e.data); };
  mediaRecorder.onstop = async ()=>{
    mediaStream?.getTracks().forEach((t)=> t.stop());
    const blob = new Blob(mediaChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
    const durationSec = Math.max(1, Math.round(((mediaRecorder.stopAt || Date.now()) - mediaRecorder.startAt) / 1000));
    mediaRecorder = null;
    if(blob.size < 100){ showToast('Recording was too short'); return; }
    const ext = (mediaRecorder.mimeType || 'audio/webm').includes('mp4') ? 'm4a' : 'webm';
    const file = new File([blob], `recording-${Date.now()}.${ext}`, { type: blob.type });
    if(recordAudioBtn){ recordAudioBtn.textContent = '\ud83c\udf99 Record'; recordAudioBtn.classList.remove('is-recording'); }
    if(attachmentStatus) attachmentStatus.textContent = 'Transcribing\u2026';
    const form = new FormData();
    form.append('audio', file);
    form.append('durationSec', String(durationSec));
    try{
      const res = await fetchWithAuth(API_BASE + `/api/notes/${selectedId}/transcribe`, { method:'POST', body: form });
      const j = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(j.message || 'Transcription failed');
      await loadAttachments(notes.find(n=>n.id===selectedId) || cur);
      // Pull the server-appended transcript into the open editor
      const fresh = await fetchWithAuth(API_BASE + '/api/notes', { method:'GET' });
      if(fresh.ok){
        const data = await fresh.json().catch(()=>[]);
        const items = Array.isArray(data) ? data : (data.items || []);
        const updated = items.find((n)=> n.id===selectedId);
        if(updated){
          const idx = notes.findIndex((n)=> n.id===selectedId);
          if(idx>=0) notes[idx] = updated;
          if(editor) editor.commands.setContent(docFromNote(updated), false);
        }
      }
      showToast(j.provider === 'groq' ? 'Transcribed with Whisper' : 'Recording saved (mock transcript \u2014 set GROQ_API_KEY for real transcription)');
    }catch(e){
      showToast(e.message || 'Transcription failed');
      if(attachmentStatus) attachmentStatus.textContent = '';
      if(recordAudioBtn){ recordAudioBtn.textContent = '\ud83c\udf99 Record'; recordAudioBtn.classList.remove('is-recording'); }
    }
  };
  mediaRecorder.startAt = Date.now();
  mediaRecorder.start();
  mediaRecorder.stopAt = Date.now(); // refreshed just before .stop() below
  if(recordAudioBtn){ recordAudioBtn.textContent = '\u23f8 Stop'; recordAudioBtn.classList.add('is-recording'); }
  showToast('Recording\u2026 click again to stop & transcribe');
});

// Sketch pad
const sketchBtn = document.getElementById('sketchBtn');
const sketchModal = document.getElementById('sketchModal');
const sketchBackdrop = document.getElementById('sketchBackdrop');
const sketchCanvas = document.getElementById('sketchCanvas');
const sketchColor = document.getElementById('sketchColor');
const sketchSize = document.getElementById('sketchSize');
const sketchClearBtn = document.getElementById('sketchClear');
const sketchCloseBtn = document.getElementById('sketchClose');
const sketchSaveBtn = document.getElementById('sketchSave');
let sketchDrawing = false;
function openSketch(){
  if(offlineReadOnly || !selectedId){ showToast('Open a note to sketch'); return; }
  if(sketchModal) sketchModal.hidden = false;
  if(sketchCanvas){
    const ctx = sketchCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sketchCanvas.width, sketchCanvas.height);
  }
}
function closeSketch(){ if(sketchModal) sketchModal.hidden = true; }
function sketchPos(e){
  const r = sketchCanvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (sketchCanvas.width / r.width), y: (e.clientY - r.top) * (sketchCanvas.height / r.height) };
}
if(sketchCanvas){
  sketchCanvas.addEventListener('pointerdown', (e)=>{
    sketchDrawing = true;
    const ctx = sketchCanvas.getContext('2d');
    const p = sketchPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  });
  sketchCanvas.addEventListener('pointermove', (e)=>{
    if(!sketchDrawing) return;
    const ctx = sketchCanvas.getContext('2d');
    const p = sketchPos(e);
    ctx.strokeStyle = sketchColor?.value || '#222';
    ctx.lineWidth = Number(sketchSize?.value || 4);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });
  ['pointerup','pointerleave'].forEach((ev)=> sketchCanvas.addEventListener(ev, ()=>{ sketchDrawing = false; }));
}
if(sketchBtn) sketchBtn.addEventListener('click', openSketch);
if(sketchBackdrop) sketchBackdrop.addEventListener('click', closeSketch);
if(sketchCloseBtn) sketchCloseBtn.addEventListener('click', closeSketch);
if(sketchClearBtn) sketchClearBtn.addEventListener('click', ()=>{
  if(!sketchCanvas) return;
  const ctx = sketchCanvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sketchCanvas.width, sketchCanvas.height);
});
if(sketchSaveBtn) sketchSaveBtn.addEventListener('click', ()=>{
  if(!sketchCanvas) return;
  sketchCanvas.toBlob(async (blob)=>{
    if(!blob) return;
    closeSketch();
    const file = new File([blob], `sketch-${Date.now()}.png`, { type: 'image/png' });
    await uploadNoteImages([file]);
  }, 'image/png');
});

// -- WP-LINKS-001 � [[ note links: picker, insert, backlinks panel ------------
const wikiPicker = document.getElementById('wikiPicker');
const wikiPickerList = document.getElementById('wikiPickerList');
let wikiRange = null; // { from, to } of the active [[query
let wikiItems = [];
let wikiActive = -1;
function hideWikiPicker(){ if(wikiPicker) wikiPicker.hidden = true; wikiRange = null; wikiItems = []; wikiActive = -1; }
function renderWikiPicker(){
  if(!wikiPickerList) return;
  wikiPickerList.innerHTML = '';
  wikiItems.forEach((n, i)=>{
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'option');
    item.className = 'app-wikilink-item' + (i===wikiActive ? ' is-active' : '');
    item.innerHTML = `<strong>${escapeHtml(n.title || 'Untitled')}</strong><span>${escapeHtml(formatDate(n.updatedAt || n.createdAt))}</span>`;
    item.addEventListener('mousedown', (e)=>{ e.preventDefault(); insertWikiLink(n); });
    wikiPickerList.appendChild(item);
  });
  if(wikiPicker){
    wikiPicker.hidden = wikiItems.length === 0;
    // park the picker at the caret
    try{
      if(editor && wikiRange){
        const coords = editor.view.coordsAtPos(wikiRange.from);
        const host = editor.view.dom.closest('.app-editor') || document.body;
        const hostRect = host.getBoundingClientRect();
        wikiPicker.style.left = `${Math.max(8, coords.left - hostRect.left)}px`;
        wikiPicker.style.top = `${Math.min(hostRect.height - 180, coords.bottom - hostRect.top + 6)}px`;
      }
    }catch{ /* keep default position */ }
  }
}
function insertWikiLink(n){
  if(!editor || !wikiRange) return;
  const label = `[[${n.title || 'Untitled'}]]`;
  editor.chain().focus()
    .insertContentAt({ from: wikiRange.from, to: wikiRange.to }, label)
    .run();
  hideWikiPicker();
}
// Wired into the editor's onUpdate path (patched into onEditorUpdate below).
function updateWikiPicker(){
  if(!editor || !wikiPicker){ return; }
  const state = editor.state.selection ? editor.state : null;
  if(!state) { hideWikiPicker(); return; }
  const from = state.selection.from;
  const textBefore = state.doc.textBetween(Math.max(0, from - 80), from, '\n', '\u0000');
  const open = textBefore.lastIndexOf('[[');
  if(open === -1){ hideWikiPicker(); return; }
  const query = textBefore.slice(open + 2);
  if(/[\]\n]/.test(query)){ hideWikiPicker(); return; } // closed or multiline � not a link
  wikiRange = { from: from - query.length - 2, to: from }; // include the opening [[
  const lower = query.toLowerCase();
  wikiItems = notes
    .filter((n)=> !n.isTrashed && n.id !== selectedId)
    .filter((n)=> (n.title || 'untitled').toLowerCase().includes(lower))
    .slice(0, 6);
  wikiActive = wikiItems.length ? 0 : -1;
  renderWikiPicker();
}
// (hooked into onEditorUpdate below)
// Keyboard control while the [[ picker is open (capture — beats editor Enter)
document.addEventListener('keydown', (e)=>{
  if(!wikiPicker || wikiPicker.hidden || !wikiItems.length) return;
  if(e.key==='ArrowDown'){ e.preventDefault(); wikiActive = (wikiActive + 1) % wikiItems.length; renderWikiPicker(); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); wikiActive = (wikiActive - 1 + wikiItems.length) % wikiItems.length; renderWikiPicker(); }
  else if(e.key==='Enter'){ e.preventDefault(); if(wikiActive >= 0) insertWikiLink(wikiItems[wikiActive]); }
  else if(e.key==='Escape'){ e.preventDefault(); hideWikiPicker(); }
}, true);

// Backlinks panel � linked mentions of the open note
const backlinksPanel = document.getElementById('backlinksPanel');
const backlinksList = document.getElementById('backlinksList');
const backlinksCount = document.getElementById('backlinksCount');
function updateBacklinks(){
  if(!backlinksPanel) return;
  const cur = notes.find((n)=> n.id===selectedId);
  const title = (cur?.title || '').trim();
  if(!cur || !title || cur.isTrashed){ backlinksPanel.hidden = true; return; }
  const needle = `[[${title.toLowerCase()}]]`;
  const outgoingNeedles = [...String(plainFromNote(cur)).matchAll(/\[\[([^\]]+)\]\]/g)].map((m)=> m[1].toLowerCase());
  const incoming = notes.filter((n)=> n.id!==cur.id && !n.isTrashed && String(plainFromNote(n)).toLowerCase().includes(needle));
  const outgoing = notes.filter((n)=> n.id!==cur.id && !n.isTrashed && outgoingNeedles.includes((n.title || '').toLowerCase()));
  const rows = [
    ...incoming.map((n)=> ({ n, kind: 'mentioned by' })),
    ...outgoing.map((n)=> ({ n, kind: 'links to' })),
  ];
  backlinksPanel.hidden = rows.length === 0;
  if(backlinksCount) backlinksCount.textContent = rows.length ? String(rows.length) : '';
  if(!backlinksList) return;
  backlinksList.innerHTML = '';
  for(const row of rows.slice(0, 8)){
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'app-backlink-item';
    item.innerHTML = `<strong>${escapeHtml(row.n.title || 'Untitled')}</strong><span class="app-backlink-kind">${row.kind}</span>`;
    item.addEventListener('click', ()=> selectNote(row.n.id));
    backlinksList.appendChild(item);
  }
}
// updateBacklinks is invoked from updateEditorMeta (patched at its call site).

// -- WP-GRAPH-001 � knowledge graph (force-directed, zero deps) ---------------
const graphCanvas = document.getElementById('graphCanvas');
const graphStats = document.getElementById('graphStats');
let graphState = null; // { nodes, edges, sim }
function extractLinks(text){
  return [...String(text || '').matchAll(/\[\[([^\]]+)\]\]/g)].map((m)=> m[1].trim().toLowerCase());
}
function buildGraphData(){
  const visible = notes.filter((n)=> !n.isTrashed).slice(0, 150);
  const byTitle = new Map(visible.map((n)=> [(n.title || 'untitled').trim().toLowerCase(), n]));
  const nodes = visible.map((n)=> ({
    id: n.id,
    label: (n.title || 'Untitled').slice(0, 28),
    degree: 0,
    x: 300 + (Math.random() - 0.5) * 380,
    y: 260 + (Math.random() - 0.5) * 300,
    vx: 0, vy: 0,
  }));
  const nodeById = new Map(nodes.map((n)=> [n.id, n]));
  const edges = [];
  const seen = new Set();
  for(const n of visible){
    const targets = extractLinks(plainFromNote(n));
    for(const t of targets){
      const target = byTitle.get(t);
      if(!target || target.id === n.id) continue;
      const key = [n.id, target.id].sort().join('|');
      if(seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: nodeById.get(n.id), b: nodeById.get(target.id) });
      nodeById.get(n.id).degree += 1;
      nodeById.get(target.id).degree += 1;
    }
  }
  return { nodes, edges };
}
function renderGraph(){
  if(!graphCanvas) return;
  graphState = buildGraphData();
  if(graphStats) graphStats.textContent = `${graphState.nodes.length} notes \u00b7 ${graphState.edges.length} links`;
  // seed simulation ticks so the layout is settled on first paint
  for(let i = 0; i < 120; i++) graphTick(graphState, 1);
  graphDraw();
}
function graphTick(g, strength){
  const nodes = g.nodes;
  // repulsion (sampled for large graphs)
  for(let i = 0; i < nodes.length; i++){
    for(let j = i + 1; j < nodes.length; j++){
      const a = nodes[i], b = nodes[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d2 = dx * dx + dy * dy;
      if(d2 < 1){ dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
      if(d2 > 40000) continue;
      const f = (2600 * strength) / d2;
      const d = Math.sqrt(d2);
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx -= fx; a.vy -= fy;
      b.vx += fx; b.vy += fy;
    }
  }
  // springs along edges
  for(const e of g.edges){
    const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const f = ((d - 130) * 0.012) * strength;
    const fx = (dx / d) * f, fy = (dy / d) * f;
    e.a.vx += fx; e.a.vy += fy;
    e.b.vx -= fx; e.b.vy -= fy;
  }
  // integrate + gentle centering
  for(const n of nodes){
    n.vx += (400 - n.x) * 0.0015;
    n.vy += (300 - n.y) * 0.0015;
    n.vx *= 0.86; n.vy *= 0.86;
    n.x += Math.max(-14, Math.min(14, n.vx));
    n.y += Math.max(-14, Math.min(14, n.vy));
  }
}
function graphDraw(){
  if(!graphCanvas || !graphState) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const wrap = graphCanvas.parentElement;
  const w = Math.max(320, wrap ? wrap.clientWidth : 700);
  const h = Math.max(320, wrap ? Math.min(560, Math.max(380, window.innerHeight - 260)) : 480);
  graphCanvas.width = w * dpr;
  graphCanvas.height = h * dpr;
  graphCanvas.style.width = w + 'px';
  graphCanvas.style.height = h + 'px';
  const ctx = graphCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(150,190,90,0.32)';
  ctx.lineWidth = 1;
  for(const e of graphState.edges){
    ctx.beginPath();
    ctx.moveTo(e.a.x, e.a.y);
    ctx.lineTo(e.b.x, e.b.y);
    ctx.stroke();
  }
  for(const n of graphState.nodes){
    const r = 5 + Math.min(8, n.degree * 2);
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = n.degree > 0 ? '#a5d64f' : '#4f7a3a';
    ctx.fill();
    ctx.fillStyle = 'rgba(235,240,225,0.92)';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillText(n.label, n.x + r + 4, n.y + 4);
  }
}
if(graphCanvas){
  let dragNode = null;
  graphCanvas.addEventListener('pointerdown', (e)=>{
    if(!graphState) return;
    const r = graphCanvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    dragNode = graphState.nodes.find((n)=> Math.hypot(n.x - x, n.y - y) < 14) || null;
    if(dragNode) graphCanvas.setPointerCapture(e.pointerId);
  });
  graphCanvas.addEventListener('pointermove', (e)=>{
    if(!dragNode || !graphCanvas) return;
    const r = graphCanvas.getBoundingClientRect();
    dragNode.x = e.clientX - r.left;
    dragNode.y = e.clientY - r.top;
    graphDraw();
  });
  graphCanvas.addEventListener('pointerup', ()=>{ dragNode = null; });
  graphCanvas.addEventListener('click', (e)=>{
    if(!graphState) return;
    const r = graphCanvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = graphState.nodes.find((n)=> Math.hypot(n.x - x, n.y - y) < 14);
    if(hit){ goToView('notes'); selectNote(hit.id); }
  });
  window.addEventListener('resize', ()=>{ if(currentView==='graph') graphDraw(); });
}

// -- WP-AI-007 � Ask-my-notes view --------------------------------------------
const askForm = document.getElementById('askForm');
const askInput = document.getElementById('askInput');
const askSubmitBtn = document.getElementById('askSubmit');
const askResult = document.getElementById('askResult');
const askAnswerEl = document.getElementById('askAnswer');
const askSourcesEl = document.getElementById('askSources');
if(askForm) askForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!askInput) return;
  const question = askInput.value.trim();
  if(!question) return;
  setError('');
  if(askSubmitBtn){ askSubmitBtn.disabled = true; askSubmitBtn.textContent = 'Thinking\u2026'; }
  if(askResult) askResult.hidden = true;
  try{
    const res = await fetchWithAuth(API_BASE + '/api/ai/ask', { method:'POST', body: JSON.stringify({ question }) });
    const j = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(j.message || 'Could not answer that');
    if(askResult) askResult.hidden = false;
    if(askAnswerEl) askAnswerEl.textContent = j.answer || '';
    if(askSourcesEl){
      askSourcesEl.innerHTML = '';
      for(const src of (j.sources || [])){
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'ask-source';
        chip.innerHTML = `<span class="ask-source-idx">[${src.index}]</span> ${escapeHtml(src.title || 'Untitled')}`;
        chip.addEventListener('click', ()=>{ goToView('notes'); selectNote(src.noteId); });
        askSourcesEl.appendChild(chip);
      }
      if(!(j.sources || []).length) askSourcesEl.innerHTML = '<span class="ask-source-empty">No matching notes</span>';
    }
  }catch(err){ setError(err.message || 'Ask failed'); }
  finally{
    if(askSubmitBtn){ askSubmitBtn.disabled = false; askSubmitBtn.textContent = 'Ask'; }
  }
});

// -- WP-SEARCH-002 � date filter (client-side on the loaded list) -------------
const dateFilter = document.getElementById('dateFilter');
function applyDateFilter(list){
  if(!dateFilter || dateFilter.value === 'all') return list;
  const cutoff = Date.now() - ({ today: 86400000, week: 7 * 86400000, month: 30 * 86400000 }[dateFilter.value] || 0);
  return list.filter((n)=> new Date(n.updatedAt || n.createdAt || 0).getTime() >= cutoff);
}
if(dateFilter) dateFilter.addEventListener('change', ()=>{
  const filtered = applyDateFilter(notes);
  if(countEl) countEl.textContent = `${filtered.length} ${filtered.length===1?'note':'notes'}${filtered.length !== notes.length ? ` (of ${notes.length})` : ''}`;
  for(const row of listEl?.querySelectorAll('.app-note-item') || []){
    const n = notes.find((x)=> x.id === row.dataset.id);
    if(n) row.style.display = filtered.includes(n) ? '' : 'none';
  }
});

// -- WP-CAPTURE-002 � keyboard: Ctrl+Alt+N quick add --------------------------
document.addEventListener('keydown', (event)=>{
  if((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase()==='n'){
    event.preventDefault();
    openQuickAdd();
  }
});

// -- WP-CLIP-001 � web clipper intake (bookmarklet lands on #clip?...) --------
  async function handleClipParams(){
    try{
    if(!location.hash.startsWith('#clip')) return;
    const params = new URLSearchParams(location.hash.slice('#clip'.length + 1));
    const url = params.get('url') || '';
    const title = (params.get('title') || 'Clipped page').slice(0, 300);
    const text = (params.get('text') || '').slice(0, 50000);
    history.replaceState(null, '', location.pathname); // clean the address bar
    if(offlineReadOnly){ showToast('Clip saved locally \u2014 go online to sync'); return; }
    const bodyText = [text, url ? `Source: ${url}` : ''].filter(Boolean).join('\n\n');
    const res = await fetchWithAuth(API_BASE + '/api/notes', {
      method: 'POST',
      body: JSON.stringify({ title, contentText: bodyText, description: bodyText.slice(0, 2000) }),
    });
    const created = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(created.message || 'Could not save clip');
    setViewChrome('notes');
    setRouteHash('notes', true);
    notes.unshift(created);
    renderList();
    selectNote(created.id);
    markSaved();
    updateCounts();
    showToast('Page clipped to your notes');
  }catch(e){ showToast(e.message || 'Could not save clip'); }
}
