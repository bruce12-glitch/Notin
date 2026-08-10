(() => {
  const noteEl = document.getElementById('sharedNote');
  const stateEl = document.getElementById('shareState');
  const titleEl = document.getElementById('sharedTitle');
  const bodyEl = document.getElementById('sharedBody');
  const imagesEl = document.getElementById('sharedImages');
  const token = new URLSearchParams(location.search).get('token') || '';

  function showError(message) {
    noteEl.hidden = true;
    stateEl.hidden = false;
    stateEl.classList.add('error');
    stateEl.textContent = message;
    document.title = 'Shared note unavailable — Notin';
  }

  async function load() {
    if (!token) return showError('This share link is missing or invalid.');
    try {
      const response = await fetch(`/api/public/share/${encodeURIComponent(token)}`, {
        headers: { Accept: 'application/json' },
        credentials: 'omit',
      });
      if (!response.ok) return showError('This shared note is unavailable or the link was revoked.');
      const note = await response.json();
      titleEl.textContent = note.title || 'Untitled';
      bodyEl.textContent = note.contentText || '';
      imagesEl.replaceChildren();
      for (const image of note.images || []) {
        const img = document.createElement('img');
        img.src = image.url;
        img.alt = image.filename || 'Shared note image';
        img.loading = 'lazy';
        imagesEl.appendChild(img);
      }
      document.title = `${note.title || 'Shared note'} — Notin`;
      stateEl.hidden = true;
      noteEl.hidden = false;
    } catch {
      showError('This shared note could not be loaded.');
    }
  }

  load();
})();
