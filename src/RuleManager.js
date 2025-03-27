import { EventEmitter } from './utils/EventEmitter.js';

export class RuleManager extends EventEmitter {
  constructor(settings) {
    super();
    this.settings = settings;
  }

  randomRules() {
    if (!isFinite(this.settings.seed)) this.settings.seed = 0xcafecafe;
    console.log("Seed=" + this.settings.seed);
    window.location.hash = "#" + this.settings.seed;
    
    for (const color of this.settings.colors) {
      this.settings.rules[color.name] = {};
      for (const color2 of this.settings.colors) {
        this.settings.rules[color.name][color2.name] = this.settings.random() * 2 - 1;
      }
    }
    console.log(JSON.stringify(this.settings.rules));
    this.flattenRules();
    this.emit('rulesChanged');
  }

  symmetricRules() {
    for (const i of this.settings.colors) {
      for (const j of this.settings.colors) {
        if (j.name < i.name) {
          const v = 0.5 * (this.settings.rules[i.name][j.name] + this.settings.rules[j.name][i.name]);
          this.settings.rules[i.name][j.name] = this.settings.rules[j.name][i.name] = v;
        }
      }
    }
    console.log(JSON.stringify(this.settings.rules));
    this.flattenRules();
    this.emit('rulesChanged');
  }

  flattenRules() {
    this.settings.rulesArray = [];
    for (let i = 0; i < this.settings.colors.length; i++) {
      const ruleRow = [];
      for (let j = 0; j < this.settings.colors.length; j++) {
        ruleRow.push(this.settings.rules[this.settings.colors[i].name][this.settings.colors[j].name]);
      }
      this.settings.rulesArray.push(ruleRow);
    }
  }

  updateColorName(oldName, newName) {
    // Skip if the name didn't actually change
    if (oldName === newName) return;
    
    console.log(`Renaming color: ${oldName} -> ${newName}`);
    
    // Create entry for the new name if it doesn't exist
    if (!this.settings.rules[newName]) {
      this.settings.rules[newName] = {};
    }
    
    // Copy rules from old name to new name
    for (const color of this.settings.colors) {
      const targetName = color.name;
      
      // Copy rule: oldName -> targetName becomes newName -> targetName
      if (this.settings.rules[oldName] && this.settings.rules[oldName][targetName] !== undefined) {
        this.settings.rules[newName][targetName] = this.settings.rules[oldName][targetName];
      }
      
      // Copy rule: targetName -> oldName becomes targetName -> newName
      if (this.settings.rules[targetName] && this.settings.rules[targetName][oldName] !== undefined) {
        if (!this.settings.rules[targetName][newName]) {
          this.settings.rules[targetName][newName] = this.settings.rules[targetName][oldName];
        }
      }
    }
    
    // Remove old name entry
    delete this.settings.rules[oldName];
    
    // Update all rules to use the new name instead of the old name
    for (const color of this.settings.colors) {
      if (this.settings.rules[color.name] && this.settings.rules[color.name][oldName] !== undefined) {
        this.settings.rules[color.name][newName] = this.settings.rules[color.name][oldName];
        delete this.settings.rules[color.name][oldName];
      }
    }
    
    // Update flattened rules array
    this.flattenRules();
    this.emit('rulesChanged');
  }
}