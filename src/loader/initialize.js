/********************
    initialize.js
    スニャイヴ
    2026/05/04
********************/

module.exports = {
    exe : execute
};

const path = require('path');
const root_dir = path.join(__dirname, "../../");
const assets_dir = path.join(root_dir, "assets");

const cui = require('./cui');
const file = require('./file');
const gui = require('./gui');

// 初期化
async function execute(client, map){
    try{
        // 各プロパティの読み込み
        const json_dir = path.join(assets_dir, "json");
        const ai_property_json = await file.getJson(path.join(json_dir, "ai/property.json"));
        const reaction_property_json = await file.getJson(path.join(json_dir, "reaction/property.json"));
        const read_property_json = await file.getJson(path.join(json_dir, "read/property.json"));
        map.set("ai_property_json", ai_property_json);
        map.set("reaction_property_json", reaction_property_json);
        map.set("read_property_json", read_property_json);
        
        // README の読み込み
        const readme_md = await file.getMarkdown(path.join(root_dir, "README.md"));
        map.set("readme_md", readme_md);

        // CUI の作成
        await cui.exe(client, map);

        // GUI の作成
        await gui.exe(map);

        // VOICEVOXスピーカーの取得
        const voicevox = require(path.join(root_dir, "src/integrations/voicevox"));
        const speakers = await voicevox.getSpeakers();
        map.set("voicevox_speakers", speakers.data);

        // 機能モジュールの登録
        const features_dir = path.join(root_dir, "src/features");
        map.set("feature_modules",
            {
                "ai" : require(path.join(features_dir, "ai")),
                "faq" : require(path.join(features_dir, "faq")),
                "omikuji": require(path.join(features_dir, "omikuji")),
                "reaction" : require(path.join(features_dir, "reaction")),
                "read": require(path.join(features_dir, "read"))
            }
        );

        return;
    }catch(e){
        throw new Error(`initialize.js => execute() \n ${e}`);
    }
}