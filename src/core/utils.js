/*****************
    utils.js
    スニャイヴ
    2026/05/05
*****************/

module.exports = {
    isChannnel : isChannnel,
    isMessage : isMessage,
    isInteraction : isInteraction,
    isVoiceState : isVoiceState,

    isBotMention : isBotMention,
    isBotName : isBotName,
    
    replace : replace,

    getSystemId : getSystemId,
    getArgValue : getArgValue,

    getUserObj : getUserObj,
    getUserId : getUserId,
    getUserName : getUserName,

    getChannelObj : getChannelObj,
    getChannelId : getChannelId,
    getChannelName : getChannelName,

    getGuildObj : getGuildObj,
    getGuildId : getGuildId,
    getGuildName : getGuildName,

    getDate : getDate,
    getTime : getTime,
    logTime : logTime,

    sendDefer : sendDefer,
    sendModal : sendModal,
    sendGUI : sendGUI
}

const {BaseChannel, Message, BaseInteraction, VoiceState,  MessageReaction, MessageFlags, EmbedBuilder} = require('discord.js');

// チャンネルオブジェクトかの確認
function isChannnel(trigger){
    return trigger instanceof BaseChannel;
}

// メッセージオブジェクトかの確認
function isMessage(trigger){
    return trigger instanceof Message;
}

// インタラクションオブジェクトかの確認
function isInteraction(trigger){
    return trigger instanceof BaseInteraction;
}

// ボイスステートオブジェクトかの確認
function isVoiceState(trigger){
    return trigger instanceof VoiceState;
}

// リアクションオブジェクトかの確認
function isReaction(trigger){
    return trigger instanceof MessageReaction;
}

// Botのメンションを含むか確認
function isBotMention(trigger, map){
    const bot_id = process.env.BOT_ID;
    if(!bot_id) throw new Error(`utils.js => isBotMention() \n not define .env : BOT_ID`);

    if(isMessage(trigger)) return trigger.mentions?.users?.has(bot_id) ?? false;
    if(isInteraction(trigger)) return trigger.message?.mentions?.users?.has(bot_id) ?? false;

    throw new Error("utils.js => isBotMention() \n trigger is not message or interaction");
}

// Botの名前を含むか確認
function isBotName(trigger, map){
    const bot_keywords = process.env.BOT_KEYWORDS;
    const bot_suffixes = process.env.BOT_SUFFIXES;
    if(!bot_keywords) throw new Error(`utils.js => isBotName() \n not define .env : BOT_KEYWORDS`);
    if(!bot_suffixes) throw new Error(`utils.js => isBotName() \n not define .env : BOT_SUFFIXES`);

    const bot_regex = new RegExp(`(?:${bot_keywords})(?:${bot_suffixes})`, "i");
    if(isMessage(trigger)) return bot_regex.test(trigger.content ?? null);
    if(isInteraction(trigger)) return bot_regex.test(trigger.message?.content ?? null);

    throw new Error("utils.js => isBotName() \n trigger is not message or interaction");
}

// 文字列置換
function replace(string, replacement){
    if(!string) return null;
    if(typeof string != "string") throw new Error("utils.js => replace() \n argment is not string");;
    return string.replace(/{{__.*?__}}/g, match => replacement[match]);
}

// システムIDの取得
function getSystemId(trigger){
    if(isMessage(trigger) || isVoiceState(trigger) || isReaction(trigger)) return trigger.system_id ?? null;
    if(isInteraction(trigger)) return trigger.commandName ? `${trigger.commandName}${trigger.options.getSubcommand()}` : trigger.values?.[0] ?? trigger.customId ?? null;

    throw new Error("utils.js => getSystemId() \n trigger is not message, interaction, voicestate or reaction");
}

// 引数の取得
function getArgValue(trigger, arg){
    if(isMessage(trigger)) return trigger.args?.[arg] ?? null;
    if(isInteraction(trigger)) return trigger.options?.get(`${arg}`)?.value ?? trigger.fields?.fields?.get(`${arg}`)?.value ?? null;

    throw new Error("utils.js => getArgValue() \n trigger is not message or interaction");
}

// ユーザーオブジェクトの取得
function getUserObj(trigger){
    if(isMessage(trigger)) return trigger.author;
    if(isInteraction(trigger)) return trigger.user;

    throw new Error("utils.js => getUserObj() \n trigger is not message or interaction");
}

// ユーザーIDの取得
function getUserId(trigger){
    if(isMessage(trigger)) return trigger.author.id;
    if(isInteraction(trigger)) return trigger.user.id;

    throw new Error("utils.js => getUserId() \n trigger is not message or interaction");
}

// ユーザー名の取得
function getUserName(trigger){
    if(isMessage(trigger)) return trigger.author.displayName ?? trigger.author.username;
    if(isInteraction(trigger)) return trigger.user.displayName ?? trigger.user.username;

    throw new Error("utils.js => getUserName() \n trigger is not message or interaction");
}

// チェンネルオブジェクトの取得
function getChannelObj(trigger){
    if(isChannnel(trigger)) return trigger;
    if(isMessage(trigger)) return trigger.channel;
    if(isInteraction(trigger)) return trigger.channel;
    if(isVoiceState(trigger)) return trigger.channel;

    throw new Error("utils.js => getGuildObj() \n trigger is not channel, message, interaction or voicestate");
}

// チャンネルIDの取得
function getChannelId(trigger){
    if(isChannnel(trigger)) return trigger.id;
    if(isMessage(trigger)) return trigger.channel.id;
    if(isInteraction(trigger))return trigger.channel.id;
    if(isVoiceState(trigger)) return trigger.channel.id;

    throw new Error("utils.js => getUserId() \n trigger is not channel, message, interaction or voicestate");
}

// チャンネル名の取得
function getChannelName(trigger){
    if(isChannnel(trigger)) return trigger.name;
    if(isMessage(trigger)) return trigger.channel.name;
    if(isInteraction(trigger)) return trigger.channel.name;
    if(isVoiceState(trigger)) return trigger.channel.name;

    throw new Error("utils.js => getGuildName() \n trigger is not channel, message, interaction or voicestate");
}

// ギルドオブジェクトの取得
function getGuildObj(trigger){
    if(isChannnel(trigger)) return trigger.guild;
    if(isMessage(trigger)) return trigger.guild;
    if(isInteraction(trigger)) return trigger.guild;
    if(isVoiceState(trigger)) return trigger.guild;

    throw new Error("utils.js => getGuildObj() \n trigger is not channel, message, interaction or voicestate");
}

// ギルドIDの取得
function getGuildId(trigger){
    if(isChannnel(trigger)) return trigger.guild.id;
    if(isMessage(trigger)) return trigger.guild.id;
    if(isInteraction(trigger))return trigger.guild.id;
    if(isVoiceState(trigger)) return trigger.guild.id;

    throw new Error("utils.js => getUserId() \n trigger is not channel, message, interaction or voicestate");
}

// ギルド名の取得
function getGuildName(trigger){
    if(isChannnel(trigger)) return trigger.guild.name;
    if(isMessage(trigger)) return trigger.guild.name;
    if(isInteraction(trigger)) return trigger.guild.name;
    if(isVoiceState(trigger)) return trigger.guild.name;

    throw new Error("utils.js => getGuildName() \n trigger is not channel, message, interaction or voicestate");
}

// 作成日の取得
function getDate(trigger){
    const days = ["日", "月", "火", "水", "木", "金", "土"];

    if(isMessage(trigger)){
        const time = trigger.createdAt;
        const year = time.getFullYear();
        const month = String(time.getMonth()+1).padStart(2, "0");
        const date =  String(time.getDate()).padStart(2, "0");
        const day = days[time.getDay()];
        return {year : year, month : month, date : date, day : day};
    }

    if(isInteraction(trigger)){
        const time = trigger.createdAt;
        const year = time.getFullYear();
        const month = String(time.getMonth()+1).padStart(2, "0");
        const date =  String(time.getDate()).padStart(2, "0");
        const day = days[time.getDay()];
        return {year : year, month : month, date : date, day : day};
    }

    throw new Error("utils.js => getCreatedAt() \n trigger is not message or interaction");
}

// 作成時間の取得
function getTime(trigger){
    if(isMessage(trigger)){
        const time = trigger.createdAt;
        const hours = String(time.getHours()).padStart(2, "0");
        const minutes = String(time.getMinutes()).padStart(2, "0");
        const seconds = String(time.getSeconds()).padStart(2, "0");
        const milliseconds = String(time.getMilliseconds()).padStart(3, "0");
        return {hours : hours, minutes : minutes, seconds : seconds, milliseconds : milliseconds};
    }

    if(isInteraction(trigger)){
        const time = trigger.createdAt;
        const hours = String(time.getHours()).padStart(2, "0");
        const minutes = String(time.getMinutes()).padStart(2, "0");
        const seconds = String(time.getSeconds()).padStart(2, "0");
        const milliseconds = String(time.getMilliseconds()).padStart(3, "0");
        return {hours : hours, minutes : minutes, seconds : seconds, milliseconds : milliseconds};
    }

    throw new Error("utils.js => getCreatedAt() \n trigger is not message or interaction");
}

// 時間のログ出力
function logTime(trigger){
    const date = getDate(trigger);
    const time = getTime(trigger);
    console.log(`### ${date.year}/${date.month}/${date.date}(${date.day}) ${time.hours}:${time.minutes}:${time.seconds}.${time.milliseconds} ###`);
    return;
}

// 延期の送信
async function sendDefer(interaction){
    try{
        if(!isInteraction(interaction)) throw new Error("utils.js => sendDefer() \n argment is not interaction");
        if(interaction.deferred || interaction.replied) return;

        if(interaction.isMessageComponent() && interaction.message?.flags?.has(MessageFlags.Ephemeral)){
            await interaction.deferUpdate();
            return;
        }

        if(interaction.isModalSubmit() && interaction.message?.flags?.has(MessageFlags.Ephemeral)){
            await interaction.deferUpdate();
            return;
        }

        await interaction.deferReply({flags : MessageFlags.Ephemeral});
        
        return;
    }catch(e){
        throw new Error(`utils.js => sendDefer() \n ${e}`);
    }
}

// モーダルの送信
async function sendModal(interaction, gui){
    try{
        if(!isInteraction(interaction)) throw new Error("utils.js => sendModal() \n argment is not interaction");
        await interaction.showModal(gui);
        return;
    }catch(e){
        throw new Error(`utils.js => sendModal() \n ${e}`);
    }
}

// GUIの送信
async function sendGUI(trigger, gui){
    try{
        if(isChannnel(trigger)) return await trigger.send(gui);
        if(isMessage(trigger)) return (trigger.author.id != trigger.client.user.id) ? await trigger.reply(gui) : await trigger.edit(gui);
        if(!isInteraction(trigger)) throw new Error("utils.js => sendGUI() \n trigger is not channel, message or interaction");

        if(trigger.deferred || trigger.replied){
            await trigger.editReply(gui);
            return;
        }

        if(trigger.isMessageComponent() && trigger.message?.flags?.has(MessageFlags.Ephemeral)){
            await trigger.update(gui);
            return;
        }

        await trigger.reply(gui);

        return;
    }catch(e){
        throw new Error(`utils.js => sendGUI() \n ${e}`);
    }
}