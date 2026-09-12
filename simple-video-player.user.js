// ==UserScript==
// @name         精简版视频播放器快捷键
// @namespace    http://tampermonkey.net/
// @version      2.2
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

    function getSavedRate() {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? parseFloat(saved) : 1;
    }

    function saveRate(rate) {
        localStorage.setItem(STORAGE_KEY, rate.toString());
    }

    let savedRate = getSavedRate();
    let lastNonOnePlaybackRate = savedRate !== 1 ? savedRate : DEFAULT_TOGGLE_RATE;

    /***********************
     * 倍速自动应用与监听机制
     ***********************/

    function applySavedRateToVideo(video) {
        if (!video || video.dataset.rateMemoryAttached) return;
        video.dataset.rateMemoryAttached = 'true';

        const applyRate = () => {
            const currentSaved = getSavedRate();
            if (currentSaved !== 1 && Math.abs(video.playbackRate - currentSaved) > 0.01) {
                video.playbackRate = currentSaved;
            }
        };

        applyRate();
        video.addEventListener('loadeddata', applyRate);
        video.addEventListener('play', applyRate);
    }

    function applyRateToAllVideos() {
        document.querySelectorAll('video').forEach(applySavedRateToVideo);
    }

    const observer = new MutationObserver(() => {
        applyRateToAllVideos();
    });
    observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
    });

    applyRateToAllVideos();

    /***********************
     * 获取当前视频
     ***********************/

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

    function getActiveVideo() {
        const videos = Array.from(
            document.querySelectorAll('video')
        ).filter(v =>
            v.offsetWidth > 0 &&
            v.offsetHeight > 0
        );

        if (videos.length === 0) return null;

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

        const playingVideo = videos.find(v =>
            !v.paused &&
            !v.ended &&
            v.readyState > 2
        );
        if (playingVideo) return playingVideo;

        videos.sort(
            (a, b) =>
                (b.offsetWidth * b.offsetHeight) -
                (a.offsetWidth * a.offsetHeight)
        );

        return videos[0];
    }

    /***********************
     * Toast 提示框
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
                background: rgba(0,0,0,.85);
                color: #fff;
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

        if (tipTimer) clearTimeout(tipTimer);
        tipTimer = setTimeout(() => {
            tipEl.style.opacity = '0';
        }, 1500);
    }

    /***********************
     * 快捷键过滤机制
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
     * 倍速控制
     ***********************/

    function setPlaybackRate(video, rate) {
        rate = Math.max(MIN_RATE, Math.min(MAX_RATE, rate));
        rate = Math.round(rate * 10) / 10;

        video.playbackRate = rate;
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
     * 全屏逻辑 (原生 & 网页)
     ***********************/

    let isWebFullscreen = false;
    let webFullscreenTarget = null;

    // 寻找最佳的全屏容器
    function getFullscreenContainer(video) {
        const yt = video.closest('#movie_player');
        if (yt) return yt;

        const bili = video.closest('.bpx-player-container');
        if (bili) return bili;

        return video.parentElement || video;
    }

    // 原生全屏
    function toggleNativeFullscreen(video) {
        const ytPlayer = document.getElementById('movie_player');
        if (ytPlayer && typeof ytPlayer.toggleFullscreen === 'function') {
            ytPlayer.toggleFullscreen();
            return;
        }

        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        } else {
            const target = getFullscreenContainer(video);
            target.requestFullscreen().catch(() => {});
        }
    }

    // 网页全屏 (修复包含 CSS contain 限制的网站)
    function toggleWebFullscreen(video) {
        const target = getFullscreenContainer(video);

        if (!isWebFullscreen) {
            webFullscreenTarget = target;

            let styleEl = document.getElementById('h5player-webfs-style');
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'h5player-webfs-style';
                document.head.appendChild(styleEl);
            }

            styleEl.innerHTML = `
                .h5player-web-fullscreen-active {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    max-width: none !important;
                    max-height: none !important;
                    z-index: 2147483647 !important;
                    background: #000 !important;
                    transform: none !important;
                    contain: none !important;
                }
                .h5player-web-fullscreen-active video {
                    width: 100% !important;
                    height: 100% !important;
                    object-fit: contain !important;
                }
                body.h5player-webfs-body-active {
                    overflow: hidden !important;
                }
            `;

            target.classList.add('h5player-web-fullscreen-active');
            document.body.classList.add('h5player-webfs-body-active');
            isWebFullscreen = true;
            showTip('已开启网页全屏');
        } else {
            if (webFullscreenTarget) {
                webFullscreenTarget.classList.remove('h5player-web-fullscreen-active');
            }
            document.body.classList.remove('h5player-webfs-body-active');
            isWebFullscreen = false;
            showTip('已退出网页全屏');
        }
    }

    /***********************
     * 截图
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

    /***********************
     * 键盘响应事件
     ***********************/

    let rotateDeg = 0;

    document.addEventListener(
        'keydown',
        function(event) {
            if (!shouldHandleShortcut(event)) return;

            const video = getActiveVideo();
            if (!video) return;

            const fpsTime = 1 / 30;
            let handled = true;

            const isEnter = event.key === 'Enter' || event.keyCode === 13;
            const isShift = event.shiftKey;

            // 优先匹配网页全屏 (Shift + Enter)
            if (isEnter && isShift) {
                toggleWebFullscreen(video);

            // 原生全屏 (单独 Enter)
            } else if (isEnter && !isShift) {
                toggleNativeFullscreen(video);

            // 快进/快退
            } else if (event.key === 'ArrowRight') {
                video.currentTime += event.ctrlKey ? 30 : 5;
            } else if (event.key === 'ArrowLeft') {
                video.currentTime -= event.ctrlKey ? 30 : 5;

            // 音量
            } else if (event.key === 'ArrowUp') {
                video.volume = Math.min(1, video.volume + (event.ctrlKey ? 0.2 : 0.05));
                showTip(`音量: ${Math.round(video.volume * 100)}%`);
            } else if (event.key === 'ArrowDown') {
                video.volume = Math.max(0, video.volume - (event.ctrlKey ? 0.2 : 0.05));
                showTip(`音量: ${Math.round(video.volume * 100)}%`);

            // 倍速
            } else if (event.key.toLowerCase() === 'c') {
                changePlaybackRate(video, RATE_STEP);
            } else if (event.key.toLowerCase() === 'x') {
                changePlaybackRate(video, -RATE_STEP);
            } else if (event.key.toLowerCase() === 'z') {
                togglePlaybackRate(video);

            // 旋转
            } else if (event.key.toLowerCase() === 's' && !isShift) {
                rotateDeg += 90;
                video.style.transform = `rotate(${rotateDeg}deg)`;
                video.style.transition = 'transform .3s';
                showTip(`画面旋转: ${rotateDeg}度`);

            // 逐帧
            } else if (event.key.toLowerCase() === 'd') {
                video.pause();
                video.currentTime -= fpsTime;
            } else if (event.key.toLowerCase() === 'f') {
                video.pause();
                video.currentTime += fpsTime;

            // 截图 (Shift + S)
            } else if ((event.key === 'S' || event.key === 's') && isShift) {
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
