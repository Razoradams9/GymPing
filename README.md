# GymPing 🏋️

GymPing is a tool for gym owners that automatically sends WhatsApp reminders to members 4 days before their membership expires. Scan a QR code once to link your WhatsApp account, add your members, and GymPing handles the rest — checking daily at 9 AM and sending personalized reminder messages so members never get caught off-guard.

---

## Prerequisites

- [Node.js 18+](https://nodejs.org/)

---

## Setup

Install dependencies for both the backend and frontend:

```bash
cd backend
npm install
```

```bash
cd frontend
npm install
```

---

## Starting the app

**Backend** (runs on port 3001):

```bash
cd backend
npm start
```

**Frontend** (runs on port 5173):

```bash
cd frontend
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

---

## How to connect WhatsApp

1. Start the backend (`npm start` in the `backend` folder).
2. Open the app in your browser and go to the **Settings** page.
3. A QR code will appear — scan it with the WhatsApp app on your phone (the same way you connect WhatsApp Web).
4. Once scanned, the page shows "✅ WhatsApp Connected".

> **Your session is saved locally.** You only need to scan the QR code once. Subsequent restarts of the backend will reconnect automatically without needing to scan again.

---

## How to add members

1. Go to the **Members** page.
2. Click **+ Add Member**.
3. Fill in the member's name, phone number (include country code, e.g. `+14155552671`), and membership end date.
4. Click **Save Member**.

The member will now appear in the list and will automatically receive a WhatsApp reminder 4 days before their membership expires.

---

## How reminders work

- Every day at **9:00 AM**, the backend checks for members whose membership ends exactly 4 days from today.
- Each qualifying member receives a WhatsApp message with their expiry date and your renewal/payment link (configured in Settings).
- Each reminder is logged so the same member is never messaged twice for the same membership period.

---

## Gym Settings

On the **Settings** page you can set:
- **Gym Name** — shown in the reminder message.
- **Payment / Renewal URL** — the link members receive in the reminder so they can renew immediately.
