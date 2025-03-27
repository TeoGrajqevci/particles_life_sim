import './style.css';
import { Settings } from './Settings.js';
import { RuleManager } from './RuleManager.js';
import { ParticleSystem } from './ParticleSystem.js';
import { SceneManager } from './SceneManager.js';
import { GUIManager } from './GUIManager.js';

class ParticleLifeSimulation {
  constructor() {
    this.settings = new Settings();
    this.ruleManager = new RuleManager(this.settings);
    this.particleSystem = new ParticleSystem(this.settings);
    this.sceneManager = new SceneManager(this.settings);
    this.guiManager = new GUIManager(this.settings, this.ruleManager, this.particleSystem, this.sceneManager);
    
    this.lastT = Date.now();
    
    this.initialize();
  }
  
  initialize() {
    // Load settings from URL
    this.settings.loadSeedFromUrl();
    
    // Generate initial rules
    this.ruleManager.randomRules();
    
    // Make sure all color rules exist before starting
    for (const color of this.settings.colors) {
      if (!this.settings.rules[color.name]) {
        this.settings.rules[color.name] = {};
      }
      for (const color2 of this.settings.colors) {
        if (this.settings.rules[color.name][color2.name] === undefined) {
          this.settings.rules[color.name][color2.name] = 0;
        }
      }
    }
    
    this.ruleManager.flattenRules();
    
    // Initialize the scene
    this.sceneManager.initScene();
    
    // Create atoms
    this.particleSystem.randomAtoms(this.settings.atoms.count, true);
    
    // Setup GUI
    this.guiManager.setupGUI();
    
    // Open by default
    // this.settings.gui.open();
    
    // Event listeners
    this.guiManager.on('reset', () => {
      this.sceneManager.resetScene(this.particleSystem);
    });
    
    // Start animation loop
    this.update();
  }
  
  updateParams() {
    // Update FPS
    const curT = Date.now();
    if (curT > this.lastT) {
      const new_fps = 1000 / (curT - this.lastT);
      this.settings.fps = Math.round(this.settings.fps * 0.8 + new_fps * 0.2);
      this.lastT = curT;
    }
    
    // Adapt time_scale based on activity.
    if (this.particleSystem.total_v > 30 && this.settings.time_scale > 5) {
      this.settings.time_scale /= 1.1;
    }
  }
  
  update() {
    // Apply physics rules to atoms
    this.particleSystem.applyRules();
    
    // Render the scene
    this.sceneManager.render();
    
    // Update parameters (FPS, etc)
    this.updateParams();
    
    // Continue animation loop
    requestAnimationFrame(this.update.bind(this));
  }
}

// Start the simulation
console.log('Initializing Particle Life Simulation');
const simulation = new ParticleLifeSimulation();
console.log('Settings:', simulation.settings);
