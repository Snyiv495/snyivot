/*****************
    event.js
    スニャイヴ
    2026/05/04
*****************/

module.exports = {
    exe: execute
};

const fs = require('fs');
const path = require('path');
const root_dir = path.join(__dirname, "../");

// イベント登録
async function execute(client, map){
    try{
        const event_dir = path.join(root_dir, "events");
        const event_files = fs.readdirSync(event_dir).filter(file => file.endsWith(".js"));

        for(const file of event_files){
            const file_path = path.join(event_dir, file);
            const event = require(file_path);
            const event_name = file.split(".")[0];

            // 各イベントファイルを client に紐付け
            client.on(event_name, (...args) => event.exe(...args, map));
        }

        return;
    }catch(e){
        throw new Error(`event.js => execute() \n ${e}`);
    }
}