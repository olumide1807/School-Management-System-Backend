const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");





module.exports.GeneratePassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

module.exports.ValidatePassword = async (enteredPassword,savedPassword) => {
  return await bcrypt.compare(enteredPassword,savedPassword)
};

module.exports.GenerateSignature =  (payload) => {
  try {
    return  jwt.sign({id:payload},process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });
  } catch (error) {
    console.log(error);
    return error;
  }
};

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


