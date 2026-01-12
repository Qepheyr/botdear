const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');
require('dotenv').config();

// Initialize bot
const BOT_TOKEN = process.env.BOT_TOKEN || '8295150408:AAHk4M0LX0YAUk4vDuSCi4mOFg6se66J3hM';
const bot = new Telegraf(BOT_TOKEN);

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://sandip102938:Q1g2Fbn7ewNqEvuK@test.ebvv4hf.mongodb.net/bots_earn';
let db, client;

async function connectDB() {
    try {
        client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db();
        console.log('✅ Connected to MongoDB');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        return false;
    }
}

// 🔐 ADMIN CONFIGURATION
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [8435248854, 5518423310];

// Check Admin Status
function isAdmin(userId) {
    return ADMIN_IDS.includes(Number(userId));
}

// ==========================================
// /start COMMAND
// ==========================================

bot.start(async (ctx) => {
    try {
        const user = ctx.from;
        const userId = user.id;
        
        // Save user to database
        await db.collection('users').updateOne(
            { userId: userId },
            {
                $set: {
                    firstName: user.first_name,
                    lastName: user.last_name,
                    username: user.username,
                    lastActive: new Date()
                },
                $setOnInsert: {
                    joinedAt: new Date()
                }
            },
            { upsert: true }
        );
        
        // Welcome message
        const message = `👋 Welcome *${user.first_name || 'User'}*!\n\nI'm a simple Telegram bot.\n\nUse the button below to see your details:`;
        
        // Send message with button
        await ctx.replyWithPhoto(
            'https://via.placeholder.com/600x400/0088cc/ffffff?text=Telegram+Bot',
            {
                caption: message,
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    Markup.button.callback('👤 My Details', 'user_details')
                ])
            }
        );
        
    } catch (error) {
        console.error('Start command error:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
    }
});

// ==========================================
// USER DETAILS BUTTON
// ==========================================

bot.action('user_details', async (ctx) => {
    try {
        const user = ctx.from;
        const userId = user.id;
        
        // Get user from database
        const userData = await db.collection('users').findOne({ userId: userId });
        
        // Create user info message
        let message = `👤 *Your Details*\n\n`;
        message += `🆔 *ID:* \`${userId}\`\n`;
        message += `👤 *Name:* ${user.first_name || 'Not set'} ${user.last_name || ''}\n`;
        message += `📱 *Username:* ${user.username ? '@' + user.username : 'Not set'}\n`;
        message += `📅 *Joined:* ${userData?.joinedAt ? new Date(userData.joinedAt).toLocaleDateString() : 'Just now'}\n`;
        message += `🕐 *Last Active:* ${new Date().toLocaleTimeString()}`;
        
        // Get user profile photo
        let photoUrl = 'https://via.placeholder.com/600x400/0088cc/ffffff?text=User+Profile';
        
        try {
            const profilePhotos = await ctx.telegram.getUserProfilePhotos(userId, 0, 1);
            if (profilePhotos.total_count > 0) {
                const file = await ctx.telegram.getFile(profilePhotos.photos[0][0].file_id);
                photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
            }
        } catch (error) {
            console.log('Could not get profile photo:', error.message);
        }
        
        // Send user details with profile photo
        await ctx.replyWithPhoto(
            photoUrl,
            {
                caption: message,
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    Markup.button.callback('🔄 Refresh', 'user_details'),
                    Markup.button.callback('🔙 Back', 'back_to_start')
                ])
            }
        );
        
        // Delete the previous message
        await ctx.deleteMessage().catch(() => {});
        
    } catch (error) {
        console.error('User details error:', error);
        await ctx.answerCbQuery('❌ Error loading details');
    }
});

// Back to Start
bot.action('back_to_start', async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        await bot.start(ctx);
    } catch (error) {
        console.error('Back to start error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// ==========================================
// /admin COMMAND
// ==========================================

bot.command('admin', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return ctx.reply('❌ You are not authorized to use this command.');
        }
        
        // Get statistics
        const totalUsers = await db.collection('users').countDocuments();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const activeToday = await db.collection('users').countDocuments({ lastActive: { $gte: today } });
        
        // Admin message
        const message = `👑 *Admin Panel*\n\n`;
        message += `📊 *Statistics:*\n`;
        message += `• Total Users: ${totalUsers}\n`;
        message += `• Active Today: ${activeToday}\n\n`;
        message += `*Commands:*\n`;
        message += `/stats - User statistics\n`;
        message += `/broadcast - Send message to all users\n`;
        message += `/users - List all users`;
        
        await ctx.reply(message, { parse_mode: 'Markdown' });
        
    } catch (error) {
        console.error('Admin command error:', error);
        await ctx.reply('❌ An error occurred.');
    }
});

// ==========================================
// ADMIN COMMANDS
// ==========================================

// /stats command
bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    try {
        const totalUsers = await db.collection('users').countDocuments();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const activeToday = await db.collection('users').countDocuments({ lastActive: { $gte: today } });
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const activeYesterday = await db.collection('users').countDocuments({ 
            lastActive: { $gte: yesterday, $lt: today } 
        });
        
        const message = `📊 *Bot Statistics*\n\n`;
        message += `👥 *Total Users:* ${totalUsers}\n`;
        message += `✅ *Active Today:* ${activeToday}\n`;
        message += `📅 *Active Yesterday:* ${activeYesterday}\n`;
        message += `📈 *Growth Rate:* ${activeToday > 0 ? ((activeToday / Math.max(activeYesterday, 1)) * 100).toFixed(2) : '0'}%`;
        
        await ctx.reply(message, { parse_mode: 'Markdown' });
        
    } catch (error) {
        console.error('Stats command error:', error);
        await ctx.reply('❌ Failed to get statistics.');
    }
});

// /broadcast command
bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    try {
        const message = ctx.message.text.replace('/broadcast', '').trim();
        
        if (!message) {
            return ctx.reply('❌ Please provide a message to broadcast.\nExample: /broadcast Hello everyone!');
        }
        
        await ctx.reply(`📢 *Broadcasting to all users...*`, { parse_mode: 'Markdown' });
        
        const users = await db.collection('users').find({}).toArray();
        let successful = 0;
        let failed = 0;
        
        for (const user of users) {
            try {
                await ctx.telegram.sendMessage(user.userId, message, { parse_mode: 'Markdown' });
                successful++;
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                failed++;
            }
        }
        
        await ctx.reply(`✅ *Broadcast Complete*\n\n• Sent to: ${successful} users\n• Failed: ${failed} users`, { 
            parse_mode: 'Markdown' 
        });
        
    } catch (error) {
        console.error('Broadcast command error:', error);
        await ctx.reply('❌ Broadcast failed.');
    }
});

// /users command
bot.command('users', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    try {
        const users = await db.collection('users')
            .find({})
            .sort({ joinedAt: -1 })
            .limit(20)
            .toArray();
        
        let message = `👥 *Recent Users (${users.length})*\n\n`;
        
        users.forEach((user, index) => {
            const name = user.firstName || `User ${user.userId}`;
            const date = user.joinedAt ? new Date(user.joinedAt).toLocaleDateString() : 'Unknown';
            message += `${index + 1}. ${name} - ${date}\n`;
        });
        
        await ctx.reply(message, { parse_mode: 'Markdown' });
        
    } catch (error) {
        console.error('Users command error:', error);
        await ctx.reply('❌ Failed to get users.');
    }
});

// ==========================================
// BASIC COMMANDS
// ==========================================

// /help command
bot.command('help', (ctx) => {
    const message = `🤖 *Bot Help*\n\n`;
    message += `*Available Commands:*\n`;
    message += `/start - Start the bot\n`;
    message += `/help - Show this help message\n`;
    message += `/info - Bot information\n\n`;
    message += `*Features:*\n`;
    message += `• View your profile details\n`;
    message += `• Simple and clean interface`;
    
    ctx.reply(message, { parse_mode: 'Markdown' });
});

// /info command
bot.command('info', (ctx) => {
    const message = `ℹ️ *Bot Information*\n\n`;
    message += `*Name:* Simple Telegram Bot\n`;
    message += `*Version:* 1.0.0\n`;
    message += `*Description:* A minimal Telegram bot example\n`;
    message += `*Developer:* Your Name\n\n`;
    message += `This bot demonstrates basic Telegram bot functionality.`;
    
    ctx.reply(message, { parse_mode: 'Markdown' });
});

// ==========================================
// ERROR HANDLING
// ==========================================

bot.catch((error, ctx) => {
    console.error('Bot error:', error);
    
    try {
        ctx.reply('❌ An error occurred. Please try /start again.');
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
        
        // Create indexes
        await db.collection('users').createIndex({ userId: 1 }, { unique: true });
        
        console.log('✅ Database initialized');
        
        // Start bot
        await bot.launch({
            dropPendingUpdates: true
        });
        
        console.log('🤖 Bot is running...');
        
        // Notify admin
        try {
            await bot.telegram.sendMessage(ADMIN_IDS[0], '✅ Bot started successfully!');
        } catch (error) {
            console.log('⚠️ Could not send startup notification');
        }
        
        // Graceful shutdown
        process.once('SIGINT', () => {
            console.log('🛑 Shutting down gracefully...');
            bot.stop('SIGINT');
            if (client) client.close();
            process.exit(0);
        });
        
        process.once('SIGTERM', () => {
            console.log('🛑 Shutting down gracefully...');
            bot.stop('SIGTERM');
            if (client) client.close();
            process.exit(0);
        });
        
    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        setTimeout(startBot, 10000);
    }
}

// Start bot
startBot();

// Railway deployment - simple web server
const PORT = process.env.PORT || 3000;
if (process.env.RAILWAY_ENVIRONMENT || process.env.PORT) {
    const express = require('express');
    const app = express();
    
    app.get('/', (req, res) => {
        res.send('🤖 Bot is running...');
    });
    
    app.listen(PORT, () => {
        console.log(`🚂 Web server listening on port ${PORT}`);
    });
}

console.log('🚀 Bot Starting...');
