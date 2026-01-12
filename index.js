const { Telegraf, Scenes, session, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const fetch = require('node-fetch');
require('dotenv').config();

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dneusgyzc',
  api_key: process.env.CLOUDINARY_API_KEY || '474713292161728',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'DHJmvD784FEVmeOt1-K8XeNhCQQ'
});

// Initialize bot
const BOT_TOKEN = process.env.BOT_TOKEN || '8295150408:AAHk4M0LX0YAUk4vDuSCi4mOFg6se66J3hM';
const bot = new Telegraf(BOT_TOKEN);

// Emergency stop for error loop
bot.command('emergency', async (ctx) => {
    console.log('🆘 Emergency stop triggered by:', ctx.from.id);
    errorCooldowns.clear();
    await ctx.reply('🆘 Emergency error reset executed. Bot should respond now.');
    
    setTimeout(async () => {
        await ctx.reply('✅ Bot is now responsive. Try /start or /admin');
    }, 1000);
});

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://sandip102938:Q1g2Fbn7ewNqEvuK@test.ebvv4hf.mongodb.net/earningbot';
let db, client;

async function connectDB() {
    try {
        // Remove SRV DNS lookup issue
        const mongoUriFixed = mongoUri.includes('+srv') 
            ? mongoUri 
            : mongoUri.replace('mongodb://', 'mongodb+srv://');
            
        client = new MongoClient(mongoUriFixed, {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 30000,
            maxPoolSize: 10,
            minPoolSize: 1,
            retryWrites: true,
            w: 'majority'
        });
        
        await client.connect();
        db = client.db();
        console.log('✅ Connected to MongoDB');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        
        // Try alternative connection method
        try {
            const mongoUriAlt = 'mongodb+srv://sandip102938:Q1g2Fbn7ewNqEvuK@test.ebvv4hf.mongodb.net/earningbot?retryWrites=true&w=majority';
            const altClient = new MongoClient(mongoUriAlt, {
                serverSelectionTimeoutMS: 10000,
                connectTimeoutMS: 30000
            });
            await altClient.connect();
            db = altClient.db();
            client = altClient;
            console.log('✅ Connected to MongoDB via alternative method');
            return true;
        } catch (altError) {
            console.error('❌ Alternative connection also failed:', altError.message);
            return false;
        }
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

// SCENE DEFINITIONS - Updated for new features
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
    
    // App scenes - removed
    
    // Contact user scenes
    contactUserMessage: createScene('contact_user_message_scene'),

    // Edit scenes
    editStartImage: createScene('edit_start_image_scene'),
    editStartMessage: createScene('edit_start_message_scene'),
    editMenuImage: createScene('edit_menu_image_scene'),
    editMenuMessage: createScene('edit_menu_message_scene'),

    // Timer scene - removed
    
    // Reorder scenes
    reorderChannels: createScene('reorder_channels_scene'),
    
    // Edit channels scenes
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
    
    // NEW SCENES FOR EARNING BOT
    withdrawAmount: createScene('withdraw_amount_scene'),
    setWallet: createScene('set_wallet_scene'),
    enterGiftCode: createScene('enter_gift_code_scene'),
    uploadTaskScreenshot: createScene('upload_task_screenshot_scene'),
    adminCreateGiftCode: createScene('admin_create_gift_code_scene'),
    adminEditGiftCode: createScene('admin_edit_gift_code_scene'),
    adminAddTask: createScene('admin_add_task_scene'),
    adminEditTask: createScene('admin_edit_task_scene'),
    adminTaskImages: createScene('admin_task_images_scene'),
    adminTaskScreenshotNames: createScene('admin_task_screenshot_names_scene'),
    adminSearchUsers: createScene('admin_search_users_scene'),
    adminSearchWithdrawals: createScene('admin_search_withdrawals_scene'),
    adminProcessWithdrawal: createScene('admin_process_withdrawal_scene'),
    adminTaskReview: createScene('admin_task_review_scene'),
    adminSetBonus: createScene('admin_set_bonus_scene'),
    adminManageRefer: createScene('admin_manage_refer_scene'),
    adminChannelSettings: createScene('admin_channel_settings_scene'),
    adminChannelLevels: createScene('admin_channel_levels_scene')
};

// Register all scenes
Object.values(scenes).forEach(scene => stage.register(scene));

// 🔐 ADMIN CONFIGURATION
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [8435248854, 5518423310];
const ADMIN_CODE = process.env.ADMIN_CODE || 'ADMIN123';

// Default configurations
const DEFAULT_CONFIG = {
    startImage: 'https://res.cloudinary.com/dneusgyzc/image/upload/l_text:Stalinist%20One_140_bold:{name},co_rgb:00e5ff,g_center/fl_preserve_transparency/v1763670359/1000106281_cfg1ke.jpg',
    startMessage: '👋 *Welcome to Earning Bot!*\n\nJoin our channels to start earning money!',
    menuImage: 'https://res.cloudinary.com/dneusgyzc/image/upload/l_text:Stalinist%20One_140_bold:{name},co_rgb:00e5ff,g_center/fl_preserve_transparency/v1763670359/1000106281_cfg1ke.jpg',
    menuMessage: '🎉 *Welcome to Earning Panel!*\n\nSelect an option below:',
    showContactButton: true,
    channels: [],
    uploadedImages: [],
    imageOverlaySettings: {
        startImage: true,
        menuImage: true,
        bonusImage: true
    },
    // New earning bot settings
    minWithdrawAmount: 50,
    maxWithdrawAmount: 10000,
    bonusAmount: 10,
    bonusImage: '',
    bonusEnabled: true,
    referReward: 10,
    referMinAmount: 0,
    referMaxAmount: 100,
    adminCode: ADMIN_CODE,
    giftCodes: [],
    tasks: [],
    withdrawalHistory: [],
    taskHistory: [],
    channelLevels: {
        f: [], // Hidden channels
        s: [], // Just show channels
        ss: [], // Auto-accept channels
        sss: [] // Must join channels
    }
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
                admins: ADMIN_IDS,
                mutedAdmins: [],
                startImage: DEFAULT_CONFIG.startImage,
                startMessage: DEFAULT_CONFIG.startMessage,
                menuImage: DEFAULT_CONFIG.menuImage,
                menuMessage: DEFAULT_CONFIG.menuMessage,
                showContactButton: true,
                channels: [],
                uploadedImages: [],
                imageOverlaySettings: DEFAULT_CONFIG.imageOverlaySettings,
                // New earning bot settings
                minWithdrawAmount: DEFAULT_CONFIG.minWithdrawAmount,
                maxWithdrawAmount: DEFAULT_CONFIG.maxWithdrawAmount,
                bonusAmount: DEFAULT_CONFIG.bonusAmount,
                bonusImage: DEFAULT_CONFIG.bonusImage,
                bonusEnabled: DEFAULT_CONFIG.bonusEnabled,
                referReward: DEFAULT_CONFIG.referReward,
                referMinAmount: DEFAULT_CONFIG.referMinAmount,
                referMaxAmount: DEFAULT_CONFIG.referMaxAmount,
                adminCode: DEFAULT_CONFIG.adminCode,
                giftCodes: DEFAULT_CONFIG.giftCodes,
                tasks: DEFAULT_CONFIG.tasks,
                withdrawalHistory: DEFAULT_CONFIG.withdrawalHistory,
                taskHistory: DEFAULT_CONFIG.taskHistory,
                channelLevels: DEFAULT_CONFIG.channelLevels,
                botDisabled: false,
                disabledMessage: '🚧 Bot is under maintenance. Please check back later.',
                autoAcceptRequests: true,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            
            console.log('✅ Created new bot configuration');
        } else {
            // Ensure new fields exist
            const updateFields = {};
            const defaultConfig = DEFAULT_CONFIG;
            
            for (const [key, value] of Object.entries(defaultConfig)) {
                if (config[key] === undefined) {
                    updateFields[key] = value;
                }
            }
            
            if (Object.keys(updateFields).length > 0) {
                await db.collection('admin').updateOne(
                    { type: 'config' },
                    { $set: updateFields }
                );
                console.log('✅ Updated bot configuration with new fields');
            } else {
                console.log('✅ Loaded existing bot configuration');
            }
        }
        
        // Create indexes
        await db.collection('users').createIndex({ userId: 1 }, { unique: true });
        await db.collection('users').createIndex({ referCode: 1 }, { unique: true, sparse: true });
        await db.collection('users').createIndex({ referredBy: 1 });
        await db.collection('admin').createIndex({ type: 1 }, { unique: true });
        
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

// Generate Refer Code
function generateReferCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
}

// Generate Withdrawal ID
function generateWithdrawalId() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 7; i++) {
        id += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return id;
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

// Smart Name Logic
function getSmartName(user) {
    try {
        let firstName = user.first_name || '';
        let username = user.username || '';
        let lastName = user.last_name || '';
        
        let finalName = 'User';
        
        const cleanFirstName = cleanNameForImage(firstName);
        const cleanUsername = cleanNameForImage(username);
        const cleanLastName = cleanNameForImage(lastName);
        
        if (cleanUsername && cleanUsername.length <= 15) {
            finalName = cleanUsername;
        } else if (cleanFirstName && cleanFirstName.length <= 15) {
            finalName = cleanFirstName;
        } else if (cleanLastName) {
            finalName = cleanLastName;
        }
        
        if (finalName.length > 15) {
            finalName = finalName.substring(0, 14) + '...';
        }
        
        return finalName;
    } catch (error) {
        return 'User';
    }
}

// Clean name for image display
function cleanNameForImage(text) {
    if (!text) return 'User';
    return text.replace(/[^\w\s\-\.]/gi, '').trim() || 'User';
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

// Get User Variables
function getUserVariables(user) {
    try {
        const smartName = getSmartName(user);
        const firstName = user.first_name || '';
        const lastName = user.last_name || '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
        
        return {
            first_name: firstName,
            last_name: lastName,
            full_name: fullName,
            username: user.username ? `@${user.username}` : '',
            name: smartName
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

// Get Cloudinary URL with name
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
        
        const cleanName = cleanNameForImage(name) || 'User';
        
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

// Get paginated users - 20 users per page, 2 per row
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

// Format message for display (remove escaping)
function formatMessageForDisplay(text) {
    if (!text) return '';
    return text.replace(/\\([\\_*[\]()~`>#+\-=|{}.!-])/g, '$1');
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

// Format currency
function formatCurrency(amount) {
    return `₹${parseFloat(amount).toFixed(2)}`;
}

// Format date
function formatDate(date) {
    return new Date(date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Get channels to display based on levels
async function getChannelsToDisplay(userId) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        if (!config || !config.channels || config.channels.length === 0) return [];
        
        const channelLevels = config.channelLevels || DEFAULT_CONFIG.channelLevels;
        const hiddenChannels = channelLevels.f || [];
        const justShowChannels = channelLevels.s || [];
        const autoAcceptChannels = channelLevels.ss || [];
        const mustJoinChannels = channelLevels.sss || [];
        
        const channelsToDisplay = [];
        
        // Combine all channels that should be shown
        const allShowChannels = [...justShowChannels, ...autoAcceptChannels, ...mustJoinChannels];
        
        for (const channelId of allShowChannels) {
            const channel = config.channels.find(ch => String(ch.id) === String(channelId));
            if (channel && !hiddenChannels.includes(channelId)) {
                // Check if user has already joined this channel (only for must join channels)
                if (mustJoinChannels.includes(channelId)) {
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
                        channelsToDisplay.push({
                            ...channel,
                            level: 'must'
                        });
                    }
                } else {
                    // For just show and auto accept channels, always show
                    channelsToDisplay.push({
                        ...channel,
                        level: justShowChannels.includes(channelId) ? 'show' : 'auto'
                    });
                }
            }
        }
        
        return channelsToDisplay;
    } catch (error) {
        console.error('Error in getChannelsToDisplay:', error);
        return [];
    }
}

// Check if user has joined all must-join channels
async function hasJoinedAllChannels(userId) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        if (!config || !config.channels || config.channels.length === 0) return true;
        
        const channelLevels = config.channelLevels || DEFAULT_CONFIG.channelLevels;
        const mustJoinChannels = channelLevels.sss || [];
        
        if (mustJoinChannels.length === 0) return true;
        
        for (const channelId of mustJoinChannels) {
            const channel = config.channels.find(ch => String(ch.id) === String(channelId));
            if (channel) {
                try {
                    const member = await bot.telegram.getChatMember(channel.id, userId);
                    if (member.status === 'left' || member.status === 'kicked') {
                        return false;
                    }
                } catch (error) {
                    return false;
                }
            }
        }
        
        return true;
    } catch (error) {
        console.error('Error in hasJoinedAllChannels:', error);
        return false;
    }
}

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
        
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        const channelLevels = config?.channelLevels || DEFAULT_CONFIG.channelLevels;
        const autoAcceptChannels = channelLevels.ss || [];
        
        const channel = channels.find(ch => String(ch.id) === String(chatId));
        
        if (channel && autoAcceptChannels.includes(String(chatId))) {
            try {
                await bot.telegram.approveChatJoinRequest(chatId, userId);
                console.log(`✅ Approved join request for user ${userId} in channel ${channel.title}`);
                
                await notifyAdmin(`✅ <b>Join Request Auto-Approved</b>\n\n👤 User: ${userId}\n📺 Channel: ${channel.title}\n🔗 Type: ${channel.type}`);
                
            } catch (error) {
                console.error(`❌ Failed to approve join request for user ${userId}:`, error.message);
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
            const disabledMessage = config?.disabledMessage || '🚧 Bot is under maintenance. Please check back later.';
            await safeSendMessage(ctx, disabledMessage, {
                parse_mode: 'HTML'
            });
            return;
        }
        
        const user = ctx.from;
        const userId = user.id;
        
        // Check if user exists, if not create with refer code
        const existingUser = await db.collection('users').findOne({ userId: userId });
        
        if (!existingUser) {
            // Generate unique refer code
            let referCode;
            let isUnique = false;
            
            while (!isUnique) {
                referCode = generateReferCode();
                const existingCode = await db.collection('users').findOne({ referCode: referCode });
                if (!existingCode) {
                    isUnique = true;
                }
            }
            
            // Check if user was referred
            const referArgs = ctx.message.text.split(' ');
            let referredBy = null;
            
            if (referArgs.length > 1) {
                const referrerCode = referArgs[1];
                const referrer = await db.collection('users').findOne({ referCode: referrerCode });
                if (referrer && referrer.userId !== userId) {
                    referredBy = referrer.userId;
                    
                    // Add bonus to referrer
                    const referReward = config?.referReward || DEFAULT_CONFIG.referReward;
                    await db.collection('users').updateOne(
                        { userId: referrer.userId },
                        { 
                            $inc: { balance: referReward },
                            $push: { 
                                transactions: {
                                    type: 'referral',
                                    amount: referReward,
                                    description: `Referral bonus for ${user.first_name || 'new user'}`,
                                    date: new Date()
                                }
                            }
                        }
                    );
                    
                    // Notify referrer
                    try {
                        await bot.telegram.sendMessage(referrer.userId, 
                            `🎉 You got ${formatCurrency(referReward)} referral bonus!\n\nNew user joined using your link.`
                        );
                    } catch (error) {
                        console.error('Failed to notify referrer:', error);
                    }
                }
            }
            
            // Create new user
            await db.collection('users').insertOne({
                userId: userId,
                firstName: user.first_name,
                lastName: user.last_name,
                username: user.username,
                referCode: referCode,
                referredBy: referredBy,
                balance: 0,
                wallet: '',
                transactions: [],
                referrals: [],
                taskHistory: [],
                withdrawalHistory: [],
                joinedAll: false,
                joinedAt: new Date(),
                lastActive: new Date()
            });
            
            // Notify admin about new user
            const userLink = user.username ? `@${user.username}` : user.first_name || 'Unknown';
            await notifyAdmin(`🆕 <b>New User Joined</b>\n\nID: <code>${userId}</code>\nUser: ${escapeMarkdown(userLink)}\nRefer Code: <code>${referCode}</code>`);
            
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
        
        const [config, channelsToDisplay, hasJoinedAll] = await Promise.all([
            db.collection('admin').findOne({ type: 'config' }),
            getChannelsToDisplay(userId),
            hasJoinedAllChannels(userId)
        ]);
        
        const userVars = getUserVariables(user);
        let startImage = config?.startImage || DEFAULT_CONFIG.startImage;
        const imagePromise = getCloudinaryUrlWithName(startImage, userVars.name, 'startImage');
        
        let startMessage = config?.startMessage || DEFAULT_CONFIG.startMessage;
        startMessage = replaceVariables(startMessage, userVars);
        
        // Check if user has joined all must-join channels
        if (!hasJoinedAll && channelsToDisplay.length > 0) {
            // Create channel buttons (2 per row)
            const buttons = [];
            
            // Group channels 2 per row
            for (let i = 0; i < channelsToDisplay.length; i += 2) {
                const row = [];
                const channel1 = channelsToDisplay[i];
                const buttonText1 = channel1.buttonLabel || `Join ${channel1.title}`;
                row.push({ text: buttonText1, url: channel1.link });
                
                if (i + 1 < channelsToDisplay.length) {
                    const channel2 = channelsToDisplay[i + 1];
                    const buttonText2 = channel2.buttonLabel || `Join ${channel2.title}`;
                    row.push({ text: buttonText2, url: channel2.link });
                }
                
                buttons.push(row);
            }
            
            // Add verify button
            buttons.push([{ text: '✅ Check Joined', callback_data: 'check_joined' }]);
            
            startImage = await imagePromise;
            
            await ctx.replyWithPhoto(startImage, {
                caption: startMessage,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: buttons }
            });
        } else {
            // User has joined all channels or no channels to join
            if (!hasJoinedAll) {
                await db.collection('users').updateOne(
                    { userId: userId },
                    { $set: { joinedAll: true } }
                );
                
                // Notify admin
                await notifyAdmin(`✅ <b>User Joined All Channels</b>\n\nID: <code>${userId}</code>\nUser: ${user.username ? `@${user.username}` : user.first_name || 'Unknown'}`);
            }
            
            // Show main menu
            await showMainMenu(ctx);
        }
    } catch (error) {
        console.error('Show start screen error:', error);
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.');
    }
}

// Replace Variables in Text
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

// Check Joined
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
// MAIN MENU - Keyboard Buttons
// ==========================================

async function showMainMenu(ctx) {
    try {
        const user = ctx.from;
        const userId = user.id;
        
        // Check if user has joined all channels
        const hasJoinedAll = await hasJoinedAllChannels(userId);
        if (!hasJoinedAll) {
            await db.collection('users').updateOne(
                { userId: userId },
                { $set: { joinedAll: false } }
            );
            
            await safeSendMessage(ctx, '⚠️ Please join all channels first!', {
                reply_markup: {
                    keyboard: [
                        ['🔙 Back to Start']
                    ],
                    resize_keyboard: true
                }
            });
            return;
        }
        
        // Update user status to joined all
        await db.collection('users').updateOne(
            { userId: userId },
            { $set: { joinedAll: true } }
        );
        
        // Get user balance
        const userData = await db.collection('users').findOne({ userId: userId });
        const balance = userData?.balance || 0;
        
        // Prepare menu message
        const config = await db.collection('admin').findOne({ type: 'config' });
        let menuMessage = config?.menuMessage || DEFAULT_CONFIG.menuMessage;
        const userVars = getUserVariables(user);
        menuMessage = replaceVariables(menuMessage, userVars);
        
        // Add balance to message
        menuMessage += `\n\n💰 Your Balance: ${formatCurrency(balance)}`;
        
        // Create keyboard
        const keyboard = [
            ['💰 Balance', '👤 User Details'],
            ['💳 Withdraw', '🎁 Set Wallet'],
            ['📤 Refer', '👥 All Referrals'],
            ['🎉 Bonus', '🎁 Gift Code'],
            ['📞 Contact', '📝 Tasks'],
            ['🔙 Back to Start']
        ];
        
        // Send menu image if available
        let menuImage = config?.menuImage || DEFAULT_CONFIG.menuImage;
        menuImage = await getCloudinaryUrlWithName(menuImage, userVars.name, 'menuImage');
        
        await ctx.replyWithPhoto(menuImage, {
            caption: menuMessage,
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: keyboard,
                resize_keyboard: true
            }
        });
    } catch (error) {
        console.error('Show main menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.', {
            reply_markup: {
                keyboard: [['🔙 Back to Start']],
                resize_keyboard: true
            }
        });
    }
}

// Handle menu commands
bot.hears('💰 Balance', async (ctx) => {
    await showBalance(ctx);
});

bot.hears('👤 User Details', async (ctx) => {
    await showUserDetails(ctx);
});

bot.hears('💳 Withdraw', async (ctx) => {
    await showWithdrawMenu(ctx);
});

bot.hears('🎁 Set Wallet', async (ctx) => {
    await showSetWallet(ctx);
});

bot.hears('📤 Refer', async (ctx) => {
    await showReferMenu(ctx);
});

bot.hears('👥 All Referrals', async (ctx) => {
    await showAllReferrals(ctx);
});

bot.hears('🎉 Bonus', async (ctx) => {
    await showBonus(ctx);
});

bot.hears('🎁 Gift Code', async (ctx) => {
    await showGiftCodeMenu(ctx);
});

bot.hears('📞 Contact', async (ctx) => {
    await contactAdmin(ctx);
});

bot.hears('📝 Tasks', async (ctx) => {
    await showTasks(ctx);
});

bot.hears('🔙 Back to Start', async (ctx) => {
    await ctx.reply('Going back to start...', {
        reply_markup: {
            remove_keyboard: true
        }
    });
    await showStartScreen(ctx);
});

// ==========================================
// BALANCE FEATURE
// ==========================================

async function showBalance(ctx) {
    try {
        const userId = ctx.from.id;
        const user = await db.collection('users').findOne({ userId: userId });
        
        if (!user) {
            await safeSendMessage(ctx, '❌ User not found. Please use /start again.');
            return;
        }
        
        const balance = user.balance || 0;
        const transactions = user.transactions || [];
        
        let message = `💰 <b>Your Balance</b>\n\n`;
        message += `Current Balance: <b>${formatCurrency(balance)}</b>\n\n`;
        message += `📊 <b>Recent Transactions</b> (Last 15):\n\n`;
        
        if (transactions.length === 0) {
            message += `No transactions yet.\n`;
        } else {
            const recentTransactions = transactions.slice(-15).reverse();
            recentTransactions.forEach((txn, index) => {
                const sign = txn.type === 'withdrawal' ? '-' : '+';
                const color = txn.type === 'withdrawal' ? '🔴' : '🟢';
                message += `${color} ${sign}${formatCurrency(txn.amount)} - ${txn.description}\n`;
                message += `   <i>${formatDate(txn.date)}</i>\n\n`;
            });
        }
        
        await safeSendMessage(ctx, message, {
            reply_markup: {
                keyboard: [['🔙 Back to Menu']],
                resize_keyboard: true
            }
        });
    } catch (error) {
        console.error('Show balance error:', error);
        await safeSendMessage(ctx, '❌ Error loading balance.');
    }
}

// ==========================================
// USER DETAILS FEATURE
// ==========================================

async function showUserDetails(ctx) {
    try {
        const userId = ctx.from.id;
        const user = await db.collection('users').findOne({ userId: userId });
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        if (!user) {
            await safeSendMessage(ctx, '❌ User not found.');
            return;
        }
        
        const userVars = getUserVariables(ctx.from);
        let profileImage = config?.startImage || DEFAULT_CONFIG.startImage;
        profileImage = await getCloudinaryUrlWithName(profileImage, userVars.name, 'startImage');
        
        // Create user details message
        let message = `👤 <b>User Profile</b>\n\n`;
        message += `🆔 ID: <code>${userId}</code>\n`;
        message += `👤 Name: ${user.firstName || ''} ${user.lastName || ''}\n`;
        message += `📱 Username: ${user.username ? `@${user.username}` : 'Not set'}\n`;
        message += `🎫 Refer Code: <code>${user.referCode || 'Not set'}</code>\n`;
        message += `💰 Balance: ${formatCurrency(user.balance || 0)}\n`;
        message += `💳 Wallet: ${user.wallet || 'Not set'}\n`;
        message += `📅 Joined: ${formatDate(user.joinedAt)}\n`;
        message += `👥 Referrals: ${user.referrals?.length || 0}\n`;
        message += `✅ Joined All Channels: ${user.joinedAll ? 'Yes' : 'No'}\n`;
        
        // Send profile image with caption
        await ctx.replyWithPhoto(profileImage, {
            caption: message,
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['🔙 Back to Menu']],
                resize_keyboard: true
            }
        });
    } catch (error) {
        console.error('Show user details error:', error);
        await safeSendMessage(ctx, '❌ Error loading user details.');
    }
}

// ==========================================
// WITHDRAW FEATURE
// ==========================================

async function showWithdrawMenu(ctx) {
    try {
        const userId = ctx.from.id;
        const user = await db.collection('users').findOne({ userId: userId });
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        if (!user) {
            await safeSendMessage(ctx, '❌ User not found.');
            return;
        }
        
        const minAmount = config?.minWithdrawAmount || DEFAULT_CONFIG.minWithdrawAmount;
        const maxAmount = config?.maxWithdrawAmount || DEFAULT_CONFIG.maxWithdrawAmount;
        
        let message = `💳 <b>Withdraw Funds</b>\n\n`;
        message += `💰 Your Balance: ${formatCurrency(user.balance || 0)}\n`;
        message += `📊 Minimum Withdrawal: ${formatCurrency(minAmount)}\n`;
        message += `📈 Maximum Withdrawal: ${formatCurrency(maxAmount)}\n\n`;
        
        if (!user.wallet) {
            message += `⚠️ You need to set your UPI wallet first!\n`;
            message += `Use "🎁 Set Wallet" to add your UPI ID.`;
            
            await safeSendMessage(ctx, message, {
                reply_markup: {
                    keyboard: [['🎁 Set Wallet', '🔙 Back to Menu']],
                    resize_keyboard: true
                }
            });
            return;
        }
        
        message += `💳 Your Wallet: <code>${user.wallet}</code>\n\n`;
        message += `Enter the amount you want to withdraw (between ${formatCurrency(minAmount)} and ${formatCurrency(maxAmount)}):\n\n`;
        message += `Type "cancel" to cancel.`;
        
        await safeSendMessage(ctx, message, {
            reply_markup: {
                keyboard: [['🔙 Back to Menu']],
                resize_keyboard: true
            }
        });
        
        // Enter withdrawal amount scene
        await ctx.scene.enter('withdraw_amount_scene');
    } catch (error) {
        console.error('Show withdraw menu error:', error);
        await safeSendMessage(ctx, '❌ Error loading withdraw menu.');
    }
}

scenes.withdrawAmount.on('text', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const user = await db.collection('users').findOne({ userId: userId });
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        if (!user) {
            await safeSendMessage(ctx, '❌ User not found.');
            await ctx.scene.leave();
            return;
        }
        
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Withdrawal cancelled.');
            await ctx.scene.leave();
            await showMainMenu(ctx);
            return;
        }
        
        const amount = parseFloat(ctx.message.text);
        const minAmount = config?.minWithdrawAmount || DEFAULT_CONFIG.minWithdrawAmount;
        const maxAmount = config?.maxWithdrawAmount || DEFAULT_CONFIG.maxWithdrawAmount;
        const balance = user.balance || 0;
        
        if (isNaN(amount) || amount <= 0) {
            await safeSendMessage(ctx, '❌ Please enter a valid amount.');
            return;
        }
        
        if (amount < minAmount) {
            await safeSendMessage(ctx, `❌ Minimum withdrawal amount is ${formatCurrency(minAmount)}.`);
            return;
        }
        
        if (amount > maxAmount) {
            await safeSendMessage(ctx, `❌ Maximum withdrawal amount is ${formatCurrency(maxAmount)}.`);
            return;
        }
        
        if (amount > balance) {
            await safeSendMessage(ctx, `❌ Insufficient balance. Your balance is ${formatCurrency(balance)}.`);
            return;
        }
        
        // Generate withdrawal ID
        const withdrawalId = generateWithdrawalId();
        
        // Create withdrawal request
        const withdrawalRequest = {
            id: withdrawalId,
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
        
        // Add to admin withdrawal history
        await db.collection('admin').updateOne(
            { type: 'config' },
            { 
                $push: { 
                    withdrawalHistory: {
                        $each: [withdrawalRequest],
                        $position: 0
                    }
                }
            }
        );
        
        // Deduct from user balance and add to user withdrawal history
        await db.collection('users').updateOne(
            { userId: userId },
            { 
                $inc: { balance: -amount },
                $push: { 
                    transactions: {
                        type: 'withdrawal',
                        amount: -amount,
                        description: `Withdrawal request #${withdrawalId}`,
                        date: new Date()
                    },
                    withdrawalHistory: withdrawalRequest
                }
            }
        );
        
        // Notify admins
        const adminMessage = `💸 <b>New Withdrawal Request</b>\n\n`;
        adminMessage += `🆔 ID: <code>${withdrawalId}</code>\n`;
        adminMessage += `👤 User: ${user.username ? `@${user.username}` : user.firstName || 'Unknown'}\n`;
        adminMessage += `🆔 User ID: <code>${userId}</code>\n`;
        adminMessage += `💰 Amount: ${formatCurrency(amount)}\n`;
        adminMessage += `💳 Wallet: <code>${user.wallet}</code>\n`;
        adminMessage += `📅 Time: ${formatDate(new Date())}\n\n`;
        adminMessage += `<pre>Click below to process:</pre>`;
        
        const activeAdmins = await getActiveAdmins();
        const promises = activeAdmins.map(async (adminId) => {
            try {
                await bot.telegram.sendMessage(
                    adminId,
                    adminMessage,
                    {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '✅ Approve', callback_data: `approve_withdrawal_${withdrawalId}` },
                                { text: '❌ Reject', callback_data: `reject_withdrawal_${withdrawalId}` }
                            ]]
                        }
                    }
                );
            } catch (error) {
                console.error(`Failed to notify admin ${adminId}:`, error.message);
            }
        });
        
        await Promise.allSettled(promises);
        
        await safeSendMessage(ctx, `✅ Withdrawal request submitted!\n\n🆔 Request ID: <code>${withdrawalId}</code>\n💰 Amount: ${formatCurrency(amount)}\n💳 Wallet: ${user.wallet}\n\nStatus: ⏳ Pending approval\n\nYou will be notified once processed.`, {
            parse_mode: 'HTML'
        });
        
        await ctx.scene.leave();
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Withdraw amount error:', error);
        await safeSendMessage(ctx, '❌ Error processing withdrawal.');
        await ctx.scene.leave();
    }
});

// ==========================================
// SET WALLET FEATURE
// ==========================================

async function showSetWallet(ctx) {
    try {
        const userId = ctx.from.id;
        const user = await db.collection('users').findOne({ userId: userId });
        
        if (!user) {
            await safeSendMessage(ctx, '❌ User not found.');
            return;
        }
        
        let message = `🎁 <b>Set UPI Wallet</b>\n\n`;
        
        if (user.wallet) {
            message += `Current Wallet: <code>${user.wallet}</code>\n\n`;
            message += `Enter new UPI ID (e.g., username@upi):\n\n`;
            message += `Type "cancel" to keep current wallet.`;
        } else {
            message += `No wallet set yet.\n\n`;
            message += `Enter your UPI ID (e.g., username@upi):\n\n`;
            message += `Type "cancel" to skip.`;
        }
        
        await safeSendMessage(ctx, message, {
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['🔙 Back to Menu']],
                resize_keyboard: true
            }
        });
        
        await ctx.scene.enter('set_wallet_scene');
    } catch (error) {
        console.error('Show set wallet error:', error);
        await safeSendMessage(ctx, '❌ Error loading wallet settings.');
    }
}

scenes.setWallet.on('text', async (ctx) => {
    try {
        const userId = ctx.from.id;
        
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Wallet update cancelled.');
            await ctx.scene.leave();
            await showMainMenu(ctx);
            return;
        }
        
        const upiId = ctx.message.text.trim();
        
        // Basic UPI validation
        if (!upiId.includes('@') || upiId.length < 5) {
            await safeSendMessage(ctx, '❌ Invalid UPI ID format. Should be like username@upi');
            return;
        }
        
        await db.collection('users').updateOne(
            { userId: userId },
            { $set: { wallet: upiId } }
        );
        
        await safeSendMessage(ctx, `✅ Wallet updated successfully!\n\nNew UPI ID: <code>${upiId}</code>`, {
            parse_mode: 'HTML'
        });
        
        await ctx.scene.leave();
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Set wallet error:', error);
        await safeSendMessage(ctx, '❌ Error updating wallet.');
        await ctx.scene.leave();
    }
});

// ==========================================
// REFER FEATURE
// ==========================================

async function showReferMenu(ctx) {
    try {
        const userId = ctx.from.id;
        const user = await db.collection('users').findOne({ userId: userId });
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        if (!user) {
            await safeSendMessage(ctx, '❌ User not found.');
            return;
        }
        
        const referReward = config?.referReward || DEFAULT_CONFIG.referReward;
        const referCode = user.referCode || generateReferCode();
        
        // Ensure user has a refer code
        if (!user.referCode) {
            await db.collection('users').updateOne(
                { userId: userId },
                { $set: { referCode: referCode } }
            );
        }
        
        const referLink = `https://t.me/${(await bot.telegram.getMe()).username}?start=${referCode}`;
        
        let message = `📤 <b>Refer & Earn</b>\n\n`;
        message += `🎫 Your Refer Code: <code>${referCode}</code>\n`;
        message += `🔗 Your Refer Link:\n<code>${referLink}</code>\n\n`;
        message += `💰 Referral Bonus: ${formatCurrency(referReward)} per referral\n\n`;
        message += `📊 Your Referrals: ${user.referrals?.length || 0}\n`;
        message += `🎁 Total Earned: ${formatCurrency((user.referrals?.length || 0) * referReward)}\n\n`;
        message += `Click the button below to share your refer link:`;
        
        await safeSendMessage(ctx, message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: '📤 Share Refer Link', url: `https://t.me/share/url?url=${encodeURIComponent(referLink)}&text=Join this earning bot and earn money! Use my code: ${referCode}` }
                ]],
                keyboard: [['🔙 Back to Menu']],
                resize_keyboard: true
            }
        });
    } catch (error) {
        console.error('Show refer menu error:', error);
        await safeSendMessage(ctx, '❌ Error loading refer menu.');
    }
}

// ==========================================
// ALL REFERRALS FEATURE
// ==========================================

async function showAllReferrals(ctx, page = 1) {
    try {
        const userId = ctx.from.id;
        const user = await db.collection('users').findOne({ userId: userId });
        
        if (!user) {
            await safeSendMessage(ctx, '❌ User not found.');
            return;
        }
        
        const referrals = user.referrals || [];
        const limit = 10;
        const totalPages = Math.ceil(referrals.length / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const pageReferrals = referrals.slice(startIndex, endIndex);
        
        let message = `👥 <b>All Referrals</b>\n\n`;
        message += `📊 Total Referrals: ${referrals.length}\n`;
        message += `📄 Page ${page} of ${totalPages}\n\n`;
        
        if (referrals.length === 0) {
            message += `No referrals yet.\n`;
            message += `Share your refer link to earn!`;
        } else {
            pageReferrals.forEach((ref, index) => {
                const globalIndex = startIndex + index + 1;
                const status = ref.joinedAll ? '✅' : '❌';
                message += `${globalIndex}. ${status} User ${ref.userId}`;
                if (ref.username) {
                    message += ` (@${ref.username})`;
                }
                message += `\n   Joined: ${formatDate(ref.joinedAt)}\n\n`;
            });
        }
        
        const keyboard = [];
        
        // Add navigation buttons if needed
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
        
        await safeSendMessage(ctx, message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: keyboard,
                keyboard: [['🔙 Back to Menu']],
                resize_keyboard: true
            }
        });
    } catch (error) {
        console.error('Show all referrals error:', error);
        await safeSendMessage(ctx, '❌ Error loading referrals.');
    }
}

// Pagination for referrals
bot.action(/^referrals_page_(\d+)$/, async (ctx) => {
    try {
        const page = parseInt(ctx.match[1]);
        await ctx.deleteMessage().catch(() => {});
        await showAllReferrals(ctx, page);
    } catch (error) {
        console.error('Referrals pagination error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// ==========================================
// BONUS FEATURE
// ==========================================

async function showBonus(ctx) {
    try {
        const userId = ctx.from.id;
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        const bonusEnabled = config?.bonusEnabled !== false;
        const bonusAmount = config?.bonusAmount || DEFAULT_CONFIG.bonusAmount;
        const bonusImage = config?.bonusImage || '';
        
        if (!bonusEnabled) {
            await safeSendMessage(ctx, '🎉 <b>Daily Bonus</b>\n\nSorry, daily bonus is currently disabled.\nPlease check back later.', {
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['🔙 Back to Menu']],
                    resize_keyboard: true
                }
            });
            return;
        }
        
        // Check if user already claimed bonus today
        const user = await db.collection('users').findOne({ userId: userId });
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const lastBonusClaim = user?.lastBonusClaim ? new Date(user.lastBonusClaim) : null;
        const canClaimBonus = !lastBonusClaim || lastBonusClaim < today;
        
        let message = `🎉 <b>Daily Bonus</b>\n\n`;
        message += `💰 Bonus Amount: ${formatCurrency(bonusAmount)}\n\n`;
        
        if (canClaimBonus) {
            message += `🎁 Click the button below to claim your daily bonus!`;
            
            const keyboard = {
                inline_keyboard: [[
                    { text: '🎁 Claim Bonus', callback_data: 'claim_bonus' }
                ]],
                keyboard: [['🔙 Back to Menu']],
                resize_keyboard: true
            };
            
            if (bonusImage) {
                // Add name overlay to bonus image
                const userVars = getUserVariables(ctx.from);
                const imageUrl = await getCloudinaryUrlWithName(bonusImage, userVars.name, 'bonusImage');
                
                await ctx.replyWithPhoto(imageUrl, {
                    caption: message,
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
            } else {
                await safeSendMessage(ctx, message, {
                    reply_markup: keyboard
                });
            }
        } else {
            const nextBonus = new Date(today);
            nextBonus.setDate(nextBonus.getDate() + 1);
            const nextBonusTime = formatDate(nextBonus);
            
            message += `⏰ You have already claimed your bonus today.\n`;
            message += `Next bonus available: ${nextBonusTime}`;
            
            await safeSendMessage(ctx, message, {
                reply_markup: {
                    keyboard: [['🔙 Back to Menu']],
                    resize_keyboard: true
                }
            });
        }
    } catch (error) {
        console.error('Show bonus error:', error);
        await safeSendMessage(ctx, '❌ Error loading bonus.');
    }
}

// Claim bonus
bot.action('claim_bonus', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const config = await db.collection('admin').findOne({ type: 'config' });
        const bonusAmount = config?.bonusAmount || DEFAULT_CONFIG.bonusAmount;
        
        // Check if user already claimed bonus today
        const user = await db.collection('users').findOne({ userId: userId });
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const lastBonusClaim = user?.lastBonusClaim ? new Date(user.lastBonusClaim) : null;
        const canClaimBonus = !lastBonusClaim || lastBonusClaim < today;
        
        if (!canClaimBonus) {
            await ctx.answerCbQuery('❌ You already claimed bonus today');
            return;
        }
        
        // Give bonus
        await db.collection('users').updateOne(
            { userId: userId },
            { 
                $inc: { balance: bonusAmount },
                $set: { lastBonusClaim: new Date() },
                $push: { 
                    transactions: {
                        type: 'bonus',
                        amount: bonusAmount,
                        description: 'Daily bonus claim',
                        date: new Date()
                    }
                }
            }
        );
        
        await ctx.answerCbQuery(`✅ ${formatCurrency(bonusAmount)} bonus claimed!`);
        
        // Update message
        await ctx.editMessageText(`🎉 <b>Bonus Claimed!</b>\n\n💰 You received: ${formatCurrency(bonusAmount)}\n\nYour new balance will be updated.`, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: []
            }
        });
        
    } catch (error) {
        console.error('Claim bonus error:', error);
        await ctx.answerCbQuery('❌ Error claiming bonus');
    }
});

// ==========================================
// GIFT CODE FEATURE
// ==========================================

async function showGiftCodeMenu(ctx) {
    try {
        let message = `🎁 <b>Gift Code</b>\n\n`;
        message += `Enter gift code to claim bonus:\n\n`;
        message += `Type "cancel" to cancel.`;
        
        await safeSendMessage(ctx, message, {
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['🔙 Back to Menu']],
                resize_keyboard: true
            }
        });
        
        await ctx.scene.enter('enter_gift_code_scene');
    } catch (error) {
        console.error('Show gift code menu error:', error);
        await safeSendMessage(ctx, '❌ Error loading gift code menu.');
    }
}

scenes.enterGiftCode.on('text', async (ctx) => {
    try {
        const userId = ctx.from.id;
        
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Gift code entry cancelled.');
            await ctx.scene.leave();
            await showMainMenu(ctx);
            return;
        }
        
        const code = ctx.message.text.trim().toUpperCase();
        const config = await db.collection('admin').findOne({ type: 'config' });
        const giftCodes = config?.giftCodes || [];
        
        const giftCode = giftCodes.find(gc => gc.code === code);
        
        if (!giftCode) {
            await safeSendMessage(ctx, '❌ Invalid gift code.');
            return;
        }
        
        // Check if gift code is expired
        if (giftCode.expiry && new Date(giftCode.expiry) < new Date()) {
            await safeSendMessage(ctx, '❌ Gift code has expired.');
            return;
        }
        
        // Check if gift code has reached max uses
        if (giftCode.maxUses && giftCode.usedCount >= giftCode.maxUses) {
            await safeSendMessage(ctx, '❌ Gift code has reached maximum uses.');
            return;
        }
        
        // Check if user already used this code
        if (giftCode.usedBy && giftCode.usedBy.includes(userId)) {
            await safeSendMessage(ctx, '❌ You have already used this gift code.');
            return;
        }
        
        // Generate random amount between min and max
        const minAmount = giftCode.minAmount || 0;
        const maxAmount = giftCode.maxAmount || minAmount;
        const amount = Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount;
        
        // Add bonus to user
        await db.collection('users').updateOne(
            { userId: userId },
            { 
                $inc: { balance: amount },
                $push: { 
                    transactions: {
                        type: 'gift_code',
                        amount: amount,
                        description: `Gift code: ${code}`,
                        date: new Date()
                    }
                }
            }
        );
        
        // Update gift code usage
        await db.collection('admin').updateOne(
            { type: 'config', 'giftCodes.code': code },
            { 
                $inc: { 'giftCodes.$.usedCount': 1 },
                $push: { 'giftCodes.$.usedBy': userId }
            }
        );
        
        await safeSendMessage(ctx, `✅ Gift code redeemed!\n\n🎁 Code: <code>${code}</code>\n💰 Amount: ${formatCurrency(amount)}\n\nYour balance has been updated.`, {
            parse_mode: 'HTML'
        });
        
        await ctx.scene.leave();
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Enter gift code error:', error);
        await safeSendMessage(ctx, '❌ Error redeeming gift code.');
        await ctx.scene.leave();
    }
});

// ==========================================
// CONTACT ADMIN FEATURE
// ==========================================

async function contactAdmin(ctx) {
    try {
        const user = ctx.from;
        const userInfo = user.username ? `@${user.username}` : user.first_name || `User ${user.id}`;
        
        const errorReport = `📞 <b>User wants to contact admin</b>\n\n`;
        errorReport += `<b>User:</b> ${userInfo}\n`;
        errorReport += `<b>User ID:</b> <code>${user.id}</code>\n`;
        errorReport += `<b>Message:</b> User clicked "Contact Admin" button`;
        
        await notifyAdmin(errorReport + `\n\n<pre>Click below to reply:</pre>`);
        
        const activeAdmins = await getActiveAdmins();
        
        const promises = activeAdmins.map(async (adminId) => {
            try {
                await bot.telegram.sendMessage(
                    adminId,
                    errorReport,
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
        
        await safeSendMessage(ctx, '✅ Message sent to admin team! They will contact you soon.', {
            reply_markup: {
                keyboard: [['🔙 Back to Menu']],
                resize_keyboard: true
            }
        });
    } catch (error) {
        console.error('Contact admin error:', error);
        await safeSendMessage(ctx, '❌ Failed to contact admin');
    }
}

// ==========================================
// TASKS FEATURE
// ==========================================

async function showTasks(ctx, page = 1) {
    try {
        const userId = ctx.from.id;
        const config = await db.collection('admin').findOne({ type: 'config' });
        const tasks = config?.tasks || [];
        
        const limit = 5;
        const totalPages = Math.ceil(tasks.length / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const pageTasks = tasks.slice(startIndex, endIndex);
        
        let message = `📝 <b>Available Tasks</b>\n\n`;
        message += `📊 Total Tasks: ${tasks.length}\n`;
        message += `📄 Page ${page} of ${totalPages}\n\n`;
        
        if (tasks.length === 0) {
            message += `No tasks available at the moment.\n`;
            message += `Check back later for new tasks!`;
            
            await safeSendMessage(ctx, message, {
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['🔙 Back to Menu']],
                    resize_keyboard: true
                }
            });
            return;
        }
        
        const keyboard = [];
        
        pageTasks.forEach((task, index) => {
            const globalIndex = startIndex + index + 1;
            message += `${globalIndex}. <b>${task.title}</b>\n`;
            message += `   💰 Bonus: ${formatCurrency(task.bonus)}\n`;
            message += `   📝 ${task.description?.substring(0, 50)}${task.description?.length > 50 ? '...' : ''}\n\n`;
            
            keyboard.push([{ 
                text: `📝 Task ${globalIndex}: ${task.title.substring(0, 20)}${task.title.length > 20 ? '...' : ''}`, 
                callback_data: `view_task_${task.id}` 
            }]);
        });
        
        // Add navigation buttons if needed
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
        
        keyboard.push([{ text: '🔙 Back to Menu', callback_data: 'back_to_menu_tasks' }]);
        
        await safeSendMessage(ctx, message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (error) {
        console.error('Show tasks error:', error);
        await safeSendMessage(ctx, '❌ Error loading tasks.');
    }
}

// View task details
bot.action(/^view_task_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const config = await db.collection('admin').findOne({ type: 'config' });
        const tasks = config?.tasks || [];
        const task = tasks.find(t => t.id === taskId);
        
        if (!task) {
            await ctx.answerCbQuery('❌ Task not found');
            return;
        }
        
        let message = `📝 <b>Task Details</b>\n\n`;
        message += `<b>Title:</b> ${task.title}\n`;
        message += `<b>Bonus:</b> ${formatCurrency(task.bonus)}\n`;
        message += `<b>Description:</b>\n${task.description}\n\n`;
        message += `<b>Screenshots Required:</b> ${task.screenshotCount || 0}\n\n`;
        
        if (task.images && task.images.length > 0) {
            // Send first image
            await ctx.replyWithPhoto(task.images[0], {
                caption: message,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Start Task', callback_data: `start_task_${taskId}` }],
                        [{ text: '🔙 Back to Tasks', callback_data: 'back_to_tasks_list' }]
                    ]
                }
            });
        } else {
            await safeEditMessage(ctx, message, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Start Task', callback_data: `start_task_${taskId}` }],
                        [{ text: '🔙 Back to Tasks', callback_data: 'back_to_tasks_list' }]
                    ]
                }
            });
        }
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
        
        // Store task in session
        ctx.session.currentTask = {
            taskId: taskId,
            userId: userId,
            screenshots: [],
            currentScreenshot: 0
        };
        
        await safeSendMessage(ctx, `📸 <b>Task Started</b>\n\nPlease upload the required screenshots.\n\nClick "Cancel" to cancel task.\n\nUpload screenshot 1:`, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: '❌ Cancel Task', callback_data: 'cancel_task' }
                ]]
            }
        });
        
        await ctx.scene.enter('upload_task_screenshot_scene');
    } catch (error) {
        console.error('Start task error:', error);
        await ctx.answerCbQuery('❌ Error starting task');
    }
});

scenes.uploadTaskScreenshot.on(['photo', 'text'], async (ctx) => {
    try {
        if (!ctx.session.currentTask) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            return;
        }
        
        if (ctx.message.text && ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Task cancelled.');
            delete ctx.session.currentTask;
            await ctx.scene.leave();
            await showTasks(ctx);
            return;
        }
        
        const taskId = ctx.session.currentTask.taskId;
        const config = await db.collection('admin').findOne({ type: 'config' });
        const tasks = config?.tasks || [];
        const task = tasks.find(t => t.id === taskId);
        
        if (!task) {
            await safeSendMessage(ctx, '❌ Task not found.');
            delete ctx.session.currentTask;
            await ctx.scene.leave();
            return;
        }
        
        const screenshotCount = task.screenshotCount || 0;
        const currentScreenshot = ctx.session.currentTask.currentScreenshot;
        
        if (ctx.message.photo) {
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            const fileLink = await ctx.telegram.getFileLink(photo.file_id);
            
            ctx.session.currentTask.screenshots.push(fileLink.href);
            ctx.session.currentTask.currentScreenshot = currentScreenshot + 1;
            
            if (currentScreenshot + 1 < screenshotCount) {
                await safeSendMessage(ctx, `✅ Screenshot ${currentScreenshot + 1} uploaded!\n\nUpload screenshot ${currentScreenshot + 2}:`);
            } else {
                // All screenshots uploaded
                await safeSendMessage(ctx, `✅ All screenshots uploaded!\n\nSubmitting task for review...`);
                
                // Create task submission
                const submissionId = `TASK_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                const user = await db.collection('users').findOne({ userId: ctx.from.id });
                
                const taskSubmission = {
                    id: submissionId,
                    taskId: taskId,
                    taskTitle: task.title,
                    userId: ctx.from.id,
                    userInfo: {
                        firstName: user?.firstName,
                        lastName: user?.lastName,
                        username: user?.username
                    },
                    screenshots: ctx.session.currentTask.screenshots,
                    bonus: task.bonus,
                    status: 'pending',
                    submittedAt: new Date()
                };
                
                // Add to admin task history
                await db.collection('admin').updateOne(
                    { type: 'config' },
                    { 
                        $push: { 
                            taskHistory: {
                                $each: [taskSubmission],
                                $position: 0
                            }
                        }
                    }
                );
                
                // Add to user task history
                await db.collection('users').updateOne(
                    { userId: ctx.from.id },
                    { 
                        $push: { 
                            taskHistory: taskSubmission
                        }
                    }
                );
                
                // Notify admins
                const adminMessage = `📝 <b>New Task Submission</b>\n\n`;
                adminMessage += `🆔 ID: <code>${submissionId}</code>\n`;
                adminMessage += `📝 Task: ${task.title}\n`;
                adminMessage += `👤 User: ${user?.username ? `@${user.username}` : user?.firstName || 'Unknown'}\n`;
                adminMessage += `🆔 User ID: <code>${ctx.from.id}</code>\n`;
                adminMessage += `💰 Bonus: ${formatCurrency(task.bonus)}\n`;
                adminMessage += `📅 Time: ${formatDate(new Date())}\n\n`;
                adminMessage += `<pre>Click below to review:</pre>`;
                
                const activeAdmins = await getActiveAdmins();
                const promises = activeAdmins.map(async (adminId) => {
                    try {
                        await bot.telegram.sendMessage(
                            adminId,
                            adminMessage,
                            {
                                parse_mode: 'HTML',
                                reply_markup: {
                                    inline_keyboard: [[
                                        { text: '✅ Approve', callback_data: `approve_task_${submissionId}` },
                                        { text: '❌ Reject', callback_data: `reject_task_${submissionId}` }
                                    ]]
                                }
                            }
                        );
                    } catch (error) {
                        console.error(`Failed to notify admin ${adminId}:`, error.message);
                    }
                });
                
                await Promise.allSettled(promises);
                
                await safeSendMessage(ctx, `✅ Task submitted for review!\n\n🆔 Submission ID: <code>${submissionId}</code>\n📝 Task: ${task.title}\n💰 Bonus: ${formatCurrency(task.bonus)}\n\nStatus: ⏳ Pending approval\n\nYou will be notified once reviewed.`, {
                    parse_mode: 'HTML'
                });
                
                delete ctx.session.currentTask;
                await ctx.scene.leave();
                await showMainMenu(ctx);
            }
        } else {
            await safeSendMessage(ctx, '❌ Please send a photo as screenshot.');
        }
    } catch (error) {
        console.error('Upload task screenshot error:', error);
        await safeSendMessage(ctx, '❌ Error uploading screenshot.');
        await ctx.scene.leave();
    }
});

// Cancel task
bot.action('cancel_task', async (ctx) => {
    try {
        await safeSendMessage(ctx, '❌ Task cancelled.');
        delete ctx.session.currentTask;
        await ctx.scene.leave();
        await showTasks(ctx);
    } catch (error) {
        console.error('Cancel task error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Back to tasks list
bot.action('back_to_tasks_list', async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        await showTasks(ctx);
    } catch (error) {
        console.error('Back to tasks error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('back_to_menu_tasks', async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Back to menu error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Tasks pagination
bot.action(/^tasks_page_(\d+)$/, async (ctx) => {
    try {
        const page = parseInt(ctx.match[1]);
        await ctx.deleteMessage().catch(() => {});
        await showTasks(ctx, page);
    } catch (error) {
        console.error('Tasks pagination error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// ==========================================
// ADMIN COMMAND
// ==========================================

bot.command('admin', async (ctx) => {
    try {
        const args = ctx.message.text.split(' ');
        
        if (args.length > 1) {
            // Admin code verification
            const code = args[1];
            const config = await db.collection('admin').findOne({ type: 'config' });
            const adminCode = config?.adminCode || ADMIN_CODE;
            
            if (code === adminCode) {
                // Add user as admin
                const userId = ctx.from.id;
                const currentAdmins = config?.admins || ADMIN_IDS;
                
                if (!currentAdmins.includes(userId)) {
                    const updatedAdmins = [...currentAdmins, userId];
                    await db.collection('admin').updateOne(
                        { type: 'config' },
                        { $set: { admins: updatedAdmins, updatedAt: new Date() } }
                    );
                    
                    await safeSendMessage(ctx, `✅ You have been added as admin!\n\nUse /admin to access admin panel.`);
                } else {
                    await safeSendMessage(ctx, '✅ You are already an admin!\n\nUse /admin to access admin panel.');
                }
            } else {
                await safeSendMessage(ctx, '❌ Invalid admin code.');
            }
            return;
        }
        
        if (!await isAdmin(ctx.from.id)) {
            return safeSendMessage(ctx, '❌ You are not authorized to use this command.\n\nTo become admin, use: /admin <code>');
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
            [{ text: '🖼️ Start Image', callback_data: 'admin_startimage' }, { text: '📝 Start Message', callback_data: 'admin_startmessage' }],
            [{ text: '🖼️ Menu Image', callback_data: 'admin_menuimage' }, { text: '📝 Menu Message', callback_data: 'admin_menumessage' }],
            [{ text: '🎁 Create Gift Code', callback_data: 'admin_create_gift_code' }, { text: '🎉 Bonus', callback_data: 'admin_bonus' }],
            [{ text: '📊 Manage Bonus', callback_data: 'admin_manage_bonus' }, { text: '🖼️ Bonus Image', callback_data: 'admin_bonus_image' }],
            [{ text: '📺 Manage Channels', callback_data: 'admin_channels' }, { text: '👑 Manage Admins', callback_data: 'admin_manage_admins' }],
            [{ text: '🎁 Manage Gift Codes', callback_data: 'admin_manage_gift_codes' }, { text: '⚙️ Image Overlay', callback_data: 'admin_image_overlay' }],
            [{ text: '📞 Contact Button', callback_data: 'admin_contact_button' }, { text: '🔼🔽 Channels', callback_data: 'admin_reorder_channels' }],
            [{ text: '✏️ Edit Channels', callback_data: 'admin_edit_channels' }, { text: '🚫 Disable Bot', callback_data: 'admin_disable_bot' }],
            [{ text: '👁️ Hide Channels (F)', callback_data: 'admin_hide_channels' }, { text: '📋 Just Show (S)', callback_data: 'admin_just_show' }],
            [{ text: '✅ Auto Accept (SS)', callback_data: 'admin_auto_accept' }, { text: '🔒 Need Join (SSS)', callback_data: 'admin_need_join' }],
            [{ text: '📤 Refer Settings', callback_data: 'admin_refer_settings' }, { text: '🖼️ Manage Images', callback_data: 'admin_manage_images' }],
            [{ text: '🗑️ Delete Data', callback_data: 'admin_deletedata' }, { text: '🔕 Mute Notifications', callback_data: 'admin_mute_notifications' }],
            [{ text: '📋 HTML Guide', callback_data: 'admin_html_guide' }, { text: '📝 Manage Tasks', callback_data: 'admin_manage_tasks' }],
            [{ text: '➕ Add Tasks', callback_data: 'admin_add_tasks' }, { text: '📋 Task History', callback_data: 'admin_task_history' }],
            [{ text: '📝 Task Requests', callback_data: 'admin_task_requests' }, { text: '💸 Withdrawal Requests', callback_data: 'admin_withdrawal_requests' }],
            [{ text: '📊 Withdrawal History', callback_data: 'admin_withdrawal_history' }, { text: '🔍 Search Users', callback_data: 'admin_search_users' }],
            [{ text: '🔍 Search Withdrawals', callback_data: 'admin_search_withdrawals' }]
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
// ADMIN FEATURES - BROADCAST
// ==========================================

bot.action('admin_broadcast', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await safeEditMessage(ctx, '📢 <b>Broadcast Message</b>\n\nSend the message you want to broadcast to all users.\n\n<i>Supports HTML formatting</i>\n\nType "cancel" to cancel.');
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

// ==========================================
// ADMIN FEATURES - USER STATS
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
        
        let usersText = `<b>📊 User Statistics</b>\n\n`;
        usersText += `• <b>Total Users:</b> ${totalUsers}\n\n`;
        usersText += `<b>👥 Users (Page ${page}/${userData.totalPages}):</b>\n\n`;
        
        const keyboard = [];
        
        // Add search button
        keyboard.push([{ text: '🔍 Search Users', callback_data: 'admin_search_users' }]);
        
        // Group users 2 per row
        for (let i = 0; i < users.length; i += 2) {
            const row = [];
            
            const user1 = users[i];
            const userNum1 = (page - 1) * 20 + i + 1;
            const username1 = user1.username ? `@${user1.username}` : user1.firstName || user1.userId;
            row.push({ 
                text: `${userNum1}. ${username1}`, 
                callback_data: `user_detail_${user1.userId}` 
            });
            
            if (i + 1 < users.length) {
                const user2 = users[i + 1];
                const userNum2 = (page - 1) * 20 + i + 2;
                const username2 = user2.username ? `@${user2.username}` : user2.firstName || user2.userId;
                row.push({ 
                    text: `${userNum2}. ${username2}`, 
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
        const referCode = user.referCode || 'Not set';
        const referredBy = user.referredBy ? `User ${user.referredBy}` : 'Not referred';
        const referrals = user.referrals || [];
        
        let userDetail = `<b>👤 User Details</b>\n\n`;
        userDetail += `• <b>ID:</b> <code>${userId}</code>\n`;
        userDetail += `• <b>Username:</b> <code>${escapeMarkdown(username)}</code>\n`;
        userDetail += `• <b>Full Name:</b> <code>${escapeMarkdown(fullName)}</code>\n`;
        userDetail += `• <b>Balance:</b> ${formatCurrency(user.balance || 0)}\n`;
        userDetail += `• <b>Wallet:</b> <code>${user.wallet || 'Not set'}</code>\n`;
        userDetail += `• <b>Refer Code:</b> <code>${referCode}</code>\n`;
        userDetail += `• <b>Referred By:</b> ${referredBy}\n`;
        userDetail += `• <b>Referrals:</b> ${referrals.length}\n`;
        userDetail += `• <b>Joined:</b> <code>${new Date(user.joinedAt).toLocaleString()}</code>\n`;
        userDetail += `• <b>Last Active:</b> <code>${user.lastActive ? new Date(user.lastActive).toLocaleString() : 'Never'}</code>\n`;
        userDetail += `• <b>Joined All Channels:</b> ${user.joinedAll ? '✅ Yes' : '❌ No'}\n`;
        
        const keyboard = [
            [{ text: '💬 Send Message/Photo', callback_data: `contact_user_${userId}` }],
            [{ text: '💰 Add Balance', callback_data: `add_balance_${userId}` }],
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

// Add balance to user
bot.action(/^add_balance_(\d+)$/, async (ctx) => {
    try {
        const userId = ctx.match[1];
        
        await safeSendMessage(ctx, `Enter amount to add to user ${userId}:\n\nType "cancel" to cancel.`);
        
        ctx.session.addingBalance = {
            userId: userId
        };
    } catch (error) {
        console.error('Add balance error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Handle adding balance
bot.on('text', async (ctx) => {
    try {
        if (ctx.session?.addingBalance && !ctx.message.text?.startsWith('/')) {
            const { userId } = ctx.session.addingBalance;
            
            if (ctx.message.text.toLowerCase() === 'cancel') {
                await safeSendMessage(ctx, '❌ Balance addition cancelled.');
                delete ctx.session.addingBalance;
                return;
            }
            
            const amount = parseFloat(ctx.message.text);
            if (isNaN(amount) || amount <= 0) {
                await safeSendMessage(ctx, '❌ Please enter a valid amount.');
                return;
            }
            
            // Add balance to user
            await db.collection('users').updateOne(
                { userId: Number(userId) },
                { 
                    $inc: { balance: amount },
                    $push: { 
                        transactions: {
                            type: 'admin_add',
                            amount: amount,
                            description: `Balance added by admin`,
                            date: new Date()
                        }
                    }
                }
            );
            
            await safeSendMessage(ctx, `✅ Added ${formatCurrency(amount)} to user ${userId}.`);
            
            // Notify user
            try {
                await bot.telegram.sendMessage(
                    userId,
                    `💰 Admin added ${formatCurrency(amount)} to your balance!\n\nNew balance: ${formatCurrency((await db.collection('users').findOne({ userId: Number(userId) })).balance)}`
                );
            } catch (error) {
                console.error('Failed to notify user:', error);
            }
            
            delete ctx.session.addingBalance;
        }
    } catch (error) {
        console.error('Handle add balance error:', error);
        await safeSendMessage(ctx, '❌ Failed to add balance.');
    }
});

// Pagination handlers
bot.action(/^users_page_(\d+)$/, async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    const page = parseInt(ctx.match[1]);
    await showUserStatsPage(ctx, page);
});

// ==========================================
// ADMIN FEATURES - SEARCH USERS
// ==========================================

bot.action('admin_search_users', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await safeSendMessage(ctx, '🔍 <b>Search Users</b>\n\nEnter username, user ID, or name to search:\n\nType "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    
    await ctx.scene.enter('admin_search_users_scene');
});

scenes.adminSearchUsers.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Search cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const searchTerm = ctx.message.text.trim();
        const searchRegex = new RegExp(searchTerm, 'i');
        
        // Search in users collection
        const users = await db.collection('users').find({
            $or: [
                { userId: isNaN(searchTerm) ? null : Number(searchTerm) },
                { username: searchRegex },
                { firstName: searchRegex },
                { lastName: searchRegex },
                { referCode: searchRegex }
            ].filter(condition => condition !== null)
        }).limit(20).toArray();
        
        if (users.length === 0) {
            await safeSendMessage(ctx, '❌ No users found matching your search.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        let searchResults = `<b>🔍 Search Results</b>\n\n`;
        searchResults += `Found ${users.length} user(s):\n\n`;
        
        const keyboard = [];
        
        users.forEach((user, index) => {
            const username = user.username ? `@${user.username}` : user.firstName || user.userId;
            searchResults += `${index + 1}. ${username} (ID: ${user.userId})\n`;
            searchResults += `   Balance: ${formatCurrency(user.balance || 0)}\n`;
            searchResults += `   Refer Code: ${user.referCode || 'N/A'}\n\n`;
            
            keyboard.push([{ 
                text: `${index + 1}. ${username}`, 
                callback_data: `user_detail_${user.userId}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        await safeSendMessage(ctx, searchResults, {
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

// ==========================================
// ADMIN FEATURES - START MESSAGE
// ==========================================

bot.action('admin_startmessage', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentMessage = config?.startMessage || DEFAULT_CONFIG.startMessage;
        
        const displayMessage = formatMessageForDisplay(currentMessage);
        
        const text = `<b>📝 Start Message Management</b>\n\nCurrent Message:\n<code>${escapeMarkdown(displayMessage)}</code>\n\nAvailable variables: {first_name}, {last_name}, {full_name}, {username}, {name}\n\nSupports HTML formatting\n\nSelect an option:`;
        
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
        
        await safeSendMessage(ctx, `Current message:\n<code>${escapeMarkdown(formatMessageForDisplay(currentMessage))}</code>\n\nEnter the new start message:\n\n<i>Supports HTML formatting</i>\n\nType "cancel" to cancel.`, {
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
// ADMIN FEATURES - START IMAGE
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

bot.action(/^confirm_bad_url_start_(.+)$/, async (ctx) => {
    try {
        const url = decodeURIComponent(ctx.match[1]);
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { 
                $set: { 
                    startImage: url, 
                    updatedAt: new Date(),
                    'imageOverlaySettings.startImage': hasNameVariable(url)
                } 
            }
        );
        
        await ctx.deleteMessage().catch(() => {});
        await safeSendMessage(ctx, '✅ Start image URL updated!');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Confirm bad URL error:', error);
        await safeSendMessage(ctx, '❌ Failed to update image.');
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

// Image overlay scene for asking about name overlay
scenes.imageOverlay.on('photo', async (ctx) => {
    try {
        if (!ctx.session.uploadingImageType) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            return;
        }
        
        ctx.session.uploadingImage = ctx.message.photo[ctx.message.photo.length - 1];
        
        await safeSendMessage(ctx, 'Do you want to show user name overlay on this image?\n\n<i>This will display the user\'s name in the middle of the image</i>', {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Yes, show name', callback_data: 'overlay_yes' }],
                    [{ text: '❌ No, plain image', callback_data: 'overlay_no' }],
                    [{ text: '🚫 Cancel', callback_data: 'overlay_cancel' }]
                ]
            }
        });
    } catch (error) {
        console.error('Image overlay scene error:', error);
        await safeSendMessage(ctx, '❌ Error processing image.');
        await ctx.scene.leave();
    }
});

// Handle overlay decision
bot.action('overlay_yes', async (ctx) => {
    try {
        await processImageUpload(ctx, true);
    } catch (error) {
        console.error('Overlay yes error:', error);
        await ctx.answerCbQuery('❌ Error processing');
    }
});

bot.action('overlay_no', async (ctx) => {
    try {
        await processImageUpload(ctx, false);
    } catch (error) {
        console.error('Overlay no error:', error);
        await ctx.answerCbQuery('❌ Error processing');
    }
});

bot.action('overlay_cancel', async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        await safeSendMessage(ctx, '❌ Upload cancelled.');
        delete ctx.session.uploadingImageType;
        delete ctx.session.uploadingImage;
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Cancel overlay error:', error);
    }
});

async function processImageUpload(ctx, addOverlay) {
    try {
        if (!ctx.session.uploadingImageType || !ctx.session.uploadingImage) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            return;
        }
        
        const imageType = ctx.session.uploadingImageType;
        const photo = ctx.session.uploadingImage;
        const fileLink = await ctx.telegram.getFileLink(photo.file_id);
        const response = await fetch(fileLink);
        
        if (!response.ok) throw new Error('Failed to fetch image');
        
        const buffer = await response.buffer();
        
        const result = await uploadToCloudinary(buffer, `${imageType}_images`);
        
        let cloudinaryUrl = result.secure_url;
        
        if (addOverlay) {
            cloudinaryUrl = cloudinaryUrl.replace('/upload/', '/upload/l_text:Stalinist%20One_140_bold:{name},co_rgb:00e5ff,g_center/');
        }
        
        let updateField = {};
        let imageTypeForDb = '';
        
        if (imageType === 'startImage') {
            updateField = { startImage: cloudinaryUrl };
            imageTypeForDb = 'start_image';
        } else if (imageType === 'menuImage') {
            updateField = { menuImage: cloudinaryUrl };
            imageTypeForDb = 'menu_image';
        } else if (imageType === 'bonusImage') {
            updateField = { bonusImage: cloudinaryUrl };
            imageTypeForDb = 'bonus_image';
        }
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { 
                $set: { 
                    ...updateField, 
                    updatedAt: new Date(),
                    [`imageOverlaySettings.${imageType}`]: addOverlay
                },
                $push: { 
                    uploadedImages: {
                        url: cloudinaryUrl,
                        publicId: result.public_id,
                        type: imageTypeForDb,
                        hasOverlay: addOverlay,
                        uploadedAt: new Date()
                    }
                }
            }
        );
        
        await ctx.deleteMessage().catch(() => {});
        await safeSendMessage(ctx, `✅ Image uploaded and set as ${imageType.replace('Image', ' image')}!\n\nOverlay: ${addOverlay ? '✅ Yes' : '❌ No'}`);
        
        delete ctx.session.uploadingImageType;
        delete ctx.session.uploadingImage;
        
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
        console.error('Process image upload error:', error);
        await safeSendMessage(ctx, `✅ Image uploaded successfully!\n\nError: ${error.message}\n\nUse /admin to return.`);
    }
}

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
// ADMIN FEATURES - MENU MESSAGE
// ==========================================

bot.action('admin_menumessage', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentMessage = config?.menuMessage || DEFAULT_CONFIG.menuMessage;
        
        const displayMessage = formatMessageForDisplay(currentMessage);
        
        const text = `<b>📝 Menu Message Management</b>\n\nCurrent Message:\n<code>${escapeMarkdown(displayMessage)}</code>\n\nAvailable variables: {first_name}, {last_name}, {full_name}, {username}, {name}\n\nSupports HTML formatting\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '✏️ Edit', callback_data: 'admin_edit_menumessage' }, { text: '🔄 Reset', callback_data: 'admin_reset_menumessage' }],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
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
        
        await safeSendMessage(ctx, `Current message:\n<code>${escapeMarkdown(formatMessageForDisplay(currentMessage))}</code>\n\nEnter the new menu message:\n\n<i>Supports HTML formatting</i>\n\nType "cancel" to cancel.`, {
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
// ADMIN FEATURES - MENU IMAGE
// ==========================================

bot.action('admin_menuimage', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentImage = config?.menuImage || DEFAULT_CONFIG.menuImage;
        const overlaySettings = config?.imageOverlaySettings || { menuImage: true };
        const hasOverlay = hasNameVariable(currentImage) || overlaySettings.menuImage;
        
        const text = `<b>🖼️ Menu Image Management</b>\n\nCurrent Image:\n<code>${currentImage}</code>\n\nOverlay: ${hasOverlay ? '✅ ON' : '❌ OFF'}\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '✏️ Edit URL', callback_data: 'admin_edit_menuimage_url' }, { text: '📤 Upload', callback_data: 'admin_upload_menuimage' }],
            [{ text: '🔄 Reset', callback_data: 'admin_reset_menuimage' }, { text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Menu image menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action('admin_edit_menuimage_url', async (ctx) => {
    await safeSendMessage(ctx, 'Enter the new image URL:\n\n<i>Use {name} variable for user name overlay (optional)</i>\n\nType "cancel" to cancel.', {
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
        
        const isValid = await isValidImageUrl(newUrl);
        if (!isValid) {
            await safeSendMessage(ctx, '⚠️ The URL does not appear to be a valid image.\n\nDo you still want to use it?', {
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
                    'imageOverlaySettings.menuImage': hasNameVariable(newUrl)
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

bot.action(/^confirm_bad_url_menu_(.+)$/, async (ctx) => {
    try {
        const url = decodeURIComponent(ctx.match[1]);
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { 
                $set: { 
                    menuImage: url, 
                    updatedAt: new Date(),
                    'imageOverlaySettings.menuImage': hasNameVariable(url)
                } 
            }
        );
        
        await ctx.deleteMessage().catch(() => {});
        await safeSendMessage(ctx, '✅ Menu image URL updated!');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Confirm bad URL error:', error);
        await safeSendMessage(ctx, '❌ Failed to update image.');
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
// ADMIN FEATURES - CREATE GIFT CODE
// ==========================================

bot.action('admin_create_gift_code', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await safeSendMessage(ctx, '🎁 <b>Create Gift Code</b>\n\nEnter maximum number of uses (0 for unlimited):\n\nType "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    
    await ctx.scene.enter('admin_create_gift_code_scene');
});

scenes.adminCreateGiftCode.on('text', async (ctx) => {
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
        
        const step = ctx.session.giftCodeData.step || 0;
        
        switch (step) {
            case 0:
                // Max uses
                const maxUses = parseInt(ctx.message.text);
                if (isNaN(maxUses) || maxUses < 0) {
                    await safeSendMessage(ctx, '❌ Please enter a valid number (0 or greater).');
                    return;
                }
                
                ctx.session.giftCodeData.maxUses = maxUses;
                ctx.session.giftCodeData.step = 1;
                
                await safeSendMessage(ctx, 'Enter expiry time in minutes (0 for no expiry):');
                break;
                
            case 1:
                // Expiry time
                const expiryMinutes = parseInt(ctx.message.text);
                if (isNaN(expiryMinutes) || expiryMinutes < 0) {
                    await safeSendMessage(ctx, '❌ Please enter a valid number (0 or greater).');
                    return;
                }
                
                ctx.session.giftCodeData.expiryMinutes = expiryMinutes;
                ctx.session.giftCodeData.step = 2;
                
                await safeSendMessage(ctx, 'Enter code length (6-20):');
                break;
                
            case 2:
                // Code length
                const codeLength = parseInt(ctx.message.text);
                if (isNaN(codeLength) || codeLength < 6 || codeLength > 20) {
                    await safeSendMessage(ctx, '❌ Please enter a valid length between 6 and 20.');
                    return;
                }
                
                ctx.session.giftCodeData.codeLength = codeLength;
                ctx.session.giftCodeData.step = 3;
                
                await safeSendMessage(ctx, 'Enter minimum amount for this code:');
                break;
                
            case 3:
                // Min amount
                const minAmount = parseFloat(ctx.message.text);
                if (isNaN(minAmount) || minAmount < 0) {
                    await safeSendMessage(ctx, '❌ Please enter a valid amount.');
                    return;
                }
                
                ctx.session.giftCodeData.minAmount = minAmount;
                ctx.session.giftCodeData.step = 4;
                
                await safeSendMessage(ctx, 'Enter maximum amount for this code (same as min for fixed amount):');
                break;
                
            case 4:
                // Max amount
                const maxAmount = parseFloat(ctx.message.text);
                if (isNaN(maxAmount) || maxAmount < ctx.session.giftCodeData.minAmount) {
                    await safeSendMessage(ctx, `❌ Please enter a valid amount (must be at least ${ctx.session.giftCodeData.minAmount}).`);
                    return;
                }
                
                ctx.session.giftCodeData.maxAmount = maxAmount;
                
                // Generate code
                const code = generateCode('', ctx.session.giftCodeData.codeLength);
                ctx.session.giftCodeData.code = code;
                
                // Calculate expiry date
                let expiry = null;
                if (ctx.session.giftCodeData.expiryMinutes > 0) {
                    expiry = new Date();
                    expiry.setMinutes(expiry.getMinutes() + ctx.session.giftCodeData.expiryMinutes);
                }
                
                // Create gift code object
                const giftCode = {
                    id: `gift_${Date.now()}`,
                    code: code,
                    maxUses: ctx.session.giftCodeData.maxUses,
                    usedCount: 0,
                    usedBy: [],
                    minAmount: ctx.session.giftCodeData.minAmount,
                    maxAmount: ctx.session.giftCodeData.maxAmount,
                    expiry: expiry,
                    createdAt: new Date(),
                    createdBy: ctx.from.id
                };
                
                // Save to database
                await db.collection('admin').updateOne(
                    { type: 'config' },
                    { $push: { giftCodes: giftCode } }
                );
                
                let message = `✅ <b>Gift Code Created!</b>\n\n`;
                message += `🎁 Code: <code>${code}</code>\n`;
                message += `📊 Max Uses: ${giftCode.maxUses === 0 ? 'Unlimited' : giftCode.maxUses}\n`;
                message += `💰 Amount Range: ${formatCurrency(giftCode.minAmount)} - ${formatCurrency(giftCode.maxAmount)}\n`;
                if (giftCode.expiry) {
                    message += `⏰ Expires: ${formatDate(giftCode.expiry)}\n`;
                } else {
                    message += `⏰ Expires: Never\n`;
                }
                message += `📅 Created: ${formatDate(giftCode.createdAt)}\n\n`;
                message += `Share this code with users!`;
                
                await safeSendMessage(ctx, message, {
                    parse_mode: 'HTML'
                });
                
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

// ==========================================
// ADMIN FEATURES - BONUS
// ==========================================

bot.action('admin_bonus', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const bonusAmount = config?.bonusAmount || DEFAULT_CONFIG.bonusAmount;
        const bonusEnabled = config?.bonusEnabled !== false;
        
        const text = `<b>🎉 Bonus Settings</b>\n\nCurrent Bonus Amount: ${formatCurrency(bonusAmount)}\nBonus Enabled: ${bonusEnabled ? '✅ Yes' : '❌ No'}\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '✏️ Edit Bonus Amount', callback_data: 'admin_edit_bonus_amount' }],
            [{ text: bonusEnabled ? '❌ Disable Bonus' : '✅ Enable Bonus', callback_data: 'admin_toggle_bonus' }],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Bonus menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action('admin_edit_bonus_amount', async (ctx) => {
    try {
        await safeSendMessage(ctx, 'Enter new bonus amount:\n\nType "cancel" to cancel.');
        
        ctx.session.editingBonusAmount = true;
    } catch (error) {
        console.error('Edit bonus amount error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Handle bonus amount edit
bot.on('text', async (ctx) => {
    try {
        if (ctx.session?.editingBonusAmount && !ctx.message.text?.startsWith('/')) {
            
            if (ctx.message.text.toLowerCase() === 'cancel') {
                await safeSendMessage(ctx, '❌ Edit cancelled.');
                delete ctx.session.editingBonusAmount;
                return;
            }
            
            const amount = parseFloat(ctx.message.text);
            if (isNaN(amount) || amount < 0) {
                await safeSendMessage(ctx, '❌ Please enter a valid amount.');
                return;
            }
            
            await db.collection('admin').updateOne(
                { type: 'config' },
                { $set: { bonusAmount: amount, updatedAt: new Date() } }
            );
            
            await safeSendMessage(ctx, `✅ Bonus amount updated to ${formatCurrency(amount)}!`);
            
            delete ctx.session.editingBonusAmount;
            
            setTimeout(async () => {
                await bot.action('admin_bonus')(ctx);
            }, 1000);
        }
    } catch (error) {
        console.error('Handle bonus amount edit error:', error);
        await safeSendMessage(ctx, '❌ Failed to update bonus amount.');
    }
});

bot.action('admin_toggle_bonus', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentStatus = config?.bonusEnabled !== false;
        const newStatus = !currentStatus;
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { bonusEnabled: newStatus, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery(`✅ Bonus ${newStatus ? 'enabled' : 'disabled'}`);
        await bot.action('admin_bonus')(ctx);
    } catch (error) {
        console.error('Toggle bonus error:', error);
        await ctx.answerCbQuery('❌ Failed to update bonus status');
    }
});

// ==========================================
// ADMIN FEATURES - MANAGE BONUS
// ==========================================

bot.action('admin_manage_bonus', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const bonusEnabled = config?.bonusEnabled !== false;
        
        const text = `<b>📊 Manage Bonus</b>\n\nCurrent status: ${bonusEnabled ? '✅ ENABLED' : '❌ DISABLED'}\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: bonusEnabled ? '❌ Stop Bonus' : '✅ Start Bonus', callback_data: 'admin_toggle_bonus' }],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Manage bonus menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// ==========================================
// ADMIN FEATURES - BONUS IMAGE
// ==========================================

bot.action('admin_bonus_image', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentImage = config?.bonusImage || '';
        const overlaySettings = config?.imageOverlaySettings || { bonusImage: true };
        const hasOverlay = hasNameVariable(currentImage) || overlaySettings.bonusImage;
        
        let text = `<b>🖼️ Bonus Image Management</b>\n\n`;
        
        if (currentImage) {
            text += `Current Image:\n<code>${currentImage}</code>\n\n`;
            text += `Overlay: ${hasOverlay ? '✅ ON' : '❌ OFF'}\n\n`;
        } else {
            text += `No bonus image set.\n\n`;
        }
        
        text += `Select an option:`;
        
        const keyboard = [
            [{ text: '✏️ Edit URL', callback_data: 'admin_edit_bonusimage_url' }, { text: '📤 Upload', callback_data: 'admin_upload_bonusimage' }],
            currentImage ? [{ text: '🗑️ Remove', callback_data: 'admin_remove_bonusimage' }] : [],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ].filter(row => row.length > 0);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Bonus image menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action('admin_edit_bonusimage_url', async (ctx) => {
    try {
        await safeSendMessage(ctx, 'Enter the new bonus image URL:\n\n<i>Use {name} variable for user name overlay (optional)</i>\n\nType "cancel" to cancel.', {
            parse_mode: 'HTML'
        });
        
        ctx.session.editingBonusImage = true;
    } catch (error) {
        console.error('Edit bonus image error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Handle bonus image edit
bot.on('text', async (ctx) => {
    try {
        if (ctx.session?.editingBonusImage && !ctx.message.text?.startsWith('/')) {
            
            if (ctx.message.text.toLowerCase() === 'cancel') {
                await safeSendMessage(ctx, '❌ Edit cancelled.');
                delete ctx.session.editingBonusImage;
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
                            [{ text: '✅ Yes, use anyway', callback_data: `confirm_bad_url_bonus_${encodeURIComponent(newUrl)}` }],
                            [{ text: '❌ No, cancel', callback_data: 'admin_bonus_image' }]
                        ]
                    }
                });
                return;
            }
            
            await db.collection('admin').updateOne(
                { type: 'config' },
                { 
                    $set: { 
                        bonusImage: newUrl, 
                        updatedAt: new Date(),
                        'imageOverlaySettings.bonusImage': hasNameVariable(newUrl)
                    } 
                }
            );
            
            await safeSendMessage(ctx, '✅ Bonus image URL updated!');
            
            delete ctx.session.editingBonusImage;
            
            setTimeout(async () => {
                await bot.action('admin_bonus_image')(ctx);
            }, 1000);
        }
    } catch (error) {
        console.error('Handle bonus image edit error:', error);
        await safeSendMessage(ctx, '❌ Failed to update bonus image.');
    }
});

bot.action(/^confirm_bad_url_bonus_(.+)$/, async (ctx) => {
    try {
        const url = decodeURIComponent(ctx.match[1]);
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { 
                $set: { 
                    bonusImage: url, 
                    updatedAt: new Date(),
                    'imageOverlaySettings.bonusImage': hasNameVariable(url)
                } 
            }
        );
        
        await ctx.deleteMessage().catch(() => {});
        await safeSendMessage(ctx, '✅ Bonus image URL updated!');
        await bot.action('admin_bonus_image')(ctx);
    } catch (error) {
        console.error('Confirm bad URL error:', error);
        await safeSendMessage(ctx, '❌ Failed to update image.');
    }
});

bot.action('admin_upload_bonusimage', async (ctx) => {
    try {
        ctx.session.uploadingImageType = 'bonusImage';
        await safeSendMessage(ctx, 'Send the image you want to upload:\n\nType "cancel" to cancel.');
        await ctx.scene.enter('image_overlay_scene');
    } catch (error) {
        console.error('Upload bonus image error:', error);
        await safeSendMessage(ctx, '❌ Error starting upload.');
    }
});

bot.action('admin_remove_bonusimage', async (ctx) => {
    try {
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { bonusImage: '', updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery('✅ Bonus image removed');
        await bot.action('admin_bonus_image')(ctx);
    } catch (error) {
        console.error('Remove bonus image error:', error);
        await ctx.answerCbQuery('❌ Failed to remove image');
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
        
        let text = '<b>📺 Manage Channels</b>\n\n';
        
        if (channels.length === 0) {
            text += 'No channels added yet.\n';
        } else {
            channels.forEach((channel, index) => {
                const type = channel.type === 'private' ? '🔒' : '🔓';
                text += `${index + 1}. ${type} ${channel.buttonLabel || channel.title} (${channel.type || 'public'})\n`;
            });
        }
        
        text += '\nSelect an option:';
        
        const keyboard = [
            [{ text: '➕ Add Channel', callback_data: 'admin_add_channel' }],
            channels.length > 0 ? [{ text: '🗑️ Delete Channel', callback_data: 'admin_delete_channel' }] : [],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ].filter(row => row.length > 0);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Channels menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Add Channel - Ask for type first
bot.action('admin_add_channel', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    const text = '<b>➕ Add Channel</b>\n\nSelect channel type:';
    const keyboard = [
        [{ text: '🔓 Public Channel', callback_data: 'add_public_channel' }],
        [{ text: '🔒 Private Channel', callback_data: 'add_private_channel' }],
        [{ text: '🔙 Back', callback_data: 'admin_channels' }]
    ];
    
    await safeEditMessage(ctx, text, {
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Add Public Channel
bot.action('add_public_channel', async (ctx) => {
    await safeSendMessage(ctx, 'Enter channel button name (e.g., "Join Main Channel"):\n\nType "cancel" to cancel.');
    await ctx.scene.enter('add_public_channel_name_scene');
});

scenes.addPublicChannelName.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Add cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        ctx.session.channelData = {
            buttonLabel: ctx.message.text,
            type: 'public'
        };
        
        await safeSendMessage(ctx, 'Now send the channel ID (e.g., @channelusername or -1001234567890):\n\nType "cancel" to cancel.');
        await ctx.scene.leave();
        await ctx.scene.enter('add_public_channel_id_scene');
    } catch (error) {
        console.error('Add public channel name error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
        await ctx.scene.leave();
    }
});

scenes.addPublicChannelId.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Add cancelled.');
            delete ctx.session.channelData;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        if (!ctx.session.channelData) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const channelIdentifier = ctx.message.text.trim();
        let channelId, channelTitle;
        
        try {
            const chat = await ctx.telegram.getChat(channelIdentifier);
            channelId = chat.id;
            channelTitle = chat.title || 'Unknown Channel';
            
            if (chat.type !== 'channel' && chat.type !== 'supergroup') {
                await safeSendMessage(ctx, '❌ This is not a channel or supergroup.');
                return;
            }
            
        } catch (error) {
            await safeSendMessage(ctx, '❌ Cannot access this channel. Make sure:\n1. The bot is added to the channel\n2. Channel ID is correct\n3. For private channels, use the -100 format');
            return;
        }
        
        ctx.session.channelData.id = channelId;
        ctx.session.channelData.title = channelTitle;
        
        await safeSendMessage(ctx, 'Now send the public channel link (e.g., https://t.me/channelusername):\n\nType "cancel" to cancel.');
        await ctx.scene.leave();
        await ctx.scene.enter('add_public_channel_link_scene');
    } catch (error) {
        console.error('Add public channel ID error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
        await ctx.scene.leave();
    }
});

scenes.addPublicChannelLink.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Add cancelled.');
            delete ctx.session.channelData;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        if (!ctx.session.channelData) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const link = ctx.message.text.trim();
        
        if (!link.startsWith('https://t.me/')) {
            await safeSendMessage(ctx, '❌ Invalid Telegram link. Must start with https://t.me/');
            return;
        }
        
        const channelData = ctx.session.channelData;
        
        const newChannel = {
            id: channelData.id,
            title: channelData.title,
            buttonLabel: channelData.buttonLabel,
            link: link,
            type: 'public',
            addedAt: new Date()
        };
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $push: { channels: newChannel } }
        );
        
        await safeSendMessage(ctx, `✅ <b>Public channel added successfully!</b>\n\n• <b>Name:</b> ${channelData.buttonLabel}\n• <b>Title:</b> ${channelData.title}\n• <b>ID:</b> <code>${channelData.id}</code>\n• <b>Link:</b> ${link}`, {
            parse_mode: 'HTML'
        });
        
        delete ctx.session.channelData;
        
    } catch (error) {
        console.error('Add public channel error:', error);
        await safeSendMessage(ctx, `❌ Error: ${error.message}\n\nPlease try again.`);
        delete ctx.session.channelData;
    }
    
    await ctx.scene.leave();
    await showAdminPanel(ctx);
});

// Add Private Channel
bot.action('add_private_channel', async (ctx) => {
    await safeSendMessage(ctx, 'Enter channel button name (e.g., "Join Private Group"):\n\nType "cancel" to cancel.');
    await ctx.scene.enter('add_private_channel_name_scene');
});

scenes.addPrivateChannelName.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Add cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        ctx.session.channelData = {
            buttonLabel: ctx.message.text,
            type: 'private'
        };
        
        await safeSendMessage(ctx, 'Now send the private channel ID (e.g., -1001234567890):\n\nType "cancel" to cancel.');
        await ctx.scene.leave();
        await ctx.scene.enter('add_private_channel_id_scene');
    } catch (error) {
        console.error('Add private channel name error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
        await ctx.scene.leave();
    }
});

scenes.addPrivateChannelId.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Add cancelled.');
            delete ctx.session.channelData;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        if (!ctx.session.channelData) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const channelId = ctx.message.text.trim();
        
        if (!channelId.startsWith('-100')) {
            await safeSendMessage(ctx, '❌ Invalid private channel ID. Must start with -100');
            return;
        }
        
        ctx.session.channelData.id = channelId;
        ctx.session.channelData.title = `Private Channel ${channelId}`;
        
        await safeSendMessage(ctx, 'Now send the private channel invite link (e.g., https://t.me/joinchat/xxxxxx):\n\n<i>Note: Bot will automatically accept join requests for this channel</i>\n\nType "cancel" to cancel.', {
            parse_mode: 'HTML'
        });
        await ctx.scene.leave();
        await ctx.scene.enter('add_private_channel_link_scene');
    } catch (error) {
        console.error('Add private channel ID error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
        await ctx.scene.leave();
    }
});

scenes.addPrivateChannelLink.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Add cancelled.');
            delete ctx.session.channelData;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        if (!ctx.session.channelData) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const link = ctx.message.text.trim();
        
        if (!link.startsWith('https://t.me/')) {
            await safeSendMessage(ctx, '❌ Invalid Telegram link. Must start with https://t.me/');
            return;
        }
        
        const channelData = ctx.session.channelData;
        
        const newChannel = {
            id: channelData.id,
            title: channelData.title,
            buttonLabel: channelData.buttonLabel,
            link: link,
            type: 'private',
            autoAccept: true,
            addedAt: new Date()
        };
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $push: { channels: newChannel } }
        );
        
        await safeSendMessage(ctx, `✅ <b>Private channel added successfully!</b>\n\n• <b>Name:</b> ${channelData.buttonLabel}\n• <b>ID:</b> <code>${channelData.id}</code>\n• <b>Link:</b> ${link}\n\n<i>Note: Users will need to join via link. Bot will accept join requests automatically.</i>`, {
            parse_mode: 'HTML'
        });
        
        delete ctx.session.channelData;
        
    } catch (error) {
        console.error('Add private channel error:', error);
        await safeSendMessage(ctx, `❌ Error: ${error.message}\n\nPlease try again.`);
        delete ctx.session.channelData;
    }
    
    await ctx.scene.leave();
    await showAdminPanel(ctx);
});

// Delete Channel
bot.action('admin_delete_channel', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        
        if (channels.length === 0) {
            await ctx.answerCbQuery('No channels to delete.');
            return;
        }
        
        let text = '<b>🗑️ Delete Channel</b>\n\nSelect a channel to delete:';
        const keyboard = [];
        
        channels.forEach((channel, index) => {
            const type = channel.type === 'private' ? '🔒' : '🔓';
            keyboard.push([{ 
                text: `${index + 1}. ${type} ${channel.buttonLabel || channel.title}`, 
                callback_data: `delete_channel_${channel.id}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back', callback_data: 'admin_channels' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Delete channel menu error:', error);
        await ctx.answerCbQuery('❌ Failed to load channels');
    }
});

bot.action(/^delete_channel_(.+)$/, async (ctx) => {
    try {
        const channelId = ctx.match[1];
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        const channelLevels = config?.channelLevels || DEFAULT_CONFIG.channelLevels;
        
        const newChannels = channels.filter(channel => String(channel.id) !== String(channelId));
        
        // Remove from all channel levels
        for (const level in channelLevels) {
            const index = channelLevels[level].indexOf(channelId);
            if (index > -1) {
                channelLevels[level].splice(index, 1);
            }
        }
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { 
                $set: { 
                    channels: newChannels,
                    channelLevels: channelLevels,
                    updatedAt: new Date() 
                }
            }
        );
        
        await ctx.answerCbQuery('✅ Channel deleted');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Delete channel error:', error);
        await ctx.answerCbQuery('❌ Failed to delete channel');
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
        const adminCode = config?.adminCode || ADMIN_CODE;
        
        let text = '<b>👑 Manage Admins</b>\n\n';
        text += `Admin Code: <code>${adminCode}</code>\n\n`;
        text += 'Current Admins:\n';
        
        admins.forEach((adminId, index) => {
            const isMuted = mutedAdmins.includes(adminId);
            const status = isMuted ? '🔕' : '🔔';
            text += `${index + 1}. ${status} <code>${adminId}</code>\n`;
        });
        
        text += '\nSelect an option:';
        
        const keyboard = [
            [{ text: '➕ Add Admin', callback_data: 'admin_add_admin' }, { text: '🗑️ Remove Admin', callback_data: 'admin_remove_admin' }],
            [{ text: '🔑 Change Admin Code', callback_data: 'admin_change_code' }],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Manage admins menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Add Admin
bot.action('admin_add_admin', async (ctx) => {
    await safeSendMessage(ctx, 'Send the user ID of the new admin:\n\nType "cancel" to cancel.');
    await ctx.scene.enter('add_admin_scene');
});

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
        
        await safeSendMessage(ctx, `✅ Admin added successfully!\n\nNew admin ID: <code>${newAdminId}</code>`, {
            parse_mode: 'HTML'
        });
        
    } catch (error) {
        console.error('Add admin error:', error);
        await safeSendMessage(ctx, '❌ Failed to add admin.');
    }
    
    await ctx.scene.leave();
    await showAdminPanel(ctx);
});

// Remove Admin
bot.action('admin_remove_admin', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const admins = config?.admins || ADMIN_IDS;
        
        if (admins.length <= 1) {
            await ctx.answerCbQuery('❌ Cannot remove last admin.');
            return;
        }
        
        let text = '<b>🗑️ Remove Admin</b>\n\nSelect an admin to remove:';
        const keyboard = [];
        
        admins.forEach((adminId, index) => {
            if (String(adminId) !== String(ctx.from.id)) {
                keyboard.push([{ 
                    text: `${index + 1}. ${adminId}`, 
                    callback_data: `remove_admin_${adminId}` 
                }]);
            }
        });
        
        keyboard.push([{ text: '🔙 Back', callback_data: 'admin_manage_admins' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Remove admin menu error:', error);
        await ctx.answerCbQuery('❌ Failed to load admins');
    }
});

bot.action(/^remove_admin_(.+)$/, async (ctx) => {
    try {
        const adminId = parseInt(ctx.match[1]);
        
        if (String(adminId) === String(ctx.from.id)) {
            await ctx.answerCbQuery('❌ Cannot remove yourself.');
            return;
        }
        
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentAdmins = config?.admins || ADMIN_IDS;
        
        const updatedAdmins = currentAdmins.filter(id => id !== adminId);
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { admins: updatedAdmins, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery('✅ Admin removed');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Remove admin error:', error);
        await ctx.answerCbQuery('❌ Failed to remove admin');
    }
});

// Change admin code
bot.action('admin_change_code', async (ctx) => {
    try {
        await safeSendMessage(ctx, 'Enter new admin code:\n\nType "cancel" to cancel.');
        
        ctx.session.changingAdminCode = true;
    } catch (error) {
        console.error('Change admin code error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Handle admin code change
bot.on('text', async (ctx) => {
    try {
        if (ctx.session?.changingAdminCode && !ctx.message.text?.startsWith('/')) {
            
            if (ctx.message.text.toLowerCase() === 'cancel') {
                await safeSendMessage(ctx, '❌ Code change cancelled.');
                delete ctx.session.changingAdminCode;
                return;
            }
            
            const newCode = ctx.message.text.trim();
            
            if (newCode.length < 3) {
                await safeSendMessage(ctx, '❌ Code must be at least 3 characters.');
                return;
            }
            
            await db.collection('admin').updateOne(
                { type: 'config' },
                { $set: { adminCode: newCode, updatedAt: new Date() } }
            );
            
            await safeSendMessage(ctx, `✅ Admin code changed to: <code>${newCode}</code>`, {
                parse_mode: 'HTML'
            });
            
            delete ctx.session.changingAdminCode;
            
            setTimeout(async () => {
                await bot.action('admin_manage_admins')(ctx);
            }, 1000);
        }
    } catch (error) {
        console.error('Handle admin code change error:', error);
        await safeSendMessage(ctx, '❌ Failed to change admin code.');
    }
});

// ==========================================
// ADMIN FEATURES - MANAGE GIFT CODES
// ==========================================

bot.action('admin_manage_gift_codes', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const giftCodes = config?.giftCodes || [];
        
        let text = '<b>🎁 Manage Gift Codes</b>\n\n';
        
        if (giftCodes.length === 0) {
            text += 'No gift codes created yet.\n';
        } else {
            giftCodes.forEach((code, index) => {
                const used = code.usedCount || 0;
                const max = code.maxUses === 0 ? '∞' : code.maxUses;
                const status = used < max || max === '∞' ? '🟢' : '🔴';
                text += `${index + 1}. ${status} <code>${code.code}</code> - ${used}/${max} uses\n`;
            });
        }
        
        text += '\nSelect an option:';
        
        const keyboard = [
            giftCodes.length > 0 ? [{ text: '✏️ Edit Gift Code', callback_data: 'admin_edit_gift_code_select' }] : [],
            giftCodes.length > 0 ? [{ text: '🗑️ Delete Gift Code', callback_data: 'admin_delete_gift_code_select' }] : [],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ].filter(row => row.length > 0);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Manage gift codes menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Edit gift code select
bot.action('admin_edit_gift_code_select', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const giftCodes = config?.giftCodes || [];
        
        let text = '<b>✏️ Edit Gift Code</b>\n\nSelect a gift code to edit:';
        const keyboard = [];
        
        giftCodes.forEach((code, index) => {
            keyboard.push([{ 
                text: `${index + 1}. ${code.code}`, 
                callback_data: `edit_gift_code_${code.id}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back', callback_data: 'admin_manage_gift_codes' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Edit gift code select error:', error);
        await ctx.answerCbQuery('❌ Failed to load gift codes');
    }
});

bot.action(/^edit_gift_code_(.+)$/, async (ctx) => {
    try {
        const codeId = ctx.match[1];
        const config = await db.collection('admin').findOne({ type: 'config' });
        const giftCodes = config?.giftCodes || [];
        const giftCode = giftCodes.find(gc => gc.id === codeId);
        
        if (!giftCode) {
            await ctx.answerCbQuery('❌ Gift code not found');
            return;
        }
        
        ctx.session.editingGiftCode = giftCode;
        
        let text = `<b>✏️ Edit Gift Code</b>\n\n`;
        text += `Code: <code>${giftCode.code}</code>\n`;
        text += `Max Uses: ${giftCode.maxUses === 0 ? 'Unlimited' : giftCode.maxUses}\n`;
        text += `Used: ${giftCode.usedCount || 0}\n`;
        text += `Amount Range: ${formatCurrency(giftCode.minAmount)} - ${formatCurrency(giftCode.maxAmount)}\n`;
        if (giftCode.expiry) {
            text += `Expires: ${formatDate(giftCode.expiry)}\n`;
        } else {
            text += `Expires: Never\n`;
        }
        
        const keyboard = [
            [{ text: '✏️ Edit Max Uses', callback_data: 'edit_gc_max_uses' }],
            [{ text: '✏️ Edit Expiry', callback_data: 'edit_gc_expiry' }],
            [{ text: '✏️ Edit Amount Range', callback_data: 'edit_gc_amount' }],
            [{ text: '🔙 Back', callback_data: 'admin_edit_gift_code_select' }]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Edit gift code error:', error);
        await ctx.answerCbQuery('❌ Error loading gift code');
    }
});

// Edit gift code properties
bot.action('edit_gc_max_uses', async (ctx) => {
    try {
        if (!ctx.session.editingGiftCode) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        await safeSendMessage(ctx, 'Enter new maximum uses (0 for unlimited):\n\nType "cancel" to cancel.');
        
        ctx.session.editingGiftCodeProperty = 'maxUses';
    } catch (error) {
        console.error('Edit GC max uses error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('edit_gc_expiry', async (ctx) => {
    try {
        if (!ctx.session.editingGiftCode) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        await safeSendMessage(ctx, 'Enter new expiry time in minutes (0 for no expiry):\n\nType "cancel" to cancel.');
        
        ctx.session.editingGiftCodeProperty = 'expiry';
    } catch (error) {
        console.error('Edit GC expiry error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('edit_gc_amount', async (ctx) => {
    try {
        if (!ctx.session.editingGiftCode) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        await safeSendMessage(ctx, 'Enter new minimum amount:\n\nType "cancel" to cancel.');
        
        ctx.session.editingGiftCodeProperty = 'minAmount';
        ctx.session.editingGiftCodeStep = 1;
    } catch (error) {
        console.error('Edit GC amount error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Handle gift code property edits
bot.on('text', async (ctx) => {
    try {
        if (ctx.session?.editingGiftCode && ctx.session?.editingGiftCodeProperty && !ctx.message.text?.startsWith('/')) {
            
            if (ctx.message.text.toLowerCase() === 'cancel') {
                await safeSendMessage(ctx, '❌ Edit cancelled.');
                delete ctx.session.editingGiftCodeProperty;
                delete ctx.session.editingGiftCodeStep;
                return;
            }
            
            const giftCode = ctx.session.editingGiftCode;
            const property = ctx.session.editingGiftCodeProperty;
            const step = ctx.session.editingGiftCodeStep || 0;
            
            if (property === 'maxUses') {
                const maxUses = parseInt(ctx.message.text);
                if (isNaN(maxUses) || maxUses < 0) {
                    await safeSendMessage(ctx, '❌ Please enter a valid number (0 or greater).');
                    return;
                }
                
                // Update in database
                await db.collection('admin').updateOne(
                    { type: 'config', 'giftCodes.id': giftCode.id },
                    { $set: { 'giftCodes.$.maxUses': maxUses } }
                );
                
                await safeSendMessage(ctx, `✅ Max uses updated to ${maxUses === 0 ? 'unlimited' : maxUses}.`);
                
                delete ctx.session.editingGiftCodeProperty;
                setTimeout(async () => {
                    await bot.action(`edit_gift_code_${giftCode.id}`)(ctx);
                }, 1000);
                
            } else if (property === 'expiry') {
                const expiryMinutes = parseInt(ctx.message.text);
                if (isNaN(expiryMinutes) || expiryMinutes < 0) {
                    await safeSendMessage(ctx, '❌ Please enter a valid number (0 or greater).');
                    return;
                }
                
                let expiry = null;
                if (expiryMinutes > 0) {
                    expiry = new Date();
                    expiry.setMinutes(expiry.getMinutes() + expiryMinutes);
                }
                
                // Update in database
                await db.collection('admin').updateOne(
                    { type: 'config', 'giftCodes.id': giftCode.id },
                    { $set: { 'giftCodes.$.expiry': expiry } }
                );
                
                await safeSendMessage(ctx, `✅ Expiry ${expiry ? `updated to ${formatDate(expiry)}` : 'removed'}.`);
                
                delete ctx.session.editingGiftCodeProperty;
                setTimeout(async () => {
                    await bot.action(`edit_gift_code_${giftCode.id}`)(ctx);
                }, 1000);
                
            } else if (property === 'minAmount') {
                if (step === 1) {
                    const minAmount = parseFloat(ctx.message.text);
                    if (isNaN(minAmount) || minAmount < 0) {
                        await safeSendMessage(ctx, '❌ Please enter a valid amount.');
                        return;
                    }
                    
                    ctx.session.editingGiftCode.minAmount = minAmount;
                    ctx.session.editingGiftCodeStep = 2;
                    
                    await safeSendMessage(ctx, 'Enter new maximum amount (same as min for fixed amount):');
                } else if (step === 2) {
                    const maxAmount = parseFloat(ctx.message.text);
                    if (isNaN(maxAmount) || maxAmount < ctx.session.editingGiftCode.minAmount) {
                        await safeSendMessage(ctx, `❌ Please enter a valid amount (must be at least ${ctx.session.editingGiftCode.minAmount}).`);
                        return;
                    }
                    
                    // Update in database
                    await db.collection('admin').updateOne(
                        { type: 'config', 'giftCodes.id': giftCode.id },
                        { 
                            $set: { 
                                'giftCodes.$.minAmount': ctx.session.editingGiftCode.minAmount,
                                'giftCodes.$.maxAmount': maxAmount
                            } 
                        }
                    );
                    
                    await safeSendMessage(ctx, `✅ Amount range updated to ${formatCurrency(ctx.session.editingGiftCode.minAmount)} - ${formatCurrency(maxAmount)}.`);
                    
                    delete ctx.session.editingGiftCodeProperty;
                    delete ctx.session.editingGiftCodeStep;
                    setTimeout(async () => {
                        await bot.action(`edit_gift_code_${giftCode.id}`)(ctx);
                    }, 1000);
                }
            }
        }
    } catch (error) {
        console.error('Handle gift code edit error:', error);
        await safeSendMessage(ctx, '❌ Failed to update gift code.');
    }
});

// Delete gift code select
bot.action('admin_delete_gift_code_select', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const giftCodes = config?.giftCodes || [];
        
        let text = '<b>🗑️ Delete Gift Code</b>\n\nSelect a gift code to delete:';
        const keyboard = [];
        
        giftCodes.forEach((code, index) => {
            keyboard.push([{ 
                text: `${index + 1}. ${code.code}`, 
                callback_data: `delete_gift_code_${code.id}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back', callback_data: 'admin_manage_gift_codes' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Delete gift code select error:', error);
        await ctx.answerCbQuery('❌ Failed to load gift codes');
    }
});

bot.action(/^delete_gift_code_(.+)$/, async (ctx) => {
    try {
        const codeId = ctx.match[1];
        
        // Remove from database
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $pull: { giftCodes: { id: codeId } } }
        );
        
        await ctx.answerCbQuery('✅ Gift code deleted');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Delete gift code error:', error);
        await ctx.answerCbQuery('❌ Failed to delete gift code');
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
        
        const text = `<b>⚙️ Image Overlay Settings</b>\n\nConfigure whether to show {name} overlay on images:\n\n• Start Image: ${overlaySettings.startImage ? '✅ ON' : '❌ OFF'}\n• Menu Image: ${overlaySettings.menuImage ? '✅ ON' : '❌ OFF'}\n• Bonus Image: ${overlaySettings.bonusImage ? '✅ ON' : '❌ OFF'}\n\nSelect an option:`;
        
        const keyboard = [
            [
                { text: overlaySettings.startImage ? '✅ Start Image' : '❌ Start Image', callback_data: 'toggle_start_overlay' },
                { text: overlaySettings.menuImage ? '✅ Menu Image' : '❌ Menu Image', callback_data: 'toggle_menu_overlay' }
            ],
            [
                { text: overlaySettings.bonusImage ? '✅ Bonus Image' : '❌ Bonus Image', callback_data: 'toggle_bonus_overlay' }
            ],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
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
// ADMIN FEATURES - CONTACT BUTTON
// ==========================================

bot.action('admin_contact_button', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const showContactButton = config?.showContactButton !== false;
        
        const text = `<b>📞 Contact Button Settings</b>\n\nCurrent status: ${showContactButton ? '✅ SHOWN to users' : '❌ HIDDEN from users'}\n\nSelect an option:`;
        
        const keyboard = [
            [
                { text: showContactButton ? '✅ Currently Shown' : '❌ Currently Hidden', callback_data: 'toggle_contact_button' }
            ],
            [
                { text: showContactButton ? '❌ Hide from Users' : '✅ Show to Users', callback_data: 'set_contact_button' }
            ],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
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

// Set contact button directly
bot.action('set_contact_button', async (ctx) => {
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
        console.error('Set contact button error:', error);
        await ctx.answerCbQuery('❌ Failed to update setting');
    }
});

// ==========================================
// ADMIN FEATURES - REORDER CHANNELS
// ==========================================

bot.action('admin_reorder_channels', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        
        if (channels.length === 0) {
            await safeSendMessage(ctx, '❌ No channels to reorder.');
            return;
        }
        
        if (channels.length === 1) {
            await safeSendMessage(ctx, '❌ Only one channel exists. Need at least 2 channels to reorder.');
            return;
        }
        
        let text = '<b>🔼🔽 Reorder Channels</b>\n\n';
        text += 'Select number of channels per row:\n\n';
        
        const keyboard = [
            [{ text: '1 Channel per Row', callback_data: 'reorder_1_per_row' }],
            [{ text: '2 Channels per Row', callback_data: 'reorder_2_per_row' }],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Reorder channels menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action('reorder_1_per_row', async (ctx) => {
    await startReorderChannels(ctx, 1);
});

bot.action('reorder_2_per_row', async (ctx) => {
    await startReorderChannels(ctx, 2);
});

async function startReorderChannels(ctx, channelsPerRow) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        
        ctx.session.reorderChannels = {
            channels: [...channels],
            channelsPerRow: channelsPerRow,
            selectedIndex: 0
        };
        
        await showReorderChannelsMenu(ctx);
    } catch (error) {
        console.error('Start reorder channels error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
}

async function showReorderChannelsMenu(ctx) {
    try {
        if (!ctx.session.reorderChannels) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            return;
        }
        
        const { channels, channelsPerRow, selectedIndex } = ctx.session.reorderChannels;
        
        let text = '<b>🔼🔽 Reorder Channels</b>\n\n';
        text += `Channels per row: ${channelsPerRow}\n\n`;
        text += 'Select a channel to move:\n\n';
        
        const keyboard = [];
        
        if (channelsPerRow === 1) {
            channels.forEach((channel, index) => {
                const type = channel.type === 'private' ? '🔒' : '🔓';
                keyboard.push([{ 
                    text: `${index + 1}. ${type} ${channel.buttonLabel || channel.title}`, 
                    callback_data: `reorder_channel_select_${index}` 
                }]);
            });
        } else {
            for (let i = 0; i < channels.length; i += 2) {
                const row = [];
                const channel1 = channels[i];
                const type1 = channel1.type === 'private' ? '🔒' : '🔓';
                row.push({ 
                    text: `${i + 1}. ${type1} ${channel1.buttonLabel || channel1.title}`, 
                    callback_data: `reorder_channel_select_${i}` 
                });
                
                if (i + 1 < channels.length) {
                    const channel2 = channels[i + 1];
                    const type2 = channel2.type === 'private' ? '🔒' : '🔓';
                    row.push({ 
                        text: `${i + 2}. ${type2} ${channel2.buttonLabel || channel2.title}`, 
                        callback_data: `reorder_channel_select_${i + 1}` 
                    });
                }
                
                keyboard.push(row);
            }
        }
        
        keyboard.push([{ text: '🔙 Back', callback_data: 'admin_reorder_channels' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Show reorder channels menu error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
}

bot.action(/^reorder_channel_select_(\d+)$/, async (ctx) => {
    try {
        const selectedIndex = parseInt(ctx.match[1]);
        const reorderData = ctx.session.reorderChannels;
        
        if (!reorderData || selectedIndex < 0 || selectedIndex >= reorderData.channels.length) {
            await ctx.answerCbQuery('❌ Invalid selection');
            return;
        }
        
        reorderData.selectedIndex = selectedIndex;
        
        let text = '<b>🔼🔽 Reorder Channels</b>\n\n';
        text += 'Current order (selected channel is highlighted):\n\n';
        
        reorderData.channels.forEach((channel, index) => {
            const type = channel.type === 'private' ? '🔒' : '🔓';
            if (index === selectedIndex) {
                text += `<blockquote>${index + 1}. ${type} ${channel.buttonLabel || channel.title}</blockquote>\n`;
            } else {
                text += `${index + 1}. ${type} ${channel.buttonLabel || channel.title}\n`;
            }
        });
        
        const keyboard = [];
        
        if (selectedIndex > 0) {
            keyboard.push([{ text: '🔼 Move Up', callback_data: 'reorder_channel_up' }]);
        }
        
        if (selectedIndex < reorderData.channels.length - 1) {
            if (selectedIndex > 0) {
                keyboard[keyboard.length - 1].push({ text: '🔽 Move Down', callback_data: 'reorder_channel_down' });
            } else {
                keyboard.push([{ text: '🔽 Move Down', callback_data: 'reorder_channel_down' }]);
            }
        }
        
        keyboard.push([{ text: '✅ Save Order', callback_data: 'reorder_channel_save' }, { text: '🔙 Back', callback_data: 'reorder_channels_back' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'HTML'
        });
        
    } catch (error) {
        console.error('Select channel for reorder error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('reorder_channel_up', async (ctx) => {
    try {
        if (!ctx.session.reorderChannels) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const { selectedIndex, channels } = ctx.session.reorderChannels;
        
        if (selectedIndex <= 0) {
            await ctx.answerCbQuery('❌ Already at top');
            return;
        }
        
        [channels[selectedIndex], channels[selectedIndex - 1]] = [channels[selectedIndex - 1], channels[selectedIndex]];
        ctx.session.reorderChannels.selectedIndex = selectedIndex - 1;
        
        await bot.action(`reorder_channel_select_${selectedIndex - 1}`)(ctx);
        await ctx.answerCbQuery('✅ Moved up');
        
    } catch (error) {
        console.error('Move channel up error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('reorder_channel_down', async (ctx) => {
    try {
        if (!ctx.session.reorderChannels) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const { selectedIndex, channels } = ctx.session.reorderChannels;
        
        if (selectedIndex >= channels.length - 1) {
            await ctx.answerCbQuery('❌ Already at bottom');
            return;
        }
        
        [channels[selectedIndex], channels[selectedIndex + 1]] = [channels[selectedIndex + 1], channels[selectedIndex]];
        ctx.session.reorderChannels.selectedIndex = selectedIndex + 1;
        
        await bot.action(`reorder_channel_select_${selectedIndex + 1}`)(ctx);
        await ctx.answerCbQuery('✅ Moved down');
        
    } catch (error) {
        console.error('Move channel down error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('reorder_channel_save', async (ctx) => {
    try {
        if (!ctx.session.reorderChannels) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const channels = ctx.session.reorderChannels.channels;
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { channels: channels, updatedAt: new Date() } }
        );
        
        delete ctx.session.reorderChannels;
        
        await ctx.answerCbQuery('✅ Channel order saved!');
        await showAdminPanel(ctx);
        
    } catch (error) {
        console.error('Save channel order error:', error);
        await ctx.answerCbQuery('❌ Failed to save order');
    }
});

bot.action('reorder_channels_back', async (ctx) => {
    try {
        await showReorderChannelsMenu(ctx);
    } catch (error) {
        console.error('Reorder channels back error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// ==========================================
// ADMIN FEATURES - EDIT CHANNELS
// ==========================================

bot.action('admin_edit_channels', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        
        if (channels.length === 0) {
            await safeSendMessage(ctx, '❌ No channels to edit.');
            return;
        }
        
        let text = '<b>✏️ Edit Channels</b>\n\n';
        text += 'Select a channel to edit:\n\n';
        
        const keyboard = [];
        
        channels.forEach((channel, index) => {
            const type = channel.type === 'private' ? '🔒' : '🔓';
            keyboard.push([{ 
                text: `${index + 1}. ${type} ${channel.buttonLabel || channel.title}`, 
                callback_data: `edit_channel_select_${index}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Edit channels menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action(/^edit_channel_select_(\d+)$/, async (ctx) => {
    try {
        const selectedIndex = parseInt(ctx.match[1]);
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        
        if (selectedIndex < 0 || selectedIndex >= channels.length) {
            await ctx.answerCbQuery('❌ Invalid selection');
            return;
        }
        
        const channel = channels[selectedIndex];
        
        ctx.session.editChannel = {
            index: selectedIndex,
            channel: channel
        };
        
        let text = '<b>✏️ Edit Channel</b>\n\n';
        text += '<b>Channel Details:</b>\n';
        text += `• <b>Button Name:</b> ${channel.buttonLabel || channel.title}\n`;
        text += `• <b>Channel ID:</b> <code>${channel.id}</code>\n`;
        text += `• <b>Link:</b> ${channel.link}\n`;
        text += `• <b>Type:</b> ${channel.type === 'private' ? '🔒 Private' : '🔓 Public'}\n`;
        if (channel.type === 'private') {
            const autoAccept = channel.autoAccept !== false;
            text += `• <b>Auto Accept:</b> ${autoAccept ? '✅ Enabled' : '❌ Disabled'}\n`;
        }
        text += `• <b>Title:</b> ${channel.title}\n`;
        text += `• <b>Added:</b> ${new Date(channel.addedAt).toLocaleDateString()}\n`;
        
        const keyboard = [
            [{ text: '✏️ Change Button Name', callback_data: 'edit_channel_name' }],
            [{ text: '🔗 Change Link', callback_data: 'edit_channel_link' }],
            [{ text: '🆔 Change Channel ID', callback_data: 'edit_channel_id' }]
        ];

        if (channel.type === 'private') {
            const autoAccept = channel.autoAccept !== false;
            keyboard.push([{ 
                text: autoAccept ? '✅ Auto Accept: ON' : '❌ Auto Accept: OFF', 
                callback_data: 'edit_channel_auto_accept' 
            }]);
        }

        keyboard.push(
            [{ text: '🔙 Back to Channels', callback_data: 'admin_edit_channels' }],
            [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
        );
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'HTML'
        });
        
    } catch (error) {
        console.error('Select channel for edit error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Edit channel name
bot.action('edit_channel_name', async (ctx) => {
    try {
        if (!ctx.session.editChannel) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            return;
        }
        
        const channel = ctx.session.editChannel.channel;
        
        await safeSendMessage(ctx, `Current button name: <b>${channel.buttonLabel || channel.title}</b>\n\nEnter new button name:\n\nType "cancel" to cancel.`, {
            parse_mode: 'HTML'
        });
        
        await ctx.scene.enter('edit_channel_details_scene');
        
    } catch (error) {
        console.error('Edit channel name error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Edit channel link
bot.action('edit_channel_link', async (ctx) => {
    try {
        if (!ctx.session.editChannel) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            return;
        }
        
        const channel = ctx.session.editChannel.channel;
        
        await safeSendMessage(ctx, `Current link: <code>${channel.link}</code>\n\nEnter new channel link:\n\n<i>Must start with https://t.me/</i>\n\nType "cancel" to cancel.`, {
            parse_mode: 'HTML'
        });
        
        ctx.session.editChannel.mode = 'link';
        await ctx.scene.enter('edit_channel_details_scene');
        
    } catch (error) {
        console.error('Edit channel link error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Edit channel ID
bot.action('edit_channel_id', async (ctx) => {
    try {
        if (!ctx.session.editChannel) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            return;
        }
        
        const channel = ctx.session.editChannel.channel;
        
        await safeSendMessage(ctx, `Current channel ID: <code>${channel.id}</code>\n\nEnter new channel ID:\n\n<i>Format: @username or -1001234567890</i>\n\nType "cancel" to cancel.`, {
            parse_mode: 'HTML'
        });
        
        ctx.session.editChannel.mode = 'id';
        await ctx.scene.enter('edit_channel_details_scene');
        
    } catch (error) {
        console.error('Edit channel ID error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Edit channel auto accept
bot.action('edit_channel_auto_accept', async (ctx) => {
    try {
        if (!ctx.session.editChannel) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            return;
        }
        
        const channelIndex = ctx.session.editChannel.index;
        const channel = ctx.session.editChannel.channel;
        
        if (channel.type !== 'private') {
            await ctx.answerCbQuery('❌ Only private channels have auto accept');
            return;
        }
        
        const currentSetting = channel.autoAccept !== false;
        const newSetting = !currentSetting;
        
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = [...config.channels];
        
        channels[channelIndex].autoAccept = newSetting;
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { channels: channels, updatedAt: new Date() } }
        );
        
        ctx.session.editChannel.channel = channels[channelIndex];
        
        await ctx.answerCbQuery(`✅ Auto accept ${newSetting ? 'enabled' : 'disabled'}`);
        
        await bot.action(`edit_channel_select_${channelIndex}`)(ctx);
        
    } catch (error) {
        console.error('Edit channel auto accept error:', error);
        await ctx.answerCbQuery('❌ Failed to update');
    }
});

// Handle channel edits
scenes.editChannelDetails.on('text', async (ctx) => {
    try {
        if (!ctx.session.editChannel) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            return;
        }
        
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Edit cancelled.');
            delete ctx.session.editChannel.mode;
            await ctx.scene.leave();
            await bot.action('admin_edit_channels')(ctx);
            return;
        }
        
        const channelIndex = ctx.session.editChannel.index;
        const editingMode = ctx.session.editChannel.mode || 'name';
        const newValue = ctx.message.text.trim();
        
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = [...config.channels];
        const channelToUpdate = { ...channels[channelIndex] };
        
        let updateMessage = '';
        
        if (editingMode === 'name') {
            channelToUpdate.buttonLabel = newValue;
            updateMessage = `✅ Button name updated to: <b>${newValue}</b>`;
            
        } else if (editingMode === 'link') {
            if (!newValue.startsWith('https://t.me/')) {
                await safeSendMessage(ctx, '❌ Invalid link. Must start with https://t.me/');
                return;
            }
            
            channelToUpdate.link = newValue;
            
            if (newValue.includes('joinchat/') || newValue.includes('+')) {
                channelToUpdate.type = 'private';
            } else {
                channelToUpdate.type = 'public';
            }
            
            updateMessage = `✅ Link updated to: <code>${newValue}</code>\n\nType detected as: ${channelToUpdate.type === 'private' ? '🔒 Private' : '🔓 Public'}`;
            
        } else if (editingMode === 'id') {
            try {
                const chat = await ctx.telegram.getChat(newValue);
                channelToUpdate.id = chat.id;
                channelToUpdate.title = chat.title || 'Unknown Channel';
                
                if (chat.type === 'channel' || chat.type === 'supergroup') {
                    if (String(chat.id).startsWith('-100')) {
                        channelToUpdate.type = 'private';
                    } else {
                        channelToUpdate.type = 'public';
                    }
                }
                
                updateMessage = `✅ Channel ID updated to: <code>${chat.id}</code>\n\nTitle: ${chat.title || 'Unknown'}\nType: ${channelToUpdate.type === 'private' ? '🔒 Private' : '🔓 Public'}`;
                
            } catch (error) {
                await safeSendMessage(ctx, '❌ Cannot access this channel. Make sure:\n1. The bot is added to the channel\n2. Channel ID is correct');
                return;
            }
        }
        
        channels[channelIndex] = channelToUpdate;
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { channels: channels, updatedAt: new Date() } }
        );
        
        ctx.session.editChannel.channel = channelToUpdate;
        delete ctx.session.editChannel.mode;
        
        await safeSendMessage(ctx, updateMessage, {
            parse_mode: 'HTML'
        });
        
        await ctx.scene.leave();
        
        setTimeout(async () => {
            await bot.action(`edit_channel_select_${channelIndex}`)(ctx);
        }, 1000);
        
    } catch (error) {
        console.error('Edit channel details error:', error);
        await safeSendMessage(ctx, '❌ Failed to update channel.');
        await ctx.scene.leave();
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
        const disabledMessage = config?.disabledMessage || '🚧 Bot is under maintenance. Please check back later.';
        
        const text = `<b>🚫 Bot Status Control</b>\n\nCurrent status: ${botDisabled ? '❌ DISABLED' : '✅ ENABLED'}\n\nWhen disabled, users will see this message:\n<code>${escapeMarkdown(disabledMessage)}</code>\n\nSelect an option:`;
        
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
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
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

// Set bot status directly
bot.action('set_bot_status', async (ctx) => {
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
        console.error('Set bot status error:', error);
        await ctx.answerCbQuery('❌ Failed to update status');
    }
});

// Edit disabled message
bot.action('edit_disabled_message', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentMessage = config?.disabledMessage || '🚧 Bot is under maintenance. Please check back later.';
        
        await safeSendMessage(ctx, `Current disabled message:\n<code>${escapeMarkdown(currentMessage)}</code>\n\nEnter new disabled message:\n\n<i>Supports HTML formatting</i>\n\nType "cancel" to cancel.`, {
            parse_mode: 'HTML'
        });
        
        ctx.session.editingDisabledMessage = true;
        
    } catch (error) {
        console.error('Edit disabled message error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Handle disabled message edit
bot.on('text', async (ctx) => {
    try {
        if (ctx.session?.editingDisabledMessage && !ctx.message.text?.startsWith('/')) {
            
            if (ctx.message.text.toLowerCase() === 'cancel') {
                await safeSendMessage(ctx, '❌ Edit cancelled.');
                delete ctx.session.editingDisabledMessage;
                return;
            }
            
            const newMessage = ctx.message.text;
            
            await db.collection('admin').updateOne(
                { type: 'config' },
                { $set: { disabledMessage: newMessage, updatedAt: new Date() } }
            );
            
            await safeSendMessage(ctx, `✅ Disabled message updated!\n\nNew message:\n<code>${escapeMarkdown(newMessage)}</code>`, {
                parse_mode: 'HTML'
            });
            
            delete ctx.session.editingDisabledMessage;
            
            setTimeout(async () => {
                await bot.action('admin_disable_bot')(ctx);
            }, 1000);
        }
    } catch (error) {
        console.error('Handle disabled message edit error:', error);
        await safeSendMessage(ctx, '❌ Failed to update message.');
    }
});

// ==========================================
// ADMIN FEATURES - HIDE CHANNELS (F)
// ==========================================

bot.action('admin_hide_channels', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        const channelLevels = config?.channelLevels || DEFAULT_CONFIG.channelLevels;
        const hiddenChannels = channelLevels.f || [];
        
        let text = '<b>👁️ Hide Channels (F Level)</b>\n\n';
        text += 'Hidden channels will not be shown to users.\n\n';
        text += 'Select channels to hide/unhide:\n\n';
        
        const keyboard = [];
        
        channels.forEach((channel, index) => {
            const isHidden = hiddenChannels.includes(String(channel.id));
            const type = channel.type === 'private' ? '🔒' : '🔓';
            const status = isHidden ? '👁️‍🗨️ Hidden' : '👁️ Visible';
            
            keyboard.push([{ 
                text: `${isHidden ? '✅' : '❌'} ${index + 1}. ${type} ${channel.buttonLabel || channel.title}`, 
                callback_data: `toggle_hide_channel_${channel.id}` 
            }]);
        });
        
        keyboard.push([{ text: '✅ Save Changes', callback_data: 'save_hide_channels' }, { text: '🔙 Back', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
        
        ctx.session.channelLevelEditing = {
            level: 'f',
            channels: channels,
            hiddenChannels: [...hiddenChannels]
        };
    } catch (error) {
        console.error('Hide channels menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action(/^toggle_hide_channel_(.+)$/, async (ctx) => {
    try {
        const channelId = ctx.match[1];
        
        if (!ctx.session.channelLevelEditing || ctx.session.channelLevelEditing.level !== 'f') {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const hiddenChannels = ctx.session.channelLevelEditing.hiddenChannels;
        const index = hiddenChannels.indexOf(channelId);
        
        if (index > -1) {
            hiddenChannels.splice(index, 1);
        } else {
            hiddenChannels.push(channelId);
        }
        
        ctx.session.channelLevelEditing.hiddenChannels = hiddenChannels;
        
        await bot.action('admin_hide_channels')(ctx);
        await ctx.answerCbQuery('✅ Channel status toggled');
        
    } catch (error) {
        console.error('Toggle hide channel error:', error);
        await ctx.answerCbQuery('❌ Failed to toggle');
    }
});

bot.action('save_hide_channels', async (ctx) => {
    try {
        if (!ctx.session.channelLevelEditing || ctx.session.channelLevelEditing.level !== 'f') {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const hiddenChannels = ctx.session.channelLevelEditing.hiddenChannels;
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channelLevels = config?.channelLevels || DEFAULT_CONFIG.channelLevels;
        
        channelLevels.f = hiddenChannels;
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { channelLevels: channelLevels, updatedAt: new Date() } }
        );
        
        delete ctx.session.channelLevelEditing;
        
        await ctx.answerCbQuery('✅ Hide settings saved!');
        await showAdminPanel(ctx);
        
    } catch (error) {
        console.error('Save hide channels error:', error);
        await ctx.answerCbQuery('❌ Failed to save settings');
    }
});

// ==========================================
// ADMIN FEATURES - JUST SHOW (S)
// ==========================================

bot.action('admin_just_show', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        const channelLevels = config?.channelLevels || DEFAULT_CONFIG.channelLevels;
        const hiddenChannels = channelLevels.f || [];
        const justShowChannels = channelLevels.s || [];
        
        let text = '<b>📋 Just Show Channels (S Level)</b>\n\n';
        text += 'Just show channels are displayed but not required to join.\n\n';
        text += 'Select channels for just show:\n\n';
        
        const keyboard = [];
        
        channels.forEach((channel, index) => {
            if (hiddenChannels.includes(String(channel.id))) {
                return; // Skip hidden channels
            }
            
            const isJustShow = justShowChannels.includes(String(channel.id));
            const type = channel.type === 'private' ? '🔒' : '🔓';
            const status = isJustShow ? '✅ Just Show' : '❌ Not Just Show';
            
            keyboard.push([{ 
                text: `${isJustShow ? '✅' : '❌'} ${index + 1}. ${type} ${channel.buttonLabel || channel.title}`, 
                callback_data: `toggle_just_show_${channel.id}` 
            }]);
        });
        
        keyboard.push([{ text: '✅ Save Changes', callback_data: 'save_just_show' }, { text: '🔙 Back', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
        
        ctx.session.channelLevelEditing = {
            level: 's',
            channels: channels.filter(ch => !hiddenChannels.includes(String(ch.id))),
            justShowChannels: [...justShowChannels]
        };
    } catch (error) {
        console.error('Just show channels menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action(/^toggle_just_show_(.+)$/, async (ctx) => {
    try {
        const channelId = ctx.match[1];
        
        if (!ctx.session.channelLevelEditing || ctx.session.channelLevelEditing.level !== 's') {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const justShowChannels = ctx.session.channelLevelEditing.justShowChannels;
        const index = justShowChannels.indexOf(channelId);
        
        if (index > -1) {
            justShowChannels.splice(index, 1);
        } else {
            justShowChannels.push(channelId);
        }
        
        ctx.session.channelLevelEditing.justShowChannels = justShowChannels;
        
        await bot.action('admin_just_show')(ctx);
        await ctx.answerCbQuery('✅ Channel status toggled');
        
    } catch (error) {
        console.error('Toggle just show error:', error);
        await ctx.answerCbQuery('❌ Failed to toggle');
    }
});

bot.action('save_just_show', async (ctx) => {
    try {
        if (!ctx.session.channelLevelEditing || ctx.session.channelLevelEditing.level !== 's') {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const justShowChannels = ctx.session.channelLevelEditing.justShowChannels;
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channelLevels = config?.channelLevels || DEFAULT_CONFIG.channelLevels;
        
        channelLevels.s = justShowChannels;
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { channelLevels: channelLevels, updatedAt: new Date() } }
        );
        
        delete ctx.session.channelLevelEditing;
        
        await ctx.answerCbQuery('✅ Just show settings saved!');
        await showAdminPanel(ctx);
        
    } catch (error) {
        console.error('Save just show error:', error);
        await ctx.answerCbQuery('❌ Failed to save settings');
    }
});

// ==========================================
// ADMIN FEATURES - AUTO ACCEPT (SS)
// ==========================================

bot.action('admin_auto_accept', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        const channelLevels = config?.channelLevels || DEFAULT_CONFIG.channelLevels;
        const hiddenChannels = channelLevels.f || [];
        const autoAcceptChannels = channelLevels.ss || [];
        
        // Filter only private channels
        const privateChannels = channels.filter(ch => ch.type === 'private' && !hiddenChannels.includes(String(ch.id)));
        
        let text = '<b>✅ Auto Accept Channels (SS Level)</b>\n\n';
        text += 'Auto accept channels will automatically approve join requests.\n\n';
        text += 'Select private channels for auto accept:\n\n';
        
        const keyboard = [];
        
        privateChannels.forEach((channel, index) => {
            const isAutoAccept = autoAcceptChannels.includes(String(channel.id));
            const status = isAutoAccept ? '✅ Auto Accept' : '❌ Manual Accept';
            
            keyboard.push([{ 
                text: `${isAutoAccept ? '✅' : '❌'} ${index + 1}. 🔒 ${channel.buttonLabel || channel.title}`, 
                callback_data: `toggle_auto_accept_${channel.id}` 
            }]);
        });
        
        keyboard.push([{ text: '✅ Save Changes', callback_data: 'save_auto_accept' }, { text: '🔙 Back', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
        
        ctx.session.channelLevelEditing = {
            level: 'ss',
            channels: privateChannels,
            autoAcceptChannels: [...autoAcceptChannels]
        };
    } catch (error) {
        console.error('Auto accept channels menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action(/^toggle_auto_accept_(.+)$/, async (ctx) => {
    try {
        const channelId = ctx.match[1];
        
        if (!ctx.session.channelLevelEditing || ctx.session.channelLevelEditing.level !== 'ss') {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const autoAcceptChannels = ctx.session.channelLevelEditing.autoAcceptChannels;
        const index = autoAcceptChannels.indexOf(channelId);
        
        if (index > -1) {
            autoAcceptChannels.splice(index, 1);
        } else {
            autoAcceptChannels.push(channelId);
        }
        
        ctx.session.channelLevelEditing.autoAcceptChannels = autoAcceptChannels;
        
        await bot.action('admin_auto_accept')(ctx);
        await ctx.answerCbQuery('✅ Channel status toggled');
        
    } catch (error) {
        console.error('Toggle auto accept error:', error);
        await ctx.answerCbQuery('❌ Failed to toggle');
    }
});

bot.action('save_auto_accept', async (ctx) => {
    try {
        if (!ctx.session.channelLevelEditing || ctx.session.channelLevelEditing.level !== 'ss') {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const autoAcceptChannels = ctx.session.channelLevelEditing.autoAcceptChannels;
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channelLevels = config?.channelLevels || DEFAULT_CONFIG.channelLevels;
        
        channelLevels.ss = autoAcceptChannels;
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { channelLevels: channelLevels, updatedAt: new Date() } }
        );
        
        delete ctx.session.channelLevelEditing;
        
        await ctx.answerCbQuery('✅ Auto accept settings saved!');
        await showAdminPanel(ctx);
        
    } catch (error) {
        console.error('Save auto accept error:', error);
        await ctx.answerCbQuery('❌ Failed to save settings');
    }
});

// ==========================================
// ADMIN FEATURES - NEED JOIN (SSS)
// ==========================================

bot.action('admin_need_join', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        const channelLevels = config?.channelLevels || DEFAULT_CONFIG.channelLevels;
        const hiddenChannels = channelLevels.f || [];
        const mustJoinChannels = channelLevels.sss || [];
        
        let text = '<b>🔒 Need Join Channels (SSS Level)</b>\n\n';
        text += 'Need join channels must be joined to access the bot.\n\n';
        text += 'Select channels that users must join:\n\n';
        
        const keyboard = [];
        
        channels.forEach((channel, index) => {
            if (hiddenChannels.includes(String(channel.id))) {
                return; // Skip hidden channels
            }
            
            const isMustJoin = mustJoinChannels.includes(String(channel.id));
            const type = channel.type === 'private' ? '🔒' : '🔓';
            const status = isMustJoin ? '✅ Must Join' : '❌ Optional';
            
            keyboard.push([{ 
                text: `${isMustJoin ? '✅' : '❌'} ${index + 1}. ${type} ${channel.buttonLabel || channel.title}`, 
                callback_data: `toggle_must_join_${channel.id}` 
            }]);
        });
        
        keyboard.push([{ text: '✅ Save Changes', callback_data: 'save_must_join' }, { text: '🔙 Back', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
        
        ctx.session.channelLevelEditing = {
            level: 'sss',
            channels: channels.filter(ch => !hiddenChannels.includes(String(ch.id))),
            mustJoinChannels: [...mustJoinChannels]
        };
    } catch (error) {
        console.error('Need join channels menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action(/^toggle_must_join_(.+)$/, async (ctx) => {
    try {
        const channelId = ctx.match[1];
        
        if (!ctx.session.channelLevelEditing || ctx.session.channelLevelEditing.level !== 'sss') {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const mustJoinChannels = ctx.session.channelLevelEditing.mustJoinChannels;
        const index = mustJoinChannels.indexOf(channelId);
        
        if (index > -1) {
            mustJoinChannels.splice(index, 1);
        } else {
            mustJoinChannels.push(channelId);
        }
        
        ctx.session.channelLevelEditing.mustJoinChannels = mustJoinChannels;
        
        await bot.action('admin_need_join')(ctx);
        await ctx.answerCbQuery('✅ Channel status toggled');
        
    } catch (error) {
        console.error('Toggle must join error:', error);
        await ctx.answerCbQuery('❌ Failed to toggle');
    }
});

bot.action('save_must_join', async (ctx) => {
    try {
        if (!ctx.session.channelLevelEditing || ctx.session.channelLevelEditing.level !== 'sss') {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const mustJoinChannels = ctx.session.channelLevelEditing.mustJoinChannels;
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channelLevels = config?.channelLevels || DEFAULT_CONFIG.channelLevels;
        
        channelLevels.sss = mustJoinChannels;
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { channelLevels: channelLevels, updatedAt: new Date() } }
        );
        
        delete ctx.session.channelLevelEditing;
        
        await ctx.answerCbQuery('✅ Must join settings saved!');
        await showAdminPanel(ctx);
        
    } catch (error) {
        console.error('Save must join error:', error);
        await ctx.answerCbQuery('❌ Failed to save settings');
    }
});

// ==========================================
// ADMIN FEATURES - REFER SETTINGS
// ==========================================

bot.action('admin_refer_settings', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const referReward = config?.referReward || DEFAULT_CONFIG.referReward;
        const referMinAmount = config?.referMinAmount || DEFAULT_CONFIG.referMinAmount;
        const referMaxAmount = config?.referMaxAmount || DEFAULT_CONFIG.referMaxAmount;
        
        const text = `<b>📤 Refer Settings</b>\n\n`;
        text += `💰 Refer Reward: ${formatCurrency(referReward)}\n`;
        text += `📊 Min Amount: ${formatCurrency(referMinAmount)}\n`;
        text += `📈 Max Amount: ${formatCurrency(referMaxAmount)}\n\n`;
        text += `Select an option:`;
        
        const keyboard = [
            [{ text: '✏️ Edit Refer Reward', callback_data: 'admin_edit_refer_reward' }],
            [{ text: '✏️ Edit Amount Range', callback_data: 'admin_edit_refer_range' }],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Refer settings menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action('admin_edit_refer_reward', async (ctx) => {
    try {
        await safeSendMessage(ctx, 'Enter new refer reward amount:\n\nType "cancel" to cancel.');
        
        ctx.session.editingReferReward = true;
    } catch (error) {
        console.error('Edit refer reward error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('admin_edit_refer_range', async (ctx) => {
    try {
        await safeSendMessage(ctx, 'Enter new minimum amount for referrals:\n\nType "cancel" to cancel.');
        
        ctx.session.editingReferRange = true;
        ctx.session.editingReferStep = 1;
    } catch (error) {
        console.error('Edit refer range error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Handle refer settings edits
bot.on('text', async (ctx) => {
    try {
        if (ctx.session?.editingReferReward && !ctx.message.text?.startsWith('/')) {
            
            if (ctx.message.text.toLowerCase() === 'cancel') {
                await safeSendMessage(ctx, '❌ Edit cancelled.');
                delete ctx.session.editingReferReward;
                return;
            }
            
            const amount = parseFloat(ctx.message.text);
            if (isNaN(amount) || amount < 0) {
                await safeSendMessage(ctx, '❌ Please enter a valid amount.');
                return;
            }
            
            await db.collection('admin').updateOne(
                { type: 'config' },
                { $set: { referReward: amount, updatedAt: new Date() } }
            );
            
            await safeSendMessage(ctx, `✅ Refer reward updated to ${formatCurrency(amount)}!`);
            
            delete ctx.session.editingReferReward;
            
            setTimeout(async () => {
                await bot.action('admin_refer_settings')(ctx);
            }, 1000);
        }
        
        if (ctx.session?.editingReferRange && !ctx.message.text?.startsWith('/')) {
            
            if (ctx.message.text.toLowerCase() === 'cancel') {
                await safeSendMessage(ctx, '❌ Edit cancelled.');
                delete ctx.session.editingReferRange;
                delete ctx.session.editingReferStep;
                return;
            }
            
            const step = ctx.session.editingReferStep;
            
            if (step === 1) {
                const minAmount = parseFloat(ctx.message.text);
                if (isNaN(minAmount) || minAmount < 0) {
                    await safeSendMessage(ctx, '❌ Please enter a valid amount.');
                    return;
                }
                
                ctx.session.referMinAmount = minAmount;
                ctx.session.editingReferStep = 2;
                
                await safeSendMessage(ctx, 'Enter new maximum amount for referrals:');
            } else if (step === 2) {
                const maxAmount = parseFloat(ctx.message.text);
                if (isNaN(maxAmount) || maxAmount < ctx.session.referMinAmount) {
                    await safeSendMessage(ctx, `❌ Please enter a valid amount (must be at least ${ctx.session.referMinAmount}).`);
                    return;
                }
                
                await db.collection('admin').updateOne(
                    { type: 'config' },
                    { 
                        $set: { 
                            referMinAmount: ctx.session.referMinAmount,
                            referMaxAmount: maxAmount,
                            updatedAt: new Date() 
                        } 
                    }
                );
                
                await safeSendMessage(ctx, `✅ Refer amount range updated to ${formatCurrency(ctx.session.referMinAmount)} - ${formatCurrency(maxAmount)}!`);
                
                delete ctx.session.editingReferRange;
                delete ctx.session.editingReferStep;
                delete ctx.session.referMinAmount;
                
                setTimeout(async () => {
                    await bot.action('admin_refer_settings')(ctx);
                }, 1000);
            }
        }
    } catch (error) {
        console.error('Handle refer settings edit error:', error);
        await safeSendMessage(ctx, '❌ Failed to update refer settings.');
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
        
        let text = `<b>🖼️ Manage Uploaded Images</b>\n\n`;
        
        if (images.length === 0) {
            text += `No images uploaded yet.\n`;
        } else {
            text += `Total uploaded images: ${images.length}\n`;
            text += `\n<i>Images not currently in use can be deleted</i>\n`;
        }
        
        const keyboard = [];
        
        if (images.length > 0) {
            keyboard.push([{ text: '🗑️ Delete Unused Images', callback_data: 'delete_unused_images' }]);
            keyboard.push([{ text: '📋 List All Images', callback_data: 'list_all_images' }]);
        }
        
        keyboard.push([{ text: '🔙 Back', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Manage images menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action('delete_unused_images', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const images = config?.uploadedImages || [];
        const currentStartImage = config?.startImage;
        const currentMenuImage = config?.menuImage;
        const currentBonusImage = config?.bonusImage || '';
        
        const usedImages = new Set();
        usedImages.add(currentStartImage);
        usedImages.add(currentMenuImage);
        if (currentBonusImage) {
            usedImages.add(currentBonusImage);
        }
        
        const unusedImages = images.filter(img => !usedImages.has(img.url));
        
        if (unusedImages.length === 0) {
            await ctx.answerCbQuery('❌ No unused images found');
            return;
        }
        
        let deletedCount = 0;
        const deletePromises = unusedImages.map(async (img) => {
            try {
                await cloudinary.uploader.destroy(img.publicId);
                deletedCount++;
            } catch (error) {
                console.error(`Failed to delete image ${img.publicId}:`, error);
            }
        });
        
        await Promise.allSettled(deletePromises);
        
        const updatedImages = images.filter(img => usedImages.has(img.url));
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { uploadedImages: updatedImages, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery(`✅ Deleted ${deletedCount} unused images`);
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Delete unused images error:', error);
        await ctx.answerCbQuery('❌ Failed to delete images');
    }
});

bot.action('list_all_images', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const images = config?.uploadedImages || [];
        
        if (images.length === 0) {
            await ctx.answerCbQuery('❌ No images found');
            return;
        }
        
        let text = `<b>📋 All Uploaded Images</b>\n\n`;
        images.forEach((img, index) => {
            text += `${index + 1}. <code>${img.url}</code>\n`;
            text += `   Type: ${img.type || 'unknown'}\n`;
            text += `   Overlay: ${img.hasOverlay ? '✅ Yes' : '❌ No'}\n`;
            text += `   Uploaded: ${new Date(img.uploadedAt).toLocaleDateString()}\n\n`;
        });
        
        const keyboard = [
            [{ text: '🗑️ Delete Unused', callback_data: 'delete_unused_images' }],
            [{ text: '🔙 Back', callback_data: 'admin_manage_images' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('List images error:', error);
        await ctx.answerCbQuery('❌ Failed to list images');
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
        [{ text: '🗑️ Delete All Gift Codes', callback_data: 'delete_all_gift_codes' }, { text: '🗑️ Delete All Tasks', callback_data: 'delete_all_tasks' }],
        [{ text: '🔥 DELETE EVERYTHING', callback_data: 'delete_everything' }],
        [{ text: '🔙 Back', callback_data: 'admin_back' }]
    ];
    
    await safeEditMessage(ctx, text, {
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Delete All Users
bot.action('delete_all_users', async (ctx) => {
    const keyboard = [
        [{ text: '✅ YES, DELETE ALL USERS', callback_data: 'confirm_delete_users' }],
        [{ text: '❌ NO, CANCEL', callback_data: 'admin_deletedata' }]
    ];
    
    await safeEditMessage(ctx,
        '<b>⚠️ CONFIRMATION REQUIRED</b>\n\nAre you sure you want to delete ALL users?\n\nThis will remove all user data.\n\n<b>This action cannot be undone!</b>',
        {
            reply_markup: { inline_keyboard: keyboard }
        }
    );
});

bot.action('confirm_delete_users', async (ctx) => {
    try {
        const result = await db.collection('users').deleteMany({});
        await safeEditMessage(ctx, `✅ Deleted ${result.deletedCount} users.`, {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    } catch (error) {
        console.error('Delete users error:', error);
        await safeEditMessage(ctx, '❌ Failed to delete users.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    }
});

// Delete All Channels
bot.action('delete_all_channels', async (ctx) => {
    const keyboard = [
        [{ text: '✅ YES, DELETE ALL CHANNELS', callback_data: 'confirm_delete_channels' }],
        [{ text: '❌ NO, CANCEL', callback_data: 'admin_deletedata' }]
    ];
    
    await safeEditMessage(ctx,
        '<b>⚠️ CONFIRMATION REQUIRED</b>\n\nAre you sure you want to delete ALL channels?\n\nThis will remove all channel data.\n\n<b>This action cannot be undone!</b>',
        {
            reply_markup: { inline_keyboard: keyboard }
        }
    );
});

bot.action('confirm_delete_channels', async (ctx) => {
    try {
        await db.collection('admin').updateOne(
            { type: 'config' },
            { 
                $set: { 
                    channels: [],
                    channelLevels: DEFAULT_CONFIG.channelLevels,
                    updatedAt: new Date() 
                }
            }
        );
        
        await safeEditMessage(ctx, '✅ All channels deleted.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    } catch (error) {
        console.error('Delete channels error:', error);
        await safeEditMessage(ctx, '❌ Failed to delete channels.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    }
});

// Delete All Gift Codes
bot.action('delete_all_gift_codes', async (ctx) => {
    const keyboard = [
        [{ text: '✅ YES, DELETE ALL GIFT CODES', callback_data: 'confirm_delete_gift_codes' }],
        [{ text: '❌ NO, CANCEL', callback_data: 'admin_deletedata' }]
    ];
    
    await safeEditMessage(ctx,
        '<b>⚠️ CONFIRMATION REQUIRED</b>\n\nAre you sure you want to delete ALL gift codes?\n\nThis will remove all gift code data.\n\n<b>This action cannot be undone!</b>',
        {
            reply_markup: { inline_keyboard: keyboard }
        }
    );
});

bot.action('confirm_delete_gift_codes', async (ctx) => {
    try {
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { giftCodes: [], updatedAt: new Date() } }
        );
        
        await safeEditMessage(ctx, '✅ All gift codes deleted.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    } catch (error) {
        console.error('Delete gift codes error:', error);
        await safeEditMessage(ctx, '❌ Failed to delete gift codes.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    }
});

// Delete All Tasks
bot.action('delete_all_tasks', async (ctx) => {
    const keyboard = [
        [{ text: '✅ YES, DELETE ALL TASKS', callback_data: 'confirm_delete_tasks' }],
        [{ text: '❌ NO, CANCEL', callback_data: 'admin_deletedata' }]
    ];
    
    await safeEditMessage(ctx,
        '<b>⚠️ CONFIRMATION REQUIRED</b>\n\nAre you sure you want to delete ALL tasks?\n\nThis will remove all task data.\n\n<b>This action cannot be undone!</b>',
        {
            reply_markup: { inline_keyboard: keyboard }
        }
    );
});

bot.action('confirm_delete_tasks', async (ctx) => {
    try {
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { tasks: [], taskHistory: [], updatedAt: new Date() } }
        );
        
        await safeEditMessage(ctx, '✅ All tasks deleted.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    } catch (error) {
        console.error('Delete tasks error:', error);
        await safeEditMessage(ctx, '❌ Failed to delete tasks.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    }
});

// Delete Everything
bot.action('delete_everything', async (ctx) => {
    const keyboard = [
        [{ text: '🔥 YES, DELETE EVERYTHING', callback_data: 'confirm_delete_everything' }],
        [{ text: '❌ NO, CANCEL', callback_data: 'admin_deletedata' }]
    ];
    
    await safeEditMessage(ctx,
        '<b>🚨 EXTREME DANGER</b>\n\nAre you absolutely sure you want to DELETE EVERYTHING?\n\nThis will remove ALL data and reset the bot.\n\n<b>COMPLETE RESET - IRREVERSIBLE!</b>',
        {
            reply_markup: { inline_keyboard: keyboard }
        }
    );
});

bot.action('confirm_delete_everything', async (ctx) => {
    try {
        await db.collection('users').deleteMany({});
        
        await db.collection('admin').deleteOne({ type: 'config' });
        
        await initBot();
        
        await safeEditMessage(ctx, '<b>🔥 COMPLETE RESET DONE!</b>\n\nBot has been reset to factory settings.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    } catch (error) {
        console.error('Delete everything error:', error);
        await safeEditMessage(ctx, '❌ Failed to reset bot.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
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
        
        const text = `<b>🔕 Mute Notifications</b>\n\nCurrent status: ${isMuted ? '🔕 MUTED' : '🔔 ACTIVE'}\n\nWhen muted, you will NOT receive:\n• Contact messages from users\n• Join request notifications\n• Error reports\n• Broadcast confirmations\n• Other admin notifications\n\nSelect an option:`;
        
        const keyboard = [
            [
                { text: isMuted ? '🔕 Currently Muted' : '🔔 Currently Active', callback_data: 'toggle_mute_status' }
            ],
            [
                { text: isMuted ? '🔔 Unmute Notifications' : '🔕 Mute Notifications', callback_data: 'set_mute_status' }
            ],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
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

// Set mute status directly
bot.action('set_mute_status', async (ctx) => {
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
        console.error('Set mute status error:', error);
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
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
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
// ADMIN FEATURES - MANAGE TASKS
// ==========================================

bot.action('admin_manage_tasks', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const tasks = config?.tasks || [];
        
        let text = '<b>📝 Manage Tasks</b>\n\n';
        
        if (tasks.length === 0) {
            text += 'No tasks created yet.\n';
        } else {
            tasks.forEach((task, index) => {
                text += `${index + 1}. <b>${task.title}</b>\n`;
                text += `   💰 Bonus: ${formatCurrency(task.bonus)}\n`;
                text += `   📸 Screenshots: ${task.screenshotCount || 0}\n\n`;
            });
        }
        
        text += '\nSelect an option:';
        
        const keyboard = [
            tasks.length > 0 ? [{ text: '✏️ Edit Task', callback_data: 'admin_edit_task_select' }] : [],
            tasks.length > 0 ? [{ text: '🗑️ Delete Task', callback_data: 'admin_delete_task_select' }] : [],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ].filter(row => row.length > 0);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'HTML'
        });
    } catch (error) {
        console.error('Manage tasks menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Edit task select
bot.action('admin_edit_task_select', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const tasks = config?.tasks || [];
        
        let text = '<b>✏️ Edit Task</b>\n\nSelect a task to edit:';
        const keyboard = [];
        
        tasks.forEach((task, index) => {
            keyboard.push([{ 
                text: `${index + 1}. ${task.title}`, 
                callback_data: `edit_task_${task.id}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back', callback_data: 'admin_manage_tasks' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Edit task select error:', error);
        await ctx.answerCbQuery('❌ Failed to load tasks');
    }
});

bot.action(/^edit_task_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const config = await db.collection('admin').findOne({ type: 'config' });
        const tasks = config?.tasks || [];
        const task = tasks.find(t => t.id === taskId);
        
        if (!task) {
            await ctx.answerCbQuery('❌ Task not found');
            return;
        }
        
        ctx.session.editingTask = task;
        
        let text = `<b>✏️ Edit Task</b>\n\n`;
        text += `<b>Title:</b> ${task.title}\n`;
        text += `<b>Bonus:</b> ${formatCurrency(task.bonus)}\n`;
        text += `<b>Description:</b>\n${task.description}\n`;
        text += `<b>Screenshots Required:</b> ${task.screenshotCount || 0}\n`;
        if (task.screenshotNames && task.screenshotNames.length > 0) {
            text += `<b>Screenshot Names:</b>\n`;
            task.screenshotNames.forEach((name, index) => {
                text += `  ${index + 1}. ${name}\n`;
            });
        }
        
        const keyboard = [
            [{ text: '✏️ Edit Title', callback_data: 'edit_task_title' }],
            [{ text: '✏️ Edit Description', callback_data: 'edit_task_description' }],
            [{ text: '✏️ Edit Bonus', callback_data: 'edit_task_bonus' }],
            [{ text: '✏️ Edit Images', callback_data: 'edit_task_images' }],
            [{ text: '✏️ Edit Screenshot Settings', callback_data: 'edit_task_screenshots' }],
            [{ text: '🔙 Back', callback_data: 'admin_edit_task_select' }]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Edit task error:', error);
        await ctx.answerCbQuery('❌ Error loading task');
    }
});

// Edit task properties
bot.action('edit_task_title', async (ctx) => {
    try {
        if (!ctx.session.editingTask) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        await safeSendMessage(ctx, 'Enter new task title:\n\nType "cancel" to cancel.');
        
        ctx.session.editingTaskProperty = 'title';
    } catch (error) {
        console.error('Edit task title error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('edit_task_description', async (ctx) => {
    try {
        if (!ctx.session.editingTask) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        await safeSendMessage(ctx, 'Enter new task description:\n\nType "cancel" to cancel.');
        
        ctx.session.editingTaskProperty = 'description';
    } catch (error) {
        console.error('Edit task description error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('edit_task_bonus', async (ctx) => {
    try {
        if (!ctx.session.editingTask) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        await safeSendMessage(ctx, 'Enter new task bonus amount:\n\nType "cancel" to cancel.');
        
        ctx.session.editingTaskProperty = 'bonus';
    } catch (error) {
        console.error('Edit task bonus error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Handle task property edits
bot.on('text', async (ctx) => {
    try {
        if (ctx.session?.editingTask && ctx.session?.editingTaskProperty && !ctx.message.text?.startsWith('/')) {
            
            if (ctx.message.text.toLowerCase() === 'cancel') {
                await safeSendMessage(ctx, '❌ Edit cancelled.');
                delete ctx.session.editingTaskProperty;
                return;
            }
            
            const task = ctx.session.editingTask;
            const property = ctx.session.editingTaskProperty;
            
            if (property === 'title') {
                task.title = ctx.message.text;
            } else if (property === 'description') {
                task.description = ctx.message.text;
            } else if (property === 'bonus') {
                const bonus = parseFloat(ctx.message.text);
                if (isNaN(bonus) || bonus < 0) {
                    await safeSendMessage(ctx, '❌ Please enter a valid amount.');
                    return;
                }
                task.bonus = bonus;
            }
            
            // Update in database
            await db.collection('admin').updateOne(
                { type: 'config', 'tasks.id': task.id },
                { $set: { [`tasks.$.${property}`]: task[property] } }
            );
            
            await safeSendMessage(ctx, `✅ Task ${property} updated!`);
            
            delete ctx.session.editingTaskProperty;
            
            setTimeout(async () => {
                await bot.action(`edit_task_${task.id}`)(ctx);
            }, 1000);
        }
    } catch (error) {
        console.error('Handle task edit error:', error);
        await safeSendMessage(ctx, '❌ Failed to update task.');
    }
});

// Delete task select
bot.action('admin_delete_task_select', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const tasks = config?.tasks || [];
        
        let text = '<b>🗑️ Delete Task</b>\n\nSelect a task to delete:';
        const keyboard = [];
        
        tasks.forEach((task, index) => {
            keyboard.push([{ 
                text: `${index + 1}. ${task.title}`, 
                callback_data: `delete_task_${task.id}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back', callback_data: 'admin_manage_tasks' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Delete task select error:', error);
        await ctx.answerCbQuery('❌ Failed to load tasks');
    }
});

bot.action(/^delete_task_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        
        // Remove from database
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $pull: { tasks: { id: taskId } } }
        );
        
        await ctx.answerCbQuery('✅ Task deleted');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Delete task error:', error);
        await ctx.answerCbQuery('❌ Failed to delete task');
    }
});

// ==========================================
// ADMIN FEATURES - ADD TASKS
// ==========================================

bot.action('admin_add_tasks', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await safeSendMessage(ctx, '📝 <b>Add New Task</b>\n\nSend up to 3 images for the task (send them one by one):\n\nType "skip" to skip images or "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    
    ctx.session.addingTask = {
        step: 'images',
        images: [],
        screenshotCount: 0,
        screenshotNames: []
    };
    
    await ctx.scene.enter('admin_add_task_scene');
});

scenes.adminAddTask.on(['photo', 'text'], async (ctx) => {
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
            if (ctx.message.text?.toLowerCase() === 'skip') {
                ctx.session.addingTask.step = 'title';
                await safeSendMessage(ctx, 'Enter task title:');
                return;
            }
            
            if (ctx.message.photo) {
                if (ctx.session.addingTask.images.length >= 3) {
                    await safeSendMessage(ctx, '❌ Maximum 3 images allowed. Moving to next step.');
                    ctx.session.addingTask.step = 'title';
                    await safeSendMessage(ctx, 'Enter task title:');
                    return;
                }
                
                const photo = ctx.message.photo[ctx.message.photo.length - 1];
                const fileLink = await ctx.telegram.getFileLink(photo.file_id);
                
                ctx.session.addingTask.images.push(fileLink.href);
                
                const remaining = 3 - ctx.session.addingTask.images.length;
                if (remaining > 0) {
                    await safeSendMessage(ctx, `✅ Image added (${ctx.session.addingTask.images.length}/3). Send another image or type "skip" to continue.`);
                } else {
                    await safeSendMessage(ctx, '✅ All 3 images added. Moving to next step.');
                    ctx.session.addingTask.step = 'title';
                    await safeSendMessage(ctx, 'Enter task title:');
                }
            } else if (ctx.message.text) {
                await safeSendMessage(ctx, '❌ Please send an image or type "skip".');
            }
            
        } else if (step === 'title') {
            ctx.session.addingTask.title = ctx.message.text;
            ctx.session.addingTask.step = 'description';
            await safeSendMessage(ctx, 'Enter task description:');
            
        } else if (step === 'description') {
            ctx.session.addingTask.description = ctx.message.text;
            ctx.session.addingTask.step = 'screenshot_count';
            await safeSendMessage(ctx, 'Enter number of screenshots required (0-10):');
            
        } else if (step === 'screenshot_count') {
            const count = parseInt(ctx.message.text);
            if (isNaN(count) || count < 0 || count > 10) {
                await safeSendMessage(ctx, '❌ Please enter a number between 0 and 10.');
                return;
            }
            
            ctx.session.addingTask.screenshotCount = count;
            
            if (count > 0) {
                ctx.session.addingTask.step = 'screenshot_names';
                ctx.session.addingTask.currentScreenshot = 0;
                await safeSendMessage(ctx, `Enter name for screenshot 1 (e.g., "Upload SS 1"):`);
            } else {
                ctx.session.addingTask.step = 'bonus';
                await safeSendMessage(ctx, 'Enter task bonus amount:');
            }
            
        } else if (step === 'screenshot_names') {
            const current = ctx.session.addingTask.currentScreenshot;
            const total = ctx.session.addingTask.screenshotCount;
            
            ctx.session.addingTask.screenshotNames[current] = ctx.message.text;
            ctx.session.addingTask.currentScreenshot = current + 1;
            
            if (current + 1 < total) {
                await safeSendMessage(ctx, `Enter name for screenshot ${current + 2}:`);
            } else {
                ctx.session.addingTask.step = 'bonus';
                await safeSendMessage(ctx, 'Enter task bonus amount:');
            }
            
        } else if (step === 'bonus') {
            const bonus = parseFloat(ctx.message.text);
            if (isNaN(bonus) || bonus < 0) {
                await safeSendMessage(ctx, '❌ Please enter a valid amount.');
                return;
            }
            
            ctx.session.addingTask.bonus = bonus;
            
            // Create task object
            const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            const task = {
                id: taskId,
                title: ctx.session.addingTask.title,
                description: ctx.session.addingTask.description,
                images: ctx.session.addingTask.images,
                screenshotCount: ctx.session.addingTask.screenshotCount,
                screenshotNames: ctx.session.addingTask.screenshotNames,
                bonus: bonus,
                createdAt: new Date(),
                createdBy: ctx.from.id
            };
            
            // Save to database
            await db.collection('admin').updateOne(
                { type: 'config' },
                { $push: { tasks: task } }
            );
            
            let message = `✅ <b>Task Created Successfully!</b>\n\n`;
            message += `<b>Title:</b> ${task.title}\n`;
            message += `<b>Bonus:</b> ${formatCurrency(task.bonus)}\n`;
            message += `<b>Screenshots Required:</b> ${task.screenshotCount}\n`;
            message += `<b>Images:</b> ${task.images.length}\n\n`;
            message += `Task ID: <code>${taskId}</code>`;
            
            await safeSendMessage(ctx, message, {
                parse_mode: 'HTML'
            });
            
            delete ctx.session.addingTask;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
        }
    } catch (error) {
        console.error('Add task error:', error);
        await safeSendMessage(ctx, '❌ Error creating task.');
        delete ctx.session.addingTask;
        await ctx.scene.leave();
    }
});

// ==========================================
// ADMIN FEATURES - TASK HISTORY
// ==========================================

bot.action('admin_task_history', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await showTaskHistory(ctx, 1);
});

async function showTaskHistory(ctx, page = 1) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const taskHistory = config?.taskHistory || [];
        
        const limit = 10;
        const totalPages = Math.ceil(taskHistory.length / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const pageHistory = taskHistory.slice(startIndex, endIndex);
        
        let text = `<b>📋 Task History</b>\n\n`;
        text += `Total Submissions: ${taskHistory.length}\n`;
        text += `Page ${page} of ${totalPages}\n\n`;
        
        if (taskHistory.length === 0) {
            text += `No task submissions yet.\n`;
        } else {
            pageHistory.forEach((submission, index) => {
                const globalIndex = startIndex + index + 1;
                const status = submission.status === 'approved' ? '✅' : submission.status === 'rejected' ? '❌' : '⏳';
                text += `${globalIndex}. ${status} <b>${submission.taskTitle}</b>\n`;
                text += `   👤 User: ${submission.userInfo?.username ? `@${submission.userInfo.username}` : submission.userInfo?.firstName || 'Unknown'}\n`;
                text += `   🆔 ID: <code>${submission.id}</code>\n`;
                text += `   💰 Bonus: ${formatCurrency(submission.bonus)}\n`;
                text += `   📅 Submitted: ${formatDate(submission.submittedAt)}\n\n`;
            });
        }
        
        const keyboard = [];
        
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
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Show task history error:', error);
        await safeSendMessage(ctx, '❌ Error loading task history.');
    }
}

bot.action(/^task_history_page_(\d+)$/, async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    const page = parseInt(ctx.match[1]);
    await showTaskHistory(ctx, page);
});

// ==========================================
// ADMIN FEATURES - TASK REQUESTS
// ==========================================

bot.action('admin_task_requests', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await showTaskRequests(ctx, 1);
});

async function showTaskRequests(ctx, page = 1) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const taskHistory = config?.taskHistory || [];
        const pendingRequests = taskHistory.filter(sub => sub.status === 'pending');
        
        const limit = 10;
        const totalPages = Math.ceil(pendingRequests.length / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const pageRequests = pendingRequests.slice(startIndex, endIndex);
        
        let text = `<b>📝 Task Requests</b>\n\n`;
        text += `Pending Requests: ${pendingRequests.length}\n`;
        text += `Page ${page} of ${totalPages}\n\n`;
        
        if (pendingRequests.length === 0) {
            text += `No pending task requests.\n`;
        } else {
            pageRequests.forEach((request, index) => {
                const globalIndex = startIndex + index + 1;
                text += `${globalIndex}. <b>${request.taskTitle}</b>\n`;
                text += `   👤 User: ${request.userInfo?.username ? `@${request.userInfo.username}` : request.userInfo?.firstName || 'Unknown'}\n`;
                text += `   🆔 ID: <code>${request.id}</code>\n`;
                text += `   💰 Bonus: ${formatCurrency(request.bonus)}\n`;
                text += `   📅 Submitted: ${formatDate(request.submittedAt)}\n\n`;
            });
        }
        
        const keyboard = [];
        
        pageRequests.forEach((request, index) => {
            const globalIndex = startIndex + index + 1;
            keyboard.push([{ 
                text: `${globalIndex}. Review ${request.taskTitle}`, 
                callback_data: `review_task_${request.id}` 
            }]);
        });
        
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
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Show task requests error:', error);
        await safeSendMessage(ctx, '❌ Error loading task requests.');
    }
}

bot.action(/^review_task_(.+)$/, async (ctx) => {
    try {
        const submissionId = ctx.match[1];
        const config = await db.collection('admin').findOne({ type: 'config' });
        const taskHistory = config?.taskHistory || [];
        const submission = taskHistory.find(sub => sub.id === submissionId);
        
        if (!submission) {
            await ctx.answerCbQuery('❌ Submission not found');
            return;
        }
        
        ctx.session.reviewingTask = submission;
        
        let text = `<b>📝 Review Task Submission</b>\n\n`;
        text += `<b>Task:</b> ${submission.taskTitle}\n`;
        text += `<b>User:</b> ${submission.userInfo?.username ? `@${submission.userInfo.username}` : submission.userInfo?.firstName || 'Unknown'}\n`;
        text += `<b>User ID:</b> <code>${submission.userId}</code>\n`;
        text += `<b>Submission ID:</b> <code>${submission.id}</code>\n`;
        text += `<b>Bonus:</b> ${formatCurrency(submission.bonus)}\n`;
        text += `<b>Submitted:</b> ${formatDate(submission.submittedAt)}\n\n`;
        text += `<b>Screenshots:</b> ${submission.screenshots?.length || 0}\n`;
        
        const keyboard = [
            [{ text: '✅ Approve', callback_data: `approve_task_${submissionId}` }, { text: '❌ Reject', callback_data: `reject_task_${submissionId}` }],
            [{ text: '👀 View Screenshots', callback_data: `view_screenshots_${submissionId}` }],
            [{ text: '🔙 Back to Requests', callback_data: 'admin_task_requests' }]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Review task error:', error);
        await ctx.answerCbQuery('❌ Error loading submission');
    }
});

bot.action(/^view_screenshots_(.+)$/, async (ctx) => {
    try {
        const submissionId = ctx.match[1];
        const config = await db.collection('admin').findOne({ type: 'config' });
        const taskHistory = config?.taskHistory || [];
        const submission = taskHistory.find(sub => sub.id === submissionId);
        
        if (!submission || !submission.screenshots || submission.screenshots.length === 0) {
            await ctx.answerCbQuery('❌ No screenshots available');
            return;
        }
        
        // Send first screenshot
        await ctx.replyWithPhoto(submission.screenshots[0], {
            caption: `Screenshot 1 of ${submission.screenshots.length}\n\nUse buttons to navigate.`,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '◀️ Previous', callback_data: `screenshot_nav_${submissionId}_0_prev` },
                        { text: '1', callback_data: 'no_action' },
                        { text: 'Next ▶️', callback_data: `screenshot_nav_${submissionId}_0_next` }
                    ],
                    [{ text: '🔙 Back to Review', callback_data: `review_task_${submissionId}` }]
                ]
            }
        });
        
        ctx.session.viewingScreenshots = {
            submissionId: submissionId,
            currentIndex: 0,
            total: submission.screenshots.length
        };
    } catch (error) {
        console.error('View screenshots error:', error);
        await ctx.answerCbQuery('❌ Error loading screenshots');
    }
});

bot.action(/^screenshot_nav_(.+)_(\d+)_(prev|next)$/, async (ctx) => {
    try {
        const submissionId = ctx.match[1];
        const currentIndex = parseInt(ctx.match[2]);
        const direction = ctx.match[3];
        
        const config = await db.collection('admin').findOne({ type: 'config' });
        const taskHistory = config?.taskHistory || [];
        const submission = taskHistory.find(sub => sub.id === submissionId);
        
        if (!submission || !submission.screenshots) {
            await ctx.answerCbQuery('❌ Screenshots not found');
            return;
        }
        
        let newIndex;
        if (direction === 'prev') {
            newIndex = currentIndex > 0 ? currentIndex - 1 : submission.screenshots.length - 1;
        } else {
            newIndex = currentIndex < submission.screenshots.length - 1 ? currentIndex + 1 : 0;
        }
        
        await ctx.editMessageMedia({
            type: 'photo',
            media: submission.screenshots[newIndex],
            caption: `Screenshot ${newIndex + 1} of ${submission.screenshots.length}\n\nUse buttons to navigate.`
        }, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '◀️ Previous', callback_data: `screenshot_nav_${submissionId}_${newIndex}_prev` },
                        { text: `${newIndex + 1}`, callback_data: 'no_action' },
                        { text: 'Next ▶️', callback_data: `screenshot_nav_${submissionId}_${newIndex}_next` }
                    ],
                    [{ text: '🔙 Back to Review', callback_data: `review_task_${submissionId}` }]
                ]
            }
        });
        
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Screenshot navigation error:', error);
        await ctx.answerCbQuery('❌ Error navigating');
    }
});

bot.action(/^approve_task_(.+)$/, async (ctx) => {
    try {
        const submissionId = ctx.match[1];
        const config = await db.collection('admin').findOne({ type: 'config' });
        const taskHistory = config?.taskHistory || [];
        const submissionIndex = taskHistory.findIndex(sub => sub.id === submissionId);
        
        if (submissionIndex === -1) {
            await ctx.answerCbQuery('❌ Submission not found');
            return;
        }
        
        const submission = taskHistory[submissionIndex];
        
        // Update submission status
        taskHistory[submissionIndex].status = 'approved';
        taskHistory[submissionIndex].reviewedAt = new Date();
        taskHistory[submissionIndex].reviewedBy = ctx.from.id;
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { taskHistory: taskHistory } }
        );
        
        // Add bonus to user
        await db.collection('users').updateOne(
            { userId: submission.userId },
            { 
                $inc: { balance: submission.bonus },
                $push: { 
                    transactions: {
                        type: 'task',
                        amount: submission.bonus,
                        description: `Task completed: ${submission.taskTitle}`,
                        date: new Date()
                    }
                }
            }
        );
        
        // Update user's task history
        await db.collection('users').updateOne(
            { userId: submission.userId, 'taskHistory.id': submissionId },
            { $set: { 'taskHistory.$.status': 'approved', 'taskHistory.$.reviewedAt': new Date() } }
        );
        
        // Notify user
        try {
            await bot.telegram.sendMessage(
                submission.userId,
                `✅ <b>Task Approved!</b>\n\n` +
                `Your task "<b>${submission.taskTitle}</b>" has been approved!\n` +
                `💰 Bonus: ${formatCurrency(submission.bonus)} has been added to your balance.\n\n` +
                `Thank you for completing the task!`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('Failed to notify user:', error);
        }
        
        await ctx.answerCbQuery('✅ Task approved and bonus sent!');
        await showTaskRequests(ctx, 1);
        
    } catch (error) {
        console.error('Approve task error:', error);
        await ctx.answerCbQuery('❌ Failed to approve task');
    }
});

bot.action(/^reject_task_(.+)$/, async (ctx) => {
    try {
        const submissionId = ctx.match[1];
        
        await safeSendMessage(ctx, 'Enter rejection reason:\n\nType "cancel" to cancel.');
        
        ctx.session.rejectingTask = {
            submissionId: submissionId
        };
    } catch (error) {
        console.error('Reject task error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Handle task rejection
bot.on('text', async (ctx) => {
    try {
        if (ctx.session?.rejectingTask && !ctx.message.text?.startsWith('/')) {
            
            const { submissionId } = ctx.session.rejectingTask;
            
            if (ctx.message.text.toLowerCase() === 'cancel') {
                await safeSendMessage(ctx, '❌ Rejection cancelled.');
                delete ctx.session.rejectingTask;
                return;
            }
            
            const reason = ctx.message.text;
            const config = await db.collection('admin').findOne({ type: 'config' });
            const taskHistory = config?.taskHistory || [];
            const submissionIndex = taskHistory.findIndex(sub => sub.id === submissionId);
            
            if (submissionIndex === -1) {
                await safeSendMessage(ctx, '❌ Submission not found.');
                delete ctx.session.rejectingTask;
                return;
            }
            
            const submission = taskHistory[submissionIndex];
            
            // Update submission status
            taskHistory[submissionIndex].status = 'rejected';
            taskHistory[submissionIndex].reviewedAt = new Date();
            taskHistory[submissionIndex].reviewedBy = ctx.from.id;
            taskHistory[submissionIndex].rejectionReason = reason;
            
            await db.collection('admin').updateOne(
                { type: 'config' },
                { $set: { taskHistory: taskHistory } }
            );
            
            // Update user's task history
            await db.collection('users').updateOne(
                { userId: submission.userId, 'taskHistory.id': submissionId },
                { 
                    $set: { 
                        'taskHistory.$.status': 'rejected',
                        'taskHistory.$.reviewedAt': new Date(),
                        'taskHistory.$.rejectionReason': reason
                    } 
                }
            );
            
            // Notify user
            try {
                await bot.telegram.sendMessage(
                    submission.userId,
                    `❌ <b>Task Rejected</b>\n\n` +
                    `Your task "<b>${submission.taskTitle}</b>" has been rejected.\n` +
                    `📝 Reason: ${reason}\n\n` +
                    `Please check the requirements and submit again.`,
                    { parse_mode: 'HTML' }
                );
            } catch (error) {
                console.error('Failed to notify user:', error);
            }
            
            await safeSendMessage(ctx, '✅ Task rejected and user notified.');
            
            delete ctx.session.rejectingTask;
            
            setTimeout(async () => {
                await showTaskRequests(ctx, 1);
            }, 1000);
        }
    } catch (error) {
        console.error('Handle task rejection error:', error);
        await safeSendMessage(ctx, '❌ Failed to reject task.');
    }
});

bot.action(/^task_requests_page_(\d+)$/, async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    const page = parseInt(ctx.match[1]);
    await showTaskRequests(ctx, page);
});

// ==========================================
// ADMIN FEATURES - WITHDRAWAL REQUESTS
// ==========================================

bot.action('admin_withdrawal_requests', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await showWithdrawalRequests(ctx, 1);
});

async function showWithdrawalRequests(ctx, page = 1) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const withdrawalHistory = config?.withdrawalHistory || [];
        const pendingRequests = withdrawalHistory.filter(w => w.status === 'pending');
        
        const limit = 10;
        const totalPages = Math.ceil(pendingRequests.length / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const pageRequests = pendingRequests.slice(startIndex, endIndex);
        
        let text = `<b>💸 Withdrawal Requests</b>\n\n`;
        text += `Pending Requests: ${pendingRequests.length}\n`;
        text += `Page ${page} of ${totalPages}\n\n`;
        
        if (pendingRequests.length === 0) {
            text += `No pending withdrawal requests.\n`;
        } else {
            pageRequests.forEach((request, index) => {
                const globalIndex = startIndex + index + 1;
                text += `${globalIndex}. <b>${formatCurrency(request.amount)}</b>\n`;
                text += `   👤 User: ${request.userInfo?.username ? `@${request.userInfo.username}` : request.userInfo?.firstName || 'Unknown'}\n`;
                text += `   🆔 ID: <code>${request.id}</code>\n`;
                text += `   💳 Wallet: <code>${request.wallet}</code>\n`;
                text += `   📅 Requested: ${formatDate(request.createdAt)}\n\n`;
            });
        }
        
        const keyboard = [];
        
        // Add search button
        keyboard.push([{ text: '🔍 Search Withdrawals', callback_data: 'admin_search_withdrawals' }]);
        
        pageRequests.forEach((request, index) => {
            const globalIndex = startIndex + index + 1;
            keyboard.push([{ 
                text: `${globalIndex}. Process ${request.id}`, 
                callback_data: `process_withdrawal_${request.id}` 
            }]);
        });
        
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
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Show withdrawal requests error:', error);
        await safeSendMessage(ctx, '❌ Error loading withdrawal requests.');
    }
});

bot.action(/^process_withdrawal_(.+)$/, async (ctx) => {
    try {
        const withdrawalId = ctx.match[1];
        const config = await db.collection('admin').findOne({ type: 'config' });
        const withdrawalHistory = config?.withdrawalHistory || [];
        const withdrawal = withdrawalHistory.find(w => w.id === withdrawalId);
        
        if (!withdrawal) {
            await ctx.answerCbQuery('❌ Withdrawal not found');
            return;
        }
        
        ctx.session.processingWithdrawal = withdrawal;
        
        let text = `<b>💸 Process Withdrawal</b>\n\n`;
        text += `<b>Amount:</b> ${formatCurrency(withdrawal.amount)}\n`;
        text += `<b>User:</b> ${withdrawal.userInfo?.username ? `@${withdrawal.userInfo.username}` : withdrawal.userInfo?.firstName || 'Unknown'}\n`;
        text += `<b>User ID:</b> <code>${withdrawal.userId}</code>\n`;
        text += `<b>Withdrawal ID:</b> <code>${withdrawal.id}</code>\n`;
        text += `<b>Wallet:</b> <code>${withdrawal.wallet}</code>\n`;
        text += `<b>Requested:</b> ${formatDate(withdrawal.createdAt)}\n\n`;
        text += `Select an option:`;
        
        const keyboard = [
            [{ text: '✅ Approve & Send', callback_data: `approve_withdrawal_${withdrawalId}` }, { text: '❌ Reject & Refund', callback_data: `reject_withdrawal_${withdrawalId}` }],
            [{ text: '🔙 Back to Requests', callback_data: 'admin_withdrawal_requests' }]
        ];
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Process withdrawal error:', error);
        await ctx.answerCbQuery('❌ Error loading withdrawal');
    }
});

// Approve withdrawal
bot.action(/^approve_withdrawal_(.+)$/, async (ctx) => {
    try {
        const withdrawalId = ctx.match[1];
        const config = await db.collection('admin').findOne({ type: 'config' });
        const withdrawalHistory = config?.withdrawalHistory || [];
        const withdrawalIndex = withdrawalHistory.findIndex(w => w.id === withdrawalId);
        
        if (withdrawalIndex === -1) {
            await ctx.answerCbQuery('❌ Withdrawal not found');
            return;
        }
        
        const withdrawal = withdrawalHistory[withdrawalIndex];
        
        // Generate UTR
        const utr = `UTR${Date.now()}${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
        
        // Update withdrawal status
        withdrawalHistory[withdrawalIndex].status = 'approved';
        withdrawalHistory[withdrawalIndex].processedAt = new Date();
        withdrawalHistory[withdrawalIndex].processedBy = ctx.from.id;
        withdrawalHistory[withdrawalIndex].utr = utr;
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { withdrawalHistory: withdrawalHistory } }
        );
        
        // Update user's withdrawal history
        await db.collection('users').updateOne(
            { userId: withdrawal.userId, 'withdrawalHistory.id': withdrawalId },
            { 
                $set: { 
                    'withdrawalHistory.$.status': 'approved',
                    'withdrawalHistory.$.processedAt': new Date(),
                    'withdrawalHistory.$.utr': utr
                } 
            }
        );
        
        // Notify user
        try {
            await bot.telegram.sendMessage(
                withdrawal.userId,
                `✅ <b>Withdrawal Approved!</b>\n\n` +
                `Your withdrawal request has been approved and processed.\n` +
                `💰 Amount: ${formatCurrency(withdrawal.amount)}\n` +
                `💳 Wallet: ${withdrawal.wallet}\n` +
                `📄 UTR: <code>${utr}</code>\n` +
                `🆔 Withdrawal ID: <code>${withdrawal.id}</code>\n\n` +
                `The amount has been sent to your wallet.`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('Failed to notify user:', error);
        }
        
        await ctx.answerCbQuery('✅ Withdrawal approved and UTR sent!');
        await showWithdrawalRequests(ctx, 1);
        
    } catch (error) {
        console.error('Approve withdrawal error:', error);
        await ctx.answerCbQuery('❌ Failed to approve withdrawal');
    }
});

// Reject withdrawal
bot.action(/^reject_withdrawal_(.+)$/, async (ctx) => {
    try {
        const withdrawalId = ctx.match[1];
        
        await safeSendMessage(ctx, 'Enter rejection reason:\n\nType "cancel" to cancel.');
        
        ctx.session.rejectingWithdrawal = {
            withdrawalId: withdrawalId
        };
    } catch (error) {
        console.error('Reject withdrawal error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Handle withdrawal rejection
bot.on('text', async (ctx) => {
    try {
        if (ctx.session?.rejectingWithdrawal && !ctx.message.text?.startsWith('/')) {
            
            const { withdrawalId } = ctx.session.rejectingWithdrawal;
            
            if (ctx.message.text.toLowerCase() === 'cancel') {
                await safeSendMessage(ctx, '❌ Rejection cancelled.');
                delete ctx.session.rejectingWithdrawal;
                return;
            }
            
            const reason = ctx.message.text;
            const config = await db.collection('admin').findOne({ type: 'config' });
            const withdrawalHistory = config?.withdrawalHistory || [];
            const withdrawalIndex = withdrawalHistory.findIndex(w => w.id === withdrawalId);
            
            if (withdrawalIndex === -1) {
                await safeSendMessage(ctx, '❌ Withdrawal not found.');
                delete ctx.session.rejectingWithdrawal;
                return;
            }
            
            const withdrawal = withdrawalHistory[withdrawalIndex];
            
            // Update withdrawal status
            withdrawalHistory[withdrawalIndex].status = 'rejected';
            withdrawalHistory[withdrawalIndex].processedAt = new Date();
            withdrawalHistory[withdrawalIndex].processedBy = ctx.from.id;
            withdrawalHistory[withdrawalIndex].rejectionReason = reason;
            
            await db.collection('admin').updateOne(
                { type: 'config' },
                { $set: { withdrawalHistory: withdrawalHistory } }
            );
            
            // Refund to user balance
            await db.collection('users').updateOne(
                { userId: withdrawal.userId },
                { 
                    $inc: { balance: withdrawal.amount },
                    $push: { 
                        transactions: {
                            type: 'refund',
                            amount: withdrawal.amount,
                            description: `Withdrawal refund: ${withdrawal.id}`,
                            date: new Date()
                        }
                    }
                }
            );
            
            // Update user's withdrawal history
            await db.collection('users').updateOne(
                { userId: withdrawal.userId, 'withdrawalHistory.id': withdrawalId },
                { 
                    $set: { 
                        'withdrawalHistory.$.status': 'rejected',
                        'withdrawalHistory.$.processedAt': new Date(),
                        'withdrawalHistory.$.rejectionReason': reason
                    } 
                }
            );
            
            // Notify user
            try {
                await bot.telegram.sendMessage(
                    withdrawal.userId,
                    `❌ <b>Withdrawal Rejected</b>\n\n` +
                    `Your withdrawal request has been rejected.\n` +
                    `💰 Amount: ${formatCurrency(withdrawal.amount)}\n` +
                    `📝 Reason: ${reason}\n\n` +
                    `The amount has been refunded to your balance.`,
                    { parse_mode: 'HTML' }
                );
            } catch (error) {
                console.error('Failed to notify user:', error);
            }
            
            await safeSendMessage(ctx, '✅ Withdrawal rejected and amount refunded.');
            
            delete ctx.session.rejectingWithdrawal;
            
            setTimeout(async () => {
                await showWithdrawalRequests(ctx, 1);
            }, 1000);
        }
    } catch (error) {
        console.error('Handle withdrawal rejection error:', error);
        await safeSendMessage(ctx, '❌ Failed to reject withdrawal.');
    }
});

bot.action(/^withdrawal_requests_page_(\d+)$/, async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    const page = parseInt(ctx.match[1]);
    await showWithdrawalRequests(ctx, page);
});

// ==========================================
// ADMIN FEATURES - WITHDRAWAL HISTORY
// ==========================================

bot.action('admin_withdrawal_history', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await showWithdrawalHistory(ctx, 1);
});

async function showWithdrawalHistory(ctx, page = 1) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const withdrawalHistory = config?.withdrawalHistory || [];
        
        const limit = 10;
        const totalPages = Math.ceil(withdrawalHistory.length / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const pageHistory = withdrawalHistory.slice(startIndex, endIndex);
        
        let text = `<b>📊 Withdrawal History</b>\n\n`;
        text += `Total Withdrawals: ${withdrawalHistory.length}\n`;
        text += `Page ${page} of ${totalPages}\n\n`;
        
        if (withdrawalHistory.length === 0) {
            text += `No withdrawal history.\n`;
        } else {
            pageHistory.forEach((withdrawal, index) => {
                const globalIndex = startIndex + index + 1;
                const status = withdrawal.status === 'approved' ? '✅' : withdrawal.status === 'rejected' ? '❌' : '⏳';
                text += `${globalIndex}. ${status} <b>${formatCurrency(withdrawal.amount)}</b>\n`;
                text += `   👤 User: ${withdrawal.userInfo?.username ? `@${withdrawal.userInfo.username}` : withdrawal.userInfo?.firstName || 'Unknown'}\n`;
                text += `   🆔 ID: <code>${withdrawal.id}</code>\n`;
                if (withdrawal.utr) {
                    text += `   📄 UTR: <code>${withdrawal.utr}</code>\n`;
                }
                text += `   📅 ${withdrawal.status === 'pending' ? 'Requested' : 'Processed'}: ${formatDate(withdrawal.status === 'pending' ? withdrawal.createdAt : withdrawal.processedAt)}\n\n`;
            });
        }
        
        const keyboard = [];
        
        // Add search button
        keyboard.push([{ text: '🔍 Search Withdrawals', callback_data: 'admin_search_withdrawals' }]);
        
        if (totalPages > 1) {
            const navRow = [];
            if (page > 1) {
                navRow.push({ text: '◀️ Previous', callback_data: `withdrawal_history_page_${page - 1}` });
            }
            navRow.push({ text: `📄 ${page}/${totalPages}`, callback_data: 'no_action' });
            if (page < totalPages) {
                navRow.push({ text: 'Next ▶️', callback_data: `withdrawal_history_page_${page + 1}` });
            }
            keyboard.push(navRow);
        }
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Show withdrawal history error:', error);
        await safeSendMessage(ctx, '❌ Error loading withdrawal history.');
    }
}

bot.action(/^withdrawal_history_page_(\d+)$/, async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    const page = parseInt(ctx.match[1]);
    await showWithdrawalHistory(ctx, page);
});

// ==========================================
// ADMIN FEATURES - SEARCH WITHDRAWALS
// ==========================================

bot.action('admin_search_withdrawals', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await safeSendMessage(ctx, '🔍 <b>Search Withdrawals</b>\n\nEnter withdrawal ID, user ID, username, or UTR to search:\n\nType "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    
    await ctx.scene.enter('admin_search_withdrawals_scene');
});

scenes.adminSearchWithdrawals.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Search cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const searchTerm = ctx.message.text.trim();
        const config = await db.collection('admin').findOne({ type: 'config' });
        const withdrawalHistory = config?.withdrawalHistory || [];
        
        // Search in withdrawal history
        const searchRegex = new RegExp(searchTerm, 'i');
        const results = withdrawalHistory.filter(withdrawal => 
            withdrawal.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(withdrawal.userId).includes(searchTerm) ||
            (withdrawal.userInfo?.username && withdrawal.userInfo.username.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (withdrawal.userInfo?.firstName && withdrawal.userInfo.firstName.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (withdrawal.utr && withdrawal.utr.toLowerCase().includes(searchTerm.toLowerCase()))
        ).slice(0, 20);
        
        if (results.length === 0) {
            await safeSendMessage(ctx, '❌ No withdrawals found matching your search.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        let searchResults = `<b>🔍 Search Results</b>\n\n`;
        searchResults += `Found ${results.length} withdrawal(s):\n\n`;
        
        const keyboard = [];
        
        results.forEach((withdrawal, index) => {
            const status = withdrawal.status === 'approved' ? '✅' : withdrawal.status === 'rejected' ? '❌' : '⏳';
            searchResults += `${index + 1}. ${status} ${formatCurrency(withdrawal.amount)}\n`;
            searchResults += `   User: ${withdrawal.userInfo?.username ? `@${withdrawal.userInfo.username}` : withdrawal.userInfo?.firstName || 'Unknown'}\n`;
            searchResults += `   ID: <code>${withdrawal.id}</code>\n`;
            searchResults += `   Status: ${withdrawal.status}\n\n`;
            
            keyboard.push([{ 
                text: `${index + 1}. ${withdrawal.id} - ${formatCurrency(withdrawal.amount)}`, 
                callback_data: `process_withdrawal_${withdrawal.id}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        await safeSendMessage(ctx, searchResults, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
        
        await ctx.scene.leave();
    } catch (error) {
        console.error('Search withdrawals error:', error);
        await safeSendMessage(ctx, '❌ Error searching withdrawals.');
        await ctx.scene.leave();
    }
});

// ==========================================
// CONTACT USER HANDLER
// ==========================================

bot.action(/^contact_user_(\d+)$/, async (ctx) => {
    try {
        const userId = ctx.match[1];
        
        ctx.session.contactUser = {
            userId: userId
        };
        
        await safeSendMessage(ctx, `Now send the message or photo to user ID: <code>${userId}</code>\n\n<i>You can send text, photo with caption, or just photo</i>\n\nType "cancel" to cancel.`, {
            parse_mode: 'HTML'
        });
        await ctx.scene.enter('contact_user_message_scene');
    } catch (error) {
        console.error('Contact user error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

scenes.contactUserMessage.on(['text', 'photo'], async (ctx) => {
    try {
        if (!ctx.session.contactUser) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const targetUserId = ctx.session.contactUser.userId;
        
        if (ctx.message.text?.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Contact cancelled.');
            delete ctx.session.contactUser;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        try {
            if (ctx.message.photo) {
                await ctx.telegram.sendPhoto(
                    targetUserId,
                    ctx.message.photo[ctx.message.photo.length - 1].file_id,
                    {
                        caption: ctx.message.caption || '',
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '📩 Reply to Admin', callback_data: `reply_to_admin_${ctx.from.id}` }
                            ]]
                        }
                    }
                );
            } else if (ctx.message.text) {
                await ctx.telegram.sendMessage(
                    targetUserId,
                    ctx.message.text,
                    {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '📩 Reply to Admin', callback_data: `reply_to_admin_${ctx.from.id}` }
                            ]]
                        }
                    }
                );
            }
            
            await safeSendMessage(ctx, `✅ Message sent to user ID: <code>${targetUserId}</code>`, {
                parse_mode: 'HTML'
            });
            
            const senderId = ctx.from.id;
            const config = await db.collection('admin').findOne({ type: 'config' });
            const allAdmins = config?.admins || ADMIN_IDS;
            const mutedAdmins = config?.mutedAdmins || [];
            
            const otherAdmins = allAdmins.filter(adminId => 
                adminId !== senderId && !mutedAdmins.includes(adminId)
            );
            
            if (otherAdmins.length > 0) {
                const notification = `📨 <b>Admin Contacted User</b>\n\n👤 Admin: <code>${senderId}</code>\n👤 User: <code>${targetUserId}</code>\n📄 Message: ${ctx.message.text ? 'Text' : 'Photo'}`;
                
                const notifyPromises = otherAdmins.map(async (adminId) => {
                    try {
                        await bot.telegram.sendMessage(adminId, notification, { parse_mode: 'HTML' });
                    } catch (error) {
                        console.error(`Failed to notify admin ${adminId}:`, error.message);
                    }
                });
                
                await Promise.allSettled(notifyPromises);
            }
            
        } catch (error) {
            await safeSendMessage(ctx, `❌ Failed to send message: ${error.message}`);
        }
        
        delete ctx.session.contactUser;
        
    } catch (error) {
        console.error('Contact user message error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
    
    await ctx.scene.leave();
    await showAdminPanel(ctx);
});

// Handle reply to admin
bot.action(/^reply_to_admin_(.+)$/, async (ctx) => {
    try {
        const adminId = ctx.match[1];
        
        ctx.session.replyToAdmin = {
            adminId: adminId
        };
        
        await safeSendMessage(ctx, 'Type your reply to the admin:\n\n<i>You can send text or photo with caption</i>\n\nType "cancel" to cancel.', {
            parse_mode: 'HTML'
        });
    } catch (error) {
        console.error('Reply to admin error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Handle reply from user
bot.on('message', async (ctx) => {
    try {
        if (ctx.session?.replyToAdmin && !ctx.message.text?.startsWith('/')) {
            const { adminId } = ctx.session.replyToAdmin;
            
            if (ctx.message.text?.toLowerCase() === 'cancel') {
                await safeSendMessage(ctx, '❌ Reply cancelled.');
                delete ctx.session.replyToAdmin;
                return;
            }
            
            let message = `📨 <b>Reply from User</b>\n\n`;
            message += `👤 User: ${ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || 'Unknown'}\n`;
            message += `🆔 User ID: <code>${ctx.from.id}</code>\n\n`;
            message += `💬 Message:\n`;
            
            try {
                if (ctx.message.photo) {
                    await ctx.telegram.sendPhoto(
                        adminId,
                        ctx.message.photo[ctx.message.photo.length - 1].file_id,
                        {
                            caption: message + (ctx.message.caption || 'Photo'),
                            parse_mode: 'HTML'
                        }
                    );
                } else if (ctx.message.text) {
                    await ctx.telegram.sendMessage(
                        adminId,
                        message + ctx.message.text,
                        { parse_mode: 'HTML' }
                    );
                }
                
                await safeSendMessage(ctx, '✅ Your reply has been sent to the admin.');
                
            } catch (error) {
                await safeSendMessage(ctx, '❌ Failed to send reply. The admin may have blocked the bot.');
            }
            
            delete ctx.session.replyToAdmin;
        }
    } catch (error) {
        console.error('Handle reply error:', error);
        await safeSendMessage(ctx, '❌ Error sending reply.');
    }
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

// Global error protection
let errorCount = 0;
const MAX_ERRORS_BEFORE_RESTART = 10;
const ERROR_RESET_INTERVAL = 60000;

const originalErrorHandler = bot.catch;
bot.catch = (error, ctx) => {
    errorCount++;
    console.error(`🔴 Global Error #${errorCount}:`, error.message);
    
    setTimeout(() => {
        if (errorCount > 0) errorCount--;
    }, ERROR_RESET_INTERVAL);
    
    if (errorCount >= MAX_ERRORS_BEFORE_RESTART) {
        console.error('🚨 CRITICAL: Too many errors, bot may be stuck');
        
        notifyAdmin(`🚨 <b>Bot Error Alert</b>\n\nToo many errors detected (${errorCount}).\nBot may be stuck in error loop.\n\nUse /reseterrors to clear errors or restart the bot.`);
    }
    
    if (originalErrorHandler) {
        originalErrorHandler(error, ctx);
    }
};

// Reset error count on successful admin command
const originalIsAdmin = isAdmin;
isAdmin = async (userId) => {
    const result = await originalIsAdmin(userId);
    if (result) {
        errorCount = 0;
    }
    return result;
};

// Admin error reset command
bot.command('reseterrors', async (ctx) => {
    try {
        if (!await isAdmin(ctx.from.id)) {
            return safeSendMessage(ctx, '❌ You are not authorized to use this command.');
        }
        
        errorCooldowns.clear();
        
        if (ctx.session) {
            delete ctx.session.lastError;
            delete ctx.session.contactUser;
            delete ctx.session.replyToAdmin;
            delete ctx.session.editChannel;
            delete ctx.session.reorderChannels;
            delete ctx.session.uploadingImageType;
            delete ctx.session.uploadingImage;
            delete ctx.session.editingDisabledMessage;
            delete ctx.session.addingBalance;
            delete ctx.session.editingBonusAmount;
            delete ctx.session.editingBonusImage;
            delete ctx.session.changingAdminCode;
            delete ctx.session.editingReferReward;
            delete ctx.session.editingReferRange;
            delete ctx.session.editingTask;
            delete ctx.session.editingTaskProperty;
            delete ctx.session.addingTask;
            delete ctx.session.reviewingTask;
            delete ctx.session.viewingScreenshots;
            delete ctx.session.processingWithdrawal;
            delete ctx.session.rejectingWithdrawal;
            delete ctx.session.channelLevelEditing;
            delete ctx.session.editingGiftCode;
            delete ctx.session.editingGiftCodeProperty;
            delete ctx.session.editingGiftCodeStep;
        }
        
        await safeSendMessage(ctx, '✅ All error cooldowns and sessions have been reset!\n\nBot should respond normally now.');
        
    } catch (error) {
        console.error('Reset errors command error:', error);
        await safeSendMessage(ctx, '❌ Failed to reset errors.');
    }
});

// Status command
bot.command('status', async (ctx) => {
    try {
        if (!await isAdmin(ctx.from.id)) {
            return safeSendMessage(ctx, '❌ You are not authorized to use this command.');
        }
        
        let statusText = '🤖 <b>Bot Status Report</b>\n\n';
        
        statusText += `📊 <b>Error Cooldowns Active:</b> ${errorCooldowns.size}\n`;
        statusText += `⚡ <b>Bot Responsive:</b> ✅ Yes\n`;
        
        try {
            const config = await db.collection('admin').findOne({ type: 'config' });
            statusText += `🗄️ <b>Database:</b> ✅ Connected\n`;
            statusText += `👑 <b>Admins:</b> ${config?.admins?.length || 0}\n`;
            statusText += `🔕 <b>Muted Admins:</b> ${config?.mutedAdmins?.length || 0}\n`;
            
            const userCount = await db.collection('users').countDocuments();
            statusText += `👥 <b>Users:</b> ${userCount}\n`;
            
            const taskCount = config?.tasks?.length || 0;
            statusText += `📝 <b>Tasks:</b> ${taskCount}\n`;
            
            const giftCodeCount = config?.giftCodes?.length || 0;
            statusText += `🎁 <b>Gift Codes:</b> ${giftCodeCount}\n`;
            
            const channelCount = config?.channels?.length || 0;
            statusText += `📺 <b>Channels:</b> ${channelCount}\n`;
            
            const pendingWithdrawals = (config?.withdrawalHistory || []).filter(w => w.status === 'pending').length;
            statusText += `💸 <b>Pending Withdrawals:</b> ${pendingWithdrawals}\n`;
            
            const pendingTasks = (config?.taskHistory || []).filter(t => t.status === 'pending').length;
            statusText += `📝 <b>Pending Tasks:</b> ${pendingTasks}\n`;
        } catch (dbError) {
            statusText += `🗄️ <b>Database:</b> ❌ Error: ${dbError.message}\n`;
        }
        
        await safeSendMessage(ctx, statusText, { parse_mode: 'HTML' });
        
    } catch (error) {
        console.error('Status command error:', error);
        await safeSendMessage(ctx, '❌ Failed to get bot status.');
    }
});

// ==========================================
// START BOT
// ==========================================

async function startBot() {
    try {
        const dbConnected = await connectDB();
        if (!dbConnected) {
            console.error('❌ Failed to connect to database');
            setTimeout(startBot, 5000);
            return;
        }
        
        await initBot();
        
        await bot.launch({
            dropPendingUpdates: true,
            allowedUpdates: [
                'message',
                'callback_query',
                'chat_join_request'
            ]
        });
        console.log('🤖 Bot is running...');
        
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
        
        const testAdminId = 8435248854;
        try {
            await bot.telegram.sendMessage(testAdminId, '🤖 Bot started successfully!\n\nEarning Bot Features:\n• 💰 Balance system\n• 📤 Refer & earn\n• 🎉 Daily bonus\n• 🎁 Gift codes\n• 📝 Tasks system\n• 💸 Withdrawals\n• 👑 Admin panel');
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
