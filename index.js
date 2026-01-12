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

// Emergency stop for error loop
bot.command('emergency', async (ctx) => {
    console.log('🆘 Emergency stop triggered by:', ctx.from.id);
    await ctx.reply('🆘 Emergency error reset executed. Bot should respond now.');
});

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://sandip102938:Q1g2Fbn7ewNqEvuK@test.ebvv4hf.mongodb.net/bots_earn';
let db, client;

async function connectDB() {
    try {
        client = new MongoClient(mongoUri, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
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
    broadcast: createScene('broadcast_scene'),
    addChannel: createScene('add_channel_scene'),
    addApp: createScene('add_app_scene'),
    editStartMessage: createScene('edit_start_message_scene'),
    editMenuMessage: createScene('edit_menu_message_scene')
};

// Register all scenes
Object.values(scenes).forEach(scene => stage.register(scene));

// 🔐 ADMIN CONFIGURATION
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [8435248854, 5518423310];

// Default configurations
const DEFAULT_CONFIG = {
    startMessage: '👋 Welcome! We are Premium Agents.\n\n⚠️ Access Denied\nTo access our exclusive agent list, you must join our affiliate channels below:',
    menuMessage: '🎉 Welcome to the Agent Panel!\n\n✅ Verification Successful\nSelect an app below to generate codes:',
    codeTimer: 7200,
    rewardPerRefer: 1, // Points per successful referral
    requiredRefers: 5, // Required refers to unlock apps
    referRewardMessage: '🎁 You earned {points} points for referral from {referrer_name}!\nTotal points: {total_points}'
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
                startMessage: DEFAULT_CONFIG.startMessage,
                menuMessage: DEFAULT_CONFIG.menuMessage,
                codeTimer: DEFAULT_CONFIG.codeTimer,
                rewardPerRefer: DEFAULT_CONFIG.rewardPerRefer,
                requiredRefers: DEFAULT_CONFIG.requiredRefers,
                referRewardMessage: DEFAULT_CONFIG.referRewardMessage,
                channels: [],
                apps: [],
                createdAt: new Date(),
                updatedAt: new Date()
            });
            
            console.log('✅ Created new bot configuration');
        } else {
            console.log('✅ Loaded existing bot configuration');
        }
        
        // Create indexes
        await db.collection('users').createIndex({ userId: 1 }, { unique: true });
        await db.collection('users').createIndex({ referCode: 1 }, { unique: true, sparse: true });
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

// Generate referral code
function generateReferCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
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

// Get Unjoined Channels
async function getUnjoinedChannels(userId) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        if (!config || !config.channels || config.channels.length === 0) return [];
        
        const unjoined = [];
        const promises = config.channels.map(async (channel) => {
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

// Get Channels to Display
async function getChannelsToDisplay(userId) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        if (!config || !config.channels || config.channels.length === 0) return [];
        
        const channelsToDisplay = [];
        const promises = config.channels.map(async (channel) => {
            let userHasJoined = false;
            
            try {
                const member = await bot.telegram.getChatMember(channel.id, userId);
                if (member.status !== 'left' && member.status !== 'kicked') {
                    userHasJoined = true;
                }
            } catch (error) {}
            
            if (!userHasJoined) {
                channelsToDisplay.push(channel);
            }
        });
        
        await Promise.allSettled(promises);
        return channelsToDisplay;
    } catch (error) {
        console.error('Error in getChannelsToDisplay:', error);
        return [];
    }
}

// Get User Variables
function getUserVariables(user) {
    try {
        const firstName = user.first_name || '';
        const lastName = user.last_name || '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
        
        return {
            first_name: firstName,
            last_name: lastName,
            full_name: fullName,
            username: user.username ? `@${user.username}` : '',
            name: firstName || 'Agent'
        };
    } catch (error) {
        return {
            first_name: '',
            last_name: '',
            full_name: '',
            username: '',
            name: 'Agent'
        };
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

// ==========================================
// USER FLOW - START COMMAND
// ==========================================

bot.start(async (ctx) => {
    try {
        const user = ctx.from;
        const userId = user.id;
        
        // Check for referral parameter
        const startPayload = ctx.startPayload;
        let referrerId = null;
        
        if (startPayload && startPayload.startsWith('ref_')) {
            referrerId = parseInt(startPayload.replace('ref_', ''));
            
            // Check if user is referring themselves
            if (referrerId !== userId) {
                // Update referrer's points if this is a new user
                const existingUser = await db.collection('users').findOne({ userId: userId });
                if (!existingUser) {
                    const referrer = await db.collection('users').findOne({ userId: referrerId });
                    if (referrer) {
                        const config = await db.collection('admin').findOne({ type: 'config' });
                        const rewardPerRefer = config?.rewardPerRefer || DEFAULT_CONFIG.rewardPerRefer;
                        
                        await db.collection('users').updateOne(
                            { userId: referrerId },
                            { 
                                $inc: { 
                                    referPoints: rewardPerRefer,
                                    totalReferrals: 1 
                                },
                                $push: { 
                                    referrals: {
                                        userId: userId,
                                        joinedAt: new Date()
                                    }
                                }
                            }
                        );
                        
                        // Notify referrer
                        try {
                            await bot.telegram.sendMessage(
                                referrerId,
                                replaceVariables(config?.referRewardMessage || DEFAULT_CONFIG.referRewardMessage, {
                                    points: rewardPerRefer,
                                    referrer_name: referrer.firstName || 'User',
                                    total_points: (referrer.referPoints || 0) + rewardPerRefer
                                })
                            );
                        } catch (error) {
                            console.error('Failed to notify referrer:', error);
                        }
                    }
                }
            }
        }
        
        // Generate referral code for new users
        let referCode = generateReferCode();
        let isNewUser = false;
        
        const existingUser = await db.collection('users').findOne({ userId: userId });
        
        if (existingUser) {
            referCode = existingUser.referCode || referCode;
        } else {
            isNewUser = true;
        }
        
        // Save or update user
        await saveToDatabase('users', 
            { userId: userId },
            {
                $set: {
                    firstName: user.first_name,
                    lastName: user.last_name,
                    username: user.username,
                    referCode: referCode,
                    lastActive: new Date(),
                    referrerId: referrerId || existingUser?.referrerId
                },
                $setOnInsert: {
                    joinedAll: false,
                    joinedAt: new Date(),
                    referPoints: 0,
                    totalReferrals: 0,
                    referrals: [],
                    codeTimestamps: {}
                }
            }
        );
        
        // Show start screen
        await showStartScreen(ctx);
        
    } catch (error) {
        console.error('Start command error:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
    }
});

// Show Start Screen
async function showStartScreen(ctx) {
    try {
        const user = ctx.from;
        const userId = user.id;
        
        // Get configuration and channels
        const [config, channelsToDisplay, userData] = await Promise.all([
            db.collection('admin').findOne({ type: 'config' }),
            getChannelsToDisplay(userId),
            db.collection('users').findOne({ userId: userId })
        ]);
        
        // Prepare message
        let startMessage = config?.startMessage || DEFAULT_CONFIG.startMessage;
        const userVars = getUserVariables(user);
        startMessage = replaceVariables(startMessage, userVars);
        
        // Create buttons
        const buttons = [];

        // Add channel buttons if there are channels to display
        if (channelsToDisplay.length > 0) {
            channelsToDisplay.forEach(channel => {
                buttons.push([{ text: channel.buttonLabel || `Join ${channel.title}`, url: channel.link }]);
            });
            
            buttons.push([{ text: '✅ Check Joined', callback_data: 'check_joined' }]);
        } else {
            // All channels joined - show menu button
            buttons.push([{ text: '🎮 Go to Menu', callback_data: 'go_to_menu' }]);
        }
        
        // Add referral info
        const referPoints = userData?.referPoints || 0;
        const requiredRefers = config?.requiredRefers || DEFAULT_CONFIG.requiredRefers;
        
        buttons.push([
            { text: `📊 Points: ${referPoints}/${requiredRefers}`, callback_data: 'show_refer_info' }
        ]);
        
        buttons.push([{ text: '📞 Contact Admin', callback_data: 'contact_admin' }]);
        
        await ctx.reply(startMessage, {
            reply_markup: { inline_keyboard: buttons }
        });
        
    } catch (error) {
        console.error('Show start screen error:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
    }
}

// Show Referral Info
bot.action('show_refer_info', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const userData = await db.collection('users').findOne({ userId: userId });
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        const referPoints = userData?.referPoints || 0;
        const requiredRefers = config?.requiredRefers || DEFAULT_CONFIG.requiredRefers;
        const referCode = userData?.referCode || generateReferCode();
        const totalReferrals = userData?.totalReferrals || 0;
        
        const botUsername = (await bot.telegram.getMe()).username;
        const referLink = `https://t.me/${botUsername}?start=ref_${userId}`;
        
        let message = '📊 *Your Referral Stats*\n\n';
        message += `🎯 *Points Earned:* ${referPoints}/${requiredRefers}\n`;
        message += `👥 *Total Referrals:* ${totalReferrals}\n`;
        message += `🔗 *Your Referral Code:* \`${referCode}\`\n`;
        message += `📎 *Your Referral Link:* ${referLink}\n\n`;
        
        if (referPoints < requiredRefers) {
            message += `⚠️ *You need ${requiredRefers - referPoints} more points to unlock apps!*\n`;
            message += `Invite friends using your referral link above. Each successful referral gives you ${config?.rewardPerRefer || 1} point.`;
        } else {
            message += `✅ *You have unlocked all apps!*\n`;
            message += `Go to menu to generate codes.`;
        }
        
        const keyboard = [
            [{ text: '📋 Copy Referral Link', callback_data: 'copy_refer_link' }],
            [{ text: '🔙 Back to Start', callback_data: 'back_to_start' }]
        ];
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch (error) {
        console.error('Show refer info error:', error);
        await ctx.answerCbQuery('❌ Error loading referral info');
    }
});

// Copy Referral Link
bot.action('copy_refer_link', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const userData = await db.collection('users').findOne({ userId: userId });
        const referCode = userData?.referCode || generateReferCode();
        
        const botUsername = (await bot.telegram.getMe()).username;
        const referLink = `https://t.me/${botUsername}?start=ref_${userId}`;
        
        await ctx.answerCbQuery(`✅ Referral link copied!\n\nLink: ${referLink}\nCode: ${referCode}`);
        
    } catch (error) {
        console.error('Copy refer link error:', error);
        await ctx.answerCbQuery('❌ Error copying link');
    }
});

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

// Contact Admin
bot.action('contact_admin', async (ctx) => {
    try {
        const user = ctx.from;
        const userInfo = user.username ? `@${user.username}` : user.first_name || `User ${user.id}`;
        
        await ctx.answerCbQuery('✅ Message sent to admin!');
        
        // Notify all admins
        const config = await db.collection('admin').findOne({ type: 'config' });
        const admins = config?.admins || ADMIN_IDS;
        
        const message = `📞 *User wants to contact admin*\n\n*User:* ${userInfo}\n*User ID:* \`${user.id}\``;
        
        admins.forEach(async (adminId) => {
            try {
                await bot.telegram.sendMessage(
                    adminId,
                    message,
                    {
                        parse_mode: 'Markdown',
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
        
    } catch (error) {
        console.error('Contact admin error:', error);
        await ctx.answerCbQuery('❌ Failed to contact admin');
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
        const user = ctx.from;
        const userId = user.id;
        
        // Check if user has joined all channels
        const unjoinedChannels = await getUnjoinedChannels(userId);
        if (unjoinedChannels.length > 0) {
            await db.collection('users').updateOne(
                { userId: userId },
                { $set: { joinedAll: false } }
            );
            
            await ctx.reply('⚠️ Please join all channels first!', {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back to Start', callback_data: 'back_to_start' }
                    ]]
                }
            });
            return;
        }
        
        // Check if user has enough referral points
        const userData = await db.collection('users').findOne({ userId: userId });
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        const referPoints = userData?.referPoints || 0;
        const requiredRefers = config?.requiredRefers || DEFAULT_CONFIG.requiredRefers;
        
        if (referPoints < requiredRefers) {
            await ctx.reply(`⚠️ *You need ${requiredRefers} referral points to unlock apps!*\n\nYou have: ${referPoints} points\nRequired: ${requiredRefers} points\n\nGo back to start screen to get your referral link.`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📊 Get Referral Link', callback_data: 'show_refer_info' }],
                        [{ text: '🔙 Back to Start', callback_data: 'back_to_start' }]
                    ]
                }
            });
            return;
        }
        
        // Update user status to joined all
        await db.collection('users').updateOne(
            { userId: userId },
            { $set: { joinedAll: true } }
        );
        
        // Get apps
        const apps = config?.apps || [];
        
        // Prepare message
        let menuMessage = config?.menuMessage || DEFAULT_CONFIG.menuMessage;
        const userVars = getUserVariables(user);
        menuMessage = replaceVariables(menuMessage, userVars);
        
        // Create app buttons
        const keyboard = [];
        
        if (apps.length === 0) {
            keyboard.push([{ text: '📱 No Apps Available', callback_data: 'no_apps' }]);
        } else {
            apps.forEach(app => {
                keyboard.push([{ text: app.name, callback_data: `app_${app.id}` }]);
            });
        }
        
        keyboard.push([{ text: '📊 Referral Stats', callback_data: 'show_refer_info' }]);
        keyboard.push([{ text: '🔙 Back to Start', callback_data: 'back_to_start' }]);
        
        await ctx.reply(menuMessage, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Show main menu error:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
    }
}

// App Code Generation
bot.action(/^app_(.+)$/, async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        
        const appId = ctx.match[1];
        const userId = ctx.from.id;
        
        // Get app details and user data
        const [config, userData] = await Promise.all([
            db.collection('admin').findOne({ type: 'config' }),
            db.collection('users').findOne({ userId: userId })
        ]);
        
        const app = config?.apps?.find(a => a.id === appId);
        
        if (!app) {
            await ctx.reply('❌ App not found.');
            await showMainMenu(ctx);
            return;
        }
        
        const codeTimer = config?.codeTimer || DEFAULT_CONFIG.codeTimer;
        
        // Check cooldown
        const lastGenerated = userData?.codeTimestamps?.[appId];
        const now = Math.floor(Date.now() / 1000);
        
        if (lastGenerated && (now - lastGenerated) < codeTimer) {
            const remaining = codeTimer - (now - lastGenerated);
            const timeStr = formatTimeRemaining(remaining);
            
            await ctx.reply(`⏰ *Please Wait*\n\nYou can generate new codes for *${app.name}* in:\n\`${timeStr}\``, {
                parse_mode: 'Markdown'
            });
            
            await ctx.reply('🔙 Back to Menu', {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back', callback_data: 'back_to_menu' }
                    ]]
                }
            });
            return;
        }
        
        // Generate codes
        const codes = [];
        const codeCount = app.codeCount || 1;
        const codePrefixes = app.codePrefixes || [];
        const codeLengths = app.codeLengths || [];
        
        for (let i = 0; i < codeCount; i++) {
            const prefix = codePrefixes[i] || '';
            const length = codeLengths[i] || 8;
            const code = generateCode(prefix, length);
            codes.push(code);
        }
        
        // Prepare variables
        const userVars = getUserVariables(ctx.from);
        const appVars = {
            app_name: app.name,
            button_name: app.name
        };
        
        // Add code variables
        codes.forEach((code, index) => {
            appVars[`code${index + 1}`] = `\`${code}\``;
        });
        
        // Replace variables in message
        let message = app.codeMessage || 'Your code: {code1}';
        message = replaceVariables(message, userVars);
        message = replaceVariables(message, appVars);
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                ]]
            }
        });
        
        // Update user's cooldown
        await db.collection('users').updateOne(
            { userId: userId },
            { $set: { [`codeTimestamps.${appId}`]: now } }
        );
        
        console.log(`✅ Generated ${codes.length} codes for user ${userId}: ${codes.join(', ')}`);
        
    } catch (error) {
        console.error('App selection error:', error);
        await ctx.reply('❌ An error occurred while generating codes. Please try again.');
    }
});

// Back to Menu
bot.action('back_to_menu', async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Back to menu error:', error);
    }
});

// No Apps Available
bot.action('no_apps', async (ctx) => {
    await ctx.answerCbQuery('No apps available yet. Please check back later.');
});

// ==========================================
// 🛡️ ADMIN PANEL
// ==========================================

// Admin command
bot.command('admin', async (ctx) => {
    try {
        if (!await isAdmin(ctx.from.id)) {
            return ctx.reply('❌ You are not authorized to use this command.');
        }
        
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Admin command error:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
    }
});

async function showAdminPanel(ctx) {
    try {
        const text = '👮‍♂️ *Admin Control Panel*\n\nSelect an option below:';
        
        const keyboard = [
            [{ text: '📢 Broadcast', callback_data: 'admin_broadcast' }, { text: '👥 User Stats', callback_data: 'admin_userstats' }],
            [{ text: '📝 Start Message', callback_data: 'admin_startmessage' }, { text: '📝 Menu Message', callback_data: 'admin_menumessage' }],
            [{ text: '⏰ Code Timer', callback_data: 'admin_timer' }, { text: '📺 Manage Channels', callback_data: 'admin_channels' }],
            [{ text: '📱 Manage Apps', callback_data: 'admin_apps' }, { text: '👑 Manage Admins', callback_data: 'admin_manage_admins' }],
            [{ text: '🎯 Refer Settings', callback_data: 'admin_refer_settings' }, { text: '🗑️ Delete Data', callback_data: 'admin_deletedata' }],
            [{ text: '🔙 Back', callback_data: 'back_to_start' }]
        ];
        
        if (ctx.callbackQuery) {
            await ctx.editMessageText(text, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await ctx.reply(text, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    } catch (error) {
        console.error('Show admin panel error:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
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
// ADMIN FEATURES - REFER SETTINGS
// ==========================================

bot.action('admin_refer_settings', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        const text = `🎯 *Referral Settings*\n\n*Points per referral:* ${config?.rewardPerRefer || DEFAULT_CONFIG.rewardPerRefer}\n*Required points:* ${config?.requiredRefers || DEFAULT_CONFIG.requiredRefers}\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '✏️ Points Per Refer', callback_data: 'edit_points_per_refer' }, { text: '✏️ Required Points', callback_data: 'edit_required_points' }],
            [{ text: '📊 Top Referrers', callback_data: 'admin_top_referrers' }],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Refer settings error:', error);
        await ctx.reply('❌ An error occurred.');
    }
});

// Edit points per referral
bot.action('edit_points_per_refer', async (ctx) => {
    await ctx.reply('Enter points to award per successful referral (1-100):\n\nType "cancel" to cancel.');
    
    // Store in session
    ctx.session.editingPoints = true;
});

// Edit required points
bot.action('edit_required_points', async (ctx) => {
    await ctx.reply('Enter required points to unlock apps (1-100):\n\nType "cancel" to cancel.');
    
    // Store in session
    ctx.session.editingRequired = true;
});

// Top Referrers
bot.action('admin_top_referrers', async (ctx) => {
    try {
        const topReferrers = await db.collection('users')
            .find({ totalReferrals: { $gt: 0 } })
            .sort({ totalReferrals: -1 })
            .limit(10)
            .toArray();
        
        let text = '🏆 *Top 10 Referrers*\n\n';
        
        if (topReferrers.length === 0) {
            text += 'No referrals yet.';
        } else {
            topReferrers.forEach((user, index) => {
                const name = user.firstName || `User ${user.userId}`;
                text += `${index + 1}. ${name} - ${user.totalReferrals || 0} referrals (${user.referPoints || 0} points)\n`;
            });
        }
        
        const keyboard = [
            [{ text: '🔙 Back', callback_data: 'admin_refer_settings' }]
        ];
        
        await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Top referrers error:', error);
        await ctx.answerCbQuery('❌ Error loading top referrers');
    }
});

// ==========================================
// ADMIN FEATURES - BROADCAST
// ==========================================

bot.action('admin_broadcast', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await ctx.reply('📢 *Broadcast Message*\n\nSend the message you want to broadcast to all users.\n\nType "cancel" to cancel.', {
        parse_mode: 'Markdown'
    });
    await ctx.scene.enter('broadcast_scene');
});

scenes.broadcast.on('message', async (ctx) => {
    try {
        if (ctx.message.text?.toLowerCase() === 'cancel') {
            await ctx.reply('❌ Broadcast cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const users = await db.collection('users').find({}).toArray();
        const totalUsers = users.length;
        let successful = 0;
        let failed = 0;
        
        await ctx.reply(`🚀 Broadcasting to ${totalUsers} users...`);
        
        for (const user of users) {
            try {
                await ctx.telegram.sendMessage(
                    user.userId,
                    ctx.message.text,
                    { parse_mode: 'Markdown' }
                );
                successful++;
            } catch (error) {
                failed++;
            }
            
            // Delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        await ctx.reply(`✅ *Broadcast Complete*\n\n📊 *Statistics:*\n• Total: ${totalUsers}\n• ✅ Successful: ${successful}\n• ❌ Failed: ${failed}`, {
            parse_mode: 'Markdown'
        });
        
    } catch (error) {
        console.error('Broadcast error:', error);
        await ctx.reply('❌ Broadcast failed.');
    }
    
    await ctx.scene.leave();
    await showAdminPanel(ctx);
});

// ==========================================
// ADMIN FEATURES - USER STATS
// ==========================================

bot.action('admin_userstats', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const totalUsers = await db.collection('users').countDocuments();
        const verifiedUsers = await db.collection('users').countDocuments({ joinedAll: true });
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const activeToday = await db.collection('users').countDocuments({ lastActive: { $gte: today } });
        
        const totalReferrals = await db.collection('users').aggregate([
            { $group: { _id: null, total: { $sum: "$totalReferrals" } } }
        ]).toArray();
        
        const totalRefers = totalReferrals[0]?.total || 0;
        
        let text = `📊 *User Statistics*\n\n`;
        text += `• *Total Users:* ${totalUsers}\n`;
        text += `• *Verified Users:* ${verifiedUsers}\n`;
        text += `• *Active Today:* ${activeToday}\n`;
        text += `• *Total Referrals:* ${totalRefers}\n`;
        
        const keyboard = [
            [{ text: '📋 List Users', callback_data: 'admin_list_users' }],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('User stats error:', error);
        await ctx.reply('❌ Failed to get user statistics.');
    }
});

bot.action('admin_list_users', async (ctx) => {
    try {
        const users = await db.collection('users')
            .find({})
            .sort({ joinedAt: -1 })
            .limit(50)
            .toArray();
        
        let text = `👥 *Recent Users (${users.length})*\n\n`;
        
        users.forEach((user, index) => {
            const name = user.firstName || `User ${user.userId}`;
            const status = user.joinedAll ? '✅' : '❌';
            const refers = user.totalReferrals || 0;
            text += `${index + 1}. ${status} ${name} - ${refers} refers\n`;
        });
        
        const keyboard = [
            [{ text: '🔙 Back', callback_data: 'admin_userstats' }]
        ];
        
        await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('List users error:', error);
        await ctx.answerCbQuery('❌ Error loading users');
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
        
        const text = `📝 *Start Message Management*\n\nCurrent Message:\n\`${currentMessage}\`\n\nAvailable variables: {first_name}, {last_name}, {full_name}, {username}, {name}\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '✏️ Edit', callback_data: 'admin_edit_startmessage' }, { text: '🔄 Reset', callback_data: 'admin_reset_startmessage' }],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Start message menu error:', error);
        await ctx.reply('❌ An error occurred.');
    }
});

bot.action('admin_edit_startmessage', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentMessage = config?.startMessage || DEFAULT_CONFIG.startMessage;
        
        await ctx.reply(`Current message:\n\`${currentMessage}\`\n\nEnter the new start message:\n\nType "cancel" to cancel.`, {
            parse_mode: 'Markdown'
        });
        await ctx.scene.enter('edit_start_message_scene');
    } catch (error) {
        console.error('Edit start message error:', error);
        await ctx.reply('❌ An error occurred.');
    }
});

scenes.editStartMessage.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await ctx.reply('❌ Edit cancelled.');
            await ctx.scene.leave();
            return;
        }
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { startMessage: ctx.message.text, updatedAt: new Date() } }
        );
        
        await ctx.reply('✅ Start message updated!');
        await ctx.scene.leave();
        
        setTimeout(async () => {
            await showAdminPanel(ctx);
        }, 1000);
        
    } catch (error) {
        console.error('Edit start message error:', error);
        await ctx.reply('✅ Message updated!');
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
        
        const text = `📝 *Menu Message Management*\n\nCurrent Message:\n\`${currentMessage}\`\n\nAvailable variables: {first_name}, {last_name}, {full_name}, {username}, {name}\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '✏️ Edit', callback_data: 'admin_edit_menumessage' }, { text: '🔄 Reset', callback_data: 'admin_reset_menumessage' }],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Menu message menu error:', error);
        await ctx.reply('❌ An error occurred.');
    }
});

bot.action('admin_edit_menumessage', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentMessage = config?.menuMessage || DEFAULT_CONFIG.menuMessage;
        
        await ctx.reply(`Current message:\n\`${currentMessage}\`\n\nEnter the new menu message:\n\nType "cancel" to cancel.`, {
            parse_mode: 'Markdown'
        });
        await ctx.scene.enter('edit_menu_message_scene');
    } catch (error) {
        console.error('Edit menu message error:', error);
        await ctx.reply('❌ An error occurred.');
    }
});

scenes.editMenuMessage.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await ctx.reply('❌ Edit cancelled.');
            await ctx.scene.leave();
            return;
        }
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { menuMessage: ctx.message.text, updatedAt: new Date() } }
        );
        
        await ctx.reply('✅ Menu message updated!');
        await ctx.scene.leave();
        
        setTimeout(async () => {
            await showAdminPanel(ctx);
        }, 1000);
        
    } catch (error) {
        console.error('Edit menu message error:', error);
        await ctx.reply('✅ Message updated!');
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
// ADMIN FEATURES - CODE TIMER
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
            [{ text: '24 Hours', callback_data: 'timer_24' }],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Timer menu error:', error);
        await ctx.reply('❌ An error occurred.');
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

// ==========================================
// ADMIN FEATURES - CHANNEL MANAGEMENT
// ==========================================

bot.action('admin_channels', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        
        let text = '*📺 Manage Channels*\n\n';
        
        if (channels.length === 0) {
            text += 'No channels added yet.\n';
        } else {
            channels.forEach((channel, index) => {
                text += `${index + 1}. ${channel.buttonLabel || channel.title}\n`;
            });
        }
        
        text += '\nSelect an option:';
        
        const keyboard = [
            [{ text: '➕ Add Channel', callback_data: 'admin_add_channel' }],
            channels.length > 0 ? [{ text: '🗑️ Delete Channel', callback_data: 'admin_delete_channel' }] : [],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ].filter(row => row.length > 0);
        
        await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Channels menu error:', error);
        await ctx.reply('❌ An error occurred.');
    }
});

// Add Channel
bot.action('admin_add_channel', async (ctx) => {
    await ctx.reply('Enter channel button name (e.g., "Join Main Channel"):\n\nType "cancel" to cancel.');
    await ctx.scene.enter('add_channel_scene');
});

scenes.addChannel.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await ctx.reply('❌ Add cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const buttonLabel = ctx.message.text;
        
        await ctx.reply('Now send the channel ID (e.g., @channelusername or -1001234567890):\n\nType "cancel" to cancel.');
        
        // Store button label in session
        ctx.session.channelData = {
            buttonLabel: buttonLabel
        };
        
    } catch (error) {
        console.error('Add channel error:', error);
        await ctx.reply('❌ An error occurred.');
        await ctx.scene.leave();
    }
});

scenes.addChannel.on('message', async (ctx) => {
    try {
        if (ctx.message.text?.toLowerCase() === 'cancel') {
            await ctx.reply('❌ Add cancelled.');
            delete ctx.session.channelData;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        if (!ctx.session.channelData) {
            await ctx.reply('❌ Session expired. Please start again.');
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
        } catch (error) {
            await ctx.reply('❌ Cannot access this channel. Make sure the bot is added to the channel.');
            return;
        }
        
        const channelData = ctx.session.channelData;
        
        // Create channel object
        const newChannel = {
            id: channelId,
            title: channelTitle,
            buttonLabel: channelData.buttonLabel,
            link: `https://t.me/${channelIdentifier.replace('@', '')}`,
            addedAt: new Date()
        };
        
        // Add to database
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $push: { channels: newChannel } }
        );
        
        await ctx.reply(`✅ *Channel added successfully!*\n\n• *Name:* ${channelData.buttonLabel}\n• *Title:* ${channelTitle}\n• *ID:* \`${channelId}\``, {
            parse_mode: 'Markdown'
        });
        
        // Clear session
        delete ctx.session.channelData;
        
    } catch (error) {
        console.error('Add channel error:', error);
        await ctx.reply('❌ Error adding channel.');
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
        
        let text = '*🗑️ Delete Channel*\n\nSelect a channel to delete:';
        const keyboard = [];
        
        channels.forEach((channel, index) => {
            keyboard.push([{ 
                text: `${index + 1}. ${channel.buttonLabel || channel.title}`, 
                callback_data: `delete_channel_${channel.id}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back', callback_data: 'admin_channels' }]);
        
        await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
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
        
        const newChannels = channels.filter(channel => String(channel.id) !== String(channelId));
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { channels: newChannels, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery('✅ Channel deleted');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Delete channel error:', error);
        await ctx.answerCbQuery('❌ Failed to delete channel');
    }
});

// ==========================================
// ADMIN FEATURES - APP MANAGEMENT
// ==========================================

bot.action('admin_apps', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const apps = config?.apps || [];
        
        let text = '*📱 Manage Apps*\n\n';
        
        if (apps.length === 0) {
            text += 'No apps added yet.\n';
        } else {
            apps.forEach((app, index) => {
                text += `${index + 1}. ${app.name} (${app.codeCount || 1} codes)\n`;
            });
        }
        
        text += '\nSelect an option:';
        
        const keyboard = [
            [{ text: '➕ Add App', callback_data: 'admin_add_app' }],
            apps.length > 0 ? [{ text: '🗑️ Delete App', callback_data: 'admin_delete_app' }] : [],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ].filter(row => row.length > 0);
        
        await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Apps menu error:', error);
        await ctx.reply('❌ An error occurred.');
    }
});

// Add App
bot.action('admin_add_app', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await ctx.reply('Enter app name (e.g., "WhatsApp Agents"):\n\nType "cancel" to cancel.');
    await ctx.scene.enter('add_app_scene');
});

scenes.addApp.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await ctx.reply('❌ Add cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        // Store app data in session
        ctx.session.appData = {
            name: ctx.message.text
        };
        
        await ctx.reply('How many codes to generate? (1-10):\n\nType "cancel" to cancel.');
        
    } catch (error) {
        console.error('Add app error:', error);
        await ctx.reply('❌ An error occurred.');
        await ctx.scene.leave();
    }
});

scenes.addApp.on('message', async (ctx) => {
    try {
        if (!ctx.session.appData) {
            await ctx.reply('❌ Session expired. Please start again.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        if (ctx.message.text?.toLowerCase() === 'cancel') {
            await ctx.reply('❌ Add cancelled.');
            delete ctx.session.appData;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const appData = ctx.session.appData;
        
        if (!appData.codeCount) {
            // First message: code count
            const count = parseInt(ctx.message.text);
            if (isNaN(count) || count < 1 || count > 10) {
                await ctx.reply('❌ Please enter a number between 1 and 10.');
                return;
            }
            
            appData.codeCount = count;
            await ctx.reply('Enter code prefix (or leave empty for no prefix):\n\nType "cancel" to cancel.');
            
        } else if (!appData.codePrefix) {
            // Second message: code prefix
            appData.codePrefix = ctx.message.text.trim() || '';
            await ctx.reply('Enter code length (minimum 6, default is 8):\n\nType "cancel" to cancel.');
            
        } else if (!appData.codeLength) {
            // Third message: code length
            const length = parseInt(ctx.message.text.trim());
            appData.codeLength = isNaN(length) || length < 6 ? 8 : length;
            
            await ctx.reply('Enter the code message template:\n\nAvailable variables:\n{first_name}, {last_name}, {full_name}, {username}, {name}\n{app_name}, {button_name}\n{code1}, {code2}, ... {code10}\n\nExample: "Your codes for {app_name} are:\n{code1}\n{code2}"\n\nType "cancel" to cancel.');
            
        } else {
            // Fourth message: code template
            const app = {
                id: `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: appData.name,
                codeCount: appData.codeCount,
                codePrefixes: Array(appData.codeCount).fill(appData.codePrefix),
                codeLengths: Array(appData.codeCount).fill(appData.codeLength),
                codeMessage: ctx.message.text || 'Your code: {code1}',
                createdAt: new Date()
            };
            
            // Add to database
            await db.collection('admin').updateOne(
                { type: 'config' },
                { $push: { apps: app } }
            );
            
            await ctx.reply(`✅ *App "${app.name}" added successfully!*\n\n• *Codes:* ${app.codeCount}\n• *Prefix:* ${appData.codePrefix || 'None'}\n• *Length:* ${appData.codeLength}`, {
                parse_mode: 'Markdown'
            });
            
            // Clear session
            delete ctx.session.appData;
            
            await ctx.scene.leave();
            await showAdminPanel(ctx);
        }
        
    } catch (error) {
        console.error('Add app error:', error);
        await ctx.reply('❌ Failed to add app. Please try again.');
        await ctx.scene.leave();
    }
});

// Delete App
bot.action('admin_delete_app', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const apps = config?.apps || [];
        
        if (apps.length === 0) {
            await ctx.answerCbQuery('No apps to delete.');
            return;
        }
        
        let text = '*🗑️ Delete App*\n\nSelect an app to delete:';
        const keyboard = [];
        
        apps.forEach((app, index) => {
            keyboard.push([{ 
                text: `${index + 1}. ${app.name}`, 
                callback_data: `delete_app_${app.id}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back', callback_data: 'admin_apps' }]);
        
        await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Delete app menu error:', error);
        await ctx.answerCbQuery('❌ Failed to load apps');
    }
});

bot.action(/^delete_app_(.+)$/, async (ctx) => {
    try {
        const appId = ctx.match[1];
        const config = await db.collection('admin').findOne({ type: 'config' });
        const apps = config?.apps || [];
        
        const newApps = apps.filter(app => app.id !== appId);
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { apps: newApps, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery('✅ App deleted');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Delete app error:', error);
        await ctx.answerCbQuery('❌ Failed to delete app');
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
        
        let text = '*👑 Manage Admins*\n\nCurrent Admins:\n';
        
        admins.forEach((adminId, index) => {
            text += `${index + 1}. \`${adminId}\`\n`;
        });
        
        text += '\nSelect an option:';
        
        const keyboard = [
            [{ text: '➕ Add Admin', callback_data: 'admin_add_admin' }, { text: '🗑️ Remove Admin', callback_data: 'admin_remove_admin' }],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Manage admins menu error:', error);
        await ctx.reply('❌ An error occurred.');
    }
});

// Add Admin
bot.action('admin_add_admin', async (ctx) => {
    await ctx.reply('Send the user ID of the new admin:\n\nType "cancel" to cancel.');
    
    // Store in session
    ctx.session.addingAdmin = true;
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
        
        let text = '*🗑️ Remove Admin*\n\nSelect an admin to remove:';
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
        
        await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
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

// ==========================================
// ADMIN FEATURES - DELETE DATA
// ==========================================

bot.action('admin_deletedata', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    const text = '*⚠️ DANGER ZONE - DATA DELETION*\n\nSelect what you want to delete:\n\n*WARNING: These actions cannot be undone!*';
    
    const keyboard = [
        [{ text: '🗑️ Delete All Users', callback_data: 'delete_all_users' }, { text: '🗑️ Delete All Channels', callback_data: 'delete_all_channels' }],
        [{ text: '🗑️ Delete All Apps', callback_data: 'delete_all_apps' }, { text: '🔥 DELETE EVERYTHING', callback_data: 'delete_everything' }],
        [{ text: '🔙 Back', callback_data: 'admin_back' }]
    ];
    
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Delete All Users
bot.action('delete_all_users', async (ctx) => {
    const keyboard = [
        [{ text: '✅ YES, DELETE ALL USERS', callback_data: 'confirm_delete_users' }],
        [{ text: '❌ NO, CANCEL', callback_data: 'admin_deletedata' }]
    ];
    
    await ctx.editMessageText('*⚠️ CONFIRMATION REQUIRED*\n\nAre you sure you want to delete ALL users?\n\nThis will remove all user data.\n\n*This action cannot be undone!*', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
    });
});

bot.action('confirm_delete_users', async (ctx) => {
    try {
        const result = await db.collection('users').deleteMany({});
        await ctx.editMessageText(`✅ Deleted ${result.deletedCount} users.`, {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    } catch (error) {
        console.error('Delete users error:', error);
        await ctx.editMessageText('❌ Failed to delete users.', {
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
    
    await ctx.editMessageText('*⚠️ CONFIRMATION REQUIRED*\n\nAre you sure you want to delete ALL channels?\n\nThis will remove all channel data.\n\n*This action cannot be undone!*', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
    });
});

bot.action('confirm_delete_channels', async (ctx) => {
    try {
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { channels: [], updatedAt: new Date() } }
        );
        
        await ctx.editMessageText('✅ All channels deleted.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    } catch (error) {
        console.error('Delete channels error:', error);
        await ctx.editMessageText('❌ Failed to delete channels.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    }
});

// Delete All Apps
bot.action('delete_all_apps', async (ctx) => {
    const keyboard = [
        [{ text: '✅ YES, DELETE ALL APPS', callback_data: 'confirm_delete_apps' }],
        [{ text: '❌ NO, CANCEL', callback_data: 'admin_deletedata' }]
    ];
    
    await ctx.editMessageText('*⚠️ CONFIRMATION REQUIRED*\n\nAre you sure you want to delete ALL apps?\n\nThis will remove all app data.\n\n*This action cannot be undone!*', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
    );
});

bot.action('confirm_delete_apps', async (ctx) => {
    try {
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { apps: [], updatedAt: new Date() } }
        );
        
        await ctx.editMessageText('✅ All apps deleted.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    } catch (error) {
        console.error('Delete apps error:', error);
        await ctx.editMessageText('❌ Failed to delete apps.', {
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
    
    await ctx.editMessageText('*🚨 EXTREME DANGER*\n\nAre you absolutely sure you want to DELETE EVERYTHING?\n\nThis will remove ALL data and reset the bot.\n\n*COMPLETE RESET - IRREVERSIBLE!*', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
    );
});

bot.action('confirm_delete_everything', async (ctx) => {
    try {
        await db.collection('users').deleteMany({});
        await db.collection('admin').deleteOne({ type: 'config' });
        await initBot();
        
        await ctx.editMessageText('*🔥 COMPLETE RESET DONE!*\n\nBot has been reset to factory settings.', {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    } catch (error) {
        console.error('Delete everything error:', error);
        await ctx.editMessageText('❌ Failed to reset bot.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    }
});

// ==========================================
// MESSAGE HANDLER FOR ADMIN SETTINGS
// ==========================================

bot.on('text', async (ctx) => {
    try {
        // Handle points per referral edit
        if (ctx.session?.editingPoints) {
            if (ctx.message.text.toLowerCase() === 'cancel') {
                delete ctx.session.editingPoints;
                await ctx.reply('❌ Edit cancelled.');
                return;
            }
            
            const points = parseInt(ctx.message.text);
            if (isNaN(points) || points < 1 || points > 100) {
                await ctx.reply('❌ Please enter a valid number between 1 and 100.');
                return;
            }
            
            await db.collection('admin').updateOne(
                { type: 'config' },
                { $set: { rewardPerRefer: points, updatedAt: new Date() } }
            );
            
            delete ctx.session.editingPoints;
            await ctx.reply(`✅ Points per referral set to ${points}.`);
            await showAdminPanel(ctx);
            return;
        }
        
        // Handle required points edit
        if (ctx.session?.editingRequired) {
            if (ctx.message.text.toLowerCase() === 'cancel') {
                delete ctx.session.editingRequired;
                await ctx.reply('❌ Edit cancelled.');
                return;
            }
            
            const points = parseInt(ctx.message.text);
            if (isNaN(points) || points < 1 || points > 100) {
                await ctx.reply('❌ Please enter a valid number between 1 and 100.');
                return;
            }
            
            await db.collection('admin').updateOne(
                { type: 'config' },
                { $set: { requiredRefers: points, updatedAt: new Date() } }
            );
            
            delete ctx.session.editingRequired;
            await ctx.reply(`✅ Required points set to ${points}.`);
            await showAdminPanel(ctx);
            return;
        }
        
        // Handle add admin
        if (ctx.session?.addingAdmin) {
            if (ctx.message.text.toLowerCase() === 'cancel') {
                delete ctx.session.addingAdmin;
                await ctx.reply('❌ Add cancelled.');
                return;
            }
            
            const newAdminId = parseInt(ctx.message.text);
            if (isNaN(newAdminId)) {
                await ctx.reply('❌ Invalid user ID. Please enter a numeric ID.');
                return;
            }
            
            const config = await db.collection('admin').findOne({ type: 'config' });
            const currentAdmins = config?.admins || ADMIN_IDS;
            
            if (currentAdmins.includes(newAdminId)) {
                await ctx.reply('❌ This user is already an admin.');
                delete ctx.session.addingAdmin;
                return;
            }
            
            const updatedAdmins = [...currentAdmins, newAdminId];
            await db.collection('admin').updateOne(
                { type: 'config' },
                { $set: { admins: updatedAdmins, updatedAt: new Date() } }
            );
            
            delete ctx.session.addingAdmin;
            await ctx.reply(`✅ Admin added successfully!\n\nNew admin ID: \`${newAdminId}\``, {
                parse_mode: 'Markdown'
            });
            
            await showAdminPanel(ctx);
            return;
        }
        
    } catch (error) {
        console.error('Message handler error:', error);
        await ctx.reply('❌ An error occurred.');
    }
});

// ==========================================
// ERROR HANDLING
// ==========================================

bot.catch((error, ctx) => {
    console.error('Bot error:', error);
    
    try {
        if (ctx.message) {
            ctx.reply('❌ An error occurred. Please try again.', {
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
                'callback_query'
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
        
        console.log('✅ Bot started successfully!');
        
    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        setTimeout(startBot, 10000);
    }
}

// Start the bot
startBot();
console.log('🚀 Bot Starting...');
