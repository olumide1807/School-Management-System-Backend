const isOwner = async (req, res, next) => {
  try {
    const { id } = req.params;

    if(!req.user || !req.user.id) {
      res
      .status(404)
      .json({
        message:
          "You are not in possession of this account!. Please, you can try logging in again",
      }); // respond with a 404 status and an error message
    return;
    }

    const currentUserId = req.user.id;
    // console.log(currentUserId);

    if (!currentUserId) {
      // if there's no currentUserId
      res
        .status(404)
        .json({
          message:
            "You are not in possession of this account!. Please, you can try logging in again",
        }); // respond with a 404 status and an error message
      return;
    }

    if (currentUserId !== id) {
      // if the currentUserId does not match the 'id' parameter
      res
        .status(404)
        .json({ message: "You are not in possession of this account!" }); // respond with a 404 status and an error message
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = isOwner;
