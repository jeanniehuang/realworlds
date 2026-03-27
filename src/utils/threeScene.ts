import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { SplatMesh } from '@sparkjsdev/spark';
import { HeadPose } from './headPose';
import { OffAxisCamera } from './offAxisCamera';
import { calibrationManager, CalibrationData } from './calibration';

const isDrawingRoute = window.location.pathname.startsWith('/drawing');
const defaultModelPosition = isDrawingRoute
  ? { x: -0.01, y: -0.01, z: 0.37 }
  : { x: 0.01, y: -0.12, z: -0.381 };
const defaultModelScale = isDrawingRoute ? 0.3 : 0.101;
const defaultModelRotation = isDrawingRoute
  ? { x: Math.PI, y: 0, z: 0 }
  : { x: 0, y: 0, z: 0 };

export interface ThreeSceneOptions {
  container: HTMLElement;
  width?: number;
  height?: number;
}

export class ThreeSceneManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private offAxisCamera: OffAxisCamera;
  private model: THREE.Object3D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private currentHeadPose: HeadPose = { x: 0.5, y: 0.5, z: 1 };
  private debugMode: boolean = false;
  private debugHelpers: THREE.Object3D[] = [];

  constructor(options: ThreeSceneOptions) {
    const width = options.width || options.container.clientWidth;
    const height = options.height || options.container.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);

    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    this.camera.position.z = 5;

    const calibration = calibrationManager.getCalibration();
    calibration.pixelWidth = width;
    calibration.pixelHeight = height;
    calibrationManager.updatePixelDimensions(width, height);

    this.offAxisCamera = new OffAxisCamera(this.camera, calibration);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false
    });
    this.renderer.setClearColor(0x1a1a1a, 1);
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '50%';
    this.renderer.domElement.style.transform = 'translateX(-50%)';
    options.container.appendChild(this.renderer.domElement);

    this.updateRenderFrame(width, height);
    this.loadModel();
    this.createDebugHelpers();
  }

  private updateRenderFrame(width: number, height: number): void {
    const aspect = calibrationManager.getScreenAspectRatio();
    const useFullViewport = width >= height * aspect;
    const renderWidth = useFullViewport ? width : Math.round(height * aspect);
    const renderHeight = useFullViewport ? height : height;

    this.camera.aspect = renderWidth / renderHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(renderWidth, renderHeight, false);
    this.renderer.domElement.style.width = `${renderWidth}px`;
    this.renderer.domElement.style.height = `${renderHeight}px`;
    this.renderer.domElement.style.left = useFullViewport ? '0' : '50%';
    this.renderer.domElement.style.transform = useFullViewport ? 'none' : 'translateX(-50%)';

    const calibration = calibrationManager.getCalibration();
    calibration.pixelWidth = renderWidth;
    calibration.pixelHeight = renderHeight;
    calibrationManager.updatePixelDimensions(renderWidth, renderHeight);
    this.offAxisCamera.updateCalibration(calibration);
  }

  private loadModel(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(1, 1, 1);
    this.scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight2.position.set(-1, -1, 0.5);
    this.scene.add(directionalLight2);

    if (isDrawingRoute) {
      const splat = new SplatMesh({
        url: '/models/drawing-gaussians.ply',
      });

      splat.initialized
        .then(() => {
          this.model = splat;
          this.model.position.set(
            defaultModelPosition.x,
            defaultModelPosition.y,
            defaultModelPosition.z,
          );
          this.model.rotation.set(
            defaultModelRotation.x,
            defaultModelRotation.y,
            defaultModelRotation.z,
          );
          this.model.scale.setScalar(defaultModelScale);
          this.scene.add(this.model);
        })
        .catch((error) => {
          console.error('Error loading drawing splat:', error);
        });

      return;
    }

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    dracoLoader.setDecoderConfig({ type: 'js' });

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    loader.load(
      '/models/van-gogh-bedroom.glb',
      (gltf) => {
        this.model = gltf.scene;
        this.model.position.set(
          defaultModelPosition.x,
          defaultModelPosition.y,
          defaultModelPosition.z,
        );
        this.model.rotation.set(
          defaultModelRotation.x,
          defaultModelRotation.y,
          defaultModelRotation.z,
        );
        this.model.scale.set(
          defaultModelScale,
          defaultModelScale,
          defaultModelScale,
        );

        this.scene.add(this.model);
      },
      undefined,
      (error) => {
        console.error('Error loading model:', error);
      }
    );
  }

  private createDebugHelpers(): void {
    const axesHelper = new THREE.AxesHelper(0.1);
    axesHelper.visible = false;
    this.debugHelpers.push(axesHelper);
    this.scene.add(axesHelper);

    const headPositionMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff00ff })
    );
    headPositionMarker.visible = false;
    this.debugHelpers.push(headPositionMarker);
    this.scene.add(headPositionMarker);
  }

  updateHeadPose(headPose: HeadPose): void {
    this.currentHeadPose = headPose;
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    this.debugHelpers.forEach(helper => {
      helper.visible = enabled;
    });
  }

  updateCalibration(calibration: CalibrationData): void {
    this.offAxisCamera.updateCalibration(calibration);
    const parent = this.renderer.domElement.parentElement;
    if (parent) {
      this.updateRenderFrame(parent.clientWidth, parent.clientHeight);
    }
  }

  updateModelPosition(x: number, y: number, z: number): void {
    if (this.model) {
      this.model.position.set(x, y, z);
    }
  }

  updateModelScale(scale: number): void {
    if (this.model) {
      this.model.scale.set(scale, scale, scale);
    }
  }

  getModelPosition(): { x: number; y: number; z: number } {
    if (this.model) {
      return {
        x: this.model.position.x,
        y: this.model.position.y,
        z: this.model.position.z
      };
    }
    return defaultModelPosition;
  }

  getModelScale(): number {
    if (this.model) {
      return this.model.scale.x;
    }
    return defaultModelScale;
  }

  updateModelRotation(x: number, y: number, z: number): void {
    if (this.model) {
      this.model.rotation.set(x, y, z);
    }
  }

  getModelRotation(): { x: number; y: number; z: number } {
    if (this.model) {
      return {
        x: this.model.rotation.x,
        y: this.model.rotation.y,
        z: this.model.rotation.z
      };
    }
    return defaultModelRotation;
  }

  private animate = (): void => {
    if (!this.isRunning) return;

    this.animationFrameId = requestAnimationFrame(this.animate);

    this.offAxisCamera.updateFromHeadPose(this.currentHeadPose);

    if (this.debugMode && this.debugHelpers.length > 1) {
      const worldPos = this.offAxisCamera.headPoseToWorldPosition(this.currentHeadPose);
      this.debugHelpers[1].position.set(worldPos.x, worldPos.y, worldPos.z);
    }

    this.renderer.render(this.scene, this.camera);
  };

  start(): void {
    if (!this.isRunning) {
      this.isRunning = true;
      this.animate();
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  resize(width: number, height: number): void {
    this.updateRenderFrame(width, height);
  }

  dispose(): void {
    this.stop();

    if (this.model) {
      if (this.model instanceof SplatMesh) {
        this.model.packedSplats?.dispose();
      }
      this.model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
    }

    this.renderer.dispose();

    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
