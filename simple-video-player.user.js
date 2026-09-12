// ==UserScript==
// @name         精简版视频播放器快捷键
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  快进/退、音量、倍速、倍速记忆持久化、旋转、逐帧、全屏、截图
// @match        *://*/*
// @grant        none
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/hkint/ok-scripts/main/simple-video-player.user.js
// @downloadURL  https://raw.githubusercontent.com/hkint/ok-scripts/main/simple-video-player.user.js
// ==/UserScript==

(function() {
    'use strict';

    /***********************
     * 常量配置与数据持久化
     ***********************/

    const RATE_STEP = 0.1;
    const MIN_RATE = 0.1;
    const MAX_RATE = 16;
    const DEFAULT_TOGGLE_RATE = 2;
    const STORAGE_KEY = 'h5player_saved_playback_rate';

    // 从 localStorage 获取已保存的倍速，若没有则默认为 1
    function getSavedRate() {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? parseFloat(saved) : 1;
    }

    // 保存倍速到 localStorage
    function saveRate(rate) {
        localStorage.setItem(STORAGE_KEY, rate.toString());
    }

    let savedRate = getSavedRate();
    let lastNonOnePlaybackRate = savedRate !== 1 ? savedRate : DEFAULT_TOGGLE_RATE;

    /***********************
     * 倍速自动应用与监听机制
     ***********************/

    // 为单个视频应用倍速并绑定重置防御
    function applySavedRateToVideo(video) {
        if (!video || video.dataset.rateMemoryAttached) return;

        // 标记已绑定，避免重复绑定
        video.dataset.rateMemoryAttached = 'true';

        const applyRate = () => {
            const currentSaved = getSavedRate();
            if (currentSaved !== 1 && Math.abs(video.playbackRate - currentSaved) > 0.01) {
                video.playbackRate = currentSaved;
            }
        };

        // 初始尝试设置一次
        applyRate();

        // 当视频元数据加载完成或开始播放时，再次强制设置（防御部分网站自动重置为1.0）
        video.addEventListener('loadeddata', applyRate);
        video.addEventListener('play', applyRate);
    }

    // 全局扫描并应用倍速
    function applyRateToAllVideos() {
        document.querySelectorAll('video').forEach(applySavedRateToVideo);
    }

    // 监听 DOM 动态加载（适配单页面应用如 B站、YouTube 切换视频）
    const observer = new MutationObserver(() => {
        applyRateToAllVideos();
    });
    observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
    });

    // 页面加载完成后立即执行一次
    applyRateToAllVideos();

    /***********************
     * 获取当前视频
     *
     * 优先级：
     * 1. 鼠标当前悬停视频
     * 2. 正在播放的视频
     * 3. 最大面积视频
     ***********************/

    function getActiveVideo() {
        const videos = Array.from(
            document.querySelectorAll('video')
        ).filter(v =>
            v.offsetWidth > 0 &&
            v.offsetHeight > 0
        );

        if (videos.length === 0) {
            return null;
        }

        // 优先鼠标所在 video
        const hoverVideo = videos.find(v => {
            const rect = v.getBoundingClientRect();
            return (
                mouseX >= rect.left &&
                mouseX <= rect.right &&
                mouseY >= rect.top &&
                mouseY <= rect.bottom
            );
        });

        if (hoverVideo) return hoverVideo;

        // 优先播放中的视频
        const playingVideo = videos.find(v =>
            !v.paused &&
            !v.ended &&
            v.readyState > 2
        );

        if (playingVideo) return playingVideo;

        // 最后选择最大视频
        videos.sort(
            (a, b) =>
                (b.offsetWidth * b.offsetHeight) -
                (a.offsetWidth * a.offsetHeight)
        );

        return videos[0];
    }

    let mouseX = 0;
    let mouseY = 0;

    document.addEventListener(
        'mousemove',
        e => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        },
        { passive: true }
    );

    /***********************
     * Toast提示
     ***********************/

    let tipTimer = null;

    function showTip(text) {
        let tipEl = document.getElementById('h5player-simple-tip');

        if (!tipEl) {
            tipEl = document.createElement('div');
            tipEl.id = 'h5player-simple-tip';
            tipEl.style.cssText = `
                position: fixed;
                top: 15%;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0,0,0,.65);
                color: white;
                padding: 10px 20px;
                border-radius: 8px;
                font-size: 18px;
                font-weight: bold;
                font-family: sans-serif;
                z-index: 2147483647;
                pointer-events: none;
                opacity: 0;
                transition: opacity .2s;
            `;
            document.body.appendChild(tipEl);
        }

        tipEl.textContent = text;
        tipEl.style.opacity = '1';

        if (tipTimer) {
            clearTimeout(tipTimer);
        }

        tipTimer = setTimeout(() => {
            tipEl.style.opacity = '0';
        }, 1500);
    }

    /***********************
     * 快捷键过滤
     ***********************/

    function isEditable(el) {
        if (!el) return false;
        return (
            el.isContentEditable ||
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
        );
    }

    function shouldHandleShortcut(event) {
        if (event.metaKey || event.ctrlKey || event.altKey) return false;
        if (event.isComposing) return false;
        if (isEditable(event.target)) return false;
        return true;
    }

    /***********************
     * 倍速控制逻辑（包含写入存储）
     ***********************/

    function setPlaybackRate(video, rate) {
        rate = Math.max(MIN_RATE, Math.min(MAX_RATE, rate));
        rate = Math.round(rate * 10) / 10; // 修正浮点精度

        video.playbackRate = rate;

        // 保存倍速到全局存储
        saveRate(rate);

        if (rate !== 1) {
            lastNonOnePlaybackRate = rate;
        }

        showTip(`当前倍速: ${rate.toFixed(1)}X`);
    }

    function changePlaybackRate(video, delta) {
        setPlaybackRate(video, video.playbackRate + delta);
    }

    function togglePlaybackRate(video) {
        if (video.playbackRate === 1) {
            setPlaybackRate(
                video,
                lastNonOnePlaybackRate || DEFAULT_TOGGLE_RATE
            );
        } else {
            lastNonOnePlaybackRate = video.playbackRate;
            setPlaybackRate(video, 1);
        }
    }

    /***********************
     * 旋转/全屏状态
     ***********************/

    let rotateDeg = 0;
    let isWebFullscreen = false;
    let webFullscreenElement = null;
    let webFullscreenOldStyle = '';

    function toggleWebFullscreen(video) {
        const container = getFullscreenTarget(video);

        if (!isWebFullscreen) {
            webFullscreenElement = container;
            webFullscreenOldStyle = container.style.cssText;
            container.style.cssText += `
                position:fixed!important;
                top:0!important;
                left:0!important;
                width:100vw!important;
                height:100vh!important;
                z-index:2147483646!important;
                background:black!important;
            `;
            document.body.style.overflow = 'hidden';
            isWebFullscreen = true;
        } else {
            if (webFullscreenElement) {
                webFullscreenElement.style.cssText = webFullscreenOldStyle;
            }
            document.body.style.overflow = '';
            isWebFullscreen = false;
        }
    }

    /***********************
     * 截图与辅助函数
     ***********************/

    function takeScreenshot(video) {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `Screenshot_${Date.now()}.png`;
        a.click();

        showTip('截图已保存');
    }

    function getFullscreenTarget(video) {
        const yt = video.closest('#movie_player');
        if (yt) return yt;

        const bili = video.closest('.bpx-player-container');
        if (bili) return bili;

        return video.parentElement || video;
    }

    /***********************
     * 键盘快捷键监听
     ***********************/

    document.addEventListener(
        'keydown',
        function(event) {
            if (!shouldHandleShortcut(event)) return;

            const video = getActiveVideo();
            if (!video) return;

            const fpsTime = 1 / 30;
            let handled = true;
            const key = event.key.toLowerCase();

            // 快进/快退
            if (event.key === 'ArrowRight') {
                video.currentTime += event.ctrlKey ? 30 : 5;
            } else if (event.key === 'ArrowLeft') {
                video.currentTime -= event.ctrlKey ? 30 : 5;

            // 音量控制
            } else if (event.key === 'ArrowUp') {
                video.volume = Math.min(1, video.volume + (event.ctrlKey ? 0.2 : 0.05));
                showTip(`音量: ${Math.round(video.volume * 100)}%`);
            } else if (event.key === 'ArrowDown') {
                video.volume = Math.max(0, video.volume - (event.ctrlKey ? 0.2 : 0.05));
                showTip(`音量: ${Math.round(video.volume * 100)}%`);

            // 倍速控制
            } else if (key === 'c') {
                changePlaybackRate(video, RATE_STEP);
            } else if (key === 'x') {
                changePlaybackRate(video, -RATE_STEP);
            } else if (key === 'z') {
                togglePlaybackRate(video);

            // 旋转
            } else if (key === 's' && !event.shiftKey) {
                rotateDeg += 90;
                video.style.transform = `rotate(${rotateDeg}deg)`;
                video.style.transition = 'transform .3s';
                showTip(`画面旋转: ${rotateDeg}度`);

            // 逐帧控制
            } else if (key === 'd') {
                video.pause();
                video.currentTime -= fpsTime;
            } else if (key === 'f') {
                video.pause();
                video.currentTime += fpsTime;

            // 原生全屏
            } else if (event.key === 'Enter' && !event.shiftKey) {
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                } else {
                    const target = getFullscreenTarget(video);
                    target.requestFullscreen().catch(() => {});
                }

            // 网页全屏
            } else if (event.key === 'Enter' && event.shiftKey) {
                toggleWebFullscreen(video);

            // 截图
            } else if (event.key === 'S' && event.shiftKey) {
                takeScreenshot(video);
            } else {
                handled = false;
            }

            if (handled) {
                event.preventDefault();
                event.stopPropagation();
            }
        },
        true
    );
})();
