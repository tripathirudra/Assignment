# SecureID — Login & Registration Journey

A fully client-side (vanilla **HTML / CSS / JS** — no frameworks, no build step)
implementation of the Registration and Login journeys from the assignment
mockups, including OTP verification, MFA setup (authenticator/SMS/email),
error states, expiry timers, and success screens.

There is no backend — email/SMS "sending" and TOTP checking are simulated
in the browser so the whole journey can be demoed and graded without any
server. Registered accounts are kept in the browser's `localStorage`.

## Files

```
index.html    – page shell (brand panel + the dynamic screen container)
styles.css    – all styling (blue SecureID theme, responsive)
script.js     – app logic: state machine, screen templates, timers, validation
```

Open `index.html` directly in a browser, or serve the folder with any static
server — nothing to install, nothing to build.

## Demo credentials / codes

Because there's no real email/SMS/TOTP backend, this build shows the
expected code directly on screen ("Demo mode — the code is …") so you can
complete every flow:

| Step                          | Code to enter |
|---                             |---|
| Email OTP (registration/login) | `482913` |
| Mobile OTP (registration)      | `482913` |
| Authenticator / MFA code       | `241175` |

Enter the wrong code to see the error state (with an attempts-left
counter); let the timer run out to see the "code expired" state; use
**Resend** to get a fresh timer.

To see **Invalid credentials**, try logging in with an email that hasn't
been registered yet, or the wrong password for one that has.

## Flows implemented

**Registration:** account details → email OTP (+ wrong/expired states) →
mobile OTP (+ wrong/max-attempts states) → choose MFA method → authenticator
QR setup (or straight to code entry for SMS/Email MFA) → verify 6-digit code
(+ wrong state) → success screen → continue to login.

**Login:** email/password → invalid-credentials state → choose verification
method → OTP screen (+ wrong/expired states) → signed-in dashboard → log out.

## Deploying to Vercel

1. Push this folder to a GitHub repo.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. Framework preset: **Other** (it's static — no build command, no output
   directory override needed).
4. Rename the project to `your-name-secureid` before deploying so the URL
   matches `your-name-secureid.vercel.app`.
5. Deploy — Vercel will serve `index.html` at the root automatically.

Or from the CLI, from inside this folder:

```bash
npm i -g vercel
vercel --prod
```
