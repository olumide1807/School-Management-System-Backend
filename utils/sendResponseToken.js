const { GenerateSignature } = require("./index");

// Get token from model, create cookie and send response
exports.sendTokenResponse = (userID, statusCode, res, data = null) => {
  // Create token
  const token = GenerateSignature(userID);

  const options = {
    expires: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours in milliseconds
    httpOnly: true,
    signed: true,
    // domain: "onrender.com",
    domain: "localhost",

    path: "/",
  };

  // console.log( "processENV", process.env.NODE_ENV);
  console.log("send response token here")

  if (process.env.NODE_ENV === "production") {
    options.secure = true;
    options.domain = "sms-l7y1.onrender.com";
  }

  if (process.env.NODE_ENV === "development") {
    options.domain = "localhost";
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
