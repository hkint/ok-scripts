// ==UserScript==
// @name         精简版 H5 视频播放器快捷键
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  精简自用版：只保留快进/退、音量、倍速(带提示)、旋转、逐帧、全屏、截图功能
// @match        *://*/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 自动获取当前页面正在播放或面积最大的视频元素
    function getActiveVideo() {
        let videos = Array.from(document.querySelectorAll('video')).filter(v => v.offsetWidth > 0 && v.offsetHeight > 0);
        if (videos.length === 0) return null;
        // 优先返回体积最大的视频
        videos.sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight));
        return videos[0];
    }

    let tipTimer = null;
    // 在屏幕上显示提示信息的轻量级组件
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
                background: rgba(0, 0, 0, 0.6);
                color: #fff;
                padding: 10px 20px;
                border-radius: 8px;
                font-size: 18px;
                font-weight: bold;
                font-family: sans-serif;
                z-index: 2147483647;
                pointer-events: none;
                transition: opacity 0.3s;
                opacity: 0;
            `;
            // 如果处于全屏状态，优先将提示框挂载到全屏元素下，否则挂载到 body 下
            const container = document.fullscreenElement || document.body;
            container.appendChild(tipEl);
        } else {
            // 确保在全屏切换时提示框层级正确
            const container = document.fullscreenElement || document.body;
            if (tipEl.parentNode !== container) {
                container.appendChild(tipEl);
            }
        }

        tipEl.textContent = text;
        tipEl.style.opacity = '1';

        // 每次触发都重置定时器
        if (tipTimer) clearTimeout(tipTimer);
        tipTimer = setTimeout(() => {
            tipEl.style.opacity = '0';
        }, 1500); // 1.5秒后消失
    }

    let rotateDeg = 0; // 记录旋转角度
    let isWebFullscreen = false; // 记录网页全屏状态
    let originalStyles = new Map(); // 保存视频原样式，用于退出网页全屏

    // 网页全屏切换功能
    function toggleWebFullscreen(video) {
        if (!isWebFullscreen) {
            originalStyles.set(video, video.style.cssText);
            video.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 99999999 !important; object-fit: contain !important; background: black !important; margin: 0 !important; padding: 0 !important;';
            isWebFullscreen = true;
        } else {
            video.style.cssText = originalStyles.get(video) || '';
            isWebFullscreen = false;
        }
    }

    // 截图功能
    function takeScreenshot(video) {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataURL = canvas.toDataURL('image/png');
        
        const a = document.createElement('a');
        a.href = dataURL;
        a.download = `Screenshot_${new Date().getTime()}.png`;
        a.click();
        showTip('截图已保存');
    }

    // 监听键盘事件
    document.addEventListener('keydown', function(event) {
        // 如果用户正在输入框中打字，则不触发快捷键
        const activeTagName = document.activeElement ? document.activeElement.tagName : '';
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTagName) || document.activeElement.isContentEditable) {
            return;
        }

        const video = getActiveVideo();
        if (!video) return;

        const fpsTime = 1 / 30; // 假设视频为 30 fps 进行微调
        let handled = true;

        if (event.key === 'ArrowRight') {
            video.currentTime += event.ctrlKey ? 30 : 5;
        } else if (event.key === 'ArrowLeft') {
            video.currentTime -= event.ctrlKey ? 30 : 5;
        } else if (event.key === 'ArrowUp') {
            video.volume = Math.min(1, video.volume + (event.ctrlKey ? 0.2 : 0.05));
            showTip(`音量: ${Math.round(video.volume * 100)}%`);
        } else if (event.key === 'ArrowDown') {
            video.volume = Math.max(0, video.volume - (event.ctrlKey ? 0.2 : 0.05));
            showTip(`音量: ${Math.round(video.volume * 100)}%`);
        } else if (event.key.toLowerCase() === 'c') {
            // 加速播放，使用 parseFloat 和 toFixed 防止出现无限小数
            video.playbackRate = parseFloat(Math.min(16, video.playbackRate + 0.1).toFixed(1));
            showTip(`当前倍速: ${video.playbackRate}X`);
        } else if (event.key.toLowerCase() === 'x') {
            // 减速播放
            video.playbackRate = parseFloat(Math.max(0.1, video.playbackRate - 0.1).toFixed(1));
            showTip(`当前倍速: ${video.playbackRate}X`);
        } else if (event.key.toLowerCase() === 'z') {
            // 正常速度
            video.playbackRate = 1;
            showTip(`当前倍速: 1.0X`);
        } else if (event.key.toLowerCase() === 's' && !event.shiftKey) {
            rotateDeg += 90;
            video.style.transform = `rotate(${rotateDeg}deg)`;
            video.style.transition = 'transform 0.3s';
            showTip(`画面旋转: ${rotateDeg}度`);
        } else if (event.key.toLowerCase() === 'd') {
            video.pause();
            video.currentTime -= fpsTime;
        } else if (event.key.toLowerCase() === 'f') {
            video.pause();
            video.currentTime += fpsTime;
        } else if (event.key === 'Enter' && !event.shiftKey) {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                video.requestFullscreen().catch(err => console.log("全屏请求被拒绝"));
            }
        } else if (event.key === 'Enter' && event.shiftKey) {
            toggleWebFullscreen(video);
        } else if (event.key === 'S' && event.shiftKey) {
            takeScreenshot(video);
        } else {
            handled = false; // 未按定义快捷键
        }

        if (handled) {
            event.preventDefault();
            event.stopPropagation();
        }
    }, true); 

})();
