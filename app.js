// ─────────────────────────────────────────────────────────────────────────────
// ZENITH — app.js
//
// HOW STRIPE WORKS HERE:
// 1. User clicks "Get Pro" → redirects to Stripe Checkout (hosted by Stripe)
// 2. After payment, Stripe redirects to success.html?session_id=...
// 3. Your server verifies the session and issues a license key
// 4. License key is stored in chrome.storage and checked by the extension
//
// SETUP CHECKLIST:
//   1. Create a Stripe account at stripe.com
//   2. Create a Product: "Zenith Pro" at $9/month (recurring)
//   3. Copy the Price ID (starts with price_...) → paste as STRIPE_PRICE_ID below
//   4. Copy your Publishable Key → paste as STRIPE_PUBLIC_KEY below
//   5. Deploy server.js (see below) to Vercel / Railway / Render (all free tiers)
//   6. Set SERVER_URL to your deployed server URL
// ─────────────────────────────────────────────────────────────────────────────

const STRIPE_PUBLIC_KEY = "pk_live_51TC5MRQ1UZaIHEZl4J8asEsWFhU8iXSjnGVDUZrX4VsHUSgzen1Nl4g64AIYxIjtu29k2IUcOlXCVjp9J8N8XfQ600NTwbBliX";   // ← replace this
const STRIPE_PRICE_ID   = "price_1TCVlzQ1UZaIHEZlc3SELTeY"; // ← replace this
const SERVER_URL        = "https://zenith-gamma-five.vercel.app"; // ← replace this

// ── Stripe checkout ───────────────────────────────────────────────────────────
const stripe = Stripe(STRIPE_PUBLIC_KEY);

const checkoutBtn = document.getElementById("checkout-btn");
if (checkoutBtn) {
  checkoutBtn.addEventListener("click", async () => {
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = "Loading…";

    try {
      // Ask your server to create a Checkout Session
      const res = await fetch(`${SERVER_URL}/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: STRIPE_PRICE_ID })
      });

      const { sessionId, error } = await res.json();

      if (error) throw new Error(error);

      // Redirect to Stripe's hosted checkout page
      const { error: stripeError } = await stripe.redirectToCheckout({ sessionId });
      if (stripeError) throw new Error(stripeError.message);

    } catch (err) {
      showToast("Something went wrong. Please try again.", "error");
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = "Get Pro — $9/mo";
    }
  });
}

// ── Toast helper ──────────────────────────────────────────────────────────────
function showToast(msg, type = "success") {
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ── Check for success redirect from Stripe ────────────────────────────────────
const params = new URLSearchParams(window.location.search);
if (params.get("success") === "true") {
  showToast("Welcome to Zenith Pro! Check your email for your license key.");
  window.history.replaceState({}, "", window.location.pathname);
}
if (params.get("canceled") === "true") {
  showToast("Checkout canceled. No charge made.", "error");
  window.history.replaceState({}, "", window.location.pathname);
}
