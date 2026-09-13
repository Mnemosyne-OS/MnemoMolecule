import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Page } from './mol/page';
import './mol/globals.css';

const host = document.getElementById('root');
if (!host) {
  // The boot reporter in index.html owns every other failure; this one it
  // cannot report, because it is the element the reporter lives in.
  throw new Error('#root is missing from index.html');
}
createRoot(host).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
