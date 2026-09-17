// ==UserScript==
// @name         osu!GD
// @namespace flower-iroseka
// @author       Chengyu Liu
// @version      0.0.7
// @description  在个人资料中显示该用户 Pending 和 Graveyard 分类下的 Guest 难度谱面
// @match        https://osu.ppy.sh/users/*
// @run-at       document-idle
// @grant        none
// @homepageURL  https://github.com/flower-iroseka/osu-gd
// @updateURL    https://raw.githubusercontent.com/flower-iroseka/osu-gd/main/osu-gd.user.js
// @downloadURL  https://raw.githubusercontent.com/flower-iroseka/osu-gd/main/osu-gd.user.js
// ==/UserScript==

// Fork of osu-gd by Sayama Kaede (https://github.com/SayamaKaede/osu-gd)

(function () {
    'use strict';

    if (window.__lkGuestBeatmaps) return;
    window.__lkGuestBeatmaps = true;

    const PREFIX = 'lk-gd';

    const INITIAL = 6;

    const PER_EXPANSION = 50;

    const SANITY_TOTAL = 5000;

    const DOTS_LIMIT = 12;

    const LANG = (document.documentElement.lang || '').toLowerCase();
    const LANG_KEY = LANG.startsWith('zh') ? 'zh' : LANG.startsWith('ja') ? 'ja' : 'en';

    // 界面文字对应的 i18n 字符串
    // zh: 中文（简体中文）
    // ja: 日文
    // en: 英文
    // 脚本根据 document.documentElement.lang 选择对应的语言
    const I18N = {
        zh: {
            sectionPending: '客串难度的待定 (Pending) 谱面',
            sectionGraveyard: '客串难度的已停更谱面',
            signedOutNotice: '登录 osu! 后即可查看',
            showMore: '显示更多',
            loading: '加载中…',
            status: { pending: '待定 (Pending)', wip: '制作中 (WIP)', graveyard: '坟场 (Graveyard)' },
            badge: {
                nsfw: '不良内容',
                spotlight: '聚光灯',
                featured_artist: '精选艺术家',
            },
            nominationPattern: '提名',
            locale: 'zh-CN',
            logPrefix: '[客串难度]',
        },
        ja: {
            sectionPending: 'ゲスト難易度のPendingビートマップ',
            sectionGraveyard: 'ゲスト難易度のGraveyardビートマップ',
            signedOutNotice: 'osu!にログインすると表示されます',
            showMore: 'もっと見る',
            loading: '読み込み中…',
            status: { pending: 'Pending', wip: 'WIP', graveyard: 'Graveyard' },
            badge: {
                nsfw: '過激表現を含む',
                spotlight: 'スポットライト',
                featured_artist: '注目アーティスト',
            },
            nominationPattern: 'ノミネート',
            locale: 'ja-JP',
            logPrefix: '[ゲスト難易度]',
        },
        en: {
            sectionPending: 'Pending Guest Participation Beatmaps',
            sectionGraveyard: 'Graveyarded Guest Participation Beatmaps',
            signedOutNotice: 'Sign in to osu! to see these',
            showMore: 'show more',
            loading: 'loading…',
            status: { pending: 'Pending', wip: 'WIP', graveyard: 'Graveyard' },
            badge: {
                nsfw: 'Explicit',
                spotlight: 'Spotlight',
                featured_artist: 'Featured Artist',
            },
            nominationPattern: 'nominate',
            locale: 'en-GB',
            logPrefix: '[Guest difficulties]',
        },
    };

    const T = I18N[LANG_KEY];

    const SECTIONS = [
        {
            id: 'pending',
            title: T.sectionPending,
            states: ['pending', 'wip'],
        },
        {
            id: 'graveyard',
            title: T.sectionGraveyard,
            states: ['graveyard'],
        },
    ];

    const SIGNED_OUT_NOTICE = T.signedOutNotice;
    const SHOW_MORE = T.showMore;
    const LOADING = T.loading;

    const STATUS_LABEL = T.status;
    const BADGE_LABEL = T.badge;

    const MODES = ['osu', 'taiko', 'fruits', 'mania'];

    let profileId = null;
    let sections = null;
    let cardSize = null;

    // beatmapset card 的尺寸来自用户的 beatmapset_card_size 设置
    function siteCardSize() {
        if (cardSize != null) return cardSize;

        const panel = [...document.querySelectorAll('.beatmapset-panel')]
            .find((node) => !node.closest(`.${PREFIX}`));

        cardSize = panel?.className.match(/beatmapset-panel--size-(\w+)/)?.[1];
        if (cardSize !== 'extra') cardSize = 'normal';

        return cardSize;
    }

    async function search(state, cursor) {
        const params = new URLSearchParams({
            q: `creator=${profileId}`,
            s: state,
            sort: 'updated_desc',
            nsfw: 'true',
        });

        if (cursor) params.set('cursor_string', cursor);

        const response = await fetch(`/beatmapsets/search?${params}`, {
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin',
        });

        if (!response.ok) throw new Error(`search answered ${response.status}`);

        return response.json();
    }

    function honoured(json) {
        return json?.search?.sort === 'updated_desc' && (json.total ?? 0) < SANITY_TOTAL;
    }

    function keep(sets, states) {
        return (sets ?? []).filter((set) =>
            set.user_id !== profileId
            && states.includes(set.status));
    }

    async function readMore(section) {
        const unfinished = section.streams.filter((s) => !s.done);
        if (unfinished.length === 0) return;

        const answers = await Promise.all(unfinished.map(async (stream) => {
            try {
                const json = await search(stream.state, stream.cursor);

                if (!honoured(json)) return { stream, refused: true };

                stream.cursor = json.cursor_string ?? null;
                stream.done = !stream.cursor;

                return { stream, sets: keep(json.beatmapsets, section.states) };
            } catch (error) {
                console.warn(T.logPrefix, stream.state, error);
                stream.done = true;
                return { stream, sets: [] };
            }
        }));

        if (answers.some((a) => a.refused)) {
            section.refused = true;
            section.streams.forEach((s) => { s.done = true; });
            return;
        }

        for (const answer of answers) section.sets.push(...answer.sets);

        const seen = new Set();
        section.sets = section.sets
            .filter((set) => !seen.has(set.id) && seen.add(set.id))
            .sort((a, b) => Date.parse(b.last_updated ?? 0) - Date.parse(a.last_updated ?? 0));
    }

    const DIFFICULTY_STOPS = [
        [0.1, '#4290FB'], [1.25, '#4FC0FF'], [2, '#4FFFD5'], [2.5, '#7CFF4F'], [3.3, '#F6F05C'],
        [4.2, '#FF8068'], [4.9, '#FF4E6F'], [5.8, '#C645B8'], [6.7, '#6563DE'], [7.7, '#18158E'], [9, '#000000'],
    ];

    const GAMMA = 2.2;

    function channels(hex) {
        return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    }

    function difficultyColour(rating) {
        if (!(rating >= 0.1)) return '#AAAAAA';
        if (rating >= 9) return '#000000';

        let index = 0;
        while (index < DIFFICULTY_STOPS.length - 2 && rating > DIFFICULTY_STOPS[index + 1][0]) index++;

        const [low, from] = DIFFICULTY_STOPS[index];
        const [high, to] = DIFFICULTY_STOPS[index + 1];
        const t = (rating - low) / (high - low);

        const mixed = channels(from).map((a, i) => {
            const b = channels(to)[i];
            const value = Math.pow(Math.pow(a, GAMMA) + t * (Math.pow(b, GAMMA) - Math.pow(a, GAMMA)), 1 / GAMMA);
            return Math.max(0, Math.min(255, Math.round(value)));
        });

        return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function statsItem(kind, icon, text) {
        const item = element('div', `beatmapset-panel__stats-item beatmapset-panel__stats-item--${kind}`);
        const wrap = element('span', 'beatmapset-panel__stats-item-icon');
        wrap.append(element('i', `fa-fw ${icon}`));
        item.append(wrap, element('span', null, text));
        return item;
    }

    function dots(set) {
        const holder = element('div', 'beatmapset-panel__extra-item beatmapset-panel__extra-item--dots');

        for (const mode of MODES) {
            const inMode = (set.beatmaps ?? []).filter((b) => b.mode === mode)
                .sort((a, b) => (a.difficulty_rating ?? 0) - (b.difficulty_rating ?? 0));

            if (inMode.length === 0) continue;

            const icon = element('div', 'beatmapset-panel__beatmap-icon');
            icon.append(element('i', `fal fa-extra-mode-${mode}`));
            holder.append(icon);

            if (inMode.length > DOTS_LIMIT) {
                holder.append(element('div', 'beatmapset-panel__beatmap-count', String(inMode.length)));
                continue;
            }

            for (const beatmap of inMode) {
                const dot = element('div', 'beatmapset-panel__beatmap-dot');
                dot.style.setProperty('--bg', difficultyColour(beatmap.difficulty_rating ?? 0));
                holder.append(dot);
            }
        }

        return holder;
    }

    function readableOn(hex) {
        const linear = channels(hex).map((c) => {
            const v = c / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });

        const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];

        return luminance < 0.18 ? '#ffffff' : '#000000';
    }

    const POPUP_FADE = 150;       // 淡入淡出时长，和 osu! 的 beatmaps-popup 一致
    const POPUP_HIDE_DELAY = 500; // 鼠标移开后多久开始收起，和 osu! 一致

    let popup = null;
    let popupPanel = null;
    let hideTimer = null;

    function portal() {
        return document.querySelector('.js-portal') ?? document.body;
    }

    function popupItem(beatmap) {
        const item = element('a', 'beatmaps-popup-item');
        item.href = `/beatmaps/${beatmap.id}`;

        const row = element('div', 'beatmap-list-item');

        const iconCol = element('div', 'beatmap-list-item__col beatmap-list-item__col--icon');
        iconCol.append(element('span', `fal fa-extra-mode-${beatmap.mode}`));

        const badgeCol = element('div', 'beatmap-list-item__col');
        const badge = element('div', 'difficulty-badge');
        const colour = difficultyColour(beatmap.difficulty_rating ?? 0);
        badge.style.setProperty('--bg', colour);
        badge.style.color = readableOn(colour);

        const star = element('span', 'difficulty-badge__icon');
        star.append(element('span', 'fas fa-star'));
        badge.append(star, element('span', 'difficulty-badge__rating', (beatmap.difficulty_rating ?? 0).toFixed(2)));
        badgeCol.append(badge);

        const mainCol = element('div', 'beatmap-list-item__col beatmap-list-item__col--main');
        const version = element('div', 'beatmap-list-item__version u-ellipsis-overflow', `${beatmap.version ?? ''} `);
        version.append(element('span', 'beatmap-list-item__mapper'));
        mainCol.append(version);

        row.append(iconCol, badgeCol, mainCol);
        item.append(row);

        return item;
    }

    function buildPopup(set) {
        const node = element('div', `beatmaps-popup${siteCardSize() === 'extra' ? ' beatmaps-popup--size-extra' : ''} ${PREFIX}__popup`);
        const content = element('div', 'beatmaps-popup__content');

        for (const mode of MODES) {
            const inMode = (set.beatmaps ?? []).filter((b) => b.mode === mode)
                .sort((a, b) => (a.difficulty_rating ?? 0) - (b.difficulty_rating ?? 0));

            if (inMode.length === 0) continue;

            const group = element('div', 'beatmaps-popup__group');
            for (const beatmap of inMode) group.append(popupItem(beatmap));
            content.append(group);
        }

        node.append(content);

        return node;
    }

    function cancelHide() {
        if (hideTimer == null) return;

        window.clearTimeout(hideTimer);
        hideTimer = null;
    }

    // 隔 POPUP_HIDE_DELAY 再收起，和 osu! 自己的卡片一致
    function scheduleHide() {
        cancelHide();
        hideTimer = window.setTimeout(() => {
            hideTimer = null;
            closePopup();
        }, POPUP_HIDE_DELAY);
    }

    // 鼠标离开那一行或难度列表后，落在难度列表上就不关，还在卡片上就延时收起，离开卡片就立刻收起
    function onPointerLeave(target) {
        if (popup?.contains(target)) {
            cancelHide();
            return;
        }

        if (popupPanel?.contains(target)) {
            scheduleHide();
            return;
        }

        closePopup();
    }

    // 立刻收起，没有动画，用于重新渲染和换页
    function hidePopup() {
        cancelHide();
        document.removeEventListener('click', onPopupDocumentClick);

        // 清理页面上所有难度列表的 popup，避免页面恢复或重新渲染后留下关不掉的列表
        for (const node of document.querySelectorAll(`.${PREFIX}__popup`)) node.remove();

        for (const panel of document.querySelectorAll(`.${PREFIX}__panel.beatmapset-panel--beatmaps-popup-visible`)) {
            panel.classList.remove('beatmapset-panel--beatmaps-popup-visible');
        }

        popup = null;
        popupPanel = null;
    }

    // 先淡出再移除，用于用户操作引起的收起；重新渲染和换页用 hidePopup()
    function closePopup() {
        cancelHide();
        document.removeEventListener('click', onPopupDocumentClick);

        const closing = popup;

        // 除正在淡出的难度列表以外，页面上其他的难度列表一并清掉
        for (const node of document.querySelectorAll(`.${PREFIX}__popup`)) {
            if (node !== closing) node.remove();
        }

        for (const panel of document.querySelectorAll(`.${PREFIX}__panel.beatmapset-panel--beatmaps-popup-visible`)) {
            panel.classList.remove('beatmapset-panel--beatmaps-popup-visible');
        }

        popup = null;
        popupPanel = null;

        if (closing == null) return;

        closing.style.opacity = '0';
        window.setTimeout(() => closing.remove(), POPUP_FADE);
    }

    // 难度列表打开时，点到卡片和列表以外的地方就关掉，监听只在列表打开的时候挂着
    function onPopupDocumentClick(event) {
        if (popupPanel?.contains(event.target)) return;
        if (popup?.contains(event.target)) return;

        closePopup();
    }

    function showPopup(root, set) {
        hidePopup();

        const box = root.getBoundingClientRect();

        popup = buildPopup(set);
        popup.style.opacity = '0';
        popup.style.transitionDuration = '150ms';
        popup.style.width = `${box.width}px`;
        popup.style.setProperty('--panel-height', `${box.height}px`);

        popup.style.left = '0px';
        popup.style.top = '0px';

        portal().append(popup);

        const landed = popup.getBoundingClientRect();
        popup.style.left = `${box.left - landed.left}px`;
        popup.style.top = `${box.bottom - landed.top}px`;

        popup.addEventListener('mouseenter', cancelHide);
        popup.addEventListener('mouseleave', (e) => onPointerLeave(e.relatedTarget));

        popupPanel = root;
        root.classList.add('beatmapset-panel--beatmaps-popup-visible');

        document.addEventListener('click', onPopupDocumentClick);

        requestAnimationFrame(() => {
            if (popup) popup.style.opacity = '1';
        });
    }

    function cover(set, size) {
        const node = element('div', 'beatmapset-cover beatmapset-cover--full');

        node.style.setProperty('--bg-default', `var(--bg-default-${(set.id ?? 0) % 6})`);

        const normal = set.covers?.[size];
        const retina = set.covers?.[`${size}@2x`];

        if (normal) node.style.setProperty('--bg', `url("${normal}")`);
        if (retina) node.style.setProperty('--bg-2x', `url("${retina}")`);

        return node;
    }

    function href(set) {
        const mine = (set.beatmaps ?? [])
            .filter((b) => b.user_id === profileId)
            .sort((a, b) => (a.difficulty_rating ?? 0) - (b.difficulty_rating ?? 0))[0];

        return mine ? `/beatmapsets/${set.id}#${mine.mode}/${mine.id}` : `/beatmapsets/${set.id}`;
    }

    function mappedBy() {
        const row = document.querySelector('.beatmapset-panel__info-row--mapper .u-ellipsis-overflow');
        const name = row?.querySelector('a')?.textContent ?? '';
        const whole = row?.textContent ?? '';
        const at = name === '' ? -1 : whole.indexOf(name);

        return at > 0 ? whole.slice(0, at) : 'mapped by ';
    }

    function number(value) {
        return (value ?? 0).toLocaleString(T.locale);
    }

    function beatmapsetBadge(set, type) {
        let url = null;

        switch (type) {
            case 'featured_artist':
                if (set.track_id == null) return null;
                url = `/beatmaps/artists/tracks/${set.track_id}`;
                break;

            case 'nsfw':
                if (!set.nsfw) return null;
                break;

            case 'spotlight':
                if (!set.spotlight) return null;
                url = '/wiki/Beatmap_Spotlights';
                break;
        }

        const mark = element(url == null ? 'span' : 'a', `beatmapset-badge beatmapset-badge--${type}`, BADGE_LABEL[type]);
        if (url != null) mark.href = url;

        return mark;
    }

    function panel(set) {
        const link = href(set);
        const hyped = set.hype != null;

        const root = element('div', `beatmapset-panel beatmapset-panel--size-${siteCardSize()}${hyped ? ' beatmapset-panel--with-hype-counts' : ''} js-audio--player ${PREFIX}__panel`);
        if (set.preview_url) root.dataset.audioUrl = set.preview_url;
        // 取消卡片高亮时的过渡时长，osu! 自己的卡片也用这个变量
        root.style.setProperty('--beatmaps-popup-transition-duration', `${POPUP_FADE}ms`);

        const covers = element('a', 'beatmapset-panel__cover-container');
        covers.href = link;

        for (const [col, size] of [['play', 'list'], ['info', 'card']]) {
            const column = element('div', `beatmapset-panel__cover-col beatmapset-panel__cover-col--${col}`);
            column.append(cover(set, size));
            covers.append(column);
        }

        const content = element('div', 'beatmapset-panel__content');

        const play = element('div', 'beatmapset-panel__play-container');
        const playButton = element('button', 'beatmapset-panel__play js-audio--play');
        playButton.type = 'button';
        playButton.append(element('span', 'play-button'));
        play.append(playButton);

        const info = element('div', 'beatmapset-panel__info');

        const original = preferOriginal();

        for (const [kind, text, marks] of [
            ['title', original ? (set.title_unicode || set.title) : (set.title || set.title_unicode), ['nsfw', 'spotlight']],
            ['artist', `by ${original ? (set.artist_unicode || set.artist) : (set.artist || set.artist_unicode)}`, ['featured_artist']],
        ]) {
            const row = element('div', `beatmapset-panel__info-row beatmapset-panel__info-row--${kind}`);
            const anchor = element('a', 'beatmapset-panel__main-link u-ellipsis-overflow', text ?? '');
            anchor.href = link;

            const badges = element('div', 'beatmapset-panel__badge-container');

            for (const type of marks) {
                const mark = beatmapsetBadge(set, type);
                if (mark != null) badges.append(mark);
            }

            row.append(anchor, badges);
            info.append(row);
        }

        const source = element('div', 'beatmapset-panel__info-row beatmapset-panel__info-row--source');
        source.append(element('div', 'u-ellipsis-overflow', set.source || ''));
        info.append(source);

        const mapper = element('div', 'beatmapset-panel__info-row beatmapset-panel__info-row--mapper');
        const mapperWrap = element('div', 'u-ellipsis-overflow', mappedBy());
        const mapperLink = element('a', 'js-usercard beatmapset-panel__mapper-link u-hover', set.creator ?? '');
        mapperLink.href = `/users/${set.user_id}`;
        mapperLink.dataset.userId = String(set.user_id);
        mapperWrap.append(mapperLink);
        mapper.append(mapperWrap);
        info.append(mapper);

        const stats = element('div', 'beatmapset-panel__info-row beatmapset-panel__info-row--stats');

        if (hyped) {
            stats.append(statsItem('hype', 'fas fa-bullhorn', number(set.hype?.current)));
            stats.append(statsItem('nominations', 'fas fa-thumbs-up', number(set.nominations_summary?.current)));
        }

        stats.append(statsItem('play-count', 'fas fa-play-circle', number(set.play_count)));
        stats.append(statsItem('favourite-count', 'far fa-heart', number(set.favourite_count)));

        const dated = element('div', 'beatmapset-panel__stats-item beatmapset-panel__stats-item--date');
        const dateIcon = element('span', 'beatmapset-panel__stats-item-icon');
        dateIcon.append(element('i', 'fa-fw fas fa-check-circle'));
        const time = element('time', 'js-tooltip-time', dateShown(set));
        if (set.last_updated) {
            time.dateTime = set.last_updated;
            // 日期元素带 title 属性，鼠标停在上面时显示完整时间，osu! 自带的日期也是这样
            time.title = set.last_updated;
        }
        dated.append(dateIcon, time);
        stats.append(dated);

        info.append(stats);

        const extra = element('a', 'beatmapset-panel__info-row beatmapset-panel__info-row--extra');
        extra.href = link;

        const badgeItem = element('div', 'beatmapset-panel__extra-item');
        const badge = element('div', 'beatmapset-status beatmapset-status--panel', STATUS_LABEL[set.status] ?? set.status);
        badge.style.setProperty('--bg-hsl', `var(--beatmapset-${set.status}-bg-hsl)`);
        badge.style.setProperty('--colour', `var(--beatmapset-${set.status}-colour)`);
        badgeItem.append(badge);

        extra.append(badgeItem, dots(set));
        info.append(extra);

        extra.addEventListener('mouseenter', () => {
            if (popupPanel === root) {
                cancelHide();
                return;
            }

            showPopup(root, set);
        });

        extra.addEventListener('mouseleave', (e) => onPointerLeave(e.relatedTarget));
        root.addEventListener('mouseleave', (e) => onPointerLeave(e.relatedTarget));

        const menuContainer = element('div', 'beatmapset-panel__menu-container');
        const menu = element('div', 'beatmapset-panel__menu');
        const download = element('a', 'beatmapset-panel__menu-item');
        download.href = `/beatmapsets/${set.id}/download`;
        download.append(element('span', 'fas fa-file-download'));
        menu.append(download);
        menuContainer.append(menu);

        content.append(play, info, menuContainer);
        root.append(covers, content);

        return root;
    }

    // 这些状态没有上架日期，卡片上显示的是最后更新时间
    const STALE_STATES = ['pending', 'wip'];

    const RELATIVE_STEPS = [
        ['year', 31536000],
        ['month', 2592000],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60],
        ['second', 1],
    ];

    let relativeFormat = null;

    // 把时间转成「3 天前」这样的说法，用词由 Intl 按当前语言生成，不用写进翻译表
    function relativeText(value) {
        if (!value) return '';

        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return '';

        if (relativeFormat == null) {
            relativeFormat = new Intl.RelativeTimeFormat(T.locale, { numeric: 'always' });
        }

        const elapsed = Math.max(0, (Date.now() - parsed.getTime()) / 1000);
        const [unit, size] = RELATIVE_STEPS.find(([, seconds]) => elapsed >= seconds)
            ?? RELATIVE_STEPS[RELATIVE_STEPS.length - 1];

        return relativeFormat.format(-Math.floor(elapsed / size), unit);
    }

    function dateText(value) {
        if (!value) return '';

        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return '';

        return parsed.toLocaleDateString(T.locale, { day: 'numeric', month: 'short', year: 'numeric' });
    }

    // 相对时间只在 pending / wip 上用；坟场和上架的谱面一样，显示具体日期
    function dateShown(set) {
        return STALE_STATES.includes(set.status) ? relativeText(set.last_updated) : dateText(set.last_updated);
    }

    // 页面自带的卡片由 React 生成，也换成相对时间，只改日期文字，不替换元素
    function relativeSiteDates() {
        for (const panel of document.querySelectorAll('.beatmapset-panel')) {
            if (panel.closest(`.${PREFIX}`)) continue;

            const style = panel.querySelector('.beatmapset-status')?.getAttribute('style') ?? '';
            if (!STALE_STATES.some((state) => style.includes(`--beatmapset-${state}-bg-hsl`))) continue;

            const time = panel.querySelector('.beatmapset-panel__stats-item--date time');
            const text = relativeText(time?.getAttribute('datetime'));
            if (!text) continue;

            if (time.firstChild?.nodeType === 3) {
                if (time.firstChild.nodeValue !== text) time.firstChild.nodeValue = text;
            } else {
                time.textContent = text;
            }
        }
    }

    function preferOriginal() {
        const shown = document.querySelector('.beatmapset-panel__info-row--artist .beatmapset-panel__main-link');
        if (!shown) return true;

        return /[^\x00-\x7f]/.test(shown.textContent ?? '');
    }

    function showMoreButton(section) {
        const button = element('button', `show-more-link show-more-link--profile-page ${PREFIX}__more`);
        button.type = 'button';
        button.disabled = section.loading;

        const spinner = element('span', 'show-more-link__spinner');
        spinner.append(element('span', 'la-ball-clip-rotate'));

        const label = element('span', 'show-more-link__label');

        for (const side of ['left', 'right']) {
            const icon = element('span', `show-more-link__label-icon show-more-link__label-icon--${side}`);
            icon.append(element('span', 'fas fa-angle-down'));

            if (side === 'left') {
                label.append(icon, element('span', 'show-more-link__label-text', section.loading ? LOADING : SHOW_MORE));
            } else {
                label.append(icon);
            }
        }

        button.append(spinner, label);
        button.addEventListener('click', () => expand(section));

        return button;
    }

    function draw(section) {
        const block = element('div', `${PREFIX}__section`);

        const heading = element('button', `${PREFIX}__heading`);
        heading.type = 'button';

        const title = element('h3', 'title title--page-extra-small', section.title);

        const whole = section.streams.every((s) => s.done);
        title.append(element('span', 'title__count', whole ? String(section.sets.length) : `${section.sets.length}+`));

        heading.append(title);

        heading.addEventListener('click', () => {
            section.folded = !section.folded;
            render();
        });

        block.append(heading);

        if (section.folded) return block;

        const list = element('div', 'page-extra__beatmapsets js-audio--group');
        for (const set of section.sets.slice(0, section.shown)) list.append(panel(set));
        block.append(list);

        if (section.sets.length > section.shown || section.streams.some((s) => !s.done)) {
            block.append(showMoreButton(section));
        }

        return block;
    }

    async function expand(section) {
        section.shown += PER_EXPANSION;
        section.loading = true;
        render();

        while (section.sets.length < section.shown && section.streams.some((s) => !s.done)) {
            await readMore(section);
        }

        section.loading = false;
        render();
    }

    function before(anchor) {
        const theirs = [...anchor.querySelectorAll('.page-extra__beatmapsets')]
            .filter((list) => !list.closest(`.${PREFIX}`));

        const heading = theirs[theirs.length - 1]?.previousElementSibling;

        return new RegExp(T.nominationPattern, 'i').test(heading?.textContent ?? '') ? heading : null;
    }

    function render() {
        hidePopup();

        const anchor = document.querySelector('.page-extra__beatmapsets')?.closest('.page-extra');
        if (!anchor) return;

        // 关掉该区块的滚动锚定，避免点击「显示更多」时浏览器滚动到新增的卡片底部
        anchor.classList.add(`${PREFIX}__beatmaps-extra`);

        const existing = anchor.querySelector(`.${PREFIX}`);
        const host = existing ?? element('div', PREFIX);
        host.textContent = '';

        const drawn = sections.filter((section) => section.sets.length > 0);

        for (const section of drawn) host.append(draw(section));

        if (sections.some((s) => s.refused)) {
            host.append(element('div', `${PREFIX}__notice`, SIGNED_OUT_NOTICE));
        } else if (drawn.length === 0) {
            if (existing) existing.remove();
            return;
        }

        const nominated = before(anchor);

        if (nominated) nominated.parentElement.insertBefore(host, nominated);
        else anchor.append(host);
    }

    function style() {
        if (document.getElementById(`${PREFIX}-style`)) return;

        const css = element('style');
        css.id = `${PREFIX}-style`;
        css.textContent = `
            .${PREFIX}__section { margin-top: 30px; }
            .${PREFIX}__heading {
                display: flex; align-items: baseline; width: 100%;
                background: none; border: none; padding: 0; margin: 0; color: inherit; font: inherit;
                text-align: left; cursor: pointer;
            }
            .${PREFIX}__notice { color: hsl(var(--hsl-f1)); font-size: 12px; margin-top: 10px; }
            .${PREFIX}__beatmaps-extra { overflow-anchor: none; }
        `;

        document.head.append(css);
    }

    function idFromPage() {
        const fromPath = location.pathname.match(/^\/users\/(\d+)/);
        if (fromPath) return Number(fromPath[1]);

        const canonical = document.querySelector('link[rel="canonical"]')?.href ?? '';
        const fromCanonical = canonical.match(/\/users\/(\d+)/);

        return fromCanonical ? Number(fromCanonical[1]) : null;
    }

    async function start() {
        sections = SECTIONS.map((section) => ({
            ...section,
            sets: [],
            shown: INITIAL,
            loading: false,
            folded: false,
            refused: false,
            streams: section.states.map((state) => ({ state, cursor: null, done: false })),
        }));

        for (const section of sections) {
            await readMore(section);
        }

        render();
    }

    let started = false;
    let address = location.pathname;

    function tick() {
        relativeSiteDates();

        if (location.pathname !== address) {
            address = location.pathname;
            started = false;
            cardSize = null;
            // 页面用客户端路由切换，前进后退不触发 pagehide，难度列表只能在这里收起
            hidePopup();
        }

        if (started) {
            if (sections && !document.querySelector(`.${PREFIX}`)) render();
            return;
        }

        if (!document.querySelector('.page-extra__beatmapsets')) return;

        const id = idFromPage();
        if (!id) return;

        // 回到同一个人的资料页时复用已加载的数据，避免重新加载后展开的卡片又收起来
        if (sections && id === profileId) {
            started = true;
            render();
            return;
        }

        profileId = id;
        started = true;
        style();
        start().catch((error) => console.error(T.logPrefix, error));
    }

    window.addEventListener('pagehide', hidePopup);

    // 挂到 documentElement 上，避免换页时 Turbo 替换整个 <body> 导致监听失效
    new MutationObserver(tick).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(tick, 1000);
    tick();
})();
