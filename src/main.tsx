import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installChunkLoadRecovery } from './utils/chunkLoadRecovery';

// After a deploy, stale tabs may request deleted hashed chunks — reload once.
installChunkLoadRecovery();

// No app-wide activities.json prefetch here on purpose. dashboard_pro reads the
// smaller `activities.lite.json` through its own loader, so a global prefetch
// pulled a ~726KB payload the pro theme never used. Each theme entry that needs
// the full file starts that fetch itself (see themes/classic, themes/dashboard).

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
