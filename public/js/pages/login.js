// Login and Signup page controller.
// Handles tab toggling, credential submission, and session establishment.

import { login, signup } from '../api.js';
import { setSession } from '../session.js';

const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const errorBanner = document.getElementById('auth-error-banner');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.style.display = 'block';
}

function clearError() {
  errorBanner.textContent = '';
  errorBanner.style.display = 'none';
}

function getRedirectUrl(role) {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect');
  if (redirect) return decodeURIComponent(redirect);
  return role === 'organizer' ? '/organizer.html' : '/';
}

// Tab Switching
tabLogin.addEventListener('click', () => {
  clearError();
  tabLogin.style.color = 'var(--primary)';
  tabLogin.style.borderBottom = '3px solid var(--primary)';
  tabSignup.style.color = 'var(--gray-600)';
  tabSignup.style.borderBottom = '3px solid transparent';
  loginForm.style.display = 'block';
  signupForm.style.display = 'none';
});

tabSignup.addEventListener('click', () => {
  clearError();
  tabSignup.style.color = 'var(--primary)';
  tabSignup.style.borderBottom = '3px solid var(--primary)';
  tabLogin.style.color = 'var(--gray-600)';
  tabLogin.style.borderBottom = '3px solid transparent';
  loginForm.style.display = 'none';
  signupForm.style.display = 'block';
});

// Login Form Submit
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in...';

  try {
    const result = await login({ email, password });
    setSession(result);
    window.location.href = getRedirectUrl(result.user.role);
  } catch (err) {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Log In';
    showError(err.message || 'Invalid email or password');
  }
});

// Signup Form Submit
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const role = document.getElementById('signup-role').value;

  signupBtn.disabled = true;
  signupBtn.textContent = 'Creating account...';

  try {
    const result = await signup({ name, email, password, role });
    setSession(result);
    window.location.href = getRedirectUrl(result.user.role);
  } catch (err) {
    signupBtn.disabled = false;
    signupBtn.textContent = 'Create Account';
    showError(err.message || 'Could not complete signup');
  }
});
