const { Telegraf, Scenes, session, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// ==========================================
// CONFIGURATION
// ==========================================

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dneusgyzc',
  api_key: process.env.CLOUDINARY_API_KEY || '474713292161728',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'DHJmvD784FEVmeOt1-K8XeNhCQQ'
});

// Initialize bot
const BOT_TOKEN = process.env.BOT_TOKEN || '8295150408:AAHk4M0LX0YAUk4vDuSCi4mOFg6se66J3hM';
const bot = new Telegraf(BOT_TOKEN);

// MongoDB connection with Railway fix
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://sandip102938:Q1g2Fbn7ewNqEvuK@test.ebvv4hf.mongodb.net/earningbot?retryWrites=true&w=majority';
let db, client;

// Fix for Railway MongoDB connection
async function connectDB() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        
        // Parse connection string to handle different formats
        let connectionString = mongoUri;
        
        // Remove any problematic parameters that might cause SRV issues
        if (connectionString.includes('mongodb+srv://')) {
            // Ensure proper formatting for SRV connections
            if (!connectionString.includes('?retryWrites')) {
                connectionString += '?retryWrites=true&w=majority';
            }
        }
        
        console.log('Connection string:', connectionString.substring(0, 50) + '...');
        
        client = new MongoClient(connectionString, {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 15000,
            socketTimeoutMS: 20000,
            maxPoolSize: 20,
            minPoolSize: 5,
            retryWrites: true,
            w: 'majority'
        });
        
        await client.connect();
        db = client.db();
        
        // Test connection with a ping
        await db.command({ ping: 1 });
        console.log('✅ Connected to MongoDB successfully!');
        
        // Create indexes
        await createIndexes();
        
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        console.error('Full error:', error);
        
        // Try alternative connection method
        try {
            console.log('🔄 Trying alternative connection method...');
            
            // For Railway/Heroku, sometimes direct connection works better
            const altClient = new MongoClient(mongoUri, {
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 10000
            });
            
            await altClient.connect();
            db = altClient.db();
            await db.command({ ping: 1 });
            console.log('✅ Connected via alternative method!');
            client = altClient;
            return true;
        } catch (altError) {
            console.error('❌ Alternative connection also failed:', altError.message);
            return false;
        }
    }
}

async function createIndexes() {
    try {
        await db.collection('users').createIndex({ userId: 1 }, { unique: true });
        await db.collection('users').createIndex({ referCode: 1 }, { unique: true, sparse: true });
        await db.collection('users').createIndex({ referredBy: 1 });
        await db.collection('users').createIndex({ balance: -1 });
        await db.collection('users').createIndex({ joinedAt: -1 });
        
        await db.collection('transactions').createIndex({ userId: 1 });
        await db.collection('transactions').createIndex({ type: 1 });
        await db.collection('transactions').createIndex({ createdAt: -1 });
        
        await db.collection('gift_codes').createIndex({ code: 1 }, { unique: true });
        await db.collection('gift_codes').createIndex({ expiresAt: 1 });
        await db.collection('gift_codes').createIndex({ isActive: 1 });
        
        await db.collection('withdrawals').createIndex({ userId: 1 });
        await db.collection('withdrawals').createIndex({ status: 1 });
        await db.collection('withdrawals').createIndex({ createdAt: -1 });
        await db.collection('withdrawals').createIndex({ txnId: 1 }, { unique: true, sparse: true });
        
        await db.collection('tasks').createIndex({ isActive: 1 });
        await db.collection('tasks').createIndex({ createdAt: -1 });
        
        await db.collection('task_submissions').createIndex({ userId: 1 });
        await db.collection('task_submissions').createIndex({ taskId: 1 });
        await db.collection('task_submissions').createIndex({ status: 1 });
        await db.collection('task_submissions').createIndex({ createdAt: -1 });
        
        await db.collection('admin').createIndex({ type: 1 }, { unique: true });
        
        console.log('✅ Database indexes created');
    } catch (error) {
        console.error('❌ Error creating indexes:', error);
    }
}

// ==========================================
// SCENES SETUP
// ==========================================

const stage = new Scenes.Stage([]);
bot.use(session());
bot.use(stage.middleware());

// Scene handler factory
function createScene(sceneId) {
    return new Scenes.BaseScene(sceneId);
}

// Define all scenes
const scenes = {
    // User scenes
    setWallet: createScene('set_wallet_scene'),
    withdrawAmount: createScene('withdraw_amount_scene'),
    enterGiftCode: createScene('enter_gift_code_scene'),
    uploadTaskSS1: createScene('upload_task_ss1_scene'),
    uploadTaskSS2: createScene('upload_task_ss2_scene'),
    uploadTaskSS3: createScene('upload_task_ss3_scene'),
    
    // Admin scenes
    broadcast: createScene('broadcast_scene'),
    contactUserMessage: createScene('contact_user_message_scene'),
    editStartImage: createScene('edit_start_image_scene'),
    editStartMessage: createScene('edit_start_message_scene'),
    editMenuImage: createScene('edit_menu_image_scene'),
    editMenuMessage: createScene('edit_menu_message_scene'),
    editTimer: createScene('edit_timer_scene'),
    reorderChannels: createScene('reorder_channels_scene'),
    reorderApps: createScene('reorder_apps_scene'),
    editChannelSelect: createScene('edit_channel_select_scene'),
    editChannelDetails: createScene('edit_channel_details_scene'),
    editAppSelect: createScene('edit_app_select_scene'),
    editAppDetails: createScene('edit_app_details_scene'),
    reportToAdmin: createScene('report_to_admin_scene'),
    addAdmin: createScene('add_admin_scene'),
    manageImages: createScene('manage_images_scene'),
    imageOverlay: createScene('image_overlay_scene'),
    htmlGuide: createScene('html_guide_scene'),
    
    // New scenes for refer & earn features
    createGiftCode: createScene('create_gift_code_scene'),
    editGiftCode: createScene('edit_gift_code_scene'),
    setBonusAmount: createScene('set_bonus_amount_scene'),
    editBonusImage: createScene('edit_bonus_image_scene'),
    addTask: createScene('add_task_scene'),
    editTask: createScene('edit_task_scene'),
    searchUsers: createScene('search_users_scene'),
    searchWithdrawals: createScene('search_withdrawals_scene'),
    processWithdrawal: createScene('process_withdrawal_scene'),
    reviewTask: createScene('review_task_scene'),
    setReferSettings: createScene('set_refer_settings_scene'),
    setAdminCode: createScene('set_admin_code_scene'),
    
    // Channel management scenes
    manageChannelVisibility: createScene('manage_channel_visibility_scene'),
    manageChannelShow: createScene('manage_channel_show_scene'),
    manageChannelAutoAccept: createScene('manage_channel_auto_accept_scene'),
    manageChannelNeedJoin: createScene('manage_channel_need_join_scene'),
    
    // Add channel scenes
    addChannelType: createScene('add_channel_type_scene'),
    addPublicChannelName: createScene('add_public_channel_name_scene'),
    addPublicChannelId: createScene('add_public_channel_id_scene'),
    addPublicChannelLink: createScene('add_public_channel_link_scene'),
    addPrivateChannelName: createScene('add_private_channel_name_scene'),
    addPrivateChannelId: createScene('add_private_channel_id_scene'),
    addPrivateChannelLink: createScene('add_private_channel_link_scene'),
};

// Register all scenes
Object.values(scenes).forEach(scene => stage.register(scene));

// ==========================================
// ADMIN CONFIGURATION
// ==========================================

const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [8435248854, 5518423310];
const ADMIN_CODE = process.env.ADMIN_CODE || 'ADMIN123';

// Default configurations
const DEFAULT_CONFIG = {
    startImage: 'https://res.cloudinary.com/dneusgyzc/image/upload/v1763670359/1000106281_cfg1ke.jpg',
    startMessage: '👋 *Welcome to Earning Bot!*\n\n💰 *Earn money by completing tasks and referring friends*\n\n⚠️ _To access earning features, please join our channels first:_',
    menuImage: 'https://res.cloudinary.com/dneusgyzc/image/upload/v1763670359/1000106281_cfg1ke.jpg',
    menuMessage: '🎉 *Welcome to Earning Dashboard!*\n\n💰 *Balance:* {balance} ₹\n👥 *Referrals:* {referralCount}\n\nSelect an option below:',
    codeTimer: 7200, // 2 hours in seconds
    minWithdrawal: 100,
    maxWithdrawal: 10000,
    bonusAmount: 10,
    bonusImage: 'https://res.cloudinary.com/dneusgyzc/image/upload/v1763670359/1000106281_cfg1ke.jpg',
    referBonus: 50,
    minReferBonus: 10,
    maxReferBonus: 500,
    adminCode: ADMIN_CODE,
    showContactButton: true,
    bonusEnabled: true,
    tasksEnabled: true,
    withdrawalsEnabled: true,
    channels: [],
    giftCodes: [],
    tasks: [],
    uploadedImages: [],
    imageOverlaySettings: {
        startImage: true,
        menuImage: true,
        bonusImage: true
    },
    channelSettings: {
        hiddenChannels: [],
        showOnlyChannels: [],
        autoAcceptChannels: [],
        needJoinChannels: []
    }
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Error cooldown system
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

// Emergency stop command
bot.command('emergency', async (ctx) => {
    console.log('🆘 Emergency stop triggered by:', ctx.from.id);
    errorCooldowns.clear();
    await ctx.reply('🆘 Emergency error reset executed. Bot should respond now.');
    
    setTimeout(async () => {
        await ctx.reply('✅ Bot is now responsive. Try /start or /admin');
    }, 1000);
});

// Generate random refer code (5 alphanumeric characters)
function generateReferCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Generate random transaction ID (7 alphanumeric characters)
function generateTxnId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 7; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

// Generate random gift code
function generateGiftCode(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
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

// Format message for display (remove escaping for HTML)
function formatMessageForDisplay(text) {
    if (!text) return '';
    return text.toString()
        .replace(/\\_/g, '_')
        .replace(/\\*/g, '*')
        .replace(/\\\[/g, '[')
        .replace(/\\\]/g, ']')
        .replace(/\\(/g, '(')
        .replace(/\\)/g, ')')
        .replace(/\\~/g, '~')
        .replace(/\\`/g, '`')
        .replace(/\\>/g, '>')
        .replace(/\\#/g, '#')
        .replace(/\\+/g, '+')
        .replace(/\\-/g, '-')
        .replace(/\\=/g, '=')
        .replace(/\\|/g, '|')
        .replace(/\\{/g, '{')
        .replace(/\\}/g, '}')
        .replace(/\\./g, '.')
        .replace(/\\!/g, '!');
}

// Safe send message with HTML parse mode
async function safeSendMessage(ctx, text, options = {}) {
    try {
        return await ctx.reply(text, { 
            parse_mode: 'HTML',
            ...options 
        });
    } catch (error) {
        console.error('Error sending message:', error.message);
        // Try without HTML parsing
        return await ctx.reply(text, options);
    }
}

// Safe edit message with HTML parse mode
async function safeEditMessage(ctx, text, options = {}) {
    try {
        return await ctx.editMessageText(text, { 
            parse_mode: 'HTML',
            ...options 
        });
    } catch (error) {
        console.error('Error editing message:', error.message);
        // Try without HTML parsing
        return await ctx.editMessageText(text, options);
    }
}

// Get active admins (exclude muted admins)
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

// Notify ALL Admins (excluding muted ones)
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
                await bot.telegram.sendMessage(adminId, text, { parse_mode: 'HTML' });
            } catch (error) {
                console.error(`Failed to notify admin ${adminId}:`, error.message);
            }
        });
        
        await Promise.allSettled(promises);
    } catch (error) {
        console.error('Error in notifyAdmin:', error);
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

// Get user variables for template replacement
function getUserVariables(user, additionalVars = {}) {
    try {
        const firstName = user.first_name || '';
        const lastName = user.last_name || '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
        
        return {
            first_name: firstName,
            last_name: lastName,
            full_name: fullName,
            username: user.username ? `@${user.username}` : 'No username',
            user_id: user.id,
            ...additionalVars
        };
    } catch (error) {
        return {
            first_name: '',
            last_name: '',
            full_name: '',
            username: '',
            user_id: user?.id || 'Unknown',
            ...additionalVars
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

// Get Cloudinary URL with name overlay
async function getCloudinaryUrlWithName(originalUrl, name, imageType = 'startImage') {
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
            if (originalUrl.includes('{name}')) {
                return originalUrl.replace(/{name}/g, name || 'User');
            }
            return originalUrl;
        }
        
        const cleanName = (name || 'User').replace(/[^\w\s\-\.]/gi, '').trim() || 'User';
        
        if (originalUrl.includes('{name}')) {
            return originalUrl.replace(/{name}/g, cleanName);
        }
        
        if (originalUrl.includes('/upload/')) {
            const parts = originalUrl.split('/upload/');
            if (parts.length === 2) {
                const transformationPart = parts[1];
                const encodedName = encodeURIComponent(cleanName);
                const textOverlay = `l_text:Stalinist%20One_140_bold:${encodedName},co_rgb:00e5ff,g_center/`;
                const newTransformation = textOverlay + transformationPart;
                return `${parts[0]}/upload/${newTransformation}`;
            }
        }
        
        return originalUrl;
    } catch (error) {
        console.error('Error in getCloudinaryUrlWithName:', error);
        return originalUrl;
    }
}

// Check if URL contains {name} variable
function hasNameVariable(url) {
    return url && url.includes('{name}');
}

// Check if image URL is valid
async function isValidImageUrl(url) {
    try {
        if (!url.startsWith('http')) return false;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
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

// Get unjoined channels for a user
async function getUnjoinedChannels(userId) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        if (!config || !config.channels || config.channels.length === 0) return [];
        
        const unjoined = [];
        const promises = config.channels.map(async (channel) => {
            // Skip hidden channels
            if (config.channelSettings?.hiddenChannels?.includes(channel.id)) {
                return;
            }
            
            // Skip "just show" channels
            if (config.channelSettings?.showOnlyChannels?.includes(channel.id)) {
                return;
            }
            
            // Only check "need join" channels
            if (!config.channelSettings?.needJoinChannels?.includes(channel.id)) {
                return;
            }
            
            try {
                const member = await bot.telegram.getChatMember(channel.id, userId);
                if (member.status === 'left' || member.status === 'kicked') {
                    unjoined.push(channel);
                }
            } catch (error) {
                unjoined.push(channel);
            }
        });
        
        await Promise.allSettled(promises);
        return unjoined;
    } catch (error) {
        console.error('Error in getUnjoinedChannels:', error);
        return [];
    }
}

// Get channels to display in start screen
async function getChannelsToDisplay(userId) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        if (!config || !config.channels || config.channels.length === 0) return [];
        
        const channelsToDisplay = [];
        const promises = config.channels.map(async (channel) => {
            // Skip hidden channels
            if (config.channelSettings?.hiddenChannels?.includes(channel.id)) {
                return;
            }
            
            // Always show "just show" channels
            if (config.channelSettings?.showOnlyChannels?.includes(channel.id)) {
                channelsToDisplay.push(channel);
                return;
            }
            
            // For "need join" channels, check if user has joined
            if (config.channelSettings?.needJoinChannels?.includes(channel.id)) {
                let userHasJoined = false;
                
                try {
                    const member = await bot.telegram.getChatMember(channel.id, userId);
                    if (member.status !== 'left' && member.status !== 'kicked') {
                        userHasJoined = true;
                    }
                } catch (error) {
                    // Can't check membership
                }
                
                if (!userHasJoined) {
                    channelsToDisplay.push(channel);
                }
            }
        });
        
        await Promise.allSettled(promises);
        return channelsToDisplay;
    } catch (error) {
        console.error('Error in getChannelsToDisplay:', error);
        return [];
    }
}

// Add transaction to user history
async function addTransaction(userId, amount, type, description = '') {
    try {
        const transaction = {
            userId: userId,
            amount: amount,
            type: type, // 'credit', 'debit', 'referral', 'bonus', 'task', 'withdrawal'
            description: description,
            txnId: generateTxnId(),
            createdAt: new Date()
        };
        
        await db.collection('transactions').insertOne(transaction);
        
        // Update user balance
        if (type === 'credit' || type === 'referral' || type === 'bonus' || type === 'task') {
            await db.collection('users').updateOne(
                { userId: userId },
                { $inc: { balance: amount } }
            );
        } else if (type === 'debit' || type === 'withdrawal') {
            await db.collection('users').updateOne(
                { userId: userId },
                { $inc: { balance: -amount } }
            );
        }
        
        return transaction;
    } catch (error) {
        console.error('Error adding transaction:', error);
        throw error;
    }
}

// Get user transactions
async function getUserTransactions(userId, limit = 15) {
    try {
        return await db.collection('transactions')
            .find({ userId: userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .toArray();
    } catch (error) {
        console.error('Error getting transactions:', error);
        return [];
    }
}

// Get user referrals
async function getUserReferrals(userId, page = 1, limit = 20) {
    try {
        const skip = (page - 1) * limit;
        const referrals = await db.collection('users')
            .find({ referredBy: userId })
            .sort({ joinedAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        const totalReferrals = await db.collection('users').countDocuments({ referredBy: userId });
        const totalPages = Math.ceil(totalReferrals / limit);
        
        return {
            referrals,
            page,
            totalPages,
            totalReferrals,
            hasNext: page < totalPages,
            hasPrev: page > 1
        };
    } catch (error) {
        console.error('Error getting referrals:', error);
        return { referrals: [], page: 1, totalPages: 0, totalReferrals: 0, hasNext: false, hasPrev: false };
    }
}

// Get paginated users
async function getPaginatedUsers(page = 1, limit = 20) {
    try {
        const skip = (page - 1) * limit;
        const users = await db.collection('users')
            .find({})
            .sort({ joinedAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        const totalUsers = await db.collection('users').countDocuments();
        const totalPages = Math.ceil(totalUsers / limit);
        
        return {
            users,
            page,
            totalPages,
            totalUsers,
            hasNext: page < totalPages,
            hasPrev: page > 1
        };
    } catch (error) {
        console.error('Error getting paginated users:', error);
        return { users: [], page: 1, totalPages: 0, totalUsers: 0, hasNext: false, hasPrev: false };
    }
}

// Search users
async function searchUsers(query) {
    try {
        const users = await db.collection('users').find({
            $or: [
                { userId: { $regex: query, $options: 'i' } },
                { username: { $regex: query, $options: 'i' } },
                { firstName: { $regex: query, $options: 'i' } },
                { lastName: { $regex: query, $options: 'i' } },
                { referCode: { $regex: query, $options: 'i' } }
            ]
        }).limit(50).toArray();
        
        return users;
    } catch (error) {
        console.error('Error searching users:', error);
        return [];
    }
}

// ==========================================
// DATABASE INITIALIZATION
// ==========================================

async function initBot() {
    try {
        // Check if config exists
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        if (!config) {
            await db.collection('admin').insertOne({
                type: 'config',
                admins: ADMIN_IDS,
                mutedAdmins: [],
                adminCode: ADMIN_CODE,
                startImage: DEFAULT_CONFIG.startImage,
                startMessage: DEFAULT_CONFIG.startMessage,
                menuImage: DEFAULT_CONFIG.menuImage,
                menuMessage: DEFAULT_CONFIG.menuMessage,
                codeTimer: DEFAULT_CONFIG.codeTimer,
                minWithdrawal: DEFAULT_CONFIG.minWithdrawal,
                maxWithdrawal: DEFAULT_CONFIG.maxWithdrawal,
                bonusAmount: DEFAULT_CONFIG.bonusAmount,
                bonusImage: DEFAULT_CONFIG.bonusImage,
                referBonus: DEFAULT_CONFIG.referBonus,
                minReferBonus: DEFAULT_CONFIG.minReferBonus,
                maxReferBonus: DEFAULT_CONFIG.maxReferBonus,
                showContactButton: DEFAULT_CONFIG.showContactButton,
                bonusEnabled: DEFAULT_CONFIG.bonusEnabled,
                tasksEnabled: DEFAULT_CONFIG.tasksEnabled,
                withdrawalsEnabled: DEFAULT_CONFIG.withdrawalsEnabled,
                channels: DEFAULT_CONFIG.channels,
                giftCodes: DEFAULT_CONFIG.giftCodes,
                tasks: DEFAULT_CONFIG.tasks,
                uploadedImages: DEFAULT_CONFIG.uploadedImages,
                imageOverlaySettings: DEFAULT_CONFIG.imageOverlaySettings,
                channelSettings: DEFAULT_CONFIG.channelSettings,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            
            console.log('✅ Created new bot configuration');
        } else {
            // Update with new fields if missing
            const updates = {};
            if (!config.adminCode) updates.adminCode = ADMIN_CODE;
            if (!config.minWithdrawal) updates.minWithdrawal = DEFAULT_CONFIG.minWithdrawal;
            if (!config.maxWithdrawal) updates.maxWithdrawal = DEFAULT_CONFIG.maxWithdrawal;
            if (!config.bonusAmount) updates.bonusAmount = DEFAULT_CONFIG.bonusAmount;
            if (!config.bonusImage) updates.bonusImage = DEFAULT_CONFIG.bonusImage;
            if (!config.referBonus) updates.referBonus = DEFAULT_CONFIG.referBonus;
            if (!config.minReferBonus) updates.minReferBonus = DEFAULT_CONFIG.minReferBonus;
            if (!config.maxReferBonus) updates.maxReferBonus = DEFAULT_CONFIG.maxReferBonus;
            if (config.bonusEnabled === undefined) updates.bonusEnabled = DEFAULT_CONFIG.bonusEnabled;
            if (config.tasksEnabled === undefined) updates.tasksEnabled = DEFAULT_CONFIG.tasksEnabled;
            if (config.withdrawalsEnabled === undefined) updates.withdrawalsEnabled = DEFAULT_CONFIG.withdrawalsEnabled;
            if (!config.channelSettings) updates.channelSettings = DEFAULT_CONFIG.channelSettings;
            
            if (Object.keys(updates).length > 0) {
                updates.updatedAt = new Date();
                await db.collection('admin').updateOne(
                    { type: 'config' },
                    { $set: updates }
                );
                console.log('✅ Updated bot configuration with new fields');
            } else {
                console.log('✅ Loaded existing bot configuration');
            }
        }
        
        console.log(`✅ Bot initialized with ${ADMIN_IDS.length} default admins`);
        return true;
    } catch (error) {
        console.error('❌ Error initializing bot:', error);
        return false;
    }
}

// ==========================================
// USER FLOW - START COMMAND
// ==========================================

bot.start(async (ctx) => {
    try {
        // Check if bot is disabled
        const config = await db.collection('admin').findOne({ type: 'config' });
        const botDisabled = config?.botDisabled || false;
        
        if (botDisabled) {
            const disabledMessage = config?.disabledMessage || '🚧 Bot is under maintenance. \n Please check back later.';
            await safeSendMessage(ctx, disabledMessage, {
                parse_mode: 'HTML'
            });
            return;
        }
        
        const user = ctx.from;
        const userId = user.id;
        const startPayload = ctx.startPayload; // Get referral code from start payload
        
        // Check if user exists
        let userData = await db.collection('users').findOne({ userId: userId });
        
        if (!userData) {
            // Generate refer code for new user
            let referCode;
            let isUnique = false;
            
            while (!isUnique) {
                referCode = generateReferCode();
                const existing = await db.collection('users').findOne({ referCode: referCode });
                if (!existing) isUnique = true;
            }
            
            // Check if referred by someone
            let referredBy = null;
            if (startPayload) {
                const referrer = await db.collection('users').findOne({ referCode: startPayload });
                if (referrer) {
                    referredBy = referrer.userId;
                    
                    // Add referral bonus to referrer
                    const referBonus = config?.referBonus || DEFAULT_CONFIG.referBonus;
                    await addTransaction(referrer.userId, referBonus, 'referral', `Referral bonus for ${user.first_name || 'new user'}`);
                    
                    // Notify referrer
                    try {
                        await bot.telegram.sendMessage(
                            referrer.userId,
                            `🎉 *New Referral!*\n\n👤 ${user.first_name || 'User'} joined using your referral link!\n💰 You earned ${referBonus} ₹ referral bonus!`,
                            { parse_mode: 'Markdown' }
                        );
                    } catch (error) {
                        console.error('Failed to notify referrer:', error);
                    }
                }
            }
            
            // Create new user
            userData = {
                userId: userId,
                firstName: user.first_name,
                lastName: user.last_name,
                username: user.username,
                referCode: referCode,
                referredBy: referredBy,
                balance: 0,
                wallet: '',
                totalEarned: 0,
                totalWithdrawn: 0,
                referralCount: 0,
                joinedAll: false,
                joinedAt: new Date(),
                lastActive: new Date(),
                codeTimestamps: {}
            };
            
            await db.collection('users').insertOne(userData);
            
            // Notify admins about new user
            const userLink = user.username ? `@${user.username}` : user.first_name || 'Unknown';
            const referInfo = referredBy ? ` (Referred by: ${referredBy})` : '';
            await notifyAdmin(`🆕 <b>New User Joined</b>\n\n👤 User: ${userLink}\n🆔 ID: <code>${userId}</code>\n📝 Refer Code: <code>${referCode}</code>${referInfo}`);
        } else {
            // Update last active
            await db.collection('users').updateOne(
                { userId: userId },
                { $set: { lastActive: new Date() } }
            );
        }
        
        // Show start screen
        await showStartScreen(ctx);
    } catch (error) {
        console.error('Start command error:', error);
        ctx.session.lastError = {
            command: '/start',
            error: error.message
        };
        
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.', {
            reply_markup: {
                inline_keyboard: [[
                    { text: '📞 Contact Admin', callback_data: 'contact_admin' },
                    { text: '🔄 Try Again', callback_data: 'back_to_start' }
                ]]
            }
        });
    }
});

// Show Start Screen
async function showStartScreen(ctx) {
    try {
        const user = ctx.from;
        const userId = user.id;
        
        // Get configuration
        const [config, channelsToDisplay] = await Promise.all([
            db.collection('admin').findOne({ type: 'config' }),
            getChannelsToDisplay(userId)
        ]);
        
        // Prepare user variables
        const userVars = getUserVariables(user);
        
        // Prepare image URL with name
        let startImage = config?.startImage || DEFAULT_CONFIG.startImage;
        const imagePromise = getCloudinaryUrlWithName(startImage, userVars.full_name, 'startImage');
        
        // Prepare message
        let startMessage = config?.startMessage || DEFAULT_CONFIG.startMessage;
        startMessage = replaceVariables(startMessage, userVars);
        
        // Create channel buttons (2 per row)
        const buttons = [];
        
        if (channelsToDisplay.length > 0) {
            // Group channels 2 per row
            for (let i = 0; i < channelsToDisplay.length; i += 2) {
                const row = [];
                
                // First channel
                const channel1 = channelsToDisplay[i];
                const buttonText1 = `🔗 ${channel1.buttonLabel || channel1.title}`;
                row.push({ text: buttonText1, url: channel1.link });
                
                // Second channel if exists
                if (i + 1 < channelsToDisplay.length) {
                    const channel2 = channelsToDisplay[i + 1];
                    const buttonText2 = `🔗 ${channel2.buttonLabel || channel2.title}`;
                    row.push({ text: buttonText2, url: channel2.link });
                }
                
                buttons.push(row);
            }
            
            // Add verify button
            buttons.push([{ text: '✅ Check Joined', callback_data: 'check_joined' }]);
        } else {
            // All channels joined - show menu button
            buttons.push([{ text: '🎮 Go to Menu', callback_data: 'go_to_menu' }]);
        }
        
        // Add contact button if enabled
        if (config?.showContactButton !== false) {
            buttons.push([{ text: '📞 Contact Admin', callback_data: 'contact_admin' }]);
        }
        
        // Get the actual image URL
        startImage = await imagePromise;
        
        await ctx.replyWithPhoto(startImage, {
            caption: startMessage,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons }
        });
        
    } catch (error) {
        console.error('Show start screen error:', error);
        ctx.session.lastError = {
            function: 'showStartScreen',
            error: error.message
        };
        
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.', {
            reply_markup: {
                inline_keyboard: [[
                    { text: '📞 Contact Admin', callback_data: 'contact_admin' },
                    { text: '🔄 Try Again', callback_data: 'back_to_start' }
                ]]
            }
        });
    }
}

// Check Joined button
bot.action('check_joined', async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        
        const userId = ctx.from.id;
        const unjoinedChannels = await getUnjoinedChannels(userId);
        
        if (unjoinedChannels.length > 0) {
            await safeSendMessage(ctx, '⚠️ Please join all required channels first!');
            await showStartScreen(ctx);
        } else {
            // Update user status
            await db.collection('users').updateOne(
                { userId: userId },
                { $set: { joinedAll: true } }
            );
            
            await safeSendMessage(ctx, '✅ All channels joined! Taking you to menu...');
            await showMainMenu(ctx);
        }
    } catch (error) {
        console.error('Check joined error:', error);
        await ctx.answerCbQuery('❌ Error checking channels');
    }
});

// Go to Menu button
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
// MAIN MENU - Keyboard Layout
// ==========================================

async function showMainMenu(ctx) {
    try {
        const user = ctx.from;
        const userId = user.id;
        
        // First check if user has joined all required channels
        const unjoinedChannels = await getUnjoinedChannels(userId);
        if (unjoinedChannels.length > 0) {
            await db.collection('users').updateOne(
                { userId: userId },
                { $set: { joinedAll: false } }
            );
            
            await safeSendMessage(ctx, '⚠️ Please join all required channels first!', {
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
            { $set: { joinedAll: true, lastActive: new Date() } }
        );
        
        // Get user data
        const userData = await db.collection('users').findOne({ userId: userId });
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        // Prepare user variables
        const userVars = getUserVariables(user, {
            balance: userData?.balance || 0,
            referralCount: userData?.referralCount || 0,
            referCode: userData?.referCode || 'N/A'
        });
        
        // Prepare image URL with name
        let menuImage = config?.menuImage || DEFAULT_CONFIG.menuImage;
        menuImage = await getCloudinaryUrlWithName(menuImage, userVars.full_name, 'menuImage');
        
        // Prepare message
        let menuMessage = config?.menuMessage || DEFAULT_CONFIG.menuMessage;
        menuMessage = replaceVariables(menuMessage, userVars);
        
        // Send image with caption
        await ctx.replyWithPhoto(menuImage, {
            caption: menuMessage,
            parse_mode: 'HTML'
        });
        
        // Create main keyboard
        const keyboard = Markup.keyboard([
            ['💰 Balance', '👤 Profile'],
            ['📤 Withdraw', '💳 Set Wallet'],
            ['📢 Refer & Earn', '🎁 Bonus'],
            ['📋 Tasks', '🎫 Gift Code'],
            ['📞 Contact Admin', '🔙 Back to Start']
        ]).resize();
        
        await safeSendMessage(ctx, '🎛️ *Main Menu*\n\nSelect an option:', {
            parse_mode: 'Markdown',
            reply_markup: keyboard.reply_markup
        });
        
    } catch (error) {
        console.error('Show main menu error:', error);
        ctx.session.lastError = {
            function: 'showMainMenu',
            error: error.message
        };
        
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.', {
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Start', callback_data: 'back_to_start' },
                    { text: '📞 Contact Admin', callback_data: 'contact_admin' }
                ]]
            }
        });
    }
}

// ==========================================
// MAIN MENU HANDLERS
// ==========================================

// Balance
bot.hears('💰 Balance', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const userData = await db.collection('users').findOne({ userId: userId });
        const transactions = await getUserTransactions(userId, 15);
        
        let balanceText = `💰 *Your Balance*\n\n`;
        balanceText += `🪙 Current Balance: *${userData?.balance || 0} ₹*\n`;
        balanceText += `📈 Total Earned: *${userData?.totalEarned || 0} ₹*\n`;
        balanceText += `📤 Total Withdrawn: *${userData?.totalWithdrawn || 0} ₹*\n\n`;
        balanceText += `📜 *Recent Transactions (Last 15)*\n\n`;
        
        if (transactions.length === 0) {
            balanceText += `No transactions yet.\n`;
        } else {
            transactions.forEach((txn, index) => {
                const sign = txn.type === 'credit' || txn.type === 'referral' || txn.type === 'bonus' || txn.type === 'task' ? '+' : '-';
                const emoji = txn.type === 'credit' ? '💳' : 
                             txn.type === 'referral' ? '👥' : 
                             txn.type === 'bonus' ? '🎁' : 
                             txn.type === 'task' ? '✅' : 
                             txn.type === 'withdrawal' ? '📤' : '💰';
                
                balanceText += `${emoji} ${sign}${txn.amount} ₹ - ${txn.description}\n`;
                balanceText += `   📅 ${new Date(txn.createdAt).toLocaleDateString()}\n\n`;
            });
        }
        
        await safeSendMessage(ctx, balanceText, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                ]]
            }
        });
    } catch (error) {
        console.error('Balance error:', error);
        await safeSendMessage(ctx, '❌ Error fetching balance.');
    }
});

// Profile
bot.hears('👤 Profile', async (ctx) => {
    try {
        const user = ctx.from;
        const userId = user.id;
        const userData = await db.collection('users').findOne({ userId: userId });
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        // Prepare profile image
        let profileImage = config?.startImage || DEFAULT_CONFIG.startImage;
        profileImage = await getCloudinaryUrlWithName(profileImage, user.first_name || 'User', 'startImage');
        
        // Create profile text
        let profileText = `👤 *User Profile*\n\n`;
        profileText += `🆔 User ID: \`${userId}\`\n`;
        profileText += `👤 Name: ${user.first_name || ''} ${user.last_name || ''}\n`;
        profileText += `📧 Username: ${user.username ? '@' + user.username : 'Not set'}\n`;
        profileText += `💰 Balance: ${userData?.balance || 0} ₹\n`;
        profileText += `📊 Referrals: ${userData?.referralCount || 0}\n`;
        profileText += `🎫 Refer Code: \`${userData?.referCode || 'N/A'}\`\n`;
        profileText += `🔗 Refer Link: https://t.me/${ctx.botInfo.username}?start=${userData?.referCode || ''}\n`;
        profileText += `📅 Joined: ${userData?.joinedAt ? new Date(userData.joinedAt).toLocaleDateString() : 'Recently'}\n`;
        
        await ctx.replyWithPhoto(profileImage, {
            caption: profileText,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '📢 Share Refer Link', switch_inline_query: `Join using my refer code: ${userData?.referCode || ''}` }
                ], [
                    { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                ]]
            }
        });
    } catch (error) {
        console.error('Profile error:', error);
        await safeSendMessage(ctx, '❌ Error loading profile.');
    }
});

// Withdraw
bot.hears('📤 Withdraw', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const userData = await db.collection('users').findOne({ userId: userId });
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        // Check if withdrawals are enabled
        if (config?.withdrawalsEnabled === false) {
            await safeSendMessage(ctx, '⚠️ Withdrawals are currently disabled. Please check back later.', {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                    ]]
                }
            });
            return;
        }
        
        // Check wallet
        if (!userData?.wallet) {
            await safeSendMessage(ctx, '💳 Please set your wallet UPI ID first!', {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '💳 Set Wallet', callback_data: 'set_wallet' },
                        { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                    ]]
                }
            });
            return;
        }
        
        // Check balance
        const balance = userData.balance || 0;
        const minWithdrawal = config?.minWithdrawal || DEFAULT_CONFIG.minWithdrawal;
        
        if (balance < minWithdrawal) {
            await safeSendMessage(ctx, `❌ Minimum withdrawal amount is ${minWithdrawal} ₹\n\nYour balance: ${balance} ₹`, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                    ]]
                }
            });
            return;
        }
        
        const maxWithdrawal = config?.maxWithdrawal || DEFAULT_CONFIG.maxWithdrawal;
        
        await safeSendMessage(ctx, `📤 *Withdraw Funds*\n\n💰 Your Balance: *${balance} ₹*\n💳 Your UPI: \`${userData.wallet}\`\n\n📝 Minimum: *${minWithdrawal} ₹*\n📝 Maximum: *${maxWithdrawal} ₹*\n\nEnter the amount you want to withdraw:\n\nType "cancel" to cancel.`, {
            parse_mode: 'Markdown'
        });
        
        // Enter withdrawal scene
        await ctx.scene.enter('withdraw_amount_scene');
        
    } catch (error) {
        console.error('Withdraw error:', error);
        await safeSendMessage(ctx, '❌ Error processing withdrawal.');
    }
});

// Set Wallet
bot.hears('💳 Set Wallet', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const userData = await db.collection('users').findOne({ userId: userId });
        
        const currentWallet = userData?.wallet || 'Not set';
        
        await safeSendMessage(ctx, `💳 *Set Your Wallet*\n\nCurrent UPI ID: \`${currentWallet}\`\n\nPlease send your UPI ID (e.g., username@upi):\n\nType "cancel" to cancel.`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '❌ Remove Wallet', callback_data: 'remove_wallet' },
                    { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                ]]
            }
        });
        
        // Enter set wallet scene
        await ctx.scene.enter('set_wallet_scene');
        
    } catch (error) {
        console.error('Set wallet error:', error);
        await safeSendMessage(ctx, '❌ Error setting wallet.');
    }
});

// Remove Wallet callback
bot.action('remove_wallet', async (ctx) => {
    try {
        const userId = ctx.from.id;
        
        await db.collection('users').updateOne(
            { userId: userId },
            { $set: { wallet: '' } }
        );
        
        await ctx.answerCbQuery('✅ Wallet removed successfully!');
        await safeSendMessage(ctx, '✅ Wallet removed successfully!', {
            reply_markup: {
                inline_keyboard: [[
                    { text: '💳 Set New Wallet', callback_data: 'set_wallet' },
                    { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                ]]
            }
        });
    } catch (error) {
        console.error('Remove wallet error:', error);
        await ctx.answerCbQuery('❌ Error removing wallet');
    }
});

// Set Wallet Scene
scenes.setWallet.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Wallet update cancelled.');
            await ctx.scene.leave();
            await showMainMenu(ctx);
            return;
        }
        
        const upiId = ctx.message.text.trim();
        
        // Basic UPI validation
        if (!upiId.includes('@')) {
            await safeSendMessage(ctx, '❌ Invalid UPI ID format. Please use format: username@upi\n\nTry again:');
            return;
        }
        
        const userId = ctx.from.id;
        
        await db.collection('users').updateOne(
            { userId: userId },
            { $set: { wallet: upiId } }
        );
        
        await safeSendMessage(ctx, `✅ Wallet UPI ID set to: \`${upiId}\``, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                ]]
            }
        });
        
        await ctx.scene.leave();
        
    } catch (error) {
        console.error('Set wallet scene error:', error);
        await safeSendMessage(ctx, '❌ Error setting wallet.');
        await ctx.scene.leave();
    }
});

// Withdraw Amount Scene
scenes.withdrawAmount.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Withdrawal cancelled.');
            await ctx.scene.leave();
            await showMainMenu(ctx);
            return;
        }
        
        const amount = parseFloat(ctx.message.text);
        const userId = ctx.from.id;
        const userData = await db.collection('users').findOne({ userId: userId });
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        if (isNaN(amount) || amount <= 0) {
            await safeSendMessage(ctx, '❌ Please enter a valid amount.');
            return;
        }
        
        const balance = userData.balance || 0;
        const minWithdrawal = config?.minWithdrawal || DEFAULT_CONFIG.minWithdrawal;
        const maxWithdrawal = config?.maxWithdrawal || DEFAULT_CONFIG.maxWithdrawal;
        
        if (amount < minWithdrawal) {
            await safeSendMessage(ctx, `❌ Minimum withdrawal amount is ${minWithdrawal} ₹`);
            return;
        }
        
        if (amount > maxWithdrawal) {
            await safeSendMessage(ctx, `❌ Maximum withdrawal amount is ${maxWithdrawal} ₹`);
            return;
        }
        
        if (amount > balance) {
            await safeSendMessage(ctx, `❌ Insufficient balance. Your balance: ${balance} ₹`);
            return;
        }
        
        // Create withdrawal request
        const withdrawal = {
            userId: userId,
            amount: amount,
            upiId: userData.wallet,
            status: 'pending',
            txnId: generateTxnId(),
            createdAt: new Date(),
            userInfo: {
                firstName: userData.firstName,
                lastName: userData.lastName,
                username: userData.username
            }
        };
        
        await db.collection('withdrawals').insertOne(withdrawal);
        
        // Deduct from balance
        await addTransaction(userId, amount, 'withdrawal', `Withdrawal request #${withdrawal.txnId}`);
        
        // Update total withdrawn
        await db.collection('users').updateOne(
            { userId: userId },
            { $inc: { totalWithdrawn: amount } }
        );
        
        // Notify admins
        const userLink = userData.username ? `@${userData.username}` : userData.firstName || `User ${userId}`;
        await notifyAdmin(`📤 <b>New Withdrawal Request</b>\n\n👤 User: ${userLink}\n🆔 User ID: <code>${userId}</code>\n💰 Amount: ${amount} ₹\n💳 UPI: <code>${userData.wallet}</code>\n📝 Txn ID: <code>${withdrawal.txnId}</code>\n\n<pre>Click below to process:</pre>`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ Approve', callback_data: `approve_withdrawal_${withdrawal.txnId}` },
                    { text: '❌ Reject', callback_data: `reject_withdrawal_${withdrawal.txnId}` }
                ]]
            }
        });
        
        await safeSendMessage(ctx, `✅ Withdrawal request submitted!\n\n📝 Txn ID: \`${withdrawal.txnId}\`\n💰 Amount: ${amount} ₹\n💳 UPI: \`${userData.wallet}\`\n\n⏳ Status: *Pending approval*\n\nYou will be notified once processed.`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                ]]
            }
        });
        
        await ctx.scene.leave();
        
    } catch (error) {
        console.error('Withdraw amount scene error:', error);
        await safeSendMessage(ctx, '❌ Error processing withdrawal.');
        await ctx.scene.leave();
    }
});

// Refer & Earn
bot.hears('📢 Refer & Earn', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const userData = await db.collection('users').findOne({ userId: userId });
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        const referBonus = config?.referBonus || DEFAULT_CONFIG.referBonus;
        const referLink = `https://t.me/${ctx.botInfo.username}?start=${userData?.referCode}`;
        
        let referText = `📢 *Refer & Earn*\n\n`;
        referText += `🎫 Your Refer Code: \`${userData?.referCode || 'N/A'}\`\n`;
        referText += `🔗 Your Refer Link:\n\`${referLink}\`\n\n`;
        referText += `💰 *Earn ${referBonus} ₹ for each successful referral!*\n\n`;
        referText += `📊 *How it works:*\n`;
        referText += `1. Share your refer link with friends\n`;
        referText += `2. They join using your link\n`;
        referText += `3. They complete channel verification\n`;
        referText += `4. You get ${referBonus} ₹ instantly!\n\n`;
        referText += `📈 Your Referrals: *${userData?.referralCount || 0}*\n`;
        referText += `💰 Earned from referrals: *${userData?.totalEarned || 0} ₹*\n`;
        
        await safeSendMessage(ctx, referText, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📢 Share Refer Link', switch_inline_query: `Join using my refer code: ${userData?.referCode || ''}` }],
                    [{ text: '👥 View All Referrals', callback_data: 'view_referrals_1' }],
                    [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                ]
            }
        });
    } catch (error) {
        console.error('Refer & earn error:', error);
        await safeSendMessage(ctx, '❌ Error loading refer section.');
    }
});

// View Referrals
bot.action(/^view_referrals_(\d+)$/, async (ctx) => {
    try {
        const page = parseInt(ctx.match[1]);
        const userId = ctx.from.id;
        
        const referralsData = await getUserReferrals(userId, page, 20);
        const referrals = referralsData.referrals;
        
        let referralsText = `👥 *Your Referrals (Page ${page}/${referralsData.totalPages})*\n\n`;
        referralsText += `📊 Total Referrals: *${referralsData.totalReferrals}*\n\n`;
        
        if (referrals.length === 0) {
            referralsText += `No referrals yet. Share your link to earn!\n`;
        } else {
            referrals.forEach((ref, index) => {
                const num = (page - 1) * 20 + index + 1;
                const status = ref.joinedAll ? '✅' : '❌';
                const name = ref.firstName || `User ${ref.userId}`;
                referralsText += `${num}. ${status} ${name} (${ref.username ? '@' + ref.username : 'No username'})\n`;
                referralsText += `   📅 Joined: ${new Date(ref.joinedAt).toLocaleDateString()}\n\n`;
            });
        }
        
        const keyboard = [];
        
        // Navigation buttons
        if (referralsData.hasPrev || referralsData.hasNext) {
            const navRow = [];
            if (referralsData.hasPrev) {
                navRow.push({ text: '◀️ Previous', callback_data: `view_referrals_${page - 1}` });
            }
            navRow.push({ text: `📄 ${page}/${referralsData.totalPages}`, callback_data: 'no_action' });
            if (referralsData.hasNext) {
                navRow.push({ text: 'Next ▶️', callback_data: `view_referrals_${page + 1}` });
            }
            keyboard.push(navRow);
        }
        
        keyboard.push([{ text: '🔙 Back to Refer', callback_data: 'back_to_refer' }]);
        
        if (ctx.callbackQuery) {
            await safeEditMessage(ctx, referralsText, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await safeSendMessage(ctx, referralsText, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    } catch (error) {
        console.error('View referrals error:', error);
        await ctx.answerCbQuery('❌ Error loading referrals');
    }
});

// Back to Refer
bot.action('back_to_refer', async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        await bot.hears('📢 Refer & Earn')(ctx);
    } catch (error) {
        console.error('Back to refer error:', error);
    }
});

// Bonus
bot.hears('🎁 Bonus', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        // Check if bonus is enabled
        if (config?.bonusEnabled === false) {
            await safeSendMessage(ctx, '⚠️ Bonus is currently disabled. Please check back later.', {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                    ]]
                }
            });
            return;
        }
        
        const bonusAmount = config?.bonusAmount || DEFAULT_CONFIG.bonusAmount;
        let bonusImage = config?.bonusImage || DEFAULT_CONFIG.bonusImage;
        
        // Add name overlay to bonus image
        const user = ctx.from;
        bonusImage = await getCloudinaryUrlWithName(bonusImage, user.first_name || 'User', 'bonusImage');
        
        await ctx.replyWithPhoto(bonusImage, {
            caption: `🎁 *Daily Bonus*\n\n💰 Claim ${bonusAmount} ₹ daily bonus!\n\nClick the button below to claim your bonus:`,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🎁 Claim Bonus', callback_data: 'claim_bonus' },
                    { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                ]]
            }
        });
    } catch (error) {
        console.error('Bonus error:', error);
        await safeSendMessage(ctx, '❌ Error loading bonus.');
    }
});

// Claim Bonus
bot.action('claim_bonus', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const config = await db.collection('admin').findOne({ type: 'config' });
        const bonusAmount = config?.bonusAmount || DEFAULT_CONFIG.bonusAmount;
        
        // Check last bonus claim
        const lastBonus = await db.collection('transactions').findOne({
            userId: userId,
            type: 'bonus',
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
        });
        
        if (lastBonus) {
            await ctx.answerCbQuery('⏳ You can claim bonus again in 24 hours');
            return;
        }
        
        // Add bonus transaction
        await addTransaction(userId, bonusAmount, 'bonus', 'Daily bonus claim');
        
        await ctx.answerCbQuery(`✅ ${bonusAmount} ₹ bonus claimed!`);
        
        // Update message
        await safeEditMessage(ctx, `🎁 *Bonus Claimed!*\n\n✅ You claimed ${bonusAmount} ₹ bonus!\n\n💰 Check your balance for updates.\n\n⏳ Next bonus available in 24 hours.`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                ]]
            }
        });
        
    } catch (error) {
        console.error('Claim bonus error:', error);
        await ctx.answerCbQuery('❌ Error claiming bonus');
    }
});

// Tasks
bot.hears('📋 Tasks', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        // Check if tasks are enabled
        if (config?.tasksEnabled === false) {
            await safeSendMessage(ctx, '⚠️ Tasks are currently disabled. Please check back later.', {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                    ]]
                }
            });
            return;
        }
        
        // Get active tasks
        const tasks = await db.collection('tasks')
            .find({ isActive: true })
            .sort({ createdAt: -1 })
            .limit(10)
            .toArray();
        
        if (tasks.length === 0) {
            await safeSendMessage(ctx, '📝 *Available Tasks*\n\nNo tasks available at the moment. Please check back later!', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                    ]]
                }
            });
            return;
        }
        
        let tasksText = `📝 *Available Tasks*\n\n`;
        
        tasks.forEach((task, index) => {
            tasksText += `${index + 1}. *${task.title}*\n`;
            tasksText += `   💰 Reward: ${task.reward} ₹\n`;
            tasksText += `   📊 Completed: ${task.completedCount || 0} times\n\n`;
        });
        
        // Create task buttons
        const keyboard = [];
        
        tasks.forEach((task, index) => {
            keyboard.push([{ 
                text: `${index + 1}. ${task.title} (${task.reward} ₹)`, 
                callback_data: `view_task_${task._id}` 
            }]);
        });
        
        keyboard.push([{ text: '📋 Task History', callback_data: 'task_history_1' }]);
        keyboard.push([{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]);
        
        await safeSendMessage(ctx, tasksText, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Tasks error:', error);
        await safeSendMessage(ctx, '❌ Error loading tasks.');
    }
});

// View Task
bot.action(/^view_task_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const task = await db.collection('tasks').findOne({ _id: new ObjectId(taskId) });
        
        if (!task) {
            await ctx.answerCbQuery('❌ Task not found');
            return;
        }
        
        let taskText = `📋 *${task.title}*\n\n`;
        taskText += `📝 Description:\n${task.description}\n\n`;
        taskText += `💰 Reward: *${task.reward} ₹*\n`;
        taskText += `📊 Completed: ${task.completedCount || 0} times\n`;
        taskText += `📅 Added: ${new Date(task.createdAt).toLocaleDateString()}\n\n`;
        
        if (task.instructions) {
            taskText += `📌 Instructions:\n${task.instructions}\n\n`;
        }
        
        // Check if user has already submitted this task
        const userId = ctx.from.id;
        const existingSubmission = await db.collection('task_submissions').findOne({
            userId: userId,
            taskId: taskId,
            status: { $in: ['pending', 'approved'] }
        });
        
        const keyboard = [];
        
        if (existingSubmission) {
            const statusEmoji = existingSubmission.status === 'approved' ? '✅' : '⏳';
            taskText += `📤 Your submission: ${statusEmoji} ${existingSubmission.status.toUpperCase()}\n`;
            
            if (existingSubmission.status === 'approved') {
                keyboard.push([{ text: '✅ Already Completed', callback_data: 'no_action' }]);
            } else {
                keyboard.push([{ text: '⏳ Under Review', callback_data: 'no_action' }]);
            }
        } else {
            // Add screenshot upload buttons
            if (task.screenshotsRequired && task.screenshotsRequired > 0) {
                taskText += `📸 Screenshots Required: ${task.screenshotsRequired}\n\n`;
                taskText += `Click the buttons below to upload your screenshots:\n`;
                
                for (let i = 1; i <= task.screenshotsRequired; i++) {
                    const buttonName = task.screenshotNames?.[i - 1] || `Screenshot ${i}`;
                    keyboard.push([{ 
                        text: `📸 Upload ${buttonName}`, 
                        callback_data: `upload_ss_${taskId}_${i}` 
                    }]);
                }
            } else {
                keyboard.push([{ 
                    text: '✅ Complete Task', 
                    callback_data: `complete_task_${taskId}` 
                }]);
            }
        }
        
        keyboard.push([{ text: '🔙 Back to Tasks', callback_data: 'back_to_tasks' }]);
        
        // Send task image if available
        if (task.image) {
            await ctx.replyWithPhoto(task.image, {
                caption: taskText,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await safeSendMessage(ctx, taskText, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        }
        
    } catch (error) {
        console.error('View task error:', error);
        await ctx.answerCbQuery('❌ Error loading task');
    }
});

// Upload Screenshot
bot.action(/^upload_ss_(.+)_(\d+)$/, async (ctx) => {
    try {
        const [taskId, ssNumber] = ctx.match[1].split('_');
        const task = await db.collection('tasks').findOne({ _id: new ObjectId(taskId) });
        
        if (!task) {
            await ctx.answerCbQuery('❌ Task not found');
            return;
        }
        
        // Store in session
        ctx.session.uploadingSS = {
            taskId: taskId,
            ssNumber: parseInt(ssNumber),
            totalSS: task.screenshotsRequired,
            screenshotNames: task.screenshotNames || []
        };
        
        const buttonName = task.screenshotNames?.[parseInt(ssNumber) - 1] || `Screenshot ${ssNumber}`;
        
        await safeSendMessage(ctx, `📸 *Upload ${buttonName}*\n\nPlease send the screenshot for ${task.title}\n\nType "cancel" to cancel.`, {
            parse_mode: 'Markdown'
        });
        
        // Enter appropriate scene based on screenshot number
        if (parseInt(ssNumber) === 1) {
            await ctx.scene.enter('upload_task_ss1_scene');
        } else if (parseInt(ssNumber) === 2) {
            await ctx.scene.enter('upload_task_ss2_scene');
        } else if (parseInt(ssNumber) === 3) {
            await ctx.scene.enter('upload_task_ss3_scene');
        }
        
    } catch (error) {
        console.error('Upload SS error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Handle screenshot upload scenes
scenes.uploadTaskSS1.on('photo', async (ctx) => {
    await handleScreenshotUpload(ctx, 1);
});

scenes.uploadTaskSS2.on('photo', async (ctx) => {
    await handleScreenshotUpload(ctx, 2);
});

scenes.uploadTaskSS3.on('photo', async (ctx) => {
    await handleScreenshotUpload(ctx, 3);
});

async function handleScreenshotUpload(ctx, ssNumber) {
    try {
        if (!ctx.session.uploadingSS) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            return;
        }
        
        const { taskId, totalSS, screenshotNames } = ctx.session.uploadingSS;
        const userId = ctx.from.id;
        
        // Store screenshot
        if (!ctx.session.taskScreenshots) {
            ctx.session.taskScreenshots = {};
        }
        if (!ctx.session.taskScreenshots[taskId]) {
            ctx.session.taskScreenshots[taskId] = {};
        }
        
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        ctx.session.taskScreenshots[taskId][`ss${ssNumber}`] = photo.file_id;
        
        await ctx.scene.leave();
        
        // Check if all screenshots uploaded
        const uploadedCount = Object.keys(ctx.session.taskScreenshots[taskId]).length;
        
        if (uploadedCount >= totalSS) {
            // All screenshots uploaded, create submission
            await createTaskSubmission(ctx, taskId);
            delete ctx.session.uploadingSS;
        } else {
            // Ask for next screenshot
            const nextSS = uploadedCount + 1;
            const buttonName = screenshotNames[nextSS - 1] || `Screenshot ${nextSS}`;
            
            await safeSendMessage(ctx, `✅ Screenshot ${ssNumber} uploaded!\n\n📸 Please upload ${buttonName}:\n\nType "cancel" to cancel.`, {
                parse_mode: 'Markdown'
            });
            
            // Update session and enter next scene
            ctx.session.uploadingSS.ssNumber = nextSS;
            
            if (nextSS === 1) {
                await ctx.scene.enter('upload_task_ss1_scene');
            } else if (nextSS === 2) {
                await ctx.scene.enter('upload_task_ss2_scene');
            } else if (nextSS === 3) {
                await ctx.scene.enter('upload_task_ss3_scene');
            }
        }
        
    } catch (error) {
        console.error('Handle screenshot upload error:', error);
        await safeSendMessage(ctx, '❌ Error uploading screenshot.');
        await ctx.scene.leave();
    }
}

async function createTaskSubmission(ctx, taskId) {
    try {
        const userId = ctx.from.id;
        const task = await db.collection('tasks').findOne({ _id: new ObjectId(taskId) });
        
        if (!task) {
            await safeSendMessage(ctx, '❌ Task not found.');
            return;
        }
        
        // Create submission
        const submission = {
            userId: userId,
            taskId: taskId,
            taskTitle: task.title,
            reward: task.reward,
            screenshots: ctx.session.taskScreenshots?.[taskId] || {},
            status: 'pending',
            createdAt: new Date(),
            userInfo: {
                firstName: ctx.from.first_name,
                lastName: ctx.from.last_name,
                username: ctx.from.username
            }
        };
        
        await db.collection('task_submissions').insertOne(submission);
        
        // Clear session
        if (ctx.session.taskScreenshots) {
            delete ctx.session.taskScreenshots[taskId];
        }
        
        // Notify admins
        const userLink = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || `User ${userId}`;
        await notifyAdmin(`📋 <b>New Task Submission</b>\n\n👤 User: ${userLink}\n🆔 User ID: <code>${userId}</code>\n📝 Task: ${task.title}\n💰 Reward: ${task.reward} ₹\n📅 Submitted: ${new Date().toLocaleString()}\n\n<pre>Click below to review:</pre>`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '👁️ Review Submission', callback_data: `review_task_${submission._id}` }
                ]]
            }
        });
        
        await safeSendMessage(ctx, `✅ Task submission received!\n\n📝 Task: *${task.title}*\n💰 Reward: *${task.reward} ₹*\n📤 Status: *Pending Review*\n\n⏳ Admin will review your submission within 24 hours.`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Tasks', callback_data: 'back_to_tasks' }
                ]]
            }
        });
        
    } catch (error) {
        console.error('Create task submission error:', error);
        await safeSendMessage(ctx, '❌ Error submitting task.');
    }
}

// Complete Task (without screenshots)
bot.action(/^complete_task_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const userId = ctx.from.id;
        const task = await db.collection('tasks').findOne({ _id: new ObjectId(taskId) });
        
        if (!task) {
            await ctx.answerCbQuery('❌ Task not found');
            return;
        }
        
        // Check if already submitted
        const existingSubmission = await db.collection('task_submissions').findOne({
            userId: userId,
            taskId: taskId,
            status: { $in: ['pending', 'approved'] }
        });
        
        if (existingSubmission) {
            await ctx.answerCbQuery('⏳ Task already submitted');
            return;
        }
        
        // Create submission
        const submission = {
            userId: userId,
            taskId: taskId,
            taskTitle: task.title,
            reward: task.reward,
            status: 'pending',
            createdAt: new Date(),
            userInfo: {
                firstName: ctx.from.first_name,
                lastName: ctx.from.last_name,
                username: ctx.from.username
            }
        };
        
        await db.collection('task_submissions').insertOne(submission);
        
        // Notify admins
        const userLink = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || `User ${userId}`;
        await notifyAdmin(`📋 <b>New Task Submission</b>\n\n👤 User: ${userLink}\n🆔 User ID: <code>${userId}</code>\n📝 Task: ${task.title}\n💰 Reward: ${task.reward} ₹\n\n<pre>Click below to approve:</pre>`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ Approve', callback_data: `approve_task_${submission._id}` },
                    { text: '❌ Reject', callback_data: `reject_task_${submission._id}` }
                ]]
            }
        });
        
        await ctx.answerCbQuery('✅ Task submitted for review!');
        
        await safeEditMessage(ctx, `✅ Task submitted!\n\n📝 Task: *${task.title}*\n💰 Reward: *${task.reward} ₹*\n📤 Status: *Pending Review*\n\n⏳ Admin will review your submission soon.`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Tasks', callback_data: 'back_to_tasks' }
                ]]
            }
        });
        
    } catch (error) {
        console.error('Complete task error:', error);
        await ctx.answerCbQuery('❌ Error submitting task');
    }
});

// Gift Code
bot.hears('🎫 Gift Code', async (ctx) => {
    try {
        await safeSendMessage(ctx, '🎫 *Redeem Gift Code*\n\nEnter a gift code to redeem bonus amount:\n\nType "cancel" to cancel.', {
            parse_mode: 'Markdown'
        });
        
        await ctx.scene.enter('enter_gift_code_scene');
        
    } catch (error) {
        console.error('Gift code error:', error);
        await safeSendMessage(ctx, '❌ Error loading gift code section.');
    }
});

// Enter Gift Code Scene
scenes.enterGiftCode.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Gift code redemption cancelled.');
            await ctx.scene.leave();
            await showMainMenu(ctx);
            return;
        }
        
        const code = ctx.message.text.trim().toUpperCase();
        const userId = ctx.from.id;
        
        // Find gift code
        const giftCode = await db.collection('gift_codes').findOne({ 
            code: code,
            isActive: true
        });
        
        if (!giftCode) {
            await safeSendMessage(ctx, '❌ Invalid or expired gift code.');
            return;
        }
        
        // Check if expired
        if (giftCode.expiresAt && new Date(giftCode.expiresAt) < new Date()) {
            await db.collection('gift_codes').updateOne(
                { _id: giftCode._id },
                { $set: { isActive: false } }
            );
            await safeSendMessage(ctx, '❌ Gift code has expired.');
            return;
        }
        
        // Check max uses
        if (giftCode.maxUses && giftCode.usedCount >= giftCode.maxUses) {
            await db.collection('gift_codes').updateOne(
                { _id: giftCode._id },
                { $set: { isActive: false } }
            );
            await safeSendMessage(ctx, '❌ Gift code has reached maximum uses.');
            return;
        }
        
        // Check if user already used this code
        const alreadyUsed = await db.collection('transactions').findOne({
            userId: userId,
            description: { $regex: `Gift code: ${code}` }
        });
        
        if (alreadyUsed) {
            await safeSendMessage(ctx, '❌ You have already used this gift code.');
            return;
        }
        
        // Generate random amount if range specified
        let amount = giftCode.amount;
        if (giftCode.minAmount && giftCode.maxAmount) {
            amount = Math.floor(Math.random() * (giftCode.maxAmount - giftCode.minAmount + 1)) + giftCode.minAmount;
        }
        
        // Add transaction
        await addTransaction(userId, amount, 'bonus', `Gift code: ${code}`);
        
        // Update gift code usage
        await db.collection('gift_codes').updateOne(
            { _id: giftCode._id },
            { 
                $inc: { usedCount: 1 },
                $push: { usedBy: { userId: userId, amount: amount, usedAt: new Date() } }
            }
        );
        
        // Check if reached max uses
        if (giftCode.maxUses && giftCode.usedCount + 1 >= giftCode.maxUses) {
            await db.collection('gift_codes').updateOne(
                { _id: giftCode._id },
                { $set: { isActive: false } }
            );
        }
        
        await safeSendMessage(ctx, `✅ Gift code redeemed successfully!\n\n🎫 Code: \`${code}\`\n💰 Amount: ${amount} ₹\n\n💰 Check your balance for updates.`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                ]]
            }
        });
        
        await ctx.scene.leave();
        
    } catch (error) {
        console.error('Enter gift code scene error:', error);
        await safeSendMessage(ctx, '❌ Error redeeming gift code.');
        await ctx.scene.leave();
    }
});

// Contact Admin
bot.hears('📞 Contact Admin', async (ctx) => {
    try {
        const user = ctx.from;
        const userInfo = user.username ? `@${user.username}` : user.first_name || `User ${user.id}`;
        
        let errorReport = '';
        if (ctx.session?.lastError) {
            const error = ctx.session.lastError;
            errorReport = `⚠️ <b>ERROR REPORT</b>\n\n`;
            errorReport += `<b>Command/Function:</b> ${error.command || error.function || 'Unknown'}\n`;
            errorReport += `<b>User:</b> ${userInfo}\n`;
            errorReport += `<b>User ID:</b> <code>${user.id}</code>\n`;
            errorReport += `<b>Error:</b> <code>${escapeMarkdown(error.error)}</code>\n`;
            delete ctx.session.lastError;
        } else {
            errorReport = `📞 <b>User wants to contact admin</b>\n\n`;
            errorReport += `<b>User:</b> ${userInfo}\n`;
            errorReport += `<b>User ID:</b> <code>${user.id}</code>\n`;
        }
        
        const activeAdmins = await getActiveAdmins();
        const promises = activeAdmins.map(async (adminId) => {
            try {
                await bot.telegram.sendMessage(
                    adminId,
                    errorReport + `\n\n<pre>Click below to reply:</pre>`,
                    {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '💬 Reply to User', callback_data: `contact_user_${user.id}` }
                            ]]
                        }
                    }
                );
            } catch (error) {
                console.error(`Failed to notify admin ${adminId}:`, error.message);
            }
        });
        
        await Promise.allSettled(promises);
        
        await safeSendMessage(ctx, '✅ Message sent to admin team! They will respond soon.', {
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                ]]
            }
        });
        
    } catch (error) {
        console.error('Contact admin error:', error);
        await safeSendMessage(ctx, '❌ Failed to contact admin.');
    }
});

// Back to Menu from inline buttons
bot.action('back_to_menu', async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Back to menu error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Back to Tasks
bot.action('back_to_tasks', async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        await bot.hears('📋 Tasks')(ctx);
    } catch (error) {
        console.error('Back to tasks error:', error);
    }
});

// ==========================================
// ADMIN PANEL
// ==========================================

// Admin command
bot.command('admin', async (ctx) => {
    try {
        const args = ctx.message.text.split(' ');
        
        if (args.length > 1) {
            // Admin code verification
            const adminCode = args[1];
            const config = await db.collection('admin').findOne({ type: 'config' });
            
            if (config?.adminCode === adminCode) {
                // Add user as admin
                const newAdminId = ctx.from.id;
                const currentAdmins = config.admins || ADMIN_IDS;
                
                if (!currentAdmins.includes(newAdminId)) {
                    const updatedAdmins = [...currentAdmins, newAdminId];
                    await db.collection('admin').updateOne(
                        { type: 'config' },
                        { $set: { admins: updatedAdmins, updatedAt: new Date() } }
                    );
                    
                    await safeSendMessage(ctx, `✅ You have been added as admin!\n\nYour ID: <code>${newAdminId}</code>\n\nUse /admin to access admin panel.`, {
                        parse_mode: 'HTML'
                    });
                    
                    // Notify other admins
                    await notifyAdmin(`👑 <b>New Admin Added via Code</b>\n\n👤 User: ${ctx.from.first_name || 'Unknown'}\n🆔 ID: <code>${newAdminId}</code>\n📝 Username: ${ctx.from.username ? '@' + ctx.from.username : 'None'}`);
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
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Show Admin Panel
async function showAdminPanel(ctx) {
    try {
        const text = '👮‍♂️ <b>Admin Control Panel</b>\n\nSelect a category:';
        
        const keyboard = [
            // Row 1
            [{ text: '📢 Broadcast', callback_data: 'admin_broadcast' }, { text: '👥 User Stats', callback_data: 'admin_userstats' }],
            // Row 2
            [{ text: '🖼️ Start Image', callback_data: 'admin_startimage' }, { text: '📝 Start Message', callback_data: 'admin_startmessage' }],
            [{ text: '🖼️ Menu Image', callback_data: 'admin_menuimage' }, { text: '📝 Menu Message', callback_data: 'admin_menumessage' }],
            // Row 3
            [{ text: '🎫 Gift Codes', callback_data: 'admin_giftcodes_menu' }, { text: '🎁 Bonus', callback_data: 'admin_bonus_menu' }],
            [{ text: '📺 Channels', callback_data: 'admin_channels_menu' }, { text: '👑 Admins', callback_data: 'admin_admins_menu' }],
            // Row 4
            [{ text: '📋 Tasks', callback_data: 'admin_tasks_menu' }, { text: '💰 Withdrawals', callback_data: 'admin_withdrawals_menu' }],
            [{ text: '⚙️ Settings', callback_data: 'admin_settings_menu' }, { text: '🗑️ Data', callback_data: 'admin_data_menu' }]
        ];
        
        await safeSendMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Show admin panel error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
}

// ==========================================
// ADMIN - BROADCAST
// ==========================================

bot.action('admin_broadcast', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await safeEditMessage(ctx, '📢 <b>Broadcast Message</b>\n\nSend the message you want to broadcast to all users.\n\n<i>Supports HTML formatting</i>\n\nType "cancel" to cancel.', {
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
        await notifyAdmin(`📢 <b>Broadcast Started</b>\n\n👤 Admin: ${ctx.from.id}\n👥 Target: ${totalUsers} users\n⏰ Time: ${new Date().toLocaleString()}`);
        
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
            `✅ <b>Broadcast Complete</b>\n\n📊 <b>Statistics:</b>\n• Total: ${totalUsers}\n• ✅ Successful: ${successful}\n• ❌ Failed: ${failed}`,
            { parse_mode: 'HTML' }
        );
        
        // Notify admins about completion
        await notifyAdmin(`✅ <b>Broadcast Complete</b>\n\n📊 Statistics:\n• Total: ${totalUsers}\n• ✅ Successful: ${successful}\n• ❌ Failed: ${failed}\n👤 Admin: ${ctx.from.id}`);
        
    } catch (error) {
        console.error('Broadcast error:', error);
        await safeSendMessage(ctx, '❌ Broadcast failed.');
    }
    
    await ctx.scene.leave();
    await showAdminPanel(ctx);
});

// ==========================================
// ADMIN - USER STATS
// ==========================================

bot.action('admin_userstats', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await showUserStatsPage(ctx, 1);
});

async function showUserStatsPage(ctx, page) {
    try {
        const userData = await getPaginatedUsers(page, 20);
        const users = userData.users;
        const totalUsers = userData.totalUsers;
        
        // Count verified users
        const verifiedUsersCount = users.filter(u => u.joinedAll).length;
        
        // Count active today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const activeToday = users.filter(u => u.lastActive && new Date(u.lastActive) >= today).length;
        
        let usersText = `<b>📊 User Statistics</b>\n\n`;
        usersText += `• <b>Total Users:</b> ${totalUsers}\n`;
        usersText += `• <b>Verified Users:</b> ${verifiedUsersCount}\n`;
        usersText += `• <b>Active Today:</b> ${activeToday}\n\n`;
        usersText += `<b>👥 Users (Page ${page}/${userData.totalPages}):</b>\n\n`;
        
        // Create keyboard with 2 users per row
        const keyboard = [];
        
        // Add search button
        keyboard.push([{ text: '🔍 Search Users', callback_data: 'search_users' }]);
        
        // Group users 2 per row
        for (let i = 0; i < users.length; i += 2) {
            const row = [];
            
            // First user in row
            const user1 = users[i];
            const userNum1 = (page - 1) * 20 + i + 1;
            const name1 = user1.firstName || `User ${user1.userId}`;
            row.push({ 
                text: `${userNum1}. ${name1}`, 
                callback_data: `user_detail_${user1.userId}` 
            });
            
            // Second user in row if exists
            if (i + 1 < users.length) {
                const user2 = users[i + 1];
                const userNum2 = (page - 1) * 20 + i + 2;
                const name2 = user2.firstName || `User ${user2.userId}`;
                row.push({ 
                    text: `${userNum2}. ${name2}`, 
                    callback_data: `user_detail_${user2.userId}` 
                });
            }
            
            keyboard.push(row);
        }
        
        // Navigation buttons
        if (userData.hasPrev || userData.hasNext) {
            const navRow = [];
            if (userData.hasPrev) {
                navRow.push({ text: '◀️ Previous', callback_data: `users_page_${page - 1}` });
            }
            navRow.push({ text: `📄 ${page}/${userData.totalPages}`, callback_data: 'no_action' });
            if (userData.hasNext) {
                navRow.push({ text: 'Next ▶️', callback_data: `users_page_${page + 1}` });
            }
            keyboard.push(navRow);
        }
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        if (ctx.callbackQuery) {
            await safeEditMessage(ctx, usersText, {
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await safeSendMessage(ctx, usersText, {
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    } catch (error) {
        console.error('User stats error:', error);
        await safeSendMessage(ctx, '❌ Failed to get user statistics.');
    }
}

// Search Users
bot.action('search_users', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await safeSendMessage(ctx, '🔍 <b>Search Users</b>\n\nEnter username, user ID, name, or refer code to search:\n\nType "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    await ctx.scene.enter('search_users_scene');
});

scenes.searchUsers.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Search cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const query = ctx.message.text.trim();
        const users = await searchUsers(query);
        
        if (users.length === 0) {
            await safeSendMessage(ctx, '❌ No users found matching your search.');
            return;
        }
        
        let searchText = `<b>🔍 Search Results</b>\n\nFound ${users.length} users:\n\n`;
        
        const keyboard = [];
        
        users.forEach((user, index) => {
            const name = user.firstName || `User ${user.userId}`;
            const status = user.joinedAll ? '✅' : '❌';
            keyboard.push([{ 
                text: `${index + 1}. ${status} ${name}`, 
                callback_data: `user_detail_${user.userId}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back to User Stats', callback_data: 'admin_userstats' }]);
        
        await safeSendMessage(ctx, searchText, {
            reply_markup: { inline_keyboard: keyboard }
        });
        
        await ctx.scene.leave();
        
    } catch (error) {
        console.error('Search users scene error:', error);
        await safeSendMessage(ctx, '❌ Error searching users.');
        await ctx.scene.leave();
    }
});

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
        const wallet = user.wallet || 'Not set';
        
        // Get referral count
        const referralCount = await db.collection('users').countDocuments({ referredBy: Number(userId) });
        
        let userDetail = `<b>👤 User Details</b>\n\n`;
        userDetail += `• <b>ID:</b> <code>${userId}</code>\n`;
        userDetail += `• <b>Username:</b> <code>${escapeMarkdown(username)}</code>\n`;
        userDetail += `• <b>First Name:</b> <code>${escapeMarkdown(firstName)}</code>\n`;
        userDetail += `• <b>Last Name:</b> <code>${escapeMarkdown(lastName)}</code>\n`;
        userDetail += `• <b>Full Name:</b> <code>${escapeMarkdown(fullName)}</code>\n`;
        userDetail += `• <b>Status:</b> ${isVerified}\n`;
        userDetail += `• <b>Balance:</b> ${user.balance || 0} ₹\n`;
        userDetail += `• <b>Wallet:</b> <code>${wallet}</code>\n`;
        userDetail += `• <b>Refer Code:</b> <code>${user.referCode || 'N/A'}</code>\n`;
        userDetail += `• <b>Referrals:</b> ${referralCount}\n`;
        userDetail += `• <b>Referred By:</b> ${user.referredBy || 'None'}\n`;
        userDetail += `• <b>Total Earned:</b> ${user.totalEarned || 0} ₹\n`;
        userDetail += `• <b>Total Withdrawn:</b> ${user.totalWithdrawn || 0} ₹\n`;
        userDetail += `• <b>Joined:</b> <code>${joinedAt}</code>\n`;
        userDetail += `• <b>Last Active:</b> <code>${lastActive}</code>\n`;
        
        const keyboard = [
            [{ text: '💬 Send Message/Photo', callback_data: `contact_user_${userId}` }],
            [{ text: '💰 Add Balance', callback_data: `add_balance_${userId}` }, { text: '💰 Deduct Balance', callback_data: `deduct_balance_${userId}` }],
            [{ text: '📊 Transactions', callback_data: `user_transactions_${userId}` }],
            [{ text: '🔙 Back to Users', callback_data: 'admin_userstats' }],
            [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, userDetail, {
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

// ==========================================
// ADMIN - START IMAGE & MESSAGE
// ==========================================

bot.action('admin_startimage', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentImage = config?.startImage || DEFAULT_CONFIG.startImage;
        const overlaySettings = config?.imageOverlaySettings || { startImage: true };
        const hasOverlay = hasNameVariable(currentImage) || overlaySettings.startImage;
        
        const text = `<b>🖼️ Start Image Management</b>\n\nCurrent Image:\n<code>${currentImage}</code>\n\nOverlay: ${hasOverlay ? '✅ ON' : '❌ OFF'}\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '✏️ Edit URL', callback_data: 'admin_edit_startimage_url' }, { text: '📤 Upload', callback_data: 'admin_upload_startimage' }],
            [{ text: '🔄 Reset', callback_data: 'admin_reset_startimage' }, { text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Start image menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action('admin_edit_startimage_url', async (ctx) => {
    await safeSendMessage(ctx, 'Enter the new image URL:\n\n<i>Use {name} variable for user name overlay (optional)</i>\n\nType "cancel" to cancel.', {
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
        
        const isValid = await isValidImageUrl(newUrl);
        if (!isValid) {
            await safeSendMessage(ctx, '⚠️ The URL does not appear to be a valid image.\n\nDo you still want to use it?', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Yes, use anyway', callback_data: `confirm_bad_url_start_${encodeURIComponent(newUrl)}` }],
                        [{ text: '❌ No, cancel', callback_data: 'admin_startimage' }]
                    ]
                }
            });
            return;
        }
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { 
                $set: { 
                    startImage: newUrl, 
                    updatedAt: new Date(),
                    'imageOverlaySettings.startImage': hasNameVariable(newUrl)
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

bot.action('admin_startmessage', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentMessage = config?.startMessage || DEFAULT_CONFIG.startMessage;
        
        // Show message in code tags
        const text = `<b>📝 Start Message Management</b>\n\nCurrent Message:\n<code>${escapeMarkdown(currentMessage)}</code>\n\nAvailable variables: {first_name}, {last_name}, {full_name}, {username}, {name}, {user_id}\n\nSupports HTML formatting\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '✏️ Edit', callback_data: 'admin_edit_startmessage' }, { text: '🔄 Reset', callback_data: 'admin_reset_startmessage' }],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
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
        
        await safeSendMessage(ctx, `Current message:\n<code>${escapeMarkdown(currentMessage)}</code>\n\nEnter the new start message:\n\n<i>Supports HTML formatting</i>\n\nType "cancel" to cancel.`, {
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

// ==========================================
// ADMIN - GIFT CODES MENU
// ==========================================

bot.action('admin_giftcodes_menu', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    const text = '<b>🎫 Gift Codes Management</b>\n\nSelect an option:';
    
    const keyboard = [
        [{ text: '➕ Create Gift Code', callback_data: 'admin_create_giftcode' }],
        [{ text: '📋 Manage Gift Codes', callback_data: 'admin_manage_giftcodes' }],
        [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
    ];
    
    await safeEditMessage(ctx, text, {
        reply_markup: { inline_keyboard: keyboard }
    });
});

bot.action('admin_create_giftcode', async (ctx) => {
    await safeSendMessage(ctx, '🎫 <b>Create Gift Code</b>\n\nEnter maximum number of uses (0 for unlimited):\n\nType "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    await ctx.scene.enter('create_gift_code_scene');
});

// Create Gift Code Scene
scenes.createGiftCode.on('text', async (ctx) => {
    try {
        if (!ctx.session.giftCodeData) ctx.session.giftCodeData = {};
        
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Gift code creation cancelled.');
            delete ctx.session.giftCodeData;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const step = ctx.session.giftCodeData.step || 1;
        
        if (step === 1) {
            // Max uses
            const maxUses = parseInt(ctx.message.text);
            if (isNaN(maxUses) || maxUses < 0) {
                await safeSendMessage(ctx, '❌ Please enter a valid number (0 for unlimited).');
                return;
            }
            
            ctx.session.giftCodeData.maxUses = maxUses;
            ctx.session.giftCodeData.step = 2;
            
            await safeSendMessage(ctx, '⏰ Enter expiry time in minutes (0 for no expiry):\n\nType "cancel" to cancel.');
            
        } else if (step === 2) {
            // Expiry time
            const expiryMinutes = parseInt(ctx.message.text);
            if (isNaN(expiryMinutes) || expiryMinutes < 0) {
                await safeSendMessage(ctx, '❌ Please enter a valid number (0 for no expiry).');
                return;
            }
            
            ctx.session.giftCodeData.expiryMinutes = expiryMinutes;
            ctx.session.giftCodeData.step = 3;
            
            await safeSendMessage(ctx, '🔢 Enter code length (6-20 characters):\n\nType "cancel" to cancel.');
            
        } else if (step === 3) {
            // Code length
            const codeLength = parseInt(ctx.message.text);
            if (isNaN(codeLength) || codeLength < 6 || codeLength > 20) {
                await safeSendMessage(ctx, '❌ Please enter a number between 6 and 20.');
                return;
            }
            
            ctx.session.giftCodeData.codeLength = codeLength;
            ctx.session.giftCodeData.step = 4;
            
            await safeSendMessage(ctx, '💰 Enter minimum amount (₹):\n\nType "cancel" to cancel.');
            
        } else if (step === 4) {
            // Min amount
            const minAmount = parseFloat(ctx.message.text);
            if (isNaN(minAmount) || minAmount < 1) {
                await safeSendMessage(ctx, '❌ Please enter a valid amount (minimum 1 ₹).');
                return;
            }
            
            ctx.session.giftCodeData.minAmount = minAmount;
            ctx.session.giftCodeData.step = 5;
            
            await safeSendMessage(ctx, '💰 Enter maximum amount (₹):\n\nType "cancel" to cancel.');
            
        } else if (step === 5) {
            // Max amount
            const maxAmount = parseFloat(ctx.message.text);
            const minAmount = ctx.session.giftCodeData.minAmount;
            
            if (isNaN(maxAmount) || maxAmount < minAmount) {
                await safeSendMessage(ctx, `❌ Please enter a valid amount (minimum ${minAmount} ₹).`);
                return;
            }
            
            ctx.session.giftCodeData.maxAmount = maxAmount;
            
            // Generate gift code
            const code = generateGiftCode(ctx.session.giftCodeData.codeLength);
            const giftCodeData = ctx.session.giftCodeData;
            
            const giftCode = {
                code: code,
                maxUses: giftCodeData.maxUses,
                minAmount: giftCodeData.minAmount,
                maxAmount: giftCodeData.maxAmount,
                expiryMinutes: giftCodeData.expiryMinutes,
                expiresAt: giftCodeData.expiryMinutes > 0 ? 
                    new Date(Date.now() + giftCodeData.expiryMinutes * 60000) : null,
                isActive: true,
                usedCount: 0,
                usedBy: [],
                createdAt: new Date(),
                createdBy: ctx.from.id
            };
            
            await db.collection('gift_codes').insertOne(giftCode);
            
            let giftCodeText = `✅ <b>Gift Code Created!</b>\n\n`;
            giftCodeText += `🎫 Code: <code>${code}</code>\n`;
            giftCodeText += `💰 Amount Range: ${minAmount} - ${maxAmount} ₹\n`;
            giftCodeText += `👥 Max Uses: ${maxUses === 0 ? 'Unlimited' : maxUses}\n`;
            giftCodeText += `⏰ Expiry: ${expiryMinutes === 0 ? 'Never' : `${expiryMinutes} minutes`}\n`;
            giftCodeText += `📅 Created: ${new Date().toLocaleString()}\n\n`;
            giftCodeText += `🔗 Users can redeem using /start or Menu > Gift Code`;
            
            await safeSendMessage(ctx, giftCodeText, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back to Gift Codes', callback_data: 'admin_giftcodes_menu' }
                    ]]
                }
            });
            
            delete ctx.session.giftCodeData;
            await ctx.scene.leave();
            
        }
        
    } catch (error) {
        console.error('Create gift code scene error:', error);
        await safeSendMessage(ctx, '❌ Error creating gift code.');
        delete ctx.session.giftCodeData;
        await ctx.scene.leave();
    }
});

bot.action('admin_manage_giftcodes', async (ctx) => {
    try {
        const giftCodes = await db.collection('gift_codes')
            .find({})
            .sort({ createdAt: -1 })
            .limit(50)
            .toArray();
        
        if (giftCodes.length === 0) {
            await safeSendMessage(ctx, '❌ No gift codes found.');
            return;
        }
        
        let text = `<b>📋 Manage Gift Codes</b>\n\n`;
        text += `Total Gift Codes: ${giftCodes.length}\n\n`;
        
        const keyboard = [];
        
        giftCodes.forEach((code, index) => {
            const status = code.isActive ? '✅' : '❌';
            const expiry = code.expiresAt ? 
                `${Math.ceil((new Date(code.expiresAt) - new Date()) / 60000)}m left` : 
                'No expiry';
            
            keyboard.push([{ 
                text: `${index + 1}. ${status} ${code.code} (${code.usedCount}/${code.maxUses || '∞'})`, 
                callback_data: `edit_giftcode_${code._id}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back to Gift Codes', callback_data: 'admin_giftcodes_menu' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Manage gift codes error:', error);
        await ctx.answerCbQuery('❌ Error loading gift codes');
    }
});

// ==========================================
// ADMIN - BONUS MENU
// ==========================================

bot.action('admin_bonus_menu', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const bonusAmount = config?.bonusAmount || DEFAULT_CONFIG.bonusAmount;
        const bonusEnabled = config?.bonusEnabled !== false;
        
        const text = `<b>🎁 Bonus Management</b>\n\nCurrent Settings:\n• Amount: ${bonusAmount} ₹\n• Status: ${bonusEnabled ? '✅ Enabled' : '❌ Disabled'}\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '💰 Set Bonus Amount', callback_data: 'admin_set_bonus_amount' }],
            [{ text: '🖼️ Bonus Image', callback_data: 'admin_bonus_image' }],
            [{ text: bonusEnabled ? '❌ Disable Bonus' : '✅ Enable Bonus', callback_data: 'admin_toggle_bonus' }],
            [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Bonus menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action('admin_set_bonus_amount', async (ctx) => {
    await safeSendMessage(ctx, '💰 <b>Set Bonus Amount</b>\n\nEnter new bonus amount (₹):\n\nType "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    await ctx.scene.enter('set_bonus_amount_scene');
});

scenes.setBonusAmount.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Bonus amount update cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const amount = parseFloat(ctx.message.text);
        if (isNaN(amount) || amount < 1) {
            await safeSendMessage(ctx, '❌ Please enter a valid amount (minimum 1 ₹).');
            return;
        }
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { bonusAmount: amount, updatedAt: new Date() } }
        );
        
        await safeSendMessage(ctx, `✅ Bonus amount set to ${amount} ₹!`);
        await ctx.scene.leave();
        await showAdminPanel(ctx);
        
    } catch (error) {
        console.error('Set bonus amount error:', error);
        await safeSendMessage(ctx, '❌ Failed to update bonus amount.');
        await ctx.scene.leave();
    }
});

// ==========================================
// ADMIN - CHANNELS MENU
// ==========================================

bot.action('admin_channels_menu', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    const text = '<b>📺 Channels Management</b>\n\nSelect an option:';
    
    const keyboard = [
        [{ text: '➕ Add Channel', callback_data: 'admin_add_channel' }],
        [{ text: '📋 Manage Channels', callback_data: 'admin_manage_channels' }],
        [{ text: '⚙️ Channel Settings', callback_data: 'admin_channel_settings' }],
        [{ text: '🔄 Reorder Channels', callback_data: 'admin_reorder_channels' }],
        [{ text: '✏️ Edit Channels', callback_data: 'admin_edit_channels' }],
        [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
    ];
    
    await safeEditMessage(ctx, text, {
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Channel Settings
bot.action('admin_channel_settings', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    const text = '<b>⚙️ Channel Settings</b>\n\nConfigure channel visibility and behavior:';
    
    const keyboard = [
        [{ text: '👁️ Hide Channels (F)', callback_data: 'admin_hide_channels' }],
        [{ text: '📺 Just Show (S)', callback_data: 'admin_just_show_channels' }],
        [{ text: '✅ Auto Accept (SS)', callback_data: 'admin_auto_accept_channels' }],
        [{ text: '🔒 Need Join (SSS)', callback_data: 'admin_need_join_channels' }],
        [{ text: '🔙 Back to Channels', callback_data: 'admin_channels_menu' }]
    ];
    
    await safeEditMessage(ctx, text, {
        reply_markup: { inline_keyboard: keyboard }
    });
});

// ==========================================
// ADMIN - ADMINS MENU
// ==========================================

bot.action('admin_admins_menu', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const admins = config?.admins || ADMIN_IDS;
        const mutedAdmins = config?.mutedAdmins || [];
        
        let text = '<b>👑 Admin Management</b>\n\nCurrent Admins:\n';
        
        admins.forEach((adminId, index) => {
            const isMuted = mutedAdmins.includes(adminId);
            const status = isMuted ? '🔕' : '🔔';
            text += `${index + 1}. ${status} <code>${adminId}</code>\n`;
        });
        
        text += `\nAdmin Code: <code>${config?.adminCode || ADMIN_CODE}</code>\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '➕ Add Admin', callback_data: 'admin_add_admin' }, { text: '🗑️ Remove Admin', callback_data: 'admin_remove_admin' }],
            [{ text: '🔑 Set Admin Code', callback_data: 'admin_set_admin_code' }],
            [{ text: '🔕 Mute Notifications', callback_data: 'admin_mute_notifications' }],
            [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Admins menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Set Admin Code
bot.action('admin_set_admin_code', async (ctx) => {
    await safeSendMessage(ctx, '🔑 <b>Set Admin Code</b>\n\nEnter new admin code (users will use /admin CODE to become admin):\n\nType "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    await ctx.scene.enter('set_admin_code_scene');
});

scenes.setAdminCode.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Admin code update cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const newCode = ctx.message.text.trim();
        
        if (newCode.length < 4) {
            await safeSendMessage(ctx, '❌ Admin code must be at least 4 characters.');
            return;
        }
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { adminCode: newCode, updatedAt: new Date() } }
        );
        
        await safeSendMessage(ctx, `✅ Admin code set to: <code>${newCode}</code>\n\nUsers can now use /admin ${newCode} to become admin.`, {
            parse_mode: 'HTML'
        });
        await ctx.scene.leave();
        await showAdminPanel(ctx);
        
    } catch (error) {
        console.error('Set admin code error:', error);
        await safeSendMessage(ctx, '❌ Failed to update admin code.');
        await ctx.scene.leave();
    }
});

// ==========================================
// ADMIN - TASKS MENU
// ==========================================

bot.action('admin_tasks_menu', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    const text = '<b>📋 Tasks Management</b>\n\nSelect an option:';
    
    const keyboard = [
        [{ text: '➕ Add Task', callback_data: 'admin_add_task' }],
        [{ text: '📋 Manage Tasks', callback_data: 'admin_manage_tasks' }],
        [{ text: '📨 Task Requests', callback_data: 'admin_task_requests' }],
        [{ text: '📜 Task History', callback_data: 'admin_task_history' }],
        [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
    ];
    
    await safeEditMessage(ctx, text, {
        reply_markup: { inline_keyboard: keyboard }
    });
});

// ==========================================
// ADMIN - WITHDRAWALS MENU
// ==========================================

bot.action('admin_withdrawals_menu', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    const text = '<b>💰 Withdrawals Management</b>\n\nSelect an option:';
    
    const keyboard = [
        [{ text: '📨 Withdrawal Requests', callback_data: 'admin_withdrawal_requests' }],
        [{ text: '📜 Withdrawal History', callback_data: 'admin_withdrawal_history' }],
        [{ text: '⚙️ Withdrawal Settings', callback_data: 'admin_withdrawal_settings' }],
        [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
    ];
    
    await safeEditMessage(ctx, text, {
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Withdrawal Requests
bot.action('admin_withdrawal_requests', async (ctx) => {
    try {
        const withdrawals = await db.collection('withdrawals')
            .find({ status: 'pending' })
            .sort({ createdAt: -1 })
            .limit(20)
            .toArray();
        
        if (withdrawals.length === 0) {
            await safeSendMessage(ctx, '❌ No pending withdrawal requests.');
            return;
        }
        
        let text = `<b>📨 Pending Withdrawal Requests</b>\n\n`;
        text += `Total Pending: ${withdrawals.length}\n\n`;
        
        const keyboard = [
            [{ text: '🔍 Search Withdrawals', callback_data: 'search_withdrawals' }]
        ];
        
        withdrawals.forEach((withdrawal, index) => {
            const name = withdrawal.userInfo?.firstName || `User ${withdrawal.userId}`;
            keyboard.push([{ 
                text: `${index + 1}. ${name} - ${withdrawal.amount} ₹`, 
                callback_data: `process_withdrawal_${withdrawal.txnId}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back to Withdrawals', callback_data: 'admin_withdrawals_menu' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Withdrawal requests error:', error);
        await ctx.answerCbQuery('❌ Error loading withdrawals');
    }
});

// Process Withdrawal
bot.action(/^process_withdrawal_(.+)$/, async (ctx) => {
    try {
        const txnId = ctx.match[1];
        const withdrawal = await db.collection('withdrawals').findOne({ txnId: txnId });
        
        if (!withdrawal) {
            await ctx.answerCbQuery('❌ Withdrawal not found');
            return;
        }
        
        const user = await db.collection('users').findOne({ userId: withdrawal.userId });
        
        let text = `<b>💰 Process Withdrawal</b>\n\n`;
        text += `📝 Txn ID: <code>${withdrawal.txnId}</code>\n`;
        text += `👤 User: ${user?.firstName || 'Unknown'} (${withdrawal.userId})\n`;
        text += `💰 Amount: ${withdrawal.amount} ₹\n`;
        text += `💳 UPI: <code>${withdrawal.upiId}</code>\n`;
        text += `📅 Requested: ${new Date(withdrawal.createdAt).toLocaleString()}\n`;
        text += `📤 Status: ${withdrawal.status}\n\n`;
        text += `Select an action:`;
        
        const keyboard = [
            [{ text: '✅ Approve & Pay', callback_data: `approve_withdrawal_${txnId}` }],
            [{ text: '❌ Reject & Refund', callback_data: `reject_withdrawal_${txnId}` }],
            [{ text: '🔙 Back to Requests', callback_data: 'admin_withdrawal_requests' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Process withdrawal error:', error);
        await ctx.answerCbQuery('❌ Error loading withdrawal');
    }
});

// Approve Withdrawal
bot.action(/^approve_withdrawal_(.+)$/, async (ctx) => {
    try {
        const txnId = ctx.match[1];
        const withdrawal = await db.collection('withdrawals').findOne({ txnId: txnId });
        
        if (!withdrawal) {
            await ctx.answerCbQuery('❌ Withdrawal not found');
            return;
        }
        
        // Generate UTR
        const utr = 'UTR' + Date.now().toString().slice(-12);
        
        // Update withdrawal status
        await db.collection('withdrawals').updateOne(
            { txnId: txnId },
            { 
                $set: { 
                    status: 'approved',
                    approvedAt: new Date(),
                    approvedBy: ctx.from.id,
                    utr: utr
                } 
            }
        );
        
        // Notify user
        try {
            await bot.telegram.sendMessage(
                withdrawal.userId,
                `✅ <b>Withdrawal Approved!</b>\n\n📝 Txn ID: <code>${txnId}</code>\n💰 Amount: ${withdrawal.amount} ₹\n🏦 UTR: <code>${utr}</code>\n\nPayment will be processed within 24 hours.`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('Failed to notify user:', error);
        }
        
        await ctx.answerCbQuery('✅ Withdrawal approved!');
        await safeEditMessage(ctx, `✅ Withdrawal approved!\n\nUTR: <code>${utr}</code>\n\nUser has been notified.`, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Requests', callback_data: 'admin_withdrawal_requests' }
                ]]
            }
        });
        
    } catch (error) {
        console.error('Approve withdrawal error:', error);
        await ctx.answerCbQuery('❌ Error approving withdrawal');
    }
});

// Reject Withdrawal
bot.action(/^reject_withdrawal_(.+)$/, async (ctx) => {
    try {
        const txnId = ctx.match[1];
        
        // Store in session for rejection message
        ctx.session.rejectingWithdrawal = txnId;
        
        await safeSendMessage(ctx, '❌ <b>Reject Withdrawal</b>\n\nEnter rejection reason (will be sent to user):\n\nType "cancel" to cancel.', {
            parse_mode: 'HTML'
        });
        
    } catch (error) {
        console.error('Reject withdrawal error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Handle withdrawal rejection message
bot.on('text', async (ctx) => {
    try {
        if (ctx.session?.rejectingWithdrawal && !ctx.message.text?.startsWith('/')) {
            const txnId = ctx.session.rejectingWithdrawal;
            
            if (ctx.message.text.toLowerCase() === 'cancel') {
                await safeSendMessage(ctx, '❌ Rejection cancelled.');
                delete ctx.session.rejectingWithdrawal;
                return;
            }
            
            const reason = ctx.message.text;
            const withdrawal = await db.collection('withdrawals').findOne({ txnId: txnId });
            
            if (!withdrawal) {
                await safeSendMessage(ctx, '❌ Withdrawal not found.');
                delete ctx.session.rejectingWithdrawal;
                return;
            }
            
            // Update withdrawal status
            await db.collection('withdrawals').updateOne(
                { txnId: txnId },
                { 
                    $set: { 
                        status: 'rejected',
                        rejectedAt: new Date(),
                        rejectedBy: ctx.from.id,
                        rejectionReason: reason
                    } 
                }
            );
            
            // Refund to user balance
            await addTransaction(withdrawal.userId, withdrawal.amount, 'credit', `Withdrawal refund #${txnId}`);
            
            // Notify user
            try {
                await bot.telegram.sendMessage(
                    withdrawal.userId,
                    `❌ <b>Withdrawal Rejected</b>\n\n📝 Txn ID: <code>${txnId}</code>\n💰 Amount: ${withdrawal.amount} ₹\n📝 Reason: ${reason}\n\nAmount has been refunded to your balance.`,
                    { parse_mode: 'HTML' }
                );
            } catch (error) {
                console.error('Failed to notify user:', error);
            }
            
            await safeSendMessage(ctx, `✅ Withdrawal rejected and amount refunded!\n\nReason sent to user.`, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back to Requests', callback_data: 'admin_withdrawal_requests' }
                    ]]
                }
            });
            
            delete ctx.session.rejectingWithdrawal;
        }
    } catch (error) {
        console.error('Handle withdrawal rejection error:', error);
        await safeSendMessage(ctx, '❌ Error rejecting withdrawal.');
        delete ctx.session.rejectingWithdrawal;
    }
});

// ==========================================
// ADMIN - SETTINGS MENU
// ==========================================

bot.action('admin_settings_menu', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    const text = '<b>⚙️ Bot Settings</b>\n\nSelect an option:';
    
    const keyboard = [
        [{ text: '⏰ Code Timer', callback_data: 'admin_timer' }],
        [{ text: '⚙️ Image Overlay', callback_data: 'admin_image_overlay' }],
        [{ text: '📞 Contact Button', callback_data: 'admin_contact_button' }],
        [{ text: '🚫 Disable Bot', callback_data: 'admin_disable_bot' }],
        [{ text: '🔒 Auto Accept', callback_data: 'admin_auto_accept' }],
        [{ text: '📢 Refer Settings', callback_data: 'admin_refer_settings' }],
        [{ text: '🖼️ Manage Images', callback_data: 'admin_manage_images' }],
        [{ text: '📋 HTML Guide', callback_data: 'admin_html_guide' }],
        [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
    ];
    
    await safeEditMessage(ctx, text, {
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Refer Settings
bot.action('admin_refer_settings', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const referBonus = config?.referBonus || DEFAULT_CONFIG.referBonus;
        const minReferBonus = config?.minReferBonus || DEFAULT_CONFIG.minReferBonus;
        const maxReferBonus = config?.maxReferBonus || DEFAULT_CONFIG.maxReferBonus;
        
        const text = `<b>📢 Referral Settings</b>\n\nCurrent Settings:\n• Refer Bonus: ${referBonus} ₹\n• Min Bonus: ${minReferBonus} ₹\n• Max Bonus: ${maxReferBonus} ₹\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '💰 Set Refer Bonus', callback_data: 'admin_set_refer_bonus' }],
            [{ text: '🔙 Back to Settings', callback_data: 'admin_settings_menu' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Refer settings error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// ==========================================
// ADMIN - DATA MENU
// ==========================================

bot.action('admin_data_menu', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    const text = '<b>🗑️ Data Management</b>\n\n⚠️ DANGER ZONE\n\nSelect what you want to delete:';
    
    const keyboard = [
        [{ text: '🗑️ Delete All Users', callback_data: 'delete_all_users' }],
        [{ text: '🗑️ Delete All Channels', callback_data: 'delete_all_channels' }],
        [{ text: '🗑️ Delete All Tasks', callback_data: 'delete_all_tasks' }],
        [{ text: '🗑️ Delete All Gift Codes', callback_data: 'delete_all_giftcodes' }],
        [{ text: '🔥 DELETE EVERYTHING', callback_data: 'delete_everything' }],
        [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
    ];
    
    await safeEditMessage(ctx, text, {
        reply_markup: { inline_keyboard: keyboard }
    });
});

// ==========================================
// BACK BUTTONS
// ==========================================

bot.action('admin_back', async (ctx) => {
    try {
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Back to admin error:', error);
    }
});

bot.action('no_action', async (ctx) => {
    await ctx.answerCbQuery();
});

// ==========================================
// ERROR HANDLING
// ==========================================

bot.catch((error, ctx) => {
    console.error('Bot error:', error);
    
    if (ctx.session) {
        ctx.session.lastError = {
            command: ctx.message?.text || 'Unknown',
            error: error.message,
            stack: error.stack
        };
    }
    
    try {
        if (ctx.message) {
            safeSendMessage(ctx, '❌ An error occurred.', {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '📞 Contact Admin', callback_data: 'contact_admin' },
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
// START BOT
// ==========================================

async function startBot() {
    try {
        // Connect to database
        const dbConnected = await connectDB();
        if (!dbConnected) {
            console.error('❌ Failed to connect to database');
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
        
        // Send a test message
        try {
            await bot.telegram.sendMessage(ADMIN_IDS[0], '🤖 Earning Bot started successfully!\n\nFeatures:\n• Refer & Earn System\n• Task Management\n• Withdrawal System\n• Gift Codes\n• Channel Verification');
            console.log('✅ Test message sent to admin');
        } catch (error) {
            console.log('⚠️ Could not send test message, but bot is running');
        }
        
    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        setTimeout(startBot, 10000);
    }
}

// Start the bot
startBot();
console.log('🚀 Bot Starting...');

// Handle Railway port binding
const PORT = process.env.PORT || 3000;
if (process.env.RAILWAY_ENVIRONMENT || process.env.PORT) {
    const http = require('http');
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Earning Bot is running...');
    });
    
    server.listen(PORT, () => {
        console.log(`🚂 Server listening on port ${PORT}`);
    });
}
