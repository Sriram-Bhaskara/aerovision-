// =====================================================
// Input Validation Middleware
// =====================================================
const { body, param, query: queryParam, validationResult } = require('express-validator');

// Check validation results
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
};

// Auth validators
const validateRegister = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
  body('full_name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  handleValidation,
];

const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
  handleValidation,
];

// Flight search validators
const validateFlightSearch = [
  queryParam('airport').optional().isLength({ min: 3, max: 4 }).withMessage('Airport code must be 3-4 chars'),
  queryParam('type').optional().isIn(['departure', 'arrival']).withMessage('Type must be departure or arrival'),
  handleValidation,
];

module.exports = { validateRegister, validateLogin, validateFlightSearch, handleValidation };
