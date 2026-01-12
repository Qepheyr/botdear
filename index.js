const { Telegraf, Scenes, session, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const fetch = require('node-fetch');
require('dotenv').config();

// ==========================================
// CONFIGURATION
// ==========================================

// Cloudinary configuration
cloudinary.config({
  cloud_name: 'dneusgyzc',
  api_key: '474713292161728',
  api_secret: 'DHJmvD784FEVmeOt1-K8XeNhCQQ'
});

// Initialize bot
const BOT_TOKEN = process.env.BOT_TOKEN || '8295150408:AAHk4M0LX0YAUk4vDuSCi4mOFg6se66J3hM';
const bot = new Telegraf(BOT_TOKEN);

// MongoDB connection - FIXED: Correct format for MongoDB URI
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://sandip102938:Q1g2Fbn7ewNqEvuK@test.ebvv4hf.mongodb.net/earningbot?retryWrites=true&w=majority';

// 🔐 ADMIN CONFIGURATION
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [8435248854, 5518423310];
const ADMIN_CODE = process.env.ADMIN_CODE || 'ADMIN12345'; // Default admin code

// Emergency stop for error loop
bot.command('emergency', async (ctx) => {
    console.log('🆘 Emergency stop triggered by:', ctx.from.id);
    errorCooldowns.clear();
    await ctx.reply('🆘 Emergency error reset executed. Bot should respond now.');
    
    setTimeout(async () => {
        await ctx.reply('✅ Bot is now responsive. Try /start or /admin');
    }, 1000);
});

// ==========================================
// DATABASE SETUP
// ==========================================

let db, client;

async function connectDB() {
    try {
        console.log('🔗 Attempting MongoDB connection...');
        
        // Use a more robust connection string
        const connectionString = mongoUri.replace('mongodb+srv://', 'mongodb://');
        
        client = new MongoClient(connectionString, {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            minPoolSize: 1,
            retryWrites: true,
            w: 'majority'
        });
        
        await client.connect();
        db = client.db();
        
        // Test connection
        await db.command({ ping: 1 });
        console.log('✅ Connected to MongoDB - earningbot database');
        
        // Create indexes
        await createIndexes();
        return true;
        
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        console.log('⚠️ Retrying connection in 5 seconds...');
        
        // Try alternative connection method
        try {
            if (client) await client.close();
            
            // Try direct connection
            client = new MongoClient(mongoUri, {
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 10000
            });
            
            await client.connect();
            db = client.db('earningbot');
            console.log('✅ Connected via alternative method');
            return true;
            
        } catch (retryError) {
            console.error('❌ Retry also failed:', retryError.message);
            return false;
        }
    }
}

async function createIndexes() {
    try {
        // Users collection
        await db.collection('users').createIndex({ userId: 1 }, { unique: true });
        await db.collection('users').createIndex({ referCode: 1 }, { unique: true, sparse: true });
        await db.collection('users').createIndex({ referredBy: 1 });
        await db.collection('users').createIndex({ balance: -1 });
        await db.collection('users').createIndex({ joinedAt: -1 });
        
        // Admin config
        await db.collection('admin').createIndex({ type: 1 }, { unique: true });
        
        // Transactions
        await db.collection('transactions').createIndex({ userId: 1, date: -1 });
        await db.collection('transactions').createIndex({ transactionId: 1 }, { unique: true });
        
        // Gift codes
        await db.collection('giftcodes').createIndex({ code: 1 }, { unique: true });
        await db.collection('giftcodes').createIndex({ expiresAt: 1 });
        
        // Tasks
        await db.collection('tasks').createIndex({ taskId: 1 }, { unique: true });
        await db.collection('tasks').createIndex({ isActive: 1 });
        
        // Task submissions
        await db.collection('tasksubmissions').createIndex({ submissionId: 1 }, { unique: true });
        await db.collection('tasksubmissions').createIndex({ userId: 1, taskId: 1 });
        await db.collection('tasksubmissions').createIndex({ status: 1, submittedAt: -1 });
        
        // Withdrawal requests
        await db.collection('withdrawals').createIndex({ requestId: 1 }, { unique: true });
        await db.collection('withdrawals').createIndex({ userId: 1, status: 1, createdAt: -1 });
        
        console.log('✅ Database indexes created');
    } catch (error) {
        console.error('❌ Error creating indexes:', error);
    }
}

// ==========================================
// DEFAULT CONFIGURATIONS
// ==========================================

const DEFAULT_CONFIG = {
    startImage: 'https://res.cloudinary.com/dneusgyzc/image/upload/v1763670359/1000106281_cfg1ke.jpg',
    startMessage: '👋 *Welcome to Earning Bot!*\n\n💰 *Start earning money by completing simple tasks!*\n\n📊 *Current Statistics:*\n• Active Users: {total_users}\n• Total Paid: {total_paid}\n• Available Tasks: {available_tasks}\n\n⚠️ *Verification Required*\nJoin our channels to access earning features:',
    menuImage: 'https://res.cloudinary.com/dneusgyzc/image/upload/v1763670359/1000106281_cfg1ke.jpg',
    menuMessage: '🎉 *Welcome to your Earning Dashboard!*\n\n💰 *Balance:* {balance} ₹\n👥 *Referrals:* {total_referrals}\n🎯 *Tasks Completed:* {tasks_completed}\n\nSelect an option below:',
    codeTimer: 7200,
    contactButton: true,
    
    // Referral settings
    referral: {
        minReferAmount: 10,
        maxReferAmount: 100,
        referBonus: 50,
        minWithdrawRefer: 2,
        enabled: true
    },
    
    // Bonus settings
    bonus: {
        enabled: true,
        amount: 25,
        image: 'https://res.cloudinary.com/dneusgyzc/image/upload/v1763670359/1000106281_cfg1ke.jpg',
        showAmountOverlay: true
    },
    
    // Withdrawal settings
    withdrawal: {
        minAmount: 100,
        maxAmount: 5000,
        dailyLimit: 2000,
        processingFee: 2,
        enabled: true
    },
    
    // Gift code settings
    giftCode: {
        defaultLength: 8,
        minAmount: 10,
        maxAmount: 1000,
        defaultUses: 10,
        defaultExpiry: 1440 // minutes
    },
    
    // Task settings
    tasks: {
        minScreenshots: 1,
        maxScreenshots: 5,
        autoApprove: false
    },
    
    // Channel levels
    channelLevels: {
        F: { name: 'Hidden', hide: false, verify: false },
        S: { name: 'Show Only', hide: false, verify: false },
        SS: { name: 'Auto Accept', hide: false, verify: true },
        SSS: { name: 'Must Join', hide: false, verify: true }
    },
    
    // Admin settings
    adminCode: ADMIN_CODE,
    botDisabled: false,
    disabledMessage: '🚧 Bot is under maintenance. Please check back later.',
    
    // Image overlay settings
    imageOverlaySettings: {
        startImage: true,
        menuImage: true,
        bonusImage: true
    },
    
    // Display settings
    displaySettings: {
        channelsPerRow: 2,
        usersPerPage: 20,
        withdrawalsPerPage: 15,
        tasksPerPage: 10
    },
    
    // Statistics
    statistics: {
        totalEarned: 0,
        totalWithdrawn: 0,
        totalUsers: 0,
        totalReferrals: 0,
        totalTasks: 0
    }
};

// ==========================================
// DATABASE INITIALIZATION
// ==========================================

async function initBot() {
    try {
        console.log('🔄 Initializing bot configuration...');
        
        // Check if config exists
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        if (!config) {
            console.log('📝 Creating new bot configuration...');
            
            await db.collection('admin').insertOne({
                type: 'config',
                admins: ADMIN_IDS,
                mutedAdmins: [],
                startImage: DEFAULT_CONFIG.startImage,
                startMessage: DEFAULT_CONFIG.startMessage,
                menuImage: DEFAULT_CONFIG.menuImage,
                menuMessage: DEFAULT_CONFIG.menuMessage,
                codeTimer: DEFAULT_CONFIG.codeTimer,
                showContactButton: DEFAULT_CONFIG.contactButton,
                channels: [],
                uploadedImages: [],
                imageOverlaySettings: DEFAULT_CONFIG.imageOverlaySettings,
                referralSettings: DEFAULT_CONFIG.referral,
                bonusSettings: DEFAULT_CONFIG.bonus,
                withdrawalSettings: DEFAULT_CONFIG.withdrawal,
                giftCodeSettings: DEFAULT_CONFIG.giftCode,
                taskSettings: DEFAULT_CONFIG.tasks,
                channelLevels: DEFAULT_CONFIG.channelLevels,
                adminCode: DEFAULT_CONFIG.adminCode,
                botDisabled: DEFAULT_CONFIG.botDisabled,
                disabledMessage: DEFAULT_CONFIG.disabledMessage,
                displaySettings: DEFAULT_CONFIG.displaySettings,
                statistics: DEFAULT_CONFIG.statistics,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            
            console.log('✅ Created new bot configuration');
        } else {
            console.log('✅ Loaded existing bot configuration');
            
            // Update with new fields if missing
            const updates = {};
            
            if (!config.referralSettings) updates.referralSettings = DEFAULT_CONFIG.referral;
            if (!config.bonusSettings) updates.bonusSettings = DEFAULT_CONFIG.bonus;
            if (!config.withdrawalSettings) updates.withdrawalSettings = DEFAULT_CONFIG.withdrawal;
            if (!config.giftCodeSettings) updates.giftCodeSettings = DEFAULT_CONFIG.giftCode;
            if (!config.taskSettings) updates.taskSettings = DEFAULT_CONFIG.tasks;
            if (!config.channelLevels) updates.channelLevels = DEFAULT_CONFIG.channelLevels;
            if (!config.adminCode) updates.adminCode = DEFAULT_CONFIG.adminCode;
            if (!config.displaySettings) updates.displaySettings = DEFAULT_CONFIG.displaySettings;
            if (!config.statistics) updates.statistics = DEFAULT_CONFIG.statistics;
            
            if (Object.keys(updates).length > 0) {
                updates.updatedAt = new Date();
                await db.collection('admin').updateOne(
                    { type: 'config' },
                    { $set: updates }
                );
                console.log('✅ Updated bot configuration with new fields');
            }
        }
        
        console.log(`✅ Bot initialized with ${ADMIN_IDS.length} admins`);
        return true;
        
    } catch (error) {
        console.error('❌ Error initializing bot:', error);
        return false;
    }
}

// ==========================================
// ERROR HANDLING SYSTEM
// ==========================================

const errorCooldowns = new Map();

function canProcessError(errorKey, maxAttempts = 2, cooldownMs = 60000) {
    const now = Date.now();
    const errorData = errorCooldowns.get(errorKey) || { attempts: 0, lastAttempt: 0 };
    
    if (now - errorData.lastAttempt > cooldownMs) {
        errorData.attempts = 0;
    }
    
    if (errorData.attempts >= maxAttempts) {
        console.log(`⏸️ Skipping error ${errorKey} - reached max attempts (${maxAttempts})`);
        return false;
    }
    
    errorData.attempts++;
    errorData.lastAttempt = now;
    errorCooldowns.set(errorKey, errorData);
    
    return true;
}

function resetErrorCooldown(errorKey) {
    errorCooldowns.delete(errorKey);
    console.log(`✅ Reset error cooldown for: ${errorKey}`);
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Generate Random Code
function generateCode(prefix = '', length = 8) {
    try {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = prefix.toUpperCase();
        
        for (let i = code.length; i < length; i++) {
            code += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        
        return code;
    } catch (error) {
        return prefix.toUpperCase() + Math.random().toString(36).substr(2, length - prefix.length).toUpperCase();
    }
}

// Generate Referral Code (5 alphanumeric)
function generateReferCode() {
    return generateCode('', 5);
}

// Generate Transaction ID
function generateTransactionId() {
    return 'TXN' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Generate Withdrawal Request ID (7 alphanumeric)
function generateWithdrawalId() {
    return 'WD' + Date.now().toString(36).toUpperCase().substr(2, 5);
}

// Generate Task Submission ID
function generateSubmissionId() {
    return 'TSK' + Date.now() + Math.random().toString(36).substr(2, 4).toUpperCase();
}

// Escape markdown characters
function escapeMarkdown(text) {
    if (!text) return '';
    return text.toString()
        .replace(/\_/g, '\\_')
        .replace(/\*/g, '\\*')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/\~/g, '\\~')
        .replace(/\`/g, '\\`')
        .replace(/\>/g, '\\>')
        .replace(/\#/g, '\\#')
        .replace(/\+/g, '\\+')
        .replace(/\-/g, '\\-')
        .replace(/\=/g, '\\=')
        .replace(/\|/g, '\\|')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
        .replace(/\./g, '\\.')
        .replace(/\!/g, '\\!');
}

// Format HTML for display (shows tags only when needed)
function formatHTMLForDisplay(text, showTags = false) {
    if (!text) return '';
    
    if (showTags) {
        // Show with code tags for copying
        return `<code>${escapeMarkdown(text)}</code>`;
    } else {
        // Remove HTML tags for display but keep content
        return text
            .replace(/<b>(.*?)<\/b>/gi, '*$1*')
            .replace(/<i>(.*?)<\/i>/gi, '_$1_')
            .replace(/<u>(.*?)<\/u>/gi, '$1')
            .replace(/<code>(.*?)<\/code>/gi, '`$1`')
            .replace(/<pre>(.*?)<\/pre>/gis, '```\n$1\n```')
            .replace(/<a href="(.*?)">(.*?)<\/a>/gi, '[$2]($1)')
            .replace(/<[^>]*>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
    }
}

// Safe send message with HTML parse mode
async function safeSendMessage(ctx, text, options = {}) {
    try {
        return await ctx.reply(text, { 
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...options 
        });
    } catch (error) {
        console.error('Error sending message:', error.message);
        // Try without HTML parsing
        return await ctx.reply(text, { 
            ...options,
            disable_web_page_preview: true 
        });
    }
}

// Safe edit message with HTML parse mode
async function safeEditMessage(ctx, text, options = {}) {
    try {
        return await ctx.editMessageText(text, { 
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...options 
        });
    } catch (error) {
        console.error('Error editing message:', error.message);
        // Try without HTML parsing
        return await ctx.editMessageText(text, { 
            ...options,
            disable_web_page_preview: true 
        });
    }
}

// Check Admin Status
async function isAdmin(userId) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        if (!config || !config.admins) return ADMIN_IDS.includes(Number(userId));
        
        return config.admins.some(id => String(id) === String(userId));
    } catch (error) {
        console.error('Error checking admin:', error);
        return ADMIN_IDS.includes(Number(userId));
    }
}

// Get active admins (exclude muted)
async function getActiveAdmins() {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        if (!config) return ADMIN_IDS;
        
        const allAdmins = config.admins || ADMIN_IDS;
        const mutedAdmins = config.mutedAdmins || [];
        
        return allAdmins.filter(adminId => !mutedAdmins.includes(adminId));
    } catch (error) {
        console.error('Error getting active admins:', error);
        return ADMIN_IDS;
    }
}

// Notify Admins
async function notifyAdmin(text, excludeMuted = true) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        if (!config) return;
        
        let allAdmins = config.admins || ADMIN_IDS;
        
        if (excludeMuted) {
            const mutedAdmins = config.mutedAdmins || [];
            allAdmins = allAdmins.filter(adminId => !mutedAdmins.includes(adminId));
        }
        
        const promises = allAdmins.map(async (adminId) => {
            try {
                await bot.telegram.sendMessage(adminId, text, { 
                    parse_mode: 'HTML',
                    disable_web_page_preview: true 
                });
            } catch (error) {
                console.error(`Failed to notify admin ${adminId}:`, error.message);
            }
        });
        
        await Promise.allSettled(promises);
    } catch (error) {
        console.error('Error in notifyAdmin:', error);
    }
}

// Get user variables for message replacement
function getUserVariables(user) {
    try {
        const firstName = user.first_name || '';
        const lastName = user.last_name || '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
        const username = user.username ? `@${user.username}` : '';
        
        return {
            first_name: firstName,
            last_name: lastName,
            full_name: fullName,
            username: username,
            name: firstName || username || 'User'
        };
    } catch (error) {
        return {
            first_name: '',
            last_name: '',
            full_name: '',
            username: '',
            name: 'User'
        };
    }
}

// Replace variables in text
function replaceVariables(text, variables) {
    try {
        let result = text;
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\{${key}\\}`, 'gi');
            result = result.replace(regex, value || '');
        }
        return result;
    } catch (error) {
        return text;
    }
}

// Format time remaining
function formatTimeRemaining(seconds) {
    try {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        return `${hours}h ${minutes}m ${secs}s`;
    } catch (error) {
        return 'Error';
    }
}

// Format currency
function formatCurrency(amount) {
    return `₹${parseFloat(amount).toFixed(2)}`;
}

// Upload to Cloudinary
async function uploadToCloudinary(fileBuffer, folder = 'bot_images') {
    try {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { 
                    folder: folder,
                    resource_type: 'auto'
                },
                (error, result) => {
                    if (error) {
                        console.error('Cloudinary upload error:', error);
                        reject(error);
                    } else {
                        resolve(result);
                    }
                }
            );
            
            if (!fileBuffer || fileBuffer.length === 0) {
                reject(new Error('Empty file buffer'));
                return;
            }
            
            uploadStream.end(fileBuffer);
        });
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        throw error;
    }
}

// Check if image URL is valid
async function isValidImageUrl(url) {
    try {
        if (!url.startsWith('http')) return false;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        try {
            const response = await fetch(url, { 
                method: 'HEAD',
                signal: controller.signal 
            });
            clearTimeout(timeoutId);
            const contentType = response.headers.get('content-type');
            return contentType && contentType.startsWith('image/');
        } catch (error) {
            clearTimeout(timeoutId);
            return false;
        }
    } catch (error) {
        return false;
    }
}

// Get Cloudinary URL with overlay
async function getCloudinaryUrlWithName(originalUrl, name, amount = null, imageType = 'startImage') {
    try {
        if (!originalUrl.includes('cloudinary.com')) {
            return originalUrl;
        }
        
        const config = await db.collection('admin').findOne({ type: 'config' });
        const overlaySettings = config?.imageOverlaySettings || {
            startImage: true,
            menuImage: true,
            bonusImage: true
        };
        
        let shouldAddOverlay = false;
        if (imageType === 'startImage') {
            shouldAddOverlay = overlaySettings.startImage;
        } else if (imageType === 'menuImage') {
            shouldAddOverlay = overlaySettings.menuImage;
        } else if (imageType === 'bonusImage') {
            shouldAddOverlay = overlaySettings.bonusImage;
        }
        
        if (!shouldAddOverlay) {
            return originalUrl;
        }
        
        const cleanName = (name || 'User').substring(0, 15);
        
        if (originalUrl.includes('{name}')) {
            return originalUrl.replace(/{name}/g, cleanName);
        }
        
        if (originalUrl.includes('/upload/')) {
            const parts = originalUrl.split('/upload/');
            if (parts.length === 2) {
                let overlayText = '';
                
                if (amount) {
                    overlayText = `l_text:Arial_60_bold:${encodeURIComponent(formatCurrency(amount))},co_rgb:FFD700,g_north,y_40/l_text:Arial_30:${encodeURIComponent(cleanName)},co_rgb:FFFFFF,g_south,y_20/`;
                } else {
                    overlayText = `l_text:Arial_50_bold:${encodeURIComponent(cleanName)},co_rgb:00E5FF,g_center/`;
                }
                
                return `${parts[0]}/upload/${overlayText}${parts[1]}`;
            }
        }
        
        return originalUrl;
    } catch (error) {
        console.error('Error in getCloudinaryUrlWithName:', error);
        return originalUrl;
    }
}

// Get user statistics
async function getUserStats(userId) {
    try {
        const user = await db.collection('users').findOne({ userId: userId });
        if (!user) return null;
        
        const referrals = await db.collection('users').countDocuments({ referredBy: userId });
        const transactions = await db.collection('transactions').countDocuments({ userId: userId });
        const tasksCompleted = await db.collection('tasksubmissions').countDocuments({ 
            userId: userId, 
            status: 'approved' 
        });
        
        return {
            balance: user.balance || 0,
            referrals: referrals,
            transactions: transactions,
            tasksCompleted: tasksCompleted,
            joinedAt: user.joinedAt,
            wallet: user.wallet || 'Not set'
        };
    } catch (error) {
        console.error('Error getting user stats:', error);
        return null;
    }
}

// Add transaction
async function addTransaction(userId, type, amount, description = '') {
    try {
        const transactionId = generateTransactionId();
        const transaction = {
            transactionId: transactionId,
            userId: userId,
            type: type, // 'deposit', 'withdrawal', 'referral', 'task', 'bonus', 'giftcode'
            amount: parseFloat(amount),
            description: description,
            date: new Date(),
            status: 'completed'
        };
        
        await db.collection('transactions').insertOne(transaction);
        return transactionId;
    } catch (error) {
        console.error('Error adding transaction:', error);
        return null;
    }
}

// Update user balance
async function updateUserBalance(userId, amount, type = 'add') {
    try {
        const user = await db.collection('users').findOne({ userId: userId });
        if (!user) return false;
        
        const currentBalance = user.balance || 0;
        let newBalance = currentBalance;
        
        if (type === 'add') {
            newBalance = currentBalance + parseFloat(amount);
        } else if (type === 'subtract') {
            newBalance = currentBalance - parseFloat(amount);
            if (newBalance < 0) newBalance = 0;
        }
        
        await db.collection('users').updateOne(
            { userId: userId },
            { $set: { balance: newBalance, updatedAt: new Date() } }
        );
        
        // Update global statistics
        if (type === 'add') {
            await db.collection('admin').updateOne(
                { type: 'config' },
                { $inc: { 'statistics.totalEarned': parseFloat(amount) } }
            );
        }
        
        return true;
    } catch (error) {
        console.error('Error updating user balance:', error);
        return false;
    }
}

// ==========================================
// CHANNEL MANAGEMENT FUNCTIONS
// ==========================================

// Get channels by level
async function getChannelsByLevel(level) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        
        return channels.filter(channel => channel.level === level && !channel.hide);
    } catch (error) {
        console.error('Error getting channels by level:', error);
        return [];
    }
}

// Get channels to display in start screen
async function getChannelsToDisplay(userId) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        
        const channelsToDisplay = [];
        const mustJoinChannels = [];
        
        for (const channel of channels) {
            // Skip hidden channels
            if (channel.hide) continue;
            
            // Skip F level channels
            if (channel.level === 'F') continue;
            
            // Check if user has joined this channel
            let userHasJoined = false;
            
            try {
                const member = await bot.telegram.getChatMember(channel.id, userId);
                if (member.status !== 'left' && member.status !== 'kicked') {
                    userHasJoined = true;
                }
            } catch (error) {
                // Can't check membership
            }
            
            // For SSS level channels (Must Join)
            if (channel.level === 'SSS') {
                if (!userHasJoined) {
                    mustJoinChannels.push(channel);
                }
                continue;
            }
            
            // For S level channels (Show Only) - always show
            if (channel.level === 'S') {
                channelsToDisplay.push(channel);
                continue;
            }
            
            // For SS level channels (Auto Accept) - show if not joined
            if (channel.level === 'SS') {
                if (!userHasJoined) {
                    channelsToDisplay.push(channel);
                }
                continue;
            }
            
            // For other channels or no level - show if not joined
            if (!userHasJoined) {
                channelsToDisplay.push(channel);
            }
        }
        
        return {
            display: channelsToDisplay,
            mustJoin: mustJoinChannels
        };
    } catch (error) {
        console.error('Error in getChannelsToDisplay:', error);
        return { display: [], mustJoin: [] };
    }
}

// Check if user has joined all required channels
async function hasJoinedAllChannels(userId) {
    try {
        const { mustJoin } = await getChannelsToDisplay(userId);
        return mustJoin.length === 0;
    } catch (error) {
        console.error('Error checking joined channels:', error);
        return false;
    }
}

// ==========================================
// SCENES SETUP
// ==========================================

const stage = new Scenes.Stage([]);
bot.use(session());
bot.use(stage.middleware());

// Scene factory
function createScene(sceneId) {
    return new Scenes.BaseScene(sceneId);
}

// Define all scenes
const scenes = {
    // User scenes
    contactUserMessage: createScene('contact_user_message_scene'),
    setWallet: createScene('set_wallet_scene'),
    withdrawAmount: createScene('withdraw_amount_scene'),
    enterGiftCode: createScene('enter_gift_code_scene'),
    taskSubmission: createScene('task_submission_scene'),
    
    // Admin scenes
    broadcast: createScene('broadcast_scene'),
    addChannel: createScene('add_channel_scene'),
    editStartImage: createScene('edit_start_image_scene'),
    editStartMessage: createScene('edit_start_message_scene'),
    editMenuImage: createScene('edit_menu_image_scene'),
    editMenuMessage: createScene('edit_menu_message_scene'),
    editTimer: createScene('edit_timer_scene'),
    addAdmin: createScene('add_admin_scene'),
    imageOverlay: createScene('image_overlay_scene'),
    createGiftCode: createScene('create_gift_code_scene'),
    editGiftCode: createScene('edit_gift_code_scene'),
    editBonusSettings: createScene('edit_bonus_settings_scene'),
    editReferralSettings: createScene('edit_referral_settings_scene'),
    editWithdrawalSettings: createScene('edit_withdrawal_settings_scene'),
    addTask: createScene('add_task_scene'),
    editTask: createScene('edit_task_scene'),
    processWithdrawal: createScene('process_withdrawal_scene'),
    searchUsers: createScene('search_users_scene'),
    searchWithdrawals: createScene('search_withdrawals_scene')
};

// Register all scenes
Object.values(scenes).forEach(scene => stage.register(scene));

// ==========================================
// USER FLOW - START COMMAND
// ==========================================

bot.start(async (ctx) => {
    try {
        // Check if bot is disabled
        const config = await db.collection('admin').findOne({ type: 'config' });
        const botDisabled = config?.botDisabled || false;
        
        if (botDisabled) {
            const disabledMessage = config?.disabledMessage || DEFAULT_CONFIG.disabledMessage;
            await safeSendMessage(ctx, disabledMessage);
            return;
        }
        
        const user = ctx.from;
        const userId = user.id;
        const args = ctx.message.text.split(' ');
        const referCode = args.length > 1 ? args[1] : null;
        
        // Check if user exists
        let userData = await db.collection('users').findOne({ userId: userId });
        
        if (!userData) {
            // New user registration
            const referCodeToUse = await generateReferCode();
            userData = {
                userId: userId,
                firstName: user.first_name || '',
                lastName: user.last_name || '',
                username: user.username || '',
                referCode: referCodeToUse,
                referredBy: null,
                referrals: [],
                balance: 0,
                wallet: null,
                transactions: [],
                tasksCompleted: [],
                giftCodesUsed: [],
                joinedAll: false,
                joinedAt: new Date(),
                lastActive: new Date(),
                updatedAt: new Date()
            };
            
            // Handle referral
            if (referCode) {
                const referrer = await db.collection('users').findOne({ referCode: referCode });
                if (referrer && referrer.userId !== userId) {
                    userData.referredBy = referrer.userId;
                    
                    // Add referral bonus to referrer
                    const referralSettings = config?.referralSettings || DEFAULT_CONFIG.referral;
                    const referBonus = referralSettings.referBonus || 50;
                    
                    await updateUserBalance(referrer.userId, referBonus, 'add');
                    await addTransaction(referrer.userId, 'referral', referBonus, `Referral bonus for ${user.first_name || 'new user'}`);
                    
                    // Update referrer's referrals list
                    await db.collection('users').updateOne(
                        { userId: referrer.userId },
                        { $push: { referrals: userId } }
                    );
                    
                    // Update statistics
                    await db.collection('admin').updateOne(
                        { type: 'config' },
                        { $inc: { 'statistics.totalReferrals': 1 } }
                    );
                    
                    // Notify referrer
                    try {
                        await bot.telegram.sendMessage(
                            referrer.userId,
                            `🎉 *New Referral!*\n\n👤 ${user.first_name || 'New user'} joined using your referral link!\n💰 You earned ${formatCurrency(referBonus)} referral bonus!`,
                            { parse_mode: 'HTML' }
                        );
                    } catch (error) {
                        console.error('Failed to notify referrer:', error);
                    }
                }
            }
            
            await db.collection('users').insertOne(userData);
            
            // Update statistics
            await db.collection('admin').updateOne(
                { type: 'config' },
                { $inc: { 'statistics.totalUsers': 1 } }
            );
            
            // Notify admin about new user
            const userLink = user.username ? `@${user.username}` : user.first_name || 'Unknown';
            await notifyAdmin(`🆕 *New User Joined*\n\n👤 User: ${userLink}\n🆔 ID: \`${userId}\`\n📅 Date: ${new Date().toLocaleString()}\n${referCode ? `🔗 Referred by: ${referCode}` : ''}`);
            
        } else {
            // Update last active time
            await db.collection('users').updateOne(
                { userId: userId },
                { $set: { lastActive: new Date() } }
            );
        }
        
        // Show start screen
        await showStartScreen(ctx);
        
    } catch (error) {
        console.error('Start command error:', error);
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.');
    }
});

// Show Start Screen
async function showStartScreen(ctx) {
    try {
        const user = ctx.from;
        const userId = user.id;
        
        // Get configuration
        const [config, channelsData] = await Promise.all([
            db.collection('admin').findOne({ type: 'config' }),
            getChannelsToDisplay(userId)
        ]);
        
        const userVars = getUserVariables(user);
        const userStats = await getUserStats(userId);
        
        // Prepare statistics variables
        const stats = config?.statistics || DEFAULT_CONFIG.statistics;
        const statVars = {
            total_users: stats.totalUsers || 0,
            total_paid: formatCurrency(stats.totalWithdrawn || 0),
            available_tasks: stats.totalTasks || 0
        };
        
        // Prepare image
        let startImage = config?.startImage || DEFAULT_CONFIG.startImage;
        startImage = await getCloudinaryUrlWithName(startImage, userVars.name, null, 'startImage');
        
        // Prepare message
        let startMessage = config?.startMessage || DEFAULT_CONFIG.startMessage;
        startMessage = replaceVariables(startMessage, userVars);
        startMessage = replaceVariables(startMessage, statVars);
        
        // Create buttons
        const buttons = [];
        
        // Add channel buttons if there are channels to display
        if (channelsData.display.length > 0 || channelsData.mustJoin.length > 0) {
            // Show must join channels first
            if (channelsData.mustJoin.length > 0) {
                buttons.push([{ text: '🔒 REQUIRED CHANNELS (Must Join)', callback_data: 'no_action' }]);
                
                const channelsPerRow = config?.displaySettings?.channelsPerRow || 2;
                
                for (let i = 0; i < channelsData.mustJoin.length; i += channelsPerRow) {
                    const row = [];
                    
                    for (let j = 0; j < channelsPerRow && (i + j) < channelsData.mustJoin.length; j++) {
                        const channel = channelsData.mustJoin[i + j];
                        const buttonText = channel.buttonLabel || `Join ${channel.title}`;
                        row.push({ text: buttonText, url: channel.link });
                    }
                    
                    buttons.push(row);
                }
                
                buttons.push([]); // Empty row for spacing
            }
            
            // Show other channels
            if (channelsData.display.length > 0) {
                if (channelsData.mustJoin.length > 0) {
                    buttons.push([{ text: '📌 RECOMMENDED CHANNELS', callback_data: 'no_action' }]);
                }
                
                const channelsPerRow = config?.displaySettings?.channelsPerRow || 2;
                
                for (let i = 0; i < channelsData.display.length; i += channelsPerRow) {
                    const row = [];
                    
                    for (let j = 0; j < channelsPerRow && (i + j) < channelsData.display.length; j++) {
                        const channel = channelsData.display[i + j];
                        const buttonText = channel.buttonLabel || `Join ${channel.title}`;
                        row.push({ text: buttonText, url: channel.link });
                    }
                    
                    buttons.push(row);
                }
            }
            
            // Add verify button
            buttons.push([{ text: '✅ Check Joined Status', callback_data: 'check_joined' }]);
        } else {
            // All channels joined - show menu button
            buttons.push([{ text: '🎮 Go to Earning Dashboard', callback_data: 'go_to_menu' }]);
        }
        
        // Add contact button if enabled
        const showContactButton = config?.showContactButton !== false;
        if (showContactButton) {
            buttons.push([{ text: '📞 Contact Support', callback_data: 'contact_support' }]);
        }
        
        // Send message with image
        await ctx.replyWithPhoto(startImage, {
            caption: startMessage,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons }
        });
        
    } catch (error) {
        console.error('Show start screen error:', error);
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.');
    }
}

// Check Joined Status
bot.action('check_joined', async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        await showStartScreen(ctx);
    } catch (error) {
        console.error('Check joined error:', error);
        await ctx.answerCbQuery('❌ Error checking channels');
    }
});

// ==========================================
// MAIN MENU - EARNING DASHBOARD
// ==========================================

async function showMainMenu(ctx) {
    try {
        const user = ctx.from;
        const userId = user.id;
        
        // Check if user has joined all required channels
        const hasJoined = await hasJoinedAllChannels(userId);
        if (!hasJoined) {
            await safeSendMessage(ctx, '⚠️ *Please join all required channels first!*\n\nYou must join all channels marked as "Must Join" to access earning features.', {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back to Start', callback_data: 'back_to_start' }
                    ]]
                }
            });
            return;
        }
        
        // Update user status
        await db.collection('users').updateOne(
            { userId: userId },
            { $set: { joinedAll: true, updatedAt: new Date() } }
        );
        
        // Get user statistics
        const [config, userStats] = await Promise.all([
            db.collection('admin').findOne({ type: 'config' }),
            getUserStats(userId)
        ]);
        
        if (!userStats) {
            await safeSendMessage(ctx, '❌ User data not found. Please try /start again.');
            return;
        }
        
        // Prepare image
        let menuImage = config?.menuImage || DEFAULT_CONFIG.menuImage;
        menuImage = await getCloudinaryUrlWithName(menuImage, user.first_name || 'User', null, 'menuImage');
        
        // Prepare message with user statistics
        const userVars = getUserVariables(user);
        const menuVars = {
            balance: formatCurrency(userStats.balance),
            total_referrals: userStats.referrals,
            tasks_completed: userStats.tasksCompleted,
            wallet_set: userStats.wallet ? '✅ Set' : '❌ Not set'
        };
        
        let menuMessage = config?.menuMessage || DEFAULT_CONFIG.menuMessage;
        menuMessage = replaceVariables(menuMessage, userVars);
        menuMessage = replaceVariables(menuMessage, menuVars);
        
        // Create menu buttons
        const keyboard = [
            [
                { text: '💰 Balance', callback_data: 'user_balance' },
                { text: '👤 Profile', callback_data: 'user_profile' }
            ],
            [
                { text: '💳 Withdraw', callback_data: 'user_withdraw' },
                { text: '🏦 Set Wallet', callback_data: 'user_set_wallet' }
            ],
            [
                { text: '📤 Refer & Earn', callback_data: 'user_refer' },
                { text: '👥 My Referrals', callback_data: 'user_referrals' }
            ],
            [
                { text: '🎁 Bonus', callback_data: 'user_bonus' },
                { text: '🎫 Gift Code', callback_data: 'user_gift_code' }
            ],
            [
                { text: '📋 Tasks', callback_data: 'user_tasks' },
                { text: '📞 Contact', callback_data: 'contact_support' }
            ],
            [
                { text: '🔙 Back to Start', callback_data: 'back_to_start' }
            ]
        ];
        
        await ctx.replyWithPhoto(menuImage, {
            caption: menuMessage,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Show main menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.');
    }
}

// Go to Menu
bot.action('go_to_menu', async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Go to menu error:', error);
        await ctx.answerCbQuery('❌ Error loading menu');
    }
});

// Back to Start
bot.action('back_to_start', async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        await showStartScreen(ctx);
    } catch (error) {
        console.error('Back to start error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// ==========================================
// USER FEATURES - BALANCE
// ==========================================

bot.action('user_balance', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const user = await db.collection('users').findOne({ userId: userId });
        
        if (!user) {
            await ctx.answerCbQuery('❌ User not found');
            return;
        }
        
        // Get recent transactions
        const transactions = await db.collection('transactions')
            .find({ userId: userId })
            .sort({ date: -1 })
            .limit(15)
            .toArray();
        
        let balanceText = `💰 *Your Balance*\n\n`;
        balanceText += `🪙 *Available Balance:* ${formatCurrency(user.balance || 0)}\n\n`;
        balanceText += `📊 *Recent Transactions (Last 15):*\n\n`;
        
        if (transactions.length === 0) {
            balanceText += `No transactions yet.\n`;
        } else {
            transactions.forEach((txn, index) => {
                const date = new Date(txn.date).toLocaleDateString();
                const typeEmoji = txn.type === 'deposit' ? '📥' : 
                                 txn.type === 'withdrawal' ? '📤' : 
                                 txn.type === 'referral' ? '👥' : 
                                 txn.type === 'task' ? '✅' : 
                                 txn.type === 'bonus' ? '🎁' : '🎫';
                
                balanceText += `${index + 1}. ${typeEmoji} *${txn.type.toUpperCase()}*\n`;
                balanceText += `   Amount: ${formatCurrency(txn.amount)}\n`;
                balanceText += `   Date: ${date}\n`;
                if (txn.description) {
                    balanceText += `   Note: ${txn.description}\n`;
                }
                balanceText += `\n`;
            });
        }
        
        const keyboard = [
            [{ text: '💳 Withdraw Funds', callback_data: 'user_withdraw' }],
            [{ text: '📋 View All Transactions', callback_data: 'view_all_transactions' }],
            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
        ];
        
        await ctx.deleteMessage().catch(() => {});
        await safeSendMessage(ctx, balanceText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Balance error:', error);
        await ctx.answerCbQuery('❌ Error loading balance');
    }
});

// View All Transactions
bot.action('view_all_transactions', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const page = ctx.session?.transactionsPage || 1;
        const limit = 20;
        
        const totalTransactions = await db.collection('transactions').countDocuments({ userId: userId });
        const totalPages = Math.ceil(totalTransactions / limit);
        const skip = (page - 1) * limit;
        
        const transactions = await db.collection('transactions')
            .find({ userId: userId })
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        let transactionsText = `📊 *All Transactions*\n\n`;
        transactionsText += `Page ${page} of ${totalPages}\n\n`;
        
        if (transactions.length === 0) {
            transactionsText += `No transactions found.\n`;
        } else {
            transactions.forEach((txn, index) => {
                const date = new Date(txn.date).toLocaleString();
                const typeEmoji = txn.type === 'deposit' ? '📥' : 
                                 txn.type === 'withdrawal' ? '📤' : 
                                 txn.type === 'referral' ? '👥' : 
                                 txn.type === 'task' ? '✅' : 
                                 txn.type === 'bonus' ? '🎁' : '🎫';
                
                transactionsText += `${skip + index + 1}. ${typeEmoji} *${txn.type.toUpperCase()}*\n`;
                transactionsText += `   Amount: ${formatCurrency(txn.amount)}\n`;
                transactionsText += `   Date: ${date}\n`;
                if (txn.description) {
                    transactionsText += `   Note: ${txn.description}\n`;
                }
                transactionsText += `\n`;
            });
        }
        
        const keyboard = [];
        
        // Navigation buttons
        if (totalPages > 1) {
            const navRow = [];
            if (page > 1) {
                navRow.push({ text: '◀️ Previous', callback_data: `transactions_page_${page - 1}` });
            }
            navRow.push({ text: `📄 ${page}/${totalPages}`, callback_data: 'no_action' });
            if (page < totalPages) {
                navRow.push({ text: 'Next ▶️', callback_data: `transactions_page_${page + 1}` });
            }
            keyboard.push(navRow);
        }
        
        keyboard.push(
            [{ text: '💰 Back to Balance', callback_data: 'user_balance' }],
            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
        );
        
        await safeEditMessage(ctx, transactionsText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('View transactions error:', error);
        await ctx.answerCbQuery('❌ Error loading transactions');
    }
});

// Transactions pagination
bot.action(/^transactions_page_(\d+)$/, async (ctx) => {
    try {
        const page = parseInt(ctx.match[1]);
        ctx.session.transactionsPage = page;
        await bot.action('view_all_transactions')(ctx);
    } catch (error) {
        console.error('Transactions pagination error:', error);
    }
});

// ==========================================
// USER FEATURES - PROFILE
// ==========================================

bot.action('user_profile', async (ctx) => {
    try {
        const user = ctx.from;
        const userId = user.id;
        
        const [userData, userStats] = await Promise.all([
            db.collection('users').findOne({ userId: userId }),
            getUserStats(userId)
        ]);
        
        if (!userData || !userStats) {
            await ctx.answerCbQuery('❌ User data not found');
            return;
        }
        
        // Create profile image URL
        const firstName = user.first_name || '';
        const lastName = user.last_name || '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ');
        const username = user.username ? `@${user.username}` : 'No username';
        
        // Generate profile text
        let profileText = `👤 *User Profile*\n\n`;
        profileText += `🆔 *User ID:* \`${userId}\`\n`;
        profileText += `👤 *Name:* ${fullName || 'Not set'}\n`;
        profileText += `📱 *Username:* ${username}\n`;
        profileText += `💰 *Balance:* ${formatCurrency(userStats.balance)}\n`;
        profileText += `👥 *Total Referrals:* ${userStats.referrals}\n`;
        profileText += `✅ *Tasks Completed:* ${userStats.tasksCompleted}\n`;
        profileText += `🏦 *Wallet:* ${userStats.wallet || 'Not set'}\n`;
        profileText += `🎫 *Referral Code:* \`${userData.referCode || 'Not set'}\`\n`;
        profileText += `📅 *Joined:* ${new Date(userStats.joinedAt).toLocaleDateString()}\n`;
        profileText += `🕒 *Last Active:* ${new Date(userData.lastActive).toLocaleString()}\n`;
        
        // Try to send profile photo if available
        try {
            const userProfile = await ctx.telegram.getUserProfilePhotos(userId, 0, 1);
            
            if (userProfile && userProfile.photos.length > 0) {
                const photo = userProfile.photos[0][0];
                const fileLink = await ctx.telegram.getFileLink(photo.file_id);
                
                await ctx.replyWithPhoto(fileLink.href, {
                    caption: profileText,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📤 Share Referral', callback_data: 'user_refer' }],
                            [{ text: '🏦 Set/Edit Wallet', callback_data: 'user_set_wallet' }],
                            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                        ]
                    }
                });
            } else {
                // Use default image
                const defaultImage = 'https://res.cloudinary.com/dneusgyzc/image/upload/v1763670359/1000106281_cfg1ke.jpg';
                const profileImage = await getCloudinaryUrlWithName(defaultImage, fullName || 'User', null, 'menuImage');
                
                await ctx.replyWithPhoto(profileImage, {
                    caption: profileText,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📤 Share Referral', callback_data: 'user_refer' }],
                            [{ text: '🏦 Set/Edit Wallet', callback_data: 'user_set_wallet' }],
                            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                        ]
                    }
                });
            }
        } catch (photoError) {
            // If can't get photo, send text only
            await ctx.deleteMessage().catch(() => {});
            await safeSendMessage(ctx, profileText, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📤 Share Referral', callback_data: 'user_refer' }],
                        [{ text: '🏦 Set/Edit Wallet', callback_data: 'user_set_wallet' }],
                        [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                    ]
                }
            });
        }
        
    } catch (error) {
        console.error('Profile error:', error);
        await ctx.answerCbQuery('❌ Error loading profile');
    }
});

// ==========================================
// USER FEATURES - SET WALLET
// ==========================================

bot.action('user_set_wallet', async (ctx) => {
    try {
        const user = ctx.from;
        const userId = user.id;
        
        const userData = await db.collection('users').findOne({ userId: userId });
        const currentWallet = userData?.wallet || 'Not set';
        
        const walletText = `🏦 *Set Your Wallet*\n\n`;
        walletText += `*Current Wallet:* \`${currentWallet}\`\n\n`;
        walletText += `Please send your UPI ID or Wallet address:\n\n`;
        walletText += `*Examples:*\n`;
        walletText += `• \`user@upi\`\n`;
        walletText += `• \`user@oksbi\`\n`;
        walletText += `• \`user@paytm\`\n\n`;
        walletText += `*Note:* This will be used for all withdrawals.\n`;
        walletText += `Type "cancel" to cancel.`;
        
        await safeSendMessage(ctx, walletText, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                ]]
            }
        });
        
        // Enter wallet setting scene
        await ctx.scene.enter('set_wallet_scene');
        
    } catch (error) {
        console.error('Set wallet error:', error);
        await ctx.answerCbQuery('❌ Error setting wallet');
    }
});

// Set Wallet Scene
scenes.setWallet.on('text', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const walletInput = ctx.message.text.trim();
        
        if (walletInput.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Wallet setup cancelled.');
            await ctx.scene.leave();
            await showMainMenu(ctx);
            return;
        }
        
        // Validate UPI ID format
        const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
        if (!upiRegex.test(walletInput)) {
            await safeSendMessage(ctx, '❌ *Invalid UPI ID format!*\n\nPlease enter a valid UPI ID like:\n\`user@upi\`\n\`user@oksbi\`\n\`user@paytm\`\n\nType "cancel" to cancel.', {
                parse_mode: 'HTML'
            });
            return;
        }
        
        // Update wallet in database
        await db.collection('users').updateOne(
            { userId: userId },
            { $set: { wallet: walletInput, updatedAt: new Date() } }
        );
        
        await safeSendMessage(ctx, `✅ *Wallet Updated Successfully!*\n\nYour wallet has been set to:\n\`${walletInput}\`\n\nYou can now withdraw your earnings.`, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: '💳 Withdraw Funds', callback_data: 'user_withdraw' },
                    { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                ]]
            }
        });
        
        await ctx.scene.leave();
        
    } catch (error) {
        console.error('Set wallet scene error:', error);
        await safeSendMessage(ctx, '❌ Error updating wallet. Please try again.');
        await ctx.scene.leave();
    }
});

// ==========================================
// USER FEATURES - WITHDRAW
// ==========================================

bot.action('user_withdraw', async (ctx) => {
    try {
        const userId = ctx.from.id;
        
        const [userData, config] = await Promise.all([
            db.collection('users').findOne({ userId: userId }),
            db.collection('admin').findOne({ type: 'config' })
        ]);
        
        if (!userData) {
            await ctx.answerCbQuery('❌ User not found');
            return;
        }
        
        const withdrawalSettings = config?.withdrawalSettings || DEFAULT_CONFIG.withdrawal;
        const minAmount = withdrawalSettings.minAmount || 100;
        const maxAmount = withdrawalSettings.maxAmount || 5000;
        const processingFee = withdrawalSettings.processingFee || 2;
        
        // Check if wallet is set
        if (!userData.wallet) {
            await safeSendMessage(ctx, `❌ *Wallet Not Set!*\n\nPlease set your wallet address first to withdraw funds.\n\nMin withdrawal: ${formatCurrency(minAmount)}`, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🏦 Set Wallet Now', callback_data: 'user_set_wallet' }],
                        [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                    ]
                }
            });
            return;
        }
        
        // Check if user has enough balance
        const userBalance = userData.balance || 0;
        if (userBalance < minAmount) {
            await safeSendMessage(ctx, `❌ *Insufficient Balance!*\n\nYour balance: ${formatCurrency(userBalance)}\nMin withdrawal: ${formatCurrency(minAmount)}\n\nComplete more tasks or referrals to earn more!`, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📋 View Tasks', callback_data: 'user_tasks' }],
                        [{ text: '📤 Refer & Earn', callback_data: 'user_refer' }],
                        [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                    ]
                }
            });
            return;
        }
        
        const withdrawText = `💳 *Withdraw Funds*\n\n`;
        withdrawText += `💰 *Available Balance:* ${formatCurrency(userBalance)}\n`;
        withdrawText += `🏦 *Wallet:* \`${userData.wallet}\`\n\n`;
        withdrawText += `*Withdrawal Limits:*\n`;
        withdrawText += `• Minimum: ${formatCurrency(minAmount)}\n`;
        withdrawText += `• Maximum: ${formatCurrency(maxAmount)}\n`;
        withdrawText += `• Processing Fee: ${processingFee}%\n\n`;
        withdrawText += `*Example:* If you withdraw ${formatCurrency(100)}, you'll receive ${formatCurrency(100 * (1 - processingFee/100))}\n\n`;
        withdrawText += `Enter the amount you want to withdraw (${formatCurrency(minAmount)} - ${formatCurrency(maxAmount)}):\n`;
        withdrawText += `Type "cancel" to cancel.`;
        
        await ctx.deleteMessage().catch(() => {});
        await safeSendMessage(ctx, withdrawText, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                ]]
            }
        });
        
        // Store withdrawal info in session
        ctx.session.withdrawalInfo = {
            userId: userId,
            wallet: userData.wallet,
            minAmount: minAmount,
            maxAmount: maxAmount,
            processingFee: processingFee
        };
        
        await ctx.scene.enter('withdraw_amount_scene');
        
    } catch (error) {
        console.error('Withdraw error:', error);
        await ctx.answerCbQuery('❌ Error processing withdrawal');
    }
});

// Withdraw Amount Scene
scenes.withdrawAmount.on('text', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const withdrawalInfo = ctx.session.withdrawalInfo;
        
        if (!withdrawalInfo) {
            await safeSendMessage(ctx, '❌ Session expired. Please try again.');
            await ctx.scene.leave();
            return;
        }
        
        const amountInput = ctx.message.text.trim();
        
        if (amountInput.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Withdrawal cancelled.');
            delete ctx.session.withdrawalInfo;
            await ctx.scene.leave();
            await showMainMenu(ctx);
            return;
        }
        
        // Validate amount
        const amount = parseFloat(amountInput);
        if (isNaN(amount) || amount <= 0) {
            await safeSendMessage(ctx, '❌ *Invalid amount!*\n\nPlease enter a valid number.\nExample: 100, 500, 1000\n\nType "cancel" to cancel.', {
                parse_mode: 'HTML'
            });
            return;
        }
        
        if (amount < withdrawalInfo.minAmount) {
            await safeSendMessage(ctx, `❌ *Amount too low!*\n\nMinimum withdrawal amount is ${formatCurrency(withdrawalInfo.minAmount)}.\n\nType "cancel" to cancel.`, {
                parse_mode: 'HTML'
            });
            return;
        }
        
        if (amount > withdrawalInfo.maxAmount) {
            await safeSendMessage(ctx, `❌ *Amount too high!*\n\nMaximum withdrawal amount is ${formatCurrency(withdrawalInfo.maxAmount)}.\n\nType "cancel" to cancel.`, {
                parse_mode: 'HTML'
            });
            return;
        }
        
        // Check user balance
        const userData = await db.collection('users').findOne({ userId: userId });
        const userBalance = userData.balance || 0;
        
        if (amount > userBalance) {
            await safeSendMessage(ctx, `❌ *Insufficient balance!*\n\nYour balance: ${formatCurrency(userBalance)}\nRequested: ${formatCurrency(amount)}\n\nType "cancel" to cancel.`, {
                parse_mode: 'HTML'
            });
            return;
        }
        
        // Calculate net amount after fee
        const processingFee = withdrawalInfo.processingFee || 2;
        const feeAmount = (amount * processingFee) / 100;
        const netAmount = amount - feeAmount;
        
        // Create withdrawal request
        const requestId = generateWithdrawalId();
        const withdrawalRequest = {
            requestId: requestId,
            userId: userId,
            amount: amount,
            fee: feeAmount,
            netAmount: netAmount,
            wallet: withdrawalInfo.wallet,
            status: 'pending',
            createdAt: new Date(),
            userInfo: {
                firstName: ctx.from.first_name || '',
                lastName: ctx.from.last_name || '',
                username: ctx.from.username || ''
            }
        };
        
        await db.collection('withdrawals').insertOne(withdrawalRequest);
        
        // Deduct amount from user balance
        await updateUserBalance(userId, amount, 'subtract');
        
        // Add transaction record
        await addTransaction(userId, 'withdrawal', -amount, `Withdrawal request #${requestId}`);
        
        // Prepare confirmation message
        const confirmText = `✅ *Withdrawal Request Submitted!*\n\n`;
        confirmText += `📋 *Request ID:* \`${requestId}\`\n`;
        confirmText += `💳 *Amount:* ${formatCurrency(amount)}\n`;
        confirmText += `💰 *Processing Fee:* ${formatCurrency(feeAmount)} (${processingFee}%)\n`;
        confirmText += `💸 *You Receive:* ${formatCurrency(netAmount)}\n`;
        confirmText += `🏦 *Wallet:* \`${withdrawalInfo.wallet}\`\n`;
        confirmText += `📅 *Date:* ${new Date().toLocaleString()}\n\n`;
        confirmText += `*Status:* ⏳ Pending Approval\n\n`;
        confirmText += `Your request has been sent to admin for approval.\n`;
        confirmText += `You will be notified once it's processed.`;
        
        await safeSendMessage(ctx, confirmText, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📋 View Withdrawal Status', callback_data: 'view_withdrawal_status' }],
                    [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                ]
            }
        });
        
        // Notify admins
        const userLink = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || 'User';
        const adminNotification = `💳 *New Withdrawal Request*\n\n`;
        adminNotification += `📋 *Request ID:* \`${requestId}\`\n`;
        adminNotification += `👤 *User:* ${userLink}\n`;
        adminNotification += `🆔 *User ID:* \`${userId}\`\n`;
        adminNotification += `💳 *Amount:* ${formatCurrency(amount)}\n`;
        adminNotification += `💰 *Net Amount:* ${formatCurrency(netAmount)}\n`;
        adminNotification += `🏦 *Wallet:* \`${withdrawalInfo.wallet}\`\n`;
        adminNotification += `📅 *Time:* ${new Date().toLocaleString()}\n\n`;
        adminNotification += `Click below to process:`;
        
        const activeAdmins = await getActiveAdmins();
        const notifyPromises = activeAdmins.map(async (adminId) => {
            try {
                await bot.telegram.sendMessage(adminId, adminNotification, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '✅ Process Request', callback_data: `process_withdrawal_${requestId}` }
                        ]]
                    }
                });
            } catch (error) {
                console.error(`Failed to notify admin ${adminId}:`, error.message);
            }
        });
        
        await Promise.allSettled(notifyPromises);
        
        // Clear session
        delete ctx.session.withdrawalInfo;
        await ctx.scene.leave();
        
    } catch (error) {
        console.error('Withdraw amount scene error:', error);
        await safeSendMessage(ctx, '❌ Error processing withdrawal request. Please try again.');
        await ctx.scene.leave();
    }
});

// View Withdrawal Status
bot.action('view_withdrawal_status', async (ctx) => {
    try {
        const userId = ctx.from.id;
        
        const withdrawals = await db.collection('withdrawals')
            .find({ userId: userId })
            .sort({ createdAt: -1 })
            .limit(10)
            .toArray();
        
        let statusText = `📋 *Withdrawal Status*\n\n`;
        
        if (withdrawals.length === 0) {
            statusText += `No withdrawal requests found.\n`;
        } else {
            withdrawals.forEach((withdrawal, index) => {
                const date = new Date(withdrawal.createdAt).toLocaleString();
                const statusEmoji = withdrawal.status === 'approved' ? '✅' : 
                                   withdrawal.status === 'rejected' ? '❌' : '⏳';
                
                statusText += `${index + 1}. *${withdrawal.requestId}*\n`;
                statusText += `   Amount: ${formatCurrency(withdrawal.amount)}\n`;
                statusText += `   Status: ${statusEmoji} ${withdrawal.status}\n`;
                statusText += `   Date: ${date}\n`;
                
                if (withdrawal.status === 'approved' && withdrawal.utr) {
                    statusText += `   UTR: \`${withdrawal.utr}\`\n`;
                }
                if (withdrawal.status === 'rejected' && withdrawal.adminMessage) {
                    statusText += `   Reason: ${withdrawal.adminMessage}\n`;
                }
                statusText += `\n`;
            });
        }
        
        const keyboard = [
            [{ text: '💳 New Withdrawal', callback_data: 'user_withdraw' }],
            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
        ];
        
        await safeEditMessage(ctx, statusText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('View withdrawal status error:', error);
        await ctx.answerCbQuery('❌ Error loading withdrawal status');
    }
});

// ==========================================
// USER FEATURES - REFER & EARN
// ==========================================

bot.action('user_refer', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const user = await db.collection('users').findOne({ userId: userId });
        
        if (!user) {
            await ctx.answerCbQuery('❌ User not found');
            return;
        }
        
        const config = await db.collection('admin').findOne({ type: 'config' });
        const referralSettings = config?.referralSettings || DEFAULT_CONFIG.referral;
        
        const referCode = user.referCode;
        const referLink = `https://t.me/${ctx.botInfo.username}?start=${referCode}`;
        const referBonus = referralSettings.referBonus || 50;
        
        let referText = `📤 *Refer & Earn*\n\n`;
        referText += `🎫 *Your Referral Code:*\n\`${referCode}\`\n\n`;
        referText += `🔗 *Your Referral Link:*\n\`${referLink}\`\n\n`;
        referText += `💰 *Earn ${formatCurrency(referBonus)} for each successful referral!*\n\n`;
        referText += `*How it works:*\n`;
        referText += `1. Share your referral link/code with friends\n`;
        referText += `2. When they join using your link\n`;
        referText += `3. You get ${formatCurrency(referBonus)} instantly!\n`;
        referText += `4. They also get welcome bonus\n\n`;
        referText += `*Requirements:*\n`;
        referText += `• Referred user must join all channels\n`;
        referText += `• Minimum ${referralSettings.minWithdrawRefer || 2} referrals to withdraw referral earnings\n`;
        
        const keyboard = [
            [
                { text: '📤 Share Link', url: `https://t.me/share/url?url=${encodeURIComponent(referLink)}&text=${encodeURIComponent(`Join this amazing earning bot and start making money! Use my referral code: ${referCode}`)}` },
                { text: '📋 Copy Code', callback_data: `copy_refer_code_${referCode}` }
            ],
            [
                { text: '👥 My Referrals', callback_data: 'user_referrals' }
            ],
            [
                { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
            ]
        ];
        
        await ctx.deleteMessage().catch(() => {});
        await safeSendMessage(ctx, referText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Refer error:', error);
        await ctx.answerCbQuery('❌ Error loading referral info');
    }
});

// Copy Referral Code
bot.action(/^copy_refer_code_(.+)$/, async (ctx) => {
    try {
        const referCode = ctx.match[1];
        await ctx.answerCbQuery(`Referral code copied: ${referCode}`);
    } catch (error) {
        console.error('Copy refer code error:', error);
    }
});

// My Referrals
bot.action('user_referrals', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const page = ctx.session?.referralsPage || 1;
        const limit = 20;
        
        const referrals = await db.collection('users')
            .find({ referredBy: userId })
            .sort({ joinedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .toArray();
        
        const totalReferrals = await db.collection('users').countDocuments({ referredBy: userId });
        const totalPages = Math.ceil(totalReferrals / limit);
        
        let referralsText = `👥 *My Referrals*\n\n`;
        referralsText += `Total Referrals: ${totalReferrals}\n`;
        referralsText += `Page ${page} of ${totalPages}\n\n`;
        
        if (referrals.length === 0) {
            referralsText += `No referrals yet.\n`;
            referralsText += `Start sharing your referral link to earn bonuses!\n`;
        } else {
            referralsText += `*Referral List:*\n\n`;
            
            for (let i = 0; i < referrals.length; i++) {
                const referral = referrals[i];
                const index = (page - 1) * limit + i + 1;
                const name = referral.firstName || 'User';
                const username = referral.username ? `@${referral.username}` : 'No username';
                const joinedDate = new Date(referral.joinedAt).toLocaleDateString();
                const status = referral.joinedAll ? '✅ Verified' : '⏳ Pending';
                
                referralsText += `${index}. *${name}* (${username})\n`;
                referralsText += `   Status: ${status}\n`;
                referralsText += `   Joined: ${joinedDate}\n`;
                referralsText += `   ID: \`${referral.userId}\`\n\n`;
            }
        }
        
        const keyboard = [];
        
        // Navigation buttons
        if (totalPages > 1) {
            const navRow = [];
            if (page > 1) {
                navRow.push({ text: '◀️ Previous', callback_data: `referrals_page_${page - 1}` });
            }
            navRow.push({ text: `📄 ${page}/${totalPages}`, callback_data: 'no_action' });
            if (page < totalPages) {
                navRow.push({ text: 'Next ▶️', callback_data: `referrals_page_${page + 1}` });
            }
            keyboard.push(navRow);
        }
        
        keyboard.push(
            [{ text: '📤 Share Referral Link', callback_data: 'user_refer' }],
            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
        );
        
        await ctx.deleteMessage().catch(() => {});
        await safeSendMessage(ctx, referralsText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Referrals error:', error);
        await ctx.answerCbQuery('❌ Error loading referrals');
    }
});

// Referrals pagination
bot.action(/^referrals_page_(\d+)$/, async (ctx) => {
    try {
        const page = parseInt(ctx.match[1]);
        ctx.session.referralsPage = page;
        await bot.action('user_referrals')(ctx);
    } catch (error) {
        console.error('Referrals pagination error:', error);
    }
});

// ==========================================
// USER FEATURES - BONUS
// ==========================================

bot.action('user_bonus', async (ctx) => {
    try {
        const userId = ctx.from.id;
        
        const [config, userData] = await Promise.all([
            db.collection('admin').findOne({ type: 'config' }),
            db.collection('users').findOne({ userId: userId })
        ]);
        
        const bonusSettings = config?.bonusSettings || DEFAULT_CONFIG.bonus;
        
        if (!bonusSettings.enabled) {
            await safeSendMessage(ctx, '❌ *Bonus feature is currently disabled.*\n\nPlease check back later or contact support for more information.', {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                    ]]
                }
            });
            return;
        }
        
        // Check if user has already claimed bonus
        const hasClaimedBonus = userData?.bonusClaimed || false;
        
        let bonusText = `🎁 *Daily Bonus*\n\n`;
        
        if (hasClaimedBonus) {
            bonusText += `⏳ *You have already claimed your bonus today!*\n\n`;
            bonusText += `Come back tomorrow for more rewards!\n\n`;
            bonusText += `*Next Bonus Available:* Tomorrow at 00:00\n`;
        } else {
            const bonusAmount = bonusSettings.amount || 25;
            bonusText += `💰 *Daily Bonus Available:* ${formatCurrency(bonusAmount)}\n\n`;
            bonusText += `*How to claim:*\n`;
            bonusText += `1. Click the "Claim Bonus" button below\n`;
            bonusText += `2. Bonus will be added to your balance instantly\n`;
            bonusText += `3. You can claim once every 24 hours\n\n`;
            bonusText += `*Note:* This is a limited time offer!\n`;
        }
        
        const keyboard = [];
        
        if (!hasClaimedBonus) {
            keyboard.push([{ text: '🎁 Claim Bonus Now', callback_data: 'claim_bonus' }]);
        }
        
        keyboard.push(
            [{ text: '🎫 Gift Code', callback_data: 'user_gift_code' }],
            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
        );
        
        // Send bonus image if available
        if (bonusSettings.image && bonusSettings.image !== 'none') {
            let bonusImage = bonusSettings.image;
            const bonusAmount = bonusSettings.amount || 25;
            
            if (bonusSettings.showAmountOverlay) {
                bonusImage = await getCloudinaryUrlWithName(bonusImage, ctx.from.first_name || 'User', bonusAmount, 'bonusImage');
            }
            
            await ctx.replyWithPhoto(bonusImage, {
                caption: bonusText,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await ctx.deleteMessage().catch(() => {});
            await safeSendMessage(ctx, bonusText, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        }
        
    } catch (error) {
        console.error('Bonus error:', error);
        await ctx.answerCbQuery('❌ Error loading bonus');
    }
});

// Claim Bonus
bot.action('claim_bonus', async (ctx) => {
    try {
        const userId = ctx.from.id;
        
        const [config, userData] = await Promise.all([
            db.collection('admin').findOne({ type: 'config' }),
            db.collection('users').findOne({ userId: userId })
        ]);
        
        const bonusSettings = config?.bonusSettings || DEFAULT_CONFIG.bonus;
        
        if (!bonusSettings.enabled) {
            await ctx.answerCbQuery('❌ Bonus feature is disabled');
            return;
        }
        
        if (userData?.bonusClaimed) {
            await ctx.answerCbQuery('❌ You have already claimed bonus today');
            return;
        }
        
        const bonusAmount = bonusSettings.amount || 25;
        
        // Add bonus to user balance
        await updateUserBalance(userId, bonusAmount, 'add');
        
        // Mark bonus as claimed
        await db.collection('users').updateOne(
            { userId: userId },
            { 
                $set: { 
                    bonusClaimed: true,
                    bonusClaimedAt: new Date(),
                    updatedAt: new Date()
                }
            }
        );
        
        // Add transaction record
        await addTransaction(userId, 'bonus', bonusAmount, 'Daily bonus claimed');
        
        await ctx.answerCbQuery(`✅ Bonus claimed! ${formatCurrency(bonusAmount)} added to your balance`);
        
        // Show success message
        const successText = `🎉 *Bonus Claimed Successfully!*\n\n`;
        successText += `💰 *Amount:* ${formatCurrency(bonusAmount)}\n`;
        successText += `📅 *Date:* ${new Date().toLocaleString()}\n`;
        successText += `💳 *New Balance:* ${formatCurrency((userData.balance || 0) + bonusAmount)}\n\n`;
        successText += `*Note:* You can claim bonus again after 24 hours.\n`;
        
        const keyboard = [
            [{ text: '💰 Check Balance', callback_data: 'user_balance' }],
            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
        ];
        
        await safeEditMessage(ctx, successText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Claim bonus error:', error);
        await ctx.answerCbQuery('❌ Error claiming bonus');
    }
});

// ==========================================
// USER FEATURES - GIFT CODE
// ==========================================

bot.action('user_gift_code', async (ctx) => {
    try {
        const giftText = `🎫 *Redeem Gift Code*\n\n`;
        giftText += `Enter your gift code below:\n\n`;
        giftText += `*How to get gift codes:*\n`;
        giftText += `• Admin promotions\n`;
        giftText += `• Special events\n`;
        giftText += `• Giveaways\n\n`;
        giftText += `*Note:* Each code can be used only once.\n`;
        giftText += `Type "cancel" to cancel.`;
        
        await ctx.deleteMessage().catch(() => {});
        await safeSendMessage(ctx, giftText, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                ]]
            }
        });
        
        await ctx.scene.enter('enter_gift_code_scene');
        
    } catch (error) {
        console.error('Gift code error:', error);
        await ctx.answerCbQuery('❌ Error loading gift code');
    }
});

// Enter Gift Code Scene
scenes.enterGiftCode.on('text', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const codeInput = ctx.message.text.trim().toUpperCase();
        
        if (codeInput.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Gift code redemption cancelled.');
            await ctx.scene.leave();
            await showMainMenu(ctx);
            return;
        }
        
        // Find gift code
        const giftCode = await db.collection('giftcodes').findOne({ 
            code: codeInput,
            isActive: true
        });
        
        if (!giftCode) {
            await safeSendMessage(ctx, '❌ *Invalid or expired gift code!*\n\nPlease check the code and try again.\n\nType "cancel" to cancel.', {
                parse_mode: 'HTML'
            });
            return;
        }
        
        // Check expiry
        if (giftCode.expiresAt && new Date(giftCode.expiresAt) < new Date()) {
            await safeSendMessage(ctx, '❌ *This gift code has expired!*\n\nType "cancel" to cancel.', {
                parse_mode: 'HTML'
            });
            return;
        }
        
        // Check usage limit
        if (giftCode.maxUses && giftCode.usedCount >= giftCode.maxUses) {
            await safeSendMessage(ctx, '❌ *This gift code has reached maximum usage limit!*\n\nType "cancel" to cancel.', {
                parse_mode: 'HTML'
            });
            return;
        }
        
        // Check if user has already used this code
        const userData = await db.collection('users').findOne({ userId: userId });
        const usedCodes = userData?.giftCodesUsed || [];
        
        if (usedCodes.includes(codeInput)) {
            await safeSendMessage(ctx, '❌ *You have already used this gift code!*\n\nType "cancel" to cancel.', {
                parse_mode: 'HTML'
            });
            return;
        }
        
        // Calculate amount (random between min and max if range specified)
        let amount = giftCode.amount;
        if (giftCode.minAmount && giftCode.maxAmount) {
            amount = Math.floor(Math.random() * (giftCode.maxAmount - giftCode.minAmount + 1)) + giftCode.minAmount;
        }
        
        // Add amount to user balance
        await updateUserBalance(userId, amount, 'add');
        
        // Update gift code usage
        await db.collection('giftcodes').updateOne(
            { code: codeInput },
            { 
                $inc: { usedCount: 1 },
                $push: { usedBy: userId }
            }
        );
        
        // Update user's used codes
        await db.collection('users').updateOne(
            { userId: userId },
            { 
                $push: { giftCodesUsed: codeInput },
                $set: { updatedAt: new Date() }
            }
        );
        
        // Add transaction record
        await addTransaction(userId, 'giftcode', amount, `Gift code: ${codeInput}`);
        
        // Prepare success message
        const successText = `🎉 *Gift Code Redeemed Successfully!*\n\n`;
        successText += `🎫 *Code:* \`${codeInput}\`\n`;
        successText += `💰 *Amount:* ${formatCurrency(amount)}\n`;
        successText += `📅 *Date:* ${new Date().toLocaleString()}\n`;
        successText += `💳 *New Balance:* ${formatCurrency((userData.balance || 0) + amount)}\n\n`;
        successText += `*Remaining uses:* ${giftCode.maxUses ? giftCode.maxUses - giftCode.usedCount - 1 : 'Unlimited'}\n`;
        
        if (giftCode.expiresAt) {
            const expiryDate = new Date(giftCode.expiresAt).toLocaleDateString();
            successText += `*Expires:* ${expiryDate}\n`;
        }
        
        const keyboard = [
            [{ text: '💰 Check Balance', callback_data: 'user_balance' }],
            [{ text: '🎫 Redeem Another Code', callback_data: 'user_gift_code' }],
            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
        ];
        
        await safeSendMessage(ctx, successText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
        await ctx.scene.leave();
        
    } catch (error) {
        console.error('Enter gift code scene error:', error);
        await safeSendMessage(ctx, '❌ Error redeeming gift code. Please try again.');
        await ctx.scene.leave();
    }
});

// ==========================================
// USER FEATURES - TASKS
// ==========================================

bot.action('user_tasks', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const page = ctx.session?.tasksPage || 1;
        const limit = 10;
        
        const totalTasks = await db.collection('tasks').countDocuments({ isActive: true });
        const totalPages = Math.ceil(totalTasks / limit);
        const skip = (page - 1) * limit;
        
        const tasks = await db.collection('tasks')
            .find({ isActive: true })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        let tasksText = `📋 *Available Tasks*\n\n`;
        tasksText += `Page ${page} of ${totalPages}\n`;
        tasksText += `Total Tasks: ${totalTasks}\n\n`;
        
        if (tasks.length === 0) {
            tasksText += `No tasks available at the moment.\n`;
            tasksText += `Check back later for new tasks!\n`;
        } else {
            tasksText += `*Task List:*\n\n`;
            
            for (let i = 0; i < tasks.length; i++) {
                const task = tasks[i];
                const index = skip + i + 1;
                
                tasksText += `${index}. *${task.title}*\n`;
                tasksText += `   Reward: ${formatCurrency(task.bonusAmount)}\n`;
                tasksText += `   Screenshots: ${task.screenshotCount || 1}\n`;
                tasksText += `   Status: ${task.isActive ? '✅ Active' : '❌ Inactive'}\n\n`;
            }
        }
        
        const keyboard = [];
        
        // Task buttons
        for (let i = 0; i < tasks.length; i += 2) {
            const row = [];
            for (let j = 0; j < 2 && (i + j) < tasks.length; j++) {
                const task = tasks[i + j];
                row.push({ 
                    text: `${skip + i + j + 1}. ${task.title.substring(0, 15)}...`, 
                    callback_data: `view_task_${task.taskId}` 
                });
            }
            if (row.length > 0) keyboard.push(row);
        }
        
        // Navigation buttons
        if (totalPages > 1) {
            const navRow = [];
            if (page > 1) {
                navRow.push({ text: '◀️ Previous', callback_data: `tasks_page_${page - 1}` });
            }
            navRow.push({ text: `📄 ${page}/${totalPages}`, callback_data: 'no_action' });
            if (page < totalPages) {
                navRow.push({ text: 'Next ▶️', callback_data: `tasks_page_${page + 1}` });
            }
            keyboard.push(navRow);
        }
        
        keyboard.push(
            [{ text: '📊 Task History', callback_data: 'task_history' }],
            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
        );
        
        await ctx.deleteMessage().catch(() => {});
        await safeSendMessage(ctx, tasksText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Tasks error:', error);
        await ctx.answerCbQuery('❌ Error loading tasks');
    }
});

// View Task Details
bot.action(/^view_task_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const userId = ctx.from.id;
        
        const task = await db.collection('tasks').findOne({ taskId: taskId });
        
        if (!task) {
            await ctx.answerCbQuery('❌ Task not found');
            return;
        }
        
        // Check if user has already submitted this task
        const existingSubmission = await db.collection('tasksubmissions').findOne({
            userId: userId,
            taskId: taskId
        });
        
        let taskText = `📋 *Task Details*\n\n`;
        taskText += `*Title:* ${task.title}\n`;
        taskText += `*Reward:* ${formatCurrency(task.bonusAmount)}\n`;
        taskText += `*Screenshots Required:* ${task.screenshotCount || 1}\n\n`;
        taskText += `*Description:*\n${task.description}\n\n`;
        
        if (task.instructions) {
            taskText += `*Instructions:*\n${task.instructions}\n\n`;
        }
        
        if (existingSubmission) {
            const statusEmoji = existingSubmission.status === 'approved' ? '✅' : 
                               existingSubmission.status === 'rejected' ? '❌' : '⏳';
            taskText += `*Your Status:* ${statusEmoji} ${existingSubmission.status.toUpperCase()}\n`;
            
            if (existingSubmission.status === 'rejected' && existingSubmission.adminMessage) {
                taskText += `*Reason:* ${existingSubmission.adminMessage}\n`;
            }
            
            if (existingSubmission.status === 'approved') {
                taskText += `*Approved At:* ${new Date(existingSubmission.approvedAt).toLocaleString()}\n`;
            }
        }
        
        const keyboard = [];
        
        if (!existingSubmission || existingSubmission.status === 'rejected') {
            keyboard.push([{ text: '✅ Start Task', callback_data: `start_task_${taskId}` }]);
        }
        
        // Show task images if available
        if (task.images && task.images.length > 0) {
            // Send first image with caption
            await ctx.replyWithPhoto(task.images[0], {
                caption: taskText,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
            
            // Send remaining images
            for (let i = 1; i < task.images.length; i++) {
                await ctx.replyWithPhoto(task.images[i]);
            }
        } else {
            await safeEditMessage(ctx, taskText, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        }
        
    } catch (error) {
        console.error('View task error:', error);
        await ctx.answerCbQuery('❌ Error loading task details');
    }
});

// Start Task
bot.action(/^start_task_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const userId = ctx.from.id;
        
        const task = await db.collection('tasks').findOne({ taskId: taskId });
        
        if (!task) {
            await ctx.answerCbQuery('❌ Task not found');
            return;
        }
        
        // Check if user has already submitted
        const existingSubmission = await db.collection('tasksubmissions').findOne({
            userId: userId,
            taskId: taskId
        });
        
        if (existingSubmission && existingSubmission.status !== 'rejected') {
            await ctx.answerCbQuery('❌ You have already submitted this task');
            return;
        }
        
        // Store task info in session
        ctx.session.taskSubmission = {
            taskId: taskId,
            taskTitle: task.title,
            screenshotCount: task.screenshotCount || 1,
            screenshotLabels: task.screenshotLabels || [],
            currentScreenshot: 1,
            screenshots: []
        };
        
        let taskStartText = `🚀 *Starting Task: ${task.title}*\n\n`;
        taskStartText += `*Reward:* ${formatCurrency(task.bonusAmount)}\n`;
        taskStartText += `*Screenshots Required:* ${task.screenshotCount || 1}\n\n`;
        taskStartText += `*Please follow these steps:*\n`;
        taskStartText += `1. Complete the task as described\n`;
        taskStartText += `2. Take screenshots as proof\n`;
        taskStartText += `3. Upload each screenshot when prompted\n\n`;
        taskStartText += `*Note:* Make sure screenshots clearly show task completion.\n`;
        taskStartText += `Type "cancel" to cancel at any time.\n\n`;
        taskStartText += `Ready to upload screenshot 1/${task.screenshotCount || 1}?`;
        
        const keyboard = [
            [{ text: '📸 Upload Screenshot 1', callback_data: 'upload_screenshot_1' }],
            [{ text: '🚫 Cancel Task', callback_data: 'cancel_task' }]
        ];
        
        await safeEditMessage(ctx, taskStartText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Start task error:', error);
        await ctx.answerCbQuery('❌ Error starting task');
    }
});

// Upload Screenshot
bot.action(/^upload_screenshot_(\d+)$/, async (ctx) => {
    try {
        const screenshotNum = parseInt(ctx.match[1]);
        const taskSubmission = ctx.session.taskSubmission;
        
        if (!taskSubmission) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        if (screenshotNum > taskSubmission.screenshotCount) {
            await ctx.answerCbQuery('❌ Invalid screenshot number');
            return;
        }
        
        taskSubmission.currentScreenshot = screenshotNum;
        
        const label = taskSubmission.screenshotLabels[screenshotNum - 1] || `Screenshot ${screenshotNum}`;
        
        let uploadText = `📸 *Upload ${label}*\n\n`;
        uploadText += `Task: ${taskSubmission.taskTitle}\n`;
        uploadText += `Progress: ${screenshotNum}/${taskSubmission.screenshotCount}\n\n`;
        uploadText += `Please send the screenshot now.\n`;
        uploadText += `Make sure it clearly shows task completion.\n\n`;
        uploadText += `Type "cancel" to cancel the task.`;
        
        await safeEditMessage(ctx, uploadText, {
            parse_mode: 'HTML'
        });
        
        // Enter task submission scene
        await ctx.scene.enter('task_submission_scene');
        
    } catch (error) {
        console.error('Upload screenshot error:', error);
        await ctx.answerCbQuery('❌ Error preparing screenshot upload');
    }
});

// Cancel Task
bot.action('cancel_task', async (ctx) => {
    try {
        delete ctx.session.taskSubmission;
        await safeSendMessage(ctx, '❌ Task submission cancelled.');
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Cancel task error:', error);
    }
});

// Task Submission Scene
scenes.taskSubmission.on(['photo', 'text'], async (ctx) => {
    try {
        const taskSubmission = ctx.session.taskSubmission;
        
        if (!taskSubmission) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            return;
        }
        
        if (ctx.message.text && ctx.message.text.toLowerCase() === 'cancel') {
            delete ctx.session.taskSubmission;
            await safeSendMessage(ctx, '❌ Task submission cancelled.');
            await ctx.scene.leave();
            await showMainMenu(ctx);
            return;
        }
        
        if (!ctx.message.photo) {
            await safeSendMessage(ctx, '❌ Please send a screenshot photo.\n\nType "cancel" to cancel.');
            return;
        }
        
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const fileLink = await ctx.telegram.getFileLink(photo.file_id);
        
        // Store screenshot
        taskSubmission.screenshots.push({
            number: taskSubmission.currentScreenshot,
            url: fileLink.href,
            fileId: photo.file_id
        });
        
        // Check if all screenshots uploaded
        if (taskSubmission.currentScreenshot >= taskSubmission.screenshotCount) {
            // All screenshots uploaded, submit task
            await submitTaskCompletion(ctx);
        } else {
            // Ask for next screenshot
            taskSubmission.currentScreenshot++;
            const nextNum = taskSubmission.currentScreenshot;
            const label = taskSubmission.screenshotLabels[nextNum - 1] || `Screenshot ${nextNum}`;
            
            let nextText = `✅ *Screenshot ${nextNum - 1} uploaded successfully!*\n\n`;
            nextText += `Ready to upload ${label} (${nextNum}/${taskSubmission.screenshotCount})?\n\n`;
            nextText += `Type "cancel" to cancel.`;
            
            const keyboard = [
                [{ text: `📸 Upload ${label}`, callback_data: `upload_screenshot_${nextNum}` }],
                [{ text: '🚫 Cancel Task', callback_data: 'cancel_task' }]
            ];
            
            await safeSendMessage(ctx, nextText, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
            
            await ctx.scene.leave();
        }
        
    } catch (error) {
        console.error('Task submission scene error:', error);
        await safeSendMessage(ctx, '❌ Error uploading screenshot. Please try again.');
        await ctx.scene.leave();
    }
});

async function submitTaskCompletion(ctx) {
    try {
        const userId = ctx.from.id;
        const taskSubmission = ctx.session.taskSubmission;
        
        if (!taskSubmission) {
            await safeSendMessage(ctx, '❌ Session expired');
            return;
        }
        
        const task = await db.collection('tasks').findOne({ taskId: taskSubmission.taskId });
        
        if (!task) {
            await safeSendMessage(ctx, '❌ Task not found');
            delete ctx.session.taskSubmission;
            return;
        }
        
        // Create submission
        const submissionId = generateSubmissionId();
        const submission = {
            submissionId: submissionId,
            userId: userId,
            taskId: taskSubmission.taskId,
            taskTitle: taskSubmission.taskTitle,
            screenshots: taskSubmission.screenshots.map(s => s.url),
            status: 'pending',
            bonusAmount: task.bonusAmount,
            submittedAt: new Date(),
            userInfo: {
                firstName: ctx.from.first_name || '',
                lastName: ctx.from.last_name || '',
                username: ctx.from.username || ''
            }
        };
        
        await db.collection('tasksubmissions').insertOne(submission);
        
        // Clear session
        delete ctx.session.taskSubmission;
        
        // Prepare success message
        let successText = `✅ *Task Submitted Successfully!*\n\n`;
        successText += `📋 *Task:* ${taskSubmission.taskTitle}\n`;
        successText += `🎫 *Submission ID:* \`${submissionId}\`\n`;
        successText += `💰 *Reward:* ${formatCurrency(task.bonusAmount)}\n`;
        successText += `📅 *Submitted:* ${new Date().toLocaleString()}\n\n`;
        successText += `*Status:* ⏳ Pending Review\n\n`;
        successText += `Your submission has been sent to admin for review.\n`;
        successText += `You will be notified once it's approved.`;
        
        const keyboard = [
            [{ text: '📋 View Other Tasks', callback_data: 'user_tasks' }],
            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
        ];
        
        await safeSendMessage(ctx, successText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
        await ctx.scene.leave();
        
        // Notify admins
        const userLink = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || 'User';
        const adminNotification = `📋 *New Task Submission*\n\n`;
        adminNotification += `🎫 *Submission ID:* \`${submissionId}\`\n`;
        adminNotification += `👤 *User:* ${userLink}\n`;
        adminNotification += `🆔 *User ID:* \`${userId}\`\n`;
        adminNotification += `📋 *Task:* ${taskSubmission.taskTitle}\n`;
        adminNotification += `💰 *Reward:* ${formatCurrency(task.bonusAmount)}\n`;
        adminNotification += `📅 *Time:* ${new Date().toLocaleString()}\n\n`;
        adminNotification += `Click below to review:`;
        
        const activeAdmins = await getActiveAdmins();
        const notifyPromises = activeAdmins.map(async (adminId) => {
            try {
                await bot.telegram.sendMessage(adminId, adminNotification, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '✅ Review Submission', callback_data: `review_submission_${submissionId}` }
                        ]]
                    }
                });
            } catch (error) {
                console.error(`Failed to notify admin ${adminId}:`, error.message);
            }
        });
        
        await Promise.allSettled(notifyPromises);
        
    } catch (error) {
        console.error('Submit task completion error:', error);
        await safeSendMessage(ctx, '❌ Error submitting task. Please try again.');
        await ctx.scene.leave();
    }
}

// Task History
bot.action('task_history', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const page = ctx.session?.taskHistoryPage || 1;
        const limit = 10;
        
        const totalSubmissions = await db.collection('tasksubmissions').countDocuments({ userId: userId });
        const totalPages = Math.ceil(totalSubmissions / limit);
        const skip = (page - 1) * limit;
        
        const submissions = await db.collection('tasksubmissions')
            .find({ userId: userId })
            .sort({ submittedAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        let historyText = `📊 *Task History*\n\n`;
        historyText += `Page ${page} of ${totalPages}\n`;
        historyText += `Total Submissions: ${totalSubmissions}\n\n`;
        
        if (submissions.length === 0) {
            historyText += `No task submissions found.\n`;
        } else {
            historyText += `*Submission History:*\n\n`;
            
            for (let i = 0; i < submissions.length; i++) {
                const submission = submissions[i];
                const index = skip + i + 1;
                const date = new Date(submission.submittedAt).toLocaleDateString();
                const statusEmoji = submission.status === 'approved' ? '✅' : 
                                   submission.status === 'rejected' ? '❌' : '⏳';
                
                historyText += `${index}. *${submission.taskTitle}*\n`;
                historyText += `   ID: \`${submission.submissionId}\`\n`;
                historyText += `   Status: ${statusEmoji} ${submission.status}\n`;
                historyText += `   Reward: ${formatCurrency(submission.bonusAmount)}\n`;
                historyText += `   Date: ${date}\n`;
                
                if (submission.status === 'approved' && submission.approvedAt) {
                    historyText += `   Approved: ${new Date(submission.approvedAt).toLocaleDateString()}\n`;
                }
                if (submission.status === 'rejected' && submission.adminMessage) {
                    historyText += `   Reason: ${submission.adminMessage}\n`;
                }
                historyText += `\n`;
            }
        }
        
        const keyboard = [];
        
        // Navigation buttons
        if (totalPages > 1) {
            const navRow = [];
            if (page > 1) {
                navRow.push({ text: '◀️ Previous', callback_data: `task_history_page_${page - 1}` });
            }
            navRow.push({ text: `📄 ${page}/${totalPages}`, callback_data: 'no_action' });
            if (page < totalPages) {
                navRow.push({ text: 'Next ▶️', callback_data: `task_history_page_${page + 1}` });
            }
            keyboard.push(navRow);
        }
        
        keyboard.push(
            [{ text: '📋 Available Tasks', callback_data: 'user_tasks' }],
            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
        );
        
        await safeEditMessage(ctx, historyText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Task history error:', error);
        await ctx.answerCbQuery('❌ Error loading task history');
    }
});

// Task History Pagination
bot.action(/^task_history_page_(\d+)$/, async (ctx) => {
    try {
        const page = parseInt(ctx.match[1]);
        ctx.session.taskHistoryPage = page;
        await bot.action('task_history')(ctx);
    } catch (error) {
        console.error('Task history pagination error:', error);
    }
});

// ==========================================
// USER FEATURES - CONTACT SUPPORT
// ==========================================

bot.action('contact_support', async (ctx) => {
    try {
        const user = ctx.from;
        const userInfo = user.username ? `@${user.username}` : user.first_name || `User ${user.id}`;
        
        let contactText = `📞 *Contact Support*\n\n`;
        contactText += `If you have any questions, issues, or need assistance, our support team is here to help!\n\n`;
        contactText += `*How to contact:*\n`;
        contactText += `1. Send your message directly\n`;
        contactText += `2. Include details about your issue\n`;
        contactText += `3. Attach screenshots if needed\n`;
        contactText += `4. Our team will respond as soon as possible\n\n`;
        contactText += `*Note:* For faster response, please be clear and provide all necessary information.\n\n`;
        contactText += `Type your message below:\n`;
        contactText += `Type "cancel" to cancel.`;
        
        await ctx.deleteMessage().catch(() => {});
        await safeSendMessage(ctx, contactText, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                ]]
            }
        });
        
        await ctx.scene.enter('contact_user_message_scene');
        
    } catch (error) {
        console.error('Contact support error:', error);
        await ctx.answerCbQuery('❌ Error loading contact form');
    }
});

// Contact User Message Scene (for users contacting support)
scenes.contactUserMessage.on(['text', 'photo', 'document'], async (ctx) => {
    try {
        const user = ctx.from;
        const userInfo = user.username ? `@${user.username}` : user.first_name || `User ${user.id}`;
        
        if (ctx.message.text?.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Contact cancelled.');
            await ctx.scene.leave();
            await showMainMenu(ctx);
            return;
        }
        
        // Prepare message for admin
        let adminMessage = `📞 *New Support Request*\n\n`;
        adminMessage += `👤 *User:* ${userInfo}\n`;
        adminMessage += `🆔 *User ID:* \`${user.id}\`\n`;
        adminMessage += `📅 *Time:* ${new Date().toLocaleString()}\n\n`;
        
        if (ctx.message.text) {
            adminMessage += `*Message:*\n${ctx.message.text}\n\n`;
        } else if (ctx.message.caption) {
            adminMessage += `*Message:*\n${ctx.message.caption}\n\n`;
        } else {
            adminMessage += `*Message:* [Media file attached]\n\n`;
        }
        
        adminMessage += `Click below to reply:`;
        
        // Send to admins
        const activeAdmins = await getActiveAdmins();
        const notifyPromises = activeAdmins.map(async (adminId) => {
            try {
                if (ctx.message.photo) {
                    await bot.telegram.sendPhoto(
                        adminId,
                        ctx.message.photo[ctx.message.photo.length - 1].file_id,
                        {
                            caption: adminMessage,
                            parse_mode: 'HTML',
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '💬 Reply to User', callback_data: `contact_user_${user.id}` }
                                ]]
                            }
                        }
                    );
                } else if (ctx.message.document) {
                    await bot.telegram.sendDocument(
                        adminId,
                        ctx.message.document.file_id,
                        {
                            caption: adminMessage,
                            parse_mode: 'HTML',
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '💬 Reply to User', callback_data: `contact_user_${user.id}` }
                                ]]
                            }
                        }
                    );
                } else if (ctx.message.text) {
                    await bot.telegram.sendMessage(
                        adminId,
                        adminMessage,
                        {
                            parse_mode: 'HTML',
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '💬 Reply to User', callback_data: `contact_user_${user.id}` }
                                ]]
                            }
                        }
                    );
                }
            } catch (error) {
                console.error(`Failed to notify admin ${adminId}:`, error.message);
            }
        });
        
        await Promise.allSettled(notifyPromises);
        
        // Confirm to user
        await safeSendMessage(ctx, '✅ *Message sent to support team!*\n\nWe will get back to you as soon as possible.', {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                ]]
            }
        });
        
        await ctx.scene.leave();
        
    } catch (error) {
        console.error('Contact user message scene error:', error);
        await safeSendMessage(ctx, '❌ Error sending message. Please try again.');
        await ctx.scene.leave();
    }
});

// ==========================================
// ADMIN PANEL - MAIN MENU
// ==========================================

bot.command('admin', async (ctx) => {
    try {
        const args = ctx.message.text.split(' ');
        
        if (args.length > 1) {
            // Admin code verification
            const adminCode = args[1];
            const config = await db.collection('admin').findOne({ type: 'config' });
            const validAdminCode = config?.adminCode || ADMIN_CODE;
            
            if (adminCode === validAdminCode) {
                // Add user as admin
                const userId = ctx.from.id;
                const currentAdmins = config?.admins || ADMIN_IDS;
                
                if (!currentAdmins.includes(userId)) {
                    const updatedAdmins = [...currentAdmins, userId];
                    await db.collection('admin').updateOne(
                        { type: 'config' },
                        { $set: { admins: updatedAdmins, updatedAt: new Date() } }
                    );
                    
                    await safeSendMessage(ctx, `✅ *You are now an admin!*\n\nWelcome to the admin panel.`, {
                        parse_mode: 'HTML'
                    });
                }
            } else {
                await safeSendMessage(ctx, '❌ Invalid admin code.');
                return;
            }
        }
        
        if (!await isAdmin(ctx.from.id)) {
            return safeSendMessage(ctx, '❌ You are not authorized to use this command.');
        }
        
        await showAdminPanel(ctx);
        
    } catch (error) {
        console.error('Admin command error:', error);
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.');
    }
});

async function showAdminPanel(ctx) {
    try {
        const text = '👮‍♂️ *Admin Control Panel*\n\nSelect a category:';
        
        const keyboard = [
            // Row 1: Broadcasting & Users
            [
                { text: '📢 Broadcast', callback_data: 'admin_broadcast' },
                { text: '👥 User Stats', callback_data: 'admin_userstats' }
            ],
            
            // Row 2: Content Management
            [
                { text: '📝 Messages', callback_data: 'admin_messages_menu' },
                { text: '🖼️ Images', callback_data: 'admin_images_menu' }
            ],
            
            // Row 3: Earning Features
            [
                { text: '💰 Earnings', callback_data: 'admin_earnings_menu' },
                { text: '📋 Tasks', callback_data: 'admin_tasks_menu' }
            ],
            
            // Row 4: Channel Management
            [
                { text: '📺 Channels', callback_data: 'admin_channels_menu' },
                { text: '👑 Admins', callback_data: 'admin_admins_menu' }
            ],
            
            // Row 5: System Settings
            [
                { text: '⚙️ Settings', callback_data: 'admin_settings_menu' },
                { text: '📊 Statistics', callback_data: 'admin_statistics' }
            ],
            
            // Row 6: Tools & Utilities
            [
                { text: '🛠️ Tools', callback_data: 'admin_tools_menu' },
                { text: '🚨 Alerts', callback_data: 'admin_alerts_menu' }
            ]
        ];
        
        if (ctx.callbackQuery) {
            await safeEditMessage(ctx, text, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await safeSendMessage(ctx, text, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    } catch (error) {
        console.error('Show admin panel error:', error);
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.');
    }
}

// Back to Admin Panel
bot.action('admin_back', async (ctx) => {
    try {
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Back to admin error:', error);
    }
});

// ==========================================
// ADMIN SUB-MENUS
// ==========================================

// Messages Menu
bot.action('admin_messages_menu', async (ctx) => {
    const text = '📝 *Messages Management*\n\nSelect an option:';
    
    const keyboard = [
        [
            { text: '🖼️ Start Message', callback_data: 'admin_startmessage' },
            { text: '🎮 Menu Message', callback_data: 'admin_menumessage' }
        ],
        [
            { text: '📋 HTML Guide', callback_data: 'admin_html_guide' }
        ],
        [
            { text: '🔙 Back', callback_data: 'admin_back' }
        ]
    ];
    
    await safeEditMessage(ctx, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Images Menu
bot.action('admin_images_menu', async (ctx) => {
    const text = '🖼️ *Images Management*\n\nSelect an option:';
    
    const keyboard = [
        [
            { text: '🖼️ Start Image', callback_data: 'admin_startimage' },
            { text: '🎮 Menu Image', callback_data: 'admin_menuimage' }
        ],
        [
            { text: '🎁 Bonus Image', callback_data: 'admin_bonusimage' }
        ],
        [
            { text: '⚙️ Image Overlay', callback_data: 'admin_image_overlay' },
            { text: '📁 Manage Images', callback_data: 'admin_manage_images' }
        ],
        [
            { text: '🔙 Back', callback_data: 'admin_back' }
        ]
    ];
    
    await safeEditMessage(ctx, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Earnings Menu
bot.action('admin_earnings_menu', async (ctx) => {
    const text = '💰 *Earnings Management*\n\nSelect an option:';
    
    const keyboard = [
        [
            { text: '🎫 Gift Codes', callback_data: 'admin_giftcodes_menu' },
            { text: '🎁 Bonus', callback_data: 'admin_bonus_menu' }
        ],
        [
            { text: '📤 Referral', callback_data: 'admin_referral_menu' },
            { text: '💳 Withdrawal', callback_data: 'admin_withdrawal_menu' }
        ],
        [
            { text: '🔙 Back', callback_data: 'admin_back' }
        ]
    ];
    
    await safeEditMessage(ctx, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Tasks Menu
bot.action('admin_tasks_menu', async (ctx) => {
    const text = '📋 *Tasks Management*\n\nSelect an option:';
    
    const keyboard = [
        [
            { text: '➕ Add Task', callback_data: 'admin_add_task' },
            { text: '📋 Manage Tasks', callback_data: 'admin_manage_tasks' }
        ],
        [
            { text: '✅ Task Requests', callback_data: 'admin_task_requests' },
            { text: '📊 Task History', callback_data: 'admin_task_history' }
        ],
        [
            { text: '🔙 Back', callback_data: 'admin_back' }
        ]
    ];
    
    await safeEditMessage(ctx, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Channels Menu
bot.action('admin_channels_menu', async (ctx) => {
    const text = '📺 *Channels Management*\n\nSelect an option:';
    
    const keyboard = [
        [
            { text: '➕ Add Channel', callback_data: 'admin_add_channel' },
            { text: '📋 Manage Channels', callback_data: 'admin_channels' }
        ],
        [
            { text: '🔄 Reorder Channels', callback_data: 'admin_reorder_channels' },
            { text: '✏️ Edit Channels', callback_data: 'admin_edit_channels' }
        ],
        [
            { text: '👁️ Channel Levels', callback_data: 'admin_channel_levels' }
        ],
        [
            { text: '🔙 Back', callback_data: 'admin_back' }
        ]
    ];
    
    await safeEditMessage(ctx, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Admins Menu
bot.action('admin_admins_menu', async (ctx) => {
    const text = '👑 *Admins Management*\n\nSelect an option:';
    
    const keyboard = [
        [
            { text: '➕ Add Admin', callback_data: 'admin_add_admin' },
            { text: '📋 Manage Admins', callback_data: 'admin_manage_admins' }
        ],
        [
            { text: '🔐 Admin Code', callback_data: 'admin_code_settings' }
        ],
        [
            { text: '🔙 Back', callback_data: 'admin_back' }
        ]
    ];
    
    await safeEditMessage(ctx, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Settings Menu
bot.action('admin_settings_menu', async (ctx) => {
    const text = '⚙️ *System Settings*\n\nSelect an option:';
    
    const keyboard = [
        [
            { text: '⏰ Timer', callback_data: 'admin_timer' },
            { text: '📞 Contact Button', callback_data: 'admin_contact_button' }
        ],
        [
            { text: '🚫 Disable Bot', callback_data: 'admin_disable_bot' },
            { text: '🔄 Auto Accept', callback_data: 'admin_auto_accept' }
        ],
        [
            { text: '🔕 Mute Notifications', callback_data: 'admin_mute_notifications' }
        ],
        [
            { text: '🔙 Back', callback_data: 'admin_back' }
        ]
    ];
    
    await safeEditMessage(ctx, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Tools Menu
bot.action('admin_tools_menu', async (ctx) => {
    const text = '🛠️ *Admin Tools*\n\nSelect an option:';
    
    const keyboard = [
        [
            { text: '🗑️ Delete Data', callback_data: 'admin_deletedata' },
            { text: '🔄 Reset Errors', callback_data: 'admin_reset_errors' }
        ],
        [
            { text: '🔍 Search Users', callback_data: 'admin_search_users' },
            { text: '🔍 Search Withdrawals', callback_data: 'admin_search_withdrawals' }
        ],
        [
            { text: '🔙 Back', callback_data: 'admin_back' }
        ]
    ];
    
    await safeEditMessage(ctx, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Alerts Menu
bot.action('admin_alerts_menu', async (ctx) => {
    const text = '🚨 *Alerts & Notifications*\n\nSelect an option:';
    
    const keyboard = [
        [
            { text: '📊 User Joined', callback_data: 'admin_user_joined_alerts' },
            { text: '✅ User Verified', callback_data: 'admin_user_verified_alerts' }
        ],
        [
            { text: '💳 Withdrawal Request', callback_data: 'admin_withdrawal_alerts' },
            { text: '📋 Task Submission', callback_data: 'admin_task_submission_alerts' }
        ],
        [
            { text: '📞 Contact Message', callback_data: 'admin_contact_alerts' }
        ],
        [
            { text: '🔙 Back', callback_data: 'admin_back' }
        ]
    ];
    
    await safeEditMessage(ctx, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Gift Codes Menu
bot.action('admin_giftcodes_menu', async (ctx) => {
    const text = '🎫 *Gift Codes Management*\n\nSelect an option:';
    
    const keyboard = [
        [
            { text: '➕ Create Gift Code', callback_data: 'admin_create_giftcode' },
            { text: '📋 Manage Gift Codes', callback_data: 'admin_manage_giftcodes' }
        ],
        [
            { text: '⚙️ Gift Code Settings', callback_data: 'admin_giftcode_settings' }
        ],
        [
            { text: '🔙 Back', callback_data: 'admin_earnings_menu' }
        ]
    ];
    
    await safeEditMessage(ctx, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Bonus Menu
bot.action('admin_bonus_menu', async (ctx) => {
    const text = '🎁 *Bonus Management*\n\nSelect an option:';
    
    const keyboard = [
        [
            { text: '⚙️ Bonus Settings', callback_data: 'admin_bonus_settings' },
            { text: '🖼️ Bonus Image', callback_data: 'admin_bonusimage' }
        ],
        [
            { text: '🔙 Back', callback_data: 'admin_earnings_menu' }
        ]
    ];
    
    await safeEditMessage(ctx, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Referral Menu
bot.action('admin_referral_menu', async (ctx) => {
    const text = '📤 *Referral Management*\n\nSelect an option:';
    
    const keyboard = [
        [
            { text: '⚙️ Referral Settings', callback_data: 'admin_referral_settings' }
        ],
        [
            { text: '🔙 Back', callback_data: 'admin_earnings_menu' }
        ]
    ];
    
    await safeEditMessage(ctx, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Withdrawal Menu
bot.action('admin_withdrawal_menu', async (ctx) => {
    const text = '💳 *Withdrawal Management*\n\nSelect an option:';
    
    const keyboard = [
        [
            { text: '📋 Withdrawal Requests', callback_data: 'admin_withdrawal_requests' },
            { text: '📊 Withdrawal History', callback_data: 'admin_withdrawal_history' }
        ],
        [
            { text: '⚙️ Withdrawal Settings', callback_data: 'admin_withdrawal_settings' }
        ],
        [
            { text: '🔙 Back', callback_data: 'admin_earnings_menu' }
        ]
    ];
    
    await safeEditMessage(ctx, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
});

// ==========================================
// ADMIN FEATURES - BROADCAST
// ==========================================

bot.action('admin_broadcast', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await safeEditMessage(ctx, '📢 *Broadcast Message*\n\nSend the message you want to broadcast to all users.\n\nSupports HTML formatting.\n\nType "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    await ctx.scene.enter('broadcast_scene');
});

scenes.broadcast.on('message', async (ctx) => {
    try {
        if (ctx.message.text?.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Broadcast cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const users = await db.collection('users').find({}).toArray();
        const totalUsers = users.length;
        let successful = 0;
        let failed = 0;
        
        await safeSendMessage(ctx, `🚀 Broadcasting to ${totalUsers} users...`);
        
        // Notify admins about broadcast start
        await notifyAdmin(`📢 *Broadcast Started*\n\n👤 Admin: ${ctx.from.id}\n👥 Target: ${totalUsers} users\n⏰ Time: ${new Date().toLocaleString()}`);
        
        const broadcastPromises = users.map(async (user) => {
            try {
                if (ctx.message.photo) {
                    await ctx.telegram.sendPhoto(
                        user.userId,
                        ctx.message.photo[ctx.message.photo.length - 1].file_id,
                        {
                            caption: ctx.message.caption,
                            parse_mode: 'HTML'
                        }
                    );
                } else if (ctx.message.document) {
                    await ctx.telegram.sendDocument(
                        user.userId,
                        ctx.message.document.file_id,
                        {
                            caption: ctx.message.caption,
                            parse_mode: 'HTML'
                        }
                    );
                } else if (ctx.message.text) {
                    await ctx.telegram.sendMessage(
                        user.userId,
                        ctx.message.text,
                        { parse_mode: 'HTML' }
                    );
                }
                
                successful++;
            } catch (error) {
                failed++;
            }
        });
        
        // Process in batches
        const batchSize = 30;
        for (let i = 0; i < broadcastPromises.length; i += batchSize) {
            const batch = broadcastPromises.slice(i, i + batchSize);
            await Promise.allSettled(batch);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        await safeSendMessage(ctx,
            `✅ *Broadcast Complete*\n\n📊 *Statistics:*\n• Total: ${totalUsers}\n• ✅ Successful: ${successful}\n• ❌ Failed: ${failed}`,
            { parse_mode: 'HTML' }
        );
        
        // Notify admins about broadcast completion
        await notifyAdmin(`✅ *Broadcast Complete*\n\n📊 Statistics:\n• Total: ${totalUsers}\n• ✅ Successful: ${successful}\n• ❌ Failed: ${failed}\n👤 Admin: ${ctx.from.id}`);
        
    } catch (error) {
        console.error('Broadcast error:', error);
        await safeSendMessage(ctx, '❌ Broadcast failed.');
    }
    
    await ctx.scene.leave();
    await showAdminPanel(ctx);
});

// ==========================================
// ADMIN FEATURES - USER STATS WITH PAGINATION
// ==========================================

bot.action('admin_userstats', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await showUserStatsPage(ctx, 1);
});

async function showUserStatsPage(ctx, page) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const usersPerPage = config?.displaySettings?.usersPerPage || 20;
        
        const skip = (page - 1) * usersPerPage;
        const users = await db.collection('users')
            .find({})
            .sort({ joinedAt: -1 })
            .skip(skip)
            .limit(usersPerPage)
            .toArray();
        
        const totalUsers = await db.collection('users').countDocuments();
        const totalPages = Math.ceil(totalUsers / usersPerPage);
        
        // Count verified users
        const verifiedUsersCount = users.filter(u => u.joinedAll).length;
        
        // Count active today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const activeToday = users.filter(u => u.lastActive && new Date(u.lastActive) >= today).length;
        
        let usersText = `📊 *User Statistics*\n\n`;
        usersText += `• *Total Users:* ${totalUsers}\n`;
        usersText += `• *Verified Users:* ${verifiedUsersCount}\n`;
        usersText += `• *Active Today:* ${activeToday}\n\n`;
        usersText += `👥 *Users (Page ${page}/${totalPages}):*\n\n`;
        
        // Create keyboard with 2 users per row (10 rows total for 20 users)
        const keyboard = [];
        
        // Group users 2 per row
        for (let i = 0; i < users.length; i += 2) {
            const row = [];
            
            // First user in row
            const user1 = users[i];
            const userNum1 = skip + i + 1;
            const user1Name = user1.username ? `@${user1.username}` : user1.firstName || `User ${user1.userId}`;
            row.push({ 
                text: `${userNum1}. ${user1Name.substring(0, 15)}`, 
                callback_data: `user_detail_${user1.userId}` 
            });
            
            // Second user in row if exists
            if (i + 1 < users.length) {
                const user2 = users[i + 1];
                const userNum2 = skip + i + 2;
                const user2Name = user2.username ? `@${user2.username}` : user2.firstName || `User ${user2.userId}`;
                row.push({ 
                    text: `${userNum2}. ${user2Name.substring(0, 15)}`, 
                    callback_data: `user_detail_${user2.userId}` 
                });
            }
            
            keyboard.push(row);
        }
        
        // Navigation buttons
        if (totalPages > 1) {
            const navRow = [];
            if (page > 1) {
                navRow.push({ text: '◀️ Previous', callback_data: `users_page_${page - 1}` });
            }
            navRow.push({ text: `📄 ${page}/${totalPages}`, callback_data: 'no_action' });
            if (page < totalPages) {
                navRow.push({ text: 'Next ▶️', callback_data: `users_page_${page + 1}` });
            }
            keyboard.push(navRow);
        }
        
        // Add search button
        keyboard.push([{ text: '🔍 Search Users', callback_data: 'admin_search_users' }]);
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        if (ctx.callbackQuery) {
            await safeEditMessage(ctx, usersText, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await safeSendMessage(ctx, usersText, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    } catch (error) {
        console.error('User stats error:', error);
        await safeSendMessage(ctx, '❌ Failed to get user statistics.');
    }
}

// User detail view
bot.action(/^user_detail_(\d+)$/, async (ctx) => {
    try {
        const userId = ctx.match[1];
        const user = await db.collection('users').findOne({ userId: Number(userId) });
        
        if (!user) {
            await ctx.answerCbQuery('❌ User not found');
            return;
        }
        
        const username = user.username ? `@${user.username}` : 'No username';
        const firstName = user.firstName || 'No first name';
        const lastName = user.lastName || 'No last name';
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || 'No name';
        const joinedAt = user.joinedAt ? new Date(user.joinedAt).toLocaleString() : 'Unknown';
        const lastActive = user.lastActive ? new Date(user.lastActive).toLocaleString() : 'Never';
        const isVerified = user.joinedAll ? '✅ Verified' : '❌ Not Verified';
        const balance = formatCurrency(user.balance || 0);
        const referrals = await db.collection('users').countDocuments({ referredBy: Number(userId) });
        const wallet = user.wallet || 'Not set';
        const referCode = user.referCode || 'Not set';
        
        let userDetail = `👤 *User Details*\n\n`;
        userDetail += `• *ID:* \`${userId}\`\n`;
        userDetail += `• *Username:* \`${username}\`\n`;
        userDetail += `• *First Name:* \`${firstName}\`\n`;
        userDetail += `• *Last Name:* \`${lastName}\`\n`;
        userDetail += `• *Full Name:* \`${fullName}\`\n`;
        userDetail += `• *Status:* ${isVerified}\n`;
        userDetail += `• *Balance:* ${balance}\n`;
        userDetail += `• *Referrals:* ${referrals}\n`;
        userDetail += `• *Wallet:* \`${wallet}\`\n`;
        userDetail += `• *Refer Code:* \`${referCode}\`\n`;
        userDetail += `• *Joined:* \`${joinedAt}\`\n`;
        userDetail += `• *Last Active:* \`${lastActive}\`\n`;
        
        const keyboard = [
            [{ text: '💬 Send Message', callback_data: `contact_user_${userId}` }],
            [{ text: '💰 Adjust Balance', callback_data: `adjust_balance_${userId}` }],
            [{ text: '📊 Transactions', callback_data: `view_user_transactions_${userId}` }],
            [{ text: '🔙 Back to Users', callback_data: 'admin_userstats' }],
            [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, userDetail, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('User detail error:', error);
        await ctx.answerCbQuery('❌ Error loading user details');
    }
});

// Pagination handlers
bot.action(/^users_page_(\d+)$/, async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    const page = parseInt(ctx.match[1]);
    await showUserStatsPage(ctx, page);
});

// Search Users
bot.action('admin_search_users', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await safeSendMessage(ctx, '🔍 *Search Users*\n\nEnter username, user ID, or name to search:\n\nType "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    await ctx.scene.enter('search_users_scene');
});

// Search Users Scene
scenes.searchUsers.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Search cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const searchTerm = ctx.message.text.trim();
        let users = [];
        
        // Search by different criteria
        if (searchTerm.startsWith('@')) {
            // Search by username
            const username = searchTerm.substring(1);
            users = await db.collection('users').find({
                username: { $regex: username, $options: 'i' }
            }).limit(50).toArray();
        } else if (!isNaN(searchTerm)) {
            // Search by user ID
            users = await db.collection('users').find({
                userId: Number(searchTerm)
            }).limit(50).toArray();
        } else {
            // Search by name
            users = await db.collection('users').find({
                $or: [
                    { firstName: { $regex: searchTerm, $options: 'i' } },
                    { lastName: { $regex: searchTerm, $options: 'i' } }
                ]
            }).limit(50).toArray();
        }
        
        let searchText = `🔍 *Search Results*\n\n`;
        searchText += `Search term: \`${searchTerm}\`\n`;
        searchText += `Found: ${users.length} users\n\n`;
        
        if (users.length === 0) {
            searchText += `No users found.\n`;
        } else {
            searchText += `*Users:*\n\n`;
            
            const keyboard = [];
            
            // Group users 2 per row
            for (let i = 0; i < users.length; i += 2) {
                const row = [];
                
                // First user in row
                const user1 = users[i];
                const user1Name = user1.username ? `@${user1.username}` : user1.firstName || `User ${user1.userId}`;
                row.push({ 
                    text: `${i + 1}. ${user1Name.substring(0, 15)}`, 
                    callback_data: `user_detail_${user1.userId}` 
                });
                
                // Second user in row if exists
                if (i + 1 < users.length) {
                    const user2 = users[i + 1];
                    const user2Name = user2.username ? `@${user2.username}` : user2.firstName || `User ${user2.userId}`;
                    row.push({ 
                        text: `${i + 2}. ${user2Name.substring(0, 15)}`, 
                        callback_data: `user_detail_${user2.userId}` 
                    });
                }
                
                keyboard.push(row);
            }
            
            keyboard.push([{ text: '🔍 New Search', callback_data: 'admin_search_users' }]);
            keyboard.push([{ text: '🔙 Back to Users', callback_data: 'admin_userstats' }]);
            
            await safeSendMessage(ctx, searchText, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
            
            await ctx.scene.leave();
            return;
        }
        
        const keyboard = [
            [{ text: '🔍 New Search', callback_data: 'admin_search_users' }],
            [{ text: '🔙 Back to Users', callback_data: 'admin_userstats' }]
        ];
        
        await safeSendMessage(ctx, searchText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
        await ctx.scene.leave();
        
    } catch (error) {
        console.error('Search users scene error:', error);
        await safeSendMessage(ctx, '❌ Error searching users. Please try again.');
        await ctx.scene.leave();
    }
});

// ==========================================
// ADMIN FEATURES - START MESSAGE
// ==========================================

bot.action('admin_startmessage', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentMessage = config?.startMessage || DEFAULT_CONFIG.startMessage;
        
        const text = `📝 *Start Message Management*\n\nCurrent Message:\n${formatHTMLForDisplay(currentMessage, true)}\n\nAvailable variables: {first_name}, {last_name}, {full_name}, {username}, {name}, {total_users}, {total_paid}, {available_tasks}\n\nSupports HTML formatting\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '✏️ Edit', callback_data: 'admin_edit_startmessage' }, { text: '🔄 Reset', callback_data: 'admin_reset_startmessage' }],
            [{ text: '🔙 Back', callback_data: 'admin_messages_menu' }]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Start message menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action('admin_edit_startmessage', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentMessage = config?.startMessage || DEFAULT_CONFIG.startMessage;
        
        await safeSendMessage(ctx, `Current message:\n${formatHTMLForDisplay(currentMessage, true)}\n\nEnter the new start message:\n\nSupports HTML formatting\n\nType "cancel" to cancel.`, {
            parse_mode: 'HTML'
        });
        await ctx.scene.enter('edit_start_message_scene');
    } catch (error) {
        console.error('Edit start message error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

scenes.editStartMessage.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Edit cancelled.');
            await ctx.scene.leave();
            return;
        }
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { startMessage: ctx.message.text, updatedAt: new Date() } }
        );
        
        await safeSendMessage(ctx, '✅ Start message updated!');
        await ctx.scene.leave();
        
        // Return to admin panel
        const message = await safeSendMessage(ctx, 'Returning to admin panel...');
        setTimeout(async () => {
            try {
                await bot.telegram.deleteMessage(ctx.chat.id, message.message_id);
                await showAdminPanel(ctx);
            } catch (error) {
                console.error('Error returning to admin:', error);
            }
        }, 1000);
        
    } catch (error) {
        console.error('Edit start message error:', error);
        await safeSendMessage(ctx, '✅ Message updated!\n\nUse /admin to return to panel.');
        await ctx.scene.leave();
    }
});

bot.action('admin_reset_startmessage', async (ctx) => {
    try {
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { startMessage: DEFAULT_CONFIG.startMessage, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery('✅ Start message reset to default');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Reset start message error:', error);
        await ctx.answerCbQuery('❌ Failed to reset message');
    }
});

// ==========================================
// ADMIN FEATURES - MENU MESSAGE
// ==========================================

bot.action('admin_menumessage', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentMessage = config?.menuMessage || DEFAULT_CONFIG.menuMessage;
        
        const text = `📝 *Menu Message Management*\n\nCurrent Message:\n${formatHTMLForDisplay(currentMessage, true)}\n\nAvailable variables: {first_name}, {last_name}, {full_name}, {username}, {name}, {balance}, {total_referrals}, {tasks_completed}, {wallet_set}\n\nSupports HTML formatting\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '✏️ Edit', callback_data: 'admin_edit_menumessage' }, { text: '🔄 Reset', callback_data: 'admin_reset_menumessage' }],
            [{ text: '🔙 Back', callback_data: 'admin_messages_menu' }]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Menu message menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action('admin_edit_menumessage', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentMessage = config?.menuMessage || DEFAULT_CONFIG.menuMessage;
        
        await safeSendMessage(ctx, `Current message:\n${formatHTMLForDisplay(currentMessage, true)}\n\nEnter the new menu message:\n\nSupports HTML formatting\n\nType "cancel" to cancel.`, {
            parse_mode: 'HTML'
        });
        await ctx.scene.enter('edit_menu_message_scene');
    } catch (error) {
        console.error('Edit menu message error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

scenes.editMenuMessage.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Edit cancelled.');
            await ctx.scene.leave();
            return;
        }
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { menuMessage: ctx.message.text, updatedAt: new Date() } }
        );
        
        await safeSendMessage(ctx, '✅ Menu message updated!');
        await ctx.scene.leave();
        
        // Return to admin panel
        const message = await safeSendMessage(ctx, 'Returning to admin panel...');
        setTimeout(async () => {
            try {
                await bot.telegram.deleteMessage(ctx.chat.id, message.message_id);
                await showAdminPanel(ctx);
            } catch (error) {
                console.error('Error returning to admin:', error);
            }
        }, 1000);
        
    } catch (error) {
        console.error('Edit menu message error:', error);
        await safeSendMessage(ctx, '✅ Message updated!\n\nUse /admin to return to panel.');
        await ctx.scene.leave();
    }
});

bot.action('admin_reset_menumessage', async (ctx) => {
    try {
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { menuMessage: DEFAULT_CONFIG.menuMessage, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery('✅ Menu message reset to default');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Reset menu message error:', error);
        await ctx.answerCbQuery('❌ Failed to reset message');
    }
});

// ==========================================
// ADMIN FEATURES - START IMAGE
// ==========================================

bot.action('admin_startimage', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentImage = config?.startImage || DEFAULT_CONFIG.startImage;
        const overlaySettings = config?.imageOverlaySettings || { startImage: true };
        const hasOverlay = overlaySettings.startImage;
        
        const text = `🖼️ *Start Image Management*\n\nCurrent Image:\n\`${currentImage}\`\n\nOverlay: ${hasOverlay ? '✅ ON' : '❌ OFF'}\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '✏️ Edit URL', callback_data: 'admin_edit_startimage_url' }, { text: '📤 Upload', callback_data: 'admin_upload_startimage' }],
            [{ text: '🔄 Reset', callback_data: 'admin_reset_startimage' }, { text: '🔙 Back', callback_data: 'admin_images_menu' }]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Start image menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action('admin_edit_startimage_url', async (ctx) => {
    await safeSendMessage(ctx, 'Enter the new image URL:\n\nUse {name} variable for user name overlay (optional)\n\nType "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    await ctx.scene.enter('edit_start_image_scene');
});

scenes.editStartImage.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Edit cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const newUrl = ctx.message.text.trim();
        
        if (!newUrl.startsWith('http')) {
            await safeSendMessage(ctx, '❌ Invalid URL. Must start with http:// or https://');
            return;
        }
        
        // Check if URL is valid image
        const isValid = await isValidImageUrl(newUrl);
        if (!isValid) {
            await safeSendMessage(ctx, '⚠️ The URL does not appear to be a valid image.\n\nDo you still want to use it?', {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Yes, use anyway', callback_data: `confirm_bad_url_start_${encodeURIComponent(newUrl)}` }],
                        [{ text: '❌ No, cancel', callback_data: 'admin_startimage' }]
                    ]
                }
            });
            return;
        }
        
        // Update database
        await db.collection('admin').updateOne(
            { type: 'config' },
            { 
                $set: { 
                    startImage: newUrl, 
                    updatedAt: new Date(),
                    'imageOverlaySettings.startImage': newUrl.includes('{name}')
                } 
            }
        );
        
        await safeSendMessage(ctx, '✅ Start image URL updated!');
        await ctx.scene.leave();
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Edit start image error:', error);
        await safeSendMessage(ctx, '❌ Failed to update image.');
        await ctx.scene.leave();
    }
});

bot.action('admin_upload_startimage', async (ctx) => {
    try {
        ctx.session.uploadingImageType = 'startImage';
        await safeSendMessage(ctx, 'Send the image you want to upload:\n\nType "cancel" to cancel.');
        await ctx.scene.enter('image_overlay_scene');
    } catch (error) {
        console.error('Upload start image error:', error);
        await safeSendMessage(ctx, '❌ Error starting upload.');
    }
});

bot.action('admin_reset_startimage', async (ctx) => {
    try {
        await db.collection('admin').updateOne(
            { type: 'config' },
            { 
                $set: { 
                    startImage: DEFAULT_CONFIG.startImage, 
                    updatedAt: new Date(),
                    'imageOverlaySettings.startImage': true
                } 
            }
        );
        
        await ctx.answerCbQuery('✅ Start image reset to default');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Reset start image error:', error);
        await ctx.answerCbQuery('❌ Failed to reset image');
    }
});

// ==========================================
// ADMIN FEATURES - MENU IMAGE
// ==========================================

bot.action('admin_menuimage', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentImage = config?.menuImage || DEFAULT_CONFIG.menuImage;
        const overlaySettings = config?.imageOverlaySettings || { menuImage: true };
        const hasOverlay = overlaySettings.menuImage;
        
        const text = `🖼️ *Menu Image Management*\n\nCurrent Image:\n\`${currentImage}\`\n\nOverlay: ${hasOverlay ? '✅ ON' : '❌ OFF'}\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '✏️ Edit URL', callback_data: 'admin_edit_menuimage_url' }, { text: '📤 Upload', callback_data: 'admin_upload_menuimage' }],
            [{ text: '🔄 Reset', callback_data: 'admin_reset_menuimage' }, { text: '🔙 Back', callback_data: 'admin_images_menu' }]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Menu image menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action('admin_edit_menuimage_url', async (ctx) => {
    await safeSendMessage(ctx, 'Enter the new image URL:\n\nUse {name} variable for user name overlay (optional)\n\nType "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    await ctx.scene.enter('edit_menu_image_scene');
});

scenes.editMenuImage.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Edit cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const newUrl = ctx.message.text.trim();
        
        if (!newUrl.startsWith('http')) {
            await safeSendMessage(ctx, '❌ Invalid URL. Must start with http:// or https://');
            return;
        }
        
        // Check if URL is valid image
        const isValid = await isValidImageUrl(newUrl);
        if (!isValid) {
            await safeSendMessage(ctx, '⚠️ The URL does not appear to be a valid image.\n\nDo you still want to use it?', {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Yes, use anyway', callback_data: `confirm_bad_url_menu_${encodeURIComponent(newUrl)}` }],
                        [{ text: '❌ No, cancel', callback_data: 'admin_menuimage' }]
                    ]
                }
            });
            return;
        }
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { 
                $set: { 
                    menuImage: newUrl, 
                    updatedAt: new Date(),
                    'imageOverlaySettings.menuImage': newUrl.includes('{name}')
                } 
            }
        );
        
        await safeSendMessage(ctx, '✅ Menu image URL updated!');
        await ctx.scene.leave();
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Edit menu image error:', error);
        await safeSendMessage(ctx, '❌ Failed to update image.');
        await ctx.scene.leave();
    }
});

bot.action('admin_upload_menuimage', async (ctx) => {
    try {
        ctx.session.uploadingImageType = 'menuImage';
        await safeSendMessage(ctx, 'Send the image you want to upload:\n\nType "cancel" to cancel.');
        await ctx.scene.enter('image_overlay_scene');
    } catch (error) {
        console.error('Upload menu image error:', error);
        await safeSendMessage(ctx, '❌ Error starting upload.');
    }
});

bot.action('admin_reset_menuimage', async (ctx) => {
    try {
        await db.collection('admin').updateOne(
            { type: 'config' },
            { 
                $set: { 
                    menuImage: DEFAULT_CONFIG.menuImage, 
                    updatedAt: new Date(),
                    'imageOverlaySettings.menuImage': true
                } 
            }
        );
        
        await ctx.answerCbQuery('✅ Menu image reset to default');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Reset menu image error:', error);
        await ctx.answerCbQuery('❌ Failed to reset image');
    }
});

// ==========================================
// ADMIN FEATURES - BONUS IMAGE
// ==========================================

bot.action('admin_bonusimage', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const bonusSettings = config?.bonusSettings || DEFAULT_CONFIG.bonus;
        const currentImage = bonusSettings.image || DEFAULT_CONFIG.bonus.image;
        const showAmountOverlay = bonusSettings.showAmountOverlay !== false;
        
        const text = `🎁 *Bonus Image Management*\n\nCurrent Image:\n\`${currentImage}\`\n\nShow Amount Overlay: ${showAmountOverlay ? '✅ ON' : '❌ OFF'}\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '✏️ Edit URL', callback_data: 'admin_edit_bonusimage_url' }, { text: '📤 Upload', callback_data: 'admin_upload_bonusimage' }],
            [{ text: '🔄 Reset', callback_data: 'admin_reset_bonusimage' }, { text: '🔙 Back', callback_data: 'admin_bonus_menu' }]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Bonus image menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// ==========================================
// ADMIN FEATURES - IMAGE OVERLAY
// ==========================================

bot.action('admin_image_overlay', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const overlaySettings = config?.imageOverlaySettings || {
            startImage: true,
            menuImage: true,
            bonusImage: true
        };
        
        const text = `⚙️ *Image Overlay Settings*\n\nConfigure whether to show overlay on images:\n\n• Start Image: ${overlaySettings.startImage ? '✅ ON' : '❌ OFF'}\n• Menu Image: ${overlaySettings.menuImage ? '✅ ON' : '❌ OFF'}\n• Bonus Image: ${overlaySettings.bonusImage ? '✅ ON' : '❌ OFF'}\n\nSelect an option:`;
        
        const keyboard = [
            [
                { text: overlaySettings.startImage ? '✅ Start Image' : '❌ Start Image', callback_data: 'toggle_start_overlay' },
                { text: overlaySettings.menuImage ? '✅ Menu Image' : '❌ Menu Image', callback_data: 'toggle_menu_overlay' }
            ],
            [
                { text: overlaySettings.bonusImage ? '✅ Bonus Image' : '❌ Bonus Image', callback_data: 'toggle_bonus_overlay' }
            ],
            [{ text: '🔙 Back', callback_data: 'admin_images_menu' }]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Image overlay menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Toggle overlay settings
bot.action('toggle_start_overlay', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentSettings = config?.imageOverlaySettings || {
            startImage: true,
            menuImage: true,
            bonusImage: true
        };
        
        currentSettings.startImage = !currentSettings.startImage;
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { imageOverlaySettings: currentSettings, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery(`✅ Start image overlay ${currentSettings.startImage ? 'enabled' : 'disabled'}`);
        await bot.action('admin_image_overlay')(ctx);
    } catch (error) {
        console.error('Toggle start overlay error:', error);
        await ctx.answerCbQuery('❌ Failed to update setting');
    }
});

bot.action('toggle_menu_overlay', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentSettings = config?.imageOverlaySettings || {
            startImage: true,
            menuImage: true,
            bonusImage: true
        };
        
        currentSettings.menuImage = !currentSettings.menuImage;
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { imageOverlaySettings: currentSettings, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery(`✅ Menu image overlay ${currentSettings.menuImage ? 'enabled' : 'disabled'}`);
        await bot.action('admin_image_overlay')(ctx);
    } catch (error) {
        console.error('Toggle menu overlay error:', error);
        await ctx.answerCbQuery('❌ Failed to update setting');
    }
});

bot.action('toggle_bonus_overlay', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentSettings = config?.imageOverlaySettings || {
            startImage: true,
            menuImage: true,
            bonusImage: true
        };
        
        currentSettings.bonusImage = !currentSettings.bonusImage;
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { imageOverlaySettings: currentSettings, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery(`✅ Bonus image overlay ${currentSettings.bonusImage ? 'enabled' : 'disabled'}`);
        await bot.action('admin_image_overlay')(ctx);
    } catch (error) {
        console.error('Toggle bonus overlay error:', error);
        await ctx.answerCbQuery('❌ Failed to update setting');
    }
});

// ==========================================
// ADMIN FEATURES - MANAGE IMAGES
// ==========================================

bot.action('admin_manage_images', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const images = config?.uploadedImages || [];
        
        let text = `🖼️ *Manage Uploaded Images*\n\n`;
        
        if (images.length === 0) {
            text += `No images uploaded yet.\n`;
        } else {
            text += `Total uploaded images: ${images.length}\n`;
            text += `\nImages not currently in use can be deleted\n`;
        }
        
        const keyboard = [];
        
        if (images.length > 0) {
            keyboard.push([{ text: '🗑️ Delete Unused Images', callback_data: 'delete_unused_images' }]);
            keyboard.push([{ text: '📋 List All Images', callback_data: 'list_all_images' }]);
        }
        
        keyboard.push([{ text: '🔙 Back', callback_data: 'admin_images_menu' }]);
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Manage images menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// ==========================================
// ADMIN FEATURES - CREATE GIFT CODE
// ==========================================

bot.action('admin_create_giftcode', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await safeSendMessage(ctx, '🎫 *Create Gift Code*\n\nEnter maximum number of uses (or 0 for unlimited):\n\nType "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    await ctx.scene.enter('create_gift_code_scene');
});

// Create Gift Code Scene
scenes.createGiftCode.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Gift code creation cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const maxUses = parseInt(ctx.message.text);
        if (isNaN(maxUses) || maxUses < 0) {
            await safeSendMessage(ctx, '❌ Please enter a valid number (0 for unlimited).\n\nType "cancel" to cancel.');
            return;
        }
        
        ctx.session.giftCodeData = {
            maxUses: maxUses,
            step: 'expiry'
        };
        
        await safeSendMessage(ctx, 'Enter expiry time in minutes (or 0 for no expiry):\n\nType "cancel" to cancel.');
        
    } catch (error) {
        console.error('Create gift code scene error:', error);
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.');
        await ctx.scene.leave();
    }
});

// Continue gift code creation in the same scene
scenes.createGiftCode.on('text', async (ctx) => {
    try {
        if (!ctx.session.giftCodeData) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            return;
        }
        
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Gift code creation cancelled.');
            delete ctx.session.giftCodeData;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const step = ctx.session.giftCodeData.step;
        
        if (step === 'expiry') {
            const expiryMinutes = parseInt(ctx.message.text);
            if (isNaN(expiryMinutes) || expiryMinutes < 0) {
                await safeSendMessage(ctx, '❌ Please enter a valid number (0 for no expiry).\n\nType "cancel" to cancel.');
                return;
            }
            
            ctx.session.giftCodeData.expiryMinutes = expiryMinutes;
            ctx.session.giftCodeData.step = 'length';
            
            await safeSendMessage(ctx, 'Enter code length (8-20 characters):\n\nType "cancel" to cancel.');
            
        } else if (step === 'length') {
            const length = parseInt(ctx.message.text);
            if (isNaN(length) || length < 8 || length > 20) {
                await safeSendMessage(ctx, '❌ Please enter a valid length between 8 and 20.\n\nType "cancel" to cancel.');
                return;
            }
            
            ctx.session.giftCodeData.length = length;
            ctx.session.giftCodeData.step = 'minAmount';
            
            await safeSendMessage(ctx, 'Enter minimum amount (e.g., 10):\n\nType "cancel" to cancel.');
            
        } else if (step === 'minAmount') {
            const minAmount = parseFloat(ctx.message.text);
            if (isNaN(minAmount) || minAmount < 1) {
                await safeSendMessage(ctx, '❌ Please enter a valid minimum amount.\n\nType "cancel" to cancel.');
                return;
            }
            
            ctx.session.giftCodeData.minAmount = minAmount;
            ctx.session.giftCodeData.step = 'maxAmount';
            
            await safeSendMessage(ctx, 'Enter maximum amount (must be greater than minimum):\n\nType "cancel" to cancel.');
            
        } else if (step === 'maxAmount') {
            const maxAmount = parseFloat(ctx.message.text);
            const minAmount = ctx.session.giftCodeData.minAmount;
            
            if (isNaN(maxAmount) || maxAmount < minAmount) {
                await safeSendMessage(ctx, `❌ Please enter a valid maximum amount (greater than ${minAmount}).\n\nType "cancel" to cancel.`);
                return;
            }
            
            ctx.session.giftCodeData.maxAmount = maxAmount;
            
            // Generate gift code
            const code = generateCode('', ctx.session.giftCodeData.length || 8);
            const giftCodeData = ctx.session.giftCodeData;
            
            // Create gift code document
            const giftCode = {
                code: code,
                maxUses: giftCodeData.maxUses,
                usedCount: 0,
                minAmount: giftCodeData.minAmount,
                maxAmount: giftCodeData.maxAmount,
                isActive: true,
                createdBy: ctx.from.id,
                createdAt: new Date(),
                expiresAt: giftCodeData.expiryMinutes > 0 ? 
                    new Date(Date.now() + giftCodeData.expiryMinutes * 60000) : null,
                usedBy: []
            };
            
            await db.collection('giftcodes').insertOne(giftCode);
            
            // Prepare success message
            let successText = `✅ *Gift Code Created Successfully!*\n\n`;
            successText += `🎫 *Code:* \`${code}\`\n`;
            successText += `💰 *Amount Range:* ${formatCurrency(giftCodeData.minAmount)} - ${formatCurrency(giftCodeData.maxAmount)}\n`;
            successText += `👥 *Max Uses:* ${giftCodeData.maxUses === 0 ? 'Unlimited' : giftCodeData.maxUses}\n`;
            
            if (giftCodeData.expiryMinutes > 0) {
                const expiryDate = new Date(giftCode.expiresAt).toLocaleString();
                successText += `⏰ *Expires:* ${expiryDate}\n`;
            } else {
                successText += `⏰ *Expires:* Never\n`;
            }
            
            successText += `📅 *Created:* ${new Date().toLocaleString()}\n\n`;
            successText += `*Share this code with users to redeem!*`;
            
            const keyboard = [
                [{ text: '📋 Copy Code', callback_data: `copy_gift_code_${code}` }],
                [{ text: '🎫 Create Another', callback_data: 'admin_create_giftcode' }],
                [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
            ];
            
            await safeSendMessage(ctx, successText, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
            
            // Clear session
            delete ctx.session.giftCodeData;
            await ctx.scene.leave();
            
        }
        
    } catch (error) {
        console.error('Create gift code scene error:', error);
        await safeSendMessage(ctx, '❌ Error creating gift code. Please try again.');
        delete ctx.session.giftCodeData;
        await ctx.scene.leave();
    }
});

// Copy Gift Code
bot.action(/^copy_gift_code_(.+)$/, async (ctx) => {
    try {
        const code = ctx.match[1];
        await ctx.answerCbQuery(`Gift code copied: ${code}`);
    } catch (error) {
        console.error('Copy gift code error:', error);
    }
});

// ==========================================
// ADMIN FEATURES - MANAGE GIFT CODES
// ==========================================

bot.action('admin_manage_giftcodes', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const page = ctx.session?.giftCodesPage || 1;
        const limit = 10;
        
        const totalCodes = await db.collection('giftcodes').countDocuments();
        const totalPages = Math.ceil(totalCodes / limit);
        const skip = (page - 1) * limit;
        
        const giftCodes = await db.collection('giftcodes')
            .find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        let codesText = `🎫 *Manage Gift Codes*\n\n`;
        codesText += `Page ${page} of ${totalPages}\n`;
        codesText += `Total Codes: ${totalCodes}\n\n`;
        
        if (giftCodes.length === 0) {
            codesText += `No gift codes found.\n`;
        } else {
            codesText += `*Gift Codes:*\n\n`;
            
            for (let i = 0; i < giftCodes.length; i++) {
                const code = giftCodes[i];
                const index = skip + i + 1;
                const status = code.isActive ? '✅ Active' : '❌ Inactive';
                const uses = code.maxUses === 0 ? 'Unlimited' : `${code.usedCount}/${code.maxUses}`;
                const amount = code.minAmount === code.maxAmount ? 
                    formatCurrency(code.minAmount) : 
                    `${formatCurrency(code.minAmount)}-${formatCurrency(code.maxAmount)}`;
                
                codesText += `${index}. *${code.code}*\n`;
                codesText += `   Amount: ${amount}\n`;
                codesText += `   Uses: ${uses}\n`;
                codesText += `   Status: ${status}\n`;
                
                if (code.expiresAt) {
                    const expiryDate = new Date(code.expiresAt).toLocaleDateString();
                    const isExpired = new Date(code.expiresAt) < new Date();
                    codesText += `   Expires: ${expiryDate} ${isExpired ? '(Expired)' : ''}\n`;
                }
                codesText += `\n`;
            }
        }
        
        const keyboard = [];
        
        // Code buttons
        for (let i = 0; i < giftCodes.length; i += 2) {
            const row = [];
            for (let j = 0; j < 2 && (i + j) < giftCodes.length; j++) {
                const code = giftCodes[i + j];
                row.push({ 
                    text: `${skip + i + j + 1}. ${code.code}`, 
                    callback_data: `edit_giftcode_${code.code}` 
                });
            }
            if (row.length > 0) keyboard.push(row);
        }
        
        // Navigation buttons
        if (totalPages > 1) {
            const navRow = [];
            if (page > 1) {
                navRow.push({ text: '◀️ Previous', callback_data: `giftcodes_page_${page - 1}` });
            }
            navRow.push({ text: `📄 ${page}/${totalPages}`, callback_data: 'no_action' });
            if (page < totalPages) {
                navRow.push({ text: 'Next ▶️', callback_data: `giftcodes_page_${page + 1}` });
            }
            keyboard.push(navRow);
        }
        
        keyboard.push(
            [{ text: '➕ Create New Code', callback_data: 'admin_create_giftcode' }],
            [{ text: '🔙 Back', callback_data: 'admin_giftcodes_menu' }]
        );
        
        await safeEditMessage(ctx, codesText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Manage gift codes error:', error);
        await ctx.answerCbQuery('❌ Error loading gift codes');
    }
});

// Edit Gift Code
bot.action(/^edit_giftcode_(.+)$/, async (ctx) => {
    try {
        const code = ctx.match[1];
        const giftCode = await db.collection('giftcodes').findOne({ code: code });
        
        if (!giftCode) {
            await ctx.answerCbQuery('❌ Gift code not found');
            return;
        }
        
        let codeText = `🎫 *Edit Gift Code*\n\n`;
        codeText += `*Code:* \`${giftCode.code}\`\n`;
        codeText += `*Min Amount:* ${formatCurrency(giftCode.minAmount)}\n`;
        codeText += `*Max Amount:* ${formatCurrency(giftCode.maxAmount)}\n`;
        codeText += `*Used:* ${giftCode.usedCount}/${giftCode.maxUses === 0 ? '∞' : giftCode.maxUses}\n`;
        codeText += `*Status:* ${giftCode.isActive ? '✅ Active' : '❌ Inactive'}\n`;
        codeText += `*Created:* ${new Date(giftCode.createdAt).toLocaleString()}\n`;
        
        if (giftCode.expiresAt) {
            const expiryDate = new Date(giftCode.expiresAt).toLocaleString();
            const isExpired = new Date(giftCode.expiresAt) < new Date();
            codeText += `*Expires:* ${expiryDate} ${isExpired ? '(Expired)' : ''}\n`;
        }
        
        const keyboard = [
            [
                { text: giftCode.isActive ? '❌ Deactivate' : '✅ Activate', callback_data: `toggle_giftcode_${code}` },
                { text: '✏️ Edit Amount', callback_data: `edit_giftcode_amount_${code}` }
            ],
            [
                { text: '⏰ Edit Expiry', callback_data: `edit_giftcode_expiry_${code}` },
                { text: '👥 Edit Uses', callback_data: `edit_giftcode_uses_${code}` }
            ],
            [
                { text: '🗑️ Delete Code', callback_data: `delete_giftcode_${code}` }
            ],
            [
                { text: '🔙 Back', callback_data: 'admin_manage_giftcodes' }
            ]
        ];
        
        await safeEditMessage(ctx, codeText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Edit gift code error:', error);
        await ctx.answerCbQuery('❌ Error loading gift code');
    }
});

// ==========================================
// ADMIN FEATURES - BONUS SETTINGS
// ==========================================

bot.action('admin_bonus_settings', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const bonusSettings = config?.bonusSettings || DEFAULT_CONFIG.bonus;
        
        const text = `🎁 *Bonus Settings*\n\n`;
        text += `*Status:* ${bonusSettings.enabled ? '✅ Enabled' : '❌ Disabled'}\n`;
        text += `*Amount:* ${formatCurrency(bonusSettings.amount || 25)}\n`;
        text += `*Show Amount Overlay:* ${bonusSettings.showAmountOverlay ? '✅ Yes' : '❌ No'}\n\n`;
        text += `Select an option:`;
        
        const keyboard = [
            [
                { text: bonusSettings.enabled ? '❌ Disable Bonus' : '✅ Enable Bonus', callback_data: 'toggle_bonus_status' },
                { text: '✏️ Edit Amount', callback_data: 'edit_bonus_amount' }
            ],
            [
                { text: bonusSettings.showAmountOverlay ? '❌ Hide Amount' : '✅ Show Amount', callback_data: 'toggle_bonus_overlay_display' }
            ],
            [
                { text: '🔙 Back', callback_data: 'admin_bonus_menu' }
            ]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Bonus settings error:', error);
        await ctx.answerCbQuery('❌ Error loading bonus settings');
    }
});

// ==========================================
// ADMIN FEATURES - REFERRAL SETTINGS
// ==========================================

bot.action('admin_referral_settings', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const referralSettings = config?.referralSettings || DEFAULT_CONFIG.referral;
        
        const text = `📤 *Referral Settings*\n\n`;
        text += `*Status:* ${referralSettings.enabled ? '✅ Enabled' : '❌ Disabled'}\n`;
        text += `*Refer Bonus:* ${formatCurrency(referralSettings.referBonus || 50)}\n`;
        text += `*Min Refer Amount:* ${formatCurrency(referralSettings.minReferAmount || 10)}\n`;
        text += `*Max Refer Amount:* ${formatCurrency(referralSettings.maxReferAmount || 100)}\n`;
        text += `*Min Withdraw Referrals:* ${referralSettings.minWithdrawRefer || 2}\n\n`;
        text += `Select an option:`;
        
        const keyboard = [
            [
                { text: referralSettings.enabled ? '❌ Disable' : '✅ Enable', callback_data: 'toggle_referral_status' },
                { text: '✏️ Edit Bonus', callback_data: 'edit_referral_bonus' }
            ],
            [
                { text: '📈 Edit Limits', callback_data: 'edit_referral_limits' }
            ],
            [
                { text: '🔙 Back', callback_data: 'admin_referral_menu' }
            ]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Referral settings error:', error);
        await ctx.answerCbQuery('❌ Error loading referral settings');
    }
});

// ==========================================
// ADMIN FEATURES - WITHDRAWAL SETTINGS
// ==========================================

bot.action('admin_withdrawal_settings', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const withdrawalSettings = config?.withdrawalSettings || DEFAULT_CONFIG.withdrawal;
        
        const text = `💳 *Withdrawal Settings*\n\n`;
        text += `*Status:* ${withdrawalSettings.enabled ? '✅ Enabled' : '❌ Disabled'}\n`;
        text += `*Min Amount:* ${formatCurrency(withdrawalSettings.minAmount || 100)}\n`;
        text += `*Max Amount:* ${formatCurrency(withdrawalSettings.maxAmount || 5000)}\n`;
        text += `*Daily Limit:* ${formatCurrency(withdrawalSettings.dailyLimit || 2000)}\n`;
        text += `*Processing Fee:* ${withdrawalSettings.processingFee || 2}%\n\n`;
        text += `Select an option:`;
        
        const keyboard = [
            [
                { text: withdrawalSettings.enabled ? '❌ Disable' : '✅ Enable', callback_data: 'toggle_withdrawal_status' },
                { text: '✏️ Edit Limits', callback_data: 'edit_withdrawal_limits' }
            ],
            [
                { text: '💰 Edit Fee', callback_data: 'edit_withdrawal_fee' }
            ],
            [
                { text: '🔙 Back', callback_data: 'admin_withdrawal_menu' }
            ]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Withdrawal settings error:', error);
        await ctx.answerCbQuery('❌ Error loading withdrawal settings');
    }
});

// ==========================================
// ADMIN FEATURES - WITHDRAWAL REQUESTS
// ==========================================

bot.action('admin_withdrawal_requests', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const page = ctx.session?.withdrawalRequestsPage || 1;
        const limit = 15;
        
        const totalRequests = await db.collection('withdrawals').countDocuments({ status: 'pending' });
        const totalPages = Math.ceil(totalRequests / limit);
        const skip = (page - 1) * limit;
        
        const requests = await db.collection('withdrawals')
            .find({ status: 'pending' })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        let requestsText = `💳 *Withdrawal Requests*\n\n`;
        requestsText += `Page ${page} of ${totalPages}\n`;
        requestsText += `Pending Requests: ${totalRequests}\n\n`;
        
        if (requests.length === 0) {
            requestsText += `No pending withdrawal requests.\n`;
        } else {
            requestsText += `*Pending Requests:*\n\n`;
            
            for (let i = 0; i < requests.length; i++) {
                const request = requests[i];
                const index = skip + i + 1;
                const userInfo = request.userInfo || {};
                const userName = userInfo.username ? `@${userInfo.username}` : 
                                userInfo.firstName || `User ${request.userId}`;
                
                requestsText += `${index}. *${request.requestId}*\n`;
                requestsText += `   User: ${userName}\n`;
                requestsText += `   Amount: ${formatCurrency(request.amount)}\n`;
                requestsText += `   Net: ${formatCurrency(request.netAmount)}\n`;
                requestsText += `   Wallet: \`${request.wallet}\`\n`;
                requestsText += `   Date: ${new Date(request.createdAt).toLocaleString()}\n\n`;
            }
        }
        
        const keyboard = [];
        
        // Request buttons
        for (let i = 0; i < requests.length; i++) {
            const request = requests[i];
            keyboard.push([{ 
                text: `${skip + i + 1}. Process ${request.requestId} - ${formatCurrency(request.amount)}`, 
                callback_data: `process_withdrawal_${request.requestId}` 
            }]);
        }
        
        // Navigation buttons
        if (totalPages > 1) {
            const navRow = [];
            if (page > 1) {
                navRow.push({ text: '◀️ Previous', callback_data: `withdrawal_requests_page_${page - 1}` });
            }
            navRow.push({ text: `📄 ${page}/${totalPages}`, callback_data: 'no_action' });
            if (page < totalPages) {
                navRow.push({ text: 'Next ▶️', callback_data: `withdrawal_requests_page_${page + 1}` });
            }
            keyboard.push(navRow);
        }
        
        keyboard.push(
            [{ text: '🔍 Search Withdrawals', callback_data: 'admin_search_withdrawals' }],
            [{ text: '🔙 Back', callback_data: 'admin_withdrawal_menu' }]
        );
        
        await safeEditMessage(ctx, requestsText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Withdrawal requests error:', error);
        await ctx.answerCbQuery('❌ Error loading withdrawal requests');
    }
});

// Process Withdrawal
bot.action(/^process_withdrawal_(.+)$/, async (ctx) => {
    try {
        const requestId = ctx.match[1];
        const request = await db.collection('withdrawals').findOne({ requestId: requestId });
        
        if (!request) {
            await ctx.answerCbQuery('❌ Withdrawal request not found');
            return;
        }
        
        const user = await db.collection('users').findOne({ userId: request.userId });
        const userInfo = request.userInfo || {};
        const userName = userInfo.username ? `@${userInfo.username}` : 
                        userInfo.firstName || `User ${request.userId}`;
        
        let requestText = `💳 *Process Withdrawal*\n\n`;
        requestText += `*Request ID:* \`${request.requestId}\`\n`;
        requestText += `*User:* ${userName}\n`;
        requestText += `*User ID:* \`${request.userId}\`\n`;
        requestText += `*Amount:* ${formatCurrency(request.amount)}\n`;
        requestText += `*Fee:* ${formatCurrency(request.fee)} (${request.fee/request.amount*100}%)\n`;
        requestText += `*Net Amount:* ${formatCurrency(request.netAmount)}\n`;
        requestText += `*Wallet:* \`${request.wallet}\`\n`;
        requestText += `*Requested:* ${new Date(request.createdAt).toLocaleString()}\n`;
        requestText += `*User Balance:* ${formatCurrency(user?.balance || 0)}\n\n`;
        requestText += `Select an action:`;
        
        const keyboard = [
            [
                { text: '✅ Approve', callback_data: `approve_withdrawal_${requestId}` },
                { text: '❌ Reject', callback_data: `reject_withdrawal_${requestId}` }
            ],
            [
                { text: '🔙 Back', callback_data: 'admin_withdrawal_requests' }
            ]
        ];
        
        await safeEditMessage(ctx, requestText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Process withdrawal error:', error);
        await ctx.answerCbQuery('❌ Error loading withdrawal details');
    }
});

// Approve Withdrawal
bot.action(/^approve_withdrawal_(.+)$/, async (ctx) => {
    try {
        const requestId = ctx.match[1];
        const request = await db.collection('withdrawals').findOne({ requestId: requestId });
        
        if (!request) {
            await ctx.answerCbQuery('❌ Withdrawal request not found');
            return;
        }
        
        // Generate UTR
        const utr = 'UTR' + Date.now() + Math.random().toString(36).substr(2, 10).toUpperCase();
        
        // Update withdrawal request
        await db.collection('withdrawals').updateOne(
            { requestId: requestId },
            { 
                $set: { 
                    status: 'approved',
                    utr: utr,
                    processedAt: new Date(),
                    processedBy: ctx.from.id
                }
            }
        );
        
        // Update statistics
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $inc: { 'statistics.totalWithdrawn': request.netAmount } }
        );
        
        // Add transaction record
        await addTransaction(request.userId, 'withdrawal_approved', -request.amount, `Withdrawal approved #${requestId}, UTR: ${utr}`);
        
        await ctx.answerCbQuery('✅ Withdrawal approved');
        
        // Notify user
        try {
            await bot.telegram.sendMessage(
                request.userId,
                `✅ *Withdrawal Approved!*\n\n` +
                `*Request ID:* \`${request.requestId}\`\n` +
                `*Amount:* ${formatCurrency(request.amount)}\n` +
                `*Net Amount:* ${formatCurrency(request.netAmount)}\n` +
                `*UTR:* \`${utr}\`\n` +
                `*Status:* ✅ Approved\n` +
                `*Processed:* ${new Date().toLocaleString()}\n\n` +
                `Payment has been processed to your wallet.\n` +
                `Please check your account.`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('Failed to notify user:', error);
        }
        
        // Show success message
        const successText = `✅ *Withdrawal Approved Successfully!*\n\n`;
        successText += `*Request ID:* \`${request.requestId}\`\n`;
        successText += `*UTR:* \`${utr}\`\n`;
        successText += `*Amount:* ${formatCurrency(request.netAmount)} sent to user\n`;
        successText += `*Processed by:* ${ctx.from.id}\n`;
        successText += `*Time:* ${new Date().toLocaleString()}\n\n`;
        successText += `User has been notified.`;
        
        const keyboard = [
            [{ text: '📋 More Requests', callback_data: 'admin_withdrawal_requests' }],
            [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, successText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Approve withdrawal error:', error);
        await ctx.answerCbQuery('❌ Error approving withdrawal');
    }
});

// Reject Withdrawal
bot.action(/^reject_withdrawal_(.+)$/, async (ctx) => {
    try {
        const requestId = ctx.match[1];
        
        // Store request ID in session for rejection message
        ctx.session.rejectingWithdrawal = requestId;
        
        await safeSendMessage(ctx, 'Enter rejection reason for the user:\n\nType "cancel" to cancel.', {
            parse_mode: 'HTML'
        });
        
    } catch (error) {
        console.error('Reject withdrawal error:', error);
        await ctx.answerCbQuery('❌ Error rejecting withdrawal');
    }
});

// Handle withdrawal rejection message
bot.on('text', async (ctx) => {
    try {
        if (ctx.session?.rejectingWithdrawal && !ctx.message.text?.startsWith('/')) {
            const requestId = ctx.session.rejectingWithdrawal;
            
            if (ctx.message.text.toLowerCase() === 'cancel') {
                await safeSendMessage(ctx, '❌ Rejection cancelled.');
                delete ctx.session.rejectingWithdrawal;
                return;
            }
            
            const request = await db.collection('withdrawals').findOne({ requestId: requestId });
            
            if (!request) {
                await safeSendMessage(ctx, '❌ Withdrawal request not found.');
                delete ctx.session.rejectingWithdrawal;
                return;
            }
            
            const rejectionReason = ctx.message.text;
            
            // Update withdrawal request
            await db.collection('withdrawals').updateOne(
                { requestId: requestId },
                { 
                    $set: { 
                        status: 'rejected',
                        adminMessage: rejectionReason,
                        processedAt: new Date(),
                        processedBy: ctx.from.id
                    }
                }
            );
            
            // Refund amount to user
            await updateUserBalance(request.userId, request.amount, 'add');
            
            // Add transaction record
            await addTransaction(request.userId, 'withdrawal_refund', request.amount, `Withdrawal rejected #${requestId}, Reason: ${rejectionReason}`);
            
            delete ctx.session.rejectingWithdrawal;
            
            // Notify user
            try {
                await bot.telegram.sendMessage(
                    request.userId,
                    `❌ *Withdrawal Rejected*\n\n` +
                    `*Request ID:* \`${request.requestId}\`\n` +
                    `*Amount:* ${formatCurrency(request.amount)}\n` +
                    `*Status:* ❌ Rejected\n` +
                    `*Reason:* ${rejectionReason}\n` +
                    `*Processed:* ${new Date().toLocaleString()}\n\n` +
                    `Amount has been refunded to your balance.`,
                    { parse_mode: 'HTML' }
                );
            } catch (error) {
                console.error('Failed to notify user:', error);
            }
            
            // Show success message
            const successText = `❌ *Withdrawal Rejected Successfully!*\n\n`;
            successText += `*Request ID:* \`${request.requestId}\`\n`;
            successText += `*Reason:* ${rejectionReason}\n`;
            successText += `*Amount Refunded:* ${formatCurrency(request.amount)}\n`;
            successText += `*Processed by:* ${ctx.from.id}\n`;
            successText += `*Time:* ${new Date().toLocaleString()}\n\n`;
            successText += `User has been notified and amount refunded.`;
            
            const keyboard = [
                [{ text: '📋 More Requests', callback_data: 'admin_withdrawal_requests' }],
                [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
            ];
            
            await safeSendMessage(ctx, successText, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    } catch (error) {
        console.error('Handle withdrawal rejection error:', error);
        await safeSendMessage(ctx, '❌ Error processing rejection.');
    }
});

// ==========================================
// ADMIN FEATURES - ADD TASK
// ==========================================

bot.action('admin_add_task', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await safeSendMessage(ctx, '📋 *Add New Task*\n\nSend task images (maximum 3):\n\nType "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    
    ctx.session.addingTask = {
        step: 'images',
        images: [],
        screenshotLabels: []
    };
    
    await ctx.scene.enter('add_task_scene');
});

// Add Task Scene
scenes.addTask.on(['photo', 'text'], async (ctx) => {
    try {
        if (!ctx.session.addingTask) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            return;
        }
        
        const step = ctx.session.addingTask.step;
        
        if (ctx.message.text?.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Task creation cancelled.');
            delete ctx.session.addingTask;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        if (step === 'images') {
            if (ctx.message.photo) {
                const photo = ctx.message.photo[ctx.message.photo.length - 1];
                const fileLink = await ctx.telegram.getFileLink(photo.file_id);
                
                ctx.session.addingTask.images.push(fileLink.href);
                
                if (ctx.session.addingTask.images.length >= 3) {
                    ctx.session.addingTask.step = 'message';
                    await safeSendMessage(ctx, `✅ ${ctx.session.addingTask.images.length} images received.\n\nNow send the task description/message:\n\nType "cancel" to cancel.`);
                } else {
                    await safeSendMessage(ctx, `✅ Image ${ctx.session.addingTask.images.length} received. Send more images or type "done" to proceed.`);
                }
            } else if (ctx.message.text?.toLowerCase() === 'done' || ctx.session.addingTask.images.length > 0) {
                if (ctx.session.addingTask.images.length === 0) {
                    await safeSendMessage(ctx, '❌ Please send at least one image.\n\nType "cancel" to cancel.');
                    return;
                }
                ctx.session.addingTask.step = 'message';
                await safeSendMessage(ctx, `✅ ${ctx.session.addingTask.images.length} images received.\n\nNow send the task description/message:\n\nType "cancel" to cancel.`);
            } else {
                await safeSendMessage(ctx, '❌ Please send images first.\n\nType "cancel" to cancel.');
            }
            
        } else if (step === 'message') {
            if (!ctx.message.text) {
                await safeSendMessage(ctx, '❌ Please send task description as text.\n\nType "cancel" to cancel.');
                return;
            }
            
            ctx.session.addingTask.description = ctx.message.text;
            ctx.session.addingTask.step = 'screenshotCount';
            
            await safeSendMessage(ctx, 'How many screenshots are required for this task? (1-5):\n\nType "cancel" to cancel.');
            
        } else if (step === 'screenshotCount') {
            const screenshotCount = parseInt(ctx.message.text);
            if (isNaN(screenshotCount) || screenshotCount < 1 || screenshotCount > 5) {
                await safeSendMessage(ctx, '❌ Please enter a number between 1 and 5.\n\nType "cancel" to cancel.');
                return;
            }
            
            ctx.session.addingTask.screenshotCount = screenshotCount;
            ctx.session.addingTask.currentScreenshot = 1;
            ctx.session.addingTask.step = 'screenshotLabels';
            
            await safeSendMessage(ctx, `Enter name/label for screenshot 1/${screenshotCount}:\n\nExample: "Proof of completion", "Payment screenshot", etc.\n\nType "cancel" to cancel.`);
            
        } else if (step === 'screenshotLabels') {
            const currentScreenshot = ctx.session.addingTask.currentScreenshot;
            const screenshotCount = ctx.session.addingTask.screenshotCount;
            
            ctx.session.addingTask.screenshotLabels.push(ctx.message.text);
            
            if (currentScreenshot >= screenshotCount) {
                ctx.session.addingTask.step = 'bonusAmount';
                await safeSendMessage(ctx, 'Enter bonus amount for this task:\n\nType "cancel" to cancel.');
            } else {
                ctx.session.addingTask.currentScreenshot++;
                await safeSendMessage(ctx, `Enter name/label for screenshot ${ctx.session.addingTask.currentScreenshot}/${screenshotCount}:\n\nType "cancel" to cancel.`);
            }
            
        } else if (step === 'bonusAmount') {
            const bonusAmount = parseFloat(ctx.message.text);
            if (isNaN(bonusAmount) || bonusAmount < 1) {
                await safeSendMessage(ctx, '❌ Please enter a valid bonus amount.\n\nType "cancel" to cancel.');
                return;
            }
            
            ctx.session.addingTask.bonusAmount = bonusAmount;
            ctx.session.addingTask.step = 'title';
            
            await safeSendMessage(ctx, 'Enter task title:\n\nType "cancel" to cancel.');
            
        } else if (step === 'title') {
            if (!ctx.message.text || ctx.message.text.length < 3) {
                await safeSendMessage(ctx, '❌ Please enter a valid task title (min 3 characters).\n\nType "cancel" to cancel.');
                return;
            }
            
            ctx.session.addingTask.title = ctx.message.text;
            
            // Create task
            const taskId = 'TASK' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase();
            const taskData = ctx.session.addingTask;
            
            const task = {
                taskId: taskId,
                title: taskData.title,
                description: taskData.description,
                images: taskData.images,
                screenshotCount: taskData.screenshotCount,
                screenshotLabels: taskData.screenshotLabels,
                bonusAmount: taskData.bonusAmount,
                isActive: true,
                createdAt: new Date(),
                createdBy: ctx.from.id
            };
            
            await db.collection('tasks').insertOne(task);
            
            // Update statistics
            await db.collection('admin').updateOne(
                { type: 'config' },
                { $inc: { 'statistics.totalTasks': 1 } }
            );
            
            // Clear session
            delete ctx.session.addingTask;
            
            // Prepare success message
            let successText = `✅ *Task Created Successfully!*\n\n`;
            successText += `*Task ID:* \`${taskId}\`\n`;
            successText += `*Title:* ${task.title}\n`;
            successText += `*Bonus:* ${formatCurrency(task.bonusAmount)}\n`;
            successText += `*Screenshots:* ${task.screenshotCount}\n`;
            successText += `*Status:* ✅ Active\n`;
            successText += `*Created:* ${new Date().toLocaleString()}\n\n`;
            successText += `Task is now available for users to complete.`;
            
            const keyboard = [
                [{ text: '📋 View Task', callback_data: `view_admin_task_${taskId}` }],
                [{ text: '➕ Add Another Task', callback_data: 'admin_add_task' }],
                [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
            ];
            
            await safeSendMessage(ctx, successText, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
            
            await ctx.scene.leave();
        }
        
    } catch (error) {
        console.error('Add task scene error:', error);
        await safeSendMessage(ctx, '❌ Error creating task. Please try again.');
        delete ctx.session.addingTask;
        await ctx.scene.leave();
    }
});

// ==========================================
// ADMIN FEATURES - MANAGE TASKS
// ==========================================

bot.action('admin_manage_tasks', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const page = ctx.session?.manageTasksPage || 1;
        const limit = 10;
        
        const totalTasks = await db.collection('tasks').countDocuments();
        const totalPages = Math.ceil(totalTasks / limit);
        const skip = (page - 1) * limit;
        
        const tasks = await db.collection('tasks')
            .find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        let tasksText = `📋 *Manage Tasks*\n\n`;
        tasksText += `Page ${page} of ${totalPages}\n`;
        tasksText += `Total Tasks: ${totalTasks}\n\n`;
        
        if (tasks.length === 0) {
            tasksText += `No tasks found.\n`;
        } else {
            tasksText += `*Tasks:*\n\n`;
            
            for (let i = 0; i < tasks.length; i++) {
                const task = tasks[i];
                const index = skip + i + 1;
                const status = task.isActive ? '✅ Active' : '❌ Inactive';
                const submissions = await db.collection('tasksubmissions').countDocuments({ taskId: task.taskId });
                const approved = await db.collection('tasksubmissions').countDocuments({ 
                    taskId: task.taskId, 
                    status: 'approved' 
                });
                
                tasksText += `${index}. *${task.title}*\n`;
                tasksText += `   ID: \`${task.taskId}\`\n`;
                tasksText += `   Bonus: ${formatCurrency(task.bonusAmount)}\n`;
                tasksText += `   Status: ${status}\n`;
                tasksText += `   Submissions: ${submissions} (${approved} approved)\n\n`;
            }
        }
        
        const keyboard = [];
        
        // Task buttons
        for (let i = 0; i < tasks.length; i += 2) {
            const row = [];
            for (let j = 0; j < 2 && (i + j) < tasks.length; j++) {
                const task = tasks[i + j];
                row.push({ 
                    text: `${skip + i + j + 1}. ${task.title.substring(0, 15)}...`, 
                    callback_data: `manage_task_${task.taskId}` 
                });
            }
            if (row.length > 0) keyboard.push(row);
        }
        
        // Navigation buttons
        if (totalPages > 1) {
            const navRow = [];
            if (page > 1) {
                navRow.push({ text: '◀️ Previous', callback_data: `manage_tasks_page_${page - 1}` });
            }
            navRow.push({ text: `📄 ${page}/${totalPages}`, callback_data: 'no_action' });
            if (page < totalPages) {
                navRow.push({ text: 'Next ▶️', callback_data: `manage_tasks_page_${page + 1}` });
            }
            keyboard.push(navRow);
        }
        
        keyboard.push(
            [{ text: '➕ Add New Task', callback_data: 'admin_add_task' }],
            [{ text: '🔙 Back', callback_data: 'admin_tasks_menu' }]
        );
        
        await safeEditMessage(ctx, tasksText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Manage tasks error:', error);
        await ctx.answerCbQuery('❌ Error loading tasks');
    }
});

// Manage Task Details
bot.action(/^manage_task_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const task = await db.collection('tasks').findOne({ taskId: taskId });
        
        if (!task) {
            await ctx.answerCbQuery('❌ Task not found');
            return;
        }
        
        const submissions = await db.collection('tasksubmissions').countDocuments({ taskId: taskId });
        const pending = await db.collection('tasksubmissions').countDocuments({ 
            taskId: taskId, 
            status: 'pending' 
        });
        const approved = await db.collection('tasksubmissions').countDocuments({ 
            taskId: taskId, 
            status: 'approved' 
        });
        
        let taskText = `📋 *Manage Task*\n\n`;
        taskText += `*Title:* ${task.title}\n`;
        taskText += `*ID:* \`${task.taskId}\`\n`;
        taskText += `*Bonus:* ${formatCurrency(task.bonusAmount)}\n`;
        taskText += `*Status:* ${task.isActive ? '✅ Active' : '❌ Inactive'}\n`;
        taskText += `*Screenshots:* ${task.screenshotCount}\n`;
        taskText += `*Submissions:* ${submissions}\n`;
        taskText += `*Pending:* ${pending}\n`;
        taskText += `*Approved:* ${approved}\n`;
        taskText += `*Created:* ${new Date(task.createdAt).toLocaleString()}\n\n`;
        taskText += `*Description:*\n${task.description}\n`;
        
        const keyboard = [
            [
                { text: task.isActive ? '❌ Deactivate' : '✅ Activate', callback_data: `toggle_task_${taskId}` },
                { text: '✏️ Edit Task', callback_data: `edit_task_${taskId}` }
            ],
            [
                { text: '💰 Edit Bonus', callback_data: `edit_task_bonus_${taskId}` },
                { text: '📸 Edit Screenshots', callback_data: `edit_task_screenshots_${taskId}` }
            ],
            [
                { text: '✅ Task Requests', callback_data: `task_requests_${taskId}` }
            ],
            [
                { text: '🗑️ Delete Task', callback_data: `delete_task_${taskId}` }
            ],
            [
                { text: '🔙 Back', callback_data: 'admin_manage_tasks' }
            ]
        ];
        
        await safeEditMessage(ctx, taskText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Manage task details error:', error);
        await ctx.answerCbQuery('❌ Error loading task details');
    }
});

// ==========================================
// ADMIN FEATURES - TASK REQUESTS
// ==========================================

bot.action('admin_task_requests', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const page = ctx.session?.taskRequestsPage || 1;
        const limit = 10;
        
        const totalRequests = await db.collection('tasksubmissions').countDocuments({ status: 'pending' });
        const totalPages = Math.ceil(totalRequests / limit);
        const skip = (page - 1) * limit;
        
        const requests = await db.collection('tasksubmissions')
            .find({ status: 'pending' })
            .sort({ submittedAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        let requestsText = `✅ *Task Submission Requests*\n\n`;
        requestsText += `Page ${page} of ${totalPages}\n`;
        requestsText += `Pending Requests: ${totalRequests}\n\n`;
        
        if (requests.length === 0) {
            requestsText += `No pending task submissions.\n`;
        } else {
            requestsText += `*Pending Submissions:*\n\n`;
            
            for (let i = 0; i < requests.length; i++) {
                const request = requests[i];
                const index = skip + i + 1;
                const userInfo = request.userInfo || {};
                const userName = userInfo.username ? `@${userInfo.username}` : 
                                userInfo.firstName || `User ${request.userId}`;
                
                requestsText += `${index}. *${request.submissionId}*\n`;
                requestsText += `   User: ${userName}\n`;
                requestsText += `   Task: ${request.taskTitle}\n`;
                requestsText += `   Bonus: ${formatCurrency(request.bonusAmount)}\n`;
                requestsText += `   Submitted: ${new Date(request.submittedAt).toLocaleString()}\n\n`;
            }
        }
        
        const keyboard = [];
        
        // Request buttons
        for (let i = 0; i < requests.length; i++) {
            const request = requests[i];
            keyboard.push([{ 
                text: `${skip + i + 1}. Review ${request.submissionId}`, 
                callback_data: `review_submission_${request.submissionId}` 
            }]);
        }
        
        // Navigation buttons
        if (totalPages > 1) {
            const navRow = [];
            if (page > 1) {
                navRow.push({ text: '◀️ Previous', callback_data: `task_requests_page_${page - 1}` });
            }
            navRow.push({ text: `📄 ${page}/${totalPages}`, callback_data: 'no_action' });
            if (page < totalPages) {
                navRow.push({ text: 'Next ▶️', callback_data: `task_requests_page_${page + 1}` });
            }
            keyboard.push(navRow);
        }
        
        keyboard.push(
            [{ text: '🔙 Back', callback_data: 'admin_tasks_menu' }]
        );
        
        await safeEditMessage(ctx, requestsText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Task requests error:', error);
        await ctx.answerCbQuery('❌ Error loading task requests');
    }
});

// Review Submission
bot.action(/^review_submission_(.+)$/, async (ctx) => {
    try {
        const submissionId = ctx.match[1];
        const submission = await db.collection('tasksubmissions').findOne({ submissionId: submissionId });
        
        if (!submission) {
            await ctx.answerCbQuery('❌ Submission not found');
            return;
        }
        
        const user = await db.collection('users').findOne({ userId: submission.userId });
        const task = await db.collection('tasks').findOne({ taskId: submission.taskId });
        
        let reviewText = `✅ *Review Task Submission*\n\n`;
        reviewText += `*Submission ID:* \`${submission.submissionId}\`\n`;
        reviewText += `*User:* ${submission.userInfo?.username ? `@${submission.userInfo.username}` : submission.userInfo?.firstName || `User ${submission.userId}`}\n`;
        reviewText += `*User ID:* \`${submission.userId}\`\n`;
        reviewText += `*Task:* ${submission.taskTitle}\n`;
        reviewText += `*Bonus:* ${formatCurrency(submission.bonusAmount)}\n`;
        reviewText += `*Submitted:* ${new Date(submission.submittedAt).toLocaleString()}\n`;
        reviewText += `*User Balance:* ${formatCurrency(user?.balance || 0)}\n\n`;
        reviewText += `*Screenshots Submitted:* ${submission.screenshots.length}\n`;
        
        const keyboard = [
            [
                { text: '✅ Approve', callback_data: `approve_submission_${submissionId}` },
                { text: '❌ Reject', callback_data: `reject_submission_${submissionId}` }
            ],
            [
                { text: '📸 View Screenshots', callback_data: `view_submission_screenshots_${submissionId}` }
            ],
            [
                { text: '🔙 Back', callback_data: 'admin_task_requests' }
            ]
        ];
        
        // Send first screenshot if available
        if (submission.screenshots.length > 0) {
            await ctx.replyWithPhoto(submission.screenshots[0], {
                caption: reviewText,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await safeEditMessage(ctx, reviewText, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        }
        
    } catch (error) {
        console.error('Review submission error:', error);
        await ctx.answerCbQuery('❌ Error loading submission');
    }
});

// Approve Submission
bot.action(/^approve_submission_(.+)$/, async (ctx) => {
    try {
        const submissionId = ctx.match[1];
        const submission = await db.collection('tasksubmissions').findOne({ submissionId: submissionId });
        
        if (!submission) {
            await ctx.answerCbQuery('❌ Submission not found');
            return;
        }
        
        // Update submission
        await db.collection('tasksubmissions').updateOne(
            { submissionId: submissionId },
            { 
                $set: { 
                    status: 'approved',
                    approvedAt: new Date(),
                    approvedBy: ctx.from.id
                }
            }
        );
        
        // Add bonus to user balance
        await updateUserBalance(submission.userId, submission.bonusAmount, 'add');
        
        // Add transaction record
        await addTransaction(submission.userId, 'task', submission.bonusAmount, `Task completion: ${submission.taskTitle}`);
        
        await ctx.answerCbQuery('✅ Submission approved');
        
        // Notify user
        try {
            await bot.telegram.sendMessage(
                submission.userId,
                `✅ *Task Approved!*\n\n` +
                `*Task:* ${submission.taskTitle}\n` +
                `*Bonus:* ${formatCurrency(submission.bonusAmount)}\n` +
                `*Status:* ✅ Approved\n` +
                `*Approved:* ${new Date().toLocaleString()}\n\n` +
                `Bonus has been added to your balance.`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('Failed to notify user:', error);
        }
        
        // Show success message
        const successText = `✅ *Submission Approved Successfully!*\n\n`;
        successText += `*Submission ID:* \`${submission.submissionId}\`\n`;
        successText += `*User:* ${submission.userId}\n`;
        successText += `*Bonus Added:* ${formatCurrency(submission.bonusAmount)}\n`;
        successText += `*Approved by:* ${ctx.from.id}\n`;
        successText += `*Time:* ${new Date().toLocaleString()}\n\n`;
        successText += `User has been notified and bonus added to their balance.`;
        
        const keyboard = [
            [{ text: '📋 More Requests', callback_data: 'admin_task_requests' }],
            [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, successText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Approve submission error:', error);
        await ctx.answerCbQuery('❌ Error approving submission');
    }
});

// Reject Submission
bot.action(/^reject_submission_(.+)$/, async (ctx) => {
    try {
        const submissionId = ctx.match[1];
        
        // Store submission ID in session for rejection message
        ctx.session.rejectingSubmission = submissionId;
        
        await safeSendMessage(ctx, 'Enter rejection reason for the user:\n\nType "cancel" to cancel.', {
            parse_mode: 'HTML'
        });
        
    } catch (error) {
        console.error('Reject submission error:', error);
        await ctx.answerCbQuery('❌ Error rejecting submission');
    }
});

// Handle submission rejection message
bot.on('text', async (ctx) => {
    try {
        if (ctx.session?.rejectingSubmission && !ctx.message.text?.startsWith('/')) {
            const submissionId = ctx.session.rejectingSubmission;
            
            if (ctx.message.text.toLowerCase() === 'cancel') {
                await safeSendMessage(ctx, '❌ Rejection cancelled.');
                delete ctx.session.rejectingSubmission;
                return;
            }
            
            const submission = await db.collection('tasksubmissions').findOne({ submissionId: submissionId });
            
            if (!submission) {
                await safeSendMessage(ctx, '❌ Submission not found.');
                delete ctx.session.rejectingSubmission;
                return;
            }
            
            const rejectionReason = ctx.message.text;
            
            // Update submission
            await db.collection('tasksubmissions').updateOne(
                { submissionId: submissionId },
                { 
                    $set: { 
                        status: 'rejected',
                        adminMessage: rejectionReason,
                        processedAt: new Date(),
                        processedBy: ctx.from.id
                    }
                }
            );
            
            delete ctx.session.rejectingSubmission;
            
            // Notify user
            try {
                await bot.telegram.sendMessage(
                    submission.userId,
                    `❌ *Task Rejected*\n\n` +
                    `*Task:* ${submission.taskTitle}\n` +
                    `*Bonus:* ${formatCurrency(submission.bonusAmount)}\n` +
                    `*Status:* ❌ Rejected\n` +
                    `*Reason:* ${rejectionReason}\n` +
                    `*Processed:* ${new Date().toLocaleString()}\n\n` +
                    `Please review the task requirements and try again.`,
                    { parse_mode: 'HTML' }
                );
            } catch (error) {
                console.error('Failed to notify user:', error);
            }
            
            // Show success message
            const successText = `❌ *Submission Rejected Successfully!*\n\n`;
            successText += `*Submission ID:* \`${submission.submissionId}\`\n`;
            successText += `*Reason:* ${rejectionReason}\n`;
            successText += `*Processed by:* ${ctx.from.id}\n`;
            successText += `*Time:* ${new Date().toLocaleString()}\n\n`;
            successText += `User has been notified.`;
            
            const keyboard = [
                [{ text: '📋 More Requests', callback_data: 'admin_task_requests' }],
                [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
            ];
            
            await safeSendMessage(ctx, successText, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            );
        }
    } catch (error) {
        console.error('Handle submission rejection error:', error);
        await safeSendMessage(ctx, '❌ Error processing rejection.');
    }
});

// ==========================================
// ADMIN FEATURES - TASK HISTORY
// ==========================================

bot.action('admin_task_history', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const page = ctx.session?.taskHistoryPage || 1;
        const limit = 10;
        
        const totalSubmissions = await db.collection('tasksubmissions').countDocuments();
        const totalPages = Math.ceil(totalSubmissions / limit);
        const skip = (page - 1) * limit;
        
        const submissions = await db.collection('tasksubmissions')
            .find({})
            .sort({ submittedAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        let historyText = `📊 *Task Submission History*\n\n`;
        historyText += `Page ${page} of ${totalPages}\n`;
        historyText += `Total Submissions: ${totalSubmissions}\n\n`;
        
        if (submissions.length === 0) {
            historyText += `No task submissions found.\n`;
        } else {
            historyText += `*Submissions:*\n\n`;
            
            for (let i = 0; i < submissions.length; i++) {
                const submission = submissions[i];
                const index = skip + i + 1;
                const userInfo = submission.userInfo || {};
                const userName = userInfo.username ? `@${userInfo.username}` : 
                                userInfo.firstName || `User ${submission.userId}`;
                const statusEmoji = submission.status === 'approved' ? '✅' : 
                                   submission.status === 'rejected' ? '❌' : '⏳';
                
                historyText += `${index}. *${submission.submissionId}*\n`;
                historyText += `   User: ${userName}\n`;
                historyText += `   Task: ${submission.taskTitle}\n`;
                historyText += `   Status: ${statusEmoji} ${submission.status}\n`;
                historyText += `   Bonus: ${formatCurrency(submission.bonusAmount)}\n`;
                historyText += `   Submitted: ${new Date(submission.submittedAt).toLocaleDateString()}\n\n`;
            }
        }
        
        const keyboard = [];
        
        // Navigation buttons
        if (totalPages > 1) {
            const navRow = [];
            if (page > 1) {
                navRow.push({ text: '◀️ Previous', callback_data: `task_history_admin_page_${page - 1}` });
            }
            navRow.push({ text: `📄 ${page}/${totalPages}`, callback_data: 'no_action' });
            if (page < totalPages) {
                navRow.push({ text: 'Next ▶️', callback_data: `task_history_admin_page_${page + 1}` });
            }
            keyboard.push(navRow);
        }
        
        keyboard.push(
            [{ text: '🔙 Back', callback_data: 'admin_tasks_menu' }]
        );
        
        await safeEditMessage(ctx, historyText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Task history error:', error);
        await ctx.answerCbQuery('❌ Error loading task history');
    }
});

// ==========================================
// ADMIN FEATURES - ADD CHANNEL
// ==========================================

bot.action('admin_add_channel', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await safeSendMessage(ctx, '📺 *Add New Channel*\n\nEnter channel button name (e.g., "Join Main Channel"):\n\nType "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    await ctx.scene.enter('add_channel_scene');
});

// Add Channel Scene
scenes.addChannel.on('text', async (ctx) => {
    try {
        if (!ctx.session.addingChannel) {
            ctx.session.addingChannel = {
                step: 'name'
            };
        }
        
        const step = ctx.session.addingChannel.step;
        
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Channel addition cancelled.');
            delete ctx.session.addingChannel;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        if (step === 'name') {
            ctx.session.addingChannel.buttonLabel = ctx.message.text;
            ctx.session.addingChannel.step = 'id';
            
            await safeSendMessage(ctx, 'Now send the channel ID (e.g., @channelusername or -1001234567890):\n\nType "cancel" to cancel.');
            
        } else if (step === 'id') {
            const channelIdentifier = ctx.message.text.trim();
            let channelId, channelTitle;
            
            try {
                // Try to get chat info
                const chat = await ctx.telegram.getChat(channelIdentifier);
                channelId = chat.id;
                channelTitle = chat.title || 'Unknown Channel';
                
                // Check if it's a channel/supergroup
                if (chat.type !== 'channel' && chat.type !== 'supergroup') {
                    await safeSendMessage(ctx, '❌ This is not a channel or supergroup.');
                    return;
                }
                
            } catch (error) {
                await safeSendMessage(ctx, '❌ Cannot access this channel. Make sure:\n1. The bot is added to the channel\n2. Channel ID is correct\n3. For private channels, use the -100 format');
                return;
            }
            
            ctx.session.addingChannel.id = channelId;
            ctx.session.addingChannel.title = channelTitle;
            ctx.session.addingChannel.step = 'link';
            
            await safeSendMessage(ctx, 'Now send the channel link (e.g., https://t.me/channelusername or https://t.me/joinchat/xxxxxx):\n\nType "cancel" to cancel.');
            
        } else if (step === 'link') {
            const link = ctx.message.text.trim();
            
            // Validate link
            if (!link.startsWith('https://t.me/')) {
                await safeSendMessage(ctx, '❌ Invalid Telegram link. Must start with https://t.me/');
                return;
            }
            
            ctx.session.addingChannel.link = link;
            
            // Detect channel type from link
            if (link.includes('joinchat/') || link.includes('+')) {
                ctx.session.addingChannel.type = 'private';
            } else {
                ctx.session.addingChannel.type = 'public';
            }
            
            ctx.session.addingChannel.step = 'level';
            
            // Show level options
            const levelText = `Select channel level:\n\n`;
            levelText += `*F* - Hidden (won't show to users)\n`;
            levelText += `*S* - Show Only (shows but doesn't require joining)\n`;
            levelText += `*SS* - Auto Accept (shows and auto-accepts join requests)\n`;
            levelText += `*SSS* - Must Join (shows and requires joining)\n\n`;
            levelText += `Enter F, S, SS, or SSS:`;
            
            const keyboard = [
                [
                    { text: 'F - Hidden', callback_data: 'set_channel_level_F' },
                    { text: 'S - Show Only', callback_data: 'set_channel_level_S' }
                ],
                [
                    { text: 'SS - Auto Accept', callback_data: 'set_channel_level_SS' },
                    { text: 'SSS - Must Join', callback_data: 'set_channel_level_SSS' }
                ]
            ];
            
            await safeSendMessage(ctx, levelText, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
            
        }
        
    } catch (error) {
        console.error('Add channel scene error:', error);
        await safeSendMessage(ctx, '❌ Error adding channel. Please try again.');
        delete ctx.session.addingChannel;
        await ctx.scene.leave();
    }
});

// Set Channel Level Callbacks
bot.action(/^set_channel_level_(.+)$/, async (ctx) => {
    try {
        const level = ctx.match[1];
        
        if (!ctx.session.addingChannel) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        ctx.session.addingChannel.level = level;
        
        // Create channel object
        const channelData = ctx.session.addingChannel;
        const newChannel = {
            id: channelData.id,
            title: channelData.title,
            buttonLabel: channelData.buttonLabel,
            link: channelData.link,
            type: channelData.type,
            level: level,
            hide: level === 'F',
            verify: level === 'SSS',
            autoAccept: level === 'SS',
            addedAt: new Date()
        };
        
        // Add to database
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $push: { channels: newChannel } }
        );
        
        // Clear session
        delete ctx.session.addingChannel;
        
        await ctx.answerCbQuery(`✅ Channel added with level ${level}`);
        
        // Show success message
        const successText = `✅ *Channel Added Successfully!*\n\n`;
        successText += `*Name:* ${newChannel.buttonLabel}\n`;
        successText += `*Title:* ${newChannel.title}\n`;
        successText += `*ID:* \`${newChannel.id}\`\n`;
        successText += `*Link:* ${newChannel.link}\n`;
        successText += `*Type:* ${newChannel.type === 'private' ? '🔒 Private' : '🔓 Public'}\n`;
        successText += `*Level:* ${level}\n`;
        successText += `*Hide:* ${newChannel.hide ? '✅ Yes' : '❌ No'}\n`;
        successText += `*Verify:* ${newChannel.verify ? '✅ Yes' : '❌ No'}\n`;
        successText += `*Auto Accept:* ${newChannel.autoAccept ? '✅ Yes' : '❌ No'}\n\n`;
        successText += `Channel is now available for users.`;
        
        const keyboard = [
            [{ text: '➕ Add Another Channel', callback_data: 'admin_add_channel' }],
            [{ text: '📋 Manage Channels', callback_data: 'admin_channels' }],
            [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, successText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Set channel level error:', error);
        await ctx.answerCbQuery('❌ Error adding channel');
    }
});

// ==========================================
// ADMIN FEATURES - MANAGE CHANNELS
// ==========================================

bot.action('admin_channels', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        
        let text = '📺 *Manage Channels*\n\n';
        
        if (channels.length === 0) {
            text += 'No channels added yet.\n';
        } else {
            channels.forEach((channel, index) => {
                const levelEmoji = channel.level === 'F' ? '👁️' : 
                                 channel.level === 'S' ? '👀' : 
                                 channel.level === 'SS' ? '✅' : '🔒';
                const typeEmoji = channel.type === 'private' ? '🔒' : '🔓';
                text += `${index + 1}. ${levelEmoji} ${typeEmoji} ${channel.buttonLabel || channel.title} (${channel.level || 'No level'})\n`;
            });
        }
        
        text += '\nSelect an option:';
        
        const keyboard = [
            [{ text: '➕ Add Channel', callback_data: 'admin_add_channel' }],
            channels.length > 0 ? [{ text: '🗑️ Delete Channel', callback_data: 'admin_delete_channel' }] : [],
            channels.length > 0 ? [{ text: '👁️ Channel Levels', callback_data: 'admin_channel_levels' }] : [],
            [{ text: '🔙 Back', callback_data: 'admin_channels_menu' }]
        ].filter(row => row.length > 0);
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Channels menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Channel Levels Management
bot.action('admin_channel_levels', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const text = '👁️ *Channel Levels Management*\n\nSelect an option:';
        
        const keyboard = [
            [
                { text: '👁️ Hide Channels (F)', callback_data: 'admin_hide_channels' },
                { text: '👀 Just Show (S)', callback_data: 'admin_show_channels' }
            ],
            [
                { text: '✅ Auto Accept (SS)', callback_data: 'admin_auto_accept_channels' },
                { text: '🔒 Need Join (SSS)', callback_data: 'admin_need_join_channels' }
            ],
            [
                { text: '🔙 Back', callback_data: 'admin_channels' }
            ]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Channel levels menu error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// ==========================================
// ADMIN FEATURES - MANAGE ADMINS
// ==========================================

bot.action('admin_manage_admins', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const admins = config?.admins || ADMIN_IDS;
        const mutedAdmins = config?.mutedAdmins || [];
        
        let text = '👑 *Manage Admins*\n\nCurrent Admins:\n';
        
        admins.forEach((adminId, index) => {
            const isMuted = mutedAdmins.includes(adminId);
            const status = isMuted ? '🔕' : '🔔';
            text += `${index + 1}. ${status} \`${adminId}\`\n`;
        });
        
        text += '\nSelect an option:';
        
        const keyboard = [
            [{ text: '➕ Add Admin', callback_data: 'admin_add_admin' }, { text: '🗑️ Remove Admin', callback_data: 'admin_remove_admin' }],
            [{ text: '🔙 Back', callback_data: 'admin_admins_menu' }]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Manage admins menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Add Admin Scene
scenes.addAdmin.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Add cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const newAdminId = parseInt(ctx.message.text);
        if (isNaN(newAdminId)) {
            await safeSendMessage(ctx, '❌ Invalid user ID. Please enter a numeric ID.');
            return;
        }
        
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentAdmins = config?.admins || ADMIN_IDS;
        
        if (currentAdmins.includes(newAdminId)) {
            await safeSendMessage(ctx, '❌ This user is already an admin.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const updatedAdmins = [...currentAdmins, newAdminId];
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { admins: updatedAdmins, updatedAt: new Date() } }
        );
        
        await safeSendMessage(ctx, `✅ Admin added successfully!\n\nNew admin ID: \`${newAdminId}\``, {
            parse_mode: 'HTML'
        });
        
        await ctx.scene.leave();
        await showAdminPanel(ctx);
        
    } catch (error) {
        console.error('Add admin error:', error);
        await safeSendMessage(ctx, '❌ Failed to add admin.');
        await ctx.scene.leave();
    }
});

// ==========================================
// ADMIN FEATURES - TIMER SETTINGS
// ==========================================

bot.action('admin_timer', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentTimer = config?.codeTimer || DEFAULT_CONFIG.codeTimer;
        const hours = Math.floor(currentTimer / 3600);
        
        const text = `⏰ *Code Timer Settings*\n\nCurrent timer: *${hours} hours*\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '2 Hours', callback_data: 'timer_2' }, { text: '4 Hours', callback_data: 'timer_4' }],
            [{ text: '6 Hours', callback_data: 'timer_6' }, { text: '12 Hours', callback_data: 'timer_12' }],
            [{ text: '24 Hours', callback_data: 'timer_24' }, { text: '✏️ Custom', callback_data: 'timer_custom' }],
            [{ text: '🔙 Back', callback_data: 'admin_settings_menu' }]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Timer menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Timer handlers
['2', '4', '6', '12', '24'].forEach(hours => {
    bot.action(`timer_${hours}`, async (ctx) => {
        try {
            const seconds = parseInt(hours) * 3600;
            await db.collection('admin').updateOne(
                { type: 'config' },
                { $set: { codeTimer: seconds, updatedAt: new Date() } }
            );
            
            await ctx.answerCbQuery(`✅ Timer set to ${hours} hours`);
            await showAdminPanel(ctx);
        } catch (error) {
            console.error(`Set timer ${hours} error:`, error);
            await ctx.answerCbQuery('❌ Failed to set timer');
        }
    });
});

bot.action('timer_custom', async (ctx) => {
    await safeSendMessage(ctx, 'Enter timer in hours (e.g., 3 for 3 hours):\n\nType "cancel" to cancel.');
    await ctx.scene.enter('edit_timer_scene');
});

scenes.editTimer.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Edit cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const hours = parseInt(ctx.message.text);
        if (isNaN(hours) || hours < 1) {
            await safeSendMessage(ctx, '❌ Please enter a valid number of hours (minimum 1).');
            return;
        }
        
        const seconds = hours * 3600;
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { codeTimer: seconds, updatedAt: new Date() } }
        );
        
        await safeSendMessage(ctx, `✅ Timer set to ${hours} hours`);
        await ctx.scene.leave();
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Edit timer error:', error);
        await safeSendMessage(ctx, '❌ Failed to set timer.');
        await ctx.scene.leave();
    }
});

// ==========================================
// ADMIN FEATURES - CONTACT BUTTON
// ==========================================

bot.action('admin_contact_button', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const showContactButton = config?.showContactButton !== false;
        
        const text = `📞 *Contact Button Settings*\n\nCurrent status: ${showContactButton ? '✅ SHOWN to users' : '❌ HIDDEN from users'}\n\nSelect an option:`;
        
        const keyboard = [
            [
                { text: showContactButton ? '✅ Currently Shown' : '❌ Currently Hidden', callback_data: 'toggle_contact_button' }
            ],
            [
                { text: showContactButton ? '❌ Hide from Users' : '✅ Show to Users', callback_data: 'set_contact_button' }
            ],
            [{ text: '🔙 Back', callback_data: 'admin_settings_menu' }]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Contact button menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Toggle contact button
bot.action('toggle_contact_button', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentSetting = config?.showContactButton !== false;
        
        const newSetting = !currentSetting;
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { showContactButton: newSetting, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery(`✅ Contact button ${newSetting ? 'shown' : 'hidden'} to users`);
        await bot.action('admin_contact_button')(ctx);
    } catch (error) {
        console.error('Toggle contact button error:', error);
        await ctx.answerCbQuery('❌ Failed to update setting');
    }
});

// ==========================================
// ADMIN FEATURES - DISABLE BOT
// ==========================================

bot.action('admin_disable_bot', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const botDisabled = config?.botDisabled || false;
        const disabledMessage = config?.disabledMessage || DEFAULT_CONFIG.disabledMessage;
        
        const text = `🚫 *Bot Status Control*\n\nCurrent status: ${botDisabled ? '❌ DISABLED' : '✅ ENABLED'}\n\nWhen disabled, users will see this message:\n${formatHTMLForDisplay(disabledMessage, true)}\n\nSelect an option:`;
        
        const keyboard = [
            [
                { text: botDisabled ? '❌ Currently Disabled' : '✅ Currently Enabled', callback_data: 'toggle_bot_status' }
            ],
            [
                { text: botDisabled ? '✅ Enable Bot' : '❌ Disable Bot', callback_data: 'set_bot_status' }
            ],
            [
                { text: '✏️ Edit Disabled Message', callback_data: 'edit_disabled_message' }
            ],
            [{ text: '🔙 Back', callback_data: 'admin_settings_menu' }]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Disable bot menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Toggle bot status
bot.action('toggle_bot_status', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentStatus = config?.botDisabled || false;
        
        const newStatus = !currentStatus;
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { botDisabled: newStatus, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery(`✅ Bot ${newStatus ? 'disabled' : 'enabled'}`);
        await bot.action('admin_disable_bot')(ctx);
    } catch (error) {
        console.error('Toggle bot status error:', error);
        await ctx.answerCbQuery('❌ Failed to update status');
    }
});

// ==========================================
// ADMIN FEATURES - AUTO ACCEPT REQUESTS
// ==========================================

bot.action('admin_auto_accept', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const autoAccept = config?.autoAcceptRequests !== false;
        
        const text = `🔒 *Auto Accept Join Requests*\n\nGlobal setting: ${autoAccept ? '✅ ENABLED' : '❌ DISABLED'}\n\nWhen enabled, bot will automatically approve join requests for private channels.\n\nSelect an option:`;
        
        const keyboard = [
            [
                { text: autoAccept ? '✅ Global: Enabled' : '❌ Global: Disabled', callback_data: 'toggle_auto_accept' }
            ],
            [{ text: '🔙 Back', callback_data: 'admin_settings_menu' }]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Auto accept menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Toggle global auto accept
bot.action('toggle_auto_accept', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentSetting = config?.autoAcceptRequests !== false;
        
        const newSetting = !currentSetting;
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { autoAcceptRequests: newSetting, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery(`✅ Auto accept ${newSetting ? 'enabled' : 'disabled'}`);
        await bot.action('admin_auto_accept')(ctx);
    } catch (error) {
        console.error('Toggle auto accept error:', error);
        await ctx.answerCbQuery('❌ Failed to update setting');
    }
});

// ==========================================
// ADMIN FEATURES - MUTE NOTIFICATIONS
// ==========================================

bot.action('admin_mute_notifications', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const adminId = ctx.from.id;
        const config = await db.collection('admin').findOne({ type: 'config' });
        const mutedAdmins = config?.mutedAdmins || [];
        const isMuted = mutedAdmins.includes(adminId);
        
        const text = `🔕 *Mute Notifications*\n\nCurrent status: ${isMuted ? '🔕 MUTED' : '🔔 ACTIVE'}\n\nWhen muted, you will NOT receive:\n• Contact messages from users\n• Join request notifications\n• Error reports\n• Broadcast confirmations\n• Other admin notifications\n\nSelect an option:`;
        
        const keyboard = [
            [
                { text: isMuted ? '🔕 Currently Muted' : '🔔 Currently Active', callback_data: 'toggle_mute_status' }
            ],
            [
                { text: isMuted ? '🔔 Unmute Notifications' : '🔕 Mute Notifications', callback_data: 'set_mute_status' }
            ],
            [{ text: '🔙 Back', callback_data: 'admin_settings_menu' }]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Mute notifications menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Toggle mute status
bot.action('toggle_mute_status', async (ctx) => {
    try {
        const adminId = ctx.from.id;
        const config = await db.collection('admin').findOne({ type: 'config' });
        const mutedAdmins = config?.mutedAdmins || [];
        const isMuted = mutedAdmins.includes(adminId);
        
        const newMutedAdmins = isMuted 
            ? mutedAdmins.filter(id => id !== adminId)
            : [...mutedAdmins, adminId];
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { mutedAdmins: newMutedAdmins, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery(`✅ Notifications ${isMuted ? 'unmuted' : 'muted'}`);
        await bot.action('admin_mute_notifications')(ctx);
    } catch (error) {
        console.error('Toggle mute status error:', error);
        await ctx.answerCbQuery('❌ Failed to update setting');
    }
});

// ==========================================
// ADMIN FEATURES - HTML GUIDE
// ==========================================

bot.action('admin_html_guide', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const htmlGuide = `<b>📋 HTML Formatting Guide</b>

Telegram supports HTML formatting in messages. Here are all available tags:

<b>1. &lt;b&gt;bold&lt;/b&gt;, &lt;strong&gt;bold&lt;/strong&gt;</b>
Example: This is <b>bold text</b>
Copy: <code>&lt;b&gt;bold text&lt;/b&gt;</code>

<b>2. &lt;i&gt;italic&lt;/i&gt;, &lt;em&gt;italic&lt;/em&gt;</b>
Example: This is <i>italic text</i>
Copy: <code>&lt;i&gt;italic text&lt;/i&gt;</code>

<b>3. &lt;u&gt;underline&lt;/u&gt;, &lt;ins&gt;underline&lt;/ins&gt;</b>
Example: This is <u>underlined text</u>
Copy: <code>&lt;u&gt;underlined text&lt;/u&gt;</code>

<b>4. &lt;s&gt;strikethrough&lt;/s&gt;, &lt;strike&gt;strikethrough&lt;/strike&gt;, &lt;del&gt;strikethrough&lt;/del&gt;</b>
Example: This is <s>strikethrough text</s>
Copy: <code>&lt;s&gt;strikethrough text&lt;/s&gt;</code>

<b>5. &lt;span class="tg-spoiler"&gt;spoiler&lt;/span&gt;, &lt;tg-spoiler&gt;spoiler&lt;/tg-spoiler&gt;</b>
Example: This is <span class="tg-spoiler">spoiler text</span>
Copy: <code>&lt;span class="tg-spoiler"&gt;spoiler text&lt;/span&gt;</code>

<b>6. &lt;code&gt;inline code&lt;/code&gt;</b>
Example: This is <code>inline code</code>
Copy: <code>&lt;code&gt;inline code&lt;/code&gt;</code>

<b>7. &lt;pre&gt;pre-formatted code block&lt;/pre&gt;</b>
Example: <pre>function hello() {
  console.log("Hello");
}</pre>
Copy: <code>&lt;pre&gt;Your code here&lt;/pre&gt;</code>

<b>8. &lt;pre&gt;&lt;code class="language-python"&gt;language-specific code&lt;/code&gt;&lt;/pre&gt;</b>
Example: <pre><code class="language-python">def hello():
    print("Hello")</code></pre>
Copy: <code>&lt;pre&gt;&lt;code class="language-python"&gt;Your code here&lt;/code&gt;&lt;/pre&gt;</code>

<b>9. &lt;a href="http://example.com"&gt;link text&lt;/a&gt;</b>
Example: Visit <a href="https://telegram.org">Telegram</a>
Copy: <code>&lt;a href="https://example.com"&gt;Link Text&lt;/a&gt;</code>

<b>10. &lt;a href="tg://user?id=123456789"&gt;mention user&lt;/a&gt;</b>
Example: Hello <a href="tg://user?id=123456789">User</a>
Copy: <code>&lt;a href="tg://user?id=USER_ID"&gt;User Name&lt;/a&gt;</code>

<b>11. &lt;blockquote&gt;quoted text&lt;/blockquote&gt;</b>
Example: <blockquote>This is a block quotation
that can span multiple lines</blockquote>
Copy: <code>&lt;blockquote&gt;Your quoted text here&lt;/blockquote&gt;</code>

<b>12. &lt;blockquote expandable&gt;expandable quote&lt;/blockquote&gt;</b>
Example: <blockquote expandable>This is an expandable quotation
with hidden text by default</blockquote>
Copy: <code>&lt;blockquote expandable&gt;Your expandable text&lt;/blockquote&gt;</code>

<b>Nested Formatting Example:</b>
<code>&lt;b&gt;bold &lt;i&gt;italic bold &lt;s&gt;italic bold strikethrough &lt;span class="tg-spoiler"&gt;italic bold strikethrough spoiler&lt;/span&gt;&lt;/s&gt; &lt;u&gt;underline italic bold&lt;/u&gt;&lt;/i&gt; bold&lt;/b&gt;</code>

<b>Custom Emoji:</b>
<code>&lt;tg-emoji emoji-id="5368324170671202286"&gt;👍&lt;/tg-emoji&gt;</code>

<i>Note: When using HTML, make sure to escape &amp;, &lt;, &gt; characters as &amp;amp;, &amp;lt;, &amp;gt;</i>`;

        const keyboard = [
            [{ text: '📝 Try in Message', callback_data: 'admin_startmessage' }],
            [{ text: '🔙 Back', callback_data: 'admin_messages_menu' }]
        ];

        await safeEditMessage(ctx, htmlGuide, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('HTML guide error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// ==========================================
// ADMIN FEATURES - DELETE DATA
// ==========================================

bot.action('admin_deletedata', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    const text = '<b>⚠️ DANGER ZONE - DATA DELETION</b>\n\nSelect what you want to delete:\n\n<b>WARNING: These actions cannot be undone!</b>';
    
    const keyboard = [
        [{ text: '🗑️ Delete All Users', callback_data: 'delete_all_users' }, { text: '🗑️ Delete All Channels', callback_data: 'delete_all_channels' }],
        [{ text: '🗑️ Delete All Tasks', callback_data: 'delete_all_tasks' }, { text: '🗑️ Delete All Gift Codes', callback_data: 'delete_all_giftcodes' }],
        [{ text: '🔥 DELETE EVERYTHING', callback_data: 'delete_everything' }],
        [{ text: '🔙 Back', callback_data: 'admin_tools_menu' }]
    ];
    
    await safeEditMessage(ctx, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
});

// ==========================================
// ADMIN FEATURES - RESET ERRORS
// ==========================================

bot.action('admin_reset_errors', async (ctx) => {
    try {
        if (!await isAdmin(ctx.from.id)) {
            return;
        }
        
        // Clear all error cooldowns
        errorCooldowns.clear();
        
        // Also clear any stuck sessions
        if (ctx.session) {
            Object.keys(ctx.session).forEach(key => {
                delete ctx.session[key];
            });
        }
        
        await ctx.answerCbQuery('✅ All error cooldowns and sessions have been reset!');
        
    } catch (error) {
        console.error('Reset errors error:', error);
        await ctx.answerCbQuery('❌ Failed to reset errors');
    }
});

// ==========================================
// CHAT JOIN REQUEST HANDLER
// ==========================================

bot.on('chat_join_request', async (ctx) => {
    try {
        const userId = ctx.chatJoinRequest.from.id;
        const chatId = ctx.chatJoinRequest.chat.id;
        const errorKey = `join_request_${userId}_${chatId}`;
        
        if (!canProcessError(errorKey, 2, 60000)) {
            console.log(`⏸️ Skipping join request due to error cooldown: ${errorKey}`);
            return;
        }
        
        console.log(`📨 Join request from user ${userId} for chat ${chatId}`);
        
        // Get config to check settings
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        
        // Check global auto accept setting
        const globalAutoAccept = config?.autoAcceptRequests !== false;
        
        // Check if this chat is in our channel list
        const channel = channels.find(ch => String(ch.id) === String(chatId));
        
        if (channel) {
            // Check if auto accept is enabled for this channel
            let shouldAccept = globalAutoAccept;
            let shouldNotify = true;
            
            // For private channels, check channel-specific setting
            if (channel.type === 'private') {
                const channelAutoAccept = channel.autoAccept !== false;
                shouldAccept = globalAutoAccept && channelAutoAccept;
                
                // If auto-accept is disabled for this private channel, don't notify admin
                if (!channelAutoAccept) {
                    shouldNotify = false;
                    console.log(`🔕 Silent join request for private channel "${channel.title}" (Auto-accept disabled)`);
                }
            } else {
                // Public channels don't need approval
                shouldAccept = false;
                shouldNotify = true;
            }
            
            if (shouldAccept) {
                try {
                    // First check if user is already a member
                    try {
                        const member = await bot.telegram.getChatMember(chatId, userId);
                        if (member.status !== 'left' && member.status !== 'kicked') {
                            console.log(`✅ User ${userId} is already a member of "${channel.title}" - skipping approval`);
                            return;
                        }
                    } catch (checkError) {
                        console.log(`⚠️ Could not check membership for user ${userId}:`, checkError.message);
                    }
                    
                    // If not already a member, proceed with approval
                    await bot.telegram.approveChatJoinRequest(chatId, userId);
                    console.log(`✅ Approved join request for user ${userId} in channel ${channel.title}`);
                    
                    // Notify admin (excluding muted admins)
                    if (shouldNotify) {
                        await notifyAdmin(`✅ <b>Join Request Auto-Approved</b>\n\n👤 User: ${userId}\n📺 Channel: ${channel.title}\n🔗 Type: ${channel.type}\n⚙️ Auto-accept: Enabled`);
                    }
                    
                } catch (error) {
                    console.error(`❌ Failed to approve join request for user ${userId}:`, error.message);
                    
                    // Check if error is "USER_ALREADY_PARTICIPANT" - this is not a real error
                    if (error.message.includes('USER_ALREADY_PARTICIPANT')) {
                        console.log(`✅ User ${userId} is already a member of "${channel.title}"`);
                        resetErrorCooldown(errorKey);
                    } else {
                        const canNotify = canProcessError(`notify_${errorKey}`, 1, 300000);
                        if (canNotify && shouldNotify) {
                            await notifyAdmin(`❌ <b>Join Request Failed</b>\n\n👤 User: ${userId}\n📺 Channel: ${channel.title}\n❌ Error: ${error.message}\n\n⚠️ Will retry up to 2 times`);
                        }
                    }
                }
                
            } else {
                console.log(`⏸️ Join request not auto-approved for user ${userId} in channel ${channel.title}`);
                
                // Only notify admin if shouldNotify is true (excluding muted admins)
                if (shouldNotify) {
                    await notifyAdmin(`⏸️ <b>Join Request Pending</b>\n\n👤 User: ${userId}\n📺 Channel: ${channel.title}\n🔗 Type: ${channel.type}\n⚙️ Auto-accept: Disabled\n\n⚠️ Manual approval required`);
                }
            }
        } else {
            console.log(`⚠️ Join request for unknown chat ${chatId}`);
        }
    } catch (error) {
        console.error('Error in chat join request handler:', error);
    }
});

// ==========================================
// ERROR HANDLING
// ==========================================

bot.catch((error, ctx) => {
    console.error('Bot error:', error);
    
    // Store error for reporting
    if (ctx.session) {
        ctx.session.lastError = {
            command: ctx.message?.text || 'Unknown',
            error: error.message,
            stack: error.stack
        };
    }
    
    try {
        if (ctx.message) {
            safeSendMessage(ctx, '❌ An error occurred. Please try again.', {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '📞 Contact Admin', callback_data: 'contact_support' },
                        { text: '🔄 Try Again', callback_data: 'back_to_start' }
                    ]]
                }
            });
        }
    } catch (e) {
        console.error('Error in error handler:', e);
    }
});

// ==========================================
// GLOBAL ERROR PROTECTION
// ==========================================

let errorCount = 0;
const MAX_ERRORS_BEFORE_RESTART = 10;
const ERROR_RESET_INTERVAL = 60000;

// Monitor error frequency
const originalErrorHandler = bot.catch;
bot.catch = (error, ctx) => {
    errorCount++;
    console.error(`🔴 Global Error #${errorCount}:`, error.message);
    
    // Reset error count periodically
    setTimeout(() => {
        if (errorCount > 0) errorCount--;
    }, ERROR_RESET_INTERVAL);
    
    // If too many errors, suggest restart
    if (errorCount >= MAX_ERRORS_BEFORE_RESTART) {
        console.error('🚨 CRITICAL: Too many errors, bot may be stuck');
        
        // Notify admins (excluding muted ones)
        notifyAdmin(`🚨 <b>Bot Error Alert</b>\n\nToo many errors detected (${errorCount}).\nBot may be stuck in error loop.\n\nUse /admin to access admin panel and check status.`);
    }
    
    // Call original handler
    if (originalErrorHandler) {
        originalErrorHandler(error, ctx);
    }
};

// ==========================================
// START BOT
// ==========================================

async function startBot() {
    try {
        console.log('🚀 Starting bot...');
        
        // Connect to database
        const dbConnected = await connectDB();
        if (!dbConnected) {
            console.error('❌ Failed to connect to database');
            // Try to reconnect
            setTimeout(startBot, 5000);
            return;
        }
        
        // Initialize bot settings
        await initBot();
        
        // Start bot
        await bot.launch({
            dropPendingUpdates: true,
            allowedUpdates: [
                'message',
                'callback_query',
                'chat_join_request'
            ]
        });
        
        console.log('🤖 Bot is running...');
        
        // Enable graceful stop
        process.once('SIGINT', () => {
            console.log('🛑 SIGINT received, shutting down gracefully...');
            bot.stop('SIGINT');
            if (client) client.close();
            process.exit(0);
        });
        
        process.once('SIGTERM', () => {
            console.log('🛑 SIGTERM received, shutting down gracefully...');
            bot.stop('SIGTERM');
            if (client) client.close();
            process.exit(0);
        });
        
        // Send a test message to verify bot is working
        const testAdminId = 8435248854;
        try {
            await bot.telegram.sendMessage(testAdminId, 
                '🤖 *Bot Started Successfully!*\n\n' +
                '💰 *Earning Bot Features:*\n' +
                '• User Registration & Verification\n' +
                '• Channel Management with Levels\n' +
                '• Task System with Approval\n' +
                '• Referral System\n' +
                '• Gift Codes\n' +
                '• Withdrawal System\n' +
                '• Bonus System\n' +
                '• Admin Panel with Full Control\n\n' +
                '🚀 Bot is ready to earn!',
                { parse_mode: 'HTML' }
            );
            console.log('✅ Test message sent to admin');
        } catch (error) {
            console.log('⚠️ Could not send test message, but bot is running');
        }
        
    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        // Try to restart after delay
        setTimeout(startBot, 10000);
    }
}

// Start the bot
startBot();

// Handle Railway port binding
const PORT = process.env.PORT || 3000;
if (process.env.RAILWAY_ENVIRONMENT || process.env.PORT) {
    const http = require('http');
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('🤖 Earning Bot is running...');
    });
    
    server.listen(PORT, () => {
        console.log(`🚂 Server listening on port ${PORT}`);
    });
}

console.log('🚀 Earning Bot Starting...');
