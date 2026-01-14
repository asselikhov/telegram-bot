const { Markup } = require('telegraf');
const { loadUsers, saveUser, deleteUser } = require('../../database/userModel');
const { clearPreviousMessages, parseAndFormatDate, formatDate } = require('../utils');
const { showMainMenu } = require('./menu');
const { ADMIN_ID } = require('../../config/config');
const { loadInviteCode } = require('../../database/inviteCodeModel');
const { 
    getAllOrganizations, 
    getOrganization, 
    createOrganization, 
    updateOrganization, 
    deleteOrganization 
} = require('../../database/organizationModel');
const { 
    getAllPositions, 
    getPosition, 
    createPosition, 
    updatePosition, 
    deletePosition 
} = require('../../database/positionModel');
const { 
    getAllObjects, 
    getObject, 
    createObject, 
    updateObject, 
    deleteObject 
} = require('../../database/objectModel');
const { 
    getOrganizationObjects, 
    getOrganizationsByObject,
    addObjectToOrganization, 
    removeObjectFromOrganization,
    removeAllObjectsFromOrganization,
    removeOrganizationFromObject
} = require('../../database/organizationObjectModel');
const { 
    getNotificationSettings: getNotifSettingsModel, 
    getAllNotificationSettings: getAllNotifSettingsModel,
    updateNotificationSettings 
} = require('../../database/notificationSettingsModel');
const { 
    loadAllReports,
    loadUserReports
} = require('../../database/reportModel');
const {
    loadAllNeeds,
    saveNeed
} = require('../../database/needModel');
const {
    setReportUsers,
    removeReportUsers,
    removeAllForOrganization,
    removeAllForObject
} = require('../../database/objectReportUsersModel');
const {
    setNeedUsers,
    removeNeedUsers,
    removeAllForOrganization: removeAllNeedUsersForOrganization,
    removeAllForObject: removeAllNeedUsersForObject
} = require('../../database/objectNeedUsersModel');
const { 
    getOrganizations: getOrgFromService,
    getPositions: getPosFromService,
    getObjects: getObjFromService,
    getNotificationSettings,
    getAllNotificationSettings,
    getReportUsers,
    getNeedUsers,
    getAllReportUsersMap,
    getAllNeedUsersMap,
    clearConfigCache 
} = require('../../database/configService');
const { 
    formatNotificationMessage, 
    validateTimeFormat 
} = require('../utils/notificationHelper');
const { ensureUserState, addMessageId } = require('../utils/stateHelper');
const { notifyNeedAuthorStatusChange, notifyResponsibleUsersStatusChange } = require('./needs');
const { escapeHtml } = require('../utils/htmlHelper');
const { 
    saveAnnouncement, 
    loadAllAnnouncements, 
    loadAnnouncement, 
    deleteAnnouncement, 
    updateAnnouncement 
} = require('../../database/announcementModel');
const { getObjectGroups } = require('../../database/configService');

async function showAdminPanel(ctx) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;

    try {
    await clearPreviousMessages(ctx, userId);
    
    const menuText = `
👑 АДМИН-ПАНЕЛЬ
➖➖➖➖➖➖➖➖➖➖➖
    `.trim();
    
    const message = await ctx.reply(
        menuText,
        Markup.inlineKeyboard([
            [Markup.button.callback('📋 Просмотреть заявки', 'view_applications')],
            [Markup.button.callback('👥 Управление пользователями', 'admin_users')],
            [Markup.button.callback('🏢 Управление организациями', 'admin_organizations')],
            [Markup.button.callback('🏗 Управление объектами', 'admin_objects')],
            [Markup.button.callback('📢 Объявления', 'admin_announcements')],
            [Markup.button.callback('🔔 Настройки уведомлений', 'admin_notifications')],
            [Markup.button.callback('📈 Статистика', 'admin_statistics')],
            [Markup.button.callback('↩️ Назад', 'main_menu')]
        ])
    );
        addMessageId(ctx, message.message_id);
    } catch (error) {
        console.error('Ошибка в showAdminPanel:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

async function showAnnouncementsMenu(ctx) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    
    try {
        await clearPreviousMessages(ctx, userId);
        
        const menuText = `
📢 ОБЪЯВЛЕНИЯ
➖➖➖➖➖➖➖➖➖➖➖
        `.trim();
        
        const message = await ctx.reply(
            menuText,
            Markup.inlineKeyboard([
                [Markup.button.callback('➕ Создать объявление', 'admin_announcements_create')],
                [Markup.button.callback('📋 Мои объявления', 'admin_announcements_list')],
                [Markup.button.callback('↩️ Назад', 'admin_panel')]
            ])
        );
        addMessageId(ctx, message.message_id);
    } catch (error) {
        console.error('Ошибка в showAnnouncementsMenu:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

async function showAnnouncementObjectSelection(ctx, selected = [], messageId = null) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    
    try {
        const allObjects = await getAllObjects();
        const objectNames = allObjects.map(obj => obj.name);
        
        if (!objectNames.length) {
            await clearPreviousMessages(ctx, userId);
            await ctx.reply('В базе данных нет объектов.');
            return;
        }
        
        const state = ensureUserState(ctx);
        const isEditMode = state.step === 'editAnnouncementObjects';
        
        const buttons = objectNames.map((objName, index) => {
            const isSelected = selected.includes(objName);
            return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${objName}`, `announcement_toggle_object_${index}`)];
        });
        if (isEditMode) {
            buttons.push([Markup.button.callback('Готово', 'announcement_confirm_objects_edit')]);
        } else {
            buttons.push([Markup.button.callback('Готово', 'announcement_confirm_objects')]);
        }
        buttons.push([Markup.button.callback('↩️ Назад', isEditMode ? `admin_announcement_view_${state.editingAnnouncementId}` : 'admin_announcements')]);
        
        const keyboard = Markup.inlineKeyboard(buttons);
        const text = 'Выберите объекты для объявления (можно выбрать несколько):';
        
        if (messageId) {
            try {
                await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, text, keyboard);
            } catch (e) {
                await ctx.reply(text, keyboard);
            }
        } else {
            await clearPreviousMessages(ctx, userId);
            const message = await ctx.reply(text, keyboard);
            ensureUserState(ctx);
            addMessageId(ctx, message.message_id);
        }
    } catch (error) {
        console.error('Ошибка в showAnnouncementObjectSelection:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

async function showAnnouncementPreview(ctx) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    
    try {
        const state = ensureUserState(ctx);
        if (!state.announcement || !state.announcement.text || !state.selectedObjects || state.selectedObjects.length === 0) {
            await ctx.reply('Ошибка: данные объявления неполные.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        
        const announcementText = state.announcement.text;
        const objectNames = state.selectedObjects;
        const photos = state.announcement.photos || [];
        const videos = state.announcement.videos || [];
        
        const objectsList = objectNames.map(obj => `· ${escapeHtml(obj)}`).join('\n');
        const previewText = `
📢 ОБЪЯВЛЕНИЕ

${announcementText}

🏗 Объекты:
${objectsList}
        `.trim();
        
        if (state.mediaGroupIds && state.mediaGroupIds.length > 0) {
            for (const msgId of state.mediaGroupIds) {
                await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(e => {});
            }
            state.mediaGroupIds = [];
        }
        
        if (photos.length > 0 || videos.length > 0) {
            const mediaGroup = [];
            photos.forEach((photoId, index) => {
                mediaGroup.push({
                    type: 'photo',
                    media: photoId,
                    caption: index === 0 && videos.length === 0 ? previewText.slice(0, 1024) : undefined,
                    parse_mode: 'HTML'
                });
            });
            videos.forEach((videoId, index) => {
                mediaGroup.push({
                    type: 'video',
                    media: videoId,
                    caption: index === 0 && photos.length === 0 ? previewText.slice(0, 1024) : undefined,
                    parse_mode: 'HTML'
                });
            });
            const mediaGroupMessages = await ctx.telegram.sendMediaGroup(ctx.chat.id, mediaGroup);
            state.mediaGroupIds = mediaGroupMessages.map(msg => msg.message_id);
        } else {
            const message = await ctx.reply(previewText, {
                parse_mode: 'HTML'
            });
            state.mediaGroupIds = [message.message_id];
        }
        
        const buttons = [
            [Markup.button.callback('✅ Отправить', 'send_announcement')],
            [Markup.button.callback('↩️ Отмена', 'admin_announcements')]
        ];
        const previewMessage = await ctx.reply('Предпросмотр объявления:', Markup.inlineKeyboard(buttons));
        addMessageId(ctx, previewMessage.message_id);
    } catch (error) {
        console.error('Ошибка в showAnnouncementPreview:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

async function sendAnnouncement(ctx) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    
    try {
        const state = ensureUserState(ctx);
        if (!state.announcement || !state.announcement.text || !state.selectedObjects || state.selectedObjects.length === 0) {
            await ctx.reply('Ошибка: данные объявления неполные.');
            return;
        }
        
        const users = await loadUsers();
        const user = users[userId];
        if (!user) {
            await ctx.reply('Ошибка: пользователь не найден.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        
        const announcementText = state.announcement.text;
        const objectNames = state.selectedObjects;
        const photos = state.announcement.photos || [];
        const videos = state.announcement.videos || [];
        
        // Отправляем только текст объявления без списка объектов и заголовка
        const messageText = announcementText;
        
        const objectGroups = await getObjectGroups();
        const date = new Date();
        const formattedDate = formatDate(date);
        const timestamp = date.toISOString();
        const announcementId = `announcement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const groupMessageIds = {};
        
        const tempMessage = await ctx.reply('⏳ Отправка объявления в группы...');
        addMessageId(ctx, tempMessage.message_id);
        
        for (const objectName of objectNames) {
            const groupChatId = objectGroups[objectName];
            if (!groupChatId) {
                console.warn(`У объекта "${objectName}" нет группы Telegram`);
                continue;
            }
            
            try {
                if (photos.length > 0 || videos.length > 0) {
                    const mediaGroup = [];
                    photos.forEach((photoId, index) => {
                        mediaGroup.push({
                            type: 'photo',
                            media: photoId,
                            caption: index === 0 && videos.length === 0 ? messageText.slice(0, 1024) : undefined,
                            parse_mode: 'HTML'
                        });
                    });
                    videos.forEach((videoId, index) => {
                        mediaGroup.push({
                            type: 'video',
                            media: videoId,
                            caption: index === 0 && photos.length === 0 ? messageText.slice(0, 1024) : undefined,
                            parse_mode: 'HTML'
                        });
                    });
                    const messages = await ctx.telegram.sendMediaGroup(groupChatId, mediaGroup);
                    groupMessageIds[groupChatId] = messages[0].message_id;
                } else {
                    const message = await ctx.telegram.sendMessage(groupChatId, messageText, {
                        parse_mode: 'HTML'
                    });
                    groupMessageIds[groupChatId] = message.message_id;
                }
            } catch (error) {
                console.error(`Ошибка отправки объявления в группу ${groupChatId}:`, error);
            }
        }
        
        const announcement = {
            announcementId,
            userId,
            text: announcementText,
            objectNames,
            date: formattedDate,
            timestamp,
            groupMessageIds,
            photos,
            videos,
            fullName: user.fullName || ''
        };
        
        await saveAnnouncement(userId, announcement);
        
        if (state.mediaGroupIds && state.mediaGroupIds.length > 0) {
            for (const msgId of state.mediaGroupIds) {
                await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(e => {});
            }
        }
        
        await clearPreviousMessages(ctx, userId);
        
        const successMessage = await ctx.reply('✅ Объявление успешно отправлено в выбранные группы!');
        addMessageId(ctx, successMessage.message_id);
        
        delete state.announcement;
        delete state.selectedObjects;
        state.step = null;
        
        setTimeout(async () => {
            await showAnnouncementsMenu(ctx);
        }, 2000);
    } catch (error) {
        console.error('Ошибка в sendAnnouncement:', error);
        await ctx.reply('Произошла ошибка при отправке объявления. Попробуйте позже.').catch(() => {});
    }
}

async function showAnnouncementsDates(ctx, page = 0) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    
    try {
        await clearPreviousMessages(ctx, userId);
        
        const allAnnouncements = await loadAllAnnouncements();
        const announcementsArray = Object.values(allAnnouncements);
        
        if (announcementsArray.length === 0) {
            const message = await ctx.reply('У вас пока нет объявлений.', Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Назад', 'admin_announcements')]
            ]));
            addMessageId(ctx, message.message_id);
            return;
        }
        
        const sortedAnnouncements = announcementsArray.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        const uniqueDates = [...new Set(sortedAnnouncements.map(a => parseAndFormatDate(a.date)))].sort((a, b) => {
            const dateA = new Date(a.split('.').reverse().join('-'));
            const dateB = new Date(b.split('.').reverse().join('-'));
            return dateB - dateA;
        });
        
        const itemsPerPage = 10;
        const totalPages = Math.ceil(uniqueDates.length / itemsPerPage);
        const pageNum = typeof page === 'number' ? page : 0;
        
        const startIndex = pageNum * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, uniqueDates.length);
        const currentDates = uniqueDates.slice(startIndex, endIndex);
        
        if (currentDates.length === 0) {
            return ctx.reply('Ошибка: нет дат для отображения.');
        }
        
        const dateButtons = currentDates.map((date, index) =>
            [Markup.button.callback(date, `admin_announcement_date_${startIndex + index}_page_${pageNum}`)]
        ).reverse();
        
        const buttons = [];
        const paginationButtons = [];
        if (totalPages > 1) {
            if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `admin_announcements_dates_page_${pageNum - 1}`));
            if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `admin_announcements_dates_page_${pageNum + 1}`));
        }
        if (paginationButtons.length > 0) buttons.push(paginationButtons);
        buttons.push(...dateButtons);
        buttons.push([Markup.button.callback('↩️ Назад', 'admin_announcements')]);
        
        const message = await ctx.reply(
            `Выберите дату (Страница ${pageNum + 1} из ${totalPages}):`,
            Markup.inlineKeyboard(buttons)
        );
        addMessageId(ctx, message.message_id);
    } catch (error) {
        console.error('Ошибка в showAnnouncementsDates:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

async function showAnnouncementsByDate(ctx, dateIndex, page = 0) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    
    try {
        await clearPreviousMessages(ctx, userId);
        
        const allAnnouncements = await loadAllAnnouncements();
        const announcementsArray = Object.values(allAnnouncements);
        
        const sortedAnnouncements = announcementsArray.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        const uniqueDates = [...new Set(sortedAnnouncements.map(a => parseAndFormatDate(a.date)))].sort((a, b) => {
            const dateA = new Date(a.split('.').reverse().join('-'));
            const dateB = new Date(b.split('.').reverse().join('-'));
            return dateB - dateA;
        });
        
        const selectedDate = uniqueDates[dateIndex];
        if (!selectedDate) {
            await ctx.reply('Ошибка: дата не найдена.');
            return;
        }
        
        const dateAnnouncements = sortedAnnouncements.filter(a => parseAndFormatDate(a.date) === selectedDate);
        
        const itemsPerPage = 10;
        const totalPages = Math.ceil(dateAnnouncements.length / itemsPerPage);
        const pageNum = typeof page === 'number' ? page : 0;
        
        const startIndex = pageNum * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, dateAnnouncements.length);
        const currentAnnouncements = dateAnnouncements.slice(startIndex, endIndex);
        
        if (currentAnnouncements.length === 0) {
            return ctx.reply('Ошибка: нет объявлений для отображения.');
        }
        
        const announcementButtons = currentAnnouncements.map((announcement) => {
            const time = new Date(announcement.timestamp).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' });
            const preview = announcement.text.length > 50 ? announcement.text.substring(0, 50) + '...' : announcement.text;
            return [Markup.button.callback(`${time} - ${preview}`, `admin_announcement_view_${announcement.announcementId}`)];
        }).reverse();
        
        const buttons = [];
        const paginationButtons = [];
        if (totalPages > 1) {
            if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `admin_announcement_date_${dateIndex}_page_${pageNum - 1}`));
            if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `admin_announcement_date_${dateIndex}_page_${pageNum + 1}`));
        }
        if (paginationButtons.length > 0) buttons.push(paginationButtons);
        buttons.push(...announcementButtons);
        buttons.push([Markup.button.callback('↩️ Назад', 'admin_announcements_list')]);
        
        const message = await ctx.reply(
            `Объявления за ${selectedDate} (Страница ${pageNum + 1} из ${totalPages}):`,
            Markup.inlineKeyboard(buttons)
        );
        addMessageId(ctx, message.message_id);
    } catch (error) {
        console.error('Ошибка в showAnnouncementsByDate:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

async function showAnnouncementDetails(ctx, announcementId) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    
    try {
        await clearPreviousMessages(ctx, userId);
        
        const announcement = await loadAnnouncement(announcementId);
        if (!announcement) {
            await ctx.reply('Объявление не найдено.');
            return;
        }
        
        const objectsList = announcement.objectNames.map(obj => `· ${escapeHtml(obj)}`).join('\n');
        const time = new Date(announcement.timestamp).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' });
        
        let detailsText = `
📢 ОБЪЯВЛЕНИЕ

${announcement.text}

🏗 Объекты:
${objectsList}

📅 Дата: ${announcement.date}
⏰ Время: ${time}
👤 Автор: ${escapeHtml(announcement.fullName)}
        `.trim();
        
        if (announcement.photos && announcement.photos.length > 0) {
            detailsText += `\n📸 Фото: ${announcement.photos.length} шт.`;
        }
        if (announcement.videos && announcement.videos.length > 0) {
            detailsText += `\n🎥 Видео: ${announcement.videos.length} шт.`;
        }
        
        const buttons = [
            [Markup.button.callback('✏️ Редактировать', `admin_announcement_edit_${announcementId}`)],
            [Markup.button.callback('🗑️ Удалить', `admin_announcement_delete_${announcementId}`)],
            [Markup.button.callback('↩️ Назад', 'admin_announcements_list')]
        ];
        
        if ((announcement.photos && announcement.photos.length > 0) || (announcement.videos && announcement.videos.length > 0)) {
            const mediaGroup = [];
            if (announcement.photos && announcement.photos.length > 0) {
                announcement.photos.forEach((photoId, index) => {
                    mediaGroup.push({
                        type: 'photo',
                        media: photoId,
                        caption: index === 0 && (!announcement.videos || announcement.videos.length === 0) ? detailsText.slice(0, 1024) : undefined,
                        parse_mode: 'HTML'
                    });
                });
            }
            if (announcement.videos && announcement.videos.length > 0) {
                announcement.videos.forEach((videoId, index) => {
                    mediaGroup.push({
                        type: 'video',
                        media: videoId,
                        caption: index === 0 && (!announcement.photos || announcement.photos.length === 0) ? detailsText.slice(0, 1024) : undefined,
                        parse_mode: 'HTML'
                    });
                });
            }
            const messages = await ctx.telegram.sendMediaGroup(ctx.chat.id, mediaGroup);
            messages.forEach(msg => addMessageId(ctx, msg.message_id));
        }
        
        const message = await ctx.reply(detailsText, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(buttons)
        });
        addMessageId(ctx, message.message_id);
    } catch (error) {
        console.error('Ошибка в showAnnouncementDetails:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

async function editAnnouncement(ctx, announcementId) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    
    try {
        await clearPreviousMessages(ctx, userId);
        
        const announcement = await loadAnnouncement(announcementId);
        if (!announcement) {
            await ctx.reply('Объявление не найдено.');
            return;
        }
        
        const buttons = [
            [Markup.button.callback('✏️ Текст', `admin_announcement_edit_text_${announcementId}`)],
            [Markup.button.callback('📸 Фото', `admin_announcement_edit_photos_${announcementId}`)],
            [Markup.button.callback('🏗 Объекты', `admin_announcement_edit_objects_${announcementId}`)],
            [Markup.button.callback('↩️ Назад', `admin_announcement_view_${announcementId}`)]
        ];
        
        const message = await ctx.reply('Что вы хотите редактировать?', Markup.inlineKeyboard(buttons));
        addMessageId(ctx, message.message_id);
    } catch (error) {
        console.error('Ошибка в editAnnouncement:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

async function confirmDeleteAnnouncement(ctx, announcementId) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    
    try {
        await clearPreviousMessages(ctx, userId);
        
        const buttons = [
            [Markup.button.callback('✅ Удалить', `admin_announcement_confirm_delete_${announcementId}`)],
            [Markup.button.callback('↩️ Отмена', `admin_announcement_view_${announcementId}`)]
        ];
        
        const message = await ctx.reply('Вы уверены, что хотите удалить это объявление?', Markup.inlineKeyboard(buttons));
        addMessageId(ctx, message.message_id);
    } catch (error) {
        console.error('Ошибка в confirmDeleteAnnouncement:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

async function deleteAnnouncementHandler(ctx, announcementId) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    
    try {
        await clearPreviousMessages(ctx, userId);
        
        const announcement = await loadAnnouncement(announcementId);
        if (!announcement) {
            await ctx.reply('Объявление не найдено.');
            return;
        }
        
        // Удаляем сообщения из групп
        for (const [chatId, messageId] of Object.entries(announcement.groupMessageIds)) {
            try {
                await ctx.telegram.deleteMessage(chatId, messageId);
            } catch (error) {
                console.error(`Ошибка удаления сообщения из группы ${chatId}:`, error);
            }
        }
        
        // Удаляем объявление из базы данных
        await deleteAnnouncement(announcementId);
        
        await ctx.reply('✅ Объявление успешно удалено.');
        await showAnnouncementsDates(ctx, 0);
    } catch (error) {
        console.error('Ошибка в deleteAnnouncementHandler:', error);
        await ctx.reply('Произошла ошибка при удалении объявления. Попробуйте позже.').catch(() => {});
    }
}

async function showApplications(ctx) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;

    try {
    await clearPreviousMessages(ctx, userId);
    const users = await loadUsers();
    const pendingUsers = Object.entries(users).filter(([_, user]) => !user.isApproved);

    if (pendingUsers.length === 0) {
        const message = await ctx.reply('Заявок на рассмотрение нет.', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Назад', 'admin_panel')]
        ]));
            addMessageId(ctx, message.message_id);
        return;
    }

    const buttons = pendingUsers.map(([uid, user]) => [
        Markup.button.callback(
            `${user.fullName} (${user.organization})`,
            `review_${uid}`
        )
    ]);
    buttons.push([Markup.button.callback('↩️ Назад', 'admin_panel')]);

    const message = await ctx.reply('Заявки на рассмотрение:', Markup.inlineKeyboard(buttons));
        addMessageId(ctx, message.message_id);
    } catch (error) {
        console.error('Ошибка в showApplications:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
    }
}

// Вспомогательные функции для проверки использования
async function getUsersByOrganization(orgName) {
    const users = await loadUsers();
    return Object.entries(users).filter(([_, user]) => user.organization === orgName);
}

async function getUsersByPosition(positionName) {
    const users = await loadUsers();
    return Object.entries(users).filter(([_, user]) => user.position === positionName);
}

async function getUsersByObject(objectName) {
    const users = await loadUsers();
    return Object.entries(users).filter(([_, user]) => 
        Array.isArray(user.selectedObjects) && user.selectedObjects.includes(objectName)
    );
}

async function getReportsByObject(objectName) {
    const allReports = await loadAllReports();
    // Нормализуем названия объектов для сравнения (убираем пробелы в начале и конце)
    const normalizedObjectName = objectName && objectName.trim();
    return Object.values(allReports).filter(report => 
        report.objectName && report.objectName.trim() === normalizedObjectName
    );
}

// Экспортируем функции для использования в других модулях
const exportedFunctions = {
    getUsersByObject,
    getReportsByObject
};

module.exports = (bot) => {
    bot.action('admin_panel', showAdminPanel);
    bot.action('view_applications', showApplications);
    
    // Объявления
    bot.action('admin_announcements', showAnnouncementsMenu);
    bot.action('admin_announcements_create', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const state = ensureUserState(ctx);
        state.selectedObjects = [];
        state.announcement = {};
        state.step = 'announcementObjects';
        await showAnnouncementObjectSelection(ctx, []);
    });
    bot.action('admin_announcements_list', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        await showAnnouncementsDates(ctx, 0);
    });
    
    bot.action(/announcement_toggle_object_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objectIndex = parseInt(ctx.match[1], 10);
        const state = ensureUserState(ctx);
        const allObjects = await getAllObjects();
        const objectNames = allObjects.map(obj => obj.name);
        const objectName = objectNames[objectIndex];
        
        if (!state.selectedObjects) {
            state.selectedObjects = [];
        }
        
        const index = state.selectedObjects.indexOf(objectName);
        if (index === -1) {
            state.selectedObjects.push(objectName);
        } else {
            state.selectedObjects.splice(index, 1);
        }
        
        const lastMessageId = state.messageIds && state.messageIds[state.messageIds.length - 1];
        await showAnnouncementObjectSelection(ctx, state.selectedObjects, lastMessageId);
    });
    
    bot.action('announcement_confirm_objects', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const state = ensureUserState(ctx);
        if (!state.selectedObjects || state.selectedObjects.length === 0) {
            await ctx.reply('Выберите хотя бы один объект.');
            await showAnnouncementObjectSelection(ctx, []);
            return;
        }
        
        state.step = 'announcementText';
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('💡 Введите объявление:');
        addMessageId(ctx, message.message_id);
    });
    
    bot.action('send_announcement', sendAnnouncement);
    
    bot.action(/admin_announcements_dates_page_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const page = parseInt(ctx.match[1], 10);
        await showAnnouncementsDates(ctx, page);
    });
    
    bot.action(/admin_announcement_date_(\d+)_page_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const dateIndex = parseInt(ctx.match[1], 10);
        const page = parseInt(ctx.match[2], 10);
        await showAnnouncementsByDate(ctx, dateIndex, page);
    });
    
    bot.action(/admin_announcement_view_(.+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const announcementId = ctx.match[1];
        await showAnnouncementDetails(ctx, announcementId);
    });
    
    bot.action(/admin_announcement_edit_(.+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const announcementId = ctx.match[1];
        await editAnnouncement(ctx, announcementId);
    });
    
    bot.action(/admin_announcement_edit_text_(.+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const announcementId = ctx.match[1];
        const state = ensureUserState(ctx);
        state.step = 'editAnnouncementText';
        state.editingAnnouncementId = announcementId;
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('Введите новый текст объявления:');
        addMessageId(ctx, message.message_id);
    });
    
    bot.action(/admin_announcement_edit_photos_(.+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const announcementId = ctx.match[1];
        const announcement = await loadAnnouncement(announcementId);
        if (!announcement) {
            await ctx.reply('Объявление не найдено.');
            return;
        }
        const state = ensureUserState(ctx);
        state.step = 'editAnnouncementPhotos';
        state.editingAnnouncementId = announcementId;
        state.announcement = {
            photos: [...(announcement.photos || [])],
            videos: [...(announcement.videos || [])],
            text: announcement.text
        };
        state.mediaGroupIds = [];
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply(
            '📸 Прикрепите новые изображения или видео к объявлению или нажмите "Готово" для завершения',
            Markup.inlineKeyboard([
                [Markup.button.callback('Удалить все медиа', `admin_announcement_delete_all_media_${announcementId}`)],
                [Markup.button.callback('Готово', `finish_edit_announcement_photos_${announcementId}`)]
            ])
        );
        addMessageId(ctx, message.message_id);
    });
    
    bot.action(/admin_announcement_edit_objects_(.+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const announcementId = ctx.match[1];
        const announcement = await loadAnnouncement(announcementId);
        if (!announcement) {
            await ctx.reply('Объявление не найдено.');
            return;
        }
        const state = ensureUserState(ctx);
        state.editingAnnouncementId = announcementId;
        state.selectedObjects = [...(announcement.objectNames || [])];
        state.step = 'editAnnouncementObjects';
        await showAnnouncementObjectSelection(ctx, state.selectedObjects);
    });
    
    bot.action(/admin_announcement_delete_(.+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const announcementId = ctx.match[1];
        await confirmDeleteAnnouncement(ctx, announcementId);
    });
    
    bot.action(/admin_announcement_confirm_delete_(.+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const announcementId = ctx.match[1];
        await deleteAnnouncementHandler(ctx, announcementId);
    });
    
    bot.action(/admin_announcement_delete_all_media_(.+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const announcementId = ctx.match[1];
        const state = ensureUserState(ctx);
        if (state.announcement) {
            state.announcement.photos = [];
            state.announcement.videos = [];
        }
        if (state.mediaGroupIds && state.mediaGroupIds.length > 0) {
            for (const msgId of state.mediaGroupIds) {
                await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(e => {});
            }
            state.mediaGroupIds = [];
        }
        await ctx.answerCbQuery('Все медиа удалены');
    });
    
    bot.action(/finish_edit_announcement_photos_(.+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const announcementId = ctx.match[1];
        const state = ensureUserState(ctx);
        if (!state || state.step !== 'editAnnouncementPhotos') return;
        
        if (state.mediaGroupIds && state.mediaGroupIds.length > 0) {
            for (const msgId of state.mediaGroupIds) {
                await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(e => {});
            }
        }
        await clearPreviousMessages(ctx, userId);
        state.mediaGroupIds = [];
        state.messageIds = [];
        
        const photos = state.announcement ? (state.announcement.photos || []) : [];
        const videos = state.announcement ? (state.announcement.videos || []) : [];
        await updateAnnouncement(announcementId, { photos, videos });
        
        state.step = null;
        state.editingAnnouncementId = null;
        state.announcement = null;
        
        await ctx.reply('✅ Медиа объявления обновлены.');
        await showAnnouncementDetails(ctx, announcementId);
    });
    
    bot.action(/announcement_confirm_objects_edit/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const state = ensureUserState(ctx);
        if (!state.selectedObjects || state.selectedObjects.length === 0) {
            await ctx.reply('Выберите хотя бы один объект.');
            await showAnnouncementObjectSelection(ctx, []);
            return;
        }
        
        const announcementId = state.editingAnnouncementId;
        if (!announcementId) {
            await ctx.reply('Ошибка: объявление не найдено.');
            return;
        }
        
        await updateAnnouncement(announcementId, { objectNames: state.selectedObjects });
        
        state.step = null;
        state.editingAnnouncementId = null;
        state.selectedObjects = [];
        
        await clearPreviousMessages(ctx, userId);
        await ctx.reply('✅ Объекты объявления обновлены.');
        await showAnnouncementDetails(ctx, announcementId);
    });

    bot.action(/review_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        try {
        const reviewUserId = ctx.match[1];
        const users = await loadUsers();
        const user = users[reviewUserId];

        if (!user || user.isApproved) return;

        const inviteCodeData = await loadInviteCode(reviewUserId);

        const creatorId = inviteCodeData?.createdBy;
        let creatorFullName;
        if (!inviteCodeData || !creatorId) {
            creatorFullName = 'Код не зарегистрирован';
        } else {
            const creator = users[creatorId];
            creatorFullName = creator ? creator.fullName : 'Пользователь не найден';
        }

        const usedAt = inviteCodeData?.usedAt
            ? new Date(inviteCodeData.usedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
            : 'Не указано';

        const selectedObjects = Array.isArray(user.selectedObjects)
            ? user.selectedObjects
            : user.selectedObjects
                ? [user.selectedObjects]
                : [];
        const objectsList = selectedObjects.length > 0
            ? selectedObjects.map(obj => `· ${obj}`).join('\n')
            : 'Не выбраны';

        await clearPreviousMessages(ctx, userId);

        const userData = `
📝 **Заявка на регистрацию**  
➖➖➖➖➖➖➖➖➖➖➖  
👤 **ФИО:** ${user.fullName || 'Не указано'}  
🏢 **Организация:** ${user.organization || 'Не указано'}  
💼 **Должность:** ${user.position || 'Не указана'}  
📞 **Телефон:** ${user.phone || 'Не указан'}  
🏗 **Объекты:**  
${objectsList}  
🔑 **Код создан:** ${creatorFullName}  
⏰ **Использован:** ${usedAt}
        `.trim();

        const message = await ctx.reply(userData, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('✅ Одобрить', `approve_${reviewUserId}`)],
                [Markup.button.callback('❌ Отклонить', `reject_${reviewUserId}`)],
                [Markup.button.callback('↩️ Назад', 'view_applications')]
            ]).reply_markup
        });
            addMessageId(ctx, message.message_id);
        } catch (error) {
            console.error('Ошибка в обработчике review:', error);
            await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
        }
    });

    bot.action(/approve_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        try {
        const approveUserId = ctx.match[1];
        const users = await loadUsers();
        const user = users[approveUserId];

        if (user && !user.isApproved) {
            users[approveUserId].isApproved = 1;
            await saveUser(approveUserId, users[approveUserId]);
                await ctx.telegram.sendMessage(approveUserId, '✅ Ваша заявка одобрена! Используйте /start для входа в меню.').catch(() => {});
            await ctx.reply(`Заявка ${user.fullName || approveUserId} одобрена.`);
        }
        await showApplications(ctx);
        } catch (error) {
            console.error('Ошибка в обработчике approve:', error);
            await ctx.reply('Произошла ошибка при одобрении заявки.').catch(() => {});
        }
    });

    bot.action(/reject_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        try {
        const rejectUserId = ctx.match[1];
        const users = await loadUsers();
        const user = users[rejectUserId];

        if (user && !user.isApproved) {
            await deleteUser(rejectUserId);
                await ctx.telegram.sendMessage(rejectUserId, '❌ Ваша заявка отклонена администратором.').catch(() => {});
            await ctx.reply(`Заявка ${user.fullName || rejectUserId} отклонена.`);
        }
        await showApplications(ctx);
        } catch (error) {
            console.error('Ошибка в обработчике reject:', error);
            await ctx.reply('Произошла ошибка при отклонении заявки.').catch(() => {});
        }
    });

    // ========== УПРАВЛЕНИЕ ОРГАНИЗАЦИЯМИ ==========
    
    const showOrganizationsList = async function showOrganizationsList(ctx) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        try {
        await clearPreviousMessages(ctx, userId);
        const organizations = await getAllOrganizations();
        
        if (organizations.length === 0) {
            const message = await ctx.reply('Организаций нет.', Markup.inlineKeyboard([
                [Markup.button.callback('➕ Добавить организацию', 'admin_org_add')],
                [Markup.button.callback('↩️ Назад', 'admin_panel')]
            ]));
                addMessageId(ctx, message.message_id);
            return;
        }
        
        // Сохраняем список организаций в state для использования в обработчике
            const state = ensureUserState(ctx);
            if (state) {
                state.adminOrganizationsList = organizations.map(org => org.name);
            }
        
        // Создаем кнопки для организаций
        const buttons = [];
        for (let index = 0; index < organizations.length; index++) {
            const org = organizations[index];
            const buttonText = org.name || `Организация ${index + 1}`;
            const callbackData = `org_${index}`;
            buttons.push([Markup.button.callback(buttonText, callbackData)]);
        }
        buttons.push([Markup.button.callback('➕ Добавить организацию', 'admin_org_add')]);
        buttons.push([Markup.button.callback('↩️ Назад', 'admin_panel')]);
        
        const message = await ctx.reply('🏢 Управление организациями\nВыберите организацию:', Markup.inlineKeyboard(buttons));
            addMessageId(ctx, message.message_id);
        } catch (error) {
            console.error('Ошибка в showOrganizationsList:', error);
            await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
        }
    }

    bot.action('admin_organizations', showOrganizationsList);
    bot.action('admin_org_add', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_org_add_name';
        const message = await ctx.reply('Введите название новой организации:', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_organizations')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });

    bot.action(/^org_(\d+)$/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgIndex = parseInt(ctx.match[1], 10);
        const orgNames = ctx.state.userStates[userId].adminOrganizationsList;
        if (!orgNames || !orgNames[orgIndex]) {
            await ctx.reply('Организация не найдена.');
            await showOrganizationsList(ctx);
            return;
        }
        
        const orgName = orgNames[orgIndex];
        // Сохраняем индекс для кнопки "Назад" в редактировании
        ctx.state.userStates[userId].adminSelectedOrgIndex = orgIndex;
        // Сохраняем orgName для обработчиков редактирования/удаления
        ctx.state.userStates[userId].adminSelectedOrgName = orgName;
        await clearPreviousMessages(ctx, userId);
        
        const org = await getOrganization(orgName);
        if (!org) {
            await ctx.reply('Организация не найдена.');
            await showOrganizationsList(ctx);
            return;
        }
        
        const orgObjects = await getOrganizationObjects(orgName);
        const objectsList = orgObjects.length > 0 ? orgObjects.map(obj => `· ${obj}`).join('\n') : 'Не выбраны';
        
        const orgText = `
🏢 **${org.name}**

📱 ID чата: ${org.chatId || 'Не указан'}
📊 Источники отчетов: ${org.reportSources.length > 0 ? org.reportSources.join(', ') : 'Нет'}
🏗 Объекты:
${objectsList}
        `.trim();
        
        const message = await ctx.reply(orgText, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('✏️ Редактировать', 'admin_org_edit')],
                [Markup.button.callback('🗑 Удалить', 'admin_org_delete')],
                [Markup.button.callback('↩️ Назад', 'admin_organizations')]
            ]).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });

    // Обработчик редактирования организации
    bot.action('admin_org_edit', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgName = ctx.state.userStates[userId].adminSelectedOrgName;
        if (!orgName) {
            await ctx.reply('Ошибка: организация не выбрана.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        const orgIndex = ctx.state.userStates[userId].adminSelectedOrgIndex ?? ctx.state.userStates[userId].adminOrganizationsList?.indexOf(orgName) ?? 0;
        const message = await ctx.reply('Выберите, что хотите редактировать:', Markup.inlineKeyboard([
            [Markup.button.callback('✏️ Название', 'admin_org_edit_name')],
            [Markup.button.callback('📱 ID чата (Telegram)', 'admin_org_edit_chatid')],
            [Markup.button.callback('🏗 Объекты', 'admin_org_edit_objects')],
            [Markup.button.callback('💼 Редактирование должностей', 'admin_org_edit_positions')],
            [Markup.button.callback('↩️ Назад', `org_${orgIndex}`)]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_org_edit_name', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_org_edit_name';
        const message = await ctx.reply('Введите новое название организации:', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_org_edit')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_org_edit_chatid', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_org_edit_chatid';
        const message = await ctx.reply('Введите новый ID чата Telegram (или /clear для очистки):', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_org_edit')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_org_edit_objects', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgName = ctx.state.userStates[userId].adminSelectedOrgName;
        if (!orgName) {
            await ctx.reply('Ошибка: организация не выбрана.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        
        // Получаем все объекты и объекты организации
        const allObjects = await getAllObjects();
        const orgObjects = await getOrganizationObjects(orgName);
        
        if (allObjects.length === 0) {
            await ctx.reply('В системе нет объектов. Сначала создайте объекты.');
            const orgIndex = ctx.state.userStates[userId].adminSelectedOrgIndex ?? 0;
            await ctx.telegram.sendMessage(ctx.chat.id, 'Вернуться к организации', Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Назад', `org_${orgIndex}`)]
            ]));
            return;
        }
        
        // Сохраняем текущее состояние выбранных объектов
        ctx.state.userStates[userId].adminOrgEditSelectedObjects = [...orgObjects];
        ctx.state.userStates[userId].adminOrgEditAvailableObjects = allObjects.map(obj => obj.name);
        
        // Создаем кнопки для объектов
        const buttons = allObjects.map((obj, index) => {
            const isSelected = orgObjects.includes(obj.name);
            return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${obj.name}`, `admin_org_toggle_object_${index}`)];
        });
        buttons.push([Markup.button.callback('✅ Готово', 'admin_org_confirm_objects')]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_org_edit')]);
        
        const message = await ctx.reply('Выберите объекты для организации (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action(/admin_org_toggle_object_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgName = ctx.state.userStates[userId].adminSelectedOrgName;
        if (!orgName) {
            await ctx.reply('Ошибка: организация не выбрана.');
            return;
        }
        
        const objectIndex = parseInt(ctx.match[1], 10);
        const availableObjects = ctx.state.userStates[userId].adminOrgEditAvailableObjects;
        if (!availableObjects || !availableObjects[objectIndex]) {
            await ctx.reply('Объект не найден.');
            return;
        }
        
        const objectName = availableObjects[objectIndex];
        let selectedObjects = ctx.state.userStates[userId].adminOrgEditSelectedObjects || [];
        
        const index = selectedObjects.indexOf(objectName);
        if (index === -1) {
            selectedObjects.push(objectName);
        } else {
            selectedObjects.splice(index, 1);
        }
        
        ctx.state.userStates[userId].adminOrgEditSelectedObjects = selectedObjects;
        
        // Обновляем сообщение
        const allObjects = await getAllObjects();
        const buttons = allObjects.map((obj, idx) => {
            const isSelected = selectedObjects.includes(obj.name);
            return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${obj.name}`, `admin_org_toggle_object_${idx}`)];
        });
        buttons.push([Markup.button.callback('✅ Готово', 'admin_org_confirm_objects')]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_org_edit')]);
        
        const messageIds = ctx.state.userStates[userId].messageIds || [];
        const lastMessageId = messageIds.length > 0 ? messageIds[messageIds.length - 1] : null;
        if (lastMessageId) {
        try {
            await ctx.telegram.editMessageText(ctx.chat.id, lastMessageId, null, 'Выберите объекты для организации (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
        } catch (e) {
                await ctx.reply('Выберите объекты для организации (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
            }
        } else {
            await ctx.reply('Выберите объекты для организации (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
        }
    });
    
    bot.action('admin_org_confirm_objects', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgName = ctx.state.userStates[userId].adminSelectedOrgName;
        if (!orgName) {
            await ctx.reply('Ошибка: организация не выбрана.');
            return;
        }
        
        const selectedObjects = ctx.state.userStates[userId].adminOrgEditSelectedObjects || [];
        const currentOrgObjects = await getOrganizationObjects(orgName);
        
        // Определяем, какие объекты добавить, а какие удалить
        const toAdd = selectedObjects.filter(obj => !currentOrgObjects.includes(obj));
        const toRemove = currentOrgObjects.filter(obj => !selectedObjects.includes(obj));
        
        // Добавляем новые связи
        for (const objName of toAdd) {
            await addObjectToOrganization(orgName, objName);
        }
        
        // Удаляем старые связи
        for (const objName of toRemove) {
            await removeObjectFromOrganization(orgName, objName);
            await removeReportUsers(orgName, objName);
        }
        
        clearConfigCache();
        ctx.state.userStates[userId].adminOrgEditSelectedObjects = null;
        ctx.state.userStates[userId].adminOrgEditAvailableObjects = null;
        
        await ctx.reply(`✅ Объекты организации "${orgName}" успешно обновлены.`);
        const orgIndex = ctx.state.userStates[userId].adminSelectedOrgIndex ?? 0;
        
        // Возвращаемся к просмотру организации
        const orgNames = ctx.state.userStates[userId].adminOrganizationsList;
        if (orgNames && orgNames[orgIndex]) {
            // Используем существующий обработчик для отображения организации
            const orgNameToShow = orgNames[orgIndex];
            ctx.state.userStates[userId].adminSelectedOrgName = orgNameToShow;
            await clearPreviousMessages(ctx, userId);
            
            const org = await getOrganization(orgNameToShow);
            if (org) {
                const orgObjects = await getOrganizationObjects(orgNameToShow);
                const objectsList = orgObjects.length > 0 ? orgObjects.map(obj => `· ${obj}`).join('\n') : 'Не выбраны';
                
                const orgText = `
🏢 **${org.name}**

📱 ID чата: ${org.chatId || 'Не указан'}
📊 Источники отчетов: ${org.reportSources.length > 0 ? org.reportSources.join(', ') : 'Нет'}
🏗 Объекты:
${objectsList}
                `.trim();
                
                const message = await ctx.reply(orgText, {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard([
                        [Markup.button.callback('✏️ Редактировать', 'admin_org_edit')],
                        [Markup.button.callback('🗑 Удалить', 'admin_org_delete')],
                        [Markup.button.callback('↩️ Назад', 'admin_organizations')]
                    ]).reply_markup
                });
                ctx.state.userStates[userId].messageIds.push(message.message_id);
            } else {
                await showOrganizationsList(ctx);
            }
        } else {
            await showOrganizationsList(ctx);
        }
    });
    
    // Обработчики удаления и редактирования организаций
    bot.action('admin_org_delete', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const orgName = ctx.state.userStates[userId].adminSelectedOrgName;
        if (!orgName) {
            await ctx.reply('Ошибка: организация не выбрана.');
            return;
        }
        
        // Проверяем использование организации
        const usersWithOrg = await getUsersByOrganization(orgName);
        if (usersWithOrg.length > 0) {
            // Предлагаем миграцию пользователей
            const allOrgs = await getAllOrganizations();
            const availableOrgs = allOrgs.filter(org => org.name !== orgName).map(org => org.name);
            
            if (availableOrgs.length === 0) {
                await ctx.reply(`⚠️ Невозможно удалить организацию "${orgName}". Она используется ${usersWithOrg.length} пользователем(ями), но нет других организаций для миграции.`);
                return;
            }
            
            // Сохраняем информацию для миграции
            ctx.state.userStates[userId].orgDeleteContext = {
                orgName,
                usersToMigrate: usersWithOrg.map(([uid, _]) => uid)
            };
            
            // Предлагаем выбрать организацию для миграции
            ctx.state.userStates[userId].availableOrgsForMigration = availableOrgs;
            const buttons = availableOrgs.slice(0, 10).map((org, index) => [
                Markup.button.callback(org, `admin_org_migrate_${index}`)
            ]);
            const orgIndex = ctx.state.userStates[userId].adminSelectedOrgIndex ?? 0;
            buttons.push([Markup.button.callback('↩️ Отмена', `org_${orgIndex}`)]);
            
            await ctx.reply(
                `⚠️ Организация "${orgName}" используется ${usersWithOrg.length} пользователем(ями).\n\nВыберите организацию для миграции пользователей:`,
                Markup.inlineKeyboard(buttons)
            );
            return;
        }
        
        // Если нет пользователей, удаляем организацию
        await removeAllObjectsFromOrganization(orgName);
        await removeAllForOrganization(orgName);
        await deleteOrganization(orgName);
        clearConfigCache();
        
        await ctx.reply(`✅ Организация "${orgName}" удалена.`);
        await showOrganizationsList(ctx);
    });
    
    bot.action(/admin_org_migrate_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgIndex = parseInt(ctx.match[1], 10);
        const context = ctx.state.userStates[userId].orgDeleteContext;
        const availableOrgs = ctx.state.userStates[userId].availableOrgsForMigration;
        
        if (!context || !availableOrgs || !availableOrgs[orgIndex]) {
            await ctx.reply('Ошибка: контекст миграции не найден.');
            return;
        }
        
        const targetOrg = availableOrgs[orgIndex];
        const users = await loadUsers();
        
        // Мигрируем пользователей
        for (const uid of context.usersToMigrate) {
            if (users[uid]) {
                users[uid].organization = targetOrg;
                await saveUser(uid, users[uid]);
            }
        }
        
        // Удаляем связи организации с объектами
        await removeAllObjectsFromOrganization(context.orgName);
        // Удаляем настройки пользователей для отчетов
        await removeAllForOrganization(context.orgName); // report users
        await removeAllNeedUsersForOrganization(context.orgName); // need users
        // Удаляем организацию
        await deleteOrganization(context.orgName);
        clearConfigCache();
        
        // Очищаем контекст
        delete ctx.state.userStates[userId].orgDeleteContext;
        delete ctx.state.userStates[userId].availableOrgsForMigration;
        
        await ctx.reply(`✅ Организация "${context.orgName}" удалена. Пользователи мигрированы в "${targetOrg}".`);
        await showOrganizationsList(ctx);
    });
    
    // ========== УПРАВЛЕНИЕ ДОЛЖНОСТЯМИ ОРГАНИЗАЦИИ ==========
    bot.action('admin_org_edit_positions', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgName = ctx.state.userStates[userId].adminSelectedOrgName;
        if (!orgName) {
            await ctx.reply('Ошибка: организация не выбрана.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        const positions = await getAllPositions(orgName);
        ctx.state.userStates[userId].adminPositionsList = positions.map(pos => pos.name);
        ctx.state.userStates[userId].adminSelectedOrgName = orgName; // Сохраняем организацию для других обработчиков
        
        const buttons = [];
        for (let index = 0; index < positions.length; index++) {
            const pos = positions[index];
            const buttonText = pos.name || `Должность ${index + 1}`;
            const callbackData = `admin_org_pos_${index}`;
            buttons.push([Markup.button.callback(buttonText, callbackData)]);
        }
        buttons.push([Markup.button.callback('➕ Добавить должность', 'admin_org_pos_add')]);
        buttons.push([Markup.button.callback('↩️ Назад', 'admin_org_edit')]);
        const message = await ctx.reply(`💼 Редактирование должностей\nОрганизация: **${orgName}**\n\nВыберите должность:`, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_org_pos_add', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgName = ctx.state.userStates[userId].adminSelectedOrgName;
        if (!orgName) {
            await ctx.reply('Ошибка: организация не выбрана.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_org_pos_add_name';
        const message = await ctx.reply('Введите название новой должности:', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_org_edit_positions')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action(/^admin_org_pos_(\d+)$/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgName = ctx.state.userStates[userId].adminSelectedOrgName;
        if (!orgName) {
            await ctx.reply('Ошибка: организация не выбрана.');
            return;
        }
        
        const posIndex = parseInt(ctx.match[1], 10);
        const posNames = ctx.state.userStates[userId].adminPositionsList;
        if (!posNames || !posNames[posIndex]) {
            await ctx.reply('Должность не найдена.');
            await ctx.telegram.sendMessage(ctx.chat.id, 'Вернуться к должностям', Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Назад', 'admin_org_edit_positions')]
            ]));
            return;
        }
        const posName = posNames[posIndex];
        ctx.state.userStates[userId].adminSelectedPosName = posName;
        ctx.state.userStates[userId].adminSelectedOrgName = orgName;
        
        const usersWithPos = await getUsersByPosition(posName);
        await clearPreviousMessages(ctx, userId);
        const posText = `💼 **${posName}**\n\n👥 Используется пользователями: ${usersWithPos.length}`;
        const message = await ctx.reply(posText, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('🗑 Удалить', 'admin_org_pos_delete')],
                [Markup.button.callback('↩️ Назад', 'admin_org_edit_positions')]
            ]).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_org_pos_delete', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const posName = ctx.state.userStates[userId].adminSelectedPosName;
        const orgName = ctx.state.userStates[userId].adminSelectedOrgName;
        if (!posName || !orgName) {
            await ctx.reply('Ошибка: должность или организация не выбраны.');
            return;
        }
        
        const usersWithPos = await getUsersByPosition(posName);
        if (usersWithPos.length > 0) {
            await ctx.reply(`⚠️ Невозможно удалить должность "${posName}". Она используется ${usersWithPos.length} пользователем(ями).`);
            return;
        }
        await deletePosition(orgName, posName);
        clearConfigCache();
        await ctx.reply(`✅ Должность "${posName}" удалена.`);
        
        // Возвращаемся к списку должностей организации
        await ctx.telegram.sendMessage(ctx.chat.id, 'Вернуться к должностям', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Назад', 'admin_org_edit_positions')]
        ]));
    });

    // ========== УПРАВЛЕНИЕ ОБЪЕКТАМИ ==========
    const showObjectsList = async function showObjectsList(ctx) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        await clearPreviousMessages(ctx, userId);
        const objects = await getAllObjects();
        ctx.state.userStates[userId].adminObjectsList = objects.map(obj => obj.name);
        const buttons = [];
        for (let index = 0; index < objects.length; index++) {
            const obj = objects[index];
            const buttonText = obj.name || `Объект ${index + 1}`;
            const callbackData = `obj_${index}`;
            buttons.push([Markup.button.callback(buttonText, callbackData)]);
        }
        buttons.push([Markup.button.callback('➕ Добавить объект', 'admin_obj_add')]);
        buttons.push([Markup.button.callback('↩️ Назад', 'admin_panel')]);
        const message = await ctx.reply('🏗 Управление объектами\nВыберите объект:', Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    }
    bot.action('admin_objects', showObjectsList);
    bot.action('admin_obj_add', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_obj_add_name';
        const message = await ctx.reply('Введите название нового объекта:', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_objects')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action(/^obj_(\d+)$/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const objIndex = parseInt(ctx.match[1], 10);
        const objNames = ctx.state.userStates[userId].adminObjectsList;
        if (!objNames || !objNames[objIndex]) {
            await ctx.reply('Объект не найден.');
            await showObjectsList(ctx);
            return;
        }
        const objName = objNames[objIndex];
        ctx.state.userStates[userId].adminSelectedObjName = objName;
        
        const obj = await getObject(objName);
        const usersWithObj = await getUsersByObject(objName);
        const reportsWithObj = await getReportsByObject(objName);
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].adminSelectedObjIndex = objIndex;
        const statusEmoji = obj.status === 'В работе' ? '🟢' : '❄️';
        const objText = `🏗 **${obj.name}**\n\n📱 ID группы: ${obj.telegramGroupId || 'Не указан'}\n📊 Статус: ${statusEmoji} ${obj.status || 'В работе'}\n👥 Используется пользователями: ${usersWithObj.length}\n📄 Отчетов: ${reportsWithObj.length}`;
        const buttons = [
            [Markup.button.callback('✏️ Редактировать', 'admin_obj_edit')],
            [Markup.button.callback('📋 Настройка отчетов', `admin_obj_report_users_${objIndex}`)],
            [Markup.button.callback('📦 Настройка потребностей', `admin_obj_need_users_${objIndex}`)],
            [Markup.button.callback('🗑 Удалить', 'admin_obj_delete')],
            [Markup.button.callback('↩️ Назад', 'admin_objects')]
        ];
        const message = await ctx.reply(objText, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_obj_edit', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const objName = ctx.state.userStates[userId].adminSelectedObjName;
        if (!objName) {
            await ctx.reply('Ошибка: объект не выбран.');
            return;
        }
        
        const obj = await getObject(objName);
        const objIndex = ctx.state.userStates[userId].adminSelectedObjIndex ?? 0;
        
        await clearPreviousMessages(ctx, userId);
        const statusEmoji = obj.status === 'В работе' ? '🟢' : '❄️';
        const message = await ctx.reply(`✏️ Редактирование объекта "${objName}"\n\n📊 Статус: ${statusEmoji} ${obj.status || 'В работе'}`, Markup.inlineKeyboard([
            [Markup.button.callback('✏️ Название', 'admin_obj_edit_name')],
            [Markup.button.callback('📊 Статус', 'admin_obj_edit_status')],
            [Markup.button.callback('📱 ID группы (Telegram)', 'admin_obj_edit_groupid')],
            [Markup.button.callback('👁 Просмотреть группу', 'admin_obj_view_group')],
            [Markup.button.callback('↩️ Назад', `obj_${objIndex}`)]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_obj_edit_name', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const objName = ctx.state.userStates[userId].adminSelectedObjName;
        if (!objName) {
            await ctx.reply('Ошибка: объект не выбран.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_obj_edit_name';
        const message = await ctx.reply('Введите новое название объекта:', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_obj_edit')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_obj_edit_status', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const objName = ctx.state.userStates[userId].adminSelectedObjName;
        if (!objName) {
            await ctx.reply('Ошибка: объект не выбран.');
            return;
        }
        
        const obj = await getObject(objName);
        const objIndex = ctx.state.userStates[userId].adminSelectedObjIndex ?? 0;
        const currentStatus = obj.status || 'В работе';
        
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply(`📊 Выберите статус для объекта "${objName}":\n\nТекущий статус: ${currentStatus === 'В работе' ? '🟢 В работе' : '❄️ Заморожен'}`, Markup.inlineKeyboard([
            [Markup.button.callback(currentStatus === 'В работе' ? '✅ 🟢 В работе' : '🟢 В работе', 'admin_obj_set_status_work')],
            [Markup.button.callback(currentStatus === 'Заморожен' ? '✅ ❄️ Заморожен' : '❄️ Заморожен', 'admin_obj_set_status_frozen')],
            [Markup.button.callback('↩️ Назад', 'admin_obj_edit')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_obj_set_status_work', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const objName = ctx.state.userStates[userId].adminSelectedObjName;
        if (!objName) {
            await ctx.reply('Ошибка: объект не выбран.');
            return;
        }
        
        await updateObject(objName, { status: 'В работе' });
        clearConfigCache();
        await ctx.answerCbQuery('Статус изменен на "В работе"');
        
        // Возвращаемся к редактированию объекта
        const objIndex = ctx.state.userStates[userId].adminSelectedObjIndex ?? 0;
        const fakeCtx = {
            ...ctx,
            match: [null, objIndex.toString()],
            state: ctx.state
        };
        // Имитируем клик на объект для обновления отображения
        const obj = await getObject(objName);
        await clearPreviousMessages(ctx, userId);
        const usersWithObj = await getUsersByObject(objName);
        const reportsWithObj = await getReportsByObject(objName);
        ctx.state.userStates[userId].adminSelectedObjIndex = objIndex;
        const statusEmoji = '🟢';
        const objText = `🏗 **${obj.name}**\n\n📱 ID группы: ${obj.telegramGroupId || 'Не указан'}\n📊 Статус: ${statusEmoji} ${obj.status || 'В работе'}\n👥 Используется пользователями: ${usersWithObj.length}\n📄 Отчетов: ${reportsWithObj.length}`;
        const buttons = [
            [Markup.button.callback('✏️ Редактировать', 'admin_obj_edit')],
            [Markup.button.callback('🗑 Удалить', 'admin_obj_delete')],
            [Markup.button.callback('↩️ Назад', 'admin_objects')]
        ];
        const message = await ctx.reply(objText, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        });
        ctx.state.userStates[userId].messageIds = [message.message_id];
    });
    
    bot.action('admin_obj_set_status_frozen', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const objName = ctx.state.userStates[userId].adminSelectedObjName;
        if (!objName) {
            await ctx.reply('Ошибка: объект не выбран.');
            return;
        }
        
        await updateObject(objName, { status: 'Заморожен' });
        clearConfigCache();
        await ctx.answerCbQuery('Статус изменен на "Заморожен"');
        
        // Возвращаемся к редактированию объекта
        const objIndex = ctx.state.userStates[userId].adminSelectedObjIndex ?? 0;
        const obj = await getObject(objName);
        await clearPreviousMessages(ctx, userId);
        const usersWithObj = await getUsersByObject(objName);
        const reportsWithObj = await getReportsByObject(objName);
        ctx.state.userStates[userId].adminSelectedObjIndex = objIndex;
        const statusEmoji = '❄️';
        const objText = `🏗 **${obj.name}**\n\n📱 ID группы: ${obj.telegramGroupId || 'Не указан'}\n📊 Статус: ${statusEmoji} ${obj.status || 'В работе'}\n👥 Используется пользователями: ${usersWithObj.length}\n📄 Отчетов: ${reportsWithObj.length}`;
        const buttons = [
            [Markup.button.callback('✏️ Редактировать', 'admin_obj_edit')],
            [Markup.button.callback('🗑 Удалить', 'admin_obj_delete')],
            [Markup.button.callback('↩️ Назад', 'admin_objects')]
        ];
        const message = await ctx.reply(objText, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        });
        ctx.state.userStates[userId].messageIds = [message.message_id];
    });
    
    bot.action('admin_obj_edit_groupid', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_obj_edit_groupid';
        const message = await ctx.reply('Введите новый ID группы Telegram (или /clear для очистки):', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_obj_edit')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_obj_view_group', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objName = ctx.state.userStates[userId].adminSelectedObjName;
        if (!objName) {
            await ctx.reply('Ошибка: объект не выбран.');
            return;
        }
        
        const obj = await getObject(objName);
        if (!obj || !obj.telegramGroupId) {
            await ctx.reply('ID группы не указан для этого объекта.');
            return;
        }
        
        try {
            const chatId = obj.telegramGroupId;
            const chat = await ctx.telegram.getChat(chatId);
            
            let chatInfo = `📱 Информация о группе для объекта "${objName}":\n\n`;
            chatInfo += `ID: ${chatId}\n`;
            
            if (chat.title) {
                chatInfo += `Название: ${chat.title}\n`;
            }
            if (chat.type) {
                chatInfo += `Тип: ${chat.type}\n`;
            }
            if (chat.username) {
                chatInfo += `Username: @${chat.username}\n`;
            }
            if (chat.description) {
                chatInfo += `Описание: ${chat.description}\n`;
            }
            
            await ctx.reply(chatInfo);
        } catch (error) {
            await ctx.reply(`❌ Ошибка при получении информации о группе: ${error.message}\n\nПроверьте, что:\n1. ID группы корректный\n2. Бот добавлен в группу\n3. Бот имеет права на просмотр информации о группе`);
        }
    });
    
    // ========== НАСТРОЙКА ПОЛЬЗОВАТЕЛЕЙ ДЛЯ ОТЧЕТОВ ПО ОБЪЕКТУ ==========
    bot.action(/admin_obj_report_users_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objIndex = parseInt(ctx.match[1], 10);
        const objNames = ctx.state.userStates[userId].adminObjectsList;
        if (!objNames || !objNames[objIndex]) {
            await ctx.reply('Объект не найден.');
            return;
        }
        const objName = objNames[objIndex];
        ctx.state.userStates[userId].adminSelectedObjName = objName;
        ctx.state.userStates[userId].adminSelectedObjIndex = objIndex;
        
        await showObjectReportOrganizationsList(ctx, objIndex);
    });
    
    async function showObjectReportOrganizationsList(ctx, objIndex) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objNames = ctx.state.userStates[userId].adminObjectsList;
        if (!objNames || !objNames[objIndex]) {
            await ctx.reply('Объект не найден.');
            return;
        }
        const objName = objNames[objIndex];
        
        const organizations = await getOrganizationsByObject(objName);
        if (organizations.length === 0) {
            await ctx.reply(`Для объекта "${objName}" не найдено организаций.`);
            const objIndexBack = ctx.state.userStates[userId].adminSelectedObjIndex ?? 0;
            // Возвращаемся к детальному просмотру объекта
            const obj = await getObject(objName);
            const usersWithObj = await getUsersByObject(objName);
            const reportsWithObj = await getReportsByObject(objName);
            await clearPreviousMessages(ctx, userId);
            const statusEmoji = obj.status === 'В работе' ? '🟢' : '❄️';
            const objText = `🏗 **${obj.name}**\n\n📱 ID группы: ${obj.telegramGroupId || 'Не указан'}\n📊 Статус: ${statusEmoji} ${obj.status || 'В работе'}\n👥 Используется пользователями: ${usersWithObj.length}\n📄 Отчетов: ${reportsWithObj.length}`;
            const buttons = [
                [Markup.button.callback('✏️ Редактировать', 'admin_obj_edit')],
                [Markup.button.callback('📋 Настройка отчетов', `admin_obj_report_users_${objIndexBack}`)],
                [Markup.button.callback('📦 Настройка потребностей', `admin_obj_need_users_${objIndexBack}`)],
                [Markup.button.callback('🗑 Удалить', 'admin_obj_delete')],
                [Markup.button.callback('↩️ Назад', 'admin_objects')]
            ];
            const message = await ctx.reply(objText, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard(buttons).reply_markup
            });
            ctx.state.userStates[userId].messageIds.push(message.message_id);
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].adminReportOrgList = organizations;
        
        const buttons = organizations.map((orgName, orgIndex) => [
            Markup.button.callback(`✏️ ${orgName}`, `admin_obj_org_report_users_${objIndex}_${orgIndex}`)
        ]);
        buttons.push([Markup.button.callback('↩️ Назад', `obj_${objIndex}`)]);
        
        const message = await ctx.reply(
            `📋 Настройка отчетов по объекту "${objName}"\n\nВыберите организацию:`,
            Markup.inlineKeyboard(buttons)
        );
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    }
    
    bot.action(/admin_obj_org_report_users_(\d+)_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objIndex = parseInt(ctx.match[1], 10);
        const orgIndex = parseInt(ctx.match[2], 10);
        
        await showOrganizationUsersForObjectReport(ctx, objIndex, orgIndex);
    });
    
    async function showOrganizationUsersForObjectReport(ctx, objIndex, orgIndex) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objNames = ctx.state.userStates[userId].adminObjectsList;
        const orgNames = ctx.state.userStates[userId].adminReportOrgList;
        
        if (!objNames || !objNames[objIndex] || !orgNames || !orgNames[orgIndex]) {
            await ctx.reply('Ошибка: объект или организация не найдены.');
            return;
        }
        
        const objName = objNames[objIndex];
        const orgName = orgNames[orgIndex];
        
        // Получаем всех пользователей организации, у которых есть этот объект
        const allUsers = await loadUsers();
        const orgUsers = Object.entries(allUsers).filter(([_, user]) => 
            user.organization === orgName && 
            Array.isArray(user.selectedObjects) && 
            user.selectedObjects.includes(objName)
        );
        
        if (orgUsers.length === 0) {
            await ctx.reply(`Для организации "${orgName}" и объекта "${objName}" не найдено пользователей с этим объектом в личном кабинете.`);
            await showObjectReportOrganizationsList(ctx, objIndex);
            return;
        }
        
        // Получаем текущий список выбранных пользователей для отчетов
        const currentReportUsers = await getReportUsers(orgName, objName);
        
        // Инициализируем состояние выбранных пользователей, если его нет
        const stateKey = `objReportSelectedUsers_${objIndex}_${orgIndex}`;
        if (!ctx.state.userStates[userId][stateKey]) {
            ctx.state.userStates[userId][stateKey] = {};
            // Загружаем текущие настройки в состояние
            orgUsers.forEach(([uid, _], userIndex) => {
                if (currentReportUsers.includes(uid)) {
                    ctx.state.userStates[userId][stateKey][userIndex] = uid;
                }
            });
        }
        
        await clearPreviousMessages(ctx, userId);
        
        const selectedUsers = ctx.state.userStates[userId][stateKey];
        const buttons = orgUsers.map(([uid, user], userIndex) => {
            const isSelected = selectedUsers[userIndex] === uid;
            const marker = isSelected ? '✅' : '☐';
            return [Markup.button.callback(
                `${marker} ${user.fullName || uid}`,
                `admin_obj_org_report_user_toggle_${objIndex}_${orgIndex}_${userIndex}`
            )];
        });
        buttons.push([Markup.button.callback('✅ Сохранить', `admin_obj_org_report_users_save_${objIndex}_${orgIndex}`)]);
        buttons.push([Markup.button.callback('↩️ Назад', `admin_obj_report_users_${objIndex}`)]);
        
        const selectedCount = Object.keys(selectedUsers).length;
        const message = await ctx.reply(
            `📋 Настройка пользователей для отчетов\n\nОбъект: **${objName}**\nОрганизация: **${orgName}**\n\nВыберите пользователей (выбрано: ${selectedCount}):`,
            {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard(buttons).reply_markup
            }
        );
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    }
    
    bot.action(/admin_obj_org_report_user_toggle_(\d+)_(\d+)_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objIndex = parseInt(ctx.match[1], 10);
        const orgIndex = parseInt(ctx.match[2], 10);
        const userIndex = parseInt(ctx.match[3], 10);
        
        const stateKey = `objReportSelectedUsers_${objIndex}_${orgIndex}`;
        if (!ctx.state.userStates[userId][stateKey]) {
            ctx.state.userStates[userId][stateKey] = {};
        }
        
        const objNames = ctx.state.userStates[userId].adminObjectsList;
        const orgNames = ctx.state.userStates[userId].adminReportOrgList;
        
        if (!objNames || !objNames[objIndex] || !orgNames || !orgNames[orgIndex]) {
            await ctx.reply('Ошибка: объект или организация не найдены.');
            return;
        }
        
        const objName = objNames[objIndex];
        const orgName = orgNames[orgIndex];
        
        // Получаем список пользователей организации с этим объектом
        const allUsers = await loadUsers();
        const orgUsers = Object.entries(allUsers).filter(([_, user]) => 
            user.organization === orgName && 
            Array.isArray(user.selectedObjects) && 
            user.selectedObjects.includes(objName)
        );
        
        if (!orgUsers[userIndex]) {
            await ctx.reply('Пользователь не найден.');
            return;
        }
        
        const [uid, _] = orgUsers[userIndex];
        
        // Переключаем выбор
        if (ctx.state.userStates[userId][stateKey][userIndex] === uid) {
            delete ctx.state.userStates[userId][stateKey][userIndex];
        } else {
            ctx.state.userStates[userId][stateKey][userIndex] = uid;
        }
        
        // Обновляем отображение
        await showOrganizationUsersForObjectReport(ctx, objIndex, orgIndex);
    });
    
    bot.action(/admin_obj_org_report_users_save_(\d+)_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objIndex = parseInt(ctx.match[1], 10);
        const orgIndex = parseInt(ctx.match[2], 10);
        
        const stateKey = `objReportSelectedUsers_${objIndex}_${orgIndex}`;
        const selectedUsers = ctx.state.userStates[userId][stateKey] || {};
        
        const objNames = ctx.state.userStates[userId].adminObjectsList;
        const orgNames = ctx.state.userStates[userId].adminReportOrgList;
        
        if (!objNames || !objNames[objIndex] || !orgNames || !orgNames[orgIndex]) {
            await ctx.reply('Ошибка: объект или организация не найдены.');
            return;
        }
        
        const objName = objNames[objIndex];
        const orgName = orgNames[orgIndex];
        
        // Получаем список userIds из выбранных
        const userIds = Object.values(selectedUsers).filter(uid => uid);
        
        // Сохраняем настройки
        await setReportUsers(orgName, objName, userIds);
        clearConfigCache();
        
        // Очищаем состояние
        delete ctx.state.userStates[userId][stateKey];
        
        await ctx.reply(`✅ Настройки сохранены для организации "${orgName}" и объекта "${objName}". Выбрано пользователей: ${userIds.length}`);
        
        // Возвращаемся к списку организаций
        await showObjectReportOrganizationsList(ctx, objIndex);
    });
    
    bot.action('admin_obj_delete', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const objName = ctx.state.userStates[userId].adminSelectedObjName;
        if (!objName) {
            await ctx.reply('Ошибка: объект не выбран.');
            return;
        }
        const usersWithObj = await getUsersByObject(objName);
        const reportsWithObj = await getReportsByObject(objName);
        
        if (reportsWithObj.length > 0) {
            // Предупреждаем о наличии отчетов и предлагаем удалить вместе с отчетами
            await ctx.reply(
                `⚠️ Внимание! Объект "${objName}" имеет ${reportsWithObj.length} отчетов.\n\nПри удалении объекта все отчеты будут также удалены.\n\nПодтвердите удаление:`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Да, удалить с отчетами', 'admin_obj_delete_with_reports')],
                    [Markup.button.callback('❌ Отмена', `obj_${ctx.state.userStates[userId].adminObjectsList?.indexOf(objName) ?? 0}`)]
                ])
            );
            return;
        }
        
        if (usersWithObj.length > 0) {
            // Предлагаем миграцию пользователей
            const users = await loadUsers();
            const userOrgs = [...new Set(usersWithObj.map(([uid, _]) => users[uid]?.organization).filter(Boolean))];
            const allOrgs = await getAllOrganizations();
            const orgNames = allOrgs.map(org => org.name);
            
            // Сохраняем информацию для миграции
            ctx.state.userStates[userId].objDeleteContext = {
                objName,
                usersToMigrate: usersWithObj.map(([uid, _]) => uid),
                userOrgs
            };
            
            // Получаем доступные объекты для миграции (все объекты кроме удаляемого)
            const allObjects = await getAllObjects();
            const availableObjects = allObjects.filter(obj => obj.name !== objName).map(obj => obj.name);
            
            if (availableObjects.length === 0) {
                await ctx.reply(`⚠️ Невозможно удалить объект "${objName}". Используется ${usersWithObj.length} пользователем(ями), но нет других объектов для миграции.`);
                return;
            }
            
            // Предлагаем выбрать объект для миграции
            ctx.state.userStates[userId].availableObjectsForMigration = availableObjects;
            const currentObjIndex = allObjects.findIndex(o => o.name === objName);
            const buttons = availableObjects.slice(0, 10).map((obj, index) => [
                Markup.button.callback(obj, `admin_obj_migrate_${index}`)
            ]);
            buttons.push([Markup.button.callback('↩️ Отмена', `obj_${currentObjIndex}`)]);
            
            await ctx.reply(
                `⚠️ Объект "${objName}" используется ${usersWithObj.length} пользователем(ями).\n\nВыберите объект для миграции пользователей:`,
                Markup.inlineKeyboard(buttons)
            );
            return;
        }
        
        // Если нет пользователей и отчетов, удаляем объект
        await removeOrganizationFromObject(objName);
        await removeAllForObject(objName); // report users
        await removeAllNeedUsersForObject(objName); // need users
        await deleteObject(objName);
        clearConfigCache();
        await ctx.reply(`✅ Объект "${objName}" удален.`);
        await showObjectsList(ctx);
    });
    
    bot.action(/admin_obj_migrate_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const objIndex = parseInt(ctx.match[1], 10);
        const context = ctx.state.userStates[userId].objDeleteContext;
        const availableObjects = ctx.state.userStates[userId].availableObjectsForMigration;
        
        if (!context || !availableObjects || !availableObjects[objIndex]) {
            await ctx.reply('Ошибка: контекст миграции не найден.');
            return;
        }
        
        const targetObject = availableObjects[objIndex];
        const users = await loadUsers();
        
        // Мигрируем пользователей
        for (const uid of context.usersToMigrate) {
            if (users[uid] && Array.isArray(users[uid].selectedObjects)) {
                // Удаляем старый объект из списка пользователя
                users[uid].selectedObjects = users[uid].selectedObjects.filter(obj => obj !== context.objName);
                // Добавляем новый объект, если его еще нет
                if (!users[uid].selectedObjects.includes(targetObject)) {
                    users[uid].selectedObjects.push(targetObject);
                }
                await saveUser(uid, users[uid]);
            }
        }
        
        // Удаляем объект
        await removeOrganizationFromObject(context.objName);
        await deleteObject(context.objName);
        clearConfigCache();
        
        // Очищаем контекст
        delete ctx.state.userStates[userId].objDeleteContext;
        delete ctx.state.userStates[userId].availableObjectsForMigration;
        
        await ctx.reply(`✅ Объект "${context.objName}" удален. Пользователи мигрированы на "${targetObject}".`);
        await showObjectsList(ctx);
    });
    
    bot.action('admin_obj_delete_with_reports', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objName = ctx.state.userStates[userId].adminSelectedObjName;
        if (!objName) {
            await ctx.reply('Ошибка: объект не выбран.');
            return;
        }
        
        const usersWithObj = await getUsersByObject(objName);
        const reportsWithObj = await getReportsByObject(objName);
        
        try {
            // Удаляем все отчеты объекта
            if (reportsWithObj.length > 0) {
                const db = await require('../../config/mongoConfig').connectMongo();
                const reportsCollection = db.collection('reports');
                for (const report of reportsWithObj) {
                    await reportsCollection.deleteOne({ reportid: report.reportId });
                }
            }
            
            // Мигрируем пользователей, если есть
            if (usersWithObj.length > 0) {
                const allObjects = await getAllObjects();
                const availableObjects = allObjects.filter(obj => obj.name !== objName).map(obj => obj.name);
                
                if (availableObjects.length > 0) {
                    // Используем первый доступный объект для миграции
                    const targetObject = availableObjects[0];
                    const users = await loadUsers();
                    
                    for (const [uid, _] of usersWithObj) {
                        if (users[uid] && Array.isArray(users[uid].selectedObjects)) {
                            users[uid].selectedObjects = users[uid].selectedObjects.filter(obj => obj !== objName);
                            if (!users[uid].selectedObjects.includes(targetObject)) {
                                users[uid].selectedObjects.push(targetObject);
                            }
                            await saveUser(uid, users[uid]);
                        }
                    }
                    
                    await ctx.reply(`✅ Объект "${objName}" удален вместе с ${reportsWithObj.length} отчетами. Пользователи мигрированы на "${targetObject}".`);
                } else {
                    // Если нет объектов для миграции, просто удаляем объект из списка пользователей
                    const users = await loadUsers();
                    for (const [uid, _] of usersWithObj) {
                        if (users[uid] && Array.isArray(users[uid].selectedObjects)) {
                            users[uid].selectedObjects = users[uid].selectedObjects.filter(obj => obj !== objName);
                            await saveUser(uid, users[uid]);
                        }
                    }
                    await ctx.reply(`✅ Объект "${objName}" удален вместе с ${reportsWithObj.length} отчетами.`);
                }
            } else {
                await ctx.reply(`✅ Объект "${objName}" удален вместе с ${reportsWithObj.length} отчетами.`);
            }
            
            // Удаляем связи объекта с организациями
            await removeOrganizationFromObject(objName);
            // Удаляем настройки пользователей для отчетов
            await removeAllForObject(objName);
            // Удаляем объект
            await deleteObject(objName);
            clearConfigCache();
            
            await showObjectsList(ctx);
        } catch (error) {
            console.error('Ошибка при удалении объекта с отчетами:', error);
            await ctx.reply('Ошибка при удалении объекта: ' + error.message);
        }
    });

    // ========== НАСТРОЙКИ УВЕДОМЛЕНИЙ ==========
    bot.action('admin_notifications', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        await clearPreviousMessages(ctx, userId);
        
        const message = await ctx.reply(
            '🔔 **Настройки уведомлений**\n\nВыберите тип уведомлений для настройки:',
            {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('📋 Отчеты', 'admin_notif_select_reports')],
                    [Markup.button.callback('📊 Статистика', 'admin_notif_select_statistics')],
                    [Markup.button.callback('↩️ Назад', 'admin_panel')]
                ]).reply_markup
            }
        );
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    const showNotificationSettings = async (ctx, type) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        await clearPreviousMessages(ctx, userId);
        const settings = await getNotificationSettings(type);
        const enabledText = settings.enabled ? '✅ Включены' : '❌ Выключены';
        const typeName = type === 'reports' ? 'Отчеты' : 'Статистика';
        const settingsText = `🔔 Настройки уведомлений: ${typeName}\n\n${enabledText}\n⏰ Время: ${settings.time}\n🌍 Часовой пояс: ${settings.timezone}`;
        
        const buttons = [
            [Markup.button.callback(settings.enabled ? '❌ Выключить' : '✅ Включить', `admin_notif_toggle_${type}`)],
            [Markup.button.callback('⏰ Изменить время', `admin_notif_time_${type}`)]
        ];
        
        buttons.push([Markup.button.callback('📝 Изменить текст', `admin_notif_text_${type}`)]);
        buttons.push([Markup.button.callback('👁 Предпросмотр', `admin_notif_preview_${type}`)]);
        
        buttons.push([Markup.button.callback('↩️ Назад', 'admin_notifications')]);
        
        const message = await ctx.reply(settingsText.trim(), {
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        ctx.state.userStates[userId].currentNotificationType = type;
    };
    
    bot.action('admin_notif_select_reports', async (ctx) => {
        await showNotificationSettings(ctx, 'reports');
    });
    
    bot.action('admin_notif_select_statistics', async (ctx) => {
        await showNotificationSettings(ctx, 'statistics');
    });
    
    bot.action(/^admin_notif_toggle_(reports|statistics)$/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const type = ctx.match[1];
        const settings = await getNotificationSettings(type);
        await updateNotificationSettings(type, { enabled: !settings.enabled });
        clearConfigCache();
        const botInstance = require('../bot');
        if (botInstance.setupAllNotificationCrons) await botInstance.setupAllNotificationCrons();
        await ctx.answerCbQuery('Настройки сохранены');
        await showNotificationSettings(ctx, type);
    });
    
    bot.action(/^admin_notif_time_(reports|statistics)$/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const type = ctx.match[1];
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = `admin_notif_edit_time_${type}`;
        ctx.state.userStates[userId].currentNotificationType = type;
        const message = await ctx.reply('Введите новое время в формате HH:mm (например, 19:00):', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', `admin_notif_select_${type}`)]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action(/^admin_notif_text_(reports|statistics)$/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const type = ctx.match[1];
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = `admin_notif_edit_text_${type}`;
        ctx.state.userStates[userId].currentNotificationType = type;
        
        let instructionText;
        if (type === 'reports') {
            instructionText = 'Введите новый текст шаблона. Используйте переменные {fullName} и {date}:';
        } else {
            instructionText = 'Введите новый шаблон заголовка статистики. Используйте переменные:\n{objectsInWorkCount} - количество объектов в работе\n{objectsWithoutReportsList} - список объектов без отчетов (формируется автоматически)\n\nПример: ⚠️ Статистика за день:\\n<blockquote>1) Объектов в работе: {objectsInWorkCount}\\n2) Не поданы отчеты по объектам:\\n{objectsWithoutReportsList}</blockquote>';
        }
        
        const message = await ctx.reply(instructionText, Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', `admin_notif_select_${type}`)]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action(/^admin_notif_preview_(reports|statistics)$/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        const type = ctx.match[1];
        let previewText;
        
        if (type === 'reports') {
            // Используем правильный шаблон для предпросмотра
            const correctTemplate = '⚠️ Напоминание\n<blockquote>{fullName},\nвы не подали отчет за {date}г.\nПожалуйста, внесите данные.</blockquote>';
            // Очищаем кэш перед получением настроек для предпросмотра, чтобы получить актуальные данные
            clearConfigCache();
            const settings = await getNotificationSettings(type);
            // Используем шаблон из настроек
            let template = settings.messageTemplate || correctTemplate;
            // Исправляем шаблон, если он не содержит blockquote
            if (template && !template.includes('<blockquote>')) {
                // Если шаблон начинается с "⚠️ Напоминание\n", оборачиваем остальное в blockquote
                if (template.startsWith('⚠️ Напоминание\n')) {
                    const content = template.substring('⚠️ Напоминание\n'.length);
                    template = `⚠️ Напоминание\n<blockquote>${content}</blockquote>`;
                } else {
                    // Иначе просто оборачиваем весь шаблон в blockquote
                    template = `<blockquote>${template}</blockquote>`;
                }
            }
            // Исправляем шаблон, если он не содержит "г." после {date}
            if (template) {
                if (!template.includes('{date}г.')) {
                    // Заменяем {date}. на {date}г.
                    template = template.replace(/\{date\}\./g, '{date}г.');
                    // Заменяем {date} (без точки и без г.) на {date}г.
                    template = template.replace(/\{date\}(?![г.])/g, '{date}г.');
                }
            }
            previewText = formatNotificationMessage(template, {
                fullName: 'Иванов Иван Иванович',
                date: '25.12.2024'
            });
        } else if (type === 'statistics') {
            // Функция для обрезки длинных названий объектов
            function truncateObjectName(name, maxLength = 30) {
                if (name.length <= maxLength) {
                    return name;
                }
                return name.substring(0, maxLength - 3) + '...';
            }
            
            // Тестовые данные для предпросмотра
            const testObjects = [
                'Ростовка-Никольское, 595,4-608,1км.',
                'УЗН р. Волга'
            ];
            
            // Формируем список объектов с обрезкой и кликабельными ссылками
            const objectsWithLinks = testObjects.map((objName) => {
                // Обрезаем название для отображения
                const displayName = truncateObjectName(objName);
                
                // Экранируем HTML символы в отображаемом названии
                let escapedObjName = displayName.replace(/[<>&"]/g, (match) => {
                    const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' };
                    return map[match];
                });
                // Заменяем обычные пробелы на неразрывные пробелы (Unicode U+00A0)
                escapedObjName = escapedObjName.replace(/ /g, '\u00A0');
                
                // Для предпросмотра используем тестовую ссылку
                return `<a href="https://t.me/example">${escapedObjName}</a>`;
            });
            
            // Формируем сообщение
            previewText = `⚠️ Статистика за день:\n<blockquote>1) Объектов в работе: 3\n2) Не поданы отчеты по объектам:\n`;
            objectsWithLinks.forEach(objLink => {
                previewText += `   · ${objLink}\n`;
            });
            previewText += `</blockquote>`;
        } else {
            await ctx.answerCbQuery('Предпросмотр недоступен для этого типа уведомлений');
            return;
        }
        
        await ctx.reply(previewText, {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Назад', `admin_notif_select_${type}`)]
            ]).reply_markup
        });
    });
    
    // ========== СТАТИСТИКА ==========
    async function showStatistics(ctx) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        const users = await loadUsers();
        const { loadAllReports } = require('../../database/reportModel');
        const { formatDate } = require('../utils');
        const allReports = await loadAllReports();
        
        // Подсчет статистики пользователей
        const totalUsers = Object.keys(users).length;
        const approvedUsers = Object.values(users).filter(u => u.isApproved).length;
        const pendingUsers = totalUsers - approvedUsers;
        
        // Статистика по организациям
        const orgStats = {};
        Object.values(users).forEach(user => {
            const org = user.organization || 'Не указана';
            orgStats[org] = (orgStats[org] || 0) + 1;
        });
        
        // Статистика по должностям
        const positionStats = {};
        Object.values(users).forEach(user => {
            const pos = user.position || 'Не указана';
            positionStats[pos] = (positionStats[pos] || 0) + 1;
        });
        
        // Статистика по статусам
        const statusStats = {
            'Online': Object.values(users).filter(u => u.status === 'В работе').length,
            'Offline': Object.values(users).filter(u => u.status === 'В отпуске').length
        };
        
        // Статистика по отчетам
        const allReportsArray = Object.values(allReports);
        const totalReports = allReportsArray.length;
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        
        const reportsToday = allReportsArray.filter(r => {
            const reportDate = r.timestamp ? new Date(r.timestamp) : new Date(0);
            return reportDate >= today;
        }).length;
        
        const reportsWeek = allReportsArray.filter(r => {
            const reportDate = r.timestamp ? new Date(r.timestamp) : new Date(0);
            return reportDate >= weekAgo;
        }).length;
        
        const reportsMonth = allReportsArray.filter(r => {
            const reportDate = r.timestamp ? new Date(r.timestamp) : new Date(0);
            return reportDate >= monthAgo;
        }).length;
        
        // Формируем текст статистики
        let statsText = `📈 **Статистика системы**\n\n`;
        
        statsText += `👥 **Пользователи:**\n`;
        statsText += `Всего: ${totalUsers}\n`;
        statsText += `✅ Одобренные: ${approvedUsers}\n`;
        statsText += `⏳ Неодобренные: ${pendingUsers}\n\n`;
        
        statsText += `🏢 **По организациям:**\n`;
        for (const [org, count] of Object.entries(orgStats).sort((a, b) => b[1] - a[1])) {
            statsText += `${org}: ${count}\n`;
        }
        statsText += `\n`;
        
        statsText += `💼 **По должностям:**\n`;
        for (const [pos, count] of Object.entries(positionStats).sort((a, b) => b[1] - a[1])) {
            statsText += `${pos}: ${count}\n`;
        }
        statsText += `\n`;
        
        statsText += `📊 **По статусам:**\n`;
        statsText += `🟢 Online: ${statusStats['Online']}\n`;
        statsText += `🔴 Offline: ${statusStats['Offline']}\n\n`;
        
        statsText += `📋 **Отчеты:**\n`;
        statsText += `Всего: ${totalReports}\n`;
        statsText += `За сегодня: ${reportsToday}\n`;
        statsText += `За неделю: ${reportsWeek}\n`;
        statsText += `За месяц: ${reportsMonth}\n`;
        
        // Breadcrumbs
        ctx.state.userStates[userId].adminBreadcrumbs = ['Админ-панель', 'Статистика'];
        const breadcrumbsText = getBreadcrumbsText(ctx.state.userStates[userId].adminBreadcrumbs);
        const statsTextWithBreadcrumbs = breadcrumbsText + statsText;
        
        const message = await ctx.reply(statsTextWithBreadcrumbs, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('🏠 Главная', 'admin_panel')],
                [Markup.button.callback('🔄 Обновить', 'admin_statistics')],
                [Markup.button.callback('↩️ Назад', 'admin_panel')]
            ]).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    }
    
    bot.action('admin_statistics', async (ctx) => {
        await showStatistics(ctx);
    });
    
    // ========== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ==========
    
    // Функция форматирования breadcrumbs
    function getBreadcrumbsText(breadcrumbs) {
        if (!breadcrumbs || breadcrumbs.length === 0) return '';
        return breadcrumbs.join(' > ') + '\n';
    }
    
    // Функция поиска пользователей
    function searchUsers(users, query) {
        if (!query || !query.trim()) return Object.entries(users);
        
        const searchQuery = query.trim().toLowerCase();
        return Object.entries(users).filter(([uid, user]) => {
            // Поиск по ФИО (регистронезависимый)
            if (user.fullName && user.fullName.toLowerCase().includes(searchQuery)) {
                return true;
            }
            // Поиск по телефону
            if (user.phone && user.phone.includes(searchQuery)) {
                return true;
            }
            // Поиск по Telegram ID
            if (uid.includes(searchQuery)) {
                return true;
            }
            return false;
        });
    }
    
    // Функция сортировки пользователей
    async function sortUsers(usersEntries, sortField, sortOrder) {
        if (!sortField || !sortOrder) return usersEntries;
        
        const sorted = [...usersEntries];
        
        switch (sortField) {
            case 'fullName':
                sorted.sort((a, b) => {
                    const nameA = (a[1].fullName || '').toLowerCase();
                    const nameB = (b[1].fullName || '').toLowerCase();
                    return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
                });
                break;
            case 'createdAt':
                sorted.sort((a, b) => {
                    const dateA = a[1].createdAt ? new Date(a[1].createdAt) : new Date(0);
                    const dateB = b[1].createdAt ? new Date(b[1].createdAt) : new Date(0);
                    return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
                });
                break;
            case 'reportsCount':
                // Получаем количество отчетов для каждого пользователя одним запросом
                const { loadAllReports } = require('../../database/reportModel');
                const allReports = await loadAllReports();
                const reportsCounts = {};
                Object.values(allReports).forEach(report => {
                    const uid = report.userId;
                    reportsCounts[uid] = (reportsCounts[uid] || 0) + 1;
                });
                sorted.sort((a, b) => {
                    const countA = reportsCounts[a[0]] || 0;
                    const countB = reportsCounts[b[0]] || 0;
                    return sortOrder === 'asc' ? countA - countB : countB - countA;
                });
                break;
            case 'isApproved':
                sorted.sort((a, b) => {
                    const approvedA = a[1].isApproved ? 1 : 0;
                    const approvedB = b[1].isApproved ? 1 : 0;
                    return sortOrder === 'asc' ? approvedA - approvedB : approvedB - approvedA;
                });
                break;
            default:
                break;
        }
        
        return sorted;
    }
    
    // Функция фильтрации пользователей
    async function applyUserFilters(users, filters, sortField = null, sortOrder = null) {
        let filtered = Object.entries(users);
        
        // Применяем поиск, если есть
        if (filters.search) {
            filtered = searchUsers(Object.fromEntries(filtered), filters.search);
        }
        
        if (filters.org) {
            filtered = filtered.filter(([_, user]) => user.organization === filters.org);
        }
        
        if (filters.obj) {
            filtered = filtered.filter(([_, user]) => 
                Array.isArray(user.selectedObjects) && user.selectedObjects.includes(filters.obj)
            );
        }
        
        if (filters.status !== undefined) {
            if (filters.status === 'approved') {
                filtered = filtered.filter(([_, user]) => user.isApproved);
            } else if (filters.status === 'pending') {
                filtered = filtered.filter(([_, user]) => !user.isApproved);
            }
        }
        
        // Применяем сортировку
        if (sortField && sortOrder) {
            filtered = await sortUsers(filtered, sortField, sortOrder);
        }
        
        return filtered;
    }
    
    // Главная страница управления пользователями
    async function showUsersList(ctx, filters = {}, page = 0) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        // Инициализируем state, если его нет
        if (!ctx.state.userStates[userId]) {
            ctx.state.userStates[userId] = { messageIds: [] };
        }
        if (ctx.state.userStates[userId].adminMultiSelectMode === undefined) {
            ctx.state.userStates[userId].adminMultiSelectMode = false;
        }
        if (!ctx.state.userStates[userId].adminSelectedUsers) {
            ctx.state.userStates[userId].adminSelectedUsers = [];
        }
        
        await clearPreviousMessages(ctx, userId);
        const users = await loadUsers();
        
        // Получаем текущую сортировку
        const sortField = ctx.state.userStates[userId].adminUserSort?.field || null;
        const sortOrder = ctx.state.userStates[userId].adminUserSort?.order || null;
        
        // Применяем фильтры и сортировку
        const filteredUsers = await applyUserFilters(users, filters, sortField, sortOrder);
        const totalPages = Math.ceil(filteredUsers.length / 10);
        const currentPage = Math.min(page, Math.max(0, totalPages - 1));
        
        // Сохраняем текущее состояние
        ctx.state.userStates[userId].adminUserFilters = filters;
        ctx.state.userStates[userId].adminUsersList = filteredUsers.map(([uid, _]) => uid);
        ctx.state.userStates[userId].adminUsersPage = currentPage;
        
        // Получаем пользователей для текущей страницы
        const pageUsers = filteredUsers.slice(currentPage * 10, (currentPage + 1) * 10);
        
        // Создаем кнопки для пользователей
        const buttons = [];
        for (let i = 0; i < pageUsers.length; i++) {
            const [uid, user] = pageUsers[i];
            const birthdateText = user.birthdate ? ` 🎂 ${user.birthdate}` : '';
            const buttonText = `${user.fullName || 'Без имени'} (${user.organization || 'Без организации'}) - ${user.position || 'Без должности'}${birthdateText}`;
            buttons.push([Markup.button.callback(buttonText, `admin_user_view_${i}`)]);
        }
        
        // Кнопки фильтрации и сортировки
        buttons.push([
            Markup.button.callback('🔍 Поиск', 'admin_users_search'),
            Markup.button.callback('🔄 Сортировка', 'admin_users_sort')
        ]);
        buttons.push([
            Markup.button.callback('🔍 Фильтр: Организация', 'admin_users_filter_org'),
            Markup.button.callback('🔍 Фильтр: Объект', 'admin_users_filter_obj')
        ]);
        buttons.push([
            Markup.button.callback('✅ Только одобренные', 'admin_users_filter_approved'),
            Markup.button.callback('⏳ Только неодобренные', 'admin_users_filter_pending')
        ]);
        if (filters.org || filters.obj || filters.status !== undefined || filters.search) {
            buttons.push([Markup.button.callback('🔄 Сбросить фильтры', 'admin_users_filter_reset')]);
        }
        
        // Кнопки пагинации
        const navButtons = [];
        if (currentPage > 0) {
            navButtons.push(Markup.button.callback('◀️ Назад', `admin_users_page_${currentPage - 1}`));
        }
        if (currentPage < totalPages - 1) {
            navButtons.push(Markup.button.callback('▶️ Вперед', `admin_users_page_${currentPage + 1}`));
        }
        if (navButtons.length > 0) {
            buttons.push(navButtons);
        }
        
        // Кнопка режима мультивыбора
        const multiSelectMode = ctx.state.userStates[userId].adminMultiSelectMode === true;
        if (multiSelectMode) {
            const selectedCount = (ctx.state.userStates[userId].adminSelectedUsers || []).length;
            buttons.push([
                Markup.button.callback(`☑️ Режим выбора (${selectedCount})`, 'admin_users_toggle_select_mode'),
                Markup.button.callback('⚙️ Действия', 'admin_users_bulk_actions')
            ]);
        } else {
            buttons.push([Markup.button.callback('☑️ Режим выбора', 'admin_users_toggle_select_mode')]);
        }
        
        buttons.push([
            Markup.button.callback('📊 Экспорт в Excel', 'admin_users_export_excel'),
            Markup.button.callback('➕ Добавить пользователя', 'admin_user_add')
        ]);
        buttons.push([Markup.button.callback('↩️ Назад', 'admin_panel')]);
        
        const filterText = [];
        if (filters.search) filterText.push(`Поиск: "${filters.search}"`);
        if (filters.org) filterText.push(`Организация: ${filters.org}`);
        if (filters.obj) filterText.push(`Объект: ${filters.obj}`);
        if (filters.status === 'approved') filterText.push('Статус: Одобренные');
        if (filters.status === 'pending') filterText.push('Статус: Неодобренные');
        
        let sortText = '';
        if (sortField) {
            const sortNames = {
                'fullName': 'ФИО',
                'createdAt': 'Дата регистрации',
                'reportsCount': 'Количество отчетов',
                'isApproved': 'Статус одобрения'
            };
            const orderNames = {
                'asc': sortField === 'fullName' ? 'А-Я' : 'По возрастанию',
                'desc': sortField === 'fullName' ? 'Я-А' : 'По убыванию'
            };
            sortText = `\nСортировка: ${sortNames[sortField]} (${orderNames[sortOrder]})`;
        }
        
        // Breadcrumbs
        ctx.state.userStates[userId].adminBreadcrumbs = ['Админ-панель', 'Пользователи'];
        const breadcrumbsText = getBreadcrumbsText(ctx.state.userStates[userId].adminBreadcrumbs);
        
        const headerText = filterText.length > 0 
            ? `${breadcrumbsText}👥 Управление пользователями\n\nФильтры: ${filterText.join(', ')}${sortText}\nВсего: ${filteredUsers.length}\nСтраница ${currentPage + 1} из ${totalPages || 1}`
            : `${breadcrumbsText}👥 Управление пользователями${sortText}\n\nВсего: ${filteredUsers.length}\nСтраница ${currentPage + 1} из ${totalPages || 1}`;
        
        // Добавляем кнопку "Главная" в начало списка кнопок
        const buttonsWithHome = [
            [Markup.button.callback('🏠 Главная', 'admin_panel')],
            ...buttons
        ];
        
        const message = await ctx.reply(headerText, Markup.inlineKeyboard(buttonsWithHome));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    }
    
    bot.action('admin_users', async (ctx) => {
        await showUsersList(ctx, {}, 0);
    });
    
    // Обработчики фильтрации
    bot.action('admin_users_filter_org', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const organizations = await getAllOrganizations();
        const buttons = organizations.map((org, index) => [
            Markup.button.callback(org.name, `admin_users_filter_org_${index}`)
        ]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_users')]);
        
        const message = await ctx.reply('Выберите организацию для фильтра:', Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        ctx.state.userStates[userId].adminFilterOrgs = organizations.map(org => org.name);
    });
    
    bot.action(/admin_users_filter_org_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgIndex = parseInt(ctx.match[1], 10);
        const orgNames = ctx.state.userStates[userId].adminFilterOrgs;
        if (!orgNames || !orgNames[orgIndex]) {
            await ctx.reply('Организация не найдена.');
            return;
        }
        
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        filters.org = orgNames[orgIndex];
        await showUsersList(ctx, filters, 0);
    });
    
    bot.action('admin_users_filter_obj', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objects = await getAllObjects();
        const buttons = objects.map((obj, index) => [
            Markup.button.callback(obj.name, `admin_users_filter_obj_${index}`)
        ]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_users')]);
        
        const message = await ctx.reply('Выберите объект для фильтра:', Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
        ctx.state.userStates[userId].adminFilterObjs = objects.map(obj => obj.name);
    });
    
    bot.action(/admin_users_filter_obj_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objIndex = parseInt(ctx.match[1], 10);
        const objNames = ctx.state.userStates[userId].adminFilterObjs;
        if (!objNames || !objNames[objIndex]) {
            await ctx.reply('Объект не найден.');
            return;
        }
        
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        filters.obj = objNames[objIndex];
        await showUsersList(ctx, filters, 0);
    });
    
    bot.action('admin_users_filter_approved', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        filters.status = 'approved';
        await showUsersList(ctx, filters, 0);
    });
    
    bot.action('admin_users_filter_pending', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        filters.status = 'pending';
        await showUsersList(ctx, filters, 0);
    });
    
    bot.action('admin_users_filter_reset', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        ctx.state.userStates[userId].adminUserSearch = null;
        await showUsersList(ctx, {}, 0);
    });
    
    // Обработчик поиска
    bot.action('admin_users_search', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_users_search_input';
        const message = await ctx.reply('Введите поисковый запрос (ФИО, телефон или Telegram ID):', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_users')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    // Обработчик сортировки
    bot.action('admin_users_sort', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('Выберите тип сортировки:', Markup.inlineKeyboard([
            [Markup.button.callback('📝 По ФИО (А-Я)', 'admin_users_sort_fullname_asc')],
            [Markup.button.callback('📝 По ФИО (Я-А)', 'admin_users_sort_fullname_desc')],
            [Markup.button.callback('📅 По дате регистрации (новые)', 'admin_users_sort_created_desc')],
            [Markup.button.callback('📅 По дате регистрации (старые)', 'admin_users_sort_created_asc')],
            [Markup.button.callback('📊 По количеству отчетов (больше)', 'admin_users_sort_reports_desc')],
            [Markup.button.callback('📊 По количеству отчетов (меньше)', 'admin_users_sort_reports_asc')],
            [Markup.button.callback('✅ По статусу одобрения', 'admin_users_sort_approved_desc')],
            [Markup.button.callback('🔄 Сбросить сортировку', 'admin_users_sort_reset')],
            [Markup.button.callback('↩️ Отмена', 'admin_users')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action(/admin_users_sort_(fullname|created|reports|approved)_(asc|desc)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const sortFieldMap = {
            'fullname': 'fullName',
            'created': 'createdAt',
            'reports': 'reportsCount',
            'approved': 'isApproved'
        };
        
        const field = sortFieldMap[ctx.match[1]];
        const order = ctx.match[2];
        
        ctx.state.userStates[userId].adminUserSort = { field, order };
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        await showUsersList(ctx, filters, 0);
    });
    
    bot.action('admin_users_sort_reset', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        ctx.state.userStates[userId].adminUserSort = null;
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        await showUsersList(ctx, filters, 0);
    });
    
    bot.action(/admin_users_page_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const page = parseInt(ctx.match[1], 10);
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        await showUsersList(ctx, filters, page);
    });
    
    // Экспорт пользователей в Excel
    async function exportUsersToExcel(ctx, users, filters) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const ExcelJS = require('exceljs');
        const { formatDate } = require('../utils');
        const { loadAllReports } = require('../../database/reportModel');
        
        // Применяем фильтры и сортировку
        const sortField = ctx.state.userStates[userId].adminUserSort?.field || null;
        const sortOrder = ctx.state.userStates[userId].adminUserSort?.order || null;
        const filteredUsers = await applyUserFilters(users, filters, sortField, sortOrder);
        
        if (filteredUsers.length === 0) {
            await ctx.reply('Нет пользователей для экспорта.');
            return;
        }
        
        // Получаем количество отчетов для каждого пользователя
        const allReports = await loadAllReports();
        const reportsCounts = {};
        Object.values(allReports).forEach(report => {
            const uid = report.userId;
            reportsCounts[uid] = (reportsCounts[uid] || 0) + 1;
        });
        
        // Получаем карты ответственных пользователей для отчетов и потребностей
        const reportUsersMap = await getAllReportUsersMap();
        const needUsersMap = await getAllNeedUsersMap();
        
        // Функция для определения ответственности пользователя
        const getUserResponsibilities = (userId, user) => {
            if (!user.organization || !user.selectedObjects || user.selectedObjects.length === 0) {
                return '-';
            }
            
            const orgName = user.organization;
            const userObjects = Array.isArray(user.selectedObjects) ? user.selectedObjects : [];
            
            let isReportUser = false;
            let isNeedUser = false;
            
            // Проверяем для каждого объекта пользователя
            for (const objectName of userObjects) {
                const reportKey = `${orgName}_${objectName}`;
                const needKey = `${orgName}_${objectName}`;
                
                if (reportUsersMap[reportKey] && reportUsersMap[reportKey].includes(userId)) {
                    isReportUser = true;
                }
                if (needUsersMap[needKey] && needUsersMap[needKey].includes(userId)) {
                    isNeedUser = true;
                }
            }
            
            if (isReportUser && isNeedUser) {
                return 'Отчеты, потребности';
            } else if (isReportUser) {
                return 'Отчеты';
            } else if (isNeedUser) {
                return 'Потребности';
            }
            
            return '-';
        };
        
        await clearPreviousMessages(ctx, userId);
        
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Пользователи');
        
        // Стили
        const headerStyle = {
            font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } },
            alignment: { horizontal: 'center', vertical: 'middle' },
            border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        };
        
        const cellStyle = {
            font: { name: 'Arial', size: 9 },
            alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
            border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        };
        
        // Заголовки (добавлен столбец "Ответственный" перед "Статус")
        worksheet.columns = [
            { header: 'Должность', key: 'position', width: 10 },
            { header: 'Организация', key: 'organization', width: 10 },
            { header: 'ФИО', key: 'fullName', width: 10 },
            { header: 'Контактный телефон', key: 'phone', width: 10 },
            { header: 'Дата рождения', key: 'birthdate', width: 10 },
            { header: 'Ответственный', key: 'responsible', width: 10 },
            { header: 'Статус', key: 'status', width: 10 },
            { header: 'Одобрен', key: 'isApproved', width: 10 },
            { header: 'Дата регистрации', key: 'createdAt', width: 10 },
            { header: 'Количество отчетов', key: 'reportsCount', width: 10 }
        ];
        
        // Применяем стили к заголовкам
        worksheet.getRow(1).eachCell((cell) => {
            cell.style = headerStyle;
        });
        
        // Заполняем данные
        for (const [uid, user] of filteredUsers) {
            // Определяем ответственность
            const responsible = getUserResponsibilities(uid, user);
            
            const row = worksheet.addRow({
                position: user.position || '',
                organization: user.organization || '',
                fullName: user.fullName || '',
                phone: user.phone || '',
                birthdate: user.birthdate || '',
                responsible: responsible,
                status: user.status || '',
                isApproved: user.isApproved ? 'Да' : 'Нет',
                createdAt: user.createdAt ? formatDate(new Date(user.createdAt)) : '',
                reportsCount: reportsCounts[uid] || 0
            });
            
            row.eachCell((cell) => {
                cell.style = cellStyle;
            });
        }
        
        // Настройка ширины колонок по содержимому с ограничением до 40
        worksheet.columns.forEach((column) => {
            let maxLength = 0;
            column.eachCell({ includeEmpty: false }, (cell) => {
                const cellValue = cell.value ? cell.value.toString() : '';
                const cellLength = cellValue.length;
                if (cellLength > maxLength) {
                    maxLength = cellLength;
                }
            });
            // Устанавливаем ширину = длина + минимальный отступ (1), но не более 40
            column.width = Math.min(maxLength + 1, 40);
        });
        
        // Фиксируем первую строку
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];
        
        const buffer = await workbook.xlsx.writeBuffer();
        const filename = `users_export_${formatDate(new Date()).replace(/\./g, '_')}.xlsx`;
        
        const documentMessage = await ctx.replyWithDocument({ source: buffer, filename });
        ctx.state.userStates[userId].messageIds.push(documentMessage.message_id);
    }
    
    bot.action('admin_users_export_excel', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const users = await loadUsers();
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        await exportUsersToExcel(ctx, users, filters);
    });
    
    // Получение расширенной информации о пользователе
    async function getUserExtendedInfo(targetUserId, user) {
        const { loadUserReports } = require('../../database/reportModel');
        const { formatDate } = require('../utils');
        
        const reports = await loadUserReports(targetUserId);
        const reportsCount = Object.keys(reports).length;
        
        // Находим последний отчет
        let lastActivity = 'Нет отчетов';
        let lastReportDate = null;
        if (reportsCount > 0) {
            const reportEntries = Object.values(reports);
            reportEntries.sort((a, b) => {
                const dateA = a.timestamp ? new Date(a.timestamp) : new Date(0);
                const dateB = b.timestamp ? new Date(b.timestamp) : new Date(0);
                return dateB - dateA;
            });
            const lastReport = reportEntries[0];
            if (lastReport && lastReport.timestamp) {
                lastReportDate = new Date(lastReport.timestamp);
                lastActivity = formatDate(lastReportDate);
            }
        }
        
        // Форматируем дату регистрации
        let registrationDate = 'Не указана';
        if (user.createdAt) {
            registrationDate = formatDate(new Date(user.createdAt));
        }
        
        return {
            reportsCount,
            lastActivity,
            lastReportDate,
            registrationDate
        };
    }
    
    // Просмотр детальной информации о пользователе
    async function showUserDetails(ctx, targetUserId, returnPage = 0) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        const users = await loadUsers();
        const user = users[targetUserId];
        
        if (!user) {
            await ctx.reply('Пользователь не найден.');
            await showUsersList(ctx, ctx.state.userStates[userId].adminUserFilters || {}, returnPage);
            return;
        }
        
        // Получаем расширенную информацию
        const extendedInfo = await getUserExtendedInfo(targetUserId, user);
        
        // Получаем информацию о Telegram пользователе
        let telegramInfo = `ID: ${targetUserId}`;
        try {
            // Пытаемся получить информацию о пользователе через getChat
            const chat = await ctx.telegram.getChat(targetUserId);
            if (chat) {
                if (chat.username) {
                    telegramInfo = `@${chat.username} (ID: ${targetUserId})`;
                } else if (chat.first_name) {
                    telegramInfo = `${chat.first_name || ''} ${chat.last_name || ''}`.trim() || `ID: ${targetUserId}`;
                }
            }
        } catch (e) {
            // Если не удалось получить информацию, используем только ID
        }
        
        const objectsList = Array.isArray(user.selectedObjects) && user.selectedObjects.length > 0
            ? user.selectedObjects.map(obj => `· ${obj}`).join('\n')
            : 'Не выбраны';
        
        const statusEmoji = user.status === 'Online' ? '🟢' : user.status === 'Offline' ? '🔴' : '⏳';
        const approvedStatus = user.isApproved ? '✅ Одобрен' : '⏳ Не одобрен';
        const displayStatus = user.status || 'Не указан';
        
        // Breadcrumbs
        ctx.state.userStates[userId].adminBreadcrumbs = ['Админ-панель', 'Пользователи', user.fullName || 'Без имени'];
        const breadcrumbsText = getBreadcrumbsText(ctx.state.userStates[userId].adminBreadcrumbs);
        
        const birthdateText = user.birthdate ? `🎂 Дата рождения: ${user.birthdate}` : '';
        
        const userText = `
${breadcrumbsText}👤 **${user.fullName || 'Без имени'}**

📱 Telegram: ${telegramInfo}
💼 Должность: ${user.position || 'Не указана'}
🏢 Организация: ${user.organization || 'Не указана'}
📞 Телефон: ${user.phone || 'Не указан'}
${birthdateText}
${statusEmoji} Статус: ${displayStatus}
${approvedStatus}

📅 Дата регистрации: ${extendedInfo.registrationDate}
📊 Количество отчетов: ${extendedInfo.reportsCount}
🕐 Последняя активность: ${extendedInfo.lastActivity}

🏗 Объекты:
${objectsList}
        `.trim();
        
        // Сохраняем выбранного пользователя и страницу возврата
        ctx.state.userStates[userId].adminSelectedUserId = targetUserId;
        ctx.state.userStates[userId].adminUsersReturnPage = returnPage;
        
        // Быстрые действия
        const quickActions = [];
        if (user.phone) {
            // Очищаем номер телефона от пробелов и форматируем для tel: URL
            const cleanPhone = user.phone.replace(/\s+/g, '').trim();
            // Используем callback вместо URL, так как Telegram строго валидирует tel: URLs
            quickActions.push(Markup.button.callback('📞 Позвонить', `admin_user_call_${targetUserId}`));
        }
        quickActions.push(Markup.button.url('💬 Написать', `tg://user?id=${targetUserId}`));
        
        const actionButtons = [];
        actionButtons.push([Markup.button.callback('🏠 Главная', 'admin_panel')]);
        if (quickActions.length > 0) {
            actionButtons.push(quickActions);
        }
        actionButtons.push(
            [Markup.button.callback('📋 История изменений', `admin_user_history_${targetUserId}`)],
            [Markup.button.callback('✏️ Редактировать ФИО', 'admin_user_edit_fullname')],
            [Markup.button.callback('✏️ Редактировать должность', 'admin_user_edit_position')],
            [Markup.button.callback('✏️ Редактировать организацию', 'admin_user_edit_organization')],
            [Markup.button.callback('✏️ Редактировать телефон', 'admin_user_edit_phone')],
            [Markup.button.callback('✏️ Редактировать дату рождения', 'admin_user_edit_birthdate')],
            [Markup.button.callback('✏️ Редактировать объекты', 'admin_user_edit_objects')],
            [Markup.button.callback('✏️ Изменить статус', 'admin_user_edit_status')],
            [Markup.button.callback(user.isApproved ? '❌ Отклонить' : '✅ Одобрить', 'admin_user_toggle_approved')],
            [Markup.button.callback('🗑 Удалить', 'admin_user_delete')],
            [Markup.button.callback('↩️ Назад', 'admin_users')]
        );
        
        const message = await ctx.reply(userText, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(actionButtons).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    }
    
    bot.action(/admin_user_view_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const userIndex = parseInt(ctx.match[1], 10);
        const userList = ctx.state.userStates[userId].adminUsersList;
        const returnPage = ctx.state.userStates[userId].adminUsersPage || 0;
        
        if (!userList || !userList[userIndex]) {
            await ctx.reply('Пользователь не найден.');
            return;
        }
        
        const targetUserId = userList[userIndex];
        await showUserDetails(ctx, targetUserId, returnPage);
    });
    
    // Обработчик кнопки "Позвонить"
    bot.action(/admin_user_call_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.match[1];
        const users = await loadUsers();
        const user = users[targetUserId];
        
        if (!user || !user.phone) {
            await ctx.answerCbQuery('Номер телефона не найден.');
            return;
        }
        
        // Очищаем номер телефона
        const cleanPhone = user.phone.replace(/\s+/g, '').trim();
        // Отправляем номер как кликабельную ссылку в тексте сообщения
        // Markdown ссылки с tel: работают в тексте, даже если не работают в кнопках
        await ctx.reply(`📞 Номер телефона: [${cleanPhone}](tel:${cleanPhone})`, {
            parse_mode: 'Markdown'
        });
        await ctx.answerCbQuery();
    });
    
    // Быстрые действия из списка
    bot.action(/admin_user_quick_approve_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const userIndex = parseInt(ctx.match[1], 10);
        const userList = ctx.state.userStates[userId].adminUsersList;
        
        if (!userList || !userList[userIndex]) {
            await ctx.reply('Пользователь не найден.');
            return;
        }
        
        const targetUserId = userList[userIndex];
        const users = await loadUsers();
        if (users[targetUserId]) {
            users[targetUserId].isApproved = 1;
            await saveUser(targetUserId, users[targetUserId]);
            
            // Логируем изменение
            const { logUserChange } = require('../../database/auditLogModel');
            await logUserChange(targetUserId, userId, 'approve', 'isApproved', 0, 1);
            
            await ctx.answerCbQuery('Пользователь одобрен');
            const filters = ctx.state.userStates[userId].adminUserFilters || {};
            const page = ctx.state.userStates[userId].adminUsersPage || 0;
            await showUsersList(ctx, filters, page);
        }
    });
    
    bot.action(/admin_user_quick_disapprove_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const userIndex = parseInt(ctx.match[1], 10);
        const userList = ctx.state.userStates[userId].adminUsersList;
        
        if (!userList || !userList[userIndex]) {
            await ctx.reply('Пользователь не найден.');
            return;
        }
        
        const targetUserId = userList[userIndex];
        const users = await loadUsers();
        if (users[targetUserId]) {
            users[targetUserId].isApproved = 0;
            await saveUser(targetUserId, users[targetUserId]);
            
            // Логируем изменение
            const { logUserChange } = require('../../database/auditLogModel');
            await logUserChange(targetUserId, userId, 'disapprove', 'isApproved', 1, 0);
            
            await ctx.answerCbQuery('Пользователь отклонен');
            const filters = ctx.state.userStates[userId].adminUserFilters || {};
            const page = ctx.state.userStates[userId].adminUsersPage || 0;
            await showUsersList(ctx, filters, page);
        }
    });
    
    // Обработчики редактирования пользователя
    bot.action('admin_user_edit_fullname', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_user_edit_fullname';
        const message = await ctx.reply('Введите новое ФИО:', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_user_back')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_user_edit_phone', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_user_edit_phone';
        const message = await ctx.reply('Введите новый телефон:', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_user_back')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_user_edit_birthdate', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_user_edit_birthdate';
        const message = await ctx.reply('Введите дату рождения в формате ДД.ММ.ГГГГ (например, 15.05.1990) или отправьте /clear для очистки:', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_user_back')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_user_edit_position', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        const users = await loadUsers();
        const targetUser = users[targetUserId];
        if (!targetUser) {
            await ctx.reply('Ошибка: пользователь не найден.');
            return;
        }
        
        const userOrganization = targetUser.organization;
        if (!userOrganization) {
            await ctx.reply('У пользователя не указана организация. Сначала укажите организацию.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        const positions = await getAllPositions(userOrganization);
        if (positions.length === 0) {
            await ctx.reply(`Для организации "${userOrganization}" не настроены должности. Сначала создайте должности для этой организации.`);
            return;
        }
        
        const buttons = positions.map((pos, index) => [
            Markup.button.callback(pos.name, `admin_user_set_position_${index}`)
        ]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_user_back')]);
        
        ctx.state.userStates[userId].adminEditPositions = positions.map(pos => pos.name);
        const message = await ctx.reply(`Выберите новую должность (организация: ${userOrganization}):`, Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action(/admin_user_set_position_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const posIndex = parseInt(ctx.match[1], 10);
        const posNames = ctx.state.userStates[userId].adminEditPositions;
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        
        if (!posNames || !posNames[posIndex] || !targetUserId) {
            await ctx.reply('Ошибка: данные не найдены.');
            return;
        }
        
        const users = await loadUsers();
        if (users[targetUserId]) {
            const oldValue = users[targetUserId].position;
            users[targetUserId].position = posNames[posIndex];
            await saveUser(targetUserId, users[targetUserId]);
            
            // Логируем изменение
            const { logUserChange } = require('../../database/auditLogModel');
            await logUserChange(targetUserId, userId, 'update', 'position', oldValue, posNames[posIndex]);
            
            await ctx.reply(`Должность изменена на "${posNames[posIndex]}".`);
            const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
            await showUserDetails(ctx, targetUserId, returnPage);
        }
    });
    
    bot.action('admin_user_edit_organization', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        const organizations = await getAllOrganizations();
        const buttons = organizations.map((org, index) => [
            Markup.button.callback(org.name, `admin_user_set_org_${index}`)
        ]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_user_back')]);
        
        ctx.state.userStates[userId].adminEditOrgs = organizations.map(org => org.name);
        const message = await ctx.reply('Выберите новую организацию:', Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action(/admin_user_set_org_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgIndex = parseInt(ctx.match[1], 10);
        const orgNames = ctx.state.userStates[userId].adminEditOrgs;
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        
        if (!orgNames || !orgNames[orgIndex] || !targetUserId) {
            await ctx.reply('Ошибка: данные не найдены.');
            return;
        }
        
        const users = await loadUsers();
        if (users[targetUserId]) {
            const oldValue = users[targetUserId].organization;
            users[targetUserId].organization = orgNames[orgIndex];
            await saveUser(targetUserId, users[targetUserId]);
            
            // Логируем изменение
            const { logUserChange } = require('../../database/auditLogModel');
            await logUserChange(targetUserId, userId, 'update', 'organization', oldValue, orgNames[orgIndex]);
            
            await ctx.reply(`Организация изменена на "${orgNames[orgIndex]}".`);
            const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
            await showUserDetails(ctx, targetUserId, returnPage);
        }
    });
    
    bot.action('admin_user_edit_objects', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        const users = await loadUsers();
        const user = users[targetUserId];
        if (!user) {
            await ctx.reply('Пользователь не найден.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        
        // Используем специальный step для админского редактирования
        if (!ctx.state.userStates[targetUserId]) {
            ctx.state.userStates[targetUserId] = { messageIds: [] };
        }
        const targetState = ctx.state.userStates[targetUserId];
        targetState.step = 'admin_user_edit_objects';
        targetState.selectedObjects = [...(user.selectedObjects || [])];
        
        // Создаем собственный интерфейс выбора объектов для админа
        const { getOrganizationObjects } = require('../../database/configService');
        const availableObjects = await getOrganizationObjects(user.organization);
        
        if (!availableObjects.length) {
            await ctx.reply('Для организации пользователя нет доступных объектов.');
            return;
        }
        
        const buttons = availableObjects.map((obj, index) => {
            const isSelected = targetState.selectedObjects.includes(obj);
            return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${obj}`, `admin_toggle_object_${index}_${targetUserId}`)];
        });
        buttons.push([Markup.button.callback('✅ Готово', `admin_confirm_objects_${targetUserId}`)]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_user_back')]);
        
        const message = await ctx.reply('Выберите объекты (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
        targetState.messageIds = [message.message_id];
    });
    
    bot.action(/admin_toggle_object_(\d+)_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objectIndex = parseInt(ctx.match[1], 10);
        const targetUserId = ctx.match[2];
        
        const { getOrganizationObjects } = require('../../database/configService');
        const users = await loadUsers();
        const user = users[targetUserId];
        if (!user) {
            await ctx.reply('Пользователь не найден.');
            return;
        }
        
        const availableObjects = await getOrganizationObjects(user.organization);
        const objectName = availableObjects[objectIndex];
        
        if (!ctx.state.userStates[targetUserId]) {
            ctx.state.userStates[targetUserId] = { messageIds: [] };
        }
        const targetState = ctx.state.userStates[targetUserId];
        
        if (targetState.step !== 'admin_user_edit_objects') return;
        
        let selectedObjects = targetState.selectedObjects || [];
        const index = selectedObjects.indexOf(objectName);
        if (index === -1) {
            selectedObjects.push(objectName);
        } else {
            selectedObjects.splice(index, 1);
        }
        targetState.selectedObjects = selectedObjects;
        
        // Обновляем сообщение
        const buttons = availableObjects.map((obj, idx) => {
            const isSelected = selectedObjects.includes(obj);
            return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${obj}`, `admin_toggle_object_${idx}_${targetUserId}`)];
        });
        buttons.push([Markup.button.callback('✅ Готово', `admin_confirm_objects_${targetUserId}`)]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_user_back')]);
        
        const lastMessageId = targetState.messageIds[targetState.messageIds.length - 1];
        try {
            await ctx.telegram.editMessageText(ctx.chat.id, lastMessageId, null, 'Выберите объекты (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
        } catch (e) {
            await ctx.reply('Выберите объекты (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
        }
    });
    
    // Обработчик подтверждения объектов при редактировании в админ-панели
    bot.action(/admin_confirm_objects_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.match[1];
        const targetState = ctx.state.userStates[targetUserId];
        
        if (!targetState || !targetState.selectedObjects || targetState.step !== 'admin_user_edit_objects') {
            await ctx.reply('Ошибка: объекты не выбраны.');
            return;
        }
        
        const users = await loadUsers();
        if (users[targetUserId]) {
            const oldValue = JSON.stringify(users[targetUserId].selectedObjects || []);
            users[targetUserId].selectedObjects = targetState.selectedObjects;
            await saveUser(targetUserId, users[targetUserId]);
            
            // Логируем изменение
            const { logUserChange } = require('../../database/auditLogModel');
            await logUserChange(targetUserId, userId, 'update', 'selectedObjects', oldValue, JSON.stringify(targetState.selectedObjects));
            
            targetState.step = null;
            targetState.selectedObjects = [];
            await ctx.reply('Объекты успешно обновлены.');
            const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
            await showUserDetails(ctx, targetUserId, returnPage);
        }
    });
    
    bot.action('admin_user_edit_status', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('Выберите новый статус:', Markup.inlineKeyboard([
            [Markup.button.callback('🟢 Online', 'admin_user_set_status_work')],
            [Markup.button.callback('🔴 Offline', 'admin_user_set_status_vacation')],
            [Markup.button.callback('↩️ Отмена', 'admin_user_back')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_user_set_status_work', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        const users = await loadUsers();
        if (users[targetUserId]) {
            const oldValue = users[targetUserId].status;
            users[targetUserId].status = 'Online';
            await saveUser(targetUserId, users[targetUserId]);
            
            // Логируем изменение
            const { logUserChange } = require('../../database/auditLogModel');
            await logUserChange(targetUserId, userId, 'update', 'status', oldValue, 'Online');
            
            await ctx.reply('Статус изменен на "Online".');
            const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
            await showUserDetails(ctx, targetUserId, returnPage);
        }
    });
    
    bot.action('admin_user_set_status_vacation', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        const users = await loadUsers();
        if (users[targetUserId]) {
            const oldValue = users[targetUserId].status;
            users[targetUserId].status = 'В отпуске';
            await saveUser(targetUserId, users[targetUserId]);
            
            // Логируем изменение
            const { logUserChange } = require('../../database/auditLogModel');
            await logUserChange(targetUserId, userId, 'update', 'status', oldValue, 'Offline');
            
            await ctx.reply('Статус изменен на "Offline".');
            const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
            await showUserDetails(ctx, targetUserId, returnPage);
        }
    });
    
    bot.action('admin_user_toggle_approved', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        const users = await loadUsers();
        if (users[targetUserId]) {
            const oldValue = users[targetUserId].isApproved;
            users[targetUserId].isApproved = users[targetUserId].isApproved ? 0 : 1;
            await saveUser(targetUserId, users[targetUserId]);
            
            // Логируем изменение
            const { logUserChange } = require('../../database/auditLogModel');
            await logUserChange(targetUserId, userId, users[targetUserId].isApproved ? 'approve' : 'disapprove', 'isApproved', oldValue, users[targetUserId].isApproved);
            
            const status = users[targetUserId].isApproved ? 'одобрен' : 'отклонен';
            await ctx.reply(`Пользователь ${status}.`);
            const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
            await showUserDetails(ctx, targetUserId, returnPage);
        }
    });
    
    // История изменений пользователя
    async function showUserChangeHistory(ctx, targetUserId) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        const { getUserChangeHistory } = require('../../database/auditLogModel');
        const { formatDate } = require('../utils');
        const history = await getUserChangeHistory(targetUserId, 20);
        
        if (history.length === 0) {
            await ctx.reply('История изменений пуста.');
            const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
            await showUserDetails(ctx, targetUserId, returnPage);
            return;
        }
        
        let historyText = `📋 **История изменений**\n\n`;
        
        for (const entry of history) {
            const date = formatDate(entry.timestamp);
            const time = new Date(entry.timestamp).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' });
            const actionNames = {
                'update': 'Изменение',
                'delete': 'Удаление',
                'approve': 'Одобрение',
                'disapprove': 'Отклонение',
                'create': 'Создание'
            };
            
            historyText += `📅 ${date} ${time}\n`;
            historyText += `Действие: ${actionNames[entry.action] || entry.action}\n`;
            if (entry.field && entry.field !== 'multiple') {
                historyText += `Поле: ${entry.field}\n`;
            }
            if (entry.oldValue !== null && entry.oldValue !== undefined) {
                historyText += `Было: ${entry.oldValue}\n`;
            }
            if (entry.newValue !== null && entry.newValue !== undefined) {
                historyText += `Стало: ${entry.newValue}\n`;
            }
            historyText += `\n`;
        }
        
        const message = await ctx.reply(historyText, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Назад к пользователю', `admin_user_back_from_history_${targetUserId}`)]
            ]).reply_markup
        });
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    }
    
    bot.action(/admin_user_history_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.match[1];
        await showUserChangeHistory(ctx, targetUserId);
    });
    
    bot.action(/admin_user_back_from_history_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.match[1];
        const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
        await showUserDetails(ctx, targetUserId, returnPage);
    });
    
    bot.action('admin_user_back', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
        
        if (targetUserId) {
            await showUserDetails(ctx, targetUserId, returnPage);
        } else {
            await showUsersList(ctx, ctx.state.userStates[userId].adminUserFilters || {}, returnPage);
        }
    });
    
    // Добавление пользователя
    bot.action('admin_user_add', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('Выберите способ добавления пользователя:', Markup.inlineKeyboard([
            [Markup.button.callback('➕ Добавить напрямую', 'admin_user_add_direct')],
            [Markup.button.callback('🔑 Создать пригласительный код', 'admin_invite_code_menu')],
            [Markup.button.callback('↩️ Назад', 'admin_users')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_user_add_direct', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].step = 'admin_user_add_telegramid';
        ctx.state.userStates[userId].adminNewUser = {};
        const message = await ctx.reply('Введите Telegram ID нового пользователя:', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_users')]
        ]));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    // Удаление пользователя
    bot.action('admin_user_delete', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        const users = await loadUsers();
        const user = users[targetUserId];
        if (!user) {
            await ctx.reply('Пользователь не найден.');
            return;
        }
        
        // Проверяем наличие отчетов
        const userReports = await loadUserReports(targetUserId);
        const reportsCount = Object.keys(userReports).length;
        
        if (reportsCount > 0) {
            await ctx.reply(`⚠️ Внимание! У пользователя есть ${reportsCount} отчетов. Они будут удалены вместе с пользователем.\n\nПодтвердите удаление:`, Markup.inlineKeyboard([
                [Markup.button.callback('✅ Да, удалить', 'admin_user_delete_confirm')],
                [Markup.button.callback('❌ Отмена', 'admin_user_back')]
            ]));
        } else {
            await ctx.reply('Подтвердите удаление пользователя:', Markup.inlineKeyboard([
                [Markup.button.callback('✅ Да, удалить', 'admin_user_delete_confirm')],
                [Markup.button.callback('❌ Отмена', 'admin_user_back')]
            ]));
        }
    });
    
    bot.action('admin_user_delete_confirm', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const targetUserId = ctx.state.userStates[userId].adminSelectedUserId;
        if (!targetUserId) {
            await ctx.reply('Ошибка: пользователь не выбран.');
            return;
        }
        
        const users = await loadUsers();
        const user = users[targetUserId];
        if (!user) {
            await ctx.reply('Пользователь не найден.');
            return;
        }
        
        try {
            // Логируем удаление
            const { logUserChange } = require('../../database/auditLogModel');
            await logUserChange(targetUserId, userId, 'delete', 'user', JSON.stringify(user), null, { fullName: user.fullName });
            
            // Удаляем отчеты пользователя
            const userReports = await loadUserReports(targetUserId);
            const db = await require('../../config/mongoConfig').connectMongo();
            const reportsCollection = db.collection('reports');
            for (const reportId of Object.keys(userReports)) {
                await reportsCollection.deleteOne({ reportid: reportId });
            }
            
            // Удаляем пользователя
            await deleteUser(targetUserId);
            await ctx.reply(`✅ Пользователь "${user.fullName || targetUserId}" удален.`);
            
            // Возвращаемся к списку пользователей
            const returnPage = ctx.state.userStates[userId].adminUsersReturnPage || 0;
            const filters = ctx.state.userStates[userId].adminUserFilters || {};
            delete ctx.state.userStates[userId].adminSelectedUserId;
            await showUsersList(ctx, filters, returnPage);
        } catch (error) {
            console.error('Ошибка при удалении пользователя:', error);
            await ctx.reply('Ошибка при удалении пользователя: ' + error.message);
        }
    });
    
    // Обработчики для добавления пользователя (выбор организации и должности)
    bot.action(/admin_user_add_set_org_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const orgIndex = parseInt(ctx.match[1], 10);
        const orgNames = ctx.state.userStates[userId].adminAddOrgs;
        
        if (!orgNames || !orgNames[orgIndex]) {
            await ctx.reply('Организация не найдена.');
            return;
        }
        
        const orgName = orgNames[orgIndex];
        if (!ctx.state.userStates[userId].adminNewUser) {
            ctx.state.userStates[userId].adminNewUser = {};
        }
        ctx.state.userStates[userId].adminNewUser.organization = orgName;
        
        // Показываем должности организации
        const positions = await getAllPositions(orgName);
        if (positions.length === 0) {
            await ctx.reply(`Для организации "${orgName}" не настроены должности. Сначала создайте должности для этой организации.`);
            return;
        }
        
        const buttons = positions.map((pos, index) => [
            Markup.button.callback(pos.name, `admin_user_add_set_position_${index}`)
        ]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_users')]);
        ctx.state.userStates[userId].adminAddPositions = positions.map(pos => pos.name);
        
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply(`Выберите должность (организация: ${orgName}):`, Markup.inlineKeyboard(buttons));
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action(/admin_user_add_set_position_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const posIndex = parseInt(ctx.match[1], 10);
        const posNames = ctx.state.userStates[userId].adminAddPositions;
        
        if (!posNames || !posNames[posIndex]) {
            await ctx.reply('Должность не найдена.');
            return;
        }
        
        if (!ctx.state.userStates[userId].adminNewUser) {
            ctx.state.userStates[userId].adminNewUser = {};
        }
        ctx.state.userStates[userId].adminNewUser.position = posNames[posIndex];
        
        // Показываем выбор объектов для организации
        const orgName = ctx.state.userStates[userId].adminNewUser.organization;
        const { getOrganizationObjects } = require('../../database/configService');
        const availableObjects = await getOrganizationObjects(orgName);
        
        if (!availableObjects.length) {
            // Если объектов нет, пропускаем этот шаг
            ctx.state.userStates[userId].adminNewUser.selectedObjects = [];
            ctx.state.userStates[userId].step = 'admin_user_add_phone';
            const msg = await ctx.reply('Для этой организации нет объектов. Введите телефон (или /skip для пропуска):', Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Отмена', 'admin_users')]
            ]));
            ctx.state.userStates[userId].messageIds.push(msg.message_id);
            return;
        }
        
        // Используем специальные переменные для админского добавления
        const adminState = ctx.state.userStates[userId];
        adminState.adminAddSelectedObjects = [];
        
        const buttons = availableObjects.map((obj, index) => [
            Markup.button.callback(obj, `admin_user_add_toggle_obj_${index}`)
        ]);
        buttons.push([Markup.button.callback('✅ Готово', 'admin_user_add_confirm_objects')]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_users')]);
        adminState.adminAddAvailableObjects = availableObjects;
        
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('Выберите объекты (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
        adminState.messageIds.push(message.message_id);
    });
    
    bot.action(/admin_user_add_toggle_obj_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objIndex = parseInt(ctx.match[1], 10);
        const adminState = ctx.state.userStates[userId];
        const availableObjects = adminState.adminAddAvailableObjects;
        
        if (!availableObjects || !availableObjects[objIndex]) {
            await ctx.reply('Объект не найден.');
            return;
        }
        
        const objectName = availableObjects[objIndex];
        let selectedObjects = adminState.adminAddSelectedObjects || [];
        const index = selectedObjects.indexOf(objectName);
        if (index === -1) {
            selectedObjects.push(objectName);
        } else {
            selectedObjects.splice(index, 1);
        }
        adminState.adminAddSelectedObjects = selectedObjects;
        
        // Обновляем сообщение
        const buttons = availableObjects.map((obj, idx) => {
            const isSelected = selectedObjects.includes(obj);
            return [Markup.button.callback(`${isSelected ? '✅ ' : ''}${obj}`, `admin_user_add_toggle_obj_${idx}`)];
        });
        buttons.push([Markup.button.callback('✅ Готово', 'admin_user_add_confirm_objects')]);
        buttons.push([Markup.button.callback('↩️ Отмена', 'admin_users')]);
        
        const lastMessageId = adminState.messageIds[adminState.messageIds.length - 1];
        try {
            await ctx.telegram.editMessageText(ctx.chat.id, lastMessageId, null, 'Выберите объекты (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
        } catch (e) {
            await ctx.reply('Выберите объекты (можно выбрать несколько):', Markup.inlineKeyboard(buttons));
        }
    });
    
    bot.action('admin_user_add_confirm_objects', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const adminState = ctx.state.userStates[userId];
        if (!adminState.adminNewUser) {
            await ctx.reply('Ошибка: данные пользователя не найдены.');
            return;
        }
        
        adminState.adminNewUser.selectedObjects = adminState.adminAddSelectedObjects || [];
        adminState.step = 'admin_user_add_phone';
        
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply('Введите телефон (или /skip для пропуска):', Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Отмена', 'admin_users')]
        ]));
        adminState.messageIds.push(message.message_id);
    });
    
    // Массовые операции
    bot.action('admin_users_toggle_select_mode', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const currentMode = ctx.state.userStates[userId].adminMultiSelectMode || false;
        ctx.state.userStates[userId].adminMultiSelectMode = !currentMode;
        
        if (!currentMode) {
            // Включаем режим выбора
            ctx.state.userStates[userId].adminSelectedUsers = [];
        } else {
            // Выключаем режим выбора
            ctx.state.userStates[userId].adminSelectedUsers = [];
        }
        
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        const page = ctx.state.userStates[userId].adminUsersPage || 0;
        await showUsersList(ctx, filters, page);
    });
    
    bot.action(/admin_user_select_toggle_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const userIndex = parseInt(ctx.match[1], 10);
        const userList = ctx.state.userStates[userId].adminUsersList;
        
        if (!userList || !userList[userIndex]) {
            await ctx.reply('Пользователь не найден.');
            return;
        }
        
        const targetUserId = userList[userIndex];
        let selectedUsers = ctx.state.userStates[userId].adminSelectedUsers || [];
        
        const index = selectedUsers.indexOf(targetUserId);
        if (index === -1) {
            selectedUsers.push(targetUserId);
        } else {
            selectedUsers.splice(index, 1);
        }
        
        ctx.state.userStates[userId].adminSelectedUsers = selectedUsers;
        
        // Обновляем список
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        const page = ctx.state.userStates[userId].adminUsersPage || 0;
        await showUsersList(ctx, filters, page);
    });
    
    bot.action('admin_users_bulk_actions', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const selectedUsers = ctx.state.userStates[userId].adminSelectedUsers || [];
        if (selectedUsers.length === 0) {
            await ctx.answerCbQuery('Выберите хотя бы одного пользователя');
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        const message = await ctx.reply(
            `Выбрано пользователей: ${selectedUsers.length}\n\nВыберите действие:`,
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Одобрить выбранных', 'admin_users_bulk_approve')],
                [Markup.button.callback('❌ Отклонить выбранных', 'admin_users_bulk_disapprove')],
                [Markup.button.callback('🗑 Удалить выбранных', 'admin_users_bulk_delete')],
                [Markup.button.callback('↩️ Назад', 'admin_users')]
            ])
        );
        ctx.state.userStates[userId].messageIds.push(message.message_id);
    });
    
    bot.action('admin_users_bulk_approve', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const selectedUsers = ctx.state.userStates[userId].adminSelectedUsers || [];
        if (selectedUsers.length === 0) {
            await ctx.reply('Нет выбранных пользователей.');
            return;
        }
        
        const users = await loadUsers();
        const { logUserChange } = require('../../database/auditLogModel');
        
        let successCount = 0;
        for (const targetUserId of selectedUsers) {
            if (users[targetUserId] && !users[targetUserId].isApproved) {
                const oldValue = users[targetUserId].isApproved;
                users[targetUserId].isApproved = 1;
                await saveUser(targetUserId, users[targetUserId]);
                await logUserChange(targetUserId, userId, 'approve', 'isApproved', oldValue, 1);
                successCount++;
            }
        }
        
        await ctx.reply(`✅ Одобрено пользователей: ${successCount}`);
        ctx.state.userStates[userId].adminSelectedUsers = [];
        ctx.state.userStates[userId].adminMultiSelectMode = false;
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        await showUsersList(ctx, filters, 0);
    });
    
    bot.action('admin_users_bulk_disapprove', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const selectedUsers = ctx.state.userStates[userId].adminSelectedUsers || [];
        if (selectedUsers.length === 0) {
            await ctx.reply('Нет выбранных пользователей.');
            return;
        }
        
        const users = await loadUsers();
        const { logUserChange } = require('../../database/auditLogModel');
        
        let successCount = 0;
        for (const targetUserId of selectedUsers) {
            if (users[targetUserId] && users[targetUserId].isApproved) {
                const oldValue = users[targetUserId].isApproved;
                users[targetUserId].isApproved = 0;
                await saveUser(targetUserId, users[targetUserId]);
                await logUserChange(targetUserId, userId, 'disapprove', 'isApproved', oldValue, 0);
                successCount++;
            }
        }
        
        await ctx.reply(`❌ Отклонено пользователей: ${successCount}`);
        ctx.state.userStates[userId].adminSelectedUsers = [];
        ctx.state.userStates[userId].adminMultiSelectMode = false;
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        await showUsersList(ctx, filters, 0);
    });
    
    bot.action('admin_users_bulk_delete', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const selectedUsers = ctx.state.userStates[userId].adminSelectedUsers || [];
        if (selectedUsers.length === 0) {
            await ctx.reply('Нет выбранных пользователей.');
            return;
        }
        
        await ctx.reply(
            `⚠️ Внимание! Вы собираетесь удалить ${selectedUsers.length} пользователя(ей).\n\nПодтвердите удаление:`,
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Да, удалить', 'admin_users_bulk_delete_confirm')],
                [Markup.button.callback('❌ Отмена', 'admin_users')]
            ])
        );
    });
    
    bot.action('admin_users_bulk_delete_confirm', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const selectedUsers = ctx.state.userStates[userId].adminSelectedUsers || [];
        if (selectedUsers.length === 0) {
            await ctx.reply('Нет выбранных пользователей.');
            return;
        }
        
        const users = await loadUsers();
        const { logUserChange } = require('../../database/auditLogModel');
        const { loadUserReports } = require('../../database/reportModel');
        const db = await require('../../config/mongoConfig').connectMongo();
        const reportsCollection = db.collection('reports');
        
        let successCount = 0;
        for (const targetUserId of selectedUsers) {
            if (users[targetUserId]) {
                try {
                    // Логируем удаление
                    await logUserChange(targetUserId, userId, 'delete', 'user', JSON.stringify(users[targetUserId]), null, { fullName: users[targetUserId].fullName });
                    
                    // Удаляем отчеты
                    const userReports = await loadUserReports(targetUserId);
                    for (const reportId of Object.keys(userReports)) {
                        await reportsCollection.deleteOne({ reportid: reportId });
                    }
                    
                    // Удаляем пользователя
                    await deleteUser(targetUserId);
                    successCount++;
                } catch (error) {
                    console.error(`Ошибка при удалении пользователя ${targetUserId}:`, error);
                }
            }
        }
        
        await ctx.reply(`✅ Удалено пользователей: ${successCount}`);
        ctx.state.userStates[userId].adminSelectedUsers = [];
        ctx.state.userStates[userId].adminMultiSelectMode = false;
        const filters = ctx.state.userStates[userId].adminUserFilters || {};
        await showUsersList(ctx, filters, 0);
    });
    
    // ========== УПРАВЛЕНИЕ ПОТРЕБНОСТЯМИ ==========
    
    async function showNeedsManagementMenu(ctx) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        try {
            await clearPreviousMessages(ctx, userId);
            const message = await ctx.reply(
                '📦 Управление потребностями\nВыберите действие:',
                Markup.inlineKeyboard([
                    [Markup.button.callback('📋 Все заявки', 'admin_needs_all')],
                    [Markup.button.callback('👥 Назначение ответственных', 'admin_needs_assign')],
                    [Markup.button.callback('↩️ Назад', 'admin_panel')]
                ])
            );
            addMessageId(ctx, message.message_id);
        } catch (error) {
            console.error('Ошибка в showNeedsManagementMenu:', error);
            await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
        }
    }

    async function showAllNeedsByObjects(ctx, page = 0) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        try {
            await clearPreviousMessages(ctx, userId);
            const allNeeds = await loadAllNeeds();
            console.log(`[ADMIN_NEEDS] showAllNeedsByObjects: Всего заявок загружено: ${Object.keys(allNeeds).length}`);
            
            // Фильтруем только заявки с валидным objectName
            const needsArray = Object.values(allNeeds).filter(n => n && n.objectName);
            console.log(`[ADMIN_NEEDS] Заявок с валидным objectName: ${needsArray.length}`);
            
            // Получаем уникальные объекты, убираем null/undefined
            const uniqueObjects = [...new Set(needsArray.map(n => n.objectName.trim()).filter(obj => obj))];
            console.log(`[ADMIN_NEEDS] Уникальных объектов: ${uniqueObjects.length}`);
            console.log(`[ADMIN_NEEDS] Список объектов:`, JSON.stringify(uniqueObjects));
            
            // Логируем примеры заявок для проверки
            const sampleNeeds = needsArray.slice(0, 10).map(n => ({ needId: n.needId, objectName: n.objectName, userId: n.userId }));
            console.log(`[ADMIN_NEEDS] Примеры заявок:`, JSON.stringify(sampleNeeds));

            if (uniqueObjects.length === 0) {
                const message = await ctx.reply('Заявок на потребности пока нет.', Markup.inlineKeyboard([
                    [Markup.button.callback('↩️ Назад', 'admin_needs')]
                ]));
                addMessageId(ctx, message.message_id);
                return;
            }

            // Сохраняем список объектов в state для использования при выборе объекта
            const state = ensureUserState(ctx);
            if (state) {
                state.adminNeedsObjectsList = uniqueObjects;
            }

            const itemsPerPage = 10;
            const totalPages = Math.ceil(uniqueObjects.length / itemsPerPage);
            const pageNum = typeof page === 'number' ? page : 0;
            const startIndex = pageNum * itemsPerPage;
            const endIndex = Math.min(startIndex + itemsPerPage, uniqueObjects.length);
            const currentObjects = uniqueObjects.slice(startIndex, endIndex);

            const buttons = currentObjects.map((obj, index) => {
                const objectNeeds = needsArray.filter(n => 
                    n.objectName && n.objectName.trim() === obj.trim()
                );
                const displayObj = obj.length > 30 ? obj.substring(0, 27) + '...' : obj;
                return [Markup.button.callback(`${displayObj} (${objectNeeds.length})`, `admin_needs_object_${uniqueObjects.indexOf(obj)}`)];
            });

            const paginationButtons = [];
            if (totalPages > 1) {
                if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `admin_needs_all_page_${pageNum - 1}`));
                if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `admin_needs_all_page_${pageNum + 1}`));
            }
            if (paginationButtons.length > 0) buttons.push(paginationButtons);
            buttons.push([Markup.button.callback('↩️ Назад', 'admin_needs')]);

            const message = await ctx.reply(
                `📦 Все заявки на потребности\n\nВыберите объект (Страница ${pageNum + 1} из ${totalPages}):`,
                Markup.inlineKeyboard(buttons)
            );
            addMessageId(ctx, message.message_id);
        } catch (error) {
            console.error('Ошибка в showAllNeedsByObjects:', error);
            await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
        }
    }

    async function showNeedsForObject(ctx, objectIndex, dateIndex = 0, page = 0) {
        console.log(`[ADMIN_NEEDS] showNeedsForObject CALLED: objectIndex=${objectIndex}, dateIndex=${dateIndex}, page=${page}`);
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) {
            console.log(`[ADMIN_NEEDS] showNeedsForObject: пользователь не является администратором (userId=${userId}, ADMIN_ID=${ADMIN_ID})`);
            return;
        }

        try {
            const allNeeds = await loadAllNeeds();
            console.log(`[ADMIN_NEEDS] showNeedsForObject: загружено заявок: ${Object.keys(allNeeds).length}`);
            const state = ensureUserState(ctx);
            
            // Фильтруем только заявки с валидным objectName (как в showAllNeedsByObjects)
            const needsArray = Object.values(allNeeds).filter(n => n && n.objectName);
            const uniqueObjects = [...new Set(needsArray.map(n => n.objectName.trim()).filter(obj => obj))];
            
            // Сохраняем список объектов в state
            if (state) {
                state.adminNeedsObjectsList = uniqueObjects;
            }
            
            const objectName = uniqueObjects[objectIndex];
            if (!objectName) {
                console.log(`[ADMIN_NEEDS] ОШИБКА: объект не найден по индексу ${objectIndex}, uniqueObjects.length=${uniqueObjects.length}`);
                return ctx.reply('Ошибка: объект не найден.');
            }

            const normalizedObjectName = objectName.trim();
            const objectNeeds = Object.entries(allNeeds).filter(([_, n]) =>
                n && n.objectName && n.objectName.trim() === normalizedObjectName
            );
            const sortedNeeds = objectNeeds.sort((a, b) => b[1].timestamp.localeCompare(a[1].timestamp));
            
            // Получаем уникальные даты и сортируем их в обратном порядке (новые первыми)
            const uniqueDatesArray = [...new Set(sortedNeeds.map(([, n]) => parseAndFormatDate(n.date)))];
            // Сортируем даты в обратном порядке для единообразия
            const uniqueDatesSorted = uniqueDatesArray.sort((a, b) => {
                // Парсим даты в формате ДД.ММ.ГГГГ для сравнения
                const parseDate = (dateStr) => {
                    const [day, month, year] = dateStr.split('.').map(Number);
                    return new Date(year, month - 1, day);
                };
                return parseDate(b).getTime() - parseDate(a).getTime();
            });
            
            console.log(`[ADMIN_NEEDS] showNeedsForObject START: objectIndex=${objectIndex}, objectName="${objectName}", dateIndex=${dateIndex}, page=${page}`);
            console.log(`[ADMIN_NEEDS] uniqueDatesSorted (${uniqueDatesSorted.length}):`, JSON.stringify(uniqueDatesSorted));
            
            // Используем текущий список дат (не используем state.adminNeedsDatesList, так как он может быть для другого объекта)
            const selectedDate = uniqueDatesSorted[dateIndex];
            console.log(`[ADMIN_NEEDS] selectedDate по индексу ${dateIndex}: "${selectedDate}"`);
            
            if (!selectedDate) {
                console.log(`[ADMIN_NEEDS] ОШИБКА: дата не найдена по индексу ${dateIndex}, datesList.length=${datesList.length}`);
                return ctx.reply('Ошибка: дата не найдена.');
            }

            await clearPreviousMessages(ctx, userId);

            // Фильтруем заявки по выбранной дате
            console.log(`[ADMIN_NEEDS] Всего заявок для объекта: ${sortedNeeds.length}`);
            const sampleDates = sortedNeeds.slice(0, 10).map(([_, n]) => ({ needId: n.needId, date: n.date, parsedDate: parseAndFormatDate(n.date) }));
            console.log(`[ADMIN_NEEDS] Примеры дат из заявок:`, JSON.stringify(sampleDates));
            
            const dateNeeds = sortedNeeds.filter(([_, n]) => {
                const needDate = parseAndFormatDate(n.date);
                const matches = needDate === selectedDate;
                if (!matches && sampleDates.some(sd => sd.needId === n.needId)) {
                    console.log(`[ADMIN_NEEDS] Не совпадает: needDate="${needDate}" !== selectedDate="${selectedDate}"`);
                }
                return matches;
            });
            
            console.log(`[ADMIN_NEEDS] Найдено заявок для даты "${selectedDate}": ${dateNeeds.length}`);

            if (dateNeeds.length === 0) {
                console.log(`[showNeedsForObject] ОШИБКА: Нет заявок для объекта "${objectName}" за ${selectedDate}`);
                return ctx.reply(`Нет заявок для объекта "${objectName}" за ${selectedDate}.`);
            }

            const itemsPerPage = 10;
            const totalPages = Math.ceil(dateNeeds.length / itemsPerPage);
            const pageNum = typeof page === 'number' ? page : 0;
            const startIndex = pageNum * itemsPerPage;
            const endIndex = Math.min(startIndex + itemsPerPage, dateNeeds.length);
            const currentNeeds = dateNeeds.slice(startIndex, endIndex);

            const { escapeHtml } = require('../utils/htmlHelper');
            const TYPE_NAMES = {
                'materials': 'Материалы',
                'equipment': 'Оборудование',
                'special_equipment': 'Спецтехника',
                'protective_clothing': 'Спецодежда',
                'office_supplies': 'Канцтовары',
                'accommodation': 'Проживание',
                'services': 'Услуги',
                'accountable': 'Подотчетные'
            };
            const URGENCY_NAMES = {
                'urgent': { name: 'Срочно', emoji: '🔥' },
                'soon': { name: 'В ближайшее время', emoji: '⏳' },
                'planned': { name: 'Планово', emoji: '📅' }
            };
            const STATUS_NAMES = {
                'new': 'Новая',
                'in_progress': 'В обработке',
                'completed': 'Выполнена',
                'rejected': 'Отклонена'
            };

            // Функция для форматирования должности (сокращение)
            const formatPosition = (position) => {
                if (position === 'Производитель работ') return 'Произв. работ';
                return position || '';
            };

            const users = await loadUsers();
            const itemButtons = currentNeeds.map(([needId, need]) => {
                const typeName = TYPE_NAMES[need.type] || need.type;
                const needUser = users[need.userId] || {};
                const position = formatPosition(needUser.position || '');
                const fullName = needUser.fullName || need.fullName || '';
                const label = `📦 ${typeName} -> ${position} ${fullName}`.trim();
                return [Markup.button.callback(label.length > 64 ? label.substring(0, 61) + '...' : label, `admin_select_need_${needId}`)];
            });

            const buttons = [];
            const paginationButtons = [];
            if (totalPages > 1) {
                if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `admin_needs_object_${objectIndex}_date_${dateIndex}_page_${pageNum - 1}`));
                if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `admin_needs_object_${objectIndex}_date_${dateIndex}_page_${pageNum + 1}`));
            }
            if (paginationButtons.length > 0) buttons.push(paginationButtons);
            buttons.push(...itemButtons);
            buttons.push([Markup.button.callback('↩️ Назад', `admin_needs_all`)]);

            const message = await ctx.reply(
                `📦 Заявки для объекта "${objectName}" за ${selectedDate} (Страница ${pageNum + 1} из ${totalPages}):`,
                Markup.inlineKeyboard(buttons)
            );
            addMessageId(ctx, message.message_id);
        } catch (error) {
            console.error('Ошибка в showNeedsForObject:', error);
            await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
        }
    }

    async function showNeedsDatesForObject(ctx, objectIndex, page = 0) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        try {
            const allNeeds = await loadAllNeeds();
            const state = ensureUserState(ctx);
            
            // Фильтруем только заявки с валидным objectName (как в showAllNeedsByObjects)
            const needsArray = Object.values(allNeeds).filter(n => n && n.objectName);
            const uniqueObjects = [...new Set(needsArray.map(n => n.objectName.trim()).filter(obj => obj))];
            
            // Сохраняем список объектов в state
            if (state) {
                state.adminNeedsObjectsList = uniqueObjects;
            }
            
            const objectName = uniqueObjects[objectIndex];
            if (!objectName) {
                return ctx.reply('Ошибка: объект не найден.');
            }

            await clearPreviousMessages(ctx, userId);

            const normalizedObjectName = objectName.trim();
            const objectNeeds = Object.entries(allNeeds).filter(([_, n]) =>
                n && n.objectName && n.objectName.trim() === normalizedObjectName
            );
            const sortedNeeds = objectNeeds.sort((a, b) => b[1].timestamp.localeCompare(a[1].timestamp));
            // Получаем уникальные даты и сортируем их в обратном порядке (новые первыми)
            const uniqueDatesArray = [...new Set(sortedNeeds.map(([, n]) => parseAndFormatDate(n.date)))];
            // Сортируем даты в обратном порядке для единообразия
            const uniqueDates = uniqueDatesArray.sort((a, b) => {
                // Парсим даты в формате ДД.ММ.ГГГГ для сравнения
                const parseDate = (dateStr) => {
                    const [day, month, year] = dateStr.split('.').map(Number);
                    return new Date(year, month - 1, day);
                };
                return parseDate(b).getTime() - parseDate(a).getTime();
            });

            // Сохраняем список дат в state для использования при выборе даты
            if (state) {
                state.adminNeedsDatesList = uniqueDates;
            }
            
            console.log(`[ADMIN_NEEDS] showNeedsDatesForObject: objectIndex=${objectIndex}, objectName="${objectName}", page=${page}`);
            console.log(`[ADMIN_NEEDS] uniqueDates (${uniqueDates.length}):`, JSON.stringify(uniqueDates));
            console.log(`[ADMIN_NEEDS] Сохраняем список дат в state.adminNeedsDatesList`);

            const itemsPerPage = 10;
            const totalPages = Math.ceil(uniqueDates.length / itemsPerPage);
            const pageNum = typeof page === 'number' ? page : 0;
            const startIndex = pageNum * itemsPerPage;
            const endIndex = Math.min(startIndex + itemsPerPage, uniqueDates.length);
            const currentDates = uniqueDates.slice(startIndex, endIndex);

            if (currentDates.length === 0) {
                const state = ctx.state.userStates && ctx.state.userStates[userId] ? ctx.state.userStates[userId] : null;
                const backButton = (state && state.adminNeedsObjectsList && objectIndex !== undefined) 
                    ? `admin_needs_object_${objectIndex}` 
                    : 'admin_show_all_needs';
                return ctx.reply('Ошибка: нет дат для отображения.', Markup.inlineKeyboard([
                    [Markup.button.callback('↩️ Назад', backButton)]
                ]));
            }

            const dateButtons = currentDates.map((date) => {
                // Используем индекс из полного списка uniqueDates для данного объекта
                const dateIndexInFullList = uniqueDates.indexOf(date);
                console.log(`[ADMIN_NEEDS] Кнопка даты: "${date}" -> индекс ${dateIndexInFullList}, callback: admin_needs_object_${objectIndex}_date_${dateIndexInFullList}`);
                return [Markup.button.callback(date, `admin_needs_object_${objectIndex}_date_${dateIndexInFullList}`)];
            }).reverse();

            const buttons = [];
            const paginationButtons = [];
            if (totalPages > 1) {
                if (pageNum > 0) paginationButtons.push(Markup.button.callback('⬅️ Назад', `admin_needs_object_${objectIndex}_dates_page_${pageNum - 1}`));
                if (pageNum < totalPages - 1) paginationButtons.push(Markup.button.callback('Вперед ➡️', `admin_needs_object_${objectIndex}_dates_page_${pageNum + 1}`));
            }
            if (paginationButtons.length > 0) buttons.push(paginationButtons);
            buttons.push(...dateButtons);
            buttons.push([Markup.button.callback('↩️ Назад', 'admin_needs_all')]);

            const message = await ctx.reply(
                `📦 Выберите дату для объекта "${objectName}" (Страница ${pageNum + 1} из ${totalPages}):`,
                Markup.inlineKeyboard(buttons)
            );
            addMessageId(ctx, message.message_id);
        } catch (error) {
            console.error('Ошибка в showNeedsDatesForObject:', error);
            await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
        }
    }

    async function showAdminNeedDetails(ctx, needId) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        try {
            const allNeeds = await loadAllNeeds();
            const need = allNeeds[needId];

            if (!need) {
                await clearPreviousMessages(ctx, userId);
                return ctx.reply('Ошибка: заявка не найдена.');
            }

            await clearPreviousMessages(ctx, userId);

            const { escapeHtml } = require('../utils/htmlHelper');
            const TYPE_NAMES = {
                'materials': 'Материалы',
                'equipment': 'Оборудование',
                'special_equipment': 'Спецтехника',
                'protective_clothing': 'Спецодежда',
                'office_supplies': 'Канцтовары',
                'accommodation': 'Проживание',
                'services': 'Услуги',
                'accountable': 'Подотчетные'
            };
            const URGENCY_NAMES = {
                'urgent': { name: 'Срочно', emoji: '🔥' },
                'soon': { name: 'В ближайшее время', emoji: '⏳' },
                'planned': { name: 'Планово', emoji: '📅' }
            };
            const STATUS_NAMES = {
                'new': 'Новая',
                'in_progress': 'В обработке',
                'completed': 'Выполнена',
                'rejected': 'Отклонена'
            };

            const formattedDate = parseAndFormatDate(need.date);
            const dateTime = new Date(need.timestamp);
            const dateStr = dateTime.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeStr = dateTime.toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const typeName = TYPE_NAMES[need.type] || need.type;
            const urgencyInfo = URGENCY_NAMES[need.urgency] || { name: need.urgency, emoji: '' };
            const statusName = STATUS_NAMES[need.status] || need.status;
            const statusEmoji = statusName === 'Выполнена' ? '✅' : statusName === 'Новая' ? '🆕' : statusName === 'В обработке' ? '🔄' : statusName === 'Отклонена' ? '❌' : '';

            const users = await loadUsers();
            const needUser = users[need.userId] || {};
            
            // Функция для форматирования должности (сокращение)
            const formatPosition = (position) => {
                if (position === 'Производитель работ') return 'Произв. работ';
                return position || '';
            };
            
            const position = formatPosition(needUser.position || '');
            const organization = needUser.organization || '';
            const fullName = needUser.fullName || need.fullName || '';
            const needNumber = need.number || '';

            let needText = `<blockquote>Заявка на ${typeName.toLowerCase()}${needNumber ? ` №${needNumber}` : ''}
${need.objectName}
${dateStr} ${timeStr}

${position ? position : ''}
${organization ? organization : ''}
${fullName}

Наименование: ${need.name}
Срочность: ${urgencyInfo.emoji} ${urgencyInfo.name}
Статус: ${statusEmoji} ${statusName}</blockquote>`;

            const buttons = [
                [Markup.button.callback('✏️ Редактировать', `admin_edit_need_${needId}`)],
                [Markup.button.callback('📊 Изменить статус', `admin_change_need_status_${needId}`)],
                [Markup.button.callback('↩️ Назад', 'admin_needs_all')]
            ];

            const message = await ctx.reply(needText.trim(), {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard(buttons)
            });
            addMessageId(ctx, message.message_id);
        } catch (error) {
            console.error('Ошибка в showAdminNeedDetails:', error);
            await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
        }
    }

    async function showEditNeedMenu(ctx, needId) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        try {
            const allNeeds = await loadAllNeeds();
            const need = allNeeds[needId];

            if (!need) {
                return ctx.reply('Ошибка: заявка не найдена.');
            }

            await clearPreviousMessages(ctx, userId);

            const buttons = [
                [Markup.button.callback('📝 Наименование', `admin_edit_need_name_${needId}`)],
                [Markup.button.callback('⏰ Срочность', `admin_edit_need_urgency_${needId}`)],
                [Markup.button.callback('↩️ Назад', `admin_select_need_${needId}`)]
            ];

            const message = await ctx.reply('Что вы хотите изменить?', Markup.inlineKeyboard(buttons));
            addMessageId(ctx, message.message_id);
        } catch (error) {
            console.error('Ошибка в showEditNeedMenu:', error);
            await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
        }
    }

    async function showChangeStatusMenu(ctx, needId) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        try {
            await clearPreviousMessages(ctx, userId);

            const buttons = [
                [Markup.button.callback('🆕 Новая', `admin_set_need_status_${needId}_new`)],
                [Markup.button.callback('⏳ В обработке', `admin_set_need_status_${needId}_in_progress`)],
                [Markup.button.callback('✅ Выполнена', `admin_set_need_status_${needId}_completed`)],
                [Markup.button.callback('❌ Отклонена', `admin_set_need_status_${needId}_rejected`)],
                [Markup.button.callback('↩️ Назад', `admin_select_need_${needId}`)]
            ];

            const message = await ctx.reply('Выберите новый статус:', Markup.inlineKeyboard(buttons));
            addMessageId(ctx, message.message_id);
        } catch (error) {
            console.error('Ошибка в showChangeStatusMenu:', error);
            await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
        }
    }

    bot.action('admin_needs', showNeedsManagementMenu);
    bot.action('admin_needs_all', (ctx) => showAllNeedsByObjects(ctx, 0));
    bot.action(/admin_needs_all_page_(\d+)/, (ctx) => showAllNeedsByObjects(ctx, parseInt(ctx.match[1], 10)));
    // Регистрируем более специфичные паттерны ПЕРЕД общими, чтобы они перехватывали запросы первыми
    bot.action(/admin_needs_object_(\d+)_date_(\d+)_page_(\d+)/, (ctx) => showNeedsForObject(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10), parseInt(ctx.match[3], 10)));
    bot.action(/admin_needs_object_(\d+)_date_(\d+)/, (ctx) => showNeedsForObject(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10), 0));
    bot.action(/admin_needs_object_(\d+)_dates_page_(\d+)/, (ctx) => showNeedsDatesForObject(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10)));
    bot.action(/admin_needs_object_(\d+)/, (ctx) => showNeedsDatesForObject(ctx, parseInt(ctx.match[1], 10), 0));
    bot.action(/admin_select_need_(.+)/, (ctx) => showAdminNeedDetails(ctx, ctx.match[1]));
    bot.action(/admin_edit_need_(.+)/, (ctx) => showEditNeedMenu(ctx, ctx.match[1]));
    bot.action(/admin_change_need_status_(.+)/, (ctx) => showChangeStatusMenu(ctx, ctx.match[1]));

    bot.action(/admin_edit_need_name_(.+)/, async (ctx) => {
        const needId = ctx.match[1];
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        await clearPreviousMessages(ctx, userId);
        const state = ensureUserState(ctx);
        if (state) {
            state.step = 'admin_edit_need_name';
            state.adminEditingNeedId = needId;
        }
        const message = await ctx.reply('📝 Введите новое наименование:');
        addMessageId(ctx, message.message_id);
    });

    bot.action(/admin_edit_need_urgency_(.+)/, async (ctx) => {
        const needId = ctx.match[1];
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        await clearPreviousMessages(ctx, userId);
        const buttons = [
            [Markup.button.callback('🔥 Срочно', `admin_set_need_urgency_${needId}_urgent`)],
            [Markup.button.callback('⏳ В ближайшее время', `admin_set_need_urgency_${needId}_soon`)],
            [Markup.button.callback('📅 Планово', `admin_set_need_urgency_${needId}_planned`)],
            [Markup.button.callback('↩️ Назад', `admin_select_need_${needId}`)]
        ];
        const message = await ctx.reply('⏰ Выберите срочность:', Markup.inlineKeyboard(buttons));
        addMessageId(ctx, message.message_id);
    });

    bot.action(/admin_set_need_status_(.+)/, async (ctx) => {
        // Извлекаем needId и status, учитывая что needId может содержать подчеркивания
        // Статусы: new, in_progress, completed, rejected
        const callbackData = ctx.match[1];
        const statuses = ['in_progress', 'completed', 'rejected', 'new'];
        let needId = '';
        let status = '';
        
        // Ищем статус в конце строки (с учетом подчеркиваний)
        for (const stat of statuses) {
            if (callbackData.endsWith(`_${stat}`)) {
                status = stat;
                needId = callbackData.slice(0, -(stat.length + 1)); // Убираем "_статус"
                break;
            }
        }
        
        if (!status || !needId) {
            console.error('[NEED DEBUG] admin_set_need_status - Failed to parse:', callbackData);
            return ctx.reply('Ошибка: неверный формат данных.');
        }
        
        console.log('[NEED DEBUG] admin_set_need_status - needId:', needId, 'status:', status);
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        try {
            const allNeeds = await loadAllNeeds();
            const need = allNeeds[needId];
            if (!need) {
                return ctx.reply('Ошибка: заявка не найдена.');
            }

            const oldStatus = need.status;
            need.status = status;
            await saveNeed(need.userId, need);
            clearConfigCache();
            
            // Уведомляем автора заявки и ответственных пользователей об изменении статуса
            if (oldStatus !== status) {
                await notifyNeedAuthorStatusChange(ctx.telegram, need, oldStatus, status);
                await notifyResponsibleUsersStatusChange(ctx.telegram, need, oldStatus, status);
            }
            
            await clearPreviousMessages(ctx, userId);
            const message = await ctx.reply('✅ Статус обновлен.', Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Назад', `admin_select_need_${needId}`)]
            ]));
            addMessageId(ctx, message.message_id);
        } catch (error) {
            console.error('Ошибка обновления статуса:', error);
            await ctx.reply('Ошибка при обновлении статуса. Попробуйте позже.');
        }
    });

    bot.action(/admin_set_need_urgency_(.+)_(urgent|soon|planned)/, async (ctx) => {
        const needId = ctx.match[1];
        const urgency = ctx.match[2];
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        console.log('[NEED DEBUG] admin_set_need_urgency handler - needId:', needId);
        console.log('[NEED DEBUG] admin_set_need_urgency handler - urgency:', urgency);
        console.log('[NEED DEBUG] admin_set_need_urgency handler - userId:', userId);

        try {
            const allNeeds = await loadAllNeeds();
            console.log('[NEED DEBUG] admin_set_need_urgency handler - allNeeds keys:', Object.keys(allNeeds));
            console.log('[NEED DEBUG] admin_set_need_urgency handler - need exists:', !!allNeeds[needId]);
            
            const need = allNeeds[needId];
            if (!need) {
                console.log('[NEED DEBUG] admin_set_need_urgency handler - Need not found, available needIds:', Object.keys(allNeeds));
                return ctx.reply('Ошибка: заявка не найдена.');
            }

            need.urgency = urgency;
            await saveNeed(need.userId, need);
            clearConfigCache();
            await clearPreviousMessages(ctx, userId);
            const message = await ctx.reply('✅ Срочность обновлена.', Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Назад', `admin_select_need_${needId}`)]
            ]));
            addMessageId(ctx, message.message_id);
        } catch (error) {
            console.error('Ошибка обновления срочности:', error);
            await ctx.reply('Ошибка при обновлении срочности. Попробуйте позже.');
        }
    });

    // Назначение ответственных для потребностей
    async function showNeedsAssignMenu(ctx) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        try {
            await clearPreviousMessages(ctx, userId);
            const allObjects = await getAllObjects();
            if (allObjects.length === 0) {
                const message = await ctx.reply('Объектов нет.', Markup.inlineKeyboard([
                    [Markup.button.callback('↩️ Назад', 'admin_needs')]
                ]));
                addMessageId(ctx, message.message_id);
                return;
            }

            const state = ensureUserState(ctx);
            if (state) {
                state.adminNeedsObjectsList = allObjects.map(obj => obj.name);
            }

            const buttons = allObjects.map((obj, index) => [
                Markup.button.callback(obj.name, `admin_needs_assign_object_${index}`)
            ]);
            buttons.push([Markup.button.callback('↩️ Назад', 'admin_needs')]);

            const message = await ctx.reply(
                '👥 Назначение ответственных за потребности\n\nВыберите объект:',
                Markup.inlineKeyboard(buttons)
            );
            addMessageId(ctx, message.message_id);
        } catch (error) {
            console.error('Ошибка в showNeedsAssignMenu:', error);
            await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
        }
    }

    async function showNeedsAssignOrganizations(ctx, objectIndex) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        try {
            const objNames = ctx.state.userStates[userId].adminNeedsObjectsList;
            if (!objNames || !objNames[objectIndex]) {
                await ctx.reply('Объект не найден.');
                return;
            }
            const objName = objNames[objectIndex];
            ctx.state.userStates[userId].adminSelectedNeedObjName = objName;
            ctx.state.userStates[userId].adminSelectedNeedObjIndex = objectIndex;

            const organizations = await getOrganizationsByObject(objName);
            if (organizations.length === 0) {
                await ctx.reply(`Для объекта "${objName}" не найдено организаций.`);
                await showNeedsAssignMenu(ctx);
                return;
            }

            await clearPreviousMessages(ctx, userId);
            ctx.state.userStates[userId].adminNeedsOrgList = organizations;

            const buttons = organizations.map((orgName, orgIndex) => [
                Markup.button.callback(`✏️ ${orgName}`, `admin_needs_assign_org_${objectIndex}_${orgIndex}`)
            ]);
            buttons.push([Markup.button.callback('↩️ Назад', 'admin_needs_assign')]);

            const message = await ctx.reply(
                `👥 Назначение ответственных за потребности\n\nОбъект: **${objName}**\n\nВыберите организацию:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard(buttons).reply_markup
                }
            );
            addMessageId(ctx, message.message_id);
        } catch (error) {
            console.error('Ошибка в showNeedsAssignOrganizations:', error);
            await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
        }
    }

    async function showNeedsOrganizationUsers(ctx, objectIndex, orgIndex) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        try {
            const objNames = ctx.state.userStates[userId].adminNeedsObjectsList;
            const orgNames = ctx.state.userStates[userId].adminNeedsOrgList;

            if (!objNames || !objNames[objectIndex] || !orgNames || !orgNames[orgIndex]) {
                await ctx.reply('Ошибка: объект или организация не найдены.');
                return;
            }

            const objName = objNames[objectIndex];
            const orgName = orgNames[orgIndex];

            const allUsers = await loadUsers();
            const orgUsers = Object.entries(allUsers).filter(([_, user]) =>
                user.organization === orgName &&
                Array.isArray(user.selectedObjects) &&
                user.selectedObjects.includes(objName)
            );

            if (orgUsers.length === 0) {
                await ctx.reply(`Для организации "${orgName}" и объекта "${objName}" не найдено пользователей с этим объектом в личном кабинете.`);
                await showNeedsAssignOrganizations(ctx, objectIndex);
                return;
            }

            const currentNeedUsers = await getNeedUsers(orgName, objName);

            const stateKey = `objNeedSelectedUsers_${objectIndex}_${orgIndex}`;
            if (!ctx.state.userStates[userId][stateKey]) {
                ctx.state.userStates[userId][stateKey] = {};
                orgUsers.forEach(([uid, _], userIndex) => {
                    if (currentNeedUsers.includes(uid)) {
                        ctx.state.userStates[userId][stateKey][userIndex] = uid;
                    }
                });
            }

            await clearPreviousMessages(ctx, userId);

            const selectedUsers = ctx.state.userStates[userId][stateKey];
            const buttons = orgUsers.map(([uid, user], userIndex) => {
                const isSelected = selectedUsers[userIndex] === uid;
                const marker = isSelected ? '✅' : '☐';
                return [Markup.button.callback(
                    `${marker} ${user.fullName || uid}`,
                    `admin_needs_assign_user_toggle_${objectIndex}_${orgIndex}_${userIndex}`
                )];
            });
            buttons.push([Markup.button.callback('✅ Сохранить', `admin_needs_assign_users_save_${objectIndex}_${orgIndex}`)]);
            buttons.push([Markup.button.callback('↩️ Назад', `admin_needs_assign_object_${objectIndex}`)]);

            const selectedCount = Object.keys(selectedUsers).length;
            const message = await ctx.reply(
                `👥 Настройка ответственных за потребности\n\nОбъект: **${objName}**\nОрганизация: **${orgName}**\n\nВыберите пользователей (выбрано: ${selectedCount}):`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard(buttons).reply_markup
                }
            );
            addMessageId(ctx, message.message_id);
        } catch (error) {
            console.error('Ошибка в showNeedsOrganizationUsers:', error);
            await ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
        }
    }

    // Настройка ответственных для потребностей через объекты (аналогично отчетам)
    bot.action(/admin_obj_need_users_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objIndex = parseInt(ctx.match[1], 10);
        const objNames = ctx.state.userStates[userId].adminObjectsList;
        if (!objNames || !objNames[objIndex]) {
            await ctx.reply('Объект не найден.');
            return;
        }
        const objName = objNames[objIndex];
        ctx.state.userStates[userId].adminSelectedObjName = objName;
        ctx.state.userStates[userId].adminSelectedObjIndex = objIndex;
        
        await showObjectNeedOrganizationsList(ctx, objIndex);
    });
    
    async function showObjectNeedOrganizationsList(ctx, objIndex) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objNames = ctx.state.userStates[userId].adminObjectsList;
        if (!objNames || !objNames[objIndex]) {
            await ctx.reply('Объект не найден.');
            return;
        }
        const objName = objNames[objIndex];
        
        const organizations = await getOrganizationsByObject(objName);
        if (organizations.length === 0) {
            await ctx.reply(`Для объекта "${objName}" не найдено организаций.`);
            const objIndexBack = ctx.state.userStates[userId].adminSelectedObjIndex ?? 0;
            const obj = await getObject(objName);
            const usersWithObj = await getUsersByObject(objName);
            const reportsWithObj = await getReportsByObject(objName);
            await clearPreviousMessages(ctx, userId);
            const statusEmoji = obj.status === 'В работе' ? '🟢' : '❄️';
            const objText = `🏗 **${obj.name}**\n\n📱 ID группы: ${obj.telegramGroupId || 'Не указан'}\n📊 Статус: ${statusEmoji} ${obj.status || 'В работе'}\n👥 Используется пользователями: ${usersWithObj.length}\n📄 Отчетов: ${reportsWithObj.length}`;
            const buttons = [
                [Markup.button.callback('✏️ Редактировать', 'admin_obj_edit')],
                [Markup.button.callback('📋 Настройка отчетов', `admin_obj_report_users_${objIndexBack}`)],
                [Markup.button.callback('📦 Настройка потребностей', `admin_obj_need_users_${objIndexBack}`)],
                [Markup.button.callback('🗑 Удалить', 'admin_obj_delete')],
                [Markup.button.callback('↩️ Назад', 'admin_objects')]
            ];
            const message = await ctx.reply(objText, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard(buttons).reply_markup
            });
            ctx.state.userStates[userId].messageIds.push(message.message_id);
            return;
        }
        
        await clearPreviousMessages(ctx, userId);
        ctx.state.userStates[userId].adminNeedOrgList = organizations;
        
        const buttons = organizations.map((orgName, orgIndex) => [
            Markup.button.callback(`✏️ ${orgName}`, `admin_obj_org_need_users_${objIndex}_${orgIndex}`)
        ]);
        buttons.push([Markup.button.callback('↩️ Назад', `obj_${objIndex}`)]);
        
        const message = await ctx.reply(
            `📦 Настройка потребностей по объекту "${objName}"\n\nВыберите организацию:`,
            Markup.inlineKeyboard(buttons)
        );
        addMessageId(ctx, message.message_id);
    }
    
    bot.action(/admin_obj_org_need_users_(\d+)_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objIndex = parseInt(ctx.match[1], 10);
        const orgIndex = parseInt(ctx.match[2], 10);
        
        await showOrganizationUsersForObjectNeed(ctx, objIndex, orgIndex);
    });
    
    async function showOrganizationUsersForObjectNeed(ctx, objIndex, orgIndex) {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objNames = ctx.state.userStates[userId].adminObjectsList;
        const orgNames = ctx.state.userStates[userId].adminNeedOrgList;
        
        if (!objNames || !objNames[objIndex] || !orgNames || !orgNames[orgIndex]) {
            await ctx.reply('Ошибка: объект или организация не найдены.');
            return;
        }
        
        const objName = objNames[objIndex];
        const orgName = orgNames[orgIndex];
        
        const allUsers = await loadUsers();
        const orgUsers = Object.entries(allUsers).filter(([_, user]) => 
            user.organization === orgName && 
            Array.isArray(user.selectedObjects) && 
            user.selectedObjects.includes(objName)
        );
        
        if (orgUsers.length === 0) {
            await ctx.reply(`Для организации "${orgName}" и объекта "${objName}" не найдено пользователей с этим объектом в личном кабинете.`);
            await showObjectNeedOrganizationsList(ctx, objIndex);
            return;
        }
        
        const currentNeedUsers = await getNeedUsers(orgName, objName);
        
        const stateKey = `objNeedSelectedUsers_${objIndex}_${orgIndex}`;
        if (!ctx.state.userStates[userId][stateKey]) {
            ctx.state.userStates[userId][stateKey] = {};
            orgUsers.forEach(([uid, _], userIndex) => {
                if (currentNeedUsers.includes(uid)) {
                    ctx.state.userStates[userId][stateKey][userIndex] = uid;
                }
            });
        }
        
        await clearPreviousMessages(ctx, userId);
        
        const selectedUsers = ctx.state.userStates[userId][stateKey];
        const buttons = orgUsers.map(([uid, user], userIndex) => {
            const isSelected = selectedUsers[userIndex] === uid;
            const marker = isSelected ? '✅' : '☐';
            return [Markup.button.callback(
                `${marker} ${user.fullName || uid}`,
                `admin_obj_org_need_user_toggle_${objIndex}_${orgIndex}_${userIndex}`
            )];
        });
        buttons.push([Markup.button.callback('✅ Сохранить', `admin_obj_org_need_users_save_${objIndex}_${orgIndex}`)]);
        buttons.push([Markup.button.callback('↩️ Назад', `admin_obj_need_users_${objIndex}`)]);
        
        const selectedCount = Object.keys(selectedUsers).length;
        const message = await ctx.reply(
            `📦 Настройка пользователей для потребностей\n\nОбъект: **${objName}**\nОрганизация: **${orgName}**\n\nВыберите пользователей (выбрано: ${selectedCount}):`,
            {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard(buttons).reply_markup
            }
        );
        addMessageId(ctx, message.message_id);
    }
    
    bot.action(/admin_obj_org_need_user_toggle_(\d+)_(\d+)_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objIndex = parseInt(ctx.match[1], 10);
        const orgIndex = parseInt(ctx.match[2], 10);
        const userIndex = parseInt(ctx.match[3], 10);
        
        const stateKey = `objNeedSelectedUsers_${objIndex}_${orgIndex}`;
        if (!ctx.state.userStates[userId][stateKey]) {
            ctx.state.userStates[userId][stateKey] = {};
        }
        
        const objNames = ctx.state.userStates[userId].adminObjectsList;
        const orgNames = ctx.state.userStates[userId].adminNeedOrgList;
        
        if (!objNames || !objNames[objIndex] || !orgNames || !orgNames[orgIndex]) {
            await ctx.reply('Ошибка: объект или организация не найдены.');
            return;
        }
        
        const objName = objNames[objIndex];
        const orgName = orgNames[orgIndex];
        
        const allUsers = await loadUsers();
        const orgUsers = Object.entries(allUsers).filter(([_, user]) => 
            user.organization === orgName && 
            Array.isArray(user.selectedObjects) && 
            user.selectedObjects.includes(objName)
        );
        
        if (!orgUsers[userIndex]) {
            await ctx.reply('Пользователь не найден.');
            return;
        }
        
        const [uid, _] = orgUsers[userIndex];
        
        if (ctx.state.userStates[userId][stateKey][userIndex] === uid) {
            delete ctx.state.userStates[userId][stateKey][userIndex];
        } else {
            ctx.state.userStates[userId][stateKey][userIndex] = uid;
        }
        
        await showOrganizationUsersForObjectNeed(ctx, objIndex, orgIndex);
    });
    
    bot.action(/admin_obj_org_need_users_save_(\d+)_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;
        
        const objIndex = parseInt(ctx.match[1], 10);
        const orgIndex = parseInt(ctx.match[2], 10);
        
        const stateKey = `objNeedSelectedUsers_${objIndex}_${orgIndex}`;
        const selectedUsers = ctx.state.userStates[userId][stateKey] || {};
        
        const objNames = ctx.state.userStates[userId].adminObjectsList;
        const orgNames = ctx.state.userStates[userId].adminNeedOrgList;
        
        if (!objNames || !objNames[objIndex] || !orgNames || !orgNames[orgIndex]) {
            await ctx.reply('Ошибка: объект или организация не найдены.');
            return;
        }
        
        const objName = objNames[objIndex];
        const orgName = orgNames[orgIndex];
        
        const userIds = Object.values(selectedUsers).filter(uid => uid);
        
        await setNeedUsers(orgName, objName, userIds);
        clearConfigCache();
        
        delete ctx.state.userStates[userId][stateKey];
        
        await ctx.reply(`✅ Настройки сохранены для организации "${orgName}" и объекта "${objName}". Выбрано пользователей: ${userIds.length}`);
        
        await showObjectNeedOrganizationsList(ctx, objIndex);
    });

    bot.action('admin_needs_assign', showNeedsAssignMenu);
    bot.action(/admin_needs_assign_object_(\d+)/, (ctx) => showNeedsAssignOrganizations(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/admin_needs_assign_org_(\d+)_(\d+)/, (ctx) => showNeedsOrganizationUsers(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10)));

    bot.action(/admin_needs_assign_user_toggle_(\d+)_(\d+)_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        const objectIndex = parseInt(ctx.match[1], 10);
        const orgIndex = parseInt(ctx.match[2], 10);
        const userIndex = parseInt(ctx.match[3], 10);

        const stateKey = `objNeedSelectedUsers_${objectIndex}_${orgIndex}`;
        if (!ctx.state.userStates[userId][stateKey]) {
            ctx.state.userStates[userId][stateKey] = {};
        }

        const objNames = ctx.state.userStates[userId].adminNeedsObjectsList;
        const orgNames = ctx.state.userStates[userId].adminNeedsOrgList;

        if (!objNames || !objNames[objectIndex] || !orgNames || !orgNames[orgIndex]) {
            await ctx.reply('Ошибка: объект или организация не найдены.');
            return;
        }

        const objName = objNames[objectIndex];
        const orgName = orgNames[orgIndex];

        const allUsers = await loadUsers();
        const orgUsers = Object.entries(allUsers).filter(([_, user]) =>
            user.organization === orgName &&
            Array.isArray(user.selectedObjects) &&
            user.selectedObjects.includes(objName)
        );

        if (!orgUsers[userIndex]) {
            await ctx.reply('Пользователь не найден.');
            return;
        }

        const [uid, _] = orgUsers[userIndex];

        if (ctx.state.userStates[userId][stateKey][userIndex] === uid) {
            delete ctx.state.userStates[userId][stateKey][userIndex];
        } else {
            ctx.state.userStates[userId][stateKey][userIndex] = uid;
        }

        await showNeedsOrganizationUsers(ctx, objectIndex, orgIndex);
    });

    bot.action(/admin_needs_assign_users_save_(\d+)_(\d+)/, async (ctx) => {
        const userId = ctx.from.id.toString();
        if (userId !== ADMIN_ID) return;

        const objectIndex = parseInt(ctx.match[1], 10);
        const orgIndex = parseInt(ctx.match[2], 10);

        const stateKey = `objNeedSelectedUsers_${objectIndex}_${orgIndex}`;
        const selectedUsers = ctx.state.userStates[userId][stateKey] || {};

        const objNames = ctx.state.userStates[userId].adminNeedsObjectsList;
        const orgNames = ctx.state.userStates[userId].adminNeedsOrgList;

        if (!objNames || !objNames[objectIndex] || !orgNames || !orgNames[orgIndex]) {
            await ctx.reply('Ошибка: объект или организация не найдены.');
            return;
        }

        const objName = objNames[objectIndex];
        const orgName = orgNames[orgIndex];

        const userIds = Object.values(selectedUsers).filter(uid => uid);

        await setNeedUsers(orgName, objName, userIds);
        clearConfigCache();

        delete ctx.state.userStates[userId][stateKey];

        await ctx.reply(`✅ Настройки сохранены для организации "${orgName}" и объекта "${objName}". Выбрано пользователей: ${userIds.length}`);

        await showNeedsAssignOrganizations(ctx, objectIndex);
    });
    
    // Экспортируем функции для использования в других модулях
    exportedFunctions.showOrganizationsList = showOrganizationsList;
    exportedFunctions.showObjectsList = showObjectsList;
    exportedFunctions.showUsersList = showUsersList;
    exportedFunctions.showUserDetails = showUserDetails;
};

// Экспортируем функции для использования в других модулях
Object.assign(module.exports, {
    showAnnouncementsMenu,
    showAnnouncementPreview,
    sendAnnouncement,
    showOrganizationsList: (ctx) => {
        if (exportedFunctions.showOrganizationsList) {
            return exportedFunctions.showOrganizationsList(ctx);
        }
    },
    showObjectsList: (ctx) => {
        if (exportedFunctions.showObjectsList) {
            return exportedFunctions.showObjectsList(ctx);
        }
    },
    showUsersList: (ctx, filters, page) => {
        if (exportedFunctions.showUsersList) {
            return exportedFunctions.showUsersList(ctx, filters, page);
        }
    },
    showUserDetails: (ctx, targetUserId, returnPage) => {
        if (exportedFunctions.showUserDetails) {
            return exportedFunctions.showUserDetails(ctx, targetUserId, returnPage);
        }
    }
});