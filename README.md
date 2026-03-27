# Realworlds

Realworlds is a Vite + React + TypeScript web project set up for deployment on Netlify.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Netlify

This repo includes a [`netlify.toml`](/Users/jehuang/realworlds/netlify.toml) file with:

- `npm run build` as the build command
- `dist` as the publish directory
- a redirect rule for single-page app routing
