# Realworlds

Head-tracked off-axis rendering demo built with React, Three.js, Spark gaussian splats, and MediaPipe face tracking.

## What it does

- Loads the Van Gogh bedroom OBJ scene from [`public/models/van-gogh-bedroom`](/Users/jehuang/realworlds/public/models/van-gogh-bedroom)
- Resamples the mesh and textures into gaussian splats at runtime with Spark
- Tracks the user face with MediaPipe and estimates head position from dense landmarks
- Updates the Three.js camera frustum for a window-into-a-world parallax effect

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Netlify

This repo is already configured for Netlify in [`netlify.toml`](/Users/jehuang/realworlds/netlify.toml):

- Build command: `npm run build`
- Publish directory: `dist`

## Notes

- Webcam permission is required for head tracking.
- The MediaPipe face landmarker model is bundled locally at [`public/models/mediapipe/face_landmarker.task`](/Users/jehuang/realworlds/public/models/mediapipe/face_landmarker.task).
- The viewer bundle is large because it includes MediaPipe, Three.js loaders, and Spark, but it is lazy-loaded so the initial shell stays smaller.
