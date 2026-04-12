import { DataCollector } from './DataCollector.js';
import { WeatherSystem } from './weathersystem.js';

export class GameManager {
    constructor() {
        this.dataCollector = new DataCollector();
        
        // 綁定按鍵
        window.addEventListener('keydown', (e) => this.handleInput(e));
        
        this.isStopped = false;
        this.isRunning = true;
        this.hasStarted = false; 
        this.isEventActive = false;
        // 預設變數
        this.weather = null;
        this.player = null;
        this.headlights = [];
        this.isHeadlightOn = false;
        this.externalConnectAction = null;

        // ★ 初始化事件統計資料結構
        this.initEventStats();

        // ★ 初始化介面
        this.createStartScreen();
        
        // 確保失敗畫面是隱藏的
        const failScreen = document.getElementById('fail-screen');
        if (failScreen) failScreen.style.display = 'none';
    }

    // ==========================================
    //           ★ 新增：事件統計功能
    // ==========================================

    initEventStats() {
        this.eventStats = {
            'phone':       { name: '手機響 (Distracted)', total: 0, success: 0 },
            'pedestrian':  { name: '行人衝出 (Ghost Probe)', total: 0, success: 0 },
            'truck':       { name: '大卡車 (Big Truck)', total: 0, success: 0 },
            'construction':{ name: '施工路段 (Construction)', total: 0, success: 0 },
            'ambulance':   { name: '救護車 (Ambulance)', total: 0, success: 0 },
            'traffic_light':{ name: '紅綠燈停等', total: 0, success: 0 },
            'roadsign':     { name: '禁止通行', total: 0, success: 0 },    
        };
    }

recordEventStart(type) {
        this.isEventActive = true;
        this.activeEventType = type; // ★ 新增：記住現在正在發生的事件代號
        if (this.eventStats[type]) {
            const name = this.eventStats[type].name.split(' ')[0]; // 取得「行人衝出」等中文名
            this.eventStats[type].total++;
            
            // ★ 修復：如果 DataCollector 裡還沒有這個事件，幫它建立一個預設物件
            if (!this.dataCollector.report.events.stats[name]) {
                this.dataCollector.report.events.stats[name] = { spawn: 0, success: 0, times: [] };
            }
            
            // 正確增加出現次數
            this.dataCollector.report.events.stats[name].spawn++;
            console.log(`⚠️ 事件觸發: ${name} (已記錄)`);
        }
    }

    recordEventSuccess(type, reactionTime = null) {
        this.isEventActive = false;
        this.activeEventType = null; // ★ 新增：成功後清除狀態
        if (this.eventStats[type]) {
            const name = this.eventStats[type].name.split(' ')[0];
            this.eventStats[type].success++;

            // ★ 修復：確保物件存在再寫入
            if (!this.dataCollector.report.events.stats[name]) {
                this.dataCollector.report.events.stats[name] = { spawn: 0, success: 0, times: [] };
            }
            
            // 正確增加成功次數
            const target = this.dataCollector.report.events.stats[name];
            target.success++;
            
            // 如果有反應時間，存入陣列中供後續算平均
            if (reactionTime !== null) {
                target.times.push(reactionTime);
            }
            
            console.log(`✅ 事件成功: ${name} | 反應時間: ${reactionTime ? reactionTime + 'ms' : '無'}`);
        }
    }

    recordEventEnd() {
        this.isEventActive = false;
        this.activeEventType = null; // ★ 新增：結束時清除狀態
        console.log(`🛑 事件強制結束/超時，解除無敵狀態`);
    }
    // ==========================================
    //               原本的功能區塊
    // ==========================================

    bindConnectAction(action) {
        this.externalConnectAction = action;
    }

createStartScreen() {
    const existingUI = [
        document.getElementById('dashboard'),
        document.getElementById('start-btn'),
        document.getElementById('nav-ui')
    ];
    existingUI.forEach(el => { if (el) el.style.display = 'none'; });

    const startScreen = document.createElement('div');
    startScreen.id = 'start-screen';
    Object.assign(startScreen.style, {
        position: 'fixed', top: '0', left: '0',
        width: '100%', height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.9)', // 稍微調深一點增加閱讀性
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        zIndex: '99999', color: 'white', backdropFilter: 'blur(8px)'
    });

    // 將說明內容格式化為 HTML
    startScreen.innerHTML = `
        <div style="text-align: center; max-width: 700px; padding: 40px; border: 1px solid #555; border-radius: 20px; background: rgba(25,25,25,0.95); box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <h1 style="font-size: 42px; color: #4db8ff; margin-bottom: 20px;">🚗 駕駛模擬訓練</h1>
            
            <div style="text-align: left; background: rgba(255,255,255,0.05); padding: 25px; border-radius: 12px; margin-bottom: 30px; line-height: 1.6; border-left: 4px solid #4db8ff;">
                <p style="margin: 0 0 10px 0;"><strong style="color: #ffcc00;">🎮 操作說明：</strong><br>
                    使用方向鍵 <b>↑ ↓ ← →</b> 進行移動（加速/減速/轉向）。<br>
                    檔位切換：<b>R / D</b> | 開大燈：<b>H</b> | 左右方向燈：<b>Z / C</b>
                </p>
                <p style="margin: 0 0 10px 0;"><strong style="color: #ffcc00;">🛡️ 訓練說明：</strong><br>
                    訓練過程中會隨機發生各種道路狀況，請想像您正行駛於真實道路，並做出適當的反應。
                </p>
                <p style="margin: 0;"><strong style="color: #ffcc00;">🚩 目標說明：</strong><br>
                    請依照右下角導航指示抵達指定位置，累計成功抵達 <b>2 次</b> 後訓練即結束。
                </p>
            </div>

            <div style="display: flex; gap: 20px; justify-content: center;">
                <button id="gm-connect-btn" style="padding: 15px 30px; font-size: 18px; cursor: pointer; background: #28a745; color: white; border: none; border-radius: 50px; transition: 0.3s;">📡 連接感測器</button>
                <button id="gm-start-btn" style="padding: 15px 40px; font-size: 18px; cursor: pointer; background: linear-gradient(45deg, #4db8ff, #0077cc); color: white; border: none; border-radius: 50px; transition: 0.3s; font-weight: bold;">🚀 開始訓練</button>
            </div>
            <p id="gm-status" style="margin-top: 20px; color: #aaa; font-size: 14px;">系統狀態：尚未連接</p>
        </div>
    `;

    document.body.appendChild(startScreen);

    const startBtn = document.getElementById('gm-start-btn');
    const connectBtn = document.getElementById('gm-connect-btn');
    const statusText = document.getElementById('gm-status');

    // 連接按鈕邏輯
    connectBtn.addEventListener('click', async () => {
        if (this.externalConnectAction) {
            statusText.innerText = "⏳ 正在嘗試連接裝置...";
            try {
                await this.externalConnectAction(); 
                statusText.innerText = "✅ 裝置已連接，可以開始訓練";
                statusText.style.color = "#28a745";
                connectBtn.style.background = "#1e7e34";
                connectBtn.innerText = "已連接";
                connectBtn.disabled = true;
            } catch (error) {
                console.error("連接失敗:", error);
                statusText.innerText = "❌ 連接失敗，請確認裝置是否開啟並重試";
                statusText.style.color = "#dc3545";
            }
        } else {
            statusText.innerText = "⚠️ 系統錯誤：未偵測到連接模組";
        }
    });

    // 開始訓練按鈕邏輯
    startBtn.addEventListener('click', () => {
        startScreen.style.transition = 'opacity 0.5s ease';
        startScreen.style.opacity = '0';
        setTimeout(() => {
            startScreen.style.display = 'none';
            this.startGame(); 
        }, 500); 
    });
}

    startGame() {
        console.log("遊戲正式開始！");
        this.hasStarted = true;
        this.isRunning = true;
        
        this.initEventStats();

        const dashboard = document.getElementById('dashboard');
        if (dashboard) dashboard.style.display = 'flex';
    }

    endGame() {
        if (document.getElementById('game-report-overlay')) return;
        this.triggerGameOver("駕駛主動結束行程");
    }

// ==========================================
    //      ★ 核心：結束邏輯與報表生成 (雷達圖 + 分數 + 底部細節)
    // ==========================================
    triggerGameOver(reason) {
        console.log(`🏁 遊戲結束: ${reason}`);
        this.isRunning = false; 
        this.isStopped = true;
        this.hasStarted = false;

        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        if (this.dataCollector) {
            this.dataCollector.saveResult();
        }

        const oldReport = document.getElementById('game-report-overlay');
        if (oldReport) oldReport.remove();

        const dashboard = document.getElementById('dashboard');
        if (dashboard) dashboard.style.display = 'none';

        // --- 安全取得報表數據 ---
        const eStats = this.dataCollector?.report?.events?.stats || {};
        const rStats = this.dataCollector?.report?.regulation?.stats || {};
        const finalScores = (typeof this.dataCollector?.generateFinalReport === 'function') ? this.dataCollector.generateFinalReport() : [];
        const timeStr = this.dataCollector ? this.dataCollector._getElapsedStr() : "00:00";

        // ==========================================
        // ★ 準備雷達圖數據與頂部橫向卡片 HTML
        // ==========================================
        const iconMap = { "注意力": "👀", "反應時間": "⚡", "穩定度": "🚗", "法規認知": "⚖️" };
        const radarLabels = ["注意力", "反應時間", "穩定度", "法規認知"];
        const scoreMap = {};
        let topScoresCardsHtml = '';

        finalScores.forEach(s => {
            let score = s["評分(0-4)"];
            scoreMap[s["向度"]] = score; // 存入字典供雷達圖使用
            
            let isLow = score < 2; 
            let color = isLow ? "#ff4444" : "#00ff00"; 
            let icon = iconMap[s["向度"]] || "📊";

            topScoresCardsHtml += `
                <div class="score-tile">
                    <div class="label">${icon} ${s["向度"]}</div>
                    <div class="value" style="color: ${color};">${score}<span class="max-score">/4</span></div>
                </div>
            `;
        });

        const radarData = radarLabels.map(label => scoreMap[label] || 0);

        // ==========================================
        // (省略) 1~4. 組合細節表格 HTML (這裡維持你原本的表格邏輯)
        // ==========================================
        // ...注意力表格...
        let attHtml = `<table class="result-table"><tr><th>事件</th><th>出現次數</th><th>成功次數</th><th>成功比率</th></tr>`;
        const attEvents = ["行人衝出", "救護車", "大卡車", "施工路段", "手機響", "禁止通行"];
        let attSp = 0, attSu = 0;
        attEvents.forEach(name => {
            const s = eStats[name] || { spawn: 0, success: 0 };
            const rate = s.spawn > 0 ? Math.round((s.success / s.spawn) * 100) + "%" : "0%";
            attHtml += `<tr><td>${name}</td><td>${s.spawn}</td><td>${s.success}</td><td>${rate}</td></tr>`;
            attSp += s.spawn; attSu += s.success;
        });
        const attTotalRate = attSp > 0 ? Math.round((attSu / attSp) * 100) + "%" : "0%";
        attHtml += `<tr style="background-color: #444; font-weight: bold;"><td>總計</td><td>${attSp}</td><td>${attSu}</td><td>${attTotalRate}</td></tr></table>`;

        // ...穩定度表格...
        let stabHtml = `<table class="result-table"><tr><th>事件</th><th>發生時長(次數)</th><th>總開車時長</th></tr>`;
        const hb = this.dataCollector?.report?.stability?.hardBrakes || 0;
        const ha = this.dataCollector?.report?.stability?.hardAccels || 0;
        const sw = this.dataCollector?.report?.stability?.swervingCount || 0;
        stabHtml += `<tr><td>急煞</td><td>${hb}</td><td>${timeStr}</td></tr>`;
        stabHtml += `<tr><td>急加速</td><td>${ha}</td><td>${timeStr}</td></tr>`;
        stabHtml += `<tr><td>蛇行</td><td>${sw}</td><td>${timeStr}</td></tr>`;
        stabHtml += `<tr style="background-color: #444; font-weight: bold;"><td>總計</td><td>${hb + ha + sw}</td><td>-</td></tr></table>`;

        // ...法規認知表格...
        let regHtml = `<table class="result-table"><tr><th>事件</th><th>判斷出現次數</th><th>違規次數</th></tr>`;
        const regEvents = ["紅綠燈", "雙黃線", "路面邊線", "行人", "方向燈","禁止通行"];
        let rCk = 0, rVi = 0;
        regEvents.forEach(name => {
            const s = rStats[name] || { checks: 0, violations: 0 };
            const vClass = s.violations > 0 ? "rate-low" : ""; 
            regHtml += `<tr><td>${name}</td><td>${s.checks}</td><td class="${vClass}">${s.violations}</td></tr>`;
            rCk += s.checks; rVi += s.violations;
        });
        regHtml += `<tr style="background-color: #444; font-weight: bold;"><td>總計</td><td>${rCk}</td><td class="${rVi > 0 ? 'rate-low' : ''}">${rVi}</td></tr></table>`;

        // ...反應時間表格...
        let reaHtml = `<table class="result-table"><tr><th>事件</th><th>出現次數</th><th>反應時間</th><th>達標與否</th></tr>`;
        const reaEvents = ["行人衝出", "救護車", "施工路段", "紅綠燈停等", "手機響"];
        let reaSp = 0, reaTime = 0, reaCount = 0;
        reaEvents.forEach(name => {
            const s = eStats[name] || { spawn: 0, times: [] };
            const valid = (s.times || []).filter(t => t > 0);
            const avg = valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
            const pass = (avg > 0 && avg <= 2000) ? "是" : (avg > 0 ? "否" : "-");
            let pClass = pass === "是" ? "rate-high" : (pass === "否" ? "rate-low" : "");
            reaHtml += `<tr><td>${name}</td><td>${s.spawn}</td><td>${avg > 0 ? avg+'ms' : '無'}</td><td class="${pClass}">${pass}</td></tr>`;
            reaSp += s.spawn; reaCount += valid.length; reaTime += valid.reduce((a, b) => a + b, 0);
        });
        const totalAvg = reaCount > 0 ? Math.round(reaTime / reaCount) + "ms" : "無";
        reaHtml += `<tr style="background-color: #444; font-weight: bold;"><td>總計</td><td>${reaSp}</td><td>${totalAvg}</td><td>-</td></tr></table>`;


        // ==========================================
        // 建立 UI 容器並顯示
        // ==========================================
        const reportDiv = document.createElement('div');
        reportDiv.id = 'game-report-overlay';
        Object.assign(reportDiv.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center',
            alignItems: 'center', zIndex: '9999'
        });

        reportDiv.innerHTML = `
            <style>
                .report-container { 
                    background: #222; padding: 30px; border-radius: 15px; 
                    border: 2px solid #555; width: 950px; max-height: 90vh; overflow-y: auto;
                    box-shadow: 0 0 20px rgba(0,0,0,0.8); color: white; font-family: sans-serif;
                }
                .report-header { text-align: center; margin-bottom: 20px; border-bottom: 1px solid #444; padding-bottom: 10px; }
                
                /* ★ 頂部：雷達圖與分數卡片佈局 */
                .top-summary-section { display: flex; gap: 20px; margin-bottom: 25px; align-items: center; }
                .chart-container { flex: 1; background: #333; border-radius: 8px; border: 1px solid #555; padding: 10px; display: flex; justify-content: center; align-items: center; min-height: 220px; }
                
                .score-cards-grid { flex: 1.5; display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
                .score-tile { background: #333; border: 1px solid #555; border-radius: 8px; padding: 15px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
                .score-tile .label { font-size: 15px; color: #aaa; margin-bottom: 8px; font-weight: bold; }
                .score-tile .value { font-size: 38px; font-weight: bold; line-height: 1; text-shadow: 1px 1px 2px rgba(0,0,0,0.5); }
                .score-tile .max-score { font-size: 16px; color: #777; margin-left: 2px; }

                /* 下方細節網格樣式 */
                .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; text-align: left; }
                .stat-box { background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border: 1px solid #444; }
                .stat-box h3 { margin-top: 0; color: #4facfe; font-size: 16px; border-bottom: 1px solid #555; padding-bottom: 8px; text-align:center; }
                
                .result-table { width: 100%; border-collapse: collapse; font-size: 14px; text-align: center; margin-top: 5px; }
                .result-table th { background: #111; color: #aaa; padding: 6px; font-weight: normal; border-bottom: 1px solid #555; }
                .result-table td { padding: 6px; border-bottom: 1px solid #444; }
                .result-table tr:nth-child(even) { background-color: rgba(255,255,255,0.02); }
                
                .rate-high { color: #00ff00; font-weight: bold; }
                .rate-mid { color: #ffff00; font-weight: bold; }
                .rate-low { color: #ff4444; font-weight: bold; }

                .total-section { text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #444; }
                .btn-group { display: flex; justify-content: center; gap: 15px; margin-top: 15px; }
                .rpt-btn { border: none; padding: 10px 25px; font-size: 16px; border-radius: 50px; cursor: pointer; color: white; transition: 0.2s; font-weight:bold; }
                .btn-restart { background: #c0392b; } .btn-restart:hover { background: #e74c3c; }
                .btn-download { background: #27ae60; } .btn-download:hover { background: #2ecc71; }
            </style>

            <div class="report-container">
                <div class="report-header">
                    <h2 style="margin:0; color: #f1c40f;">📋 駕駛能力評估報告</h2>
                    <p style="color: #aaa; margin: 5px 0;">結束原因: ${reason} &nbsp;|&nbsp; 總駕駛時長: ${timeStr}</p>
                </div>

                <div class="top-summary-section">
                    <div class="chart-container">
                        <canvas id="radarChart" width="220" height="220"></canvas>
                    </div>
                    <div class="score-cards-grid">
                        ${topScoresCardsHtml}
                    </div>
                </div>

                <div class="stat-grid">
                    <div>
                        <div class="stat-box"><h3>👀 注意力細節</h3>${attHtml}</div>
                        <div class="stat-box" style="margin-top: 15px;"><h3>⚡ 反應時間細節</h3>${reaHtml}</div>
                    </div>
                    <div>
                        <div class="stat-box"><h3>🚗 穩定度細節</h3>${stabHtml}</div>
                        <div class="stat-box" style="margin-top: 15px;"><h3>⚖️ 法規認知細節</h3>${regHtml}</div>
                    </div>
                </div>

                <div class="total-section">
                    <div style="font-size: 14px; color: #aaa;">(詳細歷程紀錄可下載 Excel 報表查看)</div>
                    <div class="btn-group">
                        <button class="rpt-btn btn-download">📥 下載報表</button>
                        <button class="rpt-btn btn-restart">🔄 重新測驗</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(reportDiv);

        // ==========================================
        // ★ 呼叫 Chart.js 畫出雷達圖 (必須在 appendChild 之後)
        // ==========================================
        if (window.Chart) {
            const ctx = document.getElementById('radarChart').getContext('2d');
            new Chart(ctx, {
                type: 'radar',
                data: {
                    labels: radarLabels,
                    datasets: [{
                        label: '能力向度評分',
                        data: radarData,
                        backgroundColor: 'rgba(56, 189, 248, 0.4)', // 半透明科技藍
                        borderColor: 'rgba(56, 189, 248, 1)',
                        pointBackgroundColor: 'rgba(34, 197, 94, 1)', // 綠色節點
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: 'rgba(34, 197, 94, 1)',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: false,
                    scales: {
                        r: {
                            angleLines: { color: 'rgba(255, 255, 255, 0.2)' },
                            grid: { color: 'rgba(255, 255, 255, 0.2)' },
                            pointLabels: { color: '#ccc', font: { size: 13, family: 'sans-serif' } },
                            ticks: {
                                display: false, // 隱藏中間的刻度數字(讓畫面更簡潔)
                                min: 0, 
                                max: 4, 
                                stepSize: 1
                            }
                        }
                    },
                    plugins: {
                        legend: { display: false } // 隱藏圖例
                    }
                }
            });
        } else {
            console.warn("未偵測到 Chart.js！雷達圖無法顯示，請確認 index.html 有引入 CDN。");
        }
        
        // 綁定按鈕
        const restartBtn = reportDiv.querySelector('.btn-restart');
        const downloadBtn = reportDiv.querySelector('.btn-download');

        if (restartBtn) restartBtn.addEventListener('click', () => location.reload());
        if (downloadBtn) downloadBtn.addEventListener('click', () => {
            if (this.dataCollector && typeof this.dataCollector.downloadExcel === 'function') {
                this.dataCollector.downloadExcel();
            }
        });
    }

    showFailScreen(reason) {
        this.triggerGameOver(reason);
    }

    // ==========================================
    //               遊戲邏輯更新
    // ==========================================

    init(scene, player, dirLight, ambLight) {
        this.scene = scene;
        this.player = player;
        this.weather = new WeatherSystem(scene, dirLight, ambLight);
        this.weather.initRandomWeather();
        this.createHeadlights();
        console.log("GameManager 初始化完成");
    }

handleInput(e) {
        if (!this.hasStarted) return;
        
        const key = e.key.toLowerCase();
        if (key === 'p') {
            this.endGame();
            return;
        }

        if (!this.isRunning) return;

        // ★ 針對「需要按鍵反應」的事件做判斷
        if (this.isEventActive && this.activeEventType) {
            let isSuccessInput = false;

            // 1. 行人衝出：只能按煞車 (假設是空白鍵或 s)
            if (this.activeEventType === 'pedestrian') {
                if (key === 'arrowdown') {
                    isSuccessInput = true;
                }
            } 
            // 2. 施工路段：按方向燈 (假設q/e)、煞車 (空白/s) 或左右方向鍵 (a/d/ArrowLeft/ArrowRight)
            else if (this.activeEventType === 'construction') {
                const validKeys = ['z', 'c','arrowleft', 'arrowright', 'arrowdown'];
                if (validKeys.includes(key)) {
                    isSuccessInput = true;
                }
            }

            // 如果玩家按對了按鍵，就記錄成功！
            if (isSuccessInput) {
                if (this.dataCollector && typeof this.dataCollector.recordReaction === 'function') {
                    const reactTime = this.dataCollector.recordReaction(); 
                    this.recordEventSuccess(this.activeEventType, reactTime);
                } else {
                    this.recordEventSuccess(this.activeEventType, null);
                }
            }
        }
        
        if (key === 'h') this.toggleHeadlights();
    }

    update(deltaTime) {
        if (this.weather) this.weather.update(deltaTime);
        if (!this.hasStarted || !this.isRunning || !this.player) return;

        const playerSpeed = this.player.userData.currentSpeed || 0; 
        const playerSteering = this.player.userData.steering || 0; // 新增這行避免 update 缺參數報錯
        const playerPos = this.player.position;

        if (this.dataCollector && typeof this.dataCollector.update === 'function') {
            this.dataCollector.update(playerSpeed, deltaTime, playerSteering); 
        }

        if (playerSpeed < 0.1 && !this.isStopped) {
            this.isStopped = true;
            this.checkStopContext(playerPos); 
        } else if (playerSpeed > 1.0) {
            this.isStopped = false;
        }
    }

    createHeadlights() {
        if (!this.player) return;
        if (this.headlights.length > 0) return;
        const leftLight = new THREE.SpotLight(0xffffff, 1, 300, 0.5, 0.5, 1); 
        leftLight.position.set(-0.8, 1, -0.5); 
        const rightLight = leftLight.clone();
        rightLight.position.set(0.8, 1, -0.5); 
        const targetObj = new THREE.Object3D();
        targetObj.position.set(0, 0, -30); 
        this.player.add(targetObj); 
        leftLight.target = targetObj;
        rightLight.target = targetObj;
        this.player.add(leftLight);
        this.player.add(rightLight);
        this.headlights.push(leftLight, rightLight);
        leftLight.visible = false;
        rightLight.visible = false;
    }

    toggleHeadlights(forceState = null) {
        if (forceState !== null) this.isHeadlightOn = forceState;
        else this.isHeadlightOn = !this.isHeadlightOn;
        this.headlights.forEach(light => light.visible = this.isHeadlightOn);
    }

    checkStopContext(playerPos) {
        const checkDist = 30; 
        if (this.trafficLightSystem) {
            const distToLight = this.trafficLightSystem.getDistanceToRedLight(playerPos);
            if (distToLight && distToLight < checkDist) {
                // 已註解：DataCollector 中無此方法，避免當機
                // this.dataCollector.recordStopDistance('redLight', distToLight);
                return;
            }
        }
        const distToWork = this.getDistanceToConstruction(playerPos); 
        if (distToWork < checkDist) {
            // this.dataCollector.recordStopDistance('construction', distToWork);
            return;
        }
        const distToPed = this.getDistanceToPedestrian(playerPos);
        if (distToPed < checkDist) {
            // this.dataCollector.recordStopDistance('pedestrian', distToPed);
            return;
        }
    }
    
    getDistanceToConstruction(pos) { return 999; }
    getDistanceToPedestrian(pos) { return 999; }
}
