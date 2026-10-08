import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { preloadActivityData } from './hooks/useActivities';
import { installChunkLoadRecovery } from './utils/chunkLoadRecovery';

// After a deploy, stale tabs may request deleted hashed chunks — reload once.
installChunkLoadRecovery();

// Overlap activities.json fetch with JS parsing / theme chunk download
preloadActivityData();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
