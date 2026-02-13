const MEDIAPIPE_VERSION = "0.10.14";
const MEDIAPIPE_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const MEDIAPIPE_WASM_ROOT = `${MEDIAPIPE_CDN}/wasm`;
const FACE_LANDMARKER_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

function detectDeviceProfile() {
  const ua = navigator.userAgent || "";
  const isPhoneUa = /Android|iPhone|iPod/i.test(ua);
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) <= 820;
  const isMobile = isPhoneUa || (isCoarsePointer && smallScreen);

  return isMobile
    ? {
      name: "mobile",
      videoWidthIdeal: 640,
      videoHeightIdeal: 480,
      maxInferFps: 10,
      overlayPoints: [10, 152, 1, 33, 263, 61, 291],
    }
    : {
      name: "desktop",
      videoWidthIdeal: 1280,
      videoHeightIdeal: 720,
      maxInferFps: 20,
      overlayPoints: [10, 152, 1, 33, 263, 61, 291, 13, 14, 105, 334, 234, 454],
    };
}

const DEVICE = detectDeviceProfile();

const state = {
  stream: null,
  hasCamera: false,
  mode: "landing",
  analysisType: null,
  engine: "rule",
  engineReady: false,
  engineError: null,
  renderRafId: null,
  lastInferTs: 0,
  latestLandmarks: null,
  latestBlendshapes: null,
};

const FACE_RESULTS = [
  { id: "sunrise-strategy", title: "용안형 (왕재상)", tone: "리더 기질 + 중심 추진력", description: "전통 관상에서 말하는 용안 계열에 가까운 흐름으로 분류됐어요. 중심축과 추진 지표가 비교적 강하게 나타난 타입입니다.", tips: "재미 포인트: 오늘 주도적으로 결정할 일 1개를 정해보세요." },
  { id: "warm-navigator", title: "귀인형 (인덕상)", tone: "인복 + 관계 조율", description: "대인 흐름이 부드럽고 주변 도움을 얻기 쉬운 귀인형 해석으로 분류됐어요. 협업과 소통에서 강점을 보이는 타입입니다.", tips: "재미 포인트: 감사 메시지 1개를 먼저 보내보세요." },
  { id: "spark-initiator", title: "장군형 (결단상)", tone: "결단력 + 실행 속도", description: "결정 후 빠르게 움직이는 장군형 해석으로 분류됐어요. 스타트가 빠르고 돌파력이 좋은 흐름입니다.", tips: "재미 포인트: 미룬 일 하나를 10분 안에 착수해보세요." },
  { id: "steady-crafter", title: "문창형 (학자상)", tone: "집중력 + 완성도", description: "문창 계열처럼 깊이 파고들고 마무리를 중시하는 해석이에요. 속도보다 정확도를 중시하는 타입입니다.", tips: "재미 포인트: 오늘 끝낼 핵심 작업 1개를 먼저 완료해보세요." },
  { id: "lively-connector", title: "봉안형 (기품상)", tone: "친화력 + 네트워크", description: "표현력과 교류 에너지가 좋은 봉안형 해석으로 분류됐어요. 분위기 전환과 관계 연결에 강한 타입입니다.", tips: "재미 포인트: 오랜만인 지인에게 짧은 안부를 보내보세요." },
  { id: "deep-diver", title: "현사형 (탐구상)", tone: "탐구력 + 분석력", description: "표면보다 본질을 파고드는 현사형 해석으로 분류됐어요. 디테일과 구조 파악에 강한 타입입니다.", tips: "재미 포인트: 관심 주제 한 가지를 깊게 읽어보세요." },
  { id: "calm-anchor", title: "장수형 (안정상)", tone: "안정감 + 균형감", description: "급한 상황에서도 흐름을 안정시키는 장수형 해석으로 분류됐어요. 주변에서 신뢰를 얻기 쉬운 타입입니다.", tips: "재미 포인트: 오늘 일정에서 가장 불안한 항목을 먼저 처리해보세요." },
  { id: "creative-mixer", title: "예인형 (예술상)", tone: "감각 + 창의 전환", description: "감각적으로 조합하고 새롭게 표현하는 예인형 해석으로 분류됐어요. 틀을 바꾸는 발상이 강한 타입입니다.", tips: "재미 포인트: 익숙한 루틴 하나를 새 방식으로 바꿔보세요." },
  { id: "bold-explorer", title: "호안형 (개척상)", tone: "담력 + 도전 성향", description: "변화를 두려워하지 않는 호안형 해석으로 분류됐어요. 낯선 영역에서도 시도를 시작하는 힘이 좋은 타입입니다.", tips: "재미 포인트: 이번 주 새로운 시도 1개를 바로 예약해보세요." },
  { id: "balanced-director", title: "재복형 (재물상)", tone: "현실 감각 + 균형 운용", description: "흐름을 안정적으로 관리하는 재복형 해석으로 분류됐어요. 분배와 조율에서 강점을 보이는 타입입니다.", tips: "재미 포인트: 오늘 지출/시간 계획을 3줄로 정리해보세요." },
  { id: "orc-guardian", title: "오크형 (강인상)", tone: "강단 + 돌파력", description: "강한 밀도와 추진 성향이 두드러져 오크형으로 분류됐어요. 압박 상황에서도 밀고 나가는 힘이 강조되는 타입입니다.", tips: "재미 포인트: 오늘 가장 어려운 일 1개를 먼저 처리해보세요." },
];

const PALM_RESULTS = [
  {
    id: "life-line-strong",
    title: "생명선 탄탄형",
    tone: "지속력 + 회복력",
    description: "손금 흐름을 오락용 규칙으로 해석했을 때, 끊김보다 연결성이 강조되는 타입으로 분류됐어요.",
    tips: "재미 포인트: 오늘 20분 루틴을 하나 정하고 7일 유지해보세요.",
  },
  {
    id: "head-line-clear",
    title: "지능선 선명형",
    tone: "집중력 + 판단력",
    description: "세부 구간의 대비가 높아 집중형 패턴으로 해석됐어요. 한 번 몰입하면 완성도가 높아지는 흐름입니다.",
    tips: "재미 포인트: 고민 중인 일의 기준 3가지를 먼저 적어보세요.",
  },
  {
    id: "heart-line-open",
    title: "감정선 개방형",
    tone: "표현력 + 공감",
    description: "표현 축이 살아 있는 타입으로 분류됐어요. 관계에서 분위기 전환과 정서 전달이 강한 흐름입니다.",
    tips: "재미 포인트: 고마운 사람 한 명에게 짧은 메시지를 보내보세요.",
  },
  {
    id: "fate-line-rise",
    title: "운명선 상승형",
    tone: "성장성 + 도전",
    description: "상향 흐름이 보이는 도전형 패턴으로 해석됐어요. 새로운 시도에서 성취감을 얻기 쉬운 타입입니다.",
    tips: "재미 포인트: 이번 주 새로운 시도 1개를 바로 등록해보세요.",
  },
  {
    id: "balance-line",
    title: "균형선 안정형",
    tone: "균형감 + 조율",
    description: "과하지도 부족하지도 않은 중간 균형형으로 분류됐어요. 상황에 따라 유연하게 조절하는 흐름입니다.",
    tips: "재미 포인트: 오늘 일정에서 우선순위 1-2-3만 정해보세요.",
  },
];

const PROFILE_WEIGHTS = {
  "sunrise-strategy": { energy: 0.45, social: 0.2, focus: 1.0, calm: 0.8, creative: 0.35 },
  "warm-navigator": { energy: 0.35, social: 1.0, focus: 0.55, calm: 0.7, creative: 0.45 },
  "spark-initiator": { energy: 1.0, social: 0.55, focus: 0.35, calm: 0.2, creative: 0.7 },
  "steady-crafter": { energy: 0.4, social: 0.2, focus: 1.0, calm: 0.75, creative: 0.5 },
  "lively-connector": { energy: 0.9, social: 1.0, focus: 0.35, calm: 0.3, creative: 0.55 },
  "deep-diver": { energy: 0.25, social: 0.15, focus: 1.0, calm: 0.7, creative: 0.65 },
  "calm-anchor": { energy: 0.2, social: 0.4, focus: 0.7, calm: 1.0, creative: 0.3 },
  "creative-mixer": { energy: 0.7, social: 0.45, focus: 0.55, calm: 0.35, creative: 1.0 },
  "bold-explorer": { energy: 0.95, social: 0.5, focus: 0.45, calm: 0.2, creative: 0.9 },
  "balanced-director": { energy: 0.55, social: 0.55, focus: 0.8, calm: 0.8, creative: 0.5 },
  "orc-guardian": { energy: 1.0, social: 0.35, focus: 0.8, calm: 0.45, creative: 0.3 },
};

const ARCHETYPE_IMAGE_MAP = {
  "sunrise-strategy": "/assets/archetypes/yongan.svg",
  "warm-navigator": "/assets/archetypes/guiin.svg",
  "spark-initiator": "/assets/archetypes/janggun.svg",
  "steady-crafter": "/assets/archetypes/moonchang.svg",
  "lively-connector": "/assets/archetypes/bongan.svg",
  "deep-diver": "/assets/archetypes/hyeonsa.svg",
  "calm-anchor": "/assets/archetypes/jangsu.svg",
  "creative-mixer": "/assets/archetypes/yein.svg",
  "bold-explorer": "/assets/archetypes/hoan.svg",
  "balanced-director": "/assets/archetypes/jaebok.svg",
  "orc-guardian": "/assets/archetypes/hoan.svg",
};

const FORCE_ORC_RESULT = true;

const analyzer = {
  mode: "rule",
  landmarker: null,
  initialized: false,
};

const els = {
  camera: document.getElementById("camera"),
  overlay: document.getElementById("video-overlay"),
  status: document.getElementById("status"),
  engineBadge: document.getElementById("engine-badge"),
  startFaceBtn: document.getElementById("start-face-btn"),
  startPalmBtn: document.getElementById("start-palm-btn"),
  cancelCameraBtn: document.getElementById("cancel-camera-btn"),
  retryBtn: document.getElementById("retry-btn"),
  landingView: document.getElementById("landing-view"),
  cameraView: document.getElementById("camera-view"),
  resultView: document.getElementById("result-view"),
  resultCard: document.getElementById("result-card"),
  canvas: document.getElementById("snapshot-canvas"),
  faceOverlay: document.getElementById("face-overlay-canvas"),
  guideHint: document.getElementById("guide-hint"),
  analysisOverlay: document.getElementById("analysis-overlay"),
  analysisStep: document.getElementById("analysis-step"),
  analysisProgressFill: document.getElementById("analysis-progress-fill"),
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setStatus(text) {
  els.status.textContent = text;
}

function setEngineBadge(text, fallback = false) {
  els.engineBadge.textContent = text;
  els.engineBadge.classList.toggle("fallback", fallback);
}

function switchView(mode) {
  state.mode = mode;
  els.landingView.classList.toggle("active", mode === "landing");
  els.cameraView.classList.toggle("active", mode === "camera");
  els.resultView.classList.toggle("active", mode === "result");
  document.body.classList.toggle("mode-landing", mode === "landing");
  document.body.classList.toggle("mode-camera", mode === "camera");
  document.body.classList.toggle("mode-result", mode === "result");
}

function setAnalysisOverlay(active, stepText = "", progress = 0) {
  els.analysisOverlay.classList.toggle("hidden", !active);
  if (stepText) {
    els.analysisStep.textContent = stepText;
  }
  const clamped = Math.max(0, Math.min(100, progress));
  els.analysisProgressFill.style.width = `${clamped}%`;
}

function forceMirrorPreview() {
  const targets = [els.camera, els.faceOverlay];
  for (const el of targets) {
    el.style.transform = "scaleX(-1)";
    el.style.webkitTransform = "scaleX(-1)";
    el.style.transformOrigin = "center";
    el.style.webkitTransformOrigin = "center";
  }
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function distance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pointAt(landmarks, index) {
  return landmarks[index] || { x: 0, y: 0, z: 0 };
}

function ensureOverlayCanvasSize() {
  const width = els.camera.videoWidth || 640;
  const height = els.camera.videoHeight || 480;
  if (els.faceOverlay.width !== width || els.faceOverlay.height !== height) {
    els.faceOverlay.width = width;
    els.faceOverlay.height = height;
  }
}

function clearOverlay() {
  ensureOverlayCanvasSize();
  const ctx = els.faceOverlay.getContext("2d");
  ctx.clearRect(0, 0, els.faceOverlay.width, els.faceOverlay.height);
}

function setGuideHint(text, ready = false) {
  if (!els.guideHint) {
    return;
  }
  els.guideHint.textContent = text;
  els.guideHint.classList.toggle("ready", ready);
}

function getFaceGuideState(landmarks) {
  if (!landmarks) {
    return {
      ok: false,
      message: "얼굴을 가이드 프레임 안에 맞춰주세요.",
    };
  }

  const leftCheek = pointAt(landmarks, 234);
  const rightCheek = pointAt(landmarks, 454);
  const forehead = pointAt(landmarks, 10);
  const chin = pointAt(landmarks, 152);
  const leftEyeOuter = pointAt(landmarks, 33);
  const rightEyeOuter = pointAt(landmarks, 263);

  const centerX = (leftCheek.x + rightCheek.x) / 2;
  const centerY = (forehead.y + chin.y) / 2;
  const faceWidth = distance(leftCheek, rightCheek);
  const eyeTilt = Math.abs(leftEyeOuter.y - rightEyeOuter.y);

  const horizontalOk = Math.abs(centerX - 0.5) <= 0.09;
  const verticalOk = Math.abs(centerY - 0.52) <= 0.11;
  const sizeOk = faceWidth >= 0.24 && faceWidth <= 0.52;
  const tiltOk = eyeTilt <= 0.03;
  const ok = horizontalOk && verticalOk && sizeOk && tiltOk;

  if (ok) {
    return { ok: true, message: "좋아요! 이 상태로 분석합니다." };
  }
  if (!sizeOk) {
    return { ok: false, message: faceWidth < 0.24 ? "조금 더 가까이 와주세요." : "조금만 뒤로 이동해주세요." };
  }
  if (!horizontalOk || !verticalOk) {
    return { ok: false, message: "얼굴을 가운데로 맞춰주세요." };
  }
  return { ok: false, message: "고개를 정면으로 맞춰주세요." };
}

function drawLandmarksOverlay(landmarks, guideState) {
  ensureOverlayCanvasSize();
  const ctx = els.faceOverlay.getContext("2d");
  const width = els.faceOverlay.width;
  const height = els.faceOverlay.height;

  ctx.clearRect(0, 0, width, height);

  const guideCenterX = width * 0.5;
  const guideCenterY = height * 0.525;
  const guideHalfW = width * 0.23;
  const guideHalfH = height * 0.285;
  const guideReady = Boolean(guideState?.ok);

  ctx.strokeStyle = guideReady ? "rgba(16, 185, 129, 0.95)" : "rgba(251, 146, 60, 0.95)";
  ctx.lineWidth = Math.max(2, width / 220);
  ctx.fillStyle = guideReady ? "rgba(16, 185, 129, 0.08)" : "rgba(251, 146, 60, 0.07)";
  ctx.beginPath();
  ctx.moveTo(guideCenterX, guideCenterY - guideHalfH);
  ctx.bezierCurveTo(
    guideCenterX + guideHalfW * 0.72,
    guideCenterY - guideHalfH,
    guideCenterX + guideHalfW,
    guideCenterY - guideHalfH * 0.38,
    guideCenterX + guideHalfW,
    guideCenterY + guideHalfH * 0.14,
  );
  ctx.bezierCurveTo(
    guideCenterX + guideHalfW * 0.95,
    guideCenterY + guideHalfH * 0.62,
    guideCenterX + guideHalfW * 0.36,
    guideCenterY + guideHalfH * 0.98,
    guideCenterX,
    guideCenterY + guideHalfH,
  );
  ctx.bezierCurveTo(
    guideCenterX - guideHalfW * 0.36,
    guideCenterY + guideHalfH * 0.98,
    guideCenterX - guideHalfW * 0.95,
    guideCenterY + guideHalfH * 0.62,
    guideCenterX - guideHalfW,
    guideCenterY + guideHalfH * 0.14,
  );
  ctx.bezierCurveTo(
    guideCenterX - guideHalfW,
    guideCenterY - guideHalfH * 0.38,
    guideCenterX - guideHalfW * 0.72,
    guideCenterY - guideHalfH,
    guideCenterX,
    guideCenterY - guideHalfH,
  );
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(16, 185, 129, 0.9)";
  ctx.fillStyle = "rgba(249, 115, 22, 0.95)";
  ctx.lineWidth = Math.max(1, width / 500);

  if (!landmarks) {
    return;
  }

  for (const idx of DEVICE.overlayPoints) {
    const p = landmarks[idx];
    if (!p) {
      continue;
    }
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, Math.max(2, width / 260), 0, Math.PI * 2);
    ctx.fill();
  }
}

async function initAnalyzer() {
  if (analyzer.initialized) {
    return;
  }

  analyzer.initialized = true;
  setEngineBadge(`분석 엔진: MediaPipe 초기화 중 (${DEVICE.name})`);

  try {
    const tasks = await import(MEDIAPIPE_CDN);
    const vision = await tasks.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_ROOT);
    analyzer.landmarker = await tasks.FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      minFaceDetectionConfidence: DEVICE.name === "mobile" ? 0.45 : 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    analyzer.mode = "mediapipe";
    state.engine = "mediapipe";
    state.engineReady = true;
    setEngineBadge(`분석 엔진: MediaPipe 로컬 추론 (${DEVICE.maxInferFps}fps)`);
  } catch (err) {
    analyzer.mode = "rule";
    state.engine = "rule";
    state.engineReady = true;
    state.engineError = err;
    setEngineBadge("분석 엔진: 룰 기반 폴백", true);
    console.warn("MediaPipe 초기화 실패. 룰 기반으로 동작합니다.", err);
  }
}

function stopRenderLoop() {
  if (state.renderRafId) {
    cancelAnimationFrame(state.renderRafId);
    state.renderRafId = null;
  }
}

function runPreviewLoop() {
  stopRenderLoop();
  const inferIntervalMs = 1000 / DEVICE.maxInferFps;

  const tick = (timestamp) => {
    if (!state.hasCamera) {
      clearOverlay();
      return;
    }

    const faceMode = state.analysisType === "face";
    if (faceMode && analyzer.mode === "mediapipe" && analyzer.landmarker && els.camera.readyState >= 2) {
      if (timestamp - state.lastInferTs >= inferIntervalMs) {
        try {
          const result = analyzer.landmarker.detectForVideo(els.camera, timestamp);
          const landmarks = result.faceLandmarks?.[0] || null;
          const guideState = getFaceGuideState(landmarks);
          state.latestLandmarks = landmarks;
          state.latestBlendshapes = result.faceBlendshapes?.[0] || null;
          state.lastInferTs = timestamp;
          setGuideHint(guideState.message, guideState.ok);
          drawLandmarksOverlay(landmarks, guideState);
        } catch (err) {
          state.latestLandmarks = null;
          setGuideHint("얼굴을 가이드 프레임 안에 맞춰주세요.", false);
          drawLandmarksOverlay(null, { ok: false });
          console.warn("실시간 추론 오류", err);
        }
      }
    } else if (faceMode) {
      setGuideHint("얼굴을 가이드 프레임 안에 맞춰주세요.", false);
      drawLandmarksOverlay(null, { ok: false });
    } else {
      setGuideHint("손바닥을 화면 중앙에 맞춰주세요.", false);
      clearOverlay();
    }

    state.renderRafId = requestAnimationFrame(tick);
  };

  state.renderRafId = requestAnimationFrame(tick);
}

async function waitForVideoReady() {
  if (els.camera.readyState >= 2) {
    return;
  }
  await new Promise((resolve) => {
    const onReady = () => {
      els.camera.removeEventListener("loadeddata", onReady);
      resolve();
    };
    els.camera.addEventListener("loadeddata", onReady);
  });
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("카메라 API 미지원");
  }

  const constraints = {
    video: {
      facingMode: "user",
      width: { ideal: DEVICE.videoWidthIdeal },
      height: { ideal: DEVICE.videoHeightIdeal },
      frameRate: { ideal: DEVICE.maxInferFps + 4, max: DEVICE.name === "mobile" ? 24 : 30 },
    },
    audio: false,
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  state.stream = stream;
  state.hasCamera = true;
  state.lastInferTs = 0;
  els.camera.srcObject = stream;
  await waitForVideoReady();
  forceMirrorPreview();
  runPreviewLoop();
  if (state.analysisType === "face") {
    setGuideHint("얼굴을 가이드 프레임 안에 맞춰주세요.", false);
  } else {
    setGuideHint("손바닥을 화면 중앙에 맞춰주세요.", false);
  }
  els.overlay.style.display = "none";
}

function stopCamera() {
  stopRenderLoop();
  clearOverlay();
  if (!state.stream) {
    return;
  }
  for (const track of state.stream.getTracks()) {
    track.stop();
  }
  state.stream = null;
  state.hasCamera = false;
  state.latestLandmarks = null;
  state.latestBlendshapes = null;
  setGuideHint("얼굴을 가이드 프레임 안에 맞춰주세요.", false);
  els.overlay.style.display = "grid";
  els.overlay.textContent = "카메라 권한을 허용해주세요.";
}

async function waitForFaceAlignment(timeoutMs = 9000) {
  if (analyzer.mode !== "mediapipe") {
    return true;
  }

  const startedAt = performance.now();
  let stableSince = 0;
  const stableNeededMs = DEVICE.name === "mobile" ? 900 : 700;

  while (state.hasCamera && state.mode === "camera") {
    const elapsed = performance.now() - startedAt;
    if (elapsed > timeoutMs) {
      setGuideHint("얼굴 인식이 안됐어요. 정면으로 다시 맞춰주세요.", false);
      return false;
    }

    const guideState = getFaceGuideState(state.latestLandmarks);
    setGuideHint(guideState.message, guideState.ok);
    if (guideState.ok) {
      if (!stableSince) {
        stableSince = performance.now();
      }
      if (performance.now() - stableSince >= stableNeededMs) {
        return true;
      }
    } else {
      stableSince = 0;
    }

    await sleep(90);
  }

  return false;
}

function captureFrame() {
  const width = els.camera.videoWidth || 640;
  const height = els.camera.videoHeight || 480;
  els.canvas.width = width;
  els.canvas.height = height;
  const ctx = els.canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(els.camera, 0, 0, width, height);
  return { width, height, ctx };
}

function getPixelMetrics() {
  const { width, height, ctx } = captureFrame();
  const pixels = ctx.getImageData(0, 0, width, height).data;

  let totalLuma = 0;
  let totalRed = 0;
  let totalBlue = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    totalRed += r;
    totalBlue += b;
    totalLuma += 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const count = pixels.length / 4;
  return {
    width,
    height,
    avgLuma: totalLuma / count,
    colorBalance: (totalRed - totalBlue) / count,
  };
}

function getLandmarkMetrics(landmarks, frame) {
  const leftCheek = pointAt(landmarks, 234);
  const rightCheek = pointAt(landmarks, 454);
  const forehead = pointAt(landmarks, 10);
  const chin = pointAt(landmarks, 152);
  const leftEyeOuter = pointAt(landmarks, 33);
  const leftEyeInner = pointAt(landmarks, 133);
  const leftEyeUpper = pointAt(landmarks, 159);
  const leftEyeLower = pointAt(landmarks, 145);
  const rightEyeOuter = pointAt(landmarks, 263);
  const rightEyeInner = pointAt(landmarks, 362);
  const rightEyeUpper = pointAt(landmarks, 386);
  const rightEyeLower = pointAt(landmarks, 374);
  const mouthLeft = pointAt(landmarks, 61);
  const mouthRight = pointAt(landmarks, 291);
  const mouthTop = pointAt(landmarks, 13);
  const mouthBottom = pointAt(landmarks, 14);
  const browLeft = pointAt(landmarks, 105);
  const browRight = pointAt(landmarks, 334);
  const noseRoot = pointAt(landmarks, 168);
  const noseBaseLeft = pointAt(landmarks, 129);
  const noseBaseRight = pointAt(landmarks, 358);
  const noseTip = pointAt(landmarks, 1);

  const faceWidth = distance(leftCheek, rightCheek);
  const faceHeight = distance(forehead, chin);
  const eyeDistance = distance(leftEyeOuter, rightEyeOuter);
  const leftEyeWidth = distance(leftEyeOuter, leftEyeInner);
  const rightEyeWidth = distance(rightEyeOuter, rightEyeInner);
  const leftEyeOpen = distance(leftEyeUpper, leftEyeLower);
  const rightEyeOpen = distance(rightEyeUpper, rightEyeLower);
  const eyeOpenness = (leftEyeOpen + rightEyeOpen) / 2;
  const mouthWidth = distance(mouthLeft, mouthRight);
  const mouthOpen = distance(mouthTop, mouthBottom);
  const noseLength = distance(noseRoot, noseTip);
  const noseWidth = distance(noseBaseLeft, noseBaseRight);

  const mouthCenter = {
    x: (mouthTop.x + mouthBottom.x) / 2,
    y: (mouthTop.y + mouthBottom.y) / 2,
  };
  const browCenterY = (browLeft.y + browRight.y) / 2;
  const eyeCenterY = (leftEyeOuter.y + rightEyeOuter.y) / 2;
  const centerX = (leftCheek.x + rightCheek.x) / 2;
  const lowerFace = distance(mouthCenter, chin);

  return {
    width: frame.width,
    height: frame.height,
    faceRatio: faceHeight > 0 ? faceWidth / faceHeight : 0,
    eyeRatio: faceWidth > 0 ? eyeDistance / faceWidth : 0,
    eyeSizeRatio: faceWidth > 0 ? ((leftEyeWidth + rightEyeWidth) / 2) / faceWidth : 0,
    eyeOpennessRatio: faceHeight > 0 ? eyeOpenness / faceHeight : 0,
    mouthRatio: faceWidth > 0 ? mouthWidth / faceWidth : 0,
    mouthOpenRatio: faceHeight > 0 ? mouthOpen / faceHeight : 0,
    noseLengthRatio: faceHeight > 0 ? noseLength / faceHeight : 0,
    noseWidthRatio: faceWidth > 0 ? noseWidth / faceWidth : 0,
    lowerFaceRatio: faceHeight > 0 ? lowerFace / faceHeight : 0,
    browEyeRatio: faceHeight > 0 ? Math.abs(eyeCenterY - browCenterY) / faceHeight : 0,
    symmetryOffset: faceWidth > 0 ? Math.abs(noseTip.x - centerX) / faceWidth : 0,
  };
}

function traitsFromMediapipe(metrics, blendshapeCategory) {
  const smileScore = blendshapeCategory?.find((it) => it.categoryName === "mouthSmileLeft")?.score || 0;
  return {
    energy: clamp01(0.45 + (metrics.eyeRatio - 0.27) * 3.2 + (metrics.mouthOpenRatio - 0.03) * 5.5),
    social: clamp01(0.4 + smileScore * 0.7 + (metrics.mouthRatio - 0.33) * 2.2),
    focus: clamp01(0.55 + (0.095 - metrics.browEyeRatio) * 8 + (1.0 - metrics.faceRatio) * 0.7),
    calm: clamp01(0.55 + (0.08 - metrics.symmetryOffset) * 6.2 + (0.045 - metrics.mouthOpenRatio) * 4.5),
    creative: clamp01(0.45 + (metrics.faceRatio - 0.95) * 1.8 + (metrics.eyeRatio - 0.27) * 2.1),
  };
}

function traitsFromPixels(metrics) {
  return {
    energy: clamp01(metrics.avgLuma / 210),
    social: clamp01(0.5 + metrics.colorBalance / 120),
    focus: clamp01(0.65 - Math.abs(metrics.colorBalance) / 180),
    calm: clamp01(0.8 - Math.abs(metrics.colorBalance) / 150),
    creative: clamp01(0.35 + Math.abs(metrics.colorBalance) / 140),
  };
}

function selectFaceResult(traits, seedNumber) {
  if (FORCE_ORC_RESULT) {
    return FACE_RESULTS.find((x) => x.id === "orc-guardian") || FACE_RESULTS[0];
  }

  let bestId = FACE_RESULTS[0].id;
  let bestScore = -Infinity;

  for (const [id, weight] of Object.entries(PROFILE_WEIGHTS)) {
    const score =
      traits.energy * weight.energy +
      traits.social * weight.social +
      traits.focus * weight.focus +
      traits.calm * weight.calm +
      traits.creative * weight.creative;
    const tieBreaker = ((seedNumber + id.length * 17) % 1000) / 100000;
    const finalScore = score + tieBreaker;
    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestId = id;
    }
  }

  return FACE_RESULTS.find((x) => x.id === bestId) || FACE_RESULTS[0];
}

function getFaceSeed(analysis) {
  if (analysis.mode === "mediapipe") {
    return Math.round(
      analysis.metrics.faceRatio * 1000 +
      analysis.metrics.eyeRatio * 2000 +
      analysis.metrics.mouthRatio * 1700 +
      analysis.metrics.symmetryOffset * 3000,
    );
  }

  return Math.round(analysis.metrics.avgLuma * 10 + analysis.metrics.colorBalance * 10);
}

function getArchetypeImageSrc(resultId) {
  return ARCHETYPE_IMAGE_MAP[resultId] || "/assets/archetypes/yongan.svg";
}

function buildPartNarrative(analysis) {
  if (analysis.mode !== "mediapipe") {
    return {
      eye: "눈: 오크형 눈 축으로 분류됐고 조명/화면 기준에서는 안정형으로 읽혔어요.",
      nose: "코: 오크형 코 축으로 분류됐고 랜드마크 부재 시에는 균형형으로 보정했어요.",
      mouth: "입: 오크형 입 축으로 분류됐고 표현성은 중간 축으로 판단했어요.",
      brow: "눈썹: 기복이 크지 않은 신중형 흐름으로 해석했어요.",
      face: "얼굴형: 전체 흐름은 안정-실행의 균형형으로 분류했어요.",
      summary: "그래서 처음엔 신중하게 보고, 결정을 내리면 꾸준히 가는 타입으로 해석됩니다.",
    };
  }

  const m = analysis.metrics;
  const eye = m.eyeOpennessRatio >= 0.04
    ? "눈: 오크형 눈 축으로 읽혀 반응 속도가 빠르고 상황 캐치가 좋은 편으로 해석했어요."
    : "눈: 오크형 눈 축 중 절제형으로 읽혀 한 번 더 점검하고 움직이는 신중형으로 해석했어요.";
  const nose = m.noseLengthRatio >= 0.34
    ? "코: 오크형 코 축 중 장형으로 읽혀 중심 추진력과 버티는 힘이 있는 타입으로 해석했어요."
    : "코: 오크형 코 축 중 안정형으로 읽혀 균형감 있게 판단하는 타입으로 해석했어요.";
  const mouth = m.mouthRatio >= 0.34
    ? "입: 오크형 입 축 중 확장형으로 읽혀 의견 전달과 관계 확장이 좋은 흐름으로 해석했어요."
    : "입: 오크형 입 축 중 절제형으로 읽혀 말보다 실행으로 보여주는 흐름으로 해석했어요.";
  const brow = m.browEyeRatio <= 0.095
    ? "눈썹: 눈과의 간격이 안정 축이라 집중력과 결론 정리력이 좋은 타입으로 읽었어요."
    : "눈썹: 간격이 유동 축이라 유연하게 관점을 바꾸는 타입으로 읽었어요.";
  const face = m.faceRatio >= 0.95
    ? "얼굴형: 중·하정이 길게 읽혀 실전/행동 전환이 빠른 흐름으로 해석했어요."
    : "얼굴형: 상·중정 집중 축으로 읽혀 기획과 구조화 성향이 도드라지는 흐름이에요.";
  const summary = m.symmetryOffset <= 0.085
    ? "그래서 전체적으로 균형감 있게 오래 끌고 가는 성향이 강한 타입으로 봤어요."
    : "그래서 변화에 빠르게 적응하고 상황마다 전략을 바꾸는 타입으로 봤어요.";

  return { eye, nose, mouth, brow, face, summary };
}

function buildFaceResultHTML(result, analysis) {
  const parts = buildPartNarrative(analysis);
  const imageSrc = getArchetypeImageSrc(result.id);

  return `
    <div class="result-hero">
      <img class="result-portrait" src="${imageSrc}" alt="${result.title} 관상 일러스트" />
      <div class="result-headline">
        <h3>${result.title}</h3>
        <p class="tone">${result.tone}</p>
      </div>
    </div>
    <p>${result.description}</p>
    <div class="part-readout">
      <p><strong>눈</strong> ${parts.eye.replace("눈:", "").trim()}</p>
      <p><strong>코</strong> ${parts.nose.replace("코:", "").trim()}</p>
      <p><strong>입</strong> ${parts.mouth.replace("입:", "").trim()}</p>
      <p><strong>눈썹</strong> ${parts.brow.replace("눈썹:", "").trim()}</p>
      <p><strong>얼굴형</strong> ${parts.face.replace("얼굴형:", "").trim()}</p>
      <p class="part-summary">${parts.summary}</p>
    </div>
  `;
}

function selectPalmResult(metrics) {
  const seed = Math.abs(Math.round(metrics.avgLuma * 3 + metrics.colorBalance * 5 + metrics.width + metrics.height));
  return PALM_RESULTS[seed % PALM_RESULTS.length];
}

function buildPalmResultHTML(result) {
  return `
    <div class="result-hero">
      <img class="result-portrait" src="/assets/archetypes/jaebok.svg" alt="손금 결과 일러스트" />
      <div class="result-headline">
        <h3>${result.title}</h3>
        <p class="tone">${result.tone}</p>
      </div>
    </div>
    <p>${result.description}</p>
    <div class="part-readout">
      <p><strong>손바닥 윤곽</strong> 균형/개방 패턴 중심으로 분류했습니다.</p>
      <p><strong>주요 선 대비</strong> 명암 대비와 결 방향을 규칙 엔진으로 계산했습니다.</p>
      <p><strong>선의 연결감</strong> 끊김보다 연결 흐름 여부를 보조 지표로 반영했습니다.</p>
      <p class="part-summary">그래서 현재는 ${result.title} 흐름이 강조되는 타입으로 해석됩니다.</p>
    </div>
  `;
}

function analyzeFaceFrame() {
  if (analyzer.mode === "mediapipe" && state.latestLandmarks) {
    const frame = {
      width: els.camera.videoWidth || 640,
      height: els.camera.videoHeight || 480,
    };
    const metrics = getLandmarkMetrics(state.latestLandmarks, frame);
    const traits = traitsFromMediapipe(metrics, state.latestBlendshapes?.categories);
    return { mode: "mediapipe", metrics, traits };
  }

  const metrics = getPixelMetrics();
  const traits = traitsFromPixels(metrics);
  return { mode: "rule", metrics, traits };
}

function analyzePalmFrame() {
  return getPixelMetrics();
}

async function playAnalysisSequence(type) {
  const startedAt = performance.now();
  const minimumDurationMs = DEVICE.name === "mobile" ? 4200 : 3600;
  const faceSteps = [
    { text: "얼굴 라인과 포인트를 인식하고 있습니다.", progress: 16 },
    { text: "눈·코·입 비율을 비교 분석하고 있습니다.", progress: 38 },
    { text: "삼정/오관 특징값을 계산하고 있습니다.", progress: 62 },
    { text: "유형 분류를 검증하고 있습니다.", progress: 84 },
    { text: "전문가 해설 리포트를 생성하고 있습니다.", progress: 96 },
  ];
  const palmSteps = [
    { text: "손바닥 윤곽과 선 패턴을 인식하고 있습니다.", progress: 18 },
    { text: "생명·지능·감정선 흐름을 분석하고 있습니다.", progress: 42 },
    { text: "손금 특징값을 계산하고 있습니다.", progress: 66 },
    { text: "유형 분류를 검증하고 있습니다.", progress: 86 },
    { text: "전문가 해설 리포트를 생성하고 있습니다.", progress: 96 },
  ];

  const steps = type === "palm" ? palmSteps : faceSteps;
  const stepDelay = DEVICE.name === "mobile" ? 620 : 520;

  setAnalysisOverlay(true, type === "palm" ? "손금을 분석중입니다." : "관상을 분석중입니다.", 8);
  for (const step of steps) {
    setAnalysisOverlay(true, step.text, step.progress);
    await sleep(stepDelay);
  }

  const elapsed = performance.now() - startedAt;
  if (elapsed < minimumDurationMs) {
    setAnalysisOverlay(true, "정밀 검증을 진행하고 있습니다.", 98);
    await sleep(minimumDurationMs - elapsed);
  }

  setAnalysisOverlay(true, "결과를 정리하고 있습니다.", 100);
  await sleep(DEVICE.name === "mobile" ? 420 : 320);
}

async function startExperience(type) {
  state.analysisType = type;
  switchView("camera");
  setStatus(type === "palm" ? "손금 카메라 준비중..." : "관상 카메라 준비중...");

  try {
    await startCamera();
    if (type === "face") {
      setStatus("얼굴 위치 확인 중...");
      const aligned = await waitForFaceAlignment();
      if (!aligned) {
        setStatus("얼굴 인식이 안돼서 분석을 시작할 수 없어요. 얼굴을 프레임에 맞춰 다시 시도해주세요.");
        return;
      }
      setStatus("얼굴 정렬 확인 완료");
    } else {
      setStatus("손금 카메라 준비 완료");
    }
    await playAnalysisSequence(type);

    if (type === "palm") {
      const metrics = analyzePalmFrame();
      const palmResult = selectPalmResult(metrics);
      els.resultCard.innerHTML = buildPalmResultHTML(palmResult);
    } else {
      const analysis = analyzeFaceFrame();
      const selected = selectFaceResult(analysis.traits, getFaceSeed(analysis));
      els.resultCard.innerHTML = buildFaceResultHTML(selected, analysis);
    }

    setStatus("결과를 확인 중입니다.");
    stopCamera();
    switchView("result");
  } catch (err) {
    console.error(err);
    setStatus("카메라 준비에 실패했습니다. 권한을 확인해주세요.");
    stopCamera();
    switchView("landing");
  } finally {
    setAnalysisOverlay(false, "", 0);
  }
}

function cancelCameraFlow() {
  setAnalysisOverlay(false, "", 0);
  stopCamera();
  state.analysisType = null;
  setStatus("대기 중");
  switchView("landing");
}

function resetToLanding() {
  state.analysisType = null;
  setStatus("대기 중");
  switchView("landing");
}

function attachEvents() {
  els.startFaceBtn.addEventListener("click", () => startExperience("face"));
  els.startPalmBtn.addEventListener("click", () => startExperience("palm"));
  els.cancelCameraBtn.addEventListener("click", cancelCameraFlow);
  els.retryBtn.addEventListener("click", resetToLanding);
  window.addEventListener("beforeunload", stopCamera);
}

async function bootstrap() {
  attachEvents();
  forceMirrorPreview();
  setStatus("대기 중");
  switchView("landing");
  await initAnalyzer();
}

bootstrap();
