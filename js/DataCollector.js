// js/DataCollector.js

export class DataCollector {
    constructor() {
        this.gameManager = null; 
        this.startTime = Date.now();
        
        // ==========================================
        // 🏎️ 物理閾值 (已移除急加/減速判定閾值)
        // ==========================================
        this.THRESHOLDS = {
            speedLimit: 60,      // 速限 (km/h)
            swervingDelta: 0.3,  // 蛇行判定
            swerveCooldown: 1000 // 蛇行冷卻
        };

        this.lastFrame = { speed: 0, steering: 0 };
        this.lastSwerveTime = 0;
        this.lastSoundTime = 0;

        // ==========================================
        // 📊 資料結構 (保留欄位以維持報表格式一致)
        // ==========================================
        this.report = {
            events: {
                stats: {
                    "行人衝出": { spawn: 0, success: 0, fastReact: 0, times: [] },
                    "救護車":   { spawn: 0, success: 0, fastReact: 0, times: [] },
                    "大卡車":     { spawn: 0, success: 0, fastReact: 0, times: [] },
                    "施工路段": { spawn: 0, success: 0, fastReact: 0, times: [] },
                    "手機響": { spawn: 0, success: 0, fastReact: 0, times: [] },
                    "禁止通行":   { spawn: 0, success: 0, fastReact: 0, times: [] }
                },
                details: [] 
            },

            stability: {
                totalDriveTime: 0,
                hardBrakes: 0,    // 保留欄位，數值將恆為 0
                hardAccels: 0,    // 保留欄位，數值將恆為 0
                swervingCount: 0, 
                details: []
            },

            regulation: {
                stats: {
                    "紅綠燈":   { checks: 0, violations: 0 },
                    "雙黃線":   { checks: 0, violations: 0 },
                    "路面邊線": { checks: 0, violations: 0 },
                    "行人":     { checks: 0, violations: 0 },
                    "方向燈":   { checks: 0, violations: 0 },
                    "禁止通行": { checks: 0, violations: 0 }
                },
                details: []
            },

            navigation: { wrongTurns: 0 },
            safety: { collisions: [] }
        };

        this.isReactionTesting = false;
        this.reactionStartTime = 0;
        this.expectedKey = null;

        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.STORAGE_KEY = "DrivingSim_History_Full"; 
        this.MAX_RECORDS = 10;
    }

    // ==========================================
    // 🔊 音效與視覺回饋 (保留並優化)
    // ==========================================
    _playViolationSound() {
        if (!this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        const now = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    }

    showFloatingText(text, color = "#00ff00") {
        const div = document.createElement('div');
        div.innerText = text;
        Object.assign(div.style, {
            position: 'fixed', top: '30%', left: '50%',
            transform: 'translate(-50%, -50%)',
            color: color, fontSize: '24px', fontWeight: 'bold',
            textShadow: '0 0 5px black', pointerEvents: 'none',
            zIndex: '2000', transition: 'all 1s'
        });
        document.body.appendChild(div);
        requestAnimationFrame(() => {
            div.style.top = '20%';
            div.style.opacity = '0';
        });
        setTimeout(() => div.remove(), 1000);
    }

    // ==========================================
    // ⚙️ 核心紀錄介面 (由外部系統呼叫)
    // ==========================================

    /**
     * 紀錄向度 1 & 2：事件與反應
     */
    recordEvent(eventName, isSuccess, reactionTime = null, timeLimit = 2000) {
        if (!this.report.events.stats[eventName]) return;
        const stat = this.report.events.stats[eventName];

        stat.spawn++;
        if (isSuccess) stat.success++;

        let isFast = false;
        if (reactionTime !== null) {
            stat.times.push(reactionTime);
            if (reactionTime <= timeLimit) {
                stat.fastReact++;
                isFast = true;
            }
        }

        this.report.events.details.push({
            "時間": this._getElapsedStr(),
            "事件名稱": eventName,
            "結果": isSuccess ? "✅ 成功" : "❌ 失敗",
            "反應時間": reactionTime ? `${reactionTime}ms` : "無反應",
            "達標": isFast ? "是" : "否"
        });

        // 同步通知 GameManager 更新 UI
        if (this.gameManager) this.gameManager.recordEventSuccess(eventName);
    }

/**
     * 物理偵測更新 (已移除加速度/減速度判定)
     */
    update(currentSpeed, deltaTime, steeringValue) {
        if (typeof currentSpeed !== 'number') return;
        
        // 【已刪除】原本在這裡的加速度偵測與 showFloatingText("急煞/急加速") 邏輯
        
        // 1. 超速警示
        if (currentSpeed > this.THRESHOLDS.speedLimit) {
            if (Date.now() - this.lastSoundTime > 1500) {
                this._playViolationSound();
                this.showFloatingText("超速!", "#ff0000");
                this.lastSoundTime = Date.now();
            }
        }

        // 2. 蛇行偵測 (保留)
        if (currentSpeed > 20) {
            const steeringDelta = Math.abs(steeringValue - this.lastFrame.steering);
            if (steeringDelta > this.THRESHOLDS.swervingDelta) {
                const now = Date.now();
                if (now - this.lastSwerveTime > this.THRESHOLDS.swerveCooldown) {
                    this.report.stability.swervingCount++;
                    this.showFloatingText("蛇行!", "#ffaa00");
                    this.lastSwerveTime = now;
                }
            }
        }

        this.lastFrame.speed = currentSpeed;
        this.lastFrame.steering = steeringValue;
    }

    /**
     * 紀錄法規認知
     */
    recordRegulation(ruleName, isViolation, detail = "") {
        if (!this.report.regulation.stats[ruleName]) return;
        const stat = this.report.regulation.stats[ruleName];
        stat.checks++;
        if (isViolation) {
            stat.violations++;
            this.showFloatingText(`違規: ${ruleName}`, "#ff0000");
            this._playViolationSound();
        }
        this.report.regulation.details.push({
            "時間": this._getElapsedStr(),
            "法規項目": ruleName,
            "判定": isViolation ? "❌ 違規" : "✅ 遵守",
            "說明": detail
        });
    }

    startTimer(eventName) {
        this.isReactionTesting = true;
        this.reactionStartTime = Date.now();
        this.currentEventName = eventName;
    }

    recordReaction() {
        if (!this.isReactionTesting) return;
        const reactionTime = Date.now() - this.reactionStartTime;
        this.isReactionTesting = false; 
        const eventName = this.currentEventName || "未知事件";
        this.recordEvent(eventName, true, reactionTime);
        this.showFloatingText(`反應成功: ${reactionTime}ms`, "#00ff00");
        return reactionTime;
    }
    
    _getElapsedStr() {
        const sec = Math.floor((Date.now() - this.startTime) / 1000);
        return `${Math.floor(sec/60)}分${sec%60}秒`;
    }

    // ==========================================
    // 📈 分數換算與報表產出
    // ==========================================
    
    _percentToScore(percent) {
        if (percent >= 90) return 4;
        if (percent >= 75) return 3;
        if (percent >= 60) return 2;
        if (percent >= 40) return 1;
        return 0;
    }

generateFinalReport() {
        this.report.stability.totalDriveTime = Math.max(1, (Date.now() - this.startTime) / 1000);
        
        let e = this.report.events.stats;
        let totalS = 0, totalC = 0, totalF = 0;
        Object.values(e).forEach(v => { totalS += v.spawn; totalC += v.success; totalF += v.fastReact; });
        let attPct = totalS > 0 ? (totalC / totalS) * 100 : 100;
        let reaPct = totalS > 0 ? (totalF / totalS) * 100 : 100;

        let r = this.report.regulation.stats;
        let totalCh = 0, totalVi = 0;
        Object.values(r).forEach(v => { totalCh += v.checks; totalVi += v.violations; });
        let regPct = totalCh > 0 ? (1 - (totalVi / totalCh)) * 100 : 100;

        // 這裡的公式不變，但 this.report.stability.hardBrakes 永遠會是 0
        let stabScore = 100 - (this.report.stability.hardBrakes + this.report.stability.swervingCount) * 5;
        let stabPct = Math.max(0, stabScore);

        return [
            { "向度": "注意力", "百分比": attPct.toFixed(1) + "%", "評分(0-4)": this._percentToScore(attPct) },
            { "向度": "反應時間", "百分比": reaPct.toFixed(1) + "%", "評分(0-4)": this._percentToScore(reaPct) },
            { "向度": "法規認知", "百分比": regPct.toFixed(1) + "%", "評分(0-4)": this._percentToScore(regPct) },
            { "向度": "穩定度", "百分比": stabPct.toFixed(1) + "%", "評分(0-4)": this._percentToScore(stabPct) }
        ];
    }
    
    // ==========================================
    // 💾 存檔與 Excel 匯出 (對應你的 SheetJS 邏輯)
    // ==========================================

downloadExcel() {
        if (typeof XLSX === 'undefined') { alert("請引入 SheetJS"); return; }
        const wb = XLSX.utils.book_new();

        // ==========================================
        // --- 第 1 頁：評分總結 (維持 JSON 轉換) ---
        // ==========================================
        const finalScores = this.generateFinalReport(); // 先存起來，第2頁也會用到
        const wsSummary = XLSX.utils.json_to_sheet(finalScores);
        XLSX.utils.book_append_sheet(wb, wsSummary, "1.評分總結");


        // ==========================================
        // --- 第 2 頁：詳細數據報表 (符合實作格式，防空白) ---
        // ==========================================
        const eStats = this.report.events.stats;
        const rStats = this.report.regulation.stats;
        const totalDriveTimeStr = this._getElapsedStr();

        // 建立 30x10 的空網格 (對應 A 到 J 欄位)
        let rows = Array.from({ length: 30 }, () => Array(10).fill(""));

        // --- 2-1. 左上區塊：注意力 (A1 - D11) ---
        rows[0][0] = "注意力";
        rows[1][0] = "事件"; rows[1][1] = "出現次數"; rows[1][2] = "成功次數"; rows[1][3] = "成功比率";

        const attEvents = ["行人衝出", "救護車", "大卡車", "施工路段", "手機響", "禁止通行"];
        let attSpawn = 0, attSuccess = 0;
        attEvents.forEach((name, i) => {
            const s = eStats[name] || { spawn: 0, success: 0 };
            const rate = s.spawn > 0 ? Math.round((s.success / s.spawn) * 100) + "%" : "0%";
            rows[2 + i][0] = name;
            rows[2 + i][1] = s.spawn || 0;
            rows[2 + i][2] = s.success || 0;
            rows[2 + i][3] = rate;
            attSpawn += (s.spawn || 0);
            attSuccess += (s.success || 0);
        });
        rows[8][0] = "總計";
        rows[8][1] = attSpawn;
        rows[8][2] = attSuccess;
        rows[8][3] = attSpawn > 0 ? Math.round((attSuccess / attSpawn) * 100) + "%" : "0%";

        // --- 2-2. 右上區塊：穩定度 (H1 - J7) ---
        rows[0][7] = "穩定度";
        rows[1][7] = "事件"; rows[1][8] = "發生時長"; rows[1][9] = "總開車時長"; 
        rows[2][7] = "急煞";   rows[2][8] = this.report.stability.hardBrakes || 0;   rows[2][9] = totalDriveTimeStr;
        rows[3][7] = "急加速"; rows[3][8] = this.report.stability.hardAccels || 0;   rows[3][9] = totalDriveTimeStr;
        rows[4][7] = "蛇行";   rows[4][8] = this.report.stability.swervingCount || 0;rows[4][9] = totalDriveTimeStr;
        rows[5][7] = "總計";   
        rows[5][8] = (this.report.stability.hardBrakes || 0) + (this.report.stability.hardAccels || 0) + (this.report.stability.swervingCount || 0);

        // --- 2-3. 中右區塊：法規認知 (H8 - J16) ---
        rows[7][7] = "法規認知";
        rows[8][7] = "事件"; rows[8][8] = "判斷出現次數"; rows[8][9] = "違規次數";
        const regEvents = ["紅綠燈", "雙黃線", "路面邊線", "行人", "方向燈","禁止通行"];
        let regChecks = 0, regVio = 0;
        regEvents.forEach((name, i) => {
            const s = rStats[name] || { checks: 0, violations: 0 };
            rows[9 + i][7] = name;
            rows[9 + i][8] = s.checks || 0;
            rows[9 + i][9] = s.violations || 0;
            regChecks += (s.checks || 0);
            regVio += (s.violations || 0);
        });
        rows[15][7] = "總計";
        rows[15][8] = regChecks;
        rows[15][9] = regVio;

        // --- 2-4. 左中區塊：換算分數 (A12 - B17) ---
        rows[11][0] = "向度"; rows[11][1] = "換算分數0~4";
        finalScores.forEach((s, i) => {
            rows[12 + i][0] = s["向度"];
            rows[12 + i][1] = s["評分(0-4)"];
        });

        // --- 2-5. 左下區塊：反應時間 (A18 - D25) ---
        rows[17][0] = "反應時間";
        rows[18][0] = "事件"; rows[18][1] = "出現次數"; rows[18][2] = "反應時間"; rows[18][3] = "達標與否";
        const reaEvents = ["行人衝出", "救護車", "施工路段", "紅綠燈"];
        let reaSpawn = 0, reaTimeTotal = 0, reaCount = 0;
        reaEvents.forEach((name, i) => {
            const s = eStats[name] || { spawn: 0, times: [] };
            const validTimes = (s.times || []).filter(t => t > 0);
            const avg = validTimes.length > 0 ? Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length) : 0;
            
            rows[19 + i][0] = name;
            rows[19 + i][1] = s.spawn || 0;
            rows[19 + i][2] = avg > 0 ? avg + "ms" : "無";
            rows[19 + i][3] = (avg > 0 && avg <= 2000) ? "是" : "否";
            
            reaSpawn += (s.spawn || 0);
            reaCount += validTimes.length;
            reaTimeTotal += validTimes.reduce((a, b) => a + b, 0);
        });
        rows[23][0] = "總計";
        rows[23][1] = reaSpawn;
        rows[23][2] = reaCount > 0 ? Math.round(reaTimeTotal / reaCount) + "ms" : "無";

        // 轉換第 2 頁並設定欄寬
        const wsDetail = XLSX.utils.aoa_to_sheet(rows);
        wsDetail['!cols'] = [
            { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, // A-D 左側欄位
            { wch: 2 },  { wch: 2 },  { wch: 2 },               // E-G 中間空白分隔線
            { wch: 15 }, { wch: 15 }, { wch: 15 }               // H-J 右側欄位
        ];
        XLSX.utils.book_append_sheet(wb, wsDetail, "2.詳細數據報表");


        // ==========================================
        // --- 第 3 頁：原始違規清單 (維持 JSON 轉換與防空) ---
        // ==========================================
        let regData = this.report.regulation.details;
        if (regData.length === 0) {
            regData = [{"時間": "無紀錄", "法規項目": "--", "判定": "--", "說明": "本次測試無違規紀錄"}];
        }
        const wsReg = XLSX.utils.json_to_sheet(regData);
        XLSX.utils.book_append_sheet(wb, wsReg, "3.法規紀錄清單");


        // ==========================================
        // 儲存檔案
        // ==========================================
        XLSX.writeFile(wb, `駕駛訓練報表_${new Date().getTime()}.xlsx`);
    }

    saveResult() {
        const history = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || "[]");
        const summary = this.generateFinalReport();
        history.push({
            date: new Date().toLocaleString(),
            scores: summary
        });
        if (history.length > this.MAX_RECORDS) history.shift();
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history));
    }
}