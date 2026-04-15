/* =======================================
   Reusable Status Header Component
   Matches original Minecraft page structure
   ======================================= */
const StatusHeader = {
  /**
   * Render a header matching the original Minecraft page layout
   * Uses exact same class names as minecraft.css
   * @param {Object} options - Configuration options
   * @param {string} options.title - Page title
   * @param {string} options.subtitle - Page subtitle
   * @param {string} options.theme - Theme color for title gradient ('cyan', 'pink', 'yellow')
   * @param {Array} options.statusCards - Array of status card objects
   * @param {string} options.statusCards[].type - Card type (classes: players, servers, friends, etc)
   * @param {string} options.statusCards[].value - Card value
   * @param {string} options.statusCards[].label - Card label
   * @param {string} options.statusCards[].icon - SVG icon content
   * @param {boolean} options.statusCards[].pulse - Whether to show pulse animation
   */
  render(options) {
    const { title, subtitle, theme = 'cyan', statusCards = [] } = options;
    
    const themeColors = {
      cyan: 'var(--neon-cyan)',
      pink: 'var(--neon-pink)',
      yellow: 'var(--neon-yellow)'
    };

    const themeGlows = {
      cyan: 'rgba(0, 240, 255, 0.08)',
      pink: 'rgba(255, 45, 120, 0.08)',
      yellow: 'rgba(255, 191, 36, 0.08)'
    };

    const gradientEnd = `linear-gradient(135deg, var(--text-primary) 0%, ${themeColors[theme]} 100%)`;
    const glowColor = themeGlows[theme];

    const statusCardsHtml = statusCards.map(card => {
      const pulseHtml = card.pulse ? '<span class="mc-status-pulse"></span>' : '';
      
      return `
        <div class="mc-status-card ${card.type || ''}">
          <div class="mc-status-icon">
            ${card.icon}
          </div>
          <div class="mc-status-info">
            <span class="mc-status-value">${card.value}</span>
            <span class="mc-status-label">${card.label}</span>
          </div>
          ${pulseHtml}
        </div>
      `;
    }).join('');

    return `
      <div class="mc-page-header animate-fade-up" data-theme="${theme}">
        <div class="mc-header-accent"></div>
        <div class="mc-header-content">
          <h1 class="mc-title" style="background: ${gradientEnd}; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${title}</h1>
          <p class="mc-subtitle">${subtitle}</p>
        </div>
        <div class="mc-status-header">
          ${statusCardsHtml}
        </div>
        <div class="mc-header-glow" style="background: radial-gradient(circle, ${glowColor} 0%, transparent 70%);"></div>
      </div>
    `;
  }
};
