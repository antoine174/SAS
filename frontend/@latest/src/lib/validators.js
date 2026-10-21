// src/lib/validators.js
// Arabic 3-name rule — mirrors api/models/User.js exactly.
// trim → split on whitespace → ≥ 3 words → every word purely Arabic letters.
export const isValidArabicFullName = (value) => {
  if (typeof value !== 'string') return false;
  const words = value.trim().split(/\s+/);
  return words.length >= 3 && words.every((w) => /^[\u0600-\u06FF]+$/.test(w));
};
