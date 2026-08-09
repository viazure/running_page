import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { preloadActivityData } from './hooks/useActivities';

// Overlap activities.json fetch with JS parsing / theme chunk download
preloadActivityData();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
