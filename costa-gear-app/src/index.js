import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AuthGate from './AuthGate';

const LEGACY_HOST = 'costa-gear-sourcing.vercel.app';
const CANONICAL_ORIGIN = 'https://ops.costagear.ca';

if (window.location.hostname === LEGACY_HOST) {
  window.location.replace(`${CANONICAL_ORIGIN}${window.location.pathname}${window.location.search}${window.location.hash}`);
} else {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <AuthGate>
        <App />
      </AuthGate>
    </React.StrictMode>
  );
}
