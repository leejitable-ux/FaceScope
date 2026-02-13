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
  mode: "capture",
  snapshotMetrics: null,
  engine: "rule",
  engineReady: false,
  engineError: null,
  renderRafId: null,
  lastInferTs: 0,
  latestLandmarks: null,
  latestBlendshapes: null,
};

const RESULT_LIBRARY = [
  { id: "sunrise-strategy", title: "새벽 전략가형", tone: "침착함 + 설계형 사고", description: "상황을 빠르게 읽고 차분하게 계획을 세우는 편으로 해석됐어요. 중요한 순간에 감정보다 구조를 먼저 보는 타입입니다.", tips: "재미 포인트: 오늘의 선택에서 우선순위 1개만 정해보세요." },
  { id: "warm-navigator", title: "온화한 네비게이터형", tone: "배려 + 균형감", description: "분위기를 유연하게 만들고 주변의 속도를 맞추는 경향이 강하게 나왔어요. 팀 플레이에서 빛나는 스타일입니다.", tips: "재미 포인트: 오늘 대화에서 칭찬 한 문장을 먼저 건네보세요." },
  { id: "spark-initiator", title: "점화 이니시에이터형", tone: "추진력 + 호기심", description: "시작이 빠르고 아이디어 점프가 좋은 흐름이에요. 새로운 도전을 재미 요소로 받아들이는 해석입니다.", tips: "재미 포인트: 미뤄둔 작은 할 일 하나를 5분만 착수해보세요." },
  { id: "steady-crafter", title: "꾸준한 크래프터형", tone: "집중력 + 완성도", description: "한 번 잡은 일은 끝까지 다듬는 성향으로 분류됐어요. 속도보다 품질을 중시하는 면이 돋보입니다.", tips: "재미 포인트: 오늘 마무리할 항목 1개를 먼저 끝내보세요." },
  { id: "lively-connector", title: "활력 커넥터형", tone: "사교성 + 순발력", description: "사람과 사람 사이의 연결 고리를 빨리 찾아내는 편으로 해석됩니다. 즉흥 상황 대응력이 좋은 타입입니다.", tips: "재미 포인트: 오랜만인 지인에게 짧은 안부 메시지를 보내보세요." },
  { id: "deep-diver", title: "깊이 탐구형", tone: "분석력 + 몰입", description: "하나의 주제를 깊게 파고드는 성향이 강조됐어요. 디테일을 발견하는 재미를 잘 느끼는 편입니다.", tips: "재미 포인트: 관심 주제 아티클 1개를 요약해보세요." },
  { id: "calm-anchor", title: "차분한 앵커형", tone: "안정감 + 신뢰", description: "급한 상황에서도 리듬을 유지하는 특성이 보여요. 주변에서 믿고 의지하기 쉬운 캐릭터로 해석됩니다.", tips: "재미 포인트: 오늘 할 일 중 가장 불안한 항목부터 착수해보세요." },
  { id: "creative-mixer", title: "크리에이티브 믹서형", tone: "유연함 + 전환력", description: "서로 다른 아이디어를 섞어 새로운 결론으로 만드는 흐름이 감지됐어요. 변화 대응이 빠른 편입니다.", tips: "재미 포인트: 익숙한 루틴 하나를 다른 방식으로 바꿔보세요." },
  { id: "bold-explorer", title: "대담한 익스플로러형", tone: "자신감 + 개척성", description: "낯선 영역에서도 먼저 발을 들여보는 성향이 강조됩니다. 시행착오를 학습으로 바꾸는 타입으로 해석돼요.", tips: "재미 포인트: 이번 주 시도할 새로운 활동 1개를 적어보세요." },
  { id: "balanced-director", title: "균형 디렉터형", tone: "판단력 + 조율", description: "복수 선택지 사이에서 균형점을 찾는 특징이 나왔어요. 전체 그림을 보며 의사결정하는 성향입니다.", tips: "재미 포인트: 고민 중인 선택지를 장단점 3개씩만 적어보세요." },
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
};

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
  startBtn: document.getElementById("start-camera-btn"),
  analyzeBtn: document.getElementById("analyze-btn"),
  retryBtn: document.getElementById("retry-btn"),
  captureView: document.getElementById("capture-view"),
  resultView: document.getElementById("result-view"),
  resultCard: document.getElementById("result-card"),
  canvas: document.getElementById("snapshot-canvas"),
  faceOverlay: document.getElementById("face-overlay-canvas"),
  analysisOverlay: document.getElementById("analysis-overlay"),
  analysisStep: document.getElementById("analysis-step"),
  analysisProgressFill: document.getElementById("analysis-progress-fill"),
};

function setStatus(text) {
  els.status.textContent = text;
}

function setEngineBadge(text, fallback = false) {
  els.engineBadge.textContent = text;
  els.engineBadge.classList.toggle("fallback", fallback);
}

function switchView(mode) {
  state.mode = mode;
  els.captureView.classList.toggle("active", mode === "capture");
  els.resultView.classList.toggle("active", mode === "result");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setAnalysisOverlay(active, stepText = "", progress = 0) {
  if (!els.analysisOverlay) {
    return;
  }

  els.analysisOverlay.classList.toggle("hidden", !active);
  if (stepText && els.analysisStep) {
    els.analysisStep.textContent = stepText;
  }
  if (els.analysisProgressFill) {
    const clamped = Math.max(0, Math.min(100, progress));
    els.analysisProgressFill.style.width = `${clamped}%`;
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

function drawLandmarksOverlay(landmarks) {
  ensureOverlayCanvasSize();
  const ctx = els.faceOverlay.getContext("2d");
  const width = els.faceOverlay.width;
  const height = els.faceOverlay.height;

  ctx.clearRect(0, 0, width, height);

  const keyIndices = DEVICE.overlayPoints;
  ctx.strokeStyle = "rgba(16, 185, 129, 0.9)";
  ctx.fillStyle = "rgba(249, 115, 22, 0.95)";
  ctx.lineWidth = Math.max(1, width / 500);

  for (const idx of keyIndices) {
    const p = landmarks[idx];
    if (!p) {
      continue;
    }
    const x = p.x * width;
    const y = p.y * height;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, width / 260), 0, Math.PI * 2);
    ctx.fill();
  }

  const leftCheek = pointAt(landmarks, 234);
  const rightCheek = pointAt(landmarks, 454);
  const forehead = pointAt(landmarks, 10);
  const chin = pointAt(landmarks, 152);

  ctx.beginPath();
  ctx.moveTo(leftCheek.x * width, leftCheek.y * height);
  ctx.lineTo(rightCheek.x * width, rightCheek.y * height);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(forehead.x * width, forehead.y * height);
  ctx.lineTo(chin.x * width, chin.y * height);
  ctx.stroke();
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

    if (analyzer.mode === "mediapipe" && analyzer.landmarker && els.camera.readyState >= 2) {
      const shouldInfer = timestamp - state.lastInferTs >= inferIntervalMs;
      if (shouldInfer) {
        try {
          const result = analyzer.landmarker.detectForVideo(els.camera, timestamp);
          const landmarks = result.faceLandmarks?.[0] || null;
          state.latestLandmarks = landmarks;
          state.latestBlendshapes = result.faceBlendshapes?.[0] || null;
          state.lastInferTs = timestamp;
          if (landmarks) {
            drawLandmarksOverlay(landmarks);
          } else {
            clearOverlay();
          }
        } catch (err) {
          state.latestLandmarks = null;
          clearOverlay();
          console.warn("실시간 추론 중 오류가 발생했습니다.", err);
        }
      }
    } else {
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
    setStatus("현재 브라우저는 카메라 API를 지원하지 않습니다.");
    els.overlay.textContent = "카메라를 사용할 수 없는 환경입니다.";
    return;
  }

  try {
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
    runPreviewLoop();

    els.overlay.style.display = "none";
    els.analyzeBtn.disabled = false;
    setStatus(`카메라 준비 완료 (${DEVICE.name} 최적화). 결과 보기 버튼을 눌러주세요.`);
  } catch (err) {
    state.hasCamera = false;
    stopRenderLoop();
    els.overlay.style.display = "grid";
    els.overlay.textContent = "카메라 권한이 거부되었거나 장치를 찾을 수 없습니다.";
    els.analyzeBtn.disabled = true;
    setStatus("카메라 접근에 실패했습니다. 브라우저 권한을 확인해주세요.");
    console.error(err);
  }
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
  const rightEyeOuter = pointAt(landmarks, 263);
  const mouthLeft = pointAt(landmarks, 61);
  const mouthRight = pointAt(landmarks, 291);
  const mouthTop = pointAt(landmarks, 13);
  const mouthBottom = pointAt(landmarks, 14);
  const browLeft = pointAt(landmarks, 105);
  const browRight = pointAt(landmarks, 334);
  const noseTip = pointAt(landmarks, 1);

  const faceWidth = distance(leftCheek, rightCheek);
  const faceHeight = distance(forehead, chin);
  const eyeDistance = distance(leftEyeOuter, rightEyeOuter);
  const mouthWidth = distance(mouthLeft, mouthRight);
  const mouthOpen = distance(mouthTop, mouthBottom);
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
    mouthRatio: faceWidth > 0 ? mouthWidth / faceWidth : 0,
    mouthOpenRatio: faceHeight > 0 ? mouthOpen / faceHeight : 0,
    lowerFaceRatio: faceHeight > 0 ? lowerFace / faceHeight : 0,
    browEyeRatio: faceHeight > 0 ? Math.abs(eyeCenterY - browCenterY) / faceHeight : 0,
    symmetryOffset: faceWidth > 0 ? Math.abs(noseTip.x - centerX) / faceWidth : 0,
  };
}

function buildTraditionalBasis(analysis) {
  if (analysis.mode !== "mediapipe") {
    return [
      "얼굴 랜드마크 인식이 불가해 밝기/색상 기반 보조 규칙으로 결과를 생성했습니다.",
    ];
  }

  const m = analysis.metrics;
  const basis = [];

  if (m.faceRatio >= 0.95) {
    basis.push("삼정 비율에서 중정-하정 흐름이 상대적으로 길게 잡혀 추진/실행 성향 가중치를 높였습니다.");
  } else {
    basis.push("삼정 비율에서 상정-중정 집중도가 상대적으로 높아 기획/집중 성향 가중치를 높였습니다.");
  }

  if (m.eyeRatio >= 0.29) {
    basis.push("오관 중 눈 간격 비율이 넓은 축으로 분류되어 개방/에너지 지표를 상향했습니다.");
  } else {
    basis.push("오관 중 눈 간격 비율이 안정 축으로 분류되어 신중/집중 지표를 상향했습니다.");
  }

  if (m.mouthRatio >= 0.34) {
    basis.push("오관 중 입 비율이 넓은 축으로 분류되어 표현/사교 지표를 상향했습니다.");
  } else {
    basis.push("오관 중 입 비율이 절제 축으로 분류되어 안정/집중 지표를 상향했습니다.");
  }

  if (m.symmetryOffset <= 0.085) {
    basis.push("중심축 대칭 오프셋이 낮아 안정성(균형) 가중치를 추가했습니다.");
  } else {
    basis.push("중심축 오프셋이 큰 편이라 변화 대응(유연) 가중치를 추가했습니다.");
  }

  if (m.lowerFaceRatio >= 0.29) {
    basis.push("하정 비율이 비교적 큰 편으로 분류되어 실행/행동 계열 문구를 우선 배치했습니다.");
  } else {
    basis.push("하정 비율이 비교적 절제된 편으로 분류되어 신중/조율 계열 문구를 우선 배치했습니다.");
  }

  return basis;
}

function buildCardSpecificBasis(resultId, analysis) {
  if (analysis.mode !== "mediapipe") {
    return [
      "카드별 세부 관상 해석은 랜드마크 인식 시점에 활성화됩니다.",
    ];
  }

  const m = analysis.metrics;
  const t = analysis.traits;

  const catalog = {
    "sunrise-strategy": [
      m.browEyeRatio <= 0.09
        ? "미간-눈 중심 간격이 조밀한 축이라 판단 집약형 문구를 강화했습니다."
        : "미간-눈 중심 간격이 완만한 축이라 계획-조율 문구를 유지했습니다.",
      m.eyeRatio <= 0.28
        ? "눈폭 대비 간격이 안정형이라 장기 설계 해석을 우선 적용했습니다."
        : "눈 간격이 열린 편이라 확장형 기획 해석을 함께 반영했습니다.",
    ],
    "warm-navigator": [
      m.mouthRatio >= 0.34
        ? "입 비율이 열린 축이라 대인 조화/공감 문구의 비중을 높였습니다."
        : "입 비율이 안정 축이라 배려와 신뢰 중심 문구를 유지했습니다.",
      t.social >= 0.62
        ? "사교 지표가 높아 관계 조율형 해석을 전면 배치했습니다."
        : "사교 지표가 중간권이라 균형형 소통 해석으로 정리했습니다.",
    ],
    "spark-initiator": [
      m.mouthOpenRatio >= 0.038
        ? "입 개방 비율이 높은 편으로 분류되어 즉시 실행형 문구를 강화했습니다."
        : "입 개방 비율이 안정권이라 추진-신중 균형 문구를 적용했습니다.",
      t.energy >= 0.7
        ? "에너지 지표 우세로 스타트 속도형 해석을 우선 노출했습니다."
        : "에너지 지표가 보통이라 점화-준비 병행 해석으로 구성했습니다.",
    ],
    "steady-crafter": [
      m.symmetryOffset <= 0.08
        ? "중심축 안정도가 높아 완성도/정밀도 해석 가중치를 높였습니다."
        : "중심축 편차가 보여 보정/반복 개선형 해석을 적용했습니다.",
      t.focus >= 0.7
        ? "집중 지표 우세로 디테일 고도화형 문구를 전면 배치했습니다."
        : "집중 지표가 중간권이라 꾸준함 중심 문구로 정리했습니다.",
    ],
    "lively-connector": [
      m.eyeRatio >= 0.29
        ? "눈 간격 확장 축으로 관계 확장/연결 해석을 강화했습니다."
        : "눈 간격 안정 축으로 핵심 인맥 밀도형 해석을 유지했습니다.",
      t.social >= 0.68
        ? "사교 지표 상위권이라 커넥터형 문구를 강하게 반영했습니다."
        : "사교 지표 중상권이라 친화형 문구 중심으로 반영했습니다.",
    ],
    "deep-diver": [
      m.faceRatio <= 0.95
        ? "상정-중정 집중형 비율로 탐구/분석형 해석을 우선 적용했습니다."
        : "중정-하정 확장형 비율로 분석+실행 병행 해석을 추가했습니다.",
      t.focus >= 0.72
        ? "집중 지표가 높아 단일 주제 몰입형 문구를 강화했습니다."
        : "집중 지표가 중간권이라 단계 탐구형 문구로 조정했습니다.",
    ],
    "calm-anchor": [
      m.symmetryOffset <= 0.078
        ? "중심축 균형이 높게 잡혀 안정/신뢰 문구를 우선 배치했습니다."
        : "중심축 변동이 있어 유연 안정형 문구를 병행 배치했습니다.",
      t.calm >= 0.7
        ? "안정 지표가 높아 위기 완충형 해석을 강화했습니다."
        : "안정 지표가 중간권이라 균형 회복형 해석으로 정리했습니다.",
    ],
    "creative-mixer": [
      m.faceRatio >= 0.96
        ? "얼굴 비율 확장 축으로 전환/융합 문구의 가중치를 높였습니다."
        : "얼굴 비율 안정 축으로 구조화된 창의 문구를 유지했습니다.",
      t.creative >= 0.7
        ? "창의 지표 우세로 조합/재구성형 해석을 전면 노출했습니다."
        : "창의 지표 중간권이라 응용형 해석 중심으로 배치했습니다.",
    ],
    "bold-explorer": [
      m.lowerFaceRatio >= 0.29
        ? "하정 비율이 큰 축으로 분류되어 개척/돌파 문구를 강화했습니다."
        : "하정 비율이 보통 축이라 도전-안전 병행 문구로 구성했습니다.",
      t.energy >= 0.72
        ? "에너지 지표 상위권이라 선행 시도형 해석을 우선 적용했습니다."
        : "에너지 지표 중상권이라 점진 도전형 해석으로 정리했습니다.",
    ],
    "balanced-director": [
      m.browEyeRatio <= 0.095
        ? "미간-눈 비율이 안정 축이라 판단/조율형 문구의 비중을 높였습니다."
        : "미간-눈 비율이 유동 축이라 조율+실행형 문구를 병행했습니다.",
      t.focus >= 0.66 && t.calm >= 0.66
        ? "집중·안정 지표가 함께 높아 의사결정형 해석을 강화했습니다."
        : "집중·안정 지표가 중간권이라 균형 관리자형 해석을 적용했습니다.",
    ],
  };

  return catalog[resultId] || [];
}

function buildExpertReport(result, analysis) {
  const entries = Object.entries(analysis.traits).sort((a, b) => b[1] - a[1]);
  const traitLabel = {
    energy: "추진력",
    social: "관계성",
    focus: "집중력",
    calm: "안정감",
    creative: "창의성",
  };

  const topKey = entries[0][0];
  const secondKey = entries[1][0];
  const lowKey = entries[entries.length - 1][0];

  const lines = [];
  lines.push(`핵심축은 ${traitLabel[topKey]} + ${traitLabel[secondKey]} 조합으로 해석됩니다.`);
  lines.push(`보완축은 ${traitLabel[lowKey]}이며, 결과 카드(${result.title}) 해석 시 균형 포인트로 반영했습니다.`);

  if (analysis.mode === "mediapipe") {
    lines.push(analysis.metrics.symmetryOffset <= 0.085
      ? "중심축 균형도가 안정 범위라 일관성 있는 판단 흐름으로 해석했습니다."
      : "중심축 변동 폭이 보여 유연 대응형 판단 흐름으로 해석했습니다.");
    lines.push(analysis.metrics.lowerFaceRatio >= 0.29
      ? "하정 비율이 상대적으로 커 실행 전환 속도를 높게 평가했습니다."
      : "하정 비율이 상대적으로 절제되어 신중 조율 성향을 높게 평가했습니다.");
  } else {
    lines.push("랜덤 텍스트가 아니라 밝기/색상 지표 기반 보조 규칙으로 리포트를 생성했습니다.");
    lines.push("랜드마크 인식 가능 시 리포트 정확도와 근거 문장 수가 확장됩니다.");
  }

  return lines;
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

function selectResultByTraits(traits, seedNumber) {
  let bestId = RESULT_LIBRARY[0].id;
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

  return RESULT_LIBRARY.find((x) => x.id === bestId) || RESULT_LIBRARY[0];
}

function buildResultHTML(result, analysis) {
  const metricText = analysis.mode === "mediapipe"
    ? `얼굴비 ${analysis.metrics.faceRatio.toFixed(2)}, 눈비율 ${analysis.metrics.eyeRatio.toFixed(2)}, 입비율 ${analysis.metrics.mouthRatio.toFixed(2)}, 대칭오프셋 ${analysis.metrics.symmetryOffset.toFixed(3)}`
    : `평균 밝기 ${analysis.metrics.avgLuma.toFixed(1)}, 색상 밸런스 ${analysis.metrics.colorBalance.toFixed(1)}`;

  const modeText = analysis.mode === "mediapipe"
    ? "MediaPipe Face Landmarker + 룰 엔진"
    : "룰 기반 폴백 엔진";

  const traitsText = `에너지 ${Math.round(analysis.traits.energy * 100)} / 사교성 ${Math.round(analysis.traits.social * 100)} / 집중 ${Math.round(analysis.traits.focus * 100)} / 안정 ${Math.round(analysis.traits.calm * 100)} / 창의 ${Math.round(analysis.traits.creative * 100)}`;
  const basisText = buildTraditionalBasis(analysis).join("<br>");
  const specificBasisText = buildCardSpecificBasis(result.id, analysis).join("<br>");
  const expertReportText = buildExpertReport(result, analysis)
    .map((line) => `<p>${line}</p>`)
    .join("");

  return `
    <h3>${result.title}</h3>
    <p class="tone">${result.tone}</p>
    <p>${result.description}</p>
    <p class="tips">${result.tips}</p>
    <p class="tips">분석 모드: ${modeText}</p>
    <p class="tips">특성 벡터: ${traitsText}</p>
    <p class="tips">측정 정보: ${metricText}</p>
    <p class="tips">해석 기준(오락용):<br>${basisText}</p>
    <p class="tips">카드 전용 해석:<br>${specificBasisText}</p>
    <section class="expert-report">
      <h4>전문가 해설 리포트</h4>
      ${expertReportText}
    </section>
  `;
}

function getSeedFromAnalysis(analysis) {
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

function analyzeWithMediapipeFromLatestFrame() {
  if (!state.latestLandmarks) {
    return null;
  }

  const frame = {
    width: els.camera.videoWidth || 640,
    height: els.camera.videoHeight || 480,
  };

  const metrics = getLandmarkMetrics(state.latestLandmarks, frame);
  const blendshapeCategory = state.latestBlendshapes?.categories;
  const traits = traitsFromMediapipe(metrics, blendshapeCategory);
  return { mode: "mediapipe", metrics, traits };
}

function analyzeWithRuleFallback() {
  const metrics = getPixelMetrics();
  const traits = traitsFromPixels(metrics);
  return { mode: "rule", metrics, traits };
}

function analyzeFrame() {
  if (analyzer.mode === "mediapipe") {
    const mediapipeResult = analyzeWithMediapipeFromLatestFrame();
    if (mediapipeResult) {
      return mediapipeResult;
    }
  }

  return analyzeWithRuleFallback();
}

async function playAnalysisSequence() {
  const steps = [
    { text: "얼굴 윤곽 정합을 진행하고 있습니다.", progress: 18 },
    { text: "오관(눈/코/입) 기준 포인트를 계산 중입니다.", progress: 44 },
    { text: "삼정 비율과 중심축 안정도를 분석 중입니다.", progress: 72 },
    { text: "결과 카드와 전문가 해설 리포트를 생성 중입니다.", progress: 96 },
  ];

  const stepDelay = DEVICE.name === "mobile" ? 360 : 280;
  setAnalysisOverlay(true, steps[0].text, 6);
  for (const step of steps) {
    setAnalysisOverlay(true, step.text, step.progress);
    await sleep(stepDelay);
  }
  setAnalysisOverlay(true, "최종 결과를 정리하고 있습니다.", 100);
  await sleep(DEVICE.name === "mobile" ? 260 : 180);
}

async function runLocalAnalysis() {
  if (!state.hasCamera) {
    setStatus("먼저 카메라를 시작해주세요.");
    return;
  }

  els.analyzeBtn.disabled = true;
  setStatus("분석 중...");

  try {
    await playAnalysisSequence();
    const analysis = analyzeFrame();
    state.snapshotMetrics = analysis.metrics;

    const seed = getSeedFromAnalysis(analysis);
    const selected = selectResultByTraits(analysis.traits, seed);

    els.resultCard.innerHTML = buildResultHTML(selected, analysis);
    switchView("result");
    setStatus("결과를 확인 중입니다.");
  } catch (err) {
    setStatus("분석에 실패했습니다. 다시 시도해주세요.");
    console.error(err);
  } finally {
    setAnalysisOverlay(false, "", 0);
    els.analyzeBtn.disabled = false;
  }
}

function resetToCapture() {
  switchView("capture");
  setStatus("대기 중");
  setAnalysisOverlay(false, "", 0);
}

function attachEvents() {
  els.startBtn.addEventListener("click", startCamera);
  els.analyzeBtn.addEventListener("click", runLocalAnalysis);
  els.retryBtn.addEventListener("click", resetToCapture);
  window.addEventListener("beforeunload", stopCamera);
}

async function bootstrap() {
  attachEvents();
  setStatus("대기 중");
  switchView("capture");
  await initAnalyzer();
}

bootstrap();
