/*****************
    tower-engine.js
    記憶の塔 - ゲームロジック（第2段階：週次シード・残留者・救助）
*****************/

const GRID_W = 45;
const GRID_H = 33;
const TILE = { WALL: 0, FLOOR: 1, STAIRS: 2 };
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FLOOR = 30;
const MIN_ROOMS_PER_FLOOR = 9;
// 識別前アイテムの「種」キー（generateFloorで参照するため先頭で定義）
const SCROLL_SEEDS = ['scroll_a', 'scroll_b', 'scroll_c', 'scroll_d'];
const BERRY_SEEDS  = ['berry_a', 'berry_b', 'berry_c', 'berry_d'];

// ================================================================
// 乱数生成（シード固定）
// ================================================================

function mulberry32(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ================================================================
// チャンネル単位の塔（週次シード）管理
// ================================================================

function getOrCreateChannelTower(guild_info, channelId) {
    if (!guild_info.towers) guild_info.towers = {};
    let tower = guild_info.towers[channelId];
    const now = Date.now();

    if (!tower || (now - tower.createdAt) >= WEEK_MS) {
        tower = {
            seedId: `${channelId}-${now}`,
            seedValue: Math.floor(Math.random() * 1000000),
            createdAt: now,
            remnants: {},
        };
        guild_info.towers[channelId] = tower;
    }
    return tower;
}

function getTowerExpiresAt(tower) {
    return tower.createdAt + WEEK_MS;
}

// ================================================================
// マップ生成（部屋グラフ + 幅1マスの通路）
// ================================================================
//
// 1つのフロア(F)は最低9個の「部屋(room)」で構成され、それぞれ幅1マスの通路で
// 一本道（木構造）に接続される。プレイヤーが見える範囲は「今いる部屋の中身」と
// 「部屋から伸びる通路の入口（隣接1マス）」のみ。通路の中にいる場合は通路だけが見える。

function carveRoom(grid, x, y, w, h) {
    for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
            grid[yy][xx] = TILE.FLOOR;
        }
    }
}

function carveCorridor(grid, ax, ay, bx, by) {
    // 幅1マスのL字通路を掘り、通った座標のリストを返す
    const path = [];
    let cx = ax, cy = ay;
    path.push({ x: cx, y: cy });
    while (cx !== bx) {
        cx += cx < bx ? 1 : -1;
        grid[cy][cx] = TILE.FLOOR;
        path.push({ x: cx, y: cy });
    }
    while (cy !== by) {
        cy += cy < by ? 1 : -1;
        grid[cy][cx] = TILE.FLOOR;
        path.push({ x: cx, y: cy });
    }
    return path;
}

function generateFloor(seedValue, floorNum) {
    const rng = mulberry32(seedValue + floorNum * 7919);
    const grid = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(TILE.WALL));

    // 部屋を最低9個、ランダムサイズでグリッド上に配置（重なり回避の単純なリトライ方式）
    const roomCount = MIN_ROOMS_PER_FLOOR + Math.floor(rng() * 3); // 9〜11個
    const rooms = [];
    let attempts = 0;
    while (rooms.length < roomCount && attempts < roomCount * 30) {
        attempts++;
        const w = 3 + Math.floor(rng() * 3); // 3〜5
        const h = 3 + Math.floor(rng() * 3);
        const x = 1 + Math.floor(rng() * (GRID_W - w - 2));
        const y = 1 + Math.floor(rng() * (GRID_H - h - 2));
        const candidate = { x, y, w, h };
        // 既存の部屋と余裕を持って重ならないかチェック
        const overlaps = rooms.some(r =>
            candidate.x - 2 < r.x + r.w && candidate.x + candidate.w + 2 > r.x &&
            candidate.y - 2 < r.y + r.h && candidate.y + candidate.h + 2 > r.y
        );
        if (!overlaps) rooms.push(candidate);
    }

    rooms.forEach((r, i) => {
        carveRoom(grid, r.x, r.y, r.w, r.h);
        r.id = i;
        r.centerX = r.x + Math.floor(r.w / 2);
        r.centerY = r.y + Math.floor(r.h / 2);
    });

    // 部屋を一本道（木構造）でつなぐ：各部屋から最も近い「まだ繋がっていない」部屋へ通路を掘る
    const connected = [rooms[0]];
    const unconnected = rooms.slice(1);
    const corridorTiles = []; // {x,y, roomA, roomB} 通路座標の一覧（視界判定・部屋判定に使う）
    const adjacency = {}; // roomId -> [roomId, ...]
    rooms.forEach(r => { adjacency[r.id] = []; });

    while (unconnected.length > 0) {
        let bestPair = null;
        let bestDist = Infinity;
        connected.forEach(a => {
            unconnected.forEach(b => {
                const d = Math.abs(a.centerX - b.centerX) + Math.abs(a.centerY - b.centerY);
                if (d < bestDist) { bestDist = d; bestPair = [a, b]; }
            });
        });
        const [a, b] = bestPair;
        const path = carveCorridor(grid, a.centerX, a.centerY, b.centerX, b.centerY);
        path.forEach(p => corridorTiles.push({ x: p.x, y: p.y, roomA: a.id, roomB: b.id }));
        adjacency[a.id].push(b.id);
        adjacency[b.id].push(a.id);
        connected.push(b);
        unconnected.splice(unconnected.indexOf(b), 1);
    }

    // 各タイルがどの部屋に属するか（通路は roomId = null）のルックアップを作る
    const roomIdAt = {};
    rooms.forEach(r => {
        for (let yy = r.y; yy < r.y + r.h; yy++) {
            for (let xx = r.x; xx < r.x + r.w; xx++) {
                roomIdAt[`${xx},${yy}`] = r.id;
            }
        }
    });

    const start = { x: rooms[0].centerX, y: rooms[0].centerY };
    const lastRoom = rooms[rooms.length - 1];
    const stairs = { x: lastRoom.centerX, y: lastRoom.centerY };
    grid[stairs.y][stairs.x] = TILE.STAIRS;

    const floorTiles = [];
    rooms.forEach(r => {
        for (let yy = r.y; yy < r.y + r.h; yy++) {
            for (let xx = r.x; xx < r.x + r.w; xx++) {
                if (!(xx === start.x && yy === start.y)) floorTiles.push({ x: xx, y: yy, roomId: r.id });
            }
        }
    });

    const trapRatio = 0.04 + 0.06 * (floorNum / MAX_FLOOR);
    const trapCount = Math.max(1, Math.floor(floorTiles.length * trapRatio));
    const traps = {};
    const trapTypes = [
        '痛みの記憶', '毒だまりの記憶', '混乱の記憶', '後退りの記憶', '静寂の記憶', '空腹の記憶',
        '忘れ物の記憶', '識別の乱れ', '散らばる記憶', '呼び声の記憶', '揺らぎの記憶', '偽りの記憶',
    ];
    for (let i = 0; i < trapCount; i++) {
        const tile = floorTiles[Math.floor(rng() * floorTiles.length)];
        const key = `${tile.x},${tile.y}`;
        if (!traps[key]) traps[key] = trapTypes[Math.floor(rng() * trapTypes.length)];
    }

    // 敵：部屋ごとに0〜1体配置（スタート部屋・階段部屋は除く）。フロアが深いほど出現率が上がる
    const enemies = [];
    const enemyNames = ['記憶の残骸', '迷い影', '囚われ霧', '忘れ物の手'];
    const spawnChance = Math.min(0.85, 0.4 + floorNum * 0.015);
    rooms.forEach(r => {
        if (r.id === rooms[0].id || r.id === lastRoom.id) return;
        if (rng() >= spawnChance) return;
        // 部屋内のランダムなタイルに配置
        const ex = r.x + Math.floor(rng() * r.w);
        const ey = r.y + Math.floor(rng() * r.h);
        enemies.push({
            id: `e${enemies.length}`,
            name: enemyNames[Math.floor(rng() * enemyNames.length)],
            x: ex, y: ey,
            homeRoomId: r.id,
            hp: Math.round(8 * (1 + floorNum * 0.08)),
            maxHp: Math.round(8 * (1 + floorNum * 0.08)),
            atk: Math.round(3 * (1 + floorNum * 0.08)),
            alive: true,
            aware: false, // プレイヤーを発見しているか（同じ部屋にいるかで判定）
        });
    });

    // アイテム：部屋ごとに抽選で配置
    const itemDefs = ['安らぎの記憶', '満たされた記憶', '怒りの記憶', '確信の残響'];
    const equipDefs = ['砕けぬ覚悟', '掠れた誓い', '名残の盾', '忘れ得ぬ鎧'];
    const unidentifiedSeeds = [...SCROLL_SEEDS, ...BERRY_SEEDS];
    const items = [];
    rooms.forEach(r => {
        if (r.id === rooms[0].id) return;
        if (rng() >= 0.55) return;
        const ix = r.x + Math.floor(rng() * r.w);
        const iy = r.y + Math.floor(rng() * r.h);
        const roll = rng();
        let pool;
        if (roll < 0.2) pool = equipDefs;
        else if (roll < 0.45) pool = unidentifiedSeeds;
        else pool = itemDefs;
        items.push({ id: `i${items.length}`, name: pool[Math.floor(rng() * pool.length)], x: ix, y: iy, picked: false });
    });

    return {
        grid, start, stairs, traps, enemies, items, floorNum,
        rooms, roomIdAt, corridorTiles, adjacency,
    };
}

// ================================================================
// 視界・現在位置の判定ヘルパー
// ================================================================

function getRoomIdAt(floorData, x, y) {
    const id = floorData.roomIdAt[`${x},${y}`];
    return id !== undefined ? id : null;
}

function isInCorridor(floorData, x, y) {
    return getRoomIdAt(floorData, x, y) === null && floorData.grid[y]?.[x] === TILE.FLOOR;
}

// プレイヤーの現在地に応じて見えるタイル座標の集合を返す
// - 部屋の中にいる場合：その部屋全体 + そこから伸びる通路の入口1マスずつ
// - 通路の中にいる場合：自分のいる通路だけ（前後1マス分を含む、部屋の中身は見せない）
function getVisibleTiles(floorData, position) {
    const visible = new Set();
    const roomId = getRoomIdAt(floorData, position.x, position.y);

    if (roomId !== null) {
        const room = floorData.rooms.find(r => r.id === roomId);
        for (let yy = room.y; yy < room.y + room.h; yy++) {
            for (let xx = room.x; xx < room.x + room.w; xx++) {
                visible.add(`${xx},${yy}`);
            }
        }
        // この部屋に接続する通路の「入口1マス」だけ見せる
        floorData.corridorTiles.forEach(c => {
            if (c.roomA === roomId || c.roomB === roomId) {
                // 部屋に隣接している通路タイルのみ（部屋の境界から1マス分）
                const adjToRoom = (
                    (Math.abs(c.x - room.x) <= 1 || Math.abs(c.x - (room.x + room.w - 1)) <= 1) &&
                    (Math.abs(c.y - room.y) <= 1 || Math.abs(c.y - (room.y + room.h - 1)) <= 1)
                );
                if (adjToRoom) visible.add(`${c.x},${c.y}`);
            }
        });
    } else {
        // 通路の中：自分の周囲1マス（前後左右）だけを見せる
        visible.add(`${position.x},${position.y}`);
        [[0,1],[0,-1],[1,0],[-1,0]].forEach(([dx, dy]) => {
            const nx = position.x + dx, ny = position.y + dy;
            if (floorData.grid[ny]?.[nx] === TILE.FLOOR) visible.add(`${nx},${ny}`);
        });
    }

    return visible;
}

// ================================================================
// アイテム・罠効果
// ================================================================

const ITEM_EFFECTS = {
    '安らぎの記憶':   { type: 'heal_hp', value: 8 },
    '満たされた記憶': { type: 'heal_satiety', value: 30 },
    '怒りの記憶':     { type: 'throw_damage', value: 6 },
    '確信の残響':     { type: 'buff_atk', value: 2, turns: 5 },
};

// 装備品（7章: 暫定の2スロット制。武器=攻撃力加算、防具=被ダメージ軽減）
const EQUIPMENT_DEFS = {
    '砕けぬ覚悟':   { slot: 'weapon', atkBonus: 3 },
    '掠れた誓い':   { slot: 'weapon', atkBonus: 5 },
    '名残の盾':     { slot: 'armor',  defBonus: 2 },
    '忘れ得ぬ鎧':   { slot: 'armor',  defBonus: 4 },
};

function isEquipment(name) {
    return !!EQUIPMENT_DEFS[name];
}

// ================================================================
// 識別前アイテム（7章: 巻物/きのみ相当のギャンブル枠）
// ================================================================
//
// 「綴られなかった言葉（巻物）」「名もなき記憶（きのみ）」は見た目上の表示名で、
// ラン開始時に内部の「種」とランダムな実体効果がシャッフルされて結びつく。
// 1度でも使えば、そのランの間は同じ種＝同じ効果として識別済み表示になる。

const SCROLL_POOL = [
    { name: '見抜きの言葉',   type: 'reveal_trap',  desc: '周囲の罠をすべて可視化する' },
    { name: '研磨の言葉',     type: 'buff_atk',      value: 4, turns: 8, desc: '攻撃力が大きく上がる' },
    { name: '崩落の言葉',     type: 'damage_self',   value: 5, desc: '使った瞬間に少し傷つく' },
    { name: '帰還の言葉',     type: 'heal_hp_full',  desc: 'HPが全回復する' },
];

const BERRY_POOL = [
    { name: '甘い記憶',       type: 'heal_hp',       value: 10, desc: 'HPが少し回復する' },
    { name: '苦い記憶',       type: 'damage_self',   value: 4,  desc: '少し傷つく' },
    { name: '満ちる記憶',     type: 'heal_satiety',  value: 40, desc: '満腹度が大きく回復する' },
    { name: '萎える記憶',     type: 'debuff_atk',    value: -2, turns: 5, desc: '一時的に攻撃力が下がる' },
];

function shuffleArray(arr, rng) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// チャンネルの塔の週次シードから、このラン（プレイヤー単位）の識別対応表を生成
// 救助されて再開する場合も同じ対応表を引き継ぐ必要があるため、
// run.unidentifiedMap として run 自体に保持する
function generateUnidentifiedMap(seedValue) {
    const rng = mulberry32(seedValue + 99991);
    const shuffledScrollEffects = shuffleArray(SCROLL_POOL, rng);
    const shuffledBerryEffects  = shuffleArray(BERRY_POOL, rng);

    const map = {};
    SCROLL_SEEDS.forEach((seedKey, i) => { map[seedKey] = shuffledScrollEffects[i]; });
    BERRY_SEEDS.forEach((seedKey, i) => { map[seedKey] = shuffledBerryEffects[i]; });
    return map;
}

function isUnidentifiedSeed(name) {
    return SCROLL_SEEDS.includes(name) || BERRY_SEEDS.includes(name);
}

function unidentifiedDisplayName(seedKey) {
    return SCROLL_SEEDS.includes(seedKey) ? '綴られなかった言葉' : '名もなき記憶';
}

// 表示用：識別済みならその実体名、未識別ならカテゴリ名を返す
function getDisplayName(run, item) {
    if (!isUnidentifiedSeed(item.name)) return item.name;
    if (run.identified && run.identified.includes(item.name)) {
        return run.unidentifiedMap[item.name].name;
    }
    return unidentifiedDisplayName(item.name);
}

// 使用処理：効果を適用し、識別済みにする
function useUnidentifiedItem(run, item) {
    const effect = run.unidentifiedMap[item.name];
    if (!effect) return ['よく分からないものだった……'];

    if (!run.identified) run.identified = [];
    if (!run.identified.includes(item.name)) run.identified.push(item.name);

    const log = [`${effect.name}だった！`];
    switch (effect.type) {
        case 'heal_hp':
            run.hp = Math.min(run.maxHp, run.hp + effect.value);
            log.push(`HPが${effect.value}回復した`);
            break;
        case 'heal_hp_full':
            run.hp = run.maxHp;
            log.push('HPが全回復した');
            break;
        case 'heal_satiety':
            run.satiety = Math.min(run.maxSatiety, run.satiety + effect.value);
            log.push(`満腹度が${effect.value}回復した`);
            break;
        case 'damage_self':
            run.hp = Math.max(0, run.hp - effect.value);
            log.push(`${effect.value}のダメージを受けた`);
            break;
        case 'buff_atk':
            run.buffs.push({ type: 'buff_atk', value: effect.value, turns: effect.turns });
            log.push('攻撃力が一時的に上がった');
            break;
        case 'debuff_atk':
            run.buffs.push({ type: 'buff_atk', value: effect.value, turns: effect.turns });
            log.push('攻撃力が一時的に下がった');
            break;
        case 'reveal_trap':
            Object.keys(run.floorData.traps).forEach(key => {
                if (!run.discoveredTraps.includes(key)) run.discoveredTraps.push(key);
            });
            log.push('周囲の罠の位置が分かった');
            break;
        default:
            log.push('何も起きなかった');
    }
    return log;
}

const TRAP_EFFECTS = {
    '痛みの記憶':     { type: 'damage', value: 4 },
    '毒だまりの記憶': { type: 'poison', turns: 4, value: 1 },
    '混乱の記憶':     { type: 'confuse', turns: 3 },
    '後退りの記憶':   { type: 'knockback' },
    '静寂の記憶':     { type: 'stealth', turns: 3 },
    '空腹の記憶':     { type: 'satiety_drain', value: 15 },
    '忘れ物の記憶':   { type: 'lose_random_item' },
    '識別の乱れ':     { type: 'scramble_unidentified' },
    '散らばる記憶':   { type: 'shuffle_inventory' },
    '呼び声の記憶':   { type: 'aggro_nearby' },
    '揺らぎの記憶':   { type: 'fake_map', turns: 5 },
    '偽りの記憶':     { type: 'fake_remnant', turns: 5 },
};

// ================================================================
// レベル成長（7章: 暫定の線形成長曲線）
// ================================================================

const MAX_LEVEL = 20;
const BASE_HP = 30;
const BASE_ATK = 5;
const HP_PER_LEVEL = 4;
const ATK_PER_LEVEL = 1;

function expRequiredFor(level) {
    // 次のレベルに必要な累積経験値ではなく、「そのレベルから次へ上がるのに必要な経験値」
    return level * 10;
}

function statsForLevel(level) {
    const lv = Math.max(1, Math.min(MAX_LEVEL, level));
    return {
        maxHp: BASE_HP + (lv - 1) * HP_PER_LEVEL,
        atk:   BASE_ATK + (lv - 1) * ATK_PER_LEVEL,
    };
}

// 経験値を加算し、レベルアップが発生した場合はその回数とログを返す
function addExp(run, amount) {
    run.exp += amount;
    const messages = [];
    while (run.level < MAX_LEVEL && run.exp >= expRequiredFor(run.level)) {
        run.exp -= expRequiredFor(run.level);
        run.level += 1;
        const stats = statsForLevel(run.level);
        const hpDiff = stats.maxHp - run.maxHp;
        run.maxHp = stats.maxHp;
        run.hp = Math.min(run.maxHp, run.hp + hpDiff); // 上がった分だけ現HPも回復
        run.atk = stats.atk;
        messages.push(`レベルが${run.level}に上がった！ HP上限が${stats.maxHp}になった`);
    }
    return messages;
}

// ================================================================
// 新規ラン開始
// ================================================================

function createNewRun(tower) {
    const floor = generateFloor(tower.seedValue, 1);
    const stats = statsForLevel(1);
    const startRoomId = getRoomIdAt(floor, floor.start.x, floor.start.y);
    return {
        seedId: tower.seedId,
        floor: 1,
        maxFloor: MAX_FLOOR,
        hp: stats.maxHp,
        maxHp: stats.maxHp,
        atk: stats.atk,
        satiety: 100,
        maxSatiety: 100,
        level: 1,
        exp: 0,
        turnCount: 0,
        position: { x: floor.start.x, y: floor.start.y },
        inventory: [],
        maxInventory: 10,
        equipment: { weapon: null, armor: null },
        unidentifiedMap: generateUnidentifiedMap(tower.seedValue),
        identified: [],
        discoveredTraps: [],
        exploredRooms: startRoomId !== null ? [startRoomId] : [],
        buffs: [],
        floorData: floor,
        isDead: false,
        isAwaitingRescue: false,
    };
}

// ================================================================
// 補助関数
// ================================================================

function isWalkable(floorData, x, y) {
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return false;
    return floorData.grid[y][x] !== TILE.WALL;
}
function getEnemyAt(floorData, x, y) {
    return floorData.enemies.find(e => e.alive && e.x === x && e.y === y) ?? null;
}
function getItemAt(floorData, x, y) {
    return floorData.items.find(it => !it.picked && it.x === x && it.y === y) ?? null;
}
function visibleEnemies(run) {
    return run.floorData.enemies.filter(e => e.alive);
}

function applyTrap(run, trapName) {
    const eff = TRAP_EFFECTS[trapName];
    if (!eff) return [`${trapName}に触れたが何も起きなかった`];
    switch (eff.type) {
        case 'damage':
            run.hp = Math.max(0, run.hp - eff.value);
            return [`${trapName}！ ${eff.value}のダメージを受けた`];
        case 'poison':
            run.buffs.push({ type: 'poison', turns: eff.turns, value: eff.value });
            return [`${trapName}！ 毒状態になった`];
        case 'confuse':
            run.buffs.push({ type: 'confuse', turns: eff.turns });
            return [`${trapName}！ 混乱状態になった`];
        case 'knockback': {
            const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
            const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
            const nx = run.position.x + dx, ny = run.position.y + dy;
            if (isWalkable(run.floorData, nx, ny)) { run.position.x = nx; run.position.y = ny; }
            return [`${trapName}！ 後ろに飛ばされた`];
        }
        case 'stealth':
            run.buffs.push({ type: 'stealth', turns: eff.turns });
            return [`${trapName}！ しばらく敵に見つかりにくくなった（当たり）`];
        case 'satiety_drain':
            run.satiety = Math.max(0, run.satiety - eff.value);
            return [`${trapName}！ お腹が大きく減った`];
        case 'lose_random_item': {
            // 持ち物・装備を合わせた対象からランダムに1つ失う（何もなければ空振り）
            const pool = [...run.inventory.map((_, i) => ({ kind: 'inv', index: i }))];
            if (run.equipment?.weapon) pool.push({ kind: 'weapon' });
            if (run.equipment?.armor) pool.push({ kind: 'armor' });
            if (pool.length === 0) return [`${trapName}！ だが何も失わなかった`];
            const pick = pool[Math.floor(Math.random() * pool.length)];
            let lostName = '';
            if (pick.kind === 'inv') {
                lostName = run.inventory[pick.index].name;
                run.inventory.splice(pick.index, 1);
            } else {
                lostName = run.equipment[pick.kind].name;
                run.equipment[pick.kind] = null;
            }
            return [`${trapName}！ ${lostName}を失ってしまった`];
        }
        case 'scramble_unidentified': {
            // 未識別アイテムの「表示」を一時的に混乱させる（実効果は不変）。
            // ここでは識別済みリストを一時的に隠すフラグを立て、数ターンで解除する。
            run.buffs.push({ type: 'scramble_unidentified', turns: 3 });
            return [`${trapName}！ 未識別アイテムの見え方が一時的に乱れた`];
        }
        case 'shuffle_inventory': {
            for (let i = run.inventory.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [run.inventory[i], run.inventory[j]] = [run.inventory[j], run.inventory[i]];
            }
            return [`${trapName}！ 持ち物の並びがシャッフルされた`];
        }
        case 'aggro_nearby': {
            // 同じ部屋にいる敵を覚醒させる（新しい部屋グラフ構造に合わせて「周囲6マス」から変更）
            const roomId = getRoomIdAt(run.floorData, run.position.x, run.position.y);
            let count = 0;
            run.floorData.enemies.forEach(enemy => {
                if (!enemy.alive) return;
                const enemyRoomId = getRoomIdAt(run.floorData, enemy.x, enemy.y);
                if (roomId !== null && enemyRoomId === roomId) { enemy.aggro = true; count++; }
            });
            return count > 0
                ? [`${trapName}！ 周囲の気配が一斉にこちらへ向いた（${count}体）`]
                : [`${trapName}！ だが、近くに何の気配もなかった`];
        }
        case 'fake_map': {
            run.buffs.push({ type: 'fake_map', turns: eff.turns });
            return [`${trapName}！ 視界が歪んで見える……`];
        }
        case 'fake_remnant': {
            run.buffs.push({ type: 'fake_remnant', turns: eff.turns });
            return [`${trapName}！ どこかで誰かの気配がした気がした……`];
        }
        default:
            return [`${trapName}に触れた`];
    }
}

function enemyTurn(run) {
    const messages = [];
    const def = getEffectiveDef(run);
    const playerRoomId = getRoomIdAt(run.floorData, run.position.x, run.position.y);

    for (const enemy of run.floorData.enemies) {
        if (!enemy.alive) continue;

        const enemyRoomId = getRoomIdAt(run.floorData, enemy.x, enemy.y);
        // 同じ部屋にいる場合のみ発見状態になる（呼び声の記憶でaggroが立っている場合は部屋を問わず発見扱い）
        const sameRoom = playerRoomId !== null && enemyRoomId === playerRoomId;
        enemy.aware = sameRoom || !!enemy.aggro;

        const dx = run.position.x - enemy.x;
        const dy = run.position.y - enemy.y;
        const dist = Math.abs(dx) + Math.abs(dy);

        if (enemy.aware && dist === 1) {
            const dmg = Math.max(1, enemy.atk - def);
            run.hp = Math.max(0, run.hp - dmg);
            messages.push(`${enemy.name}の攻撃！ ${dmg}のダメージ`);
            continue;
        }

        if (enemy.aware) {
            // プレイヤーを追跡
            const stepX = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
            const stepY = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
            if (stepX !== 0 && isWalkable(run.floorData, enemy.x + stepX, enemy.y) && !getEnemyAt(run.floorData, enemy.x + stepX, enemy.y)) {
                enemy.x += stepX;
            } else if (stepY !== 0 && isWalkable(run.floorData, enemy.x, enemy.y + stepY) && !getEnemyAt(run.floorData, enemy.x, enemy.y + stepY)) {
                enemy.y += stepY;
            }
        } else {
            // 未発見：自分のホーム部屋の中だけをランダムに徘徊する
            if (Math.random() < 0.5) continue; // 半分くらいの確率で足踏み（動きすぎないように）
            const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
            const [ddx, ddy] = dirs[Math.floor(Math.random() * dirs.length)];
            const nx = enemy.x + ddx, ny = enemy.y + ddy;
            const nRoomId = getRoomIdAt(run.floorData, nx, ny);
            // ホーム部屋の外（通路）へは出ない
            if (nRoomId === enemy.homeRoomId && isWalkable(run.floorData, nx, ny) && !getEnemyAt(run.floorData, nx, ny)) {
                enemy.x = nx;
                enemy.y = ny;
            }
        }
    }
    return messages;
}

function processStatusEffects(run) {
    const messages = [];
    run.buffs = run.buffs.filter(b => {
        if (b.type === 'poison') {
            run.hp = Math.max(0, run.hp - b.value);
            messages.push(`毒のダメージ！ ${b.value}`);
        }
        b.turns -= 1;
        return b.turns > 0;
    });
    return messages;
}

function processSatiety(run) {
    const messages = [];
    run.turnCount += 1;
    if (run.turnCount % 10 === 0) run.satiety = Math.max(0, run.satiety - 1);
    if (run.satiety <= 0 && run.turnCount % 5 === 0) {
        run.hp = Math.max(0, run.hp - 1);
        messages.push('お腹が空いて体力が削れている…');
    }
    return messages;
}

function tryDescend(run, tower) {
    if (run.floor >= run.maxFloor) return { cleared: true };
    run.floor += 1;
    run.floorData = generateFloor(tower.seedValue, run.floor);
    run.position = { x: run.floorData.start.x, y: run.floorData.start.y };
    run.discoveredTraps = [];
    run.localDrops = []; // フロアが変わったら置いたアイテムは失われる（仕様書6章準拠）
    const startRoomId = getRoomIdAt(run.floorData, run.position.x, run.position.y);
    run.exploredRooms = startRoomId !== null ? [startRoomId] : [];
    return { cleared: false };
}

// ================================================================
// 残留者・救助システム
// ================================================================

// bequestSource: 'inventory' | 'weapon' | 'armor'（託すものがどこにあるか）
function createRemnant(run, ownerId, ownerName, bequestItem, bequestSource) {
    const equipment = { ...run.equipment };
    let snapshotInventory = [...run.inventory];

    if (bequestItem) {
        if (bequestSource === 'weapon') equipment.weapon = null;
        else if (bequestSource === 'armor') equipment.armor = null;
        else snapshotInventory = snapshotInventory.filter(it => it.id !== bequestItem.id);
    }

    return {
        id: `r_${ownerId}_${Date.now()}`,
        ownerId,
        ownerName,
        seedId: run.seedId,
        floor: run.floor,
        position: { ...run.position },
        snapshotInventory,
        snapshotEquipment: equipment,
        snapshotLevel: run.level,
        snapshotIdentified: [...(run.identified ?? [])],
        bequestFromOwner: bequestItem ?? null,
        bequestFromRescuer: null,
        createdAt: Date.now(),
    };
}

function findRemnantAt(tower, floor, x, y, excludeOwnerId) {
    return Object.values(tower.remnants ?? {}).find(r =>
        r.floor === floor && r.position.x === x && r.position.y === y && r.ownerId !== excludeOwnerId
    ) ?? null;
}

function resolveRescue(tower, remnant, rescuerItem) {
    remnant.bequestFromRescuer = rescuerItem ?? null;
    const rescuerGets = remnant.bequestFromOwner ?? null;
    const healRescuer = !rescuerItem && !remnant.bequestFromOwner;
    delete tower.remnants[remnant.id];
    return { rescuerGets, healRescuer };
}

function buildResumedRun(tower, remnant) {
    const floorData = generateFloor(tower.seedValue, remnant.floor);
    const inventory = [...remnant.snapshotInventory];
    if (remnant.bequestFromRescuer) inventory.push(remnant.bequestFromRescuer);

    const stats = statsForLevel(remnant.snapshotLevel);
    return {
        seedId: tower.seedId,
        floor: remnant.floor,
        maxFloor: MAX_FLOOR,
        hp: Math.max(1, Math.round(stats.maxHp * 0.5)),
        maxHp: stats.maxHp,
        atk: stats.atk,
        satiety: Math.round(100 * 0.5),
        maxSatiety: 100,
        level: remnant.snapshotLevel,
        exp: 0,
        turnCount: 0,
        position: { ...remnant.position },
        inventory,
        maxInventory: 10,
        equipment: remnant.snapshotEquipment ?? { weapon: null, armor: null },
        // 識別状況はチャンネルの塔（同一シード）に共通のため、同じシードから再生成すれば対応表は一致する。
        // 識別済みリストは個人の記憶として保持（このプレイヤーが識別したものを覚えている）
        unidentifiedMap: generateUnidentifiedMap(tower.seedValue),
        identified: remnant.snapshotIdentified ?? [],
        discoveredTraps: [],
        exploredRooms: (() => {
            const rid = getRoomIdAt(floorData, remnant.position.x, remnant.position.y);
            return rid !== null ? [rid] : [];
        })(),
        buffs: [],
        floorData,
        isDead: false,
        isAwaitingRescue: false,
    };
}

function getEffectiveAtk(run) {
    const weapon = run.equipment?.weapon ? EQUIPMENT_DEFS[run.equipment.weapon.name] : null;
    return (run.atk ?? 5) + (weapon?.atkBonus ?? 0);
}

function getEffectiveDef(run) {
    const armor = run.equipment?.armor ? EQUIPMENT_DEFS[run.equipment.armor.name] : null;
    return armor?.defBonus ?? 0;
}

function equipItem(run, inventoryIndex) {
    const item = run.inventory[inventoryIndex];
    if (!item) return { error: 'アイテムが見つかりません' };
    const def = EQUIPMENT_DEFS[item.name];
    if (!def) return { error: 'これは装備品ではありません' };

    const prevEquipped = run.equipment[def.slot];
    run.equipment[def.slot] = item;
    run.inventory.splice(inventoryIndex, 1);
    if (prevEquipped) run.inventory.push(prevEquipped);

    return { equipped: item.name, unequipped: prevEquipped?.name ?? null };
}

function unequipItem(run, slot) {
    const item = run.equipment[slot];
    if (!item) return { error: '装備していません' };
    if (run.inventory.length >= run.maxInventory) return { error: '持ち物がいっぱいです' };
    run.equipment[slot] = null;
    run.inventory.push(item);
    return { unequipped: item.name };
}

// ================================================================
// その場に置く操作（6章: 完全にプレイヤー個人のローカル状態。
// 他プレイヤーとは絶対に共有しない。フロア移動でリセットされる）
// ================================================================

function dropItemHere(run, inventoryIndex) {
    const item = run.inventory[inventoryIndex];
    if (!item) return { error: 'アイテムが見つかりません' };

    if (!run.localDrops) run.localDrops = [];
    const key = `${run.position.x},${run.position.y}`;
    // 同じマスに複数置けないようにする（シンプルな運用）
    if (run.localDrops.some(d => d.key === key)) {
        return { error: 'すでにこの場所には何か置かれています' };
    }

    run.localDrops.push({ key, x: run.position.x, y: run.position.y, item });
    run.inventory.splice(inventoryIndex, 1);
    return { dropped: item.name };
}

function pickUpLocalDrop(run) {
    if (!run.localDrops) run.localDrops = [];
    const key = `${run.position.x},${run.position.y}`;
    const idx = run.localDrops.findIndex(d => d.key === key);
    if (idx === -1) return { error: 'この場所には何も置かれていません' };
    if (run.inventory.length >= run.maxInventory) return { error: '持ち物がいっぱいです' };

    const drop = run.localDrops[idx];
    run.inventory.push(drop.item);
    run.localDrops.splice(idx, 1);
    return { pickedUp: drop.item.name };
}

function getLocalDropAt(run, x, y) {
    if (!run.localDrops) return null;
    return run.localDrops.find(d => d.x === x && d.y === y) ?? null;
}

module.exports = {
    GRID_W, GRID_H, TILE, MAX_FLOOR, MAX_LEVEL, MIN_ROOMS_PER_FLOOR,
    getOrCreateChannelTower,
    getTowerExpiresAt,
    generateFloor,
    getRoomIdAt,
    isInCorridor,
    getVisibleTiles,
    createNewRun,
    isWalkable,
    getEnemyAt,
    getItemAt,
    visibleEnemies,
    applyTrap,
    enemyTurn,
    processStatusEffects,
    processSatiety,
    tryDescend,
    createRemnant,
    findRemnantAt,
    resolveRescue,
    buildResumedRun,
    expRequiredFor,
    statsForLevel,
    addExp,
    EQUIPMENT_DEFS,
    isEquipment,
    getEffectiveAtk,
    getEffectiveDef,
    equipItem,
    unequipItem,
    dropItemHere,
    pickUpLocalDrop,
    getLocalDropAt,
    SCROLL_SEEDS,
    BERRY_SEEDS,
    generateUnidentifiedMap,
    isUnidentifiedSeed,
    unidentifiedDisplayName,
    getDisplayName,
    useUnidentifiedItem,
    ITEM_EFFECTS,
    TRAP_EFFECTS,
};
