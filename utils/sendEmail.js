const nodemailer = require("nodemailer");
const sgMail = require("@sendgrid/mail");

// The only code that talks to an email provider; everything else calls this.
// It never throws, because a failed send must not fail what triggered it:
// { status: true } when sent, { status: false, message } when not, plus
// skipped: true when nothing was attempted, and for a provider's refusal
// retryable: false, and recipientFault: true when it's about this address.
//
// The environment is read on each send, not at load, so it can't be read
// before dotenv has run.

const isSet = (name) => Boolean(process.env[name]?.trim());

// FROM_EMAIL is the address, FROM_SENDER only the name shown beside it. A From
// with no address is sent with no From at all.
const senderName = () => process.env.FROM_SENDER?.replace(/<.*>/, "").trim() || undefined;

const PROVIDERS = {
    nodemailer: {
        needs: () => [
            ...(isSet("EMAIL_SERVICE") || isSet("EMAIL_HOST") ? [] : ["EMAIL_SERVICE"]),
            "FROM_EMAIL",
            "FROM_PASSWORD",
        ],
        send: async ({ to, subject, text, html }) => {
            const transporter = nodemailer.createTransport({
                service: process.env.EMAIL_SERVICE,
                host: process.env.EMAIL_HOST,
                port: 465,
                secure: true,
                auth: { user: process.env.FROM_EMAIL, pass: process.env.FROM_PASSWORD },
                // Callers wait on this, and by default a blocked port takes minutes to fail
                connectionTimeout: 10000,
                greetingTimeout: 10000,
                socketTimeout: 20000,
            });
            await transporter.sendMail({
                from: { name: senderName(), address: process.env.FROM_EMAIL },
                to, subject, text, html,
            });
        },
    },
    sendgrid: {
        needs: () => ["SENDGRID_API_KEY", "FROM_EMAIL"],
        send: async ({ to, subject, text, html }) => {
            sgMail.setApiKey(process.env.SENDGRID_API_KEY);
            await sgMail.send({
                from: { name: senderName(), email: process.env.FROM_EMAIL },
                to, subject, text, html,
            });
        },
    },
};

const isEnabled = () => process.env.EMAIL_ENABLED?.trim().toLowerCase() === "true";
const providerName = () => process.env.EMAIL_PROVIDER?.trim().toLowerCase() || "nodemailer";

// Why nothing can be sent right now, or null if something can. Names settings,
// never their values.
const whyNotSending = () => {
    if (!isEnabled()) return `Email is off (EMAIL_ENABLED isn't "true")`;
    const provider = PROVIDERS[providerName()];
    if (!provider) return `Email is on, but EMAIL_PROVIDER is "${providerName()}": use ${Object.keys(PROVIDERS).join(" or ")}`;
    const missing = provider.needs().filter((name) => !isSet(name));
    if (missing.length) return `Email is on through ${providerName()}, but ${missing.join(", ")} isn't set`;
    return null;
};

// nodemailer: code EENVELOPE or EAUTH, responseCode the SMTP reply. SendGrid:
// code is the HTTP status.
const describeRefusal = (error) => {
    const recipientFault = error.code === "EENVELOPE" || error.code === 400;
    const refused = recipientFault || error.code === "EAUTH" || error.code === 401 || error.code === 403 || error.responseCode >= 500;
    return { recipientFault, retryable: !refused };
};

const sendEmail = async (to, subject, text, html) => {
    const problem = whyNotSending();
    if (problem) {
        (isEnabled() ? console.error : console.log)(`${problem}, so "${subject}" wasn't sent.`);
        return { status: false, skipped: true, message: problem };
    }
    if (!to) {
        console.error(`"${subject}" has no recipient, so it wasn't sent.`);
        return { status: false, skipped: true, message: "No recipient" };
    }

    try {
        await PROVIDERS[providerName()].send({ to, subject, text, html });
        return { status: true, message: `Message successfully sent to ${to}` };
    } catch (error) {
        // The error only: the body can hold a reset code or a password
        console.error(`"${subject}" wasn't sent: ${error.message}`);
        return { status: false, message: "Error sending message!. Please try again later", reason: error.message, ...describeRefusal(error) };
    }
};

// For the startup log, so a mistyped switch doesn't look like a quiet inbox
const emailStatus = () => whyNotSending() || `Email is on through ${providerName()}`;

module.exports = sendEmail;
module.exports.emailStatus = emailStatus;
