import { EventEmitter } from './utils/EventEmitter.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.17/+esm';

// Add a capitalise() method to String
Object.defineProperty(String.prototype, 'capitalise', {
  value: function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
  },
  enumerable: false
});

export class GUIManager extends EventEmitter {
  constructor(settings, ruleManager, particleSystem, sceneManager) {
    super();
    this.settings = settings;
    this.ruleManager = ruleManager;
    this.particleSystem = particleSystem;
    this.sceneManager = sceneManager;
    this.gui = null;
    
    // Bind references to methods that will be used as callbacks
    this.addNewColor = this.addNewColor.bind(this);
    this.removeColor = this.removeColor.bind(this);
  }

  setupGUI() {
    if (this.gui) {
      this.gui.destroy();
    }
    
    this.gui = new GUI({ title: 'Particle Life Config' });
    this.settings.gui = this.gui;
    
    // Config Folder
    const configFolder = this.gui.addFolder('Config');
    configFolder.add({ reset: () => this.emit('reset') }, 'reset').name('Reset');
    configFolder.add({ randomRules: () => {
      this.ruleManager.randomRules();
      this.particleSystem.randomAtoms(this.settings.atoms.count, true);
      this.updateGUIDisplay();
    }}, 'randomRules').name('Random Rules');
    
    configFolder.add({ symmetricRules: () => {
      this.ruleManager.symmetricRules();
      this.particleSystem.randomAtoms(this.settings.atoms.count, true);
      this.updateGUIDisplay();
    }}, 'symmetricRules').name('Symmetric Rules');
    
    configFolder.add(this.settings, 'seed').name('Seed').listen();
    configFolder.add(this.settings, 'fps').name('FPS - (Live)').listen().disable();
    configFolder.add(this.settings.atoms, 'count', 1, 2000, 1).name('Atoms per-color')
      .listen().onFinishChange(v => this.particleSystem.randomAtoms(v, true));
    configFolder.add(this.settings, 'dimensions', 200, 5000, 100).name('Cube Dimensions')
      .listen().onFinishChange(v => this.emit('reset'));
    configFolder.add(this.settings, 'time_scale', 0.1, 5, 0.01).name('Time Scale').listen();
    configFolder.add(this.settings, 'cutOff', 1, 100000 * 2, 50).name('Max Distance').listen();
    configFolder.add(this.settings, 'viscosity', 0.1, 1.99, 0.1).name('Viscosity').listen();
    configFolder.add(this.settings, 'pulseDuration', 1, 100, 1).name('Click Pulse Duration').listen();

    // Drawings Folder
    const drawingsFolder = this.gui.addFolder('Drawings');
    drawingsFolder.add(this.settings.atoms, 'radius', 0.1, 10, 0.1).name('Radius')
      .listen().onFinishChange(v => {
        this.particleSystem.updateAtomRadius(v);
      });
      
    // Background settings
    const backgroundFolder = drawingsFolder.addFolder('Background');
    backgroundFolder.add(this.settings.drawings.background, 'active').name('Show Background')
      .onChange(() => this.sceneManager.updateSceneColors());
    backgroundFolder.addColor(this.settings.drawings.background, 'color').name('Background Color')
      .onChange(() => this.sceneManager.updateSceneColors());
      
    // Grid settings
    const gridFolder = drawingsFolder.addFolder('Grid');
    gridFolder.add(this.settings.drawings.grid, 'active').name('Show Grid')
      .onChange(() => {
        if (this.settings.scene.gridHelper) {
          this.settings.scene.gridHelper.visible = this.settings.drawings.grid.active;
        }
      });
    gridFolder.addColor(this.settings.drawings.grid, 'colorCenterLine').name('Center Line Color')
      .onChange(() => this.sceneManager.addGridHelper());
    gridFolder.addColor(this.settings.drawings.grid, 'colorGrid').name('Grid Color')
      .onChange(() => this.sceneManager.addGridHelper());
    
    // Container settings
    const containerFolder = drawingsFolder.addFolder('Container');
    containerFolder.addColor(this.settings.drawings.container, 'color').name('Container Color')
      .onChange(() => this.sceneManager.updateSceneColors());
      
    // Colors settings
    const colorsFolder = drawingsFolder.addFolder('Particles Colors');
    
    // Add buttons to add/remove colors
    colorsFolder.add({ addColor: this.addNewColor }, 'addColor').name('Add New Color');
    colorsFolder.add({ removeColor: this.removeColor }, 'removeColor').name('Remove Last Color');
    
    for (let i = 0; i < this.settings.colors.length; i++) {
      const colorController = colorsFolder.addFolder(`Color ${i+1}`);
      colorController.add(this.settings.colors[i], 'name').name('Name')
        .onFinishChange((newName) => {
          const oldName = this.settings.colors[i].name;
          // Update color name in rules structure before updating GUI
          this.ruleManager.updateColorName(oldName, newName);
          this.updateGUIDisplay();
        });
      colorController.addColor(this.settings.colors[i], 'value').name('Color')
        .onChange(() => {
          this.particleSystem.updateParticleColors();
        });
    }
      
    // Colors / Rules Folders
    for (const atomColor of this.settings.colors) {
      const colorName = atomColor.name;
      const colorFolder = this.gui.addFolder(`Rules: ${colorName.capitalise()}`);
      
      // Make sure the rules object structure is complete
      if (!this.settings.rules[colorName]) {
        this.settings.rules[colorName] = {};
      }
      
      for (const ruleColor of this.settings.colors) {
        const ruleName = ruleColor.name;
        
        // Make sure each rule exists
        if (this.settings.rules[colorName][ruleName] === undefined) {
          this.settings.rules[colorName][ruleName] = 0;
        }
        
        colorFolder.add(this.settings.rules[colorName], ruleName, -1, 1, 0.001)
          .name(`${colorName.capitalise()} x ${ruleName.capitalise()}`)
          .listen().onFinishChange(() => this.ruleManager.flattenRules());
      }
    }
  }

  updateGUIDisplay() {
    this.setupGUI();
  }

  addNewColor() {
    // Generate a random color and name
    const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16);
    const newColorName = `color${this.settings.colors.length + 1}`;
    
    // Add to colors array
    this.settings.colors.push({ name: newColorName, value: randomColor });
    
    // Update rules
    for (const color of this.settings.colors) {
      if (!this.settings.rules[color.name]) {
        this.settings.rules[color.name] = {};
      }
      
      // Add rule for new color interacting with existing colors
      if (color.name === newColorName) {
        for (const otherColor of this.settings.colors) {
          this.settings.rules[newColorName][otherColor.name] = this.settings.random() * 2 - 1;
        }
      } else {
        // Add rules for existing colors interacting with new color
        this.settings.rules[color.name][newColorName] = this.settings.random() * 2 - 1;
      }
    }
    
    // Flatten rules to update rulesArray
    this.ruleManager.flattenRules();
    
    // Create new atoms for this color
    this.particleSystem.createAtoms(this.settings.atoms.count, this.settings.colors.length - 1);
    
    // Update GUI
    this.updateGUIDisplay();
  }

  removeColor() {
    // Don't remove if there's only one color left
    if (this.settings.colors.length <= 1) {
      console.warn("Cannot remove the last color");
      return;
    }
    
    const colorToRemove = this.settings.colors.pop();
    
    // Remove rules for this color
    if (this.settings.rules[colorToRemove.name]) {
      delete this.settings.rules[colorToRemove.name];
    }
    
    // Remove references to this color in other rules
    for (const color in this.settings.rules) {
      if (this.settings.rules[color][colorToRemove.name]) {
        delete this.settings.rules[color][colorToRemove.name];
      }
    }
    
    // Flatten rules to update rulesArray
    this.ruleManager.flattenRules();
    
    // Remove atoms of this color
    this.particleSystem.removeAtomsByColorIndex(this.settings.colors.length); // The index that was just removed
    
    // Update GUI
    this.updateGUIDisplay();
  }
}