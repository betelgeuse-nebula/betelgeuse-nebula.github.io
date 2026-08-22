import * as THREE from "./vendor/three.module.min.js";

const canvas = document.querySelector("#room-canvas");
const loading = document.querySelector("#loading");
const loadingBar = document.querySelector("#loading-bar");
const loadingStatus = document.querySelector("#loading-status");
const interactionHint = document.querySelector("#interaction-hint");
const sceneIndex = document.querySelector("#scene-index");
const sceneName = document.querySelector("#scene-name");
const sceneDescription = document.querySelector("#scene-description");
const stopButtons = [...document.querySelectorAll(".tour-stop")];
const previousButton = document.querySelector("#previous-stop");
const nextButton = document.querySelector("#next-stop");
const helpButton = document.querySelector("#help-button");
const helpPanel = document.querySelector("#help-panel");
const helpClose = document.querySelector("#help-close");
const fullscreenButton = document.querySelector("#fullscreen-button");
const modal = document.querySelector("#content-modal");
const modalBackdrop = document.querySelector("#modal-backdrop");
const modalClose = document.querySelector("#modal-close");
const modalKicker = document.querySelector("#modal-kicker");
const modalTitle = document.querySelector("#modal-title");
const modalContent = document.querySelector("#modal-content");
const modalNote = document.querySelector("#modal-note");
const modalOpen = document.querySelector("#modal-open");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const touchPrimary = window.matchMedia("(pointer: coarse)").matches;
const assetUrl = (file) => new URL(`./assets/${file}`, import.meta.url).href;
const pdfUrl = (file) => new URL(`/files/${file}`, window.location.origin).href;
const PLAYER_RADIUS = 0.22;
const PLAYER_HEIGHT = 1.52;
const MOVE_SPEED = 1.55;

let renderer;
let scene;
let camera;
let clock;
let raycaster;
let pointer;
let hoverHelper;
let hoveredObject = null;
let activeStop = 0;
let cameraTransition = null;
let cabinetOpen = false;
let cabinetDoors = [];
let cabinetDoorTargets = [];
let dryCabinetOpen = false;
let dryCabinetDoors = [];
let dryCabinetDoorTargets = [];
let baseYaw = 0;
let basePitch = 0;
let yawOffset = 0;
let pitchOffset = 0;
let pointerDown = false;
let pointerMoved = false;
let lastPointerX = 0;
let lastPointerY = 0;
let pointerStartX = 0;
let pointerStartY = 0;
let hintTimer;
let freeRoaming = false;

const movementKeys = new Set();
const movementForward = new THREE.Vector3();
const movementRight = new THREE.Vector3();
const movementDelta = new THREE.Vector3();

const interactables = [];

// 简化位阻：墙面和主要家具使用俯视平面中的矩形碰撞盒。
// 柜门等活动部件不参与碰撞，避免开门时把访客卡住。
const collisionBoxes = [
  // 主活动室与新展区的外墙，以及主房间右下角保留的短墙。
  { minX: -2.08, maxX: -1.99, minZ: -2.08, maxZ: 2.08 },
  { minX: -2.08, maxX: 2.08, minZ: 1.99, maxZ: 2.08 },
  { minX: -2.08, maxX: 10.08, minZ: -2.08, maxZ: -1.99 },
  { minX: 9.99, maxX: 10.08, minZ: -2.08, maxZ: 1.28 },
  { minX: 1.99, maxX: 10.08, minZ: 1.20, maxZ: 1.29 },
  { minX: 1.99, maxX: 2.08, minZ: 1.20, maxZ: 2.08 },

  // 铁架、木柜和两张折叠桌。
  { minX: -2.0, maxX: -1.38, minZ: -0.42, maxZ: 2.0 },
  { minX: -1.84, maxX: -1.31, minZ: -1.75, maxZ: -0.75 },
  { minX: -0.45, maxX: 0.75, minZ: 0.25, maxZ: 0.85 },
  { minX: -0.15, maxX: 1.05, minZ: -0.5, maxZ: 0.1 },

  // 新展区：六组大型器材、防潮展示柜和落地电源。
  { minX: 2.35, maxX: 3.15, minZ: -1.83, maxZ: -1.03 },
  { minX: 3.52, maxX: 4.38, minZ: -1.86, maxZ: -1.0 },
  { minX: 4.48, maxX: 5.92, minZ: -1.86, maxZ: -0.72 },
  { minX: 6.0, maxX: 6.9, minZ: -1.86, maxZ: -1.0 },
  { minX: 7.25, maxX: 8.05, minZ: -1.84, maxZ: -1.04 },
  { minX: 8.34, maxX: 9.18, minZ: -1.75, maxZ: -1.05 },
  { minX: 4.84, maxX: 8.06, minZ: 0.68, maxZ: 1.22 },
  { minX: 3.08, maxX: 3.52, minZ: 0.67, maxZ: 1.12 },
  { minX: 8.02, maxX: 8.72, minZ: 1.12, maxZ: 1.22 },
];

const tourStops = [
  {
    name: "门口",
    description: "从门口看看活动室的全貌",
    position: new THREE.Vector3(1.34, 1.56, 1.57),
    target: new THREE.Vector3(-0.42, 1.16, -0.3),
  },
  {
    name: "木柜",
    description: "点击柜门、笔记和柜中的小物件",
    position: new THREE.Vector3(0.18, 1.43, -1.2),
    target: new THREE.Vector3(-1.55, 1.12, -1.25),
  },
  {
    name: "望远镜",
    description: "以 C8 为中心看看几套主要观测设备",
    position: new THREE.Vector3(4.38, 1.52, -0.42),
    target: new THREE.Vector3(3.95, 1.18, -1.45),
  },
  {
    name: "配件柜",
    description: "打开防潮柜，查看相机、目镜和转接配件",
    position: new THREE.Vector3(6.45, 1.52, 0.28),
    target: new THREE.Vector3(6.45, 1.0, 0.98),
  },
];

const palette = {
  wall: 0xf1f2ef,
  ceiling: 0xf5f4f0,
  floor: 0xe8e6df,
  metal: 0x20262e,
  metalEdge: 0x10151b,
  wood: 0x9b6338,
  woodDark: 0x5c3821,
  cardboard: 0xb98b58,
  blue: 0x1f69b5,
  red: 0xc9463b,
};

start().catch(showFatalError);

async function start() {
  loadingStatus.textContent = "检查 3D 环境……";

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touchPrimary ? 1.45 : 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdde4eb);
  scene.fog = new THREE.Fog(0xdde4eb, 11, 23);

  camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.025, 30);
  clock = new THREE.Clock();
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  const textures = await loadTextures();
  loadingStatus.textContent = "摆放家具与藏书……";
  loadingBar.style.width = "86%";

  buildRoom(textures);
  buildLights();
  buildMetalRacks();
  buildCabinet(textures);
  buildTables();
  buildRoomDetails();
  buildEquipmentGallery();
  buildPosters(textures);

  setCameraAtStop(0, true);
  bindInterface();
  handleResize();
  window.addEventListener("resize", handleResize);
  canvas.addEventListener("webglcontextlost", handleContextLost, false);
  renderer.render(scene, camera);

  loadingBar.style.width = "100%";
  loadingStatus.textContent = "活动室已经打开";
  window.setTimeout(() => loading.classList.add("is-hidden"), 320);

  if (touchPrimary) {
    showTransientHint("拖动画面环顾，点击下方切换位置", 2700);
  } else {
    showTransientHint("拖动画面环顾 · WASD 前后左右移动", 2700);
  }

  renderer.setAnimationLoop(renderFrame);
}

async function loadTextures() {
  const manager = new THREE.LoadingManager();
  const loader = new THREE.TextureLoader(manager);
  const files = {
    flag: "club-flag.webp",
    poster: "yaya-telescope-poster.webp",
    qifeng: "qifeng-night.webp",
    trappist: "trappist-1e.webp",
    silhouette: "club-silhouette.webp",
    recruitmentQa: "recruitment-qa.webp",
    ode: "ode-cover.webp",
    optics: "optics-cover.webp",
  };

  manager.onProgress = (_url, loaded, total) => {
    const progress = 12 + (loaded / Math.max(total, 1)) * 58;
    loadingBar.style.width = `${progress}%`;
    loadingStatus.textContent = `载入墙面与笔记图片 ${loaded}/${total}`;
  };

  const entries = await Promise.all(
    Object.entries(files).map(async ([key, file]) => {
      const texture = await loader.loadAsync(assetUrl(file));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return [key, texture];
    }),
  );

  return Object.fromEntries(entries);
}

function buildLights() {
  const hemisphere = new THREE.HemisphereLight(0xf8fbff, 0x9ca4ad, 1.55);
  scene.add(hemisphere);

  const daylight = new THREE.DirectionalLight(0xd8e8ff, 1.25);
  daylight.position.set(1.1, 2.5, -2.3);
  daylight.target.position.set(0.2, 0.8, 0.1);
  daylight.castShadow = true;
  daylight.shadow.mapSize.set(touchPrimary ? 1024 : 1536, touchPrimary ? 1024 : 1536);
  daylight.shadow.camera.left = -3;
  daylight.shadow.camera.right = 3;
  daylight.shadow.camera.top = 3;
  daylight.shadow.camera.bottom = -3;
  daylight.shadow.camera.near = 0.2;
  daylight.shadow.camera.far = 8;
  daylight.shadow.bias = -0.00025;
  scene.add(daylight, daylight.target);

  const panelPositions = [
    [-0.65, -0.55],
    [0.8, 0.7],
    [3.4, -0.4],
    [5.9, -0.4],
    [8.4, -0.4],
  ];
  for (const [x, z] of panelPositions) {
    const panelLight = new THREE.RectAreaLight(0xf5f8ff, 3.1, 1.18, 0.54);
    panelLight.position.set(x, 2.91, z);
    panelLight.rotation.x = -Math.PI / 2;
    scene.add(panelLight);
  }
}

function buildRoom(textures) {
  const wallMaterial = new THREE.MeshStandardMaterial({ color: palette.wall, roughness: 0.94 });
  const ceilingMaterial = new THREE.MeshStandardMaterial({ color: palette.ceiling, roughness: 0.9 });
  const floorTexture = makeFloorTexture();
  floorTexture.colorSpace = THREE.SRGBColorSpace;
  floorTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: palette.floor,
    map: floorTexture,
    roughness: 0.78,
    metalness: 0.02,
  });

  addBox(scene, [4.05, 0.06, 4.05], [0, -0.03, 0], floorMaterial, false, true);
  addBox(scene, [0.06, 3.04, 4.06], [-2.03, 1.5, 0], wallMaterial, false, true);
  // The former poster wall opens into a new 8 m × 3.2 m space aligned to the window side.
  addBox(scene, [0.06, 3.04, 0.8], [2.03, 1.5, 1.6], wallMaterial, false, true);
  addBox(scene, [4.06, 3.04, 0.06], [0, 1.5, -2.03], wallMaterial, false, true);
  addBox(scene, [4.06, 3.04, 0.06], [0, 1.5, 2.03], wallMaterial, false, true);
  addBox(scene, [4.05, 0.05, 4.05], [0, 3.025, 0], ceilingMaterial, false, true);

  addBox(scene, [8.05, 0.06, 3.2], [6, -0.03, -0.4], floorMaterial, false, true);
  addBox(scene, [8.06, 3.04, 0.06], [6, 1.5, -2.03], wallMaterial, false, true);
  addBox(scene, [8.06, 3.04, 0.06], [6, 1.5, 1.23], wallMaterial, false, true);
  addBox(scene, [0.06, 3.04, 3.26], [10.03, 1.5, -0.4], wallMaterial, false, true);
  addBox(scene, [8.05, 0.05, 3.25], [6, 3.025, -0.4], ceilingMaterial, false, true);

  // 4 m × 4 m room: five 80 cm square tiles along each side.
  const floorGrid = new THREE.GridHelper(4, 5, 0xc4c1b8, 0xcfcdc5);
  floorGrid.position.y = 0.004;
  floorGrid.material.transparent = true;
  floorGrid.material.opacity = 0.32;
  scene.add(floorGrid);
  addTileGrid(8, 3.2, 6, -0.4, 0.8);

  const ceilingGrid = new THREE.GridHelper(4, 8, 0xb8bbc0, 0xc9cbd0);
  ceilingGrid.position.y = 2.995;
  ceilingGrid.material.transparent = true;
  ceilingGrid.material.opacity = 0.35;
  scene.add(ceilingGrid);

  const lightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xeaf4ff,
    emissiveIntensity: 2.2,
    roughness: 0.25,
  });
  addBox(scene, [1.18, 0.025, 0.54], [-0.65, 2.982, -0.55], lightMaterial, false, false);
  addBox(scene, [1.18, 0.025, 0.54], [0.8, 2.982, 0.7], lightMaterial, false, false);
  for (const x of [3.4, 5.9, 8.4]) {
    addBox(scene, [1.18, 0.025, 0.54], [x, 2.982, -0.4], lightMaterial, false, false);
  }

  const ventMaterial = new THREE.MeshStandardMaterial({ color: 0x7e8790, roughness: 0.62 });
  addBox(scene, [1.18, 0.022, 0.24], [0.04, 2.981, -0.02], ventMaterial, false, false);
  for (let i = -5; i <= 5; i += 1) {
    addBox(scene, [0.008, 0.008, 0.21], [i * 0.09 + 0.04, 2.968, -0.02], material(0x4e5862), false, false);
  }

  buildDoor();
  buildWallControls();
  buildWindowAndCurtain();
}

function buildDoor() {
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0xc59b69, roughness: 0.72 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xe4e1da, roughness: 0.88 });
  const door = addBox(scene, [0.92, 2.12, 0.045], [1.34, 1.06, 1.985], doorMaterial, true, true);
  addBox(scene, [0.08, 2.22, 0.07], [0.84, 1.11, 1.95], trimMaterial);
  addBox(scene, [0.08, 2.22, 0.07], [1.84, 1.11, 1.95], trimMaterial);
  addBox(scene, [1.08, 0.08, 0.07], [1.34, 2.18, 1.95], trimMaterial);

  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 18, 12),
    new THREE.MeshStandardMaterial({ color: 0x30343a, metalness: 0.82, roughness: 0.28 }),
  );
  handle.position.set(0.99, 1.03, 1.93);
  handle.castShadow = true;
  scene.add(handle);

  const exitInteraction = {
    kind: "exit",
    label: "返回天文收藏夹",
  };
  door.userData.interaction = exitInteraction;
  handle.userData.interaction = exitInteraction;
  interactables.push(door, handle);
}

function makeWallControlTexture(kind) {
  const controlCanvas = document.createElement("canvas");
  controlCanvas.width = 512;
  controlCanvas.height = 512;
  const ctx = controlCanvas.getContext("2d");

  ctx.fillStyle = "#f4f3ed";
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "#d2d0c8";
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 496, 496);

  if (kind === "switch") {
    ctx.fillStyle = "#ecebe5";
    ctx.fillRect(63, 62, 386, 360);
    ctx.strokeStyle = "#b8b7b0";
    ctx.lineWidth = 7;
    ctx.strokeRect(63, 62, 386, 360);

    // 照片中的人物贴纸用简单的色块轮廓复原，近看仍能辨认出举手的图案。
    ctx.fillStyle = "#4d2f29";
    ctx.beginPath();
    ctx.arc(280, 205, 112, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ead7b8";
    ctx.beginPath();
    ctx.arc(288, 221, 76, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#23222b";
    ctx.beginPath();
    ctx.moveTo(205, 288);
    ctx.quadraticCurveTo(286, 252, 384, 325);
    ctx.lineTo(385, 398);
    ctx.lineTo(174, 398);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ead7b8";
    ctx.beginPath();
    ctx.moveTo(182, 315);
    ctx.lineTo(127, 235);
    ctx.lineTo(132, 127);
    ctx.quadraticCurveTo(139, 104, 153, 130);
    ctx.lineTo(158, 181);
    ctx.lineTo(170, 111);
    ctx.quadraticCurveTo(180, 92, 190, 119);
    ctx.lineTo(193, 181);
    ctx.lineTo(206, 122);
    ctx.quadraticCurveTo(218, 108, 226, 135);
    ctx.lineTo(225, 212);
    ctx.quadraticCurveTo(224, 274, 182, 315);
    ctx.fill();
    ctx.fillStyle = "#17171c";
    ctx.beginPath();
    ctx.arc(266, 218, 10, 0, Math.PI * 2);
    ctx.arc(326, 218, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#6a4235";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(281, 264);
    ctx.quadraticCurveTo(300, 278, 319, 264);
    ctx.stroke();
    ctx.fillStyle = "#777670";
    ctx.font = "600 23px system-ui, sans-serif";
    ctx.fillText("Schneider", 305, 466);
  } else {
    ctx.fillStyle = "#74766f";
    ctx.font = "700 30px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("GREE  格力", 256, 42);

    ctx.fillStyle = "#6f756d";
    ctx.fillRect(52, 65, 408, 210);
    ctx.fillStyle = "#27302b";
    ctx.font = "500 116px monospace";
    ctx.textAlign = "left";
    ctx.fillText("26.0", 92, 216);
    ctx.font = "500 34px system-ui, sans-serif";
    ctx.fillText("°C", 386, 125);

    ctx.strokeStyle = "#c4c3bd";
    ctx.fillStyle = "#ecebe5";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(256, 386, 87, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#777871";
    ctx.textAlign = "center";
    ctx.font = "600 38px system-ui, sans-serif";
    ctx.fillText("+", 256, 335);
    ctx.fillText("−", 256, 452);
    ctx.font = "600 42px system-ui, sans-serif";
    ctx.fillText("▦", 256, 403);
    for (const [x, label] of [[91, "◉"], [421, "⏻"]]) {
      ctx.fillStyle = "#ecebe5";
      ctx.beginPath();
      ctx.arc(x, 389, 39, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#777871";
      ctx.font = "600 31px system-ui, sans-serif";
      ctx.fillText(label, x, 400);
    }
  }

  const texture = new THREE.CanvasTexture(controlCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function buildWallControls() {
  const housingMaterial = material(0xf2f1eb, { roughness: 0.72 });
  const controls = [
    { kind: "switch", x: 0.69, title: "活动室灯光开关", details: ["Schneider Electric 墙面开关", "面板约 10 × 10 cm", "按照片保留人物贴纸的轮廓特征"] },
    { kind: "thermostat", x: 0.575, title: "空调控制器", details: ["GREE 格力墙面控制器", "面板约 10 × 10 cm", "显示温度 26.0 °C"] },
  ];

  controls.forEach(({ kind, x, title, details }) => {
    const control = new THREE.Group();
    control.position.set(x, 0.88, 1.957);
    scene.add(control);

    const housing = new THREE.Mesh(createRoundedBoxGeometry(0.105, 0.018, 0.105, 0.012), housingMaterial);
    housing.rotation.x = Math.PI / 2;
    housing.castShadow = true;
    control.add(housing);

    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.096, 0.096),
      new THREE.MeshBasicMaterial({ map: makeWallControlTexture(kind), side: THREE.DoubleSide }),
    );
    face.position.z = -0.011;
    face.rotation.y = Math.PI;
    face.userData.interaction = {
      kind: "info",
      label: `查看「${title}」`,
      kicker: "门侧墙面",
      title,
      details,
      note: "依据活动室实物照片复原",
    };
    interactables.push(face);
    control.add(face);
  });
}

function buildWindowAndCurtain() {
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x7890a5,
    roughness: 0.18,
    metalness: 0.03,
    transparent: true,
    opacity: 0.55,
  });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.72 });
  const curtainMaterial = new THREE.MeshStandardMaterial({
    color: 0x9aa0a7,
    roughness: 0.96,
    side: THREE.DoubleSide,
  });

  // 保留原窗户左侧的 2/3，右侧恢复为白墙。
  addBox(scene, [1.7, 1.58, 0.025], [0.155, 1.69, -1.985], glass, false, false);
  addBox(scene, [1.82, 0.06, 0.07], [0.155, 0.89, -1.955], frameMaterial);
  addBox(scene, [1.82, 0.06, 0.07], [0.155, 2.5, -1.955], frameMaterial);
  addBox(scene, [0.06, 1.68, 0.07], [-0.75, 1.69, -1.955], frameMaterial);
  addBox(scene, [0.06, 1.68, 0.07], [1.06, 1.69, -1.955], frameMaterial);
  addBox(scene, [0.055, 1.58, 0.055], [0.155, 1.69, -1.94], frameMaterial);

  const curtainGroup = new THREE.Group();
  curtainGroup.position.z = -1.91;
  scene.add(curtainGroup);
  const panelWidth = 0.845;
  const curtainColors = [0x999fa6, 0x92989f, 0x9da3aa];
  for (let i = 0; i < 2; i += 1) {
    const x = -0.265 + i * 0.85;
    const panelMaterial = curtainMaterial.clone();
    panelMaterial.color.setHex(curtainColors[i]);
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(panelWidth, 1.72), panelMaterial);
    curtain.position.set(x, 1.72, 0);
    curtain.receiveShadow = true;
    curtainGroup.add(curtain);
  }
  for (const seamX of [-0.69, 0.16, 1.01]) {
    addBox(
      curtainGroup,
      [0.018, 1.7, 0.022],
      [seamX, 1.72, 0.014],
      material(0x7e858d, { roughness: 0.96 }),
      false,
      true,
    );
  }
  addBox(scene, [1.84, 0.07, 0.1], [0.155, 2.62, -1.89], frameMaterial);
  addBox(scene, [1.84, 0.07, 0.13], [0.155, 0.88, -1.88], frameMaterial);
}

function buildMetalRacks() {
  const rackMaterial = new THREE.MeshStandardMaterial({
    color: palette.metal,
    metalness: 0.68,
    roughness: 0.4,
  });
  const shelfMaterial = new THREE.MeshStandardMaterial({
    color: palette.metalEdge,
    metalness: 0.56,
    roughness: 0.46,
  });
  const shelfHeights = [0.1, 0.9, 1.6, 2.2];

  for (const centerZ of [1.4, 0.2]) {
    for (const shelfY of shelfHeights) {
      addBox(scene, [0.6, 0.045, 1.18], [-1.7, shelfY - 0.023, centerZ], shelfMaterial);
    }
    for (const x of [-1.98, -1.42]) {
      for (const z of [centerZ - 0.575, centerZ + 0.575]) {
        addBox(scene, [0.045, 2.3, 0.045], [x, 1.15, z], rackMaterial);
      }
    }
  }

  populateRacks();
}

function populateRacks() {
  const cardboard = material(palette.cardboard, { roughness: 0.96 });
  const cardboardLight = material(0xd0aa79, { roughness: 0.95 });
  const blackCase = material(0x1a2028, { roughness: 0.72 });
  const whitePlastic = material(0xe8ecef, { roughness: 0.58 });
  const mutedBlue = material(0x345b88, { roughness: 0.8 });

  addBox(scene, [0.45, 0.16, 0.52], [-1.69, 0.2, 1.6], cardboard);
  addBox(scene, [0.52, 0.2, 0.48], [-1.69, 0.22, 1.02], cardboardLight);
  addBox(scene, [0.42, 0.27, 0.42], [-1.68, 0.25, 0.35], cardboard);
  addBox(scene, [0.54, 0.18, 0.5], [-1.7, 0.19, -0.17], cardboardLight);

  addBox(scene, [0.46, 0.12, 0.62], [-1.68, 1.0, 1.58], blackCase);
  addBox(scene, [0.42, 0.11, 0.38], [-1.68, 0.99, 0.94], cardboardLight);
  addBox(scene, [0.46, 0.16, 0.32], [-1.68, 1.01, 0.43], whitePlastic);
  addBox(scene, [0.52, 0.17, 0.45], [-1.69, 1.02, -0.09], blackCase);

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.125, 24, 16),
    material(0xd9dcda, { roughness: 0.7 }),
  );
  sphere.position.set(-1.58, 1.055, 0.78);
  sphere.castShadow = true;
  scene.add(sphere);

  addBox(scene, [0.47, 0.1, 0.6], [-1.68, 1.68, 1.57], blackCase);
  addBox(scene, [0.5, 0.12, 0.5], [-1.68, 1.69, 0.95], mutedBlue);
  addBox(scene, [0.36, 0.2, 0.34], [-1.68, 1.74, 0.33], cardboardLight);
  addBox(scene, [0.48, 0.09, 0.55], [-1.68, 1.665, -0.12], blackCase);

  addBox(scene, [0.5, 0.08, 0.62], [-1.69, 2.25, 1.55], material(0x25313d));
  addBox(scene, [0.5, 0.09, 0.44], [-1.69, 2.26, 0.86], material(0x38434d));
  addBox(scene, [0.42, 0.33, 0.36], [-1.68, 2.36, 0.12], cardboard);

  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.56, 24),
    material(0x202a34, { metalness: 0.3, roughness: 0.5 }),
  );
  tube.rotation.x = Math.PI / 2;
  tube.position.set(-1.62, 1.08, 0.02);
  tube.castShadow = true;
  scene.add(tube);

  const tentColors = [0x255f9f, 0x3478ba, 0x2868aa, 0x3b82be];
  for (let i = 0; i < 4; i += 1) {
    createFoldedTent(
      -1.62 + i * 0.14,
      -1.87 + i * 0.018,
      tentColors[i],
      i % 2 ? 0.025 : -0.025,
    );
  }
}

function createFoldedTent(x, z, blue, lean) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.z = lean;
  scene.add(group);

  const frameMaterial = material(0x7c848a, { metalness: 0.72, roughness: 0.36 });
  const jointMaterial = material(0x3d444a, { metalness: 0.58, roughness: 0.42 });
  const fabricMaterial = material(blue, { roughness: 0.9 });
  const legGeometry = new THREE.BoxGeometry(0.022, 1.02, 0.022);

  for (const [legX, legZ] of [
    [-0.042, -0.045],
    [0.042, -0.045],
    [-0.042, 0.045],
    [0.042, 0.045],
  ]) {
    const leg = new THREE.Mesh(legGeometry, frameMaterial);
    leg.position.set(legX, 0.55, legZ);
    leg.rotation.z = legX * -0.55;
    leg.rotation.x = legZ * 0.45;
    leg.castShadow = true;
    group.add(leg);
  }

  addBox(group, [0.12, 0.035, 0.12], [0, 1.02, 0], jointMaterial);
  addBox(group, [0.17, 0.035, 0.04], [0, 0.52, 0], jointMaterial);
  addBox(group, [0.04, 0.035, 0.17], [0, 0.52, 0], jointMaterial);

  const foldedCanopy = new THREE.Mesh(
    new THREE.CylinderGeometry(0.095, 0.135, 0.62, 4),
    fabricMaterial,
  );
  foldedCanopy.position.set(0, 1.34, 0);
  foldedCanopy.rotation.y = Math.PI / 4;
  foldedCanopy.castShadow = true;
  group.add(foldedCanopy);

  addBox(group, [0.16, 0.1, 0.17], [0, 1.68, 0], fabricMaterial);
  addBox(group, [0.16, 0.035, 0.18], [0, 1.22, 0], jointMaterial);
}

function buildCabinet(textures) {
  const woodTexture = makeWoodTexture();
  woodTexture.colorSpace = THREE.SRGBColorSpace;
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: palette.wood,
    map: woodTexture,
    roughness: 0.72,
  });
  const woodDark = material(palette.woodDark, { roughness: 0.76 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xc7d8df,
    roughness: 0.16,
    metalness: 0,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  addBox(scene, [0.04, 2.0, 0.9], [-1.79, 1.0, -1.25], woodMaterial);
  addBox(scene, [0.4, 0.08, 0.9], [-1.59, 0.04, -1.25], woodDark);
  addBox(scene, [0.4, 0.08, 0.9], [-1.59, 1.96, -1.25], woodMaterial);
  addBox(scene, [0.4, 2.0, 0.055], [-1.59, 1.0, -1.69], woodMaterial);
  addBox(scene, [0.4, 2.0, 0.055], [-1.59, 1.0, -0.81], woodMaterial);

  for (const y of [0.16, 0.75, 1.34]) {
    addBox(scene, [0.37, 0.045, 0.82], [-1.59, y, -1.25], woodMaterial);
  }

  buildCabinetContents(textures);
  cabinetDoors = [
    createCabinetDoor(-1.69, 1, woodMaterial, glassMaterial),
    createCabinetDoor(-0.81, -1, woodMaterial, glassMaterial),
  ];
}

function createCabinetDoor(hingeZ, direction, woodMaterial, glassMaterial) {
  const pivot = new THREE.Group();
  pivot.position.set(-1.375, 0, hingeZ);
  pivot.userData.openDirection = direction;
  scene.add(pivot);

  const centerZ = direction * 0.215;
  const clickableParts = [];
  const glass = addBox(pivot, [0.024, 1.72, 0.395], [0, 1.03, centerZ], glassMaterial, false, false);
  glass.renderOrder = 3;
  clickableParts.push(glass);

  clickableParts.push(
    addBox(pivot, [0.045, 1.84, 0.045], [0.005, 1.03, 0], woodMaterial),
    addBox(pivot, [0.045, 1.84, 0.045], [0.005, 1.03, direction * 0.43], woodMaterial),
    addBox(pivot, [0.045, 0.055, 0.43], [0.005, 0.12, centerZ], woodMaterial),
    addBox(pivot, [0.045, 0.055, 0.43], [0.005, 1.94, centerZ], woodMaterial),
    addBox(pivot, [0.045, 0.045, 0.43], [0.005, 1.34, centerZ], woodMaterial),
    addBox(pivot, [0.045, 0.045, 0.43], [0.005, 0.75, centerZ], woodMaterial),
  );

  const handle = addBox(
    pivot,
    [0.045, 0.16, 0.025],
    [0.045, 1.03, direction * 0.375],
    material(0x34383d, { metalness: 0.78, roughness: 0.24 }),
  );
  clickableParts.push(handle);

  const doorInteraction = {
    kind: "cabinet",
    label: "打开木柜",
  };
  clickableParts.forEach((part) => {
    part.userData.interaction = doorInteraction;
    interactables.push(part);
    cabinetDoorTargets.push(part);
  });
  return pivot;
}

function buildCabinetContents(textures) {
  const paperMaterial = material(0xe8e2d8, { roughness: 0.88 });
  const spineColors = [0xf3f0e7, 0xb66245, 0x3c5d83, 0xe1b85d, 0x758b6e, 0xc9c5bc];

  for (let i = 0; i < 9; i += 1) {
    const height = 0.27 + (i % 3) * 0.025;
    addBox(
      scene,
      [0.2, height, 0.035],
      [-1.54, 0.17 + height / 2, -1.62 + i * 0.06],
      material(spineColors[i % spineColors.length], { roughness: 0.84 }),
    );
  }

  for (let i = 0; i < 7; i += 1) {
    addBox(
      scene,
      [0.24, 0.018, 0.33],
      [-1.56, 0.77 + i * 0.019, -0.99],
      material(i % 2 ? 0xe5dfd0 : 0xd3c9b6, { roughness: 0.92 }),
    );
  }

  createFaceOutBook({
    texture: textures.ode,
    position: [-1.415, 1.04, -1.5],
    color: 0xe6e2d9,
    title: "高等数学·常微分方程",
    file: "高数9ODE.pdf",
    note: "8 页 · 约 0.2 MB · 点击后才载入 PDF",
  });

  createFaceOutBook({
    texture: textures.optics,
    position: [-1.415, 1.04, -1.12],
    color: 0x1b2431,
    title: "基础光学手写笔记",
    file: "光学.pdf",
    note: "44 页 · 约 10.6 MB · 点击后才载入 PDF",
  });

  const photoTexture = makeNightPhotoTexture();
  photoTexture.colorSpace = THREE.SRGBColorSpace;
  const frame = addBox(scene, [0.035, 0.3, 0.22], [-1.42, 1.57, -1.48], material(0xf1f2ef));
  const photo = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.25),
    new THREE.MeshStandardMaterial({ map: photoTexture, roughness: 0.7 }),
  );
  photo.rotation.y = Math.PI / 2;
  photo.position.set(-1.398, 1.57, -1.48);
  scene.add(photo);
  frame.castShadow = true;

  const keepsake = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.085, 0),
    material(0x75a7d9, { roughness: 0.54 }),
  );
  keepsake.position.set(-1.5, 1.46, -1.08);
  keepsake.castShadow = true;
  scene.add(keepsake);

  addBox(scene, [0.22, 0.08, 0.28], [-1.56, 1.42, -0.92], paperMaterial);
}

function createFaceOutBook({ texture, position, color, title, file, note }) {
  const edge = material(color, { roughness: 0.8 });
  const paper = material(0xeee9dc, { roughness: 0.92 });
  const cover = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.68 });
  const geometry = new THREE.BoxGeometry(0.035, 0.42, 0.29);
  const mesh = new THREE.Mesh(geometry, [cover, edge, paper, paper, edge, edge]);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.interaction = {
    kind: "pdf",
    label: `阅读《${title}》`,
    title,
    url: pdfUrl(file),
    note,
  };
  interactables.push(mesh);
  scene.add(mesh);
  return mesh;
}

function buildTables() {
  createFoldingTable(0.15, 0.55);
  createFoldingTable(0.45, -0.2);

  addBox(scene, [0.23, 0.08, 0.18], [0.62, 0.79, -0.22], material(0xb98b58, { roughness: 0.94 }));
  addBox(scene, [0.3, 0.045, 0.22], [0.22, 0.7725, -0.19], material(0x252d37, { roughness: 0.74 }));
}

function createFoldingTable(x, z) {
  const top = material(0xe7edeb, { roughness: 0.68 });
  const leg = material(0x31585d, { metalness: 0.42, roughness: 0.48 });
  const tableTop = new THREE.Mesh(createRoundedBoxGeometry(1.2, 0.05, 0.6, 0.05), top);
  tableTop.position.set(x, 0.725, z);
  tableTop.castShadow = true;
  tableTop.receiveShadow = true;
  scene.add(tableTop);

  for (const legX of [x - 0.48, x + 0.48]) {
    for (const legZ of [z - 0.23, z + 0.23]) {
      const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 16), leg);
      tableLeg.position.set(legX, 0.375, legZ);
      tableLeg.castShadow = true;
      scene.add(tableLeg);
    }
  }

  // 短边各有一根扁截面横杠，长边不设横杠，也不使用斜撑。
  for (const legX of [x - 0.48, x + 0.48]) {
    addBox(scene, [0.03, 0.015, 0.46], [legX, 0.34, z], leg);
  }
}

function buildRoomDetails() {
  createStool(1.56, 0.52, palette.blue);
  createStool(1.62, 0.9, palette.red);

  const chairMaterial = material(0x1c222a, { roughness: 0.7, metalness: 0.2 });
  for (let i = 0; i < 2; i += 1) {
    const group = new THREE.Group();
    group.position.set(1.72, 0, 1.27 - i * 0.25);
    group.rotation.z = -0.12;
    addBox(group, [0.06, 1.0, 0.38], [0, 0.62, 0], chairMaterial);
    addBox(group, [0.4, 0.045, 0.42], [-0.12, 0.34, 0], chairMaterial);
    scene.add(group);
  }

  const smallBoxes = [
    [1.45, 0.13, -1.43, 0.34, 0.26, 0.36],
    [1.14, 0.1, -1.57, 0.28, 0.2, 0.26],
    [-0.85, 0.12, 1.63, 0.42, 0.24, 0.36],
  ];
  for (const [x, y, z, w, h, d] of smallBoxes) {
    addBox(scene, [w, h, d], [x, y, z], material(palette.cardboard, { roughness: 0.95 }));
  }
}

function createStool(x, z, color) {
  const plastic = material(color, { roughness: 0.72 });
  addBox(scene, [0.36, 0.05, 0.32], [x, 0.42, z], plastic);
  for (const dx of [-0.14, 0.14]) {
    for (const dz of [-0.11, 0.11]) {
      const leg = addBox(scene, [0.045, 0.39, 0.045], [x + dx, 0.2, z + dz], plastic);
      leg.rotation.z = dx * -0.28;
    }
  }
}

function createRoundedBoxGeometry(width, height, depth, radius) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const corner = Math.min(radius, halfWidth, halfDepth);
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth + corner, -halfDepth);
  shape.lineTo(halfWidth - corner, -halfDepth);
  shape.quadraticCurveTo(halfWidth, -halfDepth, halfWidth, -halfDepth + corner);
  shape.lineTo(halfWidth, halfDepth - corner);
  shape.quadraticCurveTo(halfWidth, halfDepth, halfWidth - corner, halfDepth);
  shape.lineTo(-halfWidth + corner, halfDepth);
  shape.quadraticCurveTo(-halfWidth, halfDepth, -halfWidth, halfDepth - corner);
  shape.lineTo(-halfWidth, -halfDepth + corner);
  shape.quadraticCurveTo(-halfWidth, -halfDepth, -halfWidth + corner, -halfDepth);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 8,
  });
  geometry.translate(0, 0, -height / 2);
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function addCylinder(parent, radiusTop, radiusBottom, height, position, meshMaterial, segments = 24) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    meshMaterial,
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addAxialCylinder(
  parent,
  radiusTop,
  radiusBottom,
  length,
  position,
  meshMaterial,
  axis = "x",
  segments = 24,
) {
  const mesh = addCylinder(parent, radiusTop, radiusBottom, length, position, meshMaterial, segments);
  if (axis === "x") mesh.rotation.z = Math.PI / 2;
  if (axis === "z") mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function addCylinderBetween(parent, from, to, radius, meshMaterial, segments = 14) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), segments),
    meshMaterial,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  );
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addBoxBetween(parent, from, to, width, depth, meshMaterial) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, direction.length(), depth),
    meshMaterial,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeEquipmentLabelTexture(title, subtitle = "") {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 768;
  labelCanvas.height = 184;
  const ctx = labelCanvas.getContext("2d");
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, labelCanvas.width, labelCanvas.height);
  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(0, 0, 18, labelCanvas.height);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "700 55px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(title, 48, subtitle ? 68 : 92, 680);
  if (subtitle) {
    ctx.fillStyle = "#9fb2c8";
    ctx.font = "500 30px system-ui, sans-serif";
    ctx.fillText(subtitle, 50, 132, 680);
  }
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function createEquipmentPlaque(parent, title, subtitle, position = [0, 0.2, 0.43], width = 0.62) {
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width * (184 / 768)),
    new THREE.MeshBasicMaterial({
      map: makeEquipmentLabelTexture(title, subtitle),
      transparent: true,
      side: THREE.DoubleSide,
    }),
  );
  plaque.position.set(...position);
  parent.add(plaque);
  return plaque;
}

function registerEquipmentInteraction(parent, {
  title,
  details,
  note = "依据天文学社珠海器材编目复原",
  bounds,
  center = [0, bounds[1] / 2, 0],
}) {
  const pickMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.001,
    depthWrite: false,
  });
  const pickVolume = new THREE.Mesh(new THREE.BoxGeometry(...bounds), pickMaterial);
  pickVolume.position.set(...center);
  pickVolume.userData.interaction = {
    kind: "info",
    label: `查看「${title}」`,
    kicker: "珠海器材编目",
    title,
    details,
    note,
  };
  interactables.push(pickVolume);
  parent.add(pickVolume);
  return pickVolume;
}

function createTripod(parent, {
  topHeight = 0.96,
  spread = 0.35,
  legColor = 0x8e969d,
  centerColor = 0x1d242c,
  tray = true,
} = {}) {
  const legMaterial = material(legColor, { metalness: 0.78, roughness: 0.28 });
  const centerMaterial = material(centerColor, { metalness: 0.5, roughness: 0.4 });
  addCylinder(parent, 0.09, 0.1, 0.07, [0, topHeight, 0], centerMaterial, 24);
  addCylinder(parent, 0.035, 0.035, 0.34, [0, topHeight - 0.19, 0], centerMaterial, 18);

  for (let i = 0; i < 3; i += 1) {
    const angle = Math.PI / 2 + i * (Math.PI * 2 / 3);
    const upper = [Math.cos(angle) * 0.055, topHeight - 0.06, Math.sin(angle) * 0.055];
    const foot = [Math.cos(angle) * spread, 0.035, Math.sin(angle) * spread];
    addCylinderBetween(parent, upper, foot, 0.018, legMaterial, 14);
    addCylinderBetween(
      parent,
      [Math.cos(angle) * spread * 0.62, topHeight * 0.42, Math.sin(angle) * spread * 0.62],
      foot,
      0.023,
      centerMaterial,
      14,
    );
    addBox(
      parent,
      [0.085, 0.022, 0.045],
      [foot[0], 0.018, foot[2]],
      material(0x151b22, { roughness: 0.65 }),
    );
  }

  if (tray) {
    addCylinder(parent, 0.22, 0.22, 0.022, [0, topHeight * 0.52, 0], centerMaterial, 3);
  }
}

function createCustomPierTripod(parent) {
  const black = material(0x171b20, { metalness: 0.56, roughness: 0.34 });
  const dark = material(0x242a30, { metalness: 0.48, roughness: 0.4 });
  const white = material(0xe8e7e1, { metalness: 0.28, roughness: 0.38 });
  const chrome = material(0xc9ced0, { metalness: 0.92, roughness: 0.13 });
  const rubber = material(0x111519, { metalness: 0.08, roughness: 0.82 });

  // 三张实物照的共同结构：中央 pier、白色开槽上腿、镀铬伸缩下腿和三向撑杆。
  addCylinder(parent, 0.112, 0.112, 0.64, [0, 0.58, 0], black, 18);
  addCylinder(parent, 0.132, 0.132, 0.075, [0, 0.275, 0], dark, 24);
  addCylinder(parent, 0.132, 0.132, 0.075, [0, 0.885, 0], dark, 24);
  addCylinder(parent, 0.122, 0.122, 0.055, [0, 0.945, 0], black, 24);
  addBox(parent, [0.235, 0.032, 0.235], [0, 0.982, 0], chrome);

  for (const y of [0.39, 0.55, 0.71]) {
    for (const angle of [0, Math.PI / 2]) {
      addAxialCylinder(
        parent,
        0.008,
        0.008,
        0.006,
        [Math.cos(angle) * 0.113, y, Math.sin(angle) * 0.113],
        dark,
        angle === 0 ? "x" : "z",
        12,
      );
    }
  }

  for (let i = 0; i < 3; i += 1) {
    const angle = Math.PI / 2 + i * (Math.PI * 2 / 3);
    const radial = (radius, y) => [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
    const hub = radial(0.12, 0.29);
    const knee = radial(0.46, 0.145);
    const foot = radial(0.68, 0.035);

    addBoxBetween(parent, hub, knee, 0.078, 0.056, white);
    const upperVector = new THREE.Vector3(...knee).sub(new THREE.Vector3(...hub));
    const slotStart = new THREE.Vector3(...hub).addScaledVector(upperVector, 0.22);
    const slotEnd = new THREE.Vector3(...hub).addScaledVector(upperVector, 0.78);
    addBoxBetween(parent, slotStart.toArray(), slotEnd.toArray(), 0.021, 0.058, dark);

    addCylinderBetween(parent, knee, foot, 0.023, chrome, 18);
    addCylinderBetween(parent, radial(0.425, 0.158), radial(0.492, 0.13), 0.034, dark, 18);
    addCylinderBetween(parent, radial(0.095, 0.26), radial(0.43, 0.135), 0.011, dark, 12);

    const kneeJoint = new THREE.Mesh(new THREE.SphereGeometry(0.043, 18, 12), dark);
    kneeJoint.position.set(...knee);
    kneeJoint.castShadow = true;
    parent.add(kneeJoint);
    addCylinder(parent, 0.052, 0.052, 0.025, foot, rubber, 20);
    addBox(parent, [0.1, 0.025, 0.065], [foot[0], 0.018, foot[2]], rubber);
  }
}

function buildEquipmentGallery() {
  createCelestronSctStation({
    x: 2.75,
    z: -1.45,
    title: "星特朗 C6",
    subtitle: "NexStar 6SE · 150/1500 mm",
    length: 0.406,
    radius: 0.0905,
    tubeColor: 0xb94f28,
    accentColor: 0xf97316,
    details: ["施密特－卡塞格林式", "口径 150 mm · 焦距 1499 mm · f/10", "1.25 英寸接口；原配经纬仪已损坏"],
  });
  createCelestronSctStation({
    x: 3.95,
    z: -1.45,
    title: "星特朗 C8",
    subtitle: "NexStar Evolution 8 · 203/2032 mm",
    length: 0.432,
    radius: 0.119,
    tubeColor: 0xb8bcc0,
    accentColor: 0xf97316,
    evolution: true,
    details: ["施密特－卡塞格林式", "口径 203 mm · 焦距 2032 mm · f/10", "1.25 英寸接口；Evolution 单臂经纬仪已损坏"],
  });
  createCem40RefractorStation();
  createSolarMaxStation();
  createLuntStation();
  createNewtonianDisplay();
  createPortablePowerStation();
  createFlatFieldPanel();
  buildDryCabinet();
}

function createCelestronSctStation({
  x,
  z,
  title,
  subtitle,
  length,
  radius,
  tubeColor,
  accentColor,
  evolution = false,
  details,
}) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = evolution ? -0.08 : 0.1;
  scene.add(group);

  const black = material(0x151a20, { metalness: 0.48, roughness: 0.34 });
  const dark = material(0x252c34, { metalness: 0.36, roughness: 0.42 });
  const orange = material(accentColor, { metalness: 0.25, roughness: 0.42 });
  const glass = material(0x173b55, { metalness: 0.2, roughness: 0.08 });
  createTripod(group, { topHeight: evolution ? 0.96 : 0.91, spread: evolution ? 0.38 : 0.35 });

  const baseY = evolution ? 1.01 : 0.96;
  addCylinder(group, 0.17, 0.15, 0.15, [0, baseY, 0], black, 28);
  addCylinder(group, 0.13, 0.16, 0.13, [0, baseY + 0.12, 0], dark, 28);
  const armZ = 0.16;
  const arm = new THREE.Mesh(
    createRoundedBoxGeometry(evolution ? 0.19 : 0.17, 0.48, 0.14, 0.055),
    black,
  );
  arm.position.set(0, baseY + 0.33, armZ);
  arm.castShadow = true;
  group.add(arm);
  addAxialCylinder(group, 0.105, 0.105, 0.19, [0, baseY + 0.52, 0.075], dark, "z", 28);
  const clutch = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.012, 10, 28), orange);
  clutch.position.set(0, baseY + 0.52, -0.027);
  group.add(clutch);

  const tubeY = baseY + 0.54;
  addAxialCylinder(group, radius, radius, length, [0, tubeY, 0], material(tubeColor, {
    metalness: evolution ? 0.42 : 0.2,
    roughness: evolution ? 0.28 : 0.46,
  }), "x", 36);
  addAxialCylinder(group, radius * 1.08, radius * 1.08, 0.055, [-length / 2 + 0.015, tubeY, 0], black, "x", 36);
  addAxialCylinder(group, radius * 1.04, radius * 1.04, 0.065, [length / 2 - 0.018, tubeY, 0], black, "x", 36);
  addAxialCylinder(group, radius * 0.86, radius * 0.86, 0.01, [-length / 2 - 0.016, tubeY, 0], glass, "x", 36);
  addAxialCylinder(group, radius * 0.29, radius * 0.29, 0.014, [-length / 2 - 0.024, tubeY, 0], black, "x", 24);
  addAxialCylinder(group, 0.027, 0.033, 0.075, [length / 2 + 0.045, tubeY, 0], black, "x", 20);
  addAxialCylinder(group, 0.021, 0.025, 0.065, [length / 2 + 0.1, tubeY + 0.035, 0], dark, "y", 18);
  addBox(group, [length * 0.75, 0.022, 0.035], [0.015, tubeY - radius - 0.022, -0.02], orange);

  const finder = new THREE.Group();
  finder.position.set(-0.03, tubeY + radius + 0.045, -0.015);
  addAxialCylinder(finder, 0.018, 0.018, 0.115, [0, 0, 0], black, "x", 16);
  addAxialCylinder(finder, 0.024, 0.024, 0.025, [-0.052, 0, 0], dark, "x", 16);
  addBox(finder, [0.055, 0.018, 0.025], [0.018, -0.027, 0], black);
  group.add(finder);

  const label = addBox(group, [length * 0.5, radius * 0.35, 0.006], [-0.01, tubeY, radius + 0.004], dark, false, false);
  label.material = material(evolution ? 0x30383f : 0x292d31, { roughness: 0.55 });
  createEquipmentPlaque(group, title, subtitle);
  registerEquipmentInteraction(group, {
    title,
    details,
    bounds: [0.72, 1.75, 0.75],
    center: [0, 0.88, 0],
  });
}

function createCem40RefractorStation() {
  const group = new THREE.Group();
  group.position.set(5.2, 0, -1.45);
  group.rotation.y = -0.06;
  scene.add(group);

  const black = material(0x111820, { metalness: 0.58, roughness: 0.3 });
  const red = material(0xc33a25, { metalness: 0.66, roughness: 0.25 });
  const redDark = material(0x8e251f, { metalness: 0.62, roughness: 0.3 });
  const silver = material(0xbec4c7, { metalness: 0.9, roughness: 0.16 });
  const carbon = material(0x1e2428, { metalness: 0.3, roughness: 0.25 });
  const lens = material(0x174a66, { metalness: 0.18, roughness: 0.06 });

  createCustomPierTripod(group);

  // CEM40 的 125 mm 底座与中心平衡赤道仪主体；红黑比例依据实物照片复原。
  addCylinder(group, 0.125, 0.125, 0.065, [0, 1.03, 0], black, 30);
  addCylinder(group, 0.108, 0.118, 0.07, [0, 1.095, 0], redDark, 28);
  const mountBody = new THREE.Mesh(createRoundedBoxGeometry(0.205, 0.255, 0.18, 0.025), red);
  mountBody.position.set(-0.005, 1.2, 0);
  mountBody.rotation.z = -0.14;
  mountBody.castShadow = true;
  group.add(mountBody);
  addAxialCylinder(group, 0.12, 0.12, 0.205, [-0.01, 1.235, 0], black, "z", 30);
  addAxialCylinder(group, 0.082, 0.082, 0.235, [-0.03, 1.37, 0], red, "z", 26);
  addAxialCylinder(group, 0.098, 0.098, 0.07, [-0.03, 1.37, -0.12], black, "z", 28);
  const saddle = addBox(group, [0.29, 0.055, 0.13], [-0.055, 1.43, 0], black);
  saddle.rotation.z = -0.91;
  addBox(group, [0.18, 0.017, 0.145], [-0.055, 1.438, 0], silver).rotation.z = -0.91;
  addCylinder(group, 0.024, 0.024, 0.035, [-0.155, 1.50, -0.09], redDark, 18);

  const shaftStart = [0.07, 1.24, 0.02];
  const shaftEnd = [0.39, 0.62, 0.02];
  const shaft = addCylinderBetween(group, shaftStart, shaftEnd, 0.012, silver, 16);
  const shaftDirection = new THREE.Vector3(...shaftEnd).sub(new THREE.Vector3(...shaftStart)).normalize();
  const weightPosition = new THREE.Vector3(...shaftStart).addScaledVector(shaftDirection, 0.47);
  const weight = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.065, 30), black);
  weight.position.copy(weightPosition);
  weight.quaternion.copy(shaft.quaternion);
  weight.castShadow = true;
  group.add(weight);
  addCylinderBetween(group, shaftEnd, new THREE.Vector3(...shaftEnd).addScaledVector(shaftDirection, 0.06).toArray(), 0.018, black, 16);

  const tubeAssembly = new THREE.Group();
  tubeAssembly.position.set(-0.055, 1.52, 0);
  tubeAssembly.rotation.z = -0.91;
  group.add(tubeAssembly);
  const tubeRadius = 0.049;
  addAxialCylinder(tubeAssembly, tubeRadius, tubeRadius, 0.42, [0, 0, 0], carbon, "x", 36);
  addAxialCylinder(tubeAssembly, 0.064, 0.064, 0.16, [-0.25, 0, 0], black, "x", 36);
  addAxialCylinder(tubeAssembly, 0.057, 0.057, 0.026, [-0.336, 0, 0], black, "x", 34);
  addAxialCylinder(tubeAssembly, 0.045, 0.045, 0.009, [-0.351, 0, 0], lens, "x", 32);
  for (const tubeX of [-0.13, 0.105]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.011, 10, 30), black);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(tubeX, 0, 0);
    ring.castShadow = true;
    tubeAssembly.add(ring);
  }
  addBox(tubeAssembly, [0.34, 0.023, 0.055], [-0.01, -0.071, 0], silver);
  addAxialCylinder(tubeAssembly, 0.049, 0.041, 0.095, [0.255, 0, 0], black, "x", 28);
  addAxialCylinder(tubeAssembly, 0.041, 0.031, 0.075, [0.337, 0, 0], black, "x", 26);
  addAxialCylinder(tubeAssembly, 0.027, 0.027, 0.045, [0.26, -0.064, 0], silver, "z", 18);
  addAxialCylinder(tubeAssembly, 0.016, 0.016, 0.16, [-0.04, 0.103, 0], black, "x", 18);
  addBox(tubeAssembly, [0.15, 0.019, 0.028], [-0.04, 0.073, 0], black);
  addBox(tubeAssembly, [0.12, 0.024, 0.006], [0.015, 0, 0.051], redDark, false, false);

  const controller = new THREE.Group();
  controller.position.set(-0.24, 1.09, -0.13);
  controller.rotation.y = Math.PI;
  group.add(controller);
  const controllerBody = new THREE.Mesh(createRoundedBoxGeometry(0.09, 0.025, 0.185, 0.015), black);
  controllerBody.rotation.x = Math.PI / 2;
  controller.add(controllerBody);
  addBox(controller, [0.058, 0.035, 0.008], [0, 0.045, -0.017], material(0x567342, {
    emissive: 0x233818,
    emissiveIntensity: 0.28,
  }), false, false);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      addAxialCylinder(controller, 0.006, 0.006, 0.004, [(column - 1) * 0.022, -0.005 - row * 0.023, -0.018], silver, "z", 10);
    }
  }

  const cableCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.2, 1.03, -0.12),
    new THREE.Vector3(-0.31, 0.93, -0.15),
    new THREE.Vector3(-0.24, 0.82, -0.1),
    new THREE.Vector3(-0.12, 0.91, -0.04),
  ]);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 18, 0.004, 7, false), black);
  cable.castShadow = true;
  group.add(cable);

  createEquipmentPlaque(group, "锐星 CF-90 II", "搭配 iOptron CEM40");
  registerEquipmentInteraction(group, {
    title: "锐星 CF-90 II APO + iOptron CEM40",
    details: ["折射式 APO · 口径 90 mm · 焦距 600 mm · f/6.7", "2 英寸接口 · 镜筒约 3.20 kg", "CEM40：125 mm 底座、中心平衡赤道仪、承载 18 kg", "定制 pier tripod：黑色中央立柱、白色开槽上腿、镀铬伸缩下腿"],
    note: "镜筒与赤道仪参数依据器材编目；定制脚架尺寸依据三张实物照片按比例复原",
    bounds: [1.46, 1.9, 1.25],
    center: [0, 0.95, 0.08],
  });
}

function createOpenCarryCase(parent, {
  width,
  depth,
  shellColor,
  edgeColor = 0xbec3c4,
  lidAngle = 1.16,
}) {
  const shell = material(shellColor, { metalness: 0.42, roughness: 0.42 });
  const edge = material(edgeColor, { metalness: 0.84, roughness: 0.22 });
  const foam = material(0x15191c, { metalness: 0.02, roughness: 0.96 });
  const baseHeight = 0.11;
  addBox(parent, [width, baseHeight, depth], [0, baseHeight / 2, 0], shell);
  addBox(parent, [width - 0.055, 0.026, depth - 0.055], [0, baseHeight + 0.012, 0], foam);
  for (const x of [-width / 2 + 0.018, width / 2 - 0.018]) {
    addBox(parent, [0.035, baseHeight + 0.015, depth], [x, baseHeight / 2, 0], edge);
  }
  for (const z of [-depth / 2 + 0.018, depth / 2 - 0.018]) {
    addBox(parent, [width, baseHeight + 0.015, 0.035], [0, baseHeight / 2, z], edge);
  }

  const lid = new THREE.Group();
  lid.position.set(0, baseHeight, -depth / 2);
  lid.rotation.x = lidAngle;
  parent.add(lid);
  addBox(lid, [width, 0.035, depth], [0, 0, -depth / 2], shell);
  addBox(lid, [width - 0.055, 0.012, depth - 0.055], [0, -0.024, -depth / 2], foam);
  for (const x of [-width / 2 + 0.018, width / 2 - 0.018]) {
    addBox(lid, [0.035, 0.055, depth], [x, 0, -depth / 2], edge);
  }
  for (const z of [-0.018, -depth + 0.018]) {
    addBox(lid, [width, 0.055, 0.035], [0, 0, z], edge);
  }
  addBox(parent, [0.16, 0.04, 0.025], [0, 0.045, depth / 2 + 0.018], edge);
  return { baseHeight, foam };
}

function createSolarMaxStation() {
  const group = new THREE.Group();
  group.position.set(6.45, 0, -1.45);
  group.rotation.y = 0.025;
  scene.add(group);
  const black = material(0x15191d, { metalness: 0.45, roughness: 0.34 });
  const gold = material(0xb49752, { metalness: 0.68, roughness: 0.28 });
  const silver = material(0xc5c8c7, { metalness: 0.76, roughness: 0.23 });
  createOpenCarryCase(group, { width: 1.02, depth: 0.43, shellColor: 0x171b20 });

  const tubeY = 0.17;
  const length = 0.762;
  const radius = 0.052;
  addAxialCylinder(group, radius, radius, length, [-0.01, tubeY, 0], gold, "x", 32);
  addAxialCylinder(group, 0.068, 0.068, 0.13, [-0.34, tubeY, 0], black, "x", 32);
  addAxialCylinder(group, 0.061, 0.061, 0.012, [-0.412, tubeY, 0], material(0x213b52, { roughness: 0.09 }), "x", 28);
  addAxialCylinder(group, 0.055, 0.045, 0.13, [0.41, tubeY, 0], black, "x", 28);
  addAxialCylinder(group, 0.026, 0.026, 0.105, [0.46, tubeY + 0.058, 0], black, "y", 18);
  addAxialCylinder(group, 0.019, 0.024, 0.055, [0.46, tubeY + 0.13, 0], black, "y", 18);
  for (const x of [-0.17, 0.15]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.011, 10, 28), black);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(x, tubeY, 0);
    group.add(ring);
  }
  addBox(group, [0.4, 0.022, 0.04], [0, tubeY - 0.072, 0], black);
  for (const x of [-0.32, 0.32, 0.4]) {
    addCylinder(group, 0.026, 0.026, 0.06, [x, 0.16, 0.145], x === 0.4 ? silver : black, 18);
  }
  createEquipmentPlaque(group, "SolarMax II 90", "Hα 90/800 mm · 箱内陈列", [0, 0.18, 0.24], 0.64);
  registerEquipmentInteraction(group, {
    title: "Coronado SolarMax II 90",
    details: ["Hα 日珥镜 · 口径 90 mm · 焦距 800 mm · f/8.9", "1.25 英寸接口 · 镜筒长度约 76 cm", "箱内配 25/18/12 mm 目镜及 2× 巴罗夫镜", "CEM40 已用于锐星，因此本镜筒按收纳状态放在打开的泡棉硬箱中"],
    note: "箱体外观参考 SolarMax II 90 常见黑色定制泡棉硬箱",
    bounds: [1.08, 0.62, 0.7],
    center: [0, 0.31, -0.08],
  });
}

function createLuntStation() {
  const group = new THREE.Group();
  group.position.set(7.65, 0, -1.45);
  group.rotation.y = -0.025;
  scene.add(group);
  const black = material(0x151a20, { metalness: 0.44, roughness: 0.34 });
  const white = material(0xe6e9e8, { metalness: 0.14, roughness: 0.42 });
  const red = material(0xb32634, { metalness: 0.55, roughness: 0.28 });
  const gold = material(0xa88d48, { metalness: 0.7, roughness: 0.3 });
  createOpenCarryCase(group, { width: 0.56, depth: 0.34, shellColor: 0xc4c7c6, edgeColor: 0x7d858a, lidAngle: 1.2 });

  const tubeY = 0.17;
  addAxialCylinder(group, 0.046, 0.046, 0.36, [-0.015, tubeY, 0], white, "x", 30);
  addAxialCylinder(group, 0.058, 0.058, 0.09, [-0.15, tubeY, 0], black, "x", 30);
  addAxialCylinder(group, 0.052, 0.052, 0.025, [-0.208, tubeY, 0], red, "x", 30);
  addAxialCylinder(group, 0.043, 0.043, 0.014, [-0.228, tubeY, 0], material(0x1a4259, { roughness: 0.08 }), "x", 28);
  addAxialCylinder(group, 0.052, 0.042, 0.09, [0.205, tubeY, 0], black, "x", 26);
  addAxialCylinder(group, 0.038, 0.034, 0.03, [0.26, tubeY, 0], gold, "x", 22);
  addAxialCylinder(group, 0.026, 0.026, 0.07, [0.21, tubeY + 0.045, 0], black, "y", 18);
  addCylinder(group, 0.026, 0.026, 0.07, [0.17, 0.16, 0.105], red, 18);
  createEquipmentPlaque(group, "Lunt LS60", "Hα 日珥镜 · 银色硬箱", [0, 0.18, 0.2], 0.46);
  registerEquipmentInteraction(group, {
    title: "Lunt LS60 日珥镜",
    details: ["Hα 日珥镜 · 编目记录口径 60 mm、焦距 600 mm", "1.25 英寸接口 · 2024 年 12 月购入", "无空余赤道仪，按收纳状态放在打开的定制泡棉箱中", "LS60T 官方箱尺寸约 20 × 12 × 6 in（50.8 × 30.5 × 15.2 cm）"],
    note: "银色铝箱与黑色定制泡棉参考 Lunt 官方产品箱",
    bounds: [0.64, 0.56, 0.58],
    center: [0, 0.28, -0.07],
  });
}

function createNewtonianDisplay() {
  const group = new THREE.Group();
  group.position.set(8.75, 0, -1.4);
  group.rotation.y = -0.1;
  scene.add(group);
  const black = material(0x171b20, { metalness: 0.38, roughness: 0.3 });
  const white = material(0xe8eceb, { metalness: 0.16, roughness: 0.42 });
  const green = material(0x4ea84e, { metalness: 0.38, roughness: 0.36 });
  const silver = material(0xc3c9cb, { metalness: 0.9, roughness: 0.16 });

  createTripod(group, {
    topHeight: 0.78,
    spread: 0.39,
    legColor: 0xc5c9ca,
    centerColor: 0x343a40,
    tray: true,
  });
  addCylinder(group, 0.11, 0.12, 0.075, [0, 0.84, 0], black, 28);
  const eqBody = new THREE.Mesh(createRoundedBoxGeometry(0.18, 0.23, 0.16, 0.025), white);
  eqBody.position.set(0, 0.965, 0);
  eqBody.rotation.z = -0.22;
  eqBody.castShadow = true;
  group.add(eqBody);
  addAxialCylinder(group, 0.085, 0.085, 0.19, [-0.015, 1.03, 0], black, "z", 28);
  addAxialCylinder(group, 0.072, 0.072, 0.21, [-0.035, 1.17, 0], white, "z", 26);
  addBox(group, [0.25, 0.05, 0.12], [-0.035, 1.255, 0], black);
  addBox(group, [0.2, 0.018, 0.13], [-0.035, 1.287, 0], green);

  const shaftStart = [0.05, 1.03, 0.02];
  const shaftEnd = [0.31, 0.67, 0.02];
  const shaft = addCylinderBetween(group, shaftStart, shaftEnd, 0.011, silver, 16);
  const shaftDirection = new THREE.Vector3(...shaftEnd).sub(new THREE.Vector3(...shaftStart)).normalize();
  const weightPosition = new THREE.Vector3(...shaftStart).addScaledVector(shaftDirection, 0.34);
  const counterweight = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.055, 26), black);
  counterweight.position.copy(weightPosition);
  counterweight.quaternion.copy(shaft.quaternion);
  counterweight.castShadow = true;
  group.add(counterweight);
  addCylinderBetween(group, [-0.1, 0.94, 0.08], [-0.26, 0.76, 0.14], 0.007, black, 12);
  addCylinder(group, 0.025, 0.025, 0.035, [-0.27, 0.75, 0.145], black, 16);

  const tubeAssembly = new THREE.Group();
  tubeAssembly.position.set(-0.035, 1.39, 0);
  tubeAssembly.rotation.z = 0.08;
  group.add(tubeAssembly);
  const tubeY = 0;
  const length = 0.69;
  const radius = 0.091;
  addAxialCylinder(tubeAssembly, radius, radius, length, [0, tubeY, 0], black, "x", 36);
  addAxialCylinder(tubeAssembly, 0.099, 0.099, 0.045, [-0.325, tubeY, 0], white, "x", 34);
  addAxialCylinder(tubeAssembly, 0.099, 0.099, 0.045, [0.325, tubeY, 0], white, "x", 34);
  addAxialCylinder(tubeAssembly, 0.087, 0.087, 0.008, [-0.352, tubeY, 0], material(0x080b0f, { roughness: 0.12 }), "x", 32);
  for (const x of [-0.18, 0.16]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.102, 0.011, 10, 30), white);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(x, tubeY, 0);
    tubeAssembly.add(ring);
    addBox(tubeAssembly, [0.035, 0.16, 0.022], [x, -0.19, 0], white);
  }
  addBox(tubeAssembly, [0.48, 0.035, 0.075], [0, -0.13, 0], green);
  addAxialCylinder(tubeAssembly, 0.034, 0.034, 0.095, [0.16, tubeY + 0.105, 0], white, "y", 20);
  addAxialCylinder(tubeAssembly, 0.025, 0.029, 0.08, [0.16, tubeY + 0.18, 0], black, "y", 20);
  addAxialCylinder(tubeAssembly, 0.017, 0.017, 0.15, [-0.08, tubeY + 0.14, 0], white, "x", 18);
  addBox(tubeAssembly, [0.15, 0.018, 0.025], [-0.08, tubeY + 0.11, 0], white);
  createEquipmentPlaque(group, "Sky-Watcher 150PDS", "牛反 150/750 mm", [0, 0.18, 0.34], 0.66);
  registerEquipmentInteraction(group, {
    title: "Sky-Watcher 150PDS",
    details: ["抛物面牛顿反射式", "口径 150 mm · 焦距 750 mm · f/5", "镜筒 182 × 690 mm · 约 6 kg · 2 英寸双速调焦座", "配套 German equatorial mount 与金属三脚架；器材编目未记录赤道仪具体型号"],
    note: "镜筒按实物图与参数复原；配套赤道仪因型号未明，按常见 Sky-Watcher EQ 外形制作",
    bounds: [0.9, 1.78, 0.82],
    center: [0, 0.89, 0],
  });
}

function createPortablePowerStation() {
  const group = new THREE.Group();
  group.position.set(3.3, 0, 0.9);
  group.rotation.y = Math.PI;
  scene.add(group);
  const caseMaterial = material(0x333c42, { roughness: 0.58, metalness: 0.18 });
  const powerBody = new THREE.Mesh(createRoundedBoxGeometry(0.36, 0.28, 0.25, 0.035), caseMaterial);
  powerBody.position.y = 0.17;
  powerBody.castShadow = true;
  group.add(powerBody);
  addBox(group, [0.17, 0.075, 0.012], [0, 0.2, -0.132], material(0x0c1720, { emissive: 0x0e3f59, emissiveIntensity: 0.45 }));
  for (const x of [-0.1, -0.035, 0.035, 0.1]) {
    addAxialCylinder(group, 0.014, 0.014, 0.014, [x, 0.12, -0.137], material(0x171a1d), "z", 16);
  }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 10, 28, Math.PI), caseMaterial);
  handle.rotation.z = Math.PI;
  handle.position.set(0, 0.325, 0);
  group.add(handle);
  createEquipmentPlaque(group, "绿联 GS600", "680 Wh · 600 W", [0, 0.08, -0.155], 0.32);
  registerEquipmentInteraction(group, {
    title: "绿联 GS600 户外电源",
    details: ["额定能量 680 Wh", "30.4 Ah / 22.4 V", "220 V 50 Hz · 600 W Max · 约 9.0 kg"],
    bounds: [0.44, 0.48, 0.43],
    center: [0, 0.24, 0],
  });
}

function createFlatFieldPanel() {
  const group = new THREE.Group();
  group.position.set(8.37, 0, 1.16);
  group.rotation.y = Math.PI;
  scene.add(group);
  const frame = material(0x303840, { metalness: 0.46, roughness: 0.4 });
  addBox(group, [0.64, 0.46, 0.025], [0, 0.31, 0], frame);
  addBox(group, [0.58, 0.4, 0.012], [0, 0.31, -0.02], material(0xe6edf2, {
    emissive: 0xdcecff,
    emissiveIntensity: 0.18,
    roughness: 0.55,
  }));
  registerEquipmentInteraction(group, {
    title: "平场板",
    details: ["约 60 × 42 cm（接近 A2）", "用于拍摄平场校准帧", "建议搭配可调电压电源线"],
    bounds: [0.68, 0.66, 0.16],
    center: [0, 0.33, 0],
  });
}

function buildDryCabinet() {
  const group = new THREE.Group();
  group.position.set(6.45, 0, 0.98);
  scene.add(group);
  const width = 3.0;
  const height = 1.78;
  const depth = 0.46;
  const frame = material(0x222a31, { metalness: 0.72, roughness: 0.32 });
  const inside = material(0x363f47, { metalness: 0.42, roughness: 0.48 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x9fc2d2,
    metalness: 0,
    roughness: 0.08,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  addBox(group, [width, 0.08, depth], [0, 0.04, 0], frame);
  addBox(group, [width, 0.08, depth], [0, height - 0.04, 0], frame);
  addBox(group, [0.07, height, depth], [-width / 2 + 0.035, height / 2, 0], frame);
  addBox(group, [0.07, height, depth], [width / 2 - 0.035, height / 2, 0], frame);
  addBox(group, [width - 0.12, height - 0.12, 0.025], [0, height / 2, depth / 2 - 0.012], inside);
  addBox(group, [0.055, height - 0.12, depth], [0, height / 2, 0], frame);

  for (const y of [0.39, 0.71, 1.03, 1.35]) {
    addBox(group, [width - 0.12, 0.025, depth - 0.08], [0, y, 0], inside, true, true);
    addBox(
      group,
      [width - 0.16, 0.012, 0.025],
      [0, y + 0.025, -depth / 2 + 0.035],
      material(0xc7e8f4, { emissive: 0x8ad8f2, emissiveIntensity: 0.7, roughness: 0.24 }),
      false,
      false,
    );
  }

  createDryCabinetDoor(group, -1.48, 1, height, depth, frame, glass);
  createDryCabinetDoor(group, 1.48, -1, height, depth, frame, glass);
  addBox(group, [0.23, 0.075, 0.025], [1.18, 1.66, -depth / 2 - 0.045], material(0x101b20, {
    emissive: 0x146b79,
    emissiveIntensity: 0.55,
    roughness: 0.34,
  }));
  for (const x of [-1.36, 1.36]) {
    addBox(group, [0.09, 0.08, 0.09], [x, -0.005, 0], frame);
  }

  createShelfLabel(group, "CAMERAS", -1.22, 1.37, 0.34);
  createShelfLabel(group, "EYEPIECES", -1.18, 1.05, 0.4);
  createShelfLabel(group, "CONTROLLERS & OPTICS", -1.05, 0.73, 0.58);
  createShelfLabel(group, "ADAPTERS & FILTERS", -1.06, 0.41, 0.56);

  populateDryCabinet(group);
}

function createDryCabinetDoor(parent, hingeX, direction, height, depth, frame, glass) {
  const door = new THREE.Group();
  door.position.set(hingeX, 0, -depth / 2 - 0.012);
  door.userData.openDirection = direction;
  parent.add(door);

  const doorWidth = 1.42;
  const centerX = direction * doorWidth / 2;
  const innerX = direction * doorWidth;
  const pane = addBox(door, [doorWidth - 0.07, height - 0.19, 0.012], [centerX, height / 2, 0], glass, false, false);
  pane.renderOrder = 4;
  const parts = [pane];
  parts.push(addBox(door, [0.04, height - 0.12, 0.035], [0, height / 2, -0.018], frame));
  parts.push(addBox(door, [0.04, height - 0.12, 0.035], [innerX, height / 2, -0.018], frame));
  for (const y of [0.09, height - 0.09]) {
    parts.push(addBox(door, [doorWidth, 0.045, 0.035], [centerX, y, -0.018], frame));
  }
  const handle = addBox(
    door,
    [0.025, 0.19, 0.028],
    [direction * (doorWidth - 0.11), 0.9, -0.052],
    material(0xb3bcc1, { metalness: 0.82, roughness: 0.2 }),
  );
  parts.push(handle);

  const interaction = {
    kind: "dry-cabinet",
    label: "打开防潮柜",
  };
  parts.forEach((part) => {
    part.userData.interaction = interaction;
    interactables.push(part);
    dryCabinetDoorTargets.push(part);
  });
  dryCabinetDoors.push(door);
}

function createShelfLabel(parent, textValue, x, y, width) {
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width * (184 / 768)),
    new THREE.MeshBasicMaterial({
      map: makeEquipmentLabelTexture(textValue),
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  label.position.set(x, y + 0.04, -0.266);
  label.rotation.y = Math.PI;
  label.renderOrder = 6;
  parent.add(label);
}

function populateDryCabinet(cabinet) {
  createCooledCamera(cabinet, [-1.18, 1.365, -0.035], {
    title: "ASI1600MM Pro",
    bodyColor: 0xb62632,
    accentColor: 0x171b1f,
    radius: 0.058,
    length: 0.105,
    details: ["黑白冷冻相机 · 4/3 英寸画幅", "4656 × 3520 · 3.8 μm", "2 英寸 / M42 接口；长期配 16.5 mm 转接环"],
  });
  createCooledCamera(cabinet, [-0.78, 1.365, -0.035], {
    title: "QHY168C",
    bodyColor: 0x20242a,
    accentColor: 0xb52132,
    radius: 0.06,
    length: 0.115,
    details: ["彩色冷冻相机 · APS-C", "4952 × 3288 · 4.8 μm", "2 英寸接口 · 约 700 g"],
  });
  createCooledCamera(cabinet, [-0.38, 1.365, -0.035], {
    title: "QHY10",
    bodyColor: 0x1a1e23,
    accentColor: 0x4a5968,
    radius: 0.052,
    length: 0.105,
    details: ["彩色冷冻相机 · APS 画幅", "3900 × 2616 · 6.05 μm", "2 英寸接口"],
  });

  const planetaryCameras = [
    [0.06, "QHY5III 462C", 0x3430a6, ["彩色行星相机", "1920 × 1080 · 2.9 μm · 135 fps", "1.25 英寸接口"]],
    [0.32, "QHY5III 178M", 0x1578b7, ["黑白行星相机", "3072 × 2048 · 2.4 μm · 50 fps", "1.25 英寸接口；配 IR850 与 UV/IR Cut 滤镜"]],
    [0.58, "QHY5L-II-M", 0xb8bec2, ["黑白行星/导星相机", "无冷冻 · 1.25 英寸接口", "储存在斑驳金属盒中"]],
    [0.84, "BOSMA TCE-200", 0x235f88, ["博冠行星相机", "无冷冻 · 1.25 英寸接口", "储存在蓝白纸盒中"]],
    [1.1, "Celestron NexImage 5", 0xd55a2d, ["行星相机", "无冷冻 · 1.25 英寸接口", "Mini-B 数据接口"]],
  ];
  planetaryCameras.forEach(([x, title, color, details], index) => {
    createPlanetaryCamera(cabinet, [x, 1.365, -0.035], {
      title,
      color,
      height: index === 2 ? 0.11 : 0.095,
      details,
    });
  });

  createEyepieceCollection(cabinet);
  createControllerShelf(cabinet);
  createAdapterShelf(cabinet);
  createStorageShelf(cabinet);
}

function createCooledCamera(parent, position, {
  title,
  bodyColor,
  accentColor,
  radius,
  length,
  details,
}) {
  const group = new THREE.Group();
  group.position.set(...position);
  parent.add(group);
  const body = material(bodyColor, { metalness: 0.68, roughness: 0.25 });
  const accent = material(accentColor, { metalness: 0.56, roughness: 0.3 });
  const glass = material(0x174c65, { metalness: 0.28, roughness: 0.08 });
  addCylinder(group, radius, radius, length, [0, length / 2, 0], body, 30);
  addCylinder(group, radius * 1.04, radius * 1.04, 0.022, [0, 0.011, 0], accent, 30);
  addCylinder(group, radius * 0.84, radius * 0.84, 0.018, [0, length + 0.009, 0], accent, 28);
  addCylinder(group, radius * 0.48, radius * 0.48, 0.009, [0, length + 0.022, 0], glass, 24);
  for (let i = -2; i <= 2; i += 1) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.01, 0.003, 6, 24), accent);
    rib.rotation.x = Math.PI / 2;
    rib.position.y = length * 0.52 + i * 0.013;
    group.add(rib);
  }
  for (const z of [-radius * 0.55, radius * 0.55]) {
    addBox(group, [0.01, radius * 0.23, radius * 0.25], [radius + 0.005, length * 0.28, z], accent, false, false);
  }
  registerEquipmentInteraction(group, {
    title,
    details,
    bounds: [radius * 2.5, length * 1.45, radius * 2.5],
    center: [0, length * 0.58, 0],
  });
}

function createPlanetaryCamera(parent, position, { title, color, height, details }) {
  const group = new THREE.Group();
  group.position.set(...position);
  parent.add(group);
  const body = material(color, { metalness: 0.7, roughness: 0.24 });
  const black = material(0x171b20, { metalness: 0.42, roughness: 0.36 });
  addCylinder(group, 0.027, 0.027, height, [0, height / 2, 0], body, 24);
  addCylinder(group, 0.032, 0.032, 0.016, [0, 0.008, 0], black, 24);
  addCylinder(group, 0.031, 0.031, 0.018, [0, height - 0.008, 0], black, 24);
  for (let i = 0; i < 3; i += 1) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.0025, 6, 20), body);
    rib.rotation.x = Math.PI / 2;
    rib.position.y = height * 0.35 + i * 0.011;
    group.add(rib);
  }
  registerEquipmentInteraction(group, {
    title,
    details,
    bounds: [0.085, height + 0.04, 0.085],
    center: [0, height / 2, 0],
  });
}

function createEyepieceCollection(parent) {
  const group = new THREE.Group();
  group.position.set(0, 1.045, -0.02);
  parent.add(group);
  const names = [
    "Luminos 31 mm", "Luminos 15 mm", "Luminos 7 mm", "X-Cel LX 18 mm",
    "X-Cel LX 9 mm", "Celestron 18 mm", "Celestron 40 mm Plössl",
    "Celestron 28 mm", "Celestron 10 mm", "Coronado 25 mm",
    "Coronado 18 mm", "Coronado 12 mm", "未知 28 mm", "SUPER 10",
  ];
  names.forEach((name, index) => {
    const x = -1.25 + index * (2.5 / (names.length - 1));
    const large = index === 0;
    const height = large ? 0.145 : 0.095 + (index % 3) * 0.012;
    const radius = large ? 0.045 : 0.028;
    createEyepiece(group, x, 0, height, radius, index < 9 ? 0xf07a28 : 0xc0a24a);
  });
  for (const [x, label] of [[-0.28, "3× X-Cel"], [0, "3× Barlow"], [0.28, "2× CEMAX"]]) {
    createEyepiece(group, x, 0.03, 0.14, 0.022, label.includes("CEMAX") ? 0xc0a24a : 0x718096);
  }
  registerEquipmentInteraction(group, {
    title: "目镜与巴罗夫镜",
    details: ["14 枚目镜：Luminos、X-Cel LX、CEMAX 等", "接口包含 1.25 英寸与 2 英寸", "3 枚巴罗夫镜：3×、3×、2×"],
    bounds: [2.72, 0.25, 0.34],
    center: [0, 0.12, 0],
  });
}

function createEyepiece(parent, x, z, height, radius, accentColor) {
  const black = material(0x15191e, { metalness: 0.38, roughness: 0.34 });
  const silver = material(0xaeb5b8, { metalness: 0.8, roughness: 0.22 });
  const accent = material(accentColor, { metalness: 0.58, roughness: 0.3 });
  addCylinder(parent, radius * 0.62, radius * 0.62, height * 0.35, [x, height * 0.175, z], silver, 18);
  addCylinder(parent, radius, radius * 0.78, height * 0.58, [x, height * 0.64, z], black, 22);
  const band = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.82, 0.003, 6, 20), accent);
  band.rotation.x = Math.PI / 2;
  band.position.set(x, height * 0.64, z);
  parent.add(band);
  addCylinder(parent, radius * 1.05, radius, height * 0.12, [x, height * 0.95, z], black, 22);
}

function createControllerShelf(parent) {
  const asiair = new THREE.Group();
  asiair.position.set(-1.15, 0.78, -0.03);
  parent.add(asiair);
  const red = material(0xd3343c, { metalness: 0.62, roughness: 0.28 });
  const asiairBody = new THREE.Mesh(createRoundedBoxGeometry(0.14, 0.038, 0.096, 0.012), red);
  asiairBody.position.y = 0.035;
  asiair.add(asiairBody);
  for (const x of [-0.045, -0.015, 0.015, 0.045]) {
    addBox(asiair, [0.015, 0.016, 0.008], [x, 0.035, -0.052], material(0x15191d), false, false);
  }
  addAxialCylinder(asiair, 0.008, 0.008, 0.19, [0.085, 0.11, 0], material(0x20252a), "y", 12).rotation.z = -0.12;
  registerEquipmentInteraction(asiair, {
    title: "ASIAIR Plus 256GB",
    details: ["天文摄影控制盒", "约 102.5 × 70 × 26.5 mm", "256 GB 版本；社团热点名为“韭菜盒子”"],
    bounds: [0.32, 0.23, 0.2],
    center: [0, 0.11, 0],
  });

  const wheel = new THREE.Group();
  wheel.position.set(-0.68, 0.84, -0.03);
  parent.add(wheel);
  const wheelMaterial = material(0x1d2228, { metalness: 0.58, roughness: 0.3 });
  addAxialCylinder(wheel, 0.074, 0.074, 0.025, [0, 0, 0], wheelMaterial, "z", 32);
  addAxialCylinder(wheel, 0.025, 0.025, 0.03, [0.02, 0.015, -0.02], material(0x080b0e), "z", 22);
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    addAxialCylinder(wheel, 0.004, 0.004, 0.007, [Math.cos(angle) * 0.055, Math.sin(angle) * 0.055, -0.018], material(0xc4c8c8), "z", 10);
  }
  registerEquipmentInteraction(wheel, {
    title: "ZWO Manual Filter Wheel",
    details: ["手动滤镜轮 · M42 内螺纹", "5 个位置：IR/UV Cut、R、G、B、空位", "长期接着 21 mm 转接环"],
    bounds: [0.19, 0.19, 0.12],
    center: [0, 0, 0],
  });

  const guide = new THREE.Group();
  guide.position.set(-0.23, 0.83, -0.02);
  parent.add(guide);
  const guideWhite = material(0xd9dee0, { metalness: 0.35, roughness: 0.36 });
  const guideBlack = material(0x1a2026, { metalness: 0.48, roughness: 0.32 });
  addAxialCylinder(guide, 0.026, 0.026, 0.14, [0, 0, 0], guideWhite, "x", 22);
  addAxialCylinder(guide, 0.034, 0.034, 0.032, [-0.06, 0, 0], guideBlack, "x", 22);
  addAxialCylinder(guide, 0.023, 0.019, 0.04, [0.085, 0, 0], guideBlack, "x", 18);
  addBox(guide, [0.13, 0.018, 0.03], [0, -0.037, 0], guideBlack);
  registerEquipmentInteraction(guide, {
    title: "ZWO 30F4 MiniScope",
    details: ["导星镜 / 寻星镜物镜", "口径 30 mm · 焦距 120 mm", "1.25 英寸内径接口；无目镜"],
    bounds: [0.25, 0.16, 0.15],
    center: [0, 0, 0],
  });

  createBinocular(parent, [0.25, 0.81, -0.02]);
  createPhoneAdapterAndCollimator(parent, [0.88, 0.76, -0.02]);
}

function createBinocular(parent, position) {
  const group = new THREE.Group();
  group.position.set(...position);
  parent.add(group);
  const dark = material(0x22282d, { metalness: 0.22, roughness: 0.48 });
  for (const x of [-0.035, 0.035]) {
    addAxialCylinder(group, 0.032, 0.025, 0.13, [x, 0, 0], dark, "z", 20);
    addAxialCylinder(group, 0.037, 0.037, 0.025, [x, 0, -0.07], dark, "z", 20);
  }
  addBox(group, [0.09, 0.025, 0.07], [0, 0, 0.01], dark);
  registerEquipmentInteraction(group, {
    title: "米德双筒望远镜",
    details: ["MEADE 双筒望远镜", "编目中口径、倍率与视场尚未确认", "按实物类别保留，不补写未知参数"],
    bounds: [0.18, 0.15, 0.22],
    center: [0, 0, 0],
  });
}

function createPhoneAdapterAndCollimator(parent, position) {
  const group = new THREE.Group();
  group.position.set(...position);
  parent.add(group);
  const black = material(0x171c21, { metalness: 0.4, roughness: 0.38 });
  const orange = material(0xd56e24, { metalness: 0.45, roughness: 0.34 });
  addBox(group, [0.16, 0.025, 0.07], [0, 0.02, 0], black);
  addBox(group, [0.035, 0.14, 0.05], [-0.055, 0.085, 0], black);
  addBox(group, [0.08, 0.035, 0.04], [0.005, 0.14, 0], black);
  addCylinder(group, 0.028, 0.028, 0.035, [0.065, 0.05, 0], orange, 20);
  const laser = addCylinder(group, 0.017, 0.017, 0.115, [0.16, 0.075, 0], material(0x3c4a50, {
    metalness: 0.68,
    roughness: 0.28,
  }), 18);
  laser.rotation.z = Math.PI / 2;
  registerEquipmentInteraction(group, {
    title: "三轴手机支架与激光校准器",
    details: ["Celestron NexYZ 三轴手机支架", "Next Generation Laser Collimator（光轴终结者）", "手机支架购于 2024 年 12 月"],
    bounds: [0.46, 0.28, 0.2],
    center: [0.06, 0.12, 0],
  });
}

function createAdapterShelf(parent) {
  const group = new THREE.Group();
  group.position.set(0, 0.415, -0.02);
  parent.add(group);
  const black = material(0x171c21, { metalness: 0.66, roughness: 0.28 });
  const silver = material(0xaeb5b8, { metalness: 0.84, roughness: 0.2 });
  const adapterSpecs = [
    [0.036, 0.073], [0.035, 0.055], [0.035, 0.047], [0.03, 0.026],
    [0.038, 0.021], [0.034, 0.013], [0.034, 0.03], [0.026, 0.03],
    [0.023, 0.007], [0.031, 0.0255], [0.043, 0.006], [0.032, 0.061],
  ];
  adapterSpecs.forEach(([radius, height], index) => {
    const x = -1.33 + index * 0.13;
    addCylinder(group, radius, radius, Math.max(height, 0.012), [x, Math.max(height, 0.012) / 2, 0.035], index % 4 === 0 ? silver : black, 20);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.78, 0.003, 6, 18), silver);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, Math.max(height, 0.012) + 0.002, 0.035);
    group.add(ring);
  });
  registerEquipmentInteraction(group, {
    title: "延长筒与转接环",
    details: ["2 英寸延长筒：73 / 55 / 47 mm", "T-Adapter 与多种 M42、M36、M25、M51 转接环", "含大转小、小转大及 Takahashi CA-35 残件"],
    bounds: [1.75, 0.18, 0.24],
    center: [-0.62, 0.09, 0.035],
  });

  const diagonals = new THREE.Group();
  diagonals.position.set(0.38, 0, 0.02);
  group.add(diagonals);
  for (let i = 0; i < 5; i += 1) {
    const x = i * 0.17;
    addBox(diagonals, [0.07, 0.06, 0.07], [x, 0.04, 0], black);
    addCylinder(diagonals, 0.022, 0.022, 0.075, [x, 0.105, 0], indexMaterial(i, black, silver), 18);
    addAxialCylinder(diagonals, 0.022, 0.026, 0.07, [x + 0.06, 0.04, 0], indexMaterial(i + 1, black, silver), "x", 18);
  }
  registerEquipmentInteraction(diagonals, {
    title: "天顶镜（5 件）",
    details: ["无标签 2 英寸与 1.25 英寸天顶镜", "Celestron 1.25 英寸、MEADE 2 英寸", "SolarMax 1.25 英寸滤光天顶镜"],
    bounds: [0.86, 0.23, 0.2],
    center: [0.34, 0.11, 0],
  });

  const masks = new THREE.Group();
  masks.position.set(1.13, 0.12, 0.03);
  group.add(masks);
  const maskSizes = [0.065, 0.052, 0.042, 0.035];
  maskSizes.forEach((radius, index) => {
    const x = (index - 1.5) * 0.12;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.006, 6, 24), index % 2 ? silver : black);
    ring.position.set(x, 0, 0);
    masks.add(ring);
    for (const angle of [0, Math.PI / 3, -Math.PI / 3]) {
      const spoke = addBox(masks, [radius * 1.7, 0.004, 0.004], [x, 0, 0], index % 2 ? silver : black, false, false);
      spoke.rotation.z = angle;
    }
  });
  registerEquipmentInteraction(masks, {
    title: "鱼骨板（4 件）",
    details: ["金属约 φ200 mm、φ140 mm、φ80 mm", "另有约 φ100 mm 亚克力件", "用于望远镜精确合焦"],
    bounds: [0.54, 0.22, 0.14],
    center: [0, 0, 0],
  });
}

function indexMaterial(index, first, second) {
  return index % 2 ? first : second;
}

function createStorageShelf(parent) {
  const group = new THREE.Group();
  group.position.set(0, 0.095, -0.02);
  parent.add(group);
  const cardboard = material(0xb68b5e, { roughness: 0.9 });
  const dark = material(0x242b31, { roughness: 0.56, metalness: 0.25 });
  const silver = material(0xc7cccb, { metalness: 0.64, roughness: 0.28 });
  for (let i = 0; i < 4; i += 1) {
    addBox(group, [0.32, 0.13 + (i % 2) * 0.035, 0.25], [-1.25 + i * 0.37, 0.07, 0], i % 2 ? dark : cardboard);
  }
  for (let i = 0; i < 5; i += 1) {
    addBox(group, [0.18, 0.095, 0.16], [0.25 + i * 0.22, 0.055, 0], i % 2 ? cardboard : dark);
    addAxialCylinder(group, 0.012, 0.012, 0.05, [0.25 + i * 0.22, 0.115, -0.08], silver, "z", 12);
  }
  const filterGroup = new THREE.Group();
  filterGroup.position.set(1.14, 0.22, 0.03);
  group.add(filterGroup);
  for (const [x, radius] of [[-0.1, 0.1], [0.11, 0.075]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.014, 8, 28), dark);
    ring.position.x = x;
    filterGroup.add(ring);
    const film = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.82, 28),
      material(0xcfd7d9, { metalness: 0.38, roughness: 0.18, side: THREE.DoubleSide }),
    );
    film.position.set(x, 0, -0.002);
    filterGroup.add(film);
  }
  registerEquipmentInteraction(group, {
    title: "供电、线材、盒装配件与巴德膜",
    details: ["12 V 5 A / 3 A 电源适配器、USB 数据线与可调电压线", "C8 与 C6 原装巴德膜", "相机、滤镜和小配件按原储存盒归类"],
    bounds: [2.82, 0.42, 0.38],
    center: [0, 0.2, 0],
  });
}

function buildPosters(textures) {
  createPoster({
    texture: textures.poster,
    width: 0.8,
    height: 0.533,
    position: [0.17, 2.25, 1.966],
    rotationY: Math.PI,
    title: "Yaya Telescope Poster",
    kicker: "活动室海报",
    note: "中山大学天文学社望远镜主题海报",
    source: assetUrl("yaya-telescope-poster.webp"),
  });

  createPoster({
    texture: textures.flag,
    width: 0.72,
    height: 0.54,
    position: [0.17, 1.38, 1.966],
    rotationY: Math.PI,
    title: "新社旗",
    kicker: "活动室照片",
    note: "摄于 2023-09-17 珠海校区社团联合游园会",
    source: assetUrl("club-flag.webp"),
  });

  createPoster({
    texture: textures.qifeng,
    width: 0.85,
    height: 0.567,
    position: [-0.76, 2.25, 1.966],
    rotationY: Math.PI,
    title: "七峰山背影",
    kicker: "观测活动照片",
    note: "七峰山观测活动中的星空与社员背影",
    source: assetUrl("qifeng-night.webp"),
  });

  createPoster({
    texture: textures.trappist,
    width: 0.5,
    height: 0.721,
    position: [-0.76, 1.38, 1.966],
    rotationY: Math.PI,
    title: "TRAPPIST-1e",
    kicker: "系外行星海报",
    note: "NASA Exoplanet Travel Bureau: Planet Hop from TRAPPIST-1e",
    source: assetUrl("trappist-1e.webp"),
  });

  createPoster({
    texture: textures.silhouette,
    width: 0.98,
    height: 1.386,
    position: [9.966, 1.55, -1.12],
    rotationY: -Math.PI / 2,
    title: "天文学社剪影",
    kicker: "招新海报",
    note: "天文学社活动剪影（2023）",
    source: assetUrl("club-silhouette.webp"),
  });

  createPoster({
    texture: textures.recruitmentQa,
    width: 0.98,
    height: 1.386,
    position: [9.966, 1.55, 0.18],
    rotationY: -Math.PI / 2,
    title: "天文学社招新 Q&A",
    kicker: "招新海报",
    note: "天文学社招新 Q&A（2023）",
    source: assetUrl("recruitment-qa.webp"),
  });
}

function createPoster({ texture, width, height, position, rotationY, title, kicker, note, source }) {
  const frameMaterial = material(0x2a313a, { roughness: 0.58 });
  const posterPosition = new THREE.Vector3(...position);
  const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
  const framePosition = posterPosition.clone().addScaledVector(normal, -0.029);
  const frameSize = Math.abs(normal.x) > 0.5
    ? [0.045, height + 0.08, width + 0.08]
    : [width + 0.08, height + 0.08, 0.045];
  addBox(scene, frameSize, framePosition.toArray(), frameMaterial);

  const poster = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.72, side: THREE.DoubleSide }),
  );
  poster.rotation.y = rotationY;
  poster.position.copy(posterPosition);
  poster.castShadow = true;
  poster.userData.interaction = {
    kind: "image",
    label: `查看「${title}」`,
    title,
    kicker,
    note,
    url: source,
  };
  interactables.push(poster);
  scene.add(poster);
}

function addBox(parent, size, position, meshMaterial, castShadow = true, receiveShadow = true) {
  const geometry = new THREE.BoxGeometry(...size);
  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.position.set(...position);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  parent.add(mesh);
  return mesh;
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...options });
}

function addTileGrid(width, depth, centerX, centerZ, tileSize) {
  const positions = [];
  const xDivisions = Math.round(width / tileSize);
  const zDivisions = Math.round(depth / tileSize);
  const minX = centerX - width / 2;
  const maxX = centerX + width / 2;
  const minZ = centerZ - depth / 2;
  const maxZ = centerZ + depth / 2;

  for (let i = 0; i <= xDivisions; i += 1) {
    const x = minX + i * tileSize;
    positions.push(x, 0.004, minZ, x, 0.004, maxZ);
  }
  for (let i = 0; i <= zDivisions; i += 1) {
    const z = minZ + i * tileSize;
    positions.push(minX, 0.004, z, maxX, 0.004, z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const grid = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0xcfcdc5, transparent: true, opacity: 0.32 }),
  );
  scene.add(grid);
}

function makeFloorTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 512;
  textureCanvas.height = 512;
  const ctx = textureCanvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, "#efeee9");
  gradient.addColorStop(0.48, "#e7e5de");
  gradient.addColorStop(1, "#dddcd5");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1500; i += 1) {
    const alpha = 0.012 + ((i * 17) % 11) / 1400;
    ctx.fillStyle = `rgba(70, 75, 80, ${alpha})`;
    ctx.fillRect((i * 73) % 512, (i * 151) % 512, 1, 1);
  }
  return new THREE.CanvasTexture(textureCanvas);
}

function makeWoodTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 512;
  const ctx = textureCanvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 256, 0);
  gradient.addColorStop(0, "#8d5730");
  gradient.addColorStop(0.5, "#b27a48");
  gradient.addColorStop(1, "#8f5933");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 512);
  ctx.lineWidth = 1;
  for (let y = 5; y < 512; y += 8) {
    const wave = Math.sin(y * 0.11) * 7;
    ctx.strokeStyle = `rgba(68, 35, 18, ${0.08 + (y % 21) / 500})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(65, y + wave, 180, y - wave, 256, y + 2);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.2, 1.7);
  return texture;
}

function makeNightPhotoTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 320;
  const ctx = textureCanvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, "#07152d");
  gradient.addColorStop(0.62, "#203f68");
  gradient.addColorStop(1, "#d39158");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 320);
  ctx.fillStyle = "rgba(7, 13, 21, .9)";
  ctx.beginPath();
  ctx.moveTo(0, 270);
  ctx.lineTo(52, 222);
  ctx.lineTo(95, 260);
  ctx.lineTo(143, 205);
  ctx.lineTo(205, 255);
  ctx.lineTo(256, 225);
  ctx.lineTo(256, 320);
  ctx.lineTo(0, 320);
  ctx.fill();
  for (let i = 0; i < 90; i += 1) {
    const x = (i * 79) % 256;
    const y = (i * 47) % 205;
    const r = i % 13 === 0 ? 1.5 : 0.65;
    ctx.fillStyle = i % 7 === 0 ? "#acd8ff" : "rgba(255,255,255,.82)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(textureCanvas);
}

function bindInterface() {
  stopButtons.forEach((button) => {
    button.addEventListener("click", () => setCameraAtStop(Number(button.dataset.stop)));
  });
  previousButton.addEventListener("click", () => setCameraAtStop((activeStop + tourStops.length - 1) % tourStops.length));
  nextButton.addEventListener("click", () => setCameraAtStop((activeStop + 1) % tourStops.length));

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerCancel);
  canvas.addEventListener("pointerleave", () => {
    if (!pointerDown) clearHover();
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("keyup", handleKeyup);
  window.addEventListener("blur", clearMovementKeys);
  helpButton.addEventListener("click", () => toggleHelp(true));
  helpClose.addEventListener("click", () => toggleHelp(false));
  fullscreenButton.addEventListener("click", toggleFullscreen);
  modalBackdrop.addEventListener("click", closeModal);
  modalClose.addEventListener("click", closeModal);
}

function setCameraAtStop(index, immediate = false) {
  const nextIndex = (index + tourStops.length) % tourStops.length;
  const stop = tourStops[nextIndex];
  activeStop = nextIndex;
  freeRoaming = false;
  clearMovementKeys();
  yawOffset = 0;
  pitchOffset = 0;

  stopButtons.forEach((button, buttonIndex) => {
    button.classList.toggle("is-active", buttonIndex === activeStop);
    button.setAttribute("aria-current", buttonIndex === activeStop ? "true" : "false");
  });
  sceneIndex.textContent = String(activeStop + 1).padStart(2, "0");
  sceneName.textContent = stop.name;
  sceneDescription.textContent = stop.description;

  const targetQuaternion = quaternionLookingAt(stop.position, stop.target);
  if (immediate || reducedMotion) {
    camera.position.copy(stop.position);
    camera.quaternion.copy(targetQuaternion);
    cameraTransition = null;
    rememberBaseRotation();
  } else {
    cameraTransition = {
      elapsed: 0,
      duration: 1.05,
      fromPosition: camera.position.clone(),
      toPosition: stop.position.clone(),
      fromQuaternion: camera.quaternion.clone(),
      toQuaternion: targetQuaternion,
    };
  }

  if (activeStop === 1) showTransientHint("点击柜门，或点击两本笔记", 2600);
  if (activeStop === 2) showTransientHint("点击望远镜模型可以查看参数", 2500);
  if (activeStop === 3) showTransientHint("点击防潮柜门和柜内配件", 2500);
}

function quaternionLookingAt(position, target) {
  const helperCamera = new THREE.PerspectiveCamera();
  helperCamera.position.copy(position);
  helperCamera.lookAt(target);
  return helperCamera.quaternion.clone();
}

function rememberBaseRotation() {
  const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
  basePitch = euler.x;
  baseYaw = euler.y;
}

function applyLookOffsets() {
  const euler = new THREE.Euler(
    THREE.MathUtils.clamp(basePitch + pitchOffset, -1.05, 1.05),
    baseYaw + yawOffset,
    0,
    "YXZ",
  );
  camera.quaternion.setFromEuler(euler);
}

function handlePointerDown(event) {
  if (modal.classList.contains("is-open")) return;
  pointerDown = true;
  pointerMoved = false;
  pointerStartX = event.clientX;
  pointerStartY = event.clientY;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add("is-dragging");
}

function handlePointerMove(event) {
  if (pointerDown) {
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    if (Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY) > 5) {
      pointerMoved = true;
    }
    if (!cameraTransition) {
      yawOffset = THREE.MathUtils.euclideanModulo(
        yawOffset - dx * 0.0032 + Math.PI,
        Math.PI * 2,
      ) - Math.PI;
      pitchOffset = THREE.MathUtils.clamp(pitchOffset - dy * 0.003, -0.48, 0.48);
      applyLookOffsets();
    }
    return;
  }

  if (!touchPrimary) updateHover(event.clientX, event.clientY);
}

function handlePointerUp(event) {
  if (!pointerDown) return;
  pointerDown = false;
  canvas.classList.remove("is-dragging");
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (!pointerMoved) activateAt(event.clientX, event.clientY);
}

function handlePointerCancel(event) {
  pointerDown = false;
  pointerMoved = false;
  canvas.classList.remove("is-dragging");
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
}

function updatePointer(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function findInteractive(clientX, clientY) {
  updatePointer(clientX, clientY);
  return raycaster.intersectObjects(interactables, false)[0]?.object ?? null;
}

function updateHover(clientX, clientY) {
  const object = findInteractive(clientX, clientY);
  if (object === hoveredObject) return;
  clearHover();
  if (!object) return;

  hoveredObject = object;
  hoverHelper = new THREE.BoxHelper(object, 0x38bdf8);
  hoverHelper.material.transparent = true;
  hoverHelper.material.opacity = 0.92;
  hoverHelper.material.depthTest = false;
  hoverHelper.renderOrder = 10;
  scene.add(hoverHelper);
  canvas.classList.add("can-interact");
  showHint(object.userData.interaction.label);
}

function clearHover() {
  hoveredObject = null;
  canvas.classList.remove("can-interact");
  hideHint();
  if (hoverHelper) {
    scene.remove(hoverHelper);
    hoverHelper.geometry.dispose();
    hoverHelper.material.dispose();
    hoverHelper = null;
  }
}

function activateAt(clientX, clientY) {
  const object = findInteractive(clientX, clientY);
  if (!object) return;
  const interaction = object.userData.interaction;
  if (interaction.kind === "exit") {
    window.location.assign("/astro/");
    return;
  }
  if (interaction.kind === "cabinet") {
    cabinetOpen = !cabinetOpen;
    cabinetDoorTargets.forEach((part) => {
      part.userData.interaction.label = cabinetOpen ? "合上木柜" : "打开木柜";
    });
    showTransientHint(cabinetOpen ? "木柜已经打开" : "木柜已经合上", 1500);
    clearHover();
    return;
  }
  if (interaction.kind === "dry-cabinet") {
    dryCabinetOpen = !dryCabinetOpen;
    dryCabinetDoorTargets.forEach((part) => {
      part.userData.interaction.label = dryCabinetOpen ? "合上防潮柜" : "打开防潮柜";
    });
    showTransientHint(dryCabinetOpen ? "防潮柜已经打开" : "防潮柜已经合上", 1500);
    clearHover();
    return;
  }
  openModal(interaction);
}

function openModal(interaction) {
  modalKicker.textContent = interaction.kicker || (interaction.kind === "pdf" ? "活动室藏书" : "活动室墙面");
  modalTitle.textContent = interaction.title;
  modalNote.textContent = interaction.note || "";
  modalOpen.hidden = interaction.kind === "info";
  modalOpen.href = interaction.url || "#";
  modalOpen.textContent = interaction.kind === "pdf" ? "在新标签页阅读" : "打开原图";
  modalContent.replaceChildren();

  if (interaction.kind === "pdf") {
    const iframe = document.createElement("iframe");
    iframe.title = interaction.title;
    iframe.loading = "lazy";
    iframe.src = `${interaction.url}#view=FitH`;
    modalContent.append(iframe);
  } else if (interaction.kind === "info") {
    const equipmentInfo = document.createElement("div");
    equipmentInfo.className = "equipment-info";
    const intro = document.createElement("p");
    intro.textContent = "点击器材模型可以查看编目中记录的主要参数。模型按真实比例制作，少数没有明确型号或尺寸的部件仅按实物照片复原外形。";
    equipmentInfo.append(intro);
    const list = document.createElement("ul");
    (interaction.details || []).forEach((detail) => {
      const item = document.createElement("li");
      item.textContent = detail;
      list.append(item);
    });
    equipmentInfo.append(list);
    modalContent.append(equipmentInfo);
  } else {
    const image = document.createElement("img");
    image.alt = interaction.title;
    image.src = interaction.url;
    modalContent.append(image);
  }

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  modalClose.focus();
  clearHover();
}

function closeModal() {
  if (!modal.classList.contains("is-open")) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  modalContent.replaceChildren();
  modalOpen.hidden = false;
  canvas.focus({ preventScroll: true });
}

function toggleHelp(open) {
  clearMovementKeys();
  helpPanel.classList.toggle("is-open", open);
  helpPanel.setAttribute("aria-hidden", open ? "false" : "true");
  if (open) helpClose.focus();
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    showTransientHint("当前浏览器没有允许全屏", 1800);
  }
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    closeModal();
    toggleHelp(false);
    return;
  }
  if (modal.classList.contains("is-open") || helpPanel.classList.contains("is-open")) return;
  const key = event.key.toLowerCase();
  if (!touchPrimary && ["w", "a", "s", "d"].includes(key)) {
    movementKeys.add(key);
    event.preventDefault();
    return;
  }
  if (/^[1-4]$/.test(event.key)) setCameraAtStop(Number(event.key) - 1);
  if (event.key === "ArrowLeft") setCameraAtStop(activeStop - 1);
  if (event.key === "ArrowRight") setCameraAtStop(activeStop + 1);
}

function handleKeyup(event) {
  movementKeys.delete(event.key.toLowerCase());
}

function clearMovementKeys() {
  movementKeys.clear();
}

function circleIntersectsBox(x, z, box) {
  const closestX = THREE.MathUtils.clamp(x, box.minX, box.maxX);
  const closestZ = THREE.MathUtils.clamp(z, box.minZ, box.maxZ);
  const dx = x - closestX;
  const dz = z - closestZ;
  return dx * dx + dz * dz < PLAYER_RADIUS * PLAYER_RADIUS;
}

function hasCollision(x, z) {
  return collisionBoxes.some((box) => circleIntersectsBox(x, z, box));
}

function moveCameraWithCollisions(dx, dz) {
  let moved = false;
  const nextX = camera.position.x + dx;
  if (!hasCollision(nextX, camera.position.z)) {
    camera.position.x = nextX;
    moved = true;
  }

  const nextZ = camera.position.z + dz;
  if (!hasCollision(camera.position.x, nextZ)) {
    camera.position.z = nextZ;
    moved = true;
  }

  if (moved) camera.position.y = PLAYER_HEIGHT;
  return moved;
}

function enterFreeRoamMode() {
  if (freeRoaming) return;
  freeRoaming = true;
  stopButtons.forEach((button) => {
    button.classList.remove("is-active");
    button.setAttribute("aria-current", "false");
  });
  sceneIndex.textContent = "自由";
  sceneName.textContent = "自由移动";
  sceneDescription.textContent = "WASD 前后左右移动，拖动画面转向";
  showTransientHint("WASD 自由移动 · 导览按钮可随时传送", 2200);
}

function updateMovement(delta) {
  if (
    touchPrimary ||
    cameraTransition ||
    modal.classList.contains("is-open") ||
    helpPanel.classList.contains("is-open")
  ) return;

  const forwardAmount = Number(movementKeys.has("w")) - Number(movementKeys.has("s"));
  const rightAmount = Number(movementKeys.has("d")) - Number(movementKeys.has("a"));
  if (!forwardAmount && !rightAmount) return;

  camera.getWorldDirection(movementForward);
  movementForward.y = 0;
  if (movementForward.lengthSq() < 1e-6) return;
  movementForward.normalize();
  movementRight.crossVectors(movementForward, camera.up).normalize();
  movementDelta
    .copy(movementForward)
    .multiplyScalar(forwardAmount)
    .addScaledVector(movementRight, rightAmount);
  if (movementDelta.lengthSq() > 1) movementDelta.normalize();
  movementDelta.multiplyScalar(MOVE_SPEED * delta);

  if (moveCameraWithCollisions(movementDelta.x, movementDelta.z)) {
    enterFreeRoamMode();
  }
}

function showHint(text) {
  interactionHint.textContent = text;
  interactionHint.classList.add("is-visible");
}

function hideHint() {
  interactionHint.classList.remove("is-visible");
}

function showTransientHint(text, duration = 2000) {
  window.clearTimeout(hintTimer);
  showHint(text);
  hintTimer = window.setTimeout(() => {
    if (!hoveredObject) hideHint();
  }, duration);
}

function handleResize() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = window.innerWidth < 720 ? 63 : 56;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touchPrimary ? 1.45 : 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

function handleContextLost(event) {
  event.preventDefault();
  showFatalError(new Error("浏览器暂时失去了 3D 图形环境，请刷新页面重试。"));
}

function renderFrame() {
  const delta = Math.min(clock.getDelta(), 0.05);

  if (cameraTransition) {
    cameraTransition.elapsed += delta;
    const raw = Math.min(cameraTransition.elapsed / cameraTransition.duration, 1);
    const eased = raw * raw * (3 - 2 * raw);
    camera.position.lerpVectors(cameraTransition.fromPosition, cameraTransition.toPosition, eased);
    camera.quaternion.slerpQuaternions(
      cameraTransition.fromQuaternion,
      cameraTransition.toQuaternion,
      eased,
    );
    if (raw >= 1) {
      cameraTransition = null;
      rememberBaseRotation();
    }
  }

  updateMovement(delta);

  cabinetDoors.forEach((door) => {
    const target = cabinetOpen ? door.userData.openDirection * (Math.PI / 2) : 0;
    door.rotation.y = THREE.MathUtils.damp(door.rotation.y, target, 7, delta);
  });

  dryCabinetDoors.forEach((door) => {
    const target = dryCabinetOpen ? door.userData.openDirection * (Math.PI / 2) : 0;
    door.rotation.y = THREE.MathUtils.damp(door.rotation.y, target, 7, delta);
  });

  if (hoverHelper && hoveredObject) hoverHelper.update();
  renderer.render(scene, camera);
}

function showFatalError(error) {
  console.error(error);
  loading.classList.remove("is-hidden");
  loading.querySelector("h1").textContent = "活动室暂时打不开";
  loadingStatus.textContent = error?.message || "浏览器可能不支持 WebGL。";
  loadingBar.style.width = "100%";
  loadingBar.style.background = "#fb7185";
}
