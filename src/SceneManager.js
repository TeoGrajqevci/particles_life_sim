import { EventEmitter } from './utils/EventEmitter.js';
import * as THREE from 'https://cdn.skypack.dev/three@0.144.0';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.132.2/examples/jsm/controls/OrbitControls.js';

export class SceneManager extends EventEmitter {
  constructor(settings) {
    super();
    this.settings = settings;
  }

  initScene() {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const aspect = window.innerWidth / window.innerHeight;
    this.settings.scene.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 50000);
    this.settings.scene.camera.position.set(
      this.settings.dimensions * 2, 
      this.settings.dimensions * 2, 
      this.settings.dimensions * 2
    );
    
    this.settings.scene.scene = new THREE.Scene();

    this.settings.scene.atomsGroup = new THREE.Group();
    this.settings.scene.scene.add(this.settings.scene.atomsGroup);

    this.settings.scene.renderer = new THREE.WebGLRenderer();
    this.settings.scene.renderer.setPixelRatio(window.devicePixelRatio);
    this.settings.scene.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.settings.scene.renderer.domElement);

    this.settings.scene.controls = new OrbitControls(
      this.settings.scene.camera, 
      this.settings.scene.renderer.domElement
    );
    
    this.settings.scene.controls.target.set(
      this.settings.dimensions / 2, 
      this.settings.dimensions / 2, 
      this.settings.dimensions / 2
    );
    
    this.settings.scene.controls.update();

    this.addGridHelper();
    this.updateSceneColors();
    
    window.addEventListener('resize', () => {
      this.settings.scene.camera.aspect = window.innerWidth / window.innerHeight;
      this.settings.scene.camera.updateProjectionMatrix();
      this.settings.scene.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  addGridHelper() {
    if (this.settings.scene.gridHelper) {
      this.settings.scene.gridHelper.parent.remove(this.settings.scene.gridHelper);
    }
    
    this.settings.scene.gridHelper = new THREE.GridHelper(
      this.settings.dimensions, 
      10, 
      new THREE.Color(this.settings.drawings.grid.colorCenterLine), 
      new THREE.Color(this.settings.drawings.grid.colorGrid)
    );
    
    this.settings.scene.gridHelper.position.set(
      this.settings.dimensions / 2, 
      0, 
      this.settings.dimensions / 2
    );
    
    this.settings.scene.gridHelper.visible = this.settings.drawings.grid.active;
    this.settings.scene.scene.add(this.settings.scene.gridHelper);
  }

  updateSceneColors() {
    // Update background color
    if (this.settings.drawings.background.active) {
      this.settings.scene.scene.background = new THREE.Color(this.settings.drawings.background.color);
    } else {
      this.settings.scene.scene.background = null;
    }
    
    // Update container color (renderer clear color)
    this.settings.scene.renderer.setClearColor(this.settings.drawings.container.color);
    
    // Update grid visibility
    if (this.settings.scene.gridHelper) {
      this.settings.scene.gridHelper.visible = this.settings.drawings.grid.active;
    }
  }

  resetScene(particleSystem) {
    particleSystem.randomAtoms(this.settings.atoms.count, true);
    this.settings.scene.controls.target.set(
      this.settings.dimensions / 2, 
      this.settings.dimensions / 2, 
      this.settings.dimensions / 2
    );
    this.addGridHelper();
    this.updateSceneColors();
  }

  render() {
    this.settings.scene.controls.update();
    this.settings.scene.renderer.render(this.settings.scene.scene, this.settings.scene.camera);
  }
}