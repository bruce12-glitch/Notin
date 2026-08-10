// app.js — WP-APP-001 + WP-APP-002 TipTap + WP-APP-003 Trash (memory token only, never localStorage)
import { api, getPersistedEmail } from './auth-client.js';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';

const API_BASE = (window.NOTIN_API || '').replace(/\/$/, '') || '';

let memToken = null;
let notes = [];
let selectedId = null;
let saveTimer = null;
let isSaving = false;
let editor = null;
let currentFilter = 'active'; // 'active' | 'trash'
let currentQuery = ''; // WP-APP-004 — active search string ('' = no search)
let searchDebounce = null; // debounce timer for search input
let notebooks = []; // WP-APP-005 — user's notebooks
let currentNotebookId = null; // WP-APP-005 — null = All notes (no notebook filter)
let tags = []; // WP-APP-006 — user's tags
let currentTagId = null; // WP-APP-006 — null = no tag filter
let currentSort = 'updated'; // WP-APP-007 — list sort control ('updated' | 'created' | 'title'); pins always win
// WP-UI-HOME-001 — tiny hash router for authenticated app views.
let currentView = 'home'; // home | notes | shortcuts | notebooks | tags | trash | account
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

async function bootstrapToken(){
  try{
    const r = await fetch(API_BASE + '/api/auth/refresh', {method:'POST', credentials:'include'});
    if(r.ok){
      const j = await r.json();
      memToken = j.accessToken || j.token;
      if(memToken) return memToken;
    }
  }catch{}
  try{
    const r2 = await fetch(API_BASE + '/auth/refresh', {method:'POST', credentials:'include'});
    if(r2.ok){
      const j = await r2.json();
      memToken = j.accessToken || j.token;
      if(memToken) return memToken;
    }
  }catch{}
  return null;
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

// ── WP-UI-HOME-001 — authenticated view router + Home dashboard ──
const APP_ROUTES = new Set(['home','notes','shortcuts','notebooks','tags','trash','account']);
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
  currentView = APP_ROUTES.has(view) ? view : 'home';
  const showHome = currentView==='home' || currentView==='account';
  const showShortcuts = currentView==='shortcuts';
  const showOrganize = currentView==='notebooks' || currentView==='tags';
  if(homeView) homeView.hidden = !showHome;
  if(shortcutsView) shortcutsView.hidden = !showShortcuts;
  if(organizeView) organizeView.hidden = !showOrganize;
  if(editorWorkspace) editorWorkspace.hidden = showHome || showShortcuts || showOrganize;
  if(layout){
    layout.classList.toggle('is-home', showHome);
    layout.classList.toggle('is-shortcuts', showShortcuts);
    layout.classList.toggle('is-organize', showOrganize);
    if(showHome || showShortcuts || showOrganize){ layout.classList.remove('is-list','is-editor'); }
    else if(!layout.classList.contains('is-editor')) layout.classList.add('is-list');
  }
  [navHome,navAll,navShortcuts,navNotebooks,navTags,navTrash].forEach(el=>{
    if(!el) return;
    const active = (el===navHome && currentView==='home')
      || (el===navAll && currentView==='notes')
      || (el===navShortcuts && currentView==='shortcuts')
      || (el===navNotebooks && currentView==='notebooks')
      || (el===navTags && currentView==='tags')
      || (el===navTrash && currentView==='trash');
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
  create.className = 'home-note-card home-create-card';
  create.id = 'homeCreateNote';
  create.disabled = offlineReadOnly;
  create.innerHTML = '<span class="home-create-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></span><strong>Create new note</strong>';
  create.addEventListener('click', createNote);
  homeNoteGrid.appendChild(create);
  const recent = notes.filter(note=>!note.isTrashed).slice(0,7);
  if(!recent.length){
    const empty = document.createElement('div');
    empty.className = 'home-empty-copy';
    empty.innerHTML = '<strong>Your Home is ready for its first idea.</strong><span>Create a note and it will appear here automatically.</span><button type="button" class="home-empty-cta">Create a note</button>';
    empty.querySelector('button').addEventListener('click', createNote);
    homeNoteGrid.appendChild(empty);
    return;
  }
  recent.forEach(note=>{
    const notebook = note.notebookId ? notebooks.find(item=>item.id===note.notebookId) : null;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'home-note-card';
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
    card.className='shortcut-card';
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
    card.className = 'organize-card';
    card.dataset.id = item.id;
    card.innerHTML = `<span class="organize-card-icon" aria-hidden="true">${isTags?'#':'▥'}</span><span class="organize-card-copy"><strong>${escapeHtml(item.name)}</strong><span>${Number(item.noteCount)||0} ${(Number(item.noteCount)||0)===1?'note':'notes'}</span></span><span class="organize-card-arrow" aria-hidden="true">→</span>`;
    card.addEventListener('click', ()=> openOrganizeFilter(isTags ? 'tag' : 'notebook', item.id));
    organizeGrid.appendChild(card);
  });
}
async function openOrganizeFilter(type,id){
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
  if(view==='home' || view==='notes' || view==='shortcuts'){
    currentFilter='active'; currentNotebookId=null; currentTagId=null;
    if(view==='home' || view==='shortcuts') clearSearchNow(false);
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
  if(focusSearch) setTimeout(()=>searchInput?.focus(), 0);
}
function goToView(view, options={}){
  if(!setRouteHash(view)) applyRoute(view, options);
  else if(options.focusSearch) setTimeout(()=>searchInput?.focus(), 80);
}
function openNoteFromHome(id){
  setViewChrome('notes');
  setRouteHash('notes', true);
  selectNote(id);
}
function showSoon(name){
  if(name==='Web clipper'){
    const capture=document.querySelector('.capture-soon');
    if(capture){ capture.classList.add('is-coming'); capture.innerHTML='Coming soon <span>No clipper backend</span>'; }
  }
  if(!soonToast) return;
  soonToast.textContent = `${name} is coming soon.`;
  soonToast.hidden = false;
  clearTimeout(soonToastTimer);
  soonToastTimer = setTimeout(()=>{ soonToast.hidden=true; }, 2200);
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
  if(navHome) navHome.setAttribute('aria-current', currentView==='home'?'page':'false');
  if(navAll) navAll.setAttribute('aria-current', currentView==='notes'?'page':'false');
  if(navShortcuts) navShortcuts.setAttribute('aria-current', currentView==='shortcuts'?'page':'false');
  if(navNotebooks) navNotebooks.setAttribute('aria-current', currentView==='notebooks'?'page':'false');
  if(navTags) navTags.setAttribute('aria-current', currentView==='tags'?'page':'false');
  if(navTrash) navTrash.setAttribute('aria-current', currentView==='trash'?'page':'false');
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
      fetchWithAuth(API_BASE + '/api/notes?filter=active', {method:'GET'}),
      fetchWithAuth(API_BASE + '/api/notes?filter=trash', {method:'GET'})
    ]);
    const a = activeRes.ok ? await activeRes.json() : [];
    const t = trashRes.ok ? await trashRes.json() : [];
    if(activeRes.ok && trashRes.ok) await updateOfflineSnapshot({notes:[...(Array.isArray(a)?a:[]), ...(Array.isArray(t)?t:[])]});
    const aCount = Array.isArray(a) ? a.length : 0;
    const tCount = Array.isArray(t) ? t.length : 0;
    if(countAllEl) countAllEl.textContent = String(aCount);
    if(countTrashEl) countTrashEl.textContent = String(tCount);
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
    ],
    content: createEmptyDoc(),
    onUpdate: ({ editor }) => {
      if(!selectedId) return;
      const cur = notes.find(n=>n.id===selectedId);
      if(cur && cur.isTrashed) return; // no autosave for trashed
      onEditorUpdate();
    },
    onCreate: () => { updateToolbar(); },
    onSelectionUpdate: () => updateToolbar(),
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
      }
    }catch{}
    btn.classList.toggle('is-active', active);
  });
}

async function loadNotes(){
  setError('');
  if(offlineReadOnly){ loadCachedNotes(); return; }
  try{
    // WP-APP-004 — append q only when searching; empty q = today's list behavior
    // WP-APP-005/006 — notebook + tag filters compose with search + trash
    const qs = `/api/notes?filter=${currentFilter}`
      + (currentQuery ? `&q=${encodeURIComponent(currentQuery)}` : '')
      + (currentNotebookId ? `&notebookId=${encodeURIComponent(currentNotebookId)}` : '')
      + (currentTagId ? `&tagId=${encodeURIComponent(currentTagId)}` : '');
    const res = await fetchWithAuth(API_BASE + qs, {method:'GET'});
    if(!res.ok){
      const j = await res.json().catch(()=>({}));
      throw new Error(j.message || `Fetch failed ${res.status}`);
    }
    const data = await res.json();
    notes = Array.isArray(data) ? data : [];
    sortNotes(notes); // WP-APP-007 — pin-aware
    renderList();
    await updateCounts(); // refresh sidebar counts (totals, unfiltered)
    if(countEl && (currentQuery || currentNotebookId || currentTagId)){
      // While filtering (search and/or notebook), the list-header counter shows what's listed
      countEl.textContent = currentQuery
        ? `${notes.length} ${notes.length===1?'match':'matches'}`
        : `${notes.length} ${notes.length===1?'note':'notes'}`;
    }
    if(notes.length===0){
      selectedId = null;
      titleInput.value = '';
      if(editor) editor.commands.setContent(createEmptyDoc(), false);
      setSaveStatus('', '');
      updateEditorForSelection(null);
    } else if(!selectedId || !notes.find(n=>n.id===selectedId)){
      selectNote(notes[0].id);
    } else {
      renderList();
      // keep editor content but update toolbar state
      updateEditorForSelection(notes.find(n=>n.id===selectedId));
    }
  } catch(e){
    setError(e.message || 'Could not load notes');
  }
}
function renderList(){
  if(!listEl) return;
  listEl.innerHTML = '';
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
  notes.forEach(n=>{
    const snippet = plainFromNote(n);
    const pinned = !!n.isPinned;
    // WP-APP-007 — row is a focusable div (not <button>) so the pin toggle is valid nested markup
    const btn = document.createElement('div');
    btn.className = 'app-note-item' + (pinned?' is-pinned':'') + (n.id===selectedId?' is-active':'');
    btn.dataset.id = n.id;
    btn.tabIndex = 0;
    // Pin control: interactive in normal views; static indicator in Trash (pinned state is
    // preserved while trashed but no writes are allowed on a trashed note).
    const pinCtl = isTrashView
      ? (pinned ? `<span class="app-note-pin app-note-pin--static is-on" title="Pinned" aria-hidden="true">${PIN_SVG}</span>` : '')
      : `<button type="button" class="app-note-pin${pinned?' is-on':''}" title="${pinned?'Unpin note':'Pin note'}" aria-label="${pinned?'Unpin':'Pin'}: ${escapeHtml(n.title || 'Untitled')}" aria-pressed="${pinned?'true':'false'}">${PIN_SVG}</button>`;
    btn.innerHTML = `
      ${pinCtl}
      <div class="app-note-title">${escapeHtml(n.title || 'Untitled')}</div>
      <div class="app-note-snippet">${escapeHtml(snippetFromText(snippet)) || '<span style="color:#9a9a9a">No additional text</span>'}</div>
      <div class="app-note-meta">${formatDate(n.updatedAt || n.createdAt)}</div>
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
function updateEditorForSelection(note){
  const isTrashed = !!(note && note.isTrashed);
  const hasSelection = !!note;
  const readOnly = offlineReadOnly;
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
  if(sharePanel){
    if(!hasSelection || isTrashed || readOnly) sharePanel.hidden = true;
    else if(sharedNoteId===note.id && shareLinkInput?.value) sharePanel.hidden = false;
  }
  // WP-APP-008 — attachments remain visible in Trash; uploads are disabled offline.
  if(attachmentRow) attachmentRow.hidden = !hasSelection;
  if(attachImageBtn){
    attachImageBtn.hidden = !hasSelection || isTrashed || readOnly;
    attachImageBtn.disabled = !hasSelection || isTrashed || readOnly;
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
    if(attachmentStatus) attachmentStatus.textContent = 'Images are unavailable offline';
    return;
  }
  const version = ++attachmentLoadVersion;
  attachmentObjectUrls.forEach(url=> URL.revokeObjectURL(url));
  attachmentObjectUrls = [];
  attachmentGallery.innerHTML = '';
  if(attachmentStatus) attachmentStatus.textContent = 'Loading images…';
  try{
    const res = await fetchWithAuth(API_BASE + `/api/notes/${note.id}/attachments`, {method:'GET'});
    const items = await res.json().catch(()=>[]);
    if(!res.ok) throw new Error(items.message || `Image list failed ${res.status}`);
    if(version!==attachmentLoadVersion || selectedId!==note.id) return;
    for(const item of items){
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
    if(attachmentStatus) attachmentStatus.textContent = items.length ? `${items.length} ${items.length===1?'image':'images'}` : 'No images';
  }catch(e){
    if(version===attachmentLoadVersion && attachmentStatus) attachmentStatus.textContent = e.message || 'Could not load images';
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
if(attachImageInput) attachImageInput.addEventListener('change', async ()=>{
  const cur = notes.find(n=>n.id===selectedId);
  const files = [...(attachImageInput.files || [])];
  if(offlineReadOnly || !cur || cur.isTrashed || !files.length) return;
  const form = new FormData();
  files.forEach(file=> form.append('images', file));
  if(attachmentStatus) attachmentStatus.textContent = 'Uploading…';
  if(attachImageBtn) attachImageBtn.disabled = true;
  try{
    const res = await fetchWithAuth(API_BASE + `/api/notes/${cur.id}/attachments`, {method:'POST', body:form});
    const j = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(j.message || `Upload failed ${res.status}`);
    await loadAttachments(cur);
  }catch(e){ if(attachmentStatus) attachmentStatus.textContent = e.message || 'Image upload failed'; }
  finally{
    attachImageInput.value = '';
    if(attachImageBtn) attachImageBtn.disabled = false;
  }
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
    setSaveStatus('Saved', 'is-saved');
    updateCounts();
  } catch(e){
    setError(e.message || 'Could not create note');
  } finally {
    if(newBtn) newBtn.disabled = false;
  }
}
async function saveNote(){
  if(offlineReadOnly){ setSaveStatus('Offline · read only','is-error'); return; }
  if(!selectedId) return;
  const cur = notes.find(n=>n.id===selectedId);
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
    const res = await fetchWithAuth(API_BASE + `/api/notes/${selectedId}`, {
      method:'PUT',
      body: JSON.stringify({ title: title || 'Untitled', contentJson: json, contentText: text, description: text })
    });
    if(!res.ok){
      const j = await res.json().catch(()=>({}));
      throw new Error(j.message || `Save failed ${res.status}`);
    }
    const updated = await res.json();
    const idx = notes.findIndex(n=>n.id===selectedId);
    if(idx>=0) notes[idx] = updated;
    sortNotes(notes); // WP-APP-007 — pin-aware
    renderList();
    setSaveStatus('Saved', 'is-saved');
    updateCounts();
    setTimeout(()=>{ if(!isSaving) setSaveStatus('Saved','is-saved'); }, 1200);
  } catch(e){
    setSaveStatus('Error', 'is-error');
    setError(e.message || 'Save failed');
  } finally {
    isSaving = false;
    if(saveBtn) saveBtn.disabled = false;
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
  } catch(e){
    setError(e.message || 'Move to trash failed');
    setSaveStatus('Error','is-error');
  }
}
async function restoreNote(){
  if(!selectedId) return;
  const cur = notes.find(n=>n.id===selectedId);
  if(!cur || !cur.isTrashed) return;
  setError('');
  setSaveStatus('Restoring…','is-saving');
  try{
    let res = await fetchWithAuth(API_BASE + `/api/notes/${selectedId}/restore`, {method:'POST'});
    if(!res.ok){
      res = await fetchWithAuth(API_BASE + `/api/notes/${selectedId}`, {method:'PATCH', body: JSON.stringify({ isTrashed: false })});
    }
    if(!res.ok){
      const j = await res.json().catch(()=>({}));
      throw new Error(j.message || 'Could not restore');
    }
    const restored = await res.json().catch(()=>({}));
    // Remove from trash list
    notes = notes.filter(n=>n.id!==selectedId);
    selectedId = null;
    titleInput.value = '';
    if(editor) editor.commands.setContent(createEmptyDoc(), false);
    updateEditorForSelection(null);
    renderList();
    setSaveStatus('Restored','is-saved');
    updateCounts();
    // Switch to Notes to show the restored item.
    currentFilter = 'active';
    currentView = 'notes';
    setViewChrome('notes');
    setRouteHash('notes', true);
    updateNav();
    await loadNotes();
    if(restored && restored.id) selectNote(restored.id);
  } catch(e){
    setError(e.message || 'Restore failed');
    setSaveStatus('Error','is-error');
  }
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
  setSaveStatus('Unsaved', '');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    if(dirty) saveNote().then(()=> dirty=false);
  }, 900);
}
function onEditorUpdate(){
  onEdit();
}
if(titleInput) titleInput.addEventListener('input', onEdit);
if(saveBtn) saveBtn.addEventListener('click', async ()=>{
  dirty = false;
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
if(homeNewNoteTop) homeNewNoteTop.addEventListener('click', createNote);
if(homeViewAll) homeViewAll.addEventListener('click', ()=> goToView('notes'));
if(shortcutsViewNotes) shortcutsViewNotes.addEventListener('click', ()=> goToView('notes'));
if(organizeCreateBtn) organizeCreateBtn.addEventListener('click', showOrganizeCreate);
if(organizeCreateForm) organizeCreateForm.addEventListener('submit', submitOrganizeCreate);
if(organizeCreateCancel) organizeCreateCancel.addEventListener('click', hideOrganizeCreate);
document.querySelectorAll('[data-soon]').forEach(button=> button.addEventListener('click', (event)=>{ event.preventDefault(); showSoon(button.dataset.soon); }));
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
    setSaveStatus('Saved', 'is-saved');
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
  setSaveStatus('Saved', 'is-saved');
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
  currentSort = sortSelect.value || 'updated';
  sortNotes(notes);
  renderList();
});

// ── WP-APP-004 — search wiring (debounced 300ms, no page reload) ──
function applySearch(value){
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
  if(searchInput) searchInput.value = '';
  if(globalSearchInput) globalSearchInput.value = '';
  currentQuery = '';
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
function openAccountModal(){
  if(!accountModal) return;
  accountModal.hidden = false;
  if(accountStatus) accountStatus.textContent = '';
  if(deleteAccountConfirm) deleteAccountConfirm.value = '';
  if(deleteAccountBtn) deleteAccountBtn.disabled = true;
  exportDataBtn?.focus();
}
function closeAccountModal(){
  if(accountModal) accountModal.hidden = true;
  if(accountStatus) accountStatus.textContent = '';
  if(deleteAccountConfirm) deleteAccountConfirm.value = '';
  if(deleteAccountBtn) deleteAccountBtn.disabled = true;
}
if(accountBtn) accountBtn.addEventListener('click', ()=> goToView('account'));
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
  try{ await fetch(API_BASE + '/api/auth/logout', {method:'POST', credentials:'include'}); }catch{}
  try{ await fetch(API_BASE + '/auth/logout', {method:'POST', credentials:'include'}); }catch{}
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
})();
window.addEventListener('hashchange', ()=>{ if(routeReady) applyRoute(routeFromHash()); });

try{
  const has = Object.keys(localStorage).some(k=> /token/i.test(k) && localStorage.getItem(k)?.startsWith('eyJ'));
  if(has) console.warn('localStorage contains token — should be memory only');
}catch{}
