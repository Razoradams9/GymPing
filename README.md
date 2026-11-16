# GymPing 🏋️

GymPing sends WhatsApp reminders to gym members whose membership is about to expire. It is one hosted service for many gyms: each gym owner has their own account, members, WhatsApp link and look.

## What a gym owner gets

- **Daily reminders.** Each member gets one WhatsApp message a day, from the gym's own number, starting 4 days before their membership ends and through the last day. Reminders stop as soon as the member is marked renewed.
- **Renewals.** Press **✓ Renewed** when a member pays. Their end date moves forward (1 month by default) and the renewal shows on the dashboard.
- **Two ways to link WhatsApp.** Scan a QR code, or type in a code using the phone number (handy when GymPing is open on the same phone).
- **Easy member entry.** Type members in, pick them from WhatsApp contacts, or import a spreadsheet (CSV). Export a backup at any time. Plain 10-digit numbers are treated as Indian (+91).
- **Opt-out.** A member can reply **STOP** to a reminder, or the owner can switch reminders off for them.
- **Their own look.** Logo, accent colour and light/dark mode per gym, on top of the default charcoal-and-orange gym style.
- **Their own wording.** The reminder message is editable, with a live preview.
- **Nothing gets lost.** Reminders missed while the service or WhatsApp was down go out as soon as it is back. Failed messages show on the dashboard with a **Try again** button.

## What you (the overseer) get

Log in with the overseer email and password to see every gym account: status, number of members, reminders sent, whether WhatsApp is connected, and when they were last active. You can:

- **Approve** new sign-ups (new gyms cannot use GymPing until you do),
- **Suspend** and **reactivate** gyms,
- **Reset a password** for an owner who forgot theirs.

The overseer screen never shows members' names, phone numbers or messages. (Whoever controls the database can technically read it, which the Privacy Policy says plainly.)

## Before you sell it

1. Put your business name and contact email in `frontend/src/legal-config.js`. They appear in the Terms and Privacy Policy.
2. Have a lawyer review `frontend/src/pages/Legal.jsx`. The Terms and Privacy Policy there are plain-language starting drafts, not legal advice.
3. Not built yet: payment/licensing, and email (password-reset links, alerts when a gym's WhatsApp disconnects). Until then, approval is how you control who gets in.

All times are Indian time (`Asia/Kolkata`).

## Hosting it online (Render, free plan)

Render's free plan has no lasting disk, so GymPing keeps everything in a free online Postgres database.

1. **Create the database.** Sign up at [Neon](https://neon.tech) (free), create a project, and copy its connection string (it starts with `postgresql://`). Don't use Render's own free database: it is deleted after 30 days.
2. **Create the app.** On [Render](https://render.com): New → Blueprint → pick this repo. When asked, enter:
   - `DATABASE_URL`: the connection string from step 1,
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD`: your own overseer login (password of 8+ characters).
3. **Open the `…onrender.com` address** and log in as the overseer. Gym owners use **Create account** on the same address.

Limits of the free plan:

- **It sleeps without visitors.** GymPing visits its own address every 10 minutes to stay awake. For a second safety net, point a free uptime monitor (e.g. UptimeRobot) at `https://YOUR-APP.onrender.com/healthz`.
- **Restarts happen.** After one, GymPing reconnects each gym's WhatsApp by itself and catches up on missed reminders.
- **It is small.** Fine for trying things out and a handful of gyms; move to a paid plan before taking on paying customers.

Other hosts: the same `Dockerfile` runs anywhere that runs containers. `fly.toml` is a ready setup for Fly.io (paid) with a disk instead of a database. To serve the dashboard from Vercel instead, set the app address in `frontend/vercel.json` and use `frontend` as the root directory.

If you ran the earlier single-gym version on the same database, its data is set aside (tables `legacy_*`, or schema `legacy` on Postgres), not deleted, and not shown in the app.

## Running it on your own computer

You need [Node.js 22.5 or newer](https://nodejs.org/).

```bash
npm run setup
```

```bash
npm start
```

Open [http://localhost:3001](http://localhost:3001) and create an account. Without `ADMIN_EMAIL` set, new accounts are active straight away. On Windows you can double-click **Setup GymPing** instead; it also adds a Desktop icon and starts GymPing with the computer.

## Settings (environment variables)

| Variable | Meaning | Default |
|---|---|---|
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The overseer login. When set, new gyms need approval | none |
| `DATABASE_URL` | Postgres database to use instead of the local data file | none |
| `PORT` | Port the app runs on | `3001` |
| `HOST` | Address to listen on (`0.0.0.0` when hosted) | `127.0.0.1` |
| `TZ` | Time zone for send times and dates | `Asia/Kolkata` |
| `GYMPING_DATA_DIR` | Folder for the local data file | `backend/` |
| `GYMPING_FAKE_WA` | Set to `1` to try the app without WhatsApp; nothing is sent | off |

## How it connects to WhatsApp

Each gym links its number by scanning a QR code, the same way as WhatsApp's Linked Devices. This is not an official WhatsApp business channel, and WhatsApp can restrict numbers that send automated messages. GymPing sends slowly (20–60 seconds apart, never after 9 PM) to reduce that risk; a dedicated gym number is still the safe choice.

## Development

```bash
npm test
```

The tests run on SQLite, or on Postgres if `DATABASE_URL` points at an empty database. For live reload of the dashboard, run `npm start` and, in a second terminal, `npm --prefix frontend run dev`, then open [http://localhost:5173](http://localhost:5173).
