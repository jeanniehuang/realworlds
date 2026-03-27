import './App.css'

const pillars = [
  {
    title: 'Build fast',
    description:
      'A lean React and TypeScript setup that is easy to extend without dragging in framework overhead.',
  },
  {
    title: 'Ship anywhere',
    description:
      'Configured for static deployment on Netlify with a clean build pipeline and SPA routing fallback.',
  },
  {
    title: 'Scale the idea',
    description:
      'Use this as the foundation for content, commerce, community, or whatever Realworlds becomes next.',
  },
]

function App() {
  return (
    <main className="page-shell">
      <section className="hero-panel">
        <p className="eyebrow">Netlify-ready web project</p>
        <h1>Realworlds</h1>
        <p className="hero-copy">
          A launchpad for digital spaces, stories, and products that need a fast
          path from concept to the public web.
        </p>
        <div className="hero-actions">
          <a className="button button-primary" href="https://app.netlify.com/start">
            Deploy on Netlify
          </a>
          <a className="button button-secondary" href="#foundations">
            Explore the foundation
          </a>
        </div>
      </section>

      <section className="pillars" id="foundations" aria-label="Project foundations">
        {pillars.map((pillar) => (
          <article className="pillar-card" key={pillar.title}>
            <p className="pillar-index">0{pillars.indexOf(pillar) + 1}</p>
            <h2>{pillar.title}</h2>
            <p>{pillar.description}</p>
          </article>
        ))}
      </section>
    </main>
  )
}

export default App
