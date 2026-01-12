const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

// Initialize bot
const BOT_TOKEN = process.env.BOT_TOKEN || '8295150408:AAHk4M0LX0YAUk4vDuSCi4mOFg6se66J3hM';
const bot = new Telegraf(BOT_TOKEN);

// 🔐 ADMIN CONFIGURATION
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [8435248854, 5518423310];

// Simple in-memory storage (replace with MongoDB if needed)
let users = {};

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
        
        // Store user in memory
        if (!users[userId]) {
            users[userId] = {
                userId: userId,
                firstName: user.first_name,
                lastName: user.last_name,
                username: user.username,
                joinedAt: new Date(),
                lastActive: new Date()
            };
        } else {
            users[userId].lastActive = new Date();
        }
        
        // Welcome message
        const message = `👋 Welcome *${user.first_name || 'User'}*!\n\nI'm a simple Telegram bot.\n\nUse the button below to see your details:`;
        
        // Send message with button
        await ctx.replyWithPhoto(
            'https://images.unsplash.com/photo-1611605698335-8b1569810432?w=600&h=400&fit=crop',
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
        
        // Update last active
        if (users[userId]) {
            users[userId].lastActive = new Date();
        }
        
        // Create user info message
        let message = `👤 *Your Details*\n\n`;
        message += `🆔 *ID:* \`${userId}\`\n`;
        message += `👤 *Name:* ${user.first_name || 'Not set'} ${user.last_name || ''}\n`;
        message += `📱 *Username:* ${user.username ? '@' + user.username : 'Not set'}\n`;
        message += `📅 *Joined:* ${users[userId]?.joinedAt ? new Date(users[userId].joinedAt).toLocaleDateString() : 'Just now'}\n`;
        message += `🕐 *Last Active:* ${new Date().toLocaleTimeString()}\n`;
        message += `🌐 *Language:* ${user.language_code || 'Not set'}`;
        
        // Get user profile photo
        let photoUrl = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=600&h=400&fit=crop';
        
        try {
            const profilePhotos = await ctx.telegram.getUserProfilePhotos(userId, 0, 1);
            if (profilePhotos.total_count > 0) {
                const file = await ctx.telegram.getFile(profilePhotos.photos[0][0].file_id);
                photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
            }
        } catch (error) {
            console.log('Using default photo:', error.message);
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
        const totalUsers = Object.keys(users).length;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const activeToday = Object.values(users).filter(u => new Date(u.lastActive) >= today).length;
        
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
        const totalUsers = Object.keys(users).length;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const activeToday = Object.values(users).filter(u => new Date(u.lastActive) >= today).length;
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const activeYesterday = Object.values(users).filter(u => {
            const lastActive = new Date(u.lastActive);
            return lastActive >= yesterday && lastActive < today;
        }).length;
        
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
        
        await ctx.reply(`📢 *Broadcasting to ${Object.keys(users).length} users...*`, { parse_mode: 'Markdown' });
        
        let successful = 0;
        let failed = 0;
        
        for (const userId in users) {
            try {
                await ctx.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
                successful++;
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 50));
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
        const userList = Object.values(users)
            .sort((a, b) => new Date(b.joinedAt) - new Date(a.joinedAt))
            .slice(0, 20);
        
        let message = `👥 *Recent Users (${userList.length})*\n\n`;
        
        userList.forEach((user, index) => {
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
    message += `*Developer:* Telegram Bot API\n\n`;
    message += `This bot demonstrates basic Telegram bot functionality.`;
    
    ctx.reply(message, { parse_mode: 'Markdown' });
});

// Handle any message
bot.on('text', (ctx) => {
    // Update user activity
    const userId = ctx.from.id;
    if (users[userId]) {
        users[userId].lastActive = new Date();
    }
});

// ==========================================
// ERROR HANDLING
// ==========================================

bot.catch((error, ctx) => {
    console.error('Bot error:', error);
    
    try {
        if (ctx.message && !ctx.message.text?.startsWith('/')) {
            ctx.reply('Sorry, I only understand commands. Try /start or /help');
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
        console.log('🤖 Starting Telegram Bot...');
        
        // Start bot
        await bot.launch({
            dropPendingUpdates: true,
            allowedUpdates: ['message', 'callback_query']
        });
        
        console.log('✅ Bot is running successfully!');
        
        // Notify admin
        try {
            await bot.telegram.sendMessage(ADMIN_IDS[0], '✅ Bot started successfully!');
        } catch (error) {
            console.log('⚠️ Could not send startup notification');
        }
        
        // Graceful shutdown
        process.once('SIGINT', () => {
            console.log('🛑 SIGINT received, shutting down gracefully...');
            bot.stop('SIGINT');
            process.exit(0);
        });
        
        process.once('SIGTERM', () => {
            console.log('🛑 SIGTERM received, shutting down gracefully...');
            bot.stop('SIGTERM');
            process.exit(0);
        });
        
    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        // Try to restart after 10 seconds
        setTimeout(startBot, 10000);
    }
}

// Start bot
startBot();

// Railway deployment - simple web server
const PORT = process.env.PORT || 3000;
if (PORT) {
    const http = require('http');
    
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('🤖 Telegram Bot is running...');
    });
    
    server.listen(PORT, () => {
        console.log(`🚂 Web server listening on port ${PORT}`);
    });
}

console.log('🚀 Bot initialization complete');
