/* =============================================================
   NovaCart — mail transport
   -------------------------------------------------------------
   One sendMail() for the whole app, with three modes decided by
   the environment:

     smtp      SMTP_HOST is set in .env — real delivery through
               that server (Gmail, Outlook, Mailtrap, SES, …).
     ethereal  no SMTP_HOST, MAIL_ETHEREAL=true, development —
               nodemailer's throwaway test inbox. A real SMTP
               round-trip; every message gets a preview URL
               logged to the console. No signup needed.
     console   nothing configured — the message is logged and
               reported as NOT delivered, so callers can fall
               back (e.g. show the reset link in dev).

   sendMail never throws for "mail is simply not set up" — it
   returns { delivered:false }. It DOES throw when a configured
   transport fails, because that is an error worth surfacing.
   ============================================================= */

const nodemailer = require("nodemailer");
const { isDev, mailMode } = require("./env");

let transporterPromise = null;
let activeMode = null;          // "smtp" | "ethereal" | "console"

function defaultFrom() {
  return process.env.MAIL_FROM || '"NovaCart" <no-reply@novacart.example>';
}

async function buildTransporter() {
  if (process.env.SMTP_HOST) {
    activeMode = "smtp";
    const port = Number(process.env.SMTP_PORT) || 587;
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // 465 is implicit TLS; 587 upgrades via STARTTLS (secure:false here
      // does NOT mean plaintext — nodemailer still negotiates TLS).
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined
    });
  }

  if (isDev() && process.env.MAIL_ETHEREAL === "true") {
    // Creates a disposable inbox at ethereal.email; messages are captured
    // there (never actually delivered) and viewable via the preview URL.
    const account = await nodemailer.createTestAccount();
    activeMode = "ethereal";
    console.log(`📧  Mail: Ethereal test inbox ready (${account.user})`);
    return nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass }
    });
  }

  activeMode = "console";
  return null;
}

function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = buildTransporter().catch((error) => {
      // Don't cache the failure: a transient problem (Ethereal unreachable,
      // DNS blip) would otherwise disable mail for the process lifetime.
      transporterPromise = null;
      throw error;
    });
  }
  return transporterPromise;
}

/**
 * @param {Object} message
 * @param {string} message.to
 * @param {string} message.subject
 * @param {string} message.text     plain-text body (always provide one)
 * @param {string} [message.html]
 * @param {string} [message.replyTo]
 * @returns {Promise<{delivered:boolean, mode:string, messageId?:string, previewUrl?:string}>}
 */
async function sendMail(message) {
  const transporter = await getTransporter();

  if (!transporter) {
    console.log("📧  [console mail — NOT delivered]");
    console.log(`    to      : ${message.to}`);
    console.log(`    subject : ${message.subject}`);
    // The body can hold a live password-reset link, so it is echoed only
    // in explicit development — never on a real deployment's logs.
    if (isDev()) {
      console.log(`    ${String(message.text || "").split("\n").join("\n    ")}`);
    }
    return { delivered: false, mode: "console" };
  }

  const info = await transporter.sendMail({
    from: defaultFrom(),
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: message.replyTo
  });

  const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
  if (previewUrl) {
    console.log(`📧  Ethereal preview: ${previewUrl}`);
  }

  return { delivered: true, mode: activeMode, messageId: info.messageId, previewUrl };
}

/** Boot-time check: logs the active mode; verifies SMTP creds if present. */
async function verifyMailer() {
  let transporter;
  try {
    transporter = await getTransporter();
  } catch (error) {
    // Mail being unavailable must never stop the store from serving.
    console.error(`⚠️   Mail: transport could not be created — ${error.message}`);
    console.error("     The site will run; email-dependent features degrade.");
    return { mode: mailMode(), ok: false, error: error.message };
  }

  if (!transporter) {
    console.log("📧  Mail: console mode — set SMTP_HOST in .env for real delivery");
    return { mode: "console", ok: true };
  }

  if (activeMode === "smtp") {
    try {
      await transporter.verify();
      console.log(`📧  Mail: SMTP ready via ${process.env.SMTP_HOST}`);
      return { mode: "smtp", ok: true };
    } catch (error) {
      console.error(`⚠️   Mail: SMTP configured but not working — ${error.message}`);
      return { mode: "smtp", ok: false, error: error.message };
    }
  }

  return { mode: activeMode, ok: true };
}

module.exports = { sendMail, verifyMailer };
