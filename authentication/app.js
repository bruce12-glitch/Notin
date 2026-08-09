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
  if(navAll) navAll.classList.toggle('is-active', currentFilter==='active');
  if(navTrash) navTrash.classList.toggle('is-active', currentFilter==='trash');
  if(navAll) navAll.setAttribute('aria-current', currentFilter==='active'?'page':'false');
  if(navTrash) navTrash.setAttribute('aria-current', currentFilter==='trash'?'page':'false');
  if(listTitleEl) listTitleEl.textContent = currentFilter==='trash' ? 'Trash' : 'All Notes';
  if(newWrap) newWrap.hidden = currentFilter==='trash';
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
    const qs = `/api/notes?filter=${currentFilter}` + (currentQuery ? `&q=${encodeURIComponent(currentQuery)}` : '');
    const res = await fetchWithAuth(API_BASE + qs, {method:'GET'});
    if(!res.ok){
      const j = await res.json().catch(()=>({}));
      throw new Error(j.message || `Fetch failed ${res.status}`);
    }
    const data = await res.json();
    notes = Array.isArray(data) ? data : [];
    notes.sort((a,b)=> new Date(b.updatedAt||b.createdAt) - new Date(a.updatedAt||a.createdAt));
    renderList();
    await updateCounts(); // refresh sidebar counts (totals, unfiltered)
    if(currentQuery && countEl){
      // While searching, the list-header counter shows matches found
      countEl.textContent = `${notes.length} ${notes.length===1?'match':'matches'}`;
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
    const btn = document.createElement('button');
    btn.className = 'app-note-item' + (n.id===selectedId?' is-active':'');
    btn.dataset.id = n.id;
    btn.innerHTML = `
      <div class="app-note-title">${escapeHtml(n.title || 'Untitled')}</div>
      <div class="app-note-snippet">${escapeHtml(snippetFromText(snippet)) || '<span style="color:#9a9a9a">No additional text</span>'}</div>
      <div class="app-note-meta">${formatDate(n.updatedAt || n.createdAt)}</div>
    `;
    btn.addEventListener('click', ()=> selectNote(n.id));
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
      body: JSON.stringify({ title: 'Untitled', description: '', contentJson: emptyDoc, contentText: '' })
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
    notes.sort((a,b)=> new Date(b.updatedAt||b.createdAt) - new Date(a.updatedAt||a.createdAt));
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
  if(currentFilter==='active') return;
  currentFilter='active';
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
  updateNav();
  await loadNotes();
  await updateCounts();
  if(layout) layout.classList.add('is-list');
})();

try{
  const has = Object.keys(localStorage).some(k=> /token/i.test(k) && localStorage.getItem(k)?.startsWith('eyJ'));
  if(has) console.warn('localStorage contains token — should be memory only');
}catch{}
