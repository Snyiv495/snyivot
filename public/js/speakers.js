/*****************
    speakers.js
    スピーカーデータと共有ロジック
*****************/

window.SpeakerStore = {
    list: [],

    async load() {
        try {
            const res = await fetch('/api/speakers');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            this.list = await res.json();
            ['speaker-select', 'guild-speaker-select'].forEach(id => {
                const sel = document.getElementById(id);
                if (!sel) return;
                sel.innerHTML = '';
                this.list.forEach(s => {
                    const o = document.createElement('option');
                    o.value = s.speaker_uuid;
                    o.textContent = s.name;
                    sel.appendChild(o);
                });
            });
        } catch (e) {
            ['speaker-select', 'guild-speaker-select'].forEach(id => {
                const sel = document.getElementById(id);
                if (sel) sel.innerHTML = '<option>読み込み失敗</option>';
            });
        }
    },

    renderChips(containerId, speakerUuid, currentStyleId, onSelect) {
        const speaker = this.list.find(s => s.speaker_uuid === speakerUuid);
        const chips = document.getElementById(containerId);
        if (!chips) return null;
        chips.innerHTML = '';
        if (!speaker?.styles) return null;

        let di = 0;
        if (currentStyleId != null) {
            const f = speaker.styles.findIndex(s => s.id === currentStyleId);
            if (f >= 0) di = f;
        }
        const defaultId = speaker.styles[di]?.id ?? null;

        speaker.styles.forEach((st, i) => {
            const c = document.createElement('div');
            c.className = 'style-chip' + (i === di ? ' active' : '');
            c.textContent = st.name;
            c.addEventListener('click', () => {
                chips.querySelectorAll('.style-chip').forEach(x => x.classList.remove('active'));
                c.classList.add('active');
                onSelect(st.id);
            });
            chips.appendChild(c);
        });
        return defaultId;
    },
};
