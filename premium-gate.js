// ─────────────────────────────────────────────────────────────────────────────
// ZENITH EXTENSION — premium-gate.js
//
// Add this file to the extension folder.
// It handles license key storage and Pro feature gating.
//
// HOW TO ADD LICENSE ACTIVATION TO THE POPUP:
// 1. Add a Settings tab to popup.html (see snippet below)
// 2. Call activateLicense(key) when user submits their key
// 3. Call isPro() anywhere to check if user has Pro
// ─────────────────────────────────────────────────────────────────────────────

const SERVER_URL = "https://your-server.vercel.app"; // ← same as app.js

// ── Check if user has Pro ─────────────────────────────────────────────────────
async function isPro() {
  const data = await chrome.storage.local.get("license");
  if (!data.license) return false;

  // Revalidate against server every 24 hours
  const lastCheck = data.license.lastChecked || 0;
  const hoursSince = (Date.now() - lastCheck) / 1000 / 60 / 60;

  if (hoursSince < 24) {
    return data.license.valid === true;
  }

  // Re-verify with server
  try {
    const res = await fetch(`${SERVER_URL}/verify-license?key=${data.license.key}`);
    const { valid } = await res.json();
    await chrome.storage.local.set({
      license: { ...data.license, valid, lastChecked: Date.now() }
    });
    return valid;
  } catch {
    // If server unreachable, trust cached value
    return data.license.valid === true;
  }
}

// ── Activate a license key ────────────────────────────────────────────────────
async function activateLicense(key) {
  if (!key || !key.startsWith("ZNT-")) {
    return { success: false, message: "Invalid license key format." };
  }

  try {
    const res = await fetch(`${SERVER_URL}/verify-license?key=${key}`);
    const { valid, email } = await res.json();

    if (valid) {
      await chrome.storage.local.set({
        license: { key, valid: true, email, lastChecked: Date.now() }
      });
      return { success: true, message: `Pro activated for ${email}` };
    } else {
      return { success: false, message: "License key not found or expired." };
    }
  } catch {
    return { success: false, message: "Could not connect to server. Try again." };
  }
}

// ── Pro feature limits ────────────────────────────────────────────────────────
const FREE_LIMITS = {
  sessionsPerDay: 3,
  modes: ["gentle"],
  quoteLibrary: "basic"   // 30 quotes
};

const PRO_FEATURES = {
  sessionsPerDay: Infinity,
  modes: ["gentle", "intense", "savage"],
  quoteLibrary: "full"    // 200+ quotes
};

async function getFeatures() {
  const pro = await isPro();
  return pro ? PRO_FEATURES : FREE_LIMITS;
}

// ── Session counter (enforces free limit) ─────────────────────────────────────
async function canStartSession() {
  const features = await getFeatures();
  if (features.sessionsPerDay === Infinity) return { allowed: true };

  const today = new Date().toDateString();
  const data  = await chrome.storage.local.get("sessionCount");
  const count = data.sessionCount;

  if (!count || count.date !== today) {
    await chrome.storage.local.set({ sessionCount: { date: today, count: 0 } });
    return { allowed: true };
  }

  if (count.count >= features.sessionsPerDay) {
    return {
      allowed: false,
      message: `Free plan allows ${features.sessionsPerDay} sessions per day. Upgrade to Pro for unlimited sessions.`
    };
  }

  return { allowed: true };
}

async function incrementSessionCount() {
  const today = new Date().toDateString();
  const data  = await chrome.storage.local.get("sessionCount");
  const count = data.sessionCount;

  if (!count || count.date !== today) {
    await chrome.storage.local.set({ sessionCount: { date: today, count: 1 } });
  } else {
    await chrome.storage.local.set({
      sessionCount: { date: today, count: count.count + 1 }
    });
  }
}

// ── Mode gating ───────────────────────────────────────────────────────────────
async function canUseMode(mode) {
  const features = await getFeatures();
  return features.modes.includes(mode);
}

// ─────────────────────────────────────────────────────────────────────────────
// POPUP HTML SNIPPET — add this Settings section to popup.html
// Replace the existing popup.html with this new tab structure
// ─────────────────────────────────────────────────────────────────────────────
/*

<!-- Add to popup.html after the stop view, before </body> -->

<div class="view" id="view-settings">
  <div id="pro-status-bar" style="display:none;"></div>

  <label>License key</label>
  <input type="text" id="license-input" placeholder="ZNT-XXXXXXXXXXXXXXXXXXXXXXXX"/>
  <p class="error" id="license-error"></p>
  <button class="start-btn" id="activate-btn">Activate Pro</button>

  <div style="margin-top:14px;text-align:center;">
    <a href="https://your-zenith-site.com/#pricing"
       style="font-size:12px;color:#7F77DD;text-decoration:none;"
       target="_blank">
      Get a license key →
    </a>
  </div>
</div>

<!-- Add settings tab to bottom nav -->
<div style="display:flex;border-top:0.5px solid rgba(255,255,255,0.07);margin-top:16px;padding-top:12px;gap:8px;">
  <button class="tab-btn active" id="tab-session" style="flex:1;padding:7px;background:transparent;border:none;color:rgba(255,255,255,0.4);font-size:11px;cursor:pointer;">Session</button>
  <button class="tab-btn" id="tab-settings" style="flex:1;padding:7px;background:transparent;border:none;color:rgba(255,255,255,0.4);font-size:11px;cursor:pointer;">Settings</button>
</div>

*/

// ─────────────────────────────────────────────────────────────────────────────
// ADD THIS TO popup.js inside DOMContentLoaded:
// ─────────────────────────────────────────────────────────────────────────────
/*

  // Settings tab toggle
  document.getElementById("tab-session")?.addEventListener("click", () => {
    showView(session?.active ? "view-active" : "view-start");
  });
  document.getElementById("tab-settings")?.addEventListener("click", () => {
    showView("view-settings");
    loadProStatus();
  });

  // Activate license button
  document.getElementById("activate-btn")?.addEventListener("click", async () => {
    const key = document.getElementById("license-input").value.trim();
    const errEl = document.getElementById("license-error");
    const btn = document.getElementById("activate-btn");

    btn.disabled = true;
    btn.textContent = "Checking…";

    const result = await activateLicense(key);

    if (result.success) {
      errEl.style.color = "#9FE1CB";
      errEl.style.display = "block";
      errEl.textContent = result.message;
      loadProStatus();
    } else {
      errEl.style.color = "#F09595";
      errEl.style.display = "block";
      errEl.textContent = result.message;
    }

    btn.disabled = false;
    btn.textContent = "Activate Pro";
  });

  async function loadProStatus() {
    const pro = await isPro();
    const bar = document.getElementById("pro-status-bar");
    if (!bar) return;
    bar.style.display = "block";
    bar.style.background = pro ? "rgba(29,158,117,0.1)" : "rgba(127,119,221,0.1)";
    bar.style.border = pro ? "0.5px solid #1D9E75" : "0.5px solid #7F77DD";
    bar.style.borderRadius = "8px";
    bar.style.padding = "8px 12px";
    bar.style.fontSize = "12px";
    bar.style.color = pro ? "#9FE1CB" : "#AFA9EC";
    bar.style.marginBottom = "14px";
    bar.textContent = pro ? "Zenith Pro — active" : "Free plan · Upgrade for unlimited sessions";
  }

*/
