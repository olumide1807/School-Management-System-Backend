const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY)

const sendMessage = async (recipient, subject, text, html) => {
    const msg = {
        to: recipient,
        from: "mjbabdussalam@gmail.com",
        subject: subject,
        text: text,
        html: html
    }

    try {
        await sgMail.send(msg);
        return { status:true, message: `Message successfully sent to ${recipient}`}
    } catch (error) {
        console.error(`Error sending message, ${error}`);
        return {status: false, message: `Error sending message!. Please try again later`}
    }
}

module.exports = sendMessage;