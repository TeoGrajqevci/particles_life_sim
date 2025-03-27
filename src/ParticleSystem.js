import { EventEmitter } from './utils/EventEmitter.js';
import * as THREE from 'https://cdn.skypack.dev/three@0.144.0';

export class ParticleSystem extends EventEmitter {
  constructor(settings) {
    super();
    this.settings = settings;
    this.atoms = []; // Each atom: [x, y, z, vx, vy, vz, colorIndex, mesh]
    this.total_v = 0;
    this.grid = [];
    this.gridDims = { nx: 0, ny: 0, nz: 0 };
    
    this.sphereGeom = new THREE.SphereGeometry(2, 5, 5);
    this.meshMaterials = this.updateMeshMaterials();
  }
  
  updateMeshMaterials() {
    this.meshMaterials = this.settings.colors.map(color => new THREE.MeshBasicMaterial({
      color: new THREE.Color(color.value),
      side: THREE.DoubleSide
    }));
    return this.meshMaterials;
  }

  // Function to update color of existing particles
  updateParticleColors() {
    // Update materials
    this.meshMaterials = this.updateMeshMaterials();
    
    // Update existing particles
    for (let i = 0; i < this.atoms.length; i++) {
      const a = this.atoms[i];
      const colorIndex = a[6];
      if (a[7]) {
        a[7].material = this.meshMaterials[colorIndex];
      }
    }
  }

  randomX() {
    return this.settings.random() * (this.settings.dimensions - 100) + 50;
  }
  
  randomY() {
    return this.settings.random() * (this.settings.dimensions - 100) + 50;
  }
  
  // Create atoms for a given color index
  createAtoms(number, colorIndex) {
    for (let i = 0; i < number; i++) {
      const x = this.randomX(), y = this.randomY(), z = this.randomX();
      const atom = [x, y, z, 0, 0, 0, colorIndex, null];
      const mesh = new THREE.Mesh(this.sphereGeom, this.meshMaterials[colorIndex]);
      mesh.position.set(x, y, z);
      mesh.scale.set(this.settings.atoms.radius, this.settings.atoms.radius, this.settings.atoms.radius);
      this.settings.scene.atomsGroup.add(mesh);
      atom[7] = mesh;
      this.atoms.push(atom);
    }
  }
  
  randomAtoms(number_per_color, clear_previous) {
    if (clear_previous) {
      this.atoms.length = 0;
      while (this.settings.scene.atomsGroup.children.length) {
        this.settings.scene.atomsGroup.remove(this.settings.scene.atomsGroup.children[0]);
      }
    }
    for (let c = 0; c < this.settings.colors.length; c++) {
      this.createAtoms(number_per_color, c);
    }
  }
  
  updateAtomRadius(radius) {
    for (const mesh of this.settings.scene.atomsGroup.children) {
      mesh.scale.set(radius, radius, radius);
    }
  }
  
  removeAtomsByColorIndex(colorIndex) {
    const atomsToKeep = [];
    const meshesToRemove = [];
    
    for (let i = 0; i < this.atoms.length; i++) {
      if (this.atoms[i][6] === colorIndex) {
        // Store mesh for removal
        if (this.atoms[i][7]) {
          meshesToRemove.push(this.atoms[i][7]);
        }
      } else {
        atomsToKeep.push(this.atoms[i]);
      }
    }
    
    // Remove meshes from the scene
    for (const mesh of meshesToRemove) {
      this.settings.scene.atomsGroup.remove(mesh);
    }
    
    // Update atoms array
    this.atoms = atomsToKeep;
  }
  
  updateGrid() {
    const cellSize = Math.sqrt(this.settings.cutOff);
    // Offset grid to avoid fixed alignment
    const offset = cellSize / 2;
    this.gridDims.nx = Math.ceil((this.settings.dimensions + offset) / cellSize);
    this.gridDims.ny = this.gridDims.nx;
    this.gridDims.nz = this.gridDims.nx;
    const nCells = this.gridDims.nx * this.gridDims.ny * this.gridDims.nz;
    this.grid = new Array(nCells);
    for (let i = 0; i < nCells; i++) this.grid[i] = [];
    // Place each atom in its cell with offset
    for (let i = 0; i < this.atoms.length; i++) {
      const a = this.atoms[i];
      let cx = Math.floor((a[0] + offset) / cellSize);
      let cy = Math.floor((a[1] + offset) / cellSize);
      let cz = Math.floor((a[2] + offset) / cellSize);
      // Clamp indices
      cx = Math.min(cx, this.gridDims.nx - 1);
      cy = Math.min(cy, this.gridDims.ny - 1);
      cz = Math.min(cz, this.gridDims.nz - 1);
      const cellIndex = cx + cy * this.gridDims.nx + cz * this.gridDims.nx * this.gridDims.ny;
      this.grid[cellIndex].push(i);
    }
  }
  
  applyRules() {
    this.total_v = 0;
    const cellSize = Math.sqrt(this.settings.cutOff);
    this.updateGrid();
    // Loop through each atom and only check atoms in neighboring grid cells.
    for (let i = 0; i < this.atoms.length; i++) {
      let fx = 0, fy = 0, fz = 0;
      const a = this.atoms[i];
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
            if (ncx < 0 || ncx >= this.gridDims.nx ||
                ncy < 0 || ncy >= this.gridDims.ny ||
                ncz < 0 || ncz >= this.gridDims.nz) continue;
            const cellIndex = ncx + ncy * this.gridDims.nx + ncz * this.gridDims.nx * this.gridDims.ny;
            const cell = this.grid[cellIndex];
            for (let k = 0; k < cell.length; k++) {
              const j = cell[k];
              if (j === i) continue;
              const b = this.atoms[j];
              const g = this.settings.rulesArray[aColor][b[6]];
              const dx_ = ax - b[0];
              const dy_ = ay - b[1];
              const dz_ = az - b[2];
              const dist2 = dx_ * dx_ + dy_ * dy_ + dz_ * dz_;
              if (dist2 < this.settings.cutOff && dist2 > 0) {
                const invDist = 1 / Math.sqrt(dist2);
                const F = g * invDist;
                fx += F * dx_;
                fy += F * dy_;
                fz += F * dz_;
              }
            }
          }
        }
      }
      
      // Update velocity (with viscosity damping).
      const vmix = 1 - this.settings.viscosity;
      a[3] = a[3] * vmix + fx * this.settings.time_scale;
      a[4] = a[4] * vmix + fy * this.settings.time_scale;
      a[5] = a[5] * vmix + fz * this.settings.time_scale;
      
      this.total_v += Math.abs(a[3]) + Math.abs(a[4]) + Math.abs(a[5]);
    }
    
    // Update positions and handle boundaries.
    for (let i = 0; i < this.atoms.length; i++) {
      const a = this.atoms[i];
      a[0] += a[3];
      a[1] += a[4];
      a[2] += a[5];
      // Check each dimension.
      for (let d = 0; d < 3; d++) {
        if (a[d] < 0) {
          a[d] = -a[d];
          a[d + 3] *= -1;
        } else if (a[d] >= this.settings.dimensions) {
          a[d] = 2 * this.settings.dimensions - a[d];
          a[d + 3] *= -1;
        }
      }
      // Update mesh position.
      a[7].position.set(a[0], a[1], a[2]);
    }
    this.total_v /= this.atoms.length;
    
    return this.total_v;
  }
}