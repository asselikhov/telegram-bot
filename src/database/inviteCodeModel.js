const { connectMongo } = require('../config/mongoConfig');
const { v4: uuidv4 } = require('uuid');

let db;

async function getDb() {
    if (!db) {
        db = await connectMongo();
    }
    return db;
}

async function generateInviteCode(userId, organization) {
    const codesCollection = (await getDb()).collection('invite_codes');
    const code = uuidv4().slice(0, 8);
    await codesCollection.insertOne({
        code,
        organization,
        createdBy: userId,
        isUsed: false,
        createdAt: new Date()
    });
    return code;
}

async function validateInviteCode(code) {
    const codesCollection = (await getDb()).collection('invite_codes');
    const invite = await codesCollection.findOne({ code });
    if (!invite || invite.isUsed) return null;
    return { organization: invite.organization, createdBy: invite.createdBy };
}

async function markInviteCodeAsUsed(code, userId) {
    const codesCollection = (await getDb()).collection('invite_codes');
    const result = await codesCollection.findOneAndUpdate(
        { code },
        { $set: { isUsed: true, usedBy: userId, usedAt: new Date() } },
        { returnDocument: 'after' }
    );
    return result.value;
}

async function getAllInviteCodes() {
    const codesCollection = (await getDb()).collection('invite_codes');
    const codes = await codesCollection.find({}).sort({ createdAt: -1 }).toArray();
    return codes.map(row => ({
        code: row.code,
        organization: row.organization,
        isUsed: row.isUsed,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        usedAt: row.usedAt
    }));
}

async function loadInviteCode(userId) {
    const codesCollection = (await getDb()).collection('invite_codes');
    const invite = await codesCollection.findOne({ usedBy: userId }, { sort: { createdAt: -1 } });
    return invite ? {
        code: invite.code,
        organization: invite.organization,
        createdBy: invite.createdBy,
        usedBy: invite.usedBy,
        usedAt: invite.usedAt
    } : null;
}

module.exports = { generateInviteCode, validateInviteCode, markInviteCodeAsUsed, getAllInviteCodes, loadInviteCode };