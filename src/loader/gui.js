/*****************
    gui.js
    スニャイヴ
    2026/05/04
*****************/

module.exports = {
    exe : execute
};

const path = require('path');
const root_dir = path.join(__dirname, "../../");
const file = require('./file');

// GUI の作成
async function execute(map){
    try{
        const gui_dir = path.join(root_dir, "assets/json/gui");
        const gui_json = await file.mergeJsons(gui_dir);
        map.set("gui_json", gui_json);
        
        const image_dir = path.join(root_dir, "assets/image");
        await file.cacheImages(image_dir, map);
        await file.cacheImages(path.join(image_dir, "tsumugi"), map);

        return;
    }catch(e){
        throw new Error(`gui.js => execute() \n ${e}`);
    }
}