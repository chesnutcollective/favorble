# Notification channels (email + SMS)

Favorble ships email via Resend and SMS via Twilio. Both providers are
wired directly against their REST APIs with `fetch()` — no SDKs — so
delivery activates the moment the relevant env vars are present and
degrades gracefully to in-app-only when they aren't.

No code changes are needed to turn real channels on or off. The
notification dispatcher (`lib/services/notification-dispatcher.ts`)
will record a clear `errorMessage` on the `notification_deliveries`
row when a channel is unconfigured, so ops can tell the difference
between "muted" and "misconfigured".

## Resend (email)

1. Sign up at [resend.com](https://resend.com). The free tier includes
   **3,000 emails/month** and 100 emails/day — enough for staging and
   early production.
2. Verify a sender domain. Under **Domains**, add `favorble.app` (or
   whatever domain you're sending from) and follow the DNS instructions
   (SPF, DKIM, and optionally DMARC records).
3. Create an API key from **API Keys** → "Create API Key". Scope it to
   **Sending access** only.
4. Set the following env vars:

   ```bash
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
   RESEND_FROM_EMAIL=notifications@favorble.app
   ```

   `RESEND_FROM_EMAIL` defaults to `notifications@favorble.app` if
   unset, but the sender must match a verified domain or Resend will
   reject the request with HTTP 422.

5. Add both vars to `.env.local` for local dev and to the Vercel
   project (Production + Preview scopes) via `vercel env add`.

**Cost**: Free tier covers 3k/month. Paid tiers start at $20/month
for 50k emails.

## Twilio (SMS)

1. Sign up at [twilio.com](https://twilio.com) and load the trial
   credit (currently $15).
2. Buy a phone number from **Phone Numbers** → "Buy a number". Pick a
   number with SMS capability in your target country (US numbers run
   about $1.15/month).
3. Grab your credentials from the **Console Dashboard**:
   - **Account SID** (starts with `AC...`)
   - **Auth Token** (click the eye icon to reveal)
4. Set the following env vars:

   ```bash
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_FROM_NUMBER=+15551234567
   ```

   `TWILIO_FROM_NUMBER` must be in E.164 format (leading `+`, no
   spaces or dashes).

5. Add all three vars to `.env.local` and the Vercel project.

**Cost**: Outbound SMS is roughly **$0.0079/message** in the US
(Twilio's published rate). Long messages split into multiple segments
at 160 characters each — the dispatcher truncates to 320 chars (2
segments) to keep delivery predictable.

**Note on the `users.phone` column**: the current `db/schema/users.ts`
does not declare a phone column. `deliverSms` issues a raw SQL query
(`select phone from users where id = $1`) and returns a "User phone
not available" error when the column is missing, so SMS activation is
a no-op until a phone column exists on `users`.

## Push (not yet wired)

`deliverPush` is a stub that returns `{success: false, error: "Push
not yet wired"}`. OneSignal integration is on the roadmap (POST to
`https://onesignal.com/api/v1/notifications` with `ONESIGNAL_APP_ID`
and `ONESIGNAL_API_KEY`). Until then, the push channel is a no-op
regardless of env vars.

## Verifying end-to-end

1. Set env vars locally in `.env.local`.
2. Restart `pnpm dev`.
3. Trigger any flow that calls `createNotification` with
   `channels: ["in_app", "email"]` (e.g. any supervisor event that
   creates an urgent notification).
4. Check the notification bell — the row should render with a green
   delivery dot once the dispatcher completes.
5. Check your inbox (Resend) or phone (Twilio).
6. Inspect the `notification_deliveries` table to confirm `sent_at`
   is populated and `error_message` is null.

## Muting

Users can mute individual event types at `/settings/notifications`.
Muting only suppresses email / SMS / push — in-app notifications
always fire so users don't lose context.
