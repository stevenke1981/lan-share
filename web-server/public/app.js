/* ─── LAN Share — Frontend App ──────────────────────── */

let currentPath = '';
let isEditMode = false;
let currentFilePath = '';
let currentPreviewType = '';
let isImageEditorOpen = false;

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
const editTextBtn = document.getElementById('editTextBtn');
const editImageBtn = document.getElementById('editImageBtn');
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

// ─── Image Editor DOM refs ────────────────────────────
const imgEditorToolbar = document.getElementById('imgEditorToolbar');
const imgEditorCanvas = document.getElementById('imgEditorCanvas');
const imageCanvas = document.getElementById('imageCanvas');
const ctx = imageCanvas.getContext('2d');
const editorColor = document.getElementById('editorColor');
const editorFillColor = document.getElementById('editorFillColor');
const editorLineWidth = document.getElementById('editorLineWidth');
const editorFontSize = document.getElementById('editorFontSize');
const editorFontSizeGroup = document.getElementById('editorFontSizeGroup');
const editorUndo = document.getElementById('editorUndo');
const editorClear = document.getElementById('editorClear');
const editorSaveImg = document.getElementById('editorSaveImg');
const editorCancel = document.getElementById('editorCancel');
const editorZoomInfo = document.getElementById('editorZoomInfo');
const globalDropOverlay = document.getElementById('globalDropOverlay');

// ─── Image Editor State ───────────────────────────────
let imgEditor = {
  image: null,             // original Image object
  imgWidth: 0,             // natural image dimensions
  imgHeight: 0,
  actions: [],             // drawing actions
  scale: 1,                // zoom level
  offsetX: 0,              // pan offset
  offsetY: 0,
  activeTool: 'pan',       // pen, line, arrow, text, rect, circle
  isDrawing: false,
  drawStart: null,         // {x, y} in image coords for current drawing
  currentText: null,       // temp text being placed
  dragStartX: 0,
  dragStartY: 0,
  dragStartOffX: 0,
  dragStartOffY: 0,
  isDragging: false,
  needsRender: true,
};

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
    const escName = escHtml(name).replace(/'/g, "\\'");

    let rowClass = item.is_dir ? 'directory' : '';
    let clickAction = item.is_dir
      ? `onclick="loadDir('${item.path.replace(/'/g, "\\'")}')"`
      : `onclick="previewFile('${pathEnc}', '${escName}')"`;

    return `<tr class="${rowClass}" ${clickAction}>
      <td class="col-icon">${icon}</td>
      <td class="col-name">${escHtml(name)}</td>
      <td class="col-size">${size}</td>
      <td class="col-date">${date}</td>
      <td class="col-actions">
        <button class="action-btn" onclick="event.stopPropagation(); deleteItem('${pathEnc}', '${escName}')" title="Delete">🗑️</button>
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
    a.addEventListener('click', (e) => { e.preventDefault(); loadDir(a.dataset.path); });
  });
}

// ─── Preview file ─────────────────────────────────────
async function previewFile(pathEnc, name) {
  currentFilePath = decodeURIComponent(pathEnc);
  previewTitle.textContent = name;
  previewBody.innerHTML = '<div class="preview-loading">Loading preview...</div>';
  previewModal.classList.add('active');
  isEditMode = false;
  editTextBtn.style.display = 'none';
  editImageBtn.style.display = 'none';
  cleanC2paBtn.style.display = 'none';
  saveBar.style.display = 'none';
  fontControl.style.display = 'none';

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
        editImageBtn.style.display = 'inline-block';
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
          editTextBtn.style.display = 'inline-block';
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
editTextBtn.addEventListener('click', enterEditMode);

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
    editTextBtn.style.display = 'none';
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
    setTimeout(() => exitEditMode(), 1000);
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
    loadDir(currentPath);
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

// ═══════════════════════════════════════════════════════
// IMAGE EDITOR
// ═══════════════════════════════════════════════════════

// ─── Open Image Editor ────────────────────────────────
editImageBtn.addEventListener('click', openImageEditor);

function openImageEditor() {
  const img = previewBody.querySelector('img');
  if (!img) {
    showToast('No image to edit', 'error');
    return;
  }

  isImageEditorOpen = true;
  // Hide preview modal entirely — full-screen editor takes over
  previewModal.style.display = 'none';

  // Reuse the fixed canvas (already in DOM)
  imgEditor.image = new Image();
  imgEditor.image.onload = () => {
    imgEditor.imgWidth = imgEditor.image.naturalWidth;
    imgEditor.imgHeight = imgEditor.image.naturalHeight;
    imgEditor.actions = [];
    imgEditor.scale = 1;
    imgEditor.offsetX = 0;
    imgEditor.offsetY = 0;

    // Show toolbar + canvas
    imgEditorToolbar.style.display = 'flex';
    imgEditorCanvas.classList.add('active');

    // Must wait a frame for layout
    requestAnimationFrame(() => {
      resizeCanvas();
      fitToScreen();
      renderCanvas();
    });
  };
  imgEditor.image.onerror = () => {
    showToast('Failed to load image for editing', 'error');
    closeImageEditor();
  };
  // Use the image src from the preview
  imgEditor.image.src = img.src;
}

function closeImageEditor() {
  isImageEditorOpen = false;
  imgEditorToolbar.style.display = 'none';
  imgEditorCanvas.classList.remove('active');
  previewModal.style.display = '';
  reloadPreview();
}

// Reload the preview content after closing editor
function reloadPreview() {
  previewBody.innerHTML = '<div class="preview-loading">Loading preview...</div>';
  previewFile(encodeURIComponent(currentFilePath), previewTitle.textContent);
}

// ─── Canvas sizing ────────────────────────────────────
function resizeCanvas() {
  const rect = imgEditorCanvas.getBoundingClientRect();
  imageCanvas.width = Math.max(rect.width, 100);
  imageCanvas.height = Math.max(rect.height, 100);
  imgEditor.needsRender = true;
}

function fitToScreen() {
  const rect = imgEditorCanvas.getBoundingClientRect();
  const pad = 40;
  const availW = rect.width - pad * 2;
  const availH = rect.height - pad * 2;
  const scaleX = availW / imgEditor.imgWidth;
  const scaleY = availH / imgEditor.imgHeight;
  imgEditor.scale = Math.min(scaleX, scaleY, 2); // cap at 2x
  imgEditor.offsetX = (rect.width - imgEditor.imgWidth * imgEditor.scale) / 2;
  imgEditor.offsetY = (rect.height - imgEditor.imgHeight * imgEditor.scale) / 2;
  updateZoomInfo();
}

// ─── Render ───────────────────────────────────────────
function renderCanvas() {
  const w = imageCanvas.width;
  const h = imageCanvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.save();
  ctx.translate(imgEditor.offsetX, imgEditor.offsetY);
  ctx.scale(imgEditor.scale, imgEditor.scale);

  // Draw image
  if (imgEditor.image) {
    ctx.drawImage(imgEditor.image, 0, 0);
  }

  // Draw all actions
  for (const action of imgEditor.actions) {
    drawAction(ctx, action, 1 / imgEditor.scale);
  }

  // Draw current in-progress action
  if (imgEditor.isDrawing && imgEditor.drawStart) {
    const tempAction = {
      type: imgEditor.activeTool,
      color: editorColor.value,
      fillColor: editorFillColor.value,
      lineWidth: parseInt(editorLineWidth.value),
      fontSize: parseInt(editorFontSize.value),
      points: [imgEditor.drawStart, imgEditor.mousePos],
    };
    drawAction(ctx, tempAction, 1 / imgEditor.scale);
  }

  ctx.restore();
  imgEditor.needsRender = false;
}

function drawAction(context, action, invScale) {
  const lw = Math.max(1, action.lineWidth * invScale);
  context.lineWidth = lw;
  context.strokeStyle = action.color;
  context.fillStyle = action.fillColor;
  context.font = `${Math.max(8, action.fontSize * invScale)}px sans-serif`;
  context.textBaseline = 'top';
  context.lineJoin = 'round';
  context.lineCap = 'round';

  switch (action.type) {
    case 'line': {
      if (action.points.length < 2) break;
      context.beginPath();
      context.moveTo(action.points[0].x, action.points[0].y);
      for (let i = 1; i < action.points.length; i++) {
        context.lineTo(action.points[i].x, action.points[i].y);
      }
      context.stroke();
      break;
    }
    case 'arrow': {
      if (action.points.length < 2) break;
      const p1 = action.points[0];
      const p2 = action.points[1];
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const headLen = Math.max(8, 12 * invScale);
      context.beginPath();
      context.moveTo(p1.x, p1.y);
      context.lineTo(p2.x, p2.y);
      context.stroke();
      // Arrowhead
      context.beginPath();
      context.moveTo(p2.x, p2.y);
      context.lineTo(p2.x - headLen * Math.cos(angle - 0.4), p2.y - headLen * Math.sin(angle - 0.4));
      context.lineTo(p2.x - headLen * Math.cos(angle + 0.4), p2.y - headLen * Math.sin(angle + 0.4));
      context.closePath();
      context.fillStyle = action.color;
      context.fill();
      break;
    }
    case 'rect': {
      if (action.points.length < 1) break;
      const p1 = action.points[0];
      const p2 = action.points.length > 1 ? action.points[1] : p1;
      const x = Math.min(p1.x, p2.x);
      const y = Math.min(p1.y, p2.y);
      const w = Math.abs(p2.x - p1.x);
      const h = Math.abs(p2.y - p1.y);
      // Fill first
      if (action.fillColor && action.fillColor !== 'transparent') {
        context.fillStyle = action.fillColor;
        context.fillRect(x, y, w, h);
        context.fillStyle = action.color;
      }
      context.strokeRect(x, y, w, h);
      break;
    }
    case 'circle': {
      if (action.points.length < 1) break;
      const c1 = action.points[0];
      const c2 = action.points.length > 1 ? action.points[1] : c1;
      const rx = Math.abs(c2.x - c1.x) / 2;
      const ry = Math.abs(c2.y - c1.y) / 2;
      const cx = (c1.x + c2.x) / 2;
      const cy = (c1.y + c2.y) / 2;
      context.beginPath();
      context.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
      if (action.fillColor && action.fillColor !== 'transparent') {
        context.fillStyle = action.fillColor;
        context.fill();
        context.fillStyle = action.color;
      }
      context.stroke();
      break;
    }
    case 'text': {
      if (action.text && action.points.length > 0) {
        const p = action.points[0];
        if (action.fillColor && action.fillColor !== 'transparent') {
          context.fillStyle = action.fillColor;
          context.fillText(action.text, p.x + 2, p.y + 2);
          context.fillStyle = action.color;
        }
        context.fillText(action.text, p.x, p.y);
      }
      break;
    }
  }
}

// ─── Coordinate conversion ────────────────────────────
function screenToImage(clientX, clientY) {
  const rect = imgEditorCanvas.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  return {
    x: (sx - imgEditor.offsetX) / imgEditor.scale,
    y: (sy - imgEditor.offsetY) / imgEditor.scale,
  };
}

// ─── Tool selection ───────────────────────────────────
imgEditorToolbar.querySelectorAll('[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    imgEditorToolbar.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    imgEditor.activeTool = btn.dataset.tool;
    imgEditorCanvas.style.cursor = btn.dataset.tool === 'pan' ? 'grab' : 'crosshair';
    editorFontSizeGroup.style.display = btn.dataset.tool === 'text' ? 'flex' : 'none';
  });
});
// Default: pan tool active
document.querySelector('[data-tool="pan"]').classList.add('active');

// ─── Mouse events ─────────────────────────────────────
imageCanvas.addEventListener('mousedown', onMouseDown);
imageCanvas.addEventListener('mousemove', onMouseMove);
imageCanvas.addEventListener('mouseup', onMouseUp);
imageCanvas.addEventListener('wheel', onWheel, { passive: false });
imageCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Touch events for mobile
imageCanvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  onMouseDown({ clientX: t.clientX, clientY: t.clientY, ctrlKey: false });
});
imageCanvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  onMouseMove({ clientX: t.clientX, clientY: t.clientY });
});
imageCanvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  onMouseUp({});
});

function onMouseDown(e) {
  if (imgEditor.activeTool === 'pan') {
    imgEditor.isDragging = true;
    imgEditor.dragStartX = e.clientX;
    imgEditor.dragStartY = e.clientY;
    imgEditor.dragStartOffX = imgEditor.offsetX;
    imgEditor.dragStartOffY = imgEditor.offsetY;
    imgEditorCanvas.classList.add('dragging');
    return;
  }

  // Drawing tool
  const imgPos = screenToImage(e.clientX, e.clientY);

  // For text tool, place text immediately
  if (imgEditor.activeTool === 'text') {
    const text = prompt('Enter text:');
    if (text && text.trim()) {
      imgEditor.actions.push({
        type: 'text',
        color: editorColor.value,
        fillColor: editorFillColor.value,
        lineWidth: parseInt(editorLineWidth.value),
        fontSize: parseInt(editorFontSize.value),
        points: [{ x: imgPos.x, y: imgPos.y }],
        text: text.trim(),
      });
      renderCanvas();
    }
    return;
  }

  // For drawing tools (line, arrow, rect, circle)
  imgEditor.isDrawing = true;
  imgEditor.drawStart = { x: imgPos.x, y: imgPos.y };
  imgEditor.mousePos = { x: imgPos.x, y: imgPos.y };
}

function onMouseMove(e) {
  if (imgEditor.isDragging) {
    const dx = e.clientX - imgEditor.dragStartX;
    const dy = e.clientY - imgEditor.dragStartY;
    imgEditor.offsetX = imgEditor.dragStartOffX + dx;
    imgEditor.offsetY = imgEditor.dragStartOffY + dy;
    renderCanvas();
    return;
  }

  if (imgEditor.isDrawing) {
    const imgPos = screenToImage(e.clientX, e.clientY);
    imgEditor.mousePos = imgPos;
    renderCanvas();
  }
}

function onMouseUp(e) {
  if (imgEditor.isDragging) {
    imgEditor.isDragging = false;
    imgEditorCanvas.classList.remove('dragging');
    return;
  }

  if (imgEditor.isDrawing && imgEditor.drawStart) {
    const imgPos = imgEditor.mousePos;
    const dist = Math.sqrt(
      Math.pow(imgPos.x - imgEditor.drawStart.x, 2) +
      Math.pow(imgPos.y - imgEditor.drawStart.y, 2)
    );
    // Only add if dragged more than 5px (avoid accidental clicks)
    if (dist > 5) {
      imgEditor.actions.push({
        type: imgEditor.activeTool,
        color: editorColor.value,
        fillColor: editorFillColor.value,
        lineWidth: parseInt(editorLineWidth.value),
        fontSize: parseInt(editorFontSize.value),
        points: [
          { x: imgEditor.drawStart.x, y: imgEditor.drawStart.y },
          { x: imgPos.x, y: imgPos.y },
        ],
      });
    }
    imgEditor.isDrawing = false;
    imgEditor.drawStart = null;
    renderCanvas();
  }
}

function onWheel(e) {
  e.preventDefault();
  const rect = imgEditorCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const oldScale = imgEditor.scale;
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  imgEditor.scale = Math.max(0.1, Math.min(20, imgEditor.scale * delta));

  // Zoom towards mouse position
  imgEditor.offsetX = mx - (mx - imgEditor.offsetX) * (imgEditor.scale / oldScale);
  imgEditor.offsetY = my - (my - imgEditor.offsetY) * (imgEditor.scale / oldScale);

  updateZoomInfo();
  renderCanvas();
}

function updateZoomInfo() {
  editorZoomInfo.textContent = Math.round(imgEditor.scale * 100) + '%';
}

// ─── Undo / Clear ─────────────────────────────────────
editorUndo.addEventListener('click', () => {
  if (imgEditor.actions.length === 0) return;
  imgEditor.actions.pop();
  renderCanvas();
});

editorClear.addEventListener('click', () => {
  if (imgEditor.actions.length === 0) return;
  if (!confirm('Clear all drawings?')) return;
  imgEditor.actions = [];
  renderCanvas();
});

// ─── Cancel editor ────────────────────────────────────
editorCancel.addEventListener('click', closeImageEditor);

// ─── Save edited image ────────────────────────────────
editorSaveImg.addEventListener('click', saveEditedImage);

async function saveEditedImage() {
  editorSaveImg.textContent = '⏳ Saving...';
  editorSaveImg.disabled = true;

  try {
    // Create offscreen canvas at full resolution
    const offscreen = document.createElement('canvas');
    offscreen.width = imgEditor.imgWidth;
    offscreen.height = imgEditor.imgHeight;
    const offCtx = offscreen.getContext('2d');

    // Draw original image
    offCtx.drawImage(imgEditor.image, 0, 0);

    // Draw all actions at full resolution
    for (const action of imgEditor.actions) {
      const scaledAction = JSON.parse(JSON.stringify(action));
      // Points and sizes are already in image coordinates (not scaled)
      drawAction(offCtx, action, 1);
    }

    // Export as data URL (use PNG for lossless)
    const dataUrl = offscreen.toDataURL('image/png');

    // Upload to server
    const res = await fetch('/api/upload-edited', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentFilePath, dataUrl }),
    });

    if (!res.ok) throw new Error((await res.json()).error);
    const result = await res.json();

    showToast(`✅ Edited image saved: ${result.file.name} (${result.file.size_human})`);
    closeImageEditor();
    loadDir(currentPath);
    previewModal.classList.remove('active');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    editorSaveImg.textContent = '💾 Save Image';
    editorSaveImg.disabled = false;
  }
}

// ─── Keyboard shortcuts (image editor) ────────────────
// Note: added to the global handler below

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

// ─── Global drag & drop ───────────────────────────────
let dragCounter = 0;

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  if (uploadOverlay.classList.contains('active') || isImageEditorOpen) return;
  dragCounter++;
  if (dragCounter === 1) globalDropOverlay.classList.add('active');
});

document.addEventListener('dragover', (e) => { e.preventDefault(); });

document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  if (uploadOverlay.classList.contains('active') || isImageEditorOpen) return;
  dragCounter--;
  if (dragCounter === 0) globalDropOverlay.classList.remove('active');
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  globalDropOverlay.classList.remove('active');
  if (uploadOverlay.classList.contains('active') || isImageEditorOpen) return;
  const files = e.dataTransfer.files;
  if (files.length > 0) { openUpload(); uploadFiles(files); }
});

async function uploadFiles(files) {
  dropzone.style.display = 'none';
  uploadProgress.style.display = 'block';
  uploadResults.style.display = 'none';
  uploadResults.innerHTML = '';

  const formData = new FormData();
  for (const file of files) formData.append('files', file);

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
      html += `<li style="padding:4px 0">📄 ${escHtml(f.name)} (${f.size_human}) → ${escHtml(f.path)}</li>`;
    }
    html += '</ul>';
    uploadResults.innerHTML = html;
    setTimeout(() => { closeUploadModal(); loadDir(currentPath); }, 2000);
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
  } catch (err) { showToast(`Error: ${err.message}`, 'error'); }
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
    if (isImageEditorOpen) { closeImageEditor(); return; }
    if (isEditMode) { exitEditMode(); return; }
    previewModal.classList.remove('active');
    folderModal.classList.remove('active');
    closeUploadModal();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    if (isEditMode) { e.preventDefault(); saveBtn.click(); return; }
    if (isImageEditorOpen) { e.preventDefault(); editorSaveImg.click(); }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    if (isImageEditorOpen) { e.preventDefault(); editorUndo.click(); }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
    e.preventDefault();
    openUpload();
  }
  // Image editor zoom shortcuts
  if (isImageEditorOpen) {
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      imgEditor.scale = Math.min(20, imgEditor.scale * 1.2);
      updateZoomInfo();
      renderCanvas();
    }
    if (e.key === '-') {
      e.preventDefault();
      imgEditor.scale = Math.max(0.1, imgEditor.scale * 0.8);
      updateZoomInfo();
      renderCanvas();
    }
    if (e.key === '0') {
      e.preventDefault();
      fitToScreen();
      renderCanvas();
    }
  }
});

// ─── Window resize ────────────────────────────────────
window.addEventListener('resize', () => {
  if (isImageEditorOpen) {
    resizeCanvas();
    renderCanvas();
  }
});

// ─── Init ─────────────────────────────────────────────
loadDir('');
