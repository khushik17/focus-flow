const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

const errorHandler = (error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Validation failed',
      details: Object.values(error.errors).map((item) => item.message)
    });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({
      message: 'Invalid task ID format.'
    });
  }

  return res.status(statusCode).json({
    message
  });
};

module.exports = {
  notFoundHandler,
  errorHandler
};
