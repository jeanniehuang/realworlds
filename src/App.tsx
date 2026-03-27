import { Suspense, lazy } from 'react'
import './App.css'

const HeadTrackedBedroom = lazy(async () => {
  const module = await import('./components/HeadTrackedBedroom.tsx')
  return { default: module.HeadTrackedBedroom }
})

function App() {
  return (
    <main className="app-shell">
      <section className="viewer-panel">
        <Suspense
          fallback={
            <div className="scene-shell">
              <div className="viewer-overlay">
                <strong>Preparing renderer</strong>
                <span>Loading MediaPipe, Three.js, and Spark…</span>
              </div>
            </div>
          }
        >
          <HeadTrackedBedroom />
        </Suspense>
      </section>

      <section className="info-panel">
        <p className="eyebrow">MediaPipe + Three.js + Spark</p>
        <h1>Realworlds Bedroom Portal</h1>
        <p className="lede">
          A head-tracked off-axis renderer that turns Van Gogh&apos;s bedroom into
          a splatted 3D window. Move your head and the camera frustum shifts with
          you.
        </p>

        <div className="info-grid">
          <article className="info-card">
            <h2>How it works</h2>
            <ul>
              <li>MediaPipe tracks dense face landmarks from your webcam feed.</li>
              <li>Eye spacing and nose position estimate lateral and depth motion.</li>
              <li>Smoothing filters remove jitter before updating the camera.</li>
              <li>The bedroom OBJ is resampled into gaussian splats for Spark.</li>
            </ul>
          </article>

          <article className="info-card">
            <h2>Controls</h2>
            <ul>
              <li>Allow webcam access when prompted.</li>
              <li>Keep your face centered for a second to calibrate depth.</li>
              <li>Lean left, right, up, and down to explore the room.</li>
              <li>Step closer to increase parallax and farther to reduce it.</li>
            </ul>
          </article>
        </div>
      </section>
    </main>
  )
}

export default App
