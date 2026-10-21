const mongoose = require('mongoose');

/**
 * Arabic 3-name rule (mirrored on the frontend in src/lib/validators.js):
 *   trim → split on whitespace → at least 3 words → every word is Arabic only.
 */
const isValidArabicFullName = (value) => {
  if (typeof value !== 'string') return false;
  const words = value.trim().split(/\s+/);
  return words.length >= 3 && words.every((w) => /^[\u0600-\u06FF]+$/.test(w));
};

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: isValidArabicFullName,
      message: 'الاسم يجب أن يكون ثلاثي باللغة العربية (مثال: انطوان صبحي سليمان)',
    },
  },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true }, // bcrypt hash — never store plain text
  role:     { type: String, enum: ['user', 'admin'], default: 'user' },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);
User.isValidArabicFullName = isValidArabicFullName;

module.exports = User;
