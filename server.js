// ─────────────────────────────────────────────────────────────────────────────
// ZENITH — server.js
//
// Deploy this to Vercel (free) in 3 steps:
//   1. npm install stripe express cors
//   2. Set env variables:
//        STRIPE_SECRET_KEY=sk_live_...
//        STRIPE_WEBHOOK_SECRET=whsec_...
//        CLIENT_URL=https://your-zenith-site.com
//   3. vercel deploy
//
// This file handles:
//   - Creating Stripe Checkout sessions
//   - Verifying payments via webhook
//   - Issuing license keys to paying users
// ─────────────────────────────────────────────────────────────────────────────

const express  = require("express");
const Stripe   = require("stripe");
const cors     = require("cors");
const crypto   = require("crypto");

const app    = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// In production use a real database (Supabase free tier is perfect)
// For now this in-memory store works for testing
const licenses = new Map();

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CLIENT_URL || "*" }));

// ── Raw body needed for Stripe webhook ───────────────────────────────────────
app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// ── POST /create-checkout-session ─────────────────────────────────────────────
app.post("/create-checkout-session", async (req, res) => {
  const { priceId } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.CLIENT_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.CLIENT_URL}/?canceled=true`,
      metadata: { product: "zenith_pro" }
    });

    res.json({ sessionId: session.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /webhook — Stripe sends events here ──────────────────────────────────
app.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email   = session.customer_details?.email;

    if (email) {
      // Generate a unique license key for this user
      const licenseKey = "ZNT-" + crypto.randomBytes(12).toString("hex").toUpperCase();
      licenses.set(email, {
        key: licenseKey,
        customerId: session.customer,
        subscriptionId: session.subscription,
        active: true,
        createdAt: new Date().toISOString()
      });

      console.log(`License issued: ${licenseKey} for ${email}`);

      // TODO: Send license key by email using Resend (resend.com — free tier)
      // await sendLicenseEmail(email, licenseKey);
    }
  }

  if (event.type === "customer.subscription.deleted") {
    // Subscription canceled — deactivate license
    const customerId = event.data.object.customer;
    for (const [email, data] of licenses.entries()) {
      if (data.customerId === customerId) {
        data.active = false;
        console.log(`License deactivated for ${email}`);
      }
    }
  }

  res.json({ received: true });
});

// ── GET /verify-license?key=ZNT-... ───────────────────────────────────────────
// The extension calls this to check if a user's key is valid
app.get("/verify-license", (req, res) => {
  const { key } = req.query;
  if (!key) return res.json({ valid: false });

  for (const [email, data] of licenses.entries()) {
    if (data.key === key && data.active) {
      return res.json({ valid: true, email });
    }
  }

  res.json({ valid: false });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Zenith server running on port ${PORT}`));
