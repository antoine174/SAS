import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { UploadProvider } from './lib/UploadContext';
import { AuthProvider } from './lib/AuthContext';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <UploadProvider>
          <App />
        </UploadProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
