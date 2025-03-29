require('dotenv').config();

const OBJECTS_LIST_CYRILLIC = [
    'Кольцевой МНПП, 132км',
    'Ярославль-Москва, 201-204км',
    'Ярославль-Кириши1, 115-132км',
    'Никулино-Пенза, 881-886км',
    'Ростовка-Никольское, 595-608км',
    'Журавлинская-Никулино, 706-745км'
];

const BASE_POSITIONS_LIST = ['Производитель работ', 'Делопроизводитель', 'Инженер по комплектации', 'Инженер пто'];
const ORGANIZATIONS_LIST = ['ООО "РСХ"', 'ООО "Строительные Системы"', 'ООО "РемонтСервис"'];
const GENERAL_GROUP_CHAT_ID = '-1002266023014';

const OBJECT_GROUPS = {
    'Кольцевой МНПП, 132км': '-1002394790037',
    'Ярославль-Москва, 201-204км': '-1002318741372',
    'Ярославль-Кириши1, 115-132км': '-1002153878927',
    'Никулино-Пенза, 881-886км': '-1002597582709',
    'Ростовка-Никольское, 595-608км': '-1002627066168',
    'Журавлинская-Никулино, 706-745км': '-1002506378789'
};

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    ADMIN_ID: process.env.ADMIN_ID || 'YOUR_ADMIN_ID',
    DATABASE_URL: process.env.DATABASE_URL,
    PORT: process.env.PORT || 3000,
    OBJECTS_LIST_CYRILLIC,
    BASE_POSITIONS_LIST,
    ORGANIZATIONS_LIST,
    GENERAL_GROUP_CHAT_ID,
    OBJECT_GROUPS
};