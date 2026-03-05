exports.logout = async (req, res, next) => {
  try {
    res.clearCookie("token", {
      domain: process.env.NODE_ENV === "production" ? "sms-l7y1.onrender.com" : "localhost",
      httpOnly: true,
      signed: true,
      path: "/",
    });

    req.user = null;

    return res
      .status(200)
      .json({ success: true, message: "user successfully logged out! :)" });
  } catch {
    console.log(`error from logout`, error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
