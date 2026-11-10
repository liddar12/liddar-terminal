import { createClient } from '@supabase/supabase-js';
import { publicAuthConfig } from '../shared/authConfig.js';
import { makeAuthenticatedFetch } from './authTransport.js';

const config = publicAuthConfig(import.meta.env);
let client;

export function getAuthClient() {
  if (!config) return null;
  if (!client) {
    client = createClient(config.url, config.key, {
      auth: {
        // Retain a session only in this tab. Closing it removes local tokens.
        storage: window.sessionStorage,
        storageKey: 'terminal-owner-session',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

export function clearLocalSession() {
  window.sessionStorage.removeItem('terminal-owner-session');
}

export const authenticatedFetch = makeAuthenticatedFetch(getAuthClient, (...args) => fetch(...args), (token) => {
  window.dispatchEvent(new CustomEvent('terminal-session-expired', { detail: token }));
});
