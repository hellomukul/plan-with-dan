# Turning on "Continue with Google" and "Continue with Microsoft"

Plan with Dan signs students in with Google or Microsoft using OpenID Connect (authorization code + PKCE).
It asks only for `openid email profile`: no calendar, mail, contacts or files, and it stores no provider
tokens. Until a provider's two keys are set, its button is hidden and email + password works as before.
The server log says so once at startup ("Google sign-in is off ...").

You need about 10 minutes per provider. Do Google first: most students will use it.

Replace `plan-with-dan.onrender.com` below with your real Render address if it is different.

## Redirect URIs (copy exactly)

| Where | Google | Microsoft |
| --- | --- | --- |
| Render (live) | `https://plan-with-dan.onrender.com/api/auth/oauth/google/callback` | `https://plan-with-dan.onrender.com/api/auth/oauth/microsoft/callback` |
| Laptop (`uvicorn backend.main:app --port 8000`) | `http://localhost:8000/api/auth/oauth/google/callback` | `http://localhost:8000/api/auth/oauth/microsoft/callback` |
| Laptop with Vite (`npm run dev`, port 5173) | `http://localhost:5173/api/auth/oauth/google/callback` | `http://localhost:5173/api/auth/oauth/microsoft/callback` |

Use `localhost` in the browser when testing on a laptop (not `127.0.0.1`), because the URI has to match
character for character. The laptop rows are optional.

## 1. Google (Google Cloud Console)

1. Go to <https://console.cloud.google.com/>, create a project (e.g. "Plan with Dan").
2. **APIs & Services → OAuth consent screen** (now called **Google Auth Platform → Branding / Audience**):
   - User type / Audience: **External**.
   - App name "Plan with Dan", support email = your email, app logo optional (a logo triggers Google's
     brand review, so skip it for tomorrow).
   - Authorized domain: `onrender.com` (or your own domain).
   - Developer contact: your email.
   - Privacy policy link: `https://plan-with-dan.onrender.com/#/privacy`.
   - **Data Access / Scopes**: add only `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
     These are non-sensitive, so no Google verification is needed.
   - **Publishing status: click "Publish app" (In production)**. In "Testing" mode only the test users you
     list can sign in, and sessions expire after 7 days.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**, name "Plan with Dan web".
   - Authorized JavaScript origins: not needed.
   - **Authorized redirect URIs**: add the Google URIs from the table.
   - Create, then copy the **Client ID** and **Client secret**.

## 2. Microsoft (Microsoft Entra admin center)

Works for personal Outlook/Hotmail accounts and work/school accounts (Yale is Microsoft 365).

1. Go to <https://entra.microsoft.com/> (sign in with a personal Microsoft account if your Yale account
   can't register apps) → **Identity → Applications → App registrations → New registration**.
   - Name: "Plan with Dan".
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
     (this is the "common" tenant the app uses).
   - Redirect URI: platform **Web**, value = the Render Microsoft URI from the table. Register.
2. **Authentication**: add the laptop URIs if you want them. Leave "Access tokens" and "ID tokens" (implicit
   flow) **unticked**; the app uses the code flow.
3. **Certificates & secrets → Client secrets → New client secret**: 24 months. Copy the **Value** (not the
   Secret ID) right away; it is shown once. Put a calendar reminder to rotate it before it expires.
4. **Overview**: copy the **Application (client) ID**.
5. **Token configuration → Add optional claim → ID → tick `email` and `xms_edov`** → Add (accept the prompt to
   add the Graph `email` permission). `xms_edov` tells us Microsoft verified that the email belongs to the
   student's organisation or personal account. Without it, Microsoft sign-in still works for new students,
   but a student who already has a Dan account with that email is asked to log in with their password once
   and link Microsoft from Privacy and data (we won't join accounts on an unverified email).
6. **API permissions**: you should see only Microsoft Graph `openid`, `email`, `profile` (and maybe
   `User.Read`, which is harmless and unused). Don't add calendar or mail permissions.
7. Some organisations (possibly Yale) require admin consent for third-party apps. If a Yale student sees
   "Need admin approval", they can use Google or email instead; tell Yale ITS if you want it approved.
8. Optional: **Branding & properties** → add the privacy URL `https://plan-with-dan.onrender.com/#/privacy`.
   Publisher verification is not needed for sign-in only.

## 3. Render environment variables

Render dashboard → your service → **Environment** → add (these names are already listed in `render.yaml`
with `sync: false`, so Render shows them as empty slots):

| Key | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | the Google Client ID (ends in `.apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | the Google Client secret |
| `MICROSOFT_CLIENT_ID` | the Application (client) ID (a GUID) |
| `MICROSOFT_CLIENT_SECRET` | the client secret **Value** |
| `PUBLIC_BASE_URL` | `https://plan-with-dan.onrender.com` (no trailing slash). Pins the redirect URI so it always matches what you registered. |

Save; Render redeploys. Never put these values in the repo, in `.env` files you commit, or in chat.
For a laptop, put the same keys in the repo's untracked `.env` (and leave `PUBLIC_BASE_URL` unset).

## 4. Check it works

1. Open the live site, click **Sign up**: you should see "Continue with Google" / "Continue with Microsoft".
   If a button is missing, its two keys aren't both set (check the Render log line at startup).
2. Click Google, pick an account: you land on onboarding ("Hey <name>! ...") as a new student.
3. Sign out, click **Log in → Continue with Google** again: you go straight to Home (same account).
4. On the home page (signed out), build a week, click **Link your calendar → Continue with Google**: after
   onboarding you land on the Calendar page with the Apple / Google / Outlook buttons at the top, and the
   week you built is in your plan.
5. Privacy and data shows "Google is linked" with Unlink, and a "Link Microsoft" button.

`redirect_uri_mismatch` (Google) or `AADSTS50011` (Microsoft) means the URI registered doesn't exactly match.
Compare it with the table, including `https`, the host and the path; setting `PUBLIC_BASE_URL` fixes most cases.

## Account rules (for reference)

- Same Google/Microsoft account as before → signs in to its Dan account.
- New email → creates a free Dan account (the buttons say so before anyone clicks).
- Email already has a Dan account → signs in and links only when the provider confirms the email is the
  student's (Google `email_verified`, Microsoft `xms_edov`). The first time that happens for an account whose
  email was never verified, all its other sessions are signed out.
- Otherwise the student logs in the way they joined, then links from **Privacy and data**.
- Accounts without a password delete themselves by typing DELETE on Privacy and data (signed-in session plus
  same-origin check). Students can't unlink their only way to sign in.
