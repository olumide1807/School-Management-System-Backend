const { tokenCookieScope } = require("../utils/sendResponseToken");

exports.logout = async (req, res, next) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      signed: true,
      ...tokenCookieScope(),
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
