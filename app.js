'use strict';

// ===== 状態管理 =====
const state = {
  stream: null,
  facingMode: 'environment',
  pages: [],           // { dataUrl, filter, brightness, contrast }
  editingImage: null,  // 編集中の生DataURL
  editFilter: 'none',
  editBrightness: 0,
  editContrast: 0,
  previewIndex: -1,
};

// ===== DOM =====
const video        = document.getElementById('video');
const captureBtn   = document.getElementById('captureBtn');
const switchCamera = document.getElementById('switchCamera');
const galleryPickBtn = document.getElementById('galleryPickBtn');
const fileInput    = document.getElementById('fileInput');
const exportBtn    = document.getElementById('exportBtn');
const pageCount    = document.getElementById('pageCount');

const cameraSection = document.getElementById('cameraSection');
const editSection   = document.getElementById('editSection');
const pagesSection  = document.getElementById('pagesSection');
const pagesGrid     = document.getElementById('pagesGrid');
const emptyState    = document.getElementById('emptyState');
const clearAllBtn   = document.getElementById('clearAllBtn');

const editCanvas    = document.getElementById('editCanvas');
const cancelEdit    = document.getElementById('cancelEdit');
const confirmEdit   = document.getElementById('confirmEdit');
const brightnessSlider = document.getElementById('brightness');
const contrastSlider   = document.getElementById('contrast');
const brightnessVal    = document.getElementById('brightnessVal');
const contrastVal      = document.getElementById('contrastVal');

const previewModal  = document.getElementById('previewModal');
const previewImg    = document.getElementById('previewImg');
const previewTitle  = document.getElementById('previewTitle');
const closeModal    = document.getElementById('closeModal');
const deletePageBtn = document.getElementById('deletePageBtn');
const downloadPageBtn = document.getElementById('downloadPageBtn');
const modalBackdrop = document.getElementById('modalBackdrop');

const loadingOverlay = document.getElementById('loadingOverlay');

// ===== カメラ起動 =====
async function startCamera() {
  try {
    if (state.stream) {
      state.stream.getTracks().forEach(t => t.stop());
    }
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facingMode, width: { ideal: 1920 }, height: { ideal: 2560 } },
      audio: false,
    });
    video.srcObject = state.stream;
  } catch (e) {
    console.warn('Camera unavailable:', e);
    // カメラ非対応環境向けフォールバック
    video.style.background = '#111';
    document.querySelector('.camera-tip').textContent = 'カメラが利用できません。ギャラリーから画像を選択してください。';
  }
}

switchCamera.addEventListener('click', () => {
  state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
  startCamera();
});

// ===== 撮影 =====
captureBtn.addEventListener('click', () => {
  const canvas = document.createElement('canvas');
  canvas.width  = video.videoWidth  || 1080;
  canvas.height = video.videoHeight || 1440;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  openEditor(canvas.toDataURL('image/jpeg', 0.95));
});

// ===== ギャラリーから選択 =====
galleryPickBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => openEditor(ev.target.result);
  reader.readAsDataURL(file);
  fileInput.value = '';
});

// ===== 編集画面 =====
function openEditor(dataUrl) {
  state.editingImage   = dataUrl;
  state.editFilter     = 'none';
  state.editBrightness = 0;
  state.editContrast   = 0;
  brightnessSlider.value = 0;
  contrastSlider.value   = 0;
  brightnessVal.textContent = '0';
  contrastVal.textContent   = '0';
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === 'none'));

  cameraSection.classList.add('hidden');
  editSection.classList.remove('hidden');
  renderEditCanvas();
}

function renderEditCanvas() {
  const img = new Image();
  img.onload = () => {
    const maxW = editCanvas.parentElement.clientWidth - 16;
    const maxH = editCanvas.parentElement.clientHeight - 16;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    editCanvas.width  = img.width  * scale;
    editCanvas.height = img.height * scale;
    const ctx = editCanvas.getContext('2d');

    // フィルター適用
    ctx.filter = buildFilter(state.editFilter, state.editBrightness, state.editContrast);
    ctx.drawImage(img, 0, 0, editCanvas.width, editCanvas.height);
    ctx.filter = 'none';
  };
  img.src = state.editingImage;
}

function buildFilter(filter, brightness, contrast) {
  const b = `brightness(${1 + brightness / 100})`;
  const c = `contrast(${1 + contrast / 100})`;
  switch (filter) {
    case 'mono':  return `grayscale(1) ${b} ${c}`;
    case 'doc':   return `grayscale(1) contrast(${1.6 + contrast / 100}) brightness(${1.1 + brightness / 100})`;
    case 'vivid': return `saturate(1.5) ${c} ${b}`;
    default:      return `${b} ${c}`;
  }
}

brightnessSlider.addEventListener('input', () => {
  state.editBrightness = +brightnessSlider.value;
  brightnessVal.textContent = brightnessSlider.value;
  renderEditCanvas();
});

contrastSlider.addEventListener('input', () => {
  state.editContrast = +contrastSlider.value;
  contrastVal.textContent = contrastSlider.value;
  renderEditCanvas();
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.editFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderEditCanvas();
  });
});

cancelEdit.addEventListener('click', () => {
  editSection.classList.add('hidden');
  cameraSection.classList.remove('hidden');
  state.editingImage = null;
});

confirmEdit.addEventListener('click', () => {
  // 最終レンダリング（フルサイズ）
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width  = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.filter = buildFilter(state.editFilter, state.editBrightness, state.editContrast);
    ctx.drawImage(img, 0, 0);
    ctx.filter = 'none';
    const finalUrl = canvas.toDataURL('image/jpeg', 0.92);
    addPage(finalUrl);
    editSection.classList.add('hidden');
    cameraSection.classList.remove('hidden');
    state.editingImage = null;
  };
  img.src = state.editingImage;
});

// ===== ページ追加 =====
function addPage(dataUrl) {
  state.pages.push(dataUrl);
  renderPages();
  updateExportBtn();
}

function renderPages() {
  // サムネイルのみ更新（全再描画）
  const existing = pagesGrid.querySelectorAll('.page-thumb');
  existing.forEach(e => e.remove());

  if (state.pages.length === 0) {
    emptyState.style.display = '';
    clearAllBtn.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  clearAllBtn.style.display = '';

  state.pages.forEach((url, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'page-thumb';
    thumb.innerHTML = `
      <img src="${url}" alt="ページ ${i + 1}" loading="lazy">
      <span class="page-num">${i + 1}</span>
      <button class="page-del" data-idx="${i}" title="削除">×</button>
    `;
    thumb.addEventListener('click', e => {
      if (e.target.classList.contains('page-del')) return;
      openPreview(i);
    });
    thumb.querySelector('.page-del').addEventListener('click', e => {
      e.stopPropagation();
      deletePage(i);
    });
    pagesGrid.appendChild(thumb);
  });
}

function deletePage(idx) {
  state.pages.splice(idx, 1);
  renderPages();
  updateExportBtn();
}

clearAllBtn.addEventListener('click', () => {
  if (confirm(`${state.pages.length}枚のページをすべて削除しますか？`)) {
    state.pages = [];
    renderPages();
    updateExportBtn();
  }
});

// ===== プレビューモーダル =====
function openPreview(idx) {
  state.previewIndex = idx;
  previewImg.src = state.pages[idx];
  previewTitle.textContent = `ページ ${idx + 1} / ${state.pages.length}`;
  previewModal.classList.remove('hidden');
}

closeModal.addEventListener('click', () => previewModal.classList.add('hidden'));
modalBackdrop.addEventListener('click', () => previewModal.classList.add('hidden'));

deletePageBtn.addEventListener('click', () => {
  deletePage(state.previewIndex);
  previewModal.classList.add('hidden');
});

downloadPageBtn.addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = state.pages[state.previewIndex];
  a.download = `scan_page_${state.previewIndex + 1}.jpg`;
  a.click();
});

// ===== PDF出力 =====
function updateExportBtn() {
  const n = state.pages.length;
  exportBtn.disabled = n === 0;
  pageCount.textContent = n;
}

exportBtn.addEventListener('click', async () => {
  if (state.pages.length === 0) return;
  loadingOverlay.classList.remove('hidden');
  await new Promise(r => setTimeout(r, 50)); // UIを更新させる

  try {
    const { jsPDF } = window.jspdf;

    for (let i = 0; i < state.pages.length; i++) {
      const imgData = state.pages[i];
      const img = await loadImage(imgData);
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;

      // A4サイズ（mm）に合わせる
      const a4w = 210, a4h = 297;
      const ratio = Math.min(a4w / iw, a4h / ih);
      const pw = iw * ratio, ph = ih * ratio;
      const ox = (a4w - pw) / 2, oy = (a4h - ph) / 2;

      const pdf = i === 0
        ? new jsPDF({ orientation: pw > ph ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
        : null;

      if (i === 0) {
        pdf.addImage(imgData, 'JPEG', ox, oy, pw, ph);
        // 以降のページを追加
        for (let j = 1; j < state.pages.length; j++) {
          const imgJ = await loadImage(state.pages[j]);
          const iwj = imgJ.naturalWidth, ihj = imgJ.naturalHeight;
          const ratioj = Math.min(a4w / iwj, a4h / ihj);
          const pwj = iwj * ratioj, phj = ihj * ratioj;
          const oxj = (a4w - pwj) / 2, oyj = (a4h - phj) / 2;
          pdf.addPage();
          pdf.addImage(state.pages[j], 'JPEG', oxj, oyj, pwj, phj);
        }
        const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g, '-');
        pdf.save(`scan_${ts}.pdf`);
        break;
      }
    }
  } catch (e) {
    console.error('PDF生成エラー:', e);
    alert('PDF生成に失敗しました。もう一度お試しください。');
  } finally {
    loadingOverlay.classList.add('hidden');
  }
});

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ===== 初期化 =====
startCamera();
renderPages();
updateExportBtn();
