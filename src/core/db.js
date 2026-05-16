/*****************
    db.js
    スニャイヴ
    2026/05/05
*****************/

module.exports = {
    getUserInfo : getUserInfo,
    setUserInfo : setUserInfo,
    getGuildInfo : getGuildInfo,
    setGuildInfo : setGuildInfo,
}

const Keyv = require('keyv');
const user = new Keyv('sqlite://db.sqlite', {table : 'user'});
const guild = new Keyv('sqlite://db.sqlite', {table : 'guild'});

user.on("error", e => console.error("db.js => user.on() \n", e));
guild.on("error", e => console.error("db.js => guild.on() \n", e));

//ユーザ情報を取得する
async function getUserInfo(id){
    return await user.get(id) ?? {};
}

//ユーザ情報を保存する
async function setUserInfo(id, info){
    try{
        await user.set(id, info);
        return;
    }catch(e){
        throw new Error(`db.js => setUserInfo() \n ${e}`);
    }
}

//サーバ情報を取得する
async function getGuildInfo(id){
    return await guild.get(id) ?? {};
}

//サーバ情報を保存する
async function setGuildInfo(id, info){
    try{
        await guild.set(id, info);
        return;
    }catch(e){
        throw new Error(`db.js => setGuildInfo() \n ${e}`);
    }
}