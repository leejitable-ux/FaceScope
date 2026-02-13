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

function forceMirrorPreview() {
  const targets = [els.camera, els.faceOverlay];
  for (const el of targets) {
    if (!el) {
      continue;
    }
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
    forceMirrorPreview();
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
  const browInnerLeft = pointAt(landmarks, 70);
  const browInnerRight = pointAt(landmarks, 300);
  const browOuterLeft = pointAt(landmarks, 46);
  const browOuterRight = pointAt(landmarks, 276);
  const noseRoot = pointAt(landmarks, 168);
  const noseBaseLeft = pointAt(landmarks, 129);
  const noseBaseRight = pointAt(landmarks, 358);
  const glabella = pointAt(landmarks, 9);
  const midFacePoint = pointAt(landmarks, 2);
  const jawLeft = pointAt(landmarks, 172);
  const jawRight = pointAt(landmarks, 397);
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
  const browWidth = distance(browLeft, browRight);
  const browSpan = (distance(browOuterLeft, browInnerLeft) + distance(browOuterRight, browInnerRight)) / 2;
  const mouthCenter = {
    x: (mouthTop.x + mouthBottom.x) / 2,
    y: (mouthTop.y + mouthBottom.y) / 2,
  };

  const browCenterY = (browLeft.y + browRight.y) / 2;
  const eyeCenterY = (leftEyeOuter.y + rightEyeOuter.y) / 2;
  const centerX = (leftCheek.x + rightCheek.x) / 2;
  const lowerFace = distance(mouthCenter, chin);
  const upperThird = distance(forehead, glabella);
  const middleThird = distance(glabella, midFacePoint);
  const lowerThird = distance(midFacePoint, chin);
  const jawWidth = distance(jawLeft, jawRight);

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
    browWidthRatio: faceWidth > 0 ? browWidth / faceWidth : 0,
    browSpanRatio: faceWidth > 0 ? browSpan / faceWidth : 0,
    lowerFaceRatio: faceHeight > 0 ? lowerFace / faceHeight : 0,
    browEyeRatio: faceHeight > 0 ? Math.abs(eyeCenterY - browCenterY) / faceHeight : 0,
    upperThirdRatio: faceHeight > 0 ? upperThird / faceHeight : 0,
    middleThirdRatio: faceHeight > 0 ? middleThird / faceHeight : 0,
    lowerThirdRatio: faceHeight > 0 ? lowerThird / faceHeight : 0,
    jawRatio: faceWidth > 0 ? jawWidth / faceWidth : 0,
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

  if (m.noseLengthRatio >= 0.34) {
    basis.push("코 길이 비율이 긴 축으로 분류되어 중심 추진력/지속성 가중치를 높였습니다.");
  } else {
    basis.push("코 길이 비율이 안정 축으로 분류되어 균형 판단/안정성 가중치를 유지했습니다.");
  }

  if (m.noseWidthRatio >= 0.16) {
    basis.push("코 폭 비율이 넓은 축으로 분류되어 실행력/현실 대응 문구를 강화했습니다.");
  } else {
    basis.push("코 폭 비율이 좁은 축으로 분류되어 정밀/세밀 판단 문구를 강화했습니다.");
  }

  if (m.eyeOpennessRatio >= 0.04) {
    basis.push("눈 개방 비율이 높은 편으로 분류되어 반응 속도/활동성 해석을 상향했습니다.");
  } else {
    basis.push("눈 개방 비율이 안정권으로 분류되어 침착/신중 해석을 상향했습니다.");
  }

  if (m.jawRatio >= 0.7) {
    basis.push("하관(턱선) 비율이 단단한 축으로 분류되어 결단/지속 문구를 보강했습니다.");
  } else {
    basis.push("하관(턱선) 비율이 유연 축으로 분류되어 조율/적응 문구를 보강했습니다.");
  }

  return basis;
}

function buildFeatureReadings(analysis) {
  if (analysis.mode !== "mediapipe") {
    return [
      "눈: 랜드마크 미인식",
      "코: 랜드마크 미인식",
      "입: 랜드마크 미인식",
      "눈썹: 랜드마크 미인식",
      "삼정: 보조 규칙 모드",
      "중심축: 보조 규칙 모드",
    ];
  }

  const m = analysis.metrics;
  const eyeLine = m.eyeSizeRatio >= 0.165
    ? "눈: 상대적으로 또렷한 눈매 축"
    : "눈: 상대적으로 절제된 눈매 축";
  const noseLine = m.noseLengthRatio >= 0.34
    ? "코: 길이 비율 우세(중정 추진 축)"
    : "코: 길이 비율 안정(중정 균형 축)";
  const mouthLine = m.mouthRatio >= 0.34
    ? "입: 표현/소통 성향이 드러나는 구순 축"
    : "입: 절제/정돈 성향이 드러나는 구순 축";
  const browLine = m.browEyeRatio <= 0.095
    ? "눈썹: 눈과의 거리 안정(집중형) 축"
    : "눈썹: 눈과의 거리 유동(확장형) 축";
  const triLine = `삼정: 상정 ${m.upperThirdRatio.toFixed(2)} / 중정 ${m.middleThirdRatio.toFixed(2)} / 하정 ${m.lowerThirdRatio.toFixed(2)}`;
  const axisLine = m.symmetryOffset <= 0.085
    ? "중심축: 좌우 균형 안정 범위"
    : "중심축: 좌우 변동 허용 범위";

  return [eyeLine, noseLine, mouthLine, browLine, triLine, axisLine];
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
};

function getArchetypeImageSrc(resultId) {
  return ARCHETYPE_IMAGE_MAP[resultId] || "/assets/archetypes/yongan.svg";
}

function buildPartNarrative(analysis) {
  if (analysis.mode !== "mediapipe") {
    return {
      eye: "눈: 조명과 화면 상태를 기준으로 안정형으로 읽혔어요.",
      nose: "코: 랜드마크가 없어 보조 규칙 기준으로 균형형으로 분류했어요.",
      mouth: "입: 표현성은 중간 축으로 판단했어요.",
      brow: "눈썹: 기복이 크지 않은 신중형 흐름으로 해석했어요.",
      face: "얼굴형: 전체 흐름은 안정-실행의 균형형으로 분류했어요.",
      summary: "그래서 처음엔 신중하게 보고, 결정을 내리면 꾸준히 가는 타입으로 해석됩니다.",
    };
  }

  const m = analysis.metrics;
  const eye = m.eyeOpennessRatio >= 0.04
    ? "눈: 시야가 열린 축으로 읽혀 반응 속도가 빠르고 상황 캐치가 좋은 편으로 해석했어요."
    : "눈: 절제된 축으로 읽혀 한 번 더 점검하고 움직이는 신중형으로 해석했어요.";
  const nose = m.noseLengthRatio >= 0.34
    ? "코: 중정 길이 축이 살아 있어 중심 추진력과 버티는 힘이 있는 타입으로 읽었어요."
    : "코: 중정이 안정 축이라 균형감 있게 판단하고 무리하지 않는 타입으로 읽었어요.";
  const mouth = m.mouthRatio >= 0.34
    ? "입: 표현 축이 넓게 잡혀 의견 전달과 관계 확장이 좋은 흐름으로 해석했어요."
    : "입: 절제 축이라 말보다 실행으로 보여주는 흐름으로 해석했어요.";
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

function buildResultHTML(result, analysis) {
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
      <p>${parts.eye}</p>
      <p>${parts.nose}</p>
      <p>${parts.mouth}</p>
      <p>${parts.brow}</p>
      <p>${parts.face}</p>
      <p class="part-summary">${parts.summary}</p>
    </div>
    <p class="tips">${result.tips}</p>
    <p class="tips">오락용 해석 결과이며, 실제 성격/능력/적합성 판단 용도로 사용하지 마세요.</p>
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
  forceMirrorPreview();
  setStatus("대기 중");
  switchView("capture");
  await initAnalyzer();
}

bootstrap();
