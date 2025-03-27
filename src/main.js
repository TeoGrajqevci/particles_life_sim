import './style.css';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.17/+esm';
import * as THREE from 'https://cdn.skypack.dev/three@0.144.0';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.132.2/examples/jsm/controls/OrbitControls.js';

// ──────────────────────────────
// GLOBAL SETTINGS & STATE
// ──────────────────────────────
const settings = {
  seed: 148624312259077,
  fps: 0,
  dimensions: 1000,
  atoms: {
    count: 600, // per color
    radius: 0.7
  },
  drawings: {
    lines: false,       // (Optional) draw interaction lines
    circle: false,      // (Optional) draw atoms as circles
    background: {
      active: true,
      color: '#000000'
    },
    grid: {
      active: true,
      colorCenterLine: '#444444',
      colorGrid: '#222222'
    },
    container: {
      color: '#000000'
    }
  },
  rules: {},
  rulesArray: [],
  colors: [
    { name: 'green', value: '#00ff00' },
    { name: 'red', value: '#ff0000' },
    { name: 'yellow', value: '#ffff00' },
    { name: 'blue', value: '#0000ff' }
  ],
  time_scale: 0.25,
  cutOff: 20000 * 2,    // cutoff squared (i.e. only if distance^2 < cutOff)
  viscosity: 1.7,
  pulseDuration: 1,
  reset: () => resetScene(),
  randomRules: () => {
    randomRules();
    randomAtoms(settings.atoms.count, true);
    updateGUIDisplay();
  },
  symmetricRules: () => {
    symmetricRules();
    randomAtoms(settings.atoms.count, true);
    updateGUIDisplay();
  },
  gui: null,
  scene: {
    camera: null,
    scene: null,
    renderer: null,
    controls: null,
    atomsGroup: null,
    gridHelper: null
  }
};

// Global simulation state
let atoms = []; // Each atom: [x, y, z, vx, vy, vz, colorIndex, mesh]
let total_v = 0;
let lastT = Date.now();
let pulse = 0, pulse_x = 0, pulse_y = 0;

// ──────────────────────────────
// UTILITY FUNCTIONS
// ──────────────────────────────

// Add a capitalise() method to String
Object.defineProperty(String.prototype, 'capitalise', {
  value: function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
  },
  enumerable: false
});

// Seedable random generator (Mulberry32)
function mulberry32() {
  let t = settings.seed += 0x6D2B79F5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Load seed from URL hash if present
function loadSeedFromUrl() {
  const hash = window.location.hash;
  if (hash && hash[0] === '#') {
    const param = Number(hash.substr(1));
    if (isFinite(param)) {
      settings.seed = param;
      console.log("Using seed " + settings.seed);
    }
  }
}

// Function to update color name in the rules structure
function updateColorName(oldName, newName) {
  // Skip if the name didn't actually change
  if (oldName === newName) return;
  
  console.log(`Renaming color: ${oldName} -> ${newName}`);
  
  // Create entry for the new name if it doesn't exist
  if (!settings.rules[newName]) {
    settings.rules[newName] = {};
  }
  
  // Copy rules from old name to new name
  for (const color of settings.colors) {
    const targetName = color.name;
    
    // Copy rule: oldName -> targetName becomes newName -> targetName
    if (settings.rules[oldName] && settings.rules[oldName][targetName] !== undefined) {
      settings.rules[newName][targetName] = settings.rules[oldName][targetName];
    }
    
    // Copy rule: targetName -> oldName becomes targetName -> newName
    if (settings.rules[targetName] && settings.rules[targetName][oldName] !== undefined) {
      if (!settings.rules[targetName][newName]) {
        settings.rules[targetName][newName] = settings.rules[targetName][oldName];
      }
    }
  }
  
  // Remove old name entry
  delete settings.rules[oldName];
  
  // Update all rules to use the new name instead of the old name
  for (const color of settings.colors) {
    if (settings.rules[color.name] && settings.rules[color.name][oldName] !== undefined) {
      settings.rules[color.name][newName] = settings.rules[color.name][oldName];
      delete settings.rules[color.name][oldName];
    }
  }
  
  // Update flattened rules array
  flattenRules();
}

// Function to add a new color
function addNewColor() {
  // Generate a random color and name
  const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16);
  const newColorName = `color${settings.colors.length + 1}`;
  
  // Add to colors array
  settings.colors.push({ name: newColorName, value: randomColor });
  
  // Update rules
  for (const color of settings.colors) {
    if (!settings.rules[color.name]) {
      settings.rules[color.name] = {};
    }
    
    // Add rule for new color interacting with existing colors
    if (color.name === newColorName) {
      for (const otherColor of settings.colors) {
        settings.rules[newColorName][otherColor.name] = mulberry32() * 2 - 1;
      }
    } else {
      // Add rules for existing colors interacting with new color
      settings.rules[color.name][newColorName] = mulberry32() * 2 - 1;
    }
  }
  
  // Flatten rules to update rulesArray
  flattenRules();
  
  // Create new atoms for this color
  createAtoms(settings.atoms.count, settings.colors.length - 1);
  
  // Update GUI
  updateGUIDisplay();
}

// Function to remove the last color
function removeColor() {
  // Don't remove if there's only one color left
  if (settings.colors.length <= 1) {
    console.warn("Cannot remove the last color");
    return;
  }
  
  const colorToRemove = settings.colors.pop();
  
  // Remove rules for this color
  if (settings.rules[colorToRemove.name]) {
    delete settings.rules[colorToRemove.name];
  }
  
  // Remove references to this color in other rules
  for (const color in settings.rules) {
    if (settings.rules[color][colorToRemove.name]) {
      delete settings.rules[color][colorToRemove.name];
    }
  }
  
  // Flatten rules to update rulesArray
  flattenRules();
  
  // Remove atoms of this color
  const colorIndex = settings.colors.length; // The index that was just removed
  const atomsToKeep = [];
  const meshesToRemove = [];
  
  for (let i = 0; i < atoms.length; i++) {
    if (atoms[i][6] === colorIndex) {
      // Store mesh for removal
      if (atoms[i][7]) {
        meshesToRemove.push(atoms[i][7]);
      }
    } else {
      atomsToKeep.push(atoms[i]);
    }
  }
  
  // Remove meshes from the scene
  for (const mesh of meshesToRemove) {
    settings.scene.atomsGroup.remove(mesh);
  }
  
  // Update atoms array
  atoms = atomsToKeep;
  
  // Update GUI
  updateGUIDisplay();
}

// ──────────────────────────────
// RULES FUNCTIONS
// ──────────────────────────────
function randomRules() {
  if (!isFinite(settings.seed)) settings.seed = 0xcafecafe;
  console.log("Seed=" + settings.seed);
  window.location.hash = "#" + settings.seed;
  for (const color of settings.colors) {
    settings.rules[color.name] = {};
    for (const color2 of settings.colors) {
      settings.rules[color.name][color2.name] = mulberry32() * 2 - 1;
    }
  }
  console.log(JSON.stringify(settings.rules));
  flattenRules();
}

function symmetricRules() {
  for (const i of settings.colors) {
    for (const j of settings.colors) {
      if (j.name < i.name) {
        const v = 0.5 * (settings.rules[i.name][j.name] + settings.rules[j.name][i.name]);
        settings.rules[i.name][j.name] = settings.rules[j.name][i.name] = v;
      }
    }
  }
  console.log(JSON.stringify(settings.rules));
  flattenRules();
}

function flattenRules() {
  settings.rulesArray = [];
  for (let i = 0; i < settings.colors.length; i++) {
    const ruleRow = [];
    for (let j = 0; j < settings.colors.length; j++) {
      ruleRow.push(settings.rules[settings.colors[i].name][settings.colors[j].name]);
    }
    settings.rulesArray.push(ruleRow);
  }
}

// ──────────────────────────────
// SCENE & GUI SETUP
// ──────────────────────────────
function addGridHelper() {
  if (settings.scene.gridHelper) {
    settings.scene.gridHelper.parent.remove(settings.scene.gridHelper);
  }
  settings.scene.gridHelper = new THREE.GridHelper(
    settings.dimensions, 
    10, 
    new THREE.Color(settings.drawings.grid.colorCenterLine), 
    new THREE.Color(settings.drawings.grid.colorGrid)
  );
  settings.scene.gridHelper.position.set(settings.dimensions / 2, 0, settings.dimensions / 2);
  settings.scene.gridHelper.visible = settings.drawings.grid.active;
  settings.scene.scene.add(settings.scene.gridHelper);
}

function resetScene() {
  randomAtoms(settings.atoms.count, true);
  settings.scene.controls.target.set(settings.dimensions / 2, settings.dimensions / 2, settings.dimensions / 2);
  addGridHelper();
  updateSceneColors();
}

function updateSceneColors() {
  // Update background color
  if (settings.drawings.background.active) {
    settings.scene.scene.background = new THREE.Color(settings.drawings.background.color);
  } else {
    settings.scene.scene.background = null;
  }
  
  // Update container color (renderer clear color)
  settings.scene.renderer.setClearColor(settings.drawings.container.color);
  
  // Update grid visibility
  if (settings.scene.gridHelper) {
    settings.scene.gridHelper.visible = settings.drawings.grid.active;
  }
}

function initScene() {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const aspect = window.innerWidth / window.innerHeight;
  settings.scene.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 50000);
  settings.scene.camera.position.set(settings.dimensions * 2, settings.dimensions * 2, settings.dimensions * 2);
  settings.scene.scene = new THREE.Scene();

  settings.scene.atomsGroup = new THREE.Group();
  settings.scene.scene.add(settings.scene.atomsGroup);

  settings.scene.renderer = new THREE.WebGLRenderer();
  settings.scene.renderer.setPixelRatio(window.devicePixelRatio);
  settings.scene.renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(settings.scene.renderer.domElement);

  settings.scene.controls = new OrbitControls(settings.scene.camera, settings.scene.renderer.domElement);
  settings.scene.controls.target.set(settings.dimensions / 2, settings.dimensions / 2, settings.dimensions / 2);
  settings.scene.controls.update();

  addGridHelper();
  updateSceneColors();
  
  window.addEventListener('resize', () => {
    settings.scene.camera.aspect = window.innerWidth / window.innerHeight;
    settings.scene.camera.updateProjectionMatrix();
    settings.scene.renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function updateGUIDisplay() {
  console.log('gui', settings.gui);
  settings.gui.destroy();
  setupGUI();
}

function setupGUI() {
  settings.gui = new GUI({ title: 'Particle Life Config' });
  // Config Folder
  const configFolder = settings.gui.addFolder('Config');
  configFolder.add(settings, 'reset').name('Reset');
  configFolder.add(settings, 'randomRules').name('Random Rules');
  configFolder.add(settings, 'symmetricRules').name('Symmetric Rules');
  configFolder.add(settings, 'seed').name('Seed').listen();
  configFolder.add(settings, 'fps').name('FPS - (Live)').listen().disable();
  configFolder.add(settings.atoms, 'count', 1, 2000, 1).name('Atoms per-color')
    .listen().onFinishChange(v => randomAtoms(v, true));
  configFolder.add(settings, 'dimensions', 200, 5000, 100).name('Cube Dimensions')
    .listen().onFinishChange(v => settings.reset());
  configFolder.add(settings, 'time_scale', 0.1, 5, 0.01).name('Time Scale').listen();
  configFolder.add(settings, 'cutOff', 1, 100000 * 2, 50).name('Max Distance').listen();
  configFolder.add(settings, 'viscosity', 0.1, 2, 0.1).name('Viscosity').listen();
  configFolder.add(settings, 'pulseDuration', 1, 100, 1).name('Click Pulse Duration').listen();

  // Drawings Folder
  const drawingsFolder = settings.gui.addFolder('Drawings');
  drawingsFolder.add(settings.atoms, 'radius', 0.1, 10, 0.1).name('Radius')
    .listen().onFinishChange(v => {
      for (const mesh of settings.scene.atomsGroup.children) {
        mesh.scale.set(v, v, v);
      }
    });
    
  // Background settings
  const backgroundFolder = drawingsFolder.addFolder('Background');
  backgroundFolder.add(settings.drawings.background, 'active').name('Show Background')
    .onChange(updateSceneColors);
  backgroundFolder.addColor(settings.drawings.background, 'color').name('Background Color')
    .onChange(updateSceneColors);
    
  // Grid settings
  const gridFolder = drawingsFolder.addFolder('Grid');
  gridFolder.add(settings.drawings.grid, 'active').name('Show Grid')
    .onChange(() => {
      if (settings.scene.gridHelper) {
        settings.scene.gridHelper.visible = settings.drawings.grid.active;
      }
    });
  gridFolder.addColor(settings.drawings.grid, 'colorCenterLine').name('Center Line Color')
    .onChange(() => addGridHelper());
  gridFolder.addColor(settings.drawings.grid, 'colorGrid').name('Grid Color')
    .onChange(() => addGridHelper());
  
  // Container settings
  const containerFolder = drawingsFolder.addFolder('Container');
  containerFolder.addColor(settings.drawings.container, 'color').name('Container Color')
    .onChange(updateSceneColors);
    
  // Colors settings
  const colorsFolder = drawingsFolder.addFolder('Particles Colors');
  
  // Add buttons to add/remove colors
  colorsFolder.add({ addColor: addNewColor }, 'addColor').name('Add New Color');
  colorsFolder.add({ removeColor: removeColor }, 'removeColor').name('Remove Last Color');
  
  for (let i = 0; i < settings.colors.length; i++) {
    const colorController = colorsFolder.addFolder(`Color ${i+1}`);
    colorController.add(settings.colors[i], 'name').name('Name')
      .onFinishChange((newName) => {
        const oldName = settings.colors[i].name;
        // Update color name in rules structure before updating GUI
        updateColorName(oldName, newName);
        updateGUIDisplay();
      });
    colorController.addColor(settings.colors[i], 'value').name('Color')
      .onChange(() => {
        updateParticleColors();
      });
  }
    
  // Colors / Rules Folders
  for (const atomColor of settings.colors) {
    const colorName = atomColor.name;
    const colorFolder = settings.gui.addFolder(`Rules: ${colorName.capitalise()}`);
    
    // Make sure the rules object structure is complete
    if (!settings.rules[colorName]) {
      settings.rules[colorName] = {};
    }
    
    for (const ruleColor of settings.colors) {
      const ruleName = ruleColor.name;
      
      // Make sure each rule exists
      if (settings.rules[colorName][ruleName] === undefined) {
        settings.rules[colorName][ruleName] = 0;
      }
      
      colorFolder.add(settings.rules[colorName], ruleName, -1, 1, 0.001)
        .name(`${colorName.capitalise()} x ${ruleName.capitalise()}`)
        .listen().onFinishChange(v => flattenRules());
    }
  }
}

// ──────────────────────────────
// ATOMS & GEOMETRY
// ──────────────────────────────
const randomX = () => mulberry32() * (settings.dimensions - 100) + 50;
const randomY = () => mulberry32() * (settings.dimensions - 100) + 50;

const sphereGeom = new THREE.SphereGeometry(2, 5, 5);
const updateMeshMaterials = () => {
  return settings.colors.map(color => new THREE.MeshBasicMaterial({
    color: new THREE.Color(color.value),
    side: THREE.DoubleSide
  }));
};
let meshMaterials = updateMeshMaterials();

// Function to update color of existing particles
function updateParticleColors() {
  // Update materials
  meshMaterials = updateMeshMaterials();
  
  // Update existing particles
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    const colorIndex = a[6];
    if (a[7]) {
      a[7].material = meshMaterials[colorIndex];
    }
  }
}

// Create atoms for a given color index
const createAtoms = (number, colorIndex) => {
  for (let i = 0; i < number; i++) {
    const x = randomX(), y = randomY(), z = randomX();
    const atom = [x, y, z, 0, 0, 0, colorIndex, null];
    const mesh = new THREE.Mesh(sphereGeom, meshMaterials[colorIndex]);
    mesh.position.set(x, y, z);
    mesh.scale.set(settings.atoms.radius, settings.atoms.radius, settings.atoms.radius);
    settings.scene.atomsGroup.add(mesh);
    atom[7] = mesh;
    atoms.push(atom);
  }
};

function randomAtoms(number_per_color, clear_previous) {
  if (clear_previous) {
    atoms.length = 0;
    while (settings.scene.atomsGroup.children.length) {
      settings.scene.atomsGroup.remove(settings.scene.atomsGroup.children[0]);
    }
  }
  for (let c = 0; c < settings.colors.length; c++) {
    createAtoms(number_per_color, c);
  }
}

// ──────────────────────────────
// ACCELERATION STRUCTURE: GRID SETUP
// ──────────────────────────────
let grid = [];
let gridDims = { nx: 0, ny: 0, nz: 0 };

function updateGrid() {
  const cellSize = Math.sqrt(settings.cutOff);
  gridDims.nx = Math.ceil(settings.dimensions / cellSize);
  gridDims.ny = gridDims.nx;
  gridDims.nz = gridDims.nx;
  const nCells = gridDims.nx * gridDims.ny * gridDims.nz;
  grid = new Array(nCells);
  for (let i = 0; i < nCells; i++) grid[i] = [];
  // Place each atom into its grid cell.
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    let cx = Math.floor(a[0] / cellSize);
    let cy = Math.floor(a[1] / cellSize);
    let cz = Math.floor(a[2] / cellSize);
    // Clamp indices
    cx = Math.min(cx, gridDims.nx - 1);
    cy = Math.min(cy, gridDims.ny - 1);
    cz = Math.min(cz, gridDims.nz - 1);
    const cellIndex = cx + cy * gridDims.nx + cz * gridDims.nx * gridDims.ny;
    grid[cellIndex].push(i);
  }
}

// ──────────────────────────────
// PHYSICS: APPLY RULES USING THE GRID
// ──────────────────────────────
function applyRules() {
  total_v = 0;
  const cellSize = Math.sqrt(settings.cutOff);
  updateGrid();
  // Loop through each atom and only check atoms in neighboring grid cells.
  for (let i = 0; i < atoms.length; i++) {
    let fx = 0, fy = 0, fz = 0;
    const a = atoms[i];
    const ax = a[0], ay = a[1], az = a[2];
    const aColor = a[6];
    const cx = Math.floor(ax / cellSize);
    const cy = Math.floor(ay / cellSize);
    const cz = Math.floor(az / cellSize);
    // Check 3x3x3 neighbor cells.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const ncx = cx + dx, ncy = cy + dy, ncz = cz + dz;
          if (ncx < 0 || ncx >= gridDims.nx ||
              ncy < 0 || ncy >= gridDims.ny ||
              ncz < 0 || ncz >= gridDims.nz) continue;
          const cellIndex = ncx + ncy * gridDims.nx + ncz * gridDims.nx * gridDims.ny;
          const cell = grid[cellIndex];
          for (let k = 0; k < cell.length; k++) {
            const j = cell[k];
            if (j === i) continue;
            const b = atoms[j];
            const g = settings.rulesArray[aColor][b[6]];
            const dx_ = ax - b[0];
            const dy_ = ay - b[1];
            const dz_ = az - b[2];
            const dist2 = dx_ * dx_ + dy_ * dy_ + dz_ * dz_;
            if (dist2 < settings.cutOff && dist2 > 0) {
              const invDist = 1 / Math.sqrt(dist2);
              const F = g * invDist;
              fx += F * dx_;
              fy += F * dy_;
              fz += F * dz_;
              // (Optional) Draw lines if settings.drawings.lines is enabled.
            }
          }
        }
      }
    }
    // Apply pulse if active.
    if (pulse !== 0) {
      const dx_ = ax - pulse_x;
      const dy_ = ay - pulse_y;
      const d2 = dx_ * dx_ + dy_ * dy_;
      if (d2 > 0) {
        const F = (100 * pulse) / (d2 * settings.time_scale);
        fx += F * dx_;
        fy += F * dy_;
      }
    }
    // Update velocity (with viscosity damping).
    const vmix = 1 - settings.viscosity;
    a[3] = a[3] * vmix + fx * settings.time_scale;
    a[4] = a[4] * vmix + fy * settings.time_scale;
    a[5] = a[5] * vmix + fz * settings.time_scale;
    total_v += Math.abs(a[3]) + Math.abs(a[4]) + Math.abs(a[5]);
  }
  // Update positions and handle boundaries.
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    a[0] += a[3];
    a[1] += a[4];
    a[2] += a[5];
    // Check each dimension.
    for (let d = 0; d < 3; d++) {
      if (a[d] < 0) {
        a[d] = -a[d];
        a[d + 3] *= -1;
      } else if (a[d] >= settings.dimensions) {
        a[d] = 2 * settings.dimensions - a[d];
        a[d + 3] *= -1;
      }
    }
    // Update mesh position.
    a[7].position.set(a[0], a[1], a[2]);
  }
  total_v /= atoms.length;
}

// ──────────────────────────────
// MAIN LOOP & PARAMETER UPDATES
// ──────────────────────────────
function updateParams() {
  // Update FPS
  const curT = Date.now();
  if (curT > lastT) {
    const new_fps = 1000 / (curT - lastT);
    settings.fps = Math.round(settings.fps * 0.8 + new_fps * 0.2);
    lastT = curT;
  }
  // Adapt time_scale based on activity.
  if (total_v > 30 && settings.time_scale > 5) settings.time_scale /= 1.1;
  if (pulse > 0) pulse -= 1;
}

function update() {
  applyRules();
  settings.scene.controls.update();
  settings.scene.renderer.render(settings.scene.scene, settings.scene.camera);
  updateParams();
  requestAnimationFrame(update);
}

// ──────────────────────────────
// INITIALISATION
// ──────────────────────────────
loadSeedFromUrl();
randomRules();
// Make sure all color rules exist before starting
for (const color of settings.colors) {
  if (!settings.rules[color.name]) {
    settings.rules[color.name] = {};
  }
  for (const color2 of settings.colors) {
    if (settings.rules[color.name][color2.name] === undefined) {
      settings.rules[color.name][color2.name] = 0;
    }
  }
}
flattenRules();
initScene();
randomAtoms(settings.atoms.count, true);
setupGUI();
settings.gui.close();
console.log('settings', settings);
update();
