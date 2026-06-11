const express = require('express');
const { getUsers, createUser, deleteUser } = require('../controllers/user.controller');
const { protect } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/role.middleware');

const router = express.Router();

// All routes require authentication and admin role
router.use(protect, authorizeRoles('admin'));

router.get('/', getUsers);
router.post('/', createUser);
router.delete('/:id', deleteUser);

module.exports = router;
