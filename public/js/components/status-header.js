/* =======================================
   Reusable Status Header Component
   ======================================= */
const StatusHeader = {
  /**
   * Render a header with title, subtitle, and status cards
   * @param {Object} options - Configuration options
   * @param {string} options.title - Page title
   * @param {string} options.subtitle - Page subtitle
   * @param {string} options.theme - Theme color ('cyan', 'pink', 'yellow', 'green')
   * @param {Array} options.statusCards - Array of status card objects
   * @param {string} options.statusCards[].type - Card type identifier
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
      yellow: 'var(--neon-yellow)',
      green: '#22c55e'
    };

    const themeGradients = {
      cyan: 'rgba(0, 240, 255, 0.08)',
      pink: 'rgba(255, 45, 120, 0.08)',
      yellow: 'rgba(255, 191, 36, 0.08)',
      green: 'rgba(34, 197, 94, 0.08)'
    };

    const gradientEnd = `linear-gradient(135deg, var(--text-primary) 0%, ${themeColors[theme]} 100%)`;
    const glowColor = themeGradients[theme];

    const statusCardsHtml = statusCards.map(card => {
      const cardTheme = card.theme || theme;
      const cardColor = themeColors[cardTheme];
      const cardGradient = themeGradients[cardTheme];
      const pulseHtml = card.pulse ? '<span class="mc-status-pulse"></span>' : '';
      
      return `
        <div class="mc-status-card ${card.type || ''}" style="
          background: linear-gradient(135deg, ${cardGradient} 0%, var(--bg-card) 100%);
          border-color: ${cardGradient.replace('0.08', '0.2')};
        ">
          <div class="mc-status-icon" style="color: ${cardColor}">
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
      <div class="status-header-container">
        <div class="status-header-accent"></div>
        <div class="status-header-content">
          <h1 class="status-title" style="background: ${gradientEnd}; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${title}</h1>
          <p class="status-subtitle">${subtitle}</p>
        </div>
        <div class="status-header-cards">
          <div class="mc-status-header">
            ${statusCardsHtml}
          </div>
        </div>
        <div class="status-header-glow" style="background: radial-gradient(circle, ${glowColor} 0%, transparent 70%);"></div>
      </div>
    `;
  }
};
