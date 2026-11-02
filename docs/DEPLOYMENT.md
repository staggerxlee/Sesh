# Deploying Sesh

Deploy the frontend and backend separately. Sesh has not been deployed by this build.

1. Provision a managed PostgreSQL database and set the backend `DATABASE_URL` using the provider's TLS configuration. Do not use the development trust database or local example password in production.
2. Deploy `backend/` with its Dockerfile or Python hosting. Install `requirements.lock.txt`, run `python manage.py migrate --noinput` as a release step, and run Gunicorn. Configure a random `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=0`, exact `DJANGO_ALLOWED_HOSTS`, and the public `FRONTEND_URL`.
3. Set `CSRF_TRUSTED_ORIGINS` to the HTTPS frontend origin. For the included same-origin proxy, the browser sends cookies only to the frontend; do not set a backend-only cookie domain. Set CORS origins explicitly if direct browser-to-API access is introduced. Avoid cross-site cookies when the same-origin proxy suffices.
4. Configure SMTP `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, credentials, TLS and a verified `DEFAULT_FROM_EMAIL`. Test real verification and password-reset delivery before launch. Development console mail is not real delivery.
5. Deploy `frontend/` as the Vercel project root, build with `npm run build`, and configure server-only `DJANGO_API_URL` to the backend HTTPS origin. The included `/api/:path*` rewrite forwards cookies and CSRF headers and preserves Django's required trailing slash.
6. Terminate HTTPS at a trusted reverse proxy that overwrites `X-Forwarded-Proto`. Django uses this header for secure request detection. Do not expose a backend that trusts arbitrary client-supplied forwarding headers.
7. Run `python manage.py check --deploy` in the actual production configuration. Configure database backups, health checks, error monitoring and real load tests. Verify cookie flags, verification/reset links, cross-origin behavior, and account isolation at the deployed origins.

Session/authentication rate limits currently use Django's local-memory cache. Before using multiple web workers or multiple replicas in production, configure a shared cache for consistent rate limiting (for example Django RedisCache with Redis) and edge-level request limits. On-demand reports require no Celery worker. Redis here would serve shared throttling, not scheduled report generation.

The frontend has no embedded secrets or browser-stored authentication tokens. Local storage holds only last-used timer settings and unsynced timer intent. Session history and calculations are authoritative in Django/PostgreSQL.

Reference documentation used for integration: [Next.js rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites), [Django CSRF](https://docs.djangoproject.com/en/5.2/howto/csrf/), [DRF session authentication](https://www.django-rest-framework.org/api-guide/authentication/#sessionauthentication).
