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
    this.guiStyle = undefined;
    
    // Bind references to methods that will be used as callbacks
    this.addNewColor = this.addNewColor.bind(this);
    this.removeColor = this.removeColor.bind(this);
  }

  setupGUI() {
    if (this.gui) {
      this.gui.destroy();
    }
    
    // Create GUI
    this.gui = new GUI({ 
      title: 'Particle Life Simulator'
    });
    
    this.settings.gui = this.gui;
    
    // Main sections
    const simulationFolder = this.gui.addFolder('Simulation');
    const physicsFolder = this.gui.addFolder('Physics');
    const appearanceFolder = this.gui.addFolder('Appearance');
    const particleColorsFolder = this.gui.addFolder('Particle Colors');
    const rulesFolder = this.gui.addFolder('Interaction Rules');
    
    // Ensure all folders start closed
    simulationFolder.close();
    physicsFolder.close();
    appearanceFolder.close();
    particleColorsFolder.close();
    rulesFolder.close();
    
    // === SIMULATION FOLDER ===
    simulationFolder.add({ reset: () => this.emit('reset') }, 'reset')
      .name('Reset Simulation');
      
    // Prevent GUI from resetting when clicking on random or symmetric rules
    simulationFolder.add({ randomRules: () => {
      this.ruleManager.randomRules();
      this.particleSystem.randomAtoms(this.settings.atoms.count, true);
      this.updateGUIDisplay(false); // Pass false to avoid resetting GUI
    }}, 'randomRules').name('Random Rules');

    simulationFolder.add({ symmetricRules: () => {
      this.ruleManager.symmetricRules();
      this.particleSystem.randomAtoms(this.settings.atoms.count, true);
      this.updateGUIDisplay(false); // Pass false to avoid resetting GUI
    }}, 'symmetricRules').name('Symmetric Rules');
    
    simulationFolder.add(this.settings, 'seed')
      .name('Seed')
      .listen();
      
    simulationFolder.add(this.settings, 'fps')
      .name('FPS')
      .listen()
      .disable();

    // === PHYSICS FOLDER ===
    physicsFolder.add(this.settings.atoms, 'count', 1, 2000, 1)
      .name('Atoms per-color')
      .listen()
      .onFinishChange(v => this.particleSystem.randomAtoms(v, true));
      
    physicsFolder.add(this.settings, 'dimensions', 200, 5000, 100)
      .name('World Size')
      .listen()
      .onFinishChange(v => this.emit('reset'));
      
    physicsFolder.add(this.settings, 'time_scale', 0.1, 5, 0.01)
      .name('Time Scale')
      .listen();
      
    physicsFolder.add(this.settings, 'cutOff', 1, 100000 * 2, 50)
      .name('Interaction Range')
      .listen();
      
    physicsFolder.add(this.settings, 'viscosity', 0.1, 1.99, 0.1)
      .name('Viscosity')
      .listen();
    
    // === APPEARANCE FOLDER ===
    appearanceFolder.add(this.settings.atoms, 'radius', 0.1, 10, 0.1)
      .name('Particle Size')
      .listen()
      .onFinishChange(v => {
        this.particleSystem.updateAtomRadius(v);
      });
      
    // Background settings
    const backgroundFolder = appearanceFolder.addFolder('Background');
    backgroundFolder.add(this.settings.drawings.background, 'active')
      .name('Show Background')
      .onChange(() => this.sceneManager.updateSceneColors());
      
    backgroundFolder.addColor(this.settings.drawings.background, 'color')
      .name('Color')
      .onChange(() => this.sceneManager.updateSceneColors());
      
    // Grid settings
    const gridFolder = appearanceFolder.addFolder('Grid');
    gridFolder.add(this.settings.drawings.grid, 'active')
      .name('Show Grid')
      .onChange(() => {
        if (this.settings.scene.gridHelper) {
          this.settings.scene.gridHelper.visible = this.settings.drawings.grid.active;
        }
      });
      
    gridFolder.addColor(this.settings.drawings.grid, 'colorCenterLine')
      .name('Center Line')
      .onChange(() => this.sceneManager.addGridHelper());
      
    gridFolder.addColor(this.settings.drawings.grid, 'colorGrid')
      .name('Grid Lines')
      .onChange(() => this.sceneManager.addGridHelper());
    
    // === PARTICLE COLORS FOLDER ===
    // Prevent GUI from resetting when clicking on addColor or removeColor
    particleColorsFolder.add({ addColor: () => {
      this.addNewColor();
      this.updateGUIDisplay(false); // Pass false to avoid resetting GUI
    }}, 'addColor').name('Add New Color');

    particleColorsFolder.add({ removeColor: () => {
      this.removeColor();
      this.updateGUIDisplay(false); // Pass false to avoid resetting GUI
    }}, 'removeColor').name('Remove Last Color');
    
    // Add color controllers
    for (let i = 0; i < this.settings.colors.length; i++) {
      const colorController = particleColorsFolder.addFolder(`Color ${i+1}: ${this.settings.colors[i].name}`);
      
      colorController.add(this.settings.colors[i], 'name')
        .name('Name')
        .onFinishChange((newName) => {
          const oldName = this.settings.colors[i].name;
          // Update color name in rules structure before updating GUI
          this.ruleManager.updateColorName(oldName, newName);
          this.updateGUIDisplay();
        });
        
      colorController.addColor(this.settings.colors[i], 'value')
        .name('Color')
        .onChange(() => {
          this.particleSystem.updateParticleColors();
        });
    }
      
    // === RULES FOLDER ===
    // Create rule matrix interface
    this.createRuleMatrix(rulesFolder);
    
    // Remove references to guiStyle.folders
    // Open default folders (commented out as guiStyle is removed)
    // this.settings.guiStyle.folders.expanded.forEach(folderName => {
    //   const folder = [
    //     simulationFolder, physicsFolder, appearanceFolder, 
    //     particleColorsFolder, rulesFolder
    //   ].find(f => f._title === folderName);
    //   
    //   if (folder) folder.open();
    // });
  }

  createRuleMatrix(parentFolder) {
    for (const atomColor of this.settings.colors) {
      const colorName = atomColor.name;
      const colorFolder = parentFolder.addFolder(`${colorName.capitalise()}`);
      
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
        
        const controller = colorFolder.add(
          this.settings.rules[colorName], 
          ruleName, 
          -1, 1, 0.01
        )
        .name(`${ruleName.capitalise()}`) // Removed emoji from label
        .listen()
        .onFinishChange((val) => {
          // Update the controller name without emoji
          controller.name(`${ruleName.capitalise()}`);
          this.ruleManager.flattenRules();
        });
      }
    }
  }

  updateGUIDisplay(resetGUI = true) {
    if (resetGUI) {
      // Preserve the open/closed state of folders
      const folderStates = {};
      if (this.gui) {
        this.gui.folders.forEach(folder => {
          folderStates[folder._title] = folder._closed;
        });
      }

      this.setupGUI();

      // Restore the open/closed state of folders
      this.gui.folders.forEach(folder => {
        if (folderStates[folder._title] !== undefined) {
          if (folderStates[folder._title]) {
            folder.close();
          } else {
            folder.open();
          }
        }
      });
    }
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