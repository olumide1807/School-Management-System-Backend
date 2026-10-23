// The one rule for what counts as a money amount: zero or more, with at
// most two decimal places (kobo). Used to validate fee amounts and payment
// amounts on the way in, and to read stored fee amounts, so none of them
// can disagree. (Payments additionally refuse zero.)
//
// Returns the amount in minor units (an integer), or null if it isn't
// cleanly a valid amount. Strings are accepted only if they are exactly a
// plain number ("2000", "1500.50") — no commas, spaces, signs, currency
// symbols or exponents. "50,000" is rejected rather than read as 50.

const PLAIN_AMOUNT = /^\d+(\.\d{1,2})?$/;

const parseFeeAmount = (value) => {
    if (typeof value === "number") {
        if (!Number.isFinite(value) || value < 0) return null;
        const minor = Math.round(value * 100);
        // More than two decimal places is not a valid amount
        if (Math.abs(value * 100 - minor) > 1e-6) return null;
        return minor;
    }
    if (typeof value === "string" && PLAIN_AMOUNT.test(value)) {
        return Math.round(Number(value) * 100);
    }
    return null;
};

module.exports = { parseFeeAmount };
