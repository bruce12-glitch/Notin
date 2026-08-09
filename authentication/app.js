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
const titleInput = document.getElementById('editorTitle');
const saveBtn = document.getElementById('saveBtn');
const saveStatus = document.getElementById('saveStatus');
const newBtn = document.getElementById('newNoteBtn');
const newBtnEmpty = document.getElementById('newNoteBtnEmpty');
const newWrap = document.getElementById('newNoteWrap');
const logoutBtn = document.getElementById('logoutBtn');
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
  const headers = opts.headers || {};
  if(memToken) headers['Authorization'] = `Bearer ${memToken}`;
  headers['Content-Type'] = headers['Content-Type'] || 'application/json';
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
function updateNav(){
  if(navAll) navAll.classList.toggle('is-active', currentFilter==='active' && !currentNotebookId);
  if(navTrash) navTrash.classList.toggle('is-active', currentFilter==='trash');
  if(navAll) navAll.setAttribute('aria-current', currentFilter==='active' && !currentNotebookId ? 'page' : 'false');
  if(navTrash) navTrash.setAttribute('aria-current', currentFilter==='trash'?'page':'false');
  // WP-APP-005/006 — list title reflects the selected notebook/tag (Trash keeps its title)
  const nb = currentNotebookId ? notebooks.find(x=>x.id===currentNotebookId) : null;
  const tg = currentTagId ? tags.find(x=>x.id===currentTagId) : null;
  if(listTitleEl) listTitleEl.textContent = currentFilter==='trash' ? 'Trash' : (tg ? `#${tg.name}` : (nb ? nb.name : 'All Notes'));
  if(newWrap) newWrap.hidden = currentFilter==='trash';
  renderNotebooks(); // keep sidebar active states in sync
  renderTags();      // WP-APP-006
}
async function updateCounts(){
  try{
    const [activeRes, trashRes] = await Promise.all([
      fetchWithAuth(API_BASE + '/api/notes?filter=active', {method:'GET'}),
      fetchWithAuth(API_BASE + '/api/notes?filter=trash', {method:'GET'})
    ]);
    const a = activeRes.ok ? await activeRes.json() : [];
    const t = trashRes.ok ? await trashRes.json() : [];
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
  // Title and editor
  updateEditorDisabled(!hasSelection || isTrashed);
  // WP-APP-005 — notebook picker reflects selection; disabled for trashed/empty
  if(nbSelect){
    nbSelect.disabled = !hasSelection || isTrashed;
    nbSelect.value = (note && note.notebookId) || '';
  }
  // WP-APP-006 — tag chips reflect selection (hidden for trashed/empty)
  renderTagChips(hasSelection ? note : null);
  // WP-APP-007 — editor pin control mirrors the selected note (hidden in Trash/no selection)
  if(pinBtn){
    pinBtn.hidden = !hasSelection || isTrashed;
    pinBtn.disabled = !hasSelection || isTrashed;
    const pinned = !!(note && note.isPinned);
    pinBtn.classList.toggle('is-pinned', pinned);
    pinBtn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
    pinBtn.title = pinned ? 'Unpin note' : 'Pin note';
    const lbl = pinBtn.querySelector('.app-pin-toggle-label');
    if(lbl) lbl.textContent = pinned ? 'Pinned' : 'Pin';
  }
  // Buttons
  if(trashBtn) trashBtn.hidden = !hasSelection || isTrashed;
  if(restoreBtn) restoreBtn.hidden = !isTrashed;
  if(deleteBtn) deleteBtn.hidden = !isTrashed;
  const tb = document.getElementById('toolbar');
  if(tb){
    tb.style.opacity = isTrashed ? '0.5' : '1';
    tb.style.pointerEvents = isTrashed ? 'none' : 'auto';
  }
  if(isTrashed){
    setSaveStatus('Trashed', 'is-error');
  } else if(hasSelection){
    setSaveStatus('Saved', 'is-saved');
  } else {
    setSaveStatus('', '');
  }
}
function selectNote(id){
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
  renderList();
  titleInput.focus();
}
function updateEditorDisabled(disabled){
  if(titleInput) titleInput.disabled = disabled;
  if(saveBtn) saveBtn.disabled = disabled;
  if(editor){
    const isTrashed = !!(notes.find(n=>n.id===selectedId)?.isTrashed);
    const shouldDisable = disabled || isTrashed;
    editor.setEditable(!shouldDisable);
    const el = document.querySelector('.tiptap-editor');
    if(el) el.style.opacity = shouldDisable ? '0.5' : '1';
  }
}

async function createNote(){
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
    // Switch to All Notes to show restored
    currentFilter = 'active';
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

if(navAll) navAll.addEventListener('click', async ()=>{
  if(currentFilter==='active' && !currentNotebookId && !currentTagId) return;
  currentFilter='active';
  currentNotebookId=null; // WP-APP-005: All Notes = every notebook
  currentTagId=null;      // WP-APP-006: All Notes clears tag filter too
  updateNav();
  selectedId=null;
  titleInput.value='';
  if(editor) editor.commands.setContent(createEmptyDoc(), false);
  updateEditorForSelection(null);
  await loadNotes();
});
if(navTrash) navTrash.addEventListener('click', async ()=>{
  if(currentFilter==='trash') return;
  currentFilter='trash';
  updateNav();
  selectedId=null;
  titleInput.value='';
  if(editor) editor.commands.setContent(createEmptyDoc(), false);
  updateEditorForSelection(null);
  await loadNotes();
});
// ── WP-APP-005 — notebooks (minimal organize: sidebar list + filter + editor picker) ──
async function loadNotebooks(){
  try{
    const res = await fetchWithAuth(API_BASE + '/api/notebooks', {method:'GET'});
    if(!res.ok) throw new Error(`Fetch failed ${res.status}`);
    const data = await res.json();
    notebooks = Array.isArray(data) ? data : [];
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
    row.querySelector('.app-nb-del').addEventListener('click', ()=> confirmDeleteNotebook(row, nb));
    notebookListEl.appendChild(row);
  });
}
async function selectNotebook(id){
  if(currentNotebookId===id && currentFilter==='active') return;
  currentNotebookId = id;
  if(currentFilter!=='active') currentFilter='active'; // notebooks organize non-trashed notes
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
  try{
    const res = await fetchWithAuth(API_BASE + '/api/tags', {method:'GET'});
    if(!res.ok) throw new Error(`Fetch failed ${res.status}`);
    const data = await res.json();
    tags = Array.isArray(data) ? data : [];
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
    row.querySelector('.app-nb-del').addEventListener('click', ()=> confirmDeleteTag(row, t));
    tagListEl.appendChild(row);
  });
}
async function selectTag(id){
  // Clicking the active tag again clears the filter (toggle)
  currentTagId = (currentTagId===id) ? null : id;
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
  if(searchClear) searchClear.hidden = !(searchInput && searchInput.value);
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(()=>{
    currentQuery = currentQuery.trim();
    loadNotes();
  }, 300);
}
function clearSearchNow(reload=true){
  if(searchInput) searchInput.value = '';
  currentQuery = '';
  clearTimeout(searchDebounce);
  if(searchClear) searchClear.hidden = true;
  if(reload) loadNotes();
}
if(searchInput){
  searchInput.addEventListener('input', ()=> applySearch(searchInput.value));
  searchInput.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ clearSearchNow(); } });
}
if(searchClear) searchClear.addEventListener('click', ()=>{ clearSearchNow(); if(searchInput) searchInput.focus(); });
if(clearSearchEmptyBtn) clearSearchEmptyBtn.addEventListener('click', ()=>{ clearSearchNow(); if(searchInput) searchInput.focus(); });

if(logoutBtn) logoutBtn.addEventListener('click', async ()=>{
  try{ await fetch(API_BASE + '/api/auth/logout', {method:'POST', credentials:'include'}); }catch{}
  try{ await fetch(API_BASE + '/auth/logout', {method:'POST', credentials:'include'}); }catch{}
  memToken = null;
  try{ sessionStorage.removeItem('notin_email'); }catch{}
  redirectToLogin();
});
if(mobileBack){
  mobileBack.addEventListener('click', ()=>{
    if(layout){ layout.classList.remove('is-editor'); layout.classList.add('is-list'); }
  });
}

// Init
initEditor();
(async ()=>{
  const email = getEmail();
  if(emailEl){
    emailEl.textContent = email || '—';
    emailEl.title = email || '';
  }
  const tok = await bootstrapToken();
  if(!tok){
    redirectToLogin();
    return;
  }
  updateEditorDisabled(true);
  await loadNotebooks(); // WP-APP-005 — sidebar notebooks
  await loadTags();      // WP-APP-006 — sidebar tags
  updateNav();
  await loadNotes();
  await updateCounts();
  if(layout) layout.classList.add('is-list');
})();

try{
  const has = Object.keys(localStorage).some(k=> /token/i.test(k) && localStorage.getItem(k)?.startsWith('eyJ'));
  if(has) console.warn('localStorage contains token — should be memory only');
}catch{}
