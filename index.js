const { Telegraf, Scenes, session, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const fetch = require('node-fetch');
require('dotenv').config();

// Cloudinary configuration
cloudinary.config({
  cloud_name: 'dneusgyzc',
  api_key: '474713292161728',
  api_secret: 'DHJmvD784FEVmeOt1-K8XeNhCQQ'
});

// Initialize bot
const BOT_TOKEN = process.env.BOT_TOKEN || '8295150408:AAHk4M0LX0YAUk4vDuSCi4mOFg6se66J3hM';
const bot = new Telegraf(BOT_TOKEN);

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://sure:mQor2EPuhPgApFnJ@test.ebvv4hf.mongodb.net/earningbot?retryWrites=true&w=majority';
let db, client;

async function connectDB() {
    try {
        client = new MongoClient(mongoUri, {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 30000,
            maxPoolSize: 10,
            minPoolSize: 1
        });
        await client.connect();
        db = client.db();
        console.log('✅ Connected to MongoDB');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        return false;
    }
}

// Initialize scenes and session
const stage = new Scenes.Stage([]);
bot.use(session());
bot.use(stage.middleware());

// Scene handler factory
function createScene(sceneId) {
    return new Scenes.BaseScene(sceneId);
}

// SCENE DEFINITIONS
const scenes = {
    // Broadcast scene
    broadcast: createScene('broadcast_scene'),
    
    // Channel scenes
    addChannelType: createScene('add_channel_type_scene'),
    addPublicChannelName: createScene('add_public_channel_name_scene'),
    addPublicChannelId: createScene('add_public_channel_id_scene'),
    addPublicChannelLink: createScene('add_public_channel_link_scene'),
    addPrivateChannelName: createScene('add_private_channel_name_scene'),
    addPrivateChannelId: createScene('add_private_channel_id_scene'),
    addPrivateChannelLink: createScene('add_private_channel_link_scene'),
    
    // Contact user scenes
    contactUserMessage: createScene('contact_user_message_scene'),

    // Edit scenes
    editStartImage: createScene('edit_start_image_scene'),
    editStartMessage: createScene('edit_start_message_scene'),
    editMenuImage: createScene('edit_menu_image_scene'),
    editMenuMessage: createScene('edit_menu_message_scene'),

    // Timer scene
    editTimer: createScene('edit_timer_scene'),

    // Reorder scenes
    reorderChannels: createScene('reorder_channels_scene'),
    reorderChannelsSingle: createScene('reorder_channels_single_scene'),

    // Edit channels and apps scenes
    editChannelSelect: createScene('edit_channel_select_scene'),
    editChannelDetails: createScene('edit_channel_details_scene'),
    
    // Report to admin scene
    reportToAdmin: createScene('report_to_admin_scene'),
    
    // Admin scenes
    addAdmin: createScene('add_admin_scene'),
    
    // Manage images scene
    manageImages: createScene('manage_images_scene'),
    
    // Image overlay scene
    imageOverlay: createScene('image_overlay_scene'),
    
    // HTML guide scene
    htmlGuide: createScene('html_guide_scene'),
    
    // Withdraw scene
    withdrawAmount: createScene('withdraw_amount_scene'),
    
    // Set wallet scene
    setWallet: createScene('set_wallet_scene'),
    
    // Gift code scene
    createGiftCode: createScene('create_gift_code_scene'),
    redeemGiftCode: createScene('redeem_gift_code_scene'),
    
    // Task scenes
    addTaskStep1: createScene('add_task_step1_scene'),
    addTaskStep2: createScene('add_task_step2_scene'),
    addTaskStep3: createScene('add_task_step3_scene'),
    addTaskStep4: createScene('add_task_step4_scene'),
    addTaskStep5: createScene('add_task_step5_scene'),
    addTaskStep6: createScene('add_task_step6_scene'),
    submitTaskProof: createScene('submit_task_proof_scene'),
    editTask: createScene('edit_task_scene'),
    
    // Search scenes
    searchUsers: createScene('search_users_scene'),
    searchWithdrawals: createScene('search_withdrawals_scene'),
    
    // Admin code scene
    adminCode: createScene('admin_code_scene'),
    
    // Refer settings scene
    referSettings: createScene('refer_settings_scene'),
    
    // Bonus settings scene
    bonusSettings: createScene('bonus_settings_scene'),
    
    // Withdrawal request action scene
    withdrawalAction: createScene('withdrawal_action_scene'),
    
    // Task action scene
    taskAction: createScene('task_action_scene'),
    
    // Hide channels scene
    hideChannels: createScene('hide_channels_scene'),
    
    // Just show channels scene
    justShowChannels: createScene('just_show_channels_scene'),
    
    // Auto accept channels scene
    autoAcceptChannels: createScene('auto_accept_channels_scene'),
    
    // Need join channels scene
    needJoinChannels: createScene('need_join_channels_scene')
};

// Register all scenes
Object.values(scenes).forEach(scene => stage.register(scene));

// 🔐 ADMIN CONFIGURATION
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [8435248854, 5518423310];
const ADMIN_CODE = process.env.ADMIN_CODE || 'ADMIN123';

// Default configurations
const DEFAULT_CONFIG = {
    startImage: 'https://res.cloudinary.com/dneusgyzc/image/upload/v1763670359/1000106281_cfg1ke.jpg',
    startMessage: '👋 *Welcome to Earning Bot!*\n\n🔐 Join our channels to start earning money!',
    menuImage: 'https://res.cloudinary.com/dneusgyzc/image/upload/v1763670359/1000106281_cfg1ke.jpg',
    menuMessage: '💰 *Earning Dashboard*\n\nSelect an option below to start earning!',
    bonusImage: 'https://res.cloudinary.com/dneusgyzc/image/upload/v1763670359/1000106281_cfg1ke.jpg',
    bonusAmount: 10,
    bonusMessage: '🎁 Welcome Bonus!',
    minWithdraw: 50,
    maxWithdraw: 10000,
    referBonus: 10,
    taskBonus: 5,
    giftCodeExpiry: 1440, // 24 hours in minutes
    adminCode: ADMIN_CODE,
    showContactButton: true,
    channels: [],
    admins: ADMIN_IDS,
    mutedAdmins: [],
    uploadedImages: [],
    giftCodes: [],
    tasks: [],
    withdrawals: [],
    taskRequests: [],
    imageOverlaySettings: {
        startImage: false,
        menuImage: false,
        bonusImage: true,
        showAmountOnBonus: true
    },
    channelSettings: {
        hide: [],
        justShow: [],
        autoAccept: [],
        needJoin: []
    },
    referSettings: {
        minAmount: 5,
        maxAmount: 100,
        enabled: true
    },
    bonusSettings: {
        enabled: true,
        minAmount: 5,
        maxAmount: 50
    },
    botDisabled: false,
    disabledMessage: '🚧 Bot is under maintenance. Please check back later.',
    autoAcceptRequests: true,
    createdAt: new Date(),
    updatedAt: new Date()
};

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
                ...DEFAULT_CONFIG
            });
            
            console.log('✅ Created new bot configuration');
        } else {
            console.log('✅ Loaded existing bot configuration');
        }
        
        // Create indexes
        await db.collection('users').createIndex({ userId: 1 }, { unique: true });
        await db.collection('users').createIndex({ referCode: 1 }, { unique: true, sparse: true });
        await db.collection('users').createIndex({ referredBy: 1 });
        await db.collection('admin').createIndex({ type: 1 }, { unique: true });
        await db.collection('transactions').createIndex({ userId: 1 });
        await db.collection('transactions').createIndex({ createdAt: -1 });
        await db.collection('giftCodes').createIndex({ code: 1 }, { unique: true });
        await db.collection('giftCodes').createIndex({ expiresAt: 1 });
        await db.collection('tasks').createIndex({ status: 1 });
        await db.collection('taskRequests').createIndex({ userId: 1 });
        await db.collection('taskRequests').createIndex({ status: 1 });
        await db.collection('withdrawals').createIndex({ userId: 1 });
        await db.collection('withdrawals').createIndex({ status: 1 });
        await db.collection('withdrawals').createIndex({ createdAt: -1 });
        
        console.log(`✅ Bot initialized with ${ADMIN_IDS.length} admins`);
        return true;
    } catch (error) {
        console.error('❌ Error initializing bot:', error);
        return false;
    }
}

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
        return false;
    }
    
    errorData.attempts++;
    errorData.lastAttempt = now;
    errorCooldowns.set(errorKey, errorData);
    
    return true;
}

function resetErrorCooldown(errorKey) {
    errorCooldowns.delete(errorKey);
}

// Generate Random Referral Code (5 alphanumeric characters)
function generateReferCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Generate Withdrawal ID (7 alphanumeric)
function generateWithdrawalId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 7; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

// Generate Gift Code
function generateGiftCode(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Generate Random Amount in Range
function generateRandomAmount(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
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

// Safe send message with HTML parse mode
async function safeSendMessage(ctx, text, options = {}) {
    try {
        return await ctx.reply(text, { 
            parse_mode: 'HTML',
            ...options 
        });
    } catch (error) {
        console.error('Error sending message:', error.message);
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

// Check if admin is muted
async function isAdminMuted(adminId) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        if (!config || !config.mutedAdmins) return false;
        
        return config.mutedAdmins.includes(adminId);
    } catch (error) {
        console.error('Error checking muted admin:', error);
        return false;
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

// Get User with Referral Data
async function getUserWithReferrals(userId) {
    try {
        const user = await db.collection('users').findOne({ userId: Number(userId) });
        if (!user) return null;
        
        const referrals = await db.collection('users')
            .find({ referredBy: user.referCode })
            .sort({ joinedAt: -1 })
            .toArray();
            
        const totalEarnedFromRef = await db.collection('transactions')
            .aggregate([
                { $match: { userId: Number(userId), type: 'referral_bonus' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ])
            .toArray();
            
        return {
            ...user,
            referrals: referrals || [],
            totalReferrals: referrals.length,
            totalEarnedFromRef: totalEarnedFromRef[0]?.total || 0
        };
    } catch (error) {
        console.error('Error getting user with referrals:', error);
        return null;
    }
}

// Add Transaction
async function addTransaction(userId, type, amount, description = '', metadata = {}) {
    try {
        const transaction = {
            userId: Number(userId),
            type,
            amount: Number(amount),
            description,
            metadata,
            createdAt: new Date()
        };
        
        await db.collection('transactions').insertOne(transaction);
        
        // Update user balance
        if (type === 'credit') {
            await db.collection('users').updateOne(
                { userId: Number(userId) },
                { $inc: { balance: Number(amount) } }
            );
        } else if (type === 'debit') {
            await db.collection('users').updateOne(
                { userId: Number(userId) },
                { $inc: { balance: -Number(amount) } }
            );
        }
        
        return transaction;
    } catch (error) {
        console.error('Error adding transaction:', error);
        return null;
    }
}

// Get User Transactions (Paginated)
async function getUserTransactions(userId, page = 1, limit = 15) {
    try {
        const skip = (page - 1) * limit;
        const transactions = await db.collection('transactions')
            .find({ userId: Number(userId) })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
            
        const total = await db.collection('transactions')
            .countDocuments({ userId: Number(userId) });
            
        return {
            transactions,
            page,
            totalPages: Math.ceil(total / limit),
            total,
            hasNext: page < Math.ceil(total / limit),
            hasPrev: page > 1
        };
    } catch (error) {
        console.error('Error getting user transactions:', error);
        return { transactions: [], page: 1, totalPages: 0, total: 0, hasNext: false, hasPrev: false };
    }
}

// Get Channels to Display in Start Screen
async function getChannelsToDisplay(userId) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        if (!config || !config.channels || config.channels.length === 0) return [];
        
        const channels = config.channels;
        const channelSettings = config.channelSettings || {};
        const hideChannels = channelSettings.hide || [];
        
        // Filter out hidden channels
        const visibleChannels = channels.filter(channel => !hideChannels.includes(channel.id));
        
        const channelsToDisplay = [];
        const promises = visibleChannels.map(async (channel) => {
            // Check if channel is marked as "just show" - don't verify membership
            const justShowChannels = channelSettings.justShow || [];
            if (justShowChannels.includes(channel.id)) {
                channelsToDisplay.push(channel);
                return;
            }
            
            // Check if channel is marked as "need join" - must verify membership
            const needJoinChannels = channelSettings.needJoin || [];
            if (needJoinChannels.includes(channel.id)) {
                let userHasJoined = false;
                
                try {
                    const member = await bot.telegram.getChatMember(channel.id, userId);
                    if (member.status !== 'left' && member.status !== 'kicked') {
                        userHasJoined = true;
                    }
                } catch (error) {
                    // Can't check membership
                }
                
                // Only add to display if user hasn't joined yet
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

// Check if user has joined all required channels
async function hasJoinedAllChannels(userId) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        if (!config || !config.channels || config.channels.length === 0) return true;
        
        const channels = config.channels;
        const channelSettings = config.channelSettings || {};
        const needJoinChannels = channelSettings.needJoin || [];
        const hideChannels = channelSettings.hide || [];
        
        if (needJoinChannels.length === 0) return true;
        
        for (const channel of channels) {
            // Skip hidden channels and channels not marked as "need join"
            if (hideChannels.includes(channel.id) || !needJoinChannels.includes(channel.id)) {
                continue;
            }
            
            try {
                const member = await bot.telegram.getChatMember(channel.id, userId);
                if (member.status === 'left' || member.status === 'kicked') {
                    return false;
                }
            } catch (error) {
                // Can't check membership, assume not joined
                return false;
            }
        }
        
        return true;
    } catch (error) {
        console.error('Error checking joined channels:', error);
        return false;
    }
}

// Format Time Remaining
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

// Format Amount
function formatAmount(amount) {
    return '₹' + Number(amount).toFixed(2);
}

// Clean name for image display
function cleanNameForImage(text) {
    if (!text) return 'User';
    return text.replace(/[^\w\s\-\.]/gi, '').trim() || 'User';
}

// Get Cloudinary URL with name overlay
async function getCloudinaryUrlWithName(originalUrl, name, amount = null, imageType = 'startImage') {
    try {
        if (!originalUrl.includes('cloudinary.com')) {
            return originalUrl;
        }
        
        const config = await db.collection('admin').findOne({ type: 'config' });
        const overlaySettings = config?.imageOverlaySettings || {
            startImage: false,
            menuImage: false,
            bonusImage: true,
            showAmountOnBonus: true
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
        
        const cleanName = cleanNameForImage(name) || 'User';
        let overlayText = cleanName;
        
        // Add amount to bonus image if enabled
        if (imageType === 'bonusImage' && overlaySettings.showAmountOnBonus && amount !== null) {
            overlayText = `${cleanName}\n${formatAmount(amount)}`;
        }
        
        // Split the URL to insert the text overlay transformation
        if (originalUrl.includes('/upload/')) {
            const parts = originalUrl.split('/upload/');
            if (parts.length === 2) {
                const encodedText = encodeURIComponent(overlayText);
                const textOverlay = `l_text:Arial_80_bold:${encodedText},co_rgb:00e5ff,g_center/`;
                const newTransformation = textOverlay + parts[1];
                return `${parts[0]}/upload/${newTransformation}`;
            }
        }
        
        return originalUrl;
    } catch (error) {
        console.error('Error in getCloudinaryUrlWithName:', error);
        return originalUrl;
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

// Save to Database Helper
async function saveToDatabase(collection, query, update, options = {}) {
    try {
        const result = await db.collection(collection).updateOne(
            query,
            update,
            { upsert: true, ...options }
        );
        return result;
    } catch (error) {
        console.error(`Database error in ${collection}:`, error);
        throw error;
    }
}

// Get paginated users for admin
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

// Search users by text
async function searchUsers(searchText) {
    try {
        const regex = new RegExp(searchText, 'i');
        const users = await db.collection('users')
            .find({
                $or: [
                    { userId: { $regex: regex } },
                    { username: { $regex: regex } },
                    { firstName: { $regex: regex } },
                    { lastName: { $regex: regex } },
                    { referCode: { $regex: regex } }
                ]
            })
            .limit(50)
            .toArray();
            
        return users;
    } catch (error) {
        console.error('Error searching users:', error);
        return [];
    }
}

// ==========================================
// CHAT JOIN REQUEST HANDLER
// ==========================================

bot.on('chat_join_request', async (ctx) => {
    try {
        const userId = ctx.chatJoinRequest.from.id;
        const chatId = ctx.chatJoinRequest.chat.id;
        
        console.log(`📨 Join request from user ${userId} for chat ${chatId}`);
        
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        const channelSettings = config?.channelSettings || {};
        const autoAcceptChannels = channelSettings.autoAccept || [];
        
        // Check if this chat is in our channel list
        const channel = channels.find(ch => String(ch.id) === String(chatId));
        
        if (channel && channel.type === 'private' && autoAcceptChannels.includes(channel.id)) {
            try {
                await bot.telegram.approveChatJoinRequest(chatId, userId);
                console.log(`✅ Approved join request for user ${userId} in channel ${channel.title}`);
                
                // Notify admin
                await notifyAdmin(`✅ <b>Join Request Auto-Approved</b>\n\n👤 User: ${userId}\n📺 Channel: ${channel.title}`);
                
            } catch (error) {
                console.error(`❌ Failed to approve join request:`, error.message);
            }
        }
    } catch (error) {
        console.error('Error in chat join request handler:', error);
    }
});

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
        const referCode = ctx.payload; // Check for referral code in start payload
        
        // Check if user exists
        let userData = await db.collection('users').findOne({ userId: userId });
        
        if (!userData) {
            // Generate referral code
            let referCodeUser = generateReferCode();
            let codeExists = await db.collection('users').findOne({ referCode: referCodeUser });
            while (codeExists) {
                referCodeUser = generateReferCode();
                codeExists = await db.collection('users').findOne({ referCode: referCodeUser });
            }
            
            // Create new user
            userData = {
                userId: userId,
                firstName: user.first_name || '',
                lastName: user.last_name || '',
                username: user.username || '',
                referCode: referCodeUser,
                referredBy: referCode || null,
                balance: 0,
                wallet: null,
                joinedAllChannels: false,
                totalEarned: 0,
                totalWithdrawn: 0,
                referralCount: 0,
                joinedAt: new Date(),
                lastActive: new Date()
            };
            
            await db.collection('users').insertOne(userData);
            console.log(`👤 New user registered: ${userId}`);
            
            // Notify admin
            const userLink = user.username ? `@${user.username}` : user.first_name || 'Unknown';
            await notifyAdmin(`🆕 <b>New User Joined</b>\n\nID: <code>${userId}</code>\nUser: ${userLink}\nRefer Code: ${referCodeUser}`);
            
            // If referred by someone, give referral bonus
            if (referCode) {
                const referrer = await db.collection('users').findOne({ referCode: referCode });
                if (referrer) {
                    const config = await db.collection('admin').findOne({ type: 'config' });
                    const referBonus = config?.referBonus || DEFAULT_CONFIG.referBonus;
                    
                    await addTransaction(referrer.userId, 'credit', referBonus, 'Referral bonus');
                    
                    // Update referrer's referral count
                    await db.collection('users').updateOne(
                        { userId: referrer.userId },
                        { $inc: { referralCount: 1 } }
                    );
                    
                    // Notify referrer
                    try {
                        await bot.telegram.sendMessage(
                            referrer.userId,
                            `🎉 You earned ${formatAmount(referBonus)} referral bonus!\nNew user joined using your referral link.`
                        );
                    } catch (error) {
                        console.error('Failed to notify referrer:', error);
                    }
                }
            }
            
            // Give welcome bonus if enabled
            const bonusEnabled = config?.bonusSettings?.enabled !== false;
            if (bonusEnabled) {
                const bonusAmount = config?.bonusAmount || DEFAULT_CONFIG.bonusAmount;
                await addTransaction(userId, 'credit', bonusAmount, 'Welcome bonus');
                
                await safeSendMessage(ctx, 
                    `🎁 <b>Welcome Bonus!</b>\n\nYou received ${formatAmount(bonusAmount)} as welcome bonus!\n\nCheck your balance in the main menu.`,
                    { parse_mode: 'HTML' }
                );
            }
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
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.');
    }
});

// Show Start Screen
async function showStartScreen(ctx) {
    try {
        const user = ctx.from;
        const userId = user.id;
        
        // Get configuration
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channelsToDisplay = await getChannelsToDisplay(userId);
        
        // Prepare user variables
        const userVars = {
            first_name: user.first_name || '',
            last_name: user.last_name || '',
            full_name: [user.first_name, user.last_name].filter(Boolean).join(' ').trim(),
            username: user.username ? `@${user.username}` : '',
            name: cleanNameForImage(user.first_name || user.username || 'User')
        };
        
        // Prepare image URL
        let startImage = config?.startImage || DEFAULT_CONFIG.startImage;
        startImage = await getCloudinaryUrlWithName(startImage, userVars.name, null, 'startImage');
        
        // Prepare message
        let startMessage = config?.startMessage || DEFAULT_CONFIG.startMessage;
        
        // Create buttons
        const buttons = [];

        // Add channel buttons if there are channels to display
        if (channelsToDisplay.length > 0) {
            buttons.push([{ text: '📌 Available Channels', callback_data: 'no_action' }]);
            
            // Group channels 2 per row
            for (let i = 0; i < channelsToDisplay.length; i += 2) {
                const row = [];
                
                // First channel
                const channel1 = channelsToDisplay[i];
                const buttonText1 = channel1.buttonLabel || `Join ${channel1.title}`;
                row.push({ text: buttonText1, url: channel1.link });
                
                // Second channel if exists
                if (i + 1 < channelsToDisplay.length) {
                    const channel2 = channelsToDisplay[i + 1];
                    const buttonText2 = channel2.buttonLabel || `Join ${channel2.title}`;
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
        
        // Add contact admin button if enabled
        const showContactButton = config?.showContactButton !== false;
        if (showContactButton) {
            buttons.push([{ text: '📞 Contact Admin', callback_data: 'contact_admin' }]);
        }
        
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

// Check Joined
bot.action('check_joined', async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        const userId = ctx.from.id;
        
        // Check if user has joined all required channels
        const hasJoined = await hasJoinedAllChannels(userId);
        
        if (hasJoined) {
            // Update user status
            await db.collection('users').updateOne(
                { userId: userId },
                { $set: { joinedAllChannels: true } }
            );
            
            await showMainMenu(ctx);
        } else {
            await safeSendMessage(ctx, '⚠️ Please join all required channels first!');
            await showStartScreen(ctx);
        }
    } catch (error) {
        console.error('Check joined error:', error);
        await ctx.answerCbQuery('❌ Error checking channels');
    }
});

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

// ==========================================
// MAIN MENU
// ==========================================

async function showMainMenu(ctx) {
    try {
        const userId = ctx.from.id;
        
        // Check if user has joined all channels
        const hasJoined = await hasJoinedAllChannels(userId);
        if (!hasJoined) {
            await safeSendMessage(ctx, '⚠️ Please join all channels first!', {
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
            { $set: { joinedAllChannels: true } }
        );
        
        // Create keyboard buttons
        const keyboard = [
            ['💰 Balance', '👤 User Details'],
            ['💸 Withdraw', '💳 Set Wallet'],
            ['📤 Refer', '👥 All Refers'],
            ['🎁 Bonus', '🎟️ Gift Code'],
            ['📞 Contact', '📋 Tasks'],
            ['🔙 Back to Start']
        ];
        
        await safeSendMessage(ctx, '🎉 <b>Welcome to Earning Dashboard!</b>\n\nSelect an option:', {
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: keyboard,
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
        
    } catch (error) {
        console.error('Show main menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.');
    }
}

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
// TEXT COMMAND HANDLERS
// ==========================================

bot.hears('💰 Balance', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const user = await db.collection('users').findOne({ userId: userId });
        
        if (!user) {
            await ctx.reply('❌ User not found. Please use /start first.');
            return;
        }
        
        // Get recent transactions
        const transactions = await getUserTransactions(userId, 1, 15);
        
        let balanceText = `💰 <b>Your Balance: ${formatAmount(user.balance)}</b>\n\n`;
        balanceText += `📊 <b>Recent Transactions:</b>\n\n`;
        
        if (transactions.transactions.length === 0) {
            balanceText += 'No transactions yet.\n';
        } else {
            transactions.transactions.forEach((txn, index) => {
                const date = new Date(txn.createdAt).toLocaleDateString();
                const type = txn.type === 'credit' ? '➕' : '➖';
                const amount = formatAmount(txn.amount);
                balanceText += `${index + 1}. ${type} ${amount}\n`;
                balanceText += `   ${txn.description}\n`;
                balanceText += `   ${date}\n\n`;
            });
        }
        
        const keyboard = [
            [{ text: '📤 Withdraw', callback_data: 'withdraw_menu' }],
            [{ text: '📊 More Transactions', callback_data: 'more_transactions_1' }],
            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
        ];
        
        await safeSendMessage(ctx, balanceText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Balance command error:', error);
        await ctx.reply('❌ Error fetching balance.');
    }
});

bot.hears('👤 User Details', async (ctx) => {
    try {
        const user = ctx.from;
        const userId = user.id;
        
        const userData = await getUserWithReferrals(userId);
        
        if (!userData) {
            await ctx.reply('❌ User not found. Please use /start first.');
            return;
        }
        
        // Create user profile text
        let profileText = `👤 <b>User Profile</b>\n\n`;
        profileText += `🆔 <b>User ID:</b> <code>${userId}</code>\n`;
        profileText += `👤 <b>Name:</b> ${user.first_name || ''} ${user.last_name || ''}\n`;
        profileText += `📱 <b>Username:</b> ${user.username ? `@${user.username}` : 'Not set'}\n`;
        profileText += `💰 <b>Balance:</b> ${formatAmount(userData.balance)}\n`;
        profileText += `🎯 <b>Refer Code:</b> <code>${userData.referCode}</code>\n`;
        profileText += `👥 <b>Total Referrals:</b> ${userData.totalReferrals}\n`;
        profileText += `💸 <b>Earned from Referrals:</b> ${formatAmount(userData.totalEarnedFromRef)}\n`;
        profileText += `📅 <b>Joined:</b> ${new Date(userData.joinedAt).toLocaleDateString()}\n`;
        
        // Send user details
        await safeSendMessage(ctx, profileText, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📤 Share Refer Link', callback_data: 'share_refer' }],
                    [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                ]
            }
        });
        
    } catch (error) {
        console.error('User details error:', error);
        await ctx.reply('❌ Error fetching user details.');
    }
});

bot.hears('💸 Withdraw', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const user = await db.collection('users').findOne({ userId: userId });
        
        if (!user) {
            await ctx.reply('❌ User not found. Please use /start first.');
            return;
        }
        
        const config = await db.collection('admin').findOne({ type: 'config' });
        const minWithdraw = config?.minWithdraw || DEFAULT_CONFIG.minWithdraw;
        const maxWithdraw = config?.maxWithdraw || DEFAULT_CONFIG.maxWithdraw;
        
        let withdrawText = `💸 <b>Withdrawal</b>\n\n`;
        withdrawText += `💰 <b>Your Balance:</b> ${formatAmount(user.balance)}\n`;
        withdrawText += `📊 <b>Minimum Withdrawal:</b> ${formatAmount(minWithdraw)}\n`;
        withdrawText += `📈 <b>Maximum Withdrawal:</b> ${formatAmount(maxWithdraw)}\n\n`;
        
        if (!user.wallet) {
            withdrawText += `⚠️ <b>Please set your wallet first!</b>\n\n`;
        } else {
            withdrawText += `💳 <b>Current Wallet:</b> ${user.wallet}\n\n`;
        }
        
        withdrawText += `Enter the amount you want to withdraw:\n\n`;
        withdrawText += `Type "cancel" to cancel.`;
        
        await safeSendMessage(ctx, withdrawText, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💳 Set/Edit Wallet', callback_data: 'set_wallet' }],
                    [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                ]
            }
        });
        
        // Enter withdrawal amount scene
        await ctx.scene.enter('withdraw_amount_scene');
        
    } catch (error) {
        console.error('Withdraw command error:', error);
        await ctx.reply('❌ Error processing withdrawal.');
    }
});

// Withdraw amount scene
scenes.withdrawAmount.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Withdrawal cancelled.');
            await ctx.scene.leave();
            await showMainMenu(ctx);
            return;
        }
        
        const userId = ctx.from.id;
        const amount = parseFloat(ctx.message.text);
        
        if (isNaN(amount) || amount <= 0) {
            await ctx.reply('❌ Please enter a valid amount.');
            return;
        }
        
        const user = await db.collection('users').findOne({ userId: userId });
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        const minWithdraw = config?.minWithdraw || DEFAULT_CONFIG.minWithdraw;
        const maxWithdraw = config?.maxWithdraw || DEFAULT_CONFIG.maxWithdraw;
        
        // Check conditions
        if (!user.wallet) {
            await ctx.reply('❌ Please set your wallet first!');
            await ctx.scene.leave();
            return;
        }
        
        if (user.balance < amount) {
            await ctx.reply(`❌ Insufficient balance. Your balance is ${formatAmount(user.balance)}`);
            await ctx.scene.leave();
            return;
        }
        
        if (amount < minWithdraw) {
            await ctx.reply(`❌ Minimum withdrawal amount is ${formatAmount(minWithdraw)}`);
            await ctx.scene.leave();
            return;
        }
        
        if (amount > maxWithdraw) {
            await ctx.reply(`❌ Maximum withdrawal amount is ${formatAmount(maxWithdraw)}`);
            await ctx.scene.leave();
            return;
        }
        
        // Generate withdrawal ID
        const withdrawalId = generateWithdrawalId();
        
        // Create withdrawal request
        const withdrawal = {
            withdrawalId: withdrawalId,
            userId: userId,
            amount: amount,
            wallet: user.wallet,
            status: 'pending',
            createdAt: new Date(),
            userInfo: {
                firstName: user.firstName,
                lastName: user.lastName,
                username: user.username
            }
        };
        
        await db.collection('withdrawals').insertOne(withdrawal);
        
        // Deduct from user balance
        await addTransaction(userId, 'debit', amount, 'Withdrawal request');
        
        // Update user total withdrawn
        await db.collection('users').updateOne(
            { userId: userId },
            { $inc: { totalWithdrawn: amount } }
        );
        
        // Notify admin
        const userLink = user.username ? `@${user.username}` : user.firstName || 'Unknown';
        await notifyAdmin(`💸 <b>New Withdrawal Request</b>\n\n🆔 <b>Withdrawal ID:</b> <code>${withdrawalId}</code>\n👤 <b>User:</b> ${userLink}\n💰 <b>Amount:</b> ${formatAmount(amount)}\n💳 <b>Wallet:</b> ${user.wallet}\n📅 <b>Time:</b> ${new Date().toLocaleString()}`);
        
        await ctx.reply(`✅ <b>Withdrawal request submitted!</b>\n\n🆔 <b>Withdrawal ID:</b> <code>${withdrawalId}</code>\n💰 <b>Amount:</b> ${formatAmount(amount)}\n💳 <b>Wallet:</b> ${user.wallet}\n\n⏳ Please wait for admin approval.`, {
            parse_mode: 'HTML'
        });
        
        await ctx.scene.leave();
        await showMainMenu(ctx);
        
    } catch (error) {
        console.error('Withdraw amount error:', error);
        await ctx.reply('❌ Error processing withdrawal.');
        await ctx.scene.leave();
    }
});

bot.hears('💳 Set Wallet', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const user = await db.collection('users').findOne({ userId: userId });
        
        if (!user) {
            await ctx.reply('❌ User not found. Please use /start first.');
            return;
        }
        
        let walletText = `💳 <b>Set Wallet</b>\n\n`;
        
        if (user.wallet) {
            walletText += `📱 <b>Current Wallet:</b> ${user.wallet}\n\n`;
        }
        
        walletText += `Enter your UPI ID or Wallet Address:\n\n`;
        walletText += `Example: username@upi or wallet_address\n\n`;
        walletText += `Type "cancel" to cancel.`;
        
        await safeSendMessage(ctx, walletText, {
            parse_mode: 'HTML'
        });
        
        // Enter set wallet scene
        await ctx.scene.enter('set_wallet_scene');
        
    } catch (error) {
        console.error('Set wallet error:', error);
        await ctx.reply('❌ Error setting wallet.');
    }
});

// Set wallet scene
scenes.setWallet.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Wallet update cancelled.');
            await ctx.scene.leave();
            await showMainMenu(ctx);
            return;
        }
        
        const userId = ctx.from.id;
        const wallet = ctx.message.text.trim();
        
        // Basic validation
        if (wallet.length < 3) {
            await ctx.reply('❌ Please enter a valid wallet address.');
            return;
        }
        
        await db.collection('users').updateOne(
            { userId: userId },
            { $set: { wallet: wallet } }
        );
        
        await ctx.reply(`✅ <b>Wallet updated successfully!</b>\n\n💳 <b>New Wallet:</b> ${wallet}`, {
            parse_mode: 'HTML'
        });
        
        await ctx.scene.leave();
        await showMainMenu(ctx);
        
    } catch (error) {
        console.error('Set wallet scene error:', error);
        await ctx.reply('❌ Error updating wallet.');
        await ctx.scene.leave();
    }
});

bot.hears('📤 Refer', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const user = await db.collection('users').findOne({ userId: userId });
        
        if (!user) {
            await ctx.reply('❌ User not found. Please use /start first.');
            return;
        }
        
        const config = await db.collection('admin').findOne({ type: 'config' });
        const referBonus = config?.referBonus || DEFAULT_CONFIG.referBonus;
        
        const referLink = `https://t.me/${ctx.botInfo.username}?start=${user.referCode}`;
        
        let referText = `📤 <b>Refer & Earn</b>\n\n`;
        referText += `🎯 <b>Your Refer Code:</b> <code>${user.referCode}</code>\n`;
        referText += `🔗 <b>Your Refer Link:</b>\n<code>${referLink}</code>\n\n`;
        referText += `💰 <b>Earn ${formatAmount(referBonus)} for each successful referral!</b>\n\n`;
        referText += `👥 <b>Total Referrals:</b> ${user.referralCount || 0}\n`;
        referText += `💸 <b>Total Earned from Referrals:</b> ${formatAmount(user.totalEarnedFromRef || 0)}\n\n`;
        referText += `📢 <b>How to Refer:</b>\n`;
        referText += `1. Share your refer link with friends\n`;
        referText += `2. Ask them to click the link and join the bot\n`;
        referText += `3. When they complete registration, you get ${formatAmount(referBonus)}!\n`;
        
        const keyboard = [
            [{ text: '📤 Share Refer Link', callback_data: 'share_refer' }],
            [{ text: '👥 View All Referrals', callback_data: 'view_all_refers' }],
            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
        ];
        
        await safeSendMessage(ctx, referText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Refer command error:', error);
        await ctx.reply('❌ Error loading referral information.');
    }
});

// Share refer link
bot.action('share_refer', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const user = await db.collection('users').findOne({ userId: userId });
        
        if (!user) {
            await ctx.answerCbQuery('❌ User not found');
            return;
        }
        
        const referLink = `https://t.me/${ctx.botInfo.username}?start=${user.referCode}`;
        const shareText = `🎉 Join me on this amazing earning bot!\n\nEarn money by completing simple tasks!\n\nUse my refer link to get started:\n${referLink}\n\nRefer Code: ${user.referCode}`;
        
        await ctx.reply(shareText);
        await ctx.answerCbQuery('✅ Refer link copied!');
        
    } catch (error) {
        console.error('Share refer error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.hears('👥 All Refers', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const userData = await getUserWithReferrals(userId);
        
        if (!userData) {
            await ctx.reply('❌ User not found. Please use /start first.');
            return;
        }
        
        if (userData.referrals.length === 0) {
            await ctx.reply('📭 No referrals yet. Share your refer link to get started!');
            return;
        }
        
        // Show first page of referrals
        await showReferralsPage(ctx, userId, 1);
        
    } catch (error) {
        console.error('All refers error:', error);
        await ctx.reply('❌ Error loading referrals.');
    }
});

async function showReferralsPage(ctx, userId, page = 1) {
    try {
        const limit = 10;
        const skip = (page - 1) * limit;
        
        const referrals = await db.collection('users')
            .find({ referredBy: ctx.from.id })
            .sort({ joinedAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
            
        const total = await db.collection('users')
            .countDocuments({ referredBy: ctx.from.id });
            
        let referralsText = `👥 <b>Your Referrals</b>\n\n`;
        referralsText += `📊 <b>Total Referrals:</b> ${total}\n\n`;
        
        referrals.forEach((ref, index) => {
            const num = (page - 1) * limit + index + 1;
            const status = ref.joinedAllChannels ? '✅' : '❌';
            referralsText += `${num}. ${status} ${ref.firstName || 'User'} ${ref.username ? `(@${ref.username})` : ''}\n`;
            referralsText += `   Joined: ${new Date(ref.joinedAt).toLocaleDateString()}\n\n`;
        });
        
        const keyboard = [];
        
        // Navigation buttons
        if (page > 1) {
            keyboard.push({ text: '◀️ Previous', callback_data: `ref_page_${page - 1}` });
        }
        
        keyboard.push({ text: `📄 ${page}/${Math.ceil(total / limit)}`, callback_data: 'no_action' });
        
        if (page < Math.ceil(total / limit)) {
            keyboard.push({ text: 'Next ▶️', callback_data: `ref_page_${page + 1}` });
        }
        
        const navRow = keyboard.length > 0 ? [keyboard] : [];
        
        const finalKeyboard = [
            ...navRow,
            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
        ];
        
        await safeSendMessage(ctx, referralsText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: finalKeyboard }
        });
        
    } catch (error) {
        console.error('Show referrals page error:', error);
        await ctx.reply('❌ Error loading referrals.');
    }
}

// Referral pagination
bot.action(/^ref_page_(\d+)$/, async (ctx) => {
    try {
        const page = parseInt(ctx.match[1]);
        await ctx.deleteMessage().catch(() => {});
        await showReferralsPage(ctx, ctx.from.id, page);
    } catch (error) {
        console.error('Referral pagination error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.hears('🎁 Bonus', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        const bonusEnabled = config?.bonusSettings?.enabled !== false;
        if (!bonusEnabled) {
            await ctx.reply('❌ Bonus feature is currently disabled.');
            return;
        }
        
        const bonusAmount = config?.bonusAmount || DEFAULT_CONFIG.bonusAmount;
        const bonusImage = config?.bonusImage || DEFAULT_CONFIG.bonusImage;
        const bonusMessage = config?.bonusMessage || DEFAULT_CONFIG.bonusMessage;
        
        // Get image with overlay
        const user = ctx.from;
        const userName = cleanNameForImage(user.first_name || user.username || 'User');
        const finalImage = await getCloudinaryUrlWithName(bonusImage, userName, bonusAmount, 'bonusImage');
        
        const bonusText = `${bonusMessage}\n\n💰 <b>Bonus Amount: ${formatAmount(bonusAmount)}</b>\n\nClick the button below to claim your bonus!`;
        
        const keyboard = [
            [{ text: '🎁 Claim Bonus', callback_data: 'claim_bonus' }],
            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
        ];
        
        await ctx.replyWithPhoto(finalImage, {
            caption: bonusText,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Bonus command error:', error);
        await ctx.reply('❌ Error loading bonus.');
    }
});

// Claim bonus
bot.action('claim_bonus', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        const bonusEnabled = config?.bonusSettings?.enabled !== false;
        if (!bonusEnabled) {
            await ctx.answerCbQuery('❌ Bonus feature is disabled');
            return;
        }
        
        // Check if user already claimed bonus today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const existingBonus = await db.collection('transactions').findOne({
            userId: userId,
            type: 'bonus',
            createdAt: { $gte: today }
        });
        
        if (existingBonus) {
            await ctx.answerCbQuery('❌ Bonus already claimed today');
            return;
        }
        
        const bonusAmount = config?.bonusAmount || DEFAULT_CONFIG.bonusAmount;
        
        // Add bonus to user account
        await addTransaction(userId, 'credit', bonusAmount, 'Daily bonus');
        
        await ctx.answerCbQuery(`✅ You received ${formatAmount(bonusAmount)} bonus!`);
        await ctx.reply(`🎉 <b>Bonus Claimed!</b>\n\n💰 <b>Amount:</b> ${formatAmount(bonusAmount)}\n\nCheck your updated balance.`, {
            parse_mode: 'HTML'
        });
        
    } catch (error) {
        console.error('Claim bonus error:', error);
        await ctx.answerCbQuery('❌ Error claiming bonus');
    }
});

bot.hears('🎟️ Gift Code', async (ctx) => {
    try {
        await safeSendMessage(ctx, '🎟️ <b>Gift Code</b>\n\nEnter gift code to redeem:\n\nType "cancel" to cancel.', {
            parse_mode: 'HTML'
        });
        
        await ctx.scene.enter('redeem_gift_code_scene');
        
    } catch (error) {
        console.error('Gift code command error:', error);
        await ctx.reply('❌ Error loading gift code.');
    }
});

// Redeem gift code scene
scenes.redeemGiftCode.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Gift code redemption cancelled.');
            await ctx.scene.leave();
            await showMainMenu(ctx);
            return;
        }
        
        const userId = ctx.from.id;
        const code = ctx.message.text.trim().toUpperCase();
        
        // Check if gift code exists
        const giftCode = await db.collection('giftCodes').findOne({ code: code });
        
        if (!giftCode) {
            await ctx.reply('❌ Invalid gift code.');
            return;
        }
        
        // Check if expired
        if (giftCode.expiresAt && new Date() > giftCode.expiresAt) {
            await ctx.reply('❌ Gift code has expired.');
            return;
        }
        
        // Check if max uses reached
        if (giftCode.maxUses && giftCode.usedCount >= giftCode.maxUses) {
            await ctx.reply('❌ Gift code has reached maximum uses.');
            return;
        }
        
        // Check if user already used this code
        const existingUse = giftCode.usedBy?.find(u => u.userId === userId);
        if (existingUse) {
            await ctx.reply('❌ You have already used this gift code.');
            return;
        }
        
        // Generate random amount within range
        const amount = generateRandomAmount(giftCode.minAmount, giftCode.maxAmount);
        
        // Add transaction
        await addTransaction(userId, 'credit', amount, `Gift code: ${code}`);
        
        // Update gift code usage
        await db.collection('giftCodes').updateOne(
            { code: code },
            { 
                $inc: { usedCount: 1 },
                $push: { 
                    usedBy: {
                        userId: userId,
                        claimedAt: new Date(),
                        amount: amount
                    }
                }
            }
        );
        
        await ctx.reply(`🎉 <b>Gift Code Redeemed!</b>\n\n🎟️ <b>Code:</b> ${code}\n💰 <b>Amount:</b> ${formatAmount(amount)}\n\nCheck your updated balance.`, {
            parse_mode: 'HTML'
        });
        
        await ctx.scene.leave();
        await showMainMenu(ctx);
        
    } catch (error) {
        console.error('Redeem gift code error:', error);
        await ctx.reply('❌ Error redeeming gift code.');
        await ctx.scene.leave();
    }
});

bot.hears('📞 Contact', async (ctx) => {
    try {
        await safeSendMessage(ctx, '📞 <b>Contact Admin</b>\n\nSend your message to contact admin:\n\nType "cancel" to cancel.', {
            parse_mode: 'HTML'
        });
        
        await ctx.scene.enter('report_to_admin_scene');
        
    } catch (error) {
        console.error('Contact command error:', error);
        await ctx.reply('❌ Error loading contact.');
    }
});

bot.hears('📋 Tasks', async (ctx) => {
    try {
        const userId = ctx.from.id;
        
        // Get available tasks
        const tasks = await db.collection('tasks')
            .find({ status: 'active' })
            .sort({ createdAt: -1 })
            .toArray();
        
        if (tasks.length === 0) {
            await ctx.reply('📭 No tasks available at the moment. Check back later!');
            return;
        }
        
        let tasksText = `📋 <b>Available Tasks</b>\n\n`;
        
        tasks.forEach((task, index) => {
            tasksText += `${index + 1}. <b>${task.name}</b>\n`;
            tasksText += `   💰 Reward: ${formatAmount(task.reward)}\n`;
            tasksText += `   📝 ${task.description.substring(0, 50)}...\n\n`;
        });
        
        const keyboard = tasks.map(task => [
            { text: task.name, callback_data: `view_task_${task._id}` }
        ]);
        
        keyboard.push([{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]);
        
        await safeSendMessage(ctx, tasksText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Tasks command error:', error);
        await ctx.reply('❌ Error loading tasks.');
    }
});

// View task details
bot.action(/^view_task_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const task = await db.collection('tasks').findOne({ _id: new ObjectId(taskId) });
        
        if (!task) {
            await ctx.answerCbQuery('❌ Task not found');
            return;
        }
        
        let taskText = `📋 <b>${task.name}</b>\n\n`;
        taskText += `💰 <b>Reward:</b> ${formatAmount(task.reward)}\n`;
        taskText += `📝 <b>Description:</b>\n${task.description}\n\n`;
        
        if (task.instructions) {
            taskText += `📋 <b>Instructions:</b>\n${task.instructions}\n\n`;
        }
        
        // Show required screenshots
        if (task.screenshotButtons && task.screenshotButtons.length > 0) {
            taskText += `📸 <b>Required Screenshots:</b>\n`;
            task.screenshotButtons.forEach((btn, index) => {
                taskText += `${index + 1}. ${btn}\n`;
            });
            taskText += `\n`;
        }
        
        taskText += `Click "Start Task" to begin.`;
        
        const keyboard = [
            [{ text: '🚀 Start Task', callback_data: `start_task_${task._id}` }],
            [{ text: '🔙 Back to Tasks', callback_data: 'back_to_tasks' }]
        ];
        
        await safeEditMessage(ctx, taskText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('View task error:', error);
        await ctx.answerCbQuery('❌ Error loading task');
    }
});

// Start task
bot.action(/^start_task_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const userId = ctx.from.id;
        
        // Store task ID in session for proof submission
        ctx.session.currentTask = {
            taskId: taskId,
            userId: userId,
            step: 1,
            screenshots: []
        };
        
        await safeSendMessage(ctx, '📸 <b>Task Submission</b>\n\nPlease send the required screenshots one by one.\n\nType "cancel" to cancel.', {
            parse_mode: 'HTML'
        });
        
        await ctx.scene.enter('submit_task_proof_scene');
        
    } catch (error) {
        console.error('Start task error:', error);
        await ctx.answerCbQuery('❌ Error starting task');
    }
});

// Submit task proof scene
scenes.submitTaskProof.on('photo', async (ctx) => {
    try {
        if (!ctx.session.currentTask) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            return;
        }
        
        const taskId = ctx.session.currentTask.taskId;
        const task = await db.collection('tasks').findOne({ _id: new ObjectId(taskId) });
        
        if (!task) {
            await safeSendMessage(ctx, '❌ Task not found.');
            await ctx.scene.leave();
            return;
        }
        
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const fileLink = await ctx.telegram.getFileLink(photo.file_id);
        
        // Store screenshot
        ctx.session.currentTask.screenshots.push({
            fileId: photo.file_id,
            fileLink: fileLink,
            step: ctx.session.currentTask.step
        });
        
        ctx.session.currentTask.step++;
        
        // Check if all screenshots uploaded
        if (task.screenshotButtons && ctx.session.currentTask.step > task.screenshotButtons.length) {
            // All screenshots uploaded, submit task request
            const taskRequest = {
                taskId: taskId,
                userId: ctx.from.id,
                screenshots: ctx.session.currentTask.screenshots,
                status: 'pending',
                reward: task.reward,
                submittedAt: new Date(),
                userInfo: {
                    firstName: ctx.from.first_name,
                    lastName: ctx.from.last_name,
                    username: ctx.from.username
                }
            };
            
            await db.collection('taskRequests').insertOne(taskRequest);
            
            // Notify admin
            const userLink = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || 'Unknown';
            await notifyAdmin(`📋 <b>New Task Submission</b>\n\n👤 <b>User:</b> ${userLink}\n📝 <b>Task:</b> ${task.name}\n💰 <b>Reward:</b> ${formatAmount(task.reward)}\n📅 <b>Time:</b> ${new Date().toLocaleString()}`);
            
            await safeSendMessage(ctx, `✅ <b>Task submitted successfully!</b>\n\n📝 <b>Task:</b> ${task.name}\n💰 <b>Reward:</b> ${formatAmount(task.reward)}\n\n⏳ Please wait for admin approval.`, {
                parse_mode: 'HTML'
            });
            
            // Clear session
            delete ctx.session.currentTask;
            await ctx.scene.leave();
            await showMainMenu(ctx);
        } else {
            // Ask for next screenshot
            const buttonName = task.screenshotButtons[ctx.session.currentTask.step - 1];
            await ctx.reply(`📸 Please send screenshot for: <b>${buttonName}</b>\n\n(${ctx.session.currentTask.step}/${task.screenshotButtons.length})`, {
                parse_mode: 'HTML'
            });
        }
        
    } catch (error) {
        console.error('Submit task proof error:', error);
        await safeSendMessage(ctx, '❌ Error submitting task.');
        await ctx.scene.leave();
    }
});

scenes.submitTaskProof.on('text', async (ctx) => {
    if (ctx.message.text.toLowerCase() === 'cancel') {
        await safeSendMessage(ctx, '❌ Task submission cancelled.');
        delete ctx.session.currentTask;
        await ctx.scene.leave();
        await showMainMenu(ctx);
    }
});

bot.hears('🔙 Back to Menu', async (ctx) => {
    await showMainMenu(ctx);
});

bot.hears('🔙 Back to Start', async (ctx) => {
    await showStartScreen(ctx);
});

// Back to tasks
bot.action('back_to_tasks', async (ctx) => {
    await ctx.deleteMessage().catch(() => {});
    
    // Get available tasks
    const tasks = await db.collection('tasks')
        .find({ status: 'active' })
        .sort({ createdAt: -1 })
        .toArray();
    
    if (tasks.length === 0) {
        await ctx.reply('📭 No tasks available at the moment. Check back later!');
        return;
    }
    
    let tasksText = `📋 <b>Available Tasks</b>\n\n`;
    
    tasks.forEach((task, index) => {
        tasksText += `${index + 1}. <b>${task.name}</b>\n`;
        tasksText += `   💰 Reward: ${formatAmount(task.reward)}\n`;
        tasksText += `   📝 ${task.description.substring(0, 50)}...\n\n`;
    });
    
    const keyboard = tasks.map(task => [
        { text: task.name, callback_data: `view_task_${task._id}` }
    ]);
    
    keyboard.push([{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]);
    
    await safeSendMessage(ctx, tasksText, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
});

// ==========================================
// ADMIN PANEL
// ==========================================

bot.command('admin', async (ctx) => {
    try {
        if (!await isAdmin(ctx.from.id)) {
            // Check if admin code provided
            const args = ctx.message.text.split(' ');
            if (args.length === 2) {
                const code = args[1];
                const config = await db.collection('admin').findOne({ type: 'config' });
                
                if (config?.adminCode === code) {
                    // Add user as admin
                    const newAdmins = [...(config.admins || []), ctx.from.id];
                    await db.collection('admin').updateOne(
                        { type: 'config' },
                        { $set: { admins: newAdmins } }
                    );
                    
                    await safeSendMessage(ctx, '✅ You are now an admin!');
                } else {
                    return safeSendMessage(ctx, '❌ Invalid admin code.');
                }
            } else {
                return safeSendMessage(ctx, '❌ You are not authorized to use this command.');
            }
        }
        
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Admin command error:', error);
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.');
    }
});

async function showAdminPanel(ctx) {
    try {
        const text = '👮‍♂️ <b>Admin Control Panel</b>\n\nSelect an option below:';
        
        const keyboard = [
            [{ text: '📢 Broadcast', callback_data: 'admin_broadcast' }, { text: '👥 User Stats', callback_data: 'admin_userstats' }],
            [{ text: '📝 Start Message', callback_data: 'admin_startmessage' }, { text: '🖼️ Start Image', callback_data: 'admin_startimage' }],
            [{ text: '📝 Menu Message', callback_data: 'admin_menumessage' }, { text: '🖼️ Menu Image', callback_data: 'admin_menuimage' }],
            [{ text: '🎟️ Create Gift Code', callback_data: 'admin_create_giftcode' }, { text: '🎁 Bonus', callback_data: 'admin_bonus' }],
            [{ text: '📋 Manage Bonus', callback_data: 'admin_manage_bonus' }, { text: '🖼️ Bonus Image', callback_data: 'admin_bonusimage' }],
            [{ text: '📺 Manage Channels', callback_data: 'admin_channels' }, { text: '👑 Manage Admins', callback_data: 'admin_manage_admins' }],
            [{ text: '🎟️ Manage Gift Codes', callback_data: 'admin_manage_giftcodes' }, { text: '⚙️ Image Overlay', callback_data: 'admin_image_overlay' }],
            [{ text: '📞 Contact Button', callback_data: 'admin_contact_button' }, { text: '🔼🔽 Reorder Channels', callback_data: 'admin_reorder_channels' }],
            [{ text: '✏️ Edit Channels', callback_data: 'admin_edit_channels' }, { text: '🚫 Disable Bot', callback_data: 'admin_disable_bot' }],
            [{ text: '👁️ Hide Channels (F)', callback_data: 'admin_hide_channels' }, { text: '👁️ Just Show (S)', callback_data: 'admin_just_show' }],
            [{ text: '✅ Auto Accept (SS)', callback_data: 'admin_auto_accept' }, { text: '🔐 Need Join (SSS)', callback_data: 'admin_need_join' }],
            [{ text: '📤 Refer Settings', callback_data: 'admin_refer_settings' }, { text: '🖼️ Manage Images', callback_data: 'admin_manage_images' }],
            [{ text: '🗑️ Delete Data', callback_data: 'admin_deletedata' }, { text: '🔕 Mute Notifications', callback_data: 'admin_mute_notifications' }],
            [{ text: '📋 HTML Guide', callback_data: 'admin_html_guide' }, { text: '📋 Manage Tasks', callback_data: 'admin_manage_tasks' }],
            [{ text: '➕ Add Tasks', callback_data: 'admin_add_tasks' }, { text: '📋 Task History', callback_data: 'admin_task_history' }],
            [{ text: '📋 Task Requests', callback_data: 'admin_task_requests' }, { text: '💸 Withdrawal Requests', callback_data: 'admin_withdrawal_requests' }],
            [{ text: '📊 Withdrawal History', callback_data: 'admin_withdrawal_history' }]
        ];
        
        if (ctx.callbackQuery) {
            await safeEditMessage(ctx, text, {
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await safeSendMessage(ctx, text, {
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
// ADMIN FEATURES IMPLEMENTATION
// ==========================================

// Broadcast
bot.action('admin_broadcast', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await safeEditMessage(ctx, '📢 <b>Broadcast Message</b>\n\nSend the message you want to broadcast to all users.\n\n<i>Supports HTML formatting</i>\n\nType "cancel" to cancel.');
    await ctx.scene.enter('broadcast_scene');
});

scenes.broadcast.on(['text', 'photo'], async (ctx) => {
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
        
        await notifyAdmin(`✅ <b>Broadcast Complete</b>\n\n📊 Statistics:\n• Total: ${totalUsers}\n• ✅ Successful: ${successful}\n• ❌ Failed: ${failed}\n👤 Admin: ${ctx.from.id}`);
        
    } catch (error) {
        console.error('Broadcast error:', error);
        await safeSendMessage(ctx, '❌ Broadcast failed.');
    }
    
    await ctx.scene.leave();
    await showAdminPanel(ctx);
});

// User Stats
bot.action('admin_userstats', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await showUserStatsPage(ctx, 1);
});

async function showUserStatsPage(ctx, page) {
    try {
        const userData = await getPaginatedUsers(page, 20);
        const users = userData.users;
        const totalUsers = userData.totalUsers;
        
        let usersText = `<b>📊 User Statistics</b>\n\n`;
        usersText += `• <b>Total Users:</b> ${totalUsers}\n\n`;
        usersText += `<b>👥 Users (Page ${page}/${userData.totalPages}):</b>\n\n`;
        
        // Create keyboard with 2 users per row
        const keyboard = [];
        
        // Add search button
        keyboard.push([{ text: '🔍 Search Users', callback_data: 'admin_search_users' }]);
        
        // Group users 2 per row
        for (let i = 0; i < users.length; i += 2) {
            const row = [];
            
            // First user in row
            const user1 = users[i];
            const userNum1 = (page - 1) * 20 + i + 1;
            const userName1 = user1.username ? `@${user1.username}` : user1.firstName || `User ${user1.userId}`;
            row.push({ 
                text: `${userNum1}. ${userName1}`, 
                callback_data: `user_detail_${user1.userId}` 
            });
            
            // Second user in row if exists
            if (i + 1 < users.length) {
                const user2 = users[i + 1];
                const userNum2 = (page - 1) * 20 + i + 2;
                const userName2 = user2.username ? `@${user2.username}` : user2.firstName || `User ${user2.userId}`;
                row.push({ 
                    text: `${userNum2}. ${userName2}`, 
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

// Search users
bot.action('admin_search_users', async (ctx) => {
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
        
        const searchText = ctx.message.text.trim();
        const users = await searchUsers(searchText);
        
        if (users.length === 0) {
            await safeSendMessage(ctx, '❌ No users found matching your search.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        let usersText = `<b>🔍 Search Results (${users.length} users)</b>\n\n`;
        
        const keyboard = [];
        
        users.forEach((user, index) => {
            const userName = user.username ? `@${user.username}` : user.firstName || `User ${user.userId}`;
            keyboard.push([{ 
                text: `${index + 1}. ${userName}`, 
                callback_data: `user_detail_${user.userId}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        await safeSendMessage(ctx, usersText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
        await ctx.scene.leave();
        
    } catch (error) {
        console.error('Search users error:', error);
        await safeSendMessage(ctx, '❌ Error searching users.');
        await ctx.scene.leave();
    }
});

// User detail
bot.action(/^user_detail_(\d+)$/, async (ctx) => {
    try {
        const userId = ctx.match[1];
        const user = await getUserWithReferrals(Number(userId));
        
        if (!user) {
            await ctx.answerCbQuery('❌ User not found');
            return;
        }
        
        const userDetail = `<b>👤 User Details</b>\n\n`;
        userDetail += `• <b>ID:</b> <code>${user.userId}</code>\n`;
        userDetail += `• <b>Username:</b> <code>${user.username || 'No username'}</code>\n`;
        userDetail += `• <b>Name:</b> ${user.firstName || ''} ${user.lastName || ''}\n`;
        userDetail += `• <b>Refer Code:</b> <code>${user.referCode}</code>\n`;
        userDetail += `• <b>Referred By:</b> ${user.referredBy || 'Not referred'}\n`;
        userDetail += `• <b>Balance:</b> ${formatAmount(user.balance)}\n`;
        userDetail += `• <b>Total Earned:</b> ${formatAmount(user.totalEarned || 0)}\n`;
        userDetail += `• <b>Total Withdrawn:</b> ${formatAmount(user.totalWithdrawn || 0)}\n`;
        userDetail += `• <b>Referrals:</b> ${user.totalReferrals}\n`;
        userDetail += `• <b>Joined:</b> ${new Date(user.joinedAt).toLocaleString()}\n`;
        userDetail += `• <b>Last Active:</b> ${user.lastActive ? new Date(user.lastActive).toLocaleString() : 'Never'}\n`;
        userDetail += `• <b>Channels Joined:</b> ${user.joinedAllChannels ? '✅ Yes' : '❌ No'}\n`;
        userDetail += `• <b>Wallet:</b> ${user.wallet || 'Not set'}\n`;
        
        const keyboard = [
            [{ text: '💬 Send Message', callback_data: `contact_user_${userId}` }],
            [{ text: '💰 Add Balance', callback_data: `add_balance_${userId}` }],
            [{ text: '📤 View Transactions', callback_data: `view_transactions_${userId}` }],
            [{ text: '👥 View Referrals', callback_data: `view_user_refers_${userId}` }],
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

// Start Message
bot.action('admin_startmessage', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentMessage = config?.startMessage || DEFAULT_CONFIG.startMessage;
        
        const text = `<b>📝 Start Message Management</b>\n\nCurrent Message:\n<code>${escapeMarkdown(currentMessage)}</code>\n\nAvailable variables: {first_name}, {last_name}, {full_name}, {username}, {name}\n\nSupports HTML formatting\n\nSelect an option:`;
        
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
    await safeSendMessage(ctx, 'Enter the new start message:\n\n<i>Supports HTML formatting</i>\n\nType "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    await ctx.scene.enter('edit_start_message_scene');
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
        await showAdminPanel(ctx);
        
    } catch (error) {
        console.error('Edit start message error:', error);
        await safeSendMessage(ctx, '✅ Message updated!\n\nUse /admin to return to panel.');
        await ctx.scene.leave();
    }
});

// Start Image
bot.action('admin_startimage', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentImage = config?.startImage || DEFAULT_CONFIG.startImage;
        
        const text = `<b>🖼️ Start Image Management</b>\n\nCurrent Image:\n<code>${currentImage}</code>\n\nSelect an option:`;
        
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
    await safeSendMessage(ctx, 'Enter the new image URL:\n\nType "cancel" to cancel.', {
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
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { startImage: newUrl, updatedAt: new Date() } }
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

// Menu Message and other admin features follow similar pattern...

// Create Gift Code
bot.action('admin_create_giftcode', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await safeSendMessage(ctx, '🎟️ <b>Create Gift Code</b>\n\nEnter maximum number of uses:\n\nType "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    
    await ctx.scene.enter('create_gift_code_scene');
});

scenes.createGiftCode.on('text', async (ctx) => {
    try {
        if (!ctx.session.giftCodeData) {
            ctx.session.giftCodeData = {};
        }
        
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Gift code creation cancelled.');
            delete ctx.session.giftCodeData;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const step = ctx.session.giftCodeData.step || 1;
        
        switch (step) {
            case 1: // Max uses
                const maxUses = parseInt(ctx.message.text);
                if (isNaN(maxUses) || maxUses < 1) {
                    await ctx.reply('❌ Please enter a valid number (minimum 1).');
                    return;
                }
                ctx.session.giftCodeData.maxUses = maxUses;
                ctx.session.giftCodeData.step = 2;
                await ctx.reply('⏰ Enter expiry time in minutes (0 for no expiry):');
                break;
                
            case 2: // Expiry time
                const expiryMinutes = parseInt(ctx.message.text);
                if (isNaN(expiryMinutes) || expiryMinutes < 0) {
                    await ctx.reply('❌ Please enter a valid number.');
                    return;
                }
                ctx.session.giftCodeData.expiryMinutes = expiryMinutes;
                ctx.session.giftCodeData.step = 3;
                await ctx.reply('🔢 Enter code length (8-20 characters):');
                break;
                
            case 3: // Code length
                const codeLength = parseInt(ctx.message.text);
                if (isNaN(codeLength) || codeLength < 8 || codeLength > 20) {
                    await ctx.reply('❌ Please enter a valid length between 8 and 20.');
                    return;
                }
                ctx.session.giftCodeData.codeLength = codeLength;
                ctx.session.giftCodeData.step = 4;
                await ctx.reply('💰 Enter minimum amount:');
                break;
                
            case 4: // Min amount
                const minAmount = parseFloat(ctx.message.text);
                if (isNaN(minAmount) || minAmount < 0) {
                    await ctx.reply('❌ Please enter a valid amount.');
                    return;
                }
                ctx.session.giftCodeData.minAmount = minAmount;
                ctx.session.giftCodeData.step = 5;
                await ctx.reply('💰 Enter maximum amount:');
                break;
                
            case 5: // Max amount
                const maxAmount = parseFloat(ctx.message.text);
                if (isNaN(maxAmount) || maxAmount < ctx.session.giftCodeData.minAmount) {
                    await ctx.reply(`❌ Please enter a valid amount greater than or equal to ${ctx.session.giftCodeData.minAmount}.`);
                    return;
                }
                ctx.session.giftCodeData.maxAmount = maxAmount;
                
                // Generate gift code
                const code = generateGiftCode(ctx.session.giftCodeData.codeLength);
                
                // Create gift code object
                const giftCode = {
                    code: code,
                    maxUses: ctx.session.giftCodeData.maxUses,
                    usedCount: 0,
                    minAmount: ctx.session.giftCodeData.minAmount,
                    maxAmount: ctx.session.giftCodeData.maxAmount,
                    expiresAt: ctx.session.giftCodeData.expiryMinutes > 0 
                        ? new Date(Date.now() + ctx.session.giftCodeData.expiryMinutes * 60000)
                        : null,
                    createdAt: new Date(),
                    createdBy: ctx.from.id,
                    usedBy: []
                };
                
                await db.collection('giftCodes').insertOne(giftCode);
                
                let resultText = `✅ <b>Gift Code Created!</b>\n\n`;
                resultText += `🎟️ <b>Code:</b> <code>${code}</code>\n`;
                resultText += `👥 <b>Max Uses:</b> ${giftCode.maxUses}\n`;
                resultText += `💰 <b>Amount Range:</b> ${formatAmount(giftCode.minAmount)} - ${formatAmount(giftCode.maxAmount)}\n`;
                resultText += `⏰ <b>Expires:</b> ${giftCode.expiresAt ? giftCode.expiresAt.toLocaleString() : 'Never'}\n`;
                resultText += `📅 <b>Created:</b> ${giftCode.createdAt.toLocaleString()}`;
                
                await safeSendMessage(ctx, resultText, {
                    parse_mode: 'HTML'
                });
                
                // Clear session
                delete ctx.session.giftCodeData;
                await ctx.scene.leave();
                await showAdminPanel(ctx);
                break;
        }
        
    } catch (error) {
        console.error('Create gift code error:', error);
        await safeSendMessage(ctx, '❌ Error creating gift code.');
        delete ctx.session.giftCodeData;
        await ctx.scene.leave();
    }
});

// Manage Gift Codes
bot.action('admin_manage_giftcodes', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const giftCodes = await db.collection('giftCodes')
            .find({})
            .sort({ createdAt: -1 })
            .toArray();
        
        if (giftCodes.length === 0) {
            await safeSendMessage(ctx, '❌ No gift codes found.');
            return;
        }
        
        let text = `<b>🎟️ Manage Gift Codes</b>\n\n`;
        text += `Total Gift Codes: ${giftCodes.length}\n\n`;
        
        const keyboard = [];
        
        giftCodes.forEach((code, index) => {
            const status = code.expiresAt && new Date() > code.expiresAt ? '❌' : 
                          code.maxUses && code.usedCount >= code.maxUses ? '✅' : '🟢';
            keyboard.push([{ 
                text: `${status} ${index + 1}. ${code.code}`, 
                callback_data: `edit_giftcode_${code._id}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Manage gift codes error:', error);
        await safeSendMessage(ctx, '❌ Error loading gift codes.');
    }
});

// Withdrawal Requests
bot.action('admin_withdrawal_requests', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await showWithdrawalRequestsPage(ctx, 1);
});

async function showWithdrawalRequestsPage(ctx, page = 1) {
    try {
        const limit = 10;
        const skip = (page - 1) * limit;
        
        const withdrawals = await db.collection('withdrawals')
            .find({ status: 'pending' })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
            
        const total = await db.collection('withdrawals')
            .countDocuments({ status: 'pending' });
            
        let text = `<b>💸 Withdrawal Requests</b>\n\n`;
        text += `📊 <b>Pending Requests:</b> ${total}\n\n`;
        
        // Add search button
        const keyboard = [[{ text: '🔍 Search Withdrawals', callback_data: 'admin_search_withdrawals' }]];
        
        if (withdrawals.length === 0) {
            text += '📭 No pending withdrawal requests.\n';
        } else {
            withdrawals.forEach((withdrawal, index) => {
                const num = (page - 1) * limit + index + 1;
                text += `${num}. <b>${withdrawal.withdrawalId}</b>\n`;
                text += `   👤 User: ${withdrawal.userInfo.username ? `@${withdrawal.userInfo.username}` : withdrawal.userInfo.firstName || 'Unknown'}\n`;
                text += `   💰 Amount: ${formatAmount(withdrawal.amount)}\n`;
                text += `   💳 Wallet: ${withdrawal.wallet}\n`;
                text += `   📅 Time: ${new Date(withdrawal.createdAt).toLocaleString()}\n\n`;
                
                keyboard.push([{ 
                    text: `📋 ${withdrawal.withdrawalId} - ${formatAmount(withdrawal.amount)}`, 
                    callback_data: `withdrawal_action_${withdrawal._id}` 
                }]);
            });
        }
        
        // Navigation buttons
        if (page > 1 || page < Math.ceil(total / limit)) {
            const navRow = [];
            if (page > 1) {
                navRow.push({ text: '◀️ Previous', callback_data: `withdrawals_page_${page - 1}` });
            }
            navRow.push({ text: `📄 ${page}/${Math.ceil(total / limit)}`, callback_data: 'no_action' });
            if (page < Math.ceil(total / limit)) {
                navRow.push({ text: 'Next ▶️', callback_data: `withdrawals_page_${page + 1}` });
            }
            keyboard.push(navRow);
        }
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Withdrawal requests error:', error);
        await safeSendMessage(ctx, '❌ Error loading withdrawal requests.');
    }
}

// Withdrawal action
bot.action(/^withdrawal_action_(.+)$/, async (ctx) => {
    try {
        const withdrawalId = ctx.match[1];
        const withdrawal = await db.collection('withdrawals').findOne({ _id: new ObjectId(withdrawalId) });
        
        if (!withdrawal) {
            await ctx.answerCbQuery('❌ Withdrawal not found');
            return;
        }
        
        ctx.session.currentWithdrawal = withdrawal;
        
        let text = `<b>💸 Withdrawal Action</b>\n\n`;
        text += `🆔 <b>Withdrawal ID:</b> <code>${withdrawal.withdrawalId}</code>\n`;
        text += `👤 <b>User:</b> ${withdrawal.userInfo.username ? `@${withdrawal.userInfo.username}` : withdrawal.userInfo.firstName || 'Unknown'}\n`;
        text += `🆔 <b>User ID:</b> <code>${withdrawal.userId}</code>\n`;
        text += `💰 <b>Amount:</b> ${formatAmount(withdrawal.amount)}\n`;
        text += `💳 <b>Wallet:</b> ${withdrawal.wallet}\n`;
        text += `📅 <b>Time:</b> ${new Date(withdrawal.createdAt).toLocaleString()}\n\n`;
        text += `Select an action:`;
        
        const keyboard = [
            [{ text: '✅ Approve', callback_data: 'approve_withdrawal' }, { text: '❌ Reject', callback_data: 'reject_withdrawal' }],
            [{ text: '🔙 Back to Requests', callback_data: 'admin_withdrawal_requests' }]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Withdrawal action error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Approve withdrawal
bot.action('approve_withdrawal', async (ctx) => {
    try {
        if (!ctx.session.currentWithdrawal) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const withdrawal = ctx.session.currentWithdrawal;
        
        // Generate UTR
        const utr = 'UTR' + Date.now().toString().slice(-12);
        
        // Update withdrawal status
        await db.collection('withdrawals').updateOne(
            { _id: withdrawal._id },
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
                `✅ <b>Withdrawal Approved!</b>\n\n🆔 <b>Withdrawal ID:</b> <code>${withdrawal.withdrawalId}</code>\n💰 <b>Amount:</b> ${formatAmount(withdrawal.amount)}\n💳 <b>Wallet:</b> ${withdrawal.wallet}\n📱 <b>UTR:</b> <code>${utr}</code>\n\nPayment will be processed shortly.`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('Failed to notify user:', error);
        }
        
        await ctx.answerCbQuery('✅ Withdrawal approved');
        
        // Clear session
        delete ctx.session.currentWithdrawal;
        
        // Return to withdrawal requests
        await showWithdrawalRequestsPage(ctx, 1);
        
    } catch (error) {
        console.error('Approve withdrawal error:', error);
        await ctx.answerCbQuery('❌ Error approving withdrawal');
    }
});

// Reject withdrawal
bot.action('reject_withdrawal', async (ctx) => {
    try {
        if (!ctx.session.currentWithdrawal) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const withdrawal = ctx.session.currentWithdrawal;
        
        // Store withdrawal ID in session for reject message
        ctx.session.rejectingWithdrawal = withdrawal._id;
        
        await safeSendMessage(ctx, 'Enter rejection reason:\n\nType "cancel" to cancel.', {
            parse_mode: 'HTML'
        });
        
        await ctx.scene.enter('withdrawal_action_scene');
        
    } catch (error) {
        console.error('Reject withdrawal error:', error);
        await ctx.answerCbQuery('❌ Error rejecting withdrawal');
    }
});

// Withdrawal action scene for reject message
scenes.withdrawalAction.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Rejection cancelled.');
            delete ctx.session.rejectingWithdrawal;
            await ctx.scene.leave();
            return;
        }
        
        if (!ctx.session.rejectingWithdrawal) {
            await safeSendMessage(ctx, '❌ Session expired.');
            await ctx.scene.leave();
            return;
        }
        
        const withdrawalId = ctx.session.rejectingWithdrawal;
        const withdrawal = await db.collection('withdrawals').findOne({ _id: withdrawalId });
        
        if (!withdrawal) {
            await safeSendMessage(ctx, '❌ Withdrawal not found.');
            delete ctx.session.rejectingWithdrawal;
            await ctx.scene.leave();
            return;
        }
        
        const reason = ctx.message.text.trim();
        
        // Update withdrawal status
        await db.collection('withdrawals').updateOne(
            { _id: withdrawalId },
            { 
                $set: { 
                    status: 'rejected',
                    rejectedAt: new Date(),
                    rejectedBy: ctx.from.id,
                    rejectionReason: reason
                } 
            }
        );
        
        // Refund to user
        await addTransaction(withdrawal.userId, 'credit', withdrawal.amount, 'Withdrawal refund');
        
        // Notify user
        try {
            await bot.telegram.sendMessage(
                withdrawal.userId,
                `❌ <b>Withdrawal Rejected</b>\n\n🆔 <b>Withdrawal ID:</b> <code>${withdrawal.withdrawalId}</code>\n💰 <b>Amount:</b> ${formatAmount(withdrawal.amount)}\n💳 <b>Wallet:</b> ${withdrawal.wallet}\n📝 <b>Reason:</b> ${reason}\n\nAmount has been refunded to your balance.`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('Failed to notify user:', error);
        }
        
        await safeSendMessage(ctx, '✅ Withdrawal rejected and amount refunded.');
        
        // Clear sessions
        delete ctx.session.rejectingWithdrawal;
        delete ctx.session.currentWithdrawal;
        
        await ctx.scene.leave();
        await showWithdrawalRequestsPage(ctx, 1);
        
    } catch (error) {
        console.error('Withdrawal action scene error:', error);
        await safeSendMessage(ctx, '❌ Error processing withdrawal.');
        await ctx.scene.leave();
    }
});

// Task Requests
bot.action('admin_task_requests', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await showTaskRequestsPage(ctx, 1);
});

async function showTaskRequestsPage(ctx, page = 1) {
    try {
        const limit = 10;
        const skip = (page - 1) * limit;
        
        const taskRequests = await db.collection('taskRequests')
            .find({ status: 'pending' })
            .sort({ submittedAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
            
        const total = await db.collection('taskRequests')
            .countDocuments({ status: 'pending' });
            
        let text = `<b>📋 Task Requests</b>\n\n`;
        text += `📊 <b>Pending Requests:</b> ${total}\n\n`;
        
        const keyboard = [];
        
        if (taskRequests.length === 0) {
            text += '📭 No pending task requests.\n';
        } else {
            taskRequests.forEach((request, index) => {
                const num = (page - 1) * limit + index + 1;
                const task = request.taskId; // Note: taskId is stored as ObjectId string
                text += `${num}. <b>${request.userInfo.username ? `@${request.userInfo.username}` : request.userInfo.firstName || 'Unknown'}</b>\n`;
                text += `   💰 Reward: ${formatAmount(request.reward)}\n`;
                text += `   📅 Time: ${new Date(request.submittedAt).toLocaleString()}\n\n`;
                
                keyboard.push([{ 
                    text: `👤 ${num}. ${request.userInfo.username || request.userInfo.firstName || 'User'}`, 
                    callback_data: `task_action_${request._id}` 
                }]);
            });
        }
        
        // Navigation buttons
        if (page > 1 || page < Math.ceil(total / limit)) {
            const navRow = [];
            if (page > 1) {
                navRow.push({ text: '◀️ Previous', callback_data: `task_requests_page_${page - 1}` });
            }
            navRow.push({ text: `📄 ${page}/${Math.ceil(total / limit)}`, callback_data: 'no_action' });
            if (page < Math.ceil(total / limit)) {
                navRow.push({ text: 'Next ▶️', callback_data: `task_requests_page_${page + 1}` });
            }
            keyboard.push(navRow);
        }
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Task requests error:', error);
        await safeSendMessage(ctx, '❌ Error loading task requests.');
    }
}

// Task action
bot.action(/^task_action_(.+)$/, async (ctx) => {
    try {
        const requestId = ctx.match[1];
        const request = await db.collection('taskRequests').findOne({ _id: new ObjectId(requestId) });
        
        if (!request) {
            await ctx.answerCbQuery('❌ Task request not found');
            return;
        }
        
        ctx.session.currentTaskRequest = request;
        
        // Get task details
        const task = await db.collection('tasks').findOne({ _id: new ObjectId(request.taskId) });
        
        let text = `<b>📋 Task Submission Review</b>\n\n`;
        text += `👤 <b>User:</b> ${request.userInfo.username ? `@${request.userInfo.username}` : request.userInfo.firstName || 'Unknown'}\n`;
        text += `🆔 <b>User ID:</b> <code>${request.userId}</code>\n`;
        if (task) {
            text += `📝 <b>Task:</b> ${task.name}\n`;
        }
        text += `💰 <b>Reward:</b> ${formatAmount(request.reward)}\n`;
        text += `📅 <b>Submitted:</b> ${new Date(request.submittedAt).toLocaleString()}\n\n`;
        
        // Show screenshots
        if (request.screenshots && request.screenshots.length > 0) {
            text += `📸 <b>Screenshots (${request.screenshots.length}):</b>\n`;
            
            // Send screenshots as media group
            const media = request.screenshots.map((screenshot, index) => ({
                type: 'photo',
                media: screenshot.fileId,
                caption: index === 0 ? `Screenshot ${index + 1}` : undefined
            }));
            
            try {
                await ctx.replyWithMediaGroup(media);
            } catch (error) {
                text += `\n⚠️ Could not load screenshots\n`;
            }
        }
        
        text += `\nSelect an action:`;
        
        const keyboard = [
            [{ text: '✅ Approve', callback_data: 'approve_task' }, { text: '❌ Reject', callback_data: 'reject_task' }],
            [{ text: '🔙 Back to Requests', callback_data: 'admin_task_requests' }]
        ];
        
        await safeSendMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Task action error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Approve task
bot.action('approve_task', async (ctx) => {
    try {
        if (!ctx.session.currentTaskRequest) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const request = ctx.session.currentTaskRequest;
        
        // Update request status
        await db.collection('taskRequests').updateOne(
            { _id: request._id },
            { 
                $set: { 
                    status: 'approved',
                    approvedAt: new Date(),
                    approvedBy: ctx.from.id
                } 
            }
        );
        
        // Reward user
        await addTransaction(request.userId, 'credit', request.reward, 'Task completion');
        
        // Notify user
        try {
            await bot.telegram.sendMessage(
                request.userId,
                `✅ <b>Task Approved!</b>\n\n💰 <b>Reward:</b> ${formatAmount(request.reward)}\n\nAmount has been added to your balance.`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('Failed to notify user:', error);
        }
        
        await ctx.answerCbQuery('✅ Task approved');
        
        // Clear session
        delete ctx.session.currentTaskRequest;
        
        // Return to task requests
        await showTaskRequestsPage(ctx, 1);
        
    } catch (error) {
        console.error('Approve task error:', error);
        await ctx.answerCbQuery('❌ Error approving task');
    }
});

// Reject task
bot.action('reject_task', async (ctx) => {
    try {
        if (!ctx.session.currentTaskRequest) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const request = ctx.session.currentTaskRequest;
        
        // Store request ID in session for reject message
        ctx.session.rejectingTaskRequest = request._id;
        
        await safeSendMessage(ctx, 'Enter rejection reason:\n\nType "cancel" to cancel.', {
            parse_mode: 'HTML'
        });
        
        await ctx.scene.enter('task_action_scene');
        
    } catch (error) {
        console.error('Reject task error:', error);
        await ctx.answerCbQuery('❌ Error rejecting task');
    }
});

// Task action scene for reject message
scenes.taskAction.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Rejection cancelled.');
            delete ctx.session.rejectingTaskRequest;
            await ctx.scene.leave();
            return;
        }
        
        if (!ctx.session.rejectingTaskRequest) {
            await safeSendMessage(ctx, '❌ Session expired.');
            await ctx.scene.leave();
            return;
        }
        
        const requestId = ctx.session.rejectingTaskRequest;
        const request = await db.collection('taskRequests').findOne({ _id: requestId });
        
        if (!request) {
            await safeSendMessage(ctx, '❌ Task request not found.');
            delete ctx.session.rejectingTaskRequest;
            await ctx.scene.leave();
            return;
        }
        
        const reason = ctx.message.text.trim();
        
        // Update request status
        await db.collection('taskRequests').updateOne(
            { _id: requestId },
            { 
                $set: { 
                    status: 'rejected',
                    rejectedAt: new Date(),
                    rejectedBy: ctx.from.id,
                    rejectionReason: reason
                } 
            }
        );
        
        // Notify user
        try {
            await bot.telegram.sendMessage(
                request.userId,
                `❌ <b>Task Rejected</b>\n\n📝 <b>Reason:</b> ${reason}\n\nPlease check the task requirements and try again.`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('Failed to notify user:', error);
        }
        
        await safeSendMessage(ctx, '✅ Task rejected.');
        
        // Clear sessions
        delete ctx.session.rejectingTaskRequest;
        delete ctx.session.currentTaskRequest;
        
        await ctx.scene.leave();
        await showTaskRequestsPage(ctx, 1);
        
    } catch (error) {
        console.error('Task action scene error:', error);
        await safeSendMessage(ctx, '❌ Error processing task.');
        await ctx.scene.leave();
    }
});

// ==========================================
// ADDITIONAL ADMIN FEATURES
// ==========================================

// Hide Channels
bot.action('admin_hide_channels', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        const hiddenChannels = config?.channelSettings?.hide || [];
        
        let text = `<b>👁️ Hide Channels (F Level)</b>\n\n`;
        text += `Select channels to hide from users:\n\n`;
        
        const keyboard = [];
        
        channels.forEach((channel, index) => {
            const isHidden = hiddenChannels.includes(channel.id);
            const status = isHidden ? '✅' : '❌';
            keyboard.push([{ 
                text: `${status} ${index + 1}. ${channel.buttonLabel || channel.title}`, 
                callback_data: `toggle_hide_channel_${channel.id}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Hide channels error:', error);
        await safeSendMessage(ctx, '❌ Error loading channels.');
    }
});

// Toggle hide channel
bot.action(/^toggle_hide_channel_(.+)$/, async (ctx) => {
    try {
        const channelId = ctx.match[1];
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channelSettings = config?.channelSettings || {};
        const hiddenChannels = channelSettings.hide || [];
        
        const isHidden = hiddenChannels.includes(channelId);
        
        if (isHidden) {
            // Remove from hidden
            const newHidden = hiddenChannels.filter(id => id !== channelId);
            channelSettings.hide = newHidden;
        } else {
            // Add to hidden
            channelSettings.hide = [...hiddenChannels, channelId];
        }
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { channelSettings: channelSettings, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery(`✅ Channel ${isHidden ? 'shown' : 'hidden'}`);
        await bot.action('admin_hide_channels')(ctx);
        
    } catch (error) {
        console.error('Toggle hide channel error:', error);
        await ctx.answerCbQuery('❌ Error updating channel');
    }
});

// Just Show Channels
bot.action('admin_just_show', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        const justShowChannels = config?.channelSettings?.justShow || [];
        
        let text = `<b>👁️ Just Show Channels (S Level)</b>\n\n`;
        text += `Select channels to just show (no verification):\n\n`;
        
        const keyboard = [];
        
        channels.forEach((channel, index) => {
            const isJustShow = justShowChannels.includes(channel.id);
            const status = isJustShow ? '✅' : '❌';
            keyboard.push([{ 
                text: `${status} ${index + 1}. ${channel.buttonLabel || channel.title}`, 
                callback_data: `toggle_just_show_channel_${channel.id}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Just show channels error:', error);
        await safeSendMessage(ctx, '❌ Error loading channels.');
    }
});

// Toggle just show channel
bot.action(/^toggle_just_show_channel_(.+)$/, async (ctx) => {
    try {
        const channelId = ctx.match[1];
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channelSettings = config?.channelSettings || {};
        const justShowChannels = channelSettings.justShow || [];
        
        const isJustShow = justShowChannels.includes(channelId);
        
        if (isJustShow) {
            // Remove from just show
            const newJustShow = justShowChannels.filter(id => id !== channelId);
            channelSettings.justShow = newJustShow;
        } else {
            // Add to just show
            channelSettings.justShow = [...justShowChannels, channelId];
        }
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { channelSettings: channelSettings, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery(`✅ Channel ${isJustShow ? 'requires verification' : 'just show'}`);
        await bot.action('admin_just_show')(ctx);
        
    } catch (error) {
        console.error('Toggle just show channel error:', error);
        await ctx.answerCbQuery('❌ Error updating channel');
    }
});

// Auto Accept Channels
bot.action('admin_auto_accept', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        const autoAcceptChannels = config?.channelSettings?.autoAccept || [];
        
        let text = `<b>✅ Auto Accept Channels (SS Level)</b>\n\n`;
        text += `Select private channels for auto-approval:\n\n`;
        
        const keyboard = [];
        
        channels.forEach((channel, index) => {
            if (channel.type === 'private') {
                const isAutoAccept = autoAcceptChannels.includes(channel.id);
                const status = isAutoAccept ? '✅' : '❌';
                keyboard.push([{ 
                    text: `${status} ${index + 1}. ${channel.buttonLabel || channel.title}`, 
                    callback_data: `toggle_auto_accept_channel_${channel.id}` 
                }]);
            }
        });
        
        if (keyboard.length === 0) {
            text += `📭 No private channels found.\n`;
        }
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Auto accept channels error:', error);
        await safeSendMessage(ctx, '❌ Error loading channels.');
    }
});

// Toggle auto accept channel
bot.action(/^toggle_auto_accept_channel_(.+)$/, async (ctx) => {
    try {
        const channelId = ctx.match[1];
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channelSettings = config?.channelSettings || {};
        const autoAcceptChannels = channelSettings.autoAccept || [];
        
        const isAutoAccept = autoAcceptChannels.includes(channelId);
        
        if (isAutoAccept) {
            // Remove from auto accept
            const newAutoAccept = autoAcceptChannels.filter(id => id !== channelId);
            channelSettings.autoAccept = newAutoAccept;
        } else {
            // Add to auto accept
            channelSettings.autoAccept = [...autoAcceptChannels, channelId];
        }
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { channelSettings: channelSettings, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery(`✅ Auto accept ${isAutoAccept ? 'disabled' : 'enabled'}`);
        await bot.action('admin_auto_accept')(ctx);
        
    } catch (error) {
        console.error('Toggle auto accept channel error:', error);
        await ctx.answerCbQuery('❌ Error updating channel');
    }
});

// Need Join Channels
bot.action('admin_need_join', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        const needJoinChannels = config?.channelSettings?.needJoin || [];
        
        let text = `<b>🔐 Need Join Channels (SSS Level)</b>\n\n`;
        text += `Select channels that users MUST join:\n\n`;
        
        const keyboard = [];
        
        channels.forEach((channel, index) => {
            const isNeedJoin = needJoinChannels.includes(channel.id);
            const status = isNeedJoin ? '✅' : '❌';
            keyboard.push([{ 
                text: `${status} ${index + 1}. ${channel.buttonLabel || channel.title}`, 
                callback_data: `toggle_need_join_channel_${channel.id}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Need join channels error:', error);
        await safeSendMessage(ctx, '❌ Error loading channels.');
    }
});

// Toggle need join channel
bot.action(/^toggle_need_join_channel_(.+)$/, async (ctx) => {
    try {
        const channelId = ctx.match[1];
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channelSettings = config?.channelSettings || {};
        const needJoinChannels = channelSettings.needJoin || [];
        
        const isNeedJoin = needJoinChannels.includes(channelId);
        
        if (isNeedJoin) {
            // Remove from need join
            const newNeedJoin = needJoinChannels.filter(id => id !== channelId);
            channelSettings.needJoin = newNeedJoin;
        } else {
            // Add to need join
            channelSettings.needJoin = [...needJoinChannels, channelId];
        }
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { channelSettings: channelSettings, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery(`✅ Need join ${isNeedJoin ? 'disabled' : 'enabled'}`);
        await bot.action('admin_need_join')(ctx);
        
    } catch (error) {
        console.error('Toggle need join channel error:', error);
        await ctx.answerCbQuery('❌ Error updating channel');
    }
});

// ==========================================
// ADD TASKS
// ==========================================

bot.action('admin_add_tasks', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await safeSendMessage(ctx, '📋 <b>Add New Task</b>\n\nUpload task images (maximum 3):\n\nSend photos one by one.\nType "next" when done or "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    
    ctx.session.taskData = {
        step: 1,
        images: []
    };
    
    await ctx.scene.enter('add_task_step1_scene');
});

scenes.addTaskStep1.on('photo', async (ctx) => {
    try {
        if (!ctx.session.taskData) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            return;
        }
        
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        ctx.session.taskData.images.push(photo.file_id);
        
        if (ctx.session.taskData.images.length >= 3) {
            await ctx.reply('✅ Maximum 3 images uploaded.\n\nEnter task name:');
            await ctx.scene.leave();
            await ctx.scene.enter('add_task_step2_scene');
        } else {
            await ctx.reply(`✅ Image ${ctx.session.taskData.images.length}/3 uploaded.\n\nSend next image or type "next" to continue.`);
        }
        
    } catch (error) {
        console.error('Add task step1 error:', error);
        await safeSendMessage(ctx, '❌ Error uploading image.');
        await ctx.scene.leave();
    }
});

scenes.addTaskStep1.on('text', async (ctx) => {
    if (ctx.message.text.toLowerCase() === 'cancel') {
        await safeSendMessage(ctx, '❌ Task creation cancelled.');
        delete ctx.session.taskData;
        await ctx.scene.leave();
        await showAdminPanel(ctx);
        return;
    }
    
    if (ctx.message.text.toLowerCase() === 'next') {
        if (ctx.session.taskData.images.length === 0) {
            await ctx.reply('⚠️ Please upload at least one image.');
            return;
        }
        
        await ctx.reply('✅ Images uploaded.\n\nEnter task name:');
        await ctx.scene.leave();
        await ctx.scene.enter('add_task_step2_scene');
    }
});

scenes.addTaskStep2.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Task creation cancelled.');
            delete ctx.session.taskData;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        ctx.session.taskData.name = ctx.message.text.trim();
        await ctx.reply('📝 Enter task description:');
        await ctx.scene.leave();
        await ctx.scene.enter('add_task_step3_scene');
        
    } catch (error) {
        console.error('Add task step2 error:', error);
        await safeSendMessage(ctx, '❌ Error.');
        await ctx.scene.leave();
    }
});

scenes.addTaskStep3.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Task creation cancelled.');
            delete ctx.session.taskData;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        ctx.session.taskData.description = ctx.message.text.trim();
        await ctx.reply('📋 Enter task instructions (optional):');
        await ctx.scene.leave();
        await ctx.scene.enter('add_task_step4_scene');
        
    } catch (error) {
        console.error('Add task step3 error:', error);
        await safeSendMessage(ctx, '❌ Error.');
        await ctx.scene.leave();
    }
});

scenes.addTaskStep4.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Task creation cancelled.');
            delete ctx.session.taskData;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        ctx.session.taskData.instructions = ctx.message.text.trim();
        await ctx.reply('📸 How many screenshots required? (0-5):');
        await ctx.scene.leave();
        await ctx.scene.enter('add_task_step5_scene');
        
    } catch (error) {
        console.error('Add task step4 error:', error);
        await safeSendMessage(ctx, '❌ Error.');
        await ctx.scene.leave();
    }
});

scenes.addTaskStep5.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Task creation cancelled.');
            delete ctx.session.taskData;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const screenshotCount = parseInt(ctx.message.text);
        if (isNaN(screenshotCount) || screenshotCount < 0 || screenshotCount > 5) {
            await ctx.reply('❌ Please enter a number between 0 and 5.');
            return;
        }
        
        ctx.session.taskData.screenshotCount = screenshotCount;
        
        if (screenshotCount === 0) {
            await ctx.reply('💰 Enter task reward amount:');
            await ctx.scene.leave();
            await ctx.scene.enter('add_task_step6_scene');
        } else {
            ctx.session.taskData.screenshotButtons = [];
            ctx.session.taskData.currentScreenshot = 1;
            await ctx.reply(`📝 Enter button name for screenshot 1:\n\nExample: "Upload Screenshot 1"`);
            // Stay in same scene for multiple screenshots
        }
        
    } catch (error) {
        console.error('Add task step5 error:', error);
        await safeSendMessage(ctx, '❌ Error.');
        await ctx.scene.leave();
    }
});

// Handle screenshot button names
bot.on('text', async (ctx) => {
    try {
        if (ctx.session.taskData && ctx.session.taskData.screenshotCount > 0 && 
            ctx.session.taskData.currentScreenshot && 
            ctx.session.taskData.currentScreenshot <= ctx.session.taskData.screenshotCount) {
            
            if (ctx.message.text.toLowerCase() === 'cancel') {
                await safeSendMessage(ctx, '❌ Task creation cancelled.');
                delete ctx.session.taskData;
                await showAdminPanel(ctx);
                return;
            }
            
            ctx.session.taskData.screenshotButtons.push(ctx.message.text.trim());
            
            if (ctx.session.taskData.currentScreenshot < ctx.session.taskData.screenshotCount) {
                ctx.session.taskData.currentScreenshot++;
                await ctx.reply(`📝 Enter button name for screenshot ${ctx.session.taskData.currentScreenshot}:`);
            } else {
                await ctx.reply('💰 Enter task reward amount:');
                await ctx.scene.enter('add_task_step6_scene');
            }
        }
    } catch (error) {
        console.error('Screenshot button handler error:', error);
    }
});

scenes.addTaskStep6.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Task creation cancelled.');
            delete ctx.session.taskData;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const reward = parseFloat(ctx.message.text);
        if (isNaN(reward) || reward <= 0) {
            await ctx.reply('❌ Please enter a valid reward amount.');
            return;
        }
        
        ctx.session.taskData.reward = reward;
        
        // Create task
        const task = {
            name: ctx.session.taskData.name,
            description: ctx.session.taskData.description,
            instructions: ctx.session.taskData.instructions || '',
            images: ctx.session.taskData.images,
            screenshotButtons: ctx.session.taskData.screenshotButtons || [],
            reward: reward,
            status: 'active',
            createdAt: new Date(),
            createdBy: ctx.from.id
        };
        
        await db.collection('tasks').insertOne(task);
        
        await safeSendMessage(ctx, `✅ <b>Task Created Successfully!</b>\n\n📝 <b>Name:</b> ${task.name}\n💰 <b>Reward:</b> ${formatAmount(task.reward)}\n📸 <b>Screenshots Required:</b> ${task.screenshotButtons.length}`, {
            parse_mode: 'HTML'
        });
        
        // Clear session
        delete ctx.session.taskData;
        
        await ctx.scene.leave();
        await showAdminPanel(ctx);
        
    } catch (error) {
        console.error('Add task step6 error:', error);
        await safeSendMessage(ctx, '❌ Error creating task.');
        await ctx.scene.leave();
    }
});

// ==========================================
// ERROR HANDLING AND STARTUP
// ==========================================

bot.catch((error, ctx) => {
    console.error('Bot error:', error);
    
    try {
        if (ctx.message) {
            safeSendMessage(ctx, '❌ An error occurred. Please try again.');
        }
    } catch (e) {
        console.error('Error in error handler:', e);
    }
});

// Emergency stop command
bot.command('emergency', async (ctx) => {
    if (await isAdmin(ctx.from.id)) {
        errorCooldowns.clear();
        await ctx.reply('🆘 Emergency error reset executed.');
    }
});

// Reset errors command
bot.command('reseterrors', async (ctx) => {
    if (await isAdmin(ctx.from.id)) {
        errorCooldowns.clear();
        await ctx.reply('✅ All error cooldowns have been reset!');
    }
});

// Status command
bot.command('status', async (ctx) => {
    if (await isAdmin(ctx.from.id)) {
        let statusText = '🤖 <b>Bot Status Report</b>\n\n';
        statusText += `📊 <b>Error Cooldowns Active:</b> ${errorCooldowns.size}\n`;
        statusText += `⚡ <b>Bot Responsive:</b> ✅ Yes\n`;
        
        try {
            const config = await db.collection('admin').findOne({ type: 'config' });
            statusText += `🗄️ <b>Database:</b> ✅ Connected\n`;
            
            const userCount = await db.collection('users').countDocuments();
            statusText += `👥 <b>Users:</b> ${userCount}\n`;
            
            const taskCount = await db.collection('tasks').countDocuments({ status: 'active' });
            statusText += `📋 <b>Active Tasks:</b> ${taskCount}\n`;
            
            const pendingWithdrawals = await db.collection('withdrawals').countDocuments({ status: 'pending' });
            statusText += `💸 <b>Pending Withdrawals:</b> ${pendingWithdrawals}\n`;
            
            const pendingTasks = await db.collection('taskRequests').countDocuments({ status: 'pending' });
            statusText += `📋 <b>Pending Tasks:</b> ${pendingTasks}\n`;
            
        } catch (dbError) {
            statusText += `🗄️ <b>Database:</b> ❌ Error\n`;
        }
        
        await safeSendMessage(ctx, statusText, { parse_mode: 'HTML' });
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
        
        // Send startup message
        const testAdminId = 8435248854;
        try {
            await bot.telegram.sendMessage(testAdminId, '🤖 Earning Bot started successfully!\n\nFeatures ready:\n• Referral System\n• Task Management\n• Withdrawal System\n• Gift Codes\n• Channel Management');
            console.log('✅ Startup message sent to admin');
        } catch (error) {
            console.log('⚠️ Could not send startup message');
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
