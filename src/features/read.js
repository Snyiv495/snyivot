/*****************
    read.js
    スニャイヴ
    2026/05/16
*****************/

module.exports = {
    exe : execute,
    autoComplete : autoComplete,
    voiceState : voiceState
}

const {ChannelType, PermissionFlagsBits} = require('discord.js');
const {createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus, StreamType} = require('@discordjs/voice');
const {Readable} = require("stream");

const db = require('../core/db');
const gui = require('../core/gui');
const utils = require('../core/utils');
const vc = require('../core/vc');
const vv = require('../integrations/voicevox');

const MENU_MAX = 25;

//テキスト整形
function formatText(message, map){
    try{
        //置換
        let text = message.cleanContent;
        text = text.replace(/(https?|ftp)(:\/\/[\w\/:%#\$&\?\(\)~\.=\+\-]+)/g, "URL省略");  //URL
        text = text.replace(/```([\s\S]+?)```/g, "");                                       //コートブロック
        text = text.replace(/~~([\s\S]+?)~~/g, "");                                         //打消し線
        text = text.replace(/\|\|([\s\S]+?)\|\|/g, "、");                                   //スポイラー
        text = text.replace(/:([\s\S]+?):/g, "$1");                                         //絵文字
        text = text.replace(/www+/g, "www");                                                //芝
        text = text.replace(/～/g, "ー");                                                   //チルダ
        text = text.trim();

        //文字数制限
        for(const element of map.get("read_property_json")){
            if(element.id === "read_text"){
                const max = element.max;
                const omit = element.omit;
                if(text.length > max+omit.length) text = `${text.substring(0, max)}${omit}`;
                return text;
            }
        }

    }catch(e){
        throw new Error(`read.js => formatText() \n ${e}`)
    };

    throw new Error(`read.js => formatText() \n not define system id : ${utils.getSystemId(message)}`)
}

//テキスト読み上げ
async function readText(message, map){
    try{
        //再生プレイヤーの取得
        const channel_id = utils.getChannelId(message);
        const read_channel = map.get(`read_channel_${channel_id}`);
        const player = map.get(`read_subscribe_${read_channel}`)?.player;
        if(!player) return;

        //情報の取得
        const user_id = utils.getUserId(message);
        const guild_id = utils.getGuildId(message);
        const user_info = await db.getUserInfo(user_id);
        const guild_info = await db.getGuildInfo(guild_id);
        let text = formatText(message, map);

        //チェーン管理
        const vv_chain = map.get(`vv_chain_${guild_id}`) ?? Promise.resolve();
        const vv_chain_next = vv_chain.then(async () => {

            let read_text_property = null;
            let vv_property = null;
            for(const element of map.get("read_property_json")){
                if(element.id === "read_text"){
                    read_text_property = element;
                    break;
                }
            }
            for(const element of map.get("read_property_json")){
                if(element.id === "VOICEVOX"){
                    vv_property = element;
                    break;
                }
            }
            if(!read_text_property) throw new Error(`read.js => readText() \n not define property id : ${utils.getSystemId(message)}`);
            if(!vv_property) throw new Error(`read.js => readText() \n not define property id : VOICEVOX`);

            //ユーザー名を結合
            const timestamp = message.createdTimestamp;
            const read_pre = map.get(`read_pre_${channel_id}`);
            const read_name = (!read_pre || read_pre.user_id !== user_id || timestamp-(read_pre.timestamp ?? 0) > read_text_property.split_time);
            if(read_name) text = `${user_info.username ?? utils.getUserName(message)}${user_info.honorific ?? read_text_property.honorific}${text}`;

            //辞書の置換
            if(map.get("vv_dictionary_id") !== guild_id){
                await vv.postImportUserDict(guild_info.vv_dict ?? {});
                map.set("vv_dictionary_id", guild_id);
            }

            //パラメータの置換
            if(guild_info.read_override){
                user_info.vv_id = null;
                user_info.vv_pitch = null;
                user_info.vv_intonation = null;
            }

            //クエリ作成
            const query = await vv.postAudioQuery(text, user_info.vv_id ?? guild_info.vv_id ?? vv_property.style_id);
            query.data.pitchScale = user_info.vv_pitch ?? guild_info.vv_pitch ?? vv_property.pitch;
            query.data.intonationScale = user_info.vv_intonation ?? guild_info.vv_intonation ?? vv_property.intonation;
            query.data.speedScale = guild_info.vv_speed ?? vv_property.speed;
            query.data.volumeScale = guild_info.vv_volume ?? vv_property.volume;

            //音声合成
            const wav = (await vv.postSynthesis(query, user_info.vv_id ?? guild_info.vv_id ?? vv_property.style_id))?.data ?? null;
            if(!wav) return;

            //ストリーム作成
            const stream = new Readable();
            stream.push(wav);
            stream.push(null);

            //再生
            player.play(createAudioResource(stream, {inputType: StreamType.Arbitrary}));
            await entersState(player, AudioPlayerStatus.Idle, 30000);

            //ログの保存
            map.set(`read_pre_${channel_id}`,
                {
                    user_id: user_id,
                    timestamp: message.createdTimestamp
                }
            );
        }).catch((e) => {
            console.error(`read.js => readText() => vv_chain.then() \n ${e}`);
        });
        map.set(`vv_chain_${guild_id}`, vv_chain_next);

        return;
    }catch(e){
        throw new Error(`read.js => readText() \n ${e}`);
    }
}

//読み上げ開始
async function start(trigger, map){
    try{
        //情報の取得
        const text_channel = utils.getChannelObj(trigger);
        const old_voice_channel = map.get(`read_channel_${text_channel.id}`);
        const new_voice_channel = trigger?.member?.voice?.channel ?? null;

        //読み上げ開始要件の確認
        const start_error = async () => {
            await utils.sendGUI(trigger, gui.create(map, !utils.isInteraction(trigger) ? "read_start_error" : "read_start_error_ephemeral",
                {
                    "{{__TEXT_CHANNEL__}}" : text_channel ?? "テキストチャンネル",
                    "{{__VOICE_CHANNEL__}}" : new_voice_channel ?? "ボイスチャンネル",
                    "{{__REQUEST_USER_NAME__}}" : utils.getUserName(trigger),
                    "{{__REQUEST_USER_ICON__}}" : utils.getUserObj(trigger).avatarURL()
                }
            ));
        };
        if(!(text_channel.type === ChannelType.GuildText || text_channel.type === ChannelType.GuildVoice)) return await start_error();
        if(text_channel.type === ChannelType.GuildText && !text_channel.members.find((member) => member.id === process.env.BOT_ID)) return await start_error();
        if(!(new_voice_channel?.joinable && new_voice_channel?.speakable)) return await start_error();
        if(old_voice_channel && old_voice_channel.id === new_voice_channel?.id) return await start_error();

        //VC接続
        if(old_voice_channel?.id !== new_voice_channel.id){
            const connect_voice_channel = await vc.connect(new_voice_channel);
            map.set(`read_subscribe_${new_voice_channel.id}`, connect_voice_channel.subscribe(createAudioPlayer()));
        }

        //読み上げチャンネルの追加
        map.set(`read_channel_${text_channel.id}`, new_voice_channel.id);
        trigger.cleanContent = `${text_channel.name}の読み上げを開始します`;
        await readText(trigger, map);

        //開始の通知
        if(utils.isInteraction(trigger)) await utils.sendGUI(trigger, gui.create(map, "read"));
        await utils.sendGUI(trigger.channel, gui.create(map, "read_start",
            {
                "{{__TEXT_CHANNEL__}}" : text_channel,
                "{{__VOICE_CHANNEL__}}" : new_voice_channel,
                "{{__REQUEST_USER_NAME__}}" : utils.getUserName(trigger),
                "{{__REQUEST_USER_ICON__}}" : utils.getUserObj(trigger).avatarURL()
            }
        ));

        return;
    }catch(e){
        throw new Error(`read.js => start() \n ${e}`);
    }
}

//読み上げ終了
async function end(trigger, map){
    try{
        //情報の取得
        const guild_id = utils.getGuildId(trigger);
        const text_channel = utils.getChannelObj(trigger);
        const old_voice_channel_id = map.get(`read_channel_${text_channel.id}`);
        const new_voice_channel = trigger?.member?.voice?.channel ?? null;

        //読み上げ終了要件の確認
        const end_error = async () => {
            await utils.sendGUI(trigger, gui.create(map, !utils.isInteraction(trigger) ? "read_end_error" : "read_end_error_ephemeral",
                {
                    "{{__TEXT_CHANNEL__}}" : text_channel ?? "テキストチャンネル",
                    "{{__VOICE_CHANNEL__}}" : new_voice_channel ?? "ボイスチャンネル",
                    "{{__REQUEST_USER_NAME__}}" : utils.getUserName(trigger),
                    "{{__REQUEST_USER_ICON__}}" : utils.getUserObj(trigger).avatarURL()
                }
            ));
        }
        if(!old_voice_channel_id) return await end_error();
        if(!new_voice_channel) return await end_error();
        if(old_voice_channel_id !== new_voice_channel.id) return await end_error();

        //読み上げチャンネルの削除
        trigger.cleanContent = `${text_channel.name}の読み上げを終了します`;
        await readText(trigger, map);
        map.delete(`read_channel_${text_channel.id}`);
        
        //読み上げを行っているチャンネルがなくなったら切断
        const guild = utils.getGuildObj(trigger);
        const other_channel = guild.channels.cache.find((channel) => map.get(`read_channel_${channel.id}`));
        if(!other_channel){
            //チェーン管理
            const vv_chain = map.get(`vv_chain_${guild_id}`) ?? Promise.resolve();
            const vv_chain_next = vv_chain.then(async () => {
                map.get(`read_subscribe_${old_voice_channel_id}`)?.connection.destroy();
                map.delete(`read_subscribe_${old_voice_channel_id}`);
            });
            map.set(`vv_chain_${guild_id}`, vv_chain_next.catch(() => {}));
            await vv_chain_next.catch((e) => {throw new Error(`read.js => end() => vv_chain.then() \n ${e}`)});
        }
        
        //終了の通知
        if(utils.isInteraction(trigger)) await utils.sendGUI(trigger, gui.create(map, "read"));
        await utils.sendGUI(trigger.channel, gui.create(map, "read_end",
            {
                "{{__TEXT_CHANNEL__}}" : text_channel,
                "{{__VOICE_CHANNEL__}}" : new_voice_channel,
                "{{__REQUEST_USER_NAME__}}" : utils.getUserName(trigger),
                "{{__REQUEST_USER_ICON__}}" : utils.getUserObj(trigger).avatarURL()
            }
        ));
        
        return;
    }catch(e){
        throw new Error(`read.js => end() \n ${e}`);
    }
}

//辞書追加
async function dictAdd(trigger, map){
    try{
        //情報の取得
        const guild_id = utils.getGuildId(trigger);
        const guild_info = await db.getGuildInfo(guild_id);
        const input_word = utils.getArgValue(trigger, "word");
        const input_kana = utils.getArgValue(trigger, "kana");
        const input_accent = utils.getArgValue(trigger, "accent");
        const input_priority = utils.getArgValue(trigger, "priority");

        let read_dict_property = null;
        for(const element of map.get("read_property_json")){
            if(element.id === "read_dict"){
                read_dict_property = element;
                break;
            }
        }
        if(!read_dict_property) throw new Error(`read.js => dictAdd() \n not define property id : VOICEVOX`);

        let surface = input_word.trim();
        let pronunciation = input_kana.trim();
        let accent = input_accent ? parseInt(input_accent) : NaN;
        let priority = input_priority ? parseInt(input_priority) : NaN;

        //辞書追加要件の確認
        const dict_add_error = async () => {
            await utils.sendGUI(trigger, gui.create(map, !utils.isInteraction(trigger) ? "read_dict_add_error" : "read_dict_add_error_ephemeral"));
        }
        if(surface.length > read_dict_property.surface_max) return await dict_add_error();
        if(pronunciation.length > read_dict_property.pronunciation_max) return await dict_add_error();
        
        //チェーン管理
        const vv_chain = map.get(`vv_chain_${guild_id}`) ?? Promise.resolve();
        const vv_chain_next = vv_chain.then(async () => {
            //クエリ作成
            const audio_query = await vv.postAudioQuery(pronunciation, 0);
            surface = surface.replace(/[A-Za-z0-9]/g, str => String.fromCharCode(str.charCodeAt(0)+0xFEE0));
            pronunciation = audio_query.data.kana.replace(/[^ァ-ヴー]/g, "");
            accent = !Number.isNaN(accent) ? Math.min(Math.max(accent, read_dict_property.accent_min), audio_query.data.accent_phrases[0].moras.length-1) : read_dict_property.accent_min;
            priority = !Number.isNaN(priority) ? Math.min(Math.max(priority, read_dict_property.priority_min), read_dict_property.priority_max) : read_dict_property.priority_max;

            //辞書の置換
            if(map.get("vv_dictionary_id") !== guild_id){
                await vv.postImportUserDict(guild_info.vv_dict ?? {});
                map.set("vv_dictionary_id", guild_id);
            }

            //辞書検索
            const dictionary = guild_info.vv_dict ?? {};
            let uuid_exist = null;
            for(const [uuid, entry] of Object.entries(dictionary)){
                if(entry.surface === surface){
                    uuid_exist = uuid;
                    break;
                }
            }

            //辞書のアップデート
            if(uuid_exist) await vv.putUserDictWord(uuid_exist, surface, pronunciation, accent, priority);
            if(!uuid_exist) await vv.postUserDictWord(surface, pronunciation, accent, priority);
            guild_info.vv_dict = (await vv.getUserDict()).data;

        });
        map.set(`vv_chain_${guild_id}`, vv_chain_next.catch(() => {}));
        await vv_chain_next.catch((e) => {
            throw new Error(`read.js => dictAdd() => vv_chain.then() \n ${e}`)
        });

        //サーバー情報の保存
        await db.setGuildInfo(guild_id, guild_info);

        //辞書追加の通知
        if(utils.isInteraction(trigger)) await utils.sendGUI(trigger, gui.create(map, "read"));
        await utils.sendGUI(trigger.channel, gui.create(map, "read_dict_add",
            {
                "{{__WORD__}}" : surface,
                "{{__KANA__}}" : pronunciation,
                "{{__REQUEST_USER_NAME__}}" : utils.getUserName(trigger),
                "{{__REQUEST_USER_ICON__}}" : utils.getUserObj(trigger).avatarURL()
            }
        ));
        
        return;
    }catch(e){
        throw new Error(`read.js => dictAdd() \n ${e}`);
    }
}

//辞書削除
async function dictDel(trigger, map){
    try{
        //情報の取得
        const guild_id = utils.getGuildId(trigger);
        const guild_info = await db.getGuildInfo(trigger.guild.id);
        const input_word = utils.getArgValue(trigger, "word") ?? "";

        //辞書検索
        const surface = input_word.trim().replace(/[A-Za-z0-9]/g, str => String.fromCharCode(str.charCodeAt(0)+0xFEE0));
        const dictionary = guild_info.vv_dict ?? {};
        let uuid_exist = null;
        for(const [uuid, entry] of Object.entries(dictionary)){
            if(entry.surface === surface){
                uuid_exist = uuid;
                break;
            }
        }

        //辞書の送信
        if(!uuid_exist){
            let dict_csv = "語句,カナ\n";
            for(const [uuid, entry] of Object.entries(dictionary)) dict_csv += `"${entry.surface.replace(/"/g, '""')}","${entry.pronunciation.replace(/"/g, '""')}"\n`;
            await utils.sendGUI(trigger, gui.create(map, !utils.isInteraction(trigger) ? "read_dict_del_send_csv" : "read_dict_del_send_csv_ephemeral",
                {
                    "{{__CSV_NAME__}}" : `${utils.getGuildName(trigger)}_dictionary.csv`,
                    "{{__CSV_BASE64__}}" : Buffer.from(dict_csv, "utf-8").toString("base64"),
                    "{{__REQUEST_USER_NAME__}}" : utils.getUserName(trigger),
                    "{{__REQUEST_USER_ICON__}}" : utils.getUserObj(trigger).avatarURL()
                }
            ));
            return;
        }

        const vv_chain = map.get(`vv_chain_${guild_id}`) ?? Promise.resolve();
        const vv_chain_next = vv_chain.then(async () => {
            //辞書の置き換え
            if(map.get("vv_dictionary_id") !== guild_id){
                await vv.postImportUserDict(dictionary);
                map.set("vv_dictionary_id", guild_id);
            }
            
            //単語の削除
            await vv.deleteUserDictWord(uuid_exist);

            //更新された辞書の取得
            guild_info.vv_dict = (await vv.getUserDict()).data;
        });
        map.set(`vv_chain_${guild_id}`, vv_chain_next.catch(() => {}));
        await vv_chain_next.catch((e) => {throw new Error(`read.js => dictDel() => vv_chain.then() \n ${e}`)});

        //サーバー情報の保存
        await db.setGuildInfo(guild_id, guild_info);

        //辞書削除の通知
        if(utils.isInteraction(trigger)) await utils.sendGUI(trigger, gui.create(map, "read"));
        await utils.sendGUI(trigger.channel, gui.create(map, "read_dict_del",
            {
                "{{__WORD__}}" : surface,
                "{{__REQUEST_USER_NAME__}}" : utils.getUserName(trigger),
                "{{__REQUEST_USER_ICON__}}" : utils.getUserObj(trigger).avatarURL()
            }
        ));

        return;
    }catch(e){
        throw new Error(`read.js => dictDel() \n ${e}`);
    }
}

//ユーザー設定
async function setUser(interaction, map){
    try{
        //情報の取得
        const user_id = utils.getUserId(interaction);
        const guild_id = utils.getGuildId(interaction);
        const user_info = await db.getUserInfo(user_id);
        const guild_info = await db.getGuildInfo(guild_id);
        const vv_speakers = map.get("voicevox_speakers");

        let read_text_property = null;
        let vv_property = null;
        for(const element of map.get("read_property_json")){
            if(element.id === "read_text"){
                read_text_property = element;
                break;
            }
        }
        for(const element of map.get("read_property_json")){
            if(element.id === "VOICEVOX"){
                vv_property = element;
                break;
            }
        }
        if(!read_text_property) throw new Error(`read.js => setUser() \n not define property id : read_text`);
        if(!vv_property) throw new Error(`read.js => setUser() \n not define property id : VOICEVOX`);

        const input_speaker = utils.getArgValue(interaction, "speaker");
        const input_style = utils.getArgValue(interaction, "style");
        const input_pitch = utils.getArgValue(interaction, "pitch");
        const input_intonation = utils.getArgValue(interaction, "intonation");
        const input_username = utils.getArgValue(interaction, "username");
        const input_honorific = utils.getArgValue(interaction, "honorific");

        //ユーザー設定要件の確認
        const set_user_error = async () => {
            await utils.sendGUI(interaction, gui.create(map, "read_set_user_error_ephemeral",
                {
                    "{{__CHARACTER__}}" : `${input_speaker}(${input_style})`
                }
            ));
        }

        //スピーカー入力確認
        let vv_speaker_info = null;
        let vv_uuid = interaction.customId?.split("speaker@")[1] ?? user_info.vv_uuid ?? guild_info.vv_uuid ?? vv_property.uuid;
        if(input_speaker && input_speaker === "ランダム") vv_speaker_info = vv_speakers[Math.floor(Math.random()*vv_speakers.length)];
        if(input_speaker && input_speaker !== "ランダム") vv_speaker_info = vv_speakers.find(vv_speaker => vv_speaker.name===input_speaker);
        if(input_speaker && !vv_speaker_info) return await set_user_error();
        if(!vv_speaker_info) vv_speaker_info = vv_speakers.find(vv_speaker => vv_speaker.speaker_uuid===vv_uuid);
        if(!vv_speaker_info) return await set_user_error();
        user_info.vv_uuid = vv_speaker_info.speaker_uuid;

        //スタイル入力確認
        let vv_style_info = null;
        let vv_id = interaction.customId?.split("style@")[1] ?? user_info.vv_id ?? guild_info.vv_id ?? vv_property.id;
        if(input_style && (input_speaker === "ランダム" || input_style === "ランダム")) vv_style_info = vv_speaker_info.styles[Math.floor(Math.random()*vv_speaker_info.styles.length)];
        if(input_style && input_speaker !== "ランダム" && input_style !== "ランダム") vv_style_info = vv_speaker_info.styles.find(vv_style => vv_style.name===input_style);
        if(input_style && !vv_style_info) return await set_user_error();
        if(!vv_style_info) vv_style_info = vv_speaker_info.styles.find(vv_style => vv_style.id===parseInt(vv_id));
        if(!vv_style_info) vv_style_info = vv_speaker_info.styles[0];
        user_info.vv_id = vv_style_info.id;

        //その他パラメータ設定
        const vv_pitch = parseFloat(input_pitch);
        const vv_intonation = parseFloat(input_intonation);
        user_info.vv_pitch = !Number.isNaN(vv_pitch) ? Math.min(Math.max(vv_pitch, vv_property.pitch_min), vv_property.pitch_max) : user_info.vv_pitch ?? guild_info.vv_pitch ?? vv_property.pitch;
        user_info.vv_intonation = !Number.isNaN(vv_intonation) ? Math.min(Math.max(vv_intonation, vv_property.intonation_min), vv_property.intonation_max) : user_info.vv_intonation ?? guild_info.vv_intonation ?? vv_property.intonation;
        user_info.username = (input_username && input_username.trim()!="") ? input_username.trim() : (user_info.username ?? utils.getUserName(interaction));
        user_info.honorific = (input_honorific && input_honorific.trim()!="") ? input_honorific.trim() : (user_info.honorific ?? read_text_property.honorific);

        //設定の保存
        await db.setUserInfo(user_id, user_info);

        //ユーザー設定の通知
        await utils.sendGUI(interaction, gui.create(map, "read_set_user",
            {
                "{{__SPEAKER__}}" : vv_speaker_info.name,
                "{{__STYLE__}}" : vv_style_info.name,
                "{{__USERNAME__}}" : user_info.username,
                "{{__PITCH__}}" : user_info.vv_pitch,
                "{{__INTONATION__}}" : user_info.vv_intonation,
                "{{__CREDIT__}}": `VOICEVOX:${vv_speaker_info.name}`
            }
        ));
        
        return;
    }catch(e){
        throw new Error(`read.js => setUser() \n ${e}`);
    }
}

//ユーザー設定＠スピーカー
async function setUserSpeaker(interaction, map){
    try{
        //情報の取得
        const user_id = utils.getUserId(interaction);
        const guild_id = utils.getGuildId(interaction);
        const user_info = await db.getUserInfo(user_id);
        const guild_info = await db.getGuildInfo(guild_id);
        const vv_speakers = map.get("voicevox_speakers");
        const discord_menu_max = 25;

        let vv_property = null;
        for(const element of map.get("read_property_json")){
            if(element.id === "VOICEVOX"){
                vv_property = element;
                break;
            }
        }
        if(!vv_property) throw new Error(`read.js => setUserSpeaker() \n not define property id : VOICEVOX`);

        //現在のスピーカー
        const vv_speaker_uuid = interaction?.values?.[0]?.split("speaker@")[1] ?? user_info.vv_uuid ?? guild_info.vv_uuid ?? vv_property.uuid;
        const vv_speaker_idx = vv_speakers.findIndex(speaker => speaker.speaker_uuid===vv_speaker_uuid);
        const vv_speaker_name = vv_speakers[vv_speaker_idx].name;
        const vv_style_name = vv_speakers[vv_speaker_idx].styles[0].name;

        //ページ
        const max_page = Math.ceil(vv_speakers.length/(discord_menu_max-2));
        const now_page = Math.ceil((vv_speaker_idx+1)/(discord_menu_max-2));
        const pre_page = now_page>1 ? now_page-1 : max_page;
        const next_page = now_page<max_page ? now_page+1 : 1;

        //ページの先頭スピーカー
        const pre_vv_speaker_idx = (pre_page-1)*(discord_menu_max-2);
        const next_vv_speaker_idx = (next_page-1)*(discord_menu_max-2);
        const pre_vv_speaker_uuid = vv_speakers.at(pre_vv_speaker_idx).speaker_uuid
        const next_vv_speaker_uuid = vv_speakers.at(next_vv_speaker_idx).speaker_uuid

        //情報の取得
        let vv_speaker_info = null;
        let vv_style_info = null;
        vv_speaker_info = (await vv.getSpeakerInfo(vv_speaker_uuid)).data;
        vv_style_info = vv_speaker_info.style_infos[0];

        //メニューの更新
        const tmp_map = new Map([["gui_json", [JSON.parse(JSON.stringify(map.get("gui_json").find(gui => gui.id==="read_set_user_speaker")))]]]);
        if(pre_page < now_page){
            tmp_map.get("gui_json")[0].menus[0].options.push(
                {
                    "label" : "前のページへ",
                    "value" : `read_set_user_speaker@${pre_vv_speaker_uuid}`,
                    "description" : `${pre_page}/${max_page}`,
                    "emoji" : "🔼"
                }
            );
        }
        for(let i=((now_page-1)*(discord_menu_max-2)); i<vv_speakers.length && i<((now_page-1)*(discord_menu_max-2)+(discord_menu_max-2)); i++){
            if(i === vv_speaker_idx){
                tmp_map.get("gui_json")[0].menus[0].options.push(
                    {
                        "label" : `${vv_speaker_name}(${vv_style_name})`,
                        "value" : `read_set_user`,
                        "description" : "決定する",
                        "emoji" : "✅"
                    },
                )
            }
            if(i !== vv_speaker_idx){
                tmp_map.get("gui_json")[0].menus[0].options.push(
                    {
                        "label" : vv_speakers[i].name,
                        "value" : `read_set_user_speaker@${vv_speakers[i].speaker_uuid}`,
                        "description" : vv_speakers[i].styles[0].name,
                        "emoji" : "🔘"
                    }
                )
            }
        }
        if(next_page > now_page){
            tmp_map.get("gui_json")[0].menus[0].options.push(
                {
                    "label" : "次のページへ",
                    "value" : `read_set_user_speaker@${next_vv_speaker_uuid}`,
                    "description" : `${next_page}/${max_page}`,
                    "emoji" : "🔽"
                }
            );
        }

        //スピーカーページの送信
        await utils.sendGUI(interaction, gui.create(tmp_map, "read_set_user_speaker",
            {
                "{{__SPEAKER_NAME__}}" : vv_speaker_name,
                "{{__STYLE_NAME__}}" : vv_style_name,
                "{{__POLICY_URL__}}" : vv_speaker_info.policy.match(/(https?:\/\/[\w\-\.\/\?\,\#\:\u3000-\u30FE\u4E00-\u9FA0\uFF01-\uFFE3]+)/)[0],
                "{{__ICON_NAME__}}" : `icon.jpg`,
                "{{__ICON_BASE64__}}" : vv_style_info.icon,
                "{{__VOICE_SAMPLE_NAME__}}" : `${vv_speaker_name}(${vv_style_name})のサンプル音声.mp3`,
                "{{__VOICE_SAMPLE_BASE64__}}" : vv_style_info.voice_samples[0],
                "{{__SPEAKER_UUID__}}" : vv_speaker_uuid
            }
        ));
        tmp_map.clear();
        
        return;
    }catch(e){
        throw new Error(`read.js => setUserSpeaker() \n ${e}`);
    }
}

//ユーザー設定＠スタイル
async function setUserStyle(interaction, map){
    try{
        //情報の取得
        const user_id = utils.getUserId(interaction);
        const guild_id = utils.getGuildId(interaction);
        const user_info = await db.getUserInfo(user_id);
        const guild_info = await db.getGuildInfo(guild_id);
        const vv_speakers = map.get("voicevox_speakers");
        const discord_menu_max = 25;

        let vv_property = null;
        for(const element of map.get("read_property_json")){
            if(element.id === "VOICEVOX"){
                vv_property = element;
                break;
            }
        }
        if(!vv_property) throw new Error(`read.js => setUserStyle() \n not define property id : VOICEVOX`);

        //現在のスピーカー
        const vv_speaker_uuid = user_info.vv_uuid ?? guild_info.vv_uuid ?? vv_property.uuid;
        const vv_speaker_idx = vv_speakers.findIndex(speaker => speaker.speaker_uuid===vv_speaker_uuid);
        const vv_speaker_name = vv_speakers[vv_speaker_idx].name;
        const vv_styles = vv_speakers[vv_speaker_idx].styles;
        const vv_style_id = interaction?.values?.[0].split("style@")[1] ?? user_info.vv_id ?? guild_info.vv_id ?? vv_styles[0].id;
        const vv_style_idx = vv_styles.findIndex(style => (style.id===parseInt(vv_style_id)));
        const vv_style_name = vv_styles[vv_style_idx].name;

        //ページ
        const max_page = Math.ceil(vv_styles.length/(discord_menu_max-2));
        const now_page = Math.ceil((vv_style_idx+1)/(discord_menu_max-2));
        const pre_page = now_page>1 ? now_page-1 : max_page;
        const next_page = now_page<max_page ? now_page+1 : 1;
            
        //ページの先頭スタイル
        const pre_vv_style_idx = (pre_page-1)*(discord_menu_max-2);
        const next_vv_style_idx = (next_page-1)*(discord_menu_max-2);
        const pre_vv_style_id = vv_styles.at(pre_vv_style_idx).id
        const next_vv_style_id = vv_styles.at(next_vv_style_idx).id

        //情報の取得
        let vv_speaker_info = null;
        let vv_style_info = null;
        vv_speaker_info = (await vv.getSpeakerInfo(vv_speaker_uuid)).data;
        vv_style_info = vv_speaker_info.style_infos.find(info => info.id === parseInt(vv_style_id));

        //メニューの更新
        const tmp_map = new Map([["gui_json", [JSON.parse(JSON.stringify(map.get("gui_json").find(gui => gui.id==="read_set_user_style")))]]]);
        if(pre_page < now_page){
            tmp_map.get("gui_json")[0].menus[0].options.push(
                {
                    "label" : "前のページへ",
                    "value" : `read_set_user_style@${pre_vv_style_id}`,
                    "description" : `${pre_page}/${max_page}`,
                    "emoji" : "🔼"
                }
            );
        }
        for(let i=((now_page-1)*(discord_menu_max-2)); i<vv_styles.length && i<((now_page-1)*(discord_menu_max-2)+(discord_menu_max-2)); i++){
            if(i === vv_style_idx){
                tmp_map.get("gui_json")[0].menus[0].options.push(
                    {
                        "label" : `${vv_speaker_name}(${vv_style_name})`,
                        "value" : `read_set_user`,
                        "description" : "決定する",
                        "emoji" : "✅"
                    },
                )
            }
            if(i !== vv_style_idx){
                tmp_map.get("gui_json")[0].menus[0].options.push(
                    {
                        "label" : vv_styles[i].name,
                        "value" : `read_set_user_style@${vv_styles[i].id}`,
                        "description" : vv_speaker_name,
                        "emoji" : "🔘"
                    }
                );
            }
        }
        if(next_page > now_page){
            tmp_map.get("gui_json")[0].menus[0].options.push(
                {
                    "label" : "次のページへ",
                    "value" : `read_set_user_style@${next_vv_style_id}`,
                    "description" : `${next_page}/${max_page}`,
                    "emoji" : "🔽"
                }
            );
        }

        //スタイルページの送信
        await utils.sendGUI(interaction, gui.create(tmp_map, "read_set_user_style",
            {
                "{{__SPEAKER_NAME__}}" : vv_speaker_name,
                "{{__STYLE_NAME__}}" : vv_style_name,
                "{{__POLICY_URL__}}" : vv_speaker_info.policy.match(/(https?:\/\/[\w\-\.\/\?\,\#\:\u3000-\u30FE\u4E00-\u9FA0\uFF01-\uFFE3]+)/)[0],
                "{{__ICON_NAME__}}" : `icon.jpg`,
                "{{__ICON_BASE64__}}" : vv_style_info.icon,
                "{{__VOICE_SAMPLE_NAME__}}" : `${vv_speaker_name}(${vv_style_name})のサンプル音声.mp3`,
                "{{__VOICE_SAMPLE_BASE64__}}" : vv_style_info.voice_samples[0],
                "{{__STYLE_ID__}}" : vv_style_id
            }
        ));
        tmp_map.clear();
        
        return;
    }catch(e){
        throw new Error(`read.js => setUserStyle() \n ${e}`);
    }
}

//ギルド設定
async function setGuild(interaction, map){
    try{
        const guild_id = utils.getGuildId(interaction);
        const guild_info = await db.getGuildInfo(guild_id);
        const vv_speakers = map.get("voicevox_speakers");

        let read_text_property = null;
        let vv_property = null;
        for(const element of map.get("read_property_json")){
            if(element.id === "read_text"){
                read_text_property = element;
                break;
            }
        }
        for(const element of map.get("read_property_json")){
            if(element.id === "VOICEVOX"){
                vv_property = element;
                break;
            }
        }
        if(!read_text_property) throw new Error(`read.js => setGuild() \n not define property id : read_text`);
        if(!vv_property) throw new Error(`read.js => setGuild() \n not define property id : VOICEVOX`);

        const input_speaker = utils.getArgValue(interaction, "speaker");
        const input_style = utils.getArgValue(interaction, "style");
        const input_speed = utils.getArgValue(interaction, "speed");
        const input_pitch = utils.getArgValue(interaction, "pitch");
        const input_intonation = utils.getArgValue(interaction, "intonation");
        const input_volume = utils.getArgValue(interaction, "volume");
        const input_override = utils.getArgValue(interaction, "override");

        //ギルド設定要件の確認
        const set_guild_error = async () => {
            await utils.sendGUI(interaction, gui.create(map, "read_set_guild_error",
                {
                    "{{__CHARACTER__}}" : `${input_speaker}(${input_style})`
                }
            ));
        }

        //スピーカー入力確認
        let vv_speaker_info = null;
        let vv_uuid = interaction.customId?.split("speaker@")[1] ?? guild_info.vv_uuid ?? vv_property.uuid;
        if(input_speaker && input_speaker === "ランダム") vv_speaker_info = vv_speakers[Math.floor(Math.random()*vv_speakers.length)];
        if(input_speaker && input_speaker !== "ランダム") vv_speaker_info = vv_speakers.find(vv_speaker => vv_speaker.name===input_speaker);
        if(input_speaker && !vv_speaker_info) return await set_guild_error();
        if(!vv_speaker_info) vv_speaker_info = vv_speakers.find(vv_speaker => vv_speaker.speaker_uuid===vv_uuid);
        if(!vv_speaker_info) return await set_guild_error();
        guild_info.vv_uuid = vv_speaker_info.speaker_uuid;

        //スタイル入力確認
        let vv_style_info = null;
        let vv_id = interaction.customId?.split("style@")[1] ?? guild_info.vv_id ?? vv_property.id;
        if(input_style && (input_speaker === "ランダム" || input_style === "ランダム")) vv_style_info = vv_speaker_info.styles[Math.floor(Math.random()*vv_speaker_info.styles.length)];
        if(input_style && input_speaker !== "ランダム" && input_style !== "ランダム") vv_style_info = vv_speaker_info.styles.find(vv_style => vv_style.name===input_style);
        if(input_style && !vv_style_info) return await set_guild_error();
        if(!vv_style_info) vv_style_info = vv_speaker_info.styles.find(vv_style => vv_style.id===parseInt(vv_id));
        if(!vv_style_info) vv_style_info = vv_speaker_info.styles[0];
        guild_info.vv_id = vv_style_info.id;

        //その他パラメータ設定
        const vv_speed = parseFloat(input_speed);
        const vv_pitch = parseFloat(input_pitch);
        const vv_intonation = parseFloat(input_intonation);
        const vv_volume = parseFloat(input_volume);
        guild_info.vv_speed = !Number.isNaN(vv_speed) ? Math.min(Math.max(vv_speed, vv_property.speed_min), vv_property.speed_max) : guild_info.vv_speed ?? vv_property.speed;
        guild_info.vv_pitch = !Number.isNaN(vv_pitch) ? Math.min(Math.max(vv_pitch, vv_property.pitch_min), vv_property.pitch_max) : guild_info.vv_pitch ?? vv_property.pitch;
        guild_info.vv_intonation = !Number.isNaN(vv_intonation) ? Math.min(Math.max(vv_intonation, vv_property.intonation_min), vv_property.intonation_max) : guild_info.vv_intonation ?? vv_property.intonation;
        guild_info.vv_volume = !Number.isNaN(vv_volume) ? Math.min(Math.max(vv_volume, vv_property.volume_min), vv_property.volume_max) : guild_info.vv_volume ?? vv_property.volume;
        
        const regex = new RegExp(/(t|T|y|Y)/);
        guild_info.read_override = regex.test(input_override) ?? guild_info.read_override;

        //設定の保存
        await db.setGuildInfo(guild_id, guild_info);

        //サーバー設定の通知
        await utils.sendGUI(interaction, gui.create(map, "read_set_guild_select"));
        await utils.sendGUI(utils.getChannelObj(interaction), gui.create(map, "read_set_guild",
            {
                "{{__SPEAKER__}}" : vv_speaker_info.name,
                "{{__STYLE__}}" : vv_style_info.name,
                "{{__OVERRIDE__}}" : guild_info.read_override,
                "{{__SPEED__}}" : guild_info.vv_speed,
                "{{__PITCH__}}" : guild_info.vv_pitch,
                "{{__INTONATION__}}" : guild_info.vv_intonation,
                "{{__VOLUME__}}" : guild_info.vv_volume,
                "{{__CREDIT__}}" : `VOICEVOX:${vv_speaker_info.name}`,
                "{{__REQUEST_USER_NAME__}}" : utils.getUserName(interaction),
                "{{__REQUEST_USER_ICON__}}" : utils.getUserObj(interaction).avatarURL()
            }
        ));
        
        return;
    }catch(e){
        throw new Error(`read.js => setGuild() \n ${e}`);
    }
}

//サーバー設定＠スピーカー
async function setGuildSpeaker(interaction, map){
    try{
        //情報の取得
        const guild_id = utils.getGuildId(interaction);
        const guild_info = await db.getGuildInfo(guild_id);
        const vv_speakers = map.get("voicevox_speakers");
        const discord_menu_max = 25;

        let vv_property = null;
        for(const element of map.get("read_property_json")){
            if(element.id === "VOICEVOX"){
                vv_property = element;
                break;
            }
        }
        if(!vv_property) throw new Error(`read.js => setUserSpeaker() \n not define property id : VOICEVOX`);

        //現在のスピーカー
        const vv_speaker_uuid = interaction?.values?.[0]?.split("speaker@")[1] ?? guild_info.vv_uuid ?? vv_property.uuid;
        const vv_speaker_idx = vv_speakers.findIndex(speaker => speaker.speaker_uuid===vv_speaker_uuid);
        const vv_speaker_name = vv_speakers[vv_speaker_idx].name;
        const vv_style_name = vv_speakers[vv_speaker_idx].styles[0].name;

        //ページ
        const max_page = Math.ceil(vv_speakers.length/(discord_menu_max-2));
        const now_page = Math.ceil((vv_speaker_idx+1)/(discord_menu_max-2));
        const pre_page = now_page>1 ? now_page-1 : max_page;
        const next_page = now_page<max_page ? now_page+1 : 1;

        //ページの先頭スピーカー
        const pre_vv_speaker_idx = (pre_page-1)*(discord_menu_max-2);
        const next_vv_speaker_idx = (next_page-1)*(discord_menu_max-2);
        const pre_vv_speaker_uuid = vv_speakers.at(pre_vv_speaker_idx).speaker_uuid
        const next_vv_speaker_uuid = vv_speakers.at(next_vv_speaker_idx).speaker_uuid

        //情報の取得
        let vv_speaker_info = null;
        let vv_style_info = null;
        vv_speaker_info = (await vv.getSpeakerInfo(vv_speaker_uuid)).data;
        vv_style_info = vv_speaker_info.style_infos[0];
        
        //メニューの更新
        const tmp_map = new Map([["gui_json", [JSON.parse(JSON.stringify(map.get("gui_json").find(gui => gui.id==="read_set_guild_speaker")))]]]);
        if(pre_page < now_page){
            tmp_map.get("gui_json")[0].menus[0].options.push(
                {
                    "label" : "前のページへ",
                    "value" : `read_set_guild_speaker@${pre_vv_speaker_uuid}`,
                    "description" : `${pre_page}/${max_page}`,
                    "emoji" : "🔼"
                }
            );
        }
        for(let i=((now_page-1)*(discord_menu_max-2)); i<vv_speakers.length && i<((now_page-1)*(discord_menu_max-2)+(discord_menu_max-2)); i++){
            if(i === vv_speaker_idx){
                tmp_map.get("gui_json")[0].menus[0].options.push(
                    {
                        "label" : `${vv_speaker_name}(${vv_style_name})`,
                        "value" : `read_set_guild`,
                        "description" : "決定する",
                        "emoji" : "✅"
                    },
                )
            }
            if(i !== vv_speaker_idx){
                tmp_map.get("gui_json")[0].menus[0].options.push(
                    {
                        "label" : vv_speakers[i].name,
                        "value" : `read_set_guild_speaker@${vv_speakers[i].speaker_uuid}`,
                        "description" : vv_speakers[i].styles[0].name,
                        "emoji" : "🔘"
                    }
                )
            }
        }
        if(next_page > now_page){
            tmp_map.get("gui_json")[0].menus[0].options.push(
                {
                    "label" : "次のページへ",
                    "value" : `read_set_guild_speaker@${next_vv_speaker_uuid}`,
                    "description" : `${next_page}/${max_page}`,
                    "emoji" : "🔽"
                }
            );
        }

        //スピーカーページの送信
        await utils.sendGUI(interaction, gui.create(tmp_map, "read_set_guild_speaker",
            {
                "{{__SPEAKER_NAME__}}" : vv_speaker_name,
                "{{__STYLE_NAME__}}" : vv_style_name,
                "{{__POLICY_URL__}}" : vv_speaker_info.policy.match(/(https?:\/\/[\w\-\.\/\?\,\#\:\u3000-\u30FE\u4E00-\u9FA0\uFF01-\uFFE3]+)/)[0],
                "{{__ICON_NAME__}}" : `icon.jpg`,
                "{{__ICON_BASE64__}}" : vv_style_info.icon,
                "{{__VOICE_SAMPLE_NAME__}}" : `${vv_speaker_name}(${vv_style_name})のサンプル音声.mp3`,
                "{{__VOICE_SAMPLE_BASE64__}}" : vv_style_info.voice_samples[0],
                "{{__SPEAKER_UUID__}}" : vv_speaker_uuid
            }
        ));
        tmp_map.clear();
        
        return;
    }catch(e){
        throw new Error(`read.js => setGuildSpeaker() \n ${e}`);
    }
}

//サーバー設定＠スタイル
async function setGuildStyle(interaction, map){
    try{
        //情報の取得
        const guild_id = utils.getGuildId(interaction);
        const guild_info = await db.getGuildInfo(guild_id);
        const vv_speakers = map.get("voicevox_speakers");
        const discord_menu_max = 25;

        let vv_property = null;
        for(const element of map.get("read_property_json")){
            if(element.id === "VOICEVOX"){
                vv_property = element;
                break;
            }
        }
        if(!vv_property) throw new Error(`read.js => setUserStyle() \n not define property id : VOICEVOX`);

        //現在のスピーカー
        const vv_speaker_uuid = guild_info.vv_uuid ?? vv_property.uuid;
        const vv_speaker_idx = vv_speakers.findIndex(speaker => speaker.speaker_uuid===vv_speaker_uuid);
        const vv_speaker_name = vv_speakers[vv_speaker_idx].name;
        const vv_styles = vv_speakers[vv_speaker_idx].styles;
        const vv_style_id = interaction?.values?.[0].split("style@")[1] ?? guild_info.vv_id ?? vv_styles[0].id;
        const vv_style_idx = vv_styles.findIndex(style => style.id===parseInt(vv_style_id));
        const vv_style_name = vv_styles[vv_style_idx].name;

        //ページ
        const max_page = Math.ceil(vv_styles.length/(discord_menu_max-2));
        const now_page = Math.ceil((vv_style_idx+1)/(discord_menu_max-2));
        const pre_page = now_page>1 ? now_page-1 : max_page;
        const next_page = now_page<max_page ? now_page+1 : 1;
            
        //ページの先頭スタイル
        const pre_vv_style_idx = (pre_page-1)*(discord_menu_max-2);
        const next_vv_style_idx = (next_page-1)*(discord_menu_max-2);
        const pre_vv_style_id = vv_styles.at(pre_vv_style_idx).id
        const next_vv_style_id = vv_styles.at(next_vv_style_idx).id


        //情報の取得
        let vv_speaker_info = null;
        let vv_style_info = null;
        vv_speaker_info = (await vv.getSpeakerInfo(vv_speaker_uuid)).data;
        vv_style_info = vv_speaker_info.style_infos.find(info => info.id === parseInt(vv_style_id));

        //メニューの更新
        const tmp_map = new Map([["gui_json", [JSON.parse(JSON.stringify(map.get("gui_json").find(gui => gui.id==="read_set_guild_style")))]]]);
        if(pre_page < now_page){
            tmp_map.get("gui_json")[0].menus[0].options.push(
                {
                    "label" : "前のページへ",
                    "value" : `read_set_guild_style@${pre_vv_style_id}`,
                    "description" : `${pre_page}/${max_page}`,
                    "emoji" : "🔼"
                }
            );
        }
        for(let i=((now_page-1)*(discord_menu_max-2)); i<vv_styles.length && i<((now_page-1)*(discord_menu_max-2)+(discord_menu_max-2)); i++){
            if(i === vv_style_idx){
                tmp_map.get("gui_json")[0].menus[0].options.push(
                    {
                        "label" : `${vv_speaker_name}(${vv_style_name})`,
                        "value" : `read_set_guild`,
                        "description" : "決定する",
                        "emoji" : "✅"
                    },
                )
            }
            if(i !== vv_style_idx){
                tmp_map.get("gui_json")[0].menus[0].options.push(
                    {
                        "label" : vv_styles[i].name,
                        "value" : `read_set_guild_style@${vv_styles[i].id}`,
                        "description" : vv_speaker_name,
                        "emoji" : "🔘"
                    }
                )
            }
        }
        if(next_page > now_page){
            tmp_map.get("gui_json")[0].menus[0].options.push(
                {
                    "label" : "次のページへ",
                    "value" : `read_set_guild_style@${next_vv_style_id}`,
                    "description" : `${next_page}/${max_page}`,
                    "emoji" : "🔽"
                }
            );
        }
            
        //スタイルページの送信
        await utils.sendGUI(interaction, gui.create(tmp_map, "read_set_guild_style",
            {
                "{{__SPEAKER_NAME__}}" : vv_speaker_name,
                "{{__STYLE_NAME__}}" : vv_style_name,
                "{{__POLICY_URL__}}" : vv_speaker_info.policy.match(/(https?:\/\/[\w\-\.\/\?\,\#\:\u3000-\u30FE\u4E00-\u9FA0\uFF01-\uFFE3]+)/)[0],
                "{{__ICON_NAME__}}" : `icon.jpg`,
                "{{__ICON_BASE64__}}" : vv_style_info.icon,
                "{{__VOICE_SAMPLE_NAME__}}" : `${vv_speaker_name}(${vv_style_name})のサンプル音声.mp3`,
                "{{__VOICE_SAMPLE_BASE64__}}" : vv_style_info.voice_samples[0],
                "{{__STYLE_ID__}}" : vv_style_id
            }
        ));
        tmp_map.clear();
        
        return;
    }catch(e){
        throw new Error(`read.js => setServerStyle() \n ${e}`);
    }
}

//スピーカー選択肢の表示
async function setSpeakers(interaction, map){
    try{
        const discord_menu_max = 25;
        const vv_speakers = map.get("voicevox_speakers");
        const focus_opt = interaction.options.getFocused(true);
        const choices = new Array();

        //一致するspeakerの取得
        vv_speakers.find(speaker => {if(speaker.name.includes(focus_opt.value)) choices.push(speaker.name);});

        //一致するspeakerがない場合はランダムを表示
        if(!choices.length) choices.push("ランダム");

        await interaction.respond((choices.slice(0, discord_menu_max)).map(choice => ({name: choice, value: choice})));
        return;

    }catch(e){
        throw new Error(`read.js => setSpeakers() \n ${e}`);
    }
}

//スタイル選択肢の表示
async function setStyles(interaction, map){
    try{
        const discord_menu_max = 25;
        const vv_speakers = map.get("voicevox_speakers");
        const focus_opt = interaction.options.getFocused(true);
        const choices = new Array();

        const system_id = utils.getSystemId(interaction);
        const user_info = await db.getUserInfo(utils.getUserId(interaction));
        const guild_info = await db.getGuildInfo(utils.getGuildId(interaction));

        //焦点となるスピーカーの取得
        let focus_speaker = interaction.options.getString("speaker") ?? null;
        if(system_id === "read_set_user") focus_speaker = user_info.vv_uuid ?? null;
        if(system_id === "read_set_guild") focus_speaker = guild_info.vv_uuid ?? null;

        //一致するstyleの取得
        const focus_speaker_info = vv_speakers.find(speaker => speaker.name===focus_speaker || speaker.speaker_uuid===focus_speaker);
        focus_speaker_info?.styles?.find(style => {if(style.name.includes(focus_opt.value)) choices.push(style.name);});

        //一致するstyleがない場合はランダムを表示
        if(!choices.length) choices.push("ランダム");

        await interaction.respond((choices.slice(0, discord_menu_max)).map(choice => ({name: choice, value: choice})));
        return;

    }catch(e){
        throw new Error(`read.js => getStyleChoices() \n ${e}`);
    }
}

//読み上げ自動終了
async function autoEnd(old_state, new_state, map){
    try{
        //変更前情報が存在しない場合は終了
        if(!old_state) return;

        //残っている読み上げを終了
        const guild_id = utils.getGuildId(old_state);
        map.set(`vv_chain_${guild_id}`, Promise.resolve());

        //連携しているテキストチャンネルをすべて破棄
        const text_channels = old_state.guild.channels.cache.filter((channel) => map.get(`read_channel_${channel.id}`));
        text_channels.forEach((channel) => map.delete(`read_channel_${channel.id}`));

        //接続の再破棄
        map.get(`read_subscribe_${old_state.channel.id}`)?.connection?.destroy();
        map.delete(`read_subscribe_${old_state.channel.id}`);

        await utils.sendGUI(text_channels.at(0), gui.create(map, utils.getSystemId(old_state), {"{{__OLD_VOICE_CHANNEL__}}" : old_state.channel}));
        return;
        
    }catch(e){
        throw new Error(`read.js => autoEnd() \n ${e}`);
    }
}

//読み上げキック終了
async function manualKick(old_state, new_state, map){
    try{
        //変更前情報が存在しない場合は終了
        if(!old_state) return;

        //残っている読み上げを終了
        const guild_id = utils.getGuildId(old_state);
        map.set(`vv_chain_${guild_id}`, Promise.resolve());

        //連携しているテキストチャンネルをすべて破棄
        const text_channels = old_state.guild.channels.cache.filter((channel) => map.get(`read_channel_${channel.id}`));
        text_channels.forEach((channel) => map.delete(`read_channel_${channel.id}`));

        //接続の再破棄
        map.get(`read_subscribe_${old_state.channel.id}`)?.connection?.destroy();
        map.delete(`read_subscribe_${old_state.channel.id}`);

        await utils.sendGUI(text_channels.at(0), gui.create(map, utils.getSystemId(old_state), {"{{__OLD_VOICE_CHANNEL__}}" : old_state.channel}));
        return;

    }catch(e){
        throw new Error(`read.js => manualKick() \n ${e}`);
    }
}

//読み上げ移動変更
async function manualMove(old_state, new_state, map){
    try{
        //変更前後情報が存在しない場合は終了
        if(!old_state || !new_state) return;

        //残っている読み上げを終了
        const guild_id = utils.getGuildId(old_state);
        map.set(`vv_chain_${guild_id}`, Promise.resolve());

        //移動先権限の確認
        const permission = new_state.channel.permissionsFor(old_state.guild.members.me);
        if(!permission.has(PermissionFlagsBits.Connect) || !permission.has(PermissionFlagsBits.Speak)){
            await manualKick(old_state, new_state, map);
            return;
        }

        //連携しているテキストチャンネルをすべて更新
        const text_channels = old_state.guild.channels.cache.filter((channel) => map.get(`read_channel_${channel.id}`));
        text_channels.forEach((channel) => map.set(`read_channel_${channel.id}`, new_state.channel.id));

        //接続の更新
        const connect_voice_channel = await vc.connect(new_state.channel);
        map.set(`read_subscribe_${new_state.channel.id}`, connect_voice_channel.subscribe(createAudioPlayer()));
        map.delete(`read_subscribe_${old_state.channel.id}`);

        await utils.sendGUI(text_channels.at(0), gui.create(map, utils.getSystemId(old_state),
            {
                "{{__OLD_VOICE_CHANNEL__}}" : old_state.channel,
                "{{__NEW_VOICE_CHANNEL__}}" : new_state.channel
            }
        ));
        return;

    }catch(e){
        throw new Error(`read.js => manualMove() \n ${e}`);
    }
}

//読み上げコマンド実行
async function execute(trigger, map){
    try{
        const system_id = utils.getSystemId(trigger);

        //延期の送信
        if(utils.isInteraction(trigger) && !system_id.includes("modal")){
            await utils.sendDefer(trigger);
        }

        //読み上げ
        if(system_id === "read_text"){
            await readText(trigger, map);
            return;
        }

        //開始コマンド
        if(system_id === "read_start"){
            await start(trigger, map);
            return;
        }

        //終了コマンド
        if(system_id === "read_end"){
            await end(trigger, map);
            return;
        }

        //辞書追加コマンド
        if(system_id === "read_dict_add"){
            await dictAdd(trigger, map);
            return;
        }
        
        //辞書削除コマンド
        if(system_id === "read_dict_del"){
            await dictDel(trigger, map);
            return;
        }
        
        //ユーザー設定コマンド
        if(system_id === "read_set_user"){
            await setUser(trigger, map);
            return;
        }

        //ギルド設定コマンド
        if(system_id === "read_set_guild"){
            await setGuild(trigger, map);
            return;
        }

        //ユーザースピーカー設定ページ
        if(system_id.startsWith("read_set_user_speaker")){
            await setUserSpeaker(trigger, map);
            return;
        }

        //ユーザースタイル設定ページ
        if(system_id.startsWith("read_set_user_style")){
            await setUserStyle(trigger, map);
            return;
        }

        //ギルドスピーカー設定ページ
        if(system_id.startsWith("read_set_guild_speaker")){
            await setGuildSpeaker(trigger, map);
            return;
        }

        //ギルドスタイル設定ページ
        if(system_id.startsWith("read_set_guild_style")){
            await setGuildStyle(trigger, map);
            return;
        }

        //モーダルの送信
        if(system_id.includes("modal")){
            await utils.sendModal(trigger, gui.create(map, system_id));
            await utils.sendGUI(trigger, gui.create(map, "read"));
            return;
        }

        //GUI送信
        await utils.sendGUI(trigger, gui.create(map, system_id));

        return;
    }catch(e){
        throw new Error(`read.js => execute() \n ${e}`);
    }

    throw new Error(`read.js => execute() \n not define system id : ${utils.getSystemId(trigger)}`);
}

//コマンドの補助
async function autoComplete(interaction, map){
    try{
        const focus_opt = interaction.options.getFocused(true);

        //speakerオプションの補助
        if(focus_opt.name === "speaker"){
            await setSpeakers(interaction, map);
            return;
        }

        //styleオプションの補助
        if(focus_opt.name === "style"){
            await setStyles(interaction, map);
            return;
        }
    }catch(e){
        throw new Error(`read.js => autoComplete() \n ${e}`);
    }

    throw new Error(`read.js => autoComplete() \n not define option`);
}

//ボイスチャンネルの監視
async function voiceState(old_state, new_state, map){
    try{
        const system_id = utils.getSystemId(old_state);

        //読み上げ自動終了
        if(system_id === "read_voice_auto_end"){
            await autoEnd(old_state, new_state, map);
            return;
        }

        //読み上げキック終了
        if(system_id === "read_voice_manual_kick"){
            await manualKick(old_state, new_state, map);
            return;
        }

        //読み上げ移動変更
        if(system_id === "read_voice_manual_move"){
            await manualMove(old_state, new_state, map);
            return;
        }

    }catch(e){
        throw new Error(`read.js => voiceState() \n ${e}`);
    }
    
    throw new Error(`read.js => voiceState() \n not define system id : ${utils.getSystemId(old_state)}`);
}