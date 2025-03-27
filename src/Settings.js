import { EventEmitter } from './utils/EventEmitter.js';

export class Settings extends EventEmitter {
  constructor() {
    super();
    this.seed = 483297380;
    this.fps = 0;
    this.dimensions = 1000;
    this.atoms = {
      count: 600, // per color
      radius: 0.7
    };
    this.drawings = {
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
    };
    this.rules = {};
    this.rulesArray = [];
    this.colors = [
      { name: 'green', value: '#00ff00' },
      { name: 'red', value: '#ff0000' },
      { name: 'yellow', value: '#ffff00' },
      { name: 'blue', value: '#0000ff' }
    ];
    this.time_scale = 0.25;
    this.cutOff = 20000 * 2;    // cutoff squared (i.e. only if distance^2 < cutOff)
    this.viscosity = 1.7;
    this.scene = {
      camera: null,
      scene: null,
      renderer: null,
      controls: null,
      atomsGroup: null,
      gridHelper: null
    };
    this.gui = null;
  }

  loadSeedFromUrl() {
    const hash = window.location.hash;
    if (hash && hash[0] === '#') {
      const param = Number(hash.substr(1));
      if (isFinite(param)) {
        this.seed = param;
        console.log("Using seed " + this.seed);
      }
    }
  }

  // Seedable random generator (Mulberry32)
  random() {
    let t = this.seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}