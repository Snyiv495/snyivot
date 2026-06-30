/*****************
    activity.js
    すにゃBot Activity
*****************/

const path = require('path');
const cors = require('cors');
const express = require('express');
const fetch = require('node-fetch');
const { ChannelType } = require('discord.js');
const { createAudioPlayer } = require('@discordjs/voice');
const vc = require('../core/vc');
const tower = require('./tower-engine');

const app = express();
const port = process.env.PORT || 3000;

app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", [
        "default-src 'self' https://*.discordsays.com https://*.trycloudflare.com",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.discordsays.com https://*.trycloudflare.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https://*.discordsays.com https://*.trycloudflare.com",
        "media-src 'self' data: blob: https://*.discordsays.com https://*.trycloudflare.com",
        "connect-src 'self' https://discord.com https://*.discord.com https://discordapp.com wss://gateway.discord.gg https://*.discordsays.com https://*.trycloudflare.com",
        "frame-ancestors https://discord.com https://*.discord.com"
    ].join("; "));
    next();
});
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

module.exports = {
    register(client, map) {

        app.get('/api/info', (req, res) => {
            res.json({ botName: process.env.BOT_NAME || "すにゃBot", status: "online" });
        });

        app.get('/api/speakers', (req, res) => {
            const speakers = map.get("voicevox_speakers");
            if (!speakers) return res.status(503).json({ error: "Speakers not yet loaded" });
            res.json(speakers);
        });

        // ユーザー設定取得
        app.get('/api/user-setting', async (req, res) => {
            const { userId } = req.query;
            if (!userId) return res.status(400).json({ error: "Missing userId" });
            try {
                const db = require('../core/db');
                const u = await db.getUserInfo(userId);
                res.json({
                    vv_uuid:       u.vv_uuid       ?? null,
                    vv_id:         u.vv_id         ?? null,
                    vv_pitch:      u.vv_pitch      ?? null,
                    vv_intonation: u.vv_intonation ?? null,
                    username:      u.username      ?? null,
                });
            } catch (e) {
                console.error(`[Activity] /api/user-setting: ${e.message}`);
                res.status(500).json({ error: e.message });
            }
        });

        // サーバー設定取得
        app.get('/api/guild-setting', async (req, res) => {
            const { guildId } = req.query;
            if (!guildId) return res.status(400).json({ error: "Missing guildId" });
            try {
                const db = require('../core/db');
                const g = await db.getGuildInfo(guildId);
                res.json({
                    vv_uuid:       g.vv_uuid       ?? null,
                    vv_id:         g.vv_id         ?? null,
                    vv_speed:      g.vv_speed      ?? null,
                    vv_pitch:      g.vv_pitch      ?? null,
                    vv_intonation: g.vv_intonation ?? null,
                    vv_volume:     g.vv_volume     ?? null,
                    read_override: g.read_override ?? false,
                });
            } catch (e) {
                console.error(`[Activity] /api/guild-setting: ${e.message}`);
                res.status(500).json({ error: e.message });
            }
        });

        // OAuth2トークン交換
        app.post('/api/token', async (req, res) => {
            const { code } = req.body;
            if (!code) return res.status(400).json({ error: "Missing code" });
            try {
                const response = await fetch("https://discord.com/api/oauth2/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                        client_id: process.env.BOT_ID,
                        client_secret: process.env.BOT_SECRET,
                        grant_type: "authorization_code",
                        code,
                    }),
                });
                if (!response.ok) {
                    const errText = await response.text();
                    console.error(`[Activity] /api/token: ${errText}`);
                    return res.status(response.status).json({ error: errText });
                }
                const { access_token } = await response.json();
                res.json({ access_token });
            } catch (e) {
                console.error(`[Activity] /api/token: ${e.message}`);
                res.status(500).json({ error: e.message });
            }
        });

        // 読み上げ開始
        // userId がいるVCを自動検出し、そのVCで読み上げを開始する
        app.post('/api/read-start', async (req, res) => {
            const { userId, guildId, channelId } = req.body;
            if (!userId || !guildId) return res.status(400).json({ error: "Missing params" });
            try {
                const guild = await client.guilds.fetch(guildId);
                if (!guild) return res.status(404).json({ error: "Guild not found" });

                // ユーザーのVCを取得
                const member = await guild.members.fetch(userId);
                const voiceChannel = member?.voice?.channel ?? null;
                if (!voiceChannel) return res.status(400).json({ error: "VC未参加: ボイスチャンネルに入ってから操作してください" });
                if (!voiceChannel.joinable || !voiceChannel.speakable) return res.status(400).json({ error: "VCに参加できません（権限不足）" });

                // テキストチャンネルを決定（channelIdが指定されていればそれ、なければVCと同じ）
                let textChannel;
                if (channelId) {
                    textChannel = await guild.channels.fetch(channelId).catch(() => null);
                }
                if (!textChannel) {
                    // ギルドのテキストチャンネルのうちBotが参加しているものを探す
                    textChannel = guild.channels.cache.find(ch =>
                        ch.type === ChannelType.GuildText &&
                        ch.members?.has(process.env.BOT_ID)
                    ) ?? null;
                }
                if (!textChannel) return res.status(400).json({ error: "読み上げ対象のテキストチャンネルが見つかりません" });

                // すでに同VCで読み上げ中なら弾く
                const oldVcId = map.get(`read_channel_${textChannel.id}`);
                if (oldVcId && oldVcId === voiceChannel.id) {
                    return res.status(400).json({ error: "すでにそのチャンネルで読み上げ中です" });
                }

                // VC接続
                const connection = await vc.connect(voiceChannel);
                map.set(`read_subscribe_${voiceChannel.id}`, connection.subscribe(createAudioPlayer()));
                map.set(`read_channel_${textChannel.id}`, voiceChannel.id);

                res.json({ success: true, textChannelName: textChannel.name, voiceChannelName: voiceChannel.name });
            } catch (e) {
                console.error(`[Activity] /api/read-start: ${e.message}`);
                res.status(500).json({ error: e.message });
            }
        });

        // 読み上げ終了
        // userId がいるVCに紐づいた読み上げを終了する
        app.post('/api/read-end', async (req, res) => {
            const { userId, guildId } = req.body;
            if (!userId || !guildId) return res.status(400).json({ error: "Missing params" });
            try {
                const guild = await client.guilds.fetch(guildId);
                if (!guild) return res.status(404).json({ error: "Guild not found" });

                const member = await guild.members.fetch(userId);
                const voiceChannel = member?.voice?.channel ?? null;
                if (!voiceChannel) return res.status(400).json({ error: "VC未参加: ボイスチャンネルに入ってから操作してください" });

                // そのVCに紐づいた読み上げチャンネルを探す
                const textChannels = guild.channels.cache.filter(ch => map.get(`read_channel_${ch.id}`) === voiceChannel.id);
                if (textChannels.size === 0) return res.status(400).json({ error: "このVCで読み上げ中のチャンネルが見つかりません" });

                // チェーンを完了させてから切断
                const vv_chain = map.get(`vv_chain_${guildId}`) ?? Promise.resolve();
                await vv_chain.catch(() => {});
                map.get(`read_subscribe_${voiceChannel.id}`)?.connection?.destroy();
                map.delete(`read_subscribe_${voiceChannel.id}`);
                textChannels.forEach(ch => map.delete(`read_channel_${ch.id}`));

                res.json({ success: true });
            } catch (e) {
                console.error(`[Activity] /api/read-end: ${e.message}`);
                res.status(500).json({ error: e.message });
            }
        });

        // 辞書追加
        app.post('/api/dict-add', async (req, res) => {
            const { userId, guildId, surface, kana } = req.body;
            if (!userId || !guildId || !surface || !kana) return res.status(400).json({ error: "Missing params" });
            try {
                const db = require('../core/db');
                const vv = require('../integrations/voicevox');
                const guild_info = await db.getGuildInfo(guildId);

                // 辞書の同期
                if (map.get("vv_dictionary_id") !== guildId) {
                    await vv.postImportUserDict(guild_info.vv_dict ?? {});
                    map.set("vv_dictionary_id", guildId);
                }

                // カナ変換
                const audio_query = await vv.postAudioQuery(kana, 0);
                const surfaceFullWidth = surface.replace(/[A-Za-z0-9]/g, s => String.fromCharCode(s.charCodeAt(0) + 0xFEE0));
                const pronunciation = audio_query.data.kana.replace(/[^ァ-ヴー]/g, "");
                const accent = 0;
                const priority = 10;

                // 既存単語チェック
                const dictionary = guild_info.vv_dict ?? {};
                let uuid_exist = null;
                for (const [uuid, entry] of Object.entries(dictionary)) {
                    if (entry.surface === surfaceFullWidth) { uuid_exist = uuid; break; }
                }

                if (uuid_exist) await vv.putUserDictWord(uuid_exist, surfaceFullWidth, pronunciation, accent, priority);
                else await vv.postUserDictWord(surfaceFullWidth, pronunciation, accent, priority);

                guild_info.vv_dict = (await vv.getUserDict()).data;
                await db.setGuildInfo(guildId, guild_info);
                map.set("vv_dictionary_id", null); // 次回再読み込みを促す

                res.json({ success: true, surface: surfaceFullWidth, pronunciation });
            } catch (e) {
                console.error(`[Activity] /api/dict-add: ${e.message}`);
                res.status(500).json({ error: e.message });
            }
        });

        // 辞書削除
        app.post('/api/dict-del', async (req, res) => {
            const { userId, guildId, surface } = req.body;
            if (!userId || !guildId || !surface) return res.status(400).json({ error: "Missing params" });
            try {
                const db = require('../core/db');
                const vv = require('../integrations/voicevox');
                const guild_info = await db.getGuildInfo(guildId);

                const surfaceFullWidth = surface.trim().replace(/[A-Za-z0-9]/g, s => String.fromCharCode(s.charCodeAt(0) + 0xFEE0));
                const dictionary = guild_info.vv_dict ?? {};
                let uuid_exist = null;
                for (const [uuid, entry] of Object.entries(dictionary)) {
                    if (entry.surface === surfaceFullWidth) { uuid_exist = uuid; break; }
                }
                if (!uuid_exist) return res.status(404).json({ error: `「${surfaceFullWidth}」は辞書に登録されていません` });

                if (map.get("vv_dictionary_id") !== guildId) {
                    await vv.postImportUserDict(dictionary);
                    map.set("vv_dictionary_id", guildId);
                }
                await vv.deleteUserDictWord(uuid_exist);
                guild_info.vv_dict = (await vv.getUserDict()).data;
                await db.setGuildInfo(guildId, guild_info);
                map.set("vv_dictionary_id", null);

                res.json({ success: true, surface: surfaceFullWidth });
            } catch (e) {
                console.error(`[Activity] /api/dict-del: ${e.message}`);
                res.status(500).json({ error: e.message });
            }
        });

        // スピーカー設定保存（ユーザー）
        app.post('/api/save-setting', async (req, res) => {
            const { userId, speakerUuid, styleId } = req.body;
            if (!userId || !speakerUuid) return res.status(400).json({ error: "Missing params" });
            try {
                const speakers = map.get("voicevox_speakers");
                if (!speakers) return res.status(503).json({ error: "Speakers not yet loaded" });
                const speaker = speakers.find(s => s.speaker_uuid === speakerUuid);
                if (!speaker) return res.status(400).json({ error: "Speaker not found" });
                const db = require('../core/db');
                const u = await db.getUserInfo(userId);
                u.vv_uuid = speakerUuid;
                u.vv_id = styleId ?? speaker.styles?.[0]?.id ?? u.vv_id;
                await db.setUserInfo(userId, u);
                res.json({ success: true, vv_id: u.vv_id });
            } catch (e) {
                console.error(`[Activity] /api/save-setting: ${e.message}`);
                res.status(500).json({ error: e.message });
            }
        });

        // パラメーター保存（ユーザー）
        app.post('/api/save-param', async (req, res) => {
            const { userId, pitch, intonation, username } = req.body;
            if (!userId) return res.status(400).json({ error: "Missing userId" });
            try {
                const db = require('../core/db');
                const u = await db.getUserInfo(userId);
                if (pitch      !== undefined) u.vv_pitch      = pitch;
                if (intonation !== undefined) u.vv_intonation = intonation;
                if (username   !== undefined) u.username      = username;
                await db.setUserInfo(userId, u);
                res.json({ success: true });
            } catch (e) {
                console.error(`[Activity] /api/save-param: ${e.message}`);
                res.status(500).json({ error: e.message });
            }
        });

        // サーバー設定保存（スピーカー＋全パラメータ）
        app.post('/api/save-guild-setting', async (req, res) => {
            const { userId, guildId, speakerUuid, styleId, speed, pitch, intonation, volume, override } = req.body;
            if (!userId || !guildId) return res.status(400).json({ error: "Missing params" });
            try {
                const speakers = map.get("voicevox_speakers");
                if (!speakers) return res.status(503).json({ error: "Speakers not yet loaded" });
                const db = require('../core/db');
                const g = await db.getGuildInfo(guildId);

                if (speakerUuid) {
                    const speaker = speakers.find(s => s.speaker_uuid === speakerUuid);
                    if (!speaker) return res.status(400).json({ error: "Speaker not found" });
                    g.vv_uuid = speakerUuid;
                    g.vv_id = styleId ?? speaker.styles?.[0]?.id ?? g.vv_id;
                }
                if (speed      !== undefined) g.vv_speed      = speed;
                if (pitch      !== undefined) g.vv_pitch      = pitch;
                if (intonation !== undefined) g.vv_intonation = intonation;
                if (volume     !== undefined) g.vv_volume     = volume;
                if (override   !== undefined) g.read_override = override;

                await db.setGuildInfo(guildId, g);
                res.json({ success: true });
            } catch (e) {
                console.error(`[Activity] /api/save-guild-setting: ${e.message}`);
                res.status(500).json({ error: e.message });
            }
        });

        // おみくじ
        app.post('/api/omikuji', async (req, res) => {
            const { userId } = req.body;
            if (!userId) return res.status(400).json({ error: "Missing userId" });
            try {
                const db        = require('../core/db');
                const gemini    = require('../integrations/gemini');
                const user_info = await db.getUserInfo(userId);
                const result = user_info.omikuji_result ?? {
                    date: null, fortune: null,
                    speaker_name: null, speaker_uuid: null,
                    color: null, item: null, dinner: null, quest: null, advice: null,
                };
                const now   = new Date();
                const today = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}`;
                if (result.date === today) return res.json({ cached: true, result });

                const r = Math.floor(Math.random() * 100);
                switch (true) {
                    case r === 0:   result.fortune = "TOP 1% USER !!!";   break;
                    case r < 5:     result.fortune = "大吉";              break;
                    case r < 20:    result.fortune = "中吉";              break;
                    case r < 40:    result.fortune = "小吉";              break;
                    case r < 60:    result.fortune = "末吉";              break;
                    case r < 80:    result.fortune = "吉";                break;
                    case r < 95:    result.fortune = "凶";                break;
                    case r < 99:    result.fortune = "大凶";              break;
                    case r === 99:  result.fortune = "BOTTOM 1% USER..."; break;
                    default:        result.fortune = "Error";             break;
                }
                const speakers = map.get("voicevox_speakers") ?? [];
                if (speakers.length > 0) {
                    const sp = speakers[Math.floor(Math.random() * speakers.length)];
                    result.speaker_name = sp.name;
                    result.speaker_uuid = sp.speaker_uuid;
                }
                result.color = Math.random().toString(16).slice(-6);

                const ai_property_json = map.get("ai_property_json") ?? [];
                const prompt_entry = ai_property_json.find(e => e.id === "omikuji_draw" && e.support === "prompt");
                if (!prompt_entry) return res.status(503).json({ error: "おみくじのプロンプト設定が見つかりません" });

                const promptText = prompt_entry.text.replace("{{__FORTUNE__}}", result.fortune);
                const gemini_res = await gemini.exeJson(promptText, prompt_entry, map);
                const parsed     = JSON.parse(gemini_res.candidates[0].content.parts[0].text);
                result.item   = parsed.item;
                result.dinner = parsed.dinner;
                result.quest  = parsed.quest;
                result.advice = parsed.advice;
                result.date   = today;
                user_info.omikuji_result = result;
                await db.setUserInfo(userId, user_info);
                res.json({ cached: false, result });
            } catch (e) {
                console.error(`[Activity] /api/omikuji: ${e.message}`);
                res.status(500).json({ error: e.message });
            }
        });

        // スタイル情報取得（icon のみ返す）
        app.get('/api/style-info', async (req, res) => {
            const { speakerUuid, styleId } = req.query;
            if (!speakerUuid || !styleId) return res.status(400).json({ error: "Missing params" });
            try {
                const vv = require('../integrations/voicevox');
                const speakers = map.get("voicevox_speakers");
                if (!speakers) return res.status(503).json({ error: "Speakers not yet loaded" });
                const speaker = speakers.find(s => s.speaker_uuid === speakerUuid);
                if (!speaker) return res.status(404).json({ error: "Speaker not found" });
                const style = speaker.styles.find(s => String(s.id) === String(styleId));
                if (!style) return res.status(404).json({ error: "Style not found" });

                const info = await vv.getSpeakerInfo(speakerUuid);
                const style_info = info?.data?.style_infos?.find(si => String(si.id) === String(styleId));

                res.json({
                    name: `${speaker.name}（${style.name}）`,
                    icon: style_info?.icon ?? null,
                });
            } catch (e) {
                console.error(`[Activity] /api/style-info: ${e.message}`);
                res.status(500).json({ error: e.message });
            }
        });

        // サンプル音声（speaker_infoのvoice_samplesをバイナリで返す）
        app.get('/api/voice-sample', async (req, res) => {
            const { speakerUuid, styleId } = req.query;
            if (!styleId) return res.status(400).json({ error: "Missing styleId" });
            try {
                const vv = require('../integrations/voicevox');

                // speakerUuidがある場合はspeaker_infoから既存サンプルを取得
                if (speakerUuid) {
                    const info = await vv.getSpeakerInfo(speakerUuid);
                    const style_info = info?.data?.style_infos?.find(si => String(si.id) === String(styleId));
                    const sample = style_info?.voice_samples?.[0] ?? null;
                    if (sample && typeof sample === 'string') {
                        const buf = Buffer.from(sample, 'base64');
                        res.set('Content-Type', 'audio/wav');
                        return res.send(buf);
                    }
                }

                // フォールバック: VOICEVOXで合成
                const query = await vv.postAudioQuery('こんにちは、よろしくお願いします。', Number(styleId));
                if (!query?.data) throw new Error('audioQuery failed');
                const wav = await vv.postSynthesis(query, Number(styleId));
                if (!wav?.data) throw new Error('synthesis failed');
                res.set('Content-Type', 'audio/wav');
                res.send(Buffer.isBuffer(wav.data) ? wav.data : Buffer.from(wav.data));
            } catch (e) {
                console.error(`[Activity] /api/voice-sample: ${e.message}`);
                res.status(500).json({ error: e.message });
            }
        });

        // ================================================================
        // 記憶の塔 API
        // ================================================================

// ---- 状態取得 ----
// 現在のラン・残留者の有無・救助待ちフラグを返す
// ---- ミニマップ：探索済みの部屋配置を返す ----
app.get('/api/tower/minimap', async (req, res) => {
    const { userId, guildId, channelId } = req.query;
    if (!userId || !guildId || !channelId) return res.status(400).json({ error: "Missing params" });
    try {
        const db = require('../core/db');
        const user_info  = await db.getUserInfo(userId);
        const guild_info = await db.getGuildInfo(guildId);
        const channelTower = tower.getOrCreateChannelTower(guild_info, channelId);

        const run = user_info.tower_run;
        if (!run || run.seedId !== channelTower.seedId) return res.status(400).json({ error: "進行中のランがありません" });

        const playerRoomId = tower.getRoomIdAt(run.floorData, run.position.x, run.position.y);
        const exploredRooms = run.exploredRooms ?? [];

        const rooms = run.floorData.rooms.map(r => ({
            id: r.id,
            x: r.x, y: r.y, w: r.w, h: r.h,
            explored: exploredRooms.includes(r.id),
            isCurrent: r.id === playerRoomId,
            isStairs: r.x <= run.floorData.stairs.x && run.floorData.stairs.x < r.x + r.w &&
                      r.y <= run.floorData.stairs.y && run.floorData.stairs.y < r.y + r.h,
        }));

        // 探索済みの部屋同士をつなぐ通路だけを返す（未探索エリアの通路形状は見せない）
        const corridors = run.floorData.corridorTiles
            .filter(c => exploredRooms.includes(c.roomA) && exploredRooms.includes(c.roomB))
            .map(c => ({ x: c.x, y: c.y }));

        res.json({
            rooms, corridors,
            gridW: tower.GRID_W, gridH: tower.GRID_H,
            position: run.position,
        });
    } catch (e) {
        console.error(`[Activity] /api/tower/minimap: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});


app.get('/api/tower/state', async (req, res) => {
    const { userId, guildId, channelId } = req.query;
    if (!userId || !guildId || !channelId) return res.status(400).json({ error: "Missing params" });
    try {
        const db = require('../core/db');
        const user_info  = await db.getUserInfo(userId);
        const guild_info = await db.getGuildInfo(guildId);
        const channelTower = tower.getOrCreateChannelTower(guild_info, channelId);
        await db.setGuildInfo(guildId, guild_info); // シード更新があれば保存

        const run = user_info.tower_run ?? null;
        const isAwaitingRescue = run?.seedId === channelTower.seedId && !!user_info.tower_awaiting_rescue;

        res.json({
            run: (run && run.seedId === channelTower.seedId) ? serializeRun(run, channelTower) : null,
            isAwaitingRescue,
            rescueCount: user_info.tower_rescue_count ?? 0,
            seedExpiresAt: tower.getTowerExpiresAt(channelTower),
        });
    } catch (e) {
        console.error(`[Activity] /api/tower/state: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// ---- 新規ラン開始 ----
app.post('/api/tower/start', async (req, res) => {
    const { userId, guildId, channelId, confirmOverrideRescue } = req.body;
    if (!userId || !guildId || !channelId) return res.status(400).json({ error: "Missing params" });
    try {
        const db = require('../core/db');
        const user_info  = await db.getUserInfo(userId);
        const guild_info = await db.getGuildInfo(guildId);
        const channelTower = tower.getOrCreateChannelTower(guild_info, channelId);

        const isAwaitingRescue = user_info.tower_awaiting_rescue && user_info.tower_run?.seedId === channelTower.seedId;
        if (isAwaitingRescue && !confirmOverrideRescue) {
            return res.status(409).json({ error: "あなたは現在誰かの救助を待っています", awaitingRescue: true });
        }

        // 救助待ち状態を上書きする場合、対応する残留者レコードも削除しておく
        if (isAwaitingRescue && confirmOverrideRescue) {
            Object.keys(channelTower.remnants ?? {}).forEach(key => {
                if (channelTower.remnants[key].ownerId === userId) delete channelTower.remnants[key];
            });
        }

        const run = tower.createNewRun(channelTower);
        user_info.tower_run = run;
        user_info.tower_awaiting_rescue = false;
        await db.setUserInfo(userId, user_info);
        await db.setGuildInfo(guildId, guild_info);

        res.json({ run: serializeRun(run, channelTower), log: ['塔への挑戦を開始した。'] });
    } catch (e) {
        console.error(`[Activity] /api/tower/start: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// ---- 移動 ----
app.post('/api/tower/move', async (req, res) => {
    const { userId, guildId, channelId, dx, dy } = req.body;
    if (!userId || !guildId || !channelId || dx === undefined || dy === undefined) {
        return res.status(400).json({ error: "Missing params" });
    }
    try {
        const db = require('../core/db');
        const user_info  = await db.getUserInfo(userId);
        const guild_info = await db.getGuildInfo(guildId);
        const channelTower = tower.getOrCreateChannelTower(guild_info, channelId);

        const run = user_info.tower_run;
        if (!run || run.isDead || run.seedId !== channelTower.seedId) {
            return res.status(400).json({ error: "進行中のランがありません" });
        }

        const log = [];
        const nx = run.position.x + dx;
        const ny = run.position.y + dy;

        const targetEnemy = tower.getEnemyAt(run.floorData, nx, ny);
        if (targetEnemy) {
            const atkBuff = run.buffs.find(b => b.type === 'buff_atk');
            let dmg = tower.getEffectiveAtk(run) + (atkBuff ? atkBuff.value : 0);
            targetEnemy.hp -= dmg;
            log.push(`${targetEnemy.name}に攻撃！ ${dmg}のダメージ`);
            if (targetEnemy.hp <= 0) {
                targetEnemy.alive = false;
                const levelUpMsgs = tower.addExp(run, 3);
                log.push(`${targetEnemy.name}を倒した！`);
                log.push(...levelUpMsgs);
            }
        } else if (tower.isWalkable(run.floorData, nx, ny)) {
            run.position.x = nx;
            run.position.y = ny;

            // 訪れた部屋を探索済みとして記録（ミニマップ用）
            const enteredRoomId = tower.getRoomIdAt(run.floorData, nx, ny);
            if (enteredRoomId !== null) {
                if (!run.exploredRooms) run.exploredRooms = [];
                if (!run.exploredRooms.includes(enteredRoomId)) run.exploredRooms.push(enteredRoomId);
            }

            const key = `${nx},${ny}`;
            const trapName = run.floorData.traps[key];
            if (trapName && !run.discoveredTraps.includes(key)) {
                run.discoveredTraps.push(key);
                log.push(...tower.applyTrap(run, trapName));
            }

            const item = tower.getItemAt(run.floorData, nx, ny);
            if (item && run.inventory.length < run.maxInventory) {
                item.picked = true;
                run.inventory.push({ id: item.id, name: item.name });
                log.push(`${item.name}を手に入れた`);
            }

            run._atStairs = run.floorData.grid[ny][nx] === 2;
            if (run._atStairs) log.push('階段を見つけた！「次へ進む」を押すと下の階へ進める');

            // 残留者チェック（本物）
            const remnant = tower.findRemnantAt(channelTower, run.floor, nx, ny, userId);
            if (remnant) {
                run._pendingRemnant = remnant.id;
                log.push(`残留者「${remnant.ownerName}」を発見した。`);
            } else {
                // 偽りの記憶バフがある間、ごく低確率で「気配だけして誰もいない」誤表示を発生させる
                const fakeRemnantBuff = run.buffs.find(b => b.type === 'fake_remnant');
                if (fakeRemnantBuff && Math.random() < 0.15) {
                    log.push('何かいるような気がしたが、誰もいなかった……');
                }
            }
        } else {
            return res.json({ run: serializeRun(run, channelTower), log: ['そこには進めない'] });
        }

        log.push(...tower.enemyTurn(run));
        log.push(...tower.processStatusEffects(run));
        log.push(...tower.processSatiety(run));

        if (run.hp <= 0) {
            run.isDead = true;
            log.push('力尽きてしまった……');
        }

        user_info.tower_run = run;
        await db.setUserInfo(userId, user_info);
        await db.setGuildInfo(guildId, guild_info);

        const pendingRemnant = run._pendingRemnant
            ? serializeRemnant(channelTower.remnants[run._pendingRemnant])
            : null;

        res.json({ run: serializeRun(run, channelTower), log, pendingRemnant });
    } catch (e) {
        console.error(`[Activity] /api/tower/move: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// ---- アイテム使用 ----
app.post('/api/tower/use-item', async (req, res) => {
    const { userId, guildId, channelId, itemIndex } = req.body;
    if (!userId || !guildId || !channelId || itemIndex === undefined) return res.status(400).json({ error: "Missing params" });
    try {
        const db = require('../core/db');
        const user_info  = await db.getUserInfo(userId);
        const guild_info = await db.getGuildInfo(guildId);
        const channelTower = tower.getOrCreateChannelTower(guild_info, channelId);

        const run = user_info.tower_run;
        if (!run || run.isDead || run.seedId !== channelTower.seedId) return res.status(400).json({ error: "進行中のランがありません" });

        const item = run.inventory[itemIndex];
        if (!item) return res.status(400).json({ error: "アイテムが見つかりません" });

        if (tower.isEquipment(item.name)) {
            return res.status(400).json({ error: "これは装備品です。「装備する」を選んでください" });
        }

        const log = [];

        if (tower.isUnidentifiedSeed(item.name)) {
            log.push(...tower.useUnidentifiedItem(run, item));
            run.inventory.splice(itemIndex, 1);
            if (run.hp <= 0) { run.isDead = true; log.push('力尽きてしまった……'); }
            user_info.tower_run = run;
            await db.setUserInfo(userId, user_info);
            return res.json({ run: serializeRun(run, channelTower), log });
        }

        const eff = tower.ITEM_EFFECTS[item.name];
        if (eff) {
            switch (eff.type) {
                case 'heal_hp':
                    run.hp = Math.min(run.maxHp, run.hp + eff.value);
                    log.push(`${item.name}を使った。HPが${eff.value}回復した`);
                    break;
                case 'heal_satiety':
                    run.satiety = Math.min(run.maxSatiety, run.satiety + eff.value);
                    log.push(`${item.name}を使った。満腹度が${eff.value}回復した`);
                    break;
                case 'buff_atk':
                    run.buffs.push({ type: 'buff_atk', value: eff.value, turns: eff.turns });
                    log.push(`${item.name}を使った。攻撃力が一時的に上がった`);
                    break;
                case 'throw_damage': {
                    const enemies = tower.visibleEnemies(run);
                    const nearest = enemies.find(e => Math.abs(e.x - run.position.x) + Math.abs(e.y - run.position.y) <= 1);
                    if (nearest) {
                        nearest.hp -= eff.value;
                        log.push(`${item.name}を投げた！ ${eff.value}のダメージ`);
                        if (nearest.hp <= 0) {
                            nearest.alive = false;
                            const levelUpMsgs = tower.addExp(run, 3);
                            log.push(`${nearest.name}を倒した！`);
                            log.push(...levelUpMsgs);
                        }
                    } else {
                        log.push(`${item.name}を投げたが、対象がいなかった`);
                    }
                    break;
                }
                default:
                    log.push(`${item.name}を使った`);
            }
        } else {
            log.push(`${item.name}を使ったが、何も起きなかった`);
        }

        run.inventory.splice(itemIndex, 1);
        if (run.hp <= 0) { run.isDead = true; log.push('力尽きてしまった……'); }

        user_info.tower_run = run;
        await db.setUserInfo(userId, user_info);

        res.json({ run: serializeRun(run, channelTower), log });
    } catch (e) {
        console.error(`[Activity] /api/tower/use-item: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// ---- 装備する ----
app.post('/api/tower/equip', async (req, res) => {
    const { userId, guildId, channelId, itemIndex } = req.body;
    if (!userId || !guildId || !channelId || itemIndex === undefined) return res.status(400).json({ error: "Missing params" });
    try {
        const db = require('../core/db');
        const user_info  = await db.getUserInfo(userId);
        const guild_info = await db.getGuildInfo(guildId);
        const channelTower = tower.getOrCreateChannelTower(guild_info, channelId);

        const run = user_info.tower_run;
        if (!run || run.isDead || run.seedId !== channelTower.seedId) return res.status(400).json({ error: "進行中のランがありません" });

        const result = tower.equipItem(run, itemIndex);
        if (result.error) return res.status(400).json({ error: result.error });

        const log = [`${result.equipped}を装備した`];
        if (result.unequipped) log.push(`${result.unequipped}を外した`);

        user_info.tower_run = run;
        await db.setUserInfo(userId, user_info);

        res.json({ run: serializeRun(run, channelTower), log });
    } catch (e) {
        console.error(`[Activity] /api/tower/equip: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// ---- 装備を外す ----
app.post('/api/tower/unequip', async (req, res) => {
    const { userId, guildId, channelId, slot } = req.body;
    if (!userId || !guildId || !channelId || !slot) return res.status(400).json({ error: "Missing params" });
    try {
        const db = require('../core/db');
        const user_info  = await db.getUserInfo(userId);
        const guild_info = await db.getGuildInfo(guildId);
        const channelTower = tower.getOrCreateChannelTower(guild_info, channelId);

        const run = user_info.tower_run;
        if (!run || run.isDead || run.seedId !== channelTower.seedId) return res.status(400).json({ error: "進行中のランがありません" });

        const result = tower.unequipItem(run, slot);
        if (result.error) return res.status(400).json({ error: result.error });

        user_info.tower_run = run;
        await db.setUserInfo(userId, user_info);

        res.json({ run: serializeRun(run, channelTower), log: [`${result.unequipped}を外した`] });
    } catch (e) {
        console.error(`[Activity] /api/tower/unequip: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// ---- その場にアイテムを置く（6章: 完全にローカル・個人のみのデータ） ----
app.post('/api/tower/drop-item', async (req, res) => {
    const { userId, guildId, channelId, itemIndex } = req.body;
    if (!userId || !guildId || !channelId || itemIndex === undefined) return res.status(400).json({ error: "Missing params" });
    try {
        const db = require('../core/db');
        const user_info  = await db.getUserInfo(userId);
        const guild_info = await db.getGuildInfo(guildId);
        const channelTower = tower.getOrCreateChannelTower(guild_info, channelId);

        const run = user_info.tower_run;
        if (!run || run.isDead || run.seedId !== channelTower.seedId) return res.status(400).json({ error: "進行中のランがありません" });

        const result = tower.dropItemHere(run, itemIndex);
        if (result.error) return res.status(400).json({ error: result.error });

        user_info.tower_run = run;
        await db.setUserInfo(userId, user_info);

        res.json({ run: serializeRun(run, channelTower), log: [`${result.dropped}をその場に置いた`] });
    } catch (e) {
        console.error(`[Activity] /api/tower/drop-item: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// ---- その場のアイテムを拾い直す ----
app.post('/api/tower/pickup-item', async (req, res) => {
    const { userId, guildId, channelId } = req.body;
    if (!userId || !guildId || !channelId) return res.status(400).json({ error: "Missing params" });
    try {
        const db = require('../core/db');
        const user_info  = await db.getUserInfo(userId);
        const guild_info = await db.getGuildInfo(guildId);
        const channelTower = tower.getOrCreateChannelTower(guild_info, channelId);

        const run = user_info.tower_run;
        if (!run || run.isDead || run.seedId !== channelTower.seedId) return res.status(400).json({ error: "進行中のランがありません" });

        const result = tower.pickUpLocalDrop(run);
        if (result.error) return res.status(400).json({ error: result.error });

        user_info.tower_run = run;
        await db.setUserInfo(userId, user_info);

        res.json({ run: serializeRun(run, channelTower), log: [`${result.pickedUp}を拾い直した`] });
    } catch (e) {
        console.error(`[Activity] /api/tower/pickup-item: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// ---- 次の階へ ----
app.post('/api/tower/descend', async (req, res) => {
    const { userId, guildId, channelId } = req.body;
    if (!userId || !guildId || !channelId) return res.status(400).json({ error: "Missing params" });
    try {
        const db = require('../core/db');
        const user_info  = await db.getUserInfo(userId);
        const guild_info = await db.getGuildInfo(guildId);
        const channelTower = tower.getOrCreateChannelTower(guild_info, channelId);

        const run = user_info.tower_run;
        if (!run || run.isDead || run.seedId !== channelTower.seedId) return res.status(400).json({ error: "進行中のランがありません" });
        if (!run._atStairs) return res.status(400).json({ error: "階段の上にいません" });

        const result = tower.tryDescend(run, channelTower);
        const log = [];
        if (result.cleared) {
            log.push('🏆 塔を制覇した！');
            user_info.tower_run = null;
            await db.setUserInfo(userId, user_info);
            await db.setGuildInfo(guildId, guild_info);

            // 踏破通知（チャンネルへ）
            await postTowerNotification(channelId, `🏆 ${req.body.userName ?? 'プレイヤー'}が塔を制覇しました！`);

            return res.json({ run: null, cleared: true, log });
        }

        log.push(`${run.floor}Fへ進んだ`);
        user_info.tower_run = run;
        await db.setUserInfo(userId, user_info);
        await db.setGuildInfo(guildId, guild_info);

        res.json({ run: serializeRun(run, channelTower), log });
    } catch (e) {
        console.error(`[Activity] /api/tower/descend: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// ---- 全滅処理：残留者として記録する ----
app.post('/api/tower/remnant', async (req, res) => {
    const { userId, guildId, channelId, userName, bequestSource, bequestItemIndex } = req.body;
    if (!userId || !guildId || !channelId) return res.status(400).json({ error: "Missing params" });
    try {
        const db = require('../core/db');
        const user_info  = await db.getUserInfo(userId);
        const guild_info = await db.getGuildInfo(guildId);
        const channelTower = tower.getOrCreateChannelTower(guild_info, channelId);

        const run = user_info.tower_run;
        if (!run || !run.isDead) return res.status(400).json({ error: "全滅状態ではありません" });

        // bequestSource: 'inventory' | 'weapon' | 'armor'（未指定ならinventory扱い）
        let bequestItem = null;
        const source = bequestSource ?? 'inventory';
        if (source === 'weapon') {
            bequestItem = run.equipment?.weapon ?? null;
        } else if (source === 'armor') {
            bequestItem = run.equipment?.armor ?? null;
        } else if (bequestItemIndex !== undefined && bequestItemIndex !== null) {
            bequestItem = run.inventory[bequestItemIndex] ?? null;
        }

        const remnant = tower.createRemnant(run, userId, userName ?? 'プレイヤー', bequestItem, source);
        channelTower.remnants[remnant.id] = remnant;

        user_info.tower_awaiting_rescue = true;
        // ランは破棄（次は新規挑戦のみ可能。救助されたら別途resumeで復帰）
        user_info.tower_run = null;
        await db.setUserInfo(userId, user_info);
        await db.setGuildInfo(guildId, guild_info);

        await postTowerNotification(channelId, `🕯️ ${userName ?? 'プレイヤー'}が${remnant.floor}Fで力尽きました。誰か助けに向かえるか…？`);

        res.json({ success: true });
    } catch (e) {
        console.error(`[Activity] /api/tower/remnant: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// ---- 全滅処理：撤退（記録を残さない） ----
app.post('/api/tower/abandon-run', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });
    try {
        const db = require('../core/db');
        const user_info = await db.getUserInfo(userId);
        user_info.tower_run = null;
        user_info.tower_awaiting_rescue = false;
        await db.setUserInfo(userId, user_info);
        res.json({ success: true });
    } catch (e) {
        console.error(`[Activity] /api/tower/abandon-run: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// ---- 救助確定処理 ----
app.post('/api/tower/rescue', async (req, res) => {
    const { userId, guildId, channelId, userName, giveItemIndex } = req.body;
    if (!userId || !guildId || !channelId) return res.status(400).json({ error: "Missing params" });
    try {
        const db = require('../core/db');
        const user_info  = await db.getUserInfo(userId);
        const guild_info = await db.getGuildInfo(guildId);
        const channelTower = tower.getOrCreateChannelTower(guild_info, channelId);

        const run = user_info.tower_run;
        if (!run || !run._pendingRemnant) return res.status(400).json({ error: "救助対象が見つかりません" });

        const remnant = channelTower.remnants[run._pendingRemnant];
        if (!remnant) return res.status(404).json({ error: "残留者が見つかりません（既に救助済みかもしれません）" });

        const giveItem = (giveItemIndex !== undefined && giveItemIndex !== null)
            ? run.inventory[giveItemIndex] ?? null
            : null;

        const { rescuerGets, healRescuer } = tower.resolveRescue(channelTower, remnant, giveItem);

        // 救助者の所持品から渡したアイテムを削除
        if (giveItem) {
            const idx = run.inventory.findIndex(it => it.id === giveItem.id);
            if (idx >= 0) run.inventory.splice(idx, 1);
        }
        // 救助者が受け取るアイテム
        if (rescuerGets) run.inventory.push(rescuerGets);
        // どちらも渡さなかった場合の最低保証（maxHpの10%, 最低1）
        if (healRescuer) {
            run.hp = Math.min(run.maxHp, run.hp + Math.max(1, Math.round(run.maxHp * 0.1)));
        }

        run._pendingRemnant = null;
        user_info.tower_run = run;
        user_info.tower_rescue_count = (user_info.tower_rescue_count ?? 0) + 1;
        await db.setUserInfo(userId, user_info);

        // 救助された側のフラグ解除・再開ラン生成
        const owner_info = await db.getUserInfo(remnant.ownerId);
        owner_info.tower_awaiting_rescue = false;
        owner_info.tower_run = tower.buildResumedRun(channelTower, remnant);
        await db.setUserInfo(remnant.ownerId, owner_info);

        await db.setGuildInfo(guildId, guild_info);

        await postTowerNotification(channelId, `✨ ${userName ?? 'プレイヤー'}が${remnant.floor}Fで${remnant.ownerName}を救助しました！`);

        res.json({ run: serializeRun(run, channelTower), log: ['救助した！'] });
    } catch (e) {
        console.error(`[Activity] /api/tower/rescue: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// ---- 救助しない（そのまま通過） ----
app.post('/api/tower/skip-rescue', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });
    try {
        const db = require('../core/db');
        const user_info = await db.getUserInfo(userId);
        if (user_info.tower_run) user_info.tower_run._pendingRemnant = null;
        await db.setUserInfo(userId, user_info);
        res.json({ success: true });
    } catch (e) {
        console.error(`[Activity] /api/tower/skip-rescue: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// ---- 救助待ちプレイヤーが進行中ランを破棄するための明示的なラン取得（救助完了後の再開確認用） ----
app.get('/api/tower/check-resume', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "Missing userId" });
    try {
        const db = require('../core/db');
        const user_info = await db.getUserInfo(userId);
        res.json({
            resumed: !user_info.tower_awaiting_rescue && !!user_info.tower_run,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ================================================================
// ヘルパー
// ================================================================

function serializeRun(run, channelTower) {
    const scrambleBuff = run.buffs.find(b => b.type === 'scramble_unidentified');
    const inventory = run.inventory.map((it, idx) => {
        const isUnidentified = tower.isUnidentifiedSeed(it.name);
        let name;
        if (isUnidentified && scrambleBuff) {
            // 識別の乱れ：実効果は不変だが表示だけ未識別状態に戻る
            name = tower.unidentifiedDisplayName(it.name);
        } else {
            name = tower.getDisplayName(run, it);
        }
        return { id: it.id, name, rawName: it.name, isUnidentified };
    });

    // 視界制限：現在地が部屋の中なら「その部屋＋通路の入口」、通路の中なら「自分の周囲のみ」
    const visibleSet = tower.getVisibleTiles(run.floorData, run.position);
    const visibleCoords = Array.from(visibleSet).map(key => {
        const [x, y] = key.split(',').map(Number);
        return { x, y };
    });
    const minX = Math.min(...visibleCoords.map(c => c.x));
    const maxX = Math.max(...visibleCoords.map(c => c.x));
    const minY = Math.min(...visibleCoords.map(c => c.y));
    const maxY = Math.max(...visibleCoords.map(c => c.y));

    // 揺らぎの記憶：見えている範囲内のタイルだけ見た目を誤表示する（通行判定は本物のグリッドで行うため安全）
    const fakeMapBuff = run.buffs.find(b => b.type === 'fake_map');

    // 視界範囲の部分グリッドを切り出す（見えないマスはnullにして「未知」として扱う）
    const subGrid = [];
    for (let y = minY; y <= maxY; y++) {
        const row = [];
        for (let x = minX; x <= maxX; x++) {
            if (!visibleSet.has(`${x},${y}`)) { row.push(null); continue; }
            let tile = run.floorData.grid[y][x];
            if (fakeMapBuff && Math.random() < 0.08 && tile !== tower.TILE.STAIRS) {
                tile = tile === tower.TILE.WALL ? tower.TILE.FLOOR : tower.TILE.WALL;
            }
            row.push(tile);
        }
        subGrid.push(row);
    }

    const stairsVisible = visibleSet.has(`${run.floorData.stairs.x},${run.floorData.stairs.y}`);

    return {
        floor: run.floor,
        showFloor: run.floor < 20,
        hp: run.hp,
        maxHp: run.maxHp,
        atk: run.atk,
        effectiveAtk: tower.getEffectiveAtk(run),
        effectiveDef: tower.getEffectiveDef(run),
        satiety: run.satiety,
        maxSatiety: run.maxSatiety,
        level: run.level,
        exp: run.exp,
        expRequired: run.level < tower.MAX_LEVEL ? tower.expRequiredFor(run.level) : null,
        position: run.position,
        inventory,
        maxInventory: run.maxInventory,
        equipment: run.equipment,
        buffs: run.buffs,
        isDead: run.isDead,
        atStairs: !!run._atStairs,
        // 視界に応じた部分マップ。viewOrigin が部分マップの (0,0) に対応する実座標
        grid: subGrid,
        viewOrigin: { x: minX, y: minY },
        stairs: stairsVisible ? run.floorData.stairs : null,
        enemies: run.floorData.enemies
            .filter(e => e.alive && visibleSet.has(`${e.x},${e.y}`))
            .map(e => ({ id: e.id, name: e.name, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, aware: !!e.aware })),
        items: run.floorData.items
            .filter(it => !it.picked && visibleSet.has(`${it.x},${it.y}`))
            .map(it => ({
                id: it.id,
                name: tower.isUnidentifiedSeed(it.name) ? tower.unidentifiedDisplayName(it.name) : it.name,
                x: it.x, y: it.y,
            })),
        localDrops: (run.localDrops ?? [])
            .filter(d => visibleSet.has(`${d.x},${d.y}`))
            .map(d => ({ x: d.x, y: d.y, name: d.item.name })),
        localDropHere: !!tower.getLocalDropAt(run, run.position.x, run.position.y),
        discoveredTraps: run.discoveredTraps.filter(key => visibleSet.has(key)),
        pendingRemnantId: run._pendingRemnant ?? null,
    };
}

function serializeRemnant(remnant) {
    if (!remnant) return null;
    return {
        id: remnant.id,
        ownerName: remnant.ownerName,
        floor: remnant.floor,
        hasBequest: !!remnant.bequestFromOwner,
    };
}

async function postTowerNotification(channelId, text) {
    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel) await channel.send(text);
    } catch (e) {
        console.error(`[Activity] postTowerNotification: ${e.message}`);
    }
}


        app.listen(port);
    }
};
