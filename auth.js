// ============================================================
// StepShield — auth (Local Storage only, prototype-grade)
// ============================================================

const SS_USERS_KEY = 'stepshield_users';
const SS_SESSION_KEY = 'stepshield_session';

function ssGetUsers(){
  try{ return JSON.parse(localStorage.getItem(SS_USERS_KEY)) || {}; }
  catch(e){ return {}; }
}
function ssSaveUsers(users){
  localStorage.setItem(SS_USERS_KEY, JSON.stringify(users));
}
function ssSetSession(email){
  localStorage.setItem(SS_SESSION_KEY, email);
}
function ssGetSession(){
  return localStorage.getItem(SS_SESSION_KEY);
}
function ssLogout(){
  localStorage.removeItem(SS_SESSION_KEY);
  window.location.href = 'login.html';
}
function ssCurrentUser(){
  const email = ssGetSession();
  if(!email) return null;
  const users = ssGetUsers();
  return users[email] || null;
}
function ssRequireAuth(){
  if(!ssGetSession()){
    window.location.href = 'login.html';
  }
}

function ssShowFieldError(fieldEl, message){
  fieldEl.classList.add('error');
  const errEl = fieldEl.querySelector('.field-error');
  if(errEl) errEl.textContent = message;
}
function ssClearFieldError(fieldEl){
  fieldEl.classList.remove('error');
}

// ---------------- Signup form ----------------
(function(){
  const form = document.getElementById('signupForm');
  if(!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameField = document.getElementById('field-name');
    const emailField = document.getElementById('field-email');
    const passField = document.getElementById('field-password');
    const confirmField = document.getElementById('field-confirm');
    [nameField, emailField, passField, confirmField].forEach(ssClearFieldError);

    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim().toLowerCase();
    const password = document.getElementById('signupPassword').value;
    const confirm = document.getElementById('signupConfirm').value;

    let valid = true;
    if(name.length < 2){ ssShowFieldError(nameField, 'Enter your full name.'); valid = false; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ ssShowFieldError(emailField, 'Enter a valid email address.'); valid = false; }
    if(password.length < 6){ ssShowFieldError(passField, 'Password must be at least 6 characters.'); valid = false; }
    if(confirm !== password){ ssShowFieldError(confirmField, 'Passwords do not match.'); valid = false; }
    if(!valid) return;

    const users = ssGetUsers();
    if(users[email]){
      ssShowFieldError(emailField, 'An account with this email already exists.');
      return;
    }
    users[email] = {
      name,
      email,
      password, // prototype only — never store plaintext passwords in production
      createdAt: new Date().toISOString(),
      analyses: 0,
      savedRoutes: []
    };
    ssSaveUsers(users);
    ssSetSession(email);
    window.location.href = 'dashboard.html';
  });
})();

// ---------------- Login form ----------------
(function(){
  const form = document.getElementById('loginForm');
  if(!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const emailField = document.getElementById('field-login-email');
    const passField = document.getElementById('field-login-password');
    [emailField, passField].forEach(ssClearFieldError);

    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;

    const users = ssGetUsers();
    const user = users[email];
    if(!user){
      ssShowFieldError(emailField, 'No account found with this email.');
      return;
    }
    if(user.password !== password){
      ssShowFieldError(passField, 'Incorrect password.');
      return;
    }
    ssSetSession(email);
    window.location.href = 'dashboard.html';
  });
})();

// ---------------- Google button (UI only) ----------------
document.querySelectorAll('.google-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    showToast('Google Sign-In is a UI preview in this prototype.');
  });
});

// ---------------- App shell: user chip + menu ----------------
(function(){
  const chip = document.getElementById('userChip');
  if(!chip) return;
  ssRequireAuth();
  const user = ssCurrentUser();
  if(!user) return;

  const initials = user.name.trim().split(/\s+/).map(p => p[0]).slice(0,2).join('').toUpperCase();
  const avatarEl = chip.querySelector('.user-avatar');
  const nameEl = chip.querySelector('span');
  if(avatarEl) avatarEl.textContent = initials;
  if(nameEl) nameEl.textContent = user.name.split(' ')[0];

  const menu = document.getElementById('userMenu');
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });
  document.addEventListener('click', () => menu.classList.remove('open'));

  const logoutBtn = document.getElementById('logoutBtn');
  if(logoutBtn) logoutBtn.addEventListener('click', ssLogout);
})();
