# Deploy Sesh for free

Use **Vercel Hobby** (website), **Render Free** (Django), **Neon Free** (PostgreSQL), and **Brevo Free** (account emails). No custom domain is required. Choose Free/Hobby when creating each service; plans and quotas can change.

Repository: https://github.com/staggerxlee/Sesh — branch `main`.

## Current deployment and deferred email setup — November 17, 2026

- Frontend: https://sesh-beta.vercel.app
- Backend: https://sesh-api-um2g.onrender.com
- The owner explicitly deferred Brevo phone verification because the SMS code did not arrive. Leave `BREVO_API_KEY` empty until activation is completed; never use a fake key or log account email links.
- Registration and password sign-in remain available, and accounts stay unverified until their owners verify them. Password-reset emails are unavailable during this interim setup.
- To finish later: complete Brevo phone verification, create `Sesh production email` with **Restricted → Transactional email: All** (all other categories None), and save the generated key only in Render's `BREVO_API_KEY`. The approved scope includes sending, templates, block lists, and delivery logs. The prepared key expiry was November 17, 2027, or 90 unused days; confirm the actual expiry when generating it.
- Verified sender: `Sesh <saswatkc123@gmail.com>`. After enabling the key, test verification and password-reset email delivery on the public frontend.
- These URLs identify the provisioned services; use the verification checklist below before treating the full deployment as ready.

## 1. Neon — saved accounts and study data

1. Sign in at [Neon](https://console.neon.tech/) and create a **Free** project called `sesh`.
2. Choose Singapore or the closest available region to Render Singapore. Keep the default database and role.
3. Click **Connect**, turn **connection pooling off**, and copy the full direct PostgreSQL connection string. Retain its TLS options, including `sslmode=require` and any `channel_binding` option.
4. Save it privately for Render's `DATABASE_URL`. It does not belong in GitHub or Vercel.

This small deployment uses one worker with four threads and a direct connection, including for migrations. Do not use the local development database URL. The new online database starts empty: your local accounts and history are not automatically uploaded.

## 2. Brevo — verification and password resets

Render Free blocks standard SMTP ports. The included HTTPS email adapter avoids that restriction.

1. Create a [Brevo Free account](https://www.brevo.com/) and complete any required transactional-email activation.
2. Under **Settings → Senders, Domains & Dedicated IPs → Senders**, add **Sesh** with an email address you own. Complete sender verification.
3. Under **SMTP & API → API Keys**, create an **API key**, not an SMTP key.
4. Keep the key privately for Render. Your sender setting is `Sesh <your-verified-email-address>`.

Brevo Free currently includes 300 emails/day. For free email addresses or unauthenticated domains, Brevo may rewrite the sender to a compliant domain. An authenticated domain is preferable if you have one. Test actual delivery after deployment and check spam folders. Do not use Django's console mail backend publicly: it logs private reset links instead of delivering them.

## 3. Vercel — create the website

At [Vercel New Project](https://vercel.com/new), import `staggerxlee/Sesh`:

| Setting | Value |
| --- | --- |
| Plan | Hobby |
| Project name | `sesh` or an available name |
| Production branch | `main` |
| Framework | Next.js |
| Root Directory | `frontend` |
| Node.js | `22.x` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output Directory | Leave the Next.js default |

Deploy once to obtain your stable **production domain**, such as `https://sesh-yourname.vercel.app`. Find it under **Settings → Domains**; do not use a commit-specific preview URL. The interface may load now, but accounts will not work until steps 4–5.

## 4. Render — create the backend

At [Render](https://dashboard.render.com/), choose **New → Blueprint**, connect `staggerxlee/Sesh`, and select `main`. Render reads the included `render.yaml`. It creates **one Free Docker web service** called `sesh-api` in Singapore, with no Render database. Confirm the selected plan stays Free.

Fill in the four prompted values:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Full direct Neon connection string from step 1 |
| `FRONTEND_URL` | Exact Vercel production URL, including `https://`, without a trailing slash |
| `BREVO_API_KEY` | Your Brevo API key |
| `DEFAULT_FROM_EMAIL` | `Sesh <your-verified-sender-address>` |

The Blueprint supplies these automatically:

| Variable / setting | Value |
| --- | --- |
| `DJANGO_DEBUG` | `0` |
| `DJANGO_SECRET_KEY` | Generated securely by Render; keep stable across updates |
| `EMAIL_BACKEND` | `study.email_backend.BrevoEmailBackend` |
| Dockerfile | `./backend/Dockerfile` |
| Docker build context | `./backend` |
| Health Check Path | `/health/` |
| Docker Command | Leave empty; use the Dockerfile default |

Django automatically allows Render's assigned hostname through `RENDER_EXTERNAL_HOSTNAME`. CSRF and CORS origins default to `FRONTEND_URL`; no wildcard or separate variables are needed. If you already set `CSRF_TRUSTED_ORIGINS` or `CORS_ALLOWED_ORIGINS`, update them to the same exact HTTPS frontend origin.

Startup checks the application, applies all database migrations (including calendar notes), and runs Gunicorn on Render's assigned port. One process with four threads keeps the in-memory throttles in one process. Configure a shared cache before increasing processes/instances.

When the service shows **Live**, copy the backend URL, e.g. `https://sesh-api-abcd.onrender.com`. Visit its `/health/` path and expect `{"status":"ok","service":"sesh"}`. The first request after idle can take about a minute.

## 5. Connect Vercel to Render

In **Vercel → project → Settings → Environment Variables**, add:

| Variable | Value | Environment |
| --- | --- | --- |
| `DJANGO_API_URL` | Your Render origin, e.g. `https://sesh-api-abcd.onrender.com` | Production |

Use **no trailing slash** and **no `/api` suffix**. Do not prefix the variable with `NEXT_PUBLIC_`.

Then **Deployments → latest production deployment → Redeploy**. The API rewrite is configured at build time, so redeployment is required after changing this value.

Browser API requests go through the Vercel origin to Django. Leave cookie domains unset; secure cookies and `SameSite=Lax` are already configured. Do not switch to cross-site cookies. If the Vercel production domain changes, update Render's `FRONTEND_URL`. A custom backend domain also requires `DJANGO_ALLOWED_HOSTS`. Preview deployments are not automatically authorized to use the production account backend.

## 6. Verify and share

Use your Vercel production URL:

1. Create an account and receive/open the verification email.
2. Add a subject, finish a short real study session, and confirm History and Calendar update.
3. Sign into the same account on a second device: records and notes should appear there.
4. Have your friend create a **separate account**. They should see their own history, not yours.
5. Test sign-out/sign-in and a real password-reset email.
6. Save a daily/monthly note, reload, and confirm it remains saved.

Share the **Vercel production URL**, not Render or `localhost:3000`. Your laptop does not need to stay on. Local accounts/history remain separate; request a deliberate migration if you want them transferred.

## Updates and free-plan limits

Keep Git integration and auto-deploy enabled for `main` on both hosts. Push tested updates to GitHub; both services rebuild, and Render applies migrations before starting. Neon retains online records across redeploys. Keep the same database and secret key instead of recreating them.

Render Free sleeps after 15 idle minutes and can take about a minute to wake. If the app initially reports a connection error, open the backend `/health/` URL, wait for it to respond, then reload Sesh. Active study heartbeats normally keep the backend busy, but outages can still trigger Sesh's conservative recovery flow. Free hosting is not an uptime guarantee.

Neon is used because Render's free PostgreSQL expires after 30 days. Sesh stores personal cover images in PostgreSQL, so they survive Render's temporary filesystem but count against database storage. Monitor free-plan quotas and keep exports/backups.

## Troubleshooting

| Problem | Check |
| --- | --- |
| Site loads but login fails | Render is Live; Vercel has `DJANGO_API_URL`; redeploy Vercel after changing it |
| First request times out | Wake Render through `/health/`, then reload the site |
| 403 CSRF | Render `FRONTEND_URL` exactly matches the Vercel production origin, including HTTPS |
| DisallowedHost | Automatic Render hostname should work; add custom backend domains to `DJANGO_ALLOWED_HOSTS` |
| Database startup failure | Complete direct Neon URL with TLS, not localhost or a pooled connection |
| Emails missing | Brevo transactional activation, verified sender, API key, delivery logs and spam folders |
| Old interface after push | Check both hosts deployed the latest `main` commit and inspect build logs |

Preparing this repository does not provision hosting. Live HTTPS, real email delivery and account isolation must be verified on the deployed URLs. The email adapter is tested using mocked HTTPS responses; no external test emails are sent.

## Official references

- [Render free limits](https://render.com/docs/free)
- [Render Blueprint settings](https://render.com/docs/blueprint-spec)
- [Neon Free plan](https://neon.com/pricing)
- [Vercel external rewrites](https://vercel.com/docs/routing/rewrites)
- [Brevo Free plan](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
- [Brevo email API](https://developers.brevo.com/reference/send-transac-email)
- [Brevo sender-domain handling](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders)
