const crypto = require('crypto');
const fetch = require('node-fetch');

// Generate random code
function generateCode(length = 8, prefix = '') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = prefix.toUpperCase();
  
  for (let i = result.length; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
}

// Generate referral code
function generateReferralCode() {
  return generateCode(5);
}

// Generate transaction ID
function generateTransactionId() {
  return 'TXN' + generateCode(10);
}

// Generate withdrawal ID
function generateWithdrawalId() {
  return 'WD' + generateCode(7);
}

// Generate UTR
function generateUTR() {
  return 'UTR' + Date.now().toString(36).toUpperCase() + generateCode(4);
}

// Format currency
function formatCurrency(amount) {
  return `₹${Number(amount).toFixed(2)}`;
}

// Format date
function formatDate(date) {
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Escape HTML
function escapeHTML(text) {
  if (!text) return '';
  return text.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Validate UPI ID
function validateUPI(upi) {
  const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
  return upiRegex.test(upi);
}

// Validate amount
function validateAmount(amount, min = 0, max = 1000000) {
  const num = Number(amount);
  return !isNaN(num) && num >= min && num <= max;
}

// Clean name for image
function cleanNameForImage(text) {
  if (!text) return 'User';
  return text.replace(/[^\w\s\-\.]/gi, '').trim() || 'User';
}

// Parse HTML message for display
function parseHTMLForDisplay(text) {
  if (!text) return '';
  
  // Replace variables but keep HTML tags for actual display
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

// Get pagination
function getPagination(page, totalPages) {
  const buttons = [];
  
  if (page > 1) {
    buttons.push({ text: '◀️ Prev', callback_data: `page_${page - 1}` });
  }
  
  buttons.push({ text: `${page}/${totalPages}`, callback_data: 'current_page' });
  
  if (page < totalPages) {
    buttons.push({ text: 'Next ▶️', callback_data: `page_${page + 1}` });
  }
  
  return buttons;
}

// Delay function
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Check if image URL is valid
async function isValidImageUrl(url) {
  try {
    if (!url.startsWith('http')) return false;
    const response = await fetch(url, { method: 'HEAD' });
    const contentType = response.headers.get('content-type');
    return contentType && contentType.startsWith('image/');
  } catch (error) {
    return false;
  }
}

// Generate user stats text
function generateUserStats(user, rank, totalUsers) {
  const joinDate = new Date(user.joinedAt).toLocaleDateString('en-IN');
  const lastActive = new Date(user.lastActive).toLocaleDateString('en-IN');
  
  return `👤 <b>User Details</b>\n\n` +
         `🆔 <b>ID:</b> <code>${user.userId}</code>\n` +
         `👤 <b>Name:</b> ${user.firstName || ''} ${user.lastName || ''}\n` +
         `📱 <b>Username:</b> ${user.username ? '@' + user.username : 'Not set'}\n` +
         `💰 <b>Balance:</b> ₹${user.balance || 0}\n` +
         `📊 <b>Referrals:</b> ${user.referrals || 0}\n` +
         `🏆 <b>Rank:</b> ${rank}/${totalUsers}\n` +
         `📅 <b>Joined:</b> ${joinDate}\n` +
         `🕐 <b>Last Active:</b> ${lastActive}\n` +
         `✅ <b>Verified:</b> ${user.verified ? 'Yes' : 'No'}`;
}

module.exports = {
  generateCode,
  generateReferralCode,
  generateTransactionId,
  generateWithdrawalId,
  generateUTR,
  formatCurrency,
  formatDate,
  escapeHTML,
  validateUPI,
  validateAmount,
  cleanNameForImage,
  parseHTMLForDisplay,
  getPagination,
  delay,
  isValidImageUrl,
  generateUserStats
};
