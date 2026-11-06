const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");





module.exports.GeneratePassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

module.exports.ValidatePassword = async (enteredPassword,savedPassword) => {
  return await bcrypt.compare(enteredPassword,savedPassword)
};

// Throws if it can't sign (no JWT_SECRET or JWT_EXPIRE): callers put the result
// straight in a response, so returning the error sent a 200 with token: {}.
module.exports.GenerateSignature = (payload) =>
  jwt.sign({ id: payload }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });

module.exports.ValidateSignature = async (req) => {
  try {
    const signature = req.get("Authorization");
    console.log(signature);
    const payload = await jwt.verify(signature.split(" ")[1], process.env.JWT_SECRET);
    req.user = payload;
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
};


