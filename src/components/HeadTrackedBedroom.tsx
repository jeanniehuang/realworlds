import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision'
import { SplatMesh } from '@sparkjsdev/spark'
import { startTransition, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { createBedroomSplats } from '../lib/bedroomSplats.ts'

type TrackingStatus = 'loading' | 'ready' | 'tracking' | 'fallback' | 'error'

type HeadPose = {
  x: number
  y: number
  z: number
}

type Telemetry = {
  status: TrackingStatus
  message: string
  samples: number
  pose: HeadPose
}

const BASE_HEAD_POSE: HeadPose = { x: 0, y: 0, z: 0.78 }
const INITIAL_TELEMETRY: Telemetry = {
  status: 'loading',
  message: 'Loading the splat scene and webcam tracker…',
  samples: 0,
  pose: BASE_HEAD_POSE,
}
const SCREEN_HEIGHT = 0.36
const NEAR = 0.05
const FAR = 40
const SMOOTHING = 0.18
const MODEL_WASM_ROOT =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'

const LEFT_EYE = [33, 133, 159, 145]
const RIGHT_EYE = [362, 263, 386, 374]
const NOSE_TIP = 1

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function averagePoint(landmarks: { x: number; y: number }[], indices: number[]) {
  let x = 0
  let y = 0

  for (const index of indices) {
    x += landmarks[index].x
    y += landmarks[index].y
  }

  return new THREE.Vector2(x / indices.length, y / indices.length)
}

function applyOffAxisProjection(
  camera: THREE.PerspectiveCamera,
  pose: HeadPose,
  aspect: number,
) {
  const screenWidth = SCREEN_HEIGHT * aspect
  const left = (NEAR * (-screenWidth * 0.5 - pose.x)) / pose.z
  const right = (NEAR * (screenWidth * 0.5 - pose.x)) / pose.z
  const top = (NEAR * (SCREEN_HEIGHT * 0.5 - pose.y)) / pose.z
  const bottom = (NEAR * (-SCREEN_HEIGHT * 0.5 - pose.y)) / pose.z

  camera.near = NEAR
  camera.far = FAR
  camera.position.set(pose.x, pose.y, pose.z)
  camera.rotation.set(0, 0, 0)
  camera.updateMatrixWorld(true)
  camera.projectionMatrix.makePerspective(
    left,
    right,
    top,
    bottom,
    NEAR,
    FAR,
    THREE.WebGLCoordinateSystem,
  )
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
}

export function HeadTrackedBedroom() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const telemetryRef = useRef<Telemetry>(INITIAL_TELEMETRY)
  const [telemetry, setTelemetry] = useState<Telemetry>(INITIAL_TELEMETRY)

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    let animationFrame = 0
    let stream: MediaStream | null = null
    let faceLandmarker: FaceLandmarker | null = null
    let lastVideoTime = -1
    let lastTelemetrySync = 0
    let baselineEyeDistance = 0
    let packedSplatsForCleanup: { dispose(): void } | null = null

    const targetPose = { ...BASE_HEAD_POSE }
    const smoothPose = { ...BASE_HEAD_POSE }
    const video = document.createElement('video')
    video.autoplay = true
    video.muted = true
    video.playsInline = true

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor('#070a10')
    renderer.domElement.setAttribute('aria-label', 'Head tracked Van Gogh bedroom')
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#070a10')

    const camera = new THREE.PerspectiveCamera(50, 1, NEAR, FAR)

    const updateTelemetry = (next: Partial<Telemetry>, immediate = false) => {
      telemetryRef.current = {
        ...telemetryRef.current,
        ...next,
      }

      const now = performance.now()
      if (!immediate && now - lastTelemetrySync < 120) {
        return
      }

      lastTelemetrySync = now
      startTransition(() => setTelemetry(telemetryRef.current))
    }

    const onResize = () => {
      const width = container.clientWidth
      const height = container.clientHeight
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      applyOffAxisProjection(camera, smoothPose, camera.aspect)
    }

    const updateTracking = () => {
      if (!faceLandmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return
      }

      if (video.currentTime === lastVideoTime) {
        return
      }

      lastVideoTime = video.currentTime
      const results = faceLandmarker.detectForVideo(video, performance.now())
      const landmarks = results.faceLandmarks[0]

      if (!landmarks) {
        updateTelemetry(
          {
            status: 'fallback',
            message: 'Face not detected. Re-center your face in the camera view.',
          },
          true,
        )
        return
      }

      const leftEye = averagePoint(landmarks, LEFT_EYE)
      const rightEye = averagePoint(landmarks, RIGHT_EYE)
      const nose = landmarks[NOSE_TIP]
      const eyeDistance = leftEye.distanceTo(rightEye)

      if (eyeDistance <= 0) {
        return
      }

      baselineEyeDistance =
        baselineEyeDistance === 0
          ? eyeDistance
          : THREE.MathUtils.lerp(baselineEyeDistance, eyeDistance, 0.04)

      targetPose.x = clamp(((nose.x - 0.5) / eyeDistance) * 0.07, -0.18, 0.18)
      targetPose.y = clamp(((0.5 - nose.y) / eyeDistance) * 0.045, -0.13, 0.13)
      targetPose.z = clamp(
        0.78 * (baselineEyeDistance / eyeDistance),
        0.5,
        1.15,
      )

      updateTelemetry(
        {
          status: 'tracking',
          message: 'Tracking active. Move your head to shift the windowed view.',
        },
        true,
      )
    }

    const tick = () => {
      updateTracking()

      smoothPose.x = THREE.MathUtils.lerp(smoothPose.x, targetPose.x, SMOOTHING)
      smoothPose.y = THREE.MathUtils.lerp(smoothPose.y, targetPose.y, SMOOTHING)
      smoothPose.z = THREE.MathUtils.lerp(smoothPose.z, targetPose.z, SMOOTHING)

      applyOffAxisProjection(camera, smoothPose, camera.aspect)
      renderer.render(scene, camera)

      updateTelemetry({
        pose: { ...smoothPose },
      })

      animationFrame = window.requestAnimationFrame(tick)
    }

    const initialize = async () => {
      try {
        updateTelemetry(
          {
            status: 'loading',
            message: 'Sampling the bedroom mesh into gaussian splats…',
          },
          true,
        )

        const packedSplats = await createBedroomSplats()
        packedSplatsForCleanup = packedSplats
        const splatScene = new SplatMesh({ packedSplats })
        await splatScene.initialized
        scene.add(splatScene)

        updateTelemetry(
          {
            samples: packedSplats.numSplats,
            message: 'Starting MediaPipe head tracking…',
          },
          true,
        )

        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
        video.srcObject = stream
        await video.play()

        const vision = await FilesetResolver.forVisionTasks(MODEL_WASM_ROOT)
        faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/mediapipe/face_landmarker.task',
          },
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
          runningMode: 'VIDEO',
        })

        updateTelemetry(
          {
            status: 'ready',
            message: 'Camera ready. Hold still briefly so depth can calibrate.',
          },
          true,
        )

        onResize()
        tick()
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to start the head-tracked renderer.'

        updateTelemetry(
          {
            status: 'error',
            message,
          },
          true,
        )
      }
    }

    onResize()
    window.addEventListener('resize', onResize)
    void initialize()

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', onResize)
      faceLandmarker?.close()
      stream?.getTracks().forEach((track) => track.stop())
      packedSplatsForCleanup?.dispose()
      renderer.dispose()

      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div className="scene-shell">
      <div className="scene-canvas" ref={containerRef} />

      <div className="viewer-overlay">
        <strong>{telemetry.status === 'error' ? 'Renderer error' : 'Windowed parallax'}</strong>
        <span>{telemetry.message}</span>
      </div>

      <div className="telemetry">
        <p>Dense face landmarks drive an off-axis Three.js camera.</p>
        <div className="telemetry-grid">
          <p>
            <strong>{telemetry.samples.toLocaleString()}</strong>
            <span>splats</span>
          </p>
          <p>
            <strong>{telemetry.pose.x.toFixed(2)}</strong>
            <span>x offset</span>
          </p>
          <p>
            <strong>{telemetry.pose.z.toFixed(2)}</strong>
            <span>depth</span>
          </p>
        </div>
      </div>
    </div>
  )
}
