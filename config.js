module.exports = {
  // Bot Configuration
  BOT_TOKEN: process.env.BOT_TOKEN || '8295150408:AAHk4M0LX0YAUk4vDuSCi4mOFg6se66J3hM',
  ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [8435248854, 5518423310],
  ADMIN_CODE: process.env.ADMIN_CODE || 'ADMIN12345',
  
  // Database
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb+srv://sure:mQor2EPuhPgApFnJ@test.ebvv4hf.mongodb.net/earningbot?retryWrites=true&w=majority',
  
  // Cloudinary
  CLOUDINARY: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dneusgyzc',
    api_key: process.env.CLOUDINARY_API_KEY || '474713292161728',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'DHJmvD784FEVmeOt1-K8XeNhCQQ'
  },
  
  // Default Settings
  DEFAULTS: {
    startImage: 'https://res.cloudinary.com/dneusgyzc/image/upload/l_text:Stalinist%20One_140_bold:{name},co_rgb:00e5ff,g_center/fl_preserve_transparency/v1763670359/1000106281_cfg1ke.jpg',
    startMessage: '👋 *Welcome to Earning Bot!*\n\nEarn money by completing tasks and referring friends!\n\n⚠️ First, join our channels to unlock all features:',
    menuImage: 'https://res.cloudinary.com/dneusgyzc/image/upload/l_text:Stalinist%20One_140_bold:{name},co_rgb:00e5ff,g_center/fl_preserve_transparency/v1763670359/1000106281_cfg1ke.jpg',
    menuMessage: '🎉 *Welcome to Earning Panel!*\n\n💰 Your Balance: ₹{balance}\n📊 Referrals: {referrals}\n\nSelect an option below:',
    bonusImage: 'https://res.cloudinary.com/dneusgyzc/image/upload/l_text:Stalinist%20One_140_bold:{amount},co_rgb:00e5ff,g_center/fl_preserve_transparency/v1763670359/1000106281_cfg1ke.jpg',
    bonusAmount: 10,
    minWithdrawal: 100,
    maxWithdrawal: 10000,
    referBonus: 50,
    minReferBonus: 10,
    maxReferBonus: 100,
    taskBonus: 20,
    maxScreenshots: 3
  },
  
  // Database Collections
  COLLECTIONS: {
    USERS: 'users',
    CONFIG: 'config',
    TRANSACTIONS: 'transactions',
    GIFT_CODES: 'gift_codes',
    TASKS: 'tasks',
    TASK_REQUESTS: 'task_requests',
    WITHDRAWALS: 'withdrawals',
    REFERRALS: 'referrals'
  }
};
