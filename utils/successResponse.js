exports.successResponse = (res, statusCode, message = null, data = null) => {
    return res.status(statusCode).json({
        success: true,
        message: message ? message : null,
        data: data ? data : null
    })
};