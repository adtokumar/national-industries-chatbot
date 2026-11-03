/**
 * Vercel Serverless Function Entry Point
 * Routes all /api requests through the main handleRequest dispatcher.
 */
const { handleRequest } = require('../server');

module.exports = (req, res) => {
  return handleRequest(req, res);
};

