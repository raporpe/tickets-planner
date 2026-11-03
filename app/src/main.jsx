import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { toast } from 'sonner';
import { installDesktopLinks } from './lib/desktop';

installDesktopLinks((error) => toast.error(`Could not open the link: ${error.message || error}`));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
