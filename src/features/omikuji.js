/*****************
    omikuji.js
    スニャイヴ
    2026/05/06
*****************/

module.exports = {
    exe: execute
}

const fs = require('fs');
const db = require('../core/db');
const gui = require('../core/gui');
const utils = require('../core/utils');
const gemini = require('../integrations/gemini');

// ドロー
async function draw(trigger, map){
    try{
        const system_id = utils.getSystemId(trigger);
        const user_info = await db.getUserInfo(utils.getUserId(trigger));
        const result = user_info.omikuji_result ?? {
            date : null,
            fortune : null,
            speaker_name : null,
            speaker_uuid : null,
            color : null,
            item : null,
            dinner : null,
            quest : null,
            advice: null
        };

        const vv_speakers = map.get("voicevox_speakers");
        const ai_property_json = map.get("ai_property_json");

        const time = utils.getDate(trigger);
        const today = `${time.year}/${time.month}/${time.date}`;

        //ロード画面
        const road_gui = await utils.sendGUI(utils.getChannelObj(trigger), gui.create(map, "omikuji_draw_roading"));

        //今日すでに実行していたら再送信
        if(result.date === today){
            if(utils.isInteraction(trigger)) await utils.sendGUI(trigger, gui.create(map, "omikuji"));

            await utils.sendGUI(road_gui, gui.create(map, "omikuji_draw",
                {
                    "{{__DATE__}}" : today,
                    "{{__USERNAME__}}" : utils.getUserName(trigger),
                    "{{__FORTUNE__}}" : result.fortune,
                    "{{__SPEAKER__}}" : result.speaker_name,
                    "{{__COLOR__}}" : result.color,
                    "{{__ITEM__}}" : result.item,
                    "{{__DINNER__}}" : result.dinner,
                    "{{__QUEST__}}" : result.quest,
                    "{{__ADVICE__}}" : result.advice
                }
            ));
            return;
        }

        //運勢
        const fortune_random = Math.floor(Math.random() * 100);
        switch(true){
            case fortune_random === 0 : result.fortune = "TOP 1% USER !!!"; break;
            case fortune_random < 5 : result.fortune = "大吉"; break;
            case fortune_random < 20 : result.fortune = "中吉"; break;
            case fortune_random < 40 : result.fortune = "小吉"; break;
            case fortune_random < 60 : result.fortune = "末吉"; break;
            case fortune_random < 80 : result.fortune = "吉"; break;
            case fortune_random < 95 : result.fortune = "凶"; break;
            case fortune_random < 99 : result.fortune = "大凶"; break;
            case fortune_random === 99: result.fortune = "BOTTOM 1% USER..."; break;
            default : result.fortune = "Error"; break;
        }

        //スピーカー
        const speaker_random = Math.floor(Math.random() * vv_speakers.length);
        result.speaker_name = vv_speakers[speaker_random].name;
        result.speaker_uuid = vv_speakers[speaker_random].speaker_uuid;

        //カラー
        result.color = Math.random().toString(16).slice(-6);

        //プロンプトの取得
        for(const element of ai_property_json){
            if(element.id === system_id && element.support === "prompt"){
                try{
                    // レスポンスの取得
                    const gemini_res = await gemini.exeJson(utils.replace(element.text, {"{{__FORTUNE__}}" : result.fortune}), element, map);
                    const gemini_res_json = JSON.parse(gemini_res.candidates[0].content.parts[0].text);
                    result.item = gemini_res_json.item;
                    result.dinner = gemini_res_json.dinner;
                    result.quest = gemini_res_json.quest;
                    result.advice = gemini_res_json.advice;
                }catch(e){
                    if(utils.isInteraction(trigger)) await utils.sendGUI(trigger, gui.create(map, "omikuji"));
                    await utils.sendGUI(road_gui, gui.create(map, "omikuji_draw_failure"));
                    throw new Error(`omikuji.js => draw() \n ${e}`);
                }
            }
        }

        result.date = today;
        user_info.omikuji_result = result;
        await db.setUserInfo(utils.getUserId(trigger), user_info);

        //おみくじ送信
        if(utils.isInteraction(trigger)) await utils.sendGUI(trigger, gui.create(map, "omikuji"));
        await utils.sendGUI(road_gui, gui.create(map, "omikuji_draw",
            {
                "{{__DATE__}}" : result.date,
                "{{__USERNAME__}}" : utils.getUserName(trigger),
                "{{__FORTUNE__}}" : result.fortune,
                "{{__SPEAKER__}}" : result.speaker_name,
                "{{__COLOR__}}" : result.color,
                "{{__ITEM__}}" : result.item,
                "{{__DINNER__}}" : result.dinner,
                "{{__QUEST__}}" : result.quest,
                "{{__ADVICE__}}" : result.advice
            }
        ));

        return;
    }catch(e){
        throw new Error(`omikuji.js => draw() \n ${e}`);
    }
}

// ブースト
async function boost(trigger, map){
    try{
        const system_id = utils.getSystemId(trigger);
        const user_info = await db.getUserInfo(utils.getUserId(trigger));
        const result = user_info.omikuji_result ?? {
            date : null,
            fortune : null,
            speaker_name : null,
            speaker_uuid : null,
            color : null,
            item : null,
            dinner : null,
            quest : null,
            advice: null
        };

        const time = utils.getDate(trigger);
        const today = `${time.year}/${time.month}/${time.date}`;

        //今日のおみくじのデータがあれば続行
        if(result.date === today){
            await utils.sendGUI(trigger, gui.create(map, "omikuji_boost", {"{{__SPEAKER_UUID__}}" : result.speaker_uuid}));
            return;
        }

        await utils.sendGUI(trigger, gui.create(map, "omikuji_boost_failure"));
        return;

    }catch(e){
        throw new Error(`omikuji.js => boost() \n ${e}`);
    }
}

// おみくじコマンド実行
async function execute(trigger, map){
    try{
        const system_id = utils.getSystemId(trigger);

        //延期の送信
        if(utils.isInteraction(trigger) && !system_id.includes("modal")){
            await utils.sendDefer(trigger);
        }

        //ドロー
        if(system_id === "omikuji_draw"){
            await draw(trigger, map);
            return;
        }

        if(system_id === "omikuji_boost"){
            await boost(trigger, map);
            return;
        }

        //GUI送信
        await utils.sendGUI(trigger, gui.create(map, system_id));
        return;

    }catch(e){
        throw new Error(`omikuji.js => execute() \n ${e}`);
    }
}