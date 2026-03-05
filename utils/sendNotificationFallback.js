const sendEmail = require("./sendgrid");

let maxRetries = 5; // Maximum number of retries
let retries = 0; // Current number of retries

async function sendNotificationFallback(emailAddress, subject, message, html) {
    let success = false;

    while (!success && retries < maxRetries) {
        const sendMessage = await sendEmail(emailAddress, subject, message, html);
        
        // Check if email sending was successful
        if (sendMessage.status === true) {
            success = true; // Set success flag to true
        } else {
            retries++; // Increment the number of retries
            console.log(`Email sending failed. Retrying attempt ${retries}/${maxRetries}`);
            // Optional: Add a delay before retrying to avoid overwhelming the email server
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds before retrying
        }
    }

    if (success) {
        console.log('Email sent successfully.');
        return true;
    } else {
        console.log(`Maximum retry limit (${maxRetries}) reached. Failed to send email.`);
        return false;
    }
};

module.exports = sendNotificationFallback;
