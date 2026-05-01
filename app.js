'use strict';

// ===== 状態 =====
const state = {
  stream: null,
  facingMode: 'environment',
  pages: [],
  rawDataUrl: null,       // 撮影した生画像
  correctedDataUrl: null, // 透視補正後の画像
};

// ===== DOM =====
const video          = document.getElementById('video');
const captureBtn     = document.getElementById('captureBtn');
const switchCamera   = document.getElementById('switchCamera');
const galleryPickBtn = document.getElementById('galleryPickBtn');
const fileInput      = document.getElementById('fileInput');
const exportBtn      = document.getElementById('exportBtn');
const pageCountEl    = document.getElementById('pageCount');

const cameraSection = document.getElementById('cameraSection');
const cropSection   = document.getElementById('cropSection');
const editSection   = document.getElementById('editSection');
const pagesSection  = document.getElementById('pagesSection');
const pagesGrid     = document.getElementById('pagesGrid');
const emptyState    = document.getElementById('emptyState');
const clearAllBtn   = document.getElementById('clearAllBtn');

const loadingOverlay = document.getElementById('loadingOverlay');
const loadingMsg     = document.getElementById('loadingMsg');

// ===== カメラ =====
async function startCamera() {
  try {
    if (state.stream) state.stream.getTracks().forEach(t => t.stop());
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facingMode, width: { ideal: 1920 }, height: { ideal: 2560 } },
      audio: false,
    });
    video.srcObject = state.stream;
  } catch (e) {
    document.querySelector('.camera-tip').textContent = 'カメラが利用できません。ファイルボタンから画像を選択してください。';
  }
}

switchCamera.addEventListener('click', () => {
  state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
  startCamera();
});

captureBtn.addEventListener('click', () => {
  const c = document.createElement('canvas');
  c.width = video.videoWidth || 1080;
  c.height = video.videoHeight || 1440;
  c.getContext('2d').drawImage(video, 0, 0);
  openCropEditor(c.toDataURL('image/jpeg', 0.95));
});

galleryPickBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => openCropEditor(ev.target.result);
  reader.readAsDataURL(file);
  fileInput.value = '';
});

// =====================================================================
// 透視補正 — コーナー選択 UI
// =====================================================================
const cropCanvas = document.getElementById('cropCanvas');
const cropCtx    = cropCanvas.getContext('2d');
const HANDLE_R   = 24;  // タッチしやすいサイズ

let cropImg     = null;
let cropImgRect = null; // {x, y, w, h} キャンバス内の画像描画領域
let cropCorners = [];   // [{x,y}] × 4  [TL, TR, BR, BL] in canvas coords
let activeDrag  = -1;

function showSection(name) {
  cameraSection.classList.toggle('hidden', name !== 'camera');
  cropSection.classList.toggle('hidden',   name !== 'crop');
  editSection.classList.toggle('hidden',   name !== 'edit');
}

function openCropEditor(dataUrl) {
  state.rawDataUrl = dataUrl;
  cropImg = new Image();
  cropImg.onload = () => {
    const wrap = document.getElementById('cropWrap');
    // キャンバスをラッパーに合わせる
    cropCanvas.width  = wrap.clientWidth;
    cropCanvas.height = wrap.clientHeight;

    // 画像を中央にフィット（パディング付き）
    const PAD = 20;
    const scale = Math.min(
      (cropCanvas.width  - PAD * 2) / cropImg.naturalWidth,
      (cropCanvas.height - PAD * 2) / cropImg.naturalHeight
    );
    const iw = cropImg.naturalWidth  * scale;
    const ih = cropImg.naturalHeight * scale;
    cropImgRect = { x: (cropCanvas.width - iw) / 2, y: (cropCanvas.height - ih) / 2, w: iw, h: ih };

    resetCropCorners();
    showSection('crop');
    renderCropCanvas();
  };
  cropImg.src = dataUrl;
}

function resetCropCorners() {
  const { x, y, w, h } = cropImgRect;
  const P = 0.06;
  cropCorners = [
    { x: x + w * P,       y: y + h * P       }, // TL
    { x: x + w * (1 - P), y: y + h * P       }, // TR
    { x: x + w * (1 - P), y: y + h * (1 - P) }, // BR
    { x: x + w * P,       y: y + h * (1 - P) }, // BL
  ];
}

// ----- キャンバス描画 -----
function renderCropCanvas() {
  const ctx = cropCtx;
  const { x, y, w, h } = cropImgRect;
  const c = cropCorners;

  ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);

  // 全体に画像を描画（暗め）
  ctx.drawImage(cropImg, x, y, w, h);

  // 選択範囲外を暗くする
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);

  // 選択範囲をクリップして明るく再描画
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(c[0].x, c[0].y);
  ctx.lineTo(c[1].x, c[1].y);
  ctx.lineTo(c[2].x, c[2].y);
  ctx.lineTo(c[3].x, c[3].y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(c[0].x, c[0].y);
  ctx.lineTo(c[1].x, c[1].y);
  ctx.lineTo(c[2].x, c[2].y);
  ctx.lineTo(c[3].x, c[3].y);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(cropImg, x, y, w, h);
  ctx.restore();

  // 外枠の線
  ctx.strokeStyle = '#5b7fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(c[0].x, c[0].y);
  ctx.lineTo(c[1].x, c[1].y);
  ctx.lineTo(c[2].x, c[2].y);
  ctx.lineTo(c[3].x, c[3].y);
  ctx.closePath();
  ctx.stroke();

  // グリッド（三分割）
  ctx.strokeStyle = 'rgba(91,127,255,0.3)';
  ctx.lineWidth = 1;
  for (let t = 1; t <= 2; t++) {
    const f = t / 3;
    const hx1 = lerp(c[0].x, c[1].x, f), hy1 = lerp(c[0].y, c[1].y, f);
    const hx2 = lerp(c[3].x, c[2].x, f), hy2 = lerp(c[3].y, c[2].y, f);
    const vx1 = lerp(c[0].x, c[3].x, f), vy1 = lerp(c[0].y, c[3].y, f);
    const vx2 = lerp(c[1].x, c[2].x, f), vy2 = lerp(c[1].y, c[2].y, f);
    ctx.beginPath(); ctx.moveTo(hx1, hy1); ctx.lineTo(hx2, hy2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(vx1, vy1); ctx.lineTo(vx2, vy2); ctx.stroke();
  }

  // コーナーハンドル（L字ブラケット）
  const bracketLen = 22;
  const signs = [{ dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 }, { dx: 1, dy: -1 }];
  c.forEach((pt, i) => {
    const { dx, dy } = signs[i];

    // ハロー
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, HANDLE_R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(91,127,255,0.18)';
    ctx.fill();

    // L字ブラケット
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pt.x - dx * bracketLen, pt.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.lineTo(pt.x, pt.y - dy * bracketLen);
    ctx.stroke();

    // 中心点
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#5b7fff';
    ctx.fill();
  });
}

const lerp = (a, b, t) => a + (b - a) * t;

// ----- ドラッグ操作 -----
cropCanvas.addEventListener('pointerdown', e => {
  const r = cropCanvas.getBoundingClientRect();
  const px = (e.clientX - r.left) * (cropCanvas.width / r.width);
  const py = (e.clientY - r.top)  * (cropCanvas.height / r.height);

  activeDrag = -1;
  let minD = HANDLE_R * 2.5;
  cropCorners.forEach((c, i) => {
    const d = Math.hypot(px - c.x, py - c.y);
    if (d < minD) { minD = d; activeDrag = i; }
  });
  if (activeDrag >= 0) cropCanvas.setPointerCapture(e.pointerId);
});

cropCanvas.addEventListener('pointermove', e => {
  if (activeDrag < 0) return;
  const r = cropCanvas.getBoundingClientRect();
  cropCorners[activeDrag] = {
    x: Math.max(0, Math.min(cropCanvas.width,  (e.clientX - r.left) * (cropCanvas.width  / r.width))),
    y: Math.max(0, Math.min(cropCanvas.height, (e.clientY - r.top)  * (cropCanvas.height / r.height))),
  };
  renderCropCanvas();
});

cropCanvas.addEventListener('pointerup',    () => { activeDrag = -1; });
cropCanvas.addEventListener('pointercancel',() => { activeDrag = -1; });

// ----- 自動検出 -----
document.getElementById('autoDetectBtn').addEventListener('click', autoDetectCorners);

function autoDetectCorners() {
  const SCALE = 8;
  const sw = Math.floor(cropImg.naturalWidth  / SCALE);
  const sh = Math.floor(cropImg.naturalHeight / SCALE);

  const tmp = document.createElement('canvas');
  tmp.width = sw; tmp.height = sh;
  tmp.getContext('2d').drawImage(cropImg, 0, 0, sw, sh);
  const { data } = tmp.getContext('2d').getImageData(0, 0, sw, sh);

  // グレースケール
  const gray = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) {
    gray[i] = 0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2];
  }

  // Sobel エッジ
  const edge = new Float32Array(sw * sh);
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const gx = -gray[(y-1)*sw+x-1] + gray[(y-1)*sw+x+1]
                 -2*gray[y*sw+x-1]   + 2*gray[y*sw+x+1]
                 -gray[(y+1)*sw+x-1] + gray[(y+1)*sw+x+1];
      const gy = -gray[(y-1)*sw+x-1] - 2*gray[(y-1)*sw+x] - gray[(y-1)*sw+x+1]
                 +gray[(y+1)*sw+x-1] + 2*gray[(y+1)*sw+x] + gray[(y+1)*sw+x+1];
      edge[y*sw+x] = Math.sqrt(gx*gx + gy*gy);
    }
  }

  // 上位5%のエッジ強度をしきい値に
  const sorted = Float32Array.from(edge).sort().reverse();
  const thr = sorted[Math.floor(sorted.length * 0.05)] || 20;

  // 4コーナー最端点の探索（外縁5%は除外）
  const MX = Math.floor(sw * 0.05), MY = Math.floor(sh * 0.05);
  const best = [Infinity, Infinity, Infinity, Infinity];
  const pts  = [
    { x: MX, y: MY }, { x: sw-MX, y: MY },
    { x: sw-MX, y: sh-MY }, { x: MX, y: sh-MY },
  ];

  for (let y = MY; y < sh - MY; y++) {
    for (let x = MX; x < sw - MX; x++) {
      if (edge[y*sw+x] < thr) continue;
      const scores = [x+y, (sw-x)+y, (sw-x)+(sh-y), x+(sh-y)];
      scores.forEach((s, i) => { if (s < best[i]) { best[i] = s; pts[i] = { x, y }; } });
    }
  }

  // キャンバス座標に変換
  const { x: ix, y: iy, w: iw, h: ih } = cropImgRect;
  cropCorners = pts.map(p => ({
    x: ix + (p.x / sw) * iw,
    y: iy + (p.y / sh) * ih,
  }));
  renderCropCanvas();
}

// ----- キャンセル / 補正実行 -----
document.getElementById('cancelCrop').addEventListener('click', () => {
  showSection('camera');
  state.rawDataUrl = null;
});

document.getElementById('applyCrop').addEventListener('click', async () => {
  showLoading('透視補正中...');
  await tick();
  try {
    const corrected = await applyPerspectiveTransform();
    state.correctedDataUrl = corrected;
    openFilterEditor(corrected);
  } catch (e) {
    console.error(e);
    alert('補正に失敗しました。もう一度お試しください。');
  } finally {
    hideLoading();
  }
});

// =====================================================================
// ホモグラフィ演算
// =====================================================================

/** 8x8 拡大係数行列のガウス消去法 */
function gaussElim(A, b) {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let max = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[max][col])) max = r;
    [M[col], M[max]] = [M[max], M[col]];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n] / M[i][i];
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j] / M[i][i];
  }
  return x;
}

/** src[i] → dst[i] となるホモグラフィ行列を計算 */
function computeHomography(srcPts, dstPts) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = srcPts[i];
    const { x: dx, y: dy } = dstPts[i];
    A.push([sx, sy, 1, 0, 0, 0, -dx*sx, -dx*sy]); b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy*sx, -dy*sy]); b.push(dy);
  }
  const h = gaussElim(A, b);
  return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
}

/** 点 (x,y) にホモグラフィ H を適用 */
function applyH(H, x, y) {
  const w = H[2][0]*x + H[2][1]*y + H[2][2];
  return [(H[0][0]*x + H[0][1]*y + H[0][2]) / w,
          (H[1][0]*x + H[1][1]*y + H[1][2]) / w];
}

/** バイリニア補間でピクセルサンプリング */
function sampleBilinear(data, sw, sx, sy) {
  const x0 = sx | 0, y0 = sy | 0;
  const x1 = Math.min(x0 + 1, sw - 1);
  const y1 = Math.min(y0 + 1, (data.length / (sw * 4) | 0) - 1);
  const fx = sx - x0, fy = sy - y0;
  const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4;
  const i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
  return [
    data[i00]*(1-fx)*(1-fy) + data[i10]*fx*(1-fy) + data[i01]*(1-fx)*fy + data[i11]*fx*fy,
    data[i00+1]*(1-fx)*(1-fy) + data[i10+1]*fx*(1-fy) + data[i01+1]*(1-fx)*fy + data[i11+1]*fx*fy,
    data[i00+2]*(1-fx)*(1-fy) + data[i10+2]*fx*(1-fy) + data[i01+2]*(1-fx)*fy + data[i11+2]*fx*fy,
  ];
}

/** アンシャープマスク（文字シャープネス向上） */
function unsharpMask(data, w, h, amount = 0.7) {
  // 3×3 ガウスぼかし
  const blurred = new Float32Array(data.length);
  const G = [1, 2, 1, 2, 4, 2, 1, 2, 1]; // /16
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let ky = -1; ky <= 1; ky++)
          for (let kx = -1; kx <= 1; kx++)
            s += data[((y+ky)*w + (x+kx))*4 + c] * G[(ky+1)*3 + (kx+1)];
        blurred[(y*w+x)*4+c] = s / 16;
      }
    }
  }
  const result = new Uint8ClampedArray(data.length);
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 3; c++) {
      const orig = data[i*4+c];
      const blur = blurred[i*4+c] || orig;
      result[i*4+c] = Math.max(0, Math.min(255, orig + amount * (orig - blur)));
    }
    result[i*4+3] = 255;
  }
  return result;
}

/** 透視変換のメイン処理 */
async function applyPerspectiveTransform() {
  // キャンバス座標 → 元画像座標に変換
  const { x: ix, y: iy, w: iw, h: ih } = cropImgRect;
  const scaleX = cropImg.naturalWidth  / iw;
  const scaleY = cropImg.naturalHeight / ih;

  const srcPts = cropCorners.map(c => ({
    x: (c.x - ix) * scaleX,
    y: (c.y - iy) * scaleY,
  }));

  // 出力サイズを四辺形の平均幅・高さから計算
  const edgeW = (dist(srcPts[0], srcPts[1]) + dist(srcPts[3], srcPts[2])) / 2;
  const edgeH = (dist(srcPts[0], srcPts[3]) + dist(srcPts[1], srcPts[2])) / 2;

  // 長辺を最大 1400px に制限
  const MAX_PX = 1400;
  const scale  = Math.min(1, MAX_PX / Math.max(edgeW, edgeH));
  const outW   = Math.round(edgeW * scale);
  const outH   = Math.round(edgeH * scale);

  // 出力の4頂点（長方形）
  const dstPts = [
    { x: 0,    y: 0    },
    { x: outW, y: 0    },
    { x: outW, y: outH },
    { x: 0,    y: outH },
  ];

  // 逆ホモグラフィ（出力 → 入力）
  const H_inv = computeHomography(dstPts, srcPts);

  // 元画像のピクセルデータを取得
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width  = cropImg.naturalWidth;
  srcCanvas.height = cropImg.naturalHeight;
  srcCanvas.getContext('2d').drawImage(cropImg, 0, 0);
  const srcData = srcCanvas.getContext('2d').getImageData(0, 0, srcCanvas.width, srcCanvas.height).data;
  const srcW = srcCanvas.width, srcH = srcCanvas.height;

  // 出力ピクセルを逆マッピングで埋める
  const outPixels = new Uint8ClampedArray(outW * outH * 4);

  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      const [sx, sy] = applyH(H_inv, ox, oy);
      const oi = (oy * outW + ox) * 4;

      if (sx < 0 || sy < 0 || sx >= srcW - 1 || sy >= srcH - 1) {
        outPixels[oi] = outPixels[oi+1] = outPixels[oi+2] = 255;
        outPixels[oi+3] = 255;
        continue;
      }

      const [r, g, b] = sampleBilinear(srcData, srcW, sx, sy);
      outPixels[oi]   = r;
      outPixels[oi+1] = g;
      outPixels[oi+2] = b;
      outPixels[oi+3] = 255;
    }
  }

  // アンシャープマスクで文字を鮮明化
  const sharpened = unsharpMask(outPixels, outW, outH, 0.75);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW; outCanvas.height = outH;
  outCanvas.getContext('2d').putImageData(new ImageData(sharpened, outW, outH), 0, 0);

  return outCanvas.toDataURL('image/jpeg', 0.94);
}

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

// =====================================================================
// 画質調整エディタ
// =====================================================================
const editCanvas = document.getElementById('editCanvas');

let editSrcUrl    = '';
let editFilter    = 'none';
let editBrightness = 0;
let editContrast   = 0;
let editSharpness  = 0;

function openFilterEditor(dataUrl) {
  editSrcUrl     = dataUrl;
  editFilter     = 'none';
  editBrightness = editContrast = editSharpness = 0;
  document.getElementById('brightness').value = 0;
  document.getElementById('contrast').value   = 0;
  document.getElementById('sharpness').value  = 0;
  document.getElementById('brightnessVal').textContent = '0';
  document.getElementById('contrastVal').textContent   = '0';
  document.getElementById('sharpnessVal').textContent  = '0';
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === 'none'));
  showSection('edit');
  renderEditCanvas();
}

function renderEditCanvas() {
  const img = new Image();
  img.onload = () => {
    const wrap = document.querySelector('.edit-canvas-wrap');
    const scale = Math.min(wrap.clientWidth / img.width, wrap.clientHeight / img.height, 1);
    editCanvas.width  = img.width  * scale;
    editCanvas.height = img.height * scale;
    const ctx = editCanvas.getContext('2d');
    ctx.filter = buildCSSFilter();
    ctx.drawImage(img, 0, 0, editCanvas.width, editCanvas.height);
    ctx.filter = 'none';
  };
  img.src = editSrcUrl;
}

function buildCSSFilter() {
  const b = `brightness(${1 + editBrightness / 100})`;
  const c = `contrast(${1 + editContrast / 100})`;
  const s = editSharpness > 0 ? '' : ''; // シャープはCanvas APIで別途処理
  switch (editFilter) {
    case 'mono':  return `grayscale(1) ${b} ${c}`;
    case 'doc':   return `grayscale(1) contrast(${1.8 + editContrast / 80}) brightness(${1.05 + editBrightness / 100})`;
    case 'vivid': return `saturate(1.6) ${c} ${b}`;
    default:      return `${b} ${c}`;
  }
}

['brightness', 'contrast', 'sharpness'].forEach(id => {
  document.getElementById(id).addEventListener('input', e => {
    if (id === 'brightness') editBrightness = +e.target.value;
    if (id === 'contrast')   editContrast   = +e.target.value;
    if (id === 'sharpness')  editSharpness  = +e.target.value;
    document.getElementById(id + 'Val').textContent = e.target.value;
    renderEditCanvas();
  });
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    editFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderEditCanvas();
  });
});

document.getElementById('cancelEdit').addEventListener('click', () => {
  showSection('camera');
  state.correctedDataUrl = null;
  state.rawDataUrl = null;
});

document.getElementById('confirmEdit').addEventListener('click', () => {
  showLoading('画像を処理中...');
  setTimeout(() => {
    try {
      const finalUrl = renderFinalImage();
      addPage(finalUrl);
      showSection('camera');
      state.correctedDataUrl = null;
    } catch(e) {
      console.error(e);
    } finally {
      hideLoading();
    }
  }, 30);
});

/** フル解像度で最終レンダリング（シャープネスもCanvas APIで適用） */
function renderFinalImage() {
  const img = new Image();
  img.src = editSrcUrl; // 同期読み込み済みのため即利用可

  const canvas = document.createElement('canvas');
  canvas.width  = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.filter = buildCSSFilter();
  ctx.drawImage(img, 0, 0);
  ctx.filter = 'none';

  // シャープネスが指定されていればアンシャープマスク追加適用
  if (editSharpness > 0) {
    const amount = editSharpness / 100;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const sharpened = unsharpMask(imgData.data, canvas.width, canvas.height, amount);
    ctx.putImageData(new ImageData(sharpened, canvas.width, canvas.height), 0, 0);
  }

  return canvas.toDataURL('image/jpeg', 0.92);
}

// =====================================================================
// ページ管理
// =====================================================================
function addPage(dataUrl) {
  state.pages.push(dataUrl);
  renderPages();
  updateExportBtn();
}

function renderPages() {
  pagesGrid.querySelectorAll('.page-thumb').forEach(e => e.remove());
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
      <img src="${url}" alt="ページ ${i+1}" loading="lazy">
      <span class="page-num">${i+1}</span>
      <button class="page-del" data-idx="${i}">×</button>
    `;
    thumb.querySelector('img').addEventListener('click', () => openPreview(i));
    thumb.querySelector('.page-del').addEventListener('click', e => { e.stopPropagation(); deletePage(i); });
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

// =====================================================================
// プレビューモーダル
// =====================================================================
let previewIdx = -1;

function openPreview(idx) {
  previewIdx = idx;
  document.getElementById('previewImg').src = state.pages[idx];
  document.getElementById('previewTitle').textContent = `ページ ${idx+1} / ${state.pages.length}`;
  document.getElementById('previewModal').classList.remove('hidden');
}

document.getElementById('closeModal').addEventListener('click', () => document.getElementById('previewModal').classList.add('hidden'));
document.getElementById('modalBackdrop').addEventListener('click', () => document.getElementById('previewModal').classList.add('hidden'));

document.getElementById('deletePageBtn').addEventListener('click', () => {
  deletePage(previewIdx);
  document.getElementById('previewModal').classList.add('hidden');
});

document.getElementById('downloadPageBtn').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = state.pages[previewIdx];
  a.download = `scan_page_${previewIdx+1}.jpg`;
  a.click();
});

// =====================================================================
// PDF 出力
// =====================================================================
function updateExportBtn() {
  exportBtn.disabled = state.pages.length === 0;
  pageCountEl.textContent = state.pages.length;
}

exportBtn.addEventListener('click', async () => {
  if (!state.pages.length) return;
  showLoading('PDF生成中...');
  await tick();
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const A4W = 210, A4H = 297;

    for (let i = 0; i < state.pages.length; i++) {
      const img = await loadImage(state.pages[i]);
      const ratio = Math.min(A4W / img.naturalWidth, A4H / img.naturalHeight);
      const pw = img.naturalWidth * ratio, ph = img.naturalHeight * ratio;
      if (i > 0) pdf.addPage();
      pdf.addImage(state.pages[i], 'JPEG', (A4W - pw) / 2, (A4H - ph) / 2, pw, ph);
    }

    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    pdf.save(`scan_${ts}.pdf`);
  } catch (e) {
    console.error(e);
    alert('PDF生成に失敗しました。');
  } finally {
    hideLoading();
  }
});

// =====================================================================
// ユーティリティ
// =====================================================================
const loadImage = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const tick = () => new Promise(r => setTimeout(r, 30));

function showLoading(msg = '処理中...') {
  loadingMsg.textContent = msg;
  loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

// =====================================================================
// 初期化
// =====================================================================
startCamera();
renderPages();
updateExportBtn();
