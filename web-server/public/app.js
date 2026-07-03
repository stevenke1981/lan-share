/* ─── LAN Share — Frontend App ──────────────────────── */

let currentPath = '';
let searchQuery = '';
let isEditMode = false;
let currentFilePath = ''; // path of the file currently being previewed
let currentPreviewType = ''; // 'text', 'image', etc.

// ─── DOM refs ─────────────────────────────────────────
const fileList = document.getElementById('fileList');
const fileTable = document.getElementById('fileTable');
const breadcrumb = document.getElementById('breadcrumb');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const uploadBtn = document.getElementById('uploadBtn');
const newFolderBtn = document.getElementById('newFolderBtn');
const uploadOverlay = document.getElementById('uploadOverlay');
const closeUpload = document.getElementById('closeUpload');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const uploadResults = document.getElementById('uploadResults');
const folderModal = document.getElementById('folderModal');
const closeFolderModal = document.getElementById('closeFolderModal');
const cancelFolder = document.getElementById('cancelFolder');
const createFolder = document.getElementById('createFolder');
const folderName = document.getElementById('folderName');
const previewModal = document.getElementById('previewModal');
const previewTitle = document.getElementById('previewTitle');
const previewBody = document.getElementById('previewBody');
const closePreview = document.getElementById('closePreview');
const downloadBtn = document.getElementById('downloadBtn');
const editBtn = document.getElementById('editBtn');
const saveBtn = document.getElementById('saveBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const saveBar = document.getElementById('saveBar');
const saveStatus = document.getElementById('saveStatus');
const fontControl = document.getElementById('fontControl');
const fontSizeSlider = document.getElementById('fontSizeSlider');
const fontSizeLabel = document.getElementById('fontSizeLabel');
const fontResetBtn = document.getElementById('fontResetBtn');
const cleanC2paBtn = document.getElementById('cleanC2paBtn');
const toast = document.getElementById('toast');

// ─── Load directory ───────────────────────────────────
async function loadDir(path) {
  currentPath = path || '';
  fileList.innerHTML = '<tr><td colspan="5" class="loading">Loading...</td></tr>';
  emptyState.style.display = 'none';

  try {
    const res = await fetch(`/api/list?path=${encodeURIComponent(path || '')}`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    renderFiles(data);
    renderBreadcrumb(data.breadcrumbs);
  } catch (err) {
    fileList.innerHTML = `<tr><td colspan="5" class="loading" style="color:var(--danger)">Error: ${err.message}</td></tr>`;
  }
}

function renderFiles(data) {
  if (!data.items || data.items.length === 0) {
    fileList.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  fileList.innerHTML = data.items.map(item => {
    const icon = item.icon;
    const name = item.name;
    const size = item.size_human || '-';
    const date = item.mtime ? new Date(item.mtime).toLocaleString() : '-';
    const pathEnc = encodeURIComponent(item.path);

    let rowClass = item.is_dir ? 'directory' : '';
    let clickAction = item.is_dir
      ? `onclick="loadDir('${item.path.replace(/'/g, "\\'")}')"`
      : `onclick="previewFile('${pathEnc}', '${escHtml(name).replace(/'/g, "\\'")}')"`;

    return `<tr class="${rowClass}" ${clickAction}>
      <td class="col-icon">${icon}</td>
      <td class="col-name">${escHtml(name)}</td>
      <td class="col-size">${size}</td>
      <td class="col-date">${date}</td>
      <td class="col-actions">
        <button class="action-btn" onclick="event.stopPropagation(); deleteItem('${pathEnc}', '${escHtml(name).replace(/'/g, "\\'")}')" title="Delete">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function renderBreadcrumb(breadcrumbs) {
  let html = '<a href="#" data-path="">🏠 Home</a>';
  let path = '';
  for (const crumb of breadcrumbs) {
    path = path ? `${path}/${crumb}` : crumb;
    html += ` <span>›</span> <a href="#" data-path="${path}">${escHtml(crumb)}</a>`;
  }
  breadcrumb.innerHTML = html;

  breadcrumb.querySelectorAll('a[data-path]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      loadDir(a.dataset.path);
    });
  });
}

// ─── Preview file ─────────────────────────────────────
async function previewFile(pathEnc, name) {
  currentFilePath = decodeURIComponent(pathEnc);
  previewTitle.textContent = name;
  previewBody.innerHTML = '<div class="preview-loading">Loading preview...</div>';
  previewModal.classList.add('active');
  isEditMode = false;
  editBtn.style.display = 'none';
  saveBar.style.display = 'none';
  fontControl.style.display = 'none';
  cleanC2paBtn.style.display = 'none';

  downloadBtn.onclick = () => {
    window.open(`/files/${encodeURIComponent(currentFilePath)}`, '_blank');
  };

  try {
    const res = await fetch(`/api/list?path=${encodeURIComponent(currentPath)}`);
    const data = await res.json();
    const item = data.items.find(i => i.path === currentFilePath);

    if (!item) {
      previewBody.innerHTML = '<div class="preview-fallback">File not found</div>';
      return;
    }

    currentPreviewType = item.preview_type || '';
    const fileUrl = `/files/${encodeURIComponent(currentFilePath)}`;

    switch (currentPreviewType) {
      case 'image':
        previewBody.innerHTML = `<img src="${fileUrl}" alt="${escHtml(name)}" onerror="this.parentElement.innerHTML='<div class=preview-fallback>Preview not available</div>'" />`;
        cleanC2paBtn.style.display = 'inline-block';
        break;
      case 'video':
        previewBody.innerHTML = `<video controls autoplay><source src="${fileUrl}" />Your browser does not support video.</video>`;
        break;
      case 'audio':
        previewBody.innerHTML = `<audio controls autoplay><source src="${fileUrl}" />Your browser does not support audio.</audio>`;
        break;
      case 'text':
        try {
          const textRes = await fetch(fileUrl);
          const text = await textRes.text();
          previewBody.innerHTML = `<pre id="textContent">${escHtml(text)}</pre>`;
          editBtn.style.display = 'inline-block';
          fontControl.style.display = 'flex';
          applyFontSize();
        } catch {
          previewBody.innerHTML = '<div class="preview-fallback">Could not load text content</div>';
        }
        break;
      case 'pdf':
        previewBody.innerHTML = `<iframe src="${fileUrl}" title="PDF viewer"></iframe>`;
        break;
      default:
        previewBody.innerHTML = `<div class="preview-fallback">Preview not available. <a href="${fileUrl}" download>Download file</a></div>`;
    }
  } catch (err) {
    previewBody.innerHTML = `<div class="preview-fallback">Error: ${err.message}</div>`;
  }
}

// ─── Font size control ────────────────────────────────
let savedFontSize = localStorage.getItem('ls-font-size') || 15;

function applyFontSize() {
  const pre = document.querySelector('#textContent');
  if (pre) pre.style.fontSize = savedFontSize + 'px';
  fontSizeSlider.value = savedFontSize;
  fontSizeLabel.textContent = savedFontSize + 'px';
}

fontSizeSlider.addEventListener('input', () => {
  savedFontSize = parseInt(fontSizeSlider.value);
  fontSizeLabel.textContent = savedFontSize + 'px';
  localStorage.setItem('ls-font-size', savedFontSize);
  const pre = document.querySelector('#textContent');
  if (pre) pre.style.fontSize = savedFontSize + 'px';
  // Also update textarea if in edit mode
  const editor = document.querySelector('.editor');
  if (editor) editor.style.fontSize = savedFontSize + 'px';
});

fontResetBtn.addEventListener('click', () => {
  savedFontSize = 15;
  localStorage.setItem('ls-font-size', '15');
  fontSizeSlider.value = 15;
  fontSizeLabel.textContent = '15px';
  applyFontSize();
});

// ─── Text Editor ──────────────────────────────────────
editBtn.addEventListener('click', enterEditMode);

async function enterEditMode() {
  try {
    const res = await fetch(`/api/content?path=${encodeURIComponent(currentFilePath)}`);
    if (!res.ok) throw new Error('Failed to load content');
    const data = await res.json();

    const textarea = document.createElement('textarea');
    textarea.className = 'editor';
    textarea.value = data.content;
    textarea.style.fontSize = savedFontSize + 'px';
    previewBody.innerHTML = '';
    previewBody.appendChild(textarea);

    isEditMode = true;
    editBtn.style.display = 'none';
    saveBar.style.display = 'flex';
    saveStatus.textContent = '';
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

cancelEditBtn.addEventListener('click', exitEditMode);

function exitEditMode() {
  isEditMode = false;
  saveBar.style.display = 'none';
  // Reload preview
  previewFile(encodeURIComponent(currentFilePath), previewTitle.textContent);
}

saveBtn.addEventListener('click', async () => {
  const editor = document.querySelector('.editor');
  if (!editor) return;

  const content = editor.value;
  saveStatus.textContent = 'Saving...';
  saveStatus.className = 'save-status';

  try {
    const res = await fetch('/api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentFilePath, content }),
    });
    if (!res.ok) throw new Error((await res.json()).error);

    saveStatus.textContent = '✅ Saved!';
    saveStatus.className = 'save-status saved';
    setTimeout(() => {
      exitEditMode();
    }, 1000);
  } catch (err) {
    saveStatus.textContent = `❌ Error: ${err.message}`;
    saveStatus.className = 'save-status error';
  }
});

// ─── Remove C2PA ──────────────────────────────────────
cleanC2paBtn.addEventListener('click', removeC2pa);

async function removeC2pa() {
  if (!confirm('Remove C2PA/metadata from this image? A new clean copy will be created.')) return;

  cleanC2paBtn.textContent = '⏳ Processing...';
  cleanC2paBtn.disabled = true;

  try {
    const res = await fetch('/api/remove-c2pa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentFilePath }),
    });
    if (!res.ok) throw new Error((await res.json()).error);

    const data = await res.json();
    showToast(`✅ Clean image created: ${data.file.name} (${data.file.size_human})`);
    // Refresh current directory to show new file
    loadDir(currentPath);
    // Close preview
    previewModal.classList.remove('active');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    cleanC2paBtn.textContent = '🧹 Remove C2PA';
    cleanC2paBtn.disabled = false;
  }
}

// ─── Delete item ──────────────────────────────────────
async function deleteItem(pathEnc, name) {
  if (!confirm(`Delete "${name}"?`)) return;

  try {
    const res = await fetch('/api/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: decodeURIComponent(pathEnc) }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    showToast(`Deleted: ${name}`);
    loadDir(currentPath);
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

// ─── Global drag & drop ───────────────────────────────
const globalDropOverlay = document.getElementById('globalDropOverlay');
let dragCounter = 0;

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  // Ignore drag events from child elements of the upload modal
  if (uploadOverlay.classList.contains('active')) return;
  dragCounter++;
  if (dragCounter === 1) {
    globalDropOverlay.classList.add('active');
  }
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  if (uploadOverlay.classList.contains('active')) return;
  dragCounter--;
  if (dragCounter === 0) {
    globalDropOverlay.classList.remove('active');
  }
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  globalDropOverlay.classList.remove('active');
  if (uploadOverlay.classList.contains('active')) return;

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    openUpload();
    uploadFiles(files);
  }
});

// ─── Upload ───────────────────────────────────────────
uploadBtn.addEventListener('click', () => openUpload());
closeUpload.addEventListener('click', () => closeUploadModal());
uploadOverlay.addEventListener('click', (e) => {
  if (e.target === uploadOverlay) closeUploadModal();
});

function openUpload() {
  uploadOverlay.classList.add('active');
  uploadProgress.style.display = 'none';
  uploadResults.style.display = 'none';
  uploadResults.innerHTML = '';
  dropzone.style.display = 'block';
}

function closeUploadModal() {
  uploadOverlay.classList.remove('active');
  fileInput.value = '';
}

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); uploadFiles(e.dataTransfer.files); });
fileInput.addEventListener('change', () => { if (fileInput.files.length) uploadFiles(fileInput.files); });

async function uploadFiles(files) {
  dropzone.style.display = 'none';
  uploadProgress.style.display = 'block';
  uploadResults.style.display = 'none';
  uploadResults.innerHTML = '';

  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  formData.append('_path', currentPath);

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = pct + '%';
        progressText.textContent = `Uploading... ${pct}%`;
      }
    };

    const result = await new Promise((resolve, reject) => {
      xhr.onload = () => {
        if (xhr.status === 200) resolve(JSON.parse(xhr.responseText));
        else reject(new Error(xhr.statusText));
      };
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(formData);
    });

    progressFill.style.width = '100%';
    progressText.textContent = 'Upload complete!';

    uploadResults.style.display = 'block';
    let html = '<h3 style="margin-bottom:8px;color:var(--success)">✅ Uploaded files:</h3><ul style="font-size:0.85rem;list-style:none">';
    for (const f of result.files) {
      html += `<li style="padding:4px 0">📄 ${escHtml(f.name)} (${f.size_human})</li>`;
    }
    html += '</ul>';
    uploadResults.innerHTML = html;

    setTimeout(() => {
      closeUploadModal();
      loadDir(currentPath);
    }, 2000);
  } catch (err) {
    progressText.textContent = `Error: ${err.message}`;
    progressText.style.color = 'var(--danger)';
  }
}

// ─── New Folder ───────────────────────────────────────
newFolderBtn.addEventListener('click', () => {
  folderName.value = '';
  folderModal.classList.add('active');
  setTimeout(() => folderName.focus(), 100);
});
closeFolderModal.addEventListener('click', () => folderModal.classList.remove('active'));
cancelFolder.addEventListener('click', () => folderModal.classList.remove('active'));
folderModal.addEventListener('click', (e) => {
  if (e.target === folderModal) folderModal.classList.remove('active');
});

folderName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createFolder.click();
});

createFolder.addEventListener('click', async () => {
  const name = folderName.value.trim();
  if (!name) { showToast('Please enter a folder name'); return; }

  try {
    const res = await fetch('/api/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentPath, name }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    folderModal.classList.remove('active');
    showToast(`Created folder: ${name}`);
    loadDir(currentPath);
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
});

// ─── Preview modal close ──────────────────────────────
closePreview.addEventListener('click', () => previewModal.classList.remove('active'));
previewModal.addEventListener('click', (e) => {
  if (e.target === previewModal) previewModal.classList.remove('active');
});

// ─── Search ───────────────────────────────────────────
let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const q = searchInput.value.trim();
    if (q) searchFiles(q);
    else loadDir(currentPath);
  }, 300);
});

async function searchFiles(q) {
  fileList.innerHTML = '<tr><td colspan="5" class="loading">Searching...</td></tr>';
  emptyState.style.display = 'none';

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();

    if (data.items.length === 0) {
      fileList.innerHTML = '<tr><td colspan="5" class="loading">No results found</td></tr>';
      return;
    }

    fileList.innerHTML = data.items.map(item => {
      const clickAction = item.is_dir
        ? `onclick="loadDir('${item.path.replace(/'/g, "\\'")}')"`
        : `onclick="previewFile('${encodeURIComponent(item.path)}', '${escHtml(item.name).replace(/'/g, "\\'")}')"`;
      return `<tr class="${item.is_dir ? 'directory' : ''}" ${clickAction}>
        <td class="col-icon">${item.icon}</td>
        <td class="col-name">${escHtml(item.name)}</td>
        <td class="col-size">${item.size_human || '-'}</td>
        <td class="col-date">-</td>
        <td class="col-actions"></td>
      </tr>`;
    }).join('');
  } catch (err) {
    fileList.innerHTML = `<tr><td colspan="5" class="loading" style="color:var(--danger)">Search error: ${err.message}</td></tr>`;
  }
}

// ─── Toast ────────────────────────────────────────────
function showToast(msg, type = 'info') {
  toast.textContent = msg;
  toast.style.borderColor = type === 'error' ? 'var(--danger)' : 'var(--success)';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── Utility ──────────────────────────────────────────
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Keyboard shortcuts ──────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (isEditMode) {
      exitEditMode();
      return;
    }
    previewModal.classList.remove('active');
    folderModal.classList.remove('active');
    closeUploadModal();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    if (isEditMode) {
      e.preventDefault();
      saveBtn.click();
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
    e.preventDefault();
    openUpload();
  }
});

// ─── Init ─────────────────────────────────────────────
loadDir('');
