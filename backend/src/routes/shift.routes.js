const express = require('express');

const {
  startShift,
  endShift,
  getActiveShifts,
  getMyActiveShift
} = require('../controllers/shift.controller');
const { protect } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/role.middleware');

const router = express.Router();

router.get('/my-active', protect, getMyActiveShift);
router.post('/start', protect, authorizeRoles('worker', 'admin'), startShift);
router.patch('/:id/end', protect, authorizeRoles('worker', 'admin'), endShift);
router.get('/active', protect, authorizeRoles('admin'), getActiveShifts);

module.exports = router;
