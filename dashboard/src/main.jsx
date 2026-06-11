import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import { AlarmAudioProvider } from './auth/AlarmAudioContext.jsx';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AlarmAudioProvider>
          <App />
        </AlarmAudioProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
