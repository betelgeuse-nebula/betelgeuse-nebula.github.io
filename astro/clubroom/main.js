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

const interactables = [];

const tourStops = [
  {
    name: "门口",
    description: "从门口看看活动室的全貌",
    position: new THREE.Vector3(1.34, 1.56, 1.57),
    target: new THREE.Vector3(-0.42, 1.16, -0.3),
  },
  {
    name: "铁架",
    description: "器材、箱子和活动留下的各种物件",
    position: new THREE.Vector3(1.0, 1.48, 0.2),
    target: new THREE.Vector3(-1.62, 1.28, 0.72),
  },
  {
    name: "木柜",
    description: "点击柜门、笔记和柜中的小物件",
    position: new THREE.Vector3(0.18, 1.43, -1.2),
    target: new THREE.Vector3(-1.55, 1.12, -1.25),
  },
  {
    name: "大门展墙",
    description: "大门同墙的活动照片与系外行星海报",
    position: new THREE.Vector3(-0.24, 1.5, 0.24),
    target: new THREE.Vector3(-0.62, 1.48, 1.96),
  },
  {
    name: "新展区",
    description: "沿窗侧延伸的海报展示空间",
    position: new THREE.Vector3(6.35, 1.52, -0.4),
    target: new THREE.Vector3(9.92, 1.5, -0.4),
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
    showTransientHint("拖动画面环顾四周", 2300);
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

  addBox(scene, [2.55, 1.58, 0.025], [0.58, 1.69, -1.985], glass, false, false);
  addBox(scene, [2.66, 0.06, 0.07], [0.58, 0.89, -1.955], frameMaterial);
  addBox(scene, [2.66, 0.06, 0.07], [0.58, 2.5, -1.955], frameMaterial);
  addBox(scene, [0.06, 1.68, 0.07], [-0.75, 1.69, -1.955], frameMaterial);
  addBox(scene, [0.06, 1.68, 0.07], [1.91, 1.69, -1.955], frameMaterial);
  addBox(scene, [0.055, 1.58, 0.055], [0.58, 1.69, -1.94], frameMaterial);

  const curtainGroup = new THREE.Group();
  curtainGroup.position.z = -1.91;
  scene.add(curtainGroup);
  const panelWidth = 0.845;
  const curtainColors = [0x999fa6, 0x92989f, 0x9da3aa];
  for (let i = 0; i < 3; i += 1) {
    const x = -0.265 + i * 0.85;
    const panelMaterial = curtainMaterial.clone();
    panelMaterial.color.setHex(curtainColors[i]);
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(panelWidth, 1.72), panelMaterial);
    curtain.position.set(x, 1.72, 0);
    curtain.receiveShadow = true;
    curtainGroup.add(curtain);
  }
  for (const seamX of [-0.69, 0.16, 1.01, 1.86]) {
    addBox(
      curtainGroup,
      [0.018, 1.7, 0.022],
      [seamX, 1.72, 0.014],
      material(0x7e858d, { roughness: 0.96 }),
      false,
      true,
    );
  }
  addBox(scene, [2.72, 0.07, 0.1], [0.58, 2.62, -1.89], frameMaterial);
  addBox(scene, [2.72, 0.07, 0.13], [0.58, 0.88, -1.88], frameMaterial);
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

  addBox(scene, [0.5, 0.3, 0.34], [0.05, 0.93, 0.55], material(0xf0f2f0, { roughness: 0.82 }));
  addBox(scene, [0.23, 0.08, 0.18], [0.62, 0.815, -0.22], material(0xb98b58, { roughness: 0.94 }));
  addBox(scene, [0.3, 0.045, 0.22], [0.22, 0.798, -0.19], material(0x252d37, { roughness: 0.74 }));
}

function createFoldingTable(x, z) {
  const top = material(0xe7edeb, { roughness: 0.68 });
  const leg = material(0x70777d, { metalness: 0.58, roughness: 0.45 });
  addBox(scene, [1.2, 0.055, 0.6], [x, 0.75, z], top);

  for (const legX of [x - 0.48, x + 0.48]) {
    for (const legZ of [z - 0.23, z + 0.23]) {
      addBox(scene, [0.035, 0.71, 0.035], [legX, 0.37, legZ], leg);
    }
  }

  const braceGeometry = new THREE.BoxGeometry(0.025, 0.7, 0.025);
  for (const side of [-1, 1]) {
    const brace = new THREE.Mesh(braceGeometry, leg);
    brace.position.set(x + side * 0.49, 0.38, z);
    brace.rotation.x = side * 0.42;
    brace.castShadow = true;
    scene.add(brace);
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

function buildPosters(textures) {
  createPoster({
    texture: textures.poster,
    width: 0.95,
    height: 0.633,
    position: [-1.35, 2.18, 1.966],
    rotationY: Math.PI,
    title: "Yaya Telescope Poster",
    kicker: "活动室海报",
    note: "中山大学天文学社望远镜主题海报",
    source: assetUrl("yaya-telescope-poster.webp"),
  });

  createPoster({
    texture: textures.flag,
    width: 0.88,
    height: 0.66,
    position: [-1.35, 1.14, 1.966],
    rotationY: Math.PI,
    title: "新社旗",
    kicker: "活动室照片",
    note: "摄于 2023-09-17 珠海校区社团联合游园会",
    source: assetUrl("club-flag.webp"),
  });

  createPoster({
    texture: textures.qifeng,
    width: 0.95,
    height: 0.633,
    position: [-0.25, 2.18, 1.966],
    rotationY: Math.PI,
    title: "七峰山背影",
    kicker: "观测活动照片",
    note: "七峰山观测活动中的星空与社员背影",
    source: assetUrl("qifeng-night.webp"),
  });

  createPoster({
    texture: textures.trappist,
    width: 0.55,
    height: 0.793,
    position: [-0.3, 1.22, 1.966],
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

  if (activeStop === 2) showTransientHint("点击柜门，或点击两本笔记", 2600);
  if (activeStop === 3) showTransientHint("点击海报可放大，点击大门返回 Astro", 2700);
  if (activeStop === 4) showTransientHint("点击新展墙上的海报可放大查看", 2500);
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
  openModal(interaction);
}

function openModal(interaction) {
  modalKicker.textContent = interaction.kicker || (interaction.kind === "pdf" ? "活动室藏书" : "活动室墙面");
  modalTitle.textContent = interaction.title;
  modalNote.textContent = interaction.note || "";
  modalOpen.href = interaction.url;
  modalOpen.textContent = interaction.kind === "pdf" ? "在新标签页阅读" : "打开原图";
  modalContent.replaceChildren();

  if (interaction.kind === "pdf") {
    const iframe = document.createElement("iframe");
    iframe.title = interaction.title;
    iframe.loading = "lazy";
    iframe.src = `${interaction.url}#view=FitH`;
    modalContent.append(iframe);
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
  canvas.focus({ preventScroll: true });
}

function toggleHelp(open) {
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
  if (modal.classList.contains("is-open")) return;
  if (/^[1-5]$/.test(event.key)) setCameraAtStop(Number(event.key) - 1);
  if (event.key === "ArrowLeft") setCameraAtStop(activeStop - 1);
  if (event.key === "ArrowRight") setCameraAtStop(activeStop + 1);
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

  cabinetDoors.forEach((door) => {
    const target = cabinetOpen ? door.userData.openDirection * (Math.PI / 2) : 0;
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
