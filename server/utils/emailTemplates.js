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

function resetEmail({ name, resetUrl }) {
  const first = esc(String(name || "").trim().split(/\s+/)[0] || "there");
  // Escaped before entering an href — a URL is still untrusted text here.
  const safeUrl = esc(resetUrl);

  return {
    subject: "Reset your NovaCart password",
    text: [
      `Hi ${String(name || "").trim().split(/\s+/)[0] || "there"},`,
      "",
      "Someone asked to reset the password for your NovaCart account.",
      "If that was you, open this link within 30 minutes:",
      "",
      `  ${resetUrl}`,
      "",
      "If you didn't ask for this, you can safely ignore this email —",
      "your password will stay exactly as it is."
    ].join("\n"),
    html: shell("Reset your password", `
      <p ${P}>Hi ${first},</p>
      <p ${P}>Someone asked to reset the password for your NovaCart account.
         If that was you, click the button below within <strong>30 minutes</strong>.</p>
      ${button(safeUrl, "Choose a new password")}
      <p ${P}>Or paste this link into your browser:<br/>
        <a href="${safeUrl}" style="color:#4F46E5;word-break:break-all;">${safeUrl}</a></p>
      <p ${P}>If you didn't ask for this, ignore this email — your password
         will stay exactly as it is.</p>
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

/* ---------- Contact form -> store inbox ---------- */

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

  return {
    subject: `Order ${order.number} confirmed — NovaCart`,
    text: [
      `Hi ${String(order.customer.name || "").trim().split(/\s+/)[0] || "there"},`,
      "",
      `Thanks for your order. We've received it and it's being prepared.`,
      "",
      `Order number : ${order.number}`,
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
  resetEmail,
  welcomeEmail,
  contactEmail,
  orderEmail,
  orderStatusEmail,
  returnStatusEmail
};
