const { Markup } = require('telegraf');
const { loadUsers, saveUser } = require('../../database/userModel');
const { clearPreviousMessages, formatDate, parseAndFormatDate } = require('../utils');
const { loadInviteCode, markInviteCodeAsUsed, validateInviteCode } = require('../../database/inviteCodeModel');
const { showObjectSelection } = require('../actions/objects');
const { showProfile, showMainMenu } = require('./menu');
const { saveReport, loadUserReports } = require('../../database/reportModel');
const { ORGANIZATIONS_LIST, GENERAL_GROUP_CHAT_IDS, OBJECT_GROUPS, ADMIN_ID } = require('../../config/config');

const mediaGroups = new Map();

module.exports = (bot) => {
    bot.use(async (ctx, next) => {
        if (ctx.message && ctx.message.media_group_id) {
            const userId = ctx.from.id.toString();
            const mediaGroupId = ctx.message.media_group_id;
            const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

            if (!mediaGroups.has(mediaGroupId)) {
                mediaGroups.set(mediaGroupId, { photos: [], timeout: null, userId });
            }

            const group = mediaGroups.get(mediaGroupId);
            group.photos.push(photoId);

            clearTimeout(group.timeout);
            group.timeout = setTimeout(async () => {
                const state = ctx.state.userStates[userId];
                if (!state || (state.step !== 'photos' && state.step !== 'editPhotos')) {
                    mediaGroups.delete(mediaGroupId);
                    return;
                }

                state.report.photos = [...state.report.photos, ...group.photos];
                await updatePhotoMessage(ctx, userId, state);
                mediaGroups.delete(mediaGroupId);
            }, 1000); // Увеличена задержка до 1 секунды
        }
        await next();
    });

    async function updatePhotoMessage(ctx, userId, state) {
        const text = `Добавлено ${state.report.photos.length} фото. Отправьте еще или нажмите "Готово".`;
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('Готово', state.step === 'photos' ? 'finish_report' : 'finish_edit_report')]
        ]);

        const lastMessageId = state.lastMessageId;
        if (lastMessageId) {
            await ctx.telegram.editMessageText(ctx.chat.id, lastMessageId, null, text, keyboard).catch(async () => {
                const newMessage = await ctx.reply(text, keyboard);
                state.lastMessageId = newMessage.message_id;
            });
        } else {
            const newMessage = await ctx.reply(text, keyboard);
            state.lastMessageId = newMessage.message_id;
        }
    }

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];
        if (!state || !state.step) return;

        await clearPreviousMessages(ctx, userId);
        const users = await loadUsers();

        switch (state.step) {
            case 'enterInviteCode':
                const code = ctx.message.text.trim();
                const inviteData = await validateInviteCode(code);
                if (!inviteData) {
                    await ctx.reply('Неверный код. Попробуйте снова:');
                    return;
                }
                users[userId].organization = inviteData.organization;
                await saveUser(userId, users[userId]);
                await markInviteCodeAsUsed(code, userId);
                state.step = 'selectObjects';
                await showObjectSelection(ctx, userId, []);
                break;

            case 'editFullNameInput':
                const newFullName = ctx.message.text.trim();
                if (!newFullName) {
                    await ctx.reply('ФИО не может быть пустым. Введите снова:');
                    return;
                }
                users[userId].fullName = newFullName;
                await saveUser(userId, users[userId]);
                state.step = null;
                await ctx.reply(`ФИО изменено на "${newFullName}"`);
                await showProfile(ctx);
                break;

            case 'workDone':
                state.report.workDone = ctx.message.text.trim();
                state.step = 'materials';
                await ctx.reply('💡 Введите информацию о поставленных материалах:');
                break;

            case 'materials':
                state.report.materials = ctx.message.text.trim();
                state.step = 'photos';
                state.report.photos = [];
                await ctx.reply('📸 Прикрепите изображения или нажмите "Готово"', Markup.inlineKeyboard([
                    [Markup.button.callback('Готово', 'finish_report')]
                ]));
                break;

            // Другие кейсы опущены для краткости, но могут быть оптимизированы аналогично
        }
    });

    bot.on('photo', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];
        if (!state || (state.step !== 'photos' && state.step !== 'editPhotos') || ctx.message.media_group_id) return;

        const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        state.report.photos.push(photoId);
        await updatePhotoMessage(ctx, userId, state);
    });

    bot.action('finish_report', async (ctx) => {
        const userId = ctx.from.id.toString();
        const state = ctx.state.userStates[userId];
        if (!state || state.step !== 'photos') return;

        await clearPreviousMessages(ctx, userId);
        const users = await loadUsers();

        const date = new Date();
        const formattedDate = formatDate(date);
        const timestamp = date.toISOString();
        const reportId = `${formattedDate.replace(/\./g, '_')}_${users[userId].nextReportId++}`;
        const report = {
            reportId,
            userId,
            objectName: state.report.objectName,
            date: formattedDate,
            timestamp,
            workDone: state.report.workDone,
            materials: state.report.materials,
            groupMessageIds: {},
            messageLink: null,
            fullName: users[userId].fullName,
            photos: state.report.photos || []
        };
        const reportText = `
📅 ОТЧЕТ ЗА ${formattedDate}  
🏢 ${report.objectName}  
➖➖➖➖➖➖➖➖➖➖➖ 
👷 ${users[userId].fullName} 
ВЫПОЛНЕННЫЕ РАБОТЫ: ${report.workDone}  
ПОСТАВЛЕННЫЕ МАТЕРИАЛЫ: ${report.materials}  
➖➖➖➖➖➖➖➖➖➖➖
        `.trim();

        const groupChatId = OBJECT_GROUPS[report.objectName] || GENERAL_GROUP_CHAT_IDS['default'].chatId;
        const userOrg = users[userId].organization;
        const targetOrgs = [
            userOrg,
            ...ORGANIZATIONS_LIST.filter(org => GENERAL_GROUP_CHAT_IDS[org]?.reportSources?.includes(userOrg))
        ];
        const allChatIds = [...new Set([groupChatId, ...targetOrgs.map(org => GENERAL_GROUP_CHAT_IDS[org]?.chatId || GENERAL_GROUP_CHAT_IDS['default'].chatId)])];

        await ctx.reply('⏳ Отправка отчета...');

        const sendPromises = allChatIds.map(async chatId => {
            if (report.photos.length > 0) {
                const mediaGroup = report.photos.map((photoId, index) => ({
                    type: 'photo',
                    media: photoId,
                    caption: index === 0 ? reportText.slice(0, 1024) : undefined
                }));
                const messages = await ctx.telegram.sendMediaGroup(chatId, mediaGroup).catch(() => []);
                if (messages.length) {
                    report.groupMessageIds[chatId] = messages[0].message_id;
                    if (chatId === groupChatId) report.messageLink = `https://t.me/c/${chatId.toString().replace('-', '')}/${messages[0].message_id}`;
                }
            } else {
                const message = await ctx.telegram.sendMessage(chatId, reportText).catch(() => null);
                if (message) {
                    report.groupMessageIds[chatId] = message.message_id;
                    if (chatId === groupChatId) report.messageLink = `https://t.me/c/${chatId.toString().replace('-', '')}/${message.message_id}`;
                }
            }
        });

        await Promise.all(sendPromises);
        await saveReport(userId, report);
        await saveUser(userId, users[userId]);

        await ctx.reply(`✅ Отчет опубликован:\n${reportText}${report.photos.length > 0 ? '\n(С изображениями)' : ''}`);
        delete ctx.state.userStates[userId];
        await showMainMenu(ctx);
    });

    // Другие действия опущены для краткости
};