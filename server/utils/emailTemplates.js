/* =============================================================
   NovaCart — email templates
   -------------------------------------------------------------
   Each template returns { subject, text, html }. HTML is kept to
   table layout with inline styles — the only thing email clients
   reliably render. Every template includes a plain-text version;
   some clients (and spam filters) insist on one.

   User-provided strings are escaped before they touch HTML.
   ============================================================= */

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Shared shell: slate header with the wordmark, white card, muted footer. */
function shell(title, bodyHtml) {
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background-color:#F1F5F9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F5F9;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr>
          <td style="background-color:#1E293B;border-radius:14px 14px 0 0;padding:22px 32px;">
            <span style="font-size:20px;font-weight:bold;color:#FFFFFF;">Nova<span style="color:#818CF8;">Cart</span></span>
          </td>
        </tr>
        <tr>
          <td style="background-color:#FFFFFF;border-radius:0 0 14px 14px;padding:32px;">
            <h1 style="margin:0 0 16px;font-size:20px;color:#1E293B;">${title}</h1>
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:18px 8px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#64748B;">
              NovaCart &middot; Quality products, everyday convenience<br/>
              You received this email because of activity on your NovaCart account.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const P = 'style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#475569;"';

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;">
    <tr><td style="background-color:#4F46E5;border-radius:10px;">
      <a href="${href}" style="display:inline-block;padding:13px 30px;font-size:14px;font-weight:bold;color:#FFFFFF;text-decoration:none;">${label}</a>
    </td></tr>
  </table>`;
}

/* ---------- Password reset ---------- */

/**
 * The one-time reset code.
 *
 * Deliberately contains NO link. The whole point of moving off a magic link
 * is that nothing in this mail is clickable, so a forwarded or intercepted
 * message cannot be acted on by opening it — the code still has to be typed
 * back into a session that already knows which address asked for it.
 */
function resetOtpEmail({ name, code, minutes, attempts }) {
  const first = esc(String(name || "").trim().split(/\s+/)[0] || "there");
  const digits = esc(String(code || ""));
  const life = Number(minutes) || 10;
  const tries = Number(attempts) || 5;

  return {
    subject: `${String(code || "")} is your NovaCart password reset code`,
    text: [
      `Hi ${String(name || "").trim().split(/\s+/)[0] || "there"},`,
      "",
      "Your NovaCart password reset code is:",
      "",
      `    ${String(code || "")}`,
      "",
      `It expires in ${life} minutes and can be used once. After ${tries} wrong`,
      "attempts it stops working and you will need to request a new one.",
      "",
      "If you did not ask to reset your password, you can ignore this email —",
      "nothing has changed on your account."
    ].join("\n"),
    html: shell("Your reset code", `
      <p ${P}>Hi ${first},</p>
      <p ${P}>Enter this code on the page you started from:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;">
        <tr><td style="background-color:#F1F5F9;border:1px solid #CBD5E1;border-radius:12px;padding:18px 30px;">
          <span style="font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:bold;letter-spacing:9px;color:#1E293B;">${digits}</span>
        </td></tr>
      </table>
      <p ${P}>It expires in <strong>${life} minutes</strong> and can be used once.
         After ${tries} wrong attempts it stops working and you will need a new one.</p>
      <p ${P}>If you did not ask to reset your password you can ignore this
         email &mdash; nothing on your account has changed.</p>
    `)
  };
}

/* ---------- Welcome ---------- */

function welcomeEmail({ name, siteUrl }) {
  const first = esc(String(name || "").trim().split(/\s+/)[0] || "there");
  const url = esc(siteUrl || "http://localhost:5000");

  return {
    subject: "Welcome to NovaCart 🎉",
    text: [
      `Hi ${String(name || "").trim().split(/\s+/)[0] || "there"},`,
      "",
      "Your NovaCart account is ready. Browse the catalog, fill your cart,",
      "and check out in seconds — your details are saved for next time.",
      "",
      `Start shopping: ${url}/products.html`
    ].join("\n"),
    html: shell("Welcome aboard 🎉", `
      <p ${P}>Hi ${first},</p>
      <p ${P}>Your NovaCart account is ready. Browse the catalog, fill your
         cart, and check out in seconds — your details are saved for next time.</p>
      ${button(`${url}/products.html`, "Start shopping")}
      <p ${P}>Free shipping on orders over $50, and a 30-day hassle-free
         returns policy on everything.</p>
    `)
  };
}

/**
 * Sent when a Google account is attached to an existing NovaCart account.
 *
 * This is a security notice, not a nicety. Linking is what turns two separate
 * identities into one login, so the address that owns the account gets told
 * out-of-band — if it wasn't them, this mail is how they find out.
 *
 * When the account had a password, that password is disabled at link time
 * (NovaCart cannot prove whoever set it owned the address), and the mail has
 * to say so plainly. Telling someone "you can now use either method" when one
 * of them has just stopped working would send them in circles.
 */
function googleLinkedEmail({ name, email, siteUrl, passwordDisabled }) {
  const first = esc(String(name || "").trim().split(/\s+/)[0] || "there");
  const url = esc(siteUrl || "http://localhost:5000");
  const address = esc(email || "");
  const plainFirst = String(name || "").trim().split(/\s+/)[0] || "there";

  const textBody = passwordDisabled
    ? [
        `Hi ${plainFirst},`,
        "",
        `Google Sign-In is now set up for your NovaCart account (${email || ""}).`,
        "",
        "The password on this account has been switched off. We do this whenever",
        "a Google account is linked to an address we had not already verified, so",
        "that only the person who owns the mailbox can get in.",
        "",
        "Sign in with Google from now on. If you would rather also have a",
        "password, set a fresh one here:",
        `${url}/forgot-password.html`,
        "",
        "If this wasn't you, set a new password immediately — that is what locks",
        "the account back down."
      ]
    : [
        `Hi ${plainFirst},`,
        "",
        `Google Sign-In has been enabled for your NovaCart account (${email || ""}).`,
        "You can now sign in with either your password or your Google account.",
        "",
        "If this wasn't you, change your password straight away:",
        `${url}/forgot-password.html`
      ];

  const htmlBody = passwordDisabled
    ? `
      <p ${P}>Hi ${first},</p>
      <p ${P}>Google Sign-In is now set up for your NovaCart account
         (<strong>${address}</strong>).</p>
      <p ${P}><strong>The password on this account has been switched off.</strong>
         We do that whenever a Google account is linked to an address we had not
         already verified, so that only the person who owns the mailbox can get
         in. Nothing else about your account has changed &mdash; your orders and
         addresses are exactly where you left them.</p>
      <p ${P}>Use the <em>Continue with Google</em> button from now on. If you
         would also like a password, set a fresh one:</p>
      ${button(`${url}/forgot-password.html`, "Set a new password")}
      <p ${P}>If this wasn&rsquo;t you, set a new password immediately &mdash;
         that signs out every device currently holding a session.</p>
    `
    : `
      <p ${P}>Hi ${first},</p>
      <p ${P}>Google Sign-In has just been enabled for your NovaCart account
         (<strong>${address}</strong>). You can now sign in with either your
         password or your Google account &mdash; whichever you prefer.</p>
      <p ${P}><strong>If this wasn&rsquo;t you</strong>, change your password
         immediately. That signs out every device currently holding a session.</p>
      ${button(`${url}/forgot-password.html`, "Secure my account")}
    `;

  return {
    subject: passwordDisabled
      ? "Your NovaCart sign-in has changed"
      : "Google Sign-In was linked to your NovaCart account",
    text: textBody.join("\n"),
    html: shell(passwordDisabled ? "Sign in with Google from now on" : "Google Sign-In linked", htmlBody)
  };
}

function contactEmail({ name, email, message }) {
  return {
    subject: `NovaCart contact form — message from ${String(name || "").trim()}`,
    text: [
      "New message from the NovaCart contact form",
      "",
      `From    : ${String(name || "").trim()}`,
      `Email   : ${String(email || "").trim()}`,
      "",
      "Message :",
      String(message || "").trim()
    ].join("\n"),
    html: shell("New contact form message", `
      <p ${P}><strong>From:</strong> ${esc(name)}<br/>
         <strong>Email:</strong> <a href="mailto:${esc(email)}" style="color:#4F46E5;">${esc(email)}</a></p>
      <p ${P}><strong>Message:</strong></p>
      <p style="margin:0;padding:16px;background-color:#F8FAFC;border-left:3px solid #4F46E5;border-radius:6px;font-size:14px;line-height:1.7;color:#334155;white-space:pre-wrap;">${esc(message)}</p>
    `)
  };
}

/* ---------- Orders ---------- */

function money(value) {
  return "$" + Number(value || 0).toFixed(2);
}

function itemRows(items) {
  return (items || []).map((line) => `
    <tr>
      <td style="padding:8px 0;font-size:14px;color:#334155;">${esc(line.name)} <span style="color:#64748B;">× ${line.qty}</span></td>
      <td style="padding:8px 0;font-size:14px;color:#1E293B;text-align:right;font-weight:bold;">${money(line.unitPrice * line.qty)}</td>
    </tr>`).join("");
}

function orderEmail({ order }) {
  const first = esc(String(order.customer.name || "").trim().split(/\s+/)[0] || "there");
  const lines = (order.items || [])
    .map((l) => `  ${l.name} x${l.qty}  ${money(l.unitPrice * l.qty)}`)
    .join("\n");

  const paymentMethodLabel = {
    cod: "Cash on Delivery",
    card: "Credit / Debit Card (Visa, MasterCard)"
  }[order.paymentMethod] || "Cash on Delivery";

  return {
    subject: `Order ${order.number} confirmed — NovaCart`,
    text: [
      `Hi ${String(order.customer.name || "").trim().split(/\s+/)[0] || "there"},`,
      "",
      `Thanks for your order. We've received it and it's being prepared.`,
      "",
      `Order number   : ${order.number}`,
      `Payment Method : ${paymentMethodLabel}`,
      `Payment Status : ${order.paymentStatus || "unpaid"}`,
      "",
      "Items:",
      lines,
      "",
      `Subtotal : ${money(order.subtotal)}`,
      `Shipping : ${order.shipping === 0 ? "Free" : money(order.shipping)}`,
      `Total    : ${money(order.total)}`,
      "",
      `Delivering to: ${order.customer.address}, ${order.customer.city} ${order.customer.postal}`
    ].join("\n"),
    html: shell(`Order ${esc(order.number)} confirmed`, `
      <p ${P}>Hi ${first},</p>
      <p ${P}>Thanks for your order — we've received it and it's being prepared.
         We'll email you again as soon as it ships.</p>
      <p ${P}><strong>Payment Method:</strong> ${esc(paymentMethodLabel)} (${esc(order.paymentStatus || "unpaid")})</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="margin:20px 0;border-top:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0;">
        ${itemRows(order.items)}
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="font-size:14px;color:#64748B;padding:3px 0;">Subtotal</td>
            <td style="font-size:14px;color:#334155;text-align:right;">${money(order.subtotal)}</td></tr>
        <tr><td style="font-size:14px;color:#64748B;padding:3px 0;">Shipping</td>
            <td style="font-size:14px;color:#334155;text-align:right;">${order.shipping === 0 ? "Free" : money(order.shipping)}</td></tr>
        <tr><td style="font-size:16px;color:#1E293B;font-weight:bold;padding:10px 0 0;border-top:1px solid #E2E8F0;">Total</td>
            <td style="font-size:18px;color:#1E293B;font-weight:bold;text-align:right;padding:10px 0 0;border-top:1px solid #E2E8F0;">${money(order.total)}</td></tr>
      </table>
      <p ${P} style="margin-top:20px;"><strong>Delivering to</strong><br/>
        ${esc(order.customer.name)}<br/>
        ${esc(order.customer.address)}<br/>
        ${esc(order.customer.city)} ${esc(order.customer.postal)}</p>
    `)
  };
}

const STATUS_COPY = {
  pending: "is confirmed and being prepared",
  processing: "is being packed",
  shipped: "is on its way",
  delivered: "has been delivered",
  cancelled: "has been cancelled"
};

function orderStatusEmail({ order }) {
  const first = esc(String(order.customer.name || "").trim().split(/\s+/)[0] || "there");
  const phrase = STATUS_COPY[order.status] || `is now ${order.status}`;
  const latest = order.timeline && order.timeline.length
    ? order.timeline[order.timeline.length - 1].note
    : "";

  return {
    subject: `Order ${order.number} — ${order.status}`,
    text: [
      `Hi ${String(order.customer.name || "").trim().split(/\s+/)[0] || "there"},`,
      "",
      `Your order ${order.number} ${phrase}.`,
      latest ? `\nNote: ${latest}` : "",
      "",
      order.status === "cancelled"
        ? "If you didn't expect this, please get in touch."
        : "Thanks for shopping with NovaCart."
    ].join("\n"),
    html: shell(`Your order ${phrase}`, `
      <p ${P}>Hi ${first},</p>
      <p ${P}>Your order <strong>${esc(order.number)}</strong> ${phrase}.</p>
      ${latest ? `<p style="margin:0 0 14px;padding:14px;background-color:#F8FAFC;border-left:3px solid #4F46E5;border-radius:6px;font-size:14px;color:#334155;">${esc(latest)}</p>` : ""}
      <p ${P}>${order.status === "cancelled"
        ? "If you didn't expect this, please get in touch and we'll help."
        : "Thanks for shopping with NovaCart."}</p>
    `)
  };
}

/* ---------- Returns ---------- */

const RETURN_COPY = {
  approved: "has been approved",
  rejected: "could not be approved",
  refunded: "has been refunded"
};

function returnStatusEmail({ request }) {
  const phrase = RETURN_COPY[request.status] || `is now ${request.status}`;
  const refundLine = request.status === "refunded"
    ? `A refund of ${money(request.refundAmount)} is on its way back to your original payment method (3-5 business days).`
    : "";

  return {
    subject: `Return ${request.reference} — ${request.status}`,
    text: [
      `Your return request ${request.reference} for order ${request.orderNumber} ${phrase}.`,
      request.adminNote ? `\nNote: ${request.adminNote}` : "",
      refundLine ? `\n${refundLine}` : ""
    ].join("\n"),
    html: shell(`Your return ${phrase}`, `
      <p ${P}>Your return request <strong>${esc(request.reference)}</strong>
         for order <strong>${esc(request.orderNumber)}</strong> ${phrase}.</p>
      ${request.adminNote ? `<p style="margin:0 0 14px;padding:14px;background-color:#F8FAFC;border-left:3px solid #4F46E5;border-radius:6px;font-size:14px;color:#334155;">${esc(request.adminNote)}</p>` : ""}
      ${refundLine ? `<p ${P}>${refundLine}</p>` : ""}
    `)
  };
}

module.exports = {
  resetOtpEmail,
  welcomeEmail,
  welcomeEmail,
  googleLinkedEmail,
  contactEmail,
  orderEmail,
  orderStatusEmail,
  returnStatusEmail
};
