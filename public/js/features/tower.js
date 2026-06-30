/*****************
    tower.js
    記憶の塔 - フロントエンド（第2段階：残留者・救助対応）
*****************/

window.TowerFeature = {
    run: null,
    cellSize: 40,

    async checkAndShowTop() {
        const { userId, guildId, channelId } = window.App ?? {};
        const gate    = document.getElementById('tower-auth-gate');
        const content = document.getElementById('tower-top-content');
        if (!userId) {
            gate.style.display = 'flex';
            content.style.display = 'none';
            return;
        }
        gate.style.display = 'none';
        content.style.display = 'block';

        try {
            const res = await fetch(`/api/tower/state?userId=${userId}&guildId=${guildId}&channelId=${channelId}`);
            const data = await res.json();
            const startBtn  = document.getElementById('tower-start-btn');
            const awaitNote = document.getElementById('tower-awaiting-note');
            const rescueCountEl = document.getElementById('tower-rescue-count');

            if (data.isAwaitingRescue) {
                startBtn.disabled = false;
                awaitNote.style.display = 'block';
            } else {
                startBtn.disabled = false;
                awaitNote.style.display = 'none';
            }
            this.isAwaitingRescue = !!data.isAwaitingRescue;

            if (data.run && !data.run.isDead) {
                this.run = data.run;
                startBtn.textContent = '▶ 続きから再開する';
            } else {
                startBtn.textContent = '⚔ 挑戦を始める';
            }

            rescueCountEl.textContent = `救助の証: ${data.rescueCount ?? 0}`;
        } catch (e) {}
    },

    async start() {
        const { userId, guildId, channelId } = window.App ?? {};
        if (!userId) { showToast('認証が完了していません', 'error'); return; }

        if (this.isAwaitingRescue) {
            this._showRescueOverrideConfirm();
            return;
        }

        await this._actuallyStart();
    },

    _showRescueOverrideConfirm() {
        document.getElementById('tower-rescue-override-overlay').style.display = 'flex';
    },

    closeRescueOverrideConfirm() {
        document.getElementById('tower-rescue-override-overlay').style.display = 'none';
    },

    async confirmRescueOverride() {
        document.getElementById('tower-rescue-override-overlay').style.display = 'none';
        await this._actuallyStart();
    },

    async showMinimap() {
        const { userId, guildId, channelId } = window.App ?? {};
        try {
            const res = await fetch(`/api/tower/minimap?userId=${userId}&guildId=${guildId}&channelId=${channelId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            this._renderMinimap(data);
            document.getElementById('tower-minimap-overlay').style.display = 'flex';
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    closeMinimap() {
        document.getElementById('tower-minimap-overlay').style.display = 'none';
    },

    _renderMinimap(data) {
        const svg = document.getElementById('tower-minimap-svg');
        const exploredRooms = data.rooms.filter(r => r.explored);
        if (exploredRooms.length === 0) {
            svg.setAttribute('viewBox', '0 0 100 100');
            svg.innerHTML = '<text x="50" y="50" text-anchor="middle" font-size="6" fill="var(--text3)">まだ何も探索していません</text>';
            return;
        }

        // 探索済みの部屋を囲む範囲だけを表示する（無駄な余白を減らす）
        const minX = Math.min(...exploredRooms.map(r => r.x)) - 1;
        const minY = Math.min(...exploredRooms.map(r => r.y)) - 1;
        const maxX = Math.max(...exploredRooms.map(r => r.x + r.w)) + 1;
        const maxY = Math.max(...exploredRooms.map(r => r.y + r.h)) + 1;
        const vbW = maxX - minX;
        const vbH = maxY - minY;
        svg.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`);

        let html = '';

        // 通路（探索済みの部屋同士をつなぐもののみ）
        data.corridors.forEach(c => {
            html += `<rect x="${c.x - minX - 0.15}" y="${c.y - minY - 0.15}" width="0.3" height="0.3" fill="rgba(139,92,246,0.35)" />`;
        });

        // 部屋
        exploredRooms.forEach(r => {
            let fill = 'rgba(167,139,250,0.18)';
            let stroke = 'rgba(139,92,246,0.4)';
            if (r.isStairs) { fill = 'rgba(251,191,36,0.25)'; stroke = '#fbbf24'; }
            if (r.isCurrent) { fill = 'rgba(139,92,246,0.5)'; stroke = '#a78bfa'; }
            html += `<rect x="${r.x - minX}" y="${r.y - minY}" width="${r.w}" height="${r.h}" rx="0.3" fill="${fill}" stroke="${stroke}" stroke-width="0.15" />`;
            if (r.isStairs) {
                html += `<text x="${r.x - minX + r.w/2}" y="${r.y - minY + r.h/2 + 0.4}" text-anchor="middle" font-size="2.2">🔽</text>`;
            }
        });

        // 現在地マーカー
        html += `<circle cx="${data.position.x - minX}" cy="${data.position.y - minY}" r="0.6" fill="var(--accent)" />`;

        svg.innerHTML = html;
    },

    async _actuallyStart() {
        const { userId, guildId, channelId } = window.App ?? {};

        // 既存ランがあれば再開、なければ新規
        if (this.run && !this.run.isDead && !this.isAwaitingRescue) {
            navigate('tower-play');
            this.render();
            return;
        }

        try {
            const res = await fetch('/api/tower/start', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, guildId, channelId, confirmOverrideRescue: this.isAwaitingRescue }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            this.run = data.run;
            this.isAwaitingRescue = false;
            navigate('tower-play');
            this.render();
            this.pushLog(data.log);
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    async move(dx, dy) {
        if (!this.run || this.run.isDead) return;
        const { userId, guildId, channelId } = window.App ?? {};
        try {
            const res = await fetch('/api/tower/move', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, guildId, channelId, dx, dy }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            this.run = data.run;
            this.render();
            this.pushLog(data.log);

            if (data.pendingRemnant) {
                setTimeout(() => this.showRemnantDialog(data.pendingRemnant), 400);
                return;
            }
            if (this.run.isDead) setTimeout(() => this.showDeadChoice(), 600);
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    async useItem(index) {
        if (!this.run) return;
        const item = this.run.inventory[index];
        if (item && this._isEquipmentName(item.name)) {
            await this.equipItem(index);
            return;
        }
        if (item && item.isUnidentified) {
            this._pendingUseIndex = index;
            this._showUnidentifiedConfirm(item.name);
            return;
        }
        await this._actuallyUseItem(index);
    },

    _showUnidentifiedConfirm(name) {
        const overlay = document.getElementById('tower-confirm-overlay');
        const msg = document.getElementById('tower-confirm-message');
        msg.textContent = `${name}を使いますか？\n効果は不明です。良いことも悪いことも起こります。`;
        overlay.style.display = 'flex';
    },

    closeUnidentifiedConfirm() {
        document.getElementById('tower-confirm-overlay').style.display = 'none';
        this._pendingUseIndex = null;
    },

    async confirmUseUnidentified() {
        const idx = this._pendingUseIndex;
        document.getElementById('tower-confirm-overlay').style.display = 'none';
        this._pendingUseIndex = null;
        if (idx == null) return;
        await this._actuallyUseItem(idx);
    },

    async _actuallyUseItem(index) {
        const { userId, guildId, channelId } = window.App ?? {};
        try {
            const res = await fetch('/api/tower/use-item', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, guildId, channelId, itemIndex: index }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            this.run = data.run;
            this.render();
            this.pushLog(data.log);
            if (this.run.isDead) setTimeout(() => this.showDeadChoice(), 600);
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    _isEquipmentName(name) {
        return ['砕けぬ覚悟', '掠れた誓い', '名残の盾', '忘れ得ぬ鎧'].includes(name);
    },

    async equipItem(index) {
        const { userId, guildId, channelId } = window.App ?? {};
        try {
            const res = await fetch('/api/tower/equip', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, guildId, channelId, itemIndex: index }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            this.run = data.run;
            this.render();
            this.pushLog(data.log);
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    async unequipItem(slot) {
        const { userId, guildId, channelId } = window.App ?? {};
        try {
            const res = await fetch('/api/tower/unequip', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, guildId, channelId, slot }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            this.run = data.run;
            this.render();
            this.pushLog(data.log);
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    async dropItem(index) {
        const { userId, guildId, channelId } = window.App ?? {};
        try {
            const res = await fetch('/api/tower/drop-item', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, guildId, channelId, itemIndex: index }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            this.run = data.run;
            this.render();
            this.pushLog(data.log);
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    async pickupItem() {
        const { userId, guildId, channelId } = window.App ?? {};
        try {
            const res = await fetch('/api/tower/pickup-item', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, guildId, channelId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            this.run = data.run;
            this.render();
            this.pushLog(data.log);
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    async descend() {
        if (!this.run) return;
        const { userId, guildId, channelId } = window.App ?? {};
        const userName = document.getElementById('user-name')?.textContent ?? 'プレイヤー';
        try {
            const res = await fetch('/api/tower/descend', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, guildId, channelId, userName }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            if (data.cleared) {
                this.run = null;
                navigate('tower-cleared');
                return;
            }
            this.run = data.run;
            this.render();
            this.pushLog(data.log);
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    exit() {
        navigate('tower');
        this.checkAndShowTop();
    },

    // ---- 残留者発見ダイアログ ----

    showRemnantDialog(remnant) {
        this._pendingRemnant = remnant;
        const desc = document.getElementById('tower-remnant-desc');
        desc.textContent = `残留者「${remnant.ownerName}」（到達${remnant.floor}F）を発見した。`;

        const select = document.getElementById('tower-remnant-item-select');
        select.style.display = 'none';
        select.innerHTML = '';
        (this.run.inventory ?? []).forEach((item, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = item.name;
            select.appendChild(opt);
        });

        navigate('tower-remnant');
    },

    async rescueWithItem() {
        const select = document.getElementById('tower-remnant-item-select');
        if (select.style.display === 'none') {
            select.style.display = 'block';
            return;
        }
        const idx = select.value !== '' ? parseInt(select.value) : null;
        await this._doRescue(idx);
    },

    async rescueFree() {
        await this._doRescue(null);
    },

    async _doRescue(giveItemIndex) {
        const { userId, guildId, channelId } = window.App ?? {};
        const userName = document.getElementById('user-name')?.textContent ?? 'プレイヤー';
        try {
            const res = await fetch('/api/tower/rescue', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, guildId, channelId, userName, giveItemIndex }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            this.run = data.run;
            navigate('tower-play');
            this.render();
            this.pushLog(['救助した！']);
        } catch (e) {
            showToast(e.message, 'error');
            navigate('tower-play');
        }
    },

    async skipRescue() {
        const { userId } = window.App ?? {};
        try {
            await fetch('/api/tower/skip-rescue', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });
        } catch (e) {}
        navigate('tower-play');
        this.pushLog(['そのまま通過した']);
    },

    // ---- 全滅時の選択 ----

    showDeadChoice() {
        const bequestWrap = document.getElementById('tower-bequest-wrap');
        const bequestSelect = document.getElementById('tower-bequest-select');
        const noItemBtn = document.getElementById('tower-remnant-noitem-btn');

        bequestSelect.innerHTML = '<option value="">何も託さない</option>';
        (this.run.inventory ?? []).forEach((item, i) => {
            const opt = document.createElement('option');
            opt.value = `inv:${i}`;
            opt.textContent = item.name;
            bequestSelect.appendChild(opt);
        });
        if (this.run.equipment?.weapon) {
            const opt = document.createElement('option');
            opt.value = 'weapon';
            opt.textContent = `⚔ ${this.run.equipment.weapon.name}（武器）`;
            bequestSelect.appendChild(opt);
        }
        if (this.run.equipment?.armor) {
            const opt = document.createElement('option');
            opt.value = 'armor';
            opt.textContent = `🛡 ${this.run.equipment.armor.name}（防具）`;
            bequestSelect.appendChild(opt);
        }

        const hasAnything = (this.run.inventory ?? []).length > 0 || this.run.equipment?.weapon || this.run.equipment?.armor;
        bequestWrap.style.display = hasAnything ? 'block' : 'none';
        noItemBtn.style.display = 'none';

        navigate('tower-dead');
    },

    async recordRemnant() {
        const { userId, guildId, channelId } = window.App ?? {};
        const userName = document.getElementById('user-name')?.textContent ?? 'プレイヤー';
        const select = document.getElementById('tower-bequest-select');
        const raw = select.value;

        let bequestSource = 'inventory';
        let bequestItemIndex = null;
        if (raw === 'weapon' || raw === 'armor') {
            bequestSource = raw;
        } else if (raw.startsWith('inv:')) {
            bequestItemIndex = parseInt(raw.split(':')[1]);
        }

        try {
            const res = await fetch('/api/tower/remnant', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, guildId, channelId, userName, bequestSource, bequestItemIndex }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            this.run = null;
            showToast('残留者として記録しました');
            navigate('tower');
            this.checkAndShowTop();
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    async abandonRun() {
        const { userId } = window.App ?? {};
        try {
            await fetch('/api/tower/abandon-run', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });
        } catch (e) {}
        this.run = null;
        navigate('tower');
        this.checkAndShowTop();
    },

    // ---- ログ ----

    pushLog(lines) {
        if (!lines || lines.length === 0) return;
        const log = document.getElementById('tower-log');
        lines.forEach(line => {
            const el = document.createElement('div');
            el.className = 'tower-log-line';
            if (line.includes('レベルが') && line.includes('上がった')) {
                el.style.color = 'var(--accent3)';
                el.style.fontWeight = '700';
            }
            el.textContent = line;
            log.appendChild(el);
        });
        while (log.children.length > 6) log.removeChild(log.firstChild);
        log.scrollTop = log.scrollHeight;
    },

    // ---- 描画 ----

    render() {
        if (!this.run) return;
        const run = this.run;

        document.getElementById('tower-hp-fill').style.width      = Math.max(0, (run.hp / run.maxHp) * 100) + '%';
        document.getElementById('tower-hp-val').textContent       = `${run.hp}/${run.maxHp}`;
        document.getElementById('tower-satiety-fill').style.width = Math.max(0, (run.satiety / run.maxSatiety) * 100) + '%';
        document.getElementById('tower-satiety-val').textContent  = `${run.satiety}/${run.maxSatiety}`;
        document.getElementById('tower-floor-label').textContent  = run.showFloor ? `${run.floor}F` : '';

        document.getElementById('tower-level-val').textContent = run.level;
        if (run.expRequired != null) {
            document.getElementById('tower-exp-fill').style.width = Math.max(0, (run.exp / run.expRequired) * 100) + '%';
            document.getElementById('tower-exp-val').textContent  = `${run.exp}/${run.expRequired}`;
        } else {
            document.getElementById('tower-exp-fill').style.width = '100%';
            document.getElementById('tower-exp-val').textContent  = 'MAX';
        }

        // 装備スロット
        const equipWrap = document.getElementById('tower-equipment');
        equipWrap.innerHTML = '';
        const slots = [
            { key: 'weapon', label: '武器' },
            { key: 'armor',  label: '防具' },
        ];
        slots.forEach(s => {
            const equipped = run.equipment?.[s.key];
            const el = document.createElement('div');
            el.className = 'tower-equip-slot' + (equipped ? ' filled' : '');
            el.textContent = equipped ? `${s.label}: ${equipped.name}` : `${s.label}: なし`;
            if (equipped) el.addEventListener('click', () => this.unequipItem(s.key));
            equipWrap.appendChild(el);
        });

        document.getElementById('tower-descend-btn').style.display = run.atStairs ? 'block' : 'none';

        const inv = document.getElementById('tower-inventory');
        inv.innerHTML = '';
        if (run.inventory.length === 0) {
            const span = document.createElement('span');
            span.style.fontSize = '11px';
            span.style.color = 'var(--text3)';
            span.textContent = '持ち物はありません';
            inv.appendChild(span);
        } else {
            run.inventory.forEach((item, i) => {
                const chip = document.createElement('div');
                const isEquip = this._isEquipmentName(item.name);
                const isUnidentified = item.isUnidentified;
                chip.className = 'tower-item-chip' + (isEquip ? ' is-equip' : '') + (isUnidentified ? ' is-unidentified' : '');
                chip.textContent = (isEquip ? '⚔ ' : isUnidentified ? '❓ ' : '') + item.name;
                chip.addEventListener('click', () => this.useItem(i));
                chip.title = isEquip ? 'クリックで装備' : 'クリックで使用、長押しでその場に置く';
                let pressTimer = null;
                if (!isEquip) {
                    chip.addEventListener('pointerdown', () => {
                        pressTimer = setTimeout(() => { pressTimer = null; this.dropItem(i); }, 550);
                    });
                    chip.addEventListener('pointerup', () => { if (pressTimer) clearTimeout(pressTimer); });
                    chip.addEventListener('pointerleave', () => { if (pressTimer) clearTimeout(pressTimer); });
                }
                inv.appendChild(chip);
            });
        }

        // 現在地に置かれているアイテムがあれば拾い直すチップを表示
        if (run.localDropHere) {
            const pickupChip = document.createElement('div');
            pickupChip.className = 'tower-item-chip is-localdrop';
            pickupChip.textContent = '↺ ここに置いたものを拾う';
            pickupChip.addEventListener('click', () => this.pickupItem());
            inv.appendChild(pickupChip);
        }

        this.renderBoard();
    },

    viewSize: 7, // 表示枠は常に7x7マス固定（プレイヤーを中心に配置）

    renderBoard() {
        const run = this.run;
        const svg = document.getElementById('tower-board');
        const cs  = this.cellSize;
        const origin = run.viewOrigin ?? { x: 0, y: 0 };

        // 固定サイズの表示枠（プレイヤーが常に中央に来るように計算）
        const vs = this.viewSize;
        const half = Math.floor(vs / 2);
        const viewMinX = run.position.x - half;
        const viewMinY = run.position.y - half;

        svg.setAttribute('viewBox', `0 0 ${vs * cs} ${vs * cs}`);

        // 絶対座標 -> 固定表示枠内の相対座標に変換
        const rel = (ax, ay) => ({ x: ax - viewMinX, y: ay - viewMinY });

        // run.grid は viewOrigin を基準にした「見えている範囲」の部分マップ。
        // これを固定表示枠の座標系に変換して描画する。
        const gridH = run.grid.length;
        const gridW = run.grid[0].length;

        let html = '';
        for (let gy = 0; gy < gridH; gy++) {
            for (let gx = 0; gx < gridW; gx++) {
                const tile = run.grid[gy][gx];
                if (tile === null) continue; // 見えていないマスは描画しない

                const absX = gx + origin.x;
                const absY = gy + origin.y;
                const p = rel(absX, absY);
                if (p.x < 0 || p.x >= vs || p.y < 0 || p.y >= vs) continue; // 表示枠の外は描画しない

                const absKey = `${absX},${absY}`;
                let fill = 'var(--bg)';
                if (tile === 1) fill = '#1a1b2e';
                if (tile === 2) fill = '#2a2550';
                const isDiscoveredTrap = run.discoveredTraps.includes(absKey);
                html += `<rect x="${p.x*cs}" y="${p.y*cs}" width="${cs-2}" height="${cs-2}" rx="4" fill="${fill}" stroke="rgba(139,92,246,0.08)" />`;
                if (isDiscoveredTrap) {
                    html += `<text x="${p.x*cs + cs/2}" y="${p.y*cs + cs/2 + 4}" text-anchor="middle" font-size="14" fill="#f87171">!</text>`;
                }
            }
        }

        const inView = (p) => p.x >= 0 && p.x < vs && p.y >= 0 && p.y < vs;

        if (run.stairs) {
            const p = rel(run.stairs.x, run.stairs.y);
            if (inView(p)) html += `<text x="${p.x*cs + cs/2}" y="${p.y*cs + cs/2 + 6}" text-anchor="middle" font-size="20">🔽</text>`;
        }

        run.items.forEach(item => {
            const p = rel(item.x, item.y);
            if (inView(p)) html += `<text x="${p.x*cs + cs/2}" y="${p.y*cs + cs/2 + 6}" text-anchor="middle" font-size="16">💎</text>`;
        });

        (run.localDrops ?? []).forEach(drop => {
            const p = rel(drop.x, drop.y);
            if (inView(p)) html += `<text x="${p.x*cs + cs/2}" y="${p.y*cs + cs/2 + 6}" text-anchor="middle" font-size="14" opacity="0.7">📍</text>`;
        });

        run.enemies.forEach(enemy => {
            const p = rel(enemy.x, enemy.y);
            if (!inView(p)) return;
            // 発見状態に応じて敵の色味を変える（赤=発見済み、グレー=未発見で徘徊中）
            const icon = enemy.aware ? '👹' : '👻';
            html += `<text x="${p.x*cs + cs/2}" y="${p.y*cs + cs/2 + 6}" text-anchor="middle" font-size="18" opacity="${enemy.aware ? 1 : 0.6}">${icon}</text>`;
            const ratio = Math.max(0, enemy.hp / enemy.maxHp);
            html += `<rect x="${p.x*cs + 4}" y="${p.y*cs + 2}" width="${cs-10}" height="3" fill="rgba(255,255,255,0.15)" />`;
            html += `<rect x="${p.x*cs + 4}" y="${p.y*cs + 2}" width="${(cs-10) * ratio}" height="3" fill="${enemy.aware ? '#f87171' : '#9ca3af'}" />`;
        });

        const pp = rel(run.position.x, run.position.y);
        html += `<circle cx="${pp.x*cs + cs/2}" cy="${pp.y*cs + cs/2}" r="${cs/2 - 4}" fill="var(--accent)" opacity="0.25" />`;
        html += `<text x="${pp.x*cs + cs/2}" y="${pp.y*cs + cs/2 + 6}" text-anchor="middle" font-size="18">🧍</text>`;

        svg.innerHTML = html;
    },
};
