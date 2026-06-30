/*****************
    read.js
    読み上げ関連機能
*****************/

window.ReadFeature = {

    user:  { selectedSpeakerUuid: null, selectedStyleId: null },
    guild: { selectedSpeakerUuid: null, selectedStyleId: null },

    _previewStyleId:      null,
    _guildPreviewStyleId: null,

    // ================================================================
    // 読み上げ開始・終了
    // ================================================================

    async start() {
        const { userId, guildId, channelId } = window.App ?? {};
        if (!userId || !guildId) { showToast('認証が完了していません', 'error'); return; }
        if (!channelId) { showToast('チャンネル情報が取得できません', 'error'); return; }
        try {
            const res  = await fetch('/api/read-start', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, guildId, channelId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            showToast(`#${data.textChannelName} の読み上げを開始しました`);
        } catch (e) { showToast(e.message, 'error'); }
    },

    async end() {
        const { userId, guildId } = window.App ?? {};
        if (!userId || !guildId) { showToast('認証が完了していません', 'error'); return; }
        try {
            const res  = await fetch('/api/read-end', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, guildId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            showToast('読み上げを終了しました');
        } catch (e) { showToast(e.message, 'error'); }
    },

    // ================================================================
    // 辞書
    // ================================================================

    async dictAdd() {
        const { userId, guildId } = window.App ?? {};
        if (!userId || !guildId) { showToast('認証が完了していません', 'error'); return; }
        const surface = document.getElementById('dict-surface-input').value.trim();
        const kana    = document.getElementById('dict-kana-input').value.trim();
        if (!surface || !kana) { showToast('語句と読みを入力してください', 'error'); return; }
        await withBtn('dict-add-btn', '追加中...', async () => {
            const res  = await fetch('/api/dict-add', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, guildId, surface, kana }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            showToast(`「${data.surface}」を辞書に追加しました`);
            document.getElementById('dict-surface-input').value = '';
            document.getElementById('dict-kana-input').value    = '';
        }).catch(e => showToast('失敗: ' + e.message, 'error'));
    },

    async dictDel() {
        const { userId, guildId } = window.App ?? {};
        if (!userId || !guildId) { showToast('認証が完了していません', 'error'); return; }
        const surface = document.getElementById('dict-del-surface-input').value.trim();
        if (!surface) { showToast('語句を入力してください', 'error'); return; }
        await withBtn('dict-del-btn', '削除中...', async () => {
            const res  = await fetch('/api/dict-del', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, guildId, surface }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            showToast(`「${data.surface}」を削除しました`);
            document.getElementById('dict-del-surface-input').value = '';
        }).catch(e => showToast('失敗: ' + e.message, 'error'));
    },

    // ================================================================
    // ユーザー設定
    // ================================================================

    async loadUserSetting() {
        const { userId } = window.App ?? {};
        if (!userId) return;
        try {
            const s = await fetch('/api/user-setting?userId=' + userId).then(r => r.json());
            if (s.vv_uuid) {
                const sel = document.getElementById('speaker-select');
                if ([...sel.options].find(o => o.value === s.vv_uuid)) {
                    sel.value = s.vv_uuid;
                    this.user.selectedSpeakerUuid = s.vv_uuid;
                    this.renderUserStyles(s.vv_id);
                }
            }
            setSliderVal('pitch-slider',      'pitch-val',      s.vv_pitch      ?? 0, 100);
            setSliderVal('intonation-slider', 'intonation-val', s.vv_intonation ?? 1, 100);
            if (s.username) document.getElementById('username-input').value = s.username;
        } catch {}
    },

    renderUserStyles(currentStyleId) {
        this.user.selectedStyleId = window.SpeakerStore.renderChips(
            'style-chips', this.user.selectedSpeakerUuid, currentStyleId,
            id => {
                this.user.selectedStyleId = id;
                this.updateSpeakerPreview(this.user.selectedSpeakerUuid, id);
            }
        ) ?? this.user.selectedStyleId;
        this.updateSpeakerPreview(this.user.selectedSpeakerUuid, this.user.selectedStyleId);
    },

    async updateSpeakerPreview(speakerUuid, styleId) {
        if (!speakerUuid || styleId == null) return;
        this._previewStyleId = styleId;
        const section = document.getElementById('speaker-preview-section');
        const img     = document.getElementById('speaker-preview-img');
        const nameEl  = document.getElementById('speaker-preview-name');
        if (!section) return;
        try {
            const res  = await fetch(`/api/style-info?speakerUuid=${encodeURIComponent(speakerUuid)}&styleId=${encodeURIComponent(styleId)}`);
            if (!res.ok) throw new Error('style-info failed');
            const data = await res.json();
            if (data.icon) {
                img.src = 'data:image/png;base64,' + data.icon;
                img.style.display = 'block';
                img.onerror = () => { img.style.display = 'none'; };
            } else {
                img.style.display = 'none';
            }
            if (nameEl) nameEl.textContent = data.name ?? '';
            section.style.display = 'block';
        } catch (e) {
            section.style.display = 'none';
        }
    },

    playVoiceSample() {
        if (this._previewStyleId == null) return;
        const uuid = this.user.selectedSpeakerUuid ?? '';
        this._playAudioUrl(
            '/api/voice-sample?speakerUuid=' + encodeURIComponent(uuid) + '&styleId=' + encodeURIComponent(this._previewStyleId),
            'speaker-preview-play-btn'
        );
    },

    async saveUserSpeaker() {
        const { userId } = window.App ?? {};
        if (!userId) { showToast('認証が完了していません', 'error'); return; }
        await withBtn('save-speaker-btn', '保存中...', async () => {
            const res = await fetch('/api/save-setting', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, speakerUuid: this.user.selectedSpeakerUuid, styleId: this.user.selectedStyleId }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
            showToast('スピーカー設定を保存しました');
        }).catch(e => showToast('保存失敗: ' + e.message, 'error'));
    },

    async saveUserParam() {
        const { userId } = window.App ?? {};
        if (!userId) { showToast('認証が完了していません', 'error'); return; }
        await withBtn('save-param-btn', '保存中...', async () => {
            const pitch      = parseFloat(document.getElementById('pitch-slider').value) / 100;
            const intonation = parseFloat(document.getElementById('intonation-slider').value) / 100;
            const username   = document.getElementById('username-input').value.trim();
            const res = await fetch('/api/save-param', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, pitch, intonation, username: username || undefined }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
            showToast('パラメーター設定を保存しました');
        }).catch(e => showToast('保存失敗: ' + e.message, 'error'));
    },

    // ================================================================
    // サーバー設定
    // ================================================================

    async loadGuildSetting() {
        const { guildId } = window.App ?? {};
        if (!guildId) return;
        try {
            const g = await fetch('/api/guild-setting?guildId=' + guildId).then(r => r.json());
            if (g.vv_uuid) {
                const sel = document.getElementById('guild-speaker-select');
                if ([...sel.options].find(o => o.value === g.vv_uuid)) {
                    sel.value = g.vv_uuid;
                    this.guild.selectedSpeakerUuid = g.vv_uuid;
                    this.renderGuildStyles(g.vv_id);
                }
            }
            setSliderVal('guild-speed-slider',      'guild-speed-val',      g.vv_speed      ?? 1, 100);
            setSliderVal('guild-pitch-slider',      'guild-pitch-val',      g.vv_pitch      ?? 0, 100);
            setSliderVal('guild-intonation-slider', 'guild-intonation-val', g.vv_intonation ?? 1, 100);
            setSliderVal('guild-volume-slider',     'guild-volume-val',     g.vv_volume     ?? 1, 100);
            document.getElementById('guild-override-toggle').checked = !!g.read_override;
        } catch {}
    },

    renderGuildStyles(currentStyleId) {
        this.guild.selectedStyleId = window.SpeakerStore.renderChips(
            'guild-style-chips', this.guild.selectedSpeakerUuid, currentStyleId,
            id => {
                this.guild.selectedStyleId = id;
                this.updateGuildSpeakerPreview(this.guild.selectedSpeakerUuid, id);
            }
        ) ?? this.guild.selectedStyleId;
        this.updateGuildSpeakerPreview(this.guild.selectedSpeakerUuid, this.guild.selectedStyleId);
    },

    async updateGuildSpeakerPreview(speakerUuid, styleId) {
        if (!speakerUuid || styleId == null) return;
        this._guildPreviewStyleId = styleId;
        const section = document.getElementById('guild-speaker-preview-section');
        const img     = document.getElementById('guild-speaker-preview-img');
        const nameEl  = document.getElementById('guild-speaker-preview-name');
        if (!section) return;
        try {
            const res  = await fetch(`/api/style-info?speakerUuid=${encodeURIComponent(speakerUuid)}&styleId=${encodeURIComponent(styleId)}`);
            if (!res.ok) throw new Error('style-info failed');
            const data = await res.json();
            if (data.icon) {
                img.src = 'data:image/png;base64,' + data.icon;
                img.style.display = 'block';
                img.onerror = () => { img.style.display = 'none'; };
            } else {
                img.style.display = 'none';
            }
            if (nameEl) nameEl.textContent = data.name ?? '';
            section.style.display = 'block';
        } catch (e) {
            section.style.display = 'none';
        }
    },

    playGuildVoiceSample() {
        if (this._guildPreviewStyleId == null) return;
        const uuid = this.guild.selectedSpeakerUuid ?? '';
        this._playAudioUrl(
            '/api/voice-sample?speakerUuid=' + encodeURIComponent(uuid) + '&styleId=' + encodeURIComponent(this._guildPreviewStyleId),
            'guild-speaker-preview-play-btn'
        );
    },

    async saveGuildSpeaker() {
        const { userId, guildId } = window.App ?? {};
        if (!userId || !guildId) { showToast('認証が完了していません', 'error'); return; }
        await withBtn('save-guild-speaker-btn', '保存中...', async () => {
            const res = await fetch('/api/save-guild-setting', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, guildId, speakerUuid: this.guild.selectedSpeakerUuid, styleId: this.guild.selectedStyleId }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
            showToast('サーバースピーカーを保存しました');
        }).catch(e => showToast('保存失敗: ' + e.message, 'error'));
    },

    async saveGuildParam() {
        const { userId, guildId } = window.App ?? {};
        if (!userId || !guildId) { showToast('認証が完了していません', 'error'); return; }
        await withBtn('save-guild-param-btn', '保存中...', async () => {
            const speed    = parseFloat(document.getElementById('guild-speed-slider').value) / 100;
            const pitch    = parseFloat(document.getElementById('guild-pitch-slider').value) / 100;
            const inton    = parseFloat(document.getElementById('guild-intonation-slider').value) / 100;
            const volume   = parseFloat(document.getElementById('guild-volume-slider').value) / 100;
            const override = document.getElementById('guild-override-toggle').checked;
            const res = await fetch('/api/save-guild-setting', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, guildId, speed, pitch, intonation: inton, volume, override }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
            showToast('サーバーパラメーターを保存しました');
        }).catch(e => showToast('保存失敗: ' + e.message, 'error'));
    },

    // ================================================================
    // 音声再生（URL方式）
    // ================================================================

    _playAudioUrl(url, btnId) {
        const btn = document.getElementById(btnId);
        let audio = document.getElementById('__preview_audio__');
        if (!audio) {
            audio = document.createElement('audio');
            audio.id = '__preview_audio__';
            audio.style.display = 'none';
            document.body.appendChild(audio);
        }
        if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
            if (btn) { btn.disabled = false; btn.textContent = '▶ サンプルを再生'; }
            return;
        }
        audio.src = url;
        if (btn) { btn.disabled = true; btn.textContent = '⏹ 再生中...'; }
        const done = () => {
            if (btn) { btn.disabled = false; btn.textContent = '▶ サンプルを再生'; }
        };
        audio.onended = done;
        audio.onerror = done;
        audio.load();
        const p = audio.play();
        if (p && typeof p.catch === 'function') p.catch(done);
    },
};
