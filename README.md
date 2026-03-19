# Zenith — Setup Guide

## Files included

```
zenith-web/
├── index.html        ← Landing page
├── style.css         ← All styles
├── app.js            ← Stripe checkout logic
├── server.js         ← Backend (deploy to Vercel)
├── success.html      ← Post-payment page
└── premium-gate.js   ← Extension Pro gating logic
```

---

## Step 1 — Set up Stripe (15 min)

1. Go to stripe.com → create a free account
2. Dashboard → Products → Add product
   - Name: "Zenith Pro"
   - Price: $9.00 / month (recurring)
3. Copy the **Price ID** (starts with `price_...`)
4. Dashboard → Developers → API Keys → copy **Publishable key** (`pk_live_...`)
5. In `app.js`, replace:
   - `STRIPE_PUBLIC_KEY` with your publishable key
   - `STRIPE_PRICE_ID` with your price ID

---

## Step 2 — Deploy the server (10 min)

The server handles payments and issues license keys.

1. Install Vercel CLI: `npm install -g vercel`
2. In the `zenith-web` folder: `npm init -y && npm install stripe express cors`
3. Create a `vercel.json` file:
```json
{
  "version": 2,
  "builds": [{ "src": "server.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "server.js" }]
}
```
4. Run `vercel deploy` — copy the deployment URL
5. Set environment variables in Vercel dashboard:
   - `STRIPE_SECRET_KEY` = your secret key (`sk_live_...`)
   - `STRIPE_WEBHOOK_SECRET` = from next step
   - `CLIENT_URL` = your website URL (e.g. `https://zenith.app`)
6. In `app.js`, set `SERVER_URL` to your Vercel URL
7. In `premium-gate.js`, set `SERVER_URL` to your Vercel URL

---

## Step 3 — Set up Stripe webhook (5 min)

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://your-server.vercel.app/webhook`
3. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.deleted`
4. Copy the **Webhook signing secret** (`whsec_...`)
5. Add it as `STRIPE_WEBHOOK_SECRET` in Vercel env vars

---

## Step 4 — Deploy your website

1. Put `index.html`, `style.css`, `app.js`, `success.html` in a folder
2. Also drop `zenith-extension.zip` in this folder (so the download link works)
3. Deploy options (all free):
   - **Vercel**: `vercel deploy` from the folder
   - **Netlify**: drag the folder to netlify.com/drop
   - **GitHub Pages**: push to a repo, enable Pages in settings

---

## Step 5 — Add Pro gating to the extension

1. Copy `premium-gate.js` into your `zenith-extension` folder
2. Add `"premium-gate.js"` to the `background.js` imports OR
   copy the functions directly into `background.js`
3. In `background.js`, update `START_SESSION` handler:

```js
if (msg.type === "START_SESSION") {
  // Check session limit
  const check = await canStartSession();
  if (!check.allowed) {
    sendResponse({ ok: false, error: check.message });
    return true;
  }

  // Check mode access
  const modeAllowed = await canUseMode(msg.mode);
  if (!modeAllowed) {
    sendResponse({ ok: false, error: `${msg.mode} mode requires Zenith Pro.` });
    return true;
  }

  await incrementSessionCount();
  // ... rest of your existing session start code
}
```

4. In `popup.js`, handle the error response:

```js
const result = await chrome.runtime.sendMessage({ type: "START_SESSION", ... });
if (!result.ok) {
  // Show upgrade prompt
  document.getElementById("task-error").textContent = result.error;
  document.getElementById("task-error").style.display = "block";
  return;
}
```

---

## Revenue math

| Free users | Conversion | Monthly revenue |
|-----------|-----------|----------------|
| 500       | 3%        | ~$135/mo        |
| 1,000     | 3%        | ~$270/mo        |
| 2,000     | 4%        | ~$720/mo        |
| 5,000     | 5%        | ~$2,250/mo      |

At 5,000 free users with 5% conversion = **$27,000/year**. That's your goal.

---

## Add email for license delivery (optional but recommended)

Use Resend (resend.com — free up to 3,000 emails/month):

```js
// In server.js, add at top:
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

// In the webhook handler after generating the key:
await resend.emails.send({
  from: "Zenith <hello@zenith.app>",
  to: email,
  subject: "Your Zenith Pro license key",
  html: `
    <h2>Welcome to Zenith Pro</h2>
    <p>Your license key: <strong>${licenseKey}</strong></p>
    <p>Enter this in the Zenith extension under Settings → License Key.</p>
  `
});
```
