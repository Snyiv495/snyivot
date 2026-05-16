/*****************
    file.js
    スニャイヴ
    2026/05/04
*****************/

module.exports = {
    getJson : getJson,
    mergeJsons : mergeJsons,
    getMarkdown : getMarkdown,
    cacheImages : cacheImages
};

const fs = require('fs');
const path = require('path');

// JSON ファイルを取得
async function getJson(file_path){
    try{
        // 拡張子の確認
        const extension = path.extname(file_path).toLowerCase();
        if(extension != ".json") throw new Error(`file is not json : ${file_path}`);

        const json_file = await fs.promises.readFile(file_path, "utf-8");
        const parse_json = JSON.parse(json_file);

        return parse_json;
    }catch(e){
        throw new Error(`file.js => getJson() \n ${e}`);
    }
}

// JSON ファイルの統合
async function mergeJsons(directory_path){
    try{
        const file_pathes = [];
        const entries = await fs.promises.readdir(directory_path, {withFileTypes : true});
        const promises = entries.map(async (entry) => {

            // ファイルの確認
            const extension = path.extname(entry.name).toLowerCase();
            if(!entry.isFile()) return;
            if(extension != ".json") return;

            const file_path = path.join(directory_path, entry.name);
            file_pathes.push(file_path);
        });
        await Promise.all(promises);

        if(!file_pathes.length) throw new Error(`json file not found in directory : ${directory_path}`);
        const merge_json = (await Promise.all(file_pathes.map(path => getJson(path)))).flat();
        
        return merge_json;
    }catch(e){
        throw new Error(`file.js => mergeJsons() \n ${e}`);
    }
}

// Markdown ファイルを取得
async function getMarkdown(file_path){
    try{
        // 拡張子の確認
        const extension = path.extname(file_path).toLowerCase();
        if(extension != ".md") throw new Error(`file is not markdown : ${file_path}`);

        const markdown_file = await fs.promises.readFile(file_path, "utf-8");

        return markdown_file;
    }catch(e){
        throw new Error(`file.js => getMarkdown() \n ${e}`);
    }
}

// 画像のキャッシュ
async function cacheImages(directory_path, map){
    try{
        const entries = await fs.promises.readdir(directory_path, {withFileTypes : true});
        const promises = entries.map(async (entry) => {

            // ファイルの確認
            const extensions = [".png", ".jpg", ".jpeg"];
            const extension = path.extname(entry.name).toLowerCase();
            if(!entry.isFile()) return;
            if(!extensions.includes(extension)) return;

            const image_path = path.join(directory_path, entry.name);
            const key = image_path.replace(/\\/g, "/");
            const buffer = await fs.promises.readFile(image_path);
            map.set(key, buffer);
        });
        await Promise.all(promises);

        return;
    }catch(e){
        throw new Error(`gui.js => cacheImages() \n ${e}`);
    }
}