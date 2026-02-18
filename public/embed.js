(() => {
  // Get config from window
  const config = window.bmbConfig || {};
  const botId = config.botId;
  // Use provided domain, or detect from script src, or fall back to current origin
  const scriptSrc = document.currentScript?.src || '';
  const scriptDomain = scriptSrc ? new URL(scriptSrc).origin : '';
  const domain = config.domain || scriptDomain || window.location.origin;

  if (!botId) {
    console.error('BuildMyBot: No botId provided.');
    return;
  }

  // Create Container
  const container = document.createElement('div');
  container.id = 'bmb-widget-container';
  container.style.position = 'fixed';
  container.style.zIndex = '999999';
  container.style.bottom = '20px';
  container.style.right = '20px';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'flex-end';
  container.style.gap = '10px';
  document.body.appendChild(container);

  // Create Iframe for Chat Window (Hidden by default)
  const iframe = document.createElement('iframe');
  iframe.src = `https://${domain}/chat/${botId}?mode=embed`;
  iframe.style.border = 'none';
  iframe.style.position = 'fixed';
  iframe.style.bottom = '90px';
  iframe.style.right = '20px';
  iframe.style.width = '380px';
  iframe.style.height = '600px';
  iframe.style.maxWidth = 'calc(100vw - 40px)';
  iframe.style.maxHeight = 'calc(100vh - 120px)';
  iframe.style.borderRadius = '16px';
  iframe.style.boxShadow = '0 10px 25px rgba(0,0,0,0.15)';
  iframe.style.display = 'none'; // Start hidden
  iframe.style.zIndex = '999999';
  iframe.style.transition = 'all 0.3s ease';
  document.body.appendChild(iframe);

  // Mobile overrides
  const mobileMediaQuery = window.matchMedia('(max-width: 480px)');
  const applyMobileStyles = (e) => {
    if (e.matches) {
      iframe.style.width = 'calc(100vw - 40px)';
      iframe.style.height = 'calc(100vh - 120px)';
    } else {
      iframe.style.width = '380px';
      iframe.style.height = '600px';
    }
  };
  mobileMediaQuery.addListener(applyMobileStyles);
  applyMobileStyles(mobileMediaQuery);

  // Create Launcher Button
  const button = document.createElement('div');
  button.style.width = '60px';
  button.style.height = '60px';
  button.style.borderRadius = '30px';
  button.style.backgroundColor = config.theme || '#1e3a8a';
  button.style.cursor = 'pointer';
  button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
  button.style.display = 'flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
  button.style.transition = 'transform 0.2s';

  // Icon (SVG)
  button.innerHTML = `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
  `;

  container.appendChild(button);

  // Toggle Logic
  let isOpen = false;
  button.onclick = () => {
    isOpen = !isOpen;
    if (isOpen) {
      iframe.style.display = 'block';
      iframe.style.opacity = '0';
      iframe.style.transform = 'translateY(20px)';
      setTimeout(() => {
        iframe.style.opacity = '1';
        iframe.style.transform = 'translateY(0)';
      }, 50);
      button.innerHTML = `
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
    } else {
      iframe.style.opacity = '0';
      iframe.style.transform = 'translateY(20px)';
      setTimeout(() => {
        iframe.style.display = 'none';
      }, 300);
      button.innerHTML = `
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      `;
    }
  };
})();
