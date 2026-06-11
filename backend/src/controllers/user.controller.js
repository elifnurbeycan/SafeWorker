const User = require('../models/User');
const bcrypt = require('bcrypt');
const { asyncHandler, createError } = require('../middlewares/error.middleware');

const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find({}).sort({ createdAt: -1 });
  res.json({
    success: true,
    message: 'Users fetched successfully',
    data: users
  });
});

const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name) throw createError(400, 'name is required');
  if (!email) throw createError(400, 'email is required');
  if (!password) throw createError(400, 'password is required');
  if (role && !['admin', 'worker'].includes(role)) {
    throw createError(400, 'role must be admin or worker');
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw createError(400, 'email already exists');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    passwordHash,
    role: role || 'worker'
  });

  res.status(201).json({
    success: true,
    message: 'User created successfully',
    data: user
  });
});

const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (id === req.user._id.toString()) {
    throw createError(400, 'Kendi hesabınızı silemezsiniz');
  }

  const user = await User.findByIdAndDelete(id);
  if (!user) {
    throw createError(404, 'Kullanıcı bulunamadı');
  }

  res.json({
    success: true,
    message: 'User deleted successfully',
    data: user
  });
});

module.exports = {
  getUsers,
  createUser,
  deleteUser
};
