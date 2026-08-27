/* ==========================================================================
   SecureID — app.js
   Plain vanilla JS. No frameworks, no build step.

   HOW THIS FILE IS ORGANISED
   1. Constants & "backend" simulation (localStorage as our fake database)
   2. Small DOM / formatting helpers
   3. App state (one object, one source of truth)
   4. Screen templates  -> each function returns an HTML string
   5. render() -> puts the right template into #screen-root and wires events
   6. Timer helpers (OTP expiry + resend cooldown)
   7. Boot
   ========================================================================== */

/* -----------------------------------------------------------------------
   1. Constants & fake backend
   In a real app these values + checks would live on a server. Here we
   simulate everything in the browser so the flow can be demoed with no
   backend at all.
----------------------------------------------------------------------- */
const DEMO_OTP = "482913";        // "emailed" / "texted" code used everywhere
const DEMO_MFA_CODE = "241175";   // code an authenticator app would show
const OTP_EXPIRY_SECONDS = 165;   // 2:45, matches the mock
const RESEND_COOLDOWN_SECONDS = 25;
const MAX_OTP_ATTEMPTS = 2;       // wrong tries allowed before "max attempts"

const DB_KEY = "secureid_users";

function getUsers() {
  try {
    return JSON.parse(localStorage.getItem(DB_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(DB_KEY, JSON.stringify(users));
}

function findUserByEmail(email) {
  return getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
}

function upsertUser(user) {
  const users = getUsers().filter(u => u.email.toLowerCase() !== user.email.toLowerCase());
  users.push(user);
  saveUsers(users);
}

/* -----------------------------------------------------------------------
   2. Small helpers
----------------------------------------------------------------------- */
const root = document.getElementById("screen-root");

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function maskEmail(email) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const visible = name.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(name.length - 2, 2))}@${domain}`;
}

function maskMobile(mobile) {
  return mobile.replace(/\d(?=\d{2})/g, "*");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, 2200);
}

function icon(name) {
  const icons = {
    mail: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 6h18v12H3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 7l9 6 9-6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    phone: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1L6.6 10.8z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    shield: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2L4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5l-8-3z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    alert: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 3l10 18H2L12 3z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 10v4M12 17h.01" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    clock: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    check: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M4 12.5l5 5L20 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    lock: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="5" y="10.5" width="14" height="9.5" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.7"/></svg>',
    eye: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/></svg>',
    eyeOff: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9.9 5.1A10.9 10.9 0 0 1 12 5c7 0 11 7 11 7a17.6 17.6 0 0 1-3.2 3.9M6.5 6.7C3.7 8.4 2 11 2 11s2.4 4.8 7.5 6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9.9 12a2.1 2.1 0 0 0 3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    user: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.7"/><path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  };
  return icons[name] || "";
}

function randomBase32(len) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/* Draws a QR-look-alike (not a real scannable code — there's no backend to
   scan against in this demo). Deterministic per-secret so it always looks
   the same for the same account. */
function drawFakeQr(canvas, seedText) {
  const size = 21; // like a small QR "version"
  const ctx = canvas.getContext("2d");
  const cell = canvas.width / size;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0f172a";

  // simple seeded pseudo-random generator so it's stable per secret
  let seed = 0;
  for (let i = 0; i < seedText.length; i++) seed += seedText.charCodeAt(i) * (i + 1);
  function rand() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (rand() > 0.55) ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  // finder patterns (the three big squares every QR code has)
  function finder(px, py) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(px * cell, py * cell, 7 * cell, 7 * cell);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(px * cell, py * cell, 7 * cell, 7 * cell);
    ctx.fillStyle = "#fff";
    ctx.fillRect((px + 1) * cell, (py + 1) * cell, 5 * cell, 5 * cell);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect((px + 2) * cell, (py + 2) * cell, 3 * cell, 3 * cell);
  }
  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);
}

/* -----------------------------------------------------------------------
   3. App state
----------------------------------------------------------------------- */
const state = {
  screen: "login",
  registration: {
    fullName: "",
    email: "",
    mobile: "",
    password: "",
    mfaMethod: "authenticator",
    mfaSecret: "",
  },
  loginEmail: "",
  loginMethod: "email",
  otp: {
    attempts: 0,
    error: false,
    resendCount: 0,
  },
  currentUser: null,
  timers: { expiry: null, resend: null },
};

function clearTimers() {
  if (state.timers.expiry) clearInterval(state.timers.expiry);
  if (state.timers.resend) clearInterval(state.timers.resend);
  state.timers.expiry = null;
  state.timers.resend = null;
}

function goTo(screen) {
  clearTimers();
  state.screen = screen;
  render();
}

/* -----------------------------------------------------------------------
   4. Screen templates
----------------------------------------------------------------------- */

function tplProgress(step, total) {
  let dots = "";
  for (let i = 1; i <= total; i++) {
    const cls = i < step ? "done" : i === step ? "active" : "";
    dots += `<span class="${cls}"></span>`;
  }
  return `<div class="progress-dots">${dots}</div>`;
}

function tplBack(target) {
  return `<div class="back-row"><button type="button" class="back-btn" data-back="${target}" aria-label="Go back">←</button></div>`;
}

/* ---- REGISTRATION: step 1 — details ---- */
function screenRegisterDetails() {
  const r = state.registration;
  return `
    ${tplProgress(1, 4)}
    <div class="screen-icon">${icon("shield")}</div>
    <h1 class="screen-title">Create your account</h1>
    <p class="screen-sub">Let's get you started</p>
    <form id="form-register">
      <div class="field">
        <label for="fullName">Full Name</label>
        <div class="input-wrap">${icon("user")}
          <input id="fullName" name="fullName" type="text" placeholder="Priya Sharma" value="${r.fullName}" required>
        </div>
      </div>
      <div class="field">
        <label for="email">Email</label>
        <div class="input-wrap">${icon("mail")}
          <input id="email" name="email" type="email" placeholder="priya.sharma@email.com" value="${r.email}" required>
        </div>
        <span class="field-error" id="err-email" hidden></span>
      </div>
      <div class="field">
        <label for="mobile">Mobile Number</label>
        <div class="input-wrap">${icon("phone")}
          <input id="mobile" name="mobile" type="tel" placeholder="+91 98765 43210" value="${r.mobile}" required>
        </div>
      </div>
      <div class="field">
        <label for="password">Password</label>
        <div class="input-wrap">${icon("lock")}
          <input id="password" name="password" type="password" placeholder="••••••••" required>
          <button type="button" class="toggle-eye" data-toggle-pw="password">${icon("eye")}</button>
        </div>
        <div class="pw-rules" id="pw-rules">
          <span data-rule="len">8+ characters</span>
          <span data-rule="upper">1 uppercase letter</span>
          <span data-rule="num">1 number</span>
          <span data-rule="special">1 special character</span>
        </div>
      </div>
      <label class="checkbox-row">
        <input type="checkbox" id="agree" required>
        <span>I agree to the <a href="#" onclick="return false;">Terms &amp; Conditions</a> and <a href="#" onclick="return false;">Privacy Policy</a></span>
      </label>
      <button type="submit" class="btn btn-primary">Create Account</button>
    </form>
    <p class="footer-note">Already have an account? <a href="#" class="link" data-goto="login">Login</a></p>
  `;
}

/* ---- Generic OTP screen (used for reg-email, reg-mobile, login-otp) ---- */
function screenOtp(opts) {
  // opts: { title, subtitle, step, total, errorText, expired, locked, attemptsLeftText, backTarget }
  const blocked = opts.expired || opts.locked;
  const rowClass = blocked ? "otp-row expired" : opts.errorText ? "otp-row error" : "otp-row";
  let inputs = "";
  for (let i = 0; i < 6; i++) {
    inputs += `<input type="text" inputmode="numeric" maxlength="1" data-otp-index="${i}" ${blocked ? "disabled" : ""} autocomplete="one-time-code">`;
  }
  return `
    ${opts.total ? tplProgress(opts.step, opts.total) : ""}
    ${opts.backTarget ? tplBack(opts.backTarget) : ""}
    <div class="screen-icon ${blocked ? "danger" : ""}">${icon(blocked ? "clock" : "mail")}</div>
    <h1 class="screen-title">${opts.title}</h1>
    <p class="screen-sub">${opts.subtitle}</p>

    <div class="${rowClass}" id="otp-row">${inputs}</div>

    ${opts.errorText ? `<p class="otp-error-msg">${opts.errorText}${opts.attemptsLeftText ? `<small>${opts.attemptsLeftText}</small>` : ""}</p>` : ""}

    ${blocked
      ? `<p class="otp-meta" style="color:var(--danger); font-weight:600;">${opts.locked ? "Maximum attempts reached" : "Code expired"}</p>
         <p class="otp-meta" style="margin-top:2px;">${opts.locked ? "Please request a new code to try again." : "You can request a new code below."}</p>
         <button type="button" class="btn btn-primary" id="btn-resend-expired" style="margin-top:14px;">Resend code</button>`
      : `<p class="otp-meta">Code expires in <span class="timer" id="expiryTimer">${formatTime(OTP_EXPIRY_SECONDS)}</span></p>
         <div class="resend-row">
           Didn't receive the code? <button type="button" id="btn-resend" disabled>Resend (<span id="resendTimer">${formatTime(RESEND_COOLDOWN_SECONDS)}</span>)</button>
         </div>`
    }

        <div class="demo-hint">Demo mode — the code is <strong>${DEMO_OTP}</strong></div>

  `;
}

/* ---- REGISTRATION: MFA — choose method ---- */
function screenMfaChoose() {
  const r = state.registration;
  const opts = [
    { id: "authenticator", icon: "lock", title: "Authenticator App", sub: "Google Authenticator, Authy, etc." },
    { id: "sms", icon: "phone", title: "SMS Authentication", sub: "Receive a code on your mobile" },
    { id: "email", icon: "mail", title: "Email Authentication", sub: "Receive a code on your email" },
  ];
  return `
    ${tplProgress(3, 4)}
    <div class="screen-icon">${icon("shield")}</div>
    <h1 class="screen-title">Set up Multi-Factor Auth</h1>
    <p class="screen-sub">Add an extra layer of security to protect your account</p>
    <div class="method-list">
      ${opts.map(o => `
        <label class="method-option ${r.mfaMethod === o.id ? "selected" : ""}" data-method-option="${o.id}">
          <span class="m-icon">${icon(o.icon)}</span>
          <span class="m-text">
            <span class="m-title">${o.title}</span>
            <span class="m-sub">${o.sub}</span>
          </span>
          <input type="radio" name="mfaMethod" value="${o.id}" ${r.mfaMethod === o.id ? "checked" : ""}>
        </label>
      `).join("")}
    </div>
    <button type="button" class="btn btn-primary" id="btn-mfa-continue" style="margin-top:20px;">Continue</button>
  `;
}

/* ---- REGISTRATION: MFA — authenticator QR setup ---- */
function screenMfaSetup() {
  const r = state.registration;
  return `
    ${tplProgress(3, 4)}
    ${tplBack("mfa-choose")}
    <div class="screen-icon">${icon("shield")}</div>
    <h1 class="screen-title">Scan QR Code</h1>
    <p class="screen-sub">Open your authenticator app and scan this QR code</p>
    <div class="qr-box"><canvas id="qrCanvas" width="150" height="150"></canvas></div>
    <p class="secret-key">Can't scan? <a href="#" class="link" id="toggle-secret">Enter setup key</a></p>
    <p class="secret-key" id="secret-text" hidden>Setup key: <code>${r.mfaSecret}</code></p>
    <button type="button" class="btn btn-primary" id="btn-scanned-continue" style="margin-top:18px;">Continue</button>
  `;
}

/* ---- REGISTRATION: MFA — enter 6-digit verification code ---- */
function screenMfaVerify(opts) {
  opts = opts || {};
  const rowClass = opts.errorText ? "otp-row error" : "otp-row";
  let inputs = "";
  for (let i = 0; i < 6; i++) {
    inputs += `<input type="text" inputmode="numeric" maxlength="1" data-otp-index="${i}" autocomplete="one-time-code">`;
  }
  return `
    ${tplProgress(3, 4)}
    ${tplBack("mfa-setup")}
    <div class="screen-icon">${icon("shield")}</div>
    <h1 class="screen-title">Enter the 6-digit code</h1>
    <p class="screen-sub">Enter the code from your authenticator app</p>
    <div class="${rowClass}" id="otp-row">${inputs}</div>
    ${opts.errorText ? `<p class="otp-error-msg">${opts.errorText}${opts.attemptsLeftText ? `<small>${opts.attemptsLeftText}</small>` : ""}</p>` : ""}
    <p class="footer-note" style="margin-top:16px;"><a href="#" class="link" data-goto="mfa-choose">Can't access your app?</a></p>
    <div class="demo-hint">Demo mode — the code is <strong>${DEMO_MFA_CODE}</strong></div>
  `;
}

/* ---- REGISTRATION: success ---- */
function screenRegSuccess() {
  return `
    <div class="screen-icon success">${icon("check")}</div>
    <h1 class="screen-title">Account created!</h1>
    <p class="screen-sub">Your account has been created successfully and MFA is enabled.</p>
    <div class="success-list">
      <div class="success-item"><span class="tick">${icon("check")}</span> Email verified</div>
      <div class="success-item"><span class="tick">${icon("check")}</span> Mobile verified</div>
      <div class="success-item"><span class="tick">${icon("check")}</span> MFA enabled</div>
    </div>
    <button type="button" class="btn btn-primary" id="btn-continue-login" style="margin-top:22px;">Continue to Login</button>
  `;
}

/* ---- LOGIN: default / invalid ---- */
function screenLogin(invalid) {
  return `
    <div class="screen-icon ${invalid ? "danger" : ""}">${icon("shield")}</div>
    <h1 class="screen-title">Welcome back!</h1>
    <p class="screen-sub">Login to your account</p>
    <form id="form-login">
      <div class="field">
        <label for="loginEmail">Email or Username</label>
        <div class="input-wrap ${invalid ? "error" : ""}">${icon("user")}
          <input id="loginEmail" name="loginEmail" type="text" placeholder="you@email.com" value="${state.loginEmail}" required>
        </div>
      </div>
      <div class="field">
        <label for="loginPassword">Password</label>
        <div class="input-wrap ${invalid ? "error" : ""}">${icon("lock")}
          <input id="loginPassword" name="loginPassword" type="password" placeholder="••••••••" required>
          <button type="button" class="toggle-eye" data-toggle-pw="loginPassword">${icon("eye")}</button>
        </div>
        ${invalid ? `<span class="field-error">Invalid email or password. Please try again.</span>` : ""}
      </div>
      <div class="row-between">
        <label class="checkbox-row" style="align-items:center;"><input type="checkbox"><span>Remember me</span></label>
        <a href="#" class="link" onclick="return false;">Forgot password?</a>
      </div>
      <button type="submit" class="btn btn-primary">Login</button>
    </form>
    <div class="divider">or</div>
    <button type="button" class="btn btn-outline" onclick="showToast('Google sign-in is not wired up in this demo')">Continue with Google</button>
    <p class="footer-note">New here? <a href="#" class="link" data-goto="register">Create an account</a></p>
    ${!invalid ? `<div class="demo-hint">No account yet? Register first — or use any email that isn't registered to see the "invalid credentials" state.</div>` : ""}
  `;
}

/* ---- LOGIN: choose 2FA method ---- */
function screenLoginChooseMethod() {
  const opts = [
    { id: "email", icon: "mail", title: "Email OTP", sub: "Receive a code on your email" },
    { id: "sms", icon: "phone", title: "SMS OTP", sub: "Receive a code on your mobile" },
    { id: "authenticator", icon: "lock", title: "Authenticator App", sub: "Enter code from your authenticator app" },
  ];
  return `
    ${tplBack("login")}
    <div class="screen-icon">${icon("shield")}</div>
    <h1 class="screen-title">Verify your identity</h1>
    <p class="screen-sub">Choose a method to continue</p>
    <div class="method-list">
      ${opts.map(o => `
        <label class="method-option ${state.loginMethod === o.id ? "selected" : ""}" data-method-option="${o.id}">
          <span class="m-icon">${icon(o.icon)}</span>
          <span class="m-text"><span class="m-title">${o.title}</span><span class="m-sub">${o.sub}</span></span>
          <input type="radio" name="loginMethod" value="${o.id}" ${state.loginMethod === o.id ? "checked" : ""}>
        </label>
      `).join("")}
    </div>
    <button type="button" class="btn btn-primary" id="btn-login-method-continue" style="margin-top:20px;">Continue</button>
  `;
}

/* ---- LOGIN: success / dashboard ---- */
function screenDashboard() {
  const u = state.currentUser;
  const initial = (u && u.fullName ? u.fullName[0] : "U").toUpperCase();
  return `
    <div class="dash-avatar">${initial}</div>
    <h1 class="screen-title" style="text-align:center;">Welcome, ${u ? u.fullName : "there"}!</h1>
    <p class="screen-sub">You're securely signed in to SecureID.</p>
    <div class="success-list" style="margin-top:22px;">
      <div class="success-item"><span class="tick">${icon("check")}</span> ${u ? u.email : ""}</div>
      <div class="success-item"><span class="tick">${icon("check")}</span> MFA verified this session</div>
    </div>
    <button type="button" class="btn btn-outline" id="btn-logout" style="margin-top:22px;">Log out</button>
  `;
}

/* -----------------------------------------------------------------------
   5. render() — draws the current screen and wires up its events
----------------------------------------------------------------------- */
function render() {
  const s = state.screen;
  let html = "";

  if (s === "register") html = screenRegisterDetails();
  else if (s === "reg-email-otp") html = screenOtp(buildRegEmailOtpOpts());
  else if (s === "reg-mobile-otp") html = screenOtp(buildRegMobileOtpOpts());
  else if (s === "mfa-choose") html = screenMfaChoose();
  else if (s === "mfa-setup") html = screenMfaSetup();
  else if (s === "mfa-verify") html = screenMfaVerify(state._mfaVerifyOpts || {});
  else if (s === "reg-success") html = screenRegSuccess();
  else if (s === "login") html = screenLogin(false);
  else if (s === "login-invalid") html = screenLogin(true);
  else if (s === "login-choose-method") html = screenLoginChooseMethod();
  else if (s === "login-otp") html = screenOtp(buildLoginOtpOpts());
  else if (s === "dashboard") html = screenDashboard();
  else html = screenLogin(false);

  root.innerHTML = html;
  wireEvents(s);

  if (["reg-email-otp", "reg-mobile-otp", "login-otp"].includes(s) && !root.querySelector(".otp-row.expired")) {
    startOtpTimers(s);
  }
  const firstOtp = root.querySelector('[data-otp-index="0"]');
  if (firstOtp) firstOtp.focus();
}

function buildRegEmailOtpOpts() {
  const o = state.otp;
  return {
    title: "Verify your email",
    subtitle: `We have sent a 6-digit code to<br><strong>${state.registration.email || "your email"}</strong>`,
    step: 2, total: 4,
    errorText: o.error ? "Incorrect code. Please try again." : "",
    attemptsLeftText: o.error ? `You have ${MAX_OTP_ATTEMPTS - o.attempts} attempt${MAX_OTP_ATTEMPTS - o.attempts === 1 ? "" : "s"} left.` : "",
    expired: o.expired || false,
    locked: o.locked || false,
  };
}
function buildRegMobileOtpOpts() {
  const o = state.otp;
  return {
    title: "Verify your mobile",
    subtitle: `We have sent a 6-digit code to<br><strong>${state.registration.mobile || "your mobile"}</strong>`,
    step: 2, total: 4,
    errorText: o.error ? "Incorrect code. Please try again." : "",
    attemptsLeftText: o.error ? `You have ${MAX_OTP_ATTEMPTS - o.attempts} attempt${MAX_OTP_ATTEMPTS - o.attempts === 1 ? "" : "s"} left.` : "",
    expired: o.expired || false,
    locked: o.locked || false,
  };
}
function buildLoginOtpOpts() {
  const o = state.otp;
  const label = state.loginMethod === "sms" ? maskMobile((state.currentUser && state.currentUser.mobile) || "") : maskEmail(state.loginEmail);
  return {
    title: state.loginMethod === "sms" ? "Verify your mobile" : "Verify your identity",
    subtitle: `We have sent a 6-digit code to<br><strong>${label}</strong>`,
    backTarget: "login-choose-method",
    errorText: o.error ? "Incorrect code. Please try again." : "",
    attemptsLeftText: o.error ? `You have ${MAX_OTP_ATTEMPTS - o.attempts} attempt${MAX_OTP_ATTEMPTS - o.attempts === 1 ? "" : "s"} left.` : "",
    expired: o.expired || false,
    locked: o.locked || false,
  };
}

/* -----------------------------------------------------------------------
   6. Timers
----------------------------------------------------------------------- */
function startOtpTimers(screenName) {
  let remainingExpiry = OTP_EXPIRY_SECONDS;
  let remainingResend = RESEND_COOLDOWN_SECONDS;

  const expiryEl = document.getElementById("expiryTimer");
  const resendBtn = document.getElementById("btn-resend");
  const resendTimerEl = document.getElementById("resendTimer");

  state.timers.expiry = setInterval(() => {
    remainingExpiry -= 1;
    if (expiryEl) {
      expiryEl.textContent = formatTime(remainingExpiry);
      if (remainingExpiry <= 30) expiryEl.classList.add("low");
    }
    if (remainingExpiry <= 0) {
      clearTimers();
      state.otp.expired = true;
      render();
    }
  }, 1000);

  state.timers.resend = setInterval(() => {
    remainingResend -= 1;
    if (resendTimerEl) resendTimerEl.textContent = formatTime(remainingResend);
    if (remainingResend <= 0) {
      clearInterval(state.timers.resend);
      if (resendBtn) {
        resendBtn.disabled = false;
        resendBtn.innerHTML = "Resend code";
      }
    }
  }, 1000);
}

/* -----------------------------------------------------------------------
   7. Event wiring per screen
----------------------------------------------------------------------- */
function wireEvents(screenName) {
  // Back buttons (present on several screens)
  root.querySelectorAll("[data-back]").forEach(btn => {
    btn.addEventListener("click", () => goTo(btn.dataset.back));
  });
  // Plain "go to screen" links
  root.querySelectorAll("[data-goto]").forEach(el => {
    el.addEventListener("click", (e) => { e.preventDefault(); goTo(el.dataset.goto); });
  });
  // Password show/hide toggles
  root.querySelectorAll("[data-toggle-pw]").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.togglePw);
      const isPw = input.type === "password";
      input.type = isPw ? "text" : "password";
      btn.innerHTML = isPw ? icon("eyeOff") : icon("eye");
    });
  });

  if (screenName === "register") wireRegisterDetails();
  if (screenName === "reg-email-otp") wireOtpInputs(handleRegEmailOtpSubmit, "reg-email");
  if (screenName === "reg-mobile-otp") wireOtpInputs(handleRegMobileOtpSubmit, "reg-mobile");
  if (screenName === "mfa-choose") wireMfaChoose();
  if (screenName === "mfa-setup") wireMfaSetup();
  if (screenName === "mfa-verify") wireOtpInputs(handleMfaVerifySubmit, "mfa");
  if (screenName === "reg-success") wireRegSuccess();
  if (screenName === "login") wireLoginForm();
  if (screenName === "login-invalid") wireLoginForm();
  if (screenName === "login-choose-method") wireLoginChooseMethod();
  if (screenName === "login-otp") wireOtpInputs(handleLoginOtpSubmit, "login");
  if (screenName === "dashboard") wireDashboard();
}

/* ---- shared OTP input behaviour (auto-advance, backspace, paste) ---- */
function wireOtpInputs(onComplete, kind) {
  const inputs = Array.from(root.querySelectorAll("[data-otp-index]"));
  if (!inputs.length) return;

  inputs.forEach((input, idx) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 1);
      if (input.value && idx < inputs.length - 1) inputs[idx + 1].focus();
      maybeSubmit();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && idx > 0) inputs[idx - 1].focus();
    });
    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData.getData("text") || "").replace(/\D/g, "");
      text.split("").slice(0, inputs.length).forEach((ch, i) => { inputs[i].value = ch; });
      const last = Math.min(text.length, inputs.length) - 1;
      if (last >= 0) inputs[last].focus();
      maybeSubmit();
    });
  });

  // resend buttons
  const resendBtn = document.getElementById("btn-resend");
  if (resendBtn) resendBtn.addEventListener("click", () => onResend(kind));
  const resendExpiredBtn = document.getElementById("btn-resend-expired");
  if (resendExpiredBtn) resendExpiredBtn.addEventListener("click", () => onResend(kind));

  function maybeSubmit() {
    const code = inputs.map(i => i.value).join("");
    if (code.length === inputs.length) onComplete(code);
  }
}

function onResend(kind) {
  state.otp.error = false;
  state.otp.expired = false;
  state.otp.locked = false;
  state.otp.attempts = 0;
  state.otp.resendCount += 1;
  showToast(`A new code has been sent (demo code: ${kind === "mfa" ? DEMO_MFA_CODE : DEMO_OTP})`);
  render();
}

/* ---- Registration: step 1 form ---- */
function wireRegisterDetails() {
  const form = document.getElementById("form-register");
  const pwInput = document.getElementById("password");
  const rules = { len: /.{8,}/, upper: /[A-Z]/, num: /[0-9]/, special: /[^A-Za-z0-9]/ };

  pwInput.addEventListener("input", () => {
    Object.keys(rules).forEach(key => {
      const el = document.querySelector(`[data-rule="${key}"]`);
      el.classList.toggle("ok", rules[key].test(pwInput.value));
    });
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const email = data.get("email").trim();

    if (findUserByEmail(email)) {
      const el = document.getElementById("err-email");
      el.textContent = "An account with this email already exists.";
      el.hidden = false;
      root.querySelector("#email").closest(".input-wrap").classList.add("error");
      return;
    }

    state.registration.fullName = data.get("fullName").trim();
    state.registration.email = email;
    state.registration.mobile = data.get("mobile").trim();
    state.registration.password = pwInput.value;
    resetOtpState();
    goTo("reg-email-otp");
  });
}

function resetOtpState() {
  state.otp = { attempts: 0, error: false, expired: false, locked: false, resendCount: 0 };
}

function handleRegEmailOtpSubmit(code) {
  if (code === DEMO_OTP) {
    resetOtpState();
    goTo("reg-mobile-otp");
  } else {
    registerWrongOtp();
  }
}
function handleRegMobileOtpSubmit(code) {
  if (code === DEMO_OTP) {
    resetOtpState();
    goTo("mfa-choose");
  } else {
    registerWrongOtp();
  }
}
function handleLoginOtpSubmit(code) {
  if (code === DEMO_OTP) {
    resetOtpState();
    goTo("dashboard");
  } else {
    registerWrongOtp();
  }
}
function handleMfaVerifySubmit(code) {
  if (code === DEMO_MFA_CODE) {
    if (state.mfaContext === "login") {
      // returning user completing MFA at login — nothing new to persist
      goTo("dashboard");
    } else {
      // finish registration: persist the new user
      const r = state.registration;
      upsertUser({
        fullName: r.fullName,
        email: r.email,
        mobile: r.mobile,
        password: r.password,
        mfaMethod: r.mfaMethod,
        mfaEnabled: true,
      });
      goTo("reg-success");
    }
  } else {
    const attempts = (state._mfaVerifyOpts && state._mfaVerifyOpts._attempts || 0) + 1;
    state._mfaVerifyOpts = {
      errorText: "Invalid code. Please try again.",
      attemptsLeftText: `You have ${Math.max(MAX_OTP_ATTEMPTS - attempts, 0)} attempt${MAX_OTP_ATTEMPTS - attempts === 1 ? "" : "s"} left.`,
      _attempts: attempts,
    };
    render();
    root.querySelector(".card")?.classList.add("shake");
  }
}

function registerWrongOtp() {
  state.otp.attempts += 1;
  if (state.otp.attempts > MAX_OTP_ATTEMPTS) {
    // Max attempts reached: force a fresh code
    showToast("Too many incorrect attempts. Please request a new code.");
    state.otp.attempts = 0;
    state.otp.error = false;
    state.otp.locked = true;
  } else {
    state.otp.error = true;
  }
  render();
}

/* ---- Registration: MFA choose ---- */
function wireMfaChoose() {
  root.querySelectorAll("[data-method-option]").forEach(opt => {
    opt.addEventListener("click", () => {
      state.registration.mfaMethod = opt.dataset.methodOption;
      root.querySelectorAll("[data-method-option]").forEach(o => o.classList.remove("selected"));
      opt.classList.add("selected");
      opt.querySelector('input[type="radio"]').checked = true;
    });
  });
  document.getElementById("btn-mfa-continue").addEventListener("click", () => {
    if (state.registration.mfaMethod === "authenticator") {
      state.registration.mfaSecret = randomBase32(16);
      goTo("mfa-setup");
    } else {
      // SMS / Email MFA: reuse the OTP verify screen with the generic 6-digit demo code
      state.mfaContext = "register";
      state._mfaVerifyOpts = {};
      goTo("mfa-verify");
    }
  });
}

function wireMfaSetup() {
  drawFakeQr(document.getElementById("qrCanvas"), state.registration.mfaSecret);
  document.getElementById("toggle-secret").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("secret-text").hidden = false;
  });
  document.getElementById("btn-scanned-continue").addEventListener("click", () => {
    state.mfaContext = "register";
    state._mfaVerifyOpts = {};
    goTo("mfa-verify");
  });
}

function wireRegSuccess() {
  document.getElementById("btn-continue-login").addEventListener("click", () => {
    state.loginEmail = state.registration.email;
    goTo("login");
  });
}

/* ---- Login ---- */
function wireLoginForm() {
  const form = document.getElementById("form-login");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const email = data.get("loginEmail").trim();
    const password = data.get("loginPassword");
    const user = findUserByEmail(email);

    state.loginEmail = email;

    if (!user || user.password !== password) {
      goTo("login-invalid");
      setTimeout(() => root.querySelector(".card")?.classList.add("shake"), 0);
      return;
    }

    state.currentUser = user;
    state.loginMethod = user.mfaMethod === "authenticator" ? "authenticator" : (user.mfaMethod || "email");
    resetOtpState();
    if (user.mfaMethod === "authenticator") {
      state.mfaContext = "login";
      state._mfaVerifyOpts = {};
      goTo("mfa-verify");
    } else {
      goTo("login-choose-method");
    }
  });
}

function wireLoginChooseMethod() {
  root.querySelectorAll("[data-method-option]").forEach(opt => {
    opt.addEventListener("click", () => {
      state.loginMethod = opt.dataset.methodOption;
      root.querySelectorAll("[data-method-option]").forEach(o => o.classList.remove("selected"));
      opt.classList.add("selected");
      opt.querySelector('input[type="radio"]').checked = true;
    });
  });
  document.getElementById("btn-login-method-continue").addEventListener("click", () => {
    resetOtpState();
    if (state.loginMethod === "authenticator") {
      state.mfaContext = "login";
      state._mfaVerifyOpts = {};
      goTo("mfa-verify");
    } else {
      goTo("login-otp");
    }
  });
}

function wireDashboard() {
  document.getElementById("btn-logout").addEventListener("click", () => {
    state.currentUser = null;
    state.loginEmail = "";
    goTo("login");
  });
}

/* -----------------------------------------------------------------------
   8. Boot
----------------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  render();
});
