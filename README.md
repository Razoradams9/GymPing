# GymPing 🏋️

GymPing sends WhatsApp reminders to gym members whose membership is about to expire. Link your WhatsApp once by scanning a QR code, add your members, and GymPing does the rest.

## What it does

- **Daily reminders.** Each member gets one WhatsApp message a day, starting 4 days before their membership ends and through the last day. Reminders stop as soon as you mark them renewed.
- **Renewals.** Press **✓ Renewed** on a member when they pay. Their end date moves forward (1 month by default) and the renewal shows on the dashboard.
- **Add members from your contacts.** Pick a member straight from your WhatsApp contacts, or type them in.
- **Your own wording.** Edit the reminder message in Settings, with a live preview.
- **Nothing gets lost.** If the computer was off or WhatsApp was disconnected, missed reminders go out as soon as it is back. Failed messages (for example a wrong number) show on the dashboard with a **Try again** button.

## Setup

You need [Node.js 22.5 or newer](https://nodejs.org/).

```bash
npm run setup
```

```bash
npm start
```

Then open [http://localhost:3001](http://localhost:3001).

## First use

1. Go to **Settings**. A QR code appears. On your phone open WhatsApp → Settings → Linked Devices → Link a Device, and scan it. You only do this once.
2. Still in Settings, enter your gym name, your payment link and your country code, then **Save Settings**.
3. Go to **Members** and add your members.

> Use a dedicated gym WhatsApp number if you can. GymPing sends messages slowly (20–60 seconds apart) to look natural, but WhatsApp can restrict numbers that send automated messages.

## Keeping it running 24/7

GymPing only sends reminders while it is running. To keep it running, and restart it automatically after a crash or reboot, use [pm2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
```

```bash
pm2 start backend/index.js --name gymping
```

```bash
pm2 save
```

```bash
pm2 startup
```

The last command prints one more command to run so GymPing starts when the computer boots.

If WhatsApp ever logs the session out, the dashboard shows a red warning. Open Settings and scan the new QR code.

## Opening it from another device

By default GymPing can only be opened on the computer it runs on. To open it from your phone or another computer on the same network, start it with a password:

```bash
HOST=0.0.0.0 GYMPING_PASSWORD=choose-a-password npm start
```

## Options

| Variable | Meaning | Default |
|---|---|---|
| `PORT` | Port the app runs on | `3001` |
| `HOST` | Address to listen on | `127.0.0.1` |
| `GYMPING_PASSWORD` | Password for the app (required if `HOST` is not local) | none |
| `GYMPING_DB` | Where the data file is kept | `backend/gymping.db` |
| `GYMPING_FAKE_WA` | Set to `1` to try the app without WhatsApp; nothing is sent | off |

Your data lives in `backend/gymping.db` and the WhatsApp session in `backend/.wwebjs_auth/`. Back up both.

## Development

```bash
npm test
```

For live reload of the dashboard, run `npm start` and, in a second terminal, `npm --prefix frontend run dev`, then open [http://localhost:5173](http://localhost:5173).
