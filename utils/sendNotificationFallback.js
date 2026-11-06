const sendEmail = require("./sendEmail");

// The same send with retries, and a circuit breaker: when several sends fail
// close together the provider is probably down, so stop making people wait on
// it for a few minutes, then try again. The state is per running instance.
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;
const FAILURES_TO_PAUSE = 3;
const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const PAUSE_MS = 5 * 60 * 1000;

let recentFailures = [];
let pausedUntil = 0; // 0 when not paused

const recordSuccess = () => {
    recentFailures = [];
    if (pausedUntil) console.log("EMAIL IS BACK: a send got through, so sending has resumed.");
    pausedUntil = 0;
};

const recordFailure = (reason) => {
    const now = Date.now();
    recentFailures = [...recentFailures.filter((at) => now - at < FAILURE_WINDOW_MS), now];
    if (!pausedUntil && recentFailures.length < FAILURES_TO_PAUSE) return;

    pausedUntil = now + PAUSE_MS;
    console.error(
        `EMAIL IS PAUSED: ${recentFailures.length} sends failed in the last ${FAILURE_WINDOW_MS / 60000} minutes ` +
        `(latest: ${reason}). Only reset codes will be attempted until ${new Date(pausedUntil).toISOString()}, ` +
        `when the next send tries again.`
    );
};

// urgent: attempted even while paused. Reset codes are the only way back into
// an account, and they're sent after the response, so nobody waits on them.
// Returns whether it was sent; it never throws.
async function sendNotificationFallback(emailAddress, subject, message, html, { urgent = false } = {}) {
    const trial = pausedUntil > 0 && !urgent;
    if (trial && Date.now() < pausedUntil) {
        console.error(`Email is paused, so "${subject}" wasn't sent.`);
        return false;
    }
    // The pause is over: this send is the one test of whether it should stay
    // over. Anything else arriving meanwhile waits for the answer.
    if (trial) pausedUntil = Date.now() + PAUSE_MS;

    const attempts = trial ? 1 : MAX_ATTEMPTS;
    let result;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        result = await sendEmail(emailAddress, subject, message, html);
        if (result.status === true) {
            recordSuccess();
            return true;
        }
        // Nothing was attempted, so this says nothing about the provider
        if (result.skipped) return false;
        // The provider answered and refused this one address, so it's working
        if (result.recipientFault) {
            recordSuccess();
            return false;
        }
        if (result.retryable === false) break;
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }

    recordFailure(result.reason || result.message);
    return false;
}

module.exports = sendNotificationFallback;
