const video = document.getElementById("video");
const fileInput = document.getElementById("file");
const asciiCanvas = document.getElementById("asciiCanvas");
const btnCam = document.getElementById("btnCam");
const btnFile = document.getElementById("btnFile");
const btnStop = document.getElementById("btnStop");
const colsRange = document.getElementById("cols");
const colsVal = document.getElementById("colsVal");
const fpsRange = document.getElementById("fps");
const fpsVal = document.getElementById("fpsVal");
const fontRange = document.getElementById("font");
const fontVal = document.getElementById("fontVal");
const charsetSel = document.getElementById("charset");
const coloredChk = document.getElementById("colored");
const autoChk = document.getElementById("auto");
const statusEl = document.getElementById("status");
const aCtx = asciiCanvas.getContext("2d");
const off = document.createElement("canvas");
const oCtx = off.getContext("2d", { willReadFrequently: true });

let stream = null;
let rafId = null;

let lastDraw = 0;


let perfWindow = [];
const PERF_WINDOW_MAX = 18;
let lastAutoAdjust = 0;

function setStatus(msg) {
  statusEl.textContent = msg;
}

function clamp(n, min, max) {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function pickChar(lum, charset) {
  const idx = Math.floor((lum / 255) * (charset.length - 1));
  return charset[idx];
}

function stopAll() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;

  if (stream) {
    const tracks = stream.getTracks();
    for (let i = 0; i < tracks.length; i++) tracks[i].stop();
    stream = null;
  }

  try { video.pause(); } catch {}
  video.srcObject = null;
  video.removeAttribute("src");
  video.load();

  setStatus("Parado.");
}

async function startCamera() {
  stopAll();
  perfWindow = [];

  try {
    setStatus("Pedindo permissão da câmera...");
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });

    video.srcObject = stream;
    await video.play();

    setStatus("Câmera OK. Renderizando ASCII...");
    frameLoop();
  } catch (e) {
    setStatus("Falhou na câmera.");
    aCtx.clearRect(0, 0, asciiCanvas.width, asciiCanvas.height);
    aCtx.fillStyle = "#e6edf3";
    aCtx.font = "14px system-ui";
    aCtx.fillText("Erro ao abrir a câmera.", 14, 24);
    aCtx.fillStyle = "#a7b0bb";
    aCtx.fillText(String(e), 14, 48);
  }
}

async function startFile(file) {
  stopAll();
  perfWindow = [];

  try {
    const url = URL.createObjectURL(file);
    video.src = url;
    video.loop = true;
    video.muted = true; 
    await video.play();

    setStatus("Vídeo OK. Renderizando ASCII...");
    frameLoop();
  } catch (e) {
    setStatus("Falhou no vídeo.");
    aCtx.clearRect(0, 0, asciiCanvas.width, asciiCanvas.height);
    aCtx.fillStyle = "#e6edf3";
    aCtx.font = "14px system-ui";
    aCtx.fillText("Erro ao tocar o vídeo.", 14, 24);
    aCtx.fillStyle = "#a7b0bb";
    aCtx.fillText(String(e), 14, 48);
  }
}

function autoQualityAdjust(avgMs) {
  const now = performance.now();
  if (!autoChk.checked) return;
  if (now - lastAutoAdjust < 700) return;
  lastAutoAdjust = now;

  const targetFps = Number(fpsRange.value);
  const budgetMs = 1000 / targetFps;

  let cols = Number(colsRange.value);

  if (avgMs > budgetMs * 1.25 && cols > Number(colsRange.min)) {
    cols = clamp(cols - 10, Number(colsRange.min), Number(colsRange.max));
    colsRange.value = String(cols);
    colsVal.textContent = String(cols);
    setStatus("Auto-qualidade: reduzindo colunas pra segurar o tranco");
    return;
  }

  if (avgMs < budgetMs * 0.70 && cols < Number(colsRange.max)) {
    cols = clamp(cols + 5, Number(colsRange.min), Number(colsRange.max));
    colsRange.value = String(cols);
    colsVal.textContent = String(cols);
    setStatus("Auto-qualidade: subindo colunas (tá suave)");
  }
}

function frameLoop() {
  const now = performance.now();
  const targetFps = Number(fpsRange.value);
  const minDelta = 1000 / targetFps;

  if (now - lastDraw < minDelta) {
    rafId = requestAnimationFrame(frameLoop);
    return;
  }
  lastDraw = now;

  if (!video.videoWidth || !video.videoHeight) {
    rafId = requestAnimationFrame(frameLoop);
    return;
  }

  const t0 = performance.now();

  const cols = Number(colsRange.value);
  const charset = charsetSel.value;
  const colored = !!coloredChk.checked;

  const aspect = video.videoHeight / video.videoWidth;
  const rows = Math.max(20, Math.floor(cols * aspect * 0.55));

  off.width = cols;
  off.height = rows;
  oCtx.drawImage(video, 0, 0, cols, rows);
  const img = oCtx.getImageData(0, 0, cols, rows);
  const data = img.data;

  const fontSize = Number(fontRange.value);
  aCtx.font = fontSize + "px ui-monospace, Menlo, Consolas, monospace";
  aCtx.textBaseline = "top";

  const charW = Math.ceil(aCtx.measureText("M").width);
  const charH = Math.ceil(fontSize * 1.12);

  asciiCanvas.width = cols * charW;
  asciiCanvas.height = rows * charH;

  aCtx.fillStyle = "#070a10";
  aCtx.fillRect(0, 0, asciiCanvas.width, asciiCanvas.height);


  for (let y = 0; y < rows; y++) {
    const rowOffset = y * cols * 4;
    const py = y * charH;

    for (let x = 0; x < cols; x++) {
      const i = rowOffset + x * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const ch = pickChar(lum, charset);

      if (colored) {
        aCtx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
      } else {
        aCtx.fillStyle = "#00ff66";
      }

      aCtx.fillText(ch, x * charW, py);
    }
  }

  const t1 = performance.now();
  const frameMs = t1 - t0;
  perfWindow.push(frameMs);
  if (perfWindow.length > PERF_WINDOW_MAX) perfWindow.shift();

  if (perfWindow.length >= 8) {
    let sum = 0;
    for (let i = 0; i < perfWindow.length; i++) sum += perfWindow[i];
    const avg = sum / perfWindow.length;
    autoQualityAdjust(avg);
  }

  if (!autoChk.checked) {
    setStatus("Rodando. " + cols + " cols • " + rows + " rows • " + targetFps + " FPS");
  }

  rafId = requestAnimationFrame(frameLoop);
}

btnCam.addEventListener("click", startCamera);

btnFile.addEventListener("click", function () {
  fileInput.click();
});

fileInput.addEventListener("change", function () {
  const f = fileInput.files && fileInput.files[0];
  if (f) startFile(f);
});

btnStop.addEventListener("click", stopAll);

colsRange.addEventListener("input", function () {
  colsVal.textContent = colsRange.value;
});

fpsRange.addEventListener("input", function () {
  fpsVal.textContent = fpsRange.value;
});

fontRange.addEventListener("input", function () {
  fontVal.textContent = fontRange.value;
});

colsVal.textContent = colsRange.value;
fpsVal.textContent = fpsRange.value;
fontVal.textContent = fontRange.value;
