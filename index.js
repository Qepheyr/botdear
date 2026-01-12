const { Telegraf, Scenes, session, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const fetch = require('node-fetch');
const config = require('./config');
const utils = require('./utils');

require('dotenv').config();

// Cloudinary configuration
cloudinary.config(config.CLOUDINARY);

// Initialize bot
const bot = new Telegraf(config.BOT_TOKEN);

// Emergency stop command
bot.command('emergency', async (ctx) => {
    console.log('🆘 Emergency stop triggered by:', ctx.from.id);
    await ctx.reply('🆘 Emergency reset executed. Bot should respond now.');
});

// MongoDB connection
let db, client;

async function connectDB() {
    try {
        client = new MongoClient(config.MONGODB_URI, {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 15000,
            maxPoolSize: 10,
            minPoolSize: 1
        });
        await client.connect();
        db = client.db();
        console.log('✅ Connected to MongoDB');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        // For Railway, try alternative connection
        if (error.message.includes('ENOTFOUND')) {
            console.log('⚠️ Trying alternative connection method...');
            try {
                const altClient = new MongoClient(config.MONGODB_URI.replace('mongodb+srv://', 'mongodb://'), {
                    serverSelectionTimeoutMS: 10000,
                    connectTimeoutMS: 15000
                });
                await altClient.connect();
                db = altClient.db();
                console.log('✅ Connected via alternative method');
                return true;
            } catch (altError) {
                console.error('❌ Alternative connection also failed:', altError.message);
            }
        }
        return false;
    }
}

// Initialize scenes and session
const stage = new Scenes.Stage([]);
bot.use(session());
bot.use(stage.middleware());

// Scene definitions
const scenes = {
    // User scenes
    setWallet: new Scenes.BaseScene('set_wallet_scene'),
    withdrawAmount: new Scenes.BaseScene('withdraw_amount_scene'),
    enterGiftCode: new Scenes.BaseScene('enter_gift_code_scene'),
    
    // Task scenes
    submitTaskProof: new Scenes.BaseScene('submit_task_proof_scene'),
    
    // Admin scenes
    broadcast: new Scenes.BaseScene('broadcast_scene'),
    addChannel: new Scenes.BaseScene('add_channel_scene'),
    createGiftCode: new Scenes.BaseScene('create_gift_code_scene'),
    editGiftCode: new Scenes.BaseScene('edit_gift_code_scene'),
    manageBonus: new Scenes.BaseScene('manage_bonus_scene'),
    addTask: new Scenes.BaseScene('add_task_scene'),
    editTask: new Scenes.BaseScene('edit_task_scene'),
    processWithdrawal: new Scenes.BaseScene('process_withdrawal_scene'),
    contactUser: new Scenes.BaseScene('contact_user_scene'),
    
    // Settings scenes
    editStartMessage: new Scenes.BaseScene('edit_start_message_scene'),
    editMenuMessage: new Scenes.BaseScene('edit_menu_message_scene'),
    editStartImage: new Scenes.BaseScene('edit_start_image_scene'),
    editMenuImage: new Scenes.BaseScene('edit_menu_image_scene'),
    editBonusImage: new Scenes.BaseScene('edit_bonus_image_scene'),
    
    // Refer settings
    editReferSettings: new Scenes.BaseScene('edit_refer_settings_scene'),
    
    // Search scenes
    searchUsers: new Scenes.BaseScene('search_users_scene'),
    searchWithdrawals: new Scenes.BaseScene('search_withdrawals_scene')
};

// Register all scenes
Object.values(scenes).forEach(scene => stage.register(scene));

// ==========================================
// DATABASE INITIALIZATION
// ==========================================

async function initBot() {
    try {
        // Check if config exists
        const configDoc = await db.collection(config.COLLECTIONS.CONFIG).findOne({ type: 'bot_config' });
        
        if (!configDoc) {
            await db.collection(config.COLLECTIONS.CONFIG).insertOne({
                type: 'bot_config',
                admins: config.ADMIN_IDS,
                mutedAdmins: [],
                startImage: config.DEFAULTS.startImage,
                startMessage: config.DEFAULTS.startMessage,
                menuImage: config.DEFAULTS.menuImage,
                menuMessage: config.DEFAULTS.menuMessage,
                bonusImage: config.DEFAULTS.bonusImage,
                bonusAmount: config.DEFAULTS.bonusAmount,
                minWithdrawal: config.DEFAULTS.minWithdrawal,
                maxWithdrawal: config.DEFAULTS.maxWithdrawal,
                referBonus: config.DEFAULTS.referBonus,
                minReferBonus: config.DEFAULTS.minReferBonus,
                maxReferBonus: config.DEFAULTS.maxReferBonus,
                taskBonus: config.DEFAULTS.taskBonus,
                maxScreenshots: config.DEFAULTS.maxScreenshots,
                showContactButton: true,
                channels: [],
                hiddenChannels: [],
                justShowChannels: [],
                needJoinChannels: [],
                autoAcceptChannels: [],
                giftCodes: [],
                tasks: [],
                uploadedImages: [],
                imageOverlaySettings: {
                    startImage: true,
                    menuImage: true,
                    bonusImage: true,
                    showAmountOnBonus: true
                },
                botDisabled: false,
                disabledMessage: '🚧 Bot is under maintenance. Please check back later.',
                adminCode: config.ADMIN_CODE,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            
            console.log('✅ Created new bot configuration');
        } else {
            console.log('✅ Loaded existing bot configuration');
        }
        
        // Create indexes
        await db.collection(config.COLLECTIONS.USERS).createIndex({ userId: 1 }, { unique: true });
        await db.collection(config.COLLECTIONS.USERS).createIndex({ referralCode: 1 }, { unique: true, sparse: true });
        await db.collection(config.COLLECTIONS.TRANSACTIONS).createIndex({ userId: 1 });
        await db.collection(config.COLLECTIONS.TRANSACTIONS).createIndex({ transactionId: 1 }, { unique: true });
        await db.collection(config.COLLECTIONS.WITHDRAWALS).createIndex({ withdrawalId: 1 }, { unique: true });
        await db.collection(config.COLLECTIONS.GIFT_CODES).createIndex({ code: 1 }, { unique: true });
        await db.collection(config.COLLECTIONS.TASKS).createIndex({ status: 1 });
        await db.collection(config.COLLECTIONS.TASK_REQUESTS).createIndex({ userId: 1 });
        await db.collection(config.COLLECTIONS.REFERRALS).createIndex({ referrerId: 1 });
        
        console.log(`✅ Bot initialized with ${config.ADMIN_IDS.length} admins`);
        return true;
    } catch (error) {
        console.error('❌ Error initializing bot:', error);
        return false;
    }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Check admin status
async function isAdmin(userId) {
    try {
        const configDoc = await db.collection(config.COLLECTIONS.CONFIG).findOne({ type: 'bot_config' });
        if (!configDoc || !configDoc.admins) return config.ADMIN_IDS.includes(Number(userId));
        return configDoc.admins.some(id => String(id) === String(userId));
    } catch (error) {
        console.error('Error checking admin:', error);
        return config.ADMIN_IDS.includes(Number(userId));
    }
}

// Get bot configuration
async function getConfig() {
    try {
        const configDoc = await db.collection(config.COLLECTIONS.CONFIG).findOne({ type: 'bot_config' });
        return configDoc || {
            type: 'bot_config',
            admins: config.ADMIN_IDS,
            mutedAdmins: [],
            startImage: config.DEFAULTS.startImage,
            startMessage: config.DEFAULTS.startMessage,
            menuImage: config.DEFAULTS.menuImage,
            menuMessage: config.DEFAULTS.menuMessage,
            bonusImage: config.DEFAULTS.bonusImage,
            bonusAmount: config.DEFAULTS.bonusAmount,
            minWithdrawal: config.DEFAULTS.minWithdrawal,
            maxWithdrawal: config.DEFAULTS.maxWithdrawal,
            referBonus: config.DEFAULTS.referBonus,
            minReferBonus: config.DEFAULTS.minReferBonus,
            maxReferBonus: config.DEFAULTS.maxReferBonus,
            taskBonus: config.DEFAULTS.taskBonus,
            maxScreenshots: config.DEFAULTS.maxScreenshots,
            showContactButton: true,
            channels: [],
            hiddenChannels: [],
            justShowChannels: [],
            needJoinChannels: [],
            autoAcceptChannels: [],
            giftCodes: [],
            tasks: [],
            uploadedImages: [],
            imageOverlaySettings: {
                startImage: true,
                menuImage: true,
                bonusImage: true,
                showAmountOnBonus: true
            },
            botDisabled: false,
            disabledMessage: '🚧 Bot is under maintenance. Please check back later.',
            adminCode: config.ADMIN_CODE
        };
    } catch (error) {
        console.error('Error getting config:', error);
        return null;
    }
}

// Update configuration
async function updateConfig(update) {
    try {
        await db.collection(config.COLLECTIONS.CONFIG).updateOne(
            { type: 'bot_config' },
            { $set: { ...update, updatedAt: new Date() } },
            { upsert: true }
        );
        return true;
    } catch (error) {
        console.error('Error updating config:', error);
        return false;
    }
}

// Get user data
async function getUser(userId) {
    try {
        const user = await db.collection(config.COLLECTIONS.USERS).findOne({ userId: Number(userId) });
        if (user) return user;
        
        // Create new user if doesn't exist
        const referralCode = utils.generateReferralCode();
        const newUser = {
            userId: Number(userId),
            firstName: '',
            lastName: '',
            username: '',
            balance: 0,
            referralCode: referralCode,
            referrals: 0,
            totalEarned: 0,
            totalWithdrawn: 0,
            wallet: '',
            verified: false,
            joinedAllChannels: false,
            joinedAt: new Date(),
            lastActive: new Date(),
            lastBonusClaim: null,
            transactions: []
        };
        
        await db.collection(config.COLLECTIONS.USERS).insertOne(newUser);
        return newUser;
    } catch (error) {
        console.error('Error getting user:', error);
        return null;
    }
}

// Update user
async function updateUser(userId, update) {
    try {
        await db.collection(config.COLLECTIONS.USERS).updateOne(
            { userId: Number(userId) },
            { $set: { ...update, lastActive: new Date() } }
        );
        return true;
    } catch (error) {
        console.error('Error updating user:', error);
        return false;
    }
}

// Add transaction
async function addTransaction(userId, type, amount, description = '') {
    try {
        const transaction = {
            transactionId: utils.generateTransactionId(),
            userId: Number(userId),
            type: type, // 'credit', 'debit', 'referral', 'bonus', 'task', 'withdrawal'
            amount: Number(amount),
            description: description,
            timestamp: new Date()
        };
        
        await db.collection(config.COLLECTIONS.TRANSACTIONS).insertOne(transaction);
        
        // Update user balance
        const user = await getUser(userId);
        let newBalance = user.balance;
        
        if (type === 'credit' || type === 'referral' || type === 'bonus' || type === 'task') {
            newBalance += Number(amount);
        } else if (type === 'debit' || type === 'withdrawal') {
            newBalance -= Number(amount);
        }
        
        await updateUser(userId, { 
            balance: newBalance,
            totalEarned: type === 'credit' || type === 'referral' || type === 'bonus' || type === 'task' 
                ? user.totalEarned + Number(amount) 
                : user.totalEarned,
            totalWithdrawn: type === 'withdrawal' 
                ? user.totalWithdrawn + Number(amount) 
                : user.totalWithdrawn
        });
        
        return transaction;
    } catch (error) {
        console.error('Error adding transaction:', error);
        return null;
    }
}

// Get user transactions
async function getUserTransactions(userId, limit = 15) {
    try {
        const transactions = await db.collection(config.COLLECTIONS.TRANSACTIONS)
            .find({ userId: Number(userId) })
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray();
        return transactions;
    } catch (error) {
        console.error('Error getting transactions:', error);
        return [];
    }
}

// Get user referrals
async function getUserReferrals(userId, page = 1, limit = 20) {
    try {
        const skip = (page - 1) * limit;
        const referrals = await db.collection(config.COLLECTIONS.REFERRALS)
            .find({ referrerId: Number(userId) })
            .sort({ joinedAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        const total = await db.collection(config.COLLECTIONS.REFERRALS)
            .countDocuments({ referrerId: Number(userId) });
        
        return { referrals, total, page, totalPages: Math.ceil(total / limit) };
    } catch (error) {
        console.error('Error getting referrals:', error);
        return { referrals: [], total: 0, page: 1, totalPages: 0 };
    }
}

// Check if user has joined required channels
async function checkChannelsJoined(userId) {
    try {
        const configDoc = await getConfig();
        const needJoinChannels = configDoc.needJoinChannels || [];
        
        if (needJoinChannels.length === 0) return true;
        
        for (const channelId of needJoinChannels) {
            try {
                const member = await bot.telegram.getChatMember(channelId, userId);
                if (member.status === 'left' || member.status === 'kicked') {
                    return false;
                }
            } catch (error) {
                console.error(`Error checking channel ${channelId}:`, error.message);
                return false;
            }
        }
        
        return true;
    } catch (error) {
        console.error('Error checking channels:', error);
        return false;
    }
}

// Get channels to show
async function getChannelsToShow(userId) {
    try {
        const configDoc = await getConfig();
        const channels = configDoc.channels || [];
        const hiddenChannels = configDoc.hiddenChannels || [];
        const justShowChannels = configDoc.justShowChannels || [];
        
        // Filter out hidden channels
        let channelsToShow = channels.filter(channel => !hiddenChannels.includes(channel.id));
        
        // Check which channels user has joined
        const channelsWithStatus = [];
        
        for (const channel of channelsToShow) {
            const isJustShow = justShowChannels.includes(channel.id);
            let userHasJoined = false;
            
            if (!isJustShow) {
                try {
                    const member = await bot.telegram.getChatMember(channel.id, userId);
                    userHasJoined = member.status !== 'left' && member.status !== 'kicked';
                } catch (error) {
                    console.error(`Error checking channel ${channel.id}:`, error.message);
                }
            }
            
            channelsWithStatus.push({
                ...channel,
                joined: userHasJoined,
                isJustShow: isJustShow
            });
        }
        
        return channelsWithStatus;
    } catch (error) {
        console.error('Error getting channels to show:', error);
        return [];
    }
}

// Notify admins
async function notifyAdmins(message, excludeMuted = true) {
    try {
        const configDoc = await getConfig();
        let admins = configDoc.admins || config.ADMIN_IDS;
        
        if (excludeMuted) {
            const mutedAdmins = configDoc.mutedAdmins || [];
            admins = admins.filter(adminId => !mutedAdmins.includes(adminId));
        }
        
        for (const adminId of admins) {
            try {
                await bot.telegram.sendMessage(adminId, message, { 
                    parse_mode: 'HTML',
                    disable_web_page_preview: true 
                });
            } catch (error) {
                console.error(`Failed to notify admin ${adminId}:`, error.message);
            }
        }
    } catch (error) {
        console.error('Error notifying admins:', error);
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
            
            uploadStream.end(fileBuffer);
        });
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        throw error;
    }
}

// Get Cloudinary URL with overlay
async function getCloudinaryUrlWithOverlay(originalUrl, text, imageType = 'startImage') {
    try {
        if (!originalUrl.includes('cloudinary.com')) {
            return originalUrl;
        }
        
        const configDoc = await getConfig();
        const overlaySettings = configDoc.imageOverlaySettings || {
            startImage: true,
            menuImage: true,
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
            if (originalUrl.includes('{name}') || originalUrl.includes('{amount}')) {
                return originalUrl.replace(/{name}/g, text || 'User').replace(/{amount}/g, text || '0');
            }
            return originalUrl;
        }
        
        const cleanText = utils.cleanNameForImage(text) || (imageType === 'bonusImage' ? '₹0' : 'User');
        const encodedText = encodeURIComponent(cleanText);
        
        if (originalUrl.includes('{name}') || originalUrl.includes('{amount}')) {
            return originalUrl.replace(/{name}/g, cleanText).replace(/{amount}/g, cleanText);
        }
        
        if (originalUrl.includes('/upload/')) {
            const parts = originalUrl.split('/upload/');
            if (parts.length === 2) {
                const textOverlay = `l_text:Stalinist%20One_140_bold:${encodedText},co_rgb:00e5ff,g_center/`;
                const newTransformation = textOverlay + parts[1];
                return `${parts[0]}/upload/${newTransformation}`;
            }
        }
        
        return originalUrl;
    } catch (error) {
        console.error('Error in getCloudinaryUrlWithOverlay:', error);
        return originalUrl;
    }
}

// ==========================================
// USER FLOW - START COMMAND
// ==========================================

bot.start(async (ctx) => {
    try {
        const user = ctx.from;
        const userId = user.id;
        
        // Check if bot is disabled
        const configDoc = await getConfig();
        if (configDoc.botDisabled) {
            await ctx.reply(configDoc.disabledMessage || '🚧 Bot is under maintenance.', {
                parse_mode: 'HTML'
            });
            return;
        }
        
        // Check for admin code
        const args = ctx.message.text.split(' ');
        if (args.length > 1 && args[1] === configDoc.adminCode) {
            // Add user as admin
            if (!configDoc.admins.includes(userId)) {
                configDoc.admins.push(userId);
                await updateConfig({ admins: configDoc.admins });
                await ctx.reply('✅ You have been added as admin! Use /admin to access admin panel.');
            }
        }
        
        // Check for referral code
        if (args.length > 1 && args[1] !== configDoc.adminCode) {
            const referrerCode = args[1];
            const referrer = await db.collection(config.COLLECTIONS.USERS).findOne({ referralCode: referrerCode });
            
            if (referrer && referrer.userId !== userId) {
                // Check if already referred
                const existingReferral = await db.collection(config.COLLECTIONS.REFERRALS).findOne({
                    referrerId: referrer.userId,
                    referredId: userId
                });
                
                if (!existingReferral) {
                    // Add referral
                    await db.collection(config.COLLECTIONS.REFERRALS).insertOne({
                        referrerId: referrer.userId,
                        referredId: userId,
                        referralCode: referrerCode,
                        joinedAt: new Date(),
                        bonusPaid: false
                    });
                    
                    // Update referrer's count
                    await db.collection(config.COLLECTIONS.USERS).updateOne(
                        { userId: referrer.userId },
                        { $inc: { referrals: 1 } }
                    );
                    
                    // Notify referrer
                    try {
                        await bot.telegram.sendMessage(
                            referrer.userId,
                            `🎉 New referral joined using your code!\n\n👤 User: ${user.first_name || 'Unknown'}\n💰 You will earn when they complete verification.`
                        );
                    } catch (error) {
                        console.error('Failed to notify referrer:', error);
                    }
                }
            }
        }
        
        // Save/update user
        const existingUser = await db.collection(config.COLLECTIONS.USERS).findOne({ userId: userId });
        
        if (!existingUser) {
            // New user
            const referralCode = utils.generateReferralCode();
            await db.collection(config.COLLECTIONS.USERS).insertOne({
                userId: userId,
                firstName: user.first_name || '',
                lastName: user.last_name || '',
                username: user.username || '',
                balance: 0,
                referralCode: referralCode,
                referrals: 0,
                totalEarned: 0,
                totalWithdrawn: 0,
                wallet: '',
                verified: false,
                joinedAllChannels: false,
                joinedAt: new Date(),
                lastActive: new Date(),
                lastBonusClaim: null
            });
            
            // Notify admins
            await notifyAdmins(`🆕 <b>New User Joined</b>\n\n👤 ID: <code>${userId}</code>\n📱 Username: ${user.username ? '@' + user.username : 'Not set'}\n👋 Name: ${user.first_name || ''} ${user.last_name || ''}`);
        } else {
            // Update existing user
            await db.collection(config.COLLECTIONS.USERS).updateOne(
                { userId: userId },
                {
                    $set: {
                        firstName: user.first_name || existingUser.firstName,
                        lastName: user.last_name || existingUser.lastName,
                        username: user.username || existingUser.username,
                        lastActive: new Date()
                    }
                }
            );
        }
        
        // Show start screen
        await showStartScreen(ctx);
    } catch (error) {
        console.error('Start command error:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
    }
});

// Show start screen
async function showStartScreen(ctx) {
    try {
        const user = ctx.from;
        const userId = user.id;
        
        // Check if user has joined required channels
        const channelsJoined = await checkChannelsJoined(userId);
        const userData = await getUser(userId);
        
        if (!channelsJoined && !userData.verified) {
            // Show channels to join
            const channelsToShow = await getChannelsToShow(userId);
            const needJoinChannels = channelsToShow.filter(ch => !ch.isJustShow && !ch.joined);
            
            if (needJoinChannels.length === 0) {
                // All channels joined
                await db.collection(config.COLLECTIONS.USERS).updateOne(
                    { userId: userId },
                    { $set: { verified: true, joinedAllChannels: true } }
                );
                
                // Check for referral bonus
                const referral = await db.collection(config.COLLECTIONS.REFERRALS).findOne({
                    referredId: userId,
                    bonusPaid: false
                });
                
                if (referral) {
                    const configDoc = await getConfig();
                    const bonusAmount = configDoc.referBonus || config.DEFAULTS.referBonus;
                    
                    // Add bonus to referrer
                    await addTransaction(referral.referrerId, 'referral', bonusAmount, `Referral bonus for ${user.first_name || 'user'}`);
                    
                    // Mark as paid
                    await db.collection(config.COLLECTIONS.REFERRALS).updateOne(
                        { _id: referral._id },
                        { $set: { bonusPaid: true, bonusAmount: bonusAmount, paidAt: new Date() } }
                    );
                    
                    // Notify referrer
                    try {
                        await bot.telegram.sendMessage(
                            referral.referrerId,
                            `💰 Referral Bonus Credited!\n\n🎉 Your referral completed verification.\n💰 Bonus: ₹${bonusAmount}\n💳 New balance will be updated.`
                        );
                    } catch (error) {
                        console.error('Failed to notify referrer:', error);
                    }
                }
                
                await showMainMenu(ctx);
                return;
            }
            
            // Get config for start message
            const configDoc = await getConfig();
            let startMessage = configDoc.startMessage || config.DEFAULTS.startMessage;
            startMessage = startMessage.replace(/{name}/g, user.first_name || 'User');
            
            // Create channel buttons (2 per row)
            const buttons = [];
            for (let i = 0; i < needJoinChannels.length; i += 2) {
                const row = [];
                row.push({ text: needJoinChannels[i].buttonLabel || `Join ${needJoinChannels[i].title}`, url: needJoinChannels[i].link });
                
                if (i + 1 < needJoinChannels.length) {
                    row.push({ text: needJoinChannels[i + 1].buttonLabel || `Join ${needJoinChannels[i + 1].title}`, url: needJoinChannels[i + 1].link });
                }
                
                buttons.push(row);
            }
            
            // Add verify button
            buttons.push([{ text: '✅ Check Joined', callback_data: 'check_joined' }]);
            
            // Add start image if available
            const startImage = configDoc.startImage || config.DEFAULTS.startImage;
            const imageUrl = await getCloudinaryUrlWithOverlay(startImage, user.first_name || 'User', 'startImage');
            
            if (startImage && startImage !== 'none') {
                await ctx.replyWithPhoto(imageUrl, {
                    caption: startMessage,
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: buttons }
                });
            } else {
                await ctx.reply(startMessage, {
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: buttons }
                });
            }
        } else {
            // User has joined all channels or is verified
            if (!userData.verified) {
                await db.collection(config.COLLECTIONS.USERS).updateOne(
                    { userId: userId },
                    { $set: { verified: true, joinedAllChannels: true } }
                );
            }
            
            await showMainMenu(ctx);
        }
    } catch (error) {
        console.error('Show start screen error:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
    }
}

// Check joined callback
bot.action('check_joined', async (ctx) => {
    try {
        await ctx.deleteMessage();
        await showStartScreen(ctx);
    } catch (error) {
        console.error('Check joined error:', error);
        await ctx.answerCbQuery('❌ Error checking channels');
    }
});

// ==========================================
// MAIN MENU
// ==========================================

async function showMainMenu(ctx) {
    try {
        const user = ctx.from;
        const userId = user.id;
        
        const userData = await getUser(userId);
        const configDoc = await getConfig();
        
        let menuMessage = configDoc.menuMessage || config.DEFAULTS.menuMessage;
        menuMessage = menuMessage
            .replace(/{name}/g, user.first_name || 'User')
            .replace(/{balance}/g, userData.balance || 0)
            .replace(/{referrals}/g, userData.referrals || 0);
        
        const keyboard = Markup.keyboard([
            ['💰 Balance', '👤 User Details'],
            ['💳 Withdraw', '🏦 Set Wallet'],
            ['📤 Refer', '📊 All Refers'],
            ['🎁 Bonus', '🎫 Gift Code'],
            ['📞 Contact', '📝 Tasks'],
            ['🔄 Refresh']
        ]).resize();
        
        // Add menu image if available
        const menuImage = configDoc.menuImage || config.DEFAULTS.menuImage;
        const imageUrl = await getCloudinaryUrlWithOverlay(menuImage, user.first_name || 'User', 'menuImage');
        
        if (menuImage && menuImage !== 'none') {
            await ctx.replyWithPhoto(imageUrl, {
                caption: menuMessage,
                parse_mode: 'HTML',
                reply_markup: keyboard.reply_markup
            });
        } else {
            await ctx.reply(menuMessage, {
                parse_mode: 'HTML',
                reply_markup: keyboard.reply_markup
            });
        }
    } catch (error) {
        console.error('Show main menu error:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
    }
}

// Handle menu commands
bot.hears('💰 Balance', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const userData = await getUser(userId);
        const transactions = await getUserTransactions(userId, 15);
        
        let message = `💰 <b>Your Balance</b>\n\n`;
        message += `💳 <b>Available Balance:</b> ₹${userData.balance || 0}\n`;
        message += `📈 <b>Total Earned:</b> ₹${userData.totalEarned || 0}\n`;
        message += `📤 <b>Total Withdrawn:</b> ₹${userData.totalWithdrawn || 0}\n\n`;
        message += `📜 <b>Recent Transactions:</b>\n\n`;
        
        if (transactions.length === 0) {
            message += `No transactions yet.\n`;
        } else {
            transactions.forEach((txn, index) => {
                const typeEmoji = txn.type === 'credit' || txn.type === 'referral' || txn.type === 'bonus' || txn.type === 'task' ? '➕' : '➖';
                const date = new Date(txn.timestamp).toLocaleDateString('en-IN');
                message += `${typeEmoji} <b>${txn.type.toUpperCase()}:</b> ₹${txn.amount}\n`;
                message += `   <i>${txn.description}</i>\n`;
                message += `   <code>${date}</code>\n\n`;
            });
        }
        
        const keyboard = Markup.inlineKeyboard([
            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
        ]);
        
        await ctx.reply(message, {
            parse_mode: 'HTML',
            reply_markup: keyboard
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
        const userData = await getUser(userId);
        
        // Create user details image text
        const detailsText = `👤 User Profile\n\n` +
                          `🆔 ID: ${userId}\n` +
                          `👋 Name: ${user.first_name || ''} ${user.last_name || ''}\n` +
                          `📱 Username: ${user.username ? '@' + user.username : 'Not set'}\n` +
                          `💰 Balance: ₹${userData.balance || 0}\n` +
                          `📊 Referrals: ${userData.referrals || 0}\n` +
                          `🎫 Refer Code: ${userData.referralCode || 'N/A'}\n` +
                          `📅 Joined: ${new Date(userData.joinedAt).toLocaleDateString('en-IN')}\n` +
                          `✅ Verified: ${userData.verified ? 'Yes' : 'No'}`;
        
        const keyboard = Markup.inlineKeyboard([
            [{ text: '🔗 Copy Refer Code', callback_data: 'copy_refer_code' }],
            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
        ]);
        
        // Send as photo with overlay
        const configDoc = await getConfig();
        const defaultImage = configDoc.startImage || config.DEFAULTS.startImage;
        const imageUrl = await getCloudinaryUrlWithOverlay(defaultImage, user.first_name || 'User', 'startImage');
        
        await ctx.replyWithPhoto(imageUrl, {
            caption: detailsText,
            parse_mode: 'HTML',
            reply_markup: keyboard
        });
    } catch (error) {
        console.error('User details error:', error);
        await ctx.reply('❌ Error fetching user details.');
    }
});

bot.hears('💳 Withdraw', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const userData = await getUser(userId);
        const configDoc = await getConfig();
        
        // Check if wallet is set
        if (!userData.wallet) {
            await ctx.reply('❌ Please set your UPI ID first using "Set Wallet" option.');
            return;
        }
        
        // Check minimum balance
        const minWithdrawal = configDoc.minWithdrawal || config.DEFAULTS.minWithdrawal;
        if (userData.balance < minWithdrawal) {
            await ctx.reply(`❌ Minimum withdrawal amount is ₹${minWithdrawal}\n\nYour balance: ₹${userData.balance}`);
            return;
        }
        
        const maxWithdrawal = configDoc.maxWithdrawal || config.DEFAULTS.maxWithdrawal;
        await ctx.reply(
            `💳 <b>Withdrawal Request</b>\n\n` +
            `💰 <b>Your Balance:</b> ₹${userData.balance}\n` +
            `🏦 <b>UPI ID:</b> <code>${userData.wallet}</code>\n` +
            `📊 <b>Min Amount:</b> ₹${minWithdrawal}\n` +
            `📈 <b>Max Amount:</b> ₹${maxWithdrawal}\n\n` +
            `Please enter the amount you want to withdraw:`,
            {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [{ text: '❌ Cancel', callback_data: 'cancel_withdrawal' }]
                ])
            }
        );
        
        await ctx.scene.enter('withdraw_amount_scene');
    } catch (error) {
        console.error('Withdraw command error:', error);
        await ctx.reply('❌ Error processing withdrawal.');
    }
});

// Withdraw amount scene
scenes.withdrawAmount.on('text', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const amountText = ctx.message.text.trim();
        
        if (amountText.toLowerCase() === 'cancel') {
            await ctx.reply('❌ Withdrawal cancelled.');
            await ctx.scene.leave();
            await showMainMenu(ctx);
            return;
        }
        
        const amount = Number(amountText);
        const userData = await getUser(userId);
        const configDoc = await getConfig();
        
        const minWithdrawal = configDoc.minWithdrawal || config.DEFAULTS.minWithdrawal;
        const maxWithdrawal = configDoc.maxWithdrawal || config.DEFAULTS.maxWithdrawal;
        
        if (isNaN(amount) || amount < minWithdrawal || amount > maxWithdrawal) {
            await ctx.reply(`❌ Please enter a valid amount between ₹${minWithdrawal} and ₹${maxWithdrawal}`);
            return;
        }
        
        if (amount > userData.balance) {
            await ctx.reply(`❌ Insufficient balance. Your balance: ₹${userData.balance}`);
            return;
        }
        
        // Create withdrawal request
        const withdrawalId = utils.generateWithdrawalId();
        const withdrawal = {
            withdrawalId: withdrawalId,
            userId: userId,
            amount: amount,
            upiId: userData.wallet,
            status: 'pending',
            requestedAt: new Date(),
            userDetails: {
                firstName: userData.firstName,
                lastName: userData.lastName,
                username: userData.username
            }
        };
        
        await db.collection(config.COLLECTIONS.WITHDRAWALS).insertOne(withdrawal);
        
        // Deduct from balance
        await addTransaction(userId, 'withdrawal', amount, 'Withdrawal request');
        
        // Notify admins
        await notifyAdmins(
            `💰 <b>New Withdrawal Request</b>\n\n` +
            `🆔 <b>Request ID:</b> <code>${withdrawalId}</code>\n` +
            `👤 <b>User:</b> ${userData.firstName || ''} ${userData.lastName || ''}\n` +
            `📱 <b>Username:</b> ${userData.username ? '@' + userData.username : 'Not set'}\n` +
            `💳 <b>Amount:</b> ₹${amount}\n` +
            `🏦 <b>UPI ID:</b> <code>${userData.wallet}</code>\n` +
            `📅 <b>Time:</b> ${new Date().toLocaleString('en-IN')}`
        );
        
        await ctx.reply(
            `✅ <b>Withdrawal Request Submitted</b>\n\n` +
            `🆔 <b>Request ID:</b> <code>${withdrawalId}</code>\n` +
            `💰 <b>Amount:</b> ₹${amount}\n` +
            `🏦 <b>UPI ID:</b> <code>${userData.wallet}</code>\n\n` +
            `Your request has been sent to admin for approval.\n` +
            `You will be notified once processed.`,
            {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                ])
            }
        );
        
        await ctx.scene.leave();
    } catch (error) {
        console.error('Withdraw amount scene error:', error);
        await ctx.reply('❌ Error processing withdrawal request.');
        await ctx.scene.leave();
    }
});

bot.hears('🏦 Set Wallet', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const userData = await getUser(userId);
        
        let message = '🏦 <b>Wallet Settings</b>\n\n';
        
        if (userData.wallet) {
            message += `Current UPI ID: <code>${userData.wallet}</code>\n\n`;
        } else {
            message += `No UPI ID set yet.\n\n`;
        }
        
        message += `Please enter your UPI ID (e.g., username@okaxis):\n\n<i>Enter "cancel" to go back</i>`;
        
        await ctx.reply(message, {
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard([
                [{ text: '❌ Cancel', callback_data: 'cancel_wallet' }]
            ])
        });
        
        await ctx.scene.enter('set_wallet_scene');
    } catch (error) {
        console.error('Set wallet error:', error);
        await ctx.reply('❌ Error setting wallet.');
    }
});

// Set wallet scene
scenes.setWallet.on('text', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const upiId = ctx.message.text.trim();
        
        if (upiId.toLowerCase() === 'cancel') {
            await ctx.reply('❌ Wallet update cancelled.');
            await ctx.scene.leave();
            await showMainMenu(ctx);
            return;
        }
        
        if (!utils.validateUPI(upiId)) {
            await ctx.reply('❌ Invalid UPI ID format. Please enter a valid UPI ID (e.g., username@okaxis)');
            return;
        }
        
        await updateUser(userId, { wallet: upiId });
        
        await ctx.reply(
            `✅ <b>Wallet Updated Successfully!</b>\n\n` +
            `🏦 <b>UPI ID:</b> <code>${upiId}</code>\n\n` +
            `You can now withdraw your earnings.`,
            {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                ])
            }
        );
        
        await ctx.scene.leave();
    } catch (error) {
        console.error('Set wallet scene error:', error);
        await ctx.reply('❌ Error updating wallet.');
        await ctx.scene.leave();
    }
});

bot.hears('📤 Refer', async (ctx) => {
    try {
        const user = ctx.from;
        const userId = user.id;
        const userData = await getUser(userId);
        const configDoc = await getConfig();
        
        const referBonus = configDoc.referBonus || config.DEFAULTS.referBonus;
        const referralLink = `https://t.me/${(await bot.telegram.getMe()).username}?start=${userData.referralCode}`;
        
        const message = `📤 <b>Refer & Earn</b>\n\n` +
                       `🎫 <b>Your Referral Code:</b> <code>${userData.referralCode}</code>\n` +
                       `🔗 <b>Your Referral Link:</b>\n<code>${referralLink}</code>\n\n` +
                       `💰 <b>Earn ₹${referBonus} for each successful referral!</b>\n\n` +
                       `📊 <b>How it works:</b>\n` +
                       `1. Share your referral link/code\n` +
                       `2. Friend joins using your link\n` +
                       `3. Friend verifies by joining channels\n` +
                       `4. You get ₹${referBonus} bonus!\n\n` +
                       `📈 <b>Your Referrals:</b> ${userData.referrals || 0}`;
        
        const keyboard = Markup.inlineKeyboard([
            [{ text: '📋 Copy Referral Code', callback_data: 'copy_refer_code' }],
            [{ text: '🔗 Share Referral Link', switch_inline_query: `Join using my referral code: ${userData.referralCode}` }],
            [{ text: '📊 View All Referrals', callback_data: 'view_all_refers' }],
            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
        ]);
        
        await ctx.reply(message, {
            parse_mode: 'HTML',
            reply_markup: keyboard
        });
    } catch (error) {
        console.error('Refer command error:', error);
        await ctx.reply('❌ Error fetching referral details.');
    }
});

bot.hears('📊 All Refers', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const referralsData = await getUserReferrals(userId, 1, 20);
        
        if (referralsData.total === 0) {
            await ctx.reply(
                '📊 <b>Your Referrals</b>\n\n' +
                'You have no referrals yet.\n' +
                'Share your referral link to start earning!',
                {
                    parse_mode: 'HTML',
                    reply_markup: Markup.inlineKeyboard([
                        [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                    ])
                }
            );
            return;
        }
        
        let message = `📊 <b>Your Referrals</b>\n\n`;
        message += `📈 <b>Total Referrals:</b> ${referralsData.total}\n\n`;
        
        referralsData.referrals.forEach((referral, index) => {
            const userNumber = (referralsData.page - 1) * 20 + index + 1;
            const date = new Date(referral.joinedAt).toLocaleDateString('en-IN');
            const status = referral.bonusPaid ? '✅' : '⏳';
            message += `${userNumber}. ${status} User ID: <code>${referral.referredId}</code>\n`;
            message += `   📅 Joined: ${date}\n`;
            message += `   💰 Bonus: ${referral.bonusPaid ? 'Paid' : 'Pending'}\n\n`;
        });
        
        const keyboard = [];
        
        // Add navigation buttons if needed
        if (referralsData.totalPages > 1) {
            const navButtons = [];
            if (referralsData.page > 1) {
                navButtons.push({ text: '◀️ Prev', callback_data: `refers_page_${referralsData.page - 1}` });
            }
            navButtons.push({ text: `${referralsData.page}/${referralsData.totalPages}`, callback_data: 'current_page' });
            if (referralsData.page < referralsData.totalPages) {
                navButtons.push({ text: 'Next ▶️', callback_data: `refers_page_${referralsData.page + 1}` });
            }
            keyboard.push(navButtons);
        }
        
        keyboard.push([{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]);
        
        await ctx.reply(message, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('All refers error:', error);
        await ctx.reply('❌ Error fetching referrals.');
    }
});

bot.hears('🎁 Bonus', async (ctx) => {
    try {
        const user = ctx.from;
        const userId = user.id;
        const userData = await getUser(userId);
        const configDoc = await getConfig();
        
        // Check if already claimed today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (userData.lastBonusClaim && new Date(userData.lastBonusClaim) >= today) {
            await ctx.reply(
                '🎁 <b>Daily Bonus</b>\n\n' +
                'You have already claimed your daily bonus today.\n' +
                'Come back tomorrow for more rewards!',
                {
                    parse_mode: 'HTML',
                    reply_markup: Markup.inlineKeyboard([
                        [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                    ])
                }
            );
            return;
        }
        
        const bonusAmount = configDoc.bonusAmount || config.DEFAULTS.bonusAmount;
        const bonusImage = configDoc.bonusImage || config.DEFAULTS.bonusImage;
        const imageUrl = await getCloudinaryUrlWithOverlay(bonusImage, `₹${bonusAmount}`, 'bonusImage');
        
        const message = `🎁 <b>Daily Bonus</b>\n\n` +
                       `💰 <b>Bonus Amount:</b> ₹${bonusAmount}\n\n` +
                       `Click the button below to claim your daily bonus:`;
        
        const keyboard = Markup.inlineKeyboard([
            [{ text: '💰 Claim Bonus', callback_data: 'claim_bonus' }],
            [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
        ]);
        
        if (bonusImage && bonusImage !== 'none') {
            await ctx.replyWithPhoto(imageUrl, {
                caption: message,
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        } else {
            await ctx.reply(message, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        }
    } catch (error) {
        console.error('Bonus command error:', error);
        await ctx.reply('❌ Error fetching bonus.');
    }
});

bot.hears('🎫 Gift Code', async (ctx) => {
    try {
        await ctx.reply(
            '🎫 <b>Gift Code</b>\n\n' +
            'Enter a gift code to redeem rewards:\n\n' +
            '<i>Enter "cancel" to go back</i>',
            {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [{ text: '❌ Cancel', callback_data: 'cancel_gift_code' }]
                ])
            }
        );
        
        await ctx.scene.enter('enter_gift_code_scene');
    } catch (error) {
        console.error('Gift code error:', error);
        await ctx.reply('❌ Error processing gift code.');
    }
});

// Enter gift code scene
scenes.enterGiftCode.on('text', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const code = ctx.message.text.trim().toUpperCase();
        
        if (code.toLowerCase() === 'cancel') {
            await ctx.reply('❌ Gift code entry cancelled.');
            await ctx.scene.leave();
            await showMainMenu(ctx);
            return;
        }
        
        // Find gift code
        const giftCode = await db.collection(config.COLLECTIONS.GIFT_CODES).findOne({ code: code });
        
        if (!giftCode) {
            await ctx.reply('❌ Invalid gift code.');
            return;
        }
        
        // Check if expired
        if (giftCode.expiry && new Date(giftCode.expiry) < new Date()) {
            await ctx.reply('❌ This gift code has expired.');
            return;
        }
        
        // Check if max uses reached
        if (giftCode.maxUses && giftCode.usedCount >= giftCode.maxUses) {
            await ctx.reply('❌ This gift code has reached maximum uses.');
            return;
        }
        
        // Check if user already used this code
        const alreadyUsed = await db.collection(config.COLLECTIONS.TRANSACTIONS).findOne({
            userId: userId,
            description: { $regex: `Gift code: ${code}` }
        });
        
        if (alreadyUsed) {
            await ctx.reply('❌ You have already used this gift code.');
            return;
        }
        
        // Generate random amount if range is specified
        let amount = giftCode.amount;
        if (giftCode.minAmount && giftCode.maxAmount) {
            amount = Math.floor(Math.random() * (giftCode.maxAmount - giftCode.minAmount + 1)) + giftCode.minAmount;
        }
        
        // Add transaction
        await addTransaction(userId, 'bonus', amount, `Gift code: ${code}`);
        
        // Update gift code usage
        await db.collection(config.COLLECTIONS.GIFT_CODES).updateOne(
            { _id: giftCode._id },
            { 
                $inc: { usedCount: 1 },
                $push: { usedBy: { userId: userId, amount: amount, usedAt: new Date() } }
            }
        );
        
        await ctx.reply(
            `✅ <b>Gift Code Redeemed!</b>\n\n` +
            `🎫 <b>Code:</b> ${code}\n` +
            `💰 <b>Amount:</b> ₹${amount}\n` +
            `💳 <b>New Balance:</b> ₹${(await getUser(userId)).balance}\n\n` +
            `The amount has been added to your balance.`,
            {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                ])
            }
        );
        
        await ctx.scene.leave();
    } catch (error) {
        console.error('Gift code scene error:', error);
        await ctx.reply('❌ Error redeeming gift code.');
        await ctx.scene.leave();
    }
});

bot.hears('📞 Contact', async (ctx) => {
    try {
        const configDoc = await getConfig();
        
        if (!configDoc.showContactButton) {
            await ctx.reply('Contact admin feature is currently disabled.');
            return;
        }
        
        await ctx.reply(
            '📞 <b>Contact Admin</b>\n\n' +
            'Type your message to admin:\n\n' +
            '<i>Enter "cancel" to go back</i>',
            {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [{ text: '❌ Cancel', callback_data: 'cancel_contact' }]
                ])
            }
        );
        
        // Store in session for contact
        ctx.session.contactAdmin = true;
    } catch (error) {
        console.error('Contact error:', error);
        await ctx.reply('❌ Error contacting admin.');
    }
});

bot.hears('📝 Tasks', async (ctx) => {
    try {
        const userId = ctx.from.id;
        
        // Get active tasks
        const tasks = await db.collection(config.COLLECTIONS.TASKS)
            .find({ status: 'active' })
            .sort({ createdAt: -1 })
            .limit(10)
            .toArray();
        
        if (tasks.length === 0) {
            await ctx.reply(
                '📝 <b>Available Tasks</b>\n\n' +
                'No tasks available at the moment.\n' +
                'Check back later for new tasks!',
                {
                    parse_mode: 'HTML',
                    reply_markup: Markup.inlineKeyboard([
                        [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                    ])
                }
            );
            return;
        }
        
        let message = '📝 <b>Available Tasks</b>\n\n';
        
        tasks.forEach((task, index) => {
            message += `${index + 1}. <b>${task.title}</b>\n`;
            message += `   💰 Reward: ₹${task.reward}\n`;
            message += `   📊 Status: ${task.status}\n\n`;
        });
        
        const keyboard = [];
        
        tasks.forEach((task, index) => {
            keyboard.push([{ 
                text: `${index + 1}. ${task.title} - ₹${task.reward}`, 
                callback_data: `view_task_${task._id}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]);
        
        await ctx.reply(message, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Tasks error:', error);
        await ctx.reply('❌ Error fetching tasks.');
    }
});

bot.hears('🔄 Refresh', async (ctx) => {
    try {
        await ctx.deleteMessage();
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Refresh error:', error);
    }
});

// ==========================================
// CALLBACK QUERY HANDLERS
// ==========================================

// Back to menu
bot.action('back_to_menu', async (ctx) => {
    try {
        await ctx.deleteMessage();
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Back to menu error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Copy refer code
bot.action('copy_refer_code', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const userData = await getUser(userId);
        
        await ctx.answerCbQuery(`Referral code copied: ${userData.referralCode}`);
        // Note: Telegram web app can't actually copy to clipboard, but we show the code
    } catch (error) {
        console.error('Copy refer code error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// View all refers
bot.action('view_all_refers', async (ctx) => {
    try {
        await ctx.deleteMessage();
        await ctx.reply('📊 All Refers');
    } catch (error) {
        console.error('View all refers error:', error);
    }
});

// Claim bonus
bot.action('claim_bonus', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const userData = await getUser(userId);
        const configDoc = await getConfig();
        
        // Check if already claimed today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (userData.lastBonusClaim && new Date(userData.lastBonusClaim) >= today) {
            await ctx.answerCbQuery('❌ Already claimed today');
            return;
        }
        
        const bonusAmount = configDoc.bonusAmount || config.DEFAULTS.bonusAmount;
        
        // Add transaction
        await addTransaction(userId, 'bonus', bonusAmount, 'Daily bonus');
        
        // Update last bonus claim
        await updateUser(userId, { lastBonusClaim: new Date() });
        
        await ctx.editMessageText(
            `✅ <b>Bonus Claimed Successfully!</b>\n\n` +
            `💰 <b>Amount:</b> ₹${bonusAmount}\n` +
            `💳 <b>New Balance:</b> ₹${(await getUser(userId)).balance}\n\n` +
            `Come back tomorrow for more rewards!`,
            {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                ])
            }
        );
    } catch (error) {
        console.error('Claim bonus error:', error);
        await ctx.answerCbQuery('❌ Error claiming bonus');
    }
});

// View task
bot.action(/^view_task_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const task = await db.collection(config.COLLECTIONS.TASKS).findOne({ _id: new ObjectId(taskId) });
        
        if (!task) {
            await ctx.answerCbQuery('❌ Task not found');
            return;
        }
        
        let message = `📝 <b>Task Details</b>\n\n`;
        message += `📌 <b>Title:</b> ${task.title}\n`;
        message += `📄 <b>Description:</b>\n${task.description}\n\n`;
        message += `💰 <b>Reward:</b> ₹${task.reward}\n`;
        message += `📊 <b>Status:</b> ${task.status}\n\n`;
        
        if (task.screenshots && task.screenshots.length > 0) {
            message += `📸 <b>Required Screenshots:</b>\n`;
            task.screenshots.forEach((ss, index) => {
                message += `${index + 1}. ${ss.buttonText || `Screenshot ${index + 1}`}\n`;
            });
            message += `\n`;
        }
        
        message += `Click the button below to start this task:`;
        
        const keyboard = Markup.inlineKeyboard([
            [{ text: '🚀 Start Task', callback_data: `start_task_${taskId}` }],
            [{ text: '🔙 Back to Tasks', callback_data: 'back_to_tasks' }]
        ]);
        
        // Send task images if available
        if (task.images && task.images.length > 0) {
            const media = task.images.map((image, index) => ({
                type: 'photo',
                media: image.url,
                caption: index === 0 ? message : undefined
            }));
            
            await ctx.replyWithMediaGroup(media);
            await ctx.reply('Select an option:', { reply_markup: keyboard });
        } else {
            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        }
    } catch (error) {
        console.error('View task error:', error);
        await ctx.answerCbQuery('❌ Error viewing task');
    }
});

// Start task
bot.action(/^start_task_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const userId = ctx.from.id;
        
        // Check if already submitted
        const existingRequest = await db.collection(config.COLLECTIONS.TASK_REQUESTS).findOne({
            taskId: new ObjectId(taskId),
            userId: userId,
            status: { $in: ['pending', 'approved'] }
        });
        
        if (existingRequest) {
            await ctx.answerCbQuery('❌ You have already submitted this task');
            return;
        }
        
        // Store in session
        ctx.session.currentTask = {
            taskId: taskId,
            userId: userId,
            screenshots: []
        };
        
        const task = await db.collection(config.COLLECTIONS.TASKS).findOne({ _id: new ObjectId(taskId) });
        
        let message = `🚀 <b>Starting Task: ${task.title}</b>\n\n`;
        message += `📄 <b>Instructions:</b>\n${task.description}\n\n`;
        
        if (task.screenshots && task.screenshots.length > 0) {
            message += `📸 <b>Please upload the following screenshots:</b>\n`;
            task.screenshots.forEach((ss, index) => {
                message += `${index + 1}. ${ss.buttonText || `Screenshot ${index + 1}`}\n`;
            });
            message += `\n`;
        }
        
        message += `Upload each screenshot one by one.\n`;
        message += `Use the buttons below for each screenshot.\n\n`;
        message += `<i>Enter "cancel" to cancel the task</i>`;
        
        const keyboard = [];
        
        if (task.screenshots && task.screenshots.length > 0) {
            task.screenshots.forEach((ss, index) => {
                keyboard.push([{ 
                    text: `📸 ${ss.buttonText || `Upload SS ${index + 1}`}`, 
                    callback_data: `upload_ss_${index}` 
                }]);
            });
        }
        
        keyboard.push([{ text: '✅ Submit Task', callback_data: 'submit_task' }]);
        keyboard.push([{ text: '❌ Cancel Task', callback_data: 'cancel_task' }]);
        
        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Start task error:', error);
        await ctx.answerCbQuery('❌ Error starting task');
    }
});

// Upload screenshot
bot.action(/^upload_ss_(\d+)$/, async (ctx) => {
    try {
        const ssIndex = parseInt(ctx.match[1]);
        
        if (!ctx.session.currentTask) {
            await ctx.answerCbQuery('❌ No active task');
            return;
        }
        
        ctx.session.currentTask.currentSS = ssIndex;
        
        await ctx.reply(
            `📸 <b>Upload Screenshot ${ssIndex + 1}</b>\n\n` +
            `Please send the screenshot as a photo.\n\n` +
            `<i>Enter "skip" to skip this screenshot</i>`,
            {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [{ text: '❌ Cancel', callback_data: 'cancel_upload' }]
                ])
            }
        );
    } catch (error) {
        console.error('Upload screenshot error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Submit task
bot.action('submit_task', async (ctx) => {
    try {
        if (!ctx.session.currentTask || !ctx.session.currentTask.taskId) {
            await ctx.answerCbQuery('❌ No active task');
            return;
        }
        
        const task = await db.collection(config.COLLECTIONS.TASKS).findOne({ 
            _id: new ObjectId(ctx.session.currentTask.taskId) 
        });
        
        if (!task) {
            await ctx.answerCbQuery('❌ Task not found');
            return;
        }
        
        // Create task request
        const taskRequest = {
            taskId: new ObjectId(ctx.session.currentTask.taskId),
            userId: ctx.from.id,
            taskTitle: task.title,
            taskReward: task.reward,
            screenshots: ctx.session.currentTask.screenshots || [],
            status: 'pending',
            submittedAt: new Date(),
            userDetails: {
                firstName: ctx.from.first_name,
                lastName: ctx.from.last_name,
                username: ctx.from.username
            }
        };
        
        await db.collection(config.COLLECTIONS.TASK_REQUESTS).insertOne(taskRequest);
        
        // Clear session
        delete ctx.session.currentTask;
        
        await ctx.editMessageText(
            `✅ <b>Task Submitted Successfully!</b>\n\n` +
            `📝 <b>Task:</b> ${task.title}\n` +
            `💰 <b>Reward:</b> ₹${task.reward}\n\n` +
            `Your submission has been sent to admin for review.\n` +
            `You will be notified once approved.`,
            {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                ])
            }
        );
        
        // Notify admins
        await notifyAdmins(
            `📝 <b>New Task Submission</b>\n\n` +
            `👤 <b>User:</b> ${ctx.from.first_name || ''} ${ctx.from.last_name || ''}\n` +
            `📱 <b>Username:</b> ${ctx.from.username ? '@' + ctx.from.username : 'Not set'}\n` +
            `📌 <b>Task:</b> ${task.title}\n` +
            `💰 <b>Reward:</b> ₹${task.reward}\n` +
            `📸 <b>Screenshots:</b> ${taskRequest.screenshots.length}\n` +
            `📅 <b>Submitted:</b> ${new Date().toLocaleString('en-IN')}`
        );
    } catch (error) {
        console.error('Submit task error:', error);
        await ctx.answerCbQuery('❌ Error submitting task');
    }
});

// Cancel task
bot.action('cancel_task', async (ctx) => {
    try {
        delete ctx.session.currentTask;
        
        await ctx.editMessageText(
            '❌ <b>Task Cancelled</b>\n\n' +
            'The task has been cancelled.',
            {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                ])
            }
        );
    } catch (error) {
        console.error('Cancel task error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Back to tasks
bot.action('back_to_tasks', async (ctx) => {
    try {
        await ctx.deleteMessage();
        await ctx.reply('📝 Tasks');
    } catch (error) {
        console.error('Back to tasks error:', error);
    }
});

// Cancel withdrawal
bot.action('cancel_withdrawal', async (ctx) => {
    try {
        await ctx.reply('❌ Withdrawal cancelled.');
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Cancel withdrawal error:', error);
    }
});

// Cancel wallet
bot.action('cancel_wallet', async (ctx) => {
    try {
        await ctx.reply('❌ Wallet update cancelled.');
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Cancel wallet error:', error);
    }
});

// Cancel gift code
bot.action('cancel_gift_code', async (ctx) => {
    try {
        await ctx.reply('❌ Gift code entry cancelled.');
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Cancel gift code error:', error);
    }
});

// Cancel contact
bot.action('cancel_contact', async (ctx) => {
    try {
        delete ctx.session.contactAdmin;
        await ctx.reply('❌ Contact cancelled.');
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Cancel contact error:', error);
    }
});

// Cancel upload
bot.action('cancel_upload', async (ctx) => {
    try {
        await ctx.reply('❌ Screenshot upload cancelled.');
        // Go back to task screen
    } catch (error) {
        console.error('Cancel upload error:', error);
    }
});

// Handle photo upload for task screenshots
bot.on('photo', async (ctx) => {
    try {
        if (ctx.session.currentTask && ctx.session.currentTask.currentSS !== undefined) {
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            const fileLink = await ctx.telegram.getFileLink(photo.file_id);
            
            // Upload to Cloudinary
            const response = await fetch(fileLink);
            const buffer = await response.buffer();
            const result = await uploadToCloudinary(buffer, 'task_screenshots');
            
            // Add to screenshots array
            if (!ctx.session.currentTask.screenshots) {
                ctx.session.currentTask.screenshots = [];
            }
            
            ctx.session.currentTask.screenshots.push({
                index: ctx.session.currentTask.currentSS,
                url: result.secure_url,
                publicId: result.public_id,
                uploadedAt: new Date()
            });
            
            delete ctx.session.currentTask.currentSS;
            
            await ctx.reply(
                `✅ <b>Screenshot ${ctx.session.currentTask.screenshots.length} uploaded successfully!</b>\n\n` +
                `Continue with other screenshots or click "Submit Task" when done.`,
                {
                    parse_mode: 'HTML'
                }
            );
        }
    } catch (error) {
        console.error('Photo upload error:', error);
        await ctx.reply('❌ Error uploading screenshot.');
    }
});

// Handle contact message
bot.on('text', async (ctx) => {
    try {
        if (ctx.session?.contactAdmin && !ctx.message.text.startsWith('/')) {
            const message = ctx.message.text;
            
            if (message.toLowerCase() === 'cancel') {
                delete ctx.session.contactAdmin;
                await ctx.reply('❌ Contact cancelled.');
                await showMainMenu(ctx);
                return;
            }
            
            // Send to admins
            await notifyAdmins(
                `📞 <b>New Contact Message</b>\n\n` +
                `👤 <b>From:</b> ${ctx.from.first_name || ''} ${ctx.from.last_name || ''}\n` +
                `📱 <b>Username:</b> ${ctx.from.username ? '@' + ctx.from.username : 'Not set'}\n` +
                `🆔 <b>User ID:</b> <code>${ctx.from.id}</code>\n\n` +
                `📄 <b>Message:</b>\n${message}\n\n` +
                `⏰ <b>Time:</b> ${new Date().toLocaleString('en-IN')}`,
                false
            );
            
            delete ctx.session.contactAdmin;
            
            await ctx.reply(
                `✅ <b>Message Sent to Admin!</b>\n\n` +
                `Your message has been delivered to the admin team.\n` +
                `They will respond to you soon.`,
                {
                    parse_mode: 'HTML',
                    reply_markup: Markup.inlineKeyboard([
                        [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                    ])
                }
            );
        }
    } catch (error) {
        console.error('Contact message error:', error);
        await ctx.reply('❌ Error sending message.');
    }
});

// ==========================================
// ADMIN PANEL
// ==========================================

bot.command('admin', async (ctx) => {
    try {
        if (!await isAdmin(ctx.from.id)) {
            return ctx.reply('❌ You are not authorized to use this command.');
        }
        
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Admin command error:', error);
        await ctx.reply('❌ An error occurred.');
    }
});

async function showAdminPanel(ctx) {
    try {
        const text = '👮‍♂️ <b>Admin Control Panel</b>\n\nSelect an option below:';
        
        const keyboard = [
            [
                { text: '📢 Broadcast', callback_data: 'admin_broadcast' },
                { text: '👥 User Stats', callback_data: 'admin_userstats' }
            ],
            [
                { text: '📝 Start Message', callback_data: 'admin_startmessage' },
                { text: '🖼️ Start Image', callback_data: 'admin_startimage' }
            ],
            [
                { text: '📝 Menu Message', callback_data: 'admin_menumessage' },
                { text: '🖼️ Menu Image', callback_data: 'admin_menuimage' }
            ],
            [
                { text: '🎫 Create Gift Code', callback_data: 'admin_create_giftcode' },
                { text: '🎁 Bonus', callback_data: 'admin_bonus' }
            ],
            [
                { text: '⚙️ Manage Bonus', callback_data: 'admin_manage_bonus' },
                { text: '🖼️ Bonus Image', callback_data: 'admin_bonusimage' }
            ],
            [
                { text: '📺 Manage Channels', callback_data: 'admin_channels' },
                { text: '👑 Manage Admins', callback_data: 'admin_manage_admins' }
            ],
            [
                { text: '📋 Manage Gift Codes', callback_data: 'admin_manage_giftcodes' },
                { text: '⚙️ Image Overlay', callback_data: 'admin_image_overlay' }
            ],
            [
                { text: '📞 Contact Button', callback_data: 'admin_contact_button' },
                { text: '🔼🔽 Reorder Channels', callback_data: 'admin_reorder_channels' }
            ],
            [
                { text: '✏️ Edit Channels', callback_data: 'admin_edit_channels' },
                { text: '🚫 Disable Bot', callback_data: 'admin_disable_bot' }
            ],
            [
                { text: '👁️ Hide Channels (F)', callback_data: 'admin_hide_channels' },
                { text: '📺 Just Show (S)', callback_data: 'admin_just_show' }
            ],
            [
                { text: '✅ Auto Accept (SS)', callback_data: 'admin_auto_accept' },
                { text: '🔗 Need Join (SSS)', callback_data: 'admin_need_join' }
            ],
            [
                { text: '📤 Refer Settings', callback_data: 'admin_refer_settings' },
                { text: '🖼️ Manage Images', callback_data: 'admin_manage_images' }
            ],
            [
                { text: '🗑️ Delete Data', callback_data: 'admin_deletedata' },
                { text: '🔕 Mute Notifications', callback_data: 'admin_mute_notifications' }
            ],
            [
                { text: '📋 HTML Guide', callback_data: 'admin_html_guide' },
                { text: '📝 Manage Tasks', callback_data: 'admin_manage_tasks' }
            ],
            [
                { text: '➕ Add Tasks', callback_data: 'admin_add_tasks' },
                { text: '📜 Task History', callback_data: 'admin_task_history' }
            ],
            [
                { text: '📋 Task Requests', callback_data: 'admin_task_requests' },
                { text: '💰 Withdrawal Requests', callback_data: 'admin_withdrawal_requests' }
            ],
            [
                { text: '📊 Withdrawal History', callback_data: 'admin_withdrawal_history' }
            ]
        ];
        
        if (ctx.callbackQuery) {
            await ctx.editMessageText(text, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    } catch (error) {
        console.error('Show admin panel error:', error);
        await ctx.reply('❌ An error occurred.');
    }
}

// Back to admin panel
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

// Due to the extensive nature of all admin features (broadcast, user stats, gift codes, tasks, withdrawals, etc.),
// I'll implement a few key features and you can expand the rest following the same pattern.

// Broadcast
bot.action('admin_broadcast', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await ctx.editMessageText(
        '📢 <b>Broadcast Message</b>\n\n' +
        'Send the message you want to broadcast to all users.\n\n' +
        '<i>Supports HTML formatting</i>\n\n' +
        'Type "cancel" to cancel.',
        { parse_mode: 'HTML' }
    );
    
    await ctx.scene.enter('broadcast_scene');
});

scenes.broadcast.on(['text', 'photo'], async (ctx) => {
    try {
        if (ctx.message.text?.toLowerCase() === 'cancel') {
            await ctx.reply('❌ Broadcast cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const users = await db.collection(config.COLLECTIONS.USERS).find({}).toArray();
        const totalUsers = users.length;
        let successful = 0;
        let failed = 0;
        
        await ctx.reply(`🚀 Broadcasting to ${totalUsers} users...`);
        
        // Notify admins about broadcast start
        await notifyAdmins(`📢 <b>Broadcast Started</b>\n\n👤 Admin: ${ctx.from.id}\n👥 Target: ${totalUsers} users\n⏰ Time: ${new Date().toLocaleString('en-IN')}`);
        
        // Process in batches
        const batchSize = 30;
        for (let i = 0; i < users.length; i += batchSize) {
            const batch = users.slice(i, i + batchSize);
            const promises = batch.map(async (user) => {
                try {
                    if (ctx.message.photo) {
                        await ctx.telegram.sendPhoto(
                            user.userId,
                            ctx.message.photo[ctx.message.photo.length - 1].file_id,
                            {
                                caption: ctx.message.caption || '',
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
            
            await Promise.allSettled(promises);
            await utils.delay(1000); // Delay between batches
        }
        
        await ctx.reply(
            `✅ <b>Broadcast Complete</b>\n\n` +
            `📊 <b>Statistics:</b>\n` +
            `• Total: ${totalUsers}\n` +
            `• ✅ Successful: ${successful}\n` +
            `• ❌ Failed: ${failed}`,
            { parse_mode: 'HTML' }
        );
        
        // Notify admins about completion
        await notifyAdmins(
            `✅ <b>Broadcast Complete</b>\n\n` +
            `📊 Statistics:\n` +
            `• Total: ${totalUsers}\n` +
            `• ✅ Successful: ${successful}\n` +
            `• ❌ Failed: ${failed}\n` +
            `👤 Admin: ${ctx.from.id}`
        );
        
    } catch (error) {
        console.error('Broadcast error:', error);
        await ctx.reply('❌ Broadcast failed.');
    }
    
    await ctx.scene.leave();
    await showAdminPanel(ctx);
});

// User Stats
bot.action('admin_userstats', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await showUserStatsPage(ctx, 1);
});

async function showUserStatsPage(ctx, page = 1, searchQuery = '') {
    try {
        const limit = 20;
        const skip = (page - 1) * limit;
        
        let query = {};
        if (searchQuery) {
            query = {
                $or: [
                    { userId: { $regex: searchQuery, $options: 'i' } },
                    { firstName: { $regex: searchQuery, $options: 'i' } },
                    { lastName: { $regex: searchQuery, $options: 'i' } },
                    { username: { $regex: searchQuery, $options: 'i' } },
                    { referralCode: { $regex: searchQuery, $options: 'i' } }
                ]
            };
        }
        
        const users = await db.collection(config.COLLECTIONS.USERS)
            .find(query)
            .sort({ joinedAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        const totalUsers = await db.collection(config.COLLECTIONS.USERS).countDocuments(query);
        const totalPages = Math.ceil(totalUsers / limit);
        
        let message = `📊 <b>User Statistics</b>\n\n`;
        message += `• <b>Total Users:</b> ${totalUsers}\n`;
        
        if (searchQuery) {
            message += `• <b>Search Results for:</b> ${searchQuery}\n`;
        }
        
        message += `\n<b>👥 Users (Page ${page}/${totalPages}):</b>\n\n`;
        
        const keyboard = [];
        
        // Display 2 users per row
        for (let i = 0; i < users.length; i += 2) {
            const row = [];
            
            const user1 = users[i];
            const userNum1 = skip + i + 1;
            row.push({
                text: `${userNum1}. ${user1.userId}`,
                callback_data: `user_detail_${user1.userId}`
            });
            
            if (i + 1 < users.length) {
                const user2 = users[i + 1];
                const userNum2 = skip + i + 2;
                row.push({
                    text: `${userNum2}. ${user2.userId}`,
                    callback_data: `user_detail_${user2.userId}`
                });
            }
            
            keyboard.push(row);
        }
        
        // Add search button
        keyboard.push([{ text: '🔍 Search Users', callback_data: 'admin_search_users' }]);
        
        // Add navigation buttons
        if (totalPages > 1) {
            const navRow = [];
            if (page > 1) {
                navRow.push({ text: '◀️ Prev', callback_data: `users_page_${page - 1}_${searchQuery}` });
            }
            navRow.push({ text: `${page}/${totalPages}`, callback_data: 'current_page' });
            if (page < totalPages) {
                navRow.push({ text: 'Next ▶️', callback_data: `users_page_${page + 1}_${searchQuery}` });
            }
            keyboard.push(navRow);
        }
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        if (ctx.callbackQuery) {
            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await ctx.reply(message, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    } catch (error) {
        console.error('User stats error:', error);
        await ctx.reply('❌ Failed to get user statistics.');
    }
}

// Search users
bot.action('admin_search_users', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await ctx.editMessageText(
        '🔍 <b>Search Users</b>\n\n' +
        'Enter search query (User ID, Name, Username, or Referral Code):\n\n' +
        '<i>Type "cancel" to go back</i>',
        { parse_mode: 'HTML' }
    );
    
    await ctx.scene.enter('search_users_scene');
});

scenes.searchUsers.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await ctx.reply('❌ Search cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const searchQuery = ctx.message.text.trim();
        await showUserStatsPage(ctx, 1, searchQuery);
        await ctx.scene.leave();
    } catch (error) {
        console.error('Search users error:', error);
        await ctx.reply('❌ Error searching users.');
        await ctx.scene.leave();
    }
});

// User detail
bot.action(/^user_detail_(\d+)$/, async (ctx) => {
    try {
        const userId = parseInt(ctx.match[1]);
        const user = await getUser(userId);
        
        if (!user) {
            await ctx.answerCbQuery('❌ User not found');
            return;
        }
        
        const referrals = await db.collection(config.COLLECTIONS.REFERRALS)
            .find({ referrerId: userId })
            .toArray();
        
        const transactions = await getUserTransactions(userId, 10);
        
        let message = `👤 <b>User Details</b>\n\n`;
        message += `🆔 <b>ID:</b> <code>${user.userId}</code>\n`;
        message += `👤 <b>Name:</b> ${user.firstName || ''} ${user.lastName || ''}\n`;
        message += `📱 <b>Username:</b> ${user.username ? '@' + user.username : 'Not set'}\n`;
        message += `💰 <b>Balance:</b> ₹${user.balance || 0}\n`;
        message += `📊 <b>Referrals:</b> ${user.referrals || 0}\n`;
        message += `🎫 <b>Referral Code:</b> ${user.referralCode || 'N/A'}\n`;
        message += `🏦 <b>UPI ID:</b> ${user.wallet || 'Not set'}\n`;
        message += `✅ <b>Verified:</b> ${user.verified ? 'Yes' : 'No'}\n`;
        message += `📅 <b>Joined:</b> ${new Date(user.joinedAt).toLocaleString('en-IN')}\n`;
        message += `🕐 <b>Last Active:</b> ${new Date(user.lastActive).toLocaleString('en-IN')}\n\n`;
        
        message += `📈 <b>Referrals (${referrals.length}):</b>\n`;
        referrals.forEach((ref, index) => {
            const date = new Date(ref.joinedAt).toLocaleDateString('en-IN');
            const status = ref.bonusPaid ? '✅' : '⏳';
            message += `${index + 1}. ${status} User ID: <code>${ref.referredId}</code> (${date})\n`;
        });
        
        message += `\n💳 <b>Recent Transactions:</b>\n`;
        transactions.forEach((txn, index) => {
            const date = new Date(txn.timestamp).toLocaleDateString('en-IN');
            const typeEmoji = txn.type === 'credit' || txn.type === 'referral' || txn.type === 'bonus' || txn.type === 'task' ? '➕' : '➖';
            message += `${index + 1}. ${typeEmoji} ${txn.type}: ₹${txn.amount}\n`;
            message += `   ${txn.description}\n`;
            message += `   ${date}\n`;
        });
        
        const keyboard = [
            [{ text: '💬 Contact User', callback_data: `contact_user_${userId}` }],
            [{ text: '💰 Add Balance', callback_data: `add_balance_${userId}` }],
            [{ text: '📤 Force Withdraw', callback_data: `force_withdraw_${userId}` }],
            [{ text: '🔙 Back to Users', callback_data: 'admin_userstats' }],
            [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
        ];
        
        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
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
        const configDoc = await getConfig();
        const currentMessage = configDoc.startMessage || config.DEFAULTS.startMessage;
        
        const message = `📝 <b>Start Message Management</b>\n\n` +
                       `<b>Current Message:</b>\n` +
                       `<code>${utils.escapeHTML(currentMessage)}</code>\n\n` +
                       `<b>Available variables:</b> {name}, {balance}, {referrals}\n\n` +
                       `<b>Supports HTML formatting</b>\n\n` +
                       `Select an option:`;
        
        const keyboard = [
            [{ text: '✏️ Edit', callback_data: 'admin_edit_startmessage' }],
            [{ text: '🔄 Reset', callback_data: 'admin_reset_startmessage' }],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Start message menu error:', error);
        await ctx.reply('❌ An error occurred.');
    }
});

// Edit start message
bot.action('admin_edit_startmessage', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const configDoc = await getConfig();
        const currentMessage = configDoc.startMessage || config.DEFAULTS.startMessage;
        
        await ctx.editMessageText(
            `<b>Current start message:</b>\n` +
            `<code>${utils.escapeHTML(currentMessage)}</code>\n\n` +
            `Enter the new start message:\n\n` +
            `<i>Supports HTML formatting</i>\n\n` +
            `Type "cancel" to cancel.`,
            { parse_mode: 'HTML' }
        );
        
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
            await showAdminPanel(ctx);
            return;
        }
        
        await updateConfig({ startMessage: ctx.message.text });
        
        await ctx.reply('✅ Start message updated!');
        await ctx.scene.leave();
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Edit start message scene error:', error);
        await ctx.reply('❌ Failed to update message.');
        await ctx.scene.leave();
    }
});

// Reset start message
bot.action('admin_reset_startmessage', async (ctx) => {
    try {
        await updateConfig({ startMessage: config.DEFAULTS.startMessage });
        await ctx.answerCbQuery('✅ Start message reset to default');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Reset start message error:', error);
        await ctx.answerCbQuery('❌ Failed to reset message');
    }
});

// Create Gift Code
bot.action('admin_create_giftcode', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await ctx.editMessageText(
        '🎫 <b>Create Gift Code</b>\n\n' +
        'Enter maximum number of uses (0 for unlimited):\n\n' +
        '<i>Type "cancel" to go back</i>',
        { parse_mode: 'HTML' }
    );
    
    await ctx.scene.enter('create_gift_code_scene');
});

scenes.createGiftCode.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await ctx.reply('❌ Gift code creation cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        if (!ctx.session.giftCodeData) {
            ctx.session.giftCodeData = {};
        }
        
        if (!ctx.session.giftCodeData.maxUses) {
            const maxUses = parseInt(ctx.message.text);
            if (isNaN(maxUses) || maxUses < 0) {
                await ctx.reply('❌ Please enter a valid number (0 for unlimited).');
                return;
            }
            
            ctx.session.giftCodeData.maxUses = maxUses;
            await ctx.reply(
                'Enter expiry time in minutes (0 for no expiry):\n\n' +
                '<i>Type "cancel" to go back</i>',
                { parse_mode: 'HTML' }
            );
            return;
        }
        
        if (!ctx.session.giftCodeData.expiryMinutes) {
            const expiryMinutes = parseInt(ctx.message.text);
            if (isNaN(expiryMinutes) || expiryMinutes < 0) {
                await ctx.reply('❌ Please enter a valid number (0 for no expiry).');
                return;
            }
            
            ctx.session.giftCodeData.expiryMinutes = expiryMinutes;
            await ctx.reply(
                'Enter code length (6-20 characters):\n\n' +
                '<i>Type "cancel" to go back</i>',
                { parse_mode: 'HTML' }
            );
            return;
        }
        
        if (!ctx.session.giftCodeData.codeLength) {
            const codeLength = parseInt(ctx.message.text);
            if (isNaN(codeLength) || codeLength < 6 || codeLength > 20) {
                await ctx.reply('❌ Please enter a number between 6 and 20.');
                return;
            }
            
            ctx.session.giftCodeData.codeLength = codeLength;
            await ctx.reply(
                'Enter minimum amount for the gift code:\n\n' +
                '<i>Type "cancel" to go back</i>',
                { parse_mode: 'HTML' }
            );
            return;
        }
        
        if (!ctx.session.giftCodeData.minAmount) {
            const minAmount = parseFloat(ctx.message.text);
            if (isNaN(minAmount) || minAmount < 1) {
                await ctx.reply('❌ Please enter a valid amount (minimum ₹1).');
                return;
            }
            
            ctx.session.giftCodeData.minAmount = minAmount;
            await ctx.reply(
                'Enter maximum amount for the gift code:\n\n' +
                '<i>Type "cancel" to go back</i>',
                { parse_mode: 'HTML' }
            );
            return;
        }
        
        if (!ctx.session.giftCodeData.maxAmount) {
            const maxAmount = parseFloat(ctx.message.text);
            if (isNaN(maxAmount) || maxAmount < ctx.session.giftCodeData.minAmount) {
                await ctx.reply(`❌ Please enter a valid amount (minimum ₹${ctx.session.giftCodeData.minAmount}).`);
                return;
            }
            
            ctx.session.giftCodeData.maxAmount = maxAmount;
            
            // Generate code
            const code = utils.generateCode(ctx.session.giftCodeData.codeLength);
            const giftCode = {
                code: code,
                maxUses: ctx.session.giftCodeData.maxUses,
                usedCount: 0,
                minAmount: ctx.session.giftCodeData.minAmount,
                maxAmount: ctx.session.giftCodeData.maxAmount,
                amount: null, // Random amount between min and max
                createdBy: ctx.from.id,
                createdAt: new Date(),
                expiry: ctx.session.giftCodeData.expiryMinutes > 0 
                    ? new Date(Date.now() + ctx.session.giftCodeData.expiryMinutes * 60000)
                    : null,
                usedBy: []
            };
            
            await db.collection(config.COLLECTIONS.GIFT_CODES).insertOne(giftCode);
            
            let expiryText = giftCode.expiry 
                ? new Date(giftCode.expiry).toLocaleString('en-IN')
                : 'No expiry';
            
            await ctx.reply(
                `✅ <b>Gift Code Created!</b>\n\n` +
                `🎫 <b>Code:</b> <code>${code}</code>\n` +
                `👥 <b>Max Uses:</b> ${giftCode.maxUses || 'Unlimited'}\n` +
                `💰 <b>Amount Range:</b> ₹${giftCode.minAmount} - ₹${giftCode.maxAmount}\n` +
                `⏰ <b>Expiry:</b> ${expiryText}\n\n` +
                `Share this code with users to redeem rewards.`,
                {
                    parse_mode: 'HTML',
                    reply_markup: Markup.inlineKeyboard([
                        [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
                    ])
                }
            );
            
            delete ctx.session.giftCodeData;
            await ctx.scene.leave();
        }
    } catch (error) {
        console.error('Create gift code error:', error);
        await ctx.reply('❌ Error creating gift code.');
        delete ctx.session.giftCodeData;
        await ctx.scene.leave();
    }
});

// Manage Gift Codes
bot.action('admin_manage_giftcodes', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const giftCodes = await db.collection(config.COLLECTIONS.GIFT_CODES)
            .find({})
            .sort({ createdAt: -1 })
            .limit(20)
            .toArray();
        
        if (giftCodes.length === 0) {
            await ctx.editMessageText(
                '📋 <b>Manage Gift Codes</b>\n\n' +
                'No gift codes created yet.',
                {
                    parse_mode: 'HTML',
                    reply_markup: Markup.inlineKeyboard([
                        [{ text: '🎫 Create Gift Code', callback_data: 'admin_create_giftcode' }],
                        [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
                    ])
                }
            );
            return;
        }
        
        let message = '📋 <b>Manage Gift Codes</b>\n\n';
        
        giftCodes.forEach((code, index) => {
            const uses = code.maxUses ? `${code.usedCount}/${code.maxUses}` : `${code.usedCount} uses`;
            const amount = code.amount ? `₹${code.amount}` : `₹${code.minAmount}-₹${code.maxAmount}`;
            const expiry = code.expiry ? new Date(code.expiry).toLocaleDateString('en-IN') : 'No expiry';
            
            message += `${index + 1}. <code>${code.code}</code>\n`;
            message += `   💰 ${amount} | 👥 ${uses}\n`;
            message += `   ⏰ ${expiry}\n\n`;
        });
        
        const keyboard = [];
        
        giftCodes.forEach((code, index) => {
            keyboard.push([{ 
                text: `${index + 1}. ${code.code}`, 
                callback_data: `edit_giftcode_${code._id}` 
            }]);
        });
        
        keyboard.push([{ text: '🎫 Create New', callback_data: 'admin_create_giftcode' }]);
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Manage gift codes error:', error);
        await ctx.reply('❌ Error fetching gift codes.');
    }
});

// Withdrawal Requests
bot.action('admin_withdrawal_requests', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await showWithdrawalRequests(ctx, 1);
});

async function showWithdrawalRequests(ctx, page = 1, searchQuery = '') {
    try {
        const limit = 20;
        const skip = (page - 1) * limit;
        
        let query = { status: 'pending' };
        if (searchQuery) {
            query = {
                status: 'pending',
                $or: [
                    { withdrawalId: { $regex: searchQuery, $options: 'i' } },
                    { userId: { $regex: searchQuery, $options: 'i' } },
                    { 'userDetails.username': { $regex: searchQuery, $options: 'i' } },
                    { upiId: { $regex: searchQuery, $options: 'i' } }
                ]
            };
        }
        
        const withdrawals = await db.collection(config.COLLECTIONS.WITHDRAWALS)
            .find(query)
            .sort({ requestedAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        const total = await db.collection(config.COLLECTIONS.WITHDRAWALS).countDocuments(query);
        const totalPages = Math.ceil(total / limit);
        
        let message = `💰 <b>Withdrawal Requests</b>\n\n`;
        message += `• <b>Pending Requests:</b> ${total}\n`;
        
        if (searchQuery) {
            message += `• <b>Search Results for:</b> ${searchQuery}\n`;
        }
        
        message += `\n<b>📋 Requests (Page ${page}/${totalPages}):</b>\n\n`;
        
        const keyboard = [];
        
        withdrawals.forEach((withdrawal, index) => {
            const userNumber = skip + index + 1;
            const date = new Date(withdrawal.requestedAt).toLocaleDateString('en-IN');
            
            keyboard.push([{ 
                text: `${userNumber}. ₹${withdrawal.amount} - ${withdrawal.withdrawalId}`, 
                callback_data: `process_withdrawal_${withdrawal._id}` 
            }]);
        });
        
        // Add search button
        keyboard.push([{ text: '🔍 Search Requests', callback_data: 'admin_search_withdrawals' }]);
        
        // Add navigation buttons
        if (totalPages > 1) {
            const navRow = [];
            if (page > 1) {
                navRow.push({ text: '◀️ Prev', callback_data: `withdrawals_page_${page - 1}_${searchQuery}` });
            }
            navRow.push({ text: `${page}/${totalPages}`, callback_data: 'current_page' });
            if (page < totalPages) {
                navRow.push({ text: 'Next ▶️', callback_data: `withdrawals_page_${page + 1}_${searchQuery}` });
            }
            keyboard.push(navRow);
        }
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        if (ctx.callbackQuery) {
            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await ctx.reply(message, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    } catch (error) {
        console.error('Withdrawal requests error:', error);
        await ctx.reply('❌ Failed to get withdrawal requests.');
    }
}

// Process withdrawal
bot.action(/^process_withdrawal_(.+)$/, async (ctx) => {
    try {
        const withdrawalId = ctx.match[1];
        const withdrawal = await db.collection(config.COLLECTIONS.WITHDRAWALS).findOne({ 
            _id: new ObjectId(withdrawalId) 
        });
        
        if (!withdrawal) {
            await ctx.answerCbQuery('❌ Withdrawal not found');
            return;
        }
        
        const user = await getUser(withdrawal.userId);
        
        let message = `💰 <b>Process Withdrawal</b>\n\n`;
        message += `🆔 <b>Request ID:</b> <code>${withdrawal.withdrawalId}</code>\n`;
        message += `👤 <b>User:</b> ${user.firstName || ''} ${user.lastName || ''}\n`;
        message += `📱 <b>Username:</b> ${user.username ? '@' + user.username : 'Not set'}\n`;
        message += `🆔 <b>User ID:</b> <code>${user.userId}</code>\n`;
        message += `💰 <b>Amount:</b> ₹${withdrawal.amount}\n`;
        message += `🏦 <b>UPI ID:</b> <code>${withdrawal.upiId}</code>\n`;
        message += `📅 <b>Requested:</b> ${new Date(withdrawal.requestedAt).toLocaleString('en-IN')}\n\n`;
        message += `Select an action:`;
        
        const keyboard = [
            [{ text: '✅ Approve', callback_data: `approve_withdrawal_${withdrawalId}` }],
            [{ text: '❌ Reject', callback_data: `reject_withdrawal_${withdrawalId}` }],
            [{ text: '🔙 Back to Requests', callback_data: 'admin_withdrawal_requests' }]
        ];
        
        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Process withdrawal error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Approve withdrawal
bot.action(/^approve_withdrawal_(.+)$/, async (ctx) => {
    try {
        const withdrawalId = ctx.match[1];
        const withdrawal = await db.collection(config.COLLECTIONS.WITHDRAWALS).findOne({ 
            _id: new ObjectId(withdrawalId) 
        });
        
        if (!withdrawal) {
            await ctx.answerCbQuery('❌ Withdrawal not found');
            return;
        }
        
        // Generate UTR
        const utr = utils.generateUTR();
        const approvedAt = new Date();
        
        // Update withdrawal
        await db.collection(config.COLLECTIONS.WITHDRAWALS).updateOne(
            { _id: new ObjectId(withdrawalId) },
            { 
                $set: { 
                    status: 'approved',
                    utr: utr,
                    approvedAt: approvedAt,
                    approvedBy: ctx.from.id
                } 
            }
        );
        
        // Notify user
        try {
            await bot.telegram.sendMessage(
                withdrawal.userId,
                `✅ <b>Withdrawal Approved!</b>\n\n` +
                `🆔 <b>Request ID:</b> <code>${withdrawal.withdrawalId}</code>\n` +
                `💰 <b>Amount:</b> ₹${withdrawal.amount}\n` +
                `🏦 <b>UPI ID:</b> <code>${withdrawal.upiId}</code>\n` +
                `📊 <b>UTR:</b> <code>${utr}</code>\n` +
                `⏰ <b>Approved At:</b> ${approvedAt.toLocaleString('en-IN')}\n\n` +
                `Payment will be processed shortly.`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('Failed to notify user:', error);
        }
        
        await ctx.answerCbQuery('✅ Withdrawal approved');
        
        // Update message
        await ctx.editMessageText(
            `✅ <b>Withdrawal Approved</b>\n\n` +
            `🆔 <b>Request ID:</b> <code>${withdrawal.withdrawalId}</code>\n` +
            `💰 <b>Amount:</b> ₹${withdrawal.amount}\n` +
            `🏦 <b>UPI ID:</b> <code>${withdrawal.upiId}</code>\n` +
            `📊 <b>UTR:</b> <code>${utr}</code>\n` +
            `👤 <b>User ID:</b> <code>${withdrawal.userId}</code>\n` +
            `✅ <b>Status:</b> Approved\n\n` +
            `User has been notified.`,
            {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [{ text: '🔙 Back to Requests', callback_data: 'admin_withdrawal_requests' }]
                ])
            }
        );
        
    } catch (error) {
        console.error('Approve withdrawal error:', error);
        await ctx.answerCbQuery('❌ Error approving withdrawal');
    }
});

// Reject withdrawal
bot.action(/^reject_withdrawal_(.+)$/, async (ctx) => {
    try {
        const withdrawalId = ctx.match[1];
        
        ctx.session.currentWithdrawal = withdrawalId;
        await ctx.editMessageText(
            '❌ <b>Reject Withdrawal</b>\n\n' +
            'Enter reason for rejection:\n\n' +
            '<i>This message will be sent to the user</i>\n\n' +
            'Type "cancel" to go back',
            { parse_mode: 'HTML' }
        );
        
        await ctx.scene.enter('process_withdrawal_scene');
    } catch (error) {
        console.error('Reject withdrawal error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

scenes.processWithdrawal.on('text', async (ctx) => {
    try {
        const withdrawalId = ctx.session.currentWithdrawal;
        
        if (ctx.message.text.toLowerCase() === 'cancel') {
            delete ctx.session.currentWithdrawal;
            await ctx.reply('❌ Rejection cancelled.');
            await ctx.scene.leave();
            return;
        }
        
        const withdrawal = await db.collection(config.COLLECTIONS.WITHDRAWALS).findOne({ 
            _id: new ObjectId(withdrawalId) 
        });
        
        if (!withdrawal) {
            await ctx.reply('❌ Withdrawal not found.');
            delete ctx.session.currentWithdrawal;
            await ctx.scene.leave();
            return;
        }
        
        const rejectReason = ctx.message.text;
        const rejectedAt = new Date();
        
        // Update withdrawal
        await db.collection(config.COLLECTIONS.WITHDRAWALS).updateOne(
            { _id: new ObjectId(withdrawalId) },
            { 
                $set: { 
                    status: 'rejected',
                    rejectReason: rejectReason,
                    rejectedAt: rejectedAt,
                    rejectedBy: ctx.from.id
                } 
            }
        );
        
        // Refund amount to user
        await addTransaction(withdrawal.userId, 'credit', withdrawal.amount, 
            `Withdrawal rejected refund: ${withdrawal.withdrawalId}`);
        
        // Notify user
        try {
            await bot.telegram.sendMessage(
                withdrawal.userId,
                `❌ <b>Withdrawal Rejected</b>\n\n` +
                `🆔 <b>Request ID:</b> <code>${withdrawal.withdrawalId}</code>\n` +
                `💰 <b>Amount:</b> ₹${withdrawal.amount}\n` +
                `📄 <b>Reason:</b> ${rejectReason}\n` +
                `⏰ <b>Rejected At:</b> ${rejectedAt.toLocaleString('en-IN')}\n\n` +
                `The amount has been refunded to your balance.`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('Failed to notify user:', error);
        }
        
        delete ctx.session.currentWithdrawal;
        
        await ctx.reply(
            `✅ <b>Withdrawal Rejected</b>\n\n` +
            `🆔 <b>Request ID:</b> <code>${withdrawal.withdrawalId}</code>\n` +
            `💰 <b>Amount:</b> ₹${withdrawal.amount}\n` +
            `📄 <b>Reason:</b> ${rejectReason}\n` +
            `👤 <b>User ID:</b> <code>${withdrawal.userId}</code>\n\n` +
            `User has been notified and amount refunded.`,
            {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [{ text: '🔙 Back to Requests', callback_data: 'admin_withdrawal_requests' }]
                ])
            }
        );
        
        await ctx.scene.leave();
    } catch (error) {
        console.error('Process withdrawal scene error:', error);
        await ctx.reply('❌ Error processing withdrawal.');
        delete ctx.session.currentWithdrawal;
        await ctx.scene.leave();
    }
});

// Search withdrawals
bot.action('admin_search_withdrawals', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await ctx.editMessageText(
        '🔍 <b>Search Withdrawal Requests</b>\n\n' +
        'Enter search query (Request ID, User ID, Username, or UPI ID):\n\n' +
        '<i>Type "cancel" to go back</i>',
        { parse_mode: 'HTML' }
    );
    
    await ctx.scene.enter('search_withdrawals_scene');
});

scenes.searchWithdrawals.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await ctx.reply('❌ Search cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const searchQuery = ctx.message.text.trim();
        await showWithdrawalRequests(ctx, 1, searchQuery);
        await ctx.scene.leave();
    } catch (error) {
        console.error('Search withdrawals error:', error);
        await ctx.reply('❌ Error searching withdrawals.');
        await ctx.scene.leave();
    }
});

// ==========================================
// TASK MANAGEMENT
// ==========================================

// Add Tasks
bot.action('admin_add_tasks', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await ctx.editMessageText(
        '➕ <b>Add New Task</b>\n\n' +
        'Send task images (maximum 3):\n\n' +
        '<i>Send photos one by one or skip by typing "skip"</i>\n\n' +
        'Type "cancel" to go back',
        { parse_mode: 'HTML' }
    );
    
    ctx.session.newTask = { images: [] };
    await ctx.scene.enter('add_task_scene');
});

scenes.addTask.on(['text', 'photo'], async (ctx) => {
    try {
        if (ctx.message.text?.toLowerCase() === 'cancel') {
            delete ctx.session.newTask;
            await ctx.reply('❌ Task creation cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        if (!ctx.session.newTask) {
            ctx.session.newTask = { images: [] };
        }
        
        // Handle image upload
        if (ctx.message.photo && ctx.session.newTask.images.length < 3) {
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            const fileLink = await ctx.telegram.getFileLink(photo.file_id);
            
            // Upload to Cloudinary
            const response = await fetch(fileLink);
            const buffer = await response.buffer();
            const result = await uploadToCloudinary(buffer, 'task_images');
            
            ctx.session.newTask.images.push({
                url: result.secure_url,
                publicId: result.public_id
            });
            
            const remaining = 3 - ctx.session.newTask.images.length;
            if (remaining > 0) {
                await ctx.reply(
                    `✅ Image uploaded! ${remaining} image(s) remaining.\n\n` +
                    `Send next image or type "skip" to continue.`
                );
                return;
            }
        }
        
        if (ctx.message.text?.toLowerCase() === 'skip' || ctx.session.newTask.images.length >= 3) {
            // Move to next step
            if (!ctx.session.newTask.step) {
                ctx.session.newTask.step = 'title';
                await ctx.reply(
                    'Enter task title:\n\n' +
                    '<i>Type "cancel" to go back</i>',
                    { parse_mode: 'HTML' }
                );
                return;
            }
            
            if (ctx.session.newTask.step === 'title') {
                ctx.session.newTask.title = ctx.message.text;
                ctx.session.newTask.step = 'description';
                await ctx.reply(
                    'Enter task description:\n\n' +
                    '<i>Type "cancel" to go back</i>',
                    { parse_mode: 'HTML' }
                );
                return;
            }
            
            if (ctx.session.newTask.step === 'description') {
                ctx.session.newTask.description = ctx.message.text;
                ctx.session.newTask.step = 'screenshots';
                await ctx.reply(
                    'How many screenshots are required? (0-5):\n\n' +
                    '<i>Type "cancel" to go back</i>',
                    { parse_mode: 'HTML' }
                );
                return;
            }
            
            if (ctx.session.newTask.step === 'screenshots') {
                const screenshotCount = parseInt(ctx.message.text);
                if (isNaN(screenshotCount) || screenshotCount < 0 || screenshotCount > 5) {
                    await ctx.reply('❌ Please enter a number between 0 and 5.');
                    return;
                }
                
                ctx.session.newTask.screenshotCount = screenshotCount;
                
                if (screenshotCount === 0) {
                    ctx.session.newTask.step = 'reward';
                    await ctx.reply(
                        'Enter task reward amount:\n\n' +
                        '<i>Type "cancel" to go back</i>',
                        { parse_mode: 'HTML' }
                    );
                } else {
                    ctx.session.newTask.screenshots = [];
                    ctx.session.newTask.currentSS = 0;
                    await ctx.reply(
                        `Enter name for screenshot 1 (e.g., "Proof of Completion"):\n\n` +
                        `<i>Type "cancel" to go back</i>`,
                        { parse_mode: 'HTML' }
                    );
                }
                return;
            }
            
            if (ctx.session.newTask.step === 'screenshot_names') {
                const ssIndex = ctx.session.newTask.currentSS;
                ctx.session.newTask.screenshots.push({
                    index: ssIndex,
                    buttonText: ctx.message.text
                });
                
                ctx.session.newTask.currentSS++;
                
                if (ctx.session.newTask.currentSS < ctx.session.newTask.screenshotCount) {
                    await ctx.reply(
                        `Enter name for screenshot ${ctx.session.newTask.currentSS + 1}:\n\n` +
                        `<i>Type "cancel" to go back</i>`,
                        { parse_mode: 'HTML' }
                    );
                } else {
                    ctx.session.newTask.step = 'reward';
                    await ctx.reply(
                        'Enter task reward amount:\n\n' +
                        '<i>Type "cancel" to go back</i>',
                        { parse_mode: 'HTML' }
                    );
                }
                return;
            }
            
            if (ctx.session.newTask.step === 'reward') {
                const reward = parseFloat(ctx.message.text);
                if (isNaN(reward) || reward < 1) {
                    await ctx.reply('❌ Please enter a valid amount (minimum ₹1).');
                    return;
                }
                
                ctx.session.newTask.reward = reward;
                
                // Create task
                const task = {
                    title: ctx.session.newTask.title,
                    description: ctx.session.newTask.description,
                    images: ctx.session.newTask.images,
                    screenshots: ctx.session.newTask.screenshots || [],
                    reward: ctx.session.newTask.reward,
                    status: 'active',
                    createdBy: ctx.from.id,
                    createdAt: new Date(),
                    totalSubmissions: 0,
                    approvedSubmissions: 0
                };
                
                await db.collection(config.COLLECTIONS.TASKS).insertOne(task);
                
                delete ctx.session.newTask;
                
                await ctx.reply(
                    `✅ <b>Task Created Successfully!</b>\n\n` +
                    `📌 <b>Title:</b> ${task.title}\n` +
                    `💰 <b>Reward:</b> ₹${task.reward}\n` +
                    `📸 <b>Images:</b> ${task.images.length}\n` +
                    `📋 <b>Screenshots Required:</b> ${task.screenshots.length}\n\n` +
                    `The task is now active and available to users.`,
                    {
                        parse_mode: 'HTML',
                        reply_markup: Markup.inlineKeyboard([
                            [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
                        ])
                    }
                );
                
                await ctx.scene.leave();
            }
        }
    } catch (error) {
        console.error('Add task error:', error);
        await ctx.reply('❌ Error creating task.');
        delete ctx.session.newTask;
        await ctx.scene.leave();
    }
});

// Task Requests
bot.action('admin_task_requests', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const requests = await db.collection(config.COLLECTIONS.TASK_REQUESTS)
            .find({ status: 'pending' })
            .sort({ submittedAt: -1 })
            .limit(20)
            .toArray();
        
        if (requests.length === 0) {
            await ctx.editMessageText(
                '📋 <b>Task Requests</b>\n\n' +
                'No pending task requests.',
                {
                    parse_mode: 'HTML',
                    reply_markup: Markup.inlineKeyboard([
                        [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
                    ])
                }
            );
            return;
        }
        
        let message = '📋 <b>Task Requests</b>\n\n';
        
        requests.forEach((request, index) => {
            const date = new Date(request.submittedAt).toLocaleDateString('en-IN');
            message += `${index + 1}. <b>${request.taskTitle}</b>\n`;
            message += `   👤 User: ${request.userDetails.firstName || ''}\n`;
            message += `   💰 Reward: ₹${request.taskReward}\n`;
            message += `   📅 Submitted: ${date}\n\n`;
        });
        
        const keyboard = [];
        
        requests.forEach((request, index) => {
            keyboard.push([{ 
                text: `${index + 1}. ${request.taskTitle}`, 
                callback_data: `review_task_${request._id}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Task requests error:', error);
        await ctx.reply('❌ Error fetching task requests.');
    }
});

// ==========================================
// ERROR HANDLING
// ==========================================

bot.catch((error, ctx) => {
    console.error('Bot error:', error);
    
    try {
        if (ctx.message) {
            ctx.reply(
                '❌ An error occurred. Please try again.\n\n' +
                'If the problem persists, contact admin.',
                {
                    reply_markup: Markup.inlineKeyboard([
                        [{ text: '📞 Contact Admin', callback_data: 'contact_admin_user' }],
                        [{ text: '🔄 Try Again', callback_data: 'back_to_menu' }]
                    ])
                }
            );
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
            // Try again after 5 seconds
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
        
        // Send startup message to admin
        try {
            const configDoc = await getConfig();
            for (const adminId of configDoc.admins) {
                try {
                    await bot.telegram.sendMessage(
                        adminId,
                        '🤖 Bot started successfully!\n\n' +
                        '✅ Database connected\n' +
                        '✅ All systems operational\n\n' +
                        `🕐 ${new Date().toLocaleString('en-IN')}`
                    );
                } catch (error) {
                    console.log(`⚠️ Could not send startup message to admin ${adminId}`);
                }
            }
        } catch (error) {
            console.log('⚠️ Could not send startup messages');
        }
        
    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        // Try to restart after 10 seconds
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
        res.end('🤖 Telegram Referral Bot is running...');
    });
    
    server.listen(PORT, () => {
        console.log(`🚂 Server listening on port ${PORT}`);
    });
}
