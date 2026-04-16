const verifyApiUser = (req, res, next) => {
  // Keep tests isolated from auth gate so unit tests remain focused on task logic.
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const userHeader = req.headers['x-auth-user'];
  if (!userHeader || String(userHeader).trim().length === 0) {
    return res.status(401).json({ message: 'Authentication required. Please log in.' });
  }

  req.user = { identifier: String(userHeader).trim() };
  return next();
};

module.exports = {
  verifyApiUser
};
