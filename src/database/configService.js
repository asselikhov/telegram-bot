const NodeCache = require('node-cache');
const { getAllOrganizations } = require('./organizationModel');
const { getAllPositions } = require('./positionModel');
const { getAllObjects } = require('./objectModel');
const { getOrganizationObjects: getOrgObjects, getAllOrganizationObjects } = require('./organizationObjectModel');
const { getNotificationSettings: getNotifSettings, getAllNotificationSettings: getAllNotifSettings } = require('./notificationSettingsModel');
const { getReportUsers: getReportUsersModel, getAllReportUsers: getAllReportUsersModel } = require('./objectReportUsersModel');
const { getNeedUsers: getNeedUsersModel, getAllNeedUsers: getAllNeedUsersModel } = require('./objectNeedUsersModel');

// Создаем кэш с TTL 5 минут (300 секунд)
const configCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const CACHE_KEYS = {
    ORGANIZATIONS: 'organizations',
    POSITIONS: 'positions',
    OBJECTS: 'objects',
    ORGANIZATION_OBJECTS: 'organization_objects',
    OBJECT_GROUPS: 'object_groups',
    GENERAL_GROUP_CHAT_IDS: 'general_group_chat_ids',
    NOTIFICATION_SETTINGS: 'notification_settings',
    REPORT_USERS: 'report_users',
    NEED_USERS: 'need_users'
};

/**
 * Очищает весь кэш конфигурации
 */
function clearConfigCache() {
    configCache.flushAll();
}

/**
 * Получить все организации
 */
async function getOrganizations() {
    const cached = configCache.get(CACHE_KEYS.ORGANIZATIONS);
    if (cached) {
        return cached;
    }
    
    const organizations = await getAllOrganizations();
    configCache.set(CACHE_KEYS.ORGANIZATIONS, organizations);
    return organizations;
}

/**
 * Получить должности организации
 * @param {string} organization - Название организации
 */
async function getPositions(organization) {
    if (!organization) {
        return [];
    }
    const cacheKey = `${CACHE_KEYS.POSITIONS}_${organization}`;
    const cached = configCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    
    const positions = await getAllPositions(organization);
    configCache.set(cacheKey, positions);
    return positions;
}

/**
 * Получить все объекты
 */
async function getObjects() {
    const cached = configCache.get(CACHE_KEYS.OBJECTS);
    if (cached) {
        return cached;
    }
    
    const objects = await getAllObjects();
    configCache.set(CACHE_KEYS.OBJECTS, objects);
    return objects;
}

/**
 * Получить объекты организации
 * @param {string} orgName - Название организации
 */
async function getOrganizationObjects(orgName) {
    const cacheKey = `${CACHE_KEYS.ORGANIZATION_OBJECTS}_${orgName}`;
    const cached = configCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    
    const objects = await getOrgObjects(orgName);
    configCache.set(cacheKey, objects);
    return objects;
}

/**
 * Получить все связи организация-объекты (для обратной совместимости)
 * Возвращает объект вида { "Организация": ["Объект1", "Объект2"] }
 */
async function getAllOrganizationObjectsMap() {
    const cached = configCache.get(CACHE_KEYS.ORGANIZATION_OBJECTS);
    if (cached) {
        return cached;
    }
    
    const allLinks = await getAllOrganizationObjects();
    configCache.set(CACHE_KEYS.ORGANIZATION_OBJECTS, allLinks);
    return allLinks;
}

/**
 * Получить привязку объектов к Telegram группам
 * Возвращает объект вида { "Объект": "chatId" }
 */
async function getObjectGroups() {
    const cached = configCache.get(CACHE_KEYS.OBJECT_GROUPS);
    if (cached) {
        return cached;
    }
    
    const objects = await getObjects();
    const groupsMap = {};
    objects.forEach(obj => {
        if (obj.telegramGroupId) {
            groupsMap[obj.name] = obj.telegramGroupId;
        }
    });
    
    configCache.set(CACHE_KEYS.OBJECT_GROUPS, groupsMap);
    return groupsMap;
}

/**
 * Получить групповые чаты организаций и источники отчетов
 * Возвращает объект вида { "Организация": { chatId: "...", reportSources: [...] } }
 */
async function getGeneralGroupChatIds() {
    const cached = configCache.get(CACHE_KEYS.GENERAL_GROUP_CHAT_IDS);
    if (cached) {
        return cached;
    }
    
    const organizations = await getOrganizations();
    const chatIdsMap = {};
    organizations.forEach(org => {
        chatIdsMap[org.name] = {
            chatId: org.chatId || null,
            reportSources: org.reportSources || []
        };
    });
    
    configCache.set(CACHE_KEYS.GENERAL_GROUP_CHAT_IDS, chatIdsMap);
    return chatIdsMap;
}

/**
 * Получить настройки уведомлений по типу
 */
async function getNotificationSettings(type = 'reports') {
    const cacheKey = `${CACHE_KEYS.NOTIFICATION_SETTINGS}_${type}`;
    const cached = configCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    
    const settings = await getNotifSettings(type);
    configCache.set(cacheKey, settings);
    return settings;
}

/**
 * Получить все настройки уведомлений
 */
async function getAllNotificationSettings() {
    const cacheKey = `${CACHE_KEYS.NOTIFICATION_SETTINGS}_all`;
    const cached = configCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    
    const allSettings = await getAllNotifSettings();
    configCache.set(cacheKey, allSettings);
    return allSettings;
}

/**
 * Получить список пользователей, которые должны подавать отчеты для пары организация+объект
 * @param {string} organizationName - Название организации
 * @param {string} objectName - Название объекта
 * @returns {Promise<string[]>} - Массив telegramId пользователей
 */
async function getReportUsers(organizationName, objectName) {
    const cacheKey = `${CACHE_KEYS.REPORT_USERS}_${organizationName}_${objectName}`;
    const cached = configCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    
    const userIds = await getReportUsersModel(organizationName, objectName);
    configCache.set(cacheKey, userIds);
    return userIds;
}

/**
 * Получить все настройки пользователей для отчетов в виде map
 * @returns {Promise<Object>} - Объект вида { "organizationName_objectName": [userIds] }
 */
async function getAllReportUsersMap() {
    const cacheKey = `${CACHE_KEYS.REPORT_USERS}_all`;
    const cached = configCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    
    const allSettings = await getAllReportUsersModel();
    const map = {};
    allSettings.forEach(setting => {
        const key = `${setting.organizationName}_${setting.objectName}`;
        map[key] = setting.userIds || [];
    });
    
    configCache.set(cacheKey, map);
    return map;
}

/**
 * Получить список пользователей, которые отвечают за потребности для пары организация+объект
 * @param {string} organizationName - Название организации
 * @param {string} objectName - Название объекта
 * @returns {Promise<string[]>} - Массив telegramId пользователей
 */
async function getNeedUsers(organizationName, objectName) {
    const cacheKey = `${CACHE_KEYS.NEED_USERS}_${organizationName}_${objectName}`;
    const cached = configCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    
    const userIds = await getNeedUsersModel(organizationName, objectName);
    configCache.set(cacheKey, userIds);
    return userIds;
}

/**
 * Получить все настройки пользователей для потребностей в виде map
 * @returns {Promise<Object>} - Объект вида { "organizationName_objectName": [userIds] }
 */
async function getAllNeedUsersMap() {
    const cacheKey = `${CACHE_KEYS.NEED_USERS}_all`;
    const cached = configCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    
    const allSettings = await getAllNeedUsersModel();
    const map = {};
    allSettings.forEach(setting => {
        const key = `${setting.organizationName}_${setting.objectName}`;
        map[key] = setting.userIds || [];
    });
    
    configCache.set(cacheKey, map);
    return map;
}

module.exports = {
    getOrganizations,
    getPositions,
    getObjects,
    getOrganizationObjects,
    getAllOrganizationObjectsMap,
    getObjectGroups,
    getGeneralGroupChatIds,
    getNotificationSettings,
    getAllNotificationSettings,
    getReportUsers,
    getAllReportUsersMap,
    getNeedUsers,
    getAllNeedUsersMap,
    clearConfigCache
};

