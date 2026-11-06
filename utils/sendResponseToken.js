const { GenerateSignature } = require("./index");

// Where the token cookie applies. The domain comes from COOKIE_DOMAIN; with
// none, it's left off and the browser ties the cookie to the host that set it.
// Shared with logout, which only clears a cookie with the same domain and path.
exports.tokenCookieScope = () => ({
  path: "/",
  ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
});

// Get token from model, create cookie and send response
exports.sendTokenResponse = (userID, statusCode, res, data = null) => {
  // Create token
  const token = GenerateSignature(userID);

  const options = {
    expires: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours in milliseconds
    httpOnly: true,
    signed: true,
    ...exports.tokenCookieScope(),
  };

  // console.log( "processENV", process.env.NODE_ENV);
  console.log("send response token here")

  if (process.env.NODE_ENV === "production") {
    options.secure = true;
  }

  try {
    res.cookie("token", token, options);
    res.status(statusCode);
    if (data !== null) {
      res.json({
        success: true,
        token: token,
        data: data,
      });
    } else {
      res.json({
        success: true,
        token: token,
      });
    }
  } catch (error) {
    // Handle error
    console.error("Error setting cookie:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
