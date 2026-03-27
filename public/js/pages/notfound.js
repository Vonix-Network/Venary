/* =======================================
   Venary — 404 Not Found Page
   ======================================= */
var NotFoundPage = {
  render(container, params) {
    var requestedPath = params && params.length > 0 ? '/' + params.join('/') : 'unknown';
    
    container.innerHTML = `
      <div class="not-found-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; text-align: center; padding: 40px 20px;">
        <div style="font-size: 5rem; margin-bottom: 20px; opacity: 0.8;">🔍</div>
        <h1 style="font-family: var(--font-display); font-size: 3rem; margin-bottom: 12px; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">404</h1>
        <h2 style="font-size: 1.5rem; color: var(--text-primary); margin-bottom: 8px;">Page Not Found</h2>
        <p style="color: var(--text-secondary); font-size: 1rem; margin-bottom: 24px; max-width: 500px; line-height: 1.6;">
          The page you're looking for doesn't exist or has been moved.
          <br><code style="font-family: var(--font-mono); color: var(--neon-cyan); background: var(--bg-tertiary); padding: 4px 8px; border-radius: 4px; display: inline-block; margin-top: 8px;">${App.escapeHtml(requestedPath)}</code>
        </p>
        <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
          <button class="btn btn-primary" onclick="window.location.hash = '#/feed'" style="cursor: pointer;">
            ← Back to Feed
          </button>
          <button class="btn btn-secondary" onclick="window.location.hash = '#/'" style="cursor: pointer;">
            Go Home
          </button>
        </div>
        <div style="margin-top: 40px; padding-top: 40px; border-top: 1px solid var(--border-subtle); color: var(--text-muted); font-size: 0.85rem;">
          <p>Need help? Check out the <a href="#/feed" style="color: var(--neon-cyan); text-decoration: none;">main feed</a> or contact support.</p>
        </div>
      </div>
    `;
  }
};
